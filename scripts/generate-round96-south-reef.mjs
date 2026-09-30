import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells, encodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const files = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
  npcs: resolve(base, 'characters/round-96-south-reef-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-96-south-reef-conversations.json'),
  quests: resolve(base, 'quests/round-96-south-reef-quests.json'),
  baseline: resolve(root, 'iterations/round-96/round95-atlas-baseline.json'),
};

const PUNY_WORLD = 'opengameart.puny-world';
const MAP_IDS = {
  stone: 'map.round-96-stone-reef',
  atoll: 'map.round-96-halfmoon-atoll',
  southwest: 'map.round-87-southwest-isles',
  south: 'map.round-94-returning-sails',
};
// Projected atlas cell centers for the two new south-sea regions.
const REGION_CENTERS = {
  [MAP_IDS.stone]: { col: 190.5, row: 430.5 },
  [MAP_IDS.atoll]: { col: 295.5, row: 505.5 },
};
const RESOURCE_ADDITIONS = [
  { id: MAP_IDS.stone, path: 'maps/round-96-stone-reef.json', schema: 'grid-map' },
  { id: MAP_IDS.atoll, path: 'maps/round-96-halfmoon-atoll.json', schema: 'grid-map' },
  { id: 'npc.round-96-south-reef-set', path: 'characters/round-96-south-reef-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-96-south-reef-set', path: 'dialogues/round-96-south-reef-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-96-south-reef-set', path: 'quests/round-96-south-reef-quests.json', schema: 'quest-set' },
];
// Intentional overlay policy: new island terrain may sit only on the open-ocean
// and southern-shallows decoration; the sea lane additionally crosses the
// Southwest Isles ring water. Anything else is a hard generator failure.
const LAND_BACKGROUND = new Set(['world-ocean', 'world-r94-south-shallows']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r87-expanse-water', 'world-r94-south-shallows']);
// Island footprints and lane capsules in atlas cells (see iterations/round-96/plan.md).
const STONE_ELLIPSE = { cx: 190, cy: 430, rx: 42, ry: 30 };
const ATOLL_ELLIPSE = { cx: 295, cy: 505, rx: 45, ry: 32 };
const ATOLL_LAGOON = { cx: 295, cy: 505, rx: 25, ry: 19 };
const LANE_SEGMENTS = [
  [[92, 376], [146, 426]],
  [[236, 434], [247, 501]],
  [[344, 507], [354, 499]],
];
const periods = ['period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night'];
const maps = [
  makeMap('stone', MAP_IDS.stone, '中溟·千里石塘', 'stone-reef'),
  makeMap('atoll', MAP_IDS.atoll, '南溟·半月环礁', 'halfmoon-atoll'),
];

await ensureBaseline();
const [world, manifest, nodes, edges] = await Promise.all([
  readJson(files.world), readJson(files.manifest), readJson(files.nodes), readJson(files.edges),
]);
const art = world.atlasArt;
if (art?.columns !== 768 || art.rows !== 576 || art.tileSize !== 8 || art.layers.length < 57) {
  throw new Error(`Round 96 需要基于 768×576、8px/格且至少含 57 层的舆图；当前为 ${art?.columns}×${art?.rows}、${art.tileSize}px、${art.layers.length} 层。`);
}
const baseline = await readJson(files.baseline);
const decoded = art.layers.map((layer) => ({
  ...layer,
  cells: layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns),
}));
for (const [id, expected] of Object.entries(baseline.layers)) {
  const layer = decoded.find((entry) => entry.id === id);
  if (layer === undefined || sha256(layer.cells) !== expected) throw new Error(`Round 95 舊圖層被改動：${id}。`);
}
for (const [id, anchor] of Object.entries(baseline.regions)) {
  const region = world.regions.find((entry) => entry.mapResourceId === id);
  if (region === undefined || !sameCenter(projectedCenter(region.atlasPosition, art), anchor)) {
    throw new Error(`Round 95 舊區域錨點漂移或遺失：${id}。`);
  }
}

const managedLayerIds = new Set(['world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land', 'world-r96-reef-lane']);
const priorLayers = decoded.filter((layer) => !managedLayerIds.has(layer.id));
const atlasLayers = makeAtlasLayers(art);
for (const layer of atlasLayers) assertOverlayPolicy(layer, priorLayers);
const allAtlasLayers = mergeManaged(decoded, atlasLayers, (entry) => entry.id, 'world-r95-east-forest');
world.atlasArt = {
  columns: art.columns,
  rows: art.rows,
  tileSize: art.tileSize,
  regionFootprint: art.regionFootprint,
  tilesets: art.tilesets,
  layers: allAtlasLayers.map(({ id, tilesetId, cells }) => ({ id, tilesetId, cellsRle: encodeAtlasCells(cells) })),
};

