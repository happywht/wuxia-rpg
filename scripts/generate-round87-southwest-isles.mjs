import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  islesMap: resolve(base, 'maps/round-79-isles.json'),
  map: resolve(base, 'maps/round-87-southwest-isles.json'),
  npcs: resolve(base, 'characters/round-87-southwest-isles-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-87-southwest-isle-conversations.json'),
  quests: resolve(base, 'quests/round-87-southwest-isle-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-87-southwest-isles';
const islesId = 'map.round-79-isles';
const npcIds = {
  pilot: 'char.r87-meng-haizhou',
  keeper: 'char.r87-ao-wanqing',
};
const questId = 'quest.r87-fog-pilot-ledger';
const nodeIds = {
  isle: 'place.r87-southwest-isles',
  harbor: 'place.r87-fog-harbor',
  signal: 'place.r87-mist-signal',
  spring: 'place.r87-spring-hollow',
  pilot: npcIds.pilot,
  keeper: npcIds.keeper,
  quest: questId,
  arrival: 'event.r87-arrival',
  harborEvent: 'event.r87-fog-harbor',
  signalEvent: 'event.r87-mist-signal',
  springEvent: 'event.r87-spring-hollow',
};
const overview = { columns: 512, rows: 384, tileSize: 16 };
const expectedOld = { columns: 448, rows: 320 };
const extensionIds = [
  'world-r87-expanse-water', 'world-r87-expanse-sand',
  'world-r87-expanse-land', 'world-r87-expanse-pines',
];
// 西南列岛区域中心固定投影到扩展舆图的 (70,345) 格。
const isleAtlasCell = { col: 70, row: 345 };
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
    throw new Error(label + ' 与生成器声明不一致；请先移除冲突的 Round 87 文件。');
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
    throw new Error('Round 87 图谱条目与生成器声明不一致；请先移除冲突的 Round 87 条目。');
  }
  const closing = raw.lastIndexOf('\n  ]');
  if (closing < 0 || raw.slice(closing).trim() !== ']\n}') {
    throw new Error('无法保持知识图谱文件原格式追加 ' + field + '。');
  }
  const lines = additions.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, raw.slice(0, closing) + ',\n' + lines + raw.slice(closing));
}

/** Replaces this generator's rows in place, preserving later-round additions;
 * missing managed rows are inserted before `anchorKey`, or appended when no
 * anchor is supplied. This keeps regeneration additive after subsequent rounds. */
function mergeManagedEntries(current, additions, keyOf, anchorKey) {
  const byKey = new Map(additions.map((entry) => [keyOf(entry), entry]));
  const found = new Set();
  const merged = current.map((entry) => {
    const key = keyOf(entry);
    const addition = byKey.get(key);
    if (addition === undefined) return entry;
    found.add(key);
    return addition;
  });
  const missing = additions.filter((entry) => !found.has(keyOf(entry)));
  if (missing.length === 0) return merged;
  const anchor = anchorKey === undefined ? -1 : merged.findIndex((entry) => keyOf(entry) === anchorKey);
  merged.splice(anchor < 0 ? merged.length : anchor, 0, ...missing);
  return merged;
}

