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
  adjustRelationship,
  adjustRenown,
  getRelationship,
} from './social-state';
import type { KnowledgeNodeData } from './knowledge-graph';

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
  /** Optional display names by NPC id for feedback lines (data-driven). */
  npcNames?: ReadonlyMap<string, string>;
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
} {
  const questIds: string[] = [];
  const itemIds: string[] = [];
  const npcIds: string[] = [];
  const knowledgeNodeIds: string[] = [];
  for (const condition of option.conditions ?? []) {
    if (condition.kind === 'questStatus') questIds.push(condition.questId);
    else if (condition.kind === 'itemCount') itemIds.push(condition.itemId);
    else if (condition.kind === 'npcRelationship') npcIds.push(condition.npcId);
    else if (condition.kind === 'knowledgeKnown') knowledgeNodeIds.push(condition.nodeId);
  }
  for (const effect of option.effects ?? []) {
    if (effect.kind === 'acceptQuest' || effect.kind === 'abandonQuest') questIds.push(effect.questId);
    else if (effect.kind === 'giveItem' || effect.kind === 'takeItem') itemIds.push(effect.itemId);
    else if (effect.kind === 'adjustRelationship' && effect.npcId !== undefined) {
      npcIds.push(effect.npcId);
    } else if (effect.kind === 'discoverKnowledgeNode') knowledgeNodeIds.push(effect.nodeId);
  }
  return { questIds, itemIds, npcIds, knowledgeNodeIds };
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
    case 'npcRelationship':
      return withinBounds(
        getRelationship(context.social, condition.npcId),
        condition.minValue,
        condition.maxValue,
      );
    case 'knowledgeKnown':
      return context.knownKnowledgeNodeIds.has(condition.nodeId);
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

// ---------------------------------------------------------------------------
// Atomic effect execution
// ---------------------------------------------------------------------------

/** Mechanical feedback line per executed effect (names come from data). */
export interface DialogueEffectSummary {
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
      relationships: new Map(context.social.relationships),
    },
    knownKnowledgeNodeIds: new Set(context.knownKnowledgeNodeIds),
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
  target.social.relationships.clear();
  for (const [npcId, relationship] of staged.social.relationships) {
    target.social.relationships.set(npcId, relationship);
  }
  target.knownKnowledgeNodeIds.clear();
  for (const nodeId of staged.knownKnowledgeNodeIds) target.knownKnowledgeNodeIds.add(nodeId);
}

/**
 * Validates one effect without mutating anything. Returns null when the
 * effect is committable right now, or a readable refusal reason.
 */
function validateEffect(
  effect: DialogueEffectData,
  context: Readonly<DialogueRuntimeContext>,
): string | null {
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
      case 'acceptQuest': {
        const quest = staged.quests.get(effect.questId);
        const result = staged.inventory === null
          ? acceptQuest(staged.quests, staged.journal, effect.questId)
          : acceptQuest(
              staged.quests,
              staged.journal,
              effect.questId,
              objectiveItemCounts(staged.quests, staged.inventory),
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
      case 'adjustRelationship': {
        const targetId = effect.npcId ?? staged.speakerNpcId;
        adjustRelationship(staged.social, targetId, effect.delta);
        const sign = effect.delta > 0 ? '+' : '−';
        const magnitude = Math.abs(effect.delta);
        const displayName = staged.npcNames?.get(targetId);
        lines.push(
          displayName === undefined
            ? `关系 ${sign}${magnitude}`
            : `与「${displayName}」关系 ${sign}${magnitude}`,
        );
        break;
      }
      case 'discoverKnowledgeNode': {
        const node = staged.knowledgeNodes.get(effect.nodeId);
        if (node !== undefined) {
          const alreadyKnown = staged.knownKnowledgeNodeIds.has(node.id);
          staged.knownKnowledgeNodeIds.add(node.id);
          lines.push(alreadyKnown ? `已记下「${node.title}」` : `新增见闻「${node.title}」`);
        }
        break;
      }
    }
  }

  // Publish only after every staged effect and quest signal succeeded.
  commitRuntimeContext(context, staged);

  return { ok: true, summary: { lines, questUpdate } };
}
