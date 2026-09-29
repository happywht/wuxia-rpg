import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = resolve(root, 'data/base/world/world-map.json');
const manifestPath = resolve(root, 'data/base/manifest.json');
const overview = { columns: 224, rows: 144, tileSize: 16 };
const oldAtlasFallback = { columns: 208, rows: 128 };
const islandMapId = 'map.round-79-isles';
const atlasTileId = 'opengameart.puny-world';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [world, manifest] = await Promise.all([readJson(worldPath), readJson(manifestPath)]);
if (!Array.isArray(world.regions) || world.regions.length === 0 || !Array.isArray(world.transitions)) {
  throw new Error('区域与关口资料缺失，拒绝生成无法导航的总图。');
}
const previousAtlas = world.atlasArt ?? oldAtlasFallback;
const previousDimensions = { columns: previousAtlas.columns ?? 208, rows: previousAtlas.rows ?? 128 };
const maps = new Map();
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'grid-map') continue;
  maps.set(resource.id, await readJson(resolve(root, 'data/base', resource.path)));
}
for (const region of world.regions) {
  const map = maps.get(region.mapResourceId);
  if (map === undefined || !Array.isArray(map.art?.tilesets) || map.art.tilesets.length === 0) {
    throw new Error(`区域 ${region.mapResourceId} 没有可读地图或像素图集。`);
  }
}
const islandMap = maps.get(islandMapId);
const islandTileset = islandMap?.art?.tilesets.find((set) => set.id === atlasTileId);
if (islandTileset === undefined) throw new Error('群岛地图未声明 Puny World CC0 图集。');

// Preserve existing regions' absolute atlas cells while expanding the canvas.
for (const region of world.regions) {
  if (region.mapResourceId === islandMapId) continue;
  const prior = region.atlasPosition;
  // Preserve the exact previous cell-center pixel position, including the
  // half-cell offset used by projectAtlasPosition.
  const oldColCenter = (prior.x / 100) * (previousDimensions.columns - 1) + 0.5;
  const oldRowCenter = (prior.y / 100) * (previousDimensions.rows - 1) + 0.5;
  region.atlasPosition = {
    x: Number((((oldColCenter - 0.5) / (overview.columns - 1)) * 100).toFixed(6)),
    y: Number((((oldRowCenter - 0.5) / (overview.rows - 1)) * 100).toFixed(6)),
  };
}

const mapsById = maps;
const baseMap = mapsById.get(world.startingMapResourceId);
const kenneyTileset = baseMap?.art?.tilesets.find((set) => set.id === 'kenney.roguelike-rpg');
if (kenneyTileset === undefined) throw new Error('起始地图未声明 Kenney Roguelike 授权图集。');
const existingTilesets = (previousAtlas.tilesets ?? []).filter((set) => set.id !== atlasTileId);
const atlasTilesets = [...existingTilesets, islandTileset];
const rng = (col, row, salt = 0) => {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};
const inside = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
const blank = () => Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
const previousLayers = (previousAtlas.layers ?? [])
  .filter(({ id }) => !id.startsWith('world-r79-shoal-') && id !== 'world-r79-gate-routes')
  .map((layer) => {
    const cells = blank();
    for (let row = 0; row < Math.min(previousDimensions.rows, overview.rows); row++) {
      for (let col = 0; col < Math.min(previousDimensions.columns, overview.columns); col++) {
        cells[row][col] = layer.cells?.[row]?.[col] ?? 0;
      }
    }
    return { ...layer, cells };
  });
const previousLayerById = new Map(previousLayers.map((layer) => [layer.id, layer]));
const baseLayer = (id) => {
  const layer = previousLayerById.get(id);
  if (layer === undefined) throw new Error(`旧舆图缺少基础图层：${id}`);
  return layer.cells;
};
const ocean = baseLayer('world-ocean');
const land = baseLayer('world-land');
const coast = baseLayer('world-coast');
const relief = baseLayer('world-relief');
const roads = baseLayer('world-roads');
const shoalWater = blank();
const shoalSand = blank();
const shoalLand = blank();
const shoalTrees = blank();
const gateRoutes = blank();

for (let row = 0; row < overview.rows; row++) {
  for (let col = 0; col < overview.columns; col++) {
    if (row >= previousDimensions.rows || col >= previousDimensions.columns) ocean[row][col] = 1;
  }
}

function projectCell(region, map, point) {
  const centerX = (region.atlasPosition.x / 100) * (overview.columns - 1);
  const centerY = (region.atlasPosition.y / 100) * (overview.rows - 1);
  const u = (point.col + 0.5) / map.columns - 0.5;
  const v = (point.row + 0.5) / map.rows - 0.5;
  return {
    col: Math.round(centerX + u * overview.columns * 0.16),
    row: Math.round(centerY + v * overview.rows * 0.16),
  };
}

const roadCells = new Set();
function addRoad(from, to, target = roadCells) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (inside(col + ox, row + oy)) target.add(`${col + ox},${row + oy}`);
    }
  }
}
const seenRoutes = new Set();
for (const transition of world.transitions) {
  const fromRegion = world.regions.find((region) => region.mapResourceId === transition.from.mapResourceId);
  const toRegion = world.regions.find((region) => region.mapResourceId === transition.to.mapResourceId);
  const fromMap = mapsById.get(transition.from.mapResourceId);
  const toMap = mapsById.get(transition.to.mapResourceId);
  if (fromRegion === undefined || toRegion === undefined || fromMap === undefined || toMap === undefined) {
    throw new Error(`关口 ${transition.id} 指向未登记区域或地图。`);
  }
  const from = projectCell(fromRegion, fromMap, transition.from);
  const to = projectCell(toRegion, toMap, transition.to);
  const routeKey = [`${from.col},${from.row}`, `${to.col},${to.row}`].sort().join('|');
  if (seenRoutes.has(routeKey)) continue;
  seenRoutes.add(routeKey);
  addRoad(from, to);
}

