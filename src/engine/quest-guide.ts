/**
 * Round 110 quest-discovery helper: Phaser-free assembly of the regional
 * guide's quest category.
 *
 * One call yields both bands the R panel shows: active journeys keep their
 * original objective navigation (the Round 60 runtime quest selector), and
 * commissions still acceptable here and now route to their giver through the
 * live region-guide NPC selector. Acceptance stays in the existing board,
 * journal or dialogue flow — this helper only points the way, so a locked or inaccessible task
 * is filtered out instead of being advertised as acceptable.
 *
 * Round 151 admission hints: when assembled conversations plus a live
 * per-giver dialogue context are supplied, the offer row also explains the
 * giver's real E/F entry points — E opens the board only for a plain
 * non-shop giver (a shopkeeper's E opens the store first), while the F
 * conversation is checked generically for a currently reachable
 * accept-quest option. Without those inputs the historical hints stay
 * byte-for-byte unchanged.
 */

import type { DialogueData, DialogueNodeData } from './dialogue-graph';
import { getVisibleOptions, type DialogueRuntimeContext } from './dialogue-runtime';
import { resolveQuestNavigationTarget, type QuestNavigationInput } from './quest-navigation';
import { hasQuestAccess, type QuestAccessContext, type QuestData, type QuestJournal } from './quest-system';
import { REGION_GUIDE_PREFIX, resolveRegionGuideNpc, type RegionGuideEntry, type RegionalGuideInput } from './regional-guide';

export interface QuestGuideInput {
  /** Live region-guide facts; giver positions resolve through the same live selector. */
  guide: RegionalGuideInput;
  quests: ReadonlyMap<string, QuestData>;
  journal: QuestJournal;
  /** Current membership and discoveries; gates offered quests exactly like the board. */
  access: QuestAccessContext;
  /** Live facts the objective resolver needs beyond `guide`. */
  encounters: QuestNavigationInput['encounters'];
  craftingStations?: QuestNavigationInput['craftingStations'];
  knowledgeNodeTitles?: QuestNavigationInput['knowledgeNodeTitles'];
  /** Assembled giver conversations by id; enables dialogue-aware admission hints. */
  dialogues?: ReadonlyMap<string, DialogueData>;
  /** Live dialogue context per giver NPC (the same facts the F panel evaluates). */
  dialogueContextFor?: (npcId: string) => Readonly<DialogueRuntimeContext>;
}

/** What the giver's assembled conversation says about accepting one quest. */
export type DialogueAcceptanceReach = 'absent' | 'exists' | 'now';

/**
 * Classifies one quest's acceptance option inside one assembled conversation.
 * `now` holds only when the F panel opened this minute can reach a visible
 * acceptance option purely by following effect-free visible transitions —
 * every hop is guaranteed playable without committing any side effect, so the
 * promise never overstates live reachability. `exists` marks an authored
 * acceptance option today's conditions (or a side-effect chain) do not
 * surface; callers must stay qualified about it instead of promising a path.
 */
export function dialogueAcceptanceReach(
  conversation: Readonly<DialogueData> | undefined,
  questId: string,
  context: Readonly<DialogueRuntimeContext> | undefined,
): DialogueAcceptanceReach {
  if (conversation === undefined) return 'absent';
  let exists = false;
  for (const node of conversation.nodes) {
    for (const option of node.options ?? []) {
      if ((option.effects ?? []).some((effect) => effect.kind === 'acceptQuest' && effect.questId === questId)) {
        exists = true;
        break;
      }
    }
  }
  if (!exists || context === undefined) return exists ? 'exists' : 'absent';
  const byId = new Map(conversation.nodes.map((node) => [node.id, node] as const));
  const queue: string[] = [conversation.startNodeId];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const node = byId.get(queue.shift()!);
    if (node === undefined) continue; // Defensive: graph validation guarantees resolution.
    for (const { option } of getVisibleOptions(node, context)) {
      const effects = option.effects ?? [];
      if (effects.some((effect) => effect.kind === 'acceptQuest' && effect.questId === questId)) return 'now';
      if (effects.length === 0 && !visited.has(option.nextNodeId)) {
        visited.add(option.nextNodeId);
        queue.push(option.nextNodeId);
      }
    }
  }
  return 'exists';
}

