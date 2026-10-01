import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ClimateRuntime, parseClimate } from '../src/engine/climate-system';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { findGridPath } from '../src/engine/grid-path';
import { parseGridMap } from '../src/engine/grid-map';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import {
  parseWorldMap,
  regionEventConditionsMet,
  selectInteractableRegionEvent,
} from '../src/engine/world-map';

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const CALENDAR_RAW = readJson('data/base/worldview/calendar.json');
const CLIMATE_RAW = readJson('data/base/worldview/climate.json');
const MAP_RAW = readJson('data/base/maps/round-87-southwest-isles.json');
const NPC_RAW = readJson('data/base/characters/round-87-southwest-isles-npcs.json');
const WORLD_RAW = readJson('data/base/world/world-map.json');
const QUEST_RAW = readJson('data/base/quests/round-87-southwest-isle-quests.json');
const KNOWLEDGE_RAW = readJson('data/base/knowledge_graph/nodes.json');

const MAP_ID = 'map.round-87-southwest-isles';
const KEEPER_ID = 'char.r87-ao-wanqing';
const QUEST_ID = 'quest.r87-fog-pilot-ledger';
const ISLE_NODE_ID = 'place.r87-southwest-isles';
const SIGNAL_NODE_ID = 'place.r87-mist-signal';
const HARBOR_NODE_ID = 'place.r87-spring-hollow';

const calendarResult = parseGameCalendar(CALENDAR_RAW);
if (!calendarResult.ok) throw new Error(calendarResult.errors.join('\n'));
const calendar = calendarResult.calendar;

function requireClimate(raw: unknown = CLIMATE_RAW) {
  const result = parseClimate(raw, calendar);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.climate;
}

