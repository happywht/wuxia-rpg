/**
 * Round 08 dialogue runtime: Phaser-free condition evaluation, option-level
 * cross-reference assembly and atomic effect execution across the quest,
 * inventory and social systems.
 *
 * Three concerns, one module:
 *
 * 1. **Reference assembly** (`assembleDialogueReferences`) runs after world
 *    assembly. A condition/effect id (quest, item, NPC) that dangles against
 *    the assembled world drops exactly its option — the conversation, its
 *    other options and the rest of the set stay playable.
 * 2. **Condition evaluation** (`isConditionMet`, `getVisibleOptions`) is pure:
 *    an option is visible while *every* one of its conditions holds, and a
 *    node whose options all filter out simply behaves as an end node.
 * 3. **Effect execution** (`applyDialogueEffects`) is transactional: every
 *    effect of an option is validated first (quest lifecycle, item
 *    existence, inventory headroom/ownership, equipped locks) and only then
 *    committed together. A refused option leaves items, quests and social
 *    state untouched and reports a single readable reason. Item-moving
 *    commits re-sync active collect objectives through the same
 *    `item-count` signal the backpack and shop use, so objective progress
 *    follows the new quantity (and may legitimately step back).
 *
 * No world text lives here — names interpolated into feedback lines come
 * from the parsed data; templates are mechanical protocol labels only (see
 * docs/ARCHITECTURE.md).
 */

import {
  type DialogueConditionData,
  type DialogueData,
  type DialogueEffectData,
  type DialogueNodeData,
  type DialogueOptionData,
} from './dialogue-graph';
import {
  type ItemRecordData,
  type InventoryState,
  additionalCapacityFor,
  countItem,
  grantItems,
  isEquipped,
  removeItems,
} from './item-system';
import {
  type QuestData,
  type QuestJournal,
  type QuestRewardGrant,
  type QuestUpdateResult,
  acceptQuest,
  abandonQuest,
  applyQuestSignal,
} from './quest-system';
import {
  type SocialState,
  adjustMorality,
  adjustFactionRenown,
  adjustRelationship,
  adjustRenown,
  getFactionRenown,
  getRelationship,
  npcKnows,
  teachNpcKnowledge,
} from './social-state';
import type { KnowledgeEdgeData, KnowledgeNodeData } from './knowledge-graph';
import { describeFactionDeparture, projectFactionDeparture } from './faction-departure';
import {
  checkMartialArtEligibility,
  type CharacterState,
  type FactionData,
  type MartialArtData,
} from './character-progression';
import {
  checkFactionAdmission,
  clearFactionMembership,
  createFactionMembershipState,
  setFactionMembership,
  type FactionMembershipState,
} from './faction-system';
import { dismissCompanion, recruitCompanion, type CompanionData, type CompanionState } from './companion-system';
import { preflightDialogueBattle, type DialogueBattleReadiness } from './dialogue-battle-request';
import { preflightDialogueTeleport, type DialogueTeleportRequest, type DialogueTeleportReadiness } from './dialogue-teleport-request';
import {
  type DialogueVariableValue,
  DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES,
  isDialogueVariableConditionMet,
  isFiniteDialogueVariableValue,
  isSafeDialogueVariableKey,
} from './dialogue-variables';

// ---------------------------------------------------------------------------
// Runtime context
// ---------------------------------------------------------------------------

/** Everything condition checks and effect execution need for one option. */
export interface DialogueRuntimeContext {
  quests: ReadonlyMap<string, QuestData>;
  journal: QuestJournal;
  items: ReadonlyMap<string, ItemRecordData>;
  /** Null when no playable profile exists this run — item effects refuse. */
  inventory: InventoryState | null;
  social: SocialState;
  /** NPC the conversation is spoken with (default relationship target). */
  speakerNpcId: string;
  /** Known node ids plus their validated, data-driven details. */
  knownKnowledgeNodeIds: Set<string>;
  knowledgeNodes: ReadonlyMap<string, KnowledgeNodeData>;
  /** Valid directed graph edges; only data-authored coefficients spread attitudes. */
  knowledgeEdges?: readonly KnowledgeEdgeData[];
  /** Optional display names by NPC id for feedback lines (data-driven). */
  npcNames?: ReadonlyMap<string, string>;
  /** Player progression state; null while running without a profile. */
  character: CharacterState | null;
  factions: ReadonlyMap<string, FactionData>;
  martialArts: ReadonlyMap<string, MartialArtData>;
  factionState: FactionMembershipState;
  /** Current in-game day-period id the `timeOfDay` condition compares to. */
  timeOfDayPeriodId: string;
  /** Current regional weather; absent in legacy/empty contexts means unavailable. */
  weatherId?: string;
  /** Optional for older headless consumers; required when companion effects are authored. */
  companions?: ReadonlyMap<string, CompanionData>;
  companionState?: CompanionState;
  /**
   * Run-wide dialogue variable ledger (Round 147); absent in legacy consumers
   * means no ledger — `variable` conditions then behave exactly like an empty
   * ledger (missing semantics) and `setVariable` effects refuse with a
   * readable reason instead of silently dropping the write.
   */
  dialogueVariables?: Map<string, DialogueVariableValue>;
  battleReadiness?: DialogueBattleReadiness;
  teleportReadiness?: DialogueTeleportReadiness;
}

