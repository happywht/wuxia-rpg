import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { buildWorldAtlasOverlays, projectAtlasPosition, projectWorldCell } from '../src/engine/world-atlas-view';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadWorld() {
  const raw = readJson('../data/base/world/world-map.json');
  const parsed = parseWorldMap(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const manifest = readJson('../data/base/manifest.json') as { resources: { id: string; path: string; schema: string }[] };
  const maps = new Map([...manifest.resources]
    .filter((resource) => resource.schema === 'grid-map')
    .map((resource) => {
      const parsedMap = parseGridMap(readJson(`../data/base/${resource.path}`));
      if (!parsedMap.ok) throw new Error(parsedMap.errors.join('\n'));
      return [resource.id, parsedMap.map] as const;
    }));
  const world = assembleWorldMap(parsed.data, maps);
  if ('ok' in world) throw new Error(world.errors.join('\n'));
  return { raw, parsed: parsed.data, world, maps };
}

describe('Round 70 global world atlas art and projection', () => {
  it('loads the 176×112 continental atlas with per-layer tileset validation', () => {
    const { parsed } = loadWorld();
    const art = parsed.atlasArt;
    expect(art).toBeDefined();
    if (art === undefined) return;
    expect({ columns: art.columns, rows: art.rows, tileSize: art.tileSize }).toEqual({ columns: 176, rows: 112, tileSize: 16 });
    expect(art.layers.map(({ id }) => id)).toEqual([
      'world-ocean', 'world-land', 'world-coast', 'world-forest', 'world-relief', 'world-roads', 'world-settlements',
    ]);
    const tilesets = new Map(art.tilesets.map((tileset) => [tileset.id, tileset]));
    expect(tilesets.has('kenney.roguelike-rpg')).toBe(true);
    expect(tilesets.has('kenney.tiny-town')).toBe(true);
    expect(tilesets.has('wuxia.world-palette')).toBe(true);
    for (const layer of art.layers) {
      expect(layer.cells).toHaveLength(art.rows);
      expect(layer.cells.every((row) => row.length === art.columns)).toBe(true);
      const tileset = tilesets.get(layer.tilesetId);
      expect(tileset).toBeDefined();
      expect(layer.cells.flat().every((gid) => (gid & 0x0fffffff) <= (tileset?.tileCount ?? 0))).toBe(true);
    }
    expect(art.layers.find(({ id }) => id === 'world-roads')?.cells.flat().filter((gid) => gid > 0).length)
      .toBeGreaterThan(100);
    const land = art.layers.find(({ id }) => id === 'world-land')?.cells.flat().filter((gid) => gid > 1) ?? [];
    expect(land.length).toBeGreaterThan(7_500);
    expect(new Set(land)).toEqual(new Set([2, 3, 4, 5]));
    expect(art.layers.find(({ id }) => id === 'world-ocean')?.cells.flat().every((gid) => gid === 1)).toBe(true);
    expect(art.layers.find(({ id }) => id === 'world-forest')?.cells.flat().filter((gid) => gid === 7).length)
      .toBeGreaterThan(100);
    expect(art.layers.find(({ id }) => id === 'world-settlements')?.cells.flat().filter((gid) => gid > 0).length)
      .toBeGreaterThanOrEqual(12);
  });

  it('keeps old worlds and MOD overrides valid without optional atlasArt', () => {
    const raw = readJson('../data/base/world/world-map.json') as Record<string, unknown>;
    delete raw.atlasArt;
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.atlasArt).toBeUndefined();
  });

  it('rejects malformed atlas dimensions and GIDs at the runtime parser boundary', () => {
    const raw = readJson('../data/base/world/world-map.json') as {
      atlasArt: { columns: number; layers: { cells: number[][] }[]; tilesets: { tileCount: number }[] };
    };
    raw.atlasArt.layers[0]!.cells[0]![0] = 10_000;
    const badFrame = parseWorldMap(raw);
    expect(badFrame.ok).toBe(false);
    if (!badFrame.ok) expect(badFrame.errors.join('\n')).toContain('超出图集');

    const wrongSize = readJson('../data/base/world/world-map.json') as typeof raw;
    wrongSize.atlasArt.columns += 1;
    const badSize = parseWorldMap(wrongSize);
    expect(badSize.ok).toBe(false);
    if (!badSize.ok) expect(badSize.errors.join('\n')).toContain('应有');
  });

  it('projects every assembled region, all gate directions and the player from authored data', () => {
    const { world, maps, parsed } = loadWorld();
    const overlays = buildWorldAtlasOverlays(
      world,
      maps,
      parsed.startingMapResourceId,
      { col: 43, row: 37 },
      new Set(),
    );
    expect(overlays.regions.map(({ mapResourceId }) => mapResourceId)).toEqual(world.regions.map(({ mapResourceId }) => mapResourceId));
    expect(overlays.connections).toHaveLength(world.transitions.length);
    expect(overlays.connections.every(({ from, to }) =>
      from.x >= 0 && from.x <= parsed.atlasArt!.columns * parsed.atlasArt!.tileSize &&
      from.y >= 0 && from.y <= parsed.atlasArt!.rows * parsed.atlasArt!.tileSize &&
      to.x >= 0 && to.x <= parsed.atlasArt!.columns * parsed.atlasArt!.tileSize &&
      to.y >= 0 && to.y <= parsed.atlasArt!.rows * parsed.atlasArt!.tileSize,
    )).toBe(true);
    expect(overlays.player).toEqual(projectWorldCell(
      { col: 43, row: 37 },
      maps.get(parsed.startingMapResourceId)!,
      world.regions.find(({ mapResourceId }) => mapResourceId === parsed.startingMapResourceId)!.atlasPosition,
      parsed.atlasArt!,
    ));
    expect(overlays.regions.map(({ position }) => position).every((point) =>
      point.x > 0 && point.x < parsed.atlasArt!.columns * parsed.atlasArt!.tileSize &&
      point.y > 0 && point.y < parsed.atlasArt!.rows * parsed.atlasArt!.tileSize,
    )).toBe(true);
  });

  it('uses edge-safe atlas coordinates and does not reveal undiscovered landmark names', () => {
    const { world, maps, parsed } = loadWorld();
    const art = parsed.atlasArt!;
    expect(projectAtlasPosition({ x: 0, y: 100 }, art)).toEqual({ x: 8, y: 1784 });
    const undiscovered = buildWorldAtlasOverlays(world, maps, parsed.startingMapResourceId, { col: 43, row: 37 }, new Set());
    const undiscoveredJson = JSON.stringify(undiscovered);
    expect(undiscoveredJson).not.toContain('landmark.reedbank-landing');
    expect(undiscoveredJson).not.toContain('芦岸登船点');
    expect(undiscoveredJson).not.toContain('旧渠石闸');

    const gatedIds = new Set(world.landmarks
      .map(({ discoveryNodeId }) => discoveryNodeId)
      .filter((id): id is string => id !== undefined));
    const discovered = buildWorldAtlasOverlays(world, maps, parsed.startingMapResourceId, { col: 43, row: 37 }, gatedIds);
    expect(discovered.landmarks).toHaveLength(world.landmarks.length);
    expect(JSON.stringify(discovered)).toContain('landmark.reedbank-landing');
  });
});
