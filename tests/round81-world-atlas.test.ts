/** Round 81: expanded movable world atlas, CC0 extension art and stable old projections. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv, { type AnySchema } from 'ajv';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { buildWorldAtlasOverlays, projectAtlasPosition, projectWorldCell } from '../src/engine/world-atlas-view';
import { createMapViewport, panMapViewport } from '../src/engine/map-viewport';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import type { GridMap } from '../src/engine/grid-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

const rawWorld = readJson('../data/base/world/world-map.json') as Record<string, unknown>;
const round80AnchorPositions = new Map([
  ['map.round-01-grid', { x: 18.565022, y: 40.853147 }],
  ['map.round-10-mist-ferry', { x: 59.408072, y: 54.174825 }],
  ['map.round-62-iron-ridge', { x: 59.408072, y: 23.090909 }],
  ['map.round-67-salt-road', { x: 18.565022, y: 54.174825 }],
  ['map.round-74-cloud-ridge', { x: 79.829596, y: 45.293706 }],
  ['map.round-79-isles', { x: 50, y: 89 }],
]);
const round80LayerHashes: Record<string, string> = {
  'world-ocean': 'a0db55b7e150f2521a8c0a445419f75f61b96202d290433eb91f6b7ea1239b62',
  'world-land': '4f7a68746c63f20f48567622d0a9b66d935029054379d4278b55df2aff0d6a20',
  'world-coast': '3736d654eda8eb33fe3107564f6eae033f1233161a5d5ee34ac7122d81a76a5f',
  'world-forest': 'd50b6397a70be9f037fc626d835b25c171d393aacdf43148017ecfac2006097a',
  'world-relief': '0a4e58af8700c12e9a5fddac6b24d0cb20c099b497e6ecef41dcd4f7254b5588',
  'world-roads': '5b510f8df63578300c02d60daff757f6c08306c3e1b6576fad5802a1ccb3bedc',
  'world-settlements': '00afeb51aa5024223429373cbe8cb402bf4a07f80b0b907457e5929c5d93c112',
  'world-r79-shoal-water': '2e7a0e61b0ee44218d05849035a8ad08cf85185d77273700e2e724cef69b2b09',
  'world-r79-shoal-sand': 'ee2184c3c7713e6fc704b6e80b393b3402e358de4c39c42d27ae269c7eba9a26',
  'world-r79-shoal-land': '38383782275c432686246ed41d3bf5f50a1126906aa6e2f85e3a31ec0616e04f',
  'world-r79-shoal-pines': '45a0afa5986638cb30b6e9d2d9d38dc01b3a8787319f1ce4568a1f89ba6e45be',
  'world-r79-gate-routes': 'a54fbdacfe85d1bfbe40db70e2b8ade3f1431e8f8ff3ebd3592e8c40b0192f56',
};

function parseCurrentWorld() {
  const parsed = parseWorldMap(rawWorld);
  if (!parsed.ok || parsed.data.atlasArt === undefined) throw new Error('336×224 全域舆图未通过运行时解析。');
  return parsed.data;
}

function loadMaps(): Map<string, GridMap> {
  const manifest = readJson('../data/base/manifest.json') as {
    resources: { id: string; path: string; schema: string }[];
  };
  const maps = new Map<string, GridMap>();
  for (const entry of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
    const parsed = parseGridMap(readJson(`../data/base/${entry.path}`));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    maps.set(entry.id, parsed.map);
  }
  return maps;
}

describe('Round 81 expanded movable atlas', () => {
  it('passes JSON Schema and runtime validation at 336×224 while enforcing a 384-cell cap', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    expect(validate(rawWorld), JSON.stringify(validate.errors)).toBe(true);
    const data = parseCurrentWorld();
    expect(data.atlasArt).toMatchObject({
      columns: 336, rows: 224, tileSize: 16,
      regionFootprint: { columns: 35.84, rows: 23.04 },
    });

    const tooWide = structuredClone(rawWorld) as { atlasArt: { columns: number } };
    tooWide.atlasArt.columns = 385;
    const rejected = parseWorldMap(tooWide);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors.join('\n')).toContain('1–384');
  });

  it('retains all Round 80 atlas cells inside the original 224×144 footprint', () => {
    const data = parseCurrentWorld();
    const oldLayers = data.atlasArt!.layers.filter(({ id }) => id in round80LayerHashes);
    expect(oldLayers).toHaveLength(Object.keys(round80LayerHashes).length);
    for (const layer of oldLayers) {
      const originalArea = layer.cells.slice(0, 144).map((row) => row.slice(0, 224));
      const hash = createHash('sha256').update(JSON.stringify(originalArea)).digest('hex');
      expect(hash, layer.id).toBe(round80LayerHashes[layer.id]);
    }
  });

  it('uses the registered Puny World CC0 tileset to paint both eastern land and southern isles', () => {
    const data = parseCurrentWorld();
    const art = data.atlasArt!;
    const source = art.tilesets.find(({ id }) => id === 'opengameart.puny-world');
    expect(source?.image).toBe('assets/opengameart/puny-world/tileset.png');
    const references = readFileSync(new URL('../docs/REFERENCES.md', import.meta.url), 'utf8');
    expect(references).toContain('https://opengameart.org/content/16x16-puny-world-tileset');
    expect(references).toContain('OpenGameArt：Shade 的 16x16 Puny World Tileset');

    const cells = (id: string): number[][] => art.layers.find((layer) => layer.id === id)!.cells;
    for (const id of [
      'world-r81-expanse-water', 'world-r81-expanse-sand',
      'world-r81-expanse-land', 'world-r81-expanse-pines',
    ]) {
      expect(cells(id).flat().filter((gid) => gid > 0).length, id).toBeGreaterThan(0);
    }
    expect(cells('world-r81-expanse-land').some((row, y) => y < 144 && row.slice(224).some((gid) => gid > 0))).toBe(true);
    expect(cells('world-r81-expanse-land').slice(144).some((row) => row.some((gid) => gid > 0))).toBe(true);
    expect(data.regions).toHaveLength(6);
    expect(data.transitions).toHaveLength(10);
  });

  it('keeps six region centers plus every old gate, landmark and player projection in the same atlas pixels', () => {
    const data = parseCurrentWorld();
    const art = data.atlasArt!;
    const maps = loadMaps();
    const world = assembleWorldMap(data, maps);
    expect('ok' in world).toBe(false);
    if ('ok' in world) return;
    const oldArt = { ...art, columns: 224, rows: 144, regionFootprint: undefined };

    for (const region of data.regions) {
      const oldPosition = round80AnchorPositions.get(region.mapResourceId)!;
      const before = projectAtlasPosition(oldPosition, oldArt);
      const after = projectAtlasPosition(region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), region.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), region.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const endpoint of world.transitions.flatMap(({ from, to }) => [from, to])) {
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === endpoint.mapResourceId)!;
      const map = maps.get(endpoint.mapResourceId)!;
      const oldPosition = round80AnchorPositions.get(region.mapResourceId)!;
      const before = projectWorldCell(endpoint, map, oldPosition, oldArt);
      const after = projectWorldCell(endpoint, map, region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), region.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), region.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const landmark of world.landmarks) {
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === landmark.mapResourceId)!;
      const map = maps.get(landmark.mapResourceId)!;
      const oldPosition = round80AnchorPositions.get(region.mapResourceId)!;
      const before = projectWorldCell(landmark, map, oldPosition, oldArt);
      const after = projectWorldCell(landmark, map, region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), landmark.id).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), landmark.id).toBeLessThanOrEqual(0.001);
    }

    const player = buildWorldAtlasOverlays(world, maps, 'map.round-01-grid', { col: 43, row: 37 }, new Set()).player!;
    const startRegion = world.regions.find(({ mapResourceId }) => mapResourceId === 'map.round-01-grid')!;
    const beforePlayer = projectWorldCell({ col: 43, row: 37 }, maps.get(startRegion.mapResourceId)!,
      round80AnchorPositions.get(startRegion.mapResourceId)!, oldArt);
    expect(Math.abs(player.x - beforePlayer.x)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(player.y - beforePlayer.y)).toBeLessThanOrEqual(0.001);
  });

  it('fits the expanded atlas and can restore the fit after large pans', () => {
    const bounds = { x: 48, y: 116, width: 616, height: 340 };
    const width = 336 * 16;
    const height = 224 * 16;
    const fitted = createMapViewport(bounds, width, height);
    expect(fitted.scale).toBeCloseTo(bounds.height / height);
    const panned = panMapViewport(bounds, width, height,
      { ...fitted, scale: fitted.scale * 4 }, 9000, -9000);
    expect(panned).not.toEqual(fitted);
    const reset = createMapViewport(bounds, width, height);
    expect(reset).toEqual(fitted);
    expect(width * reset.scale).toBeLessThanOrEqual(bounds.width);
    expect(height * reset.scale).toBeLessThanOrEqual(bounds.height);
  });
});
