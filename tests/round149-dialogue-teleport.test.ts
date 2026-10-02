import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { parseDialogueSet, type DialogueEffectData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, assembleDialogueReferences, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { preflightDialogueTeleport, isDialogueLandingOccupied, type DialogueTeleportReadiness, type DialogueTeleportRequest } from '../src/engine/dialogue-teleport-request';
import { createQuestJournal } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { addBookshopEscort, patchBookshopEscortRaw, escortNode, escortArrived, escortOption } from '../scripts/lib/round149-bookshop-escort.mjs';
import { parseGridMap } from '../src/engine/grid-map';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const target: DialogueTeleportRequest = { mapResourceId: 'map.test', col: 2, row: 5, travelMinutes: 120 };
const effect: DialogueEffectData = { kind: 'teleport', ...target };
const readiness = (): DialogueTeleportReadiness => ({ canEnter: (id, col, row) => id === 'map.test' && col === 2 && row === 5, landingBlocked: () => false, characterReady: true, panelReady: true });
function runtime(): DialogueRuntimeContext {
  return { quests: new Map(), journal: createQuestJournal(new Map()), items: new Map(), inventory: null,
    social: createSocialState(), speakerNpcId: 'npc.test', knownKnowledgeNodeIds: new Set(), knowledgeNodes: new Map(),
    character: null, factions: new Map(), martialArts: new Map(), factionState: createFactionMembershipState(),
    timeOfDayPeriodId: '', dialogueVariables: new Map(), teleportReadiness: readiness() };
}
const document = (value: unknown) => ({ conversations: [{ id: 'dlg.test', startNodeId: 'greet', nodes: [
  { id: 'greet', text: 'fixture', options: [{ text: 'travel', nextNodeId: 'done', effects: [value] }] }, { id: 'done', text: 'done' },
] }] });

describe('Round149 teleport protocol and preflight', () => {
  const validate = new Ajv({ strict: false }).compile(read('data/schema/dialogue-set.schema.json'));
  it('accepts the exact protocol in Schema, parser and preflight', () => {
    expect(validate(document(effect))).toBe(true);
    expect(parseDialogueSet(document(effect)).ok).toBe(true);
    expect(preflightDialogueTeleport(target, readiness())).toEqual({ ok: true });
  });
  it.each([
    { ...effect, col: -1 }, { ...effect, row: 4096 }, { ...effect, col: 1.5 }, { ...effect, row: '5' },
    { ...effect, travelMinutes: -1 }, { ...effect, travelMinutes: 10081 }, { ...effect, travelMinutes: 0.5 },
    { ...effect, mapResourceId: '' }, { ...effect, mapResourceId: 'x'.repeat(65) }, { ...effect, extra: true },
    { kind: 'teleport', mapResourceId: 'map.test', col: 2, row: 5 },
  ])('rejects malformed effects without retaining their option', invalid => {
    expect(validate(document(invalid))).toBe(false);
    const parsed = parseDialogueSet(document(invalid));
    if (parsed.ok) expect(parsed.set.conversations.flatMap(c => c.nodes.flatMap(n => n.options ?? []))).toHaveLength(0);
  });
  it('refuses absent context, invalid runtime requests, character and panel problems', () => {
    expect(preflightDialogueTeleport(target, undefined).ok).toBe(false);
    expect(preflightDialogueTeleport({ ...target, col: Infinity }, readiness()).ok).toBe(false);
    for (const key of ['characterReady', 'panelReady'] as const) expect(preflightDialogueTeleport(target, { ...readiness(), [key]: false }).ok).toBe(false);
  });
  it('checks walkability and passes arrival time and staged companion to host', () => {
    expect(preflightDialogueTeleport({ ...target, mapResourceId: 'map.missing' }, readiness()).ok).toBe(false);
    const blocked = vi.fn(() => true);
    expect(preflightDialogueTeleport(target, { ...readiness(), landingBlocked: blocked }, 'companion.test').ok).toBe(false);
    expect(blocked).toHaveBeenCalledWith(target, 'companion.test');
  });
  it('isolates only the bad reference option; valid terrain is retained', () => {
    const parsed = parseDialogueSet(document(effect));
    if (!parsed.ok) throw Error('fixture rejected');
    const base = { conversations: new Map(parsed.set.conversations.map(c => [c.id, c])), quests: new Map(), items: new Map(), placedNpcIds: new Set<string>(), knowledgeNodeIds: new Set<string>(), factionIds: new Set<string>(), martialArtIds: new Set<string>(), timeOfDayPeriodIds: new Set<string>() };
    expect(assembleDialogueReferences(base).warnings).toHaveLength(1);
    const assembled = assembleDialogueReferences({ ...base, isTeleportDestinationWalkable: readiness().canEnter });
    expect(assembled.warnings).toHaveLength(0);
    expect(assembled.conversations.get('dlg.test')?.nodes[0]?.options).toHaveLength(1);
    expect(parsed.set.conversations[0]?.nodes[0]?.options).toHaveLength(1);
  });
});

describe('Round149 arrival occupancy', () => {
  const empty = () => ({ npcs: [], activeCompanionNpcId: null, encounters: [], completedEncounterIds: new Set<string>(), markers: [] });
  it('allows clear cells and ignores occupants on another map', () => {
    expect(isDialogueLandingOccupied(target, empty())).toBe(false);
    expect(isDialogueLandingOccupied(target, { ...empty(), markers: [{ ...target, mapResourceId: 'map.other' }] })).toBe(false);
  });
  it('scheduled NPC blocks unless it is the current companion', () => {
    const state = { ...empty(), npcs: [{ ...target, id: 'npc.test' }] };
    expect(isDialogueLandingOccupied(target, state)).toBe(true);
    expect(isDialogueLandingOccupied(target, { ...state, activeCompanionNpcId: 'npc.test' })).toBe(false);
  });
  it('completed one-shot challenge is free; repeatable and active challenges block', () => {
    const state = { ...empty(), encounters: [{ ...target, id: 'enc.test', repeatable: false }] };
    expect(isDialogueLandingOccupied(target, state)).toBe(true);
    expect(isDialogueLandingOccupied(target, { ...state, completedEncounterIds: new Set(['enc.test']) })).toBe(false);
    expect(isDialogueLandingOccupied(target, { ...state, encounters: [{ ...target, id: 'enc.test', repeatable: true }], completedEncounterIds: new Set(['enc.test']) })).toBe(true);
  });
  it('facility, gate and ending marker cells block landing', () => {
    expect(isDialogueLandingOccupied(target, { ...empty(), markers: [target] })).toBe(true);
    expect(isDialogueLandingOccupied(target, { ...empty(), markers: [{ ...target, row: 4 }] })).toBe(false);
  });
});

describe('Round149 external-action transaction', () => {
  it('returns a single request only after committing ordinary effects', () => {
    const ctx = runtime();
    const result = applyDialogueEffects([{ kind: 'setVariable', key: 'test.journey', value: true }, effect], ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    expect(result.summary.teleportRequest).toEqual(target);
    expect(result.summary.battleRequest).toBeUndefined();
    expect(ctx.dialogueVariables?.get('test.journey')).toBe(true);
  });
  it('rolls back earlier variable and renown changes on blocked landing', () => {
    const ctx = runtime(); ctx.teleportReadiness!.landingBlocked = () => true;
    expect(applyDialogueEffects([{ kind: 'setVariable', key: 'test.journey', value: true }, { kind: 'adjustRenown', delta: 3 }, effect], ctx).ok).toBe(false);
    expect(ctx.dialogueVariables?.size).toBe(0); expect(ctx.social.renown).toBe(0);
  });
  it('discards request and state when a later item effect fails', () => {
    const ctx = runtime();
    expect(applyDialogueEffects([effect, { kind: 'setVariable', key: 'test.journey', value: true }, { kind: 'takeItem', itemId: 'item.missing', quantity: 1 }], ctx).ok).toBe(false);
    expect(ctx.dialogueVariables?.size).toBe(0);
  });
  it.each(([ [effect, effect], [effect, { kind: 'startBattle', encounterId: 'enc.test' }], [{ kind: 'startBattle', encounterId: 'enc.test' }, effect] ] as DialogueEffectData[][]).map(actions => ({ actions })))('refuses multiple external actions before any mutation', ({ actions }) => {
    const ctx = runtime();
    expect(applyDialogueEffects([{ kind: 'setVariable', key: 'test.journey', value: true }, ...actions], ctx).ok).toBe(false);
    expect(ctx.dialogueVariables?.size).toBe(0);
  });
  it('rechecks the final staged context before committing', () => {
    const ctx = runtime(); let checks = 0;
    ctx.teleportReadiness!.landingBlocked = () => ++checks === 2;
    expect(applyDialogueEffects([effect, { kind: 'adjustRenown', delta: 3 }], ctx).ok).toBe(false);
    expect(ctx.social.renown).toBe(0); expect(checks).toBe(2);
  });
  it('uses staged companion dismissal and rolls it back when the destination becomes occupied', () => {
    const ctx = runtime(); ctx.companionState = { activeCompanionId: 'companion.test' };
    ctx.teleportReadiness!.landingBlocked = (_request, companionId) => companionId === null;
    expect(applyDialogueEffects([effect, { kind: 'dismissCompanion' }], ctx).ok).toBe(false);
    expect(ctx.companionState.activeCompanionId).toBe('companion.test');
  });
});

describe('Round149 bookshop author layer', () => {
  const original = readFileSync('data/base/dialogues/round-03-conversations.json', 'utf8');
  const current = () => read('data/base/dialogues/round-03-conversations.json').conversations.find((c: { id: string }) => c.id === 'dlg.shen-mohan-bookshop');
  it('matches shipped nodes, defaults to cancellation and retains existing order', () => {
    const c = current();
    expect(c.nodes.find((n: { id: string }) => n.id === escortNode.id)).toEqual(escortNode);
    expect(c.nodes.find((n: { id: string }) => n.id === escortArrived.id)).toEqual(escortArrived);
    expect(c.nodes.find((n: { id: string }) => n.id === c.startNodeId).options.at(-1)).toEqual(escortOption);
    expect(escortNode.options?.[0]?.effects).toBeUndefined();
    expect(escortNode.options?.[0]?.nextNodeId).toBe('greet');
    expect(addBookshopEscort(structuredClone(c))).toEqual(c);
    expect(patchBookshopEscortRaw(original)).toBe(original);
  });
  it('regenerates only its exact nodes/option and refuses altered author content', () => {
    const c = current(), before = structuredClone(c);
    before.nodes = before.nodes.filter((n: { id: string }) => ![escortNode.id, escortArrived.id].includes(n.id));
    for (const node of before.nodes) if (node.options) node.options = node.options.filter((o: { nextNodeId: string }) => o.nextNodeId !== escortNode.id);
    expect(addBookshopEscort(before)).toEqual(c);
    const altered = structuredClone(c); altered.nodes.find((n: { id: string }) => n.id === escortNode.id).text += 'changed';
    expect(() => addBookshopEscort(altered)).toThrow('拒绝覆盖');
    const unrelated = { id: 'dlg.other', startNodeId: 'greet', nodes: [{ id: 'greet', text: 'unchanged' }] };
    expect(addBookshopEscort(unrelated)).toEqual(unrelated);
  });
  it('declares a walkable existing map landing away from the gate', () => {
    const parsed = parseGridMap(read('data/base/maps/round-10-mist-ferry.json'));
    if (!parsed.ok) throw Error(parsed.errors.join('\n'));
    const map = parsed.map;
    expect(map.canEnter(2, 5)).toBe(true);
    const world = read('data/base/world/world-map.json');
    expect(world.transitions.some((t: { from: { mapResourceId: string; col: number; row: number } }) => t.from.mapResourceId === 'map.round-10-mist-ferry' && t.from.col === 2 && t.from.row === 5)).toBe(false);
  });
  it('raw writer adds exactly its layer and then preserves every byte on repeat', () => {
    const data = JSON.parse(original), talk = data.conversations.find((c: { id: string }) => c.id === 'dlg.shen-mohan-bookshop');
    talk.nodes = talk.nodes.filter((n: { id: string }) => ![escortNode.id, escortArrived.id].includes(n.id));
    const greet = talk.nodes.find((n: { id: string }) => n.id === talk.startNodeId);
    greet.options = greet.options.filter((o: { nextNodeId: string }) => o.nextNodeId !== escortNode.id);
    const raw = JSON.stringify(data, null, 2) + '\n';
    const patched = patchBookshopEscortRaw(raw);
    expect(JSON.parse(patched)).toEqual(JSON.parse(original));
    expect(patchBookshopEscortRaw(patched)).toBe(patched);
    expect(patched).toContain('dlg.shen-mohan.news-asked');
  });
  it('raw writer refuses partial author layers before any output is returned', () => {
    const data = JSON.parse(original), talk = data.conversations.find((c: { id: string }) => c.id === 'dlg.shen-mohan-bookshop');
    talk.nodes = talk.nodes.filter((n: { id: string }) => n.id !== escortArrived.id);
    expect(() => patchBookshopEscortRaw(JSON.stringify(data, null, 2))).toThrow('不完整');
  });
});
