/**
 * Round 86: world-atlas row-RLE wire protocol.
 *
 * Pins the compact `cellsRle` encoding against the pre-conversion dense
 * matrices (per-layer SHA-256 baseline), checks lossless decode through the
 * live runtime parser, and covers the full rejection matrix: malformed
 * tokens, wrong run totals, wrong row counts, tileset overflow, both/neither
 * encoding and legacy dense compatibility.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import Ajv, { type AnySchema } from 'ajv';
import { describe, expect, it } from 'vitest';

import { decodeAtlasCells, encodeAtlasCells, encodeAtlasRow } from '../scripts/lib/atlas-rle.mjs';
import { parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): any {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as any;
}

const rawWorld = readJson('../data/base/world/world-map.json');

/**
 * SHA-256 over `JSON.stringify(cells)` of every atlas layer captured from the
 * Round 87 expansion (512×384 dense matrices); the RLE conversion must decode
 * back to these exact matrices, cell for cell.
 */
const denseLayerHashes: Record<string, string> = {
  'world-ocean': 'be918b7fe0aee1dfcb256a0474165ec8394ed0457abda1f850141c40572560bf',
  'world-land': '6e466696ce376361b5b0d376a95800f78b91c9a2b168ba74c639ac9e12303d1e',
  'world-coast': 'c06b1c9bcd49af8cbcdb4ad335d982b5c772c5c6dd22355656ff982a179aba22',
  'world-forest': 'acaa78160d359ef0d3b8994fe503d98579a243cb26f2c364c48e3f12788f7e1f',
  'world-relief': '78fa5a7bee220645702c6adb274c3c20773d5d8907f3967ca14be85ae1bc26af',
  'world-roads': '11048172346d2a0fde60431ccfe118584c934cd55ee613b2e6cfcf654f79c561',
  'world-settlements': '8cb492e5a6efb027e46df1ccea6e656cf3f01c4c1e65f94d6fb6eb1f928523bc',
  'world-r79-shoal-water': '7bab9dae8ad0e298222278b5143fde838b742e68dfe28959380726509bfbfc78',
  'world-r79-shoal-sand': '9c5d4690f2f5b3de3e482c635c6422ff1e5226ba6fb362d5f67055d4c7f63697',
  'world-r79-shoal-land': 'c949b0ff55f5f7dc2d536fb386e2ab752a44ee2da13949fcec995bfb4691c650',
  'world-r79-shoal-pines': '9bdb02f82aa2b68057ebd835d1162617689fc32627c469dca45f3a86d4523610',
  'world-r79-gate-routes': '40d0d6f85e1bb30d1984e64f7805a705b88afb306dfa530c3a548c5e32f63615',
  'world-r81-expanse-water': '8f0f9c907fd7f68f8e4e16acc7139ee85e828e292186e9eb60c2118fd45a44b8',
  'world-r81-expanse-sand': 'c9875c542d10d2673935bbf1f6744e4d884d376593a0ebc5cccf7d1ab755b2ec',
  'world-r81-expanse-land': 'c1308f60716d52c9cb2402146f87c99285c3b28054f4935a8436ae8b50f09bcc',
  'world-r81-expanse-pines': '0b498e66efb00738f0369b2492080bbaad7e1aed600bf6fddbf509e123c1b140',
  'world-r84-expanse-water': 'a0dca5222f86cd2410f446899c926720f5f23ce6d3e619ec31d0ac21e0b22b84',
  'world-r84-expanse-sand': 'ee0b774cb4385ce77a05b813a5ed7571c52b592488260b0862dd01c903f5f0a8',
  'world-r84-expanse-land': 'd4e34faad0167138a00ed5e525f37d6f83dc99c952ac83b11a24f9fb9537a286',
  'world-r84-expanse-pines': '00347e59eb041774ea8f07a1f947672a0ab66c5255bfc18badb7b8b954dee45d',
  'world-r85-expanse-water': '2d7b1e2310a8329a9e46e02a57c27b26013c881d79c372855136ff3a9a89c1f9',
  'world-r85-expanse-sand': 'a732dad1c2eecb5a94b1d8ed64a98a2416e28c95fa5a40dc32680737ec4f6ecb',
  'world-r85-expanse-land': 'd34d09b657693bf51754f82f0a1f4fb0cefc2fe500a256ffa0c33021e37a57e0',
  'world-r85-expanse-pines': '874478e6d039ebca21a65995c6f4b6961cdba67709e8718887a30493b0dbd39e',
  'world-r87-expanse-water': '7826963dd3ea7da37a0ce2d7e614c1116775094b44aaafc7193cbeaf63905062',
  'world-r87-expanse-sand': '7bfdc677cf0dc51d9b0bdf0d687abe2afb9f2c169605aef9e9172952445b1864',
  'world-r87-expanse-land': '7b0ddd7adfc89d10442958794988f24849fa78f3cd0959775a08cf6ffc6534c3',
  'world-r87-expanse-pines': 'b29f61de8dd4966e8df942a3554115f6da76b340c47aee48000e213c03a834d1',
};

