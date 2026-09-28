import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = resolve(repoRoot, 'data/base/world/world-map.json');
const manifestPath = resolve(repoRoot, 'data/base/manifest.json');
const overview = { columns: 128, rows: 80, tileSize: 16 };

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [world, manifest] = await Promise.all([readJson(worldPath), readJson(manifestPath)]);
if (!Array.isArray(world.regions) || world.regions.length === 0) throw new Error('世界地图必须至少声明一个区域。');
if (!Array.isArray(world.transitions)) throw new Error('世界地图缺少关口数据，拒绝生成无法导航的总图。');
const mapsById = new Map();
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'grid-map') continue;
  mapsById.set(resource.id, await readJson(resolve(repoRoot, 'data/base', resource.path)));
}
for (const region of world.regions) {
  const map = mapsById.get(region.mapResourceId);
  if (map === undefined) throw new Error(`区域 ${region.mapResourceId} 没有可读地图资源。`);
  if (!map.art || !Array.isArray(map.art.tilesets) || !map.art.tilesets.some((set) => set.id === 'kenney.roguelike-rpg')) {
    throw new Error(`区域 ${region.mapResourceId} 未声明 Kenney Roguelike 授权图集。`);
  }
}

const sourceMap = mapsById.get(world.startingMapResourceId);
const tileset = sourceMap?.art?.tilesets?.find((set) => set.id === 'kenney.roguelike-rpg');
if (tileset === undefined) throw new Error('起始地图未声明 kenney.roguelike-rpg 图集。');
const rng = (col, row, salt = 0) => {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};
const inside = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
const blankLayer = () => Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
const ocean = blankLayer();
const land = blankLayer();
const coast = blankLayer();
const topography = blankLayer();
const roads = blankLayer();

const centers = world.regions.map((region) => ({
  x: region.atlasPosition.x / 100 * (overview.columns - 1),
  y: region.atlasPosition.y / 100 * (overview.rows - 1),
}));
const centroid = centers.reduce((sum, point) => ({ x: sum.x + point.x / centers.length, y: sum.y + point.y / centers.length }), { x: 0, y: 0 });

// A broad, irregular mainland surrounds the authored regions; water remains
// visible around the coast. All variations are seeded by grid coordinates.
for (let row = 0; row < overview.rows; row++) {
  for (let col = 0; col < overview.columns; col++) {
    const dx = (col - centroid.x) / Math.max(1, overview.columns * 0.43);
    const dy = (row - centroid.y) / Math.max(1, overview.rows * 0.43);
    const edgeNoise = ((rng(col, row, 0x6601) % 1000) / 1000 - 0.5) * 0.14;
    const landmass = dx * dx + dy * dy < 1 + edgeNoise;
    ocean[row][col] = 61;
    if (!landmass) continue;
    const texture = rng(col, row, 0x6602) % 100;
    land[row][col] = texture < 98 ? 8 : texture < 99 ? 63 : 64;
    let adjacentWater = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inside(col + ox, row + oy)) { adjacentWater = true; continue; }
      const ndx = (col + ox - centroid.x) / Math.max(1, overview.columns * 0.43);
      const ndy = (row + oy - centroid.y) / Math.max(1, overview.rows * 0.43);
      const neighborNoise = ((rng(col + ox, row + oy, 0x6601) % 1000) / 1000 - 0.5) * 0.14;
      if (ndx * ndx + ndy * ndy >= 1 + neighborNoise) adjacentWater = true;
    }
    if (adjacentWater) coast[row][col] = rng(col, row, 0x6603) % 2 === 0 ? 60 : 62;
  }
}

function projectRegionCell(region, map, point) {
  const centerX = region.atlasPosition.x / 100 * (overview.columns - 1);
  const centerY = region.atlasPosition.y / 100 * (overview.rows - 1);
  const u = (point.col + 0.5) / map.columns - 0.5;
  const v = (point.row + 0.5) / map.rows - 0.5;
  return {
    col: Math.round(centerX + u * overview.columns * 0.16),
    row: Math.round(centerY + v * overview.rows * 0.16),
  };
}

