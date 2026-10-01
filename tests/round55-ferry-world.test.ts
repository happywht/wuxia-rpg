import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { findGridPath } from '../src/engine/grid-path';
import { parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function parseMap(path: string) {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('large walkable regions and later atlas extensions', () => {
  const ferry = parseMap('../data/base/maps/round-10-mist-ferry.json');
  const jiangnan = parseMap('../data/base/maps/round-01-grid.json');
  const ironRidge = parseMap('../data/base/maps/round-62-iron-ridge.json');
  const saltRoad = parseMap('../data/base/maps/round-67-salt-road.json');
  const cloudRidge = parseMap('../data/base/maps/round-74-cloud-ridge.json');
  const isles = parseMap('../data/base/maps/round-79-isles.json');
  const eastCoast = parseMap('../data/base/maps/round-82-east-coast.json');
  const windwardIsle = parseMap('../data/base/maps/round-84-windward-isle.json');
  const tideIsle = parseMap('../data/base/maps/round-85-tide-isle.json');
  const southwestIsles = parseMap('../data/base/maps/round-87-southwest-isles.json');
  const cloudNorthTerrace = parseMap('../data/base/maps/round-91-cloud-north-terrace.json');
  const northPass = parseMap('../data/base/maps/round-92-north-pass.json');
  const snowPineValley = parseMap('../data/base/maps/round-93-snow-pine-valley.json');
  const eastGate = parseMap('../data/base/maps/round-94-east-gate.json');
  const returningSails = parseMap('../data/base/maps/round-94-returning-sails.json');
  const mistyPineGate = parseMap('../data/base/maps/round-95-misty-pine-gate.json');
  const cedarValley = parseMap('../data/base/maps/round-95-cedar-valley.json');
  const eastHarbor = parseMap('../data/base/maps/round-95-east-harbor.json');
  const stoneReef = parseMap('../data/base/maps/round-96-stone-reef.json');
  const halfmoonAtoll = parseMap('../data/base/maps/round-96-halfmoon-atoll.json');
  const lanxinIsle = parseMap('../data/base/maps/round-97-lanxin-isle.json');
  const pilotReef = parseMap('../data/base/maps/round-97-pilot-reef.json');
  const worldData = readJson('../data/base/world/world-map.json') as {
    transitions: Array<{ id: string; from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }>;
    landmarks: Array<{ id: string; mapResourceId: string; col: number; row: number }>;
    events: Array<{ id: string; mapResourceId: string; col: number; row: number; discoverKnowledgeNodeId?: string }>;
  };
  const npcSet = readJson('../data/base/characters/round-03-npcs.json') as {
    npcs: Array<{ id: string; mapResourceId: string; position: { col: number; row: number }; schedule?: Array<{ position: { col: number; row: number } }> }>;
  };
  const encounterSet = readJson('../data/base/battles/round-05-encounters.json') as {
    encounters: Array<{ id: string; mapResourceId: string; position: { col: number; row: number } }>;
  };

  it('expands to 100×100 CC0 layered terrain without reducing collision to a tiny scene', () => {
    expect(ferry.columns).toBe(100);
    expect(ferry.rows).toBe(100);
    expect(ferry.data.art?.layers).toHaveLength(11);
    expect(ferry.data.art?.layers.every((layer) =>
      layer.cells.length === 100 && layer.cells.every((row) => row.length === 100),
    )).toBe(true);
    const walkable = ferry.data.grid.flatMap((row) => [...row]).filter((tile) => tile !== '#' && tile !== '~');
    expect(walkable.length).toBeGreaterThanOrEqual(6500);
    expect(ferry.data.art?.layers.some((layer) => layer.cells.some((row) => row.some((gid) => (gid & 0x80000000) !== 0))))
      .toBe(true);
    expect(existsSync(new URL('../data/assets/kenney/roguelike-rpg/License.txt', import.meta.url))).toBe(true);
  });

  it('keeps all legacy gates, events, scheduled NPCs, encounters and new atlas destinations reachable', () => {
    const points: Array<{ id: string; mapResourceId: string; col: number; row: number }> = [];
    for (const transition of worldData.transitions) {
      points.push({ id: `${transition.id}:from`, ...transition.from });
      points.push({ id: `${transition.id}:to`, ...transition.to });
    }
    for (const landmark of worldData.landmarks) points.push(landmark);
    for (const event of worldData.events) points.push(event);
    for (const npc of npcSet.npcs) {
      points.push({ id: `${npc.id}:base`, mapResourceId: npc.mapResourceId, ...npc.position });
      for (const [index, schedule] of (npc.schedule ?? []).entries()) {
        points.push({ id: `${npc.id}:schedule:${index}`, mapResourceId: npc.mapResourceId, ...schedule.position });
      }
    }
    for (const encounter of encounterSet.encounters) points.push({ id: encounter.id, mapResourceId: encounter.mapResourceId, ...encounter.position });

    for (const map of [jiangnan, ferry, ironRidge, saltRoad]) {
      const mapAnchors = points.filter((point) =>
        point.mapResourceId === map.data.id &&
        (!point.id.startsWith('landmark.') || map.data.id === ironRidge.data.id),
      );
      for (const anchor of mapAnchors) {
        if (!anchor.id.startsWith('landmark.')) {
          expect(map.canEnter(anchor.col, anchor.row), `${anchor.id} must be open`).toBe(true);
        }
        expect(findGridPath(map, map.playerStart, anchor), `${anchor.id} must be reachable from ${map.data.id}`)
          .not.toBeNull();
      }
    }

    const toFerry = worldData.transitions.find(({ id }) => id === 'gate.trial-to-ferry');
    const toJiangnan = worldData.transitions.find(({ id }) => id === 'gate.ferry-to-trial');
    expect(toFerry?.from).toEqual({ mapResourceId: jiangnan.data.id, col: 90, row: 50 });
    expect(toFerry?.to).toEqual({ mapResourceId: ferry.data.id, col: 1, row: 4 });
    expect(toJiangnan?.from).toEqual({ mapResourceId: ferry.data.id, col: 2, row: 4 });
    expect(toJiangnan?.to).toEqual({ mapResourceId: jiangnan.data.id, col: 89, row: 50 });
    expect(findGridPath(jiangnan, jiangnan.playerStart, toFerry!.from)).not.toBeNull();
    expect(findGridPath(ferry, toFerry!.to, toJiangnan!.from)).not.toBeNull();

    const toIronRidge = worldData.transitions.find(({ id }) => id === 'gate.ferry-north-to-iron-ridge');
    const backToFerry = worldData.transitions.find(({ id }) => id === 'gate.iron-ridge-to-ferry-north');
    expect(toIronRidge?.from).toEqual({ mapResourceId: ferry.data.id, col: 89, row: 15 });
    expect(toIronRidge?.to).toEqual({ mapResourceId: ironRidge.data.id, col: 4, row: 7 });
    expect(backToFerry?.from).toEqual({ mapResourceId: ironRidge.data.id, col: 3, row: 7 });
    expect(backToFerry?.to).toEqual({ mapResourceId: ferry.data.id, col: 89, row: 16 });
    expect(findGridPath(ferry, ferry.playerStart, toIronRidge!.from)).not.toBeNull();
    expect(findGridPath(ironRidge, toIronRidge!.to, backToFerry!.from)).not.toBeNull();
    expect(findGridPath(ferry, backToFerry!.to, toJiangnan!.from)).not.toBeNull();

    const newSluice = worldData.events.find(({ id }) => id === 'event.r55-sluice-inscription');
    expect(newSluice?.discoverKnowledgeNodeId).toBe('place.mist-sluice');
    expect(worldData.landmarks.find(({ id }) => id === 'landmark.mist-old-sluice')?.id).toBe('landmark.mist-old-sluice');
  });

  it('assembles all current regions and preserves data-driven landmark and knowledge references', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: Array<{ id: string }> };
    const calendar = readJson('../data/base/worldview/calendar.json') as { periods: Array<{ id: string }> };
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: Array<{ id: string }> };
    const assembled = assembleWorldMap(parsed.data, new Map([
      [jiangnan.data.id, jiangnan],
      [ferry.data.id, ferry],
      [ironRidge.data.id, ironRidge],
      [saltRoad.data.id, saltRoad],
      [cloudRidge.data.id, cloudRidge],
      [isles.data.id, isles],
      [eastCoast.data.id, eastCoast],
      [windwardIsle.data.id, windwardIsle],
      [tideIsle.data.id, tideIsle],
      [southwestIsles.data.id, southwestIsles],
      [cloudNorthTerrace.data.id, cloudNorthTerrace],
      [northPass.data.id, northPass],
      [snowPineValley.data.id, snowPineValley],
      [eastGate.data.id, eastGate],
      [returningSails.data.id, returningSails],
      [mistyPineGate.data.id, mistyPineGate],
      [cedarValley.data.id, cedarValley],
      [eastHarbor.data.id, eastHarbor],
      [stoneReef.data.id, stoneReef],
      [halfmoonAtoll.data.id, halfmoonAtoll],
      [lanxinIsle.data.id, lanxinIsle],
      [pilotReef.data.id, pilotReef],
    ]), {
      knowledgeNodeIds: new Set(nodes.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set([...npcSet.npcs.map(({ id }) => id), 'char.r87-ao-wanqing']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(22);
    expect(assembled.transitions).toHaveLength(54);
    expect(assembled.landmarks.some(({ id }) => id === 'landmark.mist-willow-market')).toBe(true);
    expect(assembled.landmarks.some(({ id }) => id === 'landmark.mist-old-sluice' && id !== undefined)).toBe(true);
    expect(assembled.events.some(({ id }) => id === 'event.r55-sluice-inscription')).toBe(true);
    expect(assembled.landmarks.filter(({ mapResourceId }) => mapResourceId === ironRidge.data.id)).toHaveLength(4);
    expect(assembled.events.filter(({ mapResourceId }) => mapResourceId === ironRidge.data.id)).toHaveLength(4);
    expect(assembled.landmarks.filter(({ mapResourceId }) => mapResourceId === saltRoad.data.id)).toHaveLength(4);
    expect(assembled.events.filter(({ mapResourceId }) => mapResourceId === saltRoad.data.id)).toHaveLength(2);
    expect(nodes.nodes.some(({ id }) => id === 'event.r55-sluice-inscription')).toBe(true);
    expect(nodes.nodes.some(({ id }) => id === 'place.mist-sluice')).toBe(true);
  });
});
