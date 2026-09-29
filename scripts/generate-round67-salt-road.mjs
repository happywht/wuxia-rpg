import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapResourceId = 'map.round-67-salt-road';
const outputPath = resolve(repoRoot, 'data/base/maps/round-67-salt-road.json');
const sourcePath = resolve(repoRoot, 'data/base/maps/round-01-grid.json');
const columns = 100;
const rows = 100;
const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;
const key = (col, row) => `${col},${row}`;
const blank = () => Array.from({ length: rows }, () => Array(columns).fill(0));

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [sourceMap, world, npcSet, encounterSet] = await Promise.all([
  readJson(sourcePath),
  readJson(resolve(repoRoot, 'data/base/world/world-map.json')),
  readJson(resolve(repoRoot, 'data/base/characters/round-03-npcs.json')),
  readJson(resolve(repoRoot, 'data/base/battles/round-05-encounters.json')),
]);

const regionTransitions = (world.transitions ?? []).filter((transition) =>
  transition.from.mapResourceId === mapResourceId || transition.to.mapResourceId === mapResourceId,
);
const incoming = regionTransitions.find((transition) => transition.to.mapResourceId === mapResourceId);
if (incoming === undefined) throw new Error('世界地图没有通往西陲盐道的入关路线。');
const playerStart = { col: incoming.to.col, row: incoming.to.row };
const anchors = new Map();
function addAnchor(label, point, buffer = 1) {
  if (!inside(point.col, point.row)) throw new Error(`${label} 坐标越界：(${point.col}, ${point.row})`);
  anchors.set(key(point.col, point.row), label);
  for (let row = point.row - buffer; row <= point.row + buffer; row++) {
    for (let col = point.col - buffer; col <= point.col + buffer; col++) {
      if (inside(col, row)) anchors.set(key(col, row), `${label} 邻格`);
    }
  }
}

addAnchor('入关出生点', playerStart);
for (const transition of regionTransitions) {
  for (const endpoint of [transition.from, transition.to]) {
    if (endpoint.mapResourceId === mapResourceId) addAnchor(`关口 ${transition.id}`, endpoint);
  }
}
for (const landmark of world.landmarks ?? []) {
  if (landmark.mapResourceId === mapResourceId) addAnchor(`地标 ${landmark.id}`, landmark);
}
for (const event of world.events ?? []) {
  if (event.mapResourceId === mapResourceId) addAnchor(`事件 ${event.id}`, event);
}
for (const npc of npcSet.npcs ?? []) {
  if (npc.mapResourceId !== mapResourceId) continue;
  addAnchor(`人物 ${npc.id}`, npc.position);
  for (const schedule of npc.schedule ?? []) addAnchor(`日程 ${npc.id}/${schedule.periodId}`, schedule.position);
}
for (const encounter of encounterSet.encounters ?? []) {
  if (encounter.mapResourceId === mapResourceId) addAnchor(`遭遇 ${encounter.id}`, encounter.position);
}

const hashCell = (col, row, salt = 0) => {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};

const roads = new Set();
function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (inside(col + dx, row + dy)) roads.add(key(col + dx, row + dy));
    }
  }
}
function addRoad(points) {
  for (let index = 1; index < points.length; index++) addRoadSegment(points[index - 1], points[index]);
}

// Main salt road reaches both the western caravan trail and the eastern pass.
addRoad([
  { col: 4, row: 76 }, { col: 17, row: 69 }, { col: 31, row: 61 },
  { col: 43, row: 54 }, { col: 57, row: 52 }, { col: 68, row: 59 },
  { col: 81, row: 67 }, { col: 94, row: 74 },
]);
// Branches lead to the dry well, the old salt-yard and a small spring basin.
addRoad([{ col: 43, row: 54 }, { col: 39, row: 45 }, { col: 33, row: 36 }, { col: 26, row: 28 }]);
addRoad([{ col: 55, row: 52 }, { col: 59, row: 43 }, { col: 67, row: 34 }, { col: 76, row: 25 }]);
addRoad([{ col: 68, row: 59 }, { col: 72, row: 71 }, { col: 78, row: 82 }]);

