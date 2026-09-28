import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapResourceId = 'map.round-10-mist-ferry';
const outputPath = resolve(repoRoot, 'data/base/maps/round-10-mist-ferry.json');
const sourcePath = resolve(repoRoot, 'data/base/maps/round-01-grid.json');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [oldMap, sourceMap, worldMap, npcSet, encounterSet] = await Promise.all([
  readJson(outputPath),
  readJson(sourcePath),
  readJson(resolve(repoRoot, 'data/base/world/world-map.json')),
  readJson(resolve(repoRoot, 'data/base/characters/round-03-npcs.json')),
  readJson(resolve(repoRoot, 'data/base/battles/round-05-encounters.json')),
]);

const columns = 100;
const rows = 100;
const GRASS = 63;
const OPEN_WATER = 61;
const TREE_FRAMES = [587, 644, 584];
const PATH_FRAMES = [576, 577, 578, 579];
const FLOWER_FRAMES = [343, 543];
const H_FLIP = 0x80000000;
const cellKey = (col, row) => `${col},${row}`;
const blankLayer = () => Array.from({ length: rows }, () => Array(columns).fill(0));
const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashCell(col, row, salt = 0) {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function distanceToSegment(point, from, to) {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.col - from.col, point.row - from.row);
  const projection = clamp(((point.col - from.col) * dx + (point.row - from.row) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.col - (from.col + projection * dx), point.row - (from.row + projection * dy));
}

function distanceToRiver(col, row, river) {
  const point = { col, row };
  let closest = Infinity;
  for (let index = 1; index < river.length; index++) {
    closest = Math.min(closest, distanceToSegment(point, river[index - 1], river[index]));
  }
  return closest;
}

const river = [
  { col: 64, row: -4 },
  { col: 60, row: 11 },
  { col: 48, row: 22 },
  { col: 38, row: 31 },
  { col: 40, row: 42 },
  { col: 48, row: 52 },
  { col: 53, row: 61 },
  { col: 63, row: 70 },
  { col: 76, row: 80 },
  { col: 84, row: 91 },
  { col: 78, row: 104 },
];
const riverWidth = 4.15;
const lakes = [
  { col: 18, row: 57, radiusX: 8.5, radiusY: 10.5 },
  { col: 81, row: 27, radiusX: 10.5, radiusY: 7.5 },
  { col: 82, row: 87, radiusX: 9.5, radiusY: 6.5 },
  { col: 28, row: 87, radiusX: 8.5, radiusY: 5.5 },
];
const water = Array.from({ length: rows }, () => Array(columns).fill(false));
const shore = Array.from({ length: rows }, () => Array(columns).fill(0));
const ground = Array.from({ length: rows }, () => Array(columns).fill(GRASS));
const flowerLayer = blankLayer();
const forestLayer = blankLayer();
const trailLayer = blankLayer();
const templateLayers = sourceMap.art.layers.map(() => blankLayer());
const templateBounds = { col: 55, row: 43, columns: 35, rows: 30 };
const templateBlocked = Array.from({ length: rows }, () => Array(columns).fill(false));
const roadCells = new Set();
const hardAnchors = new Map();

function addAnchor(label, point, interactionBuffer = true) {
  if (!inside(point.col, point.row)) throw new Error(`${label} 坐标越界：(${point.col}, ${point.row})`);
  const key = cellKey(point.col, point.row);
  hardAnchors.set(key, label);
  if (!interactionBuffer) return;
  for (let row = point.row - 1; row <= point.row + 1; row++) {
    for (let col = point.col - 1; col <= point.col + 1; col++) {
      if (inside(col, row)) hardAnchors.set(cellKey(col, row), `${label} 邻格`);
    }
  }
}

addAnchor('玩家出生点', oldMap.playerStart);
for (const landmark of worldMap.landmarks ?? []) {
  if (landmark.mapResourceId === mapResourceId) addAnchor(`地标 ${landmark.id}`, landmark, false);
}
for (const transition of worldMap.transitions ?? []) {
  if (transition.from.mapResourceId === mapResourceId) addAnchor(`关口 ${transition.id}`, transition.from);
  if (transition.to.mapResourceId === mapResourceId) addAnchor(`关口落点 ${transition.id}`, transition.to);
}
for (const event of worldMap.events ?? []) {
  if (event.mapResourceId === mapResourceId) addAnchor(`固定事件 ${event.id}`, event);
}
for (const npc of npcSet.npcs ?? []) {
  if (npc.mapResourceId !== mapResourceId) continue;
  addAnchor(`人物 ${npc.id}`, npc.position);
  for (const schedule of npc.schedule ?? []) addAnchor(`日程 ${npc.id}/${schedule.periodId}`, schedule.position);
}
for (const encounter of encounterSet.encounters ?? []) {
  if (encounter.mapResourceId === mapResourceId) addAnchor(`遭遇 ${encounter.id}`, encounter.position);
}

function insideTemplate(col, row) {
  return col >= templateBounds.col && row >= templateBounds.row &&
    col < templateBounds.col + templateBounds.columns && row < templateBounds.row + templateBounds.rows;
}

function insideAnyLake(col, row, padding = 0) {
  return lakes.some((lake) => {
    const x = (col - lake.col) / (lake.radiusX + padding);
    const y = (row - lake.row) / (lake.radiusY + padding);
    return x * x + y * y <= 1;
  });
}

function sourceTemplateCell(col, row) {
  const targetCol = col - templateBounds.col;
  const targetRow = row - templateBounds.row;
  // Mirror the licensed Kenney hamlet so its original road exits west toward
  // the wider ferry district instead of repeating the starter map's layout.
  const sourceCol = 17 + templateBounds.columns - 1 - targetCol;
  const sourceRow = 14 + targetRow;
  return { sourceCol, sourceRow };
}

// A 35×30 hamlet composition reuses the exact licensed tile layers and their
// collision, while a horizontal mirror changes its orientation and approach.
for (let row = templateBounds.row; row < templateBounds.row + templateBounds.rows; row++) {
  for (let col = templateBounds.col; col < templateBounds.col + templateBounds.columns; col++) {
    const { sourceCol, sourceRow } = sourceTemplateCell(col, row);
    for (let layerIndex = 0; layerIndex < sourceMap.art.layers.length; layerIndex++) {
      const sourceGid = sourceMap.art.layers[layerIndex]?.cells[sourceRow]?.[sourceCol] ?? 0;
      if (sourceGid !== 0) templateLayers[layerIndex][row][col] = (sourceGid | H_FLIP) >>> 0;
    }
    templateBlocked[row][col] = sourceMap.grid[sourceRow]?.[sourceCol] === '#';
  }
}

for (let row = 1; row < rows - 1; row++) {
  for (let col = 1; col < columns - 1; col++) {
    const riverDistance = distanceToRiver(col, row, river);
    const inRiver = riverDistance <= riverWidth;
    const inLake = insideAnyLake(col, row);
    if (!insideTemplate(col, row) && (inRiver || inLake)) water[row][col] = true;
  }
}

function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const roadCol = col + dx;
      const roadRow = row + dy;
      if (inside(roadCol, roadRow)) roadCells.add(cellKey(roadCol, roadRow));
    }
  }
}