// ---------------------------------------------------------------------------
// Cross-resource reference assembly
// ---------------------------------------------------------------------------

export interface DialogueReferenceAssemblyInput {
  /** Graph-validated conversations by id (first declaration wins upstream). */
  conversations: ReadonlyMap<string, DialogueData>;
  quests: ReadonlyMap<string, QuestData>;
  items: ReadonlyMap<string, ItemRecordData>;
  /** Ids of NPCs that passed placement. */
  placedNpcIds: ReadonlySet<string>;
  /** Node ids accepted by the knowledge graph assembler. */
  knowledgeNodeIds: ReadonlySet<string>;
  factionIds: ReadonlySet<string>;
  martialArtIds: ReadonlySet<string>;
  /** Day-period ids declared by the loaded calendar (timeOfDay conditions). */
  timeOfDayPeriodIds: ReadonlySet<string>;
  /** Weather ids declared by validated climate; optional for legacy consumers. */
  weatherIds?: ReadonlySet<string>;
  companionIds?: ReadonlySet<string>;
  encounterIds?: ReadonlySet<string>;
  isTeleportDestinationWalkable?: (mapResourceId: string, col: number, row: number) => boolean;
}

export interface DialogueReferenceAssemblyResult {
  /** Conversations with dangling-reference options removed (copies). */
  conversations: ReadonlyMap<string, DialogueData>;
  /** One readable problem per dropped option. */
  warnings: readonly string[];
}

/** Collects the cross-resource ids one option's conditions/effects use. */
function optionReferences(option: DialogueOptionData): {
  questIds: string[];
  itemIds: string[];
  npcIds: string[];
  knowledgeNodeIds: string[];
  factionIds: string[];
  martialArtIds: string[];
  periodIds: string[];
  weatherIds: string[];
  companionIds: string[];
  encounterIds: string[];
} {
  const questIds: string[] = [];
  const itemIds: string[] = [];
  const npcIds: string[] = [];
  const knowledgeNodeIds: string[] = [];
  const factionIds: string[] = [];
  const martialArtIds: string[] = [];
  const periodIds: string[] = [];
  const weatherIds: string[] = [];
  const companionIds: string[] = [];
  const encounterIds: string[] = [];
  for (const condition of option.conditions ?? []) {
    if (condition.kind === 'questStatus') questIds.push(condition.questId);
    else if (condition.kind === 'itemCount') itemIds.push(condition.itemId);
    else if (condition.kind === 'npcRelationship') npcIds.push(condition.npcId);
    else if (condition.kind === 'npcKnows') {
      knowledgeNodeIds.push(condition.nodeId);
      if (condition.npcId !== undefined) npcIds.push(condition.npcId);
    } else if (condition.kind === 'factionRenown') factionIds.push(condition.factionId);
    else if (condition.kind === 'knowledgeKnown') knowledgeNodeIds.push(condition.nodeId);
    else if (condition.kind === 'factionMembership' && condition.factionId !== undefined) {
      factionIds.push(condition.factionId);
    } else if (condition.kind === 'martialArtEligible') martialArtIds.push(condition.martialArtId);
    else if (condition.kind === 'timeOfDay') periodIds.push(condition.periodId);
    else if (condition.kind === 'weather') weatherIds.push(condition.weatherId);
  }
  for (const effect of option.effects ?? []) {
    if (effect.kind === 'acceptQuest' || effect.kind === 'abandonQuest') questIds.push(effect.questId);
    else if (effect.kind === 'giveItem' || effect.kind === 'takeItem') itemIds.push(effect.itemId);
    else if (effect.kind === 'adjustRelationship' && effect.npcId !== undefined) {
      npcIds.push(effect.npcId);
    } else if (effect.kind === 'discoverKnowledgeNode' || effect.kind === 'shareKnowledgeNode') {
      knowledgeNodeIds.push(effect.nodeId);
    } else if (effect.kind === 'joinFaction') factionIds.push(effect.factionId);
    else if (effect.kind === 'adjustFactionRenown') factionIds.push(effect.factionId);
    else if (effect.kind === 'learnMartialArt') martialArtIds.push(effect.martialArtId);
    else if (effect.kind === 'recruitCompanion') companionIds.push(effect.companionId);
    else if (effect.kind === 'startBattle') encounterIds.push(effect.encounterId);
  }
  return { questIds, itemIds, npcIds, knowledgeNodeIds, factionIds, martialArtIds, periodIds, weatherIds, companionIds, encounterIds };
}

/**
 * Resolves every condition/effect reference of every option against the
 * assembled world. A dangling reference removes only its own option (a node
 * left without options becomes an end node — the conversation can still be
 * spoken); everything else keeps playing unchanged.
 */
