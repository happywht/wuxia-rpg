import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  terraceMap: resolve(base, 'maps/round-91-cloud-north-terrace.json'),
  map: resolve(base, 'maps/round-92-north-pass.json'),
  npcs: resolve(base, 'characters/round-92-north-pass-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-92-north-pass-conversations.json'),
  quests: resolve(base, 'quests/round-92-north-pass-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-92-north-pass';
const terraceId = 'map.round-91-cloud-north-terrace';
const npcIds = { keeper: 'char.r92-gu-zhaoxue' };
const questId = 'quest.r92-snow-beacon';
const nodeIds = {
  pass: 'place.r92-north-pass',
  river: 'place.r92-mirror-river',
  beacon: 'place.r92-snow-beacon',
  cairn: 'place.r92-north-cairn',
  keeper: npcIds.keeper,
  quest: questId,
  arrival: 'event.r92-arrival',
  riverEvent: 'event.r92-mirror-river',
  beaconEvent: 'event.r92-snow-beacon',
  cairnEvent: 'event.r92-north-cairn',
};
const overview = { columns: 640, rows: 448, tileSize: 16 };
const expectedOld = { columns: 640, rows: 448 };
const extensionIds = [
  'world-r92-pass-snow', 'world-r92-pass-trees', 'world-r92-pass-walls',
  'world-r92-pass-detail', 'world-r92-pass-route',
];
// Round 91 输出的 33 层基线 id 序列（world-ocean … world-r91-terrace-route）。
// 后续轮次（Round 93 起）的图层追加在本生成器五层之后；重跑时这些后续层
// 原位保留，本生成器只把自身五层重建回基线之后，任意时序逐字节稳定。
const baselineLayerIds = [
  'world-ocean', 'world-land', 'world-coast', 'world-forest', 'world-relief',
  'world-roads', 'world-settlements',
  'world-r79-shoal-water', 'world-r79-shoal-sand', 'world-r79-shoal-land',
  'world-r79-shoal-pines', 'world-r79-gate-routes',
  'world-r81-expanse-water', 'world-r81-expanse-sand', 'world-r81-expanse-land',
  'world-r81-expanse-pines',
  'world-r84-expanse-water', 'world-r84-expanse-sand', 'world-r84-expanse-land',
  'world-r84-expanse-pines',
  'world-r85-expanse-water', 'world-r85-expanse-sand', 'world-r85-expanse-land',
  'world-r85-expanse-pines',
  'world-r87-expanse-water', 'world-r87-expanse-sand', 'world-r87-expanse-land',
  'world-r87-expanse-pines',
  'world-r91-terrace-land', 'world-r91-terrace-cliffs', 'world-r91-terrace-walls',
  'world-r91-terrace-detail', 'world-r91-terrace-route',
];
// 照雪关区域中心固定投影到 640×448 舆图的 (576,24) 格——雁回崖高原以北极
// 空白带上的新增雪原，不与任何旧区域锚点或雁回崖地貌重叠。
const passAtlasCell = { col: 576, row: 24 };
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
function collectIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, ids);
  } else if (value !== null && typeof value === 'object') {
    if (typeof value.id === 'string') ids.add(value.id);
    for (const entry of Object.values(value)) collectIds(entry, ids);
  }
  return ids;
}
async function writeManagedJson(path, value, label) {
  let raw = null;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const next = JSON.stringify(value, null, 2) + '\n';
  if (raw !== null) {
    const currentIds = collectIds(JSON.parse(raw));
    const expectedIds = collectIds(value);
    if (expectedIds.size === 0 || [...expectedIds].some((id) => !currentIds.has(id))) {
      throw new Error(label + ' 的资源身份与生成器声明冲突，拒绝覆盖。');
    }
  }
  await writeFile(path, next);
}
async function appendGraphEntries(path, field, additions) {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  const existing = parsed[field] ?? [];
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const exact = additions.every((entry) => JSON.stringify(byId.get(entry.id)) === JSON.stringify(entry));
  if (exact) return;
  if (additions.some((entry) => byId.has(entry.id))) {
    throw new Error('Round 92 图谱条目与生成器声明不一致；请先移除冲突的 Round 92 条目。');
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

// OpenGameArt zaphgames「Winter Tileset [16x16]」逐帧用途白名单。
// 0 是连贯雪地底砖；1/2、17/18 是雪石/雪岩；16/32/48/64/80/96 是雪松；
// 50-52 与 66-68 是 3×2 冰池组合，本轮只用 51/67 两块中段拼接冰河；
// 105-109 是灰砖关墙。大片纯灰白格是空白占位，不能当雪地铺底；木牌、屋顶、
// 圆池边缘及玫红 chroma-key 也不能随机铺路。引擎 gid 为 1-based（0 留空），
// 下列帧号按图集 0-based 书写，构造时统一 +1 换算。
const toGids = (frames) => frames.map((frame) => frame + 1);
const reviewedSnowFrames = [0];
const reviewedIceFrames = [51, 67];
const reviewedPineFrames = [16, 32, 48, 64, 80, 96];
const reviewedStoneFrames = [1, 2, 17, 18];
const reviewedDriftFrames = [1];
const reviewedWallFrames = [105, 106, 107, 108, 109];
const reviewedCliffFrames = [1, 2, 17, 18];
const winterUsableFrames = new Set(toGids([
  ...reviewedSnowFrames, ...reviewedIceFrames, ...reviewedPineFrames,
  ...reviewedStoneFrames, ...reviewedDriftFrames, ...reviewedWallFrames,
  ...reviewedCliffFrames,
]));
// 已知不可用作地貌的暖色物件帧（木牌/桥板/灯窗/檐口/黑与玫红雪边等），
// 供生成器断言与回归测试双重锁定；0-based。
const forbiddenWinterFrames = [
  ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  ...[39, 40, 41, 42, 43, 44, 45, 46, 47, 57, 58, 59, 60, 61, 62, 63],
  ...[98, 99, 100, 101, 102, 103, 104, 112, 113, 114],
  ...[116, 117, 118, 119, 120, 123, 124, 126, 127, 128, 129],
  ...[130, 131, 132, 133, 134, 135, 136, 240],
];
for (const frame of forbiddenWinterFrames) {
  if (winterUsableFrames.has(frame + 1)) {
    throw new Error('冬季帧白名单与禁用清单冲突：' + frame);
  }
}
const assertFrames = (frames, allowed, label) => {
  for (const frame of frames) {
    if (!allowed.has(frame)) throw new Error(label + ' 使用了未核验/占位帧：' + frame);
  }
};

const [world, manifest, terraceMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.terraceMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (terraceMap.id !== terraceId || terraceMap.grid.length !== 100) {
  throw new Error('Round 92 需要 Round 91 的雁回崖百格地图作为入关关口。');
}
if (world.atlasArt !== undefined &&
  world.atlasArt.columns > overview.columns && world.atlasArt.rows > overview.rows) {
  overview.columns = world.atlasArt.columns;
  overview.rows = world.atlasArt.rows;
  overview.tileSize = world.atlasArt.tileSize;
}

// ---------------------------------------------------------------------------
// 第一部分：在 640×448 舆图北部的既有空白带上，用 OpenGameArt zaphgames
// Winter CC0 图素绘制照雪关雪原；旧三十三层逐格保持原样，画布尺寸不变。
// ---------------------------------------------------------------------------
const previous = world.atlasArt;
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
if (atlasReady) {
  // Round 92 图层由本脚本完全托管；重跑时先剔除自己的旧输出，再从受保护
  // 的基线重建，使以后修订图块帧仍可通过同一生成器安全更新。冬季图集
  // 声明可能已被后续轮次共用，保留原位（下方按内容校验），避免图集
  // 数组顺序随重跑时序漂移。
  previous.layers = previous.layers.filter((layer) => !extensionIds.includes(layer.id));
}
let extensionCount = null;
if (previous !== undefined) {
  if (previous === undefined || previous.columns < expectedOld.columns || previous.rows < expectedOld.rows) {
    throw new Error(`预期 Round 91 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  // 剔除本生成器管理的图层后，舆图必须是「Round 91 基线 33 层 + 后续轮次
  // 图层」；后续轮次的层在本轮五层之后原位保留，不因重跑而丢失。
  if (previous.layers.length < baselineLayerIds.length) {
    throw new Error(`预期至少 ${baselineLayerIds.length} 层基线舆图，实际为 ${previous.layers.length} 层。`);
  }
  if (previous.layers.slice(0, baselineLayerIds.length).map((layer) => layer.id).join('\n') !== baselineLayerIds.join('\n')) {
    throw new Error('舆图层基线与 Round 91 输出的 33 层序列不符，拒绝重建。');
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 92 图层；请先恢复干净的 Round 91 状态。');
  }
  const winterTiles = {
    id: 'opengameart.winter-tileset-zaph',
    image: 'assets/opengameart/winter-tileset-zaph/tileset.png',
    tileSize: 16,
    columns: 16,
    rows: 16,
    spacing: 0,
    tileCount: 256,
  };
  const winterExisting = previous.tilesets.find((tileset) => tileset.id === winterTiles.id);
  if (winterExisting !== undefined) {
    if (JSON.stringify(winterExisting) !== JSON.stringify(winterTiles)) {
      throw new Error('舆图的冬季图集声明与 Round 92 登记内容不一致。');
    }
  } else {
    previous.tilesets.push(winterTiles);
  }

  // 照雪关雪原：北部空白带上的冰崖环缘 + 雪原铺地 + 雪松/关墙/灯点缀，
  // 一条雪径自雁回崖高原北缘岔出，向北接入雪原南缘。
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 733, 0x45d9f3b) ^ Math.imul(row + 557, 0x119de1f3) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const passField = { col: passAtlasCell.col, row: passAtlasCell.row, radiusX: 30, radiusY: 17 };
  const onPass = (col, row) => {
    const dx = (col - passField.col) / passField.radiusX;
    const dy = (row - passField.row) / passField.radiusY;
    const edge = ((hash(col, row, 0x9201) % 1000) / 1000 - 0.5) * 0.08;
    return dx * dx + dy * dy <= 1 + edge;
  };
  // 雁回崖高原（Round 91）：中心 (576,96)、半径 34×27、含抖动。照雪关
  // 投影与其最北缘 rows ≈ 68 相距 25 行以上，绘制前仍逐格断言互不重叠。
  const onTerrace = (col, row) => {
    const dx = (col - 576) / 34;
    const dy = (row - 96) / 27;
    return dx * dx + dy * dy <= 1.05;
  };
  const inNorthBand = (col, row) => col >= 512 && row < 384;
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;
  const routeCells = new Map();
  {
    const routeSegments = [
      { from: at(576, 66), to: at(577, 58) },
      { from: at(577, 58), to: at(576, 50) },
      { from: at(576, 50), to: at(576, 44) },
    ];
    const routeFramesAtlas = toGids([0]);
    for (const segment of routeSegments) {
      const steps = Math.max(Math.abs(segment.to.col - segment.from.col), Math.abs(segment.to.row - segment.from.row));
      for (let step = 0; step <= steps; step += 1) {
        const ratio = steps === 0 ? 0 : step / steps;
        const col = Math.round(segment.from.col + (segment.to.col - segment.from.col) * ratio);
        const row = Math.round(segment.from.row + (segment.to.row - segment.from.row) * ratio);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
          const cell = at(col + dx, row + dy);
          if (inAtlasBounds(cell.col, cell.row) && inNorthBand(cell.col, cell.row)) {
            routeCells.set(key(cell.col, cell.row), routeFramesAtlas[hash(cell.col, cell.row, 0x9202) % routeFramesAtlas.length]);
          }
        }
      }
    }
    assertFrames(routeFramesAtlas, winterUsableFrames, '舆图雪径');
  }
  const snowFieldFrames = toGids(reviewedSnowFrames);
  const pineFramesAtlas = toGids(reviewedPineFrames);
  const wallFramesAtlas = toGids(reviewedWallFrames);
  const cliffFramesAtlas = toGids(reviewedCliffFrames);
  const detailFramesAtlas = toGids([...reviewedStoneFrames, ...reviewedDriftFrames]);
  assertFrames(snowFieldFrames, winterUsableFrames, '舆图雪原');
  assertFrames(pineFramesAtlas, winterUsableFrames, '舆图雪松');
  assertFrames(wallFramesAtlas, winterUsableFrames, '舆图关墙');
  assertFrames(cliffFramesAtlas, winterUsableFrames, '舆图冰崖');
  assertFrames(detailFramesAtlas, winterUsableFrames, '舆图点缀');
  const newSnow = Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
  const newTrees = newSnow.map((line) => [...line]);
  const newWalls = newSnow.map((line) => [...line]);
  const newDetails = newSnow.map((line) => [...line]);
  const newRoute = newSnow.map((line) => [...line]);
  extensionCount = { snow: 0, cliffs: 0, trees: 0, walls: 0, route: 0 };
  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (!inNorthBand(col, row)) continue;
      if (onTerrace(col, row)) continue;
      const routeFrame = routeCells.get(key(col, row));
      if (routeFrame !== undefined) {
        newRoute[row][col] = routeFrame;
        extensionCount.route += 1;
      }
      if (!onPass(col, row)) continue;
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
        [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) =>
        !inAtlasBounds(col + dx, row + dy) || !onPass(col + dx, row + dy) || onTerrace(col + dx, row + dy),
      );
      const seed = hash(col, row, 0x9203);
      if (rim) {
        // 环缘以冰崖勾勒雪原轮廓；偶有石堆点缀。
        if (seed % 100 < 82) {
          newDetails[row][col] = cliffFramesAtlas[seed % cliffFramesAtlas.length];
          extensionCount.cliffs += 1;
        } else {
          newDetails[row][col] = detailFramesAtlas[(seed >>> 8) % detailFramesAtlas.length];
        }
        continue;
      }
      newSnow[row][col] = snowFieldFrames[seed % snowFieldFrames.length];
      extensionCount.snow += 1;
      // 照雪关关墙意象：雪原中北部一段东西向石墙，正中留关楼灯窗。
      const wallBand = row >= 20 && row <= 22 && col >= 562 && col <= 590;
      if (wallBand && seed % 100 < 72) {
        newWalls[row][col] = wallFramesAtlas[seed % wallFramesAtlas.length];
        extensionCount.walls += 1;
        continue;
      }
      if (seed % 100 < 12) {
        newTrees[row][col] = pineFramesAtlas[hash(col, row, 0x9204) % pineFramesAtlas.length];
        extensionCount.trees += 1;
      } else if (seed % 100 < 24) {
        newDetails[row][col] = detailFramesAtlas[(seed >>> 8) % detailFramesAtlas.length];
      }
    }
  }
  if (extensionCount.snow < 1_200 || extensionCount.cliffs < 200 || extensionCount.route < 18 ||
    extensionCount.trees < 90 || extensionCount.walls < 40) {
    throw new Error('扩展舆图的照雪关地貌数量不足：' + JSON.stringify(extensionCount));
  }
  if (!onPass(passAtlasCell.col, passAtlasCell.row) || onTerrace(passAtlasCell.col, passAtlasCell.row)) {
    throw new Error('照雪关区域中心没有落在新增雪原上，或与雁回崖高原重叠。');
  }

  const addedLayers = [
    { id: 'world-r92-pass-snow', tilesetId: winterTiles.id, cells: newSnow },
    { id: 'world-r92-pass-trees', tilesetId: winterTiles.id, cells: newTrees },
    { id: 'world-r92-pass-walls', tilesetId: winterTiles.id, cells: newWalls },
    { id: 'world-r92-pass-detail', tilesetId: winterTiles.id, cells: newDetails },
    { id: 'world-r92-pass-route', tilesetId: winterTiles.id, cells: newRoute },
  ];
  const existingIds = new Set(previous.layers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 92 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }
  // 新层只在北部空白带绘制：旧 512×384 矩形与雁回崖高原逐格保持零像素。
  for (const layer of addedLayers) {
    for (let row = 0; row < overview.rows; row += 1) {
      for (let col = 0; col < overview.columns; col += 1) {
        if (layer.cells[row][col] !== 0 && (!inNorthBand(col, row) || onTerrace(col, row))) {
          throw new Error(`Round 92 图层 ${layer.id} 在受保护区域绘制：(${col}, ${row})。`);
        }
      }
    }
  }

  // 既有区域的绝对像素中心保持不变；照雪关照常追加，不动旧锚点。
  const regionFootprint = previous.regionFootprint ?? {
    columns: expectedOld.columns * 0.16,
    rows: expectedOld.rows * 0.16,
  };
  // 本生成器五层插回基线之后、后续轮次图层之前，保持首次发布的层序。
  const laterLayers = previous.layers.slice(baselineLayerIds.length);
  const atlasTilesets = previous.tilesets;
  const atlasArt = {
    ...overview,
    regionFootprint,
    tilesets: atlasTilesets,
    layers: [...previous.layers.slice(0, baselineLayerIds.length), ...addedLayers, ...laterLayers],
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
  if (atlasArt.layers.length !== baselineLayerIds.length + extensionIds.length + laterLayers.length) {
    throw new Error(`扩展后舆图应为 ${baselineLayerIds.length + extensionIds.length + laterLayers.length} 层，实际为 ${atlasArt.layers.length} 层。`);
  }
  const oldIds = new Set(previous.layers.map((layer) => layer.id));
  if (oldIds.size !== previous.layers.length) {
    throw new Error('舆图基线与后续图层 id 不唯一。');
  }
  world.atlasArt = atlasArt;
}

// ---------------------------------------------------------------------------
// 第二部分：生成 100×100 照雪关可玩地图。雪原/冰河/关墙全部取自
// OpenGameArt zaphgames Winter CC0 图素；人物沿用 Puny Characters；
// 碰撞只由 grid 决定。
// ---------------------------------------------------------------------------
const winterId = 'opengameart.winter-tileset-zaph';
const actorId = 'opengameart.puny-characters';
const winterTileset = {
  id: winterId,
  image: 'assets/opengameart/winter-tileset-zaph/tileset.png',
  tileSize: 16,
  columns: 16,
  rows: 16,
  spacing: 0,
  tileCount: 256,
};
const actorDeclaration = terraceMap.art?.tilesets.find((entry) => entry.id === actorId);
if (actorDeclaration === undefined) throw new Error('雁回崖缺少已登记的 Puny Characters 图集声明。');
const tilesets = [winterTileset, actorDeclaration];
const tilesetById = new Map(tilesets.map((entry) => [entry.id, entry]));
const actorTileset = tilesetById.get(actorId);

// 布局锚点：南口入关/回程、镜面冰河渡口、照雪烽燧与守烽人、北界碑。
const start = at(50, 97);
const passReturn = at(49, 97);
const keeperPosition = at(50, 26);
const beaconEventCell = at(58, 23);
const riverEventCell = at(50, 49);
const cairnEventCell = at(50, 8);

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
addRoad([start, at(50, 88), at(50, 72), at(50, 62)]);
addRoad([at(50, 62), riverEventCell, at(50, 44)]);
addRoad([at(50, 44), at(50, 36), at(50, 28)]);
addRoad([at(50, 28), keeperPosition]);
addRoad([at(50, 26), at(50, 24), at(50, 16), cairnEventCell]);
addRoad([at(50, 24), at(54, 23), beaconEventCell]);

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
  { id: 'landmark.r92-south-gate', mapResourceId: mapId, ...start, name: '北境栈口', category: 'crossing' },
  { id: 'landmark.r92-mirror-river', mapResourceId: mapId, ...riverEventCell, name: '镜面冰河', category: 'route', discoveryNodeId: nodeIds.river },
  { id: 'landmark.r92-snow-beacon', mapResourceId: mapId, ...beaconEventCell, name: '照雪烽燧', category: 'other', discoveryNodeId: nodeIds.beacon },
  { id: 'landmark.r92-north-cairn', mapResourceId: mapId, ...cairnEventCell, name: '北界碑', category: 'other', discoveryNodeId: nodeIds.cairn },
];
for (const point of [start, passReturn, keeperPosition, beaconEventCell, riverEventCell, cairnEventCell]) {
  reserveAnchor('人物/关口/地标', point, 2);
}
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

// 地形谓词：南部雪原与极北雪原被镜面冰河切开，两道冰缝间只有中渡可过；
// 关墙横贯 rows 32，正中留门；烽燧石台立在中北部，北界碑守极北。
const river = { fromRow: 42, toRow: 56, fromCol: 3, toCol: 96 };
const wallRow = 32;
const wallGateFromCol = 49;
const wallGateToCol = 51;
const crossingFromCol = 44;
const crossingToCol = 56;
const beacon = { fromCol: 57, toCol: 59, fromRow: 20, toRow: 22 };
const insideRiver = (col, row) => col >= river.fromCol && col <= river.toCol &&
  row >= river.fromRow && row <= river.toRow;
const onWall = (col, row) => row === wallRow && col >= 3 && col <= 96 &&
  !(col >= wallGateFromCol && col <= wallGateToCol);
const insideBeacon = (col, row) => col >= beacon.fromCol && col <= beacon.toCol &&
  row >= beacon.fromRow && row <= beacon.toRow;
const onCrevasse = (col, row) => insideRiver(col, row) && (row === 46 || row === 52) &&
  !(col >= crossingFromCol && col <= crossingToCol);
const massifs = [
  { col: 20, row: 80, radiusX: 9, radiusY: 8, salt: 0x9211, cliff: false },
  { col: 80, row: 84, radiusX: 8, radiusY: 7, salt: 0x9212, cliff: false },
  { col: 34, row: 64, radiusX: 5, radiusY: 4, salt: 0x9213, cliff: true },
  { col: 14, row: 14, radiusX: 8, radiusY: 7, salt: 0x9214, cliff: false },
  { col: 86, row: 12, radiusX: 7, radiusY: 6, salt: 0x9215, cliff: true },
  { col: 28, row: 38, radiusX: 5, radiusY: 3, salt: 0x9216, cliff: false },
  { col: 74, row: 58, radiusX: 5, radiusY: 3, salt: 0x9217, cliff: false },
];
function massifArtAt(col, row) {
  for (const shape of massifs) {
    const x = (col - shape.col) / shape.radiusX;
    const y = (row - shape.row) / shape.radiusY;
    if (x * x + y * y <= 1) return shape.cliff ? 'cliff' : 'pine';
  }
  return null;
}
function inMassif(col, row) {
  return massifArtAt(col, row) !== null;
}
function hashCell(col, row, salt) {
  let value = Math.imul(col + 353, 0x45d9f3b) ^ Math.imul(row + 613, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

const snowFrames = toGids(reviewedSnowFrames);
const iceFrames = toGids(reviewedIceFrames);
const iceFrameAtRow = (row) => iceFrames[(row - river.fromRow) % iceFrames.length];
const trailFrames = toGids([1]);
const flourishFrames = toGids(reviewedDriftFrames);
const stoneFrames = toGids(reviewedStoneFrames);
const pineFrames = toGids(reviewedPineFrames);
const wallFrames = toGids(reviewedWallFrames);
const cliffFrames = toGids(reviewedCliffFrames);
assertFrames([...snowFrames, ...iceFrames, ...trailFrames, ...flourishFrames,
  ...stoneFrames, ...pineFrames, ...wallFrames, ...cliffFrames],
winterUsableFrames, '照雪关环境');

const ground = blank();
const trail = blank();
const flourish = blank();
const walls = blank();
const pines = blank();
const cliffs = blank();
const accents = blank();
const grid = Array.from({ length: rows }, () => Array(columns).fill('.'));
let cliffCount = 0;
let massifCellCount = 0;
for (let row = 0; row < rows; row += 1) {
  for (let col = 0; col < columns; col += 1) {
    const cellKey = key(col, row);
    const seed = hashCell(col, row, 0x9204);
    const road = roads.has(cellKey);
    const anchor = anchors.has(cellKey);
    const southGate = col >= 48 && col <= 52;
    const boundary = col < 3 || col > 96 || row < 3 || (row > 96 && !southGate);

    if (onCrevasse(col, row)) {
      grid[row][col] = '~';
      ground[row][col] = iceFrameAtRow(row);
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    if (insideRiver(col, row)) {
      // 冰面可行（'='），中渡踏痕压出一条雪道。
      grid[row][col] = '=';
      ground[row][col] = iceFrameAtRow(row);
      if (road || anchor) trail[row][col] = trailFrames[(seed >>> 4) % trailFrames.length];
      continue;
    }
    if (boundary) {
      grid[row][col] = '#';
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    if (onWall(col, row) || insideBeacon(col, row)) {
      grid[row][col] = '#';
      walls[row][col] = wallFrames[seed % wallFrames.length];
      continue;
    }
    // 可行走地带：雪原铺雪，主路压踏痕，近河滩涂为浅雪。
    const nearRiver = row >= river.fromRow - 3 && row <= river.toRow + 3;
    ground[row][col] = snowFrames[seed % snowFrames.length];
    if (road || anchor) {
      trail[row][col] = trailFrames[seed % trailFrames.length];
    } else if (nearRiver) {
      grid[row][col] = ',';
      if (seed % 100 < 9) flourish[row][col] = flourishFrames[(seed >>> 8) % flourishFrames.length];
    } else if (seed % 100 < 8) {
      flourish[row][col] = flourishFrames[(seed >>> 8) % flourishFrames.length];
    } else if (seed % 100 < 14) {
      flourish[row][col] = stoneFrames[(seed >>> 8) % stoneFrames.length];
    }
    const massif = !road && !anchor && inMassif(col, row);
    if (massif) {
      massifCellCount += 1;
      grid[row][col] = '#';
      // 雪松成障或冰崖成障，按群分派；踏痕与点缀让位。
      if (massifArtAt(col, row) === 'cliff') {
        cliffs[row][col] = cliffFrames[hashCell(col, row, 0x9205) % cliffFrames.length];
      } else {
        pines[row][col] = pineFrames[hashCell(col, row, 0x9205) % pineFrames.length];
      }
      trail[row][col] = 0;
      flourish[row][col] = 0;
    } else if (seed % 100 < 3 && !road && !anchor) {
      pines[row][col] = pineFrames[hashCell(col, row, 0x9206) % pineFrames.length];
    }
  }
}
// 关门两侧立石座、烽燧南侧与北界碑旁衬石——纯贴图，不占碰撞。
accents[31][47] = wallFrames[2];
accents[31][53] = wallFrames[3];
accents[24][56] = wallFrames[4];
flourish[8][cairnEventCell.col] = stoneFrames[3];

const mapGrid = grid.map((line) => line.join(''));
// Count the actual collision contract; crevasses, walls, beacon and massifs
// stay solid in the independent grid while the river deck stays walkable.
const walkableCount = mapGrid.reduce(
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
const reachable = reachableFrom(start, mapGrid, columns, rows, '照雪关');
for (const point of [passReturn, keeperPosition, beaconEventCell, riverEventCell, cairnEventCell]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('照雪关锚点不可达：' + key(point.col, point.row));
}
// 照雪烽燧是 E 键调查点：事件格自身可走，且至少一个正交邻格从入口可达。
const beaconApproachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  reachable.has(key(beaconEventCell.col + dx, beaconEventCell.row + dy)),
);
if (!beaconApproachable) throw new Error('照雪烽燧在调查距离内没有可通行接近格。');
if (walkableCount < 6_500 || reachable.size < 5_500) {
  throw new Error('照雪关可行/连通格数量不足：可行 ' + walkableCount + '，连通 ' + reachable.size);
}
if (keeperPosition.col === start.col && keeperPosition.row === start.row) {
  throw new Error('守烽人占住了北境栈口。');
}
if (passReturn.col === start.col && passReturn.row === start.row) {
  throw new Error('回程关口与北境栈口重合。');
}

// 雁回崖一侧的关口格必须可通行、可从北台栈口出生点抵达，且不压既有锚点。
const terraceGate = at(50, 2);
const terraceArrival = at(49, 2);
const terraceSolid = new Set(
  Object.entries(terraceMap.tileTypes ?? {}).filter(([, type]) => type?.solid).map(([glyph]) => glyph),
);
function terraceWalkable(point) {
  const glyph = terraceMap.grid[point.row]?.[point.col];
  return glyph !== undefined && !terraceSolid.has(glyph);
}
for (const point of [terraceGate, terraceArrival]) {
  if (!terraceWalkable(point)) {
    throw new Error('雁回崖北境关口不可通行：' + key(point.col, point.row));
  }
}
const terraceStart = terraceMap.playerStart;
const terraceReachable = reachableFrom(
  { col: terraceStart.col, row: terraceStart.row },
  terraceMap.grid, terraceMap.columns, terraceMap.rows, '雁回崖',
);
for (const point of [terraceGate, terraceArrival]) {
  if (!terraceReachable.has(key(point.col, point.row))) {
    throw new Error('雁回崖北境关口不可从出生点抵达：' + key(point.col, point.row));
  }
}
const terraceOccupied = new Set([
  key(terraceStart.col, terraceStart.row),
  ...(world.events ?? []).filter((entry) => entry.mapResourceId === terraceId).map((entry) => key(entry.col, entry.row)),
  ...(world.landmarks ?? []).filter((entry) => entry.mapResourceId === terraceId).map((entry) => key(entry.col, entry.row)),
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r92-')).flatMap((entry) => [
    entry.from.mapResourceId === terraceId ? key(entry.from.col, entry.from.row) : null,
    entry.to.mapResourceId === terraceId ? key(entry.to.col, entry.to.row) : null,
  ]).filter(Boolean),
]);
for (const point of [terraceGate, terraceArrival]) {
  if (terraceOccupied.has(key(point.col, point.row))) {
    throw new Error('雁回崖新关口与既有玩法锚点重叠：' + key(point.col, point.row));
  }
}

const mapData = {
  id: mapId,
  name: '北境·照雪关',
  tileSize: 48,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#dfe9ec', solid: false },
    ',': { color: '#c2d3d8', solid: false },
    '=': { color: '#9fd0e8', solid: false },
    '#': { color: '#5c6a75', solid: true },
    '~': { color: '#3f6f8f', solid: true },
  },
  grid: mapGrid,
  playerStart: start,
  art: {
    tileSize: 16,
    tilesets,
    actors: { ...terraceMap.art.actors },
    layers: [
      { id: 'r92-pass-ground', tilesetId: winterId, cells: ground },
      { id: 'r92-pass-trail', tilesetId: winterId, cells: trail },
      { id: 'r92-pass-flourish', tilesetId: winterId, cells: flourish },
      { id: 'r92-pass-pines', tilesetId: winterId, depthSort: 'y', cells: pines },
      { id: 'r92-pass-cliffs', tilesetId: winterId, depthSort: 'y', cells: cliffs },
      { id: 'r92-pass-walls', tilesetId: winterId, depthSort: 'y', cells: walls },
      { id: 'r92-pass-accents', tilesetId: winterId, depthSort: 'y', cells: accents },
    ],
  },
};
for (const layer of mapData.art.layers) {
  const tileset = tilesetById.get(layer.tilesetId);
  if (tileset === undefined) throw new Error('照雪关图层引用未声明图集：' + layer.id);
  const used = new Set();
  for (const rowCells of layer.cells) for (const gid of rowCells) if (gid !== 0) used.add(gid);
  if (Math.max(0, ...used) > tileset.tileCount) {
    throw new Error(`照雪关图层 ${layer.id} 帧号超出图集容量。`);
  }
  if (tileset.id === winterId) assertFrames(used, winterUsableFrames, '照雪关图层 ' + layer.id);
}

// ---------------------------------------------------------------------------
// 第三部分：原创守烽人、对白、雪燧传烽差事、一次性见闻与知识图谱端点。
// ---------------------------------------------------------------------------
const npcs = {
  npcs: [{
    id: npcIds.keeper,
    name: '谷照雪',
    mapResourceId: mapId,
    position: keeperPosition,
    dialogueId: 'dlg.r92-gu-zhaoxue-vigil',
    questGiver: true,
    spriteFrame: 64,
    spriteFrames: { down: 64, right: 72, up: 80, left: 88 },
    schedule: [
      { periodId: 'period.midnight', position: { col: 51, row: 27 } },
      { periodId: 'period.dawn', position: { col: 58, row: 24 } },
      { periodId: 'period.morning', position: { col: 50, row: 26 } },
      { periodId: 'period.midday', position: { col: 50, row: 26 } },
      { periodId: 'period.afternoon', position: { col: 52, row: 28 } },
      { periodId: 'period.dusk', position: { col: 58, row: 24 } },
      { periodId: 'period.night', position: { col: 51, row: 27 } },
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
      throw new Error('守烽人日程落点不可通行：' + npc.id + '/' + entry.periodId);
    }
  }
}
const quests = {
  quests: [{
    id: questId,
    name: '雪燧传烽',
    description: '守烽人谷照雪请你北上越过镜面冰河，在黄昏、入夜或子夜的落雪天登上照雪烽燧点验本季烽号，把燧书带回给她。',
    giverNpcId: npcIds.keeper,
    objectives: [{
      id: 'objective.r92-arrive-north-pass',
      kind: 'discoverKnowledge',
      targetId: nodeIds.pass,
      requiredCount: 1,
      text: '从雁回崖北境栈口进入照雪关',
    }, {
      id: 'objective.r92-verify-snow-beacon',
      kind: 'discoverKnowledge',
      targetId: nodeIds.beacon,
      requiredCount: 1,
      text: '落雪日的黄昏、入夜或子夜，在照雪烽燧点验烽号',
    }, {
      id: 'objective.r92-report-gu-zhaoxue',
      kind: 'talkToNpc',
      targetId: npcIds.keeper,
      requiredCount: 1,
      text: '把燧书带回给谷照雪',
    }],
    rewards: {
      experience: 34,
      currency: 26,
      discoverKnowledgeNodeIds: [nodeIds.cairn],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r92-gu-zhaoxue-vigil',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '关墙下的石屋里，守烽人谷照雪正把松明捆上燧杆，见你踩雪进来，拍了拍身边的木墩：「北境照雪关，三十年没有生人从雁回崖那边走上来了。你若肯替我上一回燧，把这季的烽号点验清楚，屋里的烈酒分你一坛。」',
        options: [
          {
            text: '燧书我点。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '燧书已经验回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          {
            text: '我正要上燧点验。',
            nextNodeId: 'active',
            conditions: [{ kind: 'questStatus', questId, status: 'active' }],
          },
          { text: '烽燧怎么走？', nextNodeId: 'route' },
          { text: '你在关里守什么？', nextNodeId: 'keeper' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「出关门往北，先过镜面冰河——认准中渡那条踏痕走，两岸的冰缝蓝得发黑，掉下去神仙也捞不上来。过河后石径直上，燧在关墙外东北的高台上。点验要挑落雪日的黄昏、入夜或子夜，雪光映着火号，三里外都数得清。在燧下按 E 记全三烽，回来找我。」' },
      { id: 'active', text: '「记住了：只走中渡，只在落雪日暮夜点验。三烽一号不点全，燧书就作废。我在这儿给你温着酒。」' },
      { id: 'completed', text: '谷照雪接过燧书，凑在灯下逐烽核对，忽然笑出一口白气：「三烽全对，火色还比去年亮——北境这条线，还活着。」她把一坛烈酒墩在你面前，酒封上落着经年的雪印。' },
      { id: 'route', text: '「南栈口进来一路向北，冰河中渡有踏痕；过了河是关门，我就在门里住。燧台在东北高处，台南留了踏脚的雪坡。再往北走到雪原尽头，有块北界碑——界外就不是大梁的地图了。」' },
      { id: 'keeper', text: '「谷家四代守这盏燧。烽号是北境的命：雪原上什么都会白得一样，只有火不会。祖父说，只要照雪烽还亮着，山下的人就知道关外还有人。」' },
      { id: 'farewell', text: '谷照雪重新背起燧杆，向东北高台的方向走去，靴印在雪地里拖出长长一行。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '北境·照雪关',
  description: '雁回崖以北的极北雪原，镜面冰河与照雪烽燧之间横着一道老关墙，守着大梁版图最北的界线。',
  atlasPosition: {
    x: Number(((passAtlasCell.col / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number(((passAtlasCell.row / (overview.rows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r92-terrace-to-north-pass',
    name: '北境栈道',
    from: { mapResourceId: terraceId, ...terraceGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r92-north-pass-to-terrace',
    name: '南归雪道',
    from: { mapResourceId: mapId, ...passReturn },
    to: { mapResourceId: terraceId, ...terraceArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '栈道尽头雪光一亮：无边的白色原野上，一道石墙横贯天际，墙外东北的高台顶着一柱未熄的烽烟——北境·照雪关到了。',
    approachText: '北面的雪原亮得晃眼，风里带着极北的干冷。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.pass,
  },
  {
    id: nodeIds.riverEvent,
    mapResourceId: mapId,
    ...riverEventCell,
    text: '镜面冰河平得能照出人影，脚下的冰层深处封着一串气泡。两岸各有一道蓝黑色的冰缝，只有中渡的踏痕连成一线——每年雪季，照雪关的给养都从这条线上拖过河。',
    approachText: '河面上的踏痕笔直向北，两侧冰缝幽蓝。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.river,
  },
  {
    id: nodeIds.beaconEvent,
    mapResourceId: mapId,
    ...beaconEventCell,
    text: '照雪烽燧的石台上积着新雪，燧杆的火池里松明还冒着烟。雪光映着火号，三烽连成一线——一烽报平安，二烽报客至，三烽，报北境有事。谷照雪的燧书上，这一季还空着最后一行。',
    approachText: '东北高台的燧火在雪幕里明明灭灭。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.beacon,
    conditions: {
      periodIds: ['period.dusk', 'period.night', 'period.midnight'],
      weatherIds: ['weather.snow'],
    },
    interaction: {
      prompt: '在照雪烽燧点验本季烽号',
      range: 1,
      approachDirections: ['down', 'left', 'right'],
    },
  },
  {
    id: nodeIds.cairnEvent,
    mapResourceId: mapId,
    ...cairnEventCell,
    text: '北界碑立在雪原尽头，碑面的刻字被风雪磨得只剩浅痕：「大梁北界，至此为限」。碑北的雪再无人扫，也无路可走——界外的事，只有烽火知道。',
    approachText: '雪原尽头的石碑下埋着半截界绳，碑面刻痕已浅。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.cairn,
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '北境照雪关探索地图', summary: '从雁回崖北境栈口可入的照雪关百格地图。', knownByDefault: false },
  { id: nodeIds.pass, kind: 'place', title: '北境·照雪关', summary: '雁回崖以北的极北雪原，冰河、关墙与烽燧守着版图北界。', knownByDefault: false },
  { id: nodeIds.river, kind: 'place', title: '镜面冰河', summary: '横过照雪关中部的封冻冰河，只有中渡踏痕可以过人。', knownByDefault: false },
  { id: nodeIds.beacon, kind: 'place', title: '照雪烽燧', summary: '关墙外东北高台上的石燧，雪夜烽号三里外可见。', knownByDefault: false },
  { id: nodeIds.cairn, kind: 'place', title: '北界碑', summary: '雪原尽头的界碑，刻着大梁北界的极限。', knownByDefault: false },
  { id: nodeIds.keeper, kind: 'character', title: '谷照雪', summary: '谷家第四代守烽人，在照雪关的石屋里守着北境烽号。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '雪燧传烽', summary: '越过镜面冰河在照雪烽燧点验烽号，把燧书带回给谷照雪。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初入照雪关', summary: '从雁回崖北境栈口首次踏上北境雪原。', knownByDefault: false },
  { id: nodeIds.riverEvent, kind: 'event', title: '冰河中渡', summary: '在镜面冰河中渡认清守关人拖粮的旧线。', knownByDefault: false },
  { id: nodeIds.beaconEvent, kind: 'event', title: '雪夜点燧', summary: '落雪日暮夜在照雪烽燧点验本季烽号。', knownByDefault: false },
  { id: nodeIds.cairnEvent, kind: 'event', title: '界碑读雪', summary: '在北界碑下读出大梁版图的北限。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r92-arrival-pass', fromId: nodeIds.arrival, toId: nodeIds.pass, relation: 'triggers', summary: '初入照雪关时发现北境·照雪关。' },
  { id: 'kg.edge.r92-pass-map', fromId: nodeIds.pass, toId: mapId, relation: 'locatedAt', summary: '照雪关由百格探索地图承载。' },
  { id: 'kg.edge.r92-river-event', fromId: nodeIds.riverEvent, toId: nodeIds.river, relation: 'triggers', summary: '过河中渡后认清镜面冰河的走向。' },
  { id: 'kg.edge.r92-beacon-event', fromId: nodeIds.beaconEvent, toId: nodeIds.beacon, relation: 'triggers', summary: '雪夜点燧后记下照雪烽燧的位置。' },
  { id: 'kg.edge.r92-cairn-event', fromId: nodeIds.cairnEvent, toId: nodeIds.cairn, relation: 'triggers', summary: '寻得界碑后读出北界碑的刻文。' },
  { id: 'kg.edge.r92-keeper-location', fromId: nodeIds.keeper, toId: mapId, relation: 'locatedAt', summary: '谷照雪在照雪关墙内守燧。' },
  { id: 'kg.edge.r92-keeper-quest', fromId: nodeIds.keeper, toId: nodeIds.quest, relation: 'participatesIn', summary: '谷照雪委托玩家点验本季烽号。' },
  { id: 'kg.edge.r92-quest-beacon', fromId: nodeIds.quest, toId: nodeIds.beacon, relation: 'requires', summary: '雪燧传烽需要玩家上照雪烽燧调查。' },
  { id: 'kg.edge.r92-quest-cairn', fromId: nodeIds.quest, toId: nodeIds.cairn, relation: 'rewards', summary: '完成雪燧传烽后得知北界碑的方位。' },
  { id: 'kg.edge.r92-pass-terrace', fromId: nodeIds.pass, toId: terraceId, relation: 'locatedAt', summary: '照雪关从雁回崖北境栈口进入。' },
];
const resourceEntries = [
  { id: 'map.round-92-north-pass', path: 'maps/round-92-north-pass.json', schema: 'grid-map' },
  { id: 'npc.round-92-north-pass-set', path: 'characters/round-92-north-pass-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-92-north-pass-set', path: 'dialogues/round-92-north-pass-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-92-north-pass-set', path: 'quests/round-92-north-pass-quests.json', schema: 'quest-set' },
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
  writeManagedJson(paths.map, mapData, '照雪关地图'),
  writeManagedJson(paths.npcs, npcs, '照雪关人物'),
  writeManagedJson(paths.dialogues, dialogues, '照雪关对白'),
  writeManagedJson(paths.quests, quests, '照雪关任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Rebuilt the Round 92 extension in the ${overview.columns}×${overview.rows} atlas from its protected Round 91 layers.`);
} else {
  console.log(`Extended the ${overview.columns}×${overview.rows} atlas to ${world.atlasArt.layers.length} layers (${world.regions.length} regions retained).`);
}
console.log(`Round 92 CC0 winter extension: ${extensionCount.snow} snow field, ${extensionCount.cliffs} rock rim, ${extensionCount.trees} pines, ${extensionCount.walls} wall, ${extensionCount.route} trail cells.`);
console.log(
  'Generated ' + mapData.name + ': ' + walkableCount + ' walkable cells, ' +
  reachable.size + ' entrance-reachable cells, ' + cliffCount + ' cliff tiles, ' +
  massifCellCount + ' massif cells; two-way terrace gates and ' +
  landmarks.length + ' landmarks.',
);