function addRoad(points) {
  for (let index = 1; index < points.length; index++) addRoadSegment(points[index - 1], points[index]);
}

addRoad([
  { col: 2, row: 4 },
  { col: 13, row: 9 },
  { col: 19, row: 18 },
  { col: 23, row: 29 },
  { col: 29, row: 40 },
  { col: 38, row: 49 },
  { col: 48, row: 58 },
  { col: 54, row: 65 },
  { col: 59, row: 65 },
  { col: 64, row: 70 },
  { col: 72, row: 72 },
  { col: 78, row: 79 },
  { col: 79, row: 88 },
  { col: 67, row: 94 },
  { col: 53, row: 96 },
]);
addRoad([
  { col: 23, row: 29 },
  { col: 27, row: 18 },
  { col: 38, row: 13 },
  { col: 53, row: 14 },
  { col: 67, row: 18 },
  { col: 80, row: 18 },
  { col: 91, row: 25 },
]);
addRoad([
  { col: 38, row: 49 },
  { col: 33, row: 63 },
  { col: 27, row: 76 },
  { col: 26, row: 89 },
  { col: 36, row: 94 },
]);
addRoad([
  { col: 70, row: 71 },
  { col: 81, row: 66 },
  { col: 91, row: 71 },
  { col: 93, row: 83 },
  { col: 87, row: 93 },
]);

