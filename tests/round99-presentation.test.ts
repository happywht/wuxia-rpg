import { describe, expect, it } from 'vitest';
import { wrapDialogueText, paginateDialogueLines, dialogueConfirmAction } from '../src/game/dialogue-layout';
import { orderQuestRows, nearestGuideNpc } from '../src/game/quest-presentation';
import { createQuestJournal, type QuestData } from '../src/engine/quest-system';
const measure = (text: string) => Array.from(text).reduce((sum, char) => sum + (/[^\x00-\x7f]/u.test(char) ? 14 : 7), 0);
describe('Round99 readable dialogue', () => {
  it('wraps Chinese without dropping text', () => {
    const text = '纸墨线索指向渡口。'.repeat(80);
    const lines = wrapDialogueText(text, 140, measure);
    expect(lines.join('')).toBe(text);
    expect(lines.every(line => measure(line) <= 140)).toBe(true);
    expect(paginateDialogueLines(lines, 5).length).toBeGreaterThan(1);
  });
  it('preserves mixed scripts and authored newlines', () => {
    const text = '渡口 NPC abc-def 123\n下一页';
    expect(wrapDialogueText(text, 500, measure).join('\n')).toBe(text);
  });
  it('does not split combining marks or emoji graphemes', () => {
    const lines = wrapDialogueText('é👨‍👩‍👧‍👦甲乙', 14, measure);
    expect(lines).toContain('é');
    expect(lines).toContain('👨‍👩‍👧‍👦');
    expect(lines.join('')).toBe('é👨‍👩‍👧‍👦甲乙');
  });
  it('larger measured font yields more pages, still retaining every character', () => {
    const text = '渡口线索'.repeat(30);
    const small = wrapDialogueText(text, 140, measure);
    const large = wrapDialogueText(text, 140, value => measure(value) * 1.5);
    expect(large.length).toBeGreaterThan(small.length);
    expect(large.join('')).toBe(text);
  });
  it('requires reading remaining body and option pages before confirmation', () => {
    expect(dialogueConfirmAction(0, 3, 0, 2)).toBe('body');
    expect(dialogueConfirmAction(2, 3, 0, 2)).toBe('option');
    expect(dialogueConfirmAction(2, 3, 1, 2)).toBe('confirm');
    expect(dialogueConfirmAction(0, 1, 0, 1)).toBe('confirm');
  });
  it('empty input and invalid capacity still produce readable pages', () => {
    expect(paginateDialogueLines([], 0)).toEqual(['']);
    expect(paginateDialogueLines(['甲','乙'], 0)).toEqual(['甲','乙']);
  });
});
describe('Round99 journal priority', () => {
  it('puts tracked/active tasks first without mutating authored order', () => {
    const quests = ['remote','first','tracked','locked','done'].map(id => ({ id } as QuestData));
    const map = new Map(quests.map(q => [q.id, {...q, prerequisiteQuestIds: [], objectives: [], failOnEncounterIds: [], rewards: {experience:0,currency:0}} as QuestData]));
    const journal = createQuestJournal(map);
    journal.states.get('first')!.status = 'active';
    journal.states.get('tracked')!.status = 'active';
    journal.states.get('locked')!.status = 'locked';
    journal.states.get('done')!.status = 'completed';
    journal.trackedQuestId = 'tracked';
    expect(orderQuestRows(quests, journal).map(q => q.id)).toEqual(['tracked','first','remote','locked','done']);
    expect(quests[0]!.id).toBe('remote');
  });
});

it('nearby guide uses loaded NPC data, excludes non-givers and handles empty worlds', () => {
  const npcs = [{ col:0,row:0,record:{name:'闲客'} }, {col:4,row:0,record:{name:'甲',questGiver:true}}, {col:2,row:0,record:{name:'乙',questGiver:true}}];
  expect(nearestGuideNpc(npcs,{col:0,row:0})?.record.name).toBe('乙');
  expect(nearestGuideNpc([],{col:0,row:0})).toBeUndefined();
});
