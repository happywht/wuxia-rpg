import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { findGridPath } from '../src/engine/grid-path';
import { parseGridMap } from '../src/engine/grid-map';
import { projectAtlasPosition } from '../src/engine/world-atlas-view';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): any {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as any;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('Round 94 eastern and southern frontier expansion', () => {
  const rawWorld = readJson('../data/base/world/world-map.json');
  const baseline = readJson('../iterations/round-94/round93-atlas-baseline.json');

  it('expands the movable overview while keeping every Round 93 source pixel and region anchor fixed', () => {
    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.data.atlasArt === undefined) return;

    const art = parsed.data.atlasArt;
    expect([art.columns, art.rows, art.tileSize]).toEqual([768, 576, 8]);
    expect(art.layers).toHaveLength(65);
    expect(parsed.data.regions).toHaveLength(22);
    expect(art.regionFootprint).toEqual({ columns: 35.84, rows: 23.04 });

    const layers = new Map(art.layers.map((layer) => [layer.id, layer]));
    for (const [id, expected] of Object.entries(baseline.layers as Record<string, string>)) {
      const layer = layers.get(id);
      expect(layer, id).toBeDefined();
      const oldPrefix = layer!.cells.slice(0, baseline.rows)
        .map((row) => row.slice(0, baseline.columns));
      expect(sha256(oldPrefix), id).toBe(expected);
    }

    for (const [id, oldRegion] of Object.entries(baseline.regions as Record<string, { center: { col: number; row: number } }>)) {
      const region = parsed.data.regions.find((entry) => entry.mapResourceId === id);
      expect(region, id).toBeDefined();
      const projected = projectAtlasPosition(region!.atlasPosition, art);
      expect(projected.x / art.tileSize, `${id} col`).toBeCloseTo(oldRegion.center.col, 4);
      expect(projected.y / art.tileSize, `${id} row`).toBeCloseTo(oldRegion.center.row, 4);
    }

    const east = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === 'map.round-94-east-gate')!;
    const south = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === 'map.round-94-returning-sails')!;
    expect(projectAtlasPosition(east.atlasPosition, art).x / art.tileSize).toBeCloseTo(700.5, 4);
    expect(projectAtlasPosition(east.atlasPosition, art).y / art.tileSize).toBeCloseTo(96.5, 4);
    expect(projectAtlasPosition(south.atlasPosition, art).x / art.tileSize).toBeCloseTo(405.5, 4);
    expect(projectAtlasPosition(south.atlasPosition, art).y / art.tileSize).toBeCloseTo(492.5, 4);

    for (const id of [
      'world-r94-east-snow', 'world-r94-east-cliffs', 'world-r94-east-pines',
      'world-r94-east-route', 'world-r94-east-settlement', 'world-r94-south-shallows',
      'world-r94-south-sand', 'world-r94-south-land', 'world-r94-south-pines',
      'world-r94-south-lane',
    ]) {
      expect(layers.get(id)?.cells.flat().some((gid) => gid > 0), id).toBe(true);
    }
  });

  it('ships two walkable 100×100 regions with CC0 tile art and reachable bidirectional gates', () => {
    const parsedWorld = parseWorldMap(rawWorld);
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;

    const manifest = readJson('../data/base/manifest.json') as {
      resources: Array<{ id: string; path: string; schema: string }>;
    };
    const maps = new Map();
    for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
      const parsedMap = parseGridMap(readJson(`../data/base/${resource.path}`));
      expect(parsedMap.ok, resource.id).toBe(true);
      if (parsedMap.ok) maps.set(resource.id, parsedMap.map);
    }

    for (const id of ['map.round-94-east-gate', 'map.round-94-returning-sails']) {
      const map = maps.get(id);
      expect(map, id).toBeDefined();
      expect([map.columns, map.rows]).toEqual([100, 100]);
      expect(map.data.art?.layers.length).toBeGreaterThanOrEqual(5);
      expect(map.data.art?.layers.every((layer: { tilesetId: string }) =>
        map.data.art?.tilesets.some(({ id }: { id: string }) => id === layer.tilesetId),
      )).toBe(true);
    }

    const transitions = new Map(parsedWorld.data.transitions.map((entry) => [entry.id, entry]));
    const gatePairs: Array<[string, string]> = [
      ['gate.r94-terrace-to-east', 'gate.r94-east-to-terrace'],
      ['gate.r94-tide-to-south', 'gate.r94-south-to-tide'],
    ];
    for (const [outboundId, returnId] of gatePairs) {
      const outbound = transitions.get(outboundId)!;
      const returning = transitions.get(returnId)!;
      const from = maps.get(outbound.from.mapResourceId)!;
      const destination = maps.get(outbound.to.mapResourceId)!;
      const returnSource = maps.get(returning.from.mapResourceId)!;
      const returnDestination = maps.get(returning.to.mapResourceId)!;
      expect(findGridPath(from, from.playerStart, outbound.from)).not.toBeNull();
      expect(findGridPath(destination, destination.playerStart, returning.from)).not.toBeNull();
      expect(findGridPath(returnSource, outbound.to, returning.from)).not.toBeNull();
      expect(findGridPath(returnDestination, returning.to, outbound.from)).not.toBeNull();
    }

    const assembled = assembleWorldMap(parsedWorld.data, maps);
    expect('ok' in assembled).toBe(false);
    if (!('ok' in assembled)) {
      expect(assembled.warnings).toEqual([]);
      expect(assembled.regions).toHaveLength(22);
      expect(assembled.transitions.filter((g: {id:string}) => !['gate.r278-ferry-north-boat','gate.r278-ferry-north-boat-return'].includes(g.id))).toHaveLength(54); // Preserve the original 54 gates; R278 pair tested separately.
    }
  });

  it('registers both frontier quests, characters, conversations and graph links', () => {
    const manifest = readJson('../data/base/manifest.json') as {
      resources: Array<{ id: string; path: string; schema: string }>;
    };
    for (const id of [
      'npc.round-94-frontiers-set', 'dialogue.round-94-frontiers-set', 'quest.round-94-frontiers-set',
      'map.round-94-east-gate', 'map.round-94-returning-sails',
    ]) expect(manifest.resources.some((resource) => resource.id === id), id).toBe(true);

    const npcs = readJson('../data/base/characters/round-94-frontiers-npcs.json').npcs;
    expect(npcs.map(({ id }: { id: string }) => id)).toEqual([
      'char.r94-shen-wenqiu', 'char.r94-zhao-qianfan',
    ]);
    expect(npcs.every(({ schedule }: { schedule: unknown[] }) => schedule.length === 7)).toBe(true);
    const quests = readJson('../data/base/quests/round-94-frontiers-quests.json').quests;
    expect(quests.map(({ id }: { id: string }) => id)).toEqual([
      'quest.r94-snowline-signal', 'quest.r94-homeward-lantern',
    ]);
    const conversations = readJson('../data/base/dialogues/round-94-frontiers-conversations.json').conversations;
    expect(conversations).toHaveLength(2);
    expect(conversations.every(({ nodes }: { nodes: unknown[] }) => nodes.length >= 3)).toBe(true);

    const nodeIds = new Set((readJson('../data/base/knowledge_graph/nodes.json').nodes as Array<{ id: string }>).map(({ id }) => id));
    const edges = readJson('../data/base/knowledge_graph/edges.json').edges as Array<{ fromId: string; toId: string }>;
    const r94Nodes = [...nodeIds].filter((id) => id.includes('.r94-') || id.startsWith('map.round-94-'));
    expect(r94Nodes.length).toBeGreaterThanOrEqual(16);
    expect(edges.filter(({ fromId, toId }) => fromId.includes('.r94-') || toId.includes('.r94-')).length)
      .toBeGreaterThanOrEqual(16);
    expect(edges.every(({ fromId, toId }) => nodeIds.has(fromId) && nodeIds.has(toId))).toBe(true);
  });
});
