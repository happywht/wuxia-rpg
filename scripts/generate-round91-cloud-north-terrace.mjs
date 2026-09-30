import { deepenPeopleDialogues } from './lib/round105-people-content.mjs';
import { deepenNorthQuests, deepenNorthDialogues } from './lib/round101-north-content.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  ridgeMap: resolve(base, 'maps/round-74-cloud-ridge.json'),
  map: resolve(base, 'maps/round-91-cloud-north-terrace.json'),
  npcs: resolve(base, 'characters/round-91-cloud-north-terrace-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-91-cloud-north-terrace-conversations.json'),
  quests: resolve(base, 'quests/round-91-cloud-north-terrace-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-91-cloud-north-terrace';
const ridgeId = 'map.round-74-cloud-ridge';
const npcIds = { keeper: 'char.r91-nie-qiyan' };
const questId = 'quest.r91-goose-vigil';
const nodeIds = {
  terrace: 'place.r91-cloud-north-terrace',
  bridge: 'place.r91-goose-bridge',
  platform: 'place.r91-goose-terrace',
  stone: 'place.r91-goose-stone',
  keeper: npcIds.keeper,
  quest: questId,
  arrival: 'event.r91-arrival',
  bridgeEvent: 'event.r91-goose-bridge',
  platformEvent: 'event.r91-goose-terrace',
  stoneEvent: 'event.r91-goose-stone',
};
const overview = { columns: 640, rows: 448, tileSize: 16 };
const expectedOld = { columns: 512, rows: 384 };
const extensionIds = [
  'world-r91-terrace-land', 'world-r91-terrace-cliffs', 'world-r91-terrace-walls',
  'world-r91-terrace-detail', 'world-r91-terrace-route',
];
// 雁回崖区域中心固定投影到扩展舆图的 (576,96) 格——云岭古道东北方向的
// 新增空域，不与任何旧区域锚点或旧 512×384 矩形重叠。
const terraceAtlasCell = { col: 576, row: 96 };
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
    throw new Error(label + ' 与生成器声明不一致；请先移除冲突的 Round 91 文件。');
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
    throw new Error('Round 91 图谱条目与生成器声明不一致；请先移除冲突的 Round 91 条目。');
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

// OpenGameArt Ansimuz「Tiny RPG Mountain Tileset」帧白名单：这些帧号在
// 逐帧目检（iterations/round-91/*.png）中确认有实际像素内容；图层只允许
// 从中取帧，避免把全透明帧当作瓦片铺进地图或舆图。
const mountainOpaqueFrames = new Set([
  24, 25, 26, 27, 28, 30, 31, 36, 37, 39, 41, 42, 44, 47, 48, 49, 50, 51,
  53, 54, 56, 57, 59, 60, 62, 64, 65, 67, 70, 71, 72, 73, 74, 76, 77, 79,
  80, 82, 83, 85, 87, 88, 90, 93, 94, 95, 96, 97, 99, 100, 102, 103, 105,
  106, 108, 110, 111, 113, 116, 117, 118, 119, 120, 122, 123, 125, 126, 128,
  129, 131, 133, 134, 136, 140, 141, 142, 143, 145, 146, 148, 149, 151, 152,
  154, 156, 157, 159,
]);
const bridgeOpaqueFrames = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 29, 33, 34, 35, 36, 43, 44, 45,
]);
const assertFrames = (frames, allowed, label) => {
  for (const frame of frames) {
    if (!allowed.has(frame)) throw new Error(label + ' 使用了未核验/全透明帧：' + frame);
  }
};

