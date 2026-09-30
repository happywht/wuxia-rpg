import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  passMap: resolve(base, 'maps/round-92-north-pass.json'),
  map: resolve(base, 'maps/round-93-snow-pine-valley.json'),
  npcs: resolve(base, 'characters/round-93-snow-pine-valley-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-93-snow-pine-valley-conversations.json'),
  quests: resolve(base, 'quests/round-93-snow-pine-valley-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-93-snow-pine-valley';
const passId = 'map.round-92-north-pass';
const npcIds = { patroller: 'char.r93-liu-xunjing' };
const questId = 'quest.r93-boundary-mark';
const nodeIds = {
  valley: 'place.r93-snow-pine-valley',
  pineSea: 'place.r93-pine-sea',
  oldMark: 'place.r93-old-mark',
  windGap: 'place.r93-wind-gap',
  patroller: npcIds.patroller,
  quest: questId,
  arrival: 'event.r93-arrival',
  pineSeaEvent: 'event.r93-pine-sea',
  oldMarkEvent: 'event.r93-old-mark',
  windGapEvent: 'event.r93-wind-gap',
};
const overview = { columns: 640, rows: 448, tileSize: 16 };
const expectedOld = { columns: 640, rows: 448 };
const extensionIds = [
  'world-r93-valley-snow', 'world-r93-valley-trees', 'world-r93-valley-walls',
  'world-r93-valley-detail', 'world-r93-valley-route',
];
// Round 92 输出的 38 层基线 id 序列（33 层 Round 91 基线 + 五层照雪关）。
// 后续轮次（Round 94 起）的图层追加在本生成器五层之后；重跑时这些后续层
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
  'world-r92-pass-snow', 'world-r92-pass-trees', 'world-r92-pass-walls',
  'world-r92-pass-detail', 'world-r92-pass-route',
];
// 受保护的既有地貌层：R79/R81/R84/R85/R87 扩展层 + 雁回崖 + 照雪关。
// Round 93 的新层不得与其中任何一格已涂像素重叠。
const protectedLayerIds = [
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
  'world-r92-pass-snow', 'world-r92-pass-trees', 'world-r92-pass-walls',
  'world-r92-pass-detail', 'world-r92-pass-route',
];
// 霜松谷区域中心固定投影到 640×448 舆图的 (432,24) 格——照雪关雪原以
// 西的北境空白带，与十二个旧区域投影、雁回崖高原和照雪关雪原互不重叠；
// 两片雪原之间以一条东西向冰桥雪道相连。
const valleyAtlasCell = { col: 432, row: 24 };
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
    throw new Error('Round 93 图谱条目与生成器声明不一致；请先移除冲突的 Round 93 条目。');
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

// OpenGameArt zaphgames「Winter Tileset [16x16]」逐帧用途白名单——与
// Round 92 相同的目检许可帧，本轮不引入任何新素材。0 是连贯雪地底砖；
// 51/67 是冰池中段，用来拼冰桥与冰溪；16/32/48/64/80/96 是雪松；
// 1/2/17/18 是雪石；105-109 是灰砖。大片纯灰白格是空白占位，木牌、
// 屋顶、圆池边缘及玫红 chroma-key 不能铺路。引擎 gid 为 1-based。
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

const [world, manifest, passMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.passMap),
  readJson(paths.nodes), readJson(paths.edges),
]);
if (passMap.id !== passId || passMap.grid.length !== 100) {
  throw new Error('Round 93 需要 Round 92 的照雪关百格地图作为入谷关口。');
}
if (world.atlasArt !== undefined &&
  world.atlasArt.columns > overview.columns && world.atlasArt.rows > overview.rows) {
  overview.columns = world.atlasArt.columns;
  overview.rows = world.atlasArt.rows;
  overview.tileSize = world.atlasArt.tileSize;
}

