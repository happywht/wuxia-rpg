import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCharacterState } from '../src/engine/character-progression';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { createInventoryState, resolveStartingItems } from '../src/engine/item-system';
import { createQuestJournal } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import {
  captureSaveSnapshot,
  parseSaveSnapshot,
  planSnapshotRestore,
  restoreRunState,
} from '../src/engine/save-system';
import {
  assembleWorldMap,
  parseWorldMap,
  selectNewRegionEventKnowledgeIds,
  selectTriggeredRandomRegionEvent,
  type RegionEventContext,
} from '../src/engine/world-map';
import { loadWorldData } from '../src/game/world-loader';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EAST_COAST_ID = 'map.round-82-east-coast';
const CLOUD_RIDGE_ID = 'map.round-74-cloud-ridge';
const OUTBOUND_GATE_ID = 'gate.r82-cloud-ridge-to-east-coast';
const RETURN_GATE_ID = 'gate.r82-east-coast-to-cloud-ridge';
const ARRIVAL_EVENT_ID = 'event.r90-arrival-blue-sail';
const RETURN_EVENT_ID = 'event.r90-return-cloud-ridge';
const TIDE_ORDER_NODE_ID = 'place.r89-safe-return-current';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as any;
}

function parsedMap(raw: unknown): GridMap {
  const result = parseGridMap(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.map;
}

const manifest = readJson('data/base/manifest.json') as {
  resources: Array<{ id: string; path: string; schema: string }>;
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parsedMap(readJson(`data/base/${resource.path}`)));
}
const worldRaw = readJson('data/base/world/world-map.json');
const validateWorldMapSchema = new Ajv().compile(readJson('data/schema/world-map.schema.json'));
const calendarResult = parseGameCalendar(readJson('data/base/worldview/calendar.json'));
if (!calendarResult.ok) throw new Error(calendarResult.errors.join('\n'));
const calendar = calendarResult.calendar;
const climateRaw = readJson('data/base/worldview/climate.json');
const climateTides = new Set<string>(
  (climateRaw.tideCycle?.phases ?? []).map(({ id }: { id: string }) => id),
);
const nodeResult = parseKnowledgeNodeSet(readJson('data/base/knowledge_graph/nodes.json'));
if (!nodeResult.ok) throw new Error(nodeResult.errors.join('\n'));
const nodes = new Map(nodeResult.data.nodes.map((node) => [node.id, node]));
const worldParse = parseWorldMap(worldRaw);
if (!worldParse.ok) throw new Error(worldParse.errors.join('\n'));
const assembledWorld = assembleWorldMap(worldParse.data, maps, {
  knowledgeNodeIds: new Set(nodes.keys()),
  periodIds: new Set(calendar.periods.map(({ id }) => id)),
  weatherIds: new Set(climateRaw.weathers.map(({ id }: { id: string }) => id)),
  tideIds: climateTides,
});
if ('ok' in assembledWorld) throw new Error(assembledWorld.errors.join('\n'));

const arrivalEvents = assembledWorld.randomEvents.filter((event) => event.trigger === 'regionArrival');
const legacyStepEvents = assembledWorld.randomEvents.filter((event) => event.trigger === undefined);

/** Player who finished the East Channel Echo quest and knows the tide order. */
const tideOrderContext: RegionEventContext = {
  knownKnowledgeNodeIds: new Set([TIDE_ORDER_NODE_ID]),
  periodId: null,
  weatherId: null,
};
const strangerContext: RegionEventContext = {
  knownKnowledgeNodeIds: new Set(),
  periodId: null,
  weatherId: null,
};

function failIfCalled(): number {
  throw new Error('no eligible event should roll');
}

afterEach(() => vi.restoreAllMocks());

