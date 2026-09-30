import { deepenNorthQuests, deepenNorthDialogues } from './lib/round101-north-content.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  const next = JSON.stringify(value, null, 2) + '\n';
  let old;
  try { old = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (old !== next) await writeFile(path, next);
};
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
  ridge: resolve(base, 'maps/round-91-cloud-north-terrace.json'),
  tide: resolve(base, 'maps/round-85-tide-isle.json'),
  east: resolve(base, 'maps/round-94-east-gate.json'),
  south: resolve(base, 'maps/round-94-returning-sails.json'),
  npcs: resolve(base, 'characters/round-94-frontiers-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-94-frontiers-conversations.json'),
  quests: resolve(base, 'quests/round-94-frontiers-quests.json'),
  baseline: resolve(root, 'iterations/round-94/round93-atlas-baseline.json'),
};
const sourceSize = { columns: 640, rows: 448 };
const targetSize = { columns: 768, rows: 576 };
const targetTileSize = 8;
const baseline = await readJson(paths.baseline);
const [world, manifest, nodes, edges, ridgeMap, tideMap] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.nodes), readJson(paths.edges),
  readJson(paths.ridge), readJson(paths.tide),
]);
if (baseline.columns !== sourceSize.columns || baseline.rows !== sourceSize.rows ||
  Object.keys(baseline.layers).length !== 43 || Object.keys(baseline.regions).length !== 13) {
  throw new Error('Round 93 基线需包含 640×448、43 层和 13 个区域。');
}
if (ridgeMap.id !== 'map.round-91-cloud-north-terrace' || tideMap.id !== 'map.round-85-tide-isle') {
  throw new Error('新边境需要雁回崖与潮生屿作为既有路线端点。');
}
const atlas = world.atlasArt;
if (atlas === undefined ||
  !([sourceSize.columns, targetSize.columns].includes(atlas.columns)) ||
  !([sourceSize.rows, targetSize.rows].includes(atlas.rows))) {
  throw new Error(`Round 94 仅从 640×448 或本轮 768×576 舆图拓界；收到 ${atlas?.columns}×${atlas?.rows}。`);
}
if (atlas.layers.length < 43 || atlas.layers.slice(0, 43).map(({ id }) => id).some((id) => !(id in baseline.layers))) {
  throw new Error('现有舆图未保留 Round 93 的前 43 层，拒绝扩图。');
}
const hashCells = (cells) => createHash('sha256').update(JSON.stringify(cells)).digest('hex');
const prefixCells = (cells) => cells.slice(0, sourceSize.rows).map((row) => row.slice(0, sourceSize.columns));
const decodedLayers = atlas.layers.map((layer) => {
  if ((layer.cells === undefined) === (layer.cellsRle === undefined)) {
    throw new Error(`舆图图层 ${layer.id} 必须且只能声明一种格网编码。`);
  }
  const cells = layer.cellsRle === undefined
    ? layer.cells
    : decodeAtlasCells(layer.cellsRle, atlas.rows, atlas.columns);
  return { id: layer.id, tilesetId: layer.tilesetId, cells };
});
for (const [id, expected] of Object.entries(baseline.layers)) {
  const layer = decodedLayers.find((candidate) => candidate.id === id);
  if (layer === undefined || hashCells(prefixCells(layer.cells)) !== expected) {
    throw new Error(`Round 93 旧层像素基线不符：${id}。`);
  }
}
for (const [id, oldRegion] of Object.entries(baseline.regions)) {
  const region = world.regions.find((candidate) => candidate.mapResourceId === id);
  if (region === undefined) throw new Error(`旧区域丢失：${id}。`);
  const col = region.atlasPosition.x / 100 * (atlas.columns - 1) + 0.5;
  const row = region.atlasPosition.y / 100 * (atlas.rows - 1) + 0.5;
  const expectedCol = atlas.columns === sourceSize.columns
    ? oldRegion.center.col : oldRegion.center.col;
  const expectedRow = atlas.rows === sourceSize.rows
    ? oldRegion.center.row : oldRegion.center.row;
  if (Math.abs(col - expectedCol) > 0.00001 || Math.abs(row - expectedRow) > 0.00001) {
    throw new Error(`旧区域中心已漂移：${id} (${col},${row}) != (${expectedCol},${expectedRow})。`);
  }
}