const [world, manifest, islesMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.islesMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (islesMap.id !== islesId || islesMap.grid.length !== 100) {
  throw new Error('Round 87 需要 Round 79 的东海群岛百格地图作为离岛关口。');
}

// ---------------------------------------------------------------------------
// 第一部分：把 448×320 舆图确定性地扩展到 512×384，并在新增西南海域上
// 用已登记的 CC0 Puny World 图素绘制列岛地貌；旧矩形逐格保持原样。
// ---------------------------------------------------------------------------
const previous = world.atlasArt;
// 后续轮次（Round 91 起）可能已把舆图扩到更大的画布；只要本生成器管理的
// 四个图层仍完整存在，扩图部分就已完成，重跑保持确定性 no-op。
const atlasReady = previous !== undefined && previous.columns >= overview.columns && previous.rows >= overview.rows &&
  extensionIds.every((id) => previous.layers.some((layer) => layer.id === id));
const activeAtlasColumns = atlasReady ? previous.columns : overview.columns;
const activeAtlasRows = atlasReady ? previous.rows : overview.rows;
// 先解码全部图层——旧密集层保持密集、RLE 层展开——之后生成器统一在密集
// 矩阵上工作，最终写入时再确定性重编码。`previous` 是 `world.atlasArt` 的别名。
if (previous !== undefined) {
  previous.layers = previous.layers.map((layer) => {
    if (layer.cells !== undefined && layer.cellsRle !== undefined) {
      throw new Error(`舆图图层 ${layer.id} 同时声明 cells 与 cellsRle。`);
    }
    const cells = layer.cells !== undefined
      ? layer.cells
      : decodeAtlasCells(layer.cellsRle, previous.rows, previous.columns);
    return { id: layer.id, tilesetId: layer.tilesetId, cells };
  });
}
let extensionCount = null;
if (!atlasReady) {
  if (previous === undefined || previous.columns !== expectedOld.columns || previous.rows !== expectedOld.rows) {
    throw new Error(`预期 Round 86 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 87 图层；请先恢复干净的 Round 86 状态。');
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
      throw new Error(`Round 86 图层 ${layer.id} 的尺寸不是 ${expectedOld.columns}×${expectedOld.rows}。`);
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
    throw new Error('Round 86 舆图缺少预期的程序水面底层。');
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
    { col: 72, row: 348, radiusX: 58, radiusY: 28 },
  ];
  const landShapes = [
    { col: 66, row: 348, radiusX: 22, radiusY: 24, salt: 0x8701 },
    { col: 80, row: 330, radiusX: 8, radiusY: 6, salt: 0x8702 },
    { col: 50, row: 368, radiusX: 10, radiusY: 8, salt: 0x8703 },
    { col: 104, row: 354, radiusX: 6, radiusY: 5, salt: 0x8704 },
    { col: 38, row: 338, radiusX: 5, radiusY: 4, salt: 0x8705 },
  ];
  const isInsideAny = (shapes, col, row) => shapes.some((shape) => {
    const dx = (col - shape.col) / shape.radiusX;
    const dy = (row - shape.row) / shape.radiusY;
    return dx * dx + dy * dy <= 1;
  });
  const newArea = (col, row) => col >= expectedOld.columns || row >= expectedOld.rows;
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 419, 0x45d9f3b) ^ Math.imul(row + 331, 0x119de1f3) ^ salt;
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
      const seed = hash(col, row, 0x8700);
      if (shoreline) {
        newSand[row][col] = 5;
        extensionCount.shore += 1;
      } else {
        newLand[row][col] = grassFrames[seed % grassFrames.length];
        extensionCount.cells += 1;
        if (seed % 100 < 14) {
          newPines[row][col] = pineFrames[hash(col, row, 0x8706) % pineFrames.length];
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
    throw new Error('西南列岛区域中心没有落在新增岛陆上。');
  }

  const addedLayers = [
    { id: 'world-r87-expanse-water', tilesetId: islandTiles.id, cells: newWater },
    { id: 'world-r87-expanse-sand', tilesetId: islandTiles.id, cells: newSand },
    { id: 'world-r87-expanse-land', tilesetId: islandTiles.id, cells: newLand },
    { id: 'world-r87-expanse-pines', tilesetId: islandTiles.id, cells: newPines },
  ];
  const existingIds = new Set(expandedLayers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 87 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }

  // 保持全部既有区域的绝对像素中心不变，仅把百分比基准换到 512×384 画布。
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
    throw new Error('Round 86 旧图层 id 不唯一或扩图时发生丢失。');
  }
  world.atlasArt = atlasArt;
}

// ---------------------------------------------------------------------------
// 第二部分：生成 100×100 西南列岛可玩地图，声明已登记的 Puny World /
// RPG Town / Puny Characters 图集，并验证与东海群岛之间的双向步行关口。
// ---------------------------------------------------------------------------
const punyId = 'opengameart.puny-world';
const townId = 'opengameart.rpg-town';
const actorId = 'opengameart.puny-characters';
const tilesets = [punyId, townId, actorId].map((id) => {
  const declaration = islesMap.art?.tilesets.find((entry) => entry.id === id);
  if (declaration === undefined) throw new Error('缺少已登记素材图集：' + id);
  return declaration;
});
const punyTileset = tilesets.find((entry) => entry.id === punyId);
const townTileset = tilesets.find((entry) => entry.id === townId);
const actorTileset = tilesets.find((entry) => entry.id === actorId);
if (!punyTileset || !townTileset || !actorTileset) throw new Error('西南列岛像素图集配置不完整。');

const start = at(2, 50);
const isleReturn = at(1, 50);
const islesGate = at(5, 31);
const islesArrival = at(6, 31);
const pilotPosition = at(7, 35);
const harbor = at(48, 46);
const keeperPosition = at(49, 48);
const keeperSignalPosition = at(80, 36);
const signal = at(78, 36);
const spring = at(38, 62);
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
addRoad([start, at(17, 50), at(32, 48), harbor]);
addRoad([harbor, at(63, 41), signal]);
addRoad([harbor, at(42, 55), spring]);
addRoad([harbor, at(58, 52), at(58, 58)]);

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
  { id: 'landmark.r87-north-shore', mapResourceId: mapId, ...start, name: '雾航北滩', category: 'crossing' },
  { id: 'landmark.r87-fog-harbor', mapResourceId: mapId, ...harbor, name: '雾泊渔村', category: 'settlement', discoveryNodeId: nodeIds.harbor },
  { id: 'landmark.r87-mist-signal', mapResourceId: mapId, ...signal, name: '雾哨崖', category: 'other', discoveryNodeId: nodeIds.signal },
  { id: 'landmark.r87-spring-hollow', mapResourceId: mapId, ...spring, name: '石涧淡泉', category: 'water', discoveryNodeId: nodeIds.spring },
];
for (const point of [start, isleReturn, harbor, keeperPosition, signal, spring]) reserveAnchor('人物/关口/地标', point, 2);
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

function hashCell(col, row, salt) {
  let value = Math.imul(col + 151, 0x45d9f3b) ^ Math.imul(row + 379, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function onCore(col, row) {
  const dx = (col - 54) / 42;
  const dy = (row - 52) / 38;
  const edge = ((hashCell(col, row, 0x8701) % 1000) / 1000 - 0.5) * 0.06;
  return dx * dx + dy * dy <= 1 + edge;
}
function onNorthSpit(col, row) {
  const dx = (col - 12) / 12;
  const dy = (row - 50) / 8;
  return dx * dx + dy * dy <= 1;
}
function inLagoon(col, row) {
  const dx = (col - 70) / 9;
  const dy = (row - 64) / 7;
  return dx * dx + dy * dy <= 1;
}
function isLand(col, row) {
  if (!inside(col, row)) return false;
  return (onCore(col, row) || onNorthSpit(col, row)) && !inLagoon(col, row);
}
const groves = [
  { col: 34, row: 40, rx: 11, ry: 9, density: 26, salt: 0x8711 },
  { col: 64, row: 56, rx: 10, ry: 8, density: 22, salt: 0x8712 },
  { col: 44, row: 68, rx: 9, ry: 8, density: 20, salt: 0x8713 },
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
    const seed = hashCell(col, row, 0x8702);
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
      trees[row][col] = treeFrames[hashCell(col, row, 0x8703) % treeFrames.length];
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
function reachableFrom(origin, mapGrid, mapColumns, mapRows, label) {
  if (mapGrid[origin.row]?.[origin.col] === undefined || ['#', '~'].includes(mapGrid[origin.row][origin.col])) {
    throw new Error(label + '入口受阻：' + key(origin.col, origin.row));
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
const reachable = reachableFrom(start, grid, columns, rows, '西南列岛');
for (const point of [isleReturn, harbor, keeperPosition, keeperSignalPosition, signal, spring]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('西南列岛锚点不可达：' + key(point.col, point.row));
}
// 雾哨崖是 E 键调查点，目标至少要有一个可通行且从入口可达的正交邻格。
const signalApproachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  reachable.has(key(signal.col + dx, signal.row + dy)),
);
if (!signalApproachable) throw new Error('雾哨崖在调查距离内没有可通行接近格。');
if (landCount < 4_000 || reachable.size < 3_500) {
  throw new Error('西南列岛地形/连通格数量不足：陆地 ' + landCount + '，连通 ' + reachable.size);
}
if (keeperPosition.col === start.col && keeperPosition.row === start.row) {
  throw new Error('西南列岛守望人占住了入岸点。');
}
if (isleReturn.col === start.col && isleReturn.row === start.row) {
  throw new Error('西南列岛回程关口与入岸点重合。');
}

// 东海群岛一侧的关口、抵达点和引水人落点必须可通行且可从出生点抵达。
const islesSolid = new Set(
  Object.entries(islesMap.tileTypes ?? {}).filter(([, type]) => type?.solid).map(([glyph]) => glyph),
);
function islesWalkable(point) {
  const glyph = islesMap.grid[point.row]?.[point.col];
  return glyph !== undefined && !islesSolid.has(glyph);
}
for (const point of [islesGate, islesArrival, pilotPosition]) {
  if (!islesWalkable(point)) {
    throw new Error('东海群岛离岛关口/引水人落点不可通行：' + key(point.col, point.row));
  }
}
const islesStart = islesMap.playerStart;
const islesReachable = reachableFrom(
  { col: islesStart.col, row: islesStart.row },
  islesMap.grid, islesMap.columns, islesMap.rows, '东海群岛',
);
for (const point of [islesGate, islesArrival, pilotPosition]) {
  if (!islesReachable.has(key(point.col, point.row))) {
    throw new Error('东海群岛离岛关口/引水人落点不可从出生点抵达：' + key(point.col, point.row));
  }
}
const islesOccupied = new Set([
  key(islesStart.col, islesStart.row),
  ...(world.events ?? []).filter((entry) => entry.mapResourceId === islesId).map((entry) => key(entry.col, entry.row)),
  ...(world.landmarks ?? []).filter((entry) => entry.mapResourceId === islesId).map((entry) => key(entry.col, entry.row)),
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r87-')).flatMap((entry) => [
    entry.from.mapResourceId === islesId ? key(entry.from.col, entry.from.row) : null,
    entry.to.mapResourceId === islesId ? key(entry.to.col, entry.to.row) : null,
  ]).filter(Boolean),
]);
for (const point of [islesGate, islesArrival, pilotPosition]) {
  if (islesOccupied.has(key(point.col, point.row))) {
    throw new Error('东海群岛新锚点与既有玩法锚点重叠：' + key(point.col, point.row));
  }
}
if (pilotPosition.col === islesGate.col && pilotPosition.row === islesGate.row) {
  throw new Error('引水人占住了离岛关口。');
}

const harborDetails = blank();
const harborPlacements = [
  { col: 47, row: 42, gid: 182 },
  { col: 48, row: 42, gid: 183 },
  { col: 49, row: 42, gid: 184 },
  { col: 47, row: 43, gid: 185 },
  { col: 48, row: 43, gid: 186 },
  { col: 50, row: 43, gid: 108 },
];
for (const item of harborPlacements) {
  if (!inside(item.col, item.row) || !isLand(item.col, item.row)) {
    throw new Error('雾泊渔村装饰越界或压在海水上：' + key(item.col, item.row));
  }
  if (item.gid < 1 || item.gid > townTileset.tileCount) {
    throw new Error('雾泊渔村装饰帧未经核验：' + item.gid);
  }
  if (anchors.has(key(item.col, item.row))) {
    throw new Error('雾泊渔村装饰覆盖玩法锚点：' + key(item.col, item.row));
  }
  if (trees[item.row][item.col] !== 0) {
    throw new Error('雾泊渔村装饰与松树冲突：' + key(item.col, item.row));
  }
  harborDetails[item.row][item.col] = item.gid;
}
const mapData = {
  id: mapId,
  name: '西南列岛·雾航湾',
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
    actors: { ...islesMap.art.actors },
    layers: [
      { id: 'r87-sea', tilesetId: punyId, cells: sea },
      { id: 'r87-island-ground', tilesetId: punyId, cells: ground },
      { id: 'r87-fog-harbor', tilesetId: townId, cells: harborDetails },
      { id: 'r87-pine-groves', tilesetId: punyId, depthSort: 'y', cells: trees },
    ],
  },
};
const npcs = {
  npcs: [{
    id: npcIds.pilot,
    name: '孟海洲',
    mapResourceId: islesId,
    position: pilotPosition,
    dialogueId: 'dlg.r87-meng-haizhou-pilot',
    questGiver: true,
    spriteFrame: 144,
    spriteFrames: { down: 128, right: 136, up: 144, left: 152 },
  }, {
    id: npcIds.keeper,
    name: '敖晚晴',
    mapResourceId: mapId,
    position: keeperPosition,
    dialogueId: 'dlg.r87-ao-wanqing-signal',
    spriteFrame: 112,
    spriteFrames: { down: 96, right: 104, up: 112, left: 120 },
    schedule: [
      { periodId: 'period.midnight', position: { col: 49, row: 50 } },
      { periodId: 'period.dawn', position: { col: 80, row: 36 } },
      { periodId: 'period.morning', position: { col: 80, row: 36 } },
      { periodId: 'period.midday', position: { col: 50, row: 48 } },
      { periodId: 'period.afternoon', position: { col: 51, row: 48 } },
      { periodId: 'period.dusk', position: { col: 80, row: 36 } },
      { periodId: 'period.night', position: { col: 49, row: 49 } },
    ],
  }],
};
for (const npc of npcs.npcs) {
  const maxFrame = Math.max(npc.spriteFrame, ...Object.values(npc.spriteFrames));
  if (maxFrame > actorTileset.tileCount) {
    throw new Error('人物帧超出 Puny Characters 图集容量：' + npc.id);
  }
}
const quests = {
  quests: [{
    id: questId,
    name: '雾航引水',
    description: '孟海洲托你航向西南雾海，登上雾航湾，在轻雾日拂晓或晨光时与守烽人一同核准雾哨崖的引水信号，再把新航路的雾信带回落潮湾。',
    giverNpcId: npcIds.pilot,
    objectives: [{
      id: 'objective.r87-land-on-southwest-isles',
      kind: 'discoverKnowledge',
      targetId: nodeIds.isle,
      requiredCount: 1,
      text: '渡雾登临西南列岛',
    }, {
      id: 'objective.r87-light-mist-signal',
      kind: 'discoverKnowledge',
      targetId: nodeIds.signal,
      requiredCount: 1,
      text: '轻雾日拂晓或晨光时，敖晚晴守烽在旁；与她相邻并调查雾哨崖引水烽',
    }, {
      id: 'objective.r87-return-fog-pilot-ledger',
      kind: 'talkToNpc',
      targetId: npcIds.pilot,
      requiredCount: 1,
      text: '回落潮湾向孟海洲交回雾信',
    }],
    rewards: {
      experience: 36,
      currency: 28,
      discoverKnowledgeNodeIds: [nodeIds.spring],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r87-meng-haizhou-pilot',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '孟海洲把一张边角磨毛的雾图摊在石上，指尖点着西南角一片空白：「老辈引水人说落潮湾外还有一串岛，雾起时才见影子。官图不认它，渔家的命认。我想请人替我航一趟，把雾航湾的烽信验回来。」',
        options: [
          {
            text: '这趟雾航我接了。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '雾信已经验回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          {
            text: '我还在核那道烽信。',
            nextNodeId: 'active',
            conditions: [{ kind: 'questStatus', questId, status: 'active' }],
          },
          { text: '雾航湾怎么走？', nextNodeId: 'route' },
          { text: '为何要验烽信？', nextNodeId: 'signal' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「从西礁外趁平潮下桨，认准雾头三道白浪。湾北是一片黑沙滩，滩后渔村，村东坡顶立着雾哨崖。记住，要等轻雾日的拂晓或晨光，找敖晚晴守烽；与她相邻时从崖侧按 E 调查，把三刻烽信记全，缺一刻都算不准。」' },
      { id: 'active', text: '「先登雾航湾北滩，再等轻雾日拂晓或晨光，敖晚晴守烽时与她相邻，从崖侧按 E 记下烽信；最后回落潮湾交给我。雾里别贪快，宁可慢半炷香。」' },
      { id: 'completed', text: '孟海洲对着你记回的雾信核了半晌，忽然笑出声：「三刻烽信，西汊可通——这片雾海三十年没换过图，往后渔队夜航能少折两条船。」' },
      { id: 'route', text: '「西南四十里雾海，岛影成串。北滩水缓可以泊船，滩后有人家；东崖高百丈，是天然的烽台。守望人姓敖，报我的名字，她会借你灯。她每天拂晓和晨光守崖，但只有轻雾日才开引水信号给人核验。」' },
      { id: 'signal', text: '「烽信是雾里的钟。雾浓时看不见岛，只看得见崖上的火。火号准，船就活得下来——我这双眼睛老了，验不动了，才要求人。」' },
      { id: 'farewell', text: '孟海洲重新把雾图折好塞回油布袋，望着西南方向的雾线出神。' },
    ],
  }, {
    id: 'dlg.r87-ao-wanqing-signal',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '雾哨崖顶的烽台边，守望人敖晚晴放下手里的铜灯罩：「若为核对引水烽信，得等轻雾日的拂晓或晨光；靠近些，我再把灯号规矩说给你。」',
        options: [
          { text: '烽信号怎么记？', nextNodeId: 'signal' },
          { text: '你怎么守在这崖上？', nextNodeId: 'keeper' },
          { text: '打扰了。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'signal', text: '「我每天拂晓、晨光都来守烽，可只有轻雾压海时才核引水号。雾起三刻点一次，雾散即止；灯罩开三分是缓行，开满是禁航，连闪三下是换汊。轻雾日与我相邻，在崖侧按 E 调查，才算把这三样记全。」' },
      { id: 'keeper', text: '「敖家守雾三代。祖父说，雾不是墙，是帘子——帘子后头的路，得有人一年一年用灯去量。我量了十七年，还差着祖父的火候。」' },
      { id: 'farewell', text: '敖晚晴重新拾起铜灯罩，往烽台内侧走去，雾气在她身后合拢。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '西南列岛·雾航湾',
  description: '雾航湾藏在西南雾海，北滩锚地、雾泊渔村与雾哨崖连成一线雾中航路。',
  atlasPosition: {
    x: Number(((isleAtlasCell.col / (activeAtlasColumns - 1)) * 100).toFixed(8)),
    y: Number(((isleAtlasCell.row / (activeAtlasRows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r87-isles-to-southwest',
    name: '西南雾航',
    from: { mapResourceId: islesId, ...islesGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r87-southwest-to-isles',
    name: '东北归帆',
    from: { mapResourceId: mapId, ...isleReturn },
    to: { mapResourceId: islesId, ...islesArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '雾在船头裂开一道缝，黑沙滩铺在湾北的水线上，坡顶隐约一点烽火的红——雾航湾到了。',
    approachText: '西南雾深处透出一线滩影，涛声闷在雾里。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.isle,
  },
  {
    id: nodeIds.harborEvent,
    mapResourceId: mapId,
    ...harbor,
    text: '雾泊渔村的矮屋沿海坡排开，檐下挂着成串的雾灯，村口的石阶被几代人的脚底磨得发亮。',
    approachText: '雾里亮起一串暖黄的灯，风带着鱼汤的咸味。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.harbor,
  },
  {
    id: nodeIds.signalEvent,
    mapResourceId: mapId,
    ...signal,
    text: '雾哨崖的烽台立在崖顶，铜灯罩映着海光，崖下雾海翻涌如潮——三刻烽信号就从这里传向落潮湾。',
    approachText: '东坡的崖顶有火光明灭。敖晚晴说，只有轻雾日拂晓或晨光时，守烽人才会在灯台旁核对引水火号。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.signal,
    conditions: {
      periodIds: ['period.dawn', 'period.morning'],
      weatherIds: ['weather.mist'],
      nearbyNpcIds: [npcIds.keeper],
    },
    interaction: {
      prompt: '勘明雾哨崖的引水烽信',
      range: 1,
      approachDirections: ['left', 'down'],
    },
  },
  {
    id: nodeIds.springEvent,
    mapResourceId: mapId,
    ...spring,
    text: '石缝间围出一洼清泉，渗水在苔衣上划出暗色的线——雾航湾虽四面是海，淡水却藏在这道石涧里。',
    approachText: '松林深处有水声，雾在此处格外清凉。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.spring,
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '西南列岛探索地图', summary: '从落潮湾西南雾海可登的列岛百格地图。', knownByDefault: false },
  { id: nodeIds.isle, kind: 'place', title: '西南列岛·雾航湾', summary: '西南雾海中的步行列岛，北滩黑沙连着渔村与雾哨崖。', knownByDefault: false },
  { id: nodeIds.harbor, kind: 'place', title: '雾泊渔村', summary: '雾航湾北坡的渔村，檐下常年挂着雾灯。', knownByDefault: false },
  { id: nodeIds.signal, kind: 'place', title: '雾哨崖', summary: '岛东崖顶的烽台，三刻烽信号由此传向落潮湾。', knownByDefault: false },
  { id: nodeIds.spring, kind: 'place', title: '石涧淡泉', summary: '岛西石缝间的淡水泉，列岛取水的旧地。', knownByDefault: false },
  { id: nodeIds.pilot, kind: 'character', title: '孟海洲', summary: '驻在落潮湾西礁的老引水人，想验回雾航湾的烽信。', knownByDefault: false },
  { id: nodeIds.keeper, kind: 'character', title: '敖晚晴', summary: '雾哨崖上的第三代守望人，量了十七年雾路。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '雾航引水', summary: '登上雾航湾勘明雾哨崖烽信，把新航路雾信带回落潮湾。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初入雾航', summary: '渡过西南雾海首次踏上雾航湾北滩。', knownByDefault: false },
  { id: nodeIds.harborEvent, kind: 'event', title: '渔村雾灯', summary: '在雾泊渔村檐下看清成串的雾灯。', knownByDefault: false },
  { id: nodeIds.signalEvent, kind: 'event', title: '崖顶烽信', summary: '在雾哨崖勘明三刻烽信号的规矩。', knownByDefault: false },
  { id: nodeIds.springEvent, kind: 'event', title: '石涧得泉', summary: '在岛西石缝间寻得列岛的淡水泉。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r87-arrival-isle', fromId: nodeIds.arrival, toId: nodeIds.isle, relation: 'triggers', summary: '初入北滩时发现西南列岛。' },
  { id: 'kg.edge.r87-isle-map', fromId: nodeIds.isle, toId: mapId, relation: 'locatedAt', summary: '西南列岛由百格探索地图承载。' },
  { id: 'kg.edge.r87-harbor-event', fromId: nodeIds.harborEvent, toId: nodeIds.harbor, relation: 'triggers', summary: '探访渔村后得知雾泊渔村的来历。' },
  { id: 'kg.edge.r87-signal-event', fromId: nodeIds.signalEvent, toId: nodeIds.signal, relation: 'triggers', summary: '勘明烽信后认清雾哨崖的方位。' },
  { id: 'kg.edge.r87-spring-event', fromId: nodeIds.springEvent, toId: nodeIds.spring, relation: 'triggers', summary: '寻得石缝清泉后发现石涧淡泉。' },
  { id: 'kg.edge.r87-pilot-location', fromId: nodeIds.pilot, toId: islesId, relation: 'locatedAt', summary: '孟海洲在落潮湾西礁守着雾图。' },
  { id: 'kg.edge.r87-keeper-location', fromId: nodeIds.keeper, toId: mapId, relation: 'locatedAt', summary: '敖晚晴在雾航湾雾哨崖守烽。' },
  { id: 'kg.edge.r87-pilot-quest', fromId: nodeIds.pilot, toId: nodeIds.quest, relation: 'participatesIn', summary: '孟海洲委托玩家勘明雾航烽信。' },
  { id: 'kg.edge.r87-quest-signal', fromId: nodeIds.quest, toId: nodeIds.signal, relation: 'requires', summary: '雾航引水需要玩家调查雾哨崖烽台。' },
  { id: 'kg.edge.r87-quest-spring', fromId: nodeIds.quest, toId: nodeIds.spring, relation: 'rewards', summary: '完成雾航引水后得知石涧淡泉的方位。' },
];
const resourceEntries = [
  { id: 'map.round-87-southwest-isles', path: 'maps/round-87-southwest-isles.json', schema: 'grid-map' },
  { id: 'npc.round-87-southwest-isles-set', path: 'characters/round-87-southwest-isles-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-87-southwest-isle-set', path: 'dialogues/round-87-southwest-isle-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-87-southwest-isle-set', path: 'quests/round-87-southwest-isle-quests.json', schema: 'quest-set' },
];

world.regions = mergeManagedEntries(world.regions ?? [], [region], (entry) => entry.mapResourceId);
world.landmarks = mergeManagedEntries(world.landmarks ?? [], landmarks, (entry) => entry.id);
world.transitions = mergeManagedEntries(world.transitions ?? [], transitions, (entry) => entry.id);
world.events = mergeManagedEntries(world.events ?? [], events, (entry) => entry.id);
if (!(manifest.resources ?? []).some((entry) => entry.id === 'world.atlas')) {
  throw new Error('manifest 缺少 world.atlas，拒绝孤立新增区域。');
}
manifest.resources = mergeManagedEntries(
  manifest.resources ?? [], resourceEntries, (entry) => entry.id, 'world.atlas',
);

// 全部舆图图层以紧凑行 RLE 线格式落盘；区域、地标、关口、事件及其余
// 舆图字段保持不变。
world.atlasArt.layers = world.atlasArt.layers.map((layer) => ({
  id: layer.id,
  tilesetId: layer.tilesetId,
  cellsRle: encodeAtlasCells(layer.cells),
}));

await Promise.all([
  writeNewJson(paths.map, mapData, '西南列岛地图'),
  writeNewJson(paths.npcs, npcs, '西南列岛人物'),
  writeNewJson(paths.dialogues, dialogues, '西南列岛对白'),
  writeNewJson(paths.quests, quests, '西南列岛任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Round 87 atlas extension is already present in the ${activeAtlasColumns}×${activeAtlasRows} atlas; deterministic generation is a no-op.`);
} else {
  console.log(`Generated ${overview.columns}×${overview.rows} atlas (${world.atlasArt.layers.length} layers; ${world.regions.length} regions retained).`);
  console.log(`Round 87 CC0 extension: ${extensionCount.cells} grass, ${extensionCount.shore} shore, ${extensionCount.trees} pines, ${extensionCount.water} sea cells.`);
}
console.log(
  'Generated ' + mapData.name + ': ' + landCount + ' island land cells, ' +
  reachable.size + ' entrance-reachable walkable cells, ' + treeCount + ' pine tiles, ' +
  shoreCount + ' shore cells; two-way isles gates and ' + landmarks.length + ' landmarks.',
);