describe('Round 90 cross-region arrival roaming events', () => {
  it('binds both tide-route encounters to the real gates and their true directions', () => {
    expect(assembledWorld.warnings).toEqual([]);
    expect(arrivalEvents.map(({ id }) => id)).toEqual([ARRIVAL_EVENT_ID, RETURN_EVENT_ID]);
    expect(legacyStepEvents.map(({ id }) => id)).toEqual([
      'event.r43-wayfarer-letter',
      'event.r44-dock-claim',
    ]);

    const arrival = assembledWorld.randomEvents.find(({ id }) => id === ARRIVAL_EVENT_ID)!;
    const returning = assembledWorld.randomEvents.find(({ id }) => id === RETURN_EVENT_ID)!;
    expect(arrival).toMatchObject({
      mapResourceId: EAST_COAST_ID,
      once: true,
      chance: 1,
      trigger: 'regionArrival',
      transitionIds: [OUTBOUND_GATE_ID],
    });
    expect(arrival.conditions?.knowledgeNodeIds).toEqual([TIDE_ORDER_NODE_ID]);
    expect(arrival.discoverKnowledgeNodeId).toBe(ARRIVAL_EVENT_ID);
    expect(returning).toMatchObject({
      mapResourceId: CLOUD_RIDGE_ID,
      once: true,
      chance: 1,
      trigger: 'regionArrival',
      transitionIds: [RETURN_GATE_ID],
    });
    expect(returning.conditions?.knowledgeNodeIds).toEqual([TIDE_ORDER_NODE_ID]);
    expect(returning.discoverKnowledgeNodeId).toBe(RETURN_EVENT_ID);

    // The gates must exist in the assembled world, land on walkable real-map
    // cells and actually travel towards each event's own map.
    const outbound = assembledWorld.transitions.find(({ id }) => id === OUTBOUND_GATE_ID)!;
    const returnGate = assembledWorld.transitions.find(({ id }) => id === RETURN_GATE_ID)!;
    expect(outbound.from.mapResourceId).toBe(CLOUD_RIDGE_ID);
    expect(outbound.to.mapResourceId).toBe(EAST_COAST_ID);
    expect(returnGate.from.mapResourceId).toBe(EAST_COAST_ID);
    expect(returnGate.to.mapResourceId).toBe(CLOUD_RIDGE_ID);
    const coast = maps.get(EAST_COAST_ID)!;
    const ridge = maps.get(CLOUD_RIDGE_ID)!;
    expect(ridge.canEnter(outbound.from.col, outbound.from.row)).toBe(true);
    expect(coast.canEnter(outbound.to.col, outbound.to.row)).toBe(true);
    expect(coast.canEnter(returnGate.from.col, returnGate.from.row)).toBe(true);
    expect(ridge.canEnter(returnGate.to.col, returnGate.to.row)).toBe(true);

    // Knowledge graph endpoints for both discoveries and their tide-order links.
    expect(nodes.get(ARRIVAL_EVENT_ID)?.title).toBe('潮序对汊');
    expect(nodes.get(RETURN_EVENT_ID)?.title).toBe('云海收汊');
    const edges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{
      id: string; fromId: string; toId: string; relation: string;
    }>;
    expect(edges.filter(({ fromId }) => fromId === ARRIVAL_EVENT_ID).map(({ toId }) => toId))
      .toEqual(expect.arrayContaining([EAST_COAST_ID, TIDE_ORDER_NODE_ID]));
    expect(edges.filter(({ fromId }) => fromId === RETURN_EVENT_ID).map(({ toId }) => toId))
      .toEqual(expect.arrayContaining([CLOUD_RIDGE_ID, TIDE_ORDER_NODE_ID]));
  });

  it('rejects step rows that declare arrival gates and isolates invalid arrival references', () => {
    expect(validateWorldMapSchema(worldRaw)).toBe(true);

    for (const trigger of [undefined, 'step', null]) {
      const invalidForSchema = structuredClone(worldRaw);
      invalidForSchema.randomEvents.push({
        ...invalidForSchema.randomEvents[0],
        id: `event.r90-step-gates-${String(trigger)}`,
        ...(trigger === undefined ? {} : { trigger }),
        transitionIds: [OUTBOUND_GATE_ID],
      });
      expect(validateWorldMapSchema(invalidForSchema)).toBe(false);
    }

    const misdeclared = structuredClone(worldRaw);
    misdeclared.randomEvents.push({
      ...misdeclared.randomEvents[0],
      id: 'event.r90-step-with-gates',
      transitionIds: [OUTBOUND_GATE_ID],
    });
    const rejected = parseWorldMap(misdeclared);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors.join('\n')).toContain('仅 regionArrival 触发可声明入境关口');

    const nullTrigger = structuredClone(worldRaw);
    nullTrigger.randomEvents.push({ ...nullTrigger.randomEvents[0], id: 'event.r90-null-trigger', trigger: null });
    expect(parseWorldMap(nullTrigger).ok).toBe(false);

    // Two broken rows: one gate id that exists nowhere, one real gate whose
    // destination map differs from the event's map.
    const raw = structuredClone(worldRaw);
    raw.randomEvents.push({
      ...raw.randomEvents.find((event: { id: string }) => event.id === ARRIVAL_EVENT_ID),
      id: 'event.r90-broken-missing-gate',
      transitionIds: ['gate.r90-does-not-exist'],
    });
    raw.randomEvents.push({
      ...raw.randomEvents.find((event: { id: string }) => event.id === ARRIVAL_EVENT_ID),
      id: 'event.r90-broken-wrong-destination',
      transitionIds: ['gate.r84-east-coast-to-windward-isle'],
    });
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const assembled = assembleWorldMap(parsed.data, maps, {
      knowledgeNodeIds: new Set(nodes.keys()),
      periodIds: new Set(calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climateRaw.weathers.map(({ id }: { id: string }) => id)),
      tideIds: climateTides,
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.randomEvents.map(({ id }) => id)).toEqual([
      'event.r43-wayfarer-letter',
      'event.r44-dock-claim',
      ARRIVAL_EVENT_ID,
      RETURN_EVENT_ID,
    ]);
    const joined = assembled.warnings.join('\n');
    expect(joined).toContain('event.r90-broken-missing-gate');
    expect(joined).toContain('入境关口未登记：gate.r90-does-not-exist');
    expect(joined).toContain('event.r90-broken-wrong-destination');
    expect(joined).toContain('通向的地图与事件地图不一致');
  });

  it('samples each arrival only through its own travel direction and keeps steps separate', () => {
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set(), tideOrderContext, () => 0, OUTBOUND_GATE_ID,
    )?.id).toBe(ARRIVAL_EVENT_ID);
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, CLOUD_RIDGE_ID, new Set(), tideOrderContext, () => 0, RETURN_GATE_ID,
    )?.id).toBe(RETURN_EVENT_ID);

    // Arrival cause filters by the travelled gate: querying the arrival map
    // with the opposite (return) gate id must find no candidate at all.
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set(), tideOrderContext, failIfCalled, RETURN_GATE_ID,
    )).toBeNull();
    // Another gate onto the same map (Windward Isle ferry) is a different
    // arrival source and must not fire the tide-route encounter.
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set(), tideOrderContext, failIfCalled,
      'gate.r84-windward-isle-to-east-coast',
    )).toBeNull();
    // Step cause never sees arrival rows, and arrival rows never roll on a
    // plain grid step — both maps stay silent without consulting randomness.
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set(), tideOrderContext, failIfCalled,
    )).toBeNull();
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, CLOUD_RIDGE_ID, new Set(), tideOrderContext, failIfCalled,
    )).toBeNull();

    // Legacy step rows keep their exact sampling behaviour: eligible on their
    // own map, selected from stable id order, then gated by authored chance.
    const stepContext: RegionEventContext = {
      knownKnowledgeNodeIds: new Set(['event.old-footprints', 'event.r43-wayfarer-letter']),
      periodId: 'period.dusk',
      weatherId: 'weather.rain',
      nearbyNpcIds: new Set(['char.shi-bei', 'char.bai-luzhou']),
    };
    const samples = [0.9, 0.1];
    expect(selectTriggeredRandomRegionEvent(
      legacyStepEvents, 'map.round-10-mist-ferry', new Set(), stepContext, () => samples.shift() ?? 0,
    )?.id).toBe('event.r44-dock-claim');
    expect(selectTriggeredRandomRegionEvent(
      legacyStepEvents, 'map.round-10-mist-ferry', new Set(), stepContext, failIfCalled, OUTBOUND_GATE_ID,
    )).toBeNull();
  });

  it('skips the roll when the tide order is unknown or the encounter is already seen', () => {
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set(), strangerContext, failIfCalled, OUTBOUND_GATE_ID,
    )).toBeNull();
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, CLOUD_RIDGE_ID, new Set(), strangerContext, failIfCalled, RETURN_GATE_ID,
    )).toBeNull();
    expect(selectTriggeredRandomRegionEvent(
      assembledWorld.randomEvents, EAST_COAST_ID, new Set([ARRIVAL_EVENT_ID]), tideOrderContext,
      failIfCalled, OUTBOUND_GATE_ID,
    )).toBeNull();

    const arrival = arrivalEvents.find(({ id }) => id === ARRIVAL_EVENT_ID)!;
    const graphEventNodes = new Set(arrivalEvents.map(({ id }) => id));
    expect(selectNewRegionEventKnowledgeIds([arrival], new Set(), graphEventNodes)).toEqual([ARRIVAL_EVENT_ID]);
    expect(selectNewRegionEventKnowledgeIds([arrival], new Set([ARRIVAL_EVENT_ID]), graphEventNodes)).toEqual([]);

    const springEvent = { id: 'event.r87-spring-hollow', discoverKnowledgeNodeId: 'place.r87-spring-hollow' };
    const springGraphNodes = new Set([springEvent.id, springEvent.discoverKnowledgeNodeId]);
    expect(selectNewRegionEventKnowledgeIds([springEvent], new Set(), springGraphNodes))
      .toEqual([springEvent.id, springEvent.discoverKnowledgeNodeId]);
    expect(selectNewRegionEventKnowledgeIds([springEvent], new Set([springEvent.discoverKnowledgeNodeId]), springGraphNodes))
      .toEqual([springEvent.id]);
    expect(selectNewRegionEventKnowledgeIds([springEvent], new Set(), new Set([springEvent.discoverKnowledgeNodeId])))
      .toEqual([springEvent.discoverKnowledgeNodeId]);
    expect(selectNewRegionEventKnowledgeIds([springEvent], new Set([springEvent.id, springEvent.discoverKnowledgeNodeId]), springGraphNodes))
      .toEqual([]);
  });

  it('round-trips one-shot arrivals and the pending return through a v1 save', { timeout: 20_000 }, async () => {
    const files = new Map<string, string>();
    const walk = (directory: string, prefix: string): void => {
      for (const name of readdirSync(directory)) {
        const absolute = path.join(directory, name);
        const relative = prefix === '' ? name : `${prefix}/${name}`;
        if (statSync(absolute).isDirectory()) walk(absolute, relative);
        else if (name.endsWith('.json')) {
          files.set(`/${relative.split(path.sep).join('/')}`, readFileSync(absolute, 'utf8'));
        }
      }
    };
    walk(path.join(repoRoot, 'data'), '');
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = files.get(new URL(rawUrl, 'http://round-90.test').pathname);
      return new Response(body ?? 'not found', {
        status: body === undefined ? 404 : 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const outcome = await loadWorldData();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const { world } = outcome;
      expect(world.optionalWarnings).toEqual([]);

      const profile = world.assembly.progression.profiles.get('char.scribe-apprentice')!;
      const coast = world.maps.get(EAST_COAST_ID)!;
      const arrivalGate = world.worldMap.transitions.find(({ id }) => id === OUTBOUND_GATE_ID)!;
      const character = createCharacterState(profile);
      const inventory = createInventoryState(profile, resolveStartingItems(profile, world.assembly.items).stacks);
      // Mid-journey save: the outbound encounter was seen on arrival, the
      // return encounter has not happened yet.
      const snapshot = captureSaveSnapshot({
        displayName: '潮路回访测试',
        mapResourceId: EAST_COAST_ID,
        playerCol: arrivalGate.to.col,
        playerRow: arrivalGate.to.row,
        character,
        inventory,
        shopStocks: new Map(),
        journal: createQuestJournal(world.assembly.quests),
        social: createSocialState(),
        completedEncounters: new Set(),
        completedRegionalEvents: new Set([ARRIVAL_EVENT_ID]),
        knownKnowledgeNodeIds: new Set([ARRIVAL_EVENT_ID, TIDE_ORDER_NODE_ID]),
        elapsedGameMinutes: 0,
        worldSeed: 90,
        factionMembership: null,
        now: () => new Date('2026-09-30T00:00:00.000Z'),
      });
      const parsedSnapshot = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown);
      expect(parsedSnapshot.ok).toBe(true);
      if (!parsedSnapshot.ok) return;

      const questObjectiveIds = new Map([...world.assembly.quests].map(([id, quest]) => [
        id, new Set(quest.objectives.map(({ id: objectiveId }) => objectiveId)),
      ]));
      const refs = {
        profileIds: new Set([profile.id]),
        profileRecords: new Map([[profile.id, profile]]),
        mapResourceId: world.mapResourceId,
        maps: new Map([...world.maps].map(([mapId, map]) => [mapId, {
          isWalkableCell: (col: number, row: number) => map.canEnter(col, row),
          isCellOccupied: () => false,
        }])),
        isWalkableCell: (col: number, row: number) => coast.canEnter(col, row),
        isCellOccupied: () => false,
        itemIds: new Set(world.assembly.items.keys()),
        itemRecords: world.assembly.items,
        martialArtIds: new Set(world.assembly.progression.martialArts.keys()),
        questIds: new Set(world.assembly.quests.keys()),
        questObjectiveIds,
        encounterIds: new Set(world.assembly.encounters.map(({ record }) => record.id)),
        shopIds: new Set(world.assembly.shops.keys()),
        shopRecords: world.assembly.shops,
        questRecords: world.assembly.quests,
        npcIds: new Set(world.assembly.npcs.map(({ record }) => record.id)),
        regionalEventIds: new Set([
          ...world.worldMap.events.map(({ id }) => id),
          ...world.worldMap.randomEvents.map(({ id }) => id),
        ]),
        knowledgeNodeIds: new Set(world.knowledgeGraph.nodes.keys()),
        defaultKnowledgeNodeIds: new Set([...world.knowledgeGraph.nodes.values()]
          .filter(({ knownByDefault }) => knownByDefault).map(({ id }) => id)),
        factionIds: new Set(world.assembly.progression.factions.keys()),
        factionMentorNpcIds: new Map([...world.assembly.progression.factions]
          .map(([id, faction]) => [id, new Set(faction.mentorNpcIds)])),
      };
      const plan = planSnapshotRestore(parsedSnapshot.snapshot, refs);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.warnings).toEqual([]);
      expect(plan.snapshot.completedRegionalEvents).toEqual([ARRIVAL_EVENT_ID]);
      expect(plan.snapshot.knownKnowledgeNodeIds).toEqual(expect.arrayContaining([
        ARRIVAL_EVENT_ID, TIDE_ORDER_NODE_ID,
      ]));

      const restored = restoreRunState({
        profile,
        items: world.assembly.items,
        quests: world.assembly.quests,
        shops: world.assembly.shops,
        snapshot: plan.snapshot,
      });
      const completed = new Set(restored.completedRegionalEvents);
      const restoredContext: RegionEventContext = {
        knownKnowledgeNodeIds: new Set(restored.knownKnowledgeNodeIds),
        periodId: null,
        weatherId: null,
      };
      // The seen one-shot does not replay on walking the gate again…
      expect(selectTriggeredRandomRegionEvent(
        world.worldMap.randomEvents, EAST_COAST_ID, completed, restoredContext, failIfCalled, OUTBOUND_GATE_ID,
      )).toBeNull();
      // …while the pending return encounter still fires on the way back.
      expect(selectTriggeredRandomRegionEvent(
        world.worldMap.randomEvents, CLOUD_RIDGE_ID, completed, restoredContext, () => 0, RETURN_GATE_ID,
      )?.id).toBe(RETURN_EVENT_ID);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
      vi.unstubAllGlobals();
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