// ---------------------------------------------------------------------------
// 第一部分：在 640×448 舆图北部空白带上，用已登记的 zaphgames Winter CC0
// 图素绘制霜松谷雪原与东西向冰桥；旧三十八层逐格保持原样，画布尺寸不变。
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
  // Round 93 图层由本脚本完全托管；重跑时先剔除自己的旧输出，再从受保护
  // 的 Round 92 基线重建，使以后修订图块帧仍可通过同一生成器安全更新。
  previous.layers = previous.layers.filter((layer) => !extensionIds.includes(layer.id));
}
let extensionCount = null;
if (previous !== undefined) {
  if (previous === undefined || previous.columns < expectedOld.columns || previous.rows < expectedOld.rows) {
    throw new Error(`预期 Round 92 舆图为 ${expectedOld.columns}×${expectedOld.rows}，实际为 ${previous?.columns}×${previous?.rows}。`);
  }
  // 剔除本生成器管理的图层后，舆图必须是「Round 92 基线 38 层 + 后续轮次
  // 图层」；后续轮次的层在本轮五层之后原位保留，不因重跑而丢失。
  if (previous.layers.length < baselineLayerIds.length) {
    throw new Error(`预期至少 ${baselineLayerIds.length} 层基线舆图，实际为 ${previous.layers.length} 层。`);
  }
  if (previous.layers.slice(0, baselineLayerIds.length).map((layer) => layer.id).join('\n') !== baselineLayerIds.join('\n')) {
    throw new Error('舆图层基线与 Round 92 输出的 38 层序列不符，拒绝重建。');
  }
  if (previous.layers.some((layer) => extensionIds.includes(layer.id))) {
    throw new Error('舆图存在残缺的 Round 93 图层；请先恢复干净的 Round 92 状态。');
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
  if (winterExisting === undefined) {
    throw new Error('舆图缺少 Round 92 登记的冬季图集声明；Round 93 不单独引入新图集。');
  }
  if (JSON.stringify(winterExisting) !== JSON.stringify(winterTiles)) {
    throw new Error('舆图的冬季图集声明与 Round 92 登记内容不一致。');
  }

  // 受保护层的已涂像素集合：新层不得与其重叠一格。
  const protectedPainted = new Set();
  const protectedLayers = previous.layers.filter((layer) => protectedLayerIds.includes(layer.id));
  if (protectedLayers.length !== protectedLayerIds.length) {
    throw new Error('舆图缺少受保护的既有地貌层，拒绝绘制霜松谷。');
  }
  for (const layer of protectedLayers) {
    for (let row = 0; row < overview.rows; row += 1) {
      for (let col = 0; col < overview.columns; col += 1) {
        if (layer.cells[row][col] !== 0) protectedPainted.add(key(col, row));
      }
    }
  }
  if (protectedPainted.size < 40_000) {
    throw new Error('受保护地貌层像素异常偏少：' + protectedPainted.size);
  }

  // 霜松谷雪原：北部空白带上的冰崖环缘 + 雪原铺地 + 雪松林海点缀；
  // 一条东西向冰桥自雪原东缘伸向照雪关西缘。
  const hash = (col, row, salt) => {
    let value = Math.imul(col + 839, 0x45d9f3b) ^ Math.imul(row + 641, 0x119de1f3) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const valleyField = { col: valleyAtlasCell.col, row: valleyAtlasCell.row, radiusX: 30, radiusY: 17 };
  const onValley = (col, row) => {
    const dx = (col - valleyField.col) / valleyField.radiusX;
    const dy = (row - valleyField.row) / valleyField.radiusY;
    const edge = ((hash(col, row, 0x9301) % 1000) / 1000 - 0.5) * 0.08;
    return dx * dx + dy * dy <= 1 + edge;
  };
  // 照雪关雪原（Round 92）：中心 (576,24)、半径 30×17、含抖动。哈希
  // 公式与 Round 92 生成器逐字一致，保证椭圆判定不因复写而漂移。霜松
  // 谷投影与其相距 144 格以上，绘制前仍逐格断言互不重叠。
  const onPass = (col, row) => {
    const dx = (col - 576) / 30;
    const dy = (row - 24) / 17;
    let value = Math.imul(col + 733, 0x45d9f3b) ^ Math.imul(row + 557, 0x119de1f3) ^ 0x9201;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    const edge = (((value ^ (value >>> 16)) >>> 0) % 1000) / 1000;
    return dx * dx + dy * dy <= 1 + (edge - 0.5) * 0.08;
  };
  // 雁回崖高原（Round 91）：中心 (576,96)、半径 34×27。
  const onTerrace = (col, row) => {
    const dx = (col - 576) / 34;
    const dy = (row - 96) / 27;
    return dx * dx + dy * dy <= 1.05;
  };
  // 冰桥：连接霜松谷东缘 (462,24) 与照雪关西缘 (546,24)，止于 545 以
  // 避开关墙环缘；带内仍是空白带，逐格由 protectedPainted 断言兜底。
  const inBridge = (col, row) => col >= 460 && col <= 545 && row >= 22 && row <= 26;
  const inPaintBand = (col, row) => (row >= 0 && row < 60 && col >= 380 && col <= 545);
  const inAtlasBounds = (col, row) => col >= 0 && row >= 0 && col < overview.columns && row < overview.rows;

  const snowFieldFrames = toGids(reviewedSnowFrames);
  const pineFramesAtlas = toGids(reviewedPineFrames);
  const wallFramesAtlas = toGids(reviewedWallFrames);
  const cliffFramesAtlas = toGids(reviewedCliffFrames);
  const detailFramesAtlas = toGids([...reviewedStoneFrames, ...reviewedDriftFrames]);
  const iceFramesAtlas = toGids(reviewedIceFrames);
  assertFrames(snowFieldFrames, winterUsableFrames, '舆图雪原');
  assertFrames(pineFramesAtlas, winterUsableFrames, '舆图雪松');
  assertFrames(wallFramesAtlas, winterUsableFrames, '舆图谷墙');
  assertFrames(cliffFramesAtlas, winterUsableFrames, '舆图冰崖');
  assertFrames(detailFramesAtlas, winterUsableFrames, '舆图点缀');
  assertFrames(iceFramesAtlas, winterUsableFrames, '舆图冰桥');

  const newSnow = Array.from({ length: overview.rows }, () => Array(overview.columns).fill(0));
  const newTrees = newSnow.map((line) => [...line]);
  const newWalls = newSnow.map((line) => [...line]);
  const newDetails = newSnow.map((line) => [...line]);
  const newRoute = newSnow.map((line) => [...line]);
  extensionCount = { snow: 0, cliffs: 0, trees: 0, walls: 0, route: 0 };
  for (let row = 0; row < overview.rows; row += 1) {
    for (let col = 0; col < overview.columns; col += 1) {
      if (!inPaintBand(col, row)) continue;
      const painted = key(col, row);
      if (protectedPainted.has(painted)) continue;
      const seed = hash(col, row, 0x9302);
      if (inBridge(col, row)) {
        // 冰桥：中轴两行连铺冰池中段，边缘嵌石，桥面向东直抵关墙环缘。
        if (row >= 23 && row <= 25) {
          newRoute[row][col] = iceFramesAtlas[(seed >>> 4) % iceFramesAtlas.length];
          extensionCount.route += 1;
        } else if (seed % 100 < 70) {
          newDetails[row][col] = detailFramesAtlas[(seed >>> 8) % detailFramesAtlas.length];
        }
        continue;
      }
      if (!onValley(col, row)) continue;
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2],
        [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) =>
        !inAtlasBounds(col + dx, row + dy) || !onValley(col + dx, row + dy) || onTerrace(col + dx, row + dy),
      );
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
      // 谷口意象：雪原中北部一段东西向矮石墙，正中留谷口。
      const wallBand = row >= 20 && row <= 22 && col >= 418 && col <= 446 &&
        !(col >= 430 && col <= 434);
      if (wallBand && seed % 100 < 72) {
        newWalls[row][col] = wallFramesAtlas[seed % wallFramesAtlas.length];
        extensionCount.walls += 1;
        continue;
      }
      // 霜松谷林海比照雪关更密：成片雪松占两成，余下石堆点缀。
      if (seed % 100 < 20) {
        newTrees[row][col] = pineFramesAtlas[hash(col, row, 0x9303) % pineFramesAtlas.length];
        extensionCount.trees += 1;
      } else if (seed % 100 < 30) {
        newDetails[row][col] = detailFramesAtlas[(seed >>> 8) % detailFramesAtlas.length];
      }
    }
  }
  if (extensionCount.snow < 1_100 || extensionCount.cliffs < 180 || extensionCount.route < 18 ||
    extensionCount.trees < 120 || extensionCount.walls < 30) {
    throw new Error('扩展舆图的霜松谷地貌数量不足：' + JSON.stringify(extensionCount));
  }
  if (!onValley(valleyAtlasCell.col, valleyAtlasCell.row) || onTerrace(valleyAtlasCell.col, valleyAtlasCell.row)) {
    throw new Error('霜松谷区域中心没有落在新增雪原上，或与雁回崖高原重叠。');
  }

  const addedLayers = [
    { id: 'world-r93-valley-snow', tilesetId: winterTiles.id, cells: newSnow },
    { id: 'world-r93-valley-trees', tilesetId: winterTiles.id, cells: newTrees },
    { id: 'world-r93-valley-walls', tilesetId: winterTiles.id, cells: newWalls },
    { id: 'world-r93-valley-detail', tilesetId: winterTiles.id, cells: newDetails },
    { id: 'world-r93-valley-route', tilesetId: winterTiles.id, cells: newRoute },
  ];
  const existingIds = new Set(previous.layers.map((layer) => layer.id));
  for (const layer of addedLayers) {
    if (existingIds.has(layer.id)) throw new Error(`Round 93 图层 id 已存在：${layer.id}`);
    existingIds.add(layer.id);
  }
  // 新层只在北部空白带的绘制带内着色：受保护地貌层逐格保持零重叠，
  // 且不落入雁回崖高原或照雪关雪原的投影椭圆。
  for (const layer of addedLayers) {
    for (let row = 0; row < overview.rows; row += 1) {
      for (let col = 0; col < overview.columns; col += 1) {
        if (layer.cells[row][col] === 0) continue;
        if (!inPaintBand(col, row)) {
          throw new Error(`Round 93 图层 ${layer.id} 越出北部绘制带：(${col}, ${row})。`);
        }
        if (protectedPainted.has(key(col, row))) {
          throw new Error(`Round 93 图层 ${layer.id} 与受保护地貌重叠：(${col}, ${row})。`);
        }
        if (onTerrace(col, row) || onPass(col, row)) {
          throw new Error(`Round 93 图层 ${layer.id} 落入既有区域投影：(${col}, ${row})。`);
        }
      }
    }
  }

  // 既有区域的绝对像素中心保持不变；霜松谷作为第十三区追加，不动旧锚点。
  const regionFootprint = previous.regionFootprint ?? {
    columns: expectedOld.columns * 0.16,
    rows: expectedOld.rows * 0.16,
  };
  const oldAnchors = world.regions
    .filter((region) => region.mapResourceId !== mapId)
    .map((region) => ({
      mapResourceId: region.mapResourceId,
      col: (region.atlasPosition.x / 100) * (overview.columns - 1),
      row: (region.atlasPosition.y / 100) * (overview.rows - 1),
    }));
  if (oldAnchors.length < 12) {
    throw new Error(`预期至少十二个既有区域锚点，实际为 ${oldAnchors.length}。`);
  }
  for (const anchor of oldAnchors) {
    const dx = (anchor.col - valleyAtlasCell.col) / (regionFootprint.columns / 100 * overview.columns / 2);
    const dy = (anchor.row - valleyAtlasCell.row) / (regionFootprint.rows / 100 * overview.rows / 2);
    if (dx * dx + dy * dy < 1) {
      throw new Error(`霜松谷投影与既有区域 ${anchor.mapResourceId} 的标签椭圆重叠。`);
    }
  }
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
// 第二部分：生成 100×100 霜松谷可玩地图。雪原/冰溪/风口崖全部取自
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
const actorDeclaration = passMap.art?.tilesets.find((entry) => entry.id === actorId);
if (actorDeclaration === undefined) throw new Error('照雪关缺少已登记的 Puny Characters 图集声明。');
const tilesets = [winterTileset, actorDeclaration];
const tilesetById = new Map(tilesets.map((entry) => [entry.id, entry]));
const actorTileset = tilesetById.get(actorId);

// 布局锚点：东口入谷/回程、松海听涛、巡路人石屋、旧界标与风口崖脚。
const start = at(96, 50);
const valleyReturn = at(95, 50);
const patrollerPosition = at(48, 58);
const pineSeaEventCell = at(56, 50);
const oldMarkEventCell = at(24, 32);
const windGapEventCell = at(58, 16);

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
addRoad([start, at(84, 50), at(70, 52), at(58, 55), patrollerPosition]);
addRoad([patrollerPosition, at(40, 52), at(32, 42), oldMarkEventCell]);
addRoad([at(56, 50), at(52, 54), patrollerPosition]);
addRoad([at(58, 55), at(58, 34), at(58, 18), windGapEventCell]);

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
  { id: 'landmark.r93-east-gate', mapResourceId: mapId, ...start, name: '霜松谷东口', category: 'crossing' },
  { id: 'landmark.r93-pine-sea', mapResourceId: mapId, ...pineSeaEventCell, name: '松海', category: 'route', discoveryNodeId: nodeIds.pineSea },
  { id: 'landmark.r93-old-mark', mapResourceId: mapId, ...oldMarkEventCell, name: '旧界标', category: 'other', discoveryNodeId: nodeIds.oldMark },
  { id: 'landmark.r93-wind-gap', mapResourceId: mapId, ...windGapEventCell, name: '风口崖', category: 'other', discoveryNodeId: nodeIds.windGap },
];
for (const point of [start, valleyReturn, patrollerPosition, pineSeaEventCell, oldMarkEventCell, windGapEventCell]) {
  reserveAnchor('人物/关口/地标', point, 2);
}
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

