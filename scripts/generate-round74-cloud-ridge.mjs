import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapResourceId = 'map.round-74-cloud-ridge';
const outputPath = resolve(repoRoot, 'data/base/maps/round-74-cloud-ridge.json');
const sourcePath = resolve(repoRoot, 'data/base/maps/round-01-grid.json');
const worldPath = resolve(repoRoot, 'data/base/world/world-map.json');
const manifestPath = resolve(repoRoot, 'data/base/manifest.json');
const columns = 100;
const rows = 100;
const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;
const key = (col, row) => `${col},${row}`;
const blank = () => Array.from({ length: rows }, () => Array(columns).fill(0));

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [sourceMap, world, manifest] = await Promise.all([
  readJson(sourcePath), readJson(worldPath), readJson(manifestPath),
]);
const regionTransitions = (world.transitions ?? []).filter((transition) =>
  transition.from.mapResourceId === mapResourceId || transition.to.mapResourceId === mapResourceId,
);
const incoming = regionTransitions.find((transition) => transition.to.mapResourceId === mapResourceId);
if (incoming === undefined) throw new Error('世界地图没有通往云岭古道的入山关口。');
const playerStart = { col: incoming.to.col, row: incoming.to.row };

const maps = new Map();
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'grid-map' || resource.id === mapResourceId) continue;
  maps.set(resource.id, await readJson(resolve(repoRoot, 'data/base', resource.path)));
}
maps.set(sourceMap.id, sourceMap);

const npcRecords = [];
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'npc-set') continue;
  const data = await readJson(resolve(repoRoot, 'data/base', resource.path));
  npcRecords.push(...(data.npcs ?? []));
}
const encounters = [];
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'battle-encounters') continue;
  const data = await readJson(resolve(repoRoot, 'data/base', resource.path));
  encounters.push(...(data.encounters ?? []));
}

const anchors = new Map();
function addAnchor(label, point, buffer = 1) {
  if (!inside(point.col, point.row)) throw new Error(`${label} 坐标越界：(${point.col}, ${point.row})`);
  anchors.set(key(point.col, point.row), label);
  for (let row = point.row - buffer; row <= point.row + buffer; row++) {
    for (let col = point.col - buffer; col <= point.col + buffer; col++) {
      if (inside(col, row) && !anchors.has(key(col, row))) anchors.set(key(col, row), `${label} 邻格`);
    }
  }
}

addAnchor('入山出生点', playerStart);
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
for (const npc of npcRecords) {
  if (npc.mapResourceId !== mapResourceId) continue;
  addAnchor(`人物 ${npc.id}`, npc.position);
  for (const schedule of npc.schedule ?? []) addAnchor(`日程 ${npc.id}/${schedule.periodId}`, schedule.position);
}
for (const encounter of encounters) {
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

// The south pass opens onto a winding route through the cloud ridge and its old waystation.
addRoad([
  { col: 50, row: 97 }, { col: 50, row: 87 }, { col: 43, row: 77 },
  { col: 39, row: 65 }, { col: 44, row: 55 }, { col: 53, row: 47 },
  { col: 61, row: 37 }, { col: 66, row: 27 }, { col: 62, row: 17 },
]);
addRoad([{ col: 44, row: 55 }, { col: 36, row: 47 }, { col: 29, row: 32 }]);
addRoad([{ col: 53, row: 47 }, { col: 66, row: 45 }, { col: 76, row: 42 }]);

const roadBuffer = new Set(roads);
for (const cell of roads) {
  const [col, row] = cell.split(',').map(Number);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 2 && inside(col + dx, row + dy)) roadBuffer.add(key(col + dx, row + dy));
    }
  }
}

const waystation = { col: 33, row: 36, columns: 25, rows: 20, sourceCol: 17, sourceRow: 14 };
const insideWaystation = (col, row) => col >= waystation.col && row >= waystation.row &&
  col < waystation.col + waystation.columns && row < waystation.row + waystation.rows;
const waystationBlocked = Array.from({ length: rows }, () => Array(columns).fill(false));
const waystationLayers = sourceMap.art.layers.slice(1).map(() => blank());
const ground = blank();
const scree = blank();
const pines = blank();
const paths = blank();
const grid = Array.from({ length: rows }, () => Array(columns).fill('.'));
const rockFrames = [747, 748, 749, 750, 751, 1032, 1033, 1034, 1035, 1252, 1253];
const pineFrames = [587, 644, 584];
const pathFrames = [576, 577, 578, 579];
const massifs = [
  { col: 13, row: 35, radiusX: 9, radiusY: 14, salt: 0x74a1 },
  { col: 21, row: 79, radiusX: 12, radiusY: 9, salt: 0x74a2 },
  { col: 48, row: 12, radiusX: 13, radiusY: 8, salt: 0x74a3 },
  { col: 74, row: 28, radiusX: 10, radiusY: 13, salt: 0x74a4 },
  { col: 87, row: 70, radiusX: 8, radiusY: 14, salt: 0x74a5 },
  { col: 60, row: 85, radiusX: 12, radiusY: 7, salt: 0x74a6 },
];
function inMassif(col, row) {
  return massifs.some((shape) => {
    const x = (col - shape.col) / shape.radiusX;
    const y = (row - shape.row) / shape.radiusY;
    return x * x + y * y <= 1 && hashCell(col, row, shape.salt) % 100 < 72;
  });
}
const pineZones = [
  { col: 5, row: 53, columns: 17, rows: 19, density: 17, salt: 0x7431 },
  { col: 23, row: 8, columns: 16, rows: 19, density: 15, salt: 0x7432 },
  { col: 77, row: 19, columns: 15, rows: 21, density: 15, salt: 0x7433 },
  { col: 70, row: 71, columns: 17, rows: 18, density: 18, salt: 0x7434 },
  { col: 31, row: 75, columns: 16, rows: 17, density: 15, salt: 0x7435 },
];
const pineZoneAt = (col, row) => pineZones.find((zone) => col >= zone.col && row >= zone.row &&
  col < zone.col + zone.columns && row < zone.row + zone.rows);
