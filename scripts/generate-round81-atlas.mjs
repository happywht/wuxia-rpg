import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = resolve(root, 'data/base/world/world-map.json');
const overview = { columns: 336, rows: 224, tileSize: 16 };
const expectedOld = { columns: 224, rows: 144 };
const world = JSON.parse(await readFile(worldPath, 'utf8'));
const previous = world.atlasArt;
const extensionIds = [
  'world-r81-expanse-water', 'world-r81-expanse-sand',
  'world-r81-expanse-land', 'world-r81-expanse-pines',
];

if (previous?.columns === overview.columns && previous.rows === overview.rows &&
  extensionIds.every((id) => previous.layers.some((layer) => layer.id === id))) {
  if (previous.regionFootprint === undefined) {
    previous.regionFootprint = {
      columns: expectedOld.columns * 0.16,
      rows: expectedOld.rows * 0.16,
    };
    await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
    console.log('Recorded the Round 80 region footprint so old gates and landmarks keep their pixel positions.');
  }
  console.log(`Round 81 atlas is already ${overview.columns}×${overview.rows}; deterministic generation is a no-op.`);
  process.exit(0);
}

if (previous === undefined || previous.columns !== expectedOld.columns || previous.rows !== expectedOld.rows) {
  throw new Error(`预期 Round 80 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
}
const tileById = new Map(previous.tilesets.map((tileset) => [tileset.id, tileset]));
const oceanTiles = tileById.get('wuxia.world-palette');
const islandTiles = tileById.get('opengameart.puny-world');
if (oceanTiles === undefined || islandTiles === undefined) {
  throw new Error('舆图缺少现有程序水面或 OpenGameArt Puny World CC0 图集。');
}

const blank = () => Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
const expandedLayers = previous.layers.map((layer) => {
  if (layer.cells.length !== expectedOld.rows || layer.cells.some((row) => row.length !== expectedOld.columns)) {
    throw new Error(`Round 80 图层 ${layer.id} 的尺寸不是 ${expectedOld.columns}×${expectedOld.rows}。`);
  }
  const cells = blank();
  for (let row = 0; row < expectedOld.rows; row += 1) {
    for (let col = 0; col < expectedOld.columns; col += 1) cells[row][col] = layer.cells[row][col];
  }
  return { ...layer, cells };
});
const layerById = new Map(expandedLayers.map((layer) => [layer.id, layer]));
const oceanLayer = layerById.get('world-ocean');
if (oceanLayer === undefined || oceanLayer.tilesetId !== oceanTiles.id) {
  throw new Error('Round 80 舆图缺少预期的程序水面底层。');
}
for (let row = 0; row < overview.rows; row += 1) {
  for (let col = 0; col < overview.columns; col += 1) {
    if (row >= expectedOld.rows || col >= expectedOld.columns) oceanLayer.cells[row][col] = 1;
  }
}

const newWater = blank();
const newSand = blank();
const newLand = blank();
const newPines = blank();
const seaShapes = [
  { col: 281, row: 84, radiusX: 54, radiusY: 67 },
  { col: 277, row: 184, radiusX: 62, radiusY: 38 },
];
const landShapes = [
  { col: 265, row: 58, radiusX: 20, radiusY: 24, salt: 0x8101 },
  { col: 285, row: 72, radiusX: 26, radiusY: 31, salt: 0x8102 },
  { col: 276, row: 101, radiusX: 31, radiusY: 36, salt: 0x8103 },
  { col: 301, row: 117, radiusX: 20, radiusY: 25, salt: 0x8104 },
  { col: 251, row: 122, radiusX: 14, radiusY: 18, salt: 0x8105 },
  { col: 238, row: 158, radiusX: 6, radiusY: 5, salt: 0x8111 },
  { col: 252, row: 177, radiusX: 9, radiusY: 7, salt: 0x8112 },
  { col: 273, row: 164, radiusX: 7, radiusY: 6, salt: 0x8113 },
  { col: 294, row: 187, radiusX: 10, radiusY: 8, salt: 0x8114 },
  { col: 318, row: 163, radiusX: 7, radiusY: 6, salt: 0x8115 },
  { col: 321, row: 205, radiusX: 8, radiusY: 7, salt: 0x8116 },
];
const isInsideAny = (shapes, col, row) => shapes.some((shape) => {
  const dx = (col - shape.col) / shape.radiusX;
  const dy = (row - shape.row) / shape.radiusY;
  return dx * dx + dy * dy <= 1;
});
const newArea = (col, row) => col >= expectedOld.columns || row >= expectedOld.rows;
const inBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
const hash = (col, row, salt) => {
  let value = Math.imul(col + 271, 0x45d9f3b) ^ Math.imul(row + 193, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};
const grassFrames = [1, 2, 3, 28];
const pineFrames = [190, 196, 202, 208, 214, 220, 226, 232, 238, 244, 250, 256, 262, 268];
const landCount = { cells: 0, shore: 0, trees: 0, water: 0 };

for (let row = 0; row < overview.rows; row += 1) {
  for (let col = 0; col < overview.columns; col += 1) {
    if (!newArea(col, row)) continue;
    const inSea = isInsideAny(seaShapes, col, row);
    if (inSea) {
      newWater[row][col] = 294;
      landCount.water += 1;
    }
    if (!isInsideAny(landShapes, col, row)) continue;

    const shoreline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      !isInsideAny(landShapes, col + dx, row + dy),
    );
    const seed = hash(col, row, 0x8100);
    if (shoreline) {
      newSand[row][col] = 5;
      landCount.shore += 1;
    } else {
      newLand[row][col] = grassFrames[seed % grassFrames.length];
      landCount.cells += 1;
      if (seed % 100 < 14) {
        newPines[row][col] = pineFrames[hash(col, row, 0x8106) % pineFrames.length];
        landCount.trees += 1;
      }
    }
  }
}

const addedLayers = [
  { id: 'world-r81-expanse-water', tilesetId: islandTiles.id, cells: newWater },
  { id: 'world-r81-expanse-sand', tilesetId: islandTiles.id, cells: newSand },
  { id: 'world-r81-expanse-land', tilesetId: islandTiles.id, cells: newLand },
  { id: 'world-r81-expanse-pines', tilesetId: islandTiles.id, cells: newPines },
];
const existingIds = new Set(expandedLayers.map((layer) => layer.id));
for (const layer of addedLayers) {
  if (existingIds.has(layer.id)) throw new Error(`Round 81 图层 id 已存在：${layer.id}`);
  existingIds.add(layer.id);
}

// Keep all six Round 80 map centers at the same absolute pixel coordinates.
for (const region of world.regions) {
  const prior = region.atlasPosition;
  const oldColCenter = (prior.x / 100) * (expectedOld.columns - 1) + 0.5;
  const oldRowCenter = (prior.y / 100) * (expectedOld.rows - 1) + 0.5;
  region.atlasPosition = {
    x: Number((((oldColCenter - 0.5) / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number((((oldRowCenter - 0.5) / (overview.rows - 1)) * 100).toFixed(8)),
  };
}

const regionFootprint = previous.regionFootprint ?? {
  columns: expectedOld.columns * 0.16,
  rows: expectedOld.rows * 0.16,
};
const atlasArt = {
  ...overview,
  regionFootprint,
  tilesets: previous.tilesets,
  layers: [...expandedLayers, ...addedLayers],
};
for (const layer of atlasArt.layers) {
  if (layer.cells.length !== overview.rows || layer.cells.some((row) => row.length !== overview.columns)) {
    throw new Error(`生成图层 ${layer.id} 的尺寸与 ${overview.columns}×${overview.rows} 不符。`);
  }
  const tileset = tileById.get(layer.tilesetId);
  if (tileset === undefined || layer.cells.some((row) => row.some((gid) => gid > tileset.tileCount))) {
    throw new Error(`图层 ${layer.id} 使用了未声明或超出容量的素材帧。`);
  }
}
const oldIds = new Set(previous.layers.map((layer) => layer.id));
if (oldIds.size !== previous.layers.length || expandedLayers.length !== previous.layers.length) {
  throw new Error('Round 80 旧图层 id 不唯一或扩图时发生丢失。');
}

world.atlasArt = atlasArt;
await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Generated ${overview.columns}×${overview.rows} atlas (${atlasArt.layers.length} layers; ${world.regions.length} regions retained).`);
console.log(`Round 81 CC0 extension: ${landCount.cells} grass, ${landCount.shore} shore, ${landCount.trees} pines, ${landCount.water} sea cells.`);
