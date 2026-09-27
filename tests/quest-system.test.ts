/**
 * Round 38 unit tests for the quest state machine: defensive parsing,
 * cross-reference assembly, journal creation and the accept / progress /
 * complete / fail lifecycle including exclusive-branch settlement.
 */

import { describe, expect, it } from 'vitest';

import {
  type QuestData,
  type QuestSetData,
  abandonQuest,
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const errandQuest: QuestData = {
  id: 'quest-errand',
  name: '带话差事',
  description: '替长老给农夫带一句话。',
  giverNpcId: 'npc-elder',
  prerequisiteQuestIds: [],
  objectives: [
    { id: 'obj-talk', kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '与农夫交谈' },
  ],
  failOnEncounterIds: ['encounter-ambush'],
  rewards: { experience: 30, currency: 10 },
};

const gatherQuest: QuestData = {
  id: 'quest-gather',
  name: '采药差事',
  description: '替长老采两株草药。',
  giverNpcId: 'npc-elder',
  prerequisiteQuestIds: ['quest-errand'],
  objectives: [
    { id: 'obj-collect', kind: 'collectItem', targetId: 'item-herb', requiredCount: 2, text: '采集草药' },
  ],
  failOnEncounterIds: [],
  rewards: { experience: 20, currency: 15 },
};

const branchA: QuestData = {
  id: 'quest-branch-a',
  name: '投效官府',
  description: '替官府办事。',
  giverNpcId: 'npc-elder',
  exclusiveGroupId: 'career',
  prerequisiteQuestIds: [],
  objectives: [
    { id: 'obj-a', kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '回话' },
  ],
  failOnEncounterIds: [],
  rewards: { experience: 10, currency: 10 },
};

const branchB: QuestData = {
  id: 'quest-branch-b',
  name: '落草为寇',
  description: '替山寨望风。',
  giverNpcId: 'npc-elder',
  exclusiveGroupId: 'career',
  prerequisiteQuestIds: [],
  objectives: [
    { id: 'obj-b', kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '接头' },
  ],
  failOnEncounterIds: [],
  rewards: { experience: 10, currency: 10 },
};

interface World {
  questSet: QuestSetData;
  questGiverNpcIds: ReadonlySet<string>;
  npcIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
  encounterIds: ReadonlySet<string>;
}

function assembleWorld(quests: QuestData[], overrides: Partial<World> = {}) {
  return assembleQuests({
    questSet: { quests },
    questGiverNpcIds: new Set(['npc-elder']),
    npcIds: new Set(['npc-elder', 'npc-farmer']),
    itemIds: new Set(['item-herb']),
    encounterIds: new Set(['encounter-ambush']),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('parseQuestSet', () => {
  it('accepts a well-formed set and reproduces its fields', () => {
    const result = parseQuestSet({
      quests: [
        {
          id: 'q',
          name: '名',
          description: '说明',
          giverNpcId: 'npc-elder',
          prerequisiteQuestIds: [],
          objectives: [
            { id: 'o', kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '目标' },
          ],
          failOnEncounterIds: [],
          rewards: { experience: 1, currency: 2 },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.set.quests).toHaveLength(1);
    const quest = result.set.quests[0]!;
    expect(quest.id).toBe('q');
    expect(quest.objectives[0]!.kind).toBe('talkToNpc');
  });

  it('rejects entries with missing or invalid fields', () => {
    const result = parseQuestSet({ quests: [{ id: 'q', name: '名' }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // One per-field line plus one summary line for the entry.
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const joined = result.errors.join('\n');
    expect(joined).toContain('description');
    expect(joined).toContain('giverNpcId');
    expect(joined).toContain('objectives');
    expect(joined).toContain('rewards');
  });

  it('rejects a non-array envelope', () => {
    expect(parseQuestSet({ quests: 'nope' }).ok).toBe(false);
    expect(parseQuestSet(null).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-reference assembly
// ---------------------------------------------------------------------------

describe('assembleQuests', () => {
  it('keeps quests whose references all resolve', () => {
    const { quests, warnings } = assembleWorld([errandQuest, gatherQuest]);
    expect(warnings).toEqual([]);
    expect([...quests.keys()]).toEqual(['quest-errand', 'quest-gather']);
  });

  it('disables a quest whose giver NPC is not an assembled quest giver', () => {
    const broken: QuestData = { ...errandQuest, id: 'quest-broken', giverNpcId: 'npc-ghost' };
    const { quests, warnings } = assembleWorld([errandQuest, broken]);
    expect(quests.has('quest-broken')).toBe(false);
    expect(quests.has('quest-errand')).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('quest-broken');
    expect(warnings[0]).toContain('npc-ghost');
  });

  it('disables quests locked in a prerequisite cycle', () => {
    const loopA: QuestData = { ...errandQuest, id: 'loop-a', prerequisiteQuestIds: ['loop-b'] };
    const loopB: QuestData = { ...errandQuest, id: 'loop-b', prerequisiteQuestIds: ['loop-a'] };
    const { quests, warnings } = assembleWorld([loopA, loopB]);
    expect(quests.size).toBe(0);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((line) => line.includes('循环'))).toBe(true);
  });

  it('keeps an exclusive group whose members share prerequisites', () => {
    const { quests, warnings } = assembleWorld([branchA, branchB]);
    expect(warnings).toEqual([]);
    expect(quests.has('quest-branch-a')).toBe(true);
    expect(quests.has('quest-branch-b')).toBe(true);
  });

  it('disables a whole exclusive group with a single valid member', () => {
    const { quests, warnings } = assembleWorld([branchA]);
    expect(quests.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('互斥组 "career"');
  });

  it('returns an empty result for a null quest set', () => {
    expect(assembleQuests({
      questSet: null,
      questGiverNpcIds: new Set(),
      npcIds: new Set(),
      itemIds: new Set(),
      encounterIds: new Set(),
    })).toEqual({ quests: new Map(), warnings: [] });
  });
});

// ---------------------------------------------------------------------------
// Journal lifecycle
// ---------------------------------------------------------------------------

describe('quest lifecycle', () => {
  it('quests without prerequisites start offered, others locked', () => {
    const { quests } = assembleWorld([errandQuest, gatherQuest]);
    const journal = createQuestJournal(quests);
    expect(journal.states.get('quest-errand')!.status).toBe('offered');
    expect(journal.states.get('quest-gather')!.status).toBe('locked');
  });

  it('accepting an offered quest activates and tracks it', () => {
    const { quests } = assembleWorld([errandQuest]);
    const journal = createQuestJournal(quests);
    const result = acceptQuest(quests, journal, 'quest-errand');

    expect(result.ok).toBe(true);
    expect(journal.states.get('quest-errand')!.status).toBe('active');
    expect(journal.trackedQuestId).toBe('quest-errand');
  });

  it('refuses unknown quests, locked quests and repeat acceptance', () => {
    const { quests } = assembleWorld([errandQuest, gatherQuest]);
    const journal = createQuestJournal(quests);

    expect(acceptQuest(quests, journal, 'nope')).toMatchObject({ ok: false, reason: 'unknown-quest' });
    expect(acceptQuest(quests, journal, 'quest-gather')).toMatchObject({ ok: false, reason: 'not-offered' });

    acceptQuest(quests, journal, 'quest-errand');
    expect(acceptQuest(quests, journal, 'quest-errand')).toMatchObject({ ok: false, reason: 'not-offered' });
    expect(journal.states.get('quest-errand')!.status).toBe('active');
  });

  it('talk progress completes the quest, grants rewards and unlocks the follow-up', () => {
    const { quests } = assembleWorld([errandQuest, gatherQuest]);
    const journal = createQuestJournal(quests);
    acceptQuest(quests, journal, 'quest-errand');

    const update = applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'npc-farmer' });
    expect(update.changed).toBe(true);
    expect(update.completed).toEqual([
      { questId: 'quest-errand', experience: 30, currency: 10 },
    ]);
    expect(journal.states.get('quest-errand')!.status).toBe('completed');
    expect(journal.states.get('quest-gather')!.status).toBe('offered');

    // A further signal no longer touches the completed quest.
    const idle = applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'npc-farmer' });
    expect(idle.changed).toBe(false);
  });

  it('item-count signals sync the absolute quantity and clamp it to the requirement', () => {
    const { quests } = assembleWorld([errandQuest, gatherQuest]);
    const journal = createQuestJournal(quests);
    acceptQuest(quests, journal, 'quest-errand');
    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'npc-farmer' });
    acceptQuest(quests, journal, 'quest-gather');

    const state = journal.states.get('quest-gather')!;
    // Sync to 1 (below the requirement of 2): progress but no completion.
    let update = applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item-herb', quantity: 1 });
    expect(update.completed).toEqual([]);
    expect(state.objectiveCounts.get('obj-collect')).toBe(1);

    // Sync straight to 5: clamped to 2, completing the quest in one step.
    update = applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item-herb', quantity: 5 });
    expect(update.completed).toEqual([
      { questId: 'quest-gather', experience: 20, currency: 15 },
    ]);
    expect(state.objectiveCounts.get('obj-collect')).toBe(2);
    expect(state.status).toBe('completed');
  });

  it('accepting a collect quest snapshots already-owned items and may complete at once', () => {
    const { quests } = assembleWorld([errandQuest, gatherQuest]);
    const journal = createQuestJournal(quests);
    acceptQuest(quests, journal, 'quest-errand');
    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'npc-farmer' });

    const result = acceptQuest(quests, journal, 'quest-gather', new Map([['item-herb', 7]]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.completed).toEqual([
      { questId: 'quest-gather', experience: 20, currency: 15 },
    ]);
    expect(journal.states.get('quest-gather')!.status).toBe('completed');
  });

  it('a defeat on a failing encounter fails the active quest and clears tracking', () => {
    const { quests } = assembleWorld([errandQuest]);
    const journal = createQuestJournal(quests);
    acceptQuest(quests, journal, 'quest-errand');

    const update = applyQuestSignal(quests, journal, {
      type: 'encounter-defeat',
      encounterId: 'encounter-ambush',
    });
    expect(update.failedQuestIds).toEqual(['quest-errand']);
    expect(journal.states.get('quest-errand')!.status).toBe('failed');
    expect(journal.trackedQuestId).toBeNull();
  });

  it('abandoning an active quest records a terminal failure', () => {
    const { quests } = assembleWorld([errandQuest]);
    const journal = createQuestJournal(quests);
    acceptQuest(quests, journal, 'quest-errand');

    const result = abandonQuest(journal, 'quest-errand');
    expect(result.ok).toBe(true);
    expect(journal.states.get('quest-errand')!.status).toBe('failed');
    expect(journal.trackedQuestId).toBeNull();

    expect(abandonQuest(journal, 'quest-errand')).toMatchObject({ ok: false, reason: 'not-active' });
    expect(abandonQuest(journal, 'nope')).toMatchObject({ ok: false, reason: 'unknown-quest' });
  });

  it('accepting one exclusive branch fails its still-offered sibling', () => {
    const { quests } = assembleWorld([branchA, branchB]);
    const journal = createQuestJournal(quests);

    const result = acceptQuest(quests, journal, 'quest-branch-a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update.failedQuestIds).toEqual(['quest-branch-b']);
    expect(journal.states.get('quest-branch-a')!.status).toBe('active');
    expect(journal.states.get('quest-branch-b')!.status).toBe('failed');
  });
});