const regions = maps.map((map) => ({
  mapResourceId: map.id,
  name: map.name,
  description: regionDescription(map.id),
  atlasPosition: atlasPosition(REGION_CENTERS[map.id], art),
}));
world.regions = mergeManaged(world.regions, regions, (entry) => entry.mapResourceId);
world.landmarks = mergeManaged(world.landmarks ?? [], createLandmarks(), (entry) => entry.id);
world.transitions = mergeManaged(world.transitions, createTransitions(), (entry) => entry.id);
world.events = mergeManaged(world.events, createEvents(), (entry) => entry.id);
manifest.resources = mergeManaged(manifest.resources, RESOURCE_ADDITIONS, (entry) => entry.id, 'world.atlas');
nodes.nodes = mergeManaged(nodes.nodes, createNodes(), (entry) => entry.id);
edges.edges = mergeManaged(edges.edges, createEdges(), (entry) => entry.id);

await Promise.all([
  ...maps.map((map) => writeJson(resolve(base, 'maps', `${map.id.slice('map.'.length)}.json`), map)),
  writeJson(files.world, world), writeJson(files.manifest, manifest),
  writeJson(files.nodes, nodes), writeJson(files.edges, edges),
  writeJson(files.npcs, { npcs: createNpcs() }),
  writeJson(files.dialogues, { conversations: createDialogues() }),
  writeJson(files.quests, { quests: createQuests() }),
]);

console.log(`Round 96 南海礁島已生成：${maps.length} 張探索地圖、${regions.length} 個區域、3 組雙向航路（6 個有向關口）、${world.atlasArt.layers.length} 個輿圖圖層。`);

async function ensureBaseline() {
  try { await access(files.baseline); return; } catch { /* Capture the committed R95 data once. */ }
  const oldWorld = await readJson(files.world);
  const oldArt = oldWorld.atlasArt;
  if (oldArt?.columns !== 768 || oldArt.rows !== 576 || oldArt.layers.length !== 57 || oldWorld.regions.length !== 18) {
    throw new Error('建立 Round 96 基線前，來源必須是完整的 Round 95 舆圖。');
  }
  const layers = Object.fromEntries(oldArt.layers.map((layer) => {
    const dense = layer.cells ?? decodeAtlasCells(layer.cellsRle, oldArt.rows, oldArt.columns);
    return [layer.id, sha256(dense)];
  }));
  const regionAnchors = Object.fromEntries(oldWorld.regions.map((region) => [
    region.mapResourceId, projectedCenter(region.atlasPosition, oldArt),
  ]));
  await writeJson(files.baseline, {
    columns: oldArt.columns, rows: oldArt.rows, tileSize: oldArt.tileSize,
    layerCount: oldArt.layers.length, layers, regions: regionAnchors,
  });
}