const [world, manifest, ridgeMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.ridgeMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (ridgeMap.id !== ridgeId || ridgeMap.grid.length !== 100) {
  throw new Error('Round 91 需要 Round 74 的云岭古道百格地图作为入山关口。');
}

// ---------------------------------------------------------------------------
// 第一部分：把 512×384 舆图确定性地扩展到 640×448，在东北新增空域上用
// OpenGameArt Tiny RPG Mountain CC0 图素绘制雁回崖高原；旧矩形逐格不变。
// ---------------------------------------------------------------------------
const previous = world.atlasArt;
// Later rounds may preserve this map at a larger extent and bake it at a
// smaller output tile size. Rebuilding Round 91 must keep that active canvas.
if (previous !== undefined && previous.columns > overview.columns && previous.rows > overview.rows) {
  overview.columns = previous.columns;
  overview.rows = previous.rows;
  overview.tileSize = previous.tileSize;
}
const atlasReady = previous?.columns === overview.columns && previous?.rows === overview.rows &&
  extensionIds.every((id) => previous.layers.some((layer) => layer.id === id));
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
    throw new Error(`预期 Round 90 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 91 图层；请先恢复干净的 Round 90 状态。');
  }
  const tileById = new Map(previous.tilesets.map((tileset) => [tileset.id, tileset]));
  const oceanTiles = tileById.get('wuxia.world-palette');
  if (oceanTiles === undefined) {
    throw new Error('舆图缺少预期的程序水面底层图集。');
  }
  const mountainTiles = {
    id: 'opengameart.tiny-rpg-mountain',
    image: 'assets/opengameart/tiny-rpg-mountain/tileset.png',
    tileSize: 16,
    columns: 23,
    rows: 8,
    spacing: 0,
    tileCount: 184,
  };
  if (previous.tilesets.some((tileset) => tileset.id === mountainTiles.id)) {
    throw new Error('舆图已存在同名山地图集声明；请核对其来源。');
  }

  const atlasBlank = () => Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
  const expandedLayers = previous.layers.map((layer) => {
    if (layer.cells.length !== expectedOld.rows || layer.cells.some((row) => row.length !== expectedOld.columns)) {
      throw new Error(`Round 90 图层 ${layer.id} 的尺寸不是 ${expectedOld.columns}×${expectedOld.rows}。`);
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
    throw new Error('Round 90 舆图缺少预期的程序水面底层。');
  }
  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (row >= expectedOld.rows || col >= expectedOld.columns) oceanLayer.cells[row][col] = 1;
    }
  }

  // 雁回崖高原：东北新增空域上的苔藓崖环壁 + 石砖台缘 + 圆石草丛点缀，
  // 一条石阶山径自旧图东缘接入高原西南口。
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 613, 0x45d9f3b) ^ Math.imul(row + 419, 0x119de1f3) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const plateau = { col: terraceAtlasCell.col, row: terraceAtlasCell.row, radiusX: 34, radiusY: 27 };
  const onPlateau = (col, row) => {
    const dx = (col - plateau.col) / plateau.radiusX;
    const dy = (row - plateau.row) / plateau.radiusY;
    const edge = ((hash(col, row, 0x9101) % 1000) / 1000 - 0.5) * 0.08;
    return dx * dx + dy * dy <= 1 + edge;
  };
  const newArea = (col, row) => col >= expectedOld.columns || row >= expectedOld.rows;
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
  const routeCells = new Map();
  {
    const routeSegments = [
      { from: at(512, 72), to: at(536, 80) },
      { from: at(536, 80), to: at(560, 92) },
      { from: at(560, 92), to: at(575, 98) },
    ];
    const stepFrames = [93, 94, 116, 117];
    for (const segment of routeSegments) {
      const steps = Math.max(Math.abs(segment.to.col - segment.from.col), Math.abs(segment.to.row - segment.from.row));
      for (let step = 0; step <= steps; step += 1) {
        const ratio = steps === 0 ? 0 : step / steps;
        const col = Math.round(segment.from.col + (segment.to.col - segment.from.col) * ratio);
        const row = Math.round(segment.from.row + (segment.to.row - segment.from.row) * ratio);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const cell = at(col + dx, row + dy);
          if (inAtlasBounds(cell.col, cell.row) && newArea(cell.col, cell.row)) {
            routeCells.set(key(cell.col, cell.row), stepFrames[hash(cell.col, cell.row, 0x9102) % stepFrames.length]);
          }
        }
      }
    }
  }
  const cliffFrames = [30, 31, 36, 37, 39, 41, 42, 44, 53, 54, 56, 57, 59, 60, 62, 64, 65, 67,
    76, 77, 79, 80, 82, 83, 85, 87, 88, 90, 99, 100, 102, 103, 105, 106, 108, 110, 111, 113,
    122, 123, 125, 126, 128, 129, 131, 133, 134, 136, 145, 146, 148, 149, 151, 152, 154, 156, 157, 159];
  const wallFrames = [72, 73, 74, 95, 97, 118, 120];
  const detailFrames = [140, 141, 142];
  const dirtFramesAtlas = [26, 27, 28, 50, 51, 143];
  assertFrames(dirtFramesAtlas, mountainOpaqueFrames, '舆图地面');
  assertFrames(cliffFrames, mountainOpaqueFrames, '舆图崖面');
  assertFrames(wallFrames, mountainOpaqueFrames, '舆图石砖');
  assertFrames(detailFrames, mountainOpaqueFrames, '舆图点缀');
  assertFrames([93, 94, 116, 117], mountainOpaqueFrames, '舆图山径');
  const newLand = atlasBlank();
  const newCliffs = atlasBlank();
  const newWalls = atlasBlank();
  const newDetails = atlasBlank();
  const newRoute = atlasBlank();
  extensionCount = { land: 0, cliffs: 0, walls: 0, details: 0, route: 0 };
  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (!newArea(col, row)) continue;
      const routeFrame = routeCells.get(key(col, row));
      if (routeFrame !== undefined) {
        newRoute[row][col] = routeFrame;
        extensionCount.route += 1;
      }
      if (!onPlateau(col, row)) continue;
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
        [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) =>
        !inAtlasBounds(col + dx, row + dy) || !onPlateau(col + dx, row + dy),
      );
      const seed = hash(col, row, 0x9103);
      if (rim) {
        newCliffs[row][col] = cliffFrames[seed % cliffFrames.length];
        extensionCount.cliffs += 1;
      } else {
        newLand[row][col] = dirtFramesAtlas[seed % dirtFramesAtlas.length];
        extensionCount.land += 1;
        if (seed % 100 < 7) {
          newWalls[row][col] = wallFrames[seed % wallFrames.length];
          extensionCount.walls += 1;
        } else if (seed % 100 < 22) {
          newDetails[row][col] = detailFrames[(seed >>> 8) % detailFrames.length];
          extensionCount.details += 1;
        }
      }
    }
  }
  if (extensionCount.land < 1_500 || extensionCount.cliffs < 300 || extensionCount.route < 40) {
    throw new Error('扩展舆图的雁回崖地貌数量不足：' + JSON.stringify(extensionCount));
  }
  if (!onPlateau(terraceAtlasCell.col, terraceAtlasCell.row)) {
    throw new Error('雁回崖区域中心没有落在新增高原上。');
  }

  const addedLayers = [
    { id: 'world-r91-terrace-land', tilesetId: mountainTiles.id, cells: newLand },
    { id: 'world-r91-terrace-cliffs', tilesetId: mountainTiles.id, cells: newCliffs },
    { id: 'world-r91-terrace-walls', tilesetId: mountainTiles.id, cells: newWalls },
    { id: 'world-r91-terrace-detail', tilesetId: mountainTiles.id, cells: newDetails },
    { id: 'world-r91-terrace-route', tilesetId: mountainTiles.id, cells: newRoute },
  ];
  const existingIds = new Set(expandedLayers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 91 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }

  // 保持全部既有区域的绝对像素中心不变，仅把百分比基准换到 640×448 画布。
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
  const atlasTilesets = [...previous.tilesets, mountainTiles];
  const atlasArt = {
    ...overview,
    regionFootprint,
    tilesets: atlasTilesets,
    layers: [...expandedLayers, ...addedLayers],
  };
  for (const layer of atlasArt.layers) {
    if (layer.cells.length !== overview.rows || layer.cells.some((row) => row.length !== overview.columns)) {
      throw new Error(`生成图层 ${layer.id} 的尺寸与 ${overview.columns}×${overview.rows} 不符。`);
    }
    const tileset = atlasTilesets.find((entry) => entry.id === layer.tilesetId);
    if (tileset === undefined || layer.cells.some((row) => row.some((gid) => gid > tileset.tileCount))) {
      throw new Error(`图层 ${layer.id} 使用了未声明或超出容量的素材帧。`);
    }
  }
  const oldIds = new Set(previous.layers.map((layer) => layer.id));
  if (oldIds.size !== previous.layers.length || expandedLayers.length !== previous.layers.length) {
    throw new Error('Round 90 旧图层 id 不唯一或扩图时发生丢失。');
  }
  world.atlasArt = atlasArt;
}

// ---------------------------------------------------------------------------
// 第二部分：生成 100×100 雁回崖可玩地图。环境/木桥全部取自 OpenGameArt
// Tiny RPG Mountain CC0 图素；人物沿用 Puny Characters；碰撞只由 grid 决定。
// ---------------------------------------------------------------------------
const mountainId = 'opengameart.tiny-rpg-mountain';
const bridgeId = 'opengameart.tiny-rpg-mountain-bridge';
const actorId = 'opengameart.puny-characters';
const mountainTileset = {
  id: mountainId,
  image: 'assets/opengameart/tiny-rpg-mountain/tileset.png',
  tileSize: 16,
  columns: 23,
  rows: 8,
  spacing: 0,
  tileCount: 184,
};
const bridgeTileset = {
  id: bridgeId,
  image: 'assets/opengameart/tiny-rpg-mountain/bridge.png',
  tileSize: 16,
  columns: 10,
  rows: 5,
  spacing: 0,
  tileCount: 50,
};
const actorDeclaration = ridgeMap.art?.tilesets.find((entry) => entry.id === actorId);
if (actorDeclaration === undefined) throw new Error('云岭古道缺少已登记的 Puny Characters 图集声明。');
const tilesets = [mountainTileset, bridgeTileset, actorDeclaration];
const tilesetById = new Map(tilesets.map((entry) => [entry.id, entry]));
const actorTileset = tilesetById.get(actorId);

// 布局锚点：南口入山/回程、三座跨涧木桥、观雁台与守雁人、雁栖石。
// Round 92 起北界另开「北境栈口」，衔接照雪关的双向步行关口。
const start = at(50, 97);
const terraceReturn = at(49, 97);
const terraceNorthGate = at(50, 2);
const terraceNorthArrival = at(49, 2);
const keeperPosition = at(50, 20);
const platformEventCell = at(50, 12);
const bridgeEventCell = at(50, 48);
const stoneEventCell = at(82, 28);
const bridges = [
  { col: 29, fromRow: 43, toRow: 53 },
  { col: 50, fromRow: 43, toRow: 53 },
  { col: 69, fromRow: 43, toRow: 53 },
];

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
addRoad([start, at(50, 88), at(50, 76), at(50, 62)]);
addRoad([at(50, 62), at(29, 62), at(29, 56)]);
addRoad([at(50, 62), at(69, 62), at(69, 56)]);
addRoad([at(29, 40), at(29, 36), at(50, 36)]);
addRoad([at(69, 40), at(69, 36), at(50, 36)]);
addRoad([at(50, 36), at(50, 24)]);
addRoad([at(50, 18), at(50, 14)]);
addRoad([at(69, 32), at(78, 30), stoneEventCell]);

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
  { id: 'landmark.r91-terrace-gate', mapResourceId: mapId, ...start, name: '北台栈口', category: 'crossing' },
  { id: 'landmark.r91-goose-bridge', mapResourceId: mapId, ...bridgeEventCell, name: '悬空雁桥', category: 'route', discoveryNodeId: nodeIds.bridge },
  { id: 'landmark.r91-goose-terrace', mapResourceId: mapId, ...platformEventCell, name: '观雁台', category: 'other', discoveryNodeId: nodeIds.platform },
  { id: 'landmark.r91-goose-stone', mapResourceId: mapId, ...stoneEventCell, name: '雁栖石', category: 'other', discoveryNodeId: nodeIds.stone },
];
for (const point of [start, terraceReturn, terraceNorthGate, terraceNorthArrival, keeperPosition, platformEventCell, bridgeEventCell, stoneEventCell]) {
  reserveAnchor('人物/关口/地标', point, 2);
}
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

// 地形谓词：北部高地与南部台地被一条东西深涧切开，三座木桥是仅有的通道。
const gully = { fromRow: 44, toRow: 52, fromCol: 3, toCol: 96 };
const platform = { col: 42, row: 8, columns: 17, rows: 9, gateFromCol: 49, gateToCol: 51 };
const insideGully = (col, row) => col >= gully.fromCol && col <= gully.toCol &&
  row >= gully.fromRow && row <= gully.toRow;
const insidePlatform = (col, row) => col >= platform.col && row >= platform.row &&
  col < platform.col + platform.columns && row < platform.row + platform.rows;
const onBridge = (col, row) => bridges.some((bridge) =>
  col >= bridge.col - 1 && col <= bridge.col + 1 && row >= bridge.fromRow && row <= bridge.toRow);
const massifs = [
  { col: 16, row: 26, radiusX: 7, radiusY: 9, salt: 0x9111 },
  { col: 78, row: 14, radiusX: 6, radiusY: 8, salt: 0x9112 },
  { col: 12, row: 72, radiusX: 8, radiusY: 7, salt: 0x9113 },
  { col: 86, row: 76, radiusX: 7, radiusY: 8, salt: 0x9114 },
  { col: 38, row: 76, radiusX: 5, radiusY: 6, salt: 0x9115 },
  { col: 64, row: 70, radiusX: 6, radiusY: 5, salt: 0x9116 },
];
function inMassif(col, row) {
  return massifs.some((shape) => {
    const x = (col - shape.col) / shape.radiusX;
    const y = (row - shape.row) / shape.radiusY;
    return x * x + y * y <= 1;
  });
}
function hashCell(col, row, salt) {
  let value = Math.imul(col + 271, 0x45d9f3b) ^ Math.imul(row + 491, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

const dirtFrames = [26, 27, 28, 50, 51, 143];
const stepFrames = [93, 94];
const terraceFloorFrames = [93, 94, 116, 117];
const cliffFrames = [30, 31, 36, 37, 39, 41, 42, 44, 53, 54, 56, 57, 59, 60, 62, 64, 65, 67,
  76, 77, 79, 80, 82, 83, 85, 87, 88, 90, 99, 100, 102, 103, 105, 106, 108, 110, 111, 113,
  122, 123, 125, 126, 128, 129, 131, 133, 134, 136, 145, 146, 148, 149, 151, 152, 154, 156, 157, 159];
const wallFrames = [72, 73, 74, 95, 97, 118, 120];
const boulderFrames = [140];
const flourishFrames = [141, 142];
const gullyFloorFrames = [49, 96, 119];
const bridgeDeckFrames = [21, 22, 23];
const bridgeRailFrames = [12, 13, 14, 15, 16, 17];
const bridgeRopeFrames = [25, 26, 27];
assertFrames([...dirtFrames, ...stepFrames, ...terraceFloorFrames, ...cliffFrames, ...wallFrames,
  ...boulderFrames, ...flourishFrames, ...gullyFloorFrames], mountainOpaqueFrames, '雁回崖环境');
assertFrames([...bridgeDeckFrames, ...bridgeRailFrames, ...bridgeRopeFrames], bridgeOpaqueFrames, '雁回崖木桥');

const ground = blank();
const trail = blank();
const flourish = blank();
const cliffs = blank();
const walls = blank();
const boulders = blank();
const bridgeDeck = blank();
const bridgeRails = blank();
const grid = Array.from({ length: rows }, () => Array(columns).fill('.'));
let walkableCount = 0;
let cliffCount = 0;
let bridgeCount = 0;
let massifCellCount = 0;
for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < columns; col += 1) {
    const cellKey = key(col, row);
    const seed = hashCell(col, row, 0x9104);
    const road = roads.has(cellKey);
    const anchor = anchors.has(cellKey);
    const southGate = col >= 48 && col <= 52;
    // 北境栈口与南口同宽，Round 92 的照雪关关口由此接入。
    const northGate = col >= 48 && col <= 52;
    const boundary = col < 3 || col > 96 || (row > 96 && !southGate) || (row < 3 && !northGate);
    const onPlatformWall = insidePlatform(col, row) && (
      row === platform.row || row === platform.row + platform.rows - 1 ||
      col === platform.col || col === platform.col + platform.columns - 1
    ) && !(row === platform.row + platform.rows - 1 &&
      col >= platform.gateFromCol && col <= platform.gateToCol);
    const inGullyCell = insideGully(col, row) && !onBridge(col, row);
    const massif = !road && !anchor && inMassif(col, row);

    if (inGullyCell) {
      grid[row][col] = '~';
      ground[row][col] = gullyFloorFrames[seed % gullyFloorFrames.length];
      if (seed % 100 < 12) bridgeRails[row][col] = bridgeRopeFrames[(seed >>> 8) % bridgeRopeFrames.length];
      continue;
    }
    if (onBridge(col, row)) {
      grid[row][col] = '=';
      bridgeCount += 1;
      bridgeDeck[row][col] = bridgeDeckFrames[1];
      ground[row][col] = gullyFloorFrames[seed % gullyFloorFrames.length];
      const westRail = bridges.some((bridge) => col === bridge.col - 1 && row >= bridge.fromRow && row <= bridge.toRow);
      const eastRail = bridges.some((bridge) => col === bridge.col + 1 && row >= bridge.fromRow && row <= bridge.toRow);
      if (westRail || eastRail) {
        grid[row][col] = '~';
        bridgeDeck[row][col] = 0;
        bridgeRails[row][col] = bridgeRailFrames[(seed + row) % bridgeRailFrames.length];
      }
      continue;
    }
    if (boundary) {
      grid[row][col] = '#';
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    if (onPlatformWall) {
      grid[row][col] = '#';
      walls[row][col] = wallFrames[seed % wallFrames.length];
      continue;
    }
    // 可行走地带：高地/台地泥地，登山路铺石阶，观雁台内铺台砖。
    const inTerrace = insidePlatform(col, row);
    const nearGully = row >= gully.fromRow - 3 && row <= gully.toRow + 3;
    ground[row][col] = dirtFrames[seed % dirtFrames.length];
    if (nearGully && !road && !anchor) grid[row][col] = ',';
    if (inTerrace) {
      ground[row][col] = terraceFloorFrames[(seed >>> 4) % terraceFloorFrames.length];
    } else if (road || anchor) {
      trail[row][col] = stepFrames[seed % stepFrames.length];
    } else if (seed % 100 < 9) {
      flourish[row][col] = flourishFrames[(seed >>> 8) % flourishFrames.length];
    }
    if (massif) {
      massifCellCount += 1;
      grid[row][col] = '#';
      cliffs[row][col] = cliffFrames[hashCell(col, row, 0x9105) % cliffFrames.length];
      cliffCount += 1;
      trail[row][col] = 0;
      flourish[row][col] = 0;
    } else if (seed % 100 < 4 && !road && !anchor && !inTerrace) {
      boulders[row][col] = boulderFrames[0];
    }
  }
}
// 观雁台门前的石阶直抵台心，台心事件格保持开阔。
for (let row = platform.row + 1; row < platform.row + platform.rows - 1; row += 1) {
  trail[row][50] = stepFrames[row % stepFrames.length];
}

const mapGrid = grid.map((line) => line.join(''));
// Count the actual collision contract, including the deck cells that bridge
// the ravine. Rails and cliff/massif cells remain solid in the independent grid.
walkableCount = mapGrid.reduce(
  (total, line) => total + [...line].filter((glyph) => glyph !== '#' && glyph !== '~').length,
  0,
);
function reachableFrom(origin, mapGridRows, mapColumns, mapRows, label) {
  if (mapGridRows[origin.row]?.[origin.col] === undefined || ['#', '~'].includes(mapGridRows[origin.row][origin.col])) {
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
      if (['#', '~'].includes(mapGridRows[row][col]) || reached.has(next)) continue;
      reached.add(next);
      queue.push(at(col, row));
    }
  }
  return reached;
}
const reachable = reachableFrom(start, mapGrid, columns, rows, '雁回崖');
for (const point of [terraceReturn, terraceNorthGate, terraceNorthArrival, keeperPosition, platformEventCell, bridgeEventCell, stoneEventCell]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('雁回崖锚点不可达：' + key(point.col, point.row));
}
// 观雁台是 E 键调查点：事件格自身可走，且至少一个正交邻格从入口可达。
const platformApproachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  reachable.has(key(platformEventCell.col + dx, platformEventCell.row + dy)),
);
if (!platformApproachable) throw new Error('观雁台在调查距离内没有可通行接近格。');
if (walkableCount < 6_500 || reachable.size < 5_500) {
  throw new Error('雁回崖可行/连通格数量不足：可行 ' + walkableCount + '，连通 ' + reachable.size);
}
if (keeperPosition.col === start.col && keeperPosition.row === start.row) {
  throw new Error('守雁人占住了北台栈口。');
}
if (terraceReturn.col === start.col && terraceReturn.row === start.row) {
  throw new Error('回程关口与北台栈口重合。');
}

// 云岭古道一侧的关口格必须可通行、可从断云栈道出生点抵达，且不压既有锚点。
const ridgeGate = at(62, 2);
const ridgeArrival = at(63, 2);
const ridgeSolid = new Set(
  Object.entries(ridgeMap.tileTypes ?? {}).filter(([, type]) => type?.solid).map(([glyph]) => glyph),
);
function ridgeWalkable(point) {
  const glyph = ridgeMap.grid[point.row]?.[point.col];
  return glyph !== undefined && !ridgeSolid.has(glyph);
}
for (const point of [ridgeGate, ridgeArrival]) {
  if (!ridgeWalkable(point)) {
    throw new Error('云岭古道北台关口不可通行：' + key(point.col, point.row));
  }
}
const ridgeStart = ridgeMap.playerStart;
const ridgeReachable = reachableFrom(
  { col: ridgeStart.col, row: ridgeStart.row },
  ridgeMap.grid, ridgeMap.columns, ridgeMap.rows, '云岭古道',
);
for (const point of [ridgeGate, ridgeArrival]) {
  if (!ridgeReachable.has(key(point.col, point.row))) {
    throw new Error('云岭古道北台关口不可从出生点抵达：' + key(point.col, point.row));
  }
}
const ridgeOccupied = new Set([
  key(ridgeStart.col, ridgeStart.row),
  ...(world.events ?? []).filter((entry) => entry.mapResourceId === ridgeId).map((entry) => key(entry.col, entry.row)),
  ...(world.landmarks ?? []).filter((entry) => entry.mapResourceId === ridgeId).map((entry) => key(entry.col, entry.row)),
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r91-')).flatMap((entry) => [
    entry.from.mapResourceId === ridgeId ? key(entry.from.col, entry.from.row) : null,
    entry.to.mapResourceId === ridgeId ? key(entry.to.col, entry.to.row) : null,
  ]).filter(Boolean),
]);
for (const point of [ridgeGate, ridgeArrival]) {
  if (ridgeOccupied.has(key(point.col, point.row))) {
    throw new Error('云岭古道新关口与既有玩法锚点重叠：' + key(point.col, point.row));
  }
}

const mapData = {
  id: mapId,
  name: '云岭北台·雁回崖',
  tileSize: 48,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#8a7f6d', solid: false },
    ',': { color: '#a89a83', solid: false },
    '=': { color: '#7a5b3a', solid: false },
    '#': { color: '#4a5560', solid: true },
    '~': { color: '#22303c', solid: true },
  },
  grid: mapGrid,
  playerStart: start,
  art: {
    tileSize: 16,
    tilesets,
    actors: { ...ridgeMap.art.actors },
    layers: [
      { id: 'r91-terrace-ground', tilesetId: mountainId, cells: ground },
      { id: 'r91-terrace-trail', tilesetId: mountainId, cells: trail },
      { id: 'r91-terrace-flourish', tilesetId: mountainId, cells: flourish },
      { id: 'r91-terrace-bridge-deck', tilesetId: bridgeId, cells: bridgeDeck },
      { id: 'r91-terrace-cliffs', tilesetId: mountainId, depthSort: 'y', cells: cliffs },
      { id: 'r91-terrace-walls', tilesetId: mountainId, depthSort: 'y', cells: walls },
      { id: 'r91-terrace-boulders', tilesetId: mountainId, depthSort: 'y', cells: boulders },
      { id: 'r91-terrace-bridge-rails', tilesetId: bridgeId, depthSort: 'y', cells: bridgeRails },
    ],
  },
};
for (const layer of mapData.art.layers) {
  const tileset = tilesetById.get(layer.tilesetId);
  if (tileset === undefined) throw new Error('雁回崖图层引用未声明图集：' + layer.id);
  const used = new Set();
  for (const rowCells of layer.cells) for (const gid of rowCells) if (gid !== 0) used.add(gid);
  if (Math.max(0, ...used) > tileset.tileCount) {
    throw new Error(`雁回崖图层 ${layer.id} 帧号超出图集容量。`);
  }
  if (tileset.id === mountainId) assertFrames(used, mountainOpaqueFrames, '雁回崖图层 ' + layer.id);
  if (tileset.id === bridgeId) assertFrames(used, bridgeOpaqueFrames, '雁回崖图层 ' + layer.id);
}

// ---------------------------------------------------------------------------
// 第三部分：原创守雁人、对白、崖台雁候差事、一次性见闻与知识图谱端点。
// ---------------------------------------------------------------------------
const npcs = {
  npcs: [{
    id: npcIds.keeper,
    name: '聂栖雁',
    mapResourceId: mapId,
    position: keeperPosition,
    dialogueId: 'dlg.r91-nie-qiyan-vigil',
    questGiver: true,
    spriteFrame: 240,
    spriteFrames: { down: 224, right: 232, up: 240, left: 248 },
    schedule: [
      { periodId: 'period.midnight', position: { col: 51, row: 21 } },
      { periodId: 'period.dawn', position: { col: 50, row: 15 } },
      { periodId: 'period.morning', position: { col: 50, row: 20 } },
      { periodId: 'period.midday', position: { col: 50, row: 20 } },
      { periodId: 'period.afternoon', position: { col: 52, row: 24 } },
      { periodId: 'period.dusk', position: { col: 50, row: 15 } },
      { periodId: 'period.night', position: { col: 51, row: 22 } },
    ],
  }],
};
for (const npc of npcs.npcs) {
  const maxFrame = Math.max(npc.spriteFrame, ...Object.values(npc.spriteFrames));
  if (maxFrame > actorTileset.tileCount) {
    throw new Error('人物帧超出 Puny Characters 图集容量：' + npc.id);
  }
}
for (const npc of npcs.npcs) {
  for (const entry of npc.schedule ?? []) {
    if (mapGrid[entry.position.row]?.[entry.position.col] === undefined ||
      ['#', '~'].includes(mapGrid[entry.position.row][entry.position.col])) {
      throw new Error('守雁人日程落点不可通行：' + npc.id + '/' + entry.periodId);
    }
  }
}
const quests = {
  quests: [{
    id: questId,
    name: '崖台雁候',
    description: '守雁人聂栖雁请你越过悬空雁桥登上观雁台，在晨光、日中或午后的雁阵回翔时记下头雁的阵形，把这份雁书带回给她。',
    giverNpcId: npcIds.keeper,
    objectives: [{
      id: 'objective.r91-arrive-cloud-north-terrace',
      kind: 'discoverKnowledge',
      targetId: nodeIds.terrace,
      requiredCount: 1,
      text: '从断云栈道北端栈口登上云岭北台',
    }, {
      id: 'objective.r91-watch-goose-terrace',
      kind: 'discoverKnowledge',
      targetId: nodeIds.platform,
      requiredCount: 1,
      text: '白日越过雁桥，登观雁台记下头雁阵形',
    }, {
      id: 'objective.r91-report-nie-qiyan',
      kind: 'talkToNpc',
      targetId: npcIds.keeper,
      requiredCount: 1,
      text: '把雁书带回给聂栖雁',
    }],
    rewards: {
      experience: 32,
      currency: 24,
      discoverKnowledgeNodeIds: [nodeIds.stone],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r91-nie-qiyan-vigil',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '观雁台南的石阶上，守雁人聂栖雁正仰头望着云缝里一线掠过的雁阵，见你从栈口上来，把一只蒙皮的竹筒从肩上卸下：「北台多年没生人上来。你若肯替雁群当一次眼睛，把台上的雁书记回来，我这筒里的崖茶分你一半。」',
        options: [
          {
            text: '雁书我记。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '雁书已经记回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          {
            text: '我正要去台上记雁。',
            nextNodeId: 'active',
            conditions: [{ kind: 'questStatus', questId, status: 'active' }],
          },
          { text: '观雁台怎么走？', nextNodeId: 'route' },
          { text: '你在崖上守什么？', nextNodeId: 'keeper' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「过了崖口那道悬空雁桥，一路石阶直上便是观雁台。趁晨光、日中或午后雁阵回翔时上台，在台心按 E 记下头雁的阵形——人字、一字还是孤雁当先，一样都不能错。记完回来找我。」' },
      { id: 'active', text: '「桥板上有霜就贴着栏杆走。上台记雁要挑晨光、日中或午后，别的时辰雁群不落形。记完就回来，崖茶给你温着。」' },
      { id: 'completed', text: '聂栖雁接过竹筒，抽出你记的雁书对着天光看了半晌，眉头渐渐松开：「头雁换了一只新雁，阵形却比去年齐整——这群雁，熬过今年了。」她把温好的崖茶推到你手边。' },
      { id: 'route', text: '「下涧只有三座木桥，中路那座叫悬空雁桥，最宽。过桥后石阶直上，台的南墙留了门。台心那块平石就是记雁的地方。东边涧岸上有块雁栖石，雁群歇脚的老地方，顺路可以看看。」' },
      { id: 'keeper', text: '「聂家三代守这群雁。祖父说雁是云岭的信使——雁阵乱一年，山下就乱一年。我记了十一年雁书，笔都换七支了，眼睛还算够用。」' },
      { id: 'farewell', text: '聂栖雁重新背起竹筒，目光越过深涧投向观雁台的方向，风把她的斗篷吹得猎猎作响。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '云岭北台·雁回崖',
  description: '断云栈道以北的高台山地，一道深涧切过崖腰，三座木桥与观雁台连成雁群迁徙的哨线。',
  atlasPosition: {
    x: Number(((terraceAtlasCell.col / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number(((terraceAtlasCell.row / (overview.rows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r91-cloud-ridge-to-terrace',
    name: '北台栈道',
    from: { mapResourceId: ridgeId, ...ridgeGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r91-terrace-to-cloud-ridge',
    name: '南归栈道',
    from: { mapResourceId: mapId, ...terraceReturn },
    to: { mapResourceId: ridgeId, ...ridgeArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '栈道在崖口戛然抬升，脚下云海翻涌，一道深涧横过崖腰，三座木桥如线悬在涧上——云岭北台·雁回崖到了。',
    approachText: '北面崖台上隐约传来雁鸣，风里带着高处的凉意。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.terrace,
  },
  {
    id: nodeIds.bridgeEvent,
    mapResourceId: mapId,
    ...bridgeEventCell,
    text: '悬空雁桥的桥板在脚下轻晃，绳索绷出低沉的嗡鸣，桥下深涧云雾不见底——每年雁群迁徙，守雁人就从这三座桥上数过第一声雁唳。',
    approachText: '涧上的木桥在风里微微起伏，桥栏垂着旧绳。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.bridge,
  },
  {
    id: nodeIds.platformEvent,
    mapResourceId: mapId,
    ...platformEventCell,
    text: '观雁台心的平石被几代守雁人磨得发亮。凭栏北望，雁阵正从云海尽头回翔而来，头雁的阵形在晨光里清清楚楚——一字排开，新雁当先。',
    approachText: '台心的平石视野开阔，云海上隐约有雁影排开。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.platform,
    conditions: {
      periodIds: ['period.morning', 'period.midday', 'period.afternoon'],
    },
    interaction: {
      prompt: '在观雁台记下头雁阵形',
      range: 1,
      approachDirections: ['down', 'left', 'right'],
    },
  },
  {
    id: nodeIds.stoneEvent,
    mapResourceId: mapId,
    ...stoneEventCell,
    text: '雁栖石立在高地东缘，石面被雁爪磨出浅浅的凹痕。守雁人在石下埋着一碗清水——迁徙路上歇脚的雁群，认得这份旧约。',
    approachText: '东缘的大石下有雁羽散落，石畔水碗映着天光。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.stone,
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '云岭北台探索地图', summary: '从断云栈道北端栈口可登的北台百格地图。', knownByDefault: false },
  { id: nodeIds.terrace, kind: 'place', title: '云岭北台·雁回崖', summary: '断云栈道以北的高台山地，深涧、木桥与观雁台连成雁群哨线。', knownByDefault: false },
  { id: nodeIds.bridge, kind: 'place', title: '悬空雁桥', summary: '横过崖腰深涧的中路木桥，桥板悬空、绳索承风。', knownByDefault: false },
  { id: nodeIds.platform, kind: 'place', title: '观雁台', summary: '北台高地上的石砌高台，守雁人代代在此记录雁阵。', knownByDefault: false },
  { id: nodeIds.stone, kind: 'place', title: '雁栖石', summary: '高地东缘的歇雁大石，石下埋着守雁人的清水旧约。', knownByDefault: false },
  { id: nodeIds.keeper, kind: 'character', title: '聂栖雁', summary: '聂家第三代守雁人，在观雁台下记了十一年雁书。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '崖台雁候', summary: '越过雁桥登上观雁台记下头雁阵形，把雁书带回给聂栖雁。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初登北台', summary: '从断云栈道北端栈口首次踏上云岭北台。', knownByDefault: false },
  { id: nodeIds.bridgeEvent, kind: 'event', title: '雁桥听风', summary: '在悬空雁桥上听清守雁人数雁的旧路。', knownByDefault: false },
  { id: nodeIds.platformEvent, kind: 'event', title: '台心记雁', summary: '白日在观雁台心记下头雁的一字阵形。', knownByDefault: false },
  { id: nodeIds.stoneEvent, kind: 'event', title: '雁石旧约', summary: '在雁栖石下发现守雁人的清水旧约。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r91-arrival-terrace', fromId: nodeIds.arrival, toId: nodeIds.terrace, relation: 'triggers', summary: '初登北台时发现云岭北台·雁回崖。' },
  { id: 'kg.edge.r91-terrace-map', fromId: nodeIds.terrace, toId: mapId, relation: 'locatedAt', summary: '雁回崖由百格探索地图承载。' },
  { id: 'kg.edge.r91-bridge-event', fromId: nodeIds.bridgeEvent, toId: nodeIds.bridge, relation: 'triggers', summary: '过桥听风后认清悬空雁桥的位置。' },
  { id: 'kg.edge.r91-platform-event', fromId: nodeIds.platformEvent, toId: nodeIds.platform, relation: 'triggers', summary: '台心记雁后记下观雁台的方位。' },
  { id: 'kg.edge.r91-stone-event', fromId: nodeIds.stoneEvent, toId: nodeIds.stone, relation: 'triggers', summary: '寻得大石后发现雁栖石的旧约。' },
  { id: 'kg.edge.r91-keeper-location', fromId: nodeIds.keeper, toId: mapId, relation: 'locatedAt', summary: '聂栖雁在雁回崖观雁台下守雁。' },
  { id: 'kg.edge.r91-keeper-quest', fromId: nodeIds.keeper, toId: nodeIds.quest, relation: 'participatesIn', summary: '聂栖雁委托玩家记回台心雁书。' },
  { id: 'kg.edge.r91-quest-platform', fromId: nodeIds.quest, toId: nodeIds.platform, relation: 'requires', summary: '崖台雁候需要玩家登观雁台调查。' },
  { id: 'kg.edge.r91-quest-stone', fromId: nodeIds.quest, toId: nodeIds.stone, relation: 'rewards', summary: '完成崖台雁候后得知雁栖石的方位。' },
  { id: 'kg.edge.r91-terrace-ridge', fromId: nodeIds.terrace, toId: ridgeId, relation: 'locatedAt', summary: '雁回崖从云岭古道断云栈道北端栈口进入。' },
];
const resourceEntries = [
  { id: 'map.round-91-cloud-north-terrace', path: 'maps/round-91-cloud-north-terrace.json', schema: 'grid-map' },
  { id: 'npc.round-91-cloud-north-terrace-set', path: 'characters/round-91-cloud-north-terrace-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-91-cloud-north-terrace-set', path: 'dialogues/round-91-cloud-north-terrace-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-91-cloud-north-terrace-set', path: 'quests/round-91-cloud-north-terrace-quests.json', schema: 'quest-set' },
];

const existingAtlasRegion = world.regions.find((entry) => entry.mapResourceId === mapId);
if (atlasReady && existingAtlasRegion !== undefined) region.atlasPosition = existingAtlasRegion.atlasPosition;
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
  writeNewJson(paths.map, mapData, '雁回崖地图'),
  writeNewJson(paths.npcs, npcs, '雁回崖人物'),
  writeNewJson(paths.dialogues, deepenPeopleDialogues(deepenNorthDialogues(dialogues)), '雁回崖对白'),
  writeNewJson(paths.quests, deepenNorthQuests(quests), '雁回崖任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Round 91 atlas is already ${overview.columns}×${overview.rows}; deterministic generation is a no-op.`);
} else {
  console.log(`Generated ${overview.columns}×${overview.rows} atlas (${world.atlasArt.layers.length} layers; ${world.regions.length} regions retained).`);
  console.log(`Round 91 CC0 mountain extension: ${extensionCount.land} plateau land, ${extensionCount.cliffs} cliff rim, ${extensionCount.walls} wall, ${extensionCount.details} detail, ${extensionCount.route} trail cells.`);
}
console.log(
  'Generated ' + mapData.name + ': ' + walkableCount + ' walkable cells, ' +
  reachable.size + ' entrance-reachable cells, ' + cliffCount + ' cliff tiles, ' +
  bridgeCount + ' bridge deck cells, ' + massifCellCount + ' massif cells; two-way ridge gates and ' +
  landmarks.length + ' landmarks.',
);
