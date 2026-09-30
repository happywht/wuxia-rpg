import { readFile, writeFile } from 'node:fs/promises';
import { deepenSeaQuests, deepenSeaDialogues } from './lib/round102-sea-content.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  coastMap: resolve(base, 'maps/round-82-east-coast.json'),
  map: resolve(base, 'maps/round-84-windward-isle.json'),
  npcs: resolve(base, 'characters/round-84-windward-isle-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-84-windward-isle-conversations.json'),
  quests: resolve(base, 'quests/round-84-windward-isle-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-84-windward-isle';
const npcId = 'char.r84-ruan-huilan';
const questId = 'quest.r84-lantern-ledger';
const nodeIds = {
  isle: 'place.r84-windward-isle',
  hamlet: 'place.r84-stone-hamlet',
  beacon: 'place.r84-windward-beacon',
  spring: 'place.r84-spring-hollow',
  npc: npcId,
  quest: questId,
  arrival: 'event.r84-arrival',
  hamletEvent: 'event.r84-hamlet-ledger',
  beaconEvent: 'event.r84-beacon-watch',
};
const overview = { columns: 384, rows: 256, tileSize: 16 };
const expectedOld = { columns: 336, rows: 224 };
const extensionIds = [
  'world-r84-expanse-water', 'world-r84-expanse-sand',
  'world-r84-expanse-land', 'world-r84-expanse-pines',
];
// 风回岛区域中心固定投影到扩展舆图的 (355,125) 格。
const isleAtlasCell = { col: 355, row: 125 };
const columns = 100;
const rows = 100;
const at = (col, row) => ({ col, row });
const key = (col, row) => col + ',' + row;
const blank = () => Array.from({ length: rows }, () => Array(columns).fill(0));
const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  return writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
async function writeNewJson(path, value, label) {
  let raw = null;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const next = JSON.stringify(value, null, 2) + '\n';
  if (raw === null) {
    await writeFile(path, next);
    return;
  }
  if (raw !== next) {
    throw new Error(label + ' 与生成器声明不一致；请先移除冲突的 Round 84 文件。');
  }
}
async function appendGraphEntries(path, field, additions) {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  const existing = parsed[field] ?? [];
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const exact = additions.every((entry) => JSON.stringify(byId.get(entry.id)) === JSON.stringify(entry));
  if (exact) return;
  if (additions.some((entry) => byId.has(entry.id))) {
    throw new Error('Round 84 图谱条目与生成器声明不一致；请先移除冲突的 Round 84 条目。');
  }
  const closing = raw.lastIndexOf('\n  ]');
  if (closing < 0 || raw.slice(closing).trim() !== ']\n}') {
    throw new Error('无法保持知识图谱文件原格式追加 ' + field + '。');
  }
  const lines = additions.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, raw.slice(0, closing) + ',\n' + lines + raw.slice(closing));
}