// 地形谓词：东部雪原与西部林海被一条斜贯冰溪切开，溪心两段冰缝不可过；
// 风口崖横亘极北，只留中部豁口；雪松林海成片成障。
const streamPoints = [at(88, 20), at(68, 32), at(52, 44), at(38, 58), at(26, 70)];
const streamHalfWidth = 2;
function nearStream(col, row) {
  for (let i = 1; i < streamPoints.length; i += 1) {
    const a = streamPoints[i - 1];
    const b = streamPoints[i];
    const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = steps === 0 ? 0 : step / steps;
      const c = Math.round(a.col + (b.col - a.col) * ratio);
      const r = Math.round(a.row + (b.row - a.row) * ratio);
      if (Math.abs(col - c) <= streamHalfWidth && Math.abs(row - r) <= streamHalfWidth) return true;
    }
  }
  return false;
}
// 冰缝：溪心两段，不压主路（主路横跨冰溪在 (52,44)-(38,58) 段以北）。
const onCrevasse = (col, row) => nearStream(col, row) &&
  ((col >= 60 && col <= 78 && row >= 28 && row <= 30) ||
    (col >= 30 && col <= 44 && row >= 58 && row <= 60)) &&
  !(roads.has(key(col, row)) || anchors.has(key(col, row)));
