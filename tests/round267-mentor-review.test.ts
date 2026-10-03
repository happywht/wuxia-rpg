import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acceptQuest, applyQuestSignal, createQuestJournal, parseQuestSet } from '../src/engine/quest-system';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../data/base/${path}`, import.meta.url), 'utf8'));
const parsed = parseQuestSet(read('quests/round-07-quests.json'));
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const quests = new Map(parsed.set.quests.map((quest) => [quest.id, quest]));

describe('Round267 师门勘验双NPC任务链', () => {
  it('only completes after both named witnesses are actually spoken to and leaves route branches offered', () => {
    const quest = quests.get('quest.r31-mentor-review');
    const escort = quests.get('quest.r31-guard-the-caravan');
    const pier = quests.get('quest.r31-mend-the-pier');
    expect(quest).toBeDefined();
    expect(escort?.exclusiveGroupId).toBeTruthy();
    expect(escort?.exclusiveGroupId).toBe(pier?.exclusiveGroupId);
    expect(quest?.exclusiveGroupId).toBeUndefined();
    expect(quest?.objectives.map(({ targetId }) => targetId)).toEqual(['char.rong-su-qing', 'char.wen-suxin']);

    const journal = createQuestJournal(quests);
    journal.states.get('quest.r31-caravan-provisioning')!.status = 'completed';
    // Mirror the live unlocked checkpoint after the caravan preparation chain.
    journal.states.get(quest!.id)!.status = 'offered';
    journal.states.get(escort!.id)!.status = 'offered';
    journal.states.get(pier!.id)!.status = 'offered';
    expect(journal.states.get(quest!.id)?.status).toBe('offered');
    expect(journal.states.get(escort!.id)?.status).toBe('offered');
    expect(journal.states.get(pier!.id)?.status).toBe('offered');
    expect(acceptQuest(quests, journal, quest!.id).ok).toBe(true);

    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.ye-tingzhou' });
    expect(journal.states.get(quest!.id)?.objectiveCounts.get('objective.r31-review-herbalist')).toBe(0);
    expect(journal.states.get(quest!.id)?.objectiveCounts.get('objective.r31-review-escort')).toBe(0);

    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.rong-su-qing' });
    expect(journal.states.get(quest!.id)?.status).toBe('active');
    expect(journal.states.get(quest!.id)?.objectiveCounts.get('objective.r31-review-herbalist')).toBe(1);
    expect(journal.states.get(quest!.id)?.objectiveCounts.get('objective.r31-review-escort')).toBe(0);

    const completed = applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.wen-suxin' });
    expect(journal.states.get(quest!.id)?.status).toBe('completed');
    expect(journal.states.get(quest!.id)?.objectiveCounts.get('objective.r31-review-escort')).toBe(1);
    expect(completed.completed.map((reward) => reward.questId)).toContain(quest!.id);
    expect(journal.states.get(escort!.id)?.status).toBe('offered');
    expect(journal.states.get(pier!.id)?.status).toBe('offered');
  });
});