const atlasLayers = decodedLayers.slice(0, 43).map((layer) => {
  const cells = Array.from({ length: targetSize.rows }, (_, row) =>
    Array.from({ length: targetSize.columns }, (_, col) => {
      if (row < atlas.rows && col < atlas.columns) return layer.cells[row]?.[col] ?? 0;
      if (layer.id === 'world-ocean') {
        const sourceRow = Math.min(row, atlas.rows - 1);
        const sourceCol = Math.min(col, atlas.columns - 1);
        return layer.cells[sourceRow]?.[sourceCol] ?? 1;
      }
      return 0;
    }),
  );
  return { id: layer.id, tilesetId: layer.tilesetId, cells };
});
const laterLayers = decodedLayers.slice(43).filter(({ id }) => !id.startsWith('world-r94-'));
const tileset = (id) => {
  const found = atlas.tilesets.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`Round 94 舆图缺少已登记图集 ${id}。`);
  return found;
};
const tiles = {
  winter: tileset('opengameart.winter-tileset-zaph'),
  mountain: tileset('opengameart.tiny-rpg-mountain'),
  world: tileset('opengameart.puny-world'),
  tinyTown: tileset('kenney.tiny-town'),
};
const blankAtlas = () => Array.from({ length: targetSize.rows }, () => Array(targetSize.columns).fill(0));
const newAtlas = {
  eastSnow: blankAtlas(), eastCliffs: blankAtlas(), eastPines: blankAtlas(), eastRoute: blankAtlas(), eastTown: blankAtlas(),
  southWater: blankAtlas(), southSand: blankAtlas(), southLand: blankAtlas(), southPines: blankAtlas(), southRoute: blankAtlas(),
};
const hashCoord = (col, row, salt) => {
  let value = Math.imul(col + 619, 0x45d9f3b) ^ Math.imul(row + 947, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};
const ellipse = (col, row, centerCol, centerRow, radiusX, radiusY) => {
  const dx = (col - centerCol) / radiusX;
  const dy = (row - centerRow) / radiusY;
  const roughness = ((hashCoord(col, row, 0x9401) % 1000) / 1000 - 0.5) * 0.055;
  return dx * dx + dy * dy <= 1 + roughness;
};
const eastInside = (col, row) => col >= 611 && ellipse(col, row, 686, 96, 72, 35);
const southInside = (col, row) =>
  ellipse(col, row, 405, 500, 48, 63) ||
  ellipse(col, row, 359, 538, 15, 17) ||
  ellipse(col, row, 456, 465, 17, 15) ||
  ellipse(col, row, 384, 439, 12, 9);
const addLine = (set, from, to, brush = 1) => {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (let dy = -brush; dy <= brush; dy += 1) {
      const targetRow = row + dy;
      if (targetRow >= 0 && targetRow < targetSize.rows && col >= 0 && col < targetSize.columns) {
        set.add(`${col},${targetRow}`);
      }
    }
  }
};
const toCells = (set) => new Set(set);
const eastAtlasRoad = new Set();
for (const [index, point] of [
  { col: 610, row: 96 }, { col: 642, row: 96 }, { col: 670, row: 96 },
  { col: 690, row: 96 }, { col: 700, row: 87 }, { col: 716, row: 80 },
].entries()) {
  if (index > 0) addLine(eastAtlasRoad, [
    { col: 610, row: 96 }, { col: 642, row: 96 }, { col: 670, row: 96 },
    { col: 690, row: 96 }, { col: 700, row: 87 }, { col: 716, row: 80 },
  ][index - 1], point, 1);
}
const southSeaLane = new Set();
for (let row = 316; row <= 438; row += 1) {
  const col = 405 + Math.round(Math.sin(row / 17) * 4);
  for (let dx = -1; dx <= 1; dx += 1) southSeaLane.add(`${col + dx},${row}`);
}
const winterPines = [17, 33, 49, 65, 81, 97];
const mountainCliffs = [31, 32, 37, 38, 40, 42, 43, 45, 54, 55, 57, 58, 60, 61, 63, 65, 66, 68, 77, 78, 80, 81, 83, 84, 86, 88, 89, 91, 100, 101, 103, 104, 106, 107, 109, 111, 112, 114, 123, 124, 126, 127, 129, 130, 132, 134, 135, 137, 146, 147, 149, 150, 152, 153, 155, 157, 158, 160].map((frame) => frame + 1);
const mountainRoad = [94, 93, 117, 116];
const grassGids = [1, 2, 3, 28, 29, 30, 32, 33, 34];
const sandGids = [5, 6, 7];
const oceanGids = [286, 288, 290, 291, 294, 295, 296];
const pineGids = [190, 193, 196, 199, 202, 205, 208, 211, 214, 217, 220, 223, 226, 229, 232, 235, 238, 241, 244, 247, 250, 253, 256, 259, 262, 265, 268];
const usedWorldGids = new Set([1, 2, 3, 5, 6, 7, 17, 20, 58, 84]);
const tinyTownGids = [...usedWorldGids].filter((gid) => gid <= tiles.tinyTown.tileCount);

let eastSnowCount = 0;
let eastPineCount = 0;
let southIslandCount = 0;
for (let row = 0; row < targetSize.rows; row += 1) {
  for (let col = 0; col < targetSize.columns; col += 1) {
    if (eastInside(col, row)) {
      newAtlas.eastSnow[row][col] = 1;
      eastSnowCount += 1;
      const edge = !eastInside(col + 1, row) || !eastInside(col - 1, row) ||
        !eastInside(col, row + 1) || !eastInside(col, row - 1);
      if (edge && col > 621) newAtlas.eastCliffs[row][col] = mountainCliffs[hashCoord(col, row, 0x9402) % mountainCliffs.length];
      else if (col > 644 && hashCoord(col, row, 0x9403) % 100 < 11 && !eastAtlasRoad.has(`${col},${row}`)) {
        newAtlas.eastPines[row][col] = winterPines[hashCoord(col, row, 0x9404) % winterPines.length];
        eastPineCount += 1;
      }
    }
    if (southInside(col, row)) {
      const shoreline = !southInside(col + 1, row) || !southInside(col - 1, row) ||
        !southInside(col, row + 1) || !southInside(col, row - 1);
      if (shoreline) newAtlas.southSand[row][col] = sandGids[hashCoord(col, row, 0x9405) % sandGids.length];
      else {
        newAtlas.southLand[row][col] = grassGids[hashCoord(col, row, 0x9406) % grassGids.length];
        if (hashCoord(col, row, 0x9407) % 100 < 9 && !southSeaLane.has(`${col},${row}`)) {
          newAtlas.southPines[row][col] = pineGids[hashCoord(col, row, 0x9408) % pineGids.length];
        }
      }
      southIslandCount += 1;
    } else if (row >= 440) {
      newAtlas.southWater[row][col] = oceanGids[hashCoord(col, row, 0x9409) % oceanGids.length];
    }
  }
}
for (const key of eastAtlasRoad) {
  const [col, row] = key.split(',').map(Number);
  newAtlas.eastRoute[row][col] = mountainRoad[hashCoord(col, row, 0x940a) % mountainRoad.length];
}
for (const key of southSeaLane) {
  const [col, row] = key.split(',').map(Number);
  if (!southInside(col, row)) newAtlas.southRoute[row][col] = oceanGids[3];
}
for (const [col, row, gid] of [[692, 93, 58], [693, 93, 84], [692, 94, 17], [693, 94, 20]]) {
  if (col < targetSize.columns && row < targetSize.rows && eastInside(col, row)) newAtlas.eastTown[row][col] = gid;
}
const extensionLayers = [
  { id: 'world-r94-east-snow', tilesetId: tiles.winter.id, cells: newAtlas.eastSnow },
  { id: 'world-r94-east-cliffs', tilesetId: tiles.mountain.id, cells: newAtlas.eastCliffs },
  { id: 'world-r94-east-pines', tilesetId: tiles.winter.id, cells: newAtlas.eastPines },
  { id: 'world-r94-east-route', tilesetId: tiles.mountain.id, cells: newAtlas.eastRoute },
  { id: 'world-r94-east-settlement', tilesetId: tiles.tinyTown.id, cells: newAtlas.eastTown },
  { id: 'world-r94-south-shallows', tilesetId: tiles.world.id, cells: newAtlas.southWater },
  { id: 'world-r94-south-sand', tilesetId: tiles.world.id, cells: newAtlas.southSand },
  { id: 'world-r94-south-land', tilesetId: tiles.world.id, cells: newAtlas.southLand },
  { id: 'world-r94-south-pines', tilesetId: tiles.world.id, cells: newAtlas.southPines },
  { id: 'world-r94-south-lane', tilesetId: tiles.world.id, cells: newAtlas.southRoute },
];
if (eastSnowCount < 3_000 || eastPineCount < 100 || southIslandCount < 4_000) {
  throw new Error(`新增地貌统计不足：east=${eastSnowCount}, pines=${eastPineCount}, south=${southIslandCount}`);
}
for (const [id, centerCol, centerRow] of [
  ['map.round-94-east-gate', 700, 96], ['map.round-94-returning-sails', 405, 492],
]) {
  if (id === 'map.round-94-east-gate' && !eastInside(centerCol, centerRow)) throw new Error('天门关区域中心未落在东境雪岭。');
  if (id === 'map.round-94-returning-sails' && !southInside(centerCol, centerRow)) throw new Error('归帆洲区域中心未落在南岛。');
}
const allAtlasLayers = [...atlasLayers, ...extensionLayers, ...laterLayers];
const extensionIds = new Set(extensionLayers.map(({ id }) => id));
if (new Set(allAtlasLayers.map(({ id }) => id)).size !== allAtlasLayers.length) {
  throw new Error('Round 94 图层 id 冲突。');
}
for (const layer of allAtlasLayers) {
  if (layer.cells.length !== targetSize.rows || layer.cells.some((row) => row.length !== targetSize.columns)) {
    throw new Error(`舆图图层 ${layer.id} 未达到 ${targetSize.columns}×${targetSize.rows}。`);
  }
  const source = atlas.tilesets.find(({ id }) => id === layer.tilesetId);
  if (source === undefined || layer.cells.some((row) => row.some((gid) => gid > source.tileCount))) {
    throw new Error(`舆图图层 ${layer.id} 引用未登记或超界图素。`);
  }
}