const windGapBand = { fromRow: 8, toRow: 14, fromCol: 6, toCol: 90 };
const gapMouth = { fromCol: 54, toCol: 62 };
const inWindGap = (col, row) => col >= windGapBand.fromCol && col <= windGapBand.toCol &&
  row >= windGapBand.fromRow && row <= windGapBand.toRow &&
  !(col >= gapMouth.fromCol && col <= gapMouth.toCol);
const massifs = [
  { col: 20, row: 20, radiusX: 10, radiusY: 8, salt: 0x9311, cliff: false },
  { col: 38, row: 18, radiusX: 8, radiusY: 6, salt: 0x9312, cliff: false },
  { col: 76, row: 26, radiusX: 9, radiusY: 7, salt: 0x9313, cliff: false },
  { col: 88, row: 42, radiusX: 7, radiusY: 6, salt: 0x9314, cliff: false },
  { col: 14, row: 44, radiusX: 8, radiusY: 7, salt: 0x9315, cliff: false },
  { col: 30, row: 38, radiusX: 6, radiusY: 5, salt: 0x9316, cliff: false },
  { col: 68, row: 44, radiusX: 8, radiusY: 6, salt: 0x9317, cliff: false },
  { col: 82, row: 66, radiusX: 7, radiusY: 5, salt: 0x9318, cliff: false },
  { col: 22, row: 62, radiusX: 7, radiusY: 6, salt: 0x9319, cliff: false },
  { col: 46, row: 72, radiusX: 9, radiusY: 6, salt: 0x931a, cliff: false },
  { col: 70, row: 78, radiusX: 8, radiusY: 6, salt: 0x931b, cliff: false },
  { col: 34, row: 84, radiusX: 9, radiusY: 7, salt: 0x931c, cliff: false },
  { col: 50, row: 28, radiusX: 5, radiusY: 4, salt: 0x931d, cliff: true },
  { col: 90, row: 14, radiusX: 6, radiusY: 5, salt: 0x931e, cliff: true },
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
  let value = Math.imul(col + 467, 0x45d9f3b) ^ Math.imul(row + 719, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

const snowFrames = toGids(reviewedSnowFrames);
const iceFrames = toGids(reviewedIceFrames);
const iceFrameAtCol = (col) => iceFrames[col % iceFrames.length];
const trailFrames = toGids([1]);
const flourishFrames = toGids(reviewedDriftFrames);
const stoneFrames = toGids(reviewedStoneFrames);
const pineFrames = toGids(reviewedPineFrames);
const wallFrames = toGids(reviewedWallFrames);
const cliffFrames = toGids(reviewedCliffFrames);
assertFrames([...snowFrames, ...iceFrames, ...trailFrames, ...flourishFrames,
  ...stoneFrames, ...pineFrames, ...wallFrames, ...cliffFrames],
winterUsableFrames, '霜松谷环境');

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
    const seed = hashCell(col, row, 0x9304);
    const road = roads.has(cellKey);
    const anchor = anchors.has(cellKey);
    const eastGate = row >= 48 && row <= 52;
    const boundary = col < 3 || col > 96 || row < 3 || (row > 96 && !eastGate) ||
      (col > 96 && !eastGate);

    if (onCrevasse(col, row)) {
      grid[row][col] = '~';
      ground[row][col] = iceFrameAtCol(col);
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    if (nearStream(col, row)) {
      // 冰面可行（'='），主路踏痕在渡口压出一条雪道。
      grid[row][col] = '=';
      ground[row][col] = iceFrameAtCol(col);
      if (road || anchor) trail[row][col] = trailFrames[(seed >>> 4) % trailFrames.length];
      continue;
    }
    if (boundary) {
      grid[row][col] = '#';
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    if (inWindGap(col, row)) {
      grid[row][col] = '#';
      cliffs[row][col] = cliffFrames[seed % cliffFrames.length];
      cliffCount += 1;
      continue;
    }
    // 可行走地带：雪原铺雪，主路压踏痕，近溪滩涂为浅雪。
    const nearStreamBank = nearStream(col - 2, row) || nearStream(col + 2, row) || nearStream(col, row - 3) || nearStream(col, row + 3);
    ground[row][col] = snowFrames[seed % snowFrames.length];
    if (road || anchor) {
      trail[row][col] = trailFrames[(seed >>> 4) % trailFrames.length];
    } else if (nearStreamBank) {
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
        cliffs[row][col] = cliffFrames[hashCell(col, row, 0x9305) % cliffFrames.length];
      } else {
        pines[row][col] = pineFrames[hashCell(col, row, 0x9305) % pineFrames.length];
      }
      trail[row][col] = 0;
      flourish[row][col] = 0;
    } else if (seed % 100 < 5 && !road && !anchor) {
      pines[row][col] = pineFrames[hashCell(col, row, 0x9306) % pineFrames.length];
    }
  }
}
// 旧界标石座、谷口石墩——纯贴图，不占碰撞。
accents[31][oldMarkEventCell.col] = wallFrames[3];
accents[32][oldMarkEventCell.col - 1] = stoneFrames[1];
accents[17][windGapEventCell.col] = wallFrames[4];
flourish[50][start.col] = stoneFrames[2];

const mapGrid = grid.map((line) => line.join(''));
// Count the actual collision contract; crevasses, wind gap, boundary and
// massifs stay solid in the independent grid while the stream deck is walkable.
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
const reachable = reachableFrom(start, mapGrid, columns, rows, '霜松谷');
for (const point of [valleyReturn, patrollerPosition, pineSeaEventCell, oldMarkEventCell, windGapEventCell]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('霜松谷锚点不可达：' + key(point.col, point.row));
}
// 旧界标是 E 键调查点：事件格自身可走，且至少一个正交邻格从入口可达。
const oldMarkApproachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
  reachable.has(key(oldMarkEventCell.col + dx, oldMarkEventCell.row + dy)),
);
if (!oldMarkApproachable) throw new Error('旧界标在调查距离内没有可通行接近格。');
if (walkableCount < 6_000 || reachable.size < 5_000) {
  throw new Error('霜松谷可行/连通格数量不足：可行 ' + walkableCount + '，连通 ' + reachable.size);
}
if (patrollerPosition.col === start.col && patrollerPosition.row === start.row) {
  throw new Error('巡路人占住了霜松谷东口。');
}
if (valleyReturn.col === start.col && valleyReturn.row === start.row) {
  throw new Error('回程关口与霜松谷东口重合。');
}

