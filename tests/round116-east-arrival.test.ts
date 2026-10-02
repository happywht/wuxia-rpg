import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { assembleWorldMap, parseWorldMap, selectTriggeredRegionEvents, type RegionEventContext, type RegionEventData, type WorldMapData } from '../src/engine/world-map';
import { parseGridMap } from '../src/engine/grid-map';
import { acceptQuest, applyQuestSignal, createQuestJournal, parseQuestSet, reconcileQuestFacts } from '../src/engine/quest-system';
import { repairEastArrival } from '../scripts/lib/round116-east-arrival.mjs';
import { deepenSeaDialogues, PILOT_COST_HINT } from '../scripts/lib/round102-sea-content.mjs';
import type { DialogueData } from '../src/engine/dialogue-graph';

const EVENT = 'event.r94-east-arrival', GATE = 'gate.r94-terrace-to-east', QUEST = 'quest.r94-snowline-signal';
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const authored = read('data/base/world/world-map.json') as Pick<WorldMapData, 'events' | 'transitions'> & { atlasArt: unknown };
const parsed = parseWorldMap(authored);
if (!parsed.ok) throw Error(parsed.errors.join('\n'));
const world = parsed.data;
const context: RegionEventContext = { knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null };
const landing = world.transitions.find(gate => gate.id === GATE)!.to;
const event = world.events.find(row => row.id === EVENT)!;
function run() {
  const parsed = parseQuestSet(read('data/base/quests/round-94-frontiers-quests.json'));
  if (!parsed.ok) throw Error(parsed.errors.join('\n'));
  const quest = parsed.set.quests.find(quest => quest.id === QUEST)!;
  const quests = new Map([[quest.id, quest]]);
  return { quest, quests, journal: createQuestJournal(quests) };
}