function makeMap(kind, id, name, suffix) {
  const columns = 100; const rows = 100;
  const grid = Array.from({ length: rows }, () => Array(columns).fill('~'));
  const ground = Array.from({ length: rows }, () => Array(columns).fill(0));
  const features = Array.from({ length: rows }, () => Array(columns).fill(0));
  const detail = Array.from({ length: rows }, () => Array(columns).fill(0));
  const inside = (col, row, { cx, cy, rx, ry }) => ((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1;
  const isle = { cx: 50, cy: 50, rx: 48, ry: 43 };
  const lagoon = { cx: 50, cy: 50, rx: 26, ry: 23 };

  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    if (!inside(col + 0.5, row + 0.5, isle)) continue;
    const rim = ((col + 0.5 - isle.cx) / (isle.rx - 3)) ** 2 + ((row + 0.5 - isle.cy) / (isle.ry - 3)) ** 2 > 1;
    if (kind === 'atoll' && inside(col + 0.5, row + 0.5, lagoon)) grid[row][col] = '=';
    else grid[row][col] = rim ? ',' : '.';
  }

  const road = kind === 'stone'
    ? [[3, 50], [30, 47], [56, 54], [80, 48], [96, 50]]
    : [[3, 50], [22, 50], [50, 50], [78, 50], [96, 50]];
  for (let index = 0; index < road.length - 1; index += 1) paintLine(grid, road[index], road[index + 1], 1, ',');
  if (kind === 'stone') {
    paintLine(grid, [66, 44], [72, 33], 1, ',');
    paintLine(grid, [36, 56], [30, 66], 1, ',');
  } else {
    paintLine(grid, [58, 52], [64, 60], 1, ',');
  }

  const clusters = kind === 'stone'
    ? [[22, 26, 12, 10], [46, 20, 11, 9], [78, 24, 10, 9], [25, 74, 12, 10], [52, 80, 13, 9], [80, 72, 10, 11]]
    : [[20, 28, 8, 8], [32, 70, 9, 8], [74, 26, 9, 8], [78, 68, 8, 9], [50, 20, 7, 6]];
  const isSolid = (col, row) => col < 0 || row < 0 || col >= columns || row >= rows || '#^~'.includes(grid[row][col]);
  for (const [cx, cy, rx, ry] of clusters) {
    for (let row = Math.max(5, cy - ry); row <= Math.min(94, cy + ry); row += 3) {
      for (let col = Math.max(6, cx - rx); col <= Math.min(93, cx + rx); col += 3) {
        const norm = ((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2;
        const textureSeed = (col * 17 + row * 31 + cx * 7) % 7;
        if (norm > 0.73 || textureSeed > 3 || isSolid(col, row) || distanceToPolyline(col, row, road) < 5) continue;
        grid[row][col] = '#';
        features[row][col] = [182, 183, 184][(col + row) % 3];
      }
    }
  }
  for (let row = 6; row < 94; row += 8) for (let col = 7; col < 94; col += 8) {
    const seed = (col * 7 + row * 19 + kind.length * 11) % 9;
    if (seed > 1 || isSolid(col, row) || features[row][col] > 0 || distanceToPolyline(col, row, road) < 3) continue;
    detail[row][col] = kind === 'stone' ? 29 + seed : 33 + seed;
  }
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const symbol = grid[row][col];
    if (symbol === '~') ground[row][col] = [286, 290, 294, 296][(col * 3 + row * 7) % 4];
    else if (symbol === ',') ground[row][col] = ((col + row) % 2 === 0) ? 5 : 6;
    else if (symbol === '=') ground[row][col] = ((col + row) % 2 === 0) ? 288 : 289;
    else if (symbol === '#') ground[row][col] = 30;
    else ground[row][col] = ((col * 5 + row * 3) % 7 === 0) ? 3 : 1;
  }

  const tilesets = [
    { id: PUNY_WORLD, image: 'assets/opengameart/puny-world/tileset.png', tileSize: 16, columns: 27, rows: 65, spacing: 0, tileCount: 1755 },
    { id: 'opengameart.puny-characters', image: 'assets/opengameart/puny-characters/actors.png', tileSize: 16, columns: 20, rows: 16, spacing: 0, tileCount: 320 },
  ];
  const cells = (values) => values.map((row) => [...row]);
  const defaultNpcFrame = kind === 'stone' ? 192 : 224;
  return {
    id, name, tileSize: 48, columns, rows,
    tileTypes: {
      '.': { color: kind === 'stone' ? '#7c8a72' : '#d9d3ae', solid: false },
      ',': { color: kind === 'stone' ? '#cbb894' : '#e8e2c0', solid: false },
      '=': { color: '#5fb2c0', solid: false },
      '#': { color: kind === 'stone' ? '#4c5a5e' : '#4f7a5c', solid: true },
      '~': { color: kind === 'stone' ? '#1f5d7a' : '#2a7f96', solid: true },
    },
    grid: grid.map((row) => row.join('')),
    playerStart: { col: 3, row: 50 },
    art: {
      tileSize: 16,
      tilesets,
      layers: [
        { id: `r96-${suffix}-ground`, tilesetId: PUNY_WORLD, cells: cells(ground) },
        { id: `r96-${suffix}-features`, tilesetId: PUNY_WORLD, cells: cells(features) },
        { id: `r96-${suffix}-detail`, tilesetId: PUNY_WORLD, cells: cells(detail) },
      ],
      actors: {
        tilesetId: 'opengameart.puny-characters', playerFrame: 256, defaultNpcFrame,
        playerFrames: {
          idle: { down: 256, right: 264, up: 272, left: 280 },
          walk: { down: [257, 258, 259], right: [265, 266, 267], up: [273, 274, 275], left: [281, 282, 283] },
        },
      },
    },
  };
}

function makeAtlasLayers(art) {
  const water = blankAtlas(art); const sand = blankAtlas(art); const land = blankAtlas(art); const lane = blankAtlas(art);
  const paintEllipse = (shape, into, gid, except) => {
    for (let row = Math.max(0, Math.floor(shape.cy - shape.ry)); row <= Math.min(art.rows - 1, Math.ceil(shape.cy + shape.ry)); row += 1) {
      for (let col = Math.max(0, Math.floor(shape.cx - shape.rx)); col <= Math.min(art.columns - 1, Math.ceil(shape.cx + shape.rx)); col += 1) {
        if (((col - shape.cx) / shape.rx) ** 2 + ((row - shape.cy) / shape.ry) ** 2 > 1) continue;
        if (except !== undefined && ((col - except.cx) / except.rx) ** 2 + ((row - except.cy) / except.ry) ** 2 <= 1) continue;
        if (gid !== undefined) { into[row][col] = gid; continue; }
        const norm = ((col - shape.cx) / (shape.rx - 4)) ** 2 + ((row - shape.cy) / (shape.ry - 4)) ** 2;
        into[row][col] = norm > 1 ? 5 : [1, 2, 3, 28][(col * 5 + row * 3) % 4];
      }
    }
  };
  paintEllipse(STONE_ELLIPSE, land);
  paintEllipse(ATOLL_ELLIPSE, land, undefined, ATOLL_LAGOON);
  paintEllipse(ATOLL_LAGOON, water, 294);
  // Stone-reef satellite shoals keep the "thousand-li reef" silhouette readable.
  for (const [dx, dy, rx, ry] of [[-30, -22, 6, 4], [26, -24, 5, 4], [-28, 21, 5, 4], [30, 20, 6, 4]]) {
    paintEllipse({ cx: STONE_ELLIPSE.cx + dx, cy: STONE_ELLIPSE.cy + dy, rx, ry }, sand, 5);
  }
  for (const [from, to] of LANE_SEGMENTS) paintCapsule(art, from, to, 2, 291, lane);
  return [
    { id: 'world-r96-reef-water', tilesetId: PUNY_WORLD, cells: water },
    { id: 'world-r96-reef-sand', tilesetId: PUNY_WORLD, cells: sand },
    { id: 'world-r96-reef-land', tilesetId: PUNY_WORLD, cells: land },
    { id: 'world-r96-reef-lane', tilesetId: PUNY_WORLD, cells: lane },
  ];
}

function assertOverlayPolicy(layer, oldLayers) {
  const allowed = layer.id === 'world-r96-reef-lane' ? LANE_BACKGROUND : LAND_BACKGROUND;
  for (let row = 0; row < layer.cells.length; row += 1) for (let col = 0; col < layer.cells[row].length; col += 1) {
    if (layer.cells[row][col] === 0) continue;
    for (const previous of oldLayers) {
      if (allowed.has(previous.id)) continue;
      if (previous.cells[row]?.[col] !== 0) {
        throw new Error(`Round 96 ${layer.id} 與既有圖層 ${previous.id} 重疊於 ${col},${row}（超出公示疊層範圍）。`);
      }
    }
  }
}

function paintCapsule(art, from, to, radius, gid, into) {
  const [x1, y1] = from; const [x2, y2] = to;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius));
  const maxX = Math.min(art.columns - 1, Math.ceil(Math.max(x1, x2) + radius));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius));
  const maxY = Math.min(art.rows - 1, Math.ceil(Math.max(y1, y2) + radius));
  const dx = x2 - x1; const dy = y2 - y1; const length2 = dx * dx + dy * dy;
  for (let row = minY; row <= maxY; row += 1) for (let col = minX; col <= maxX; col += 1) {
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((col - x1) * dx + (row - y1) * dy) / length2));
    if (Math.hypot(col - (x1 + t * dx), row - (y1 + t * dy)) <= radius) into[row][col] = gid;
  }
}