export function assembleDialogueReferences(
  input: DialogueReferenceAssemblyInput,
): DialogueReferenceAssemblyResult {
  const warnings: string[] = [];
  const conversations = new Map<string, DialogueData>();

  for (const [id, conversation] of input.conversations) {
    let changed = false;
    const nodes = conversation.nodes.map((node) => {
      if (node.options === undefined) {
        return node;
      }
      const kept: DialogueOptionData[] = [];
      for (const option of node.options) {
        const references = optionReferences(option);
        const problems: string[] = [];
        for (const effect of option.effects ?? []) {
          if (effect.kind === 'teleport' && !input.isTeleportDestinationWalkable?.(effect.mapResourceId, effect.col, effect.row)) {
            problems.push('引路目的地区或落点不可通行');
          }
        }
        for (const questId of references.questIds) {
          if (!input.quests.has(questId)) problems.push(`引用无效任务 "${questId}"`);
        }
        for (const itemId of references.itemIds) {
          if (!input.items.has(itemId)) problems.push(`引用无效物品 "${itemId}"`);
        }
        for (const npcId of references.npcIds) {
          if (!input.placedNpcIds.has(npcId)) problems.push(`引用无效人物 "${npcId}"`);
        }
        for (const nodeId of references.knowledgeNodeIds) {
          if (!input.knowledgeNodeIds.has(nodeId)) problems.push(`引用无效见闻 "${nodeId}"`);
        }
        for (const factionId of references.factionIds) {
          if (!input.factionIds.has(factionId)) problems.push(`引用无效门派 "${factionId}"`);
        }
        for (const martialArtId of references.martialArtIds) {
          if (!input.martialArtIds.has(martialArtId)) problems.push(`引用无效武学 "${martialArtId}"`);
        }
        for (const periodId of references.periodIds) {
          if (!input.timeOfDayPeriodIds.has(periodId)) problems.push(`引用无效时段 "${periodId}"`);
        }
        for (const weatherId of references.weatherIds) {
          if (!input.weatherIds?.has(weatherId)) problems.push(`引用无效天气 "${weatherId}"`);
        }
        for (const companionId of references.companionIds) {
          if (!input.companionIds?.has(companionId)) problems.push(`引用无效伙伴 "${companionId}"`);
        }
        for (const encounterId of references.encounterIds) {
          if (!input.encounterIds?.has(encounterId)) problems.push(`引用无效挑战 "${encounterId}"`);
        }
        if (problems.length > 0) {
          changed = true;
          warnings.push(
            `对话 "${id}" 节点 "${node.id}" 的选项「${option.text}」已剔除：${problems.join('；')}`,
          );
          continue;
        }
        kept.push(option);
      }
      if (!changed && kept.length === node.options.length) {
        return node;
      }
      return { ...node, options: kept };
    });

    if (!changed) {
      conversations.set(id, conversation);
    } else {
      conversations.set(id, { ...conversation, nodes });
    }
  }

  return { conversations, warnings };
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/** True while `value` sits inside the condition's inclusive bounds. */
function withinBounds(
  value: number,
  minValue: number | undefined,
  maxValue: number | undefined,
): boolean {
  if (minValue !== undefined && value < minValue) {
    return false;
  }
  if (maxValue !== undefined && value > maxValue) {
    return false;
  }
  return true;
}

/**
 * Evaluates one condition against the runtime context. Unknown quests (the
 * reference assembly removes those, so this is defensive) never match; a
 * missing inventory fails item counts instead of crashing.
 */
export function isConditionMet(
  condition: DialogueConditionData,
  context: Readonly<DialogueRuntimeContext>,
): boolean {
  switch (condition.kind) {
    case 'questStatus': {
      const state = context.journal.states.get(condition.questId);
      return state?.status === condition.status;
    }
    case 'itemCount':
      return (
        context.inventory !== null &&
        countItem(context.inventory, condition.itemId) >= condition.minCount
      );
    case 'morality':
      return withinBounds(context.social.morality, condition.minValue, condition.maxValue);
    case 'renown':
      return withinBounds(context.social.renown, condition.minValue, condition.maxValue);
    case 'factionRenown':
      return withinBounds(
        getFactionRenown(context.social, condition.factionId),
        condition.minValue,
        condition.maxValue,
      );
    case 'npcRelationship':
      return withinBounds(
        getRelationship(context.social, condition.npcId),
        condition.minValue,
        condition.maxValue,
      );
    case 'knowledgeKnown':
      return context.knownKnowledgeNodeIds.has(condition.nodeId) === (condition.isKnown ?? true);
    case 'npcKnows':
      return npcKnows(context.social, condition.npcId ?? context.speakerNpcId, condition.nodeId);
    case 'factionMembership': {
      const membership = context.factionState.membership;
      const belongs = membership !== null &&
        (condition.factionId === undefined || membership.factionId === condition.factionId);
      return condition.isMember ? belongs : !belongs;
    }
    case 'martialArtEligible': {
      const character = context.character;
      const art = context.martialArts.get(condition.martialArtId);
      if (character === null || art === undefined || character.martialArtIds.includes(art.id)) return false;
      return checkMartialArtEligibility(art, {
        level: character.level,
        attributes: character.attributes,
        factionId: context.factionState.membership?.factionId ?? null,
      }).eligible;
    }
    case 'weather':
      return context.weatherId !== undefined && context.weatherId === condition.weatherId;
    case 'timeOfDay':
      // The context carries the clock's current period id (reference
      // assembly removed dangling ids, so an unknown id never matches).
      return context.timeOfDayPeriodId === condition.periodId;
    case 'variable':
      // Missing-key semantics are total and live with the protocol itself.
      return isDialogueVariableConditionMet(condition, context.dialogueVariables);
  }
}

/** One condition-passing option plus its index in the node's raw array. */
export interface VisibleDialogueOption {
  index: number;
  option: DialogueOptionData;
}

/**
 * Options of `node` the player may currently choose. Unconditional options
 * are always visible; an empty result marks the node as an end node for
 * this run (the conversation can close normally instead of locking input).
 */
export function getVisibleOptions(
  node: Readonly<DialogueNodeData>,
  context: Readonly<DialogueRuntimeContext>,
): readonly VisibleDialogueOption[] {
  const visible: VisibleDialogueOption[] = [];
  for (const [index, option] of (node.options ?? []).entries()) {
    const met = (option.conditions ?? []).every((condition) =>
      isConditionMet(condition, context),
    );
    if (met) {
      visible.push({ index, option });
    }
  }
  return visible;
}

/** Revalidate both live conditions and the last displayed raw option identity. */
export function dialogueChoiceForConfirmation(
  node: Readonly<DialogueNodeData>, context: Readonly<DialogueRuntimeContext>,
  visibleIndex: number, displayedRawIndex?: number,
): VisibleDialogueOption | undefined {
  const choice = getVisibleOptions(node, context)[visibleIndex];
  return choice !== undefined && (displayedRawIndex === undefined || choice.index === displayedRawIndex)
    ? choice : undefined;
}

// ---------------------------------------------------------------------------
// Atomic effect execution
// ---------------------------------------------------------------------------

/** Decorate only the current-faction departure step; raw graph/index remain intact. */
export function getVisibleOptionsForDisplay(
  node: Readonly<DialogueNodeData>, context: Readonly<DialogueRuntimeContext>,
): readonly VisibleDialogueOption[] {
  return getVisibleOptions(node, context).map(entry => {
    const effects = entry.option.effects ?? [];
    const departureIndex = effects.findIndex(effect => effect.kind === 'leaveFaction');
    const membership = context.factionState.membership;
    const faction = membership === null ? undefined : context.factions.get(membership.factionId);
    // Earlier state-changing effects require their own staged projection; never
    // present an uncomputed composite result as a current departure quote.
    if (departureIndex !== 0 || faction === undefined || !faction.departure.allowed) return entry;
    const preview = describeFactionDeparture(faction, context.social, context.character, context.martialArts);
    return { index: entry.index, option: { ...entry.option, text: `${entry.option.text}\n${preview}` } };
  });
}

/** Mechanical feedback line per executed effect (names come from data). */
export interface DialogueEffectSummary {
  /** One deferred external action; no battle is opened during staging. */
  battleRequest?: { encounterId: string };
  teleportRequest?: DialogueTeleportRequest;
  lines: readonly string[];
  /** Aggregated quest transitions for HUD settlement (rewards, notices). */
  questUpdate: QuestUpdateResult;
}

export type DialogueEffectResult =
  | { ok: true; summary: DialogueEffectSummary }
  | { ok: false; reason: string };

/** Item quantities the active quests' collect objectives track. */
function objectiveItemCounts(
  quests: ReadonlyMap<string, QuestData>,
  inventory: Readonly<InventoryState>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const quest of quests.values()) {
    for (const objective of quest.objectives) {
      if (objective.kind === 'collectItem') {
        counts.set(objective.targetId, countItem(inventory, objective.targetId));
      }
    }
  }
  return counts;
}

