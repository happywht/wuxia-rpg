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

describe('Round 81 global world atlas art and projection', () => {
  it('loads the 768×576 continental atlas with per-layer tileset validation', () => {
    const { parsed } = loadWorld();
    const art = parsed.atlasArt;
    expect(art).toBeDefined();
    if (art === undefined) return;
    expect({ columns: art.columns, rows: art.rows, tileSize: art.tileSize }).toEqual({ columns: 768, rows: 576, tileSize: 8 });
    expect(art.layers.slice(0, 43).map(({ id }) => id)).toEqual([
      'world-ocean', 'world-land', 'world-coast', 'world-forest', 'world-relief', 'world-roads', 'world-settlements',
      'world-r79-shoal-water', 'world-r79-shoal-sand', 'world-r79-shoal-land', 'world-r79-shoal-pines',
      'world-r79-gate-routes', 'world-r81-expanse-water', 'world-r81-expanse-sand',
      'world-r81-expanse-land', 'world-r81-expanse-pines',
      'world-r84-expanse-water', 'world-r84-expanse-sand', 'world-r84-expanse-land', 'world-r84-expanse-pines',
      'world-r85-expanse-water', 'world-r85-expanse-sand', 'world-r85-expanse-land', 'world-r85-expanse-pines',
      'world-r87-expanse-water', 'world-r87-expanse-sand',
      'world-r87-expanse-land', 'world-r87-expanse-pines',
      'world-r91-terrace-land', 'world-r91-terrace-cliffs', 'world-r91-terrace-walls',
      'world-r91-terrace-detail', 'world-r91-terrace-route',
      'world-r92-pass-snow', 'world-r92-pass-trees', 'world-r92-pass-walls',
      'world-r92-pass-detail', 'world-r92-pass-route',
      'world-r93-valley-snow', 'world-r93-valley-trees', 'world-r93-valley-walls',
      'world-r93-valley-detail', 'world-r93-valley-route',
    ]);
    expect(art.layers.slice(43, 53).map(({ id }) => id)).toEqual([
      'world-r94-east-snow', 'world-r94-east-cliffs', 'world-r94-east-pines',
      'world-r94-east-route', 'world-r94-east-settlement', 'world-r94-south-shallows',
      'world-r94-south-sand', 'world-r94-south-land', 'world-r94-south-pines', 'world-r94-south-lane',
    ]);
    expect(art.layers.slice(53, 57).map(({ id }) => id)).toEqual([
      'world-r95-eastland', 'world-r95-east-coast', 'world-r95-east-trails', 'world-r95-east-forest',
    ]);
    expect(art.layers.slice(57).map(({ id }) => id)).toEqual([
      'world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land', 'world-r96-reef-lane',
      'world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land', 'world-r97-lanxin-lane',
    ]);
    const tilesets = new Map(art.tilesets.map((tileset) => [tileset.id, tileset]));
    expect(tilesets.has('kenney.roguelike-rpg')).toBe(true);
    expect(tilesets.has('kenney.tiny-town')).toBe(true);
    expect(tilesets.has('wuxia.world-palette')).toBe(true);
    expect(tilesets.has('opengameart.puny-world')).toBe(true);
    expect(tilesets.has('opengameart.tiny-rpg-mountain')).toBe(true);
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
    expect(art.layers.find(({ id }) => id === 'world-ocean')?.cells[0]?.every((gid) => gid === 1)).toBe(true);
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
      atlasArt: { columns: number; layers: Record<string, any>[] };
    };
    // The shipped atlas is row-RLE now; swap in a legacy dense layer with an
    // oversized GID so the dense wire path stays validated alongside RLE.
    const denseLayer = raw.atlasArt.layers[0]!;
    delete denseLayer.cellsRle;
    denseLayer.cells = [[10_000]];
    const badFrame = parseWorldMap(raw);
    expect(badFrame.ok).toBe(false);
    if (!badFrame.ok) expect(badFrame.errors.join('\n')).toContain('超出图集');

    const wrongSize = readJson('../data/base/world/world-map.json') as typeof raw;
    wrongSize.atlasArt.columns -= 1;
    const badSize = parseWorldMap(wrongSize);
    expect(badSize.ok).toBe(false);
    if (!badSize.ok) expect(badSize.errors.join('\n')).toContain('超过列数上限');
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
    expect(projectAtlasPosition({ x: 0, y: 100 }, art)).toEqual({ x: 4, y: 4604 });
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