const protectedKeys = new Set(hardAnchors.keys());
function isProtected(col, row) {
  return protectedKeys.has(cellKey(col, row));
}

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const key = cellKey(col, row);
    const atBoundary = col === 0 || row === 0 || col === columns - 1 || row === rows - 1;
    if (atBoundary) ground[row][col] = 8;
    if (water[row][col]) ground[row][col] = OPEN_WATER;

    if (insideTemplate(col, row)) {
      const { sourceCol, sourceRow } = sourceTemplateCell(col, row);
      if (!isProtected(col, row) && !roadCells.has(key)) {
        if (sourceMap.art.layers[0]?.cells[sourceRow]?.[sourceCol] !== undefined) {
          templateLayers[0][row][col] = (sourceMap.art.layers[0].cells[sourceRow][sourceCol] | H_FLIP) >>> 0;
        }
      }
    }

    if (roadCells.has(key)) {
      ground[row][col] = 63;
      shore[row][col] = 0;
      for (const layer of templateLayers) layer[row][col] = 0;
      const pathPick = hashCell(col, row, 0x55f3) % 100;
      trailLayer[row][col] = pathPick < 72 ? 579 : PATH_FRAMES[pathPick % PATH_FRAMES.length];
    }
  }
}

// Shoreline pixels use the same Kenney edge/corner frames as the licensed
// starter pond; open sand edges remain walkable and only the blue channel is solid.
for (let row = 1; row < rows - 1; row++) {
  for (let col = 1; col < columns - 1; col++) {
    if (water[row][col] || insideTemplate(col, row) || roadCells.has(cellKey(col, row))) continue;
    const north = water[row - 1][col];
    const east = water[row][col + 1];
    const south = water[row + 1][col];
    const west = water[row][col - 1];
    if (north && west) shore[row][col] = 3;
    else if (north && east) shore[row][col] = 5;
    else if (south && west) shore[row][col] = 117;
    else if (south && east) shore[row][col] = 119;
    else if (north) shore[row][col] = 4;
    else if (south) shore[row][col] = 118;
    else if (east) shore[row][col] = 60;
    else if (west) shore[row][col] = 62;
  }
}

const forestZones = [
  { col: 19, row: 9, columns: 23, rows: 16, density: 28, salt: 0x5511 },
  { col: 5, row: 40, columns: 12, rows: 22, density: 24, salt: 0x5522 },
  { col: 9, row: 73, columns: 28, rows: 23, density: 31, salt: 0x5533 },
  { col: 69, row: 4, columns: 27, rows: 11, density: 30, salt: 0x5544 },
  { col: 77, row: 75, columns: 18, rows: 20, density: 34, salt: 0x5555 },
];
let treeCount = 0;
for (const zone of forestZones) {
  for (let row = zone.row; row < zone.row + zone.rows; row++) {
    for (let col = zone.col; col < zone.col + zone.columns; col++) {
      if (!inside(col, row) || insideTemplate(col, row) || roadCells.has(cellKey(col, row)) || isProtected(col, row)) continue;
      if (water[row][col] || shore[row][col] !== 0 || ground[row][col] === 8 || insideAnyLake(col, row, 1.2)) continue;
      if (forestLayer[row][col] !== 0) continue;
      const roll = hashCell(col, row, zone.salt) % 100;
      if (roll >= zone.density) continue;
      forestLayer[row][col] = TREE_FRAMES[roll % TREE_FRAMES.length];
      treeCount++;
    }
  }
}

const specialClearCells = new Set([...hardAnchors.keys(), ...roadCells]);
function templateLayerHasContent(col, row) {
  return templateLayers.some((layer) => layer[row][col] !== 0);
}