describe('Round116 actual eastern entry discovery', () => {
  it('fires at the actual gate landing before any walk toward a scheduled NPC', () => {
    expect([event.col, event.row]).toEqual([6, 50]);
    expect(event.arrivalTransitionIds).toEqual([GATE]);
    expect(landing).toEqual({ mapResourceId: 'map.round-94-east-gate', col: 3, row: 50 });
    const map = parseGridMap(read('data/base/maps/round-94-east-gate.json'));
    if (!map.ok) throw Error(map.errors.join('\n'));
    expect(map.map.canEnter(landing.col, landing.row)).toBe(true);
    expect(selectTriggeredRegionEvents(world.events, landing, new Set(), context, GATE).map(row => row.id)).toContain(EVENT);
    expect(event.discoverKnowledgeNodeId).toBe('place.r94-east-gate');
  });
  it('preserves the old woodland step point without treating startup or a refused gate as an arrival', () => {
    expect(selectTriggeredRegionEvents(world.events, { ...landing, col: 6 }, new Set(), context).map(row => row.id)).toContain(EVENT);
    expect(selectTriggeredRegionEvents(world.events, landing, new Set(), context).map(row => row.id)).not.toContain(EVENT);
    expect(selectTriggeredRegionEvents(world.events, landing, new Set(), context, 'gate.unrelated').map(row => row.id)).not.toContain(EVENT);
    expect(selectTriggeredRegionEvents(world.events, { ...landing, mapResourceId: 'map.other' }, new Set(), context, GATE).map(row => row.id)).not.toContain(EVENT);
  });
  it('respects persisted one-shot completion even after moving the authoring coordinate', () => {
    expect(event.once).toBe(true);
    expect(selectTriggeredRegionEvents(world.events, landing, new Set([EVENT]), context, GATE).map(row => row.id)).not.toContain(EVENT);
  });
  it('backfills entry knowledge on later acceptance without inventing investigation or report', () => {
    const r = run(), known = new Set([event.discoverKnowledgeNodeId!]);
    expect(acceptQuest(r.quests, r.journal, QUEST, new Map(), { knownKnowledgeNodeIds: known }).ok).toBe(true);
    const state = r.journal.states.get(QUEST)!;
    expect(r.quest.objectives.map(o => state.objectiveCounts.get(o.id))).toEqual([1, 0, 0]);
    expect(state.status).toBe('active');
    expect(applyQuestSignal(r.quests, r.journal, { type: 'npc-talk', npcId: r.quest.giverNpcId }).completed).toHaveLength(0);
    expect(state.objectiveCounts.get(r.quest.objectives[2]!.id)).toBe(0);
  });
  it('reconciles older active knowledge while preserving ordered stage and reward boundaries', () => {
    const r = run();
    acceptQuest(r.quests, r.journal, QUEST);
    reconcileQuestFacts(r.quests, r.journal, { knownKnowledgeNodeIds: new Set(['place.r94-east-gate']) });
    const state = r.journal.states.get(QUEST)!;
    expect(r.quest.objectives.map(o => state.objectiveCounts.get(o.id))).toEqual([1, 0, 0]);
    expect(applyQuestSignal(r.quests, r.journal, { type: 'knowledge-discovery', nodeId: 'place.r94-east-beacon' }).completed).toHaveLength(0);
    expect(applyQuestSignal(r.quests, r.journal, { type: 'npc-talk', npcId: r.quest.giverNpcId }).completed).toHaveLength(1);
    expect(applyQuestSignal(r.quests, r.journal, { type: 'npc-talk', npcId: r.quest.giverNpcId }).completed).toHaveLength(0);
  });
  it('repairs an older authoring coordinate idempotently without mutating input or unrelated world content', () => {
    const old = structuredClone(authored);
    delete old.events.find(row => row.id === EVENT)!.arrivalTransitionIds;
    const repaired = repairEastArrival(old);
    expect(repaired).toEqual(authored);
    expect(repairEastArrival(repaired)).toEqual(repaired);
    expect(old.events.find(row => row.id === EVENT)!.arrivalTransitionIds).toBeUndefined();
    expect(repaired.transitions).toEqual(old.transitions);
    expect(repaired.atlasArt).toEqual(old.atlasArt);
    expect(repaired.events.filter(row => row.id !== EVENT)).toEqual(old.events.filter(row => row.id !== EVENT));
  });
  it('refuses missing, duplicated or mismatched authoring references', () => {
    for (const cause of ['missing', 'duplicate', 'map', 'interaction'] as const) {
      const bad = structuredClone(authored);
      if (cause === 'missing') bad.events = bad.events.filter(row => row.id !== EVENT);
      if (cause === 'duplicate') bad.events.push(structuredClone(event));
      if (cause === 'map') bad.transitions.find(gate => gate.id === GATE)!.to.mapResourceId = 'map.other';
      if (cause === 'interaction') bad.events.find(row => row.id === EVENT)!.interaction = { prompt: 'changed' };
      expect(() => repairEastArrival(bad), cause).toThrow();
    }
  });
  it('keeps generation source and runtime actual map-switch event delivery aligned', () => {
    expect(readFileSync('scripts/generate-round94-frontiers.mjs', 'utf8')).toContain("arrivalTransitionIds: ['gate.r94-terrace-to-east']");
    const scene = readFileSync('src/game/grid-scene.ts', 'utf8');
    expect(scene).toContain('this.arriveAtMap(transition.to.mapResourceId, transition.to.col, transition.to.row, travelMinutes, arrivalPeriodId, transition.id)');
    expect(scene).toContain("this.triggerRegionEvents('', false, arrivalTransitionId)");
  });
});