const roadCells = new Set();
function addRoad(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (inside(col + ox, row + oy)) roadCells.add(`${col + ox},${row + oy}`);
    }
  }
}
const seenRoads = new Set();
for (const transition of world.transitions) {
  const fromRegion = world.regions.find((region) => region.mapResourceId === transition.from.mapResourceId);
  const toRegion = world.regions.find((region) => region.mapResourceId === transition.to.mapResourceId);
  const fromMap = mapsById.get(transition.from.mapResourceId);
  const toMap = mapsById.get(transition.to.mapResourceId);
  if (fromRegion === undefined || toRegion === undefined || fromMap === undefined || toMap === undefined) {
    throw new Error(`关口 ${transition.id} 指向未登记区域或地图。`);
  }
  const from = projectRegionCell(fromRegion, fromMap, transition.from);
  const to = projectRegionCell(toRegion, toMap, transition.to);
  const key = [`${from.col},${from.row}`, `${to.col},${to.row}`].sort().join('|');
  if (seenRoads.has(key)) continue;
  seenRoads.add(key);
  addRoad(from, to);
}

const groveFrames = [587, 644, 584];
const ridgeFrames = [747, 748, 749, 750, 751, 1032, 1033, 1034, 1035, 1252, 1253];
for (let row = 0; row < overview.rows; row++) {
  for (let col = 0; col < overview.columns; col++) {
    if (land[row][col] === 0 || coast[row][col] !== 0) continue;
    const roadKey = `${col},${row}`;
    const roll = rng(col, row, 0x6604) % 100;
    const ridgeLine = overview.rows * 0.24 + Math.sin(col * 0.12) * 5 + Math.sin(col * 0.045) * 3;
    const northEastUpland = col > overview.columns * 0.55 && Math.abs(row - ridgeLine) < 10;
    const ridgeCluster = rng(Math.floor(col / 6), Math.floor(row / 4), 0x6605) % 100;
    const groveCluster = rng(Math.floor(col / 8), Math.floor(row / 6), 0x6606) % 100;
    if (northEastUpland && ridgeCluster < 26 && roll < 92) {
      topography[row][col] = ridgeFrames[rng(col, row, 0x6608) % ridgeFrames.length];
    } else if (!roadCells.has(roadKey) && groveCluster < 24 && roll < 44) {
      topography[row][col] = groveFrames[rng(col, row, 0x6606) % groveFrames.length];
    }
  }
}

const trailFrames = [576, 577, 578, 579];
for (const cell of roadCells) {
  const [col, row] = cell.split(',').map(Number);
  roads[row][col] = trailFrames[rng(col, row, 0x6607) % trailFrames.length];
  topography[row][col] = 0;
}

const atlasArt = {
  ...overview,
  tilesets: [tileset],
  layers: [
    { id: 'world-ocean', tilesetId: tileset.id, cells: ocean },
    { id: 'world-land', tilesetId: tileset.id, cells: land },
    { id: 'world-coast', tilesetId: tileset.id, cells: coast },
    { id: 'world-relief', tilesetId: tileset.id, cells: topography },
    { id: 'world-roads', tilesetId: tileset.id, cells: roads },
  ],
};

// Fail fast if authored markers lie outside the land/water canvas; projection
// is shared with the Phaser-free runtime helpers and is separately tested.
for (const region of world.regions) {
  const col = Math.round(region.atlasPosition.x / 100 * (overview.columns - 1));
  const row = Math.round(region.atlasPosition.y / 100 * (overview.rows - 1));
  if (!inside(col, row) || land[row]?.[col] === 0) throw new Error(`区域 ${region.name} 的舆图锚点不在陆地内。`);
}
for (const layer of atlasArt.layers) {
  if (layer.cells.length !== overview.rows || layer.cells.some((line) => line.length !== overview.columns)) {
    throw new Error(`生成图层 ${layer.id} 的网格尺寸不一致。`);
  }
}

world.atlasArt = atlasArt;
await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Generated ${overview.columns}×${overview.rows} CC0 world atlas (${atlasArt.layers.length} layers, ${world.regions.length} regions, ${seenRoads.size} gate routes).`);