function createTransitions() {
  const point = (mapResourceId, col, row) => ({ mapResourceId, col, row });
  return [
    ['gate.r96-southwest-to-stone', '东渡千里石塘', point(MAP_IDS.southwest, 93, 50), point(MAP_IDS.stone, 3, 50)],
    ['gate.r96-stone-to-southwest', '西返雾航湾', point(MAP_IDS.stone, 4, 50), point(MAP_IDS.southwest, 94, 50)],
    ['gate.r96-stone-to-atoll', '南下半月环礁', point(MAP_IDS.stone, 96, 50), point(MAP_IDS.atoll, 3, 50)],
    ['gate.r96-atoll-to-stone', '北返千里石塘', point(MAP_IDS.atoll, 4, 50), point(MAP_IDS.stone, 95, 50)],
    ['gate.r96-atoll-to-south', '东泊归帆洲', point(MAP_IDS.atoll, 96, 50), point(MAP_IDS.south, 4, 50)],
    ['gate.r96-south-to-atoll', '西返半月环礁', point(MAP_IDS.south, 5, 50), point(MAP_IDS.atoll, 95, 50)],
  ].map(([id, name, from, to]) => ({ id, name, from, to }));
}

function createLandmarks() {
  return [
    { id: 'landmark.r96-stone-gate', mapResourceId: MAP_IDS.stone, col: 15, row: 50, name: '石塘西岬', category: 'crossing', discoveryNodeId: 'place.r96-stone-reef' },
    { id: 'landmark.r96-lantern-stone', mapResourceId: MAP_IDS.stone, col: 72, row: 33, name: '灯浮石', category: 'other', discoveryNodeId: 'place.r96-lantern-stone' },
    { id: 'landmark.r96-verse-terrace', mapResourceId: MAP_IDS.stone, col: 30, row: 66, name: '望序台', category: 'other', discoveryNodeId: 'place.r96-verse-terrace' },
    { id: 'landmark.r96-atoll-sandbar', mapResourceId: MAP_IDS.atoll, col: 50, row: 50, name: '半月沙脊', category: 'crossing', discoveryNodeId: 'place.r96-halfmoon-atoll' },
    { id: 'landmark.r96-tide-shrine', mapResourceId: MAP_IDS.atoll, col: 66, row: 62, name: '半月潮祠', category: 'water', discoveryNodeId: 'place.r96-tide-shrine' },
    { id: 'landmark.r96-east-pier', mapResourceId: MAP_IDS.atoll, col: 92, row: 50, name: '环礁东栈', category: 'crossing', discoveryNodeId: 'place.r96-halfmoon-atoll' },
  ];
}