// 照雪关一侧的关口格必须可通行、可从北境栈口出生点抵达，且不压既有锚点。
const passGate = at(3, 64);
const passArrival = at(4, 64);
const passSolid = new Set(
  Object.entries(passMap.tileTypes ?? {}).filter(([, type]) => type?.solid).map(([glyph]) => glyph),
);
function passWalkable(point) {
  const glyph = passMap.grid[point.row]?.[point.col];
  return glyph !== undefined && !passSolid.has(glyph);
}
for (const point of [passGate, passArrival]) {
  if (!passWalkable(point)) {
    throw new Error('照雪关西缘关口不可通行：' + key(point.col, point.row));
  }
}
const passStart = passMap.playerStart;
const passReachable = reachableFrom(
  { col: passStart.col, row: passStart.row },
  passMap.grid, passMap.columns, passMap.rows, '照雪关',
);
for (const point of [passGate, passArrival]) {
  if (!passReachable.has(key(point.col, point.row))) {
    throw new Error('照雪关西缘关口不可从出生点抵达：' + key(point.col, point.row));
  }
}
const passOccupied = new Set([
  key(passStart.col, passStart.row),
  ...(world.events ?? []).filter((entry) => entry.mapResourceId === passId).map((entry) => key(entry.col, entry.row)),
  ...(world.landmarks ?? []).filter((entry) => entry.mapResourceId === passId).map((entry) => key(entry.col, entry.row)),
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r93-')).flatMap((entry) => [
    entry.from.mapResourceId === passId ? key(entry.from.col, entry.from.row) : null,
    entry.to.mapResourceId === passId ? key(entry.to.col, entry.to.row) : null,
  ]).filter(Boolean),
]);
for (const point of [passGate, passArrival]) {
  if (passOccupied.has(key(point.col, point.row))) {
    throw new Error('照雪关新关口与既有玩法锚点重叠：' + key(point.col, point.row));
  }
}