describe('Round 88 mist weather and watch schedule', () => {
  it('parses procedural fog while preserving old rain/snow climate resources', () => {
    const climate = requireClimate();
    const mist = climate.weathers.find(({ id }) => id === 'weather.mist');
    expect(mist?.precipitation).toEqual({ kind: 'fog', density: 0.38 });
    expect(climate.weathers.find(({ id }) => id === 'weather.rain')?.precipitation?.kind).toBe('rain');
    expect(climate.weathers.find(({ id }) => id === 'weather.snow')?.precipitation?.kind).toBe('snow');

    const legacy = structuredClone(CLIMATE_RAW);
    // This fixture represents pre-mist data, before regional profiles existed.
    delete legacy.regionalWeatherProfiles;
    legacy.weathers = legacy.weathers.filter(({ id }: { id: string }) => id !== 'weather.mist');
    for (const season of legacy.seasons) {
      season.weatherWeights = season.weatherWeights.filter(
        ({ weatherId }: { weatherId: string }) => weatherId !== 'weather.mist',
      );
    }
    const oldResult = parseClimate(legacy, calendar);
    expect(oldResult.ok).toBe(true);
    if (oldResult.ok) expect(oldResult.climate.weathers.some(({ id }) => id === 'weather.mist')).toBe(false);
  });

  it('rejects unknown particle styles and density outside the protocol range', () => {
    const unknownStyle = structuredClone(CLIMATE_RAW);
    unknownStyle.weathers.find(({ id }: { id: string }) => id === 'weather.mist').precipitation.kind = 'steam';
    const styleResult = parseClimate(unknownStyle, calendar);
    expect(styleResult.ok).toBe(false);
    if (!styleResult.ok) expect(styleResult.errors.join('\n')).toContain('rain/snow/fog');

    const badDensity = structuredClone(CLIMATE_RAW);
    badDensity.weathers.find(({ id }: { id: string }) => id === 'weather.mist').precipitation.density = 1.01;
    const densityResult = parseClimate(badDensity, calendar);
    expect(densityResult.ok).toBe(false);
    if (!densityResult.ok) expect(densityResult.errors.join('\n')).toContain('density');
  });

  it('draws the same weather for the same seed and game date, including mist', () => {
    const runtime = new ClimateRuntime(requireClimate(), calendar);
    const stamp = { year: 1, monthIndex: 0, day: 1, minuteOfDay: 480 };
    const mistSeed = Array.from({ length: 10_000 }, (_, seed) => seed)
      .find((seed) => runtime.weatherForDay(seed, stamp).id === 'weather.mist');
    expect(mistSeed).toBeDefined();
    const first = runtime.weatherForDay(mistSeed!, stamp);
    const second = runtime.weatherForDay(mistSeed!, { ...stamp, minuteOfDay: 1200 });
    expect(first.id).toBe('weather.mist');
    expect(second).toEqual(first);
    expect(runtime.weatherForDay(mistSeed!, { ...stamp, day: 2 }).id).toBeDefined();
  });

  it('places the keeper at reachable, collision-free cells across every calendar period', () => {
    const npcResult = parseNpcSet(NPC_RAW);
    const mapResult = parseGridMap(MAP_RAW);
    expect(npcResult.ok && mapResult.ok).toBe(true);
    if (!npcResult.ok || !mapResult.ok) return;

    const keeper = npcResult.set.npcs.find(({ id }) => id === KEEPER_ID)!;
    expect(keeper.schedule).toHaveLength(calendar.periods.length);
    expect(new Set(keeper.schedule.map(({ periodId }) => periodId))).toEqual(
      new Set(calendar.periods.map(({ id }) => id)),
    );
    const baseNpc: PlacedNpc = {
      record: keeper,
      col: keeper.position.col,
      row: keeper.position.row,
    };
    const compiled = compileNpcSchedules({
      npcs: [baseNpc],
      periods: calendar.periods,
      maps: new Map([[MAP_ID, mapResult.map]]),
    });
    expect(compiled.warnings).toEqual([]);
    for (const period of calendar.periods) {
      const placed = compiled.placementsByPeriod.get(period.id)?.[0];
      expect(placed, period.id).toBeDefined();
      expect(mapResult.map.canEnter(placed!.col, placed!.row), period.id).toBe(true);
      expect(findGridPath(mapResult.map, mapResult.map.playerStart, placed!), period.id).not.toBeNull();
    }
    const dawnKeeper = compiled.placementsByPeriod.get('period.dawn')?.[0];
    expect(dawnKeeper).toMatchObject({ col: 80, row: 36 });
    expect(mapResult.map.canEnter(79, 36)).toBe(true);
  });

  it('requires all authored mist, period and adjacent-keeper conditions for the signal', () => {
    const worldResult = parseWorldMap(WORLD_RAW);
    const mapResult = parseGridMap(MAP_RAW);
    expect(worldResult.ok && mapResult.ok).toBe(true);
    if (!worldResult.ok || !mapResult.ok) return;
    const signal = worldResult.data.events.find(({ id }) => id === 'event.r87-mist-signal')!;
    const context = (periodId: string | null, weatherId: string | null, withKeeper: boolean) => ({
      knownKnowledgeNodeIds: new Set<string>(),
      periodId,
      weatherId,
      nearbyNpcIds: new Set(withKeeper ? [KEEPER_ID] : []),
    });
    const player = { mapResourceId: MAP_ID, col: 79, row: 36 };
    const select = (eventContext: ReturnType<typeof context>, done = new Set<string>()) =>
      selectInteractableRegionEvent(
        worldResult.data.events,
        player,
        done,
        eventContext,
        (col, row) => mapResult.map.canEnter(col, row),
      );

    expect(regionEventConditionsMet(signal, context('period.dawn', 'weather.mist', true))).toBe(true);
    expect(select(context('period.dawn', 'weather.mist', true))?.event.id).toBe(signal.id);
    expect(select(context('period.morning', 'weather.mist', true))?.event.id).toBe(signal.id);
    expect(select(context('period.dawn', 'weather.clear', true))).toBeNull();
    expect(select(context('period.midday', 'weather.mist', true))).toBeNull();
    expect(select(context('period.dawn', 'weather.mist', false))).toBeNull();
    expect(select(context(null, 'weather.mist', true))).toBeNull();
    expect(select(context('period.dawn', null, true))).toBeNull();
    expect(select(context('period.dawn', 'weather.mist', true), new Set([signal.id]))).toBeNull();
  });

  it('keeps the original cross-region quest stages and settles the signal only after the gate opens', () => {
    const npcResult = parseNpcSet(NPC_RAW);
    const questResult = parseQuestSet(QUEST_RAW);
    const knowledgeResult = parseKnowledgeNodeSet(KNOWLEDGE_RAW);
    expect(npcResult.ok && questResult.ok && knowledgeResult.ok).toBe(true);
    if (!npcResult.ok || !questResult.ok || !knowledgeResult.ok) return;
    const knowledgeIds = new Set(knowledgeResult.data.nodes.map(({ id }) => id));
    const quests = assembleQuests({
      questSet: questResult.set,
      questGiverNpcIds: new Set(['char.r87-meng-haizhou']),
      npcIds: new Set(npcResult.set.npcs.map(({ id }) => id)),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds: knowledgeIds,
    });
    expect(quests.warnings).toEqual([]);
    const quest = quests.quests.get(QUEST_ID)!;
    expect(quest.objectives.map(({ targetId }) => targetId)).toEqual([
      ISLE_NODE_ID, SIGNAL_NODE_ID, 'char.r87-meng-haizhou',
    ]);
    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    expect(applyQuestSignal(quests.quests, journal, {
      type: 'knowledge-discovery', nodeId: ISLE_NODE_ID,
    }).completed).toEqual([]);
    expect(applyQuestSignal(quests.quests, journal, {
      type: 'knowledge-discovery', nodeId: SIGNAL_NODE_ID,
    }).completed).toEqual([]);
    const completed = applyQuestSignal(quests.quests, journal, {
      type: 'npc-talk', npcId: 'char.r87-meng-haizhou',
    });
    expect(completed.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(completed.completed[0]?.discoverKnowledgeNodeIds).toContain(HARBOR_NODE_ID);
  });
});
