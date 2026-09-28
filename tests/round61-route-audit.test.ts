import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell, type GridPathSurface } from '../src/engine/grid-path';
import { assembleShops, indexItems, parseItemSet, parseShopSet } from '../src/engine/item-system';
import { parseNpcSet } from '../src/engine/npc-placement';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { parseQuestSet } from '../src/engine/quest-system';
import { parseBattleEncounterSet, type PlacedEncounter } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { findWorldTravelRoute } from '../src/engine/world-travel';
import type { WorldMapAssembly } from '../src/engine/world-map';
import type { CellPosition } from '../src/engine/grid-map';

const STARTING_MAP = 'map.round-01-grid';
const ROUND_58_QUEST_IDS = [
  'quest.r58-market-discovery',
  'quest.r58-market-stall-pact',
  'quest.r58-market-toll-squabble',
  'quest.r58-south-hamlet-survey',
  'quest.r58-south-hamlet-supply',
  'quest.r58-pond-bandit-camp',
] as const;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

function blockedMap(map: GridMap, occupied: ReadonlySet<string>): GridPathSurface {
  return {
    columns: map.columns,
    rows: map.rows,
    inBounds: (col, row) => map.inBounds(col, row),
    canEnter: (col, row) => map.canEnter(col, row) && !occupied.has(`${col},${row}`),
  };
}

function measureRoute(
  world: WorldMapAssembly,
  maps: ReadonlyMap<string, GridMap>,
  blockedByMap: ReadonlyMap<string, ReadonlySet<string>>,
  fromMapResourceId: string,
  start: CellPosition,
  toMapResourceId: string,
  target: CellPosition,
  approachRadius: number,
): { steps: number; stop: CellPosition } | null {
  const route = findWorldTravelRoute(world, fromMapResourceId, toMapResourceId);
  if (route === null) return null;
  let mapResourceId = fromMapResourceId;
  let position = start;
  let steps = 0;

  for (const leg of route.legs) {
    const map = maps.get(mapResourceId);
    if (map === undefined) return null;
    const path = findGridPathToAdjacentCell(
      blockedMap(map, blockedByMap.get(mapResourceId) ?? new Set()),
      position,
      leg.transition.from,
    );
    if (path === null) return null;
    steps += path.length - 1;
    mapResourceId = leg.transition.to.mapResourceId;
    position = { col: leg.transition.to.col, row: leg.transition.to.row };
  }

  const map = maps.get(toMapResourceId);
  if (map === undefined) return null;
  const surface = blockedMap(map, blockedByMap.get(toMapResourceId) ?? new Set());
  const path = approachRadius === 1
    ? findGridPathToAdjacentCell(surface, position, target)
    : findGridPath(surface, position, target, { approachRadius });
  if (path === null) return null;
  steps += path.length - 1;
  return { steps, stop: path.at(-1)! };
}