for (let row = waystation.row; row < waystation.row + waystation.rows; row++) {
  for (let col = waystation.col; col < waystation.col + waystation.columns; col++) {
    const sourceCol = waystation.sourceCol + col - waystation.col;
    const sourceRow = waystation.sourceRow + row - waystation.row;
    for (let layerIndex = 0; layerIndex < waystationLayers.length; layerIndex++) {
      waystationLayers[layerIndex][row][col] = sourceMap.art.layers[layerIndex + 1]?.cells[sourceRow]?.[sourceCol] ?? 0;
    }
    const sourceTile = sourceMap.grid[sourceRow]?.[sourceCol];
    waystationBlocked[row][col] = sourceTile === undefined || sourceMap.tileTypes[sourceTile]?.solid === true;
    ground[row][col] = sourceMap.art.layers[0]?.cells[sourceRow]?.[sourceCol] ?? 0;
  }
}

let pineCount = 0;
let massifCount = 0;
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const cell = key(col, row);
    const protectedCell = anchors.has(cell) || roads.has(cell);
    const road = roads.has(cell);
    const boundary = col === 0 || row === 0 || col === columns - 1 || row === rows - 1;
    const inTown = insideWaystation(col, row);
    const massif = !roadBuffer.has(cell) && !inTown && inMassif(col, row);
    const zone = pineZoneAt(col, row);
    const pineRoll = zone === undefined ? 100 : hashCell(col, row, zone.salt) % 100;
    const pine = !roadBuffer.has(cell) && !inTown && !protectedCell && !massif &&
      zone !== undefined && pineRoll < zone.density;

    if (ground[row][col] === 0) {
      const texture = hashCell(col, row, 0x74f1) % 100;
      ground[row][col] = texture < 55 ? 8 : texture < 78 ? 63 : 64;
    }
    if (massif && !protectedCell) {
      scree[row][col] = rockFrames[hashCell(col, row, 0x74b03) % rockFrames.length];
      massifCount++;
    }
    if (pine) {
      pines[row][col] = pineFrames[pineRoll % pineFrames.length];
      pineCount++;
    }
    if (road) {
      grid[row][col] = '.';
      scree[row][col] = 0;
      pines[row][col] = 0;
      for (const layer of waystationLayers) layer[row][col] = 0;
      paths[row][col] = pathFrames[hashCell(col, row, 0x74c01) % pathFrames.length];
      continue;
    }
    if (boundary && !protectedCell) { grid[row][col] = '#'; continue; }
    if (protectedCell) {
      grid[row][col] = '.';
      scree[row][col] = 0;
      pines[row][col] = 0;
      for (const layer of waystationLayers) layer[row][col] = 0;
      continue;
    }
    if (inTown && waystationBlocked[row][col]) { grid[row][col] = '#'; continue; }
    if (massif || pine) { grid[row][col] = '#'; continue; }
    const texture = hashCell(col, row, 0x74d17) % 100;
    grid[row][col] = texture < 16 ? ',' : '.';
  }
}

const mapGrid = grid.map((line) => line.join(''));
function reachableCells(start) {
  if (mapGrid[start.row]?.[start.col] === '#' || mapGrid[start.row]?.[start.col] === undefined) {
    throw new Error('入山出生格被阻挡或越界。');
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

const walkableCount = mapGrid.flatMap((line) => [...line]).filter((tile) => tile !== '#').length;
if (walkableCount < 6_500) throw new Error(`云岭古道只有 ${walkableCount} 个可行格，低于 6,500 格验收线。`);
const reached = reachableCells(playerStart);
for (const [cell, label] of anchors) {
  const [col, row] = cell.split(',').map(Number);
  if (!label.endsWith('邻格') && !reached.has(cell)) throw new Error(`${label} 从云岭古道入山点不可达：(${col},${row})`);
}

const output = {
  id: mapResourceId,
  name: '云岭古道·断云栈道',
  tileSize: sourceMap.tileSize,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#7b898d', solid: false },
    ',': { color: '#b7b8a9', solid: false },
    '#': { color: '#3e454b', solid: true },
  },
  grid: mapGrid,
  playerStart,
  art: {
    tileSize: sourceMap.art.tileSize,
    tilesets: sourceMap.art.tilesets,
    actors: sourceMap.art.actors,
    layers: [
      { id: 'cloud-ridge-ground', tilesetId: 'kenney.roguelike-rpg', cells: ground },
      { id: 'cloud-ridge-scree', tilesetId: 'kenney.roguelike-rpg', cells: scree },
      { id: 'cloud-ridge-pines', tilesetId: 'kenney.roguelike-rpg', cells: pines },
      ...waystationLayers.map((cells, index) => ({
        id: `cloud-ridge-waystation-${index + 1}`,
        tilesetId: 'kenney.roguelike-rpg',
        cells,
      })),
      { id: 'cloud-ridge-stone-trails', tilesetId: 'kenney.roguelike-rpg', cells: paths },
    ],
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`生成 ${columns}×${rows} 云岭古道：${walkableCount} 个可行格，${reached.size} 个入口可达格，${pineCount} 格松林、${massifCount} 格山脊、${output.art.layers.length} 层 CC0 图素。`);
console.log(`保护并核验 ${anchors.size} 个关口/地标/事件/NPC 日程/遭遇锚点。`);
