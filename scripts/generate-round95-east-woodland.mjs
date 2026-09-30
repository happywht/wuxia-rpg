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
  npcs: resolve(base, 'characters/round-95-east-woodland-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-95-east-woodland-conversations.json'),
  quests: resolve(base, 'quests/round-95-east-woodland-quests.json'),
  baseline: resolve(root, 'iterations/round-95/round94-atlas-baseline.json'),
};

const OGA_FOREST = 'opengameart.forest-tileset-for-16x16';
const FOREST_IMAGE = 'assets/opengameart/forest-tileset-for-16x16/forest-level-4-sheet.png';
const MAP_IDS = {
  pine: 'map.round-95-misty-pine-gate',
  valley: 'map.round-95-cedar-valley',
  harbor: 'map.round-95-east-harbor',
  south: 'map.round-94-returning-sails',
  east: 'map.round-94-east-gate',
};
const REGION_CENTERS = {
  [MAP_IDS.pine]: { col: 700.5, row: 220.5 },
  [MAP_IDS.valley]: { col: 700.5, row: 345.5 },
  [MAP_IDS.harbor]: { col: 580.5, row: 470.5 },
};
const RESOURCE_ADDITIONS = [
  { id: MAP_IDS.pine, path: 'maps/round-95-misty-pine-gate.json', schema: 'grid-map' },
  { id: MAP_IDS.valley, path: 'maps/round-95-cedar-valley.json', schema: 'grid-map' },
  { id: MAP_IDS.harbor, path: 'maps/round-95-east-harbor.json', schema: 'grid-map' },
  { id: 'npc.round-95-east-woodland-set', path: 'characters/round-95-east-woodland-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-95-east-woodland-set', path: 'dialogues/round-95-east-woodland-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-95-east-woodland-set', path: 'quests/round-95-east-woodland-quests.json', schema: 'quest-set' },
];
const periods = ['period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night'];
const maps = [
  makeMap('pine', MAP_IDS.pine, '东境·雾杉关', 'misty-pine-gate'),
  makeMap('valley', MAP_IDS.valley, '东境·听杉谷', 'cedar-valley'),
  makeMap('harbor', MAP_IDS.harbor, '东溟·照叶港', 'east-harbor'),
];

await ensureBaseline();
const [world, manifest, nodes, edges] = await Promise.all([
  readJson(files.world), readJson(files.manifest), readJson(files.nodes), readJson(files.edges),
]);
const art = world.atlasArt;
if (art?.columns !== 768 || art.rows !== 576 || art.tileSize !== 8 || art.layers.length < 53) {
  throw new Error(`Round 95 需要基于 768×576、8px/格且至少含 53 层的舆图；当前为 ${art?.columns}×${art?.rows}、${art?.tileSize}px、${art?.layers.length} 层。`);
}
const baseline = await readJson(files.baseline);
const decoded = art.layers.map((layer) => ({
  ...layer,
  cells: layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns),
}));
for (const [id, expected] of Object.entries(baseline.layers)) {
  const layer = decoded.find((entry) => entry.id === id);
  if (layer === undefined || sha256(layer.cells) !== expected) throw new Error(`Round 94 舊圖層被改動：${id}。`);
}
for (const [id, anchor] of Object.entries(baseline.regions)) {
  const region = world.regions.find((entry) => entry.mapResourceId === id);
  if (region === undefined || !sameCenter(projectedCenter(region.atlasPosition, art), anchor)) {
    throw new Error(`Round 94 舊區域錨點漂移或遺失：${id}。`);
  }
}

