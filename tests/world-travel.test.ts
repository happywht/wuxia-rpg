import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GridMap, parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap, type RegionTransitionData, type WorldMapAssembly } from '../src/engine/world-map';
import { findWorldTravelRoute } from '../src/engine/world-travel';

function transition(
  id: string,
  from: string,
  to: string,
  name = id,
): RegionTransitionData {
  return {
    id,
    name,
    from: { mapResourceId: from, col: 0, row: 0 },
    to: { mapResourceId: to, col: 1, row: 0 },
  };
}

function world(
  regionIds: string[],
  transitions: RegionTransitionData[],
): Pick<WorldMapAssembly, 'regions' | 'transitions'> {
  return {
    regions: regionIds.map((mapResourceId, index) => ({
      mapResourceId,
      name: `区域${index}`,
      description: '',
      atlasPosition: { x: index * 10, y: 0 },
    })),
    transitions,
  };
}

describe('directed world region travel', () => {
  it('returns an empty route when already in the destination region', () => {
    const data = world(['map.a'], []);
    expect(findWorldTravelRoute(data, 'map.a', 'map.a')).toEqual({
      regionMapResourceIds: ['map.a'],
      regionNames: ['区域0'],
      legs: [],
    });
  });

  it('chooses the route with the fewest declared crossings', () => {
    const data = world(['map.a', 'map.b', 'map.c', 'map.d'], [
      transition('gate.a-b', 'map.a', 'map.b'),
      transition('gate.b-c', 'map.b', 'map.c'),
      transition('gate.c-d', 'map.c', 'map.d'),
      transition('gate.a-d', 'map.a', 'map.d'),
    ]);
    const route = findWorldTravelRoute(data, 'map.a', 'map.d');
    expect(route?.regionMapResourceIds).toEqual(['map.a', 'map.d']);
    expect(route?.legs.map(({ transition: edge }) => edge.id)).toEqual(['gate.a-d']);
  });

  it('treats crossings as directed and does not invent a return path', () => {
    const data = world(['map.a', 'map.b'], [transition('gate.a-b', 'map.a', 'map.b')]);
    expect(findWorldTravelRoute(data, 'map.a', 'map.b')?.regionMapResourceIds).toEqual(['map.a', 'map.b']);
    expect(findWorldTravelRoute(data, 'map.b', 'map.a')).toBeNull();
  });

  it('breaks equal-length route ties by transition id, independent of data order', () => {
    const first = transition('gate.z', 'map.a', 'map.b', 'later');
    const second = transition('gate.a', 'map.a', 'map.b', 'earlier');
    const data = world(['map.a', 'map.b'], [first, second]);
    const route = findWorldTravelRoute(data, 'map.a', 'map.b');
    expect(route?.legs.map(({ transition: edge }) => edge.id)).toEqual(['gate.a']);
    expect(route?.legs[0]?.transition.name).toBe('earlier');
  });

  it('returns null for unknown regions and disconnected destinations', () => {
    const data = world(['map.a', 'map.b', 'map.c'], [transition('gate.a-b', 'map.a', 'map.b')]);
    expect(findWorldTravelRoute(data, 'map.missing', 'map.b')).toBeNull();
    expect(findWorldTravelRoute(data, 'map.a', 'map.c')).toBeNull();
  });

  it('returns a named, multi-leg itinerary through each declared transition', () => {
    const data = world(['map.a', 'map.b', 'map.c'], [
      transition('gate.a-b', 'map.a', 'map.b', '北道关'),
      transition('gate.b-c', 'map.b', 'map.c', '石桥渡'),
    ]);
    expect(findWorldTravelRoute(data, 'map.a', 'map.c')).toEqual({
      regionMapResourceIds: ['map.a', 'map.b', 'map.c'],
      regionNames: ['区域0', '区域1', '区域2'],
      legs: [
        { transition: transition('gate.a-b', 'map.a', 'map.b', '北道关'), fromRegionName: '区域0', toRegionName: '区域1' },
        { transition: transition('gate.b-c', 'map.b', 'map.c', '石桥渡'), fromRegionName: '区域1', toRegionName: '区域2' },
      ],
    });
  });

  it('builds outbound and return routes from the shipped atlas records', () => {
    const parsedMap = parseGridMap(JSON.parse(
      readFileSync(new URL('../data/base/maps/round-01-grid.json', import.meta.url), 'utf8'),
    ) as unknown);
    const parsedFerry = parseGridMap(JSON.parse(
      readFileSync(new URL('../data/base/maps/round-10-mist-ferry.json', import.meta.url), 'utf8'),
    ) as unknown);
    if (!parsedMap.ok || !parsedFerry.ok) throw new Error('基础地图解析失败');
    const maps = new Map<string, GridMap>([
      ['map.round-01-grid', parsedMap.map],
      ['map.round-10-mist-ferry', parsedFerry.map],
    ]);
    const parsedWorld = parseWorldMap(JSON.parse(
      readFileSync(new URL('../data/base/world/world-map.json', import.meta.url), 'utf8'),
    ) as unknown);
    if (!parsedWorld.ok) throw new Error(parsedWorld.errors.join('\n'));
    const assembled = assembleWorldMap(parsedWorld.data, maps);
    if ('ok' in assembled) throw new Error(assembled.errors.join('\n'));

    const outbound = findWorldTravelRoute(assembled, 'map.round-01-grid', 'map.round-10-mist-ferry');
    const returnTrip = findWorldTravelRoute(assembled, 'map.round-10-mist-ferry', 'map.round-01-grid');
    expect(outbound?.legs.map(({ transition: edge }) => edge.id)).toEqual(['gate.trial-to-ferry']);
    expect(returnTrip?.legs.map(({ transition: edge }) => edge.id)).toEqual(['gate.ferry-to-trial']);
    expect(outbound?.regionNames).toEqual(['江南道·七镇行旅', '雾雨渡口']);
  });
});