function mergeQuestUpdate(
  into: { changed: boolean; completed: QuestRewardGrant[]; failedQuestIds: string[] },
  update: QuestUpdateResult,
): void {
  into.changed ||= update.changed;
  into.completed.push(...update.completed);
  into.failedQuestIds.push(...update.failedQuestIds);
}

/** Makes an isolated working copy so a later refusal cannot leak mutations. */
function cloneRuntimeContext(context: DialogueRuntimeContext): DialogueRuntimeContext {
  return {
    ...context,
    journal: {
      trackedQuestId: context.journal.trackedQuestId,
      states: new Map(
        [...context.journal.states].map(([questId, state]) => [
          questId,
          { ...state, objectiveCounts: new Map(state.objectiveCounts) },
        ]),
      ),
    },
    inventory:
      context.inventory === null
        ? null
        : {
            currency: context.inventory.currency,
            capacity: context.inventory.capacity,
            stacks: context.inventory.stacks.map((stack) => ({ ...stack })),
            equipped: { ...context.inventory.equipped },
          },
    social: {
      morality: context.social.morality,
      renown: context.social.renown,
      factionRenown: new Map(context.social.factionRenown),
      relationships: new Map(context.social.relationships),
      npcKnowledge: new Map(
        [...context.social.npcKnowledge].map(([npcId, nodeIds]) => [npcId, new Set(nodeIds)]),
      ),
    },
    character: context.character === null
      ? null
      : { ...context.character, martialArtIds: [...context.character.martialArtIds] },
    factionState: createFactionMembershipState(context.factionState.membership),
    knownKnowledgeNodeIds: new Set(context.knownKnowledgeNodeIds),
    companionState: context.companionState === undefined
      ? undefined
      : { activeCompanionId: context.companionState.activeCompanionId },
    dialogueVariables: context.dialogueVariables === undefined
      ? undefined
      : new Map(context.dialogueVariables),
  };
}

