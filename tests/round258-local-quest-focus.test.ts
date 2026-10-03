import { describe, expect, it } from 'vitest';
import { createQuestJournal, type QuestData } from '../src/engine/quest-system';
import { nearestOfferedQuestId } from '../src/game/quest-presentation';

function quest(id: string, giverNpcId: string): QuestData {
  return {
    id, name: id, description: id, giverNpcId, prerequisiteQuestIds: [], objectives: [], failOnEncounterIds: [],
    rewards: { experience: 1, currency: 1 },
  } as QuestData;
}

const access = { factionId: null, knownKnowledgeNodeIds: new Set<string>() };
const position = { col: 0, row: 0 };

describe('Round258 fresh journal local focus', () => {
  it('recommends the nearest eligible offer among NPCs actually placed in the current map', () => {
    const remote = quest('quest.remote', 'npc.remote');
    const local = quest('quest.local', 'npc.local');
    const farther = quest('quest.farther', 'npc.farther');
    const quests = new Map([remote, local, farther].map(value => [value.id, value]));
    const journal = createQuestJournal(quests);

    expect(nearestOfferedQuestId(quests, journal, access, [
      { col: 1, row: 0, record: { id: 'npc.local', name: '本地委托人', questGiver: true } },
      { col: 5, row: 0, record: { id: 'npc.farther', name: '较远委托人', questGiver: true } },
    ], position)).toBe('quest.local');
  });

  it('leaves the active journey as the journal priority and gives no false local recommendation', () => {
    const local = quest('quest.local', 'npc.local');
    const quests = new Map([[local.id, local]]);
    const journal = createQuestJournal(quests);
    journal.states.get(local.id)!.status = 'active';

    expect(nearestOfferedQuestId(quests, journal, access, [
      { col: 1, row: 0, record: { id: 'npc.local', name: '本地委托人', questGiver: true } },
    ], position)).toBeUndefined();
    expect(nearestOfferedQuestId(quests, createQuestJournal(quests), access, [], position)).toBeUndefined();
  });
});
