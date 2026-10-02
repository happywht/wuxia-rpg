import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { assembleDialogueReferences } from '../src/engine/dialogue-runtime';
import { onceDialogueBattleDispatch, preflightDialogueBattle, type DialogueBattleReadiness } from '../src/engine/dialogue-battle-request';
import { applyDialogueEffects, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createQuestJournal } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';

function runtime(battleReadiness = ready()): DialogueRuntimeContext {
  return { quests: new Map(), journal: createQuestJournal(new Map()), items: new Map(), inventory: null,
    social: createSocialState(), speakerNpcId: 'npc.test', knownKnowledgeNodeIds: new Set(), knowledgeNodes: new Map(),
    character: null, factions: new Map(), martialArts: new Map(), factionState: createFactionMembershipState(),
    timeOfDayPeriodId: '', dialogueVariables: new Map(), battleReadiness };
}

function ready(overrides: Partial<DialogueBattleReadiness> = {}): DialogueBattleReadiness {
  return {
    currentMapResourceId: 'map.test',
    targets: new Map([['enc.test', { id: 'enc.test', mapResourceId: 'map.test', repeatable: false }]]),
    completedEncounterIds: new Set(), characterReady: true, panelReady: true,
    ...overrides,
  };
}
describe('Round148 dialogue battle preflight', () => {
  it('consumes a dispatch before re-entry and duplicate calls', () => {
    let calls = 0;
    const dispatch = onceDialogueBattleDispatch(() => { calls += 1; dispatch(); });
    dispatch(); dispatch();
    expect(calls).toBe(1);
  });
  it('does not retry a consumed callback if its host throws', () => {
    let calls = 0;
    const dispatch = onceDialogueBattleDispatch(() => { calls += 1; throw new Error('host failed'); });
    expect(dispatch).toThrow('host failed');
    dispatch();
    expect(calls).toBe(1);
  });
  it('accepts a live local encounter without mutating completion state', () => {
    const context = ready();
    expect(preflightDialogueBattle('enc.test', context)).toEqual({ ok: true, encounterId: 'enc.test' });
    expect(context.completedEncounterIds.size).toBe(0);
  });
  it.each([
    undefined,
    ready({ targets: new Map() }),
    ready({ currentMapResourceId: 'map.other' }),
    ready({ characterReady: false }),
    ready({ panelReady: false }),
    ready({ completedEncounterIds: new Set(['enc.test']) }),
  ])('refuses an unavailable or completed encounter with readable feedback', context => {
    const result = preflightDialogueBattle('enc.test', context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });
  it('allows an authored repeatable challenge after completion', () => {
    const context = ready({
      targets: new Map([['enc.test', { id: 'enc.test', mapResourceId: 'map.test', repeatable: true }]]),
      completedEncounterIds: new Set(['enc.test']),
    });
    expect(preflightDialogueBattle('enc.test', context).ok).toBe(true);
  });
});

describe('Round148 transaction external action boundaries', () => {
  it('returns one request after committing successful state effects', () => {
    const context = runtime();
    const result = applyDialogueEffects([{ kind: 'setVariable', key: 'test.choice', value: true },
      { kind: 'startBattle', encounterId: 'enc.test' }], context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary.battleRequest).toEqual({ encounterId: 'enc.test' });
    expect(context.dialogueVariables?.get('test.choice')).toBe(true);
  });
  it('rolls back prior variables and reputation when battle preflight refuses', () => {
    const context = runtime(ready({ panelReady: false }));
    const before = context.social.renown;
    const result = applyDialogueEffects([{ kind: 'setVariable', key: 'test.choice', value: true },
      { kind: 'adjustRenown', delta: 3 }, { kind: 'startBattle', encounterId: 'enc.test' }], context);
    expect(result.ok).toBe(false);
    expect(context.dialogueVariables?.size).toBe(0);
    expect(context.social.renown).toBe(before);
  });
  it('does not publish the request or state when a later effect fails', () => {
    const context = runtime();
    const result = applyDialogueEffects([{ kind: 'startBattle', encounterId: 'enc.test' },
      { kind: 'setVariable', key: 'test.choice', value: true },
      { kind: 'takeItem', itemId: 'item.missing', quantity: 1 }], context);
    expect(result.ok).toBe(false);
    expect(context.dialogueVariables?.size).toBe(0);
  });
  it('rejects two requested battles before state mutation', () => {
    const context = runtime();
    expect(applyDialogueEffects([{ kind: 'setVariable', key: 'test.choice', value: true },
      { kind: 'startBattle', encounterId: 'enc.test' }, { kind: 'startBattle', encounterId: 'enc.test' }], context).ok).toBe(false);
    expect(context.dialogueVariables?.size).toBe(0);
  });
});

describe('Round148 dialogue battle authoring', () => {
  const schema = JSON.parse(readFileSync(new URL('../data/schema/dialogue-set.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv({ strict: false }).compile(schema);
  function document(effect: unknown) {
    return { conversations: [{ id: 'dlg.test', startNodeId: 'start', nodes: [
      { id: 'start', text: '挑战', options: [{ text: '开始', nextNodeId: 'end', effects: [effect] }] },
      { id: 'end', text: '结束' },
    ] }] };
  }
  it('accepts the effect in Schema and graph parser', () => {
    const source = document({ kind: 'startBattle', encounterId: 'enc.test' });
    expect(validate(source)).toBe(true);
    expect(parseDialogueSet(source).ok).toBe(true);
  });
  it.each([{ kind: 'startBattle' }, { kind: 'startBattle', encounterId: '' },
    { kind: 'startBattle', encounterId: 'x'.repeat(65) },
    { kind: 'startBattle', encounterId: 'enc.test', extra: true }])('rejects malformed effects consistently', effect => {
    expect(validate(document(effect))).toBe(false);
    const parsed = parseDialogueSet(document(effect));
    if (parsed.ok) {
      const options = parsed.set.conversations.flatMap(entry => entry.nodes.flatMap(node => node.options ?? []));
      expect(options).toHaveLength(0);
    }
  });
  it('drops only the dangling option and accepts resolved encounters', () => {
    const parsed = parseDialogueSet(document({ kind: 'startBattle', encounterId: 'enc.test' }));
    if (!parsed.ok) throw new Error('fixture rejected');
    const base = { conversations: new Map(parsed.set.conversations.map(entry => [entry.id, entry])),
      quests: new Map(), items: new Map(), placedNpcIds: new Set<string>(), knowledgeNodeIds: new Set<string>(),
      factionIds: new Set<string>(), martialArtIds: new Set<string>(), timeOfDayPeriodIds: new Set<string>() };
    const absent = assembleDialogueReferences(base);
    expect(absent.warnings).toHaveLength(1);
    expect(absent.conversations.get('dlg.test')?.nodes[0]?.options).toHaveLength(0);
    const present = assembleDialogueReferences({ ...base, encounterIds: new Set(['enc.test']) });
    expect(present.warnings).toHaveLength(0);
    expect(present.conversations.get('dlg.test')?.nodes[0]?.options).toHaveLength(1);
  });
});
