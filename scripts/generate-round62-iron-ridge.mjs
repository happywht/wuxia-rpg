import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapResourceId = 'map.round-62-iron-ridge';
const outputPath = resolve(repoRoot, 'data/base/maps/round-62-iron-ridge.json');
const sourcePath = resolve(repoRoot, 'data/base/maps/round-01-grid.json');
const cellKey = (col, row) => `${col},${row}`;
const columns = 100;
const rows = 100;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [sourceMap, worldMap, npcSet, encounterSet] = await Promise.all([
  readJson(sourcePath),
  readJson(resolve(repoRoot, 'data/base/world/world-map.json')),
  readJson(resolve(repoRoot, 'data/base/characters/round-03-npcs.json')),
  readJson(resolve(repoRoot, 'data/base/battles/round-05-encounters.json')),
]);

const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;
const blankLayer = () => Array.from({ length: rows }, () => Array(columns).fill(0));
const hashCell = (col, row, salt = 0) => {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};

const mapTransitions = (worldMap.transitions ?? []).filter((transition) =>
  transition.from.mapResourceId === mapResourceId || transition.to.mapResourceId === mapResourceId,
);
const incomingGate = mapTransitions.find((transition) => transition.to.mapResourceId === mapResourceId);
if (incomingGate === undefined) throw new Error('世界图没有指向铁嶂北道的入口关口。');
const playerStart = { col: incomingGate.to.col, row: incomingGate.to.row };
const anchors = new Map();

function addAnchor(label, point, buffer = 1) {
  if (!inside(point.col, point.row)) throw new Error(`${label} 坐标越界：(${point.col}, ${point.row})`);
  anchors.set(cellKey(point.col, point.row), label);
  for (let row = point.row - buffer; row <= point.row + buffer; row++) {
    for (let col = point.col - buffer; col <= point.col + buffer; col++) {
      if (inside(col, row)) anchors.set(cellKey(col, row), `${label} 邻格`);
    }
  }
}

addAnchor('出生/入口', playerStart);
for (const landmark of worldMap.landmarks ?? []) {
  if (landmark.mapResourceId === mapResourceId) addAnchor(`地标 ${landmark.id}`, landmark);
}
for (const transition of mapTransitions) {
  if (transition.from.mapResourceId === mapResourceId) addAnchor(`关口 ${transition.id}`, transition.from);
  if (transition.to.mapResourceId === mapResourceId) addAnchor(`关口落点 ${transition.id}`, transition.to);
}
for (const event of worldMap.events ?? []) {
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

const roads = new Set();
function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const roadCol = col + dx;
      const roadRow = row + dy;
      if (inside(roadCol, roadRow)) roads.add(cellKey(roadCol, roadRow));
    }
  }
}
function addRoad(points) {
  for (let index = 1; index < points.length; index++) addRoadSegment(points[index - 1], points[index]);
}

addRoad([
  { col: 4, row: 7 },
  { col: 12, row: 10 },
  { col: 21, row: 17 },
  { col: 27, row: 24 },
  { col: 30, row: 29 },
  { col: 38, row: 37 },
  { col: 44, row: 43 },
  { col: 51, row: 49 },
  { col: 60, row: 54 },
  { col: 66, row: 59 },
  { col: 71, row: 63 },
  { col: 79, row: 72 },
  { col: 84, row: 83 },
]);
addRoad([
  { col: 51, row: 49 },
  { col: 46, row: 60 },
  { col: 39, row: 72 },
  { col: 42, row: 82 },
  { col: 52, row: 90 },
]);

const roadBuffer = new Set(roads);
for (const key of roads) {
  const [col, row] = key.split(',').map(Number);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 2 && inside(col + dx, row + dy)) {
        roadBuffer.add(cellKey(col + dx, row + dy));
      }
    }
  }
}

const town = { col: 39, row: 38, columns: 27, rows: 23, sourceCol: 17, sourceRow: 14 };
const insideTown = (col, row) => col >= town.col && row >= town.row &&
  col < town.col + town.columns && row < town.row + town.rows;