const mapData = {
  id: mapId,
  name: '北境·霜松谷',
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
    actors: { ...passMap.art.actors },
    layers: [
      { id: 'r93-valley-ground', tilesetId: winterId, cells: ground },
      { id: 'r93-valley-trail', tilesetId: winterId, cells: trail },
      { id: 'r93-valley-flourish', tilesetId: winterId, cells: flourish },
      { id: 'r93-valley-pines', tilesetId: winterId, depthSort: 'y', cells: pines },
      { id: 'r93-valley-cliffs', tilesetId: winterId, depthSort: 'y', cells: cliffs },
      { id: 'r93-valley-walls', tilesetId: winterId, depthSort: 'y', cells: walls },
      { id: 'r93-valley-accents', tilesetId: winterId, depthSort: 'y', cells: accents },
    ],
  },
};
for (const layer of mapData.art.layers) {
  const tileset = tilesetById.get(layer.tilesetId);
  if (tileset === undefined) throw new Error('霜松谷图层引用未声明图集：' + layer.id);
  const used = new Set();
  for (const rowCells of layer.cells) for (const gid of rowCells) if (gid !== 0) used.add(gid);
  if (Math.max(0, ...used) > tileset.tileCount) {
    throw new Error(`霜松谷图层 ${layer.id} 帧号超出图集容量。`);
  }
  if (tileset.id === winterId) assertFrames(used, winterUsableFrames, '霜松谷图层 ' + layer.id);
}

