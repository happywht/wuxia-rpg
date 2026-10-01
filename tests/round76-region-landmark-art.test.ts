import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';

const ATLAS_PATH = new URL('../data/assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png', import.meta.url);
const LICENSE_PATH = new URL('../data/assets/opengameart/rpg-town-pixel-art-assets/License.txt', import.meta.url);
const TILESET_ID = 'opengameart.rpg-town';
const FRAME_WHITELIST = new Set([23, 24, 25, 26, 28, 29, 30, 108, 113, 182, 183, 184, 185, 186]);

const MAPS = [
  {
    file: '../data/base/maps/round-01-grid.json',
    id: 'map.round-01-grid',
    layer: 'round76-jiangnan-orchard',
    // R128 approved exactly (42,37): road decoration moves to ground; strict diff is tested separately.
    collisionHash: '84cde6075dfc2f183b6f65bc12e3ee6698bbfc202641388918c91977769d7618',
    priorArtHash: '2dab1430c3f1ac77fd6f8c48fdcffb1bd954d6d2b514da8f0ccda2f74cff169f',
    start: { col: 43, row: 37 },
  },
  {
    file: '../data/base/maps/round-10-mist-ferry.json',
    id: 'map.round-10-mist-ferry',
    layer: 'round76-mist-river-market',
    collisionHash: '2de5414beda5988ca79b08f7ef1fabb76fa295ac4777fd243571fb9cbce6e754',
    priorArtHash: '930be0ba16ba53bc774b4f3a3818c9ad3ef6720e26446cb318d2a7aca1efe0dc',
    start: { col: 7, row: 7 },
  },
  {
    file: '../data/base/maps/round-62-iron-ridge.json',
    id: 'map.round-62-iron-ridge',
    layer: 'round76-iron-ridge-pass',
    collisionHash: '19198b97b771cebbbba05a52115213940d3406beedd163ae726bbe13ba60b3ff',
    priorArtHash: 'da204b89b5338b93dd70456e868b55771efbf6fcf71b6754f8d8ba84afd8e66d',
    start: { col: 4, row: 7 },
  },
  {
    file: '../data/base/maps/round-67-salt-road.json',
    id: 'map.round-67-salt-road',
    layer: 'round76-salt-well-and-post',
    collisionHash: '036340bed97f662c5b166ca94eaffbd379194e00104b6bc3511ee21a3c3353b3',
    priorArtHash: '153482efec0462d276b1d5941763aa9cae87b6ee4501904915f662d1a3e1cda5',
    start: { col: 95, row: 74 },
  },
  {
    file: '../data/base/maps/round-74-cloud-ridge.json',
    id: 'map.round-74-cloud-ridge',
    layer: 'round76-cloud-bridge-rails',
    // R112 approved Cloud-only trails; all four other frozen maps stay unchanged.
    collisionHash: '09aed5b077c9cbf3ef58cb9185bf8bdf1b0278fe3023e0c0a6c39827b4d9347b',
    priorArtHash: '651ac5c88e1d80e9213e3a9f4e80e0a53eccdc22ddc4fde9d86bf7e034596c5a',
    start: { col: 50, row: 97 },
  },
] as const;