const [world, manifest, coastMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.coastMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (coastMap.id !== 'map.round-82-east-coast' || coastMap.grid.length !== 100) {
  throw new Error('Round 84 需要 Round 82 的东溟海岸百格地图作为登岛关口。');
}

// ---------------------------------------------------------------------------
// 第一部分：把 336×224 舆图确定性地扩展到 384×256，并在新增东/南格上
// 用已登记的 CC0 Puny World 图素绘制风回岛地貌；旧矩形逐格保持原样。
// ---------------------------------------------------------------------------
const previous = world.atlasArt;
const atlasReady = previous?.columns === overview.columns && previous?.rows === overview.rows &&
  extensionIds.every((id) => previous.layers.some((layer) => layer.id === id));
let extensionCount = null;
if (!atlasReady) {
  if (previous === undefined || previous.columns !== expectedOld.columns || previous.rows !== expectedOld.rows) {
    throw new Error(`预期 Round 83 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 84 图层；请先恢复干净的 Round 83 状态。');
  }
  const tileById = new Map(previous.tilesets.map((tileset) => [tileset.id, tileset]));
  const oceanTiles = tileById.get('wuxia.world-palette');
  const islandTiles = tileById.get('opengameart.puny-world');
  if (oceanTiles === undefined || islandTiles === undefined) {
    throw new Error('舆图缺少现有程序水面或 OpenGameArt Puny World CC0 图集。');
  }

  const atlasBlank = () => Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
  const expandedLayers = previous.layers.map((layer) => {
    if (layer.cells.length !== expectedOld.rows || layer.cells.some((row) => row.length !== expectedOld.columns)) {
      throw new Error(`Round 83 图层 ${layer.id} 的尺寸不是 ${expectedOld.columns}×${expectedOld.rows}。`);
    }
    const cells = atlasBlank();
    for (let row = 0; row < expectedOld.rows; row += 1) {
      for (let col = 0; col < expectedOld.columns; col += 1) cells[row][col] = layer.cells[row][col];
    }
    return { ...layer, cells };
  });
  const layerById = new Map(expandedLayers.map((layer) => [layer.id, layer]));
  const oceanLayer = layerById.get('world-ocean');
  if (oceanLayer === undefined || oceanLayer.tilesetId !== oceanTiles.id) {
    throw new Error('Round 83 舆图缺少预期的程序水面底层。');
  }
  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (row >= expectedOld.rows || col >= expectedOld.columns) oceanLayer.cells[row][col] = 1;
    }
  }

  const newWater = atlasBlank();
  const newSand = atlasBlank();
  const newLand = atlasBlank();
  const newPines = atlasBlank();
  const seaShapes = [
    { col: 356, row: 128, radiusX: 27, radiusY: 45 },
    { col: 340, row: 240, radiusX: 43, radiusY: 15 },
  ];
  const landShapes = [
    { col: 355, row: 125, radiusX: 19, radiusY: 24, salt: 0x8401 },
    { col: 362, row: 106, radiusX: 8, radiusY: 7, salt: 0x8402 },
    { col: 372, row: 132, radiusX: 8, radiusY: 10, salt: 0x8403 },
    { col: 350, row: 150, radiusX: 9, radiusY: 6, salt: 0x8404 },
    { col: 379, row: 112, radiusX: 3, radiusY: 3, salt: 0x8405 },
    { col: 320, row: 236, radiusX: 10, radiusY: 8, salt: 0x8411 },
    { col: 350, row: 240, radiusX: 14, radiusY: 11, salt: 0x8412 },
  ];
  const isInsideAny = (shapes, col, row) => shapes.some((shape) => {
    const dx = (col - shape.col) / shape.radiusX;
    const dy = (row - shape.row) / shape.radiusY;
    return dx * dx + dy * dy <= 1;
  });
  const newArea = (col, row) => col >= expectedOld.columns || row >= expectedOld.rows;
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 271, 0x45d9f3b) ^ Math.imul(row + 193, 0x119de1f3) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const grassFrames = [1, 2, 3, 28];
  const pineFrames = [190, 196, 202, 208, 214, 220, 226, 232, 238, 244, 250, 256, 262, 268];
  extensionCount = { cells: 0, shore: 0, trees: 0, water: 0 };

  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (!newArea(col, row)) continue;
      if (isInsideAny(seaShapes, col, row)) {
        newWater[row][col] = 294;
        extensionCount.water += 1;
      }
      if (!isInsideAny(landShapes, col, row)) continue;

      const shoreline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        !isInsideAny(landShapes, col + dx, row + dy),
      );
      const seed = hash(col, row, 0x8400);
      if (shoreline) {
        newSand[row][col] = 5;
        extensionCount.shore += 1;
      } else {
        newLand[row][col] = grassFrames[seed % grassFrames.length];
        extensionCount.cells += 1;
        if (seed % 100 < 14) {
          newPines[row][col] = pineFrames[hash(col, row, 0x8406) % pineFrames.length];
          extensionCount.trees += 1;
        }
      }
    }
  }
  if (extensionCount.cells + extensionCount.shore < 2000 || extensionCount.water < 3000) {
    throw new Error('扩展舆图的地貌数量不足：' + JSON.stringify(extensionCount));
  }
  const onIsleLand = (col, row) => inAtlasBounds(col, row) && isInsideAny(landShapes, col, row);
  if (!onIsleLand(isleAtlasCell.col, isleAtlasCell.row)) {
    throw new Error('风回岛区域中心没有落在新增岛陆上。');
  }

  const addedLayers = [
    { id: 'world-r84-expanse-water', tilesetId: islandTiles.id, cells: newWater },
    { id: 'world-r84-expanse-sand', tilesetId: islandTiles.id, cells: newSand },
    { id: 'world-r84-expanse-land', tilesetId: islandTiles.id, cells: newLand },
    { id: 'world-r84-expanse-pines', tilesetId: islandTiles.id, cells: newPines },
  ];
  const existingIds = new Set(expandedLayers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 84 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }

  // 保持全部既有区域的绝对像素中心不变，仅把百分比基准换到 384×256 画布。
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
    throw new Error('Round 83 旧图层 id 不唯一或扩图时发生丢失。');
  }
  world.atlasArt = atlasArt;
}

// ---------------------------------------------------------------------------
// 第二部分：生成 100×100 风回岛可玩地图，声明已登记的 Puny World /
// RPG Town / Puny Characters 图集，并验证与青帆埠之间的双向步行关口。
// ---------------------------------------------------------------------------
const punyId = 'opengameart.puny-world';
const townId = 'opengameart.rpg-town';
const actorId = 'opengameart.puny-characters';
const tilesets = [punyId, townId, actorId].map((id) => {
  const declaration = coastMap.art?.tilesets.find((entry) => entry.id === id);
  if (declaration === undefined) throw new Error('缺少已登记素材图集：' + id);
  return declaration;
});
const punyTileset = tilesets.find((entry) => entry.id === punyId);
const townTileset = tilesets.find((entry) => entry.id === townId);
if (!punyTileset || !townTileset) throw new Error('风回岛像素图集配置不完整。');

const start = at(2, 50);
const isleReturn = at(1, 50);
const coastGate = at(91, 71);
const coastArrival = at(90, 71);
const hamlet = at(50, 47);
const npcPosition = at(51, 49);
const beacon = at(80, 38);
const spring = at(40, 62);
const roads = new Set();
function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (inside(col + dx, row + dy)) roads.add(key(col + dx, row + dy));
    }
  }
}
function addRoad(points) {
  for (let i = 1; i < points.length; i += 1) addRoadSegment(points[i - 1], points[i]);
}
addRoad([start, at(17, 50), at(30, 48), hamlet]);
addRoad([hamlet, at(63, 45), beacon]);
addRoad([hamlet, at(40, 55), spring]);
addRoad([hamlet, at(58, 52), at(58, 58)]);

const anchors = new Map();
function reserveAnchor(label, point, radius = 1) {
  if (!inside(point.col, point.row)) throw new Error(label + ' 越界：' + key(point.col, point.row));
  for (let row = point.row - radius; row <= point.row + radius; row += 1) {
    for (let col = point.col - radius; col <= point.col + radius; col += 1) {
      if (inside(col, row) && !anchors.has(key(col, row))) anchors.set(key(col, row), label);
    }
  }
}
const landmarks = [
  { id: 'landmark.r84-west-shore', mapResourceId: mapId, ...start, name: '风回西滩', category: 'crossing' },
  { id: 'landmark.r84-stone-hamlet', mapResourceId: mapId, ...hamlet, name: '石厝小村', category: 'settlement', discoveryNodeId: nodeIds.hamlet },
  { id: 'landmark.r84-windward-beacon', mapResourceId: mapId, ...beacon, name: '风回灯标', category: 'other', discoveryNodeId: nodeIds.beacon },
  { id: 'landmark.r84-spring-hollow', mapResourceId: mapId, ...spring, name: '淡泉洼', category: 'water', discoveryNodeId: nodeIds.spring },
];
for (const point of [start, isleReturn, hamlet, npcPosition, beacon, spring]) reserveAnchor('人物/关口/地标', point, 2);
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

function hashCell(col, row, salt) {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function onCore(col, row) {
  const dx = (col - 54) / 43;
  const dy = (row - 49) / 40;
  const edge = ((hashCell(col, row, 0x8401) % 1000) / 1000 - 0.5) * 0.06;
  return dx * dx + dy * dy <= 1 + edge;
}
function onWestSpit(col, row) {
  const dx = (col - 12) / 12;
  const dy = (row - 50) / 8;
  return dx * dx + dy * dy <= 1;
}
function inLagoon(col, row) {
  const dx = (col - 66) / 9;
  const dy = (row - 66) / 7;
  return dx * dx + dy * dy <= 1;
}
function isLand(col, row) {
  if (!inside(col, row)) return false;
  return (onCore(col, row) || onWestSpit(col, row)) && !inLagoon(col, row);
}
const groves = [
  { col: 34, row: 38, rx: 11, ry: 9, density: 26, salt: 0x8411 },
  { col: 68, row: 52, rx: 10, ry: 8, density: 22, salt: 0x8412 },
  { col: 40, row: 70, rx: 9, ry: 8, density: 20, salt: 0x8413 },
];
const waterFrames = [286, 288, 290, 291, 294, 295, 296];
const grassFrames = [1, 2, 3, 28, 29, 30];
const sandFrames = [5, 6, 7, 32, 33, 34];
const treeFrames = [190, 193, 196, 199, 202, 205, 208, 211, 214, 217, 220, 223, 226, 229, 232, 235, 238, 241, 244, 247, 250, 253, 256, 259, 262, 265, 268];
const sea = blank();
const ground = blank();
const trees = blank();
const groundGlyphs = Array.from({ length: rows }, () => Array(columns).fill('~'));
let landCount = 0;
let shoreCount = 0;
let treeCount = 0;
for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < columns; col += 1) {
    const seed = hashCell(col, row, 0x8402);
    sea[row][col] = waterFrames[seed % waterFrames.length];
    if (!isLand(col, row)) continue;
    landCount += 1;
    const cellKey = key(col, row);
    const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isLand(col + dx, row + dy));
    const grove = groves.find((part) => {
      const dx = (col - part.col) / part.rx;
      const dy = (row - part.row) / part.ry;
      return dx * dx + dy * dy <= 1;
    });
    const roll = grove === undefined ? 100 : hashCell(col, row, grove.salt) % 100;
    const road = roads.has(cellKey);
    const anchor = anchors.has(cellKey);
    const tree = !shore && !road && !anchor && grove !== undefined && roll < grove.density;
    const sand = shore || (seed % 100 < 9);
    ground[row][col] = sand ? sandFrames[seed % sandFrames.length] : grassFrames[seed % grassFrames.length];
    groundGlyphs[row][col] = sand ? ',' : '.';
    if (tree) {
      trees[row][col] = treeFrames[hashCell(col, row, 0x8403) % treeFrames.length];
      treeCount += 1;
      if (roll % 100 < 63) groundGlyphs[row][col] = '#';
    }
    if (road || anchor) {
      groundGlyphs[row][col] = '.';
      ground[row][col] = sandFrames[seed % sandFrames.length];
      trees[row][col] = 0;
    }
    if (shore) shoreCount += 1;
  }
}
const grid = groundGlyphs.map((line) => line.join(''));
function reachableFrom(origin, mapGrid, mapColumns, mapRows) {
  if (mapGrid[origin.row]?.[origin.col] === undefined || ['#', '~'].includes(mapGrid[origin.row][origin.col])) {
    throw new Error('风回岛入口受阻：' + key(origin.col, origin.row));
  }
  const reached = new Set([key(origin.col, origin.row)]);
  const queue = [origin];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = current.col + dx;
      const row = current.row + dy;
      const next = key(col, row);
      if (col < 0 || row < 0 || col >= mapColumns || row >= mapRows) continue;
      if (['#', '~'].includes(mapGrid[row][col]) || reached.has(next)) continue;
      reached.add(next);
      queue.push(at(col, row));
    }
  }
  return reached;
}
const reachable = reachableFrom(start, grid, columns, rows);
for (const point of [isleReturn, hamlet, npcPosition, beacon, spring]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('风回岛锚点不可达：' + key(point.col, point.row));
}
if (landCount < 4_000 || reachable.size < 3_500) {
  throw new Error('风回岛地形/连通格数量不足：陆地 ' + landCount + '，连通 ' + reachable.size);
}
if (npcPosition.col === start.col && npcPosition.row === start.row) {
  throw new Error('风回岛居民占住了入岸点。');
}
if (isleReturn.col === start.col && isleReturn.row === start.row) {
  throw new Error('风回岛回程关口与入岸点重合。');
}
for (const point of [coastGate, coastArrival]) {
  const glyph = coastMap.grid[point.row]?.[point.col];
  if (glyph === undefined || coastMap.tileTypes[glyph]?.solid) {
    throw new Error('青帆埠登岛关口落点不可通行：' + key(point.col, point.row));
  }
}
if (coastMap.playerStart.col === coastGate.col && coastMap.playerStart.row === coastGate.row) {
  throw new Error('青帆埠登岛关口与玩家出生点重合。');
}
const coastGlyphs = coastMap.grid;
const coastReachable = reachableFrom(
  { col: coastMap.playerStart.col, row: coastMap.playerStart.row },
  coastGlyphs, coastMap.columns, coastMap.rows,
);
for (const point of [coastGate, coastArrival]) {
  if (!coastReachable.has(key(point.col, point.row))) {
    throw new Error('青帆埠登岛关口不可从出生点抵达：' + key(point.col, point.row));
  }
}

const hamletDetails = blank();
const hamletPlacements = [
  { col: 49, row: 43, gid: 182 },
  { col: 50, row: 43, gid: 183 },
  { col: 51, row: 43, gid: 184 },
  { col: 49, row: 44, gid: 185 },
  { col: 50, row: 44, gid: 186 },
  { col: 52, row: 44, gid: 108 },
  { col: beacon.col, row: beacon.row, gid: 29 },
];
for (const item of hamletPlacements) {
  if (!inside(item.col, item.row) || !isLand(item.col, item.row)) {
    throw new Error('石厝装饰越界或压在海水上：' + key(item.col, item.row));
  }
  if (item.gid < 1 || item.gid >= 345 || item.gid > townTileset.tileCount) {
    throw new Error('石厝装饰帧未经核验：' + item.gid);
  }
  if (anchors.has(key(item.col, item.row)) && item.col !== beacon.col) {
    throw new Error('石厝装饰覆盖玩法锚点：' + key(item.col, item.row));
  }
  hamletDetails[item.row][item.col] = item.gid;
}
const mapData = {
  id: mapId,
  name: '东溟外海·风回岛',
  tileSize: 48,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#638f61', solid: false },
    ',': { color: '#d4c08a', solid: false },
    '#': { color: '#315347', solid: true },
    '~': { color: '#168a9a', solid: true },
  },
  grid,
  playerStart: start,
  art: {
    tileSize: 16,
    tilesets,
    actors: { ...coastMap.art.actors },
    layers: [
      { id: 'r84-sea', tilesetId: punyId, cells: sea },
      { id: 'r84-island-ground', tilesetId: punyId, cells: ground },
      { id: 'r84-stone-hamlet', tilesetId: townId, cells: hamletDetails },
      { id: 'r84-pine-groves', tilesetId: punyId, depthSort: 'y', cells: trees },
    ],
  },
};
const npcs = {
  npcs: [{
    id: npcId,
    name: '阮回澜',
    mapResourceId: mapId,
    position: npcPosition,
    dialogueId: 'dlg.r84-ruan-huilan-lantern',
    questGiver: true,
    spriteFrame: 176,
    spriteFrames: { down: 160, right: 168, up: 176, left: 184 },
  }],
};
const quests = {
  quests: [{
    id: questId,
    name: '风回灯影',
    description: '阮回澜请你登上风回岛东坡的灯标，把今季灯影落下的浪线方位记回石厝旧簿。',
    giverNpcId: npcId,
    objectives: [{
      id: 'objective.r84-read-windward-beacon',
      kind: 'discoverKnowledge',
      targetId: nodeIds.beacon,
      requiredCount: 1,
      text: '在风回灯标记下灯影方位',
    }],
    rewards: {
      experience: 34,
      currency: 26,
      discoverKnowledgeNodeIds: [nodeIds.spring],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r84-ruan-huilan-lantern',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '阮回澜把一盏罩着铁纱的风灯搁在石阶上：「岛上只剩我一户守灯。灯标旧簿记了三十年风候，你若肯替我上一趟东坡，把今年灯影的方位记下来，这簿子就能续写。」',
        options: [
          {
            text: '我去东坡看灯标。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '灯影方位已经记下了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          { text: '石厝村为何只剩一户？', nextNodeId: 'hamlet' },
          { text: '风回岛的潮路怎么走？', nextNodeId: 'tides' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「沿松道向东，坡顶那座白石堆就是灯标。风从东南来时灯影最长，把落在哪一道浪线上记清楚。」' },
      { id: 'completed', text: '阮回澜把你的记录誊进旧簿：「灯影南移了半指——秋后渔船该改走南汊了。这簿子往后就交给过路人续。」' },
      { id: 'hamlet', text: '「早年间石厝有十几户，都吃灯标的饭。风候一年比一年乱，看得懂旧簿的人陆续渡海去了青帆埠。」' },
      { id: 'tides', text: '「从西滩上岛要赶在涨潮前。退潮时沙脊露出三道，走中间那道最稳，两侧都是软泥。」' },
      { id: 'farewell', text: '阮回澜提起风灯，往灯标坡道的方向去了。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '东溟外海·风回岛',
  description: '风回岛悬在东溟外海，西滩沙脊、石厝小村与东坡灯标连成一条可步行的岛路。',
  atlasPosition: {
    x: Number(((isleAtlasCell.col / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number(((isleAtlasCell.row / (overview.rows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r84-east-coast-to-windward-isle',
    name: '涉潮登岛',
    from: { mapResourceId: coastMap.id, ...coastGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r84-windward-isle-to-east-coast',
    name: '西望归帆',
    from: { mapResourceId: mapId, ...isleReturn },
    to: { mapResourceId: coastMap.id, ...coastArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '踏过最后一段露水的沙脊，风回岛的西滩在午后的潮光里铺开，东坡上隐约立着一座白石灯标。',
    approachText: '潮声从东南方压过来，沙脊尽头浮出一线岛影。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.isle,
  },
  {
    id: nodeIds.hamletEvent,
    mapResourceId: mapId,
    ...hamlet,
    text: '石厝的矮墙围着几座空屋，只剩一户窗里透出灯光，檐下挂着一本翻旧的灯簿。',
    approachText: '村口的石墙缝里塞着干海草，风灯的光在坡道上晃。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.hamlet,
  },
  {
    id: nodeIds.beaconEvent,
    mapResourceId: mapId,
    ...beacon,
    text: '白石堆成的灯标立在坡顶，铁纱风灯随东南风轻晃，灯影正落在南面第三道浪线上。',
    approachText: '坡顶的风比村口硬得多，灯标的影子长长地压在草坡上。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.beacon,
    interaction: {
      prompt: '记下风回灯影的方位',
      range: 1,
      approachDirections: ['left', 'down'],
    },
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '风回岛探索地图', summary: '从青帆埠东南潮滩涉水可登的外海岛屿百格地图。', knownByDefault: false },
  { id: nodeIds.isle, kind: 'place', title: '东溟外海·风回岛', summary: '东溟外海中的步行岛屿，西滩沙脊连着石厝小村与东坡灯标。', knownByDefault: false },
  { id: nodeIds.hamlet, kind: 'place', title: '石厝小村', summary: '风回岛上的石头村落，如今只剩守灯人一户。', knownByDefault: false },
  { id: nodeIds.beacon, kind: 'place', title: '风回灯标', summary: '岛东坡顶的白石灯标，灯影方位记录着季节风候。', knownByDefault: false },
  { id: nodeIds.spring, kind: 'place', title: '淡泉洼', summary: '岛心地势低洼处的淡水泉，是岛民取水的旧地。', knownByDefault: false },
  { id: nodeIds.npc, kind: 'character', title: '阮回澜', summary: '风回岛最后的守灯人，续写石厝灯簿三十年。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '风回灯影', summary: '登上岛东坡灯标记下今季灯影方位，续写石厝旧簿。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初登风回', summary: '涉过潮滩沙脊首次踏上风回岛西滩。', knownByDefault: false },
  { id: nodeIds.hamletEvent, kind: 'event', title: '石厝灯簿', summary: '在石厝村檐下翻看守灯人续写的旧簿。', knownByDefault: false },
  { id: nodeIds.beaconEvent, kind: 'event', title: '灯标夜风', summary: '在坡顶灯标观察灯影落下的浪线方位。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r84-arrival-isle', fromId: nodeIds.arrival, toId: nodeIds.isle, relation: 'triggers', summary: '初登西滩时发现风回岛。' },
  { id: 'kg.edge.r84-isle-map', fromId: nodeIds.isle, toId: mapId, relation: 'locatedAt', summary: '风回岛由百格探索地图承载。' },
  { id: 'kg.edge.r84-hamlet-event', fromId: nodeIds.hamletEvent, toId: nodeIds.hamlet, relation: 'triggers', summary: '翻看檐下旧簿后得知石厝小村的来历。' },
  { id: 'kg.edge.r84-beacon-event', fromId: nodeIds.beaconEvent, toId: nodeIds.beacon, relation: 'triggers', summary: '观察灯影后发现风候变化的痕迹。' },
  { id: 'kg.edge.r84-npc-location', fromId: nodeIds.npc, toId: mapId, relation: 'locatedAt', summary: '阮回澜在风回岛石厝守灯。' },
  { id: 'kg.edge.r84-npc-quest', fromId: nodeIds.npc, toId: nodeIds.quest, relation: 'participatesIn', summary: '阮回澜委托玩家记录灯影方位。' },
  { id: 'kg.edge.r84-quest-beacon', fromId: nodeIds.quest, toId: nodeIds.beacon, relation: 'requires', summary: '风回灯影需要玩家调查东坡灯标。' },
  { id: 'kg.edge.r84-quest-spring', fromId: nodeIds.quest, toId: nodeIds.spring, relation: 'rewards', summary: '完成风回灯影后，阮回澜带你认下岛心淡泉。' },
];
const resourceEntries = [
  { id: 'map.round-84-windward-isle', path: 'maps/round-84-windward-isle.json', schema: 'grid-map' },
  { id: 'npc.round-84-windward-isle-set', path: 'characters/round-84-windward-isle-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-84-windward-isle-set', path: 'dialogues/round-84-windward-isle-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-84-windward-isle-set', path: 'quests/round-84-windward-isle-quests.json', schema: 'quest-set' },
];

world.regions = (world.regions ?? []).filter((entry) => entry.mapResourceId !== mapId);
world.regions.push(region);
world.landmarks = [
  ...(world.landmarks ?? []).filter((entry) => !entry.id.startsWith('landmark.r84-')),
  ...landmarks,
];
world.transitions = [
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r84-')),
  ...transitions,
];
world.events = [
  ...(world.events ?? []).filter((entry) => !entry.id.startsWith('event.r84-')),
  ...events,
];
manifest.resources = (manifest.resources ?? []).filter((entry) => !resourceEntries.some((addition) => addition.id === entry.id));
const atlasIndex = manifest.resources.findIndex((entry) => entry.id === 'world.atlas');
if (atlasIndex < 0) throw new Error('manifest 缺少 world.atlas，拒绝孤立新增区域。');
manifest.resources.splice(atlasIndex, 0, ...resourceEntries);
nodes.nodes = [
  ...(nodes.nodes ?? []).filter((entry) =>
    entry.id !== mapId &&
    !entry.id.startsWith('place.r84-') &&
    !entry.id.startsWith('char.r84-') &&
    !entry.id.startsWith('quest.r84-') &&
    !entry.id.startsWith('event.r84-')),
  ...newNodes,
];
edges.edges = [
  ...(edges.edges ?? []).filter((entry) => !entry.id.startsWith('kg.edge.r84-')),
  ...newEdges,
];

await Promise.all([
  writeNewJson(paths.map, mapData, '风回岛地图'),
  writeNewJson(paths.npcs, npcs, '风回岛人物'),
  writeNewJson(paths.dialogues, deepenSeaDialogues(dialogues), '风回岛对白'),
  writeNewJson(paths.quests, deepenSeaQuests(quests), '风回岛任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Round 84 atlas is already ${overview.columns}×${overview.rows}; deterministic generation is a no-op.`);
} else {
  console.log(`Generated ${overview.columns}×${overview.rows} atlas (${world.atlasArt.layers.length} layers; ${world.regions.length} regions retained).`);
  console.log(`Round 84 CC0 extension: ${extensionCount.cells} grass, ${extensionCount.shore} shore, ${extensionCount.trees} pines, ${extensionCount.water} sea cells.`);
}
console.log(
  'Generated ' + mapData.name + ': ' + landCount + ' island land cells, ' +
  reachable.size + ' entrance-reachable walkable cells, ' + treeCount + ' pine tiles, ' +
  shoreCount + ' shore cells; two-way East Coast gates and ' + landmarks.length + ' landmarks.',
);
