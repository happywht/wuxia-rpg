import type { QuestData, QuestJournal, QuestStatus } from '../engine/quest-system';
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
