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
 * dense migration and later append-only region rounds; the RLE conversion must
 * decode back to these exact matrices, cell for cell.
 */
const denseLayerHashes: Record<string, string> = {
"world-ocean": "8db1c12c69c2bf1cc350c299ebd71952e4aab1bcee7d13d5f57785c0a72429d3",
  "world-land": "d1cdbb3d91c3e859ee507aa258645cf1d1a67db350c977292fe85e0cfeb5aa40",
  "world-coast": "53e329f6773b47cf070b99daf8ce50cf40bde3faee09f0999705709bc7dfee43",
  "world-forest": "c3c25c030e14138dbf379153c9724dbc3f144bab3292509872d163288be7caf1",
  "world-relief": "edcfe615af63481da1a284a46e42a75043f4c3dd395dd49bc136cf3e5e62f1f3",
  "world-roads": "907987b87e0835878fce09fcd402b6eb7f3a5c841d036691cd9762167538feb4",
  "world-settlements": "b6b7bce13edec0aa13700e97ea18981de103e0b790ae7d0e2ce9b26aa7d4d631",
  "world-r79-shoal-water": "55e95b7eb57edd311ede603bf731d7548826717749d874a31c3981f029706353",
  "world-r79-shoal-sand": "e936174a1e947b0686d932d738d9a73fd8ef76c363163c75d917c88f627de7ca",
  "world-r79-shoal-land": "21a1dcdd270779887192f9782163ef300538a027d4b68b0c635fc5c82e316070",
  "world-r79-shoal-pines": "36424f70e5c36d053e9bad9b9db098f3c04a873b390d03dae84a92f5e29007b3",
  "world-r79-gate-routes": "137b2b8238f64995b5ce6b547dc3e74b07dc45b9692e6700f52302265977411e",
  "world-r81-expanse-water": "99265a2bedfabc272153031edfc5e397d7d96711ffd3474cb1b2ea03720ec1a5",
  "world-r81-expanse-sand": "58d86f4927e89679c4c740583098833b60c08c201b780374a4439ca15345f9d2",
  "world-r81-expanse-land": "8297855cca75c5f8c77a905de6bd3260321082f3627305a47d1154500f55e166",
  "world-r81-expanse-pines": "84a1b9422b643afe0c2c7ebf4eaa6ee68df6e74e8c2bf0e2f6ec83c5491ac6fc",
  "world-r84-expanse-water": "f3e7047cf15b0d51bb7c063efca8b7c340466c0cb858cc2a0f8d5a4562278762",
  "world-r84-expanse-sand": "0a4b180347b4d8638d3e881080a2148783f929cb65c4fcf4a8a8aa4e6082d047",
  "world-r84-expanse-land": "958a2ef0e9dc0913dc6586e5ac03f6ce29bd5c17550e7e86a56edbb09350b056",
  "world-r84-expanse-pines": "f29368463137484f3d624e2fec7a9d57f7a3d5950aed63812d9637fa535ce484",
  "world-r85-expanse-water": "6a747acca1dbf7150b19c68156d5c4106381b4cf119cff67b026c98be3607400",
  "world-r85-expanse-sand": "2a3e634ad3839d3f0aca91bd4a0c10a41288707fdfb9f7d9637e6a5f220564d7",
  "world-r85-expanse-land": "129aededc309b6b13220fc01b5122fb18f6b9905877abc4c2da58c3e2adeb699",
  "world-r85-expanse-pines": "b46ded2a166377936edefceca953ccbcc7f6474e5053210403e66c53b6ed34e8",
  "world-r87-expanse-water": "6b823cd955df71841828f286ad21ef4c3a07fc5fd0fa9de1ff38202c8a661747",
  "world-r87-expanse-sand": "6932b1f8ccc67faf55c00837e0e83e77396f73000aab588026e2685a98c53e70",
  "world-r87-expanse-land": "d7e4b9a1626c7dc60f239e0b011533043fcf6460885901d4fdd9bd647f4d9230",
  "world-r87-expanse-pines": "ba38f2470186ad4019bacd03d56ef4bca8458880f8e1b198f3054711ae0597e3",
  "world-r91-terrace-land": "c7849ddacb6d456371cb93d40c01f19e64052e8359ffcc2aae23c743a6898914",
  "world-r91-terrace-cliffs": "02fa6f75e185a6f194af84924f6b126f32b69eeab436b7eb9789113274b0b9de",
  "world-r91-terrace-walls": "04458ab4711364524af78eaa43130f94bf63d1775999eb146c387ebccbae3f49",
  "world-r91-terrace-detail": "b6052cb8366fbdbc7ce13e521bb729bb8672ce6a847c0bc7cf22bdcf5ad69064",
  "world-r91-terrace-route": "0834aa69e253f6cc24cecc0db01f234d708ee880ad1053c70d8edc5c019df89a",
  "world-r92-pass-snow": "fe2dafb156b95c67f199c249e5633b1da28ab5ed88b999f75b8a39f99b3bd404",
  "world-r92-pass-trees": "c459bc00db2261bc5e542227de1adc6a335276ae0b2b85e032eef2b40fd9ebc6",
  "world-r92-pass-walls": "17337604e8923eab70fbc43b4714113c0d5be642efca54d9b875e33073cb20f5",
  "world-r92-pass-detail": "e5c7f85b687bac8c39572951293f04b5b7efa1c87e3331d9a6b068ad5a311af6",
  "world-r92-pass-route": "e81f7a388bd70675a45b54584e8226b65bde32400a4339057fd3d06102aeab19",
  "world-r93-valley-snow": "9eab23a9e29f5654cd5d909eb15d77f155280dcc84343dac5112353d909a2071",
  "world-r93-valley-trees": "fa156d38ea8de06c336851c38a3377df6117383c9252be8170bd3be372768054",
  "world-r93-valley-walls": "e32110b8273cda40ceb3b6f831184422d8c82f3a1d9a699062fad04f8c58a37f",
  "world-r93-valley-detail": "cae78e47a243887187558db5e056d4950d13e28246a596c0ec4fdd0277adf34c",
  "world-r93-valley-route": "64783a1dca3ffcf9a7602da5b3050ce588eaa271d1cb283c9a11c494abe6a2c9",
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
  it('ships the 768×576 atlas with 61 canonical row-RLE layers that pass the JSON schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);
    expect(validate(rawWorld), JSON.stringify(validate.errors)).toBe(true);

    const art = rawWorld.atlasArt;
    expect(art.layers).toHaveLength(61);
    for (const layer of art.layers) {
      expect(layer.cells, layer.id).toBeUndefined();
      expect(layer.cellsRle, layer.id).toHaveLength(art.rows);
      for (const [rowIndex, row] of layer.cellsRle.entries()) {
        expect(row, `${layer.id} 第 ${rowIndex} 行`).toMatch(CANONICAL_ROW);
      }
    }
    const size = statSync(new URL('../data/base/world/world-map.json', import.meta.url)).size;
    expect(size).toBeLessThanOrEqual(1_572_864);
  });

  it('decodes the shipped RLE atlas into the exact pre-conversion dense matrices', () => {
    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const art = parsed.data.atlasArt!;
    expect(art.layers).toHaveLength(61);
    expect(Object.keys(denseLayerHashes)).toHaveLength(43);
    for (const layer of art.layers) {
      expect(layer.cells, layer.id).toHaveLength(art.rows);
      expect(layer.cells.every((row) => row.length === art.columns), layer.id).toBe(true);
      const oldPrefix = layer.cells.slice(0, 448).map((row) => row.slice(0, 640));
      const hash = createHash('sha256').update(JSON.stringify(oldPrefix)).digest('hex');
      const expectedHash = denseLayerHashes[layer.id];
      if (expectedHash !== undefined) expect(hash, layer.id).toBe(expectedHash);
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

    const overflows = ['641:0', '1:4294967296'];
    for (const [index, row] of overflows.entries()) {
      const errors = parseErrors(syntheticWorld([{
        id: 'r86-limit', tilesetId: 'r86.fixture', cellsRle: [row, '4:0', '4:0'],
      }]));
      expect(errors, JSON.stringify(row)).toContain(index === 0 ? '游程超过列数上限 4 格' : '超出游程或 GID 上限');
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