const CANONICAL_ROW = /^[1-9][0-9]*:(0|[1-9][0-9]*)(,[1-9][0-9]*:(0|[1-9][0-9]*))*$/;

/** Minimal 4×3 world whose single tileset offers eight frames. */
function syntheticWorld(layers: unknown[]): any {
  return {
    id: 'world.r86-fixture',
    startingMapResourceId: 'map.r86-fixture',
    regions: [{
      mapResourceId: 'map.r86-fixture',
      name: '测试区域',
      description: 'RLE 协议夹具',
      atlasPosition: { x: 50, y: 50 },
    }],
    landmarks: [],
    transitions: [],
    events: [],
    atlasArt: {
      columns: 4,
      rows: 3,
      tileSize: 16,
      tilesets: [{
        id: 'r86.fixture', image: 'assets/r86-fixture.png', tileSize: 16,
        columns: 4, rows: 4, spacing: 0, tileCount: 8,
      }],
      layers,
    },
  };
}

function parseErrors(raw: unknown): string {
  const parsed = parseWorldMap(raw);
  expect(parsed.ok).toBe(false);
  if (parsed.ok) throw new Error('expected a parse failure');
  return parsed.errors.join('\n');
}

describe('Round 86 world-atlas row-RLE wire protocol', () => {
  it('ships the 512×384 atlas as canonical row-RLE that passes the JSON schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    expect(validate(rawWorld), JSON.stringify(validate.errors)).toBe(true);

    const art = rawWorld.atlasArt;
    expect(art.layers).toHaveLength(28);
    for (const layer of art.layers) {
      expect(layer.cells, layer.id).toBeUndefined();
      expect(layer.cellsRle, layer.id).toHaveLength(art.rows);
      for (const [rowIndex, row] of layer.cellsRle.entries()) {
        expect(row, `${layer.id} 第 ${rowIndex} 行`).toMatch(CANONICAL_ROW);
      }
    }
    const size = statSync(new URL('../data/base/world/world-map.json', import.meta.url)).size;
    expect(size).toBeLessThanOrEqual(1_048_576);
  });

  it('decodes the shipped RLE atlas into the exact pre-conversion dense matrices', () => {
    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const art = parsed.data.atlasArt!;
    expect(art.layers).toHaveLength(Object.keys(denseLayerHashes).length);
    for (const layer of art.layers) {
      expect(layer.cells, layer.id).toHaveLength(art.rows);
      expect(layer.cells.every((row) => row.length === art.columns), layer.id).toBe(true);
      const hash = createHash('sha256').update(JSON.stringify(layer.cells)).digest('hex');
      expect(hash, layer.id).toBe(denseLayerHashes[layer.id]);
      const wire = rawWorld.atlasArt.layers.find((entry: { id: string }) => entry.id === layer.id);
      expect(encodeAtlasCells(layer.cells), layer.id).toEqual(wire.cellsRle);
    }
  });

  it('encodes runs canonically and round-trips through the shared codec', () => {
    expect(encodeAtlasRow([5, 5, 5, 1])).toBe('3:5,1:1');
    expect(encodeAtlasRow([0])).toBe('1:0');
    const dense = [
      [0, 0, 0, 7],
      [12, 12, 0, 12],
      [0x80000001, 0x80000001, 0x80000001, 0x80000001],
    ];
    const encoded = ['3:0,1:7', '2:12,1:0,1:12', '4:2147483649'];
    expect(encodeAtlasCells(dense)).toEqual(encoded);
    expect(decodeAtlasCells(encoded, dense.length, dense[0]!.length)).toEqual(dense);
  });

  it('accepts a synthetic RLE layer and decodes it to the same dense matrix', () => {
    const denseCells = [
      [0, 0, 0, 7],
      [5, 5, 0, 5],
      [1, 2, 3, 4],
    ];
    const parsed = parseWorldMap(syntheticWorld([
      { id: 'r86-dense', tilesetId: 'r86.fixture', cells: denseCells },
      { id: 'r86-rle', tilesetId: 'r86.fixture', cellsRle: ['3:0,1:7', '2:5,1:0,1:5', '1:1,1:2,1:3,1:4'] },
    ]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.atlasArt!.layers).toHaveLength(2);
    expect(parsed.data.atlasArt!.layers[0]!.cells).toEqual(denseCells);
    expect(parsed.data.atlasArt!.layers[1]!.cells).toEqual(denseCells);
  });

  it('accepts Tiled-style flag bits above the frame index', () => {
    // 0x80000005 keeps frame 5 within the eight-frame fixture tileset.
    const parsed = parseWorldMap(syntheticWorld([
      { id: 'r86-flagged', tilesetId: 'r86.fixture', cellsRle: ['1:2147483653,3:0', '4:0', '4:0'] },
    ]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.atlasArt!.layers[0]!.cells[0]).toEqual([0x80000005, 0, 0, 0]);
  });

  it('rejects layers declaring both or neither encoding', () => {
    const both = parseErrors(syntheticWorld([{
      id: 'r86-both', tilesetId: 'r86.fixture',
      cells: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      cellsRle: ['4:0', '4:0', '4:0'],
    }]));
    expect(both).toContain('cells 与 cellsRle 只能提供其中一种');

    const neither = parseErrors(syntheticWorld([{ id: 'r86-none', tilesetId: 'r86.fixture' }]));
    expect(neither).toContain('应提供 cells 或 cellsRle 之一');
  });

  it('rejects malformed RLE tokens with readable errors', () => {
    const malformedTokens = [
      '4:0,', '03:1,3:0', '0:4', '4:01', '4:-1', '1.5:0', '4 :0', '0x4:0', 'four:0', ':4', '4:',
    ];
    for (const row of malformedTokens) {
      const errors = parseErrors(syntheticWorld([{
        id: 'r86-token', tilesetId: 'r86.fixture', cellsRle: [row, '4:0', '4:0'],
      }]));
      expect(errors, JSON.stringify(row)).toContain('应为 游程:GID');
    }

    const emptyRow = parseErrors(syntheticWorld([{
      id: 'r86-empty', tilesetId: 'r86.fixture', cellsRle: ['', '4:0', '4:0'],
    }]));
    expect(emptyRow).toContain('不应为空行');

    const overflows = ['513:0', '1:4294967296'];
    for (const row of overflows) {
      const errors = parseErrors(syntheticWorld([{
        id: 'r86-limit', tilesetId: 'r86.fixture', cellsRle: [row, '4:0', '4:0'],
      }]));
      expect(errors, JSON.stringify(row)).toContain('超出游程或 GID 上限');
    }
  });

  it('rejects RLE rows decoding to the wrong width or the wrong layer height', () => {
    const shortRow = parseErrors(syntheticWorld([{
      id: 'r86-short', tilesetId: 'r86.fixture', cellsRle: ['3:0', '4:0', '4:0'],
    }]));
    expect(shortRow).toContain('游程应有 4 格，实际 3 格');

    const longRow = parseErrors(syntheticWorld([{
      id: 'r86-long', tilesetId: 'r86.fixture', cellsRle: ['5:0', '4:0', '4:0'],
    }]));
    expect(longRow).toContain('游程超过列数上限 4 格');

    const tooFewRows = parseErrors(syntheticWorld([{
      id: 'r86-few', tilesetId: 'r86.fixture', cellsRle: ['4:0', '4:0'],
    }]));
    expect(tooFewRows).toContain('cellsRle：应有 3 行，实际 2 行');

    const tooManyRows = parseErrors(syntheticWorld([{
      id: 'r86-many', tilesetId: 'r86.fixture', cellsRle: ['4:0', '4:0', '4:0', '4:0'],
    }]));
    expect(tooManyRows).toContain('cellsRle：应有 3 行，实际 4 行');
  });

  it('rejects RLE runs whose GID frames exceed the referenced tileset', () => {
    const errors = parseErrors(syntheticWorld([{
      id: 'r86-frame', tilesetId: 'r86.fixture', cellsRle: ['1:9,3:0', '4:0', '4:0'],
    }]));
    expect(errors).toContain('帧 9 超出图集');
  });

  it('stops oversized generator rows before expanding beyond the expected width', () => {
    expect(() => decodeAtlasCells(['1000000000:0'], 1, 4)).toThrow('超过 4 格的列数上限');
  });

  it('rejects unsupported layer fields, non-string rows and non-array encodings', () => {
    const extraField = parseErrors(syntheticWorld([{
      id: 'r86-extra', tilesetId: 'r86.fixture', cellsRle: ['4:0', '4:0', '4:0'], depthSort: 'y',
    }]));
    expect(extraField).toContain('不是受支持的字段');

    const numericRow = parseErrors(syntheticWorld([{
      id: 'r86-numeric', tilesetId: 'r86.fixture', cellsRle: [0, '4:0', '4:0'],
    }]));
    expect(numericRow).toContain('应为字符串');

    const notAnArray = parseErrors(syntheticWorld([{
      id: 'r86-string', tilesetId: 'r86.fixture', cellsRle: '4:0',
    }]));
    expect(notAnArray).toContain('cellsRle：应为字符串数组');
  });

  it('still loads a legacy dense layer inside the shipped RLE atlas', () => {
    const denseFirst = structuredClone(rawWorld);
    const first = denseFirst.atlasArt.layers[0];
    first.cells = decodeAtlasCells(first.cellsRle, denseFirst.atlasArt.rows, denseFirst.atlasArt.columns);
    delete first.cellsRle;
    const reparsed = parseWorldMap(denseFirst);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(reparsed.data.atlasArt!.layers).toHaveLength(parsed.data.atlasArt!.layers.length);
    expect(reparsed.data.atlasArt!.layers[0]!.cells).toEqual(parsed.data.atlasArt!.layers[0]!.cells);
  });

  it('enforces the exactly-one encoding rule in the JSON schema itself', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    const dense = syntheticWorld([{
      id: 'r86-dense', tilesetId: 'r86.fixture',
      cells: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    }]);
    const rle = syntheticWorld([{
      id: 'r86-rle', tilesetId: 'r86.fixture', cellsRle: ['4:0', '4:0', '4:0'],
    }]);
    expect(validate(dense)).toBe(true);
    expect(validate(rle)).toBe(true);

    const both = structuredClone(rle);
    both.atlasArt.layers[0].cells = dense.atlasArt.layers[0].cells;
    expect(validate(both)).toBe(false);

    const neither = structuredClone(rle);
    delete neither.atlasArt.layers[0].cellsRle;
    expect(validate(neither)).toBe(false);

    const malformed = syntheticWorld([{
      id: 'r86-bad', tilesetId: 'r86.fixture', cellsRle: ['4:0', '04:0', '4:0'],
    }]);
    expect(validate(malformed)).toBe(false);
  });
});