const oldFootprint = atlas.regionFootprint ?? { columns: sourceSize.columns * 0.16, rows: sourceSize.rows * 0.16 };
const oldRegionIds = new Set(Object.keys(baseline.regions));
for (const region of world.regions) {
  if (!oldRegionIds.has(region.mapResourceId)) continue;
  const prior = baseline.regions[region.mapResourceId].center;
  region.atlasPosition = {
    x: Number((((prior.col - 0.5) / (targetSize.columns - 1)) * 100).toFixed(8)),
    y: Number((((prior.row - 0.5) / (targetSize.rows - 1)) * 100).toFixed(8)),
  };
}
const atlasPosition = (col, row) => ({
  x: Number(((col / (targetSize.columns - 1)) * 100).toFixed(8)),
  y: Number(((row / (targetSize.rows - 1)) * 100).toFixed(8)),
});
const eastId = 'map.round-94-east-gate';
const southId = 'map.round-94-returning-sails';
const regionAdditions = [
  {
    mapResourceId: eastId,
    name: '东隅·天门关',
    description: '雁回崖东脊越过旧雪道后，山势豁开的天门边关；石门、寒松与东望烽台守着通往海东的高路。',
    atlasPosition: atlasPosition(700, 96),
  },
  {
    mapResourceId: southId,
    name: '南溟·归帆洲',
    description: '潮生屿以南的新月形海洲，潮线下沉时礁滩连成弯月；归帆灯标为来往潮船辨认回港方向。',
    atlasPosition: atlasPosition(405, 492),
  },
];
const footprint = oldFootprint;
const overlaps = (a, b) => {
  const dx = (a.col - b.col) / footprint.columns;
  const dy = (a.row - b.row) / footprint.rows;
  return dx * dx + dy * dy < 1;
};
const newCenters = [{ col: 700.5, row: 96.5 }, { col: 405.5, row: 492.5 }];
for (const center of newCenters) {
  for (const region of world.regions.filter(({ mapResourceId }) =>
    !oldRegionIds.has(mapResourceId) && mapResourceId !== eastId && mapResourceId !== southId)) {
    const other = {
      col: region.atlasPosition.x / 100 * (targetSize.columns - 1) + 0.5,
      row: region.atlasPosition.y / 100 * (targetSize.rows - 1) + 0.5,
    };
    if (overlaps(center, other)) throw new Error(`Round 94 区域投影重叠：${region.mapResourceId}。`);
  }
  for (const other of newCenters) if (other !== center && overlaps(center, other)) throw new Error('Round 94 两个新区域投影相互重叠。');
}

