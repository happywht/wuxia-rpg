import type { QuestData, QuestJournal, QuestStatus, QuestProgressState } from '../engine/quest-system';
const priority: Record<QuestStatus, number> = { active: 0, offered: 1, locked: 2, completed: 3, failed: 4 };
/** Stable priority preserves authored order within each group; tracked active task comes first. */
export function orderQuestRows(quests: readonly QuestData[], journal: QuestJournal): QuestData[] {
  const rank = (quest: QuestData) => {
    const status = journal.states.get(quest.id)?.status ?? 'locked';
    return status === 'active' && journal.trackedQuestId === quest.id ? -1 : priority[status];
  };
  return [...quests].sort((a, b) => rank(a) - rank(b));
}

export function nearestGuideNpc<T extends { col: number; row: number; record: { name: string; questGiver?: boolean } }>(npcs: readonly T[], position: {col:number;row:number}): T | undefined {
  const candidates = npcs.filter(npc => npc.record.questGiver);
  return candidates.reduce<T | undefined>((best, npc) => {
    const distance = (entry: T) => Math.abs(entry.col - position.col) + Math.abs(entry.row - position.row);
    return best === undefined || distance(npc) < distance(best) ? npc : best;
  }, undefined);
}

/** Tone of the tracker line; the scene maps it onto the HUD text colors. */
export type QuestTrackerTone = 'notice' | 'guide' | 'tracked';

export interface QuestTrackerInput {
  /** Live placed NPCs of the CURRENT map, exactly as the scene walks them. */
  npcs: readonly { col: number; row: number; record: { name: string; questGiver?: boolean; shopId?: string | null } }[];
  position: { col: number; row: number };
  quests: ReadonlyMap<string, QuestData>;
  journal: QuestJournal;
  notice: string | null;
}

export interface QuestTrackerLine { text: string; tone: QuestTrackerTone }

/**
 * Round 117: the HUD quest line as one pure projection.
 *
 * The scene rebuilt this text only on boot, journal navigation and quest
 * updates, so a region switch (or an NPC schedule change) kept showing the
 * previous map's "nearby guide" hint until unrelated state happened to move.
 * Everything the line shows — a completion notice, tracked progress, the
 * nearest guide — derives from these live inputs, so calling the projection
 * after any of them changes always renders the current region.
 */
export function projectQuestTrackerLine(input: QuestTrackerInput): QuestTrackerLine {
  if (input.notice !== null) return { text: input.notice, tone: 'notice' };
  const trackedId = input.journal.trackedQuestId;
  const quest = trackedId === null ? undefined : input.quests.get(trackedId);
  const state = trackedId === null ? undefined : input.journal.states.get(trackedId);
  if (quest === undefined || state?.status !== 'active') {
    const guide = nearestGuideNpc(input.npcs, input.position);
    return {
      text: guide === undefined
        ? 'Q 查看差事 · H 查看操作'
        : `附近：${guide.record.name} (${guide.col},${guide.row}) · 相邻按 F 打听 / E ${guide.record.shopId ? '看商铺' : '看托付'} · Q 查差事`,
      tone: 'guide',
    };
  }
  const progress = quest.objectives.map((objective) =>
    `${objective.text} ${state.objectiveCounts.get(objective.id) ?? 0}/${objective.requiredCount}`,
  ).join(' · ');
  return { text: `跟踪：${quest.name}　${progress}`, tone: 'tracked' };
}

/** The row summarizes the live step, never the first completed objective. */
export function activeQuestProgressLabel(quest: QuestData, state: QuestProgressState): string {
  if (state.status !== 'active') return '';
  if (quest.orderedObjectives) {
    const pending = quest.objectives.findIndex(objective => (state.objectiveCounts.get(objective.id) ?? 0) < objective.requiredCount);
    if (pending < 0) return '目标均已达成';
    const objective = quest.objectives[pending]!;
    return `第${pending + 1}/${quest.objectives.length}步 ${state.objectiveCounts.get(objective.id) ?? 0}/${objective.requiredCount}`;
  }
  const completed = quest.objectives.filter(objective => (state.objectiveCounts.get(objective.id) ?? 0) >= objective.requiredCount).length;
  return `已成${completed}/${quest.objectives.length}项`;
}