describe('Round 61 route audit against authored R58 routes', () => {
  it('finds a playable, occupancy-aware route for each objective in every authored time period', () => {
    const maps = new Map([
      [STARTING_MAP, loadMap('../data/base/maps/round-01-grid.json')],
      ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    ]);
    const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
    const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const encounterParsed = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    if (!worldParsed.ok) throw new Error(worldParsed.errors.join('\n'));
    if (!questParsed.ok) throw new Error(questParsed.errors.join('\n'));
    if (!npcParsed.ok) throw new Error(npcParsed.errors.join('\n'));
    if (!encounterParsed.ok) throw new Error(encounterParsed.errors.join('\n'));
    if (!calendarParsed.ok) throw new Error(calendarParsed.errors.join('\n'));

    const world = assembleWorldMap(worldParsed.data, maps);
    if ('ok' in world) throw new Error(world.errors.join('\n'));
    const regionEntryByMap = new Map<string, CellPosition>([
      [world.data.startingMapResourceId, maps.get(world.data.startingMapResourceId)!.playerStart],
    ]);
    for (const transition of world.transitions) {
      if (!regionEntryByMap.has(transition.to.mapResourceId)) {
        regionEntryByMap.set(transition.to.mapResourceId, {
          col: transition.to.col,
          row: transition.to.row,
        });
      }
    }
    const encounterRecords = encounterParsed.set.encounters;
    const encounters = encounterRecords.map((record) => ({
      record,
      col: record.position.col,
      row: record.position.row,
      // Target resolution only reads the validated encounter record and its
      // authored cell. Combat profile/art resolution is covered by data audit.
      profile: {} as PlacedEncounter['profile'],
      enemyArts: [],
    })) satisfies PlacedEncounter[];
    const baseNpcs = npcParsed.set.npcs.map((record) => ({
      record,
      col: record.position.col,
      row: record.position.row,
    }));
    // Round 64: collect objectives now resolve to a stocked seller, so the
    // audit assembles the real shops the same way the world loader does.
    const itemParsed = parseItemSet(readJson('../data/base/items/round-06-items.json'));
    if (!itemParsed.ok) throw new Error(itemParsed.errors.join('\n'));
    const shopParsed = parseShopSet(readJson('../data/base/shops/round-06-shops.json'));
    if (!shopParsed.ok) throw new Error(shopParsed.errors.join('\n'));
    const shopAssembly = assembleShops({
      shopSet: shopParsed.set,
      placedNpcIds: new Set(baseNpcs.map((npc) => npc.record.id)),
      items: indexItems(itemParsed.set).byId,
    });
    expect(shopAssembly.warnings).toEqual([]);
    const mapsById = new Map(maps);
    const encounterCellsByMap = new Map<string, ReadonlySet<string>>();
    for (const mapId of maps.keys()) {
      encounterCellsByMap.set(mapId, new Set(encounterRecords
        .filter((record) => record.mapResourceId === mapId)
        .map((record) => `${record.position.col},${record.position.row}`)));
    }
    const schedule = compileNpcSchedules({
      npcs: baseNpcs,
      periods: calendarParsed.calendar.periods,
      maps: mapsById,
      blockedCellsByMap: encounterCellsByMap,
    });
    const quests = new Map(questParsed.set.quests.map((quest) => [quest.id, quest]));
    const questRouteRecords = new Map<string, { periodId: string; giver: number; objective: number; total: number }[]>();
    let auditedRoutes = 0;

    for (const period of calendarParsed.calendar.periods) {
      const periodNpcs = schedule.placementsByPeriod.get(period.id) ?? baseNpcs;
      const npcCellsByMap = new Map<string, Set<string>>();
      for (const npc of periodNpcs) {
        const cells = npcCellsByMap.get(npc.record.mapResourceId) ?? new Set<string>();
        cells.add(`${npc.col},${npc.row}`);
        npcCellsByMap.set(npc.record.mapResourceId, cells);
      }
      const occupiedByMap = new Map<string, ReadonlySet<string>>();
      for (const mapId of maps.keys()) {
        occupiedByMap.set(mapId, new Set([
          ...(npcCellsByMap.get(mapId) ?? []),
          ...(encounterCellsByMap.get(mapId) ?? []),
        ]));
      }
      // The live placement resolver moves an NPC away from the cell the player
      // is entering; model that same guarantee for region starts and gates.
      for (const [mapId, entry] of regionEntryByMap) {
        (occupiedByMap.get(mapId) as Set<string> | undefined)?.delete(`${entry.col},${entry.row}`);
      }
      for (const transition of world.transitions) {
        (occupiedByMap.get(transition.to.mapResourceId) as Set<string> | undefined)
          ?.delete(`${transition.to.col},${transition.to.row}`);
      }

      for (const questId of ROUND_58_QUEST_IDS) {
        const quest = quests.get(questId);
        expect(quest, `missing ${questId}`).toBeDefined();
        if (quest === undefined) continue;
        const giver = periodNpcs.find((npc) => npc.record.id === quest.giverNpcId);
        expect(giver, `${questId} giver missing in ${period.id}`).toBeDefined();
        if (giver === undefined) continue;
        const giverMap = maps.get(giver.record.mapResourceId);
        expect(giverMap, `${questId} giver map missing`).toBeDefined();
        if (giverMap === undefined) continue;
        const journal = {
          trackedQuestId: questId,
          states: new Map(questParsed.set.quests.map((record) => [record.id, {
            questId: record.id,
            status: record.id === questId ? 'active' as const : 'locked' as const,
            objectiveCounts: new Map(record.objectives.map((objective) => [objective.id, 0])),
          }])),
        };
        const resolution = resolveQuestNavigationTarget({
          quests,
          journal,
          questId,
          worldMap: world,
          baseNpcs,
          periodNpcs,
          encounters,
          shops: shopAssembly.shops,
        });
        expect(resolution.status, `${questId} should resolve a spatial goal in ${period.id}`).toBe('target');
        if (resolution.status !== 'target') continue;
        const target = resolution.target;
        const regionEntry = regionEntryByMap.get(giver.record.mapResourceId);
        expect(regionEntry, `${questId} region entry must exist`).toBeDefined();
        if (regionEntry === undefined) continue;
        const blockedByMap = occupiedByMap;
        const giverRoute = measureRoute(
          world,
          maps,
          blockedByMap,
          giver.record.mapResourceId,
          regionEntry,
          giver.record.mapResourceId,
          { col: giver.col, row: giver.row },
          1,
        );
        if (giverRoute === null) {
          console.info(`Unreachable giver ${questId}/${period.id} at ${giver.record.id} (${giver.col},${giver.row}) from region entry.`);
        }
        expect(giverRoute, `${questId} giver must be reachable from its region entry in ${period.id}`).not.toBeNull();
        if (giverRoute === null) continue;
        const objectiveRoute = measureRoute(
          world,
          maps,
          blockedByMap,
          giver.record.mapResourceId,
          giverRoute.stop,
          target.mapResourceId,
          target,
          target.approachRadius,
        );
        expect(objectiveRoute, `${questId} objective must be reachable from its giver in ${period.id}`).not.toBeNull();
        if (objectiveRoute === null) continue;
        const totalSteps = giverRoute.steps + objectiveRoute.steps;
        auditedRoutes += 1;
        const records = questRouteRecords.get(questId) ?? [];
        records.push({
          periodId: period.id,
          giver: giverRoute.steps,
          objective: objectiveRoute.steps,
          total: totalSteps,
        });
        questRouteRecords.set(questId, records);
      }
    }

    expect(auditedRoutes).toBe(ROUND_58_QUEST_IDS.length * calendarParsed.calendar.periods.length);
    const ranges = ROUND_58_QUEST_IDS.map((questId) => {
      const records = questRouteRecords.get(questId) ?? [];
      const distances = records.map((record) => record.total);
      return [questId, Math.min(...distances), Math.max(...distances)];
    });
    expect(ranges).toEqual([
      ['quest.r58-market-discovery', 121, 123],
      // Round 64: the stall-pact leather goal now routes to the assembled
      // peddler shop on Jiangnan instead of skipping to the later talk goal.
      ['quest.r58-market-stall-pact', 62, 64],
      ['quest.r58-market-toll-squabble', 123, 123],
      ['quest.r58-south-hamlet-survey', 69, 73],
      ['quest.r58-south-hamlet-supply', 3, 4],
      ['quest.r58-pond-bandit-camp', 71, 73],
    ]);
  });
});