function createEvents() {
  return [
    { id: 'event.r96-stone-arrival', mapResourceId: MAP_IDS.stone, col: 7, row: 50, text: '石礁自潮水中层层露出，青黑的礁面上留着船工们凿出的系缆孔。西岬的风里混着盐与旧灯油的气味。', approachText: '系缆孔里还插着半截没烧完的灯芯。', once: true, discoverKnowledgeNodeId: 'place.r96-stone-reef' },
    { id: 'event.r96-lantern-stone', mapResourceId: MAP_IDS.stone, col: 72, row: 33, text: '灯浮石朝海的一面刻满短横，四道一组、七组一转——是千里石塘通行的灯序。石顶铁环上挂着新换的青绳。', approachText: '礁顶的铜灯罩敞着，映出下一组未点的横道。', once: true, discoverKnowledgeNodeId: 'place.r96-lantern-stone', interaction: { prompt: '辨认灯浮石的灯序', range: 1, approachDirections: ['left', 'right', 'down'] } },
    { id: 'event.r96-verse-terrace', mapResourceId: MAP_IDS.stone, col: 30, row: 66, text: '望序台的石阶被磨得发亮。台面刻着灯序的背面：每组的次序倒读，便是自半月环礁返回石塘的潮时。', approachText: '石阶缝里塞着一束晾干的海草，像常有人来抄录。', once: true, discoverKnowledgeNodeId: 'place.r96-verse-terrace', interaction: { prompt: '抄录望序台的潮序', range: 1, approachDirections: ['up', 'right', 'down'] } },
    { id: 'event.r96-atoll-arrival', mapResourceId: MAP_IDS.atoll, col: 7, row: 50, text: '环礁像一弯搁在海上的缺月，白色沙脊直贯湖心。湖水清得能数出脚边的贝层，风过处只余潮祠幡布轻响。', approachText: '沙脊上两行脚印，一行通向潮祠，一行通向东栈。', once: true, discoverKnowledgeNodeId: 'place.r96-halfmoon-atoll' },
    { id: 'event.r96-tide-shrine', mapResourceId: MAP_IDS.atoll, col: 66, row: 62, text: '潮祠立柱没在浅湖里，柱身水位线以上刻着半月形的潮位。守祠人按灯序点灯，灯影落在湖面便是一座罗盘。', approachText: '幡布上结着新鲜的盐霜，今日的潮位刻线刚被描过。', once: true, discoverKnowledgeNodeId: 'place.r96-tide-shrine', interaction: { prompt: '查看半月潮祠的潮位', range: 1, approachDirections: ['left', 'up', 'right'] } },
    { id: 'event.r96-east-pier', mapResourceId: MAP_IDS.atoll, col: 92, row: 50, text: '东栈的木桩打进礁盘，尽头能望见归帆洲的灯影。潮满时渡船自栈边起锚，半个时辰便能登岸。', approachText: '栈边小舟里码着几卷待寄的渔盐。', once: true, discoverKnowledgeNodeId: 'place.r96-halfmoon-atoll' },
  ];
}