const makeGrid = (kind) => Array.from({ length: 100 }, () => Array(100).fill(kind === 'east' ? '~' : '~'));
const insideLocal = (col, row, centerCol, centerRow, radiusX, radiusY) => {
  const dx = (col - centerCol) / radiusX;
  const dy = (row - centerRow) / radiusY;
  const rough = ((hashCoord(col, row, centerCol + centerRow) % 1000) / 1000 - 0.5) * 0.045;
  return dx * dx + dy * dy <= 1 + rough;
};
const addGridLine = (set, from, to, width = 1) => {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (let dy = -width; dy <= width; dy += 1) for (let dx = -width; dx <= width; dx += 1) {
      const x = col + dx; const y = row + dy;
      if (x >= 1 && x <= 98 && y >= 1 && y <= 98) set.add(`${x},${y}`);
    }
  }
};
const parsePoint = (key) => key.split(',').map(Number);
const localGrids = {};
const localLayers = {};
const eastGrid = makeGrid('east');
for (let row = 0; row < 100; row += 1) for (let col = 0; col < 100; col += 1) {
  if (insideLocal(col, row, 50, 50, 47, 44)) eastGrid[row][col] = ',';
}
const eastRoad = new Set();
const eastPoints = [
  { col: 2, row: 50 }, { col: 25, row: 50 }, { col: 42, row: 50 },
  { col: 42, row: 41 }, { col: 64, row: 41 }, { col: 72, row: 55 }, { col: 83, row: 62 },
];
for (let index = 1; index < eastPoints.length; index += 1) addGridLine(eastRoad, eastPoints[index - 1], eastPoints[index]);
const eastObstacles = [
  { col: 27, row: 34, rx: 9, ry: 6 }, { col: 60, row: 74, rx: 12, ry: 7 },
  { col: 26, row: 73, rx: 7, ry: 10 }, { col: 67, row: 25, rx: 10, ry: 6 },
];
for (const shape of eastObstacles) for (let row = 4; row < 96; row += 1) for (let col = 4; col < 96; col += 1) {
  if (insideLocal(col, row, shape.col, shape.row, shape.rx, shape.ry)) eastGrid[row][col] = hashCoord(col, row, 0x940b) % 2 ? '#' : '~';
}
for (const key of eastRoad) {
  const [col, row] = parsePoint(key);
  eastGrid[row][col] = '=';
}
for (const [col, row] of [[3, 50], [4, 50], [5, 50], [6, 50], [42, 41], [46, 42], [48, 42], [51, 42], [54, 42], [54, 43], [54, 44], [57, 44], [62, 41], [72, 55], [83, 62], [82, 62], [81, 62]]) {
  if (eastGrid[row][col] === '#' || eastGrid[row][col] === '~') eastGrid[row][col] = '.';
}
const eastCells = Array.from({ length: 5 }, () => Array.from({ length: 100 }, () => Array(100).fill(0)));
const [eastGround, eastTrail, eastPines, eastCliffs, eastFort] = eastCells;
const eastPineFrames = [17, 33, 49, 65, 81, 97];
const eastCliffFrames = [31, 32, 37, 38, 40, 42, 43, 45, 54, 55, 57, 58, 60, 61, 63, 65, 66, 68];
for (let row = 0; row < 100; row += 1) for (let col = 0; col < 100; col += 1) {
  if (eastGrid[row][col] === '~' || eastGrid[row][col] === '#') continue;
  eastGround[row][col] = 1;
  if (eastGrid[row][col] === '=') eastTrail[row][col] = mountainRoad[hashCoord(col, row, 0x940c) % mountainRoad.length];
  else if (hashCoord(col, row, 0x940d) % 100 < 8 && !eastRoad.has(`${col},${row}`)) {
    eastPines[row][col] = eastPineFrames[hashCoord(col, row, 0x940e) % eastPineFrames.length];
  }
  if ((eastGrid[row][col] === ',' && hashCoord(col, row, 0x940f) % 100 < 9)) {
    eastCliffs[row][col] = eastCliffFrames[hashCoord(col, row, 0x9410) % eastCliffFrames.length];
  }
}
for (const [col, row, gid] of [[44, 39, 58], [45, 39, 84], [44, 40, 17], [45, 40, 20]]) eastFort[row][col] = gid;
localGrids.east = eastGrid.map((line) => line.join(''));
localLayers.east = [
  { id: 'r94-east-ground', tilesetId: tiles.winter.id, cells: eastGround },
  { id: 'r94-east-trail', tilesetId: tiles.mountain.id, cells: eastTrail },
  { id: 'r94-east-pines', tilesetId: tiles.winter.id, cells: eastPines },
  { id: 'r94-east-cliffs', tilesetId: tiles.mountain.id, cells: eastCliffs },
  { id: 'r94-east-gatehouse', tilesetId: tiles.tinyTown.id, cells: eastFort },
];

const southGrid = makeGrid('south');
for (let row = 0; row < 100; row += 1) for (let col = 0; col < 100; col += 1) {
  if (insideLocal(col, row, 50, 51, 47, 40)) {
    const shoreline = !insideLocal(col + 1, row, 50, 51, 47, 40) ||
      !insideLocal(col - 1, row, 50, 51, 47, 40) ||
      !insideLocal(col, row + 1, 50, 51, 47, 40) ||
      !insideLocal(col, row - 1, 50, 51, 47, 40);
    southGrid[row][col] = shoreline ? ',' : '.';
  }
}
for (let row = 90; row < 100; row += 1) for (let col = 47; col <= 53; col += 1) southGrid[row][col] = '=';
const southRoad = new Set();
const southPoints = [
  { col: 50, row: 97 }, { col: 50, row: 86 }, { col: 43, row: 77 },
  { col: 43, row: 64 }, { col: 57, row: 56 }, { col: 69, row: 56 }, { col: 79, row: 65 },
];
for (let index = 1; index < southPoints.length; index += 1) addGridLine(southRoad, southPoints[index - 1], southPoints[index]);
for (const shape of [
  { col: 23, row: 45, rx: 8, ry: 11 }, { col: 66, row: 34, rx: 9, ry: 7 },
  { col: 30, row: 75, rx: 7, ry: 6 }, { col: 73, row: 79, rx: 9, ry: 6 },
]) for (let row = 8; row < 91; row += 1) for (let col = 4; col < 96; col += 1) {
  if (insideLocal(col, row, shape.col, shape.row, shape.rx, shape.ry) && southGrid[row][col] !== '~') southGrid[row][col] = '#';
}
for (const key of southRoad) {
  const [col, row] = parsePoint(key);
  southGrid[row][col] = '=';
}
for (const [col, row] of [[49, 97], [50, 97], [51, 97], [50, 94], [50, 91], [47, 85], [48, 84], [49, 83], [51, 82], [50, 82], [48, 82], [52, 82], [55, 80], [55, 81], [55, 82], [79, 65], [78, 65], [77, 65], [76, 65]]) {
  if (southGrid[row][col] === '~' || southGrid[row][col] === '#') southGrid[row][col] = '.';
}
const southCells = Array.from({ length: 5 }, () => Array.from({ length: 100 }, () => Array(100).fill(0)));
const [southWater, southShore, southLand, southPines, southPort] = southCells;
for (let row = 0; row < 100; row += 1) for (let col = 0; col < 100; col += 1) {
  const cell = southGrid[row][col];
  const seed = hashCoord(col, row, 0x9411);
  if (cell === '~') southWater[row][col] = oceanGids[seed % oceanGids.length];
  else if (cell === ',') southShore[row][col] = sandGids[seed % sandGids.length];
  else {
    southLand[row][col] = grassGids[seed % grassGids.length];
    if (cell === '.' && seed % 100 < 8 && !southRoad.has(`${col},${row}`)) {
      southPines[row][col] = pineGids[hashCoord(col, row, 0x9412) % pineGids.length];
    }
  }
}
for (const [col, row, gid] of [[53, 80, 108], [54, 80, 182], [55, 80, 183], [53, 81, 185], [54, 81, 186]]) southPort[row][col] = gid;
localGrids.south = southGrid.map((line) => line.join(''));
localLayers.south = [
  { id: 'r94-south-water', tilesetId: tiles.world.id, cells: southWater },
  { id: 'r94-south-shore', tilesetId: tiles.world.id, cells: southShore },
  { id: 'r94-south-ground', tilesetId: tiles.world.id, cells: southLand },
  { id: 'r94-south-pines', tilesetId: tiles.world.id, cells: southPines },
  { id: 'r94-south-port', tilesetId: 'opengameart.rpg-town', cells: southPort },
];

