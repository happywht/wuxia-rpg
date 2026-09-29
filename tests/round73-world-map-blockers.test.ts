import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GameClock, parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { assembleNpcPlacements, parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { compileNpcSchedules, resolveNpcPlacementsForPlayer } from '../src/engine/npc-schedule';
import { parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { resolveCellNavigationGuide } from '../src/engine/world-navigation-guidance';

const MAP_PATHS = [
  '../data/base/maps/round-01-grid.json',
  '../data/base/maps/round-10-mist-ferry.json',
  '../data/base/maps/round-62-iron-ridge.json',
  '../data/base/maps/round-67-salt-road.json',
] as const;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('Round 73 world-map live occupancy', () => {
  it('reroutes around the scheduled live NPC that blocked the ferry return route at midnight', () => {
    const maps = new Map(MAP_PATHS.map((path) => {
      const map = loadMap(path);
      return [map.data.id, map] as const;
    }));
    const ferry = maps.get('map.round-10-mist-ferry');
    if (ferry === undefined) throw new Error('mist-ferry map is missing');

    const worldResult = parseWorldMap(readJson('../data/base/world/world-map.json'));
    if (!worldResult.ok) throw new Error(worldResult.errors.join('\n'));
    const world = assembleWorldMap(worldResult.data, maps);
    if ('ok' in world) throw new Error(world.errors.join('\n'));

    const npcResult = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    if (!npcResult.ok) throw new Error(npcResult.errors.join('\n'));
    const baseNpcs: PlacedNpc[] = [];
    for (const mapId of maps.keys()) {
      const placement = assembleNpcPlacements({
        npcSet: npcResult.set,
        knownResourceIds: new Set(maps.keys()),
        maps,
        currentMapResourceId: mapId,
        dialogueIds: new Set(npcResult.set.npcs.map(({ dialogueId }) => dialogueId)),
      });
      expect(placement.warnings).toEqual([]);
      baseNpcs.push(...placement.npcs);
    }

    const calendarResult = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    if (!calendarResult.ok) throw new Error(calendarResult.errors.join('\n'));
    // The browser repro was day 2 at 00:44, 1,004 minutes after the 08:00 start.
    const clock = new GameClock(calendarResult.calendar, 1_004);
    expect(clock.snapshot()).toMatchObject({ day: 2, minuteOfDay: 44 });
    expect(clock.currentPeriod().id).toBe('period.midnight');

    const encountersResult = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    if (!encountersResult.ok) throw new Error(encountersResult.errors.join('\n'));
    const ferryEncounterCells = new Set(encountersResult.set.encounters
      .filter(({ mapResourceId }) => mapResourceId === ferry.data.id)
      .map(({ position }) => `${position.col},${position.row}`));
    const schedule = compileNpcSchedules({
      npcs: baseNpcs,
      periods: calendarResult.calendar.periods,
      maps,
      blockedCellsByMap: new Map([[ferry.data.id, ferryEncounterCells]]),
    });
    expect(schedule.warnings).toEqual([]);

    const player = { col: 5, row: 4 };
    const occupancyForPeriod = (periodId: string) => {
      const periodNpcs = schedule.placementsByPeriod.get(periodId) ?? baseNpcs;
      const liveNpcs = resolveNpcPlacementsForPlayer({
        baseNpcs,
        periodNpcs,
        mapResourceId: ferry.data.id,
        map: ferry,
        playerPosition: player,
        blockedCells: ferryEncounterCells,
      });
      return {
        liveNpcs,
        blockerCells: new Set([
          ...liveNpcs.map(({ col, row }) => `${col},${row}`),
          ...ferryEncounterCells,
        ]),
      };
    };
    const midnight = occupancyForPeriod(clock.currentPeriod().id);
    expect(midnight.blockerCells.has('4,4')).toBe(true);
    expect(midnight.blockerCells.has('3,4')).toBe(false);
    expect(midnight.liveNpcs.find(({ record }) => record.id === 'char.bai-luzhou'))
      .toMatchObject({ col: 4, row: 4 });

    const gate = {
      mapResourceId: ferry.data.id,
      col: 2,
      row: 4,
      name: '回望石阶',
      approachRadius: 1,
    };
    const staticGuide = resolveCellNavigationGuide(world, ferry.data.id, gate, ferry, player);
    expect(staticGuide.status).toBe('en-route');
    if (staticGuide.status !== 'en-route') throw new Error('expected the static map route');
    expect(staticGuide.path).toEqual([player, { col: 4, row: 4 }, { col: 3, row: 4 }]);

    const liveGuide = resolveCellNavigationGuide(
      world, ferry.data.id, gate, ferry, player, midnight.blockerCells,
    );
    expect(liveGuide.status).toBe('en-route');
    if (liveGuide.status !== 'en-route') throw new Error('expected a dynamic-NPC detour');
    expect(liveGuide.path).not.toContainEqual({ col: 4, row: 4 });
    expect(liveGuide.path.length).toBeGreaterThan(staticGuide.path.length);
    for (const cell of liveGuide.path) {
      expect(midnight.blockerCells.has(`${cell.col},${cell.row}`)).toBe(false);
    }
    expect(ferry.canEnter(4, 4)).toBe(true); // The blocker is dynamic; authored terrain stays unchanged.

    // On a later dusk opening the same NPC's schedule moves her to (3,4).
    // A fresh map open must use that slot rather than retaining midnight cells.
    const duskClock = new GameClock(calendarResult.calendar, 2_025); // Day 2 at 17:45.
    expect(duskClock.snapshot()).toMatchObject({ day: 2, minuteOfDay: 1_065 });
    expect(duskClock.currentPeriod().id).toBe('period.dusk');
    const dusk = occupancyForPeriod(duskClock.currentPeriod().id);
    expect(dusk.blockerCells.has('3,4')).toBe(true);
    expect(dusk.blockerCells.has('4,4')).toBe(false);
    expect(dusk.liveNpcs.find(({ record }) => record.id === 'char.bai-luzhou'))
      .toMatchObject({ col: 3, row: 4 });
    const duskGuide = resolveCellNavigationGuide(
      world, ferry.data.id, gate, ferry, player, dusk.blockerCells,
    );
    expect(duskGuide.status).toBe('en-route');
    if (duskGuide.status !== 'en-route') throw new Error('expected a route using the dusk NPC placement');
    expect(duskGuide.path).not.toContainEqual({ col: 3, row: 4 });
    for (const cell of duskGuide.path) {
      expect(dusk.blockerCells.has(`${cell.col},${cell.row}`)).toBe(false);
    }
  });
});