function createNpcs() {
  const schedule = (positions) => periods.map((periodId, index) => ({ periodId, position: positions[index] }));
  return [
    {
      id: 'char.r96-cen-xi', name: '岑汐', mapResourceId: MAP_IDS.stone, position: { col: 46, row: 47 },
      dialogueId: 'dlg.r96-cen-xi', questGiver: true, spriteFrame: 192,
      spriteFrames: { down: 192, right: 200, up: 208, left: 216 },
      schedule: schedule([{ col: 44, row: 48 }, { col: 45, row: 47 }, { col: 47, row: 47 }, { col: 49, row: 48 }, { col: 50, row: 47 }, { col: 48, row: 47 }, { col: 44, row: 48 }]),
    },
    {
      id: 'char.r96-luo-yan', name: '洛盐', mapResourceId: MAP_IDS.atoll, position: { col: 48, row: 50 },
      dialogueId: 'dlg.r96-luo-yan', questGiver: true, spriteFrame: 224,
      spriteFrames: { down: 224, right: 232, up: 240, left: 248 },
      schedule: schedule([{ col: 46, row: 52 }, { col: 47, row: 51 }, { col: 49, row: 51 }, { col: 51, row: 52 }, { col: 52, row: 50 }, { col: 50, row: 51 }, { col: 46, row: 52 }]),
    },
  ];
}

function createQuests() {
  return [
    {
      id: 'quest.r96-reef-lantern', name: '石塘灯浮记',
      description: '石塘望潮人岑汐请你登礁辨认灯浮石的灯序，把往来石塘的通行记号带回西岬。',
      giverNpcId: 'char.r96-cen-xi',
      objectives: [
        { id: 'objective.r96-read-lantern', kind: 'discoverKnowledge', targetId: 'place.r96-lantern-stone', requiredCount: 1, text: '在千里石塘辨认灯浮石的灯序' },
        { id: 'objective.r96-report-lantern', kind: 'talkToNpc', targetId: 'char.r96-cen-xi', requiredCount: 1, text: '回石塘西岬向岑汐复命' },
      ],
      rewards: { experience: 42, currency: 34, discoverKnowledgeNodeIds: ['place.r96-halfmoon-atoll'] },
    },
    {
      id: 'quest.r96-atoll-reply', name: '半月的回信',
      description: '灯序复命之后，环礁船娘洛盐托你回千里石塘抄录望序台的潮序，再把这封「回信」带回半月环礁。',
      giverNpcId: 'char.r96-luo-yan', prerequisiteQuestIds: ['quest.r96-reef-lantern'],
      objectives: [
        { id: 'objective.r96-copy-verse', kind: 'discoverKnowledge', targetId: 'place.r96-verse-terrace', requiredCount: 1, text: '回千里石塘抄录望序台的潮序' },
        { id: 'objective.r96-deliver-reply', kind: 'talkToNpc', targetId: 'char.r96-luo-yan', requiredCount: 1, text: '把潮序带回半月环礁交给洛盐' },
      ],
      rewards: { experience: 54, currency: 46, discoverKnowledgeNodeIds: ['place.r96-tide-shrine'] },
    },
  ];
}