const actorId = 'opengameart.puny-characters';
const actor = ridgeMap.art.tilesets.find(({ id }) => id === actorId);
if (actor === undefined) throw new Error('Round 94 地图缺少已登记的 Puny Characters 人物图集。');
const townTiles = tideMap.art.tilesets.find(({ id }) => id === 'opengameart.rpg-town');
if (townTiles === undefined) throw new Error('Round 94 归帆洲需要已登记的 RPG Town CC0 图集。');
const eastTilesets = [tiles.winter, tiles.mountain, tiles.tinyTown, actor];
const southTilesets = [tiles.world, townTiles, actor];
const actorDeclaration = {
  tilesetId: actorId,
  playerFrame: 256,
  defaultNpcFrame: 64,
  playerFrames: {
    idle: { down: 256, right: 264, up: 272, left: 280 },
    walk: { down: [257, 258, 259], right: [265, 266, 267], up: [273, 274, 275], left: [281, 282, 283] },
  },
};
const gridLayer = (layer) => ({
  id: layer.id,
  tilesetId: layer.tilesetId,
  cells: layer.cells,
});
const eastMap = {
  id: eastId,
  name: '东隅·天门关',
  tileSize: 48,
  columns: 100,
  rows: 100,
  tileTypes: {
    '.': { color: '#d7e1df', solid: false },
    ',': { color: '#bacbc9', solid: false },
    '=': { color: '#8cb8c7', solid: false },
    '#': { color: '#5d6c73', solid: true },
    '~': { color: '#263f50', solid: true },
  },
  grid: localGrids.east,
  playerStart: { col: 3, row: 50 },
  art: { tileSize: 16, tilesets: eastTilesets, layers: localLayers.east.map(gridLayer), actors: actorDeclaration },
};
const southMap = {
  id: southId,
  name: '南溟·归帆洲',
  tileSize: 48,
  columns: 100,
  rows: 100,
  tileTypes: {
    '.': { color: '#6c986c', solid: false },
    ',': { color: '#d7c998', solid: false },
    '=': { color: '#a6c5bb', solid: false },
    '#': { color: '#455b50', solid: true },
    '~': { color: '#168b9b', solid: true },
  },
  grid: localGrids.south,
  playerStart: { col: 50, row: 97 },
  art: { tileSize: 16, tilesets: southTilesets, layers: localLayers.south.map(gridLayer), actors: actorDeclaration },
};