const townBlocked = Array.from({ length: rows }, () => Array(columns).fill(false));
const townLayers = sourceMap.art.layers.slice(1).map(() => blankLayer());
const groundLayer = blankLayer();
const rockLayer = blankLayer();
const pineLayer = blankLayer();
const trailLayer = blankLayer();
const grid = Array.from({ length: rows }, () => Array(columns).fill('.'));
const rockFrames = [747, 748, 749, 750, 751, 1032, 1033, 1034, 1035, 1252, 1253];
const pineFrames = [587, 644, 584];
const trailFrames = [576, 577, 578, 579];
const ridgeMassifs = [
  { col: 15, row: 43, radiusX: 10, radiusY: 16, salt: 0x62a1 },
  { col: 30, row: 77, radiusX: 9, radiusY: 12, salt: 0x62a2 },
  { col: 43, row: 13, radiusX: 13, radiusY: 8, salt: 0x62a3 },
  { col: 73, row: 24, radiusX: 12, radiusY: 11, salt: 0x62a4 },
  { col: 91, row: 48, radiusX: 7, radiusY: 14, salt: 0x62a5 },
  { col: 75, row: 92, radiusX: 10, radiusY: 6, salt: 0x62a6 },
];

function inRidge(col, row) {
  return ridgeMassifs.some((massif) => {
    const x = (col - massif.col) / massif.radiusX;
    const y = (row - massif.row) / massif.radiusY;
    return x * x + y * y <= 1 && hashCell(col, row, massif.salt) % 100 < 72;
  });
}

const townSourceOffset = (col, row) => ({
  sourceCol: town.sourceCol + col - town.col,
  sourceRow: town.sourceRow + row - town.row,
});
for (let row = town.row; row < town.row + town.rows; row++) {
  for (let col = town.col; col < town.col + town.columns; col++) {
    const { sourceCol, sourceRow } = townSourceOffset(col, row);
    for (let layerIndex = 0; layerIndex < townLayers.length; layerIndex++) {
      townLayers[layerIndex][row][col] = sourceMap.art.layers[layerIndex + 1]?.cells[sourceRow]?.[sourceCol] ?? 0;
    }
    const sourceTile = sourceMap.grid[sourceRow]?.[sourceCol];
    townBlocked[row][col] = sourceTile === undefined || sourceMap.tileTypes[sourceTile]?.solid === true;
    groundLayer[row][col] = sourceMap.art.layers[0]?.cells[sourceRow]?.[sourceCol] ?? 0;
  }
}

const pineZones = [
  { col: 4, row: 29, columns: 15, rows: 22, density: 14, salt: 0x6231 },
  { col: 18, row: 56, columns: 15, rows: 17, density: 14, salt: 0x6232 },
  { col: 79, row: 34, columns: 13, rows: 19, density: 13, salt: 0x6233 },
  { col: 56, row: 79, columns: 12, rows: 13, density: 15, salt: 0x6234 },
];

function inPineZone(col, row) {
  return pineZones.find((zone) => col >= zone.col && row >= zone.row &&
    col < zone.col + zone.columns && row < zone.row + zone.rows);
}

const anchorCells = new Set(anchors.keys());
function isProtected(col, row) {
  return anchorCells.has(cellKey(col, row)) || roads.has(cellKey(col, row));
}

let treeCount = 0;
let rockCount = 0;
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const key = cellKey(col, row);
    const boundary = col === 0 || row === 0 || col === columns - 1 || row === rows - 1;
    const protectedCell = isProtected(col, row);
    const roadCell = roads.has(key);
    const inTown = insideTown(col, row);
    const massif = !roadBuffer.has(key) && !inTown && inRidge(col, row);
    const zone = inPineZone(col, row);
    const pineRoll = zone === undefined ? 100 : hashCell(col, row, zone.salt) % 100;
    const pine = !roadBuffer.has(key) && !inTown && !protectedCell && !massif &&
      zone !== undefined && pineRoll < zone.density;

    if (groundLayer[row][col] === 0) {
      const roll = hashCell(col, row, 0x62f10) % 100;
      groundLayer[row][col] = roll < 66 ? 8 : roll < 84 ? 63 : 64;
    }
    if (!inTown && !protectedCell && !roadCell && !boundary &&
      !pine && hashCell(col, row, 0x62b01) % 100 < 4) {
      rockLayer[row][col] = rockFrames[hashCell(col, row, 0x62b02) % rockFrames.length];
    }
    if (massif && !protectedCell) {
      rockLayer[row][col] = rockFrames[hashCell(col, row, 0x62b03) % rockFrames.length];
      rockCount++;
    }
    if (pine) {
      pineLayer[row][col] = pineFrames[pineRoll % pineFrames.length];
      treeCount++;
    }
    if (roadCell) {
      grid[row][col] = '.';
      groundLayer[row][col] = 8;
      rockLayer[row][col] = 0;
      pineLayer[row][col] = 0;
      for (const layer of townLayers) layer[row][col] = 0;
      trailLayer[row][col] = trailFrames[hashCell(col, row, 0x62c01) % trailFrames.length];
      continue;
    }
    if (boundary && !protectedCell) {
      grid[row][col] = '#';
      continue;
    }
    if (protectedCell) {
      grid[row][col] = '.';
      rockLayer[row][col] = 0;
      pineLayer[row][col] = 0;
      for (const layer of townLayers) layer[row][col] = 0;
      continue;
    }
    if (inTown && townBlocked[row][col]) {
      grid[row][col] = '#';
      continue;
    }
    if (massif || pine) {
      grid[row][col] = '#';
      continue;
    }
    const textureRoll = hashCell(col, row, 0x62d17) % 100;
    grid[row][col] = textureRoll < 12 ? ',' : '.';
  }
}