function createDialogues() {
  const questOptions = (dialogueId, questId, greetingText, routeText, completionText) => ({
    id: dialogueId,
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet', text: greetingText,
        options: [
          { text: '我来查一查。', nextNodeId: 'accepted', conditions: [{ kind: 'questStatus', questId, status: 'offered' }], effects: [{ kind: 'acceptQuest', questId }] },
          { text: '事情已经办妥。', nextNodeId: 'completed', conditions: [{ kind: 'questStatus', questId, status: 'completed' }] },
          { text: '我还在路上。', nextNodeId: 'active', conditions: [{ kind: 'questStatus', questId, status: 'active' }] },
          { text: '这条路怎么走？', nextNodeId: 'route' },
          { text: '先告辞。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: routeText },
      { id: 'active', text: routeText },
      { id: 'completed', text: completionText },
      { id: 'route', text: routeText },
      { id: 'farewell', text: '对方望了望潮头，把缆绳重新绕紧了一圈。' },
    ],
  });
  return [
    questOptions(
      'dlg.r96-cen-xi', 'quest.r96-reef-lantern',
      '岑汐把一盏没点的铜灯推到礁石边：「石塘的船不认旗，只认灯。灯序看明白了，才好往南走。」',
      '「沿礁路向东北，坡顶那块挂青绳的石头就是灯浮石。四道一组、七组一转，记全了回来找我。」',
      '岑汐点亮铜灯：「灯序既明，南边那弯缺月便看得见了。半月环礁的船娘洛盐若问起，就说石塘应了灯。」',
    ),
    questOptions(
      'dlg.r96-luo-yan', 'quest.r96-atoll-reply',
      '洛盐把手里的渔盐包好：「石塘应了灯，环礁这边还差一封回信——望序台背面的潮序，倒读才是归程。」',
      '「仍从西北回千里石塘，下礁路向西南上望序台。潮序抄全了，再渡回来交到我手上。」',
      '洛盐把抄好的潮序压进盐包：「灯序对潮序，石塘到环礁便是一封信来回。往后这班船，替你留半个船位。」',
    ),
  ];
}

function createNodes() {
  const entries = [
    ['place.r96-stone-reef', 'place', '千里石塘', '雾航湾以东的青黑石礁群，灯序指引往来船只。'],
    [MAP_IDS.stone, 'place', '千里石塘探索地图', '自雾航湾东渡、南通半月环礁的百格礁岛。'],
    ['place.r96-lantern-stone', 'place', '灯浮石', '石塘最高礁，刻着四道一组的通行灯序。'],
    ['place.r96-verse-terrace', 'place', '望序台', '灯序倒读之处，记着自环礁返回石塘的潮时。'],
    ['place.r96-halfmoon-atoll', 'place', '半月环礁', '环抱浅湖的白色缺月形环礁，沙脊直贯湖心。'],
    [MAP_IDS.atoll, 'place', '半月环礁探索地图', '石塘以南、东泊归帆洲的百格环礁。'],
    ['place.r96-tide-shrine', 'place', '半月潮祠', '立在浅湖中的潮位祠柱，灯影即罗盘。'],
    ['char.r96-cen-xi', 'character', '岑汐', '千里石塘望潮人，守灯序与系缆孔。'],
    ['char.r96-luo-yan', 'character', '洛盐', '半月环礁船娘，往返石塘与归帆洲之间。'],
    ['quest.r96-reef-lantern', 'quest', '石塘灯浮记', '辨认灯浮石灯序并向岑汐复命。'],
    ['quest.r96-atoll-reply', 'quest', '半月的回信', '抄录望序台潮序并交还洛盐。'],
    ['event.r96-stone-arrival', 'event', '抵达千里石塘', '登礁发现系缆孔与西岬礁路。'],
    ['event.r96-lantern-stone', 'event', '辨认灯浮石', '读出四道一组的通行灯序。'],
    ['event.r96-verse-terrace', 'event', '抄录望序台', '倒读灯序得到归程潮时。'],
    ['event.r96-atoll-arrival', 'event', '抵达半月环礁', '踏上贯通湖心的白色沙脊。'],
    ['event.r96-tide-shrine', 'event', '查看半月潮祠', '读到今日潮位与守祠灯影。'],
    ['event.r96-east-pier', 'event', '环礁东栈', '在东栈确认前往归帆洲的渡船。'],
  ];
  return entries.map(([id, kind, title, summary]) => ({ id, kind, title, summary, knownByDefault: false }));
}

function createEdges() {
  const e = (id, fromId, toId, relation, summary) => ({ id: `kg.edge.r96-${id}`, fromId, toId, relation, summary });
  return [
    e('stone-located', MAP_IDS.stone, 'place.r96-stone-reef', 'locatedAt', '千里石塘地图承载西岬礁路。'),
    e('lantern-located', 'place.r96-lantern-stone', MAP_IDS.stone, 'locatedAt', '灯浮石立于千里石塘坡顶。'),
    e('terrace-located', 'place.r96-verse-terrace', MAP_IDS.stone, 'locatedAt', '望序台位于石塘西南礁台。'),
    e('atoll-located', MAP_IDS.atoll, 'place.r96-halfmoon-atoll', 'locatedAt', '半月环礁地图承载沙脊与浅湖。'),
    e('shrine-located', 'place.r96-tide-shrine', MAP_IDS.atoll, 'locatedAt', '半月潮祠立在环礁浅湖中。'),
    e('cen-located', 'char.r96-cen-xi', MAP_IDS.stone, 'locatedAt', '岑汐每日在石塘西岬望潮。'),
    e('luo-located', 'char.r96-luo-yan', MAP_IDS.atoll, 'locatedAt', '洛盐在半月沙脊旁泊船候客。'),
    e('cen-participates', 'char.r96-cen-xi', 'quest.r96-reef-lantern', 'participatesIn', '岑汐委托玩家辨认灯浮石。'),
    e('lantern-needs', 'quest.r96-reef-lantern', 'place.r96-lantern-stone', 'requires', '石塘灯浮记需要辨认灯序。'),
    e('lantern-rewards', 'quest.r96-reef-lantern', 'place.r96-halfmoon-atoll', 'rewards', '复命后望见南方的半月环礁。'),
    e('luo-participates', 'char.r96-luo-yan', 'quest.r96-atoll-reply', 'participatesIn', '洛盐托玩家抄录潮序回信。'),
    e('reply-needs', 'quest.r96-atoll-reply', 'place.r96-verse-terrace', 'requires', '半月的回信需要望序台的潮序。'),
    e('reply-prerequisite', 'quest.r96-atoll-reply', 'quest.r96-reef-lantern', 'requires', '先复命灯浮记，洛盐才托付回信。'),
    e('reply-rewards', 'quest.r96-atoll-reply', 'place.r96-tide-shrine', 'rewards', '交还回信后记录半月潮祠潮位。'),
    e('arrival-triggers', 'event.r96-stone-arrival', 'place.r96-stone-reef', 'triggers', '登礁时发现千里石塘。'),
    e('lantern-triggers', 'event.r96-lantern-stone', 'place.r96-lantern-stone', 'triggers', '辨认灯浮石时发现灯序。'),
    e('terrace-triggers', 'event.r96-verse-terrace', 'place.r96-verse-terrace', 'triggers', '抄录望序台时得到归程潮时。'),
    e('atoll-triggers', 'event.r96-atoll-arrival', 'place.r96-halfmoon-atoll', 'triggers', '踏上沙脊时发现半月环礁。'),
    e('shrine-triggers', 'event.r96-tide-shrine', 'place.r96-tide-shrine', 'triggers', '查看潮祠时读到潮位。'),
    e('pier-triggers', 'event.r96-east-pier', 'place.r96-halfmoon-atoll', 'triggers', '走到东栈时确认渡船。'),
  ];
}

function projectedCenter(position, art) {
  return {
    col: position.x / 100 * (art.columns - 1) + 0.5,
    row: position.y / 100 * (art.rows - 1) + 0.5,
  };
}
function atlasPosition(center, art) {
  return { x: (center.col - 0.5) / (art.columns - 1) * 100, y: (center.row - 0.5) / (art.rows - 1) * 100 };
}
function regionDescription(mapResourceId) {
  if (mapResourceId === MAP_IDS.stone) return '雾航湾以东的青黑石礁群，潮退时层层露出；灯浮石的灯序与望序台的潮时指引往来船只。';
  return '环抱一泓浅湖的白色缺月形环礁，沙脊直贯湖心；潮祠灯影作罗盘，东栈渡船往来归帆洲。';
}
function sameCenter(left, right) { return Math.abs(left.col - right.col) < 0.0001 && Math.abs(left.row - right.row) < 0.0001; }
function blankAtlas(art) { return Array.from({ length: art.rows }, () => Array(art.columns).fill(0)); }
function sha256(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function paintLine(grid, from, to, radius, value) {
  const [x1, y1] = from; const [x2, y2] = to; const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const cx = Math.round(x1 + (x2 - x1) * t); const cy = Math.round(y1 + (y2 - y1) * t);
    for (let y = cy - radius; y <= cy + radius; y += 1) for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x >= 0 && y >= 0 && x < 100 && y < 100 && grid[y][x] !== '~') grid[y][x] = value;
    }
  }
}
function distanceToPolyline(x, y, points) {
  let min = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index]; const [x2, y2] = points[index + 1];
    const dx = x2 - x1; const dy = y2 - y1; const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    min = Math.min(min, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return min;
}
function mergeManaged(current, additions, keyOf, anchorKey) {
  const replacements = new Map(additions.map((entry) => [keyOf(entry), entry]));
  const found = new Set();
  const merged = current.map((entry) => {
    const key = keyOf(entry); const replacement = replacements.get(key);
    if (replacement === undefined) return entry;
    found.add(key); return replacement;
  });
  const missing = additions.filter((entry) => !found.has(keyOf(entry)));
  if (missing.length === 0) return merged;
  const index = anchorKey === undefined ? -1 : merged.findIndex((entry) => keyOf(entry) === anchorKey);
  merged.splice(index < 0 ? merged.length : index + 1, 0, ...missing);
  return merged;
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