// ---------------------------------------------------------------------------
// 第三部分：原创巡路人、对白、界标寻踪差事、一次性见闻与知识图谱端点。
// ---------------------------------------------------------------------------
const npcs = {
  npcs: [{
    id: npcIds.patroller,
    name: '柳寻径',
    mapResourceId: mapId,
    position: patrollerPosition,
    dialogueId: 'dlg.r93-liu-xunjing-rounds',
    questGiver: true,
    spriteFrame: 160,
    spriteFrames: { down: 160, right: 168, up: 176, left: 184 },
    schedule: [
      { periodId: 'period.midnight', position: { col: 49, row: 59 } },
      { periodId: 'period.dawn', position: { col: 42, row: 54 } },
      { periodId: 'period.morning', position: { col: 48, row: 58 } },
      { periodId: 'period.midday', position: { col: 48, row: 58 } },
      { periodId: 'period.afternoon', position: { col: 56, row: 54 } },
      { periodId: 'period.dusk', position: { col: 34, row: 44 } },
      { periodId: 'period.night', position: { col: 49, row: 59 } },
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
      throw new Error('巡路人日程落点不可通行：' + npc.id + '/' + entry.periodId);
    }
  }
  for (const entry of npc.schedule ?? []) {
    if (!reachable.has(key(entry.position.col, entry.position.row))) {
      throw new Error('巡路人日程落点不可从东口抵达：' + npc.id + '/' + entry.periodId);
    }
  }
}
const quests = {
  quests: [{
    id: questId,
    name: '界标寻踪',
    description: '北境巡路人柳寻径请你沿雪谷西行，越过冰溪找到谷中那块前朝屯垦的旧界标，拓下刻文带回石屋。',
    giverNpcId: npcIds.patroller,
    objectives: [{
      id: 'objective.r93-arrive-snow-pine-valley',
      kind: 'discoverKnowledge',
      targetId: nodeIds.valley,
      requiredCount: 1,
      text: '从照雪关西缘冰桥进入霜松谷',
    }, {
      id: 'objective.r93-survey-old-mark',
      kind: 'discoverKnowledge',
      targetId: nodeIds.oldMark,
      requiredCount: 1,
      text: '在旧界标下拓下前朝刻文',
    }, {
      id: 'objective.r93-report-liu-xunjing',
      kind: 'talkToNpc',
      targetId: npcIds.patroller,
      requiredCount: 1,
      text: '把拓文带回给柳寻径',
    }],
    rewards: {
      experience: 30,
      currency: 22,
      discoverKnowledgeNodeIds: [nodeIds.windGap],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r93-liu-xunjing-rounds',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '巡路人的石屋里，柳寻径正把一副旧皮裹脚在火墙上烘着，见你推门进来，抬了抬下巴：「霜松谷三十年没来过生面孔——上一个还是从照雪关那头绕冰桥过来的。你既然进得来谷，就帮我办件差事：谷西有块前朝的界标，拓张刻文回来，我给你备了御寒的烈酒。」',
        options: [
          {
            text: '拓文我拓。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '拓文已经带回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          {
            text: '我正往谷西去。',
            nextNodeId: 'active',
            conditions: [{ kind: 'questStatus', questId, status: 'active' }],
          },
          { text: '界标怎么走？', nextNodeId: 'route' },
          { text: '你巡的什么路？', nextNodeId: 'patroller' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「出石屋沿主径向西南，先过冰溪——认准渡口的踏痕走，溪心两道冰缝蓝得发黑，压不得。过溪后松林里岔路多，抱定西南方向，界标是块半人高的青石，立在林间空地上。到了石下按 E 拓文，纸上我给你裁好了。」' },
      { id: 'active', text: '「记住：只走渡口踏痕，只拓碑阳刻文。碑背那半截是前朝屯垦的田亩数，字迹漫了，拓了也认不出。我在这儿给你温着酒。」' },
      { id: 'completed', text: '柳寻径接过拓文，凑在灯下看了半晌，指腹顺着刻痕慢慢描过：「『北墉屯界，西至松谷』——好字，是前朝戍卒的手笔。」他把拓文仔细折进皮筒，又给你满上一碗热酒：「界标既还在，这条谷的账就还没烂完。」' },
      { id: 'route', text: '「东口进来沿主径走，过冰溪渡口往西南，穿过两片松林就是界标。往北那条岔路通风口崖，崖口风大，站得住再去看——谷里的风向，崖上先知道。」' },
      { id: 'patroller', text: '「巡路人，巡的是界。前朝在这谷里屯过垦，界桩立了一溜，如今雪埋风磨，就剩谷西那块还立得直。我每年把它脚下的雪扫开两回，刻文描一遍——界标倒了，这谷就说不清是谁的了。」' },
      { id: 'farewell', text: '柳寻径重新裹上脚，背起雪铲出门，向着谷西的方向走进松影里，靴声很快被落雪吃掉。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '北境·霜松谷',
  description: '照雪关以西的雪松林谷，斜贯的冰溪与风口崖之间立着前朝屯垦的旧界标，巡路人常年看守着这条谷的界线。',
  atlasPosition: {
    x: Number(((valleyAtlasCell.col / (overview.columns - 1)) * 100).toFixed(8)),
    y: Number(((valleyAtlasCell.row / (overview.rows - 1)) * 100).toFixed(8)),
  },
};
const transitions = [
  {
    id: 'gate.r93-north-pass-to-valley',
    name: '西行冰桥',
    from: { mapResourceId: passId, ...passGate },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r93-valley-to-north-pass',
    name: '东归雪道',
    from: { mapResourceId: mapId, ...valleyReturn },
    to: { mapResourceId: passId, ...passArrival },
  },
];
const events = [
  {
    id: nodeIds.arrival,
    mapResourceId: mapId,
    ...start,
    text: '冰桥尽头雪松夹道，一条被踩实的雪径钻进望不到边的林海——北境·霜松谷到了。',
    approachText: '西面的松林在风里起伏如浪，雪径向着谷深处延伸。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.valley,
  },
  {
    id: nodeIds.pineSeaEvent,
    mapResourceId: mapId,
    ...pineSeaEventCell,
    text: '站在渡口西岸的高处，整面松海在风里一浪一浪地伏下去，松针上的积雪簌簌落下，声音像退潮。巡路人的雪铲就靠在近处的树干上，铲柄被掌心磨得发亮。',
    approachText: '渡口西岸的松林一望无际，涛声般的雪响从林深处传来。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.pineSea,
  },
  {
    id: nodeIds.oldMarkEvent,
    mapResourceId: mapId,
    ...oldMarkEventCell,
    text: '半人高的青石立在林间空地正中，碑阳的刻文被巡路人描过新墨：「北墉屯界，西至松谷」。碑脚的积雪扫得干干净净，石座下压着半截朽了的界绳——前朝戍卒立的界，如今只有巡路人还记得按季来描。',
    approachText: '林间空地上的青石界标立在雪里，碑脚的雪被扫开了一圈。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.oldMark,
    interaction: {
      prompt: '在旧界标下拓下前朝刻文',
      range: 1,
      approachDirections: ['up', 'left', 'right'],
    },
  },
  {
    id: nodeIds.windGapEvent,
    mapResourceId: mapId,
    ...windGapEventCell,
    text: '风口崖的豁口像一道被风凿开的石门，站在崖脚，风从豁口里灌下来，吹得人睁不开眼。云过阴天或落雪时，隔着豁口能望见更北处一线灰白——那是舆图之外、只有烽火知道的地方。',
    approachText: '北面崖壁的豁口风声如哨，积雪被吹成贴地的白烟。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.windGap,
    conditions: {
      weatherIds: ['weather.overcast', 'weather.snow', 'weather.cloudy'],
    },
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '北境霜松谷探索地图', summary: '从照雪关西缘冰桥可入的霜松谷百格地图。', knownByDefault: false },
  { id: nodeIds.valley, kind: 'place', title: '北境·霜松谷', summary: '照雪关以西的雪松林谷，冰溪与风口崖之间藏着前朝界标。', knownByDefault: false },
  { id: nodeIds.pineSea, kind: 'place', title: '松海', summary: '渡口西岸的整面雪松林，风过时如潮声起伏。', knownByDefault: false },
  { id: nodeIds.oldMark, kind: 'place', title: '旧界标', summary: '前朝屯垦的青石界碑，刻着「北墉屯界，西至松谷」。', knownByDefault: false },
  { id: nodeIds.windGap, kind: 'place', title: '风口崖', summary: '横亘谷北的石崖，豁口风声如哨，是天时将至的先报。', knownByDefault: false },
  { id: nodeIds.patroller, kind: 'character', title: '柳寻径', summary: '北境巡路人，常年看守霜松谷里的前朝界标。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '界标寻踪', summary: '越过冰溪在旧界标下拓下前朝刻文，带回给巡路人柳寻径。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '初入霜松谷', summary: '从照雪关西缘冰桥首次踏进雪松林谷。', knownByDefault: false },
  { id: nodeIds.pineSeaEvent, kind: 'event', title: '松海听涛', summary: '在渡口西岸听整面松海被风吹起雪潮。', knownByDefault: false },
  { id: nodeIds.oldMarkEvent, kind: 'event', title: '界标拓文', summary: '在旧界标下拓下前朝屯垦的界刻。', knownByDefault: false },
  { id: nodeIds.windGapEvent, kind: 'event', title: '风口望北', summary: '在风口崖豁口望见舆图之外的灰白北境。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r93-arrival-valley', fromId: nodeIds.arrival, toId: nodeIds.valley, relation: 'triggers', summary: '初入霜松谷时发现北境·霜松谷。' },
  { id: 'kg.edge.r93-valley-map', fromId: nodeIds.valley, toId: mapId, relation: 'locatedAt', summary: '霜松谷由百格探索地图承载。' },
  { id: 'kg.edge.r93-pine-sea-event', fromId: nodeIds.pineSeaEvent, toId: nodeIds.pineSea, relation: 'triggers', summary: '渡口听涛后记下松海的方位。' },
  { id: 'kg.edge.r93-old-mark-event', fromId: nodeIds.oldMarkEvent, toId: nodeIds.oldMark, relation: 'triggers', summary: '拓文之后认清旧界标的刻文。' },
  { id: 'kg.edge.r93-wind-gap-event', fromId: nodeIds.windGapEvent, toId: nodeIds.windGap, relation: 'triggers', summary: '崖脚望北之后记下风口崖的位置。' },
  { id: 'kg.edge.r93-patroller-location', fromId: nodeIds.patroller, toId: mapId, relation: 'locatedAt', summary: '柳寻径在霜松谷的巡路石屋驻脚。' },
  { id: 'kg.edge.r93-patroller-quest', fromId: nodeIds.patroller, toId: nodeIds.quest, relation: 'participatesIn', summary: '柳寻径委托玩家拓回界标刻文。' },
  { id: 'kg.edge.r93-quest-old-mark', fromId: nodeIds.quest, toId: nodeIds.oldMark, relation: 'requires', summary: '界标寻踪需要玩家在旧界标调查。' },
  { id: 'kg.edge.r93-quest-wind-gap', fromId: nodeIds.quest, toId: nodeIds.windGap, relation: 'rewards', summary: '完成界标寻踪后得知风口崖的方位。' },
  { id: 'kg.edge.r93-valley-pass', fromId: nodeIds.valley, toId: passId, relation: 'locatedAt', summary: '霜松谷从照雪关西缘冰桥进入。' },
];
const resourceEntries = [
  { id: 'map.round-93-snow-pine-valley', path: 'maps/round-93-snow-pine-valley.json', schema: 'grid-map' },
  { id: 'npc.round-93-snow-pine-valley-set', path: 'characters/round-93-snow-pine-valley-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-93-snow-pine-valley-set', path: 'dialogues/round-93-snow-pine-valley-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-93-snow-pine-valley-set', path: 'quests/round-93-snow-pine-valley-quests.json', schema: 'quest-set' },
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
if (world.regions.length < 13) {
  throw new Error(`Round 93 及后续区域丢失，扩展后仅有 ${world.regions.length} 个区域。`);
}

// 全部舆图图层以紧凑行 RLE 线格式落盘；区域、地标、关口、事件及其余
// 舆图字段保持不变。
world.atlasArt.layers = world.atlasArt.layers.map((layer) => ({
  id: layer.id,
  tilesetId: layer.tilesetId,
  cellsRle: encodeAtlasCells(layer.cells),
}));

await Promise.all([
  writeManagedJson(paths.map, mapData, '霜松谷地图'),
  writeManagedJson(paths.npcs, npcs, '霜松谷人物'),
  writeManagedJson(paths.dialogues, dialogues, '霜松谷对白'),
  writeManagedJson(paths.quests, quests, '霜松谷任务'),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
if (atlasReady) {
  console.log(`Rebuilt the Round 93 extension in the ${overview.columns}×${overview.rows} atlas from its protected Round 92 layers.`);
} else {
  console.log(`Extended the ${overview.columns}×${overview.rows} atlas to ${world.atlasArt.layers.length} layers (${world.regions.length} regions retained).`);
}
console.log(`Round 93 CC0 winter extension: ${extensionCount.snow} snow field, ${extensionCount.cliffs} rock rim, ${extensionCount.trees} pines, ${extensionCount.walls} wall, ${extensionCount.route} ice-bridge cells.`);
console.log(
  'Generated ' + mapData.name + ': ' + walkableCount + ' walkable cells, ' +
  reachable.size + ' entrance-reachable cells, ' + cliffCount + ' cliff tiles, ' +
  massifCellCount + ' massif cells; two-way pass gates and ' +
  landmarks.length + ' landmarks.',
);