interface RgbaPng {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode the pack's non-interlaced 8-bit RGBA PNG so every chosen frame is checked for real pixels. */
function decodeRgbaPng(buffer: Buffer): RgbaPng {
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = -1;
  const imageData: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const kind = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd + 4 > buffer.length) throw new Error(`truncated PNG ${kind} chunk`);
    const chunk = buffer.subarray(chunkStart, chunkEnd);
    if (kind === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8] ?? 0;
      colorType = chunk[9] ?? 0;
      interlace = chunk[12] ?? -1;
    } else if (kind === 'IDAT') {
      imageData.push(chunk);
    } else if (kind === 'IEND') {
      break;
    }
    offset = chunkEnd + 4;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`expected non-interlaced 8-bit RGBA PNG, got bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(imageData));
  const pixels = new Uint8Array(height * stride);
  let source = 0;
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[source++];
    if (filter === undefined || filter > 4) throw new Error(`unsupported PNG filter ${String(filter)}`);
    const current = new Uint8Array(stride);
    for (let index = 0; index < stride; index++) {
      const byte = raw[source++];
      if (byte === undefined) throw new Error(`truncated PNG row ${row}`);
      const left = index >= 4 ? current[index - 4] ?? 0 : 0;
      const above = previous[index] ?? 0;
      const upperLeft = index >= 4 ? previous[index - 4] ?? 0 : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      current[index] = (byte + predictor) & 0xff;
    }
    pixels.set(current, row * stride);
    previous = current;
  }
  return { width, height, pixels };
}

function loadMap(path: string) {
  const parsed = parseGridMap(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map.data;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function alphaPixelCount(atlas: RgbaPng, gid: number): number {
  const index = gid - 1;
  const originX = (index % 22) * 16;
  const originY = Math.floor(index / 22) * 16;
  let count = 0;
  for (let y = originY; y < originY + 16; y++) {
    for (let x = originX; x < originX + 16; x++) {
      if ((atlas.pixels[(y * atlas.width + x) * 4 + 3] ?? 0) > 0) count++;
    }
  }
  return count;
}

const atlas = decodeRgbaPng(readFileSync(ATLAS_PATH));

describe('Round 76 CC0 environment atlas', () => {
  it('keeps the author license with the exact RGBA 16px sheet', () => {
    expect(existsSync(LICENSE_PATH)).toBe(true);
    const license = readFileSync(LICENSE_PATH, 'utf8');
    expect(license).toMatch(/License \(CC0\)/i);
    expect(license).toContain('creativecommons.org/publicdomain/zero/1.0/');
    expect(license).toContain('Luis Zuno');
    expect(license).toContain('ansimuz');
    expect(atlas.width).toBe(352);
    expect(atlas.height).toBe(288);
    expect(atlas.width / 16).toBe(22);
    expect(atlas.height / 16).toBe(18);
    const alpha = atlas.pixels.filter((_, index) => index % 4 === 3);
    expect(alpha.includes(0)).toBe(true);
    expect(alpha.some((value) => value > 0)).toBe(true);
  });

  it('uses only verified, non-empty environmental cells outside the sheet credit', () => {
    expect([...FRAME_WHITELIST].every((gid) => gid < 345)).toBe(true);
    for (const gid of FRAME_WHITELIST) {
      expect(gid).toBeGreaterThanOrEqual(1);
      expect(gid).toBeLessThanOrEqual(396);
      expect(alphaPixelCount(atlas, gid), `frame ${gid}`).toBeGreaterThan(0);
    }
  });
});

describe('Round 76 five-region art layers', () => {
  it.each(MAPS)('$id preserves its current approved 100×100 collision and terrain art', (spec) => {
    const map = loadMap(spec.file);
    const art = map.art;
    expect(map.id).toBe(spec.id);
    expect(map.columns).toBe(100);
    expect(map.rows).toBe(100);
    expect(map.grid).toHaveLength(100);
    expect(map.grid.every((line) => line.length === 100)).toBe(true);
    expect(map.playerStart).toEqual(spec.start);
    expect(sha256(map.grid)).toBe(spec.collisionHash);
    expect(art).toBeDefined();
    if (art === undefined) throw new Error(`${spec.id} is missing art`);

    const priorTerrainArt = {
      tileSize: art.tileSize,
      tilesets: art.tilesets.filter((tileset) => tileset.id !== TILESET_ID && tileset.id !== 'opengameart.puny-characters'),
      // Round 78 adds renderer routing metadata without changing historical tile cells.
      layers: art.layers
        .filter((layer) => !layer.id.startsWith('round76-'))
        .map(({ id, tilesetId, cells }) => ({ id, tilesetId, cells })),
    };
    expect(sha256(priorTerrainArt)).toBe(spec.priorArtHash);
    expect(art.actors.tilesetId).toBe('opengameart.puny-characters');

    const r76Layers = art.layers.filter((layer) => layer.id.startsWith('round76-'));
    expect(r76Layers).toHaveLength(1);
    const layer = r76Layers[0];
    expect(layer?.id).toBe(spec.layer);
    expect(layer?.tilesetId).toBe(TILESET_ID);
    expect(layer?.cells).toHaveLength(100);
    expect(layer?.cells.every((line) => line.length === 100)).toBe(true);
    expect(layer?.cells.flat().filter((gid) => gid !== 0).length).toBeGreaterThanOrEqual(4);

    const tileset = art.tilesets.find((entry) => entry.id === TILESET_ID);
    expect(tileset).toEqual({
      id: TILESET_ID,
      image: 'assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png',
      tileSize: 16,
      columns: 22,
      rows: 18,
      spacing: 0,
      tileCount: 396,
    });
    const used = new Set(layer?.cells.flat().filter((gid) => gid !== 0) ?? []);
    expect([...used].every((gid) => FRAME_WHITELIST.has(gid))).toBe(true);
    expect([...used].every((gid) => alphaPixelCount(atlas, gid) > 0)).toBe(true);
  });

  it('keeps event, landmark, gate, player, NPC, schedule and encounter cells clear', () => {
    const world = JSON.parse(readFileSync(new URL('../data/base/world/world-map.json', import.meta.url), 'utf8')) as {
      landmarks?: Array<{ mapResourceId: string; col: number; row: number }>;
      events?: Array<{ mapResourceId: string; col: number; row: number }>;
      transitions?: Array<{ from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }>;
    };
    const manifest = JSON.parse(readFileSync(new URL('../data/base/manifest.json', import.meta.url), 'utf8')) as {
      resources: Array<{ schema: string; path: string }>;
    };
    const protectedByMap = new Map<string, Set<string>>();
    const protect = (mapId: string, point: { col: number; row: number }) => {
      const cells = protectedByMap.get(mapId) ?? new Set<string>();
      cells.add(`${point.col},${point.row}`);
      protectedByMap.set(mapId, cells);
    };
    for (const item of [...(world.landmarks ?? []), ...(world.events ?? [])]) protect(item.mapResourceId, item);
    for (const transition of world.transitions ?? []) {
      protect(transition.from.mapResourceId, transition.from);
      protect(transition.to.mapResourceId, transition.to);
    }
    for (const resource of manifest.resources) {
      if (resource.schema !== 'npc-set' && resource.schema !== 'battle-encounters') continue;
      const data = JSON.parse(readFileSync(new URL(`../data/base/${resource.path}`, import.meta.url), 'utf8')) as {
        npcs?: Array<{ mapResourceId: string; position: { col: number; row: number }; schedule?: Array<{ position: { col: number; row: number } }> }>;
        encounters?: Array<{ mapResourceId: string; position: { col: number; row: number } }>;
      };
      for (const npc of data.npcs ?? []) {
        protect(npc.mapResourceId, npc.position);
        for (const entry of npc.schedule ?? []) protect(npc.mapResourceId, entry.position);
      }
      for (const encounter of data.encounters ?? []) protect(encounter.mapResourceId, encounter.position);
    }

    for (const spec of MAPS) {
      const map = loadMap(spec.file);
      protect(map.id, map.playerStart);
      const layer = map.art?.layers.find((candidate) => candidate.id === spec.layer);
      expect(layer).toBeDefined();
      for (const key of protectedByMap.get(map.id) ?? []) {
        const [colText, rowText] = key.split(',');
        if (colText === undefined || rowText === undefined) throw new Error(`invalid protected cell ${key}`);
        const col = Number(colText);
        const row = Number(rowText);
        expect(layer?.cells[row]?.[col], `${map.id} protected cell ${key}`).toBe(0);
      }
    }
  });

  it('ships the atlas and original CC0 license through the release smoke allowlist', () => {
    const packageRelease = readFileSync(new URL('../scripts/package-release.mjs', import.meta.url), 'utf8');
    const packageSmoke = readFileSync(new URL('../scripts/smoke-round-47.mjs', import.meta.url), 'utf8');
    expect(packageRelease).toContain('assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png');
    expect(packageRelease).toContain('assets/opengameart/rpg-town-pixel-art-assets/License.txt');
    expect(packageSmoke).toContain('assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png');
    expect(packageSmoke).toContain('assets/opengameart/rpg-town-pixel-art-assets/License.txt');
  });
});