for (let row = 1; row < rows - 1; row++) {
  for (let col = 1; col < columns - 1; col++) {
    const key = cellKey(col, row);
    if (water[row][col] || shore[row][col] !== 0 || roadCells.has(key) || isProtected(col, row)) continue;
    if (insideTemplate(col, row) || forestLayer[row][col] !== 0 || templateLayerHasContent(col, row)) continue;
    const roll = hashCell(col, row, 0x55a11) % 100;
    if (roll < 5) flowerLayer[row][col] = FLOWER_FRAMES[roll % FLOWER_FRAMES.length];
  }
}

// Every authored endpoint stays on clear ground, with a free four-neighbour
// interaction buffer. This also keeps time-shifted NPC spots reachable.
for (const key of hardAnchors.keys()) {
  const [col, row] = key.split(',').map(Number);
  ground[row][col] = 63;
  shore[row][col] = 0;
  forestLayer[row][col] = 0;
  flowerLayer[row][col] = 0;
  templateBlocked[row][col] = false;
  for (const layer of templateLayers) layer[row][col] = 0;
}
for (const key of specialClearCells) {
  const [col, row] = key.split(',').map(Number);
  if (!isProtected(col, row)) {
    forestLayer[row][col] = 0;
    for (let index = 2; index < templateLayers.length; index++) templateLayers[index][row][col] = 0;
  }
}

const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => {
  const key = cellKey(col, row);
  const boundary = col === 0 || row === 0 || col === columns - 1 || row === rows - 1;
  if (boundary && !hardAnchors.has(key)) return '#';
  if (hardAnchors.has(key) || roadCells.has(key)) return '.';
  if (water[row][col]) return '~';
  if (insideTemplate(col, row) && templateBlocked[row][col]) return '#';
  if (forestLayer[row][col] !== 0) return '#';
  return hashCell(col, row, 0x55255) % 100 < 18 ? ',' : '.';
}).join(''));

function isWalkable(col, row) {
  const tile = inside(col, row) ? grid[row]?.[col] : undefined;
  return tile !== undefined && tile !== '#' && tile !== '~';
}

function reachableCells(start) {
  const reached = new Set([cellKey(start.col, start.row)]);
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

const openCellCount = grid.flatMap((line) => [...line]).filter((cell) => cell !== '#' && cell !== '~').length;
if (openCellCount < 6_500) throw new Error(`雾雨渡口可行格只有 ${openCellCount} 格，低于 6,500 格验收线。`);
const reached = reachableCells(oldMap.playerStart);
for (const [key, label] of hardAnchors) {
  if (!reached.has(key)) throw new Error(`${label} 从渡口出生点不可达：(${key})`);
}
for (const key of [cellKey(1, 4), cellKey(2, 4), cellKey(59, 65), cellKey(46, 53)]) {
  if (!reached.has(key)) throw new Error(`跨区验收地标从出生点不可达：(${key})`);
}

const allArtLayers = [
  { id: 'mist-river-grass', cells: ground },
  { id: 'mist-river-shores', cells: shore },
  { id: 'mist-river-blooms', cells: flowerLayer },
  { id: 'mist-river-woods', cells: forestLayer },
  ...templateLayers.map((cells, index) => ({ id: `mist-willow-market-${index + 1}`, cells })),
  { id: 'mist-river-trails', cells: trailLayer },
];

const output = {
  ...oldMap,
  name: '雾雨渡口·河湾旧道',
  columns,
  rows,
  tileTypes: {
    '.': { color: '#82bc60', solid: false },
    ',': { color: '#6b9b54', solid: false },
    '~': { color: '#4e8197', solid: true },
    '#': { color: '#35434b', solid: true },
  },
  grid,
  playerStart: oldMap.playerStart,
  art: {
    ...oldMap.art,
    tileSize: sourceMap.art.tileSize,
    tilesets: sourceMap.art.tilesets,
    layers: allArtLayers.map(({ id, cells }) => ({ id, tilesetId: 'kenney.roguelike-rpg', cells })),
    actors: sourceMap.art.actors,
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`生成 ${columns}×${rows} 雾雨渡口：${openCellCount} 可行格、${treeCount} 处 CC0 林木、${allArtLayers.length} 层地图贴图。`);
console.log(`保留 ${hardAnchors.size} 个关口/任务/NPC/遭遇/地标锚点；出生点、芦桥集、石闸题刻及全部锚点均连通。`);