/** Publishes a successfully completed working copy while retaining live objects. */
function commitRuntimeContext(
  target: DialogueRuntimeContext,
  staged: DialogueRuntimeContext,
): void {
  const targetInventory = target.inventory;
  const stagedInventory = staged.inventory;
  if (targetInventory !== null && stagedInventory !== null) {
    targetInventory.currency = stagedInventory.currency;
    targetInventory.capacity = stagedInventory.capacity;
    targetInventory.stacks.splice(
      0,
      targetInventory.stacks.length,
      ...stagedInventory.stacks.map((stack) => ({ ...stack })),
    );
    targetInventory.equipped = { ...stagedInventory.equipped };
  }

  target.journal.states.clear();
  for (const [questId, state] of staged.journal.states) {
    target.journal.states.set(questId, {
      ...state,
      objectiveCounts: new Map(state.objectiveCounts),
    });
  }
  target.journal.trackedQuestId = staged.journal.trackedQuestId;

  target.social.morality = staged.social.morality;
  target.social.renown = staged.social.renown;
  target.social.factionRenown.clear();
  for (const [factionId, renown] of staged.social.factionRenown) {
    target.social.factionRenown.set(factionId, renown);
  }
  target.social.relationships.clear();
  for (const [npcId, relationship] of staged.social.relationships) {
    target.social.relationships.set(npcId, relationship);
  }
  target.social.npcKnowledge.clear();
  for (const [npcId, nodeIds] of staged.social.npcKnowledge) {
    target.social.npcKnowledge.set(npcId, new Set(nodeIds));
  }
  target.knownKnowledgeNodeIds.clear();
  for (const nodeId of staged.knownKnowledgeNodeIds) target.knownKnowledgeNodeIds.add(nodeId);
  target.factionState.membership = staged.factionState.membership === null
    ? null
    : { ...staged.factionState.membership };
  if (target.companionState !== undefined && staged.companionState !== undefined) {
    target.companionState.activeCompanionId = staged.companionState.activeCompanionId;
  }
  if (target.dialogueVariables !== undefined && staged.dialogueVariables !== undefined) {
    target.dialogueVariables.clear();
    for (const [key, value] of staged.dialogueVariables) {
      target.dialogueVariables.set(key, value);
    }
  }
  if (target.character !== null && staged.character !== null) {
    target.character.martialArtIds.splice(
      0,
      target.character.martialArtIds.length,
      ...staged.character.martialArtIds,
    );
  }
}

/**
 * Validates one effect without mutating anything. Returns null when the
 * effect is committable right now, or a readable refusal reason.
 */
