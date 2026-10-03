import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseQuestSet, createQuestJournal, acceptQuest, applyQuestSignal, type QuestData } from '../src/engine/quest-system';
import { parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { parseAlchemySet } from '../src/engine/alchemy-system';
import { parseGridMap } from '../src/engine/grid-map';
import { findGridPathToAdjacentCell } from '../src/engine/grid-path';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../data/base/${path}`, import.meta.url), 'utf8'));
const questIds = {
  inquiry: 'quest.r31-herbal-inquiry',
  stocktaking: 'quest.r31-herbal-stocktaking',
  watch: 'quest.r31-mist-shore-watch',
  provisioning: 'quest.r31-caravan-provisioning',
};
const parsedQuests = parseQuestSet(read('quests/round-07-quests.json'));
if (!parsedQuests.ok) throw new Error(parsedQuests.errors.join('\n'));
const quests = new Map(parsedQuests.set.quests.map((quest) => [quest.id, quest]));

describe('Round263 药队共同前置链', () => {
  it('orders inquiry, five medicine stages, shore watch, then caravan preparation', () => {
    const inquiry = quests.get(questIds.inquiry)!;
    const stock = quests.get(questIds.stocktaking)!;
    const watch = quests.get(questIds.watch)!;
    const provisioning = quests.get(questIds.provisioning)!;
    expect(inquiry.prerequisiteQuestIds).toContain('quest.round-07-medicine-run');
    expect(inquiry.objectives.map((objective) => objective.targetId)).toEqual(['char.rong-su-qing']);
    expect(stock.prerequisiteQuestIds).toContain(questIds.inquiry);
    expect(stock.orderedObjectives).toBe(true);
    expect(stock.objectives.map((objective) => objective.kind)).toEqual([
      'collectItem', 'discoverKnowledge', 'craftRecipe', 'useItem', 'talkToNpc',
    ]);
    expect(watch.prerequisiteQuestIds).toContain(questIds.stocktaking);
    expect(provisioning.prerequisiteQuestIds).toEqual([questIds.stocktaking, questIds.watch]);
    expect(quests.get('quest.r31-guard-the-caravan')?.exclusiveGroupId)
      .toBe(quests.get('quest.r31-mend-the-pier')?.exclusiveGroupId);
  });

  it('does not let out-of-order recipe, healing, or report signals skip the medicine checklist', () => {
    const quest = quests.get(questIds.stocktaking)!;
    const journal = createQuestJournal(quests);
    for (const prerequisiteId of quest.prerequisiteQuestIds) journal.states.get(prerequisiteId)!.status = 'completed';
    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.rong-su-qing' });
    expect(journal.states.get(quest.id)?.status).toBe('offered');
    expect(acceptQuest(quests, journal, quest.id).ok).toBe(true);
    const later = quest.objectives.slice(1);
    for (const objective of later) {
      if (objective.kind === 'discoverKnowledge') applyQuestSignal(quests, journal, { type: 'knowledge-discovery', nodeId: objective.targetId });
      if (objective.kind === 'craftRecipe') applyQuestSignal(quests, journal, { type: 'recipe-crafted', recipeId: objective.targetId });
      if (objective.kind === 'useItem') applyQuestSignal(quests, journal, { type: 'item-used', itemId: objective.targetId });
      if (objective.kind === 'talkToNpc') applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: objective.targetId });
    }
    expect(journal.states.get(quest.id)?.status).toBe('active');
    expect(quest.objectives.map((objective) => journal.states.get(quest.id)?.objectiveCounts.get(objective.id) ?? 0))
      .toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps the medicine encounter at its authored location reachable and nonrepeatable', () => {
    const encounterSet = parseBattleEncounterSet(read('battles/round-05-encounters.json'));
    const mapSet = parseGridMap(read('maps/round-10-mist-ferry.json'));
    expect(encounterSet.ok).toBe(true);
    expect(mapSet.ok).toBe(true);
    if (!encounterSet.ok || !mapSet.ok) return;
    const encounter = encounterSet.set.encounters.find((entry) => entry.id === 'encounter.mist-shore-prowler')!;
    expect(encounter.repeatable).toBe(false);
    expect(mapSet.map.canEnter(encounter.position.col, encounter.position.row)).toBe(true);
    expect(findGridPathToAdjacentCell(mapSet.map, mapSet.map.playerStart, encounter.position)).not.toBeNull();
  });

  it('references a valid medicine recipe and preserves ordered-stage data through parse', () => {
    const alchemy = parseAlchemySet(read('alchemy/round-25-alchemy.json'));
    expect(alchemy.ok).toBe(true);
    if (!alchemy.ok) return;
    const recipeIds = new Set(alchemy.set.recipes.map((recipe) => recipe.id));
    const brew = quests.get(questIds.stocktaking)!.objectives.find((objective) => objective.kind === 'craftRecipe')!;
    expect(recipeIds.has(brew.targetId)).toBe(true);
    expect((quests.get(questIds.stocktaking) as QuestData).orderedObjectives).toBe(true);
  });
});