/**
 * Builds the quest category in declaration order: active journeys first,
 * then locally acceptable commissions. Iterating the quest set (not journal
 * insertion order) keeps the output stable for older saves whose journal
 * states were recorded in a different order or miss newer quests entirely.
 */
export function buildQuestGuideEntries(input: QuestGuideInput): RegionGuideEntry[] {
  const guide = input.guide;
  const follower = guide.follower;
  const navigationBase = {
    worldMap: guide.worldMap,
    baseNpcs: guide.baseNpcs,
    periodNpcs: guide.periodNpcs ?? guide.baseNpcs,
    ...(guide.currentMapNpcs === undefined ? {} : { currentMapNpcs: guide.currentMapNpcs }),
    ...(follower === undefined ? {} : {
      currentFollower: {
        ...follower.npc, col: follower.col, row: follower.row,
        record: { ...follower.npc.record, mapResourceId: follower.mapResourceId },
      },
    }),
    encounters: input.encounters,
    ...(input.craftingStations === undefined ? {} : { craftingStations: input.craftingStations }),
    ...(input.knowledgeNodeTitles === undefined ? {} : { knowledgeNodeTitles: input.knowledgeNodeTitles }),
    shops: guide.shops,
    shopStocks: guide.shopStocks,
    currentMapResourceId: guide.currentMapResourceId,
  };
  const entries: RegionGuideEntry[] = [];
  // Active journeys: original objective navigation, unchanged from the panel's
  // earlier inline assembly.
  for (const quest of input.quests.values()) {
    if (input.journal.states.get(quest.id)?.status !== 'active') continue;
    const resolution = resolveQuestNavigationTarget({
      ...navigationBase, quests: input.quests, journal: input.journal, questId: quest.id,
    });
    entries.push({
      id: 'quest:' + quest.id,
      category: 'quest',
      title: quest.name,
      detail: resolution.status === 'no-target'
        ? '下一步暂不是空间目标或相关资料不可用；Q日志可查看操作与资格。'
        : resolution.target.objectiveText + ' · ' + resolution.target.name,
      destinationId: resolution.status === 'no-target' ? null : resolution.target.id,
    });
  }
  // Acceptable local commissions: offered, eligible and standing on this map
  // right now (a missing/MOD-removed giver or one walking another region is
  // skipped rather than pinned to stale home coordinates).
  for (const quest of input.quests.values()) {
    if (input.journal.states.get(quest.id)?.status !== 'offered') continue;
    if (!hasQuestAccess(quest, input.access)) continue;
    const giver = resolveRegionGuideNpc(guide, quest.giverNpcId);
    if (giver === undefined || giver.record.mapResourceId !== guide.currentMapResourceId) continue;
    // The acceptance entry point follows the giver's real identity: E is the
    // board only for a plain non-shop quest giver standing here (GridScene
    // resolves an adjacent NPC's E to the shop first, then the board), while
    // a shopkeeper's E opens the store and a companion is reached through P
    // then T. Round 151 additionally checks the giver's assembled F
    // conversation for a live acceptance option, so a reachable
    // accept-quest choice is promised only when its conditions currently
    // hold; an authored-but-hidden one keeps a qualified wording.
    const isCompanion = follower?.npc.record.id === quest.giverNpcId;
    const ownsShop = giver.record.shopId !== null && guide.shops.get(giver.record.shopId)?.record.npcId === quest.giverNpcId;
    const dialogueAware = input.dialogues !== undefined && input.dialogueContextFor !== undefined;
    const reach = dialogueAware
      ? dialogueAcceptanceReach(
          input.dialogues!.get(giver.record.dialogueId),
          quest.id,
          input.dialogueContextFor!(giver.record.id),
        )
      : 'absent';
    const talkKey = isCompanion ? 'P再T交谈' : 'F交谈';
    const acceptHint = giver.record.questGiver && !ownsShop && !isCompanion
      ? reach === 'now'
        ? '走到近旁按E打开差事名录，Enter接取；或F交谈，对话里选接取。'
        : reach === 'exists'
          ? '走到近旁按E打开差事名录，Enter接取；F交谈（接取选项须满足条件才出现）。'
          : '走到近旁按E打开差事名录，Enter接取；F交谈。'
      : reach === 'now'
        ? ownsShop
          ? '按E开的是铺面交易；接取按F交谈，对话里选接取；Q日志选中本差事后Enter亦可。'
          : `接取按${talkKey}，对话里选接取；Q日志选中本差事后Enter亦可。`
        : reach === 'exists'
          ? ownsShop
            ? '按E开的是铺面交易；接取可在Q日志选中本差事后Enter；F交谈的接取选项须满足条件才出现。'
            : `接取可在Q日志选中本差事后Enter；${talkKey}的接取选项须满足条件才出现。`
          : `接取可在Q日志选中本差事后Enter；${isCompanion ? '交谈按P再T' : 'F交谈'}。`;
    entries.push({
      id: 'offer:' + quest.id,
      category: 'quest',
      title: quest.name + '（待接取）',
      detail: `待接取 · 委托人 ${giver.record.name} (${giver.col},${giver.row}) · ${isCompanion ? '真实同行位置' : '位置随当前时段重算'}。\n${quest.description}\n导航只带路到委托人近旁；${acceptHint}`,
      destinationId: REGION_GUIDE_PREFIX + 'npc:' + quest.giverNpcId,
    });
  }
  return [...entries, ...buildDialogueDecisionGuideEntries(input), ...buildDialogueFollowupGuideEntries(input), ...buildDialogueAftermathGuideEntries(input)];
}