function validateEffect(
  effect: DialogueEffectData,
  context: Readonly<DialogueRuntimeContext>,
): string | null {
  if (effect.kind === 'teleport') {
    const result = preflightDialogueTeleport(effect, context.teleportReadiness, context.companionState?.activeCompanionId ?? null);
    return result.ok ? null : result.reason;
  }
  if (effect.kind === 'startBattle') {
    const result = preflightDialogueBattle(effect.encounterId, context.battleReadiness);
    return result.ok ? null : result.reason;
  }
  switch (effect.kind) {
    case 'acceptQuest': {
      const quest = context.quests.get(effect.questId);
      const state = context.journal.states.get(effect.questId);
      if (quest === undefined || state === undefined) {
        return `差事「${effect.questId}」不存在或不可用`;
      }
      if (state.status !== 'offered') {
        return `「${quest.name}」当前不在待接取状态`;
      }
      return null;
    }
    case 'abandonQuest': {
      const quest = context.quests.get(effect.questId);
      const state = context.journal.states.get(effect.questId);
      if (quest === undefined || state === undefined) {
        return `差事「${effect.questId}」不存在或不可用`;
      }
      if (state.status !== 'active') {
        return `「${quest.name}」不在进行中，无法放弃`;
      }
      return null;
    }
    case 'giveItem': {
      if (context.inventory === null) {
        return '现在没有背包，无法收下物品';
      }
      const item = context.items.get(effect.itemId);
      if (item === undefined) {
        return `物品「${effect.itemId}」不存在或不可用`;
      }
      if (additionalCapacityFor(context.inventory, item) < effect.quantity) {
        return `背包放不下「${item.name}」×${effect.quantity}`;
      }
      return null;
    }
    case 'takeItem': {
      if (context.inventory === null) {
        return '现在没有背包，无法交付物品';
      }
      const item = context.items.get(effect.itemId);
      if (item === undefined) {
        return `物品「${effect.itemId}」不存在或不可用`;
      }
      const owned = countItem(context.inventory, effect.itemId);
      const locked = isEquipped(context.inventory, effect.itemId) ? 1 : 0;
      if (owned - locked < effect.quantity) {
        return locked > 0 && owned >= effect.quantity
          ? `「${item.name}」正在装备中，无法交付`
          : `没有足够的「${item.name}」可交付`;
      }
      return null;
    }
    case 'discoverKnowledgeNode':
      return context.knowledgeNodes.has(effect.nodeId)
        ? null
        : `见闻节点 "${effect.nodeId}" 不存在或不可用`;
    case 'shareKnowledgeNode': {
      const node = context.knowledgeNodes.get(effect.nodeId);
      if (node === undefined) return `见闻节点 "${effect.nodeId}" 不存在或不可用`;
      if (!context.knownKnowledgeNodeIds.has(effect.nodeId)) return `你还不知道「${node.title}」，无法相告`;
      return null;
    }
    case 'adjustFactionRenown':
      return context.factions.has(effect.factionId)
        ? null
        : `门派资料 "${effect.factionId}" 不存在或不可用`;
    case 'joinFaction': {
      const faction = context.factions.get(effect.factionId);
      if (faction === undefined) return `门派资料 "${effect.factionId}" 不存在或不可用`;
      const result = checkFactionAdmission({
        faction,
        speakerNpcId: context.speakerNpcId,
        membership: context.factionState.membership,
        character: context.character,
        social: context.social,
        quests: context.quests,
        journal: context.journal,
      });
      return result.eligible ? null : `暂不能拜入「${faction.name}」：${result.reasons.join('；')}`;
    }
    case 'leaveFaction': {
      const membership = context.factionState.membership;
      if (membership === null) return '目前尚未拜入任何门派';
      const faction = context.factions.get(membership.factionId);
      if (faction === undefined) return `当前门派资料 "${membership.factionId}" 已不可用，无法按门规退门`;
      return faction.departure.allowed ? null : `「${faction.name}」门规不许退门`;
    }
    case 'learnMartialArt': {
      const character = context.character;
      const art = context.martialArts.get(effect.martialArtId);
      if (character === null) return '当前没有可授艺的角色';
      if (art === undefined) return `武学资料 "${effect.martialArtId}" 不存在或不可用`;
      if (character.martialArtIds.includes(art.id)) return `已经掌握「${art.name}」`;
      const eligibility = checkMartialArtEligibility(art, {
        level: character.level,
        attributes: character.attributes,
        factionId: context.factionState.membership?.factionId ?? null,
      });
      return eligibility.eligible ? null : `尚未达到「${art.name}」的习武条件：${eligibility.reasons.join('；')}`;
    }
    case 'recruitCompanion': {
      if (context.companions === undefined || context.companionState === undefined) return '当前队伍资料不可用';
      const companion = context.companions.get(effect.companionId);
      if (companion === undefined) return `伙伴资料 "${effect.companionId}" 不存在或不可用`;
      return context.companionState.activeCompanionId === null
        ? null
        : context.companionState.activeCompanionId === companion.id
          ? '这位伙伴已经与你同行'
          : '已有伙伴同行，请先让其暂离';
    }
    case 'dismissCompanion':
      return context.companionState?.activeCompanionId !== undefined && context.companionState.activeCompanionId !== null
        ? null
        : '当前没有伙伴同行';
    case 'setVariable': {
      const ledger = context.dialogueVariables;
      if (ledger === undefined) {
        return '当前上下文没有变量簿，无法记录这个决定';
      }
      // Defensive double check: parse already vetted these, but the runtime
      // also serves hand-built contexts (tests, future callers).
      if (!isSafeDialogueVariableKey(effect.key) || !isFiniteDialogueVariableValue(effect.value)) {
        return `变量 "${String(effect.key)}" 的键或值不合规`;
      }
      if (!ledger.has(effect.key) && ledger.size >= DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES) {
        return `变量簿已记满（至多 ${DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES} 项），无法新增 "${effect.key}"`;
      }
      return null;
    }
    default:
      // adjust* effects: value ranges were pinned at parse time and explicit
      // npcIds at reference-assembly time; they can always commit.
      return null;
  }
}

/**
 * Executes an option's effects atomically: every effect is validated first,
 * then all of them commit together. Item moves re-sync active collect
 * objectives (progress follows the new quantity and may step back); quest
 * accept/abandon transitions flow into the returned update for the caller's
 * HUD settlement. A refusal (`ok: false`) mutates nothing at all.
 */
