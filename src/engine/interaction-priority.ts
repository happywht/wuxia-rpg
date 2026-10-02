/**
 * A ready regional event may share an interaction cell with a talk-only NPC.
 * E should reach the event in that case; dedicated shop and quest-giver
 * actions keep their established priority, while F remains available for talk.
 */
export function shouldPreferRegionalEventInteraction(
  regionalEventAvailable: boolean,
  npcHasDedicatedInteraction: boolean,
): boolean {
  return regionalEventAvailable && !npcHasDedicatedInteraction;
}
