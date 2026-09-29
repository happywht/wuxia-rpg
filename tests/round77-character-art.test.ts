import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { parseGridMap, selectGridMapPlayerFrame } from '../src/engine/grid-map';

const ATLAS_PATH = new URL('../data/assets/opengameart/puny-characters/actors.png', import.meta.url);
const NOTICE_PATH = new URL('../data/assets/opengameart/puny-characters/NOTICE.txt', import.meta.url);
const MAPS = [
  { path: '../data/base/maps/round-01-grid.json', collisionHash: '0ebca5f79f1718d31f33cc9efa3e3c9f022a676122772ebc65c80882d5c55519' },
  { path: '../data/base/maps/round-10-mist-ferry.json', collisionHash: '2de5414beda5988ca79b08f7ef1fabb76fa295ac4777fd243571fb9cbce6e754' },
  { path: '../data/base/maps/round-62-iron-ridge.json', collisionHash: '19198b97b771cebbbba05a52115213940d3406beedd163ae726bbe13ba60b3ff' },
  { path: '../data/base/maps/round-67-salt-road.json', collisionHash: '036340bed97f662c5b166ca94eaffbd379194e00104b6bc3511ee21a3c3353b3' },
  { path: '../data/base/maps/round-74-cloud-ridge.json', collisionHash: '1de394f64c39ad3c6481800534c4f024a4536d3b949ef39a9331cefbc0a846ec' },
] as const;

interface RgbaPng {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodeRgbaPng(bytes: Buffer): RgbaPng {
  if (bytes.length < 33 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = -1;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? -1;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error('expected non-interlaced RGBA PNG');
  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(compressed));
  const pixels = new Uint8Array(height * stride);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[sourceOffset++];
    if (filter === undefined || filter > 4) throw new Error('unsupported PNG filter ' + String(filter));
    const current = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const value = raw[sourceOffset++];
      if (value === undefined) throw new Error('truncated PNG row');
      const left = x >= 4 ? current[x - 4] ?? 0 : 0;
      const above = previous[x] ?? 0;
      const upperLeft = x >= 4 ? previous[x - 4] ?? 0 : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      current[x] = (value + predictor) & 0xff;
    }
    pixels.set(current, y * stride);
    previous = current;
  }
  return { width, height, pixels };
}

function frameAlphaCount(atlas: RgbaPng, frameIndex: number): number {
  const x0 = (frameIndex % 20) * 16;
  const y0 = Math.floor(frameIndex / 20) * 16;
  let count = 0;
  for (let y = y0; y < y0 + 16; y++) {
    for (let x = x0; x < x0 + 16; x++) {
      if ((atlas.pixels[(y * atlas.width + x) * 4 + 3] ?? 0) !== 0) count++;
    }
  }
  return count;
}

function loadRaw(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;
}

