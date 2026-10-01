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
 */

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
    // board only for a plain non-shop quest giver standing here, while a
    // shopkeeper's E opens the store and a companion is reached through P
    // then T — both route acceptance through the Q journal instead.
    const isCompanion = follower?.npc.record.id === quest.giverNpcId;
    const ownsShop = giver.record.shopId !== null && guide.shops.get(giver.record.shopId)?.record.npcId === quest.giverNpcId;
    const acceptHint = giver.record.questGiver && !ownsShop && !isCompanion
      ? '走到近旁按E打开差事名录，Enter接取；F交谈。'
      : `接取可在Q日志选中本差事后Enter；${isCompanion ? '交谈按P再T' : 'F交谈'}。`;
    entries.push({
      id: 'offer:' + quest.id,
      category: 'quest',
      title: quest.name + '（待接取）',
      detail: `待接取 · 委托人 ${giver.record.name} (${giver.col},${giver.row}) · ${isCompanion ? '真实同行位置' : '位置随当前时段重算'}。\n${quest.description}\n导航只带路到委托人近旁；${acceptHint}`,
      destinationId: REGION_GUIDE_PREFIX + 'npc:' + quest.giverNpcId,
    });
  }
  return entries;
}
