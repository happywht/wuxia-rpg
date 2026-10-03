import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { compileNpcSchedules, resolveNpcPlacementsForPlayer } from '../src/engine/npc-schedule';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseNpcSet } from '../src/engine/npc-placement';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import {
  arrivalActionHint,
  resolveCellNavigationGuide,
  resolveWorldNavigationGuide,
} from '../src/engine/world-navigation-guidance';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string) {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

function makeWorld() {
  const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const maps = new Map([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
  ]);
  const assembled = assembleWorldMap(parsed.data, maps);
  if ('ok' in assembled) throw new Error(assembled.errors.join('\n'));
  return { worldMap: assembled, maps };
}

describe('cross-region landmark guidance', () => {
  it('rebuilds the local player route from the live scheduled NPC cells after a step', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-01-grid')!;
    const npcsParsed = parseNpcSet(JSON.parse(readFileSync(new URL('../data/base/characters/round-03-npcs.json', import.meta.url), 'utf8')));
    if (!npcsParsed.ok) throw new Error(npcsParsed.errors.join('\n'));
    const calendarParsed = parseGameCalendar(JSON.parse(readFileSync(new URL('../data/base/worldview/calendar.json', import.meta.url), 'utf8')));
    if (!calendarParsed.ok) throw new Error(calendarParsed.errors.join('\n'));
    const compiled = compileNpcSchedules({
      npcs: npcsParsed.set.npcs.map(record => ({ record, col: record.position.col, row: record.position.row })), periods: calendarParsed.calendar.periods,
      maps: world.maps,
    });
    const live = resolveNpcPlacementsForPlayer({
      baseNpcs: npcsParsed.set.npcs.map(record => ({ record, col: record.position.col, row: record.position.row })),
      periodNpcs: compiled.placementsByPeriod.get('period.midday')!,
      mapResourceId: map.data.id, map, playerPosition: { col: 44, row: 32 },
    });
    const blockers = new Set(live.map(npc => `${npc.col},${npc.row}`));
    const stale = resolveWorldNavigationGuide(
      world.worldMap, map.data.id, 'landmark.mist-willow-market', new Set(['place.mist-willow-market']),
      map, { col: 43, row: 37 },
    );
    const fresh = resolveWorldNavigationGuide(
      world.worldMap, map.data.id, 'landmark.mist-willow-market', new Set(['place.mist-willow-market']),
      map, { col: 44, row: 32 }, blockers,
    );
    expect(stale.status).toBe('en-route');
    expect(fresh.status).toBe('en-route');
    if (stale.status !== 'en-route' || fresh.status !== 'en-route') throw new Error('expected open routes');
    expect(fresh.path).not.toEqual(stale.path);
    for (const cell of fresh.path.slice(1)) expect(blockers.has(`${cell.col},${cell.row}`)).toBe(false);
  });

  it('projects one stable landmark id from the first-region gate to the destination map', () => {
    const world = makeWorld();
    const startingMap = world.maps.get('map.round-01-grid')!;
    const ferryMap = world.maps.get('map.round-10-mist-ferry')!;

    const firstLeg = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-01-grid',
      'landmark.mist-willow-market',
      new Set(['place.mist-willow-market']),
      startingMap,
      startingMap.playerStart,
    );
    expect(firstLeg.status).toBe('en-route');
    expect(firstLeg).toMatchObject({
      destinationLandmarkId: 'landmark.mist-willow-market',
      destinationName: '芦桥集',
      destinationRegionName: '雾雨渡口',
      nextTransitionName: '石阶渡口',
      regionRouteNames: ['江南道·七镇行旅', '雾雨渡口'],
    });
    if (firstLeg.status !== 'en-route') throw new Error('expected first leg');
    expect(firstLeg.path.at(-1)).not.toEqual({ col: 90, row: 50 });
    expect(Math.abs(firstLeg.path.at(-1)!.col - 90) + Math.abs(firstLeg.path.at(-1)!.row - 50)).toBe(1);

    const afterManualGate = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      'landmark.mist-willow-market',
      new Set(['place.mist-willow-market']),
      ferryMap,
      { col: 1, row: 4 },
    );
    expect(afterManualGate.status).toBe('en-route');
    expect(afterManualGate).toMatchObject({
      destinationName: '芦桥集',
      destinationRegionName: '雾雨渡口',
      nextTransitionName: null,
      regionRouteNames: ['雾雨渡口'],
    });
    if (afterManualGate.status !== 'en-route') throw new Error('expected local continuation');
    expect(afterManualGate.path.at(-1)).toEqual({ col: 59, row: 65 });
  });

  it('reports a gate-ready stop from the actual interaction cell', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-01-grid')!;
    const start = [
      { col: 90, row: 49 }, { col: 91, row: 50 },
      { col: 90, row: 51 }, { col: 89, row: 50 },
    ].find((candidate) => map.canEnter(candidate.col, candidate.row));
    if (start === undefined) throw new Error('the real ferry gate has no walkable interaction cell');
    const guide = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-01-grid',
      'landmark.mist-willow-market',
      new Set(['place.mist-willow-market']),
      map,
      start,
    );
    expect(guide.status).toBe('at-gate');
    if (guide.status !== 'at-gate') throw new Error('expected an interaction-ready gate segment');
    expect(guide.path).toEqual([start]);
    expect(guide.nextTransitionName).toBe('石阶渡口');
  });

  it('keeps discovery-gated destinations hidden from route status and clears missing routes', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-01-grid')!;
    const hidden = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-01-grid',
      'landmark.mist-south-pool',
      new Set(),
      map,
      map.playerStart,
    );
    expect(hidden).toEqual({ status: 'target-lost' });
    expect(JSON.stringify(hidden)).not.toContain('南湾苇池');

    const marketGated = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-01-grid',
      'landmark.mist-willow-market',
      new Set(),
      map,
      map.playerStart,
    );
    expect(marketGated).toEqual({ status: 'target-lost' });

    world.worldMap.transitions = world.worldMap.transitions
      .filter((transition) => transition.id !== 'gate.trial-to-ferry');
    const broken = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-01-grid',
      'landmark.mist-willow-market',
      new Set(['place.mist-willow-market']),
      map,
      map.playerStart,
    );
    expect(broken).toEqual({ status: 'route-broken', destinationName: '芦桥集' });
  });

  it('marks a visible same-region destination arrived at its reachable landmark stop', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-10-mist-ferry')!;
    const landmark = world.worldMap.landmarks.find((candidate) => candidate.id === 'landmark.mist-south-pool')!;
    const candidates = [
      { col: landmark.col, row: landmark.row },
      { col: landmark.col, row: landmark.row - 1 },
      { col: landmark.col + 1, row: landmark.row },
      { col: landmark.col, row: landmark.row + 1 },
      { col: landmark.col - 1, row: landmark.row },
      { col: landmark.col, row: landmark.row - 2 },
      { col: landmark.col + 2, row: landmark.row },
    ];
    const start = candidates.find((candidate) => map.canEnter(candidate.col, candidate.row));
    if (start === undefined) throw new Error('no nearby approach cell for the south-pool landmark');
    const guide = resolveWorldNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      landmark.id,
      new Set(['place.mist-south-pool']),
      map,
      start,
    );
    expect(guide.status).toBe('arrived');
    if (guide.status !== 'arrived') throw new Error('expected an arrived landmark stop');
    expect(guide).toMatchObject({ destinationName: '南湾苇池', nextTransitionName: null });
    // Plain landmark stops carry no quest arrival action.
    expect(guide.arrivalAction).toBeUndefined();
  });
});