function loadMap(path: string) {
  const parsed = parseGridMap(loadRaw(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map.data;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const atlas = decodeRgbaPng(readFileSync(ATLAS_PATH));

describe('Round 77 CC0 character atlas and direction data', () => {
  it('keeps source and CC0 provenance with a compact 16px transparent atlas', () => {
    expect(existsSync(NOTICE_PATH)).toBe(true);
    const notice = readFileSync(NOTICE_PATH, 'utf8');
    expect(notice).toContain('Puny Characters by Shade');
    expect(notice).toContain('https://opengameart.org/content/puny-characters');
    expect(notice).toContain('CC0 1.0');
    expect(notice).toContain('creativecommons.org/publicdomain/zero/1.0/');
    expect(atlas).toMatchObject({ width: 320, height: 256 });
    expect(atlas.width / 16).toBe(20);
    expect(atlas.height / 16).toBe(16);
    expect(Array.from({ length: 320 }, (_, frame) => frameAlphaCount(atlas, frame)).every((count) => count > 0)).toBe(true);
    const appearanceSignatures = new Set(Array.from({ length: 10 }, (_, appearance) => {
      const frame = appearance * 32;
      const x0 = (frame % 20) * 16;
      const y0 = Math.floor(frame / 20) * 16;
      const bytes: number[] = [];
      for (let y = y0; y < y0 + 16; y++) {
        for (let x = x0; x < x0 + 16; x++) {
          const offset = (y * atlas.width + x) * 4;
          bytes.push(atlas.pixels[offset] ?? 0, atlas.pixels[offset + 1] ?? 0,
            atlas.pixels[offset + 2] ?? 0, atlas.pixels[offset + 3] ?? 0);
        }
      }
      return createHash('sha1').update(Buffer.from(bytes)).digest('hex');
    }));
    expect(appearanceSignatures.size).toBe(10);
  });

  it('uses direction and three-frame walking data in all five playable regions without changing collision', () => {
    for (const entry of MAPS) {
      const map = loadMap(entry.path);
      expect(sha256(map.grid)).toBe(entry.collisionHash);
      expect(map.art?.actors.tilesetId).toBe('opengameart.puny-characters');
      expect(map.art?.actors.playerFrames?.idle).toEqual({ down: 256, right: 264, up: 272, left: 280 });
      expect(map.art?.actors.playerFrames?.walk).toEqual({
        down: [257, 258, 259],
        right: [265, 266, 267],
        up: [273, 274, 275],
        left: [281, 282, 283],
      });
      const actors = map.art?.actors;
      if (actors === undefined) throw new Error(entry.path + ': missing actors');
      expect(selectGridMapPlayerFrame(actors, 'left', false)).toBe(280);
      expect(selectGridMapPlayerFrame(actors, 'up', true, 2)).toBe(275);
      expect(selectGridMapPlayerFrame(actors, 'right', true, 4)).toBe(266);
    }
  });

  it('gives NPCs varied static looks and keeps older map MODs compatible', () => {
    const npcFiles = [
      '../data/base/characters/round-03-npcs.json',
      '../data/base/characters/round-74-cloud-ridge-npcs.json',
    ];
    const frames = npcFiles.flatMap((path) => {
      const set = loadRaw(path) as { npcs: Array<{ spriteFrame?: number }> };
      return set.npcs.map((npc) => npc.spriteFrame);
    });
    expect(frames).toHaveLength(16);
    expect(frames.every((frame) => typeof frame === 'number' && frame >= 0 && frame < 320 && frame % 4 === 0)).toBe(true);
    expect(new Set(frames.map((frame) => Math.floor((frame ?? 0) / 32))).size).toBe(10);

    const oldMapRaw = loadRaw('../data/base/maps/round-01-grid.json');
    const oldActors = (oldMapRaw.art as { actors: Record<string, unknown> }).actors;
    delete oldActors.playerFrames;
    const oldMapResult = parseGridMap(oldMapRaw);
    expect(oldMapResult.ok).toBe(true);
    if (oldMapResult.ok) {
      const actors = oldMapResult.map.data.art?.actors;
      expect(actors?.playerFrames).toBeUndefined();
      if (actors !== undefined) {
        expect(selectGridMapPlayerFrame(actors, 'left', true, 2)).toBe(actors.playerFrame);
      }
    }
    const exampleModResult = parseGridMap(loadRaw('../mods/example/maps/round-01-grid.json'));
    expect(exampleModResult.ok).toBe(true);
  });

  it('ships the generated atlas and its CC0 provenance notice through release checks', () => {
    const packageRelease = readFileSync(new URL('../scripts/package-release.mjs', import.meta.url), 'utf8');
    const packageSmoke = readFileSync(new URL('../scripts/smoke-round-47.mjs', import.meta.url), 'utf8');
    expect(packageRelease).toContain('assets/opengameart/puny-characters/actors.png');
    expect(packageRelease).toContain('assets/opengameart/puny-characters/NOTICE.txt');
    expect(packageSmoke).toContain('assets/opengameart/puny-characters/actors.png');
    expect(packageSmoke).toContain('assets/opengameart/puny-characters/NOTICE.txt');
  });
});