/** Visible confirmation nodes reachable without first committing any effect. */
export function reachableDialogueDecisions(conversation: Readonly<DialogueData>, context: Readonly<DialogueRuntimeContext>): DialogueNodeData[] {
  return reachableDialogueNodes(conversation, context).filter(node => node.confirmEffects === true &&
    getVisibleOptions(node, context).some(({option}) => (option.effects?.length ?? 0) > 0));
}

function reachableDialogueNodes(conversation: Readonly<DialogueData>, context: Readonly<DialogueRuntimeContext>): DialogueNodeData[] {
  const nodes = new Map(conversation.nodes.map(node => [node.id, node]));
  const queue = [conversation.startNodeId], visited = new Set(queue), result: DialogueNodeData[] = [];
  while (queue.length > 0) {
    const node = nodes.get(queue.shift()!);
    if (node === undefined) continue;
    const visible = getVisibleOptions(node, context);
    result.push(node);
    for (const {option} of visible) {
      if ((option.effects?.length ?? 0) === 0 && !visited.has(option.nextNodeId)) {
        visited.add(option.nextNodeId); queue.push(option.nextNodeId);
      }
    }
  }
  return result;
}

/** Read-only local chapter follow-ups, including after the associated quest has completed. */
export function buildDialogueDecisionGuideEntries(input: QuestGuideInput): RegionGuideEntry[] {
  if (input.dialogues === undefined || input.dialogueContextFor === undefined) return [];
  const entries: RegionGuideEntry[] = [];
  const ids = new Set(input.guide.baseNpcs.map(npc => npc.record.id));
  for (const id of ids) {
    const npc = resolveRegionGuideNpc(input.guide, id);
    if (npc === undefined || npc.record.mapResourceId !== input.guide.currentMapResourceId) continue;
    const conversation = input.dialogues.get(npc.record.dialogueId);
    if (conversation === undefined) continue;
    const context = input.dialogueContextFor(id);
    for (const node of reachableDialogueDecisions(conversation, context)) {
      const options = getVisibleOptions(node, context).filter(({option}) => (option.effects?.length ?? 0) > 0);
      const talk = input.guide.follower?.npc.record.id === id ? 'P再T交谈' : 'F交谈';
      entries.push({id: `decision:${id}:${node.id}`, category: 'quest', title: `${npc.record.name}（可谈决定）`,
        detail: `当前可谈 · ${npc.record.name} (${npc.col},${npc.row})\n${node.text}\n${options.map(({option}) => option.text).join('\n')}\n导航只带路到人物；按${talk}读完对白，再选择并确认。以抵达时条件为准，本页不结算或承诺效果一定成功。`,
        destinationId: REGION_GUIDE_PREFIX + 'npc:' + id});
    }
  }
  return entries;
}