describe('quest arrival actions', () => {
  it('keeps the Jiangnan mentor route out of the real terrain and scheduled NPC cells', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-01-grid')!;
    const npcsParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    if (!npcsParsed.ok) throw new Error(npcsParsed.errors.join('\n'));
    if (!calendarParsed.ok) throw new Error(calendarParsed.errors.join('\n'));
    const baseNpcs = npcsParsed.set.npcs.map(record => ({ record, col: record.position.col, row: record.position.row }));
    const schedules = compileNpcSchedules({ npcs: baseNpcs, periods: calendarParsed.calendar.periods, maps: world.maps });
    const liveNpcs = resolveNpcPlacementsForPlayer({
      baseNpcs,
      periodNpcs: schedules.placementsByPeriod.get('period.night')!,
      mapResourceId: map.data.id,
      map,
      playerPosition: { col: 44, row: 38 },
    });
    const blockers = new Set(liveNpcs.map(npc => `${npc.col},${npc.row}`));
    const guide = resolveCellNavigationGuide(world.worldMap, map.data.id, {
      mapResourceId: map.data.id, col: 39, row: 37, name: '测试师父', approachRadius: 1, arrivalAction: 'talk',
    }, map, { col: 44, row: 38 }, blockers);
    expect(guide.status).toBe('en-route');
    if (guide.status !== 'en-route') throw new Error('expected the mentor route to remain reachable');
    const next = guide.path[1];
    expect(next).toBeDefined();
    if (next === undefined) throw new Error('expected a next step');
    expect(next).toEqual({ col: 44, row: 37 });
    expect(map.canEnter(next.col, next.row)).toBe(true);
    expect(blockers.has(`${next.col},${next.row}`)).toBe(false);
  });

  it('names the existing control for each arrival action without claiming it happened', () => {
    // F talks directly; E serves an adjacent NPC (shop or quest board)
    // before its encounter; discovery fires on arrival but may wait on
    // the period or weather, so V waits in place. Copy changes must be
    // deliberate — this locks the shipped wording.
    expect(arrivalActionHint('talk')).toBe('按 F 直接交谈（E 键优先处理商铺或差事名录）');
    expect(arrivalActionHint('battle')).toBe('按 E 交手（身旁另有人物时 E 会先应对他们）');
    expect(arrivalActionHint('discover')).toBe('见闻须满足事件条件；可按 V 推进时段等待');
  });

  it('carries a quest arrival action through every segment status', () => {
    const world = makeWorld();
    const ferryMap = world.maps.get('map.round-10-mist-ferry')!;
    const destination = {
      mapResourceId: 'map.round-10-mist-ferry',
      col: 3,
      row: 1,
      name: '测试船夫',
      approachRadius: 1,
      arrivalAction: 'talk' as const,
    };

    const enRoute = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      ferryMap,
      ferryMap.playerStart,
    );
    expect(enRoute.status).toBe('en-route');
    if (enRoute.status !== 'en-route') throw new Error('expected an en-route guide');
    expect(enRoute.arrivalAction).toBe('talk');

    // Standing on the computed stop collapses the path to one cell: arrived.
    const arrived = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      ferryMap,
      enRoute.path.at(-1)!,
    );
    expect(arrived.status).toBe('arrived');
    if (arrived.status !== 'arrived') throw new Error('expected an arrived guide');
    expect(arrived.arrivalAction).toBe('talk');
  });

  it('routes around live NPC and encounter cells without mutating the map', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-10-mist-ferry')!;
    const destination = {
      mapResourceId: 'map.round-10-mist-ferry',
      col: 59,
      row: 65,
      name: '测试目的地',
      approachRadius: 2,
    };
    const direct = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      map,
      map.playerStart,
    );
    expect(direct.status).toBe('en-route');
    if (direct.status !== 'en-route') throw new Error('expected an en-route guide');
    const occupied = direct.path[1];
    if (occupied === undefined) throw new Error('the route should take at least one step');

    const detour = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      map,
      map.playerStart,
      new Set([`${occupied.col},${occupied.row}`]),
    );
    expect(detour.status).toBe('en-route');
    if (detour.status !== 'en-route') throw new Error('expected a detour guide');
    expect(detour.path).not.toContainEqual(occupied);
    expect(map.canEnter(occupied.col, occupied.row)).toBe(true);
  });

  it('recalculates the Ferry return-gate route around the live ending-NPC cell', () => {
    // Round172 observed this exact saved position: player (9,2), a scheduled
    // NPC occupying (12,2), and the Jiangnan return gate. Keep the authored
    // map traversable at that cell; only the live occupancy blocks it.
    const world = makeWorld();
    const map = world.maps.get('map.round-10-mist-ferry')!;
    const targetMap = world.maps.get('map.round-01-grid')!;
    const returnGate = world.worldMap.transitions.find(transition =>
      transition.from.mapResourceId === map.data.id
      && transition.to.mapResourceId === targetMap.data.id);
    if (returnGate === undefined) throw new Error('the Ferry return gate must be assembled');
    expect(map.canEnter(12, 2)).toBe(true);

    const destination = {
      mapResourceId: targetMap.data.id,
      col: targetMap.data.playerStart.col,
      row: targetMap.data.playerStart.row,
      name: targetMap.data.name,
      approachRadius: 1,
      arrivalAction: 'travel' as const,
    };
    const blocked = new Set(['12,2']);
    const route = resolveCellNavigationGuide(
      world.worldMap, map.data.id, destination, map, { col: 9, row: 2 }, blocked,
    );
    expect(route).toMatchObject({ status: 'en-route', nextTransitionName: returnGate.name, arrivalAction: 'travel' });
    if (route.status !== 'en-route') throw new Error('the return gate should remain reachable');
    expect(route.path).toEqual([
      { col: 9, row: 2 }, { col: 9, row: 3 }, { col: 8, row: 3 },
      { col: 7, row: 3 }, { col: 6, row: 3 }, { col: 5, row: 3 },
      { col: 4, row: 3 }, { col: 3, row: 3 }, { col: 2, row: 3 },
    ]);
    expect(route.path).not.toContainEqual({ col: 12, row: 2 });

    const atGate = resolveCellNavigationGuide(
      world.worldMap, map.data.id, destination, map, route.path.at(-1)!, blocked,
    );
    expect(atGate).toMatchObject({ status: 'at-gate', nextTransitionName: returnGate.name });
  });

  it('keeps temporary live-occupancy blockage distinct from a broken terrain route', () => {
    const world = makeWorld();
    const map = world.maps.get('map.round-10-mist-ferry')!;
    const destination = {
      mapResourceId: 'map.round-10-mist-ferry',
      col: 59,
      row: 65,
      name: '测试目的地',
      approachRadius: 2,
    };
    const ring = new Set<string>();
    for (let row = destination.row - 2; row <= destination.row + 2; row += 1) {
      for (let col = destination.col - 2; col <= destination.col + 2; col += 1) {
        if (Math.abs(col - destination.col) + Math.abs(row - destination.row) <= 2) {
          ring.add(`${col},${row}`);
        }
      }
    }
    const blocked = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      map,
      map.playerStart,
      ring,
    );
    expect(blocked).toEqual({ status: 'route-blocked', destinationName: destination.name });

    const noOccupancy = resolveCellNavigationGuide(
      world.worldMap,
      'map.round-10-mist-ferry',
      destination,
      map,
      map.playerStart,
    );
    expect(noOccupancy.status).toBe('en-route');
  });
});
