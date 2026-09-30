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
const round83RegionPositions = new Map([
  ['map.round-01-grid', { x: 12.35820867, y: 26.19730951 }],
  ['map.round-10-mist-ferry', { x: 39.54626882, y: 34.7399102 }],
  ['map.round-62-iron-ridge', { x: 39.54626882, y: 14.80717483 }],
  ['map.round-67-salt-road', { x: 12.35820867, y: 34.7399102 }],
  ['map.round-74-cloud-ridge', { x: 53.14029823, y: 29.04484286 }],
  ['map.round-79-isles', { x: 33.28358209, y: 57.07174888 }],
  ['map.round-82-east-coast', { x: 85, y: 44 }],
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
const round83AtlasLayerHashes: Record<string, string> = {
  'world-ocean': '1db6e0a6b717ac05bd365da1cc8a6cdcdc1e1ece1c5913f2de2e7ba7761bcec3',
  'world-land': '2cfa6b7116a4d0b5ad173450b4af05b9bbad84edc2d9bf1b7bd196113931a31d',
  'world-coast': '1606b66b6d1a61884b7a5fa7cc36fb5cbe5dc9702dbc6c3acfac27a8dbdb95b5',
  'world-forest': '7bbd2bde03f3fadf8287f099a42ed50bfb6bd5e9769f4f9c8133bad1281d25cf',
  'world-relief': 'c32c96749384edbc89ebdff908f6a07d5f1f980b966177926b9bad702ef089e9',
  'world-roads': '3011c93a5865497b1941519b8a835408db99e2b1820ad7bf3b013e8d12629907',
  'world-settlements': '2ef28aa006d7b38fea48f0e4b77166df18a5ea2f90fbe17f8475818d76b0347c',
  'world-r79-shoal-water': '57fde3a5471aa4b8b25806405afb55f7a029956f2db81d1ea25bfc84d72a7ad2',
  'world-r79-shoal-sand': 'feb6a4e9901784ceab4907ebc0cbb66de8193d746f922ad40c97ab18adc7d7ce',
  'world-r79-shoal-land': '1e5da3893bf796d061303d40d5e8ed4a90af2945bb12ffc97c88af7790f41e50',
  'world-r79-shoal-pines': '287af3dff020d0cf8b20ae83ed24c52754d5760829aedbe5eddaedc7210d5a8f',
  'world-r79-gate-routes': '1f6fdf5822ebae8ee2fbc654135b987a064bd1e0c5751fad1f0a2675f9a5f368',
  'world-r81-expanse-water': '0c32075827a3f5ee2adc606a83afd337d2cfbbc8284e8dccc386c9f31f2e77cb',
  'world-r81-expanse-sand': 'b4bb13da89a73e73755e3b0f7164da89a49e8ad5a8431960546437b717f46ef6',
  'world-r81-expanse-land': 'e56134bef2d848e312605dd23225c8831ac6eaacd6b74704c6b958aafdb44c4b',
  'world-r81-expanse-pines': 'acc88fad141e008c83b9abdd9b08a8f4915e542609f1b2d482df684c98e424a4',
};

function parseCurrentWorld() {
  const parsed = parseWorldMap(rawWorld);
  if (!parsed.ok || parsed.data.atlasArt === undefined) throw new Error('640×448 全域舆图未通过运行时解析。');
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

describe('Round 81–85 expanded movable atlas', () => {
  it('passes JSON Schema and runtime validation at 640×448 while enforcing a 640-cell cap', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    expect(validate(rawWorld), JSON.stringify(validate.errors)).toBe(true);
    const data = parseCurrentWorld();
    expect(data.atlasArt).toMatchObject({
      columns: 640, rows: 448, tileSize: 16,
      regionFootprint: { columns: 35.84, rows: 23.04 },
    });

    const tooWide = structuredClone(rawWorld) as { atlasArt: { columns: number } };
    tooWide.atlasArt.columns = 641;
    expect(validate(tooWide)).toBe(false);
    const rejected = parseWorldMap(tooWide);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors.join('\n')).toContain('1–640');

    const tooTall = structuredClone(rawWorld) as { atlasArt: { rows: number } };
    tooTall.atlasArt.rows = 641;
    expect(validate(tooTall)).toBe(false);
    expect(parseWorldMap(tooTall).ok).toBe(false);
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

  it('retains every Round 83 atlas art cell inside the original 336×224 canvas', () => {
    const data = parseCurrentWorld();
    const layers = new Map(data.atlasArt!.layers.map((layer) => [layer.id, layer]));
    for (const [id, expected] of Object.entries(round83AtlasLayerHashes)) {
      const layer = layers.get(id);
      expect(layer, id).toBeDefined();
      const oldArea = layer!.cells.slice(0, 224).map((row) => row.slice(0, 336));
      const hash = createHash('sha256').update(JSON.stringify(oldArea)).digest('hex');
      expect(hash, id).toBe(expected);
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
    expect(data.regions).toHaveLength(12);
    expect(data.transitions).toHaveLength(22);
  });

  it('keeps the six Round 80 region centers plus every old gate, landmark and player projection in the same atlas pixels', () => {
    const data = parseCurrentWorld();
    const art = data.atlasArt!;
    const maps = loadMaps();
    const world = assembleWorldMap(data, maps);
    expect('ok' in world).toBe(false);
    if ('ok' in world) return;
    const oldArt = { ...art, columns: 224, rows: 144, regionFootprint: undefined };

    for (const region of data.regions) {
      const oldPosition = round80AnchorPositions.get(region.mapResourceId);
      if (oldPosition === undefined) continue;
      const before = projectAtlasPosition(oldPosition, oldArt);
      const after = projectAtlasPosition(region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), region.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), region.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const endpoint of world.transitions.flatMap(({ from, to }) => [from, to])) {
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === endpoint.mapResourceId)!;
      const map = maps.get(endpoint.mapResourceId)!;
      const oldPosition = round80AnchorPositions.get(region.mapResourceId);
      if (oldPosition === undefined) continue;
      const before = projectWorldCell(endpoint, map, oldPosition, oldArt);
      const after = projectWorldCell(endpoint, map, region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), region.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), region.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const landmark of world.landmarks) {
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === landmark.mapResourceId)!;
      const map = maps.get(landmark.mapResourceId)!;
      const oldPosition = round80AnchorPositions.get(region.mapResourceId);
      if (oldPosition === undefined) continue;
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

  it('keeps all seven Round 83 region centers and their existing gate/landmark projections fixed', () => {
    const data = parseCurrentWorld();
    const art = data.atlasArt!;
    const maps = loadMaps();
    const world = assembleWorldMap(data, maps);
    expect('ok' in world).toBe(false);
    if ('ok' in world) return;
    const oldArt = { ...art, columns: 336, rows: 224 };

    for (const region of data.regions) {
      const oldPosition = round83RegionPositions.get(region.mapResourceId);
      if (oldPosition === undefined) continue;
      const before = projectAtlasPosition(oldPosition, oldArt);
      const after = projectAtlasPosition(region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), region.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), region.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const endpoint of world.transitions.flatMap(({ from, to }) => [from, to])) {
      const oldPosition = round83RegionPositions.get(endpoint.mapResourceId);
      if (oldPosition === undefined) continue;
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === endpoint.mapResourceId)!;
      const before = projectWorldCell(endpoint, maps.get(endpoint.mapResourceId)!, oldPosition, oldArt);
      const after = projectWorldCell(endpoint, maps.get(endpoint.mapResourceId)!, region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), endpoint.mapResourceId).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), endpoint.mapResourceId).toBeLessThanOrEqual(0.001);
    }
    for (const landmark of world.landmarks) {
      const oldPosition = round83RegionPositions.get(landmark.mapResourceId);
      if (oldPosition === undefined) continue;
      const region = world.regions.find(({ mapResourceId }) => mapResourceId === landmark.mapResourceId)!;
      const before = projectWorldCell(landmark, maps.get(landmark.mapResourceId)!, oldPosition, oldArt);
      const after = projectWorldCell(landmark, maps.get(landmark.mapResourceId)!, region.atlasPosition, art);
      expect(Math.abs(after.x - before.x), landmark.id).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), landmark.id).toBeLessThanOrEqual(0.001);
    }
  });

  it('fits the expanded atlas and can restore the fit after large pans', () => {
    const bounds = { x: 48, y: 116, width: 616, height: 340 };
    const width = 640 * 16;
    const height = 448 * 16;
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
