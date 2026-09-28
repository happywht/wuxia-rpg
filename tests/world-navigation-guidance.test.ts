import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
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
