import { deepenPeopleDialogues } from './lib/round105-people-content.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { deepenSeaQuests, deepenSeaDialogues } from './lib/round102-sea-content.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  windwardMap: resolve(base, 'maps/round-84-windward-isle.json'),
  map: resolve(base, 'maps/round-85-tide-isle.json'),
  npcs: resolve(base, 'characters/round-85-tide-isle-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-85-tide-isle-conversations.json'),
  quests: resolve(base, 'quests/round-85-tide-isle-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-85-tide-isle';
const windwardId = 'map.round-84-windward-isle';
const npcIds = {
  surveyor: 'char.r85-xie-zhaoting',
  keeper: 'char.r85-cen-yinjiao',
};
const questId = 'quest.r85-low-tide-channel';
const nodeIds = {
  isle: 'place.r85-tide-isle',
  reef: 'place.r85-reef-channel',
  camp: 'place.r85-camp',
  pool: 'place.r85-tide-pool',
  surveyor: npcIds.surveyor,
  keeper: npcIds.keeper,
  quest: questId,
  arrival: 'event.r85-arrival',
  reefEvent: 'event.r85-reef-channel',
  campEvent: 'event.r85-camp-hearth',
  poolEvent: 'event.r85-tide-pool',
};
const overview = { columns: 448, rows: 320, tileSize: 16 };
const expectedOld = { columns: 384, rows: 256 };
const extensionIds = [
  'world-r85-expanse-water', 'world-r85-expanse-sand',
  'world-r85-expanse-land', 'world-r85-expanse-pines',
];
// Tide Isle region center is pinned to atlas cell (405,280) on the 448×320 canvas.
const isleAtlasCell = { col: 405, row: 280 };
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
    throw new Error(label + ' 与生成器声明不一致；请先移除冲突的 Round 85 文件。');
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
    throw new Error('Round 85 图谱条目与生成器声明不一致；请先移除冲突的 Round 85 条目。');
  }
  const closing = raw.lastIndexOf('\n  ]');
  if (closing < 0 || raw.slice(closing).trim() !== ']\n}') {
    throw new Error('无法保持知识图谱文件原格式追加 ' + field + '。');
  }
  const lines = additions.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, raw.slice(0, closing) + ',\n' + lines + raw.slice(closing));
}