const npcs = [
  {
    id: 'char.r94-shen-wenqiu', name: '沈问秋', mapResourceId: eastId,
    position: { col: 48, row: 42 }, dialogueId: 'dlg.r94-shen-wenqiu', questGiver: true,
    spriteFrame: 160, spriteFrames: { down: 160, right: 168, up: 176, left: 184 },
    schedule: [
      ['period.midnight', 45, 42], ['period.dawn', 48, 42], ['period.morning', 51, 42],
      ['period.midday', 54, 44], ['period.afternoon', 54, 42], ['period.dusk', 49, 42], ['period.night', 45, 42],
    ].map(([periodId, col, row]) => ({ periodId, position: { col, row } })),
  },
  {
    id: 'char.r94-zhao-qianfan', name: '赵千帆', mapResourceId: southId,
    position: { col: 51, row: 82 }, dialogueId: 'dlg.r94-zhao-qianfan', questGiver: true,
    spriteFrame: 64, spriteFrames: { down: 64, right: 72, up: 80, left: 88 },
    schedule: [
      ['period.midnight', 49, 83], ['period.dawn', 48, 84], ['period.morning', 50, 82],
      ['period.midday', 52, 82], ['period.afternoon', 55, 82], ['period.dusk', 55, 81], ['period.night', 50, 82],
    ].map(([periodId, col, row]) => ({ periodId, position: { col, row } })),
  },
];
const quests = [
  {
    id: 'quest.r94-snowline-signal',
    name: '雪脊传书',
    description: '守关人沈问秋请你沿东脊检查旧烽台的石刻，再把记录带回天门关。',
    giverNpcId: 'char.r94-shen-wenqiu',
    objectives: [
      { id: 'objective.r94-enter-east-gate', kind: 'discoverKnowledge', targetId: 'place.r94-east-gate', requiredCount: 1, text: '从雁回崖东脊进入天门关' },
      { id: 'objective.r94-read-east-beacon', kind: 'discoverKnowledge', targetId: 'place.r94-east-beacon', requiredCount: 1, text: '在东望烽台拓下旧石刻' },
      { id: 'objective.r94-report-east-beacon', kind: 'talkToNpc', targetId: 'char.r94-shen-wenqiu', requiredCount: 1, text: '带着拓记回关向沈问秋复命' },
    ],
    rewards: { experience: 36, currency: 28, discoverKnowledgeNodeIds: ['place.r94-cloud-window'] },
  },
  {
    id: 'quest.r94-homeward-lantern',
    name: '归帆灯火',
    description: '舟师赵千帆请你到岛东礁岸辨认归帆灯标的旧信号，再回南码头报信。',
    giverNpcId: 'char.r94-zhao-qianfan',
    objectives: [
      { id: 'objective.r94-enter-sails', kind: 'discoverKnowledge', targetId: 'place.r94-returning-sails', requiredCount: 1, text: '乘渡到达南溟归帆洲' },
      { id: 'objective.r94-survey-lantern', kind: 'discoverKnowledge', targetId: 'place.r94-homeward-lantern', requiredCount: 1, text: '在东岸灯标下核对潮汐刻线' },
      { id: 'objective.r94-report-lantern', kind: 'talkToNpc', targetId: 'char.r94-zhao-qianfan', requiredCount: 1, text: '回南码头向赵千帆报信' },
    ],
    rewards: { experience: 34, currency: 30, discoverKnowledgeNodeIds: ['place.r94-moon-reef'] },
  },
];
const conversations = [
  {
    id: 'dlg.r94-shen-wenqiu', startNodeId: 'greet', nodes: [
      { id: 'greet', text: '沈问秋把一叠被风雪磨卷的旧驿牒压在石桌上：「东脊新开的天门关，如今只剩烽台石刻能告诉我们山外的旧路。你沿路去拓一份回来，我便敢给关门添上一笔新记。」', options: [
        { text: '我去看看烽台。', nextNodeId: 'accepted', conditions: [{ kind: 'questStatus', questId: quests[0].id, status: 'offered' }], effects: [{ kind: 'acceptQuest', questId: quests[0].id }] },
        { text: '烽台的拓记已带回。', nextNodeId: 'completed', conditions: [{ kind: 'questStatus', questId: quests[0].id, status: 'completed' }] },
        { text: '我这就上东脊。', nextNodeId: 'active', conditions: [{ kind: 'questStatus', questId: quests[0].id, status: 'active' }] },
        { text: '东脊怎么走？', nextNodeId: 'route' },
        { text: '先告辞。', nextNodeId: 'farewell' },
      ] },
      { id: 'accepted', text: '「沿雪脊向东过石门，烽台在两排寒松后面。石刻别全拓，正对山口那三道短线才是旧驿记号。」' },
      { id: 'active', text: '「风从北谷灌下来时，烽台东侧背风。石缝里有冻水，别用刀硬撬，拓纸沾湿就糊了。」' },
      { id: 'completed', text: '沈问秋把拓本举到窗前：「三道短线，一道向海，两道回山。老路不是直出去的，是照着海雾绕。」他把一枚暖石递给你，指向关门外延伸的白脊。' },
      { id: 'route', text: '「出门向东，过石门沿脊道走，见到三株并生的矮松后转南，石台就在崖边。」' },
      { id: 'farewell', text: '沈问秋收起驿牒，继续在关门旁听风辨雪。' },
    ],
  },
  {
    id: 'dlg.r94-zhao-qianfan', startNodeId: 'greet', nodes: [
      { id: 'greet', text: '赵千帆蹲在归帆洲南码头，把一盏裂了边的旧灯罩转了半圈：「岛东那盏灯近来照得不对，浪高时看不出回港的方向。你去礁岸按刻线核一下，回来告诉我该往哪边偏舵。」', options: [
        { text: '我去礁岸核灯。', nextNodeId: 'accepted', conditions: [{ kind: 'questStatus', questId: quests[1].id, status: 'offered' }], effects: [{ kind: 'acceptQuest', questId: quests[1].id }] },
        { text: '刻线已经核过。', nextNodeId: 'completed', conditions: [{ kind: 'questStatus', questId: quests[1].id, status: 'completed' }] },
        { text: '我正在找灯标。', nextNodeId: 'active', conditions: [{ kind: 'questStatus', questId: quests[1].id, status: 'active' }] },
        { text: '灯标怎么走？', nextNodeId: 'route' },
        { text: '改日再谈。', nextNodeId: 'farewell' },
      ] },
      { id: 'accepted', text: '「沿岛心石道往东，看到一道像半月的浅礁就下到滩上。灯柱下面有三圈刻线，数一数哪圈朝北缺口最深。」' },
      { id: 'active', text: '「不必把灯拆开，看礁上的潮痕就知道灯该往哪边转。东南风起来前回来，渡船还赶得上。」' },
      { id: 'completed', text: '赵千帆听完点头：「原来旧灯向西偏了半掌，难怪雾里总把人引到外礁。今夜我就改灯。你替这一带的船省了半夜绕路。」' },
      { id: 'route', text: '「离开码头后沿石道向东，过岛心松坡再下南滩；礁岸的灯柱在小湾北头。」' },
      { id: 'farewell', text: '赵千帆把灯罩放回木箱，转身去检查靠岸的缆绳。' },
    ],
  },
];
const events = [
  {
    id: 'event.r94-east-arrival', mapResourceId: eastId, col: 6, row: 50,
    text: '走过雁回崖东脊的石门，视野豁然一宽：雪岭尽头立着一座低矮关城，烽台的旧刻痕正对东海雾线。',
    approachText: '石门背风处有新雪扫出的脚印，一直向东。', once: true, discoverKnowledgeNodeId: 'place.r94-east-gate',
  },
  {
    id: 'event.r94-east-beacon', mapResourceId: eastId, col: 83, row: 62,
    text: '烽台侧面的石刻不是烽火次数，而是旧驿道的三道分岔记号。拓纸合上时，最短的一道正指向海雾升起的缺口。',
    approachText: '松枝后露出半圈石台，磨平的一面留有细短刻线。', once: true,
    discoverKnowledgeNodeId: 'place.r94-east-beacon',
    interaction: { prompt: '拓下东望烽台的旧驿石刻', range: 1, approachDirections: ['left', 'right', 'down'] },
  },
  {
    id: 'event.r94-south-arrival', mapResourceId: southId, col: 50, row: 94,
    text: '渡船把你送到一截伸入潮面的木栈。归帆洲环抱着半月形浅滩，岛东的灯火隔着松坡忽明忽暗。',
    approachText: '南码头潮线正退，木栈尽头露出一排旧系船环。', once: true, discoverKnowledgeNodeId: 'place.r94-returning-sails',
  },
  {
    id: 'event.r94-south-lantern', mapResourceId: southId, col: 79, row: 65,
    text: '礁岸灯柱上的旧刻线比新灯罩偏了半掌；岛民留下的浅槽正好对准回潮时最安全的一条水巷。',
    approachText: '半月形浅礁上有三圈刻线，其中一圈朝北的缺口被海盐填白。', once: true,
    discoverKnowledgeNodeId: 'place.r94-homeward-lantern',
    interaction: { prompt: '核对归帆灯标的潮汐刻线', range: 1, approachDirections: ['left', 'right', 'up'] },
  },
];
const landmarks = [
  { id: 'landmark.r94-east-gate', mapResourceId: eastId, col: 15, row: 50, name: '天门石门', category: 'crossing', discoveryNodeId: 'place.r94-east-gate' },
  { id: 'landmark.r94-east-beacon', mapResourceId: eastId, col: 83, row: 62, name: '东望烽台', category: 'other', discoveryNodeId: 'place.r94-east-beacon' },
  { id: 'landmark.r94-south-pier', mapResourceId: southId, col: 50, row: 94, name: '归帆南栈', category: 'crossing', discoveryNodeId: 'place.r94-returning-sails' },
  { id: 'landmark.r94-south-lantern', mapResourceId: southId, col: 79, row: 65, name: '半月礁灯标', category: 'water', discoveryNodeId: 'place.r94-homeward-lantern' },
];
const transitions = [
  { id: 'gate.r94-terrace-to-east', name: '东行天门雪道', from: { mapResourceId: ridgeMap.id, col: 96, row: 60 }, to: { mapResourceId: eastId, col: 3, row: 50 } },
  { id: 'gate.r94-east-to-terrace', name: '西返雁回崖', from: { mapResourceId: eastId, col: 4, row: 50 }, to: { mapResourceId: ridgeMap.id, col: 95, row: 60 } },
  { id: 'gate.r94-tide-to-south', name: '南渡归帆洲', from: { mapResourceId: tideMap.id, col: 7, row: 50 }, to: { mapResourceId: southId, col: 50, row: 97 } },
  { id: 'gate.r94-south-to-tide', name: '北返潮生屿', from: { mapResourceId: southId, col: 49, row: 97 }, to: { mapResourceId: tideMap.id, col: 9, row: 50 } },
];
const nodeAdditions = [
  { id: eastId, kind: 'place', title: '东隅·天门关探索地图', summary: '从雁回崖东脊进入的高山边关地图。', knownByDefault: false },
  { id: 'place.r94-east-gate', kind: 'place', title: '东隅·天门关', summary: '雁回崖东侧雪岭尽头的边关，石门与东望烽台守着海雾旧路。', knownByDefault: false },
  { id: 'place.r94-east-beacon', kind: 'place', title: '东望烽台', summary: '天门关外的古驿烽台，石刻记有绕开海雾的旧路分岔。', knownByDefault: false },
  { id: 'place.r94-cloud-window', kind: 'place', title: '云外望海窗', summary: '从东望烽台旁的山缺可辨海雾与旧航路。', knownByDefault: false },
  { id: 'char.r94-shen-wenqiu', kind: 'character', title: '沈问秋', summary: '守着天门关东脊驿牒的巡关人。', knownByDefault: false },
  { id: 'quest.r94-snowline-signal', kind: 'quest', title: '雪脊传书', summary: '登东望烽台核对旧驿石刻并回关复命。', knownByDefault: false },
  { id: 'event.r94-east-arrival', kind: 'event', title: '初入天门关', summary: '首次穿过雁回崖东脊石门。', knownByDefault: false },
  { id: 'event.r94-east-beacon', kind: 'event', title: '拓录东望烽刻', summary: '调查烽台石刻后认出旧驿道分岔。', knownByDefault: false },
  { id: southId, kind: 'place', title: '南溟·归帆洲探索地图', summary: '从潮生屿乘渡可达的南海洲岛地图。', knownByDefault: false },
  { id: 'place.r94-returning-sails', kind: 'place', title: '南溟·归帆洲', summary: '潮生屿以南的新月形海洲，木栈与潮滩连着半月礁灯标。', knownByDefault: false },
  { id: 'place.r94-homeward-lantern', kind: 'place', title: '归帆灯标', summary: '岛东礁岸上的旧灯柱，刻线指明避开外礁的归港水巷。', knownByDefault: false },
  { id: 'place.r94-moon-reef', kind: 'place', title: '半月浅礁', summary: '归帆洲东南侧的浅礁，回潮时露出旧航槽。', knownByDefault: false },
  { id: 'char.r94-zhao-qianfan', kind: 'character', title: '赵千帆', summary: '在归帆洲南码头掌渡的舟师。', knownByDefault: false },
  { id: 'quest.r94-homeward-lantern', kind: 'quest', title: '归帆灯火', summary: '调查半月礁灯标的旧刻线并向赵千帆报信。', knownByDefault: false },
  { id: 'event.r94-south-arrival', kind: 'event', title: '初到归帆洲', summary: '由潮生屿乘渡抵达南溟归帆洲。', knownByDefault: false },
  { id: 'event.r94-south-lantern', kind: 'event', title: '核对归帆灯刻', summary: '调查礁岸灯标，辨出安全水巷的刻线。', knownByDefault: false },
];
const edgeAdditions = [
  ['east-arrival-place', 'event.r94-east-arrival', 'place.r94-east-gate', 'triggers', '穿过东脊石门时发现天门关。'],
  ['east-map-place', eastId, 'place.r94-east-gate', 'locatedAt', '天门关由独立百格地图承载。'],
  ['east-beacon-place', 'event.r94-east-beacon', 'place.r94-east-beacon', 'triggers', '拓录烽台石刻后记录东望烽台。'],
  ['east-beacon-map', 'place.r94-east-beacon', eastId, 'locatedAt', '东望烽台位于天门关探索地图。'],
  ['east-npc-map', 'char.r94-shen-wenqiu', eastId, 'locatedAt', '沈问秋驻守天门关。'],
  ['east-npc-quest', 'char.r94-shen-wenqiu', 'quest.r94-snowline-signal', 'participatesIn', '沈问秋委托雪脊传书。'],
  ['east-quest-beacon', 'quest.r94-snowline-signal', 'place.r94-east-beacon', 'requires', '雪脊传书需要调查东望烽台。'],
  ['east-quest-reward', 'quest.r94-snowline-signal', 'place.r94-cloud-window', 'rewards', '复命后解锁云外望海窗见闻。'],
  ['south-arrival-place', 'event.r94-south-arrival', 'place.r94-returning-sails', 'triggers', '乘渡抵达归帆洲时发现南海新洲。'],
  ['south-map-place', southId, 'place.r94-returning-sails', 'locatedAt', '归帆洲由独立百格地图承载。'],
  ['south-lantern-place', 'event.r94-south-lantern', 'place.r94-homeward-lantern', 'triggers', '核对旧灯刻后认出归帆灯标。'],
  ['south-lantern-map', 'place.r94-homeward-lantern', southId, 'locatedAt', '归帆灯标位于归帆洲东岸。'],
  ['south-npc-map', 'char.r94-zhao-qianfan', southId, 'locatedAt', '赵千帆在归帆洲南码头掌渡。'],
  ['south-npc-quest', 'char.r94-zhao-qianfan', 'quest.r94-homeward-lantern', 'participatesIn', '赵千帆委托核对归帆灯火。'],
  ['south-quest-lantern', 'quest.r94-homeward-lantern', 'place.r94-homeward-lantern', 'requires', '归帆灯火需要调查半月礁旧灯刻。'],
  ['south-quest-reward', 'quest.r94-homeward-lantern', 'place.r94-moon-reef', 'rewards', '复命后解锁半月浅礁见闻。'],
].map(([suffix, fromId, toId, relation, summary]) => ({
  id: `kg.edge.r94-${suffix}`, fromId, toId, relation, summary,
}));
const resourceAdditions = [
  { id: eastId, path: 'maps/round-94-east-gate.json', schema: 'grid-map' },
  { id: southId, path: 'maps/round-94-returning-sails.json', schema: 'grid-map' },
  { id: 'npc.round-94-frontiers-set', path: 'characters/round-94-frontiers-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-94-frontiers-set', path: 'dialogues/round-94-frontiers-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-94-frontiers-set', path: 'quests/round-94-frontiers-quests.json', schema: 'quest-set' },
];
const mergeManaged = (current, additions, keyOf, anchorKey) => {
  const byKey = new Map(additions.map((entry) => [keyOf(entry), entry]));
  const present = new Set();
  const merged = current.map((entry) => {
    const key = keyOf(entry);
    const replacement = byKey.get(key);
    if (replacement === undefined) return entry;
    present.add(key);
    return replacement;
  });
  const missing = additions.filter((entry) => !present.has(keyOf(entry)));
  const anchor = anchorKey === undefined ? -1 : merged.findIndex((entry) => keyOf(entry) === anchorKey);
  merged.splice(anchor < 0 ? merged.length : anchor, 0, ...missing);
  return merged;
};
world.regions = mergeManaged(world.regions, regionAdditions, (entry) => entry.mapResourceId);
world.landmarks = mergeManaged(world.landmarks ?? [], landmarks, (entry) => entry.id);
world.transitions = mergeManaged(world.transitions, transitions, (entry) => entry.id);
world.events = mergeManaged(world.events, events, (entry) => entry.id);
world.atlasArt = {
  columns: targetSize.columns,
  rows: targetSize.rows,
  tileSize: targetTileSize,
  regionFootprint: footprint,
  tilesets: atlas.tilesets,
  layers: allAtlasLayers.map((layer) => ({ id: layer.id, tilesetId: layer.tilesetId, cellsRle: encodeAtlasCells(layer.cells) })),
};
manifest.resources = mergeManaged(manifest.resources, resourceAdditions, (entry) => entry.id, 'world.atlas');
nodes.nodes = mergeManaged(nodes.nodes, nodeAdditions, (entry) => entry.id);
edges.edges = mergeManaged(edges.edges, edgeAdditions, (entry) => entry.id);