export function applyDialogueEffects(
  effects: readonly DialogueEffectData[],
  context: DialogueRuntimeContext,
): DialogueEffectResult {
  if (effects.filter(effect => effect.kind === 'teleport' || effect.kind === 'startBattle').length > 1) return { ok: false, reason: '一次交谈只能发起一项挑战或引路' };
  let battleRequest: { encounterId: string } | undefined;
  let teleportRequest: DialogueTeleportRequest | undefined;
  // Run the declared sequence against an isolated working copy. Each next
  // effect sees earlier staged changes (so duplicate grants/accepts cannot
  // pass against stale state); a refusal simply discards the whole copy.
  const staged = cloneRuntimeContext(context);
  const lines: string[] = [];
  const questUpdate: {
    changed: boolean;
    completed: QuestRewardGrant[];
    failedQuestIds: string[];
  } = { changed: false, completed: [], failedQuestIds: [] };

  for (const effect of effects) {
    const refusal = validateEffect(effect, staged);
    if (refusal !== null) {
      return { ok: false, reason: refusal };
    }

    switch (effect.kind) {
      case 'teleport':
        teleportRequest = { mapResourceId: effect.mapResourceId, col: effect.col, row: effect.row, travelMinutes: effect.travelMinutes };
        break;
      case 'startBattle':
        battleRequest = { encounterId: effect.encounterId };
        break;
      case 'acceptQuest': {
        const quest = staged.quests.get(effect.questId);
        const result = acceptQuest(
          staged.quests,
          staged.journal,
          effect.questId,
          staged.inventory === null
            ? new Map()
            : objectiveItemCounts(staged.quests, staged.inventory),
          {
            factionId: staged.factionState.membership?.factionId ?? null,
            knownKnowledgeNodeIds: staged.knownKnowledgeNodeIds,
          },
        );
        if (!result.ok) {
          return { ok: false, reason: `无法接取差事「${quest?.name ?? effect.questId}」` };
        }
        mergeQuestUpdate(questUpdate, result.update);
        lines.push(quest === undefined ? '已接取差事' : `已接取「${quest.name}」`);
        break;
      }
      case 'abandonQuest': {
        const quest = staged.quests.get(effect.questId);
        const result = abandonQuest(staged.journal, effect.questId);
        if (!result.ok) {
          return { ok: false, reason: `无法放弃差事「${quest?.name ?? effect.questId}」` };
        }
        mergeQuestUpdate(questUpdate, result.update);
        lines.push(quest === undefined ? '已放弃差事' : `已放弃「${quest.name}」`);
        break;
      }
      case 'giveItem': {
        const item = staged.items.get(effect.itemId);
        const inventory = staged.inventory;
        if (item !== undefined && inventory !== null) {
          grantItems(inventory, item, effect.quantity);
          mergeQuestUpdate(
            questUpdate,
            applyQuestSignal(staged.quests, staged.journal, {
              type: 'item-count',
              itemId: effect.itemId,
              quantity: countItem(inventory, effect.itemId),
            }),
          );
          lines.push(`获得「${item.name}」×${effect.quantity}`);
        }
        break;
      }
      case 'takeItem': {
        const item = staged.items.get(effect.itemId);
        const inventory = staged.inventory;
        if (item !== undefined && inventory !== null) {
          removeItems(inventory, effect.itemId, effect.quantity);
          mergeQuestUpdate(
            questUpdate,
            applyQuestSignal(staged.quests, staged.journal, {
              type: 'item-count',
              itemId: effect.itemId,
              quantity: countItem(inventory, effect.itemId),
            }),
          );
          lines.push(`交出「${item.name}」×${effect.quantity}`);
        }
        break;
      }
      case 'adjustMorality': {
        adjustMorality(staged.social, effect.delta);
        lines.push(`善恶 ${effect.delta > 0 ? '+' : '−'}${Math.abs(effect.delta)}`);
        break;
      }
      case 'adjustRenown': {
        adjustRenown(staged.social, effect.delta);
        lines.push(`声望 ${effect.delta > 0 ? '+' : '−'}${Math.abs(effect.delta)}`);
        break;
      }
      case 'adjustFactionRenown': {
        const faction = staged.factions.get(effect.factionId);
        if (faction !== undefined) {
          adjustFactionRenown(staged.social, effect.factionId, effect.delta);
          lines.push(`「${faction.name}」声望 ${effect.delta > 0 ? '+' : '−'}${Math.abs(effect.delta)}`);
        }
        break;
      }
      case 'adjustRelationship': {
        const targetId = effect.npcId ?? staged.speakerNpcId;
        const before = getRelationship(staged.social, targetId);
        adjustRelationship(staged.social, targetId, effect.delta);
        const appliedDelta = getRelationship(staged.social, targetId) - before;
        const sign = effect.delta > 0 ? '+' : '−';
        const magnitude = Math.abs(effect.delta);
        const displayName = staged.npcNames?.get(targetId);
        lines.push(
          displayName === undefined
            ? `关系 ${sign}${magnitude}`
            : `与「${displayName}」关系 ${sign}${magnitude}`,
        );
        if (appliedDelta !== 0) {
          for (const edge of staged.knowledgeEdges ?? []) {
            if (edge.fromId !== targetId || edge.attitudeSpread === undefined || edge.toId === targetId) continue;
            const scaledDelta = appliedDelta * edge.attitudeSpread;
            const relatedDelta = Math.sign(scaledDelta) * Math.round(Math.abs(scaledDelta));
            if (relatedDelta === 0) continue;
            const relatedBefore = getRelationship(staged.social, edge.toId);
            adjustRelationship(staged.social, edge.toId, relatedDelta);
            const relatedApplied = getRelationship(staged.social, edge.toId) - relatedBefore;
            if (relatedApplied === 0) continue;
            const relatedName = staged.npcNames?.get(edge.toId);
            const relatedSign = relatedApplied > 0 ? '+' : '−';
            const relatedMagnitude = Math.abs(relatedApplied);
            lines.push(relatedName === undefined
              ? `关系沿图谱传播 ${relatedSign}${relatedMagnitude}`
              : `与「${relatedName}」的关系受牵连 ${relatedSign}${relatedMagnitude}`);
          }
        }
        break;
      }
      case 'discoverKnowledgeNode': {
        const node = staged.knowledgeNodes.get(effect.nodeId);
        if (node !== undefined) {
          const alreadyKnown = staged.knownKnowledgeNodeIds.has(node.id);
          staged.knownKnowledgeNodeIds.add(node.id);
          lines.push(alreadyKnown ? `已记下「${node.title}」` : `新增见闻「${node.title}」`);
          if (!alreadyKnown) {
            mergeQuestUpdate(questUpdate, applyQuestSignal(staged.quests, staged.journal, {
              type: 'knowledge-discovery',
              nodeId: node.id,
            }));
          }
        }
        break;
      }
      case 'shareKnowledgeNode': {
        const node = staged.knowledgeNodes.get(effect.nodeId);
        if (node !== undefined) {
          const added = teachNpcKnowledge(staged.social, staged.speakerNpcId, node.id);
          const speakerName = staged.npcNames?.get(staged.speakerNpcId);
          if (added) {
            lines.push(speakerName === undefined
              ? `已将「${node.title}」相告`
              : `已把「${node.title}」告诉「${speakerName}」`);
          } else {
            lines.push(speakerName === undefined
              ? `对方已知道「${node.title}」`
              : `「${speakerName}」已知道「${node.title}」`);
          }
        }
        break;
      }
      case 'joinFaction': {
        const faction = staged.factions.get(effect.factionId);
        if (faction !== undefined) {
          setFactionMembership(staged.factionState, faction.id, staged.speakerNpcId);
          const master = staged.npcNames?.get(staged.speakerNpcId);
          lines.push(master === undefined
            ? `拜入「${faction.name}」`
            : `拜入「${faction.name}」，师从「${master}」`);
        }
        break;
      }
      case 'leaveFaction': {
        const previous = staged.factionState.membership;
        const faction = previous === null ? undefined : staged.factions.get(previous.factionId);
        if (faction !== undefined) {
          const departure = projectFactionDeparture(faction, staged.social, staged.character, staged.martialArts);
          staged.social.morality = departure.morality;
          staged.social.renown = departure.renown;
          staged.social.factionRenown.set(faction.id, departure.factionRenown);
          if (staged.character !== null) {
            staged.character.martialArtIds = staged.character.martialArtIds.filter(id => !departure.forgottenArtIds.includes(id));
          }
          clearFactionMembership(staged.factionState);
          const artConsequence = faction.departure.forgetFactionMartialArts
            ? '，门派武学亦将遗忘'
            : '，已学武学保留';
          lines.push(
            `退出「${faction.name}」：善恶 ${faction.departure.moralityDelta >= 0 ? '+' : ''}${faction.departure.moralityDelta}，江湖声望 ${faction.departure.renownDelta >= 0 ? '+' : ''}${faction.departure.renownDelta}，本门声望 ${faction.departure.factionRenownDelta >= 0 ? '+' : ''}${faction.departure.factionRenownDelta}${artConsequence}`,
          );
        }
        break;
      }
      case 'learnMartialArt': {
        const art = staged.martialArts.get(effect.martialArtId);
        if (art !== undefined && staged.character !== null) {
          staged.character.martialArtIds.push(art.id);
          lines.push(`学会「${art.name}」`);
        }
        break;
      }
      case 'recruitCompanion': {
        const companions = staged.companions;
        const state = staged.companionState;
        const companion = companions?.get(effect.companionId);
        if (companions !== undefined && state !== undefined && companion !== undefined) {
          recruitCompanion(state, effect.companionId, companions);
          const name = staged.npcNames?.get(companion.npcId) ?? companion.npcId;
          lines.push(`邀「${name}」同行`);
        }
        break;
      }
      case 'dismissCompanion': {
        const previous = staged.companionState === undefined ? null : dismissCompanion(staged.companionState);
        const companion = previous === null ? undefined : staged.companions?.get(previous);
        const name = companion === undefined
          ? undefined
          : staged.npcNames?.get(companion.npcId) ?? companion.npcId;
        lines.push(name === undefined ? '伙伴暂离' : `「${name}」暂离队伍`);
        break;
      }
      case 'setVariable': {
        const ledger = staged.dialogueVariables;
        if (ledger !== undefined) {
          const existed = ledger.has(effect.key);
          ledger.set(effect.key, effect.value);
          lines.push(existed ? '已改记这次交谈的决定' : '已记下这次交谈的决定');
        }
        break;
      }
    }
  }

  // Publish only after every staged effect and quest signal succeeded.
  if (teleportRequest !== undefined) {
    const result = preflightDialogueTeleport(teleportRequest, staged.teleportReadiness, staged.companionState?.activeCompanionId ?? null);
    if (!result.ok) return result;
  }
  commitRuntimeContext(context, staged);

  return { ok: true, summary: { lines, questUpdate, ...(battleRequest === undefined ? {} : { battleRequest }), ...(teleportRequest === undefined ? {} : { teleportRequest }) } };
}