const mapGrid = grid.map((line) => line.join(''));
function isWalkable(col, row) {
  if (!inside(col, row)) return false;
  const tile = mapGrid[row]?.[col];
  return tile !== undefined && !sourceMap.tileTypes[tile]?.solid && tile !== '#';
}
function reachableCells(start) {
  if (!isWalkable(start.col, start.row)) throw new Error('出生/入口格被阻挡。');
  const startKey = cellKey(start.col, start.row);
  const reached = new Set([startKey]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (point === undefined) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = point.col + dx;
      const row = point.row + dy;
      const key = cellKey(col, row);
      if (!isWalkable(col, row) || reached.has(key)) continue;
      reached.add(key);
      queue.push({ col, row });
    }
  }
  return reached;
}

const walkableCount = mapGrid.flatMap((line) => [...line]).filter((tile) => tile !== '#').length;
if (walkableCount < 6_500) throw new Error(`铁嶂北道只有 ${walkableCount} 个可行格，低于 6,500 格验收线。`);
const reached = reachableCells(playerStart);
for (const [key, label] of anchors) {
  const [col, row] = key.split(',').map(Number);
  if (!label.endsWith('邻格') && !reached.has(key)) {
    throw new Error(`${label} 从铁嶂北道入口不可达：(${col},${row})`);
  }
}
for (const transition of mapTransitions) {
  const endpoint = transition.from.mapResourceId === mapResourceId ? transition.from : transition.to;
  if (!reached.has(cellKey(endpoint.col, endpoint.row))) {
    throw new Error(`关口 ${transition.id} 在地图上不可达：(${endpoint.col},${endpoint.row})`);
  }
}

const output = {
  id: mapResourceId,
  name: '铁嶂北道·岩关驿镇',
  tileSize: sourceMap.tileSize,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#858b8d', solid: false },
    ',': { color: '#a0a56f', solid: false },
    '#': { color: '#373b40', solid: true },
  },
  grid: mapGrid,
  playerStart,
  art: {
    tileSize: sourceMap.art.tileSize,
    tilesets: sourceMap.art.tilesets,
    actors: sourceMap.art.actors,
    layers: [
      { id: 'iron-ridge-highland-stone', tilesetId: 'kenney.roguelike-rpg', cells: groundLayer },
      { id: 'iron-ridge-rock-faces', tilesetId: 'kenney.roguelike-rpg', cells: rockLayer },
      { id: 'iron-ridge-pines', tilesetId: 'kenney.roguelike-rpg', cells: pineLayer },
      ...townLayers.map((cells, index) => ({
        id: `iron-ridge-post-town-${index + 1}`,
        tilesetId: 'kenney.roguelike-rpg',
        cells,
      })),
      { id: 'iron-ridge-mountain-paths', tilesetId: 'kenney.roguelike-rpg', cells: trailLayer },
    ],
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`生成 ${columns}×${rows} 铁嶂北道：${walkableCount} 个可行格、${treeCount} 株 CC0 松木、${rockCount} 格岩脊、${output.art.layers.length} 层贴图。`);
console.log(`保护并通过 BFS 核验 ${anchors.size} 个入口/关口/地标/事件/NPC 日程/遭遇锚点。`);