const maps = new Map([[ridgeMap.id, ridgeMap], [tideMap.id, tideMap], [eastId, eastMap], [southId, southMap]]);
const isWalkable = (map, col, row) => {
  const symbol = map.grid[row]?.[col];
  return symbol !== undefined && map.tileTypes[symbol]?.solid === false;
};
const reachable = (map, start) => {
  if (!isWalkable(map, start.col, start.row)) throw new Error(`${map.id} 起点 (${start.col},${start.row}) 不可走。`);
  const seen = new Set([`${start.col},${start.row}`]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const position = queue[index];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const col = position.col + dx; const row = position.row + dy; const key = `${col},${row}`;
      if (col < 0 || row < 0 || col >= map.columns || row >= map.rows || seen.has(key) || !isWalkable(map, col, row)) continue;
      seen.add(key);
      queue.push({ col, row });
    }
  }
  return seen;
};
const mapNpcs = { npcs };
const mapQuests = { quests };
const eventById = new Map(events.map((event) => [event.id, event]));
const npcById = new Map(npcs.map((npc) => [npc.id, npc]));
const gateChecks = [
  { map: ridgeMap, start: ridgeMap.playerStart, cell: { col: 96, row: 60 } },
  { map: eastMap, start: eastMap.playerStart, cell: { col: 4, row: 50 } },
  { map: tideMap, start: tideMap.playerStart, cell: { col: 7, row: 50 } },
  { map: southMap, start: southMap.playerStart, cell: { col: 49, row: 97 } },
];
for (const { map, start, cell } of gateChecks) {
  const seen = reachable(map, start);
  if (!seen.has(`${cell.col},${cell.row}`)) throw new Error(`${map.id} 关口 (${cell.col},${cell.row}) 从入口不可达。`);
}
for (const npc of npcs) {
  const map = maps.get(npc.mapResourceId);
  const seen = reachable(map, map.playerStart);
  if (!seen.has(`${npc.position.col},${npc.position.row}`)) throw new Error(`${npc.id} 日程主位置不可达。`);
  for (const entry of npc.schedule) if (!seen.has(`${entry.position.col},${entry.position.row}`)) {
    throw new Error(`${npc.id} ${entry.periodId} 日程位置不可达。`);
  }
}
for (const event of events) {
  const map = maps.get(event.mapResourceId);
  const seen = reachable(map, map.playerStart);
  if (!seen.has(`${event.col},${event.row}`)) throw new Error(`${event.id} 事件位置不可达。`);
}
for (const transition of transitions) {
  for (const endpoint of [transition.from, transition.to]) {
    const map = maps.get(endpoint.mapResourceId);
    if (map === undefined || !isWalkable(map, endpoint.col, endpoint.row)) {
      throw new Error(`${transition.id} 关口端点不可走：${endpoint.mapResourceId} (${endpoint.col},${endpoint.row})。`);
    }
  }
}
const npcData = { npcs: mapNpcs.npcs };
const dialogueData = { conversations };
const questData = { quests: mapQuests.quests };
const writeTasks = [
  writeJson(paths.world, world), writeJson(paths.manifest, manifest),
  writeJson(paths.nodes, nodes), writeJson(paths.edges, edges),
  writeJson(paths.east, eastMap), writeJson(paths.south, southMap),
  writeJson(paths.npcs, npcData), writeJson(paths.dialogues, deepenNorthDialogues(dialogueData)), writeJson(paths.quests, deepenNorthQuests(questData)),
];
await Promise.all(writeTasks);
console.log(`Expanded the mobile atlas to ${targetSize.columns}×${targetSize.rows} (8 px/cell), ${world.atlasArt.layers.length} layers, ${world.regions.length} regions.`);
console.log(`Built east snow ridge (${eastSnowCount} cells, ${eastPineCount} pines) and southern shoals (${southIslandCount} land cells); both 100×100 routes passed BFS.`);