const [world, manifest, windwardMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.windwardMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (windwardMap.id !== windwardId || windwardMap.grid.length !== 100) {
  throw new Error('Round 85 需要 Round 84 的风回岛百格地图作为离岛关口。');
}

// ---------------------------------------------------------------------------
// Part 1: deterministically expand the 384×256 atlas to 448×320 and paint the
// southern Tide Isle landmass with registered CC0 Puny World frames. Every
// cell of the previous twenty layers inside the old rectangle stays identical.
// ---------------------------------------------------------------------------
const previous = world.atlasArt;
const atlasReady = previous?.columns === overview.columns && previous?.rows === overview.rows &&
  extensionIds.every((id) => previous.layers.some((layer) => layer.id === id));
// Decode every layer once — legacy dense stays dense, compact RLE expands —
// so the generator below always operates on dense matrices and the final
// write re-encodes deterministically. `previous` aliases `world.atlasArt`.
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
    throw new Error(`预期 Round 84 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 85 图层；请先恢复干净的 Round 84 状态。');
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
      throw new Error(`Round 84 图层 ${layer.id} 的尺寸不是 ${expectedOld.columns}×${expectedOld.rows}。`);
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
    throw new Error('Round 84 舆图缺少预期的程序水面底层。');
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
    { col: 405, row: 278, radiusX: 44, radiusY: 40 },
  ];
  const landShapes = [
    { col: 406, row: 280, radiusX: 23, radiusY: 29, salt: 0x8501 },
    { col: 417, row: 262, radiusX: 6, radiusY: 5, salt: 0x8502 },
    { col: 391, row: 297, radiusX: 8, radiusY: 6, salt: 0x8503 },
  ];
  const isInsideAny = (shapes, col, row) => shapes.some((shape) => {
    const dx = (col - shape.col) / shape.radiusX;
    const dy = (row - shape.row) / shape.radiusY;
    return dx * dx + dy * dy <= 1;
  });
  const newArea = (col, row) => col >= expectedOld.columns || row >= expectedOld.rows;
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 383, 0x45d9f3b) ^ Math.imul(row + 277, 0x119de1f3) ^ salt;
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
      const seed = hash(col, row, 0x8500);
      if (shoreline) {
        newSand[row][col] = 5;
        extensionCount.shore += 1;
      } else {
        newLand[row][col] = grassFrames[seed % grassFrames.length];
        extensionCount.cells += 1;
        if (seed % 100 < 14) {
          newPines[row][col] = pineFrames[hash(col, row, 0x8506) % pineFrames.length];
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
    throw new Error('潮生屿区域中心没有落在新增岛陆上。');
  }

  const addedLayers = [
    { id: 'world-r85-expanse-water', tilesetId: islandTiles.id, cells: newWater },
    { id: 'world-r85-expanse-sand', tilesetId: islandTiles.id, cells: newSand },
    { id: 'world-r85-expanse-land', tilesetId: islandTiles.id, cells: newLand },
    { id: 'world-r85-expanse-pines', tilesetId: islandTiles.id, cells: newPines },
  ];
  const existingIds = new Set(expandedLayers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 85 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }

  // Keep every existing region's absolute pixel center; only rebased percentages
  // move onto the 448×320 canvas so the old atlas projections never drift.
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
    throw new Error('Round 84 旧图层 id 不唯一或扩图时发生丢失。');
  }
  world.atlasArt = atlasArt;
}

// ---------------------------------------------------------------------------
// Part 2: generate the 100×100 Tide Isle map from the same registered Puny
// World / RPG Town / Puny Characters atlases and verify both windward gates
// with breadth-first reachability checks.
// ---------------------------------------------------------------------------
const punyId = 'opengameart.puny-world';
const townId = 'opengameart.rpg-town';
const actorId = 'opengameart.puny-characters';
const tilesets = [punyId, townId, actorId].map((id) => {
  const declaration = windwardMap.art?.tilesets.find((entry) => entry.id === id);
  if (declaration === undefined) throw new Error('缺少已登记素材图集：' + id);
  return declaration;
});
const punyTileset = tilesets.find((entry) => entry.id === punyId);
const townTileset = tilesets.find((entry) => entry.id === townId);
const actorTileset = tilesets.find((entry) => entry.id === actorId);
if (!punyTileset || !townTileset || !actorTileset) throw new Error('潮生屿像素图集配置不完整。');

const start = at(2, 50);
const isleReturn = at(1, 50);
const windwardGate = at(97, 50);
const windwardArrival = at(96, 50);
const surveyorPosition = at(48, 50);
const keeperPosition = at(37, 55);
const reef = at(26, 56);
const camp = at(36, 54);
const pool = at(46, 66);
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
addRoad([start, at(17, 50), at(28, 52), camp]);
addRoad([camp, reef]);
addRoad([camp, at(44, 60), pool]);

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
  { id: 'landmark.r85-west-shore', mapResourceId: mapId, ...start, name: '潮生西滩', category: 'crossing' },
  { id: 'landmark.r85-reef-channel', mapResourceId: mapId, ...reef, name: '低潮礁道', category: 'route', discoveryNodeId: nodeIds.reef },
  { id: 'landmark.r85-reef-keeper-camp', mapResourceId: mapId, ...camp, name: '隐礁营地', category: 'settlement', discoveryNodeId: nodeIds.camp },
  { id: 'landmark.r85-tide-pool', mapResourceId: mapId, ...pool, name: '退潮石窝', category: 'water', discoveryNodeId: nodeIds.pool },
];
for (const point of [start, isleReturn, keeperPosition, reef, camp, pool]) reserveAnchor('人物/关口/地标', point, 2);
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

function hashCell(col, row, salt) {
  let value = Math.imul(col + 233, 0x45d9f3b) ^ Math.imul(row + 409, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function onCore(col, row) {
  const dx = (col - 55) / 36;
  const dy = (row - 50) / 38;
  const edge = ((hashCell(col, row, 0x8501) % 1000) / 1000 - 0.5) * 0.06;
  return dx * dx + dy * dy <= 1 + edge;
}
function onWestSpit(col, row) {
  const dx = (col - 12) / 12;
  const dy = (row - 50) / 8;
  return dx * dx + dy * dy <= 1;
}
function inLagoon(col, row) {
  const dx = (col - 70) / 9;
  const dy = (row - 62) / 7;
  return dx * dx + dy * dy <= 1;
}
function isLand(col, row) {
  if (!inside(col, row)) return false;
  return (onCore(col, row) || onWestSpit(col, row)) && !inLagoon(col, row);
}
const groves = [
  { col: 60, row: 34, rx: 12, ry: 9, density: 26, salt: 0x8511 },
  { col: 48, row: 64, rx: 10, ry: 8, density: 22, salt: 0x8512 },
  { col: 74, row: 48, rx: 9, ry: 7, density: 20, salt: 0x8513 },
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
    const seed = hashCell(col, row, 0x8502);
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
      trees[row][col] = treeFrames[hashCell(col, row, 0x8503) % treeFrames.length];
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
const reachable = reachableFrom(start, grid, columns, rows, '潮生屿');
for (const point of [isleReturn, keeperPosition, reef, camp, pool]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('潮生屿锚点不可达：' + key(point.col, point.row));
}
// The reef event is an E-key inspection, so at least one orthogonal neighbour
// of the target must be walkable and entrance-reachable for the prompt to fire.
const reefApproachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  reachable.has(key(reef.col + dx, reef.row + dy)),
);
if (!reefApproachable) throw new Error('低潮礁道在调查距离内没有可通行接近格。');
if (landCount < 4_000 || reachable.size < 3_500) {
  throw new Error('潮生屿地形/连通格数量不足：陆地 ' + landCount + '，连通 ' + reachable.size);
}
if (keeperPosition.col === start.col && keeperPosition.row === start.row) {
  throw new Error('潮生屿守礁人占住了入岸点。');
}
if (isleReturn.col === start.col && isleReturn.row === start.row) {
  throw new Error('潮生屿回程关口与入岸点重合。');
}

// Both Windward Isle endpoints must stay walkable and reachable from its own
// player start before the cross-isle gates may be declared.
const windwardGrid = windwardMap.grid;
const windwardStart = windwardMap.playerStart;
for (const point of [windwardGate, windwardArrival, surveyorPosition]) {
  const glyph = windwardGrid[point.row]?.[point.col];
  if (glyph === undefined || ['#', '~'].includes(glyph)) {
    throw new Error('风回岛离岛关口/测潮师落点不可通行：' + key(point.col, point.row));
  }
}
const windwardReachable = reachableFrom(
  { col: windwardStart.col, row: windwardStart.row },
  windwardGrid, windwardMap.columns, windwardMap.rows, '风回岛',
);
for (const point of [windwardGate, windwardArrival, surveyorPosition]) {
  if (!windwardReachable.has(key(point.col, point.row))) {
    throw new Error('风回岛离岛关口/测潮师落点不可从出生点抵达：' + key(point.col, point.row));
  }
}
const windwardOccupied = new Set([
  key(windwardStart.col, windwardStart.row),
  ...(world.events ?? []).filter((entry) => entry.mapResourceId === windwardId).map((entry) => key(entry.col, entry.row)),
  ...(world.landmarks ?? []).filter((entry) => entry.mapResourceId === windwardId).map((entry) => key(entry.col, entry.row)),
  ...(world.transitions ?? []).flatMap((entry) => [
    entry.from.mapResourceId === windwardId ? key(entry.from.col, entry.from.row) : null,
    entry.to.mapResourceId === windwardId ? key(entry.to.col, entry.to.row) : null,
  ]).filter(Boolean),
]);
if (windwardOccupied.has(key(surveyorPosition.col, surveyorPosition.row))) {
  throw new Error('风回岛测潮师落点与既有玩法锚点重叠：' + key(surveyorPosition.col, surveyorPosition.row));
}

const campDetails = blank();
const campPlacements = [
  { col: 32, row: 52, gid: 182 },
  { col: 33, row: 52, gid: 183 },
  { col: 32, row: 53, gid: 185 },
  { col: 33, row: 53, gid: 186 },
  { col: 34, row: 51, gid: 108 },
];
for (const item of campPlacements) {
  if (!inside(item.col, item.row) || !isLand(item.col, item.row)) {
    throw new Error('隐礁营地装饰越界或压在海水上：' + key(item.col, item.row));
  }
  if (item.gid < 1 || item.gid > townTileset.tileCount) {
    throw new Error('隐礁营地装饰帧未经核验：' + item.gid);
  }
  if (anchors.has(key(item.col, item.row))) {
    throw new Error('隐礁营地装饰覆盖玩法锚点：' + key(item.col, item.row));
  }
  if (trees[item.row][item.col] !== 0) {
    throw new Error('隐礁营地装饰与松树冲突：' + key(item.col, item.row));
  }
  campDetails[item.row][item.col] = item.gid;
}
const mapData = {
  id: mapId,
  name: '南溟·潮生屿',
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
    actors: { ...windwardMap.art.actors },
    layers: [
      { id: 'r85-sea', tilesetId: punyId, cells: sea },
      { id: 'r85-island-ground', tilesetId: punyId, cells: ground },
      { id: 'r85-reef-keeper-camp', tilesetId: townId, cells: campDetails },
      { id: 'r85-pine-groves', tilesetId: punyId, depthSort: 'y', cells: trees },
    ],
  },
};
const npcs = {
  npcs: [{
    id: npcIds.surveyor,
    name: '谢照汀',
    mapResourceId: windwardId,
    position: surveyorPosition,
    dialogueId: 'dlg.r85-xie-zhaoting-channel',
    questGiver: true,
    spriteFrame: 208,
    spriteFrames: { down: 192, right: 200, up: 208, left: 216 },
  }, {
    id: npcIds.keeper,
    name: '岑隐礁',
    mapResourceId: mapId,
    position: keeperPosition,
    dialogueId: 'dlg.r85-cen-yinjiao-reef',
    spriteFrame: 240,
    spriteFrames: { down: 224, right: 232, up: 240, left: 248 },
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
    name: '低潮礁道',
    description: '谢照汀托你渡往南溟潮生屿，趁低潮勘出礁道水则的刻度，把外海潮信记回风回岛。',
    giverNpcId: npcIds.surveyor,
    objectives: [{
      id: 'objective.r85-land-on-tide-isle',
      kind: 'discoverKnowledge',
      targetId: nodeIds.isle,
      requiredCount: 1,
      text: '渡水登临潮生屿',
    }, {
      id: 'objective.r85-survey-low-tide-channel',
      kind: 'discoverKnowledge',
      targetId: nodeIds.reef,
      requiredCount: 1,
      text: '趁低潮勘测礁道水则',
    }, {
      id: 'objective.r85-return-water-level-record',
      kind: 'talkToNpc',
      targetId: npcIds.surveyor,
      requiredCount: 1,
      text: '回风回岛向谢照汀交回水则',
    }],
    rewards: {
      experience: 38,
      currency: 30,
      discoverKnowledgeNodeIds: [nodeIds.pool],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r85-xie-zhaoting-channel',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '谢照汀蹲在西滩的旧水则碑前，指尖敲着碑上深浅不一的刻痕：「潮信一年比一年野。青帆埠的水则测不到外海，我想请人渡去南边的潮生屿，趁低潮把礁道上的刻度记回来。」',
        options: [
          {
            text: '我接下水则这趟差。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '礁道刻度已经拓回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          {
            text: '我还要回去核对潮位记录。',
            nextNodeId: 'active',
            conditions: [{ kind: 'questStatus', questId, status: 'active' }],
          },
          { text: '低潮要怎么等？', nextNodeId: 'tides' },
          { text: '潮生屿上有什么？', nextNodeId: 'isle' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「涨潮淹礁，低潮见道。你在岛上守着水则碑等潮退——礁面滑、返潮急，日头落了就别贪。」' },
      { id: 'active', text: '「先在潮生屿低潮时拓下礁道水则，再回风回岛交给我。一路留心返潮，别困在礁盘上。」' },
      { id: 'completed', text: '谢照汀接过你拓下的刻度，对着日光照了半晌：「南汊的潮差比旧年大了将近一尺。多亏这份水则，秋汛之前渔队总算能改线了。」' },
      { id: 'tides', text: '「潮生屿外是一道礁盘，涨潮时只露尖顶，低潮时才连成路。礁脊上立着岑家的水则碑，一道刻痕记一年潮位，比官府的历书还准。」' },
      { id: 'isle', text: '「从西滩下水往南，半日水程。岛西有淡水洼，营地扎在松林边上——守礁人认生，报我谢照汀的名字就好。」' },
      { id: 'farewell', text: '谢照汀把水则碑上的浮沙拂净，继续核对下一列刻痕。' },
    ],
  }, {
    id: 'dlg.r85-cen-yinjiao-reef',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '松林边的营地升起一缕细烟，守礁人岑隐礁放下手中的藤索：「又是来勘礁道的？潮还高着，礁尖都淹在水里。等潮退了，我引你上道。」',
        options: [
          { text: '礁道什么时候能走？', nextNodeId: 'reefwait' },
          { text: '你为什么守在这座岛上？', nextNodeId: 'keeper' },
          { text: '打扰了。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'reefwait', text: '「礁道只在低潮露出两炷香的工夫。水则碑立在南脊，刻度要趁礁面还湿着拓，干了字口就糊了。」' },
      { id: 'keeper', text: '「岑家守了三代礁。潮涨时数浪头，潮退时记水位——这块碑上每一道刻痕，都是一条被潮水记住的命。」' },
      { id: 'farewell', text: '岑隐礁重新拾起藤索，目光越过礁盘投向远处的浪线。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '南溟·潮生屿',
  description: '潮生屿卧在南溟潮头，西滩沙脊、隐礁营地与低潮方显的礁道连成一线潮路。',
  atlasPosition: {
    x: Number(((isleAtlasCell.col / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number(((isleAtlasCell.row / (overview.rows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r85-windward-isle-to-tide-isle',
    name: '南渡潮生',
    from: { mapResourceId: windwardId, ...windwardGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r85-tide-isle-to-windward-isle',
    name: '北望归潮',
    from: { mapResourceId: mapId, ...isleReturn },
    to: { mapResourceId: windwardId, ...windwardArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '潮生屿在潮光里显出层层叠叠的礁脊，松林深处升起一缕炊烟，滩上水线层层退去又涨回。',
    approachText: '南面浪线后浮出一线低平的岛影，潮声在礁盘上碎成白沫。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.isle,
    arrivalTransitionIds: ['gate.r85-windward-isle-to-tide-isle', 'gate.r94-south-to-tide', 'gate.r97-lanxin-to-tide'],
  },
  {
    id: nodeIds.reefEvent,
    mapResourceId: mapId,
    ...reef,
    text: '低潮让礁道整脊露出水面，湿漉漉的石面上立着一方水则碑，百年潮位的刻痕层层叠叠没入石身。',
    approachText: '礁盘的水位正在退去，石脊一线一线露出水面。',
    once: true,
    conditions: { tideIds: ['tide.low'] },
    discoverKnowledgeNodeId: nodeIds.reef,
    interaction: {
      prompt: '趁低潮勘测礁道水则',
      range: 1,
    },
  },
  {
    id: nodeIds.campEvent,
    mapResourceId: mapId,
    ...camp,
    text: '松林边的小营地扎得极稳，藤索与油布下码着拓碑用的绵纸，守礁人常年在礁脊间往返。',
    approachText: '松林方向飘来一缕细烟，隐约有整备绳索的声响。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.camp,
  },
  {
    id: nodeIds.poolEvent,
    mapResourceId: mapId,
    ...pool,
    text: '礁盘内侧围出一汪静水，潮退后留在石窝里的小鱼小蟹清晰可见，是一处天然的潮池。',
    approachText: '退潮的石窝里留着半汪海水，日头下泛着碎光。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.pool,
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '潮生屿探索地图', summary: '从风回岛南渡可登的南溟岛屿百格地图。', knownByDefault: false },
  { id: nodeIds.isle, kind: 'place', title: '南溟·潮生屿', summary: '南溟潮头上的步行岛屿，低潮时礁盘连成水道。', knownByDefault: false },
  { id: nodeIds.reef, kind: 'place', title: '低潮礁道', summary: '只在低潮露出的礁脊水道，立着岑家百年的水则碑。', knownByDefault: false },
  { id: nodeIds.camp, kind: 'place', title: '隐礁营地', summary: '潮生屿松林边的守礁人营地，常年整备拓碑工具。', knownByDefault: false },
  { id: nodeIds.pool, kind: 'place', title: '退潮石窝', summary: '礁盘内侧的天然潮池，退潮后留汪静水。', knownByDefault: false },
  { id: nodeIds.surveyor, kind: 'character', title: '谢照汀', summary: '驻在风回岛西滩的测潮师，专候外海潮信。', knownByDefault: false },
  { id: nodeIds.keeper, kind: 'character', title: '岑隐礁', summary: '潮生屿上的第三代守礁人，续写水则碑刻度。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '低潮礁道', summary: '趁低潮勘出潮生屿礁道水则，把外海潮信记回风回岛。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初登潮生', summary: '渡过南溟水道首次踏上潮生屿西滩。', knownByDefault: false },
  { id: nodeIds.reefEvent, kind: 'event', title: '低潮勘碑', summary: '趁低潮拓下水则碑上的百年潮位刻度。', knownByDefault: false },
  { id: nodeIds.campEvent, kind: 'event', title: '营地炊烟', summary: '在松林边营地认识守礁人的常备行装。', knownByDefault: false },
  { id: nodeIds.poolEvent, kind: 'event', title: '石窝潮池', summary: '退潮后在礁盘内侧看见留水的潮池。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r85-arrival-isle', fromId: nodeIds.arrival, toId: nodeIds.isle, relation: 'triggers', summary: '初登西滩时发现潮生屿。' },
  { id: 'kg.edge.r85-isle-map', fromId: nodeIds.isle, toId: mapId, relation: 'locatedAt', summary: '潮生屿由百格探索地图承载。' },
  { id: 'kg.edge.r85-reef-event', fromId: nodeIds.reefEvent, toId: nodeIds.reef, relation: 'triggers', summary: '低潮勘碑后发现礁道水则的方位。' },
  { id: 'kg.edge.r85-camp-event', fromId: nodeIds.campEvent, toId: nodeIds.camp, relation: 'triggers', summary: '探访营地后得知守礁人的来历。' },
  { id: 'kg.edge.r85-pool-event', fromId: nodeIds.poolEvent, toId: nodeIds.pool, relation: 'triggers', summary: '退潮后看见礁盘内侧的潮池。' },
  { id: 'kg.edge.r85-surveyor-location', fromId: nodeIds.surveyor, toId: windwardId, relation: 'locatedAt', summary: '谢照汀在风回岛西滩守着水则碑。' },
  { id: 'kg.edge.r85-keeper-location', fromId: nodeIds.keeper, toId: mapId, relation: 'locatedAt', summary: '岑隐礁在潮生屿松林边守礁。' },
  { id: 'kg.edge.r85-surveyor-quest', fromId: nodeIds.surveyor, toId: nodeIds.quest, relation: 'participatesIn', summary: '谢照汀委托玩家勘测低潮礁道。' },
  { id: 'kg.edge.r85-quest-reef', fromId: nodeIds.quest, toId: nodeIds.reef, relation: 'requires', summary: '低潮礁道需要玩家趁低潮调查礁道。' },
  { id: 'kg.edge.r85-quest-pool', fromId: nodeIds.quest, toId: nodeIds.pool, relation: 'rewards', summary: '完成低潮礁道后得知退潮石窝的方位。' },
];
const resourceEntries = [
  { id: 'map.round-85-tide-isle', path: 'maps/round-85-tide-isle.json', schema: 'grid-map' },
  { id: 'npc.round-85-tide-isle-set', path: 'characters/round-85-tide-isle-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-85-tide-isle-set', path: 'dialogues/round-85-tide-isle-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-85-tide-isle-set', path: 'quests/round-85-tide-isle-quests.json', schema: 'quest-set' },
];

world.regions = (world.regions ?? []).filter((entry) => entry.mapResourceId !== mapId);
world.regions.push(region);
world.landmarks = [
  ...(world.landmarks ?? []).filter((entry) => !entry.id.startsWith('landmark.r85-')),
  ...landmarks,
];
world.transitions = [
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r85-')),
  ...transitions,
];
world.events = [
  ...(world.events ?? []).filter((entry) => !entry.id.startsWith('event.r85-')),
  ...events,
];
manifest.resources = (manifest.resources ?? []).filter((entry) => !resourceEntries.some((addition) => addition.id === entry.id));
const atlasIndex = manifest.resources.findIndex((entry) => entry.id === 'world.atlas');
if (atlasIndex < 0) throw new Error('manifest 缺少 world.atlas，拒绝孤立新增区域。');
manifest.resources.splice(atlasIndex, 0, ...resourceEntries);

// Persist every atlas layer in the compact row-RLE wire format; regions,
// landmarks, transitions, events and all other atlas values stay unchanged.
world.atlasArt.layers = world.atlasArt.layers.map((layer) => ({
  id: layer.id,
  tilesetId: layer.tilesetId,
  cellsRle: encodeAtlasCells(layer.cells),
}));

await Promise.all([
  writeNewJson(paths.map, mapData, '潮生屿地图'),
  writeNewJson(paths.npcs, npcs, '潮生屿人物'),
  writeNewJson(paths.dialogues, deepenPeopleDialogues(deepenSeaDialogues(dialogues)), '潮生屿对白'),
  writeNewJson(paths.quests, deepenSeaQuests(quests), '潮生屿任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Round 85 atlas is already ${overview.columns}×${overview.rows}; deterministic generation is a no-op.`);
} else {
  console.log(`Generated ${overview.columns}×${overview.rows} atlas (${world.atlasArt.layers.length} layers; ${world.regions.length} regions retained).`);
  console.log(`Round 85 CC0 extension: ${extensionCount.cells} grass, ${extensionCount.shore} shore, ${extensionCount.trees} pines, ${extensionCount.water} sea cells.`);
}
console.log(
  'Generated ' + mapData.name + ': ' + landCount + ' island land cells, ' +
  reachable.size + ' entrance-reachable walkable cells, ' + treeCount + ' pine tiles, ' +
  shoreCount + ' shore cells; two-way Windward gates and ' + landmarks.length + ' landmarks.',
);