const pineFrames = [190, 196, 202, 208, 214, 220, 226, 232, 238, 244, 250, 256, 262, 268];
const islandRegion = world.regions.find((region) => region.mapResourceId === islandMapId);
if (islandRegion === undefined) throw new Error('全域舆图没有登记 Round 79 岛链。');
const islandCenter = {
  col: Math.round((islandRegion.atlasPosition.x / 100) * (overview.columns - 1)),
  row: Math.round((islandRegion.atlasPosition.y / 100) * (overview.rows - 1)),
};
const landIslets = [
  { col: islandCenter.col, row: islandCenter.row, rx: 10, ry: 7 },
  { col: islandCenter.col - 12, row: islandCenter.row + 2, rx: 4, ry: 3 },
  { col: islandCenter.col + 12, row: islandCenter.row - 4, rx: 4, ry: 3 },
];
function onIslet(col, row) {
  return landIslets.some((part) => {
    const dx = (col - part.col) / part.rx;
    const dy = (row - part.row) / part.ry;
    return dx * dx + dy * dy <= 1;
  });
}
for (let row = islandCenter.row - 13; row <= islandCenter.row + 13; row++) {
  for (let col = islandCenter.col - 17; col <= islandCenter.col + 17; col++) {
    if (!inside(col, row)) continue;
    const dx = (col - islandCenter.col) / 17;
    const dy = (row - islandCenter.row) / 13;
    if (dx * dx + dy * dy > 1) continue;
    for (const layer of previousLayers) layer.cells[row][col] = 0;
    shoalWater[row][col] = 294;
    if (!onIslet(col, row)) continue;
    const shoreline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => !onIslet(col + ox, row + oy));
    const cellSeed = rng(col, row, 0x7904);
    shoalSand[row][col] = shoreline ? 5 : 0;
    shoalLand[row][col] = shoreline ? 0 : [1, 2, 3, 28][cellSeed % 4];
    if (!shoreline && cellSeed % 11 === 0) shoalTrees[row][col] = pineFrames[cellSeed % pineFrames.length];
  }
}

const trailFrames = [576, 577, 578, 579];
const uniqueNewRoutes = new Set();
for (const transition of world.transitions.filter((entry) =>
  entry.from.mapResourceId === islandMapId || entry.to.mapResourceId === islandMapId)) {
  const fromRegion = world.regions.find((region) => region.mapResourceId === transition.from.mapResourceId);
  const toRegion = world.regions.find((region) => region.mapResourceId === transition.to.mapResourceId);
  const fromMap = mapsById.get(transition.from.mapResourceId);
  const toMap = mapsById.get(transition.to.mapResourceId);
  if (fromRegion === undefined || toRegion === undefined || fromMap === undefined || toMap === undefined) continue;
  addRoad(projectCell(fromRegion, fromMap, transition.from), projectCell(toRegion, toMap, transition.to), uniqueNewRoutes);
}
for (const cell of uniqueNewRoutes) {
  const [col, row] = cell.split(',').map(Number);
  gateRoutes[row][col] = trailFrames[rng(col, row, 0x7905) % trailFrames.length];
}

const atlasArt = {
  ...overview,
  tilesets: atlasTilesets,
  layers: [
    ...previousLayers,
    { id: 'world-r79-shoal-water', tilesetId: atlasTileId, cells: shoalWater },
    { id: 'world-r79-shoal-sand', tilesetId: atlasTileId, cells: shoalSand },
    { id: 'world-r79-shoal-land', tilesetId: atlasTileId, cells: shoalLand },
    { id: 'world-r79-shoal-pines', tilesetId: atlasTileId, cells: shoalTrees },
    { id: 'world-r79-gate-routes', tilesetId: kenneyTileset.id, cells: gateRoutes },
  ],
};

for (const region of world.regions) {
  const map = mapsById.get(region.mapResourceId);
  const point = projectCell(region, map, {
    col: Math.floor(map.columns / 2), row: Math.floor(map.rows / 2),
  });
  if (!inside(point.col, point.row)) throw new Error(`区域 ${region.name} 投影越界。`);
  const onLand = region.mapResourceId === islandMapId
    ? onIslet(point.col, point.row)
    : land[point.row]?.[point.col] !== 0;
  if (!onLand) throw new Error(`区域 ${region.name} 的总图锚点没有落在陆地/岛屿上：${point.col},${point.row}`);
}
for (const layer of atlasArt.layers) {
  if (layer.cells.length !== overview.rows || layer.cells.some((line) => line.length !== overview.columns)) {
    throw new Error(`生成图层 ${layer.id} 的网格尺寸不一致。`);
  }
  const tileset = atlasTilesets.find((set) => set.id === layer.tilesetId);
  if (tileset === undefined || layer.cells.some((line) => line.some((gid) => gid > tileset.tileCount))) {
    throw new Error(`图层 ${layer.id} 含超出图集范围的帧号。`);
  }
}

world.atlasArt = atlasArt;
await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Generated ${overview.columns}×${overview.rows} world atlas: ${world.regions.length} regions, ${world.transitions.length} gates, ${seenRoutes.size} regional routes.`);
console.log(`Round 79 island inset uses ${atlasTileId} tiles and preserves the previous atlas layers and pixel anchors.`);