const forestAtlasTileset = {
  id: OGA_FOREST, image: FOREST_IMAGE, tileSize: 16, columns: 7, rows: 4, spacing: 0, tileCount: 28,
};
const managedLayerIds = new Set(['world-r95-eastland', 'world-r95-east-coast', 'world-r95-east-trails', 'world-r95-east-forest']);
const priorLayers = decoded.filter((layer) => !managedLayerIds.has(layer.id));
const atlasLayers = makeAtlasLayers(art, priorLayers);
for (const layer of atlasLayers) {
  assertNoLandOverlap(layer, priorLayers);
}
const allAtlasLayers = mergeManaged(decoded, atlasLayers, (entry) => entry.id, 'world-r94-south-lane');
const tilesets = mergeManaged(art.tilesets, [forestAtlasTileset], (entry) => entry.id);
world.atlasArt = {
  columns: art.columns,
  rows: art.rows,
  tileSize: art.tileSize,
  regionFootprint: art.regionFootprint,
  tilesets,
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

console.log(`Round 95 東境林谷已生成：${maps.length} 張探索地圖、${regions.length} 個區域、8 條雙向路線、${world.atlasArt.layers.length} 個舆圖圖層。`);

async function ensureBaseline() {
  try { await access(files.baseline); return; } catch { /* Capture the committed R94 data once. */ }
  const oldWorld = await readJson(files.world);
  const oldArt = oldWorld.atlasArt;
  if (oldArt?.columns !== 768 || oldArt.rows !== 576 || oldArt.layers.length !== 53 || oldWorld.regions.length !== 15) {
    throw new Error('建立 Round 95 基線前，來源必須是完整的 Round 94 舆圖。');
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
  const canopy = Array.from({ length: rows }, () => Array(columns).fill(0));
  const undergrowth = Array.from({ length: rows }, () => Array(columns).fill(0));
  const walkable = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows && grid[row][col] !== '~' && grid[row][col] !== '^';

  if (kind === 'pine') {
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
      const radius = Math.sqrt(((col - 50) / 48) ** 2 + ((row - 50) / 46) ** 2);
      if (radius <= 1) grid[row][col] = radius > 0.91 ? ',' : '.';
    }
  } else if (kind === 'valley') {
    for (let row = 3; row < 97; row += 1) for (let col = 2; col < 98; col += 1) {
      const rim = row < 8 || row > 91 || col < 2 || col > 97;
      grid[row][col] = rim ? '^' : '.';
    }
    for (let row = 10; row < 90; row += 1) {
      const col = 48 + Math.round(Math.sin(row / 13) * 9);
      if (grid[row][col] === '.') grid[row][col] = '=';
      if (grid[row][col + 1] === '.') grid[row][col + 1] = '=';
    }
  } else {
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
      const radius = Math.sqrt(((col - 36) / 58) ** 2 + ((row - 50) / 48) ** 2);
      if (radius <= 1) grid[row][col] = radius > 0.9 ? ',' : '.';
    }
  }

  const road = kind === 'valley'
    ? [[3, 50], [28, 45], [53, 55], [76, 47], [96, 50]]
    : [[3, 50], [38, 50], [63, 50], [96, 50]];
  if (kind === 'harbor') road[road.length - 1] = [75, 50];
  for (let index = 0; index < road.length - 1; index += 1) paintLine(grid, road[index], road[index + 1], 1, ',');
  if (kind === 'pine') paintLine(grid, [63, 50], [72, 33], 1, ',');
  if (kind === 'valley') paintLine(grid, [73, 47], [77, 31], 1, ',');
  if (kind === 'harbor') paintLine(grid, [55, 50], [60, 31], 1, ',');

  const treeClusters = kind === 'pine'
    ? [[20, 24, 12, 10], [44, 20, 11, 10], [78, 22, 10, 9], [23, 76, 12, 10], [48, 82, 13, 8], [80, 77, 10, 12]]
    : kind === 'valley'
      ? [[20, 22, 11, 11], [35, 76, 12, 9], [59, 22, 12, 9], [84, 76, 10, 11], [88, 24, 8, 10]]
      : [[21, 24, 12, 10], [37, 78, 12, 10], [63, 22, 9, 9], [26, 72, 9, 11]];
  for (const [cx, cy, rx, ry] of treeClusters) {
    for (let row = Math.max(5, cy - ry); row <= Math.min(94, cy + ry); row += 3) {
      for (let col = Math.max(6, cx - rx); col <= Math.min(93, cx + rx); col += 3) {
        const norm = ((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2;
        const textureSeed = (col * 17 + row * 31 + cx * 7) % 7;
        if (norm > 0.73 || textureSeed > 3 || !walkable(col, row) || distanceToPolyline(col, row, road) < 5) continue;
        grid[row][col] = '#';
        canopy[row][col] = [1, 2, 3, 4][(col + row) % 4];
      }
    }
  }
  for (let row = 6; row < 94; row += 8) for (let col = 7; col < 94; col += 8) {
    const seed = (col * 7 + row * 19 + kind.length * 11) % 9;
    if (seed > 1 || !walkable(col, row) || canopy[row][col] > 0 || distanceToPolyline(col, row, road) < 3) continue;
    undergrowth[row][col] = 15 + seed;
  }
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const symbol = grid[row][col];
    if (symbol === '~') ground[row][col] = 286;
    else if (symbol === '^') ground[row][col] = 30;
    else if (symbol === ',') ground[row][col] = ((col + row) % 2 === 0) ? 5 : 6;
    else ground[row][col] = ((col * 5 + row * 3) % 7 === 0) ? 3 : 1;
  }

  const tilesets = [
    { id: 'opengameart.puny-world', image: 'assets/opengameart/puny-world/tileset.png', tileSize: 16, columns: 27, rows: 65, spacing: 0, tileCount: 1755 },
    { ...forestTileset() },
    { id: 'opengameart.puny-characters', image: 'assets/opengameart/puny-characters/actors.png', tileSize: 16, columns: 20, rows: 16, spacing: 0, tileCount: 320 },
  ];
  const cells = (values) => values.map((row) => [...row]);
  const npcFrame = 120;
  const map = {
    id, name, tileSize: 48, columns, rows,
    tileTypes: {
      '.': { color: '#789b5c', solid: false },
      ',': { color: '#c3a66f', solid: false },
      '=': { color: '#6ba9ba', solid: false },
      '#': { color: '#2f5939', solid: true },
      '^': { color: '#616b64', solid: true },
      '~': { color: '#245168', solid: true },
    },
    grid: grid.map((row) => row.join('')),
    playerStart: { col: 3, row: 50 },
    art: {
      tileSize: 16,
      tilesets,
      layers: [
        { id: `r95-${suffix}-ground`, tilesetId: 'opengameart.puny-world', cells: cells(ground) },
        { id: `r95-${suffix}-canopy`, tilesetId: OGA_FOREST, cells: cells(canopy) },
        { id: `r95-${suffix}-undergrowth`, tilesetId: OGA_FOREST, cells: cells(undergrowth) },
      ],
      actors: {
        tilesetId: 'opengameart.puny-characters', playerFrame: 256, defaultNpcFrame: npcFrame,
        playerFrames: {
          idle: { down: 256, right: 264, up: 272, left: 280 },
          walk: { down: [257, 258, 259], right: [265, 266, 267], up: [273, 274, 275], left: [281, 282, 283] },
        },
      },
    },
  };
  return map;
}

function makeAtlasLayers(art, decoded) {
  const land = blankAtlas(art); const coast = blankAtlas(art); const route = blankAtlas(art); const trees = blankAtlas(art);
  const paintEllipse = (cx, cy, rx, ry, gid = 3) => {
    for (let row = Math.max(0, Math.floor(cy - ry)); row <= Math.min(art.rows - 1, Math.ceil(cy + ry)); row += 1) {
      for (let col = Math.max(0, Math.floor(cx - rx)); col <= Math.min(art.columns - 1, Math.ceil(cx + rx)); col += 1) {
        if (((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1) land[row][col] = gid;
      }
    }
  };
  const paintCapsule = (from, to, radius, gid = 3, into = land) => {
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
  };
  paintEllipse(700, 221, 42, 31, 3);
  paintEllipse(700, 346, 45, 37, 7);
  paintCapsule([700, 141], [700, 190], 7, 3);
  paintCapsule([700, 250], [700, 309], 11, 3);
  paintCapsule([697, 379], [625, 441], 12, 7);
  paintEllipse(580, 470, 39, 26, 3);

  for (let row = 0; row < art.rows; row += 1) for (let col = 0; col < art.columns; col += 1) {
    if (land[row][col] === 0) continue;
    const nearSea = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => {
      const x = col + dx; const y = row + dy;
      return x < 0 || y < 0 || x >= art.columns || y >= art.rows || land[y][x] === 0;
    });
    if (nearSea) coast[row][col] = 6;
  }
  const routeSegments = [
    [[700, 141], [700, 190]], [[700, 252], [700, 310]], [[700, 382], [625, 441]], [[625, 441], [580, 470]],
  ];
  for (const [from, to] of routeSegments) paintCapsule(from, to, 2, 5, route);

  const protectedLayers = decoded.filter((layer) => layer.id !== 'world-ocean' && layer.id !== 'world-r94-south-shallows');
  for (const [cx, cy, rx, ry] of [[678, 212, 38, 25], [720, 228, 34, 25], [674, 345, 39, 28], [722, 351, 38, 30], [574, 468, 32, 20]]) {
    for (let row = cy - ry; row <= cy + ry; row += 4) for (let col = cx - rx; col <= cx + rx; col += 4) {
      if (row < 0 || col < 0 || row >= art.rows || col >= art.columns || land[row][col] === 0) continue;
      if (((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 > 0.82 || route[row][col] !== 0) continue;
      if ((col * 13 + row * 29) % 5 > 2) continue;
      if (protectedLayers.some((layer) => layer.cells[row]?.[col] !== 0)) {
        throw new Error(`Round 95 森林图素与历史图层相交：${col},${row}。`);
      }
      trees[row][col] = ((col + row) % 3 === 0) ? 2 : 1;
    }
  }
  return [
    { id: 'world-r95-eastland', tilesetId: 'wuxia.world-palette', cells: land },
    { id: 'world-r95-east-coast', tilesetId: 'wuxia.world-palette', cells: coast },
    { id: 'world-r95-east-trails', tilesetId: 'wuxia.world-palette', cells: route },
    { id: 'world-r95-east-forest', tilesetId: OGA_FOREST, cells: trees },
  ];
}

function assertNoLandOverlap(layer, oldLayers) {
  const allowBackground = new Set(['world-ocean', 'world-r94-south-shallows']);
  if (!['world-r95-eastland', 'world-r95-east-coast', 'world-r95-east-trails', 'world-r95-east-forest'].includes(layer.id)) return;
  for (let row = 0; row < layer.cells.length; row += 1) for (let col = 0; col < layer.cells[row].length; col += 1) {
    if (layer.cells[row][col] === 0) continue;
    for (const previous of oldLayers) {
      if (allowBackground.has(previous.id)) continue;
      if (previous.cells[row]?.[col] !== 0) throw new Error(`Round 95 ${layer.id} 与既有图层 ${previous.id} 重叠于 ${col},${row}。`);
    }
  }
}

function createTransitions() {
  const point = (mapResourceId, col, row) => ({ mapResourceId, col, row });
  return [
    ['gate.r95-east-to-pine', '东脊入杉关', point(MAP_IDS.east, 5, 50), point(MAP_IDS.pine, 3, 50)],
    ['gate.r95-pine-to-east', '北返天门关', point(MAP_IDS.pine, 4, 50), point(MAP_IDS.east, 6, 50)],
    ['gate.r95-pine-to-valley', '南下听杉谷', point(MAP_IDS.pine, 96, 50), point(MAP_IDS.valley, 3, 50)],
    ['gate.r95-valley-to-pine', '北返雾杉关', point(MAP_IDS.valley, 4, 50), point(MAP_IDS.pine, 95, 50)],
    ['gate.r95-valley-to-harbor', '沿海路赴照叶港', point(MAP_IDS.valley, 96, 50), point(MAP_IDS.harbor, 3, 50)],
    ['gate.r95-harbor-to-valley', '循溪路返听杉谷', point(MAP_IDS.harbor, 4, 50), point(MAP_IDS.valley, 95, 50)],
    ['gate.r95-harbor-to-south', '西渡归帆洲', point(MAP_IDS.harbor, 75, 50), point(MAP_IDS.south, 52, 97)],
    ['gate.r95-south-to-harbor', '东返照叶港', point(MAP_IDS.south, 52, 96), point(MAP_IDS.harbor, 74, 50)],
  ].map(([id, name, from, to]) => ({ id, name, from, to }));
}

function createLandmarks() {
  return [
    { id: 'landmark.r95-pine-gate', mapResourceId: MAP_IDS.pine, col: 15, row: 50, name: '雾杉关驿门', category: 'crossing', discoveryNodeId: 'place.r95-misty-pine-gate' },
    { id: 'landmark.r95-signal-stone', mapResourceId: MAP_IDS.pine, col: 72, row: 33, name: '风铃石', category: 'other', discoveryNodeId: 'place.r95-windbell-stone' },
    { id: 'landmark.r95-cedar-bridge', mapResourceId: MAP_IDS.valley, col: 41, row: 55, name: '听杉溪石桥', category: 'crossing', discoveryNodeId: 'place.r95-cedar-valley' },
    { id: 'landmark.r95-tide-gauge', mapResourceId: MAP_IDS.valley, col: 77, row: 31, name: '旧潮尺', category: 'other', discoveryNodeId: 'place.r95-old-tide-gauge' },
    { id: 'landmark.r95-harbor-pier', mapResourceId: MAP_IDS.harbor, col: 74, row: 50, name: '照叶南栈', category: 'crossing', discoveryNodeId: 'place.r95-east-harbor' },
    { id: 'landmark.r95-lookout', mapResourceId: MAP_IDS.harbor, col: 60, row: 31, name: '东溟瞭潮台', category: 'water', discoveryNodeId: 'place.r95-east-harbor' },
  ];
}

function createEvents() {
  return [
    { id: 'event.r95-pine-arrival', mapResourceId: MAP_IDS.pine, col: 6, row: 50, text: '越过天门关后的雪线，杉林把东风滤成轻雾。石阶旁留着一串下山的旧驿蹄印。', approachText: '林口的风铃只响一下，声音便被杉梢接走。', once: true, discoverKnowledgeNodeId: 'place.r95-misty-pine-gate' },
    { id: 'event.r95-windbell-stone', mapResourceId: MAP_IDS.pine, col: 72, row: 33, text: '石上的铜舌早已不在，磨痕却指向谷中溪桥。有人在石缝里夹着一张褪色的潮路草图。', approachText: '旧石旁垂着一束新剪的杉枝。', once: true, discoverKnowledgeNodeId: 'place.r95-windbell-stone', interaction: { prompt: '查看风铃石上的旧路记号', range: 1, approachDirections: ['left', 'right', 'down'] } },
    { id: 'event.r95-valley-arrival', mapResourceId: MAP_IDS.valley, col: 6, row: 50, text: '溪水沿杉谷向南，石桥下刻着与林门相同的三道短线。谷口的古木朝着海风一侧倾斜。', approachText: '杉针落在溪面，顺着石桥下游漂去。', once: true, discoverKnowledgeNodeId: 'place.r95-cedar-valley' },
    { id: 'event.r95-old-tide-gauge', mapResourceId: MAP_IDS.valley, col: 77, row: 31, text: '旧潮尺分出的刻度并非涨落高低，而是东岸三处可泊舟的时辰。最末一道正对照叶港。', approachText: '石尺底座有一圈尚未被苔痕盖住的数字。', once: true, discoverKnowledgeNodeId: 'place.r95-old-tide-gauge', interaction: { prompt: '辨认听杉溪旧潮尺', range: 1, approachDirections: ['left', 'right', 'down'] } },
    { id: 'event.r95-harbor-arrival', mapResourceId: MAP_IDS.harbor, col: 7, row: 50, text: '林道尽头接上港口木栈，海面和山风在此交汇。南下渡船依照旧潮尺标出的时辰往来。', approachText: '木桩系着一段新换的青绳，绳结指向南方海面。', once: true, discoverKnowledgeNodeId: 'place.r95-east-harbor' },
    { id: 'event.r95-east-pier', mapResourceId: MAP_IDS.harbor, col: 74, row: 50, text: '栈桥尽头能望见归帆洲的灯影。潮退时，水面露出一串供船工校准方向的浅礁。', approachText: '石桩上用朱砂写着今日渡船的开船时刻。', once: true, discoverKnowledgeNodeId: 'place.r95-east-harbor' },
  ];
}

function createNpcs() {
  const schedule = (positions) => periods.map((periodId, index) => ({ periodId, position: positions[index] }));
  return [
    {
      id: 'char.r95-lin-yue', name: '林越', mapResourceId: MAP_IDS.pine, position: { col: 46, row: 47 },
      dialogueId: 'dlg.r95-lin-yue', questGiver: true, spriteFrame: 144,
      spriteFrames: { down: 144, right: 152, up: 160, left: 168 },
      schedule: schedule([{ col: 44, row: 48 }, { col: 45, row: 47 }, { col: 47, row: 47 }, { col: 49, row: 48 }, { col: 50, row: 47 }, { col: 48, row: 47 }, { col: 44, row: 48 }]),
    },
    {
      id: 'char.r95-pei-hang', name: '裴杭', mapResourceId: MAP_IDS.harbor, position: { col: 52, row: 48 },
      dialogueId: 'dlg.r95-pei-hang', questGiver: true, spriteFrame: 96,
      spriteFrames: { down: 96, right: 104, up: 112, left: 120 },
      schedule: schedule([{ col: 51, row: 48 }, { col: 52, row: 48 }, { col: 54, row: 48 }, { col: 56, row: 49 }, { col: 56, row: 48 }, { col: 53, row: 48 }, { col: 51, row: 48 }]),
    },
  ];
}

function createQuests() {
  return [
    {
      id: 'quest.r95-windbell-route', name: '风铃石上的路',
      description: '杉关守路人林越请你辨认风铃石的旧路记号，并把通往溪谷的线索带回林门。',
      giverNpcId: 'char.r95-lin-yue',
      objectives: [
        { id: 'objective.r95-find-windbell', kind: 'discoverKnowledge', targetId: 'place.r95-windbell-stone', requiredCount: 1, text: '在杉林深处辨认风铃石的刻痕' },
        { id: 'objective.r95-report-windbell', kind: 'talkToNpc', targetId: 'char.r95-lin-yue', requiredCount: 1, text: '回雾杉关向林越说明石上的路记' },
      ],
      rewards: { experience: 44, currency: 32, discoverKnowledgeNodeIds: ['place.r95-cedar-valley'] },
    },
    {
      id: 'quest.r95-east-tide-course', name: '照叶港的潮时',
      description: '林越的路记确认后，照叶港舟师裴杭请你核对听杉谷旧潮尺，再回港确认渡船时刻。',
      giverNpcId: 'char.r95-pei-hang', prerequisiteQuestIds: ['quest.r95-windbell-route'],
      objectives: [
        { id: 'objective.r95-read-tide-gauge', kind: 'discoverKnowledge', targetId: 'place.r95-old-tide-gauge', requiredCount: 1, text: '在听杉溪辨出旧潮尺的泊舟刻度' },
        { id: 'objective.r95-report-tide-course', kind: 'talkToNpc', targetId: 'char.r95-pei-hang', requiredCount: 1, text: '回照叶港与裴杭校准渡船时刻' },
      ],
      rewards: { experience: 56, currency: 46, discoverKnowledgeNodeIds: ['place.r95-east-harbor'] },
    },
  ];
}

function createDialogues() {
  const questOptions = (dialogueId, questId, objectiveName, routeText, completionText) => ({
    id: dialogueId,
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet', text: `${objectiveName}的线索写在旧路记上。`,
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
      { id: 'farewell', text: '对方点头收好手边的行旅记，继续看顾林路与潮船。' },
    ],
  });
  return [
    questOptions('dlg.r95-lin-yue', 'quest.r95-windbell-route', '林越把一张旧驿图压在木箱上', '「沿主路向南，过两处杉影后从溪石边折上坡。风铃石就在坡顶，记号会指向谷中石桥。」', '林越把路记补全：「三道短线从山入水，看来旧驿道与潮船本是一条路。」'),
    questOptions('dlg.r95-pei-hang', 'quest.r95-east-tide-course', '裴杭在潮牌旁比对着船期', '「从港口回听杉谷，沿溪找到旧潮尺。记下末端指向的浅礁，再回来定船时。」', '裴杭将潮牌翻到渡船一面：「旧潮尺没有骗人。下一班船退潮时开，归帆洲的灯会替你引路。」'),
  ];
}

function createNodes() {
  const entries = [
    ['place.r95-misty-pine-gate', 'place', '雾杉关', '天门关南下的林门，旧驿道穿过杉林。'],
    [MAP_IDS.pine, 'place', '雾杉关探索地图', '天门关南下、通往听杉谷的百格林地。'],
    ['place.r95-windbell-stone', 'place', '风铃石', '石面刻痕指向听杉谷与东溟旧潮路。'],
    ['place.r95-cedar-valley', 'place', '听杉谷', '溪水、石桥和古杉交错的东境山谷。'],
    [MAP_IDS.valley, 'place', '听杉谷探索地图', '溪桥、古杉与东溟旧潮尺所在的百格山谷。'],
    ['place.r95-old-tide-gauge', 'place', '旧潮尺', '在溪谷记录潮汐泊舟时刻的古老石尺。'],
    ['place.r95-east-harbor', 'place', '照叶港', '背靠林地、面朝东溟的渡船港口。'],
    [MAP_IDS.harbor, 'place', '照叶港探索地图', '由雾杉林路进入、乘船南下归帆洲的港口地图。'],
    ['char.r95-lin-yue', 'character', '林越', '雾杉关守路人，熟悉石刻和旧驿记。'],
    ['char.r95-pei-hang', 'character', '裴杭', '照叶港舟师，按旧潮尺安排南下渡船。'],
    ['quest.r95-windbell-route', 'quest', '风铃石上的路', '辨认风铃石的旧路记号，带回林门。'],
    ['quest.r95-east-tide-course', 'quest', '照叶港的潮时', '核对旧潮尺并确认渡船潮时。'],
    ['event.r95-pine-arrival', 'event', '抵达雾杉关', '沿天门关南下，发现杉林旧驿道。'],
    ['event.r95-windbell-stone', 'event', '查看风铃石', '从石刻发现通往听杉谷的方向。'],
    ['event.r95-valley-arrival', 'event', '抵达听杉谷', '发现杉溪与东溟之间的古驿路线。'],
    ['event.r95-old-tide-gauge', 'event', '辨认旧潮尺', '从溪谷石尺读出可泊舟的潮汐刻度。'],
    ['event.r95-harbor-arrival', 'event', '抵达照叶港', '发现按旧潮尺候船的林港。'],
    ['event.r95-east-pier', 'event', '照叶港南栈', '在南栈尽头确认前往归帆洲的潮船。'],
  ];
  return entries.map(([id, kind, title, summary]) => ({ id, kind, title, summary, knownByDefault: false }));
}

function createEdges() {
  const e = (id, fromId, toId, relation, summary) => ({ id: `kg.edge.r95-${id}`, fromId, toId, relation, summary });
  return [
    e('pine-located', MAP_IDS.pine, 'place.r95-misty-pine-gate', 'locatedAt', '雾杉关地图承载林门旧驿道。'),
    e('stone-located', 'place.r95-windbell-stone', MAP_IDS.pine, 'locatedAt', '风铃石位于雾杉关杉林深处。'),
    e('valley-located', MAP_IDS.valley, 'place.r95-cedar-valley', 'locatedAt', '听杉谷地图承载溪桥与古杉地貌。'),
    e('gauge-located', 'place.r95-old-tide-gauge', MAP_IDS.valley, 'locatedAt', '旧潮尺位于听杉谷溪边。'),
    e('harbor-located', MAP_IDS.harbor, 'place.r95-east-harbor', 'locatedAt', '照叶港地图承载东溟渡船栈桥。'),
    e('lin-located', 'char.r95-lin-yue', MAP_IDS.pine, 'locatedAt', '林越每日在雾杉关附近巡视。'),
    e('pei-located', 'char.r95-pei-hang', MAP_IDS.harbor, 'locatedAt', '裴杭在照叶港安排潮船。'),
    e('lin-participates', 'char.r95-lin-yue', 'quest.r95-windbell-route', 'participatesIn', '林越委托玩家辨认风铃石。'),
    e('windbell-needs', 'quest.r95-windbell-route', 'place.r95-windbell-stone', 'requires', '风铃石上的路需要调查旧石刻。'),
    e('windbell-rewards', 'quest.r95-windbell-route', 'place.r95-cedar-valley', 'rewards', '完成路记后确认听杉谷见闻。'),
    e('pei-participates', 'char.r95-pei-hang', 'quest.r95-east-tide-course', 'participatesIn', '裴杭委托玩家校准渡船潮时。'),
    e('tide-needs', 'quest.r95-east-tide-course', 'place.r95-old-tide-gauge', 'requires', '照叶港潮时需要辨认听杉谷旧潮尺。'),
    e('tide-prerequisite', 'quest.r95-east-tide-course', 'quest.r95-windbell-route', 'requires', '先辨清风铃石旧路，裴杭才托付潮时校验。'),
    e('tide-rewards', 'quest.r95-east-tide-course', 'place.r95-east-harbor', 'rewards', '完成潮时校验后记录照叶港渡船时刻。'),
    e('arrival-triggers', 'event.r95-pine-arrival', 'place.r95-misty-pine-gate', 'triggers', '进入雾杉关时发现林门。'),
    e('stone-triggers', 'event.r95-windbell-stone', 'place.r95-windbell-stone', 'triggers', '查看风铃石时发现旧路记。'),
    e('valley-triggers', 'event.r95-valley-arrival', 'place.r95-cedar-valley', 'triggers', '进入听杉谷时记录溪桥。'),
    e('gauge-triggers', 'event.r95-old-tide-gauge', 'place.r95-old-tide-gauge', 'triggers', '调查旧潮尺时发现潮汐刻度。'),
    e('harbor-triggers', 'event.r95-harbor-arrival', 'place.r95-east-harbor', 'triggers', '进入照叶港时发现渡船港口。'),
    e('pier-triggers', 'event.r95-east-pier', 'place.r95-east-harbor', 'triggers', '走到照叶南栈时查看渡船时刻。'),
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
  if (mapResourceId === MAP_IDS.pine) return '天门关南下的林门；旧驿道穿过层层杉影，谷口的风铃石记着行旅方向。';
  if (mapResourceId === MAP_IDS.valley) return '溪水、古杉与石桥相接的山谷，溪边潮痕保存着通向东溟的旧水尺。';
  return '背靠森林、面朝浅海的港口，木栈伸向潮水，渡船往来归帆洲外湾。';
}
function sameCenter(left, right) { return Math.abs(left.col - right.col) < 0.0001 && Math.abs(left.row - right.row) < 0.0001; }
function blankAtlas(art) { return Array.from({ length: art.rows }, () => Array(art.columns).fill(0)); }
function sha256(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function forestTileset() { return { id: OGA_FOREST, image: FOREST_IMAGE, tileSize: 16, columns: 7, rows: 4, spacing: 0, tileCount: 28 }; }
function paintLine(grid, from, to, radius, value) {
  const [x1, y1] = from; const [x2, y2] = to; const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const cx = Math.round(x1 + (x2 - x1) * t); const cy = Math.round(y1 + (y2 - y1) * t);
    for (let y = cy - radius; y <= cy + radius; y += 1) for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (x >= 0 && y >= 0 && x < 100 && y < 100 && grid[y][x] !== '~' && grid[y][x] !== '^') grid[y][x] = value;
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
