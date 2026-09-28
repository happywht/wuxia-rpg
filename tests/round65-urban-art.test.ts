import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import type { NpcSetData } from '../src/engine/npc-placement';

const ATLAS_PATH = new URL('../data/assets/kenney/rpg-urban-pack/tilemap_packed.png', import.meta.url);
const LICENSE_PATH = new URL('../data/assets/kenney/rpg-urban-pack/License.txt', import.meta.url);

const ATLAS_COLUMNS = 27;
const ATLAS_ROWS = 18;
const ATLAS_TILE = 16;

function loadMap(path: string) {
  const parsed = parseGridMap(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

function loadNpcs(path: string): NpcSetData {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as NpcSetData;
}

/** Minimal PNG reader for the pack's palette-mode atlas: returns per-pixel palette indices. */
function decodePaletteIndices(buffer: Buffer): { width: number; height: number; indices: Uint8Array } {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 3) throw new Error(`expected 8-bit palette PNG, got ${bitDepth}-bit color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width;
  const indices = new Uint8Array(width * height);
  let prev = new Uint8Array(stride);
  let offset = 0;
  // Unfilter each scanline (filters 0–4, one byte per palette index).
  for (let row = 0; row < height; row++) {
    const filter = raw[offset++];
    const line = raw.subarray(offset, offset + stride);
    offset += stride;
    const current = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left = (x > 0 ? current[x - 1] : 0) ?? 0;
      const up = prev[x] ?? 0;
      const upLeft = (x > 0 ? prev[x - 1] : 0) ?? 0;
      let value = line[x] ?? 0;
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
      current[x] = value;
    }
    indices.set(current, row * stride);
    prev = current;
  }
  return { width, height, indices };
}

function atlasTileIsOpaque(atlas: { width: number; height: number; indices: Uint8Array }, atlasIndex: number): boolean {
  const column = atlasIndex % ATLAS_COLUMNS;
  const row = Math.floor(atlasIndex / ATLAS_COLUMNS);
  for (let y = 0; y < ATLAS_TILE; y++) {
    for (let x = 0; x < ATLAS_TILE; x++) {
      if (atlas.indices[(row * ATLAS_TILE + y) * atlas.width + column * ATLAS_TILE + x] !== 0) return true;
    }
  }
  return false;
}

const atlas = decodePaletteIndices(readFileSync(ATLAS_PATH));

/**
 * Character cells occupy atlas columns 23–26 (frame % 27 >= 23) in four-cell
 * groups, one base outfit per group with four static facing/pose variants —
 * all visually verified on a cell-indexed contact sheet of the packed sheet.
 * Frames 327–335/354–358 are doors/walls and must never be chosen as actors.
 */
const VERIFIED_ACTOR_CELLS = [
  23, 24, 25, 26, // dark casual outfit
  131, 132, 133, 134, // light robe outfit
  239, 240, 241, 242, // red-top outfit
  347, 348, 349, 350, // olive work-overalls outfit
  455, 456, 457, 458, // blue-uniform outfit
];
const PLAYER_FRAME = 24;
const DEFAULT_NPC_FRAME = 131;

/** Environment frames visually confirmed as urban street/plaza surfaces. */
const VERIFIED_ENV_FRAMES = new Set<number>([
  ...[432, 433, 434, 435, 436], // marked/concrete roadway
  ...[439, 440, 441], // plain asphalt
  ...[442, 443, 444, 445], // manhole/utility covers
]);

describe('Round 65 urban pack licensing and atlas integrity', () => {
  it('ships the original Kenney RPG Urban Pack license declaring CC0', () => {
    expect(existsSync(LICENSE_PATH)).toBe(true);
    const license = readFileSync(LICENSE_PATH, 'utf8');
    expect(license).toContain('RPG Urban Pack 1.0');
    expect(license).toContain('Kenney');
    expect(license).toMatch(/Creative Commons Zero,\s*CC0/);
    expect(license).toContain('http://creativecommons.org/publicdomain/zero/1.0/');
  });

  it('packs a 432×288 atlas on an exact 27×18 grid of 16px cells', () => {
    expect(atlas.width).toBe(ATLAS_COLUMNS * ATLAS_TILE);
    expect(atlas.height).toBe(ATLAS_ROWS * ATLAS_TILE);
    for (let index = 0; index < ATLAS_COLUMNS * ATLAS_ROWS; index++) {
      expect(atlasTileIsOpaque(atlas, index)).toBe(true);
    }
  });
});

describe('Round 65 urban actor frames', () => {
  const mapPaths = [
    '../data/base/maps/round-01-grid.json',
    '../data/base/maps/round-10-mist-ferry.json',
    '../data/base/maps/round-62-iron-ridge.json',
  ];

  it.each(mapPaths)('declares the urban actor atlas on %s with opaque player/default frames', (path) => {
    const map = loadMap(path);
    const art = map.data.art;
    expect(art?.actors.tilesetId).toBe('kenney.rpg-urban-pack');
    expect(art?.actors.playerFrame).toBe(PLAYER_FRAME);
    expect(art?.actors.defaultNpcFrame).toBe(DEFAULT_NPC_FRAME);
    const tileset = art?.tilesets.find((entry) => entry.id === 'kenney.rpg-urban-pack');
    expect(tileset).toMatchObject({ columns: ATLAS_COLUMNS, rows: ATLAS_ROWS, spacing: 0, tileCount: 486 });
    for (const frame of [art?.actors.playerFrame, art?.actors.defaultNpcFrame]) {
      expect(frame, 'actor frame must sit in the character columns').toBeDefined();
      expect((frame ?? 0) % ATLAS_COLUMNS).toBeGreaterThanOrEqual(23);
      expect(atlasTileIsOpaque(atlas, frame ?? -1)).toBe(true);
    }
  });

  it('drives every NPC sprite frame from character data on opaque, distinct atlas cells', () => {
    const npcSet = loadNpcs('../data/base/characters/round-03-npcs.json');
    expect(npcSet.npcs.length).toBeGreaterThanOrEqual(14);
    const frames = new Set<number>();
    for (const npc of npcSet.npcs) {
      const frame = npc.spriteFrame;
      expect(frame, npc.id).toBeDefined();
      expect(VERIFIED_ACTOR_CELLS, `${npc.id} frame ${frame} is not a verified character cell`).toContain(frame);
      expect(frame ?? 0).toBeLessThan(ATLAS_COLUMNS * ATLAS_ROWS);
      expect(atlasTileIsOpaque(atlas, frame ?? -1), `${npc.id} frame ${frame}`).toBe(true);
      frames.add(frame ?? -1);
    }
    // 14 distinct cells drawn from 5 base outfits (each outfit has 4 static
    // facing/pose variants in the character columns), none shared with the player.
    expect(frames.size).toBeGreaterThanOrEqual(13);
    expect(frames.has(PLAYER_FRAME)).toBe(false);
  });
});

describe('Round 65 urban street patch on the starting map', () => {
  const map = loadMap('../data/base/maps/round-01-grid.json');
  const art = map.data.art;
  const ground = art?.layers.find((layer) => layer.id === 'urban-street-ground');
  const details = art?.layers.find((layer) => layer.id === 'urban-street-details');
  const originalDecorations = art?.layers.filter((layer) => /^layer-[2-5]$/.test(layer.id)) ?? [];

  it('adds two dedicated urban layers without changing the existing Tiled layers', () => {
    expect(art?.tilesets.map((tileset) => tileset.id)).toEqual([
      'kenney.roguelike-rpg',
      'kenney.tiny-dungeon',
      'kenney.rpg-urban-pack',
    ]);
    expect(art?.layers.map((layer) => layer.id)).toEqual([
      'layer-1', 'layer-2', 'layer-3', 'layer-4', 'layer-5',
      'urban-street-ground', 'urban-street-details',
    ]);
    for (const layer of [ground, details]) {
      expect(layer?.tilesetId).toBe('kenney.rpg-urban-pack');
      expect(layer?.cells.length).toBe(100);
      expect(layer?.cells.every((row) => row.length === 100)).toBe(true);
    }
  });

  it('paints a modest set of opaque street tiles and utility details', () => {
    let groundCells = 0;
    let detailCells = 0;
    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < 100; col++) {
        const groundGid = ground?.cells[row]?.[col] ?? 0;
        const detailGid = details?.cells[row]?.[col] ?? 0;
        for (const [gid, kind] of [[groundGid, 'ground'], [detailGid, 'detail']] as const) {
          const frame = gid & 0x0fffffff;
          if (frame === 0) continue;
          expect(frame, `${kind} at (${col},${row})`).toBeLessThanOrEqual(486);
          expect(atlasTileIsOpaque(atlas, frame - 1), `${kind} gid ${gid} at (${col},${row})`).toBe(true);
        }
        if (groundGid !== 0) groundCells++;
        if (detailGid !== 0) detailCells++;
      }
    }
    expect(groundCells).toBeGreaterThanOrEqual(35);
    expect(detailCells).toBeGreaterThanOrEqual(1);
    expect(groundCells + detailCells).toBeGreaterThanOrEqual(40);
  });

  it('keeps every urban frame out of the atlas character columns and on the verified road palette', () => {
    const used = new Set<number>();
    for (const layer of [ground, details]) {
      for (let row = 0; row < 100; row++) {
        for (let col = 0; col < 100; col++) {
          const frame = (layer?.cells[row]?.[col] ?? 0) & 0x0fffffff;
          if (frame === 0) continue;
          // Character sprites live in atlas columns 23–26; painting one as
          // scenery draws a row of people across the town (the Round 65 bug).
          expect((frame - 1) % ATLAS_COLUMNS, `actor-column frame ${frame - 1} painted at (${col},${row})`).toBeLessThan(23);
          used.add(frame - 1);
        }
      }
    }
    for (const frame of used) {
      expect(VERIFIED_ENV_FRAMES.has(frame), `frame ${frame} is not a visually verified environment cell`).toBe(true);
    }
    // The ground layer uses roadway cells; the details layer uses utility covers.
    expect([...used].some((frame) => frame >= 432 && frame <= 445)).toBe(true);
    expect([...used].some((frame) => frame >= 442 && frame <= 445)).toBe(true);
  });

  it('keeps road ground/details on walkable cells and clear of original terrain art', () => {
    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < 100; col++) {
        const solid = map.data.grid[row]?.[col] === '#';
        const groundGid = ground?.cells[row]?.[col] ?? 0;
        const detailGid = details?.cells[row]?.[col] ?? 0;
        if (groundGid !== 0 || detailGid !== 0) {
          expect(solid, `urban surface on solid (${col},${row})`).toBe(false);
          for (const original of originalDecorations) {
            expect(original.cells[row]?.[col] ?? 0, `${original.id} overwritten at (${col},${row})`).toBe(0);
          }
        }
        if (detailGid !== 0) expect(groundGid, `detail without road underlay at (${col},${row})`).not.toBe(0);
      }
    }
  });

  it('preserves spawn, NPC positions and street reachability with the original collision', () => {
    expect(map.playerStart).toEqual({ col: 43, row: 37 });
    expect(map.canEnter(43, 37)).toBe(true);
    const npcSet = loadNpcs('../data/base/characters/round-03-npcs.json');
    for (const npc of npcSet.npcs) {
      if (npc.mapResourceId !== 'map.round-01-grid') continue;
      expect(map.canEnter(npc.position.col, npc.position.row), `${npc.id} at (${npc.position.col},${npc.position.row})`).toBe(true);
      const path = findGridPath(
        map,
        { col: map.playerStart.col, row: map.playerStart.row },
        { col: npc.position.col, row: npc.position.row },
      );
      expect(path, `${npc.id} reachable from spawn`).not.toBeNull();
    }
    // The road gate towards the ferry region stays reachable as well.
    const gate = findGridPath(
      map,
      { col: map.playerStart.col, row: map.playerStart.row },
      { col: 90, row: 50 },
    );
    expect(gate).not.toBeNull();
  });
});
