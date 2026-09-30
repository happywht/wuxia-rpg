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
 * final dense (pre-Round-86) world-map; the RLE conversion must decode back
 * to these exact matrices, cell for cell.
 */
const denseLayerHashes: Record<string, string> = {
  'world-ocean': '50bfdc6911af48db614cde7966b10e4696545efb4b99b73bf8ea61f5412d8d0d',
  'world-land': '65fa6e7062893a085d56fe4148be0efbfa07dcf1c140c408eddd8f6d57c0c17d',
  'world-coast': 'ae7cd2a76761afb4ac1eab1299655fc73852ae00742b54e7adf730f8882b356d',
  'world-forest': 'a7fd7d68321b7999a18125b98c592a6f7ff6829f1d0930fe56d9f0b8352122fb',
  'world-relief': '9c41d0e74b0b629a5555115e8d49752ef01e2280344a33100b6d9a2bef1160a5',
  'world-roads': '11d8c4d201e468222622e211f59e352d27e89d9ace52ab7b1e535063ed844787',
  'world-settlements': '502beec5a176d92d79b6378970f87b812d4c609d93237ea009235183822ebdf6',
  'world-r79-shoal-water': 'e9dbe24ac3d949ddf069b5fb57aed2ad0de6dc80c2fda6fc64cd4f0e07f56807',
  'world-r79-shoal-sand': '656911c90692e34babb7b1881422c79bc7b8faf90a36a11d5266ecde70514929',
  'world-r79-shoal-land': '6a753cceb1fc56e7094d022165f17ccbfca144cee1d2300aae1bbae6b842960f',
  'world-r79-shoal-pines': '76c0189d5fb67e5a95e56545412168e55ad4c210d7bb8ed35227577169be6341',
  'world-r79-gate-routes': '5d7a22cd0bd4d1ab8eb409ee2fce317489b54837a1b4de15a3564deebf147895',
  'world-r81-expanse-water': 'ebb054b74dcd45921424dd67e3396efb07dcccb086c699582ad6469b43f6fc38',
  'world-r81-expanse-sand': 'd658903a255f09e98b6f66b45ba17b30a66549750e8ee1bba6a30a0d7d651561',
  'world-r81-expanse-land': '9db214ef22615426574a29656b152599d0fb5435a8ef431e1b917b91571b595e',
  'world-r81-expanse-pines': '7a6c073674a48a596a6a61ba5091faac2d8b009e885b58623049858d1665e5f0',
  'world-r84-expanse-water': 'dd860a46fb51b966fb74f3be3305a518389a75b17e8e2f0881a20a2fbebc5611',
  'world-r84-expanse-sand': 'e376268745915ecff33c43be264a89c56967f0c187f1c9a7ffe7335176726ef9',
  'world-r84-expanse-land': '46cce5be0156d823924d78a766e1897dcd52a0358ae8e4ab124f13d53c537ec6',
  'world-r84-expanse-pines': 'ed0462271ea851ecf09c465353ab896d5dbab30cdb87a53a3b08400e31a27304',
  'world-r85-expanse-water': 'c60a6cade97fded449625252ec76b4a87ff8df73baddead90fbc85a852e2e273',
  'world-r85-expanse-sand': '43531cdd706a081d882c9abe4ea5b80f21e6540ea2c0a5c1cd1707ec3469a4e4',
  'world-r85-expanse-land': '08e7ba27658d96ade9e7932aea3e4422bf797f6be39761731dc75d31992a1dea',
  'world-r85-expanse-pines': '4106554800b6ca653f3ba22ea88f8d3a9678afbe14cfc73c31a604de9e404ac1',
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
  it('ships the 448×320 atlas as canonical row-RLE that passes the JSON schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    expect(validate(rawWorld), JSON.stringify(validate.errors)).toBe(true);

    const art = rawWorld.atlasArt;
    expect(art.layers).toHaveLength(24);
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