/** Task-completion-dependent knowledge follow-ups; never reads the destination answer. */
export function buildDialogueFollowupGuideEntries(input: QuestGuideInput): RegionGuideEntry[] {
  if (input.dialogues === undefined || input.dialogueContextFor === undefined) return [];
  const entries: RegionGuideEntry[] = [];
  for (const id of new Set(input.guide.baseNpcs.map(npc => npc.record.id))) {
    const npc = resolveRegionGuideNpc(input.guide, id);
    if (npc === undefined || npc.record.mapResourceId !== input.guide.currentMapResourceId) continue;
    const conversation = input.dialogues.get(npc.record.dialogueId);
    if (conversation === undefined) continue;
    const context = input.dialogueContextFor(id);
    for (const node of reachableDialogueNodes(conversation, context)) {
      if (node.confirmEffects === true) continue;
      for (const {option, index} of getVisibleOptions(node, context)) {
        const effects = option.effects ?? [];
        if (!(option.conditions ?? []).some(condition => condition.kind === 'questStatus' && condition.status === 'completed') ||
          effects.length === 0 || effects.some(effect => effect.kind !== 'discoverKnowledgeNode') ||
          !effects.some(effect => effect.kind === 'discoverKnowledgeNode' && !context.knownKnowledgeNodeIds.has(effect.nodeId))) continue;
        const talk = input.guide.follower?.npc.record.id === id ? 'P再T交谈' : 'F交谈';
        entries.push({id: `followup:${id}:${node.id}:${index}`, category: 'quest', title: `${npc.record.name}（调查续谈）`,
          detail: `当前可续谈 · ${npc.record.name} (${npc.col},${npc.row})\n${option.text}\n差事完成后仍有尚未记入的调查见闻；本页不展示答案或判定章节已经结案。导航只带路到人物，按${talk}找到上述选项并阅读，以抵达时资格为准。`,
          destinationId: REGION_GUIDE_PREFIX + 'npc:' + id});
      }
    }
  }
  return entries;
}

/** Known-choice responses: only the original question is projected, never its answer. */
export function buildDialogueAftermathGuideEntries(input: QuestGuideInput): RegionGuideEntry[] {
  if (input.dialogues === undefined || input.dialogueContextFor === undefined) return [];
  const entries: RegionGuideEntry[] = [];
  for (const id of new Set(input.guide.baseNpcs.map(npc => npc.record.id))) {
    const npc = resolveRegionGuideNpc(input.guide, id);
    if (npc === undefined || npc.record.mapResourceId !== input.guide.currentMapResourceId) continue;
    const conversation = input.dialogues.get(npc.record.dialogueId);
    if (conversation === undefined) continue;
    const context = input.dialogueContextFor(id);
    for (const node of reachableDialogueNodes(conversation, context)) {
      if (node.confirmEffects === true) continue;
      for (const {option, index} of getVisibleOptions(node, context)) {
        if ((option.effects?.length ?? 0) > 0 || !(option.conditions ?? []).some(condition =>
          condition.kind === 'knowledgeKnown' && condition.isKnown !== false && context.knownKnowledgeNodeIds.has(condition.nodeId))) continue;
        const talk = input.guide.follower?.npc.record.id === id ? 'P再T交谈' : 'F交谈';
        entries.push({id: `aftermath:${id}:${node.id}:${index}`, category: 'quest', title: `${npc.record.name}（可谈回响）`,
          detail: `当前可询问 · ${npc.record.name} (${npc.col},${npc.row})\n${option.text}\n已有见闻使这个问题可谈；本页只列问题，不展示答复或执行效果。导航到人物后按${talk}选择上述问题，以抵达时资格为准；已读答复仍可复谈。`,
          destinationId: REGION_GUIDE_PREFIX + 'npc:' + id});
      }
    }
  }
  return entries;
}