const roadBuffer = new Set(roads);
for (const cell of roads) {
  const [col, row] = cell.split(',').map(Number);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 2 && inside(col + dx, row + dy)) roadBuffer.add(key(col + dx, row + dy));
    }
  }
}

const settlement = { col: 39, row: 38, columns: 27, rows: 23, sourceCol: 17, sourceRow: 14 };
const insideSettlement = (col, row) => col >= settlement.col && row >= settlement.row &&
  col < settlement.col + settlement.columns && row < settlement.row + settlement.rows;
const settlementBlocked = Array.from({ length: rows }, () => Array(columns).fill(false));
const settlementLayers = sourceMap.art.layers.slice(1).map(() => blank());
const ground = blank();
const saltCrust = blank();
const ridges = blank();
const paths = blank();
const grid = Array.from({ length: rows }, () => Array(columns).fill('.'));
const rockFrames = [747, 748, 749, 750, 751, 1032, 1033, 1034, 1035, 1252, 1253];
const saltFrames = [143, 144, 148, 149];
const pathFrames = [576, 577, 578, 579];
const saltPans = [
  { col: 23, row: 46, radiusX: 13, radiusY: 8, salt: 0x67a1 },
  { col: 83, row: 47, radiusX: 12, radiusY: 9, salt: 0x67a2 },
  { col: 17, row: 20, radiusX: 8, radiusY: 10, salt: 0x67a3 },
  { col: 82, row: 87, radiusX: 11, radiusY: 7, salt: 0x67a4 },
];
const rockRises = [
  { col: 13, row: 37, radiusX: 8, radiusY: 12, salt: 0x67b1 },
  { col: 87, row: 31, radiusX: 8, radiusY: 12, salt: 0x67b2 },
  { col: 31, row: 85, radiusX: 12, radiusY: 7, salt: 0x67b3 },
  { col: 62, row: 15, radiusX: 13, radiusY: 8, salt: 0x67b4 },
];
const inEllipse = (col, row, shape, threshold = 100) => {
  const x = (col - shape.col) / shape.radiusX;
  const y = (row - shape.row) / shape.radiusY;
  return x * x + y * y <= 1 && hashCell(col, row, shape.salt) % 100 < threshold;
};
const isProtected = (col, row) => anchors.has(key(col, row)) || roads.has(key(col, row));

for (let row = settlement.row; row < settlement.row + settlement.rows; row++) {
  for (let col = settlement.col; col < settlement.col + settlement.columns; col++) {
    const sourceCol = settlement.sourceCol + col - settlement.col;
    const sourceRow = settlement.sourceRow + row - settlement.row;
    for (let layerIndex = 0; layerIndex < settlementLayers.length; layerIndex++) {
      settlementLayers[layerIndex][row][col] = sourceMap.art.layers[layerIndex + 1]?.cells[sourceRow]?.[sourceCol] ?? 0;
    }
    const sourceTile = sourceMap.grid[sourceRow]?.[sourceCol];
    settlementBlocked[row][col] = sourceTile === undefined || sourceMap.tileTypes[sourceTile]?.solid === true;
    ground[row][col] = sourceMap.art.layers[0]?.cells[sourceRow]?.[sourceCol] ?? 0;
  }
}

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const cell = key(col, row);
    const protectedCell = isProtected(col, row);
    const road = roads.has(cell);
    const boundary = col === 0 || row === 0 || col === columns - 1 || row === rows - 1;
    const inSettlement = insideSettlement(col, row);
    const rock = !roadBuffer.has(cell) && !inSettlement && rockRises.some((shape) => inEllipse(col, row, shape, 71));
    if (ground[row][col] === 0) {
      const texture = hashCell(col, row, 0x67c1) % 100;
      ground[row][col] = texture < 72 ? 8 : texture < 87 ? 63 : 64;
    }
    const pan = saltPans.find((shape) => !inSettlement && !roadBuffer.has(cell) && inEllipse(col, row, shape, 100));
    if (pan !== undefined && !protectedCell) saltCrust[row][col] = saltFrames[hashCell(col, row, pan.salt ^ 0x67c2) % saltFrames.length];
    if (rock) ridges[row][col] = rockFrames[hashCell(col, row, 0x67d1) % rockFrames.length];

    if (road) {
      grid[row][col] = '.';
      ridges[row][col] = 0;
      saltCrust[row][col] = 0;
      for (const layer of settlementLayers) layer[row][col] = 0;
      paths[row][col] = pathFrames[hashCell(col, row, 0x67e1) % pathFrames.length];
      continue;
    }
    if (boundary && !protectedCell) { grid[row][col] = '#'; continue; }
    if (protectedCell) {
      grid[row][col] = '.';
      ridges[row][col] = 0;
      for (const layer of settlementLayers) layer[row][col] = 0;
      continue;
    }
    if (inSettlement && settlementBlocked[row][col]) { grid[row][col] = '#'; continue; }
    if (rock) { grid[row][col] = '#'; continue; }
    const texture = hashCell(col, row, 0x67f1) % 100;
    grid[row][col] = texture < 13 ? ',' : '.';
  }
}