const schema = new Ajv({ allErrors: true }).compile(read('data/schema/world-map.schema.json') as object);
function smallWorld(arrivalTransitionIds: unknown = ['gate.a-b']) {
  return { id: 'world.test', startingMapResourceId: 'map.a',
    regions: ['map.a', 'map.b'].map(mapResourceId => ({ mapResourceId, name: mapResourceId, description: 'test', atlasPosition: { x: 0, y: 0 } })),
    transitions: [{ id: 'gate.a-b', name: 'gate', from: { mapResourceId: 'map.a', col: 0, row: 0 }, to: { mapResourceId: 'map.b', col: 0, row: 0 } }],
    landmarks: [], randomEvents: [],
    events: [{ id: 'event.entry', mapResourceId: 'map.b', col: 1, row: 1, text: 'entry', once: true, arrivalTransitionIds }],
  };
}
describe('Round116 optional fixed-event arrival protocol', () => {
  it('publishes actionable pilot costs from the authoring source without changing branch conditions or effects', () => {
    const raw = read('data/base/dialogues/round-97-lanxin-reef-conversations.json') as { conversations: DialogueData[] };
    const choice = raw.conversations.find(d => d.id === 'dlg.r97-ji-wuchao')!.nodes.find(n => n.id === 'r102-pilot-choice')!;
    expect(choice.text).toBe(PILOT_COST_HINT);
    expect(choice.text).toContain('厚蚌壳片2片');
    expect(choice.text).toContain('清心丸1份');
    expect(choice.text).toContain('青帆埠金云帆');
    const generated = deepenSeaDialogues(structuredClone(raw)).conversations.find(d => d.id === 'dlg.r97-ji-wuchao')!.nodes.find(n => n.id === choice.id)!;
    expect(generated.text).toBe(choice.text);
    expect(generated.options).toEqual(choice.options);
    const shops = read('data/base/shops/round-83-east-coast-shops.json') as { shops: { npcId: string; stock: { itemId: string; quantity: number }[] }[] };
    expect(shops.shops.find(s => s.npcId === 'char.r83-jin-yunfan')!.stock.find(s => s.itemId === 'item.r32.clam-shell')!.quantity).toBeGreaterThanOrEqual(2);
  });
  it('accepts the new field in both Schema and parser, preserving old MOD omission', () => {
    const raw = smallWorld();
    expect(schema(raw)).toBe(true);
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    delete (raw.events[0] as Partial<typeof raw.events[0]>).arrivalTransitionIds;
    expect(schema(raw)).toBe(true);
    const legacy = parseWorldMap(raw);
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      expect(legacy.data.events[0]!.arrivalTransitionIds).toBeUndefined();
      expect(selectTriggeredRegionEvents(legacy.data.events, { mapResourceId: 'map.b', col: 0, row: 0 }, new Set(), context, 'gate.a-b')).toHaveLength(0);
    }
  });
  it.each([[], ['gate.a-b', 'gate.a-b'], [''], [4], 'gate.a-b', Array.from({ length: 65 }, (_, i) => `gate.${i}`)])('rejects malformed arrival list %j', list => {
    const raw = smallWorld(list);
    expect(schema(raw)).toBe(false);
    expect(parseWorldMap(raw).ok).toBe(false);
  });
  it('rejects simultaneous E inspection and arrival triggers in both Schema and parser', () => {
    const raw = smallWorld();
    Object.assign(raw.events[0]!, { interaction: { prompt: 'inspect' } });
    expect(schema(raw)).toBe(false);
    expect(parseWorldMap(raw).ok).toBe(false);
  });
  it.each(['missing', 'wrong-map', 'invalid-gate'])('isolates a fixed event referencing %s without disabling the world', problem => {
    const raw = smallWorld();
    if (problem === 'missing') raw.events[0]!.arrivalTransitionIds = ['gate.missing'];
    if (problem === 'wrong-map') raw.transitions[0]!.to.mapResourceId = 'map.a';
    if (problem === 'invalid-gate') raw.transitions[0]!.to.col = 99;
    const p = parseWorldMap(raw);
    if (!p.ok) throw Error(p.errors.join('\n'));
    const map = parseGridMap({ id: 'map.test', name: 'test', tileSize: 16, columns: 2, rows: 2, tileTypes: { '.': { color: '#000000', solid: false } }, grid: ['..', '..'], playerStart: { col: 0, row: 0 } });
    if (!map.ok) throw Error(map.errors.join('\n'));
    const result = assembleWorldMap(p.data, new Map([['map.a', map.map], ['map.b', map.map]]));
    if ('ok' in result) throw Error(result.errors.join('\n'));
    expect(result.regions).toHaveLength(2);
    expect(result.events).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('event.entry') && w.includes('入境关口'))).toBe(true);
  });
  it('applies ordinary weather, knowledge and once conditions to real gate arrivals', () => {
    const guarded: RegionEventData = { ...event, conditions: { weatherIds: ['weather.snow'], knowledgeNodeIds: ['knowledge.ready'], periodIds: ['period.night'], tideIds: ['tide.low'], nearbyNpcIds: ['npc.ready'] } };
    expect(selectTriggeredRegionEvents([guarded], landing, new Set(), context, GATE)).toHaveLength(0);
    const ready: RegionEventContext = { ...context, weatherId: 'weather.snow', knownKnowledgeNodeIds: new Set(['knowledge.ready']), periodId: 'period.night', tideId: 'tide.low', nearbyNpcIds: new Set(['npc.ready']) };
    expect(selectTriggeredRegionEvents([guarded], landing, new Set(), ready, GATE)).toHaveLength(1);
    for (const missing of [
      { ...ready, weatherId: null }, { ...ready, knownKnowledgeNodeIds: new Set<string>() },
      { ...ready, periodId: null }, { ...ready, tideId: null }, { ...ready, nearbyNpcIds: new Set<string>() },
    ]) expect(selectTriggeredRegionEvents([guarded], landing, new Set(), missing, GATE)).toHaveLength(0);
    expect(selectTriggeredRegionEvents([guarded], landing, new Set([EVENT]), ready, GATE)).toHaveLength(0);
  });
});
