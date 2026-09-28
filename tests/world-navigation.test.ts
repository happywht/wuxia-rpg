import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { buildWorldMapWaypoints, cycleWorldWaypointIndex, normalizeWorldMapPointer } from '../src/engine/world-navigation';

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
  const assembled = assembleWorldMap(parsed.data, new Map([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
  ]));
  if ('ok' in assembled) throw new Error(assembled.errors.join('\n'));
  return assembled;
}

describe('data-driven world map waypoints', () => {
  it('cycles keyboard waypoint focus in both directions and wraps at each end', () => {
    expect(cycleWorldWaypointIndex(-1, 3, 1)).toBe(0);
    expect(cycleWorldWaypointIndex(-1, 3, -1)).toBe(2);
    expect(cycleWorldWaypointIndex(2, 3, 1)).toBe(0);
    expect(cycleWorldWaypointIndex(0, 3, -1)).toBe(2);
    expect(cycleWorldWaypointIndex(0, 0, 1)).toBe(-1);
  });

  it('normalizes Phaser FIT pointer y while retaining game-space x', () => {
    const normalized = normalizeWorldMapPointer({ x: 704, y: 155 }, 540, 378);
    expect(normalized.x).toBe(704);
    expect(normalized.y).toBeCloseTo(155 * 540 / 378);
    expect(normalizeWorldMapPointer({ x: 12, y: 0 }, 540, 0)).toEqual({ x: 12, y: 0 });
  });

  it('shows public remote landmarks but keeps discovery-gated landmarks hidden', () => {
    const destinations = buildWorldMapWaypoints(makeWorld(), 'map.round-01-grid', new Set());
    const visibleJson = JSON.stringify(destinations);
    expect(destinations).toContainEqual(expect.objectContaining({
      id: 'region:map.round-10-mist-ferry',
      kind: 'remote-region',
      name: '雾雨渡口',
      nextTransitionName: '石阶渡口',
    }));
    expect(destinations.some(({ id }) => id === 'remote:landmark.mist-willow-market')).toBe(true);
    expect(destinations.some(({ id }) => id === 'remote:landmark.reedbank-landing')).toBe(false);
    expect(destinations.some(({ id }) => id === 'remote:landmark.mist-old-sluice')).toBe(false);
    expect(visibleJson).not.toContain('芦岸登船点');
    expect(visibleJson).not.toContain('landmark.reedbank-landing');
    expect(visibleJson).not.toContain('place.reedbank');
    expect(visibleJson).not.toContain('landmark.mist-old-sluice');
    expect(visibleJson).not.toContain('place.mist-sluice');
  });

  it('does not project undisclosed regions beyond the directly known crossing', () => {
    const world = makeWorld();
    world.regions.push({
      mapResourceId: 'map.hidden-valley',
      name: '隐山秘谷',
      description: '尚未抵达的山谷',
      atlasPosition: { x: 120, y: 90 },
    });
    world.transitions.push({
      id: 'gate.ferry-to-hidden-valley',
      name: '渡口后的山道',
      from: { mapResourceId: 'map.round-10-mist-ferry', col: 8, row: 4 },
      to: { mapResourceId: 'map.hidden-valley', col: 2, row: 2 },
    });

    const destinations = buildWorldMapWaypoints(world, 'map.round-01-grid', new Set());
    expect(destinations.some(({ id }) => id === 'region:map.hidden-valley')).toBe(false);
    expect(JSON.stringify(destinations)).not.toContain('隐山秘谷');
  });

  it('routes a discovered remote landmark to the first local crossing, not its foreign grid cell', () => {
    const destinations = buildWorldMapWaypoints(
      makeWorld(),
      'map.round-01-grid',
      new Set(['place.reedbank']),
    );
    const remote = destinations.find(({ id }) => id === 'remote:landmark.reedbank-landing');
    expect(remote).toMatchObject({
      name: '芦岸登船点',
      kind: 'remote-landmark',
      position: { col: 90, row: 50 },
      destinationRegionName: '雾雨渡口',
      regionRouteNames: ['江南道·七镇行旅', '雾雨渡口'],
      nextTransitionName: '石阶渡口',
    });
    expect(remote?.position).not.toEqual({ col: 1, row: 4 });
  });

  it('turns remote destinations into local stops at each region first gate after arrival', () => {
    const destinations = buildWorldMapWaypoints(
      makeWorld(),
      'map.round-10-mist-ferry',
      new Set(['place.reedbank']),
    );
    const remote = destinations.find(({ id }) => id === 'remote:landmark.northwest-settlement');
    expect(destinations.find(({ id }) => id === 'landmark:landmark.reedbank-landing')?.position)
      .toEqual({ col: 1, row: 4 });
    expect(remote).toMatchObject({
      position: { col: 2, row: 4 },
      destinationRegionName: '江南道·七镇行旅',
      regionRouteNames: ['雾雨渡口', '江南道·七镇行旅'],
      nextTransitionName: '回望石阶',
    });
    expect(remote?.position).not.toEqual({ col: 23, row: 27 });
  });

  it('omits a remote destination when no directed route exists', () => {
    const world = makeWorld();
    world.transitions = world.transitions.filter((edge) => edge.id !== 'gate.trial-to-ferry');
    const destinations = buildWorldMapWaypoints(world, 'map.round-01-grid', new Set(['place.reedbank']));
    expect(destinations.some(({ id }) => id === 'remote:landmark.reedbank-landing')).toBe(false);
  });
});