const mapGrid = grid.map((line) => line.join(''));
function reachableFrom(start) {
  if (mapGrid[start.row]?.[start.col] === '#' || mapGrid[start.row]?.[start.col] === undefined) {
    throw new Error('入关出生格被阻挡或越界。');
  }
  const reached = new Set([key(start.col, start.row)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (point === undefined) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = point.col + dx;
      const row = point.row + dy;
      const next = key(col, row);
      if (!inside(col, row) || mapGrid[row]?.[col] === '#' || reached.has(next)) continue;
      reached.add(next);
      queue.push({ col, row });
    }
  }
  return reached;
}

const reached = reachableFrom(playerStart);
for (const [cell, label] of anchors) {
  const [col, row] = cell.split(',').map(Number);
  if (!label.endsWith('邻格') && !reached.has(cell)) throw new Error(`${label} 从西陲盐道入关点不可达：(${col},${row})`);
}
for (const transition of regionTransitions) {
  const endpoint = transition.from.mapResourceId === mapResourceId ? transition.from : transition.to;
  if (!reached.has(key(endpoint.col, endpoint.row))) throw new Error(`关口 ${transition.id} 在盐道地图上不可达。`);
}

const output = {
  id: mapResourceId,
  name: '西陲盐道·青岩驿',
  tileSize: sourceMap.tileSize,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#cbbd8c', solid: false },
    ',': { color: '#d7c995', solid: false },
    '#': { color: '#65604d', solid: true },
  },
  grid: mapGrid,
  playerStart,
  art: {
    tileSize: sourceMap.art.tileSize,
    tilesets: sourceMap.art.tilesets,
    actors: sourceMap.art.actors,
    layers: [
      { id: 'salt-road-ground', tilesetId: 'kenney.roguelike-rpg', cells: ground },
      { id: 'salt-road-rises', tilesetId: 'kenney.roguelike-rpg', cells: ridges },
      { id: 'salt-road-brine-pans', tilesetId: 'kenney.roguelike-rpg', cells: saltCrust },
      ...settlementLayers.map((cells, index) => ({
        id: `salt-road-caravan-post-${index + 1}`,
        tilesetId: 'kenney.roguelike-rpg',
        cells,
      })),
      { id: 'salt-road-stone-trails', tilesetId: 'kenney.roguelike-rpg', cells: paths },
    ],
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`生成 ${columns}×${rows} 西陲盐道：${reached.size} 个入口可达格、${saltCrust.flat().filter(Boolean).length} 格盐壳、${output.art.layers.length} 层 CC0 贴图。`);
console.log(`保护并核验 ${anchors.size} 个关口/地标/事件/NPC 日程/遭遇锚点。`);
