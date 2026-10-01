import { deepenPeopleDialogues } from './lib/round105-people-content.mjs';
import { createHash } from 'node:crypto';
import { deepenSeaQuests, deepenSeaDialogues } from './lib/round102-sea-content.mjs';
import { readFileSync } from 'node:fs';
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
  npcs: resolve(base, 'characters/round-97-lanxin-reef-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-97-lanxin-reef-conversations.json'),
  quests: resolve(base, 'quests/round-97-lanxin-reef-quests.json'),
  baseline: resolve(root, 'iterations/round-97/round96-atlas-baseline.json'),
};

const PUNY_WORLD = 'opengameart.puny-world';
const MAP_IDS = {
  lanxin: 'map.round-97-lanxin-isle',
  pilot: 'map.round-97-pilot-reef',
  windward: 'map.round-84-windward-isle',
  tide: 'map.round-85-tide-isle',
  east: 'map.round-94-east-gate',
};
// Projected atlas cell centers for the two new east-mid-sea regions.
const REGION_CENTERS = {
  [MAP_IDS.lanxin]: { col: 480.5, row: 190.5 },
  [MAP_IDS.pilot]: { col: 520.5, row: 110.5 },
};
const RESOURCE_ADDITIONS = [
  { id: MAP_IDS.lanxin, path: 'maps/round-97-lanxin-isle.json', schema: 'grid-map' },
  { id: MAP_IDS.pilot, path: 'maps/round-97-pilot-reef.json', schema: 'grid-map' },
  { id: 'npc.round-97-lanxin-reef-set', path: 'characters/round-97-lanxin-reef-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-97-lanxin-reef-set', path: 'dialogues/round-97-lanxin-reef-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-97-lanxin-reef-set', path: 'quests/round-97-lanxin-reef-quests.json', schema: 'quest-set' },
];
// Intentional overlay policy: the new islands may sit only on the open ocean;
// the sea lanes additionally cross the Windward/Tide ring water already drawn
// by rounds 84/85. Anything else is a hard generator failure.
const LAND_BACKGROUND = new Set(['world-ocean']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r84-expanse-water', 'world-r85-expanse-water']);
// Island footprints and lane capsules in atlas cells (see iterations/round-97/plan.md).
// The pilot reef keeps the planned (520,110) center with a radius shrunk until the
// candidate shape no longer touches the round-91 terrace layers.
const LANXIN_ELLIPSE = { cx: 480, cy: 190, rx: 46, ry: 34 };
const LANXIN_COVE = { cx: 486, cy: 196, rx: 14, ry: 9 };
const PILOT_ELLIPSE = { cx: 520, cy: 110, rx: 22, ry: 20 };
const PILOT_COVE = { cx: 520, cy: 114, rx: 6, ry: 4 };
const SATELLITE_SHOALS = [
  { cx: 430, cy: 160, rx: 5, ry: 3 }, { cx: 533, cy: 176, rx: 4, ry: 3 },
  { cx: 436, cy: 223, rx: 4, ry: 3 }, { cx: 527, cy: 209, rx: 5, ry: 3 },
  { cx: 500, cy: 95, rx: 3, ry: 2 }, { cx: 541, cy: 131, rx: 3, ry: 2 },
];
const LANE_SEGMENTS = [
  [[383, 132], [410, 150], [433, 180]],
  [[432, 280], [438, 250], [451, 220]],
  [[498, 154], [504, 144], [510, 131]],
  [[520, 133], [580, 134], [650, 136], [682, 134]],
];
// Old-map gate tiles picked with real collision data plus a BFS from each
// map's player start; the generator re-verifies both before writing anything.
const OLD_MAP_PORTS = [
  { mapId: MAP_IDS.windward, file: 'round-84-windward-isle.json', cells: [[92, 55], [93, 55]] },
  { mapId: MAP_IDS.tide, file: 'round-85-tide-isle.json', cells: [[85, 54], [86, 54]] },
  { mapId: MAP_IDS.east, file: 'round-94-east-gate.json', cells: [[50, 94], [50, 93]] },
];
// Entry tiles sit on the map fringe, exit tiles one step inland (round-96 pattern).
const PORT_TILES = {
  [MAP_IDS.lanxin]: [[3, 40], [4, 40], [48, 96], [48, 95], [64, 3], [64, 4]],
  [MAP_IDS.pilot]: [[50, 96], [50, 95], [90, 90], [89, 89]],
};
const maps = [
  makeMap('lanxin', MAP_IDS.lanxin, '东溟·澜心洲', 'lanxin-isle'),
  makeMap('pilot', MAP_IDS.pilot, '东溟·引航礁', 'pilot-reef'),
];
const periods = ['period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night'];

const managedLayerIds = new Set(['world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land', 'world-r97-lanxin-lane']);

await ensureBaseline();
const [world, manifest, nodes, edges] = await Promise.all([
  readJson(files.world), readJson(files.manifest), readJson(files.nodes), readJson(files.edges),
]);
const art = world.atlasArt;
// Idempotent guards: strips this round's managed layers/regions first so a
// replay over already-generated data still sees the exact R96 baseline.
const priorLayerCount = art?.layers?.filter((layer) => !managedLayerIds.has(layer.id)).length ?? 0;
const priorRegionCount = world.regions?.filter((region) => region.mapResourceId !== MAP_IDS.lanxin && region.mapResourceId !== MAP_IDS.pilot).length ?? 0;
if (art?.columns !== 768 || art.rows !== 576 || art.tileSize !== 8 || priorLayerCount !== 61) {
  throw new Error(`Round 97 需要基于 768×576、8px/格且含 61 层的舆图；当前为 ${art?.columns}×${art?.rows}、${art?.tileSize}px、${priorLayerCount} 层（剔除本輪管理層後）。`);
}
if (priorRegionCount !== 20) throw new Error(`Round 97 需要 20 个既有区域，当前 ${priorRegionCount} 个（剔除本輪區域後）。`);
const baseline = await readJson(files.baseline);
const decoded = art.layers.map((layer) => ({
  ...layer,
  cells: layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns),
}));
for (const [id, expected] of Object.entries(baseline.layers)) {
  const layer = decoded.find((entry) => entry.id === id);
  if (layer === undefined || sha256(layer.cells) !== expected) throw new Error(`Round 96 舊圖層被改動：${id}。`);
}
for (const [id, anchor] of Object.entries(baseline.regions)) {
  const region = world.regions.find((entry) => entry.mapResourceId === id);
  if (region === undefined || !sameCenter(projectedCenter(region.atlasPosition, art), anchor)) {
    throw new Error(`Round 96 舊區域錨點漂移或遺失：${id}。`);
  }
}

verifyOldMapPorts();
for (const map of maps) verifyNewMapPorts(map);

const priorLayers = decoded.filter((layer) => !managedLayerIds.has(layer.id));
const atlasLayers = makeAtlasLayers(art);
for (const layer of atlasLayers) assertOverlayPolicy(layer, priorLayers);
assertLaneShoreline(atlasLayers, priorLayers);
const allAtlasLayers = mergeManaged(decoded, atlasLayers, (entry) => entry.id, 'world-r96-reef-lane');
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
const transitions = createTransitions();
world.transitions = mergeManaged(world.transitions, transitions, (entry) => entry.id);
assertNoGateConflicts(world.transitions);
assertRouteSegments(world.transitions, MAP_IDS.east, MAP_IDS.tide, 3);
assertRouteSegments(world.transitions, MAP_IDS.tide, MAP_IDS.east, 3);
const npcs = createNpcs();
const quests = createQuests();
const dialogues = createDialogues();
const events = createEvents();
const landmarks = createLandmarks();
const graphNodes = createNodes();
const graphEdges = createEdges();
assertContentCells(maps, npcs, events, landmarks);
assertContentReferences(quests, dialogues, events, graphNodes, graphEdges);
world.landmarks = mergeManaged(world.landmarks ?? [], landmarks, (entry) => entry.id);
world.events = mergeManaged(world.events ?? [], events, (entry) => entry.id);
manifest.resources = mergeManaged(manifest.resources, RESOURCE_ADDITIONS, (entry) => entry.id, MAP_IDS.pilot);
nodes.nodes = mergeManaged(nodes.nodes, graphNodes, (entry) => entry.id);
edges.edges = mergeManaged(edges.edges, graphEdges, (entry) => entry.id);
assertGraphClosure(nodes.nodes, edges.edges);

await Promise.all([
  ...maps.map((map) => writeJson(resolve(base, 'maps', `${map.id.slice('map.'.length)}.json`), map)),
  writeJson(files.world, world), writeJson(files.manifest, manifest),
  writeJson(files.nodes, nodes), writeJson(files.edges, edges),
  writeJson(files.npcs, { npcs }),
  writeJson(files.dialogues, deepenPeopleDialogues(deepenSeaDialogues({ conversations: dialogues }))),
  writeJson(files.quests, deepenSeaQuests({ quests })),
]);

console.log(`Round 97 東溟航路已生成：${maps.length} 張探索地圖、${regions.length} 個區域、4 組雙向航路（8 個有向關口）、${world.atlasArt.layers.length} 個輿圖圖層；天門關→潮生嶼最短路為 3 段。`);
console.log(`Round 97 內容資料已生成：${npcs.length} 名七時段 NPC、${quests.length} 條順序任務、${events.length} 個發現事件、${landmarks.length} 個地標、${graphNodes.length} 個知識圖譜節點與 ${graphEdges.length} 條邊。`);

async function ensureBaseline() {
  try { await access(files.baseline); return; } catch { /* Capture the committed R96 data once. */ }
  const oldWorld = await readJson(files.world);
  const oldArt = oldWorld.atlasArt;
  if (oldArt?.columns !== 768 || oldArt.rows !== 576 || oldArt.layers.length !== 61 || oldWorld.regions.length !== 20) {
    throw new Error('建立 Round 97 基線前，來源必須是完整的 Round 96 舆圖。');
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

function verifyOldMapPorts() {
  for (const { mapId, file, cells } of OLD_MAP_PORTS) {
    const data = readJsonSync(resolve(base, 'maps', file));
    const reached = reachableCells(data);
    for (const [col, row] of cells) {
      if (isSolid(data, col, row)) throw new Error(`Round 97 舊圖 ${mapId} 端口 (${col},${row}) 不可通行。`);
      if (!reached.has(`${col},${row}`)) throw new Error(`Round 97 舊圖 ${mapId} 端口 (${col},${row}) 無法自出生點到達。`);
    }
  }
}

function verifyNewMapPorts(map) {
  const reached = reachableCells(map);
  const seen = new Set();
  for (const [col, row] of PORT_TILES[map.id]) {
    const key = `${col},${row}`;
    if (isSolid(map, col, row)) throw new Error(`Round 97 新圖 ${map.id} 端口 (${col},${row}) 不可通行。`);
    if (!reached.has(key)) throw new Error(`Round 97 新圖 ${map.id} 端口 (${col},${row}) 無法自出生點到達。`);
    if (seen.has(key)) throw new Error(`Round 97 新圖 ${map.id} 端口 (${col},${row}) 與其他端口重合。`);
    seen.add(key);
  }
}

function makeMap(kind, id, name, suffix) {
  const columns = 100; const rows = 100;
  const grid = Array.from({ length: rows }, () => Array(columns).fill('~'));
  const ground = Array.from({ length: rows }, () => Array(columns).fill(0));
  const features = Array.from({ length: rows }, () => Array(columns).fill(0));
  const detail = Array.from({ length: rows }, () => Array(columns).fill(0));
  const inside = (col, row, { cx, cy, rx, ry }) => ((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2 <= 1;
  const isle = kind === 'lanxin' ? { cx: 50, cy: 50, rx: 49, ry: 47 } : { cx: 50, cy: 50, rx: 42, ry: 38 };
  const cove = kind === 'lanxin' ? { cx: 63, cy: 58, rx: 12, ry: 8 } : { cx: 50, cy: 44, rx: 7, ry: 5 };

  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    if (!inside(col + 0.5, row + 0.5, isle)) continue;
    const rim = ((col + 0.5 - isle.cx) / (isle.rx - 3)) ** 2 + ((row + 0.5 - isle.cy) / (isle.ry - 3)) ** 2 > 1;
    if (inside(col + 0.5, row + 0.5, cove)) grid[row][col] = '=';
    else if (kind === 'pilot' && !rim && ((col * 13 + row * 29) % 11) === 0) grid[row][col] = '#';
    else grid[row][col] = rim ? ',' : '.';
  }

  // Sand causeways reach the three/two ports; they overwrite sea and reef so
  // every gate tile is guaranteed walkable and connected in one paint pass.
  const causeways = kind === 'lanxin'
    ? [[[50, 50], [24, 42], [3, 40]], [[50, 52], [48, 74], [48, 96]], [[52, 48], [58, 20], [64, 3]]]
    : [[[50, 52], [50, 78], [50, 96]], [[52, 52], [70, 70], [90, 90]]];
  for (const causeway of causeways) {
    for (let index = 0; index < causeway.length - 1; index += 1) paintLine(grid, causeway[index], causeway[index + 1], 1, ',');
  }
  const distanceToCauseways = (col, row, clearance) => causeways.some((polyline) => distanceToPolyline(col, row, polyline) < clearance);

  const clusters = kind === 'lanxin'
    ? [[24, 28, 10, 8], [76, 26, 9, 8], [20, 72, 9, 8], [74, 74, 10, 8], [50, 22, 8, 6]]
    : [[32, 34, 8, 7], [66, 32, 8, 7], [34, 66, 8, 7], [64, 66, 8, 7]];
  const isSolidCell = (col, row) => col < 0 || row < 0 || col >= columns || row >= rows || '#^~'.includes(grid[row][col]);
  for (const [cx, cy, rx, ry] of clusters) {
    for (let row = Math.max(5, cy - ry); row <= Math.min(94, cy + ry); row += 3) {
      for (let col = Math.max(6, cx - rx); col <= Math.min(93, cx + rx); col += 3) {
        const norm = ((col - cx) / rx) ** 2 + ((row - cy) / ry) ** 2;
        const textureSeed = (col * 17 + row * 31 + cx * 7) % 7;
        if (norm > 0.73 || textureSeed > 3 || isSolidCell(col, row) || distanceToCauseways(col, row, 5)) continue;
        grid[row][col] = '#';
        features[row][col] = [182, 183, 184][(col + row) % 3];
      }
    }
  }
  for (let row = 6; row < 94; row += 8) for (let col = 7; col < 94; col += 8) {
    const seed = (col * 7 + row * 19 + kind.length * 11) % 9;
    if (seed > 1 || isSolidCell(col, row) || features[row][col] > 0 || distanceToCauseways(col, row, 3)) continue;
    detail[row][col] = kind === 'lanxin' ? 29 + seed : 33 + seed;
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
  const defaultNpcFrame = kind === 'lanxin' ? 224 : 192;
  const start = kind === 'lanxin' ? [3, 40] : [50, 96];
  return {
    id, name, tileSize: 48, columns, rows,
    tileTypes: {
      '.': { color: kind === 'lanxin' ? '#6f8a5e' : '#7c8a72', solid: false },
      ',': { color: kind === 'lanxin' ? '#dccfa4' : '#cbb894', solid: false },
      '=': { color: '#5fb2c0', solid: false },
      '#': { color: kind === 'lanxin' ? '#4c5a5e' : '#4f7a5c', solid: true },
      '~': { color: kind === 'lanxin' ? '#1f5d7a' : '#2a7f96', solid: true },
    },
    grid: grid.map((row) => row.join('')),
    playerStart: { col: start[0], row: start[1] },
    art: {
      tileSize: 16,
      tilesets,
      layers: [
        { id: `r97-${suffix}-ground`, tilesetId: PUNY_WORLD, cells: cells(ground) },
        { id: `r97-${suffix}-features`, tilesetId: PUNY_WORLD, cells: cells(features) },
        { id: `r97-${suffix}-detail`, tilesetId: PUNY_WORLD, cells: cells(detail) },
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
  paintEllipse(LANXIN_ELLIPSE, land, undefined, LANXIN_COVE);
  paintEllipse(LANXIN_COVE, water, 294);
  paintEllipse(PILOT_ELLIPSE, land, undefined, PILOT_COVE);
  paintEllipse(PILOT_COVE, water, 294);
  for (const shoal of SATELLITE_SHOALS) paintEllipse(shoal, sand, 5);
  for (const polyline of LANE_SEGMENTS) {
    for (let index = 0; index < polyline.length - 1; index += 1) paintCapsule(art, polyline[index], polyline[index + 1], 2, 291, lane);
  }
  return [
    { id: 'world-r97-lanxin-water', tilesetId: PUNY_WORLD, cells: water },
    { id: 'world-r97-lanxin-sand', tilesetId: PUNY_WORLD, cells: sand },
    { id: 'world-r97-lanxin-land', tilesetId: PUNY_WORLD, cells: land },
    { id: 'world-r97-lanxin-lane', tilesetId: PUNY_WORLD, cells: lane },
  ];
}

function assertOverlayPolicy(layer, oldLayers) {
  const allowed = layer.id === 'world-r97-lanxin-lane' ? LANE_BACKGROUND : LAND_BACKGROUND;
  for (let row = 0; row < layer.cells.length; row += 1) for (let col = 0; col < layer.cells[row].length; col += 1) {
    if (layer.cells[row][col] === 0) continue;
    for (const previous of oldLayers) {
      if (allowed.has(previous.id)) continue;
      if (previous.cells[row]?.[col] !== 0) {
        throw new Error(`Round 97 ${layer.id} 與既有圖層 ${previous.id} 重疊於 ${col},${row}（超出公示疊層範圍）。`);
      }
    }
  }
}

function assertLaneShoreline(atlasLayers, oldLayers) {
  const lane = atlasLayers.find((layer) => layer.id === 'world-r97-lanxin-lane');
  const newLand = atlasLayers.find((layer) => layer.id === 'world-r97-lanxin-land');
  if (lane === undefined || newLand === undefined) throw new Error('Round 97 海路/岛陆层缺失。');
  for (let row = 0; row < lane.cells.length; row += 1) for (let col = 0; col < lane.cells[row].length; col += 1) {
    if (lane.cells[row][col] !== 0 && newLand.cells[row][col] !== 0) {
      throw new Error(`Round 97 海路穿过本轮岛陆 (${col},${row})。`);
    }
  }

  const allLayers = [...oldLayers, ...atlasLayers];
  const shorelineTests = [
    { label: '风回岛', point: [383, 132], layerIds: ['world-r84-expanse-sand', 'world-r84-expanse-land'] },
    { label: '澜心洲西岸', point: [433, 180], layerIds: ['world-r97-lanxin-land'] },
    { label: '潮生屿', point: [432, 280], layerIds: ['world-r85-expanse-sand', 'world-r85-expanse-land'] },
    { label: '澜心洲南岸', point: [451, 220], layerIds: ['world-r97-lanxin-land'] },
    { label: '澜心洲东北岸', point: [498, 154], layerIds: ['world-r97-lanxin-land'] },
    { label: '引航礁西岸', point: [510, 131], layerIds: ['world-r97-lanxin-land'] },
    { label: '引航礁南岸', point: [520, 133], layerIds: ['world-r97-lanxin-land'] },
    { label: '天门关海岸', point: [682, 134], layerIds: ['world-r94-east-snow', 'world-r95-eastland'] },
  ];
  for (const { label, point, layerIds } of shorelineTests) {
    const shoreLayers = allLayers.filter((layer) => layerIds.includes(layer.id));
    if (shoreLayers.length === 0) throw new Error(`Round 97 ${label}岸线参考层缺失。`);
    let nearest = Infinity;
    for (const layer of shoreLayers) for (let row = Math.max(0, point[1] - 6); row <= Math.min(lane.cells.length - 1, point[1] + 6); row += 1) {
      for (let col = Math.max(0, point[0] - 6); col <= Math.min(lane.cells[row].length - 1, point[0] + 6); col += 1) {
        if (layer.cells[row]?.[col] === 0) continue;
        nearest = Math.min(nearest, Math.hypot(col - point[0], row - point[1]));
      }
    }
    if (nearest > 6) throw new Error(`Round 97 海路端点未接近${label}岸线：最近距离 ${nearest} 格。`);
  }
}

function assertNoGateConflicts(transitions) {
  const taken = new Map();
  for (const transition of transitions) {
    for (const endpoint of [transition.from, transition.to]) {
      const key = `${endpoint.mapResourceId}@${endpoint.col},${endpoint.row}`;
      if (taken.has(key) && taken.get(key) !== transition.id) {
        throw new Error(`Round 97 關口觸發格衝突：${transition.id} 與 ${taken.get(key)} 爭用 ${key}。`);
      }
      taken.set(key, transition.id);
    }
  }
}

function assertRouteSegments(transitions, fromId, toId, expected) {
  const adjacency = new Map();
  for (const transition of transitions) {
    const from = transition.from.mapResourceId;
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(transition.to.mapResourceId);
  }
  const distance = new Map([[fromId, 0]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(current) + 1);
      queue.push(next);
    }
  }
  const hops = distance.get(toId);
  if (hops !== expected) throw new Error(`Round 97 航路拓撲錯誤：${fromId} → ${toId} 應為 ${expected} 段，實際 ${hops ?? '不可達'}。`);
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
    ['gate.r97-windward-to-lanxin', '东渡澜心洲', point(MAP_IDS.windward, 93, 55), point(MAP_IDS.lanxin, 3, 40)],
    ['gate.r97-lanxin-to-windward', '西返风回岛', point(MAP_IDS.lanxin, 4, 40), point(MAP_IDS.windward, 92, 55)],
    ['gate.r97-tide-to-lanxin', '东北赴澜心洲', point(MAP_IDS.tide, 86, 54), point(MAP_IDS.lanxin, 48, 96)],
    ['gate.r97-lanxin-to-tide', '西南返潮生屿', point(MAP_IDS.lanxin, 48, 95), point(MAP_IDS.tide, 85, 54)],
    ['gate.r97-lanxin-to-pilot', '北探引航礁', point(MAP_IDS.lanxin, 64, 4), point(MAP_IDS.pilot, 50, 96)],
    ['gate.r97-pilot-to-lanxin', '南返澜心洲', point(MAP_IDS.pilot, 50, 95), point(MAP_IDS.lanxin, 64, 3)],
    ['gate.r97-pilot-to-east', '东泊天门关', point(MAP_IDS.pilot, 89, 89), point(MAP_IDS.east, 50, 94)],
    ['gate.r97-east-to-pilot', '西南出引航礁', point(MAP_IDS.east, 50, 93), point(MAP_IDS.pilot, 90, 90)],
  ].map(([id, name, from, to]) => ({ id, name, from, to }));
}

// ---------------------------------------------------------------------------
// Round 97 content phase: two scheduled NPCs, two sequential quests, discovery
// events and landmarks on both new maps, plus closed knowledge-graph nodes
// and edges. All story text lives in data below; the engine stays generic.
// Cell picks come from iterations/round-97/probe-content-cells.mjs BFS runs.
// ---------------------------------------------------------------------------

function createNpcs() {
  const schedule = (positions) => periods.map((periodId, index) => ({ periodId, position: positions[index] }));
  return [
    {
      id: 'char.r97-ji-wuchao', name: '季无潮', mapResourceId: MAP_IDS.lanxin, position: { col: 50, row: 50 },
      dialogueId: 'dlg.r97-ji-wuchao', questGiver: true, spriteFrame: 224,
      spriteFrames: { down: 224, right: 232, up: 240, left: 248 },
      schedule: schedule([{ col: 42, row: 48 }, { col: 46, row: 46 }, { col: 50, row: 44 }, { col: 54, row: 50 }, { col: 58, row: 46 }, { col: 52, row: 52 }, { col: 42, row: 48 }]),
    },
    {
      id: 'char.r97-yu-xingcha', name: '虞星槎', mapResourceId: MAP_IDS.pilot, position: { col: 52, row: 54 },
      dialogueId: 'dlg.r97-yu-xingcha', questGiver: true, spriteFrame: 192,
      spriteFrames: { down: 192, right: 200, up: 208, left: 216 },
      schedule: schedule([{ col: 44, row: 50 }, { col: 46, row: 48 }, { col: 48, row: 50 }, { col: 52, row: 50 }, { col: 56, row: 48 }, { col: 52, row: 58 }, { col: 44, row: 50 }]),
    },
  ];
}

function createQuests() {
  return [
    {
      id: 'quest.r97-tide-ledger', name: '澜心潮簿',
      description: '澜心湾船师季无潮请你趁退潮登上北沙脊，读潮痕碑上最新一道大潮的水线刻痕，把潮时带回三岔口。',
      giverNpcId: 'char.r97-ji-wuchao',
      objectives: [
        { id: 'objective.r97-read-tide-mark', kind: 'discoverKnowledge', targetId: 'place.r97-tide-mark-stone', requiredCount: 1, text: '趁退潮读潮痕碑的新刻痕' },
        { id: 'objective.r97-report-tide-ledger', kind: 'talkToNpc', targetId: 'char.r97-ji-wuchao', requiredCount: 1, text: '回三岔口向季无潮复命' },
      ],
      rewards: { experience: 44, currency: 36, discoverKnowledgeNodeIds: ['place.r97-pilot-reef'] },
    },
    {
      id: 'quest.r97-beacon-relight', name: '重燃星槎灯',
      description: '潮簿复命之后，引航礁守标人虞星槎托你回澜心洲抄录观汐台的灯谱，再渡回礁盘，按潮时重燃北去的星槎航标。',
      giverNpcId: 'char.r97-yu-xingcha', prerequisiteQuestIds: ['quest.r97-tide-ledger'],
      objectives: [
        { id: 'objective.r97-copy-lantern-verse', kind: 'discoverKnowledge', targetId: 'place.r97-lantern-terrace', requiredCount: 1, text: '回澜心洲抄录观汐台的灯谱' },
        { id: 'objective.r97-relight-beacon', kind: 'talkToNpc', targetId: 'char.r97-yu-xingcha', requiredCount: 1, text: '渡回引航礁为虞星槎燃标' },
      ],
      rewards: { experience: 56, currency: 48, discoverKnowledgeNodeIds: ['place.r97-beacon-tower'] },
    },
  ];
}

function createDialogues() {
  const questOptions = (dialogueId, questId, greetingText, routeText, completionText, farewellText) => ({
    id: dialogueId,
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet', text: greetingText,
        options: [
          { text: '我替你跑一趟。', nextNodeId: 'accepted', conditions: [{ kind: 'questStatus', questId, status: 'offered' }], effects: [{ kind: 'acceptQuest', questId }] },
          { text: '差事已经办妥。', nextNodeId: 'completed', conditions: [{ kind: 'questStatus', questId, status: 'completed' }] },
          { text: '还在半路上。', nextNodeId: 'active', conditions: [{ kind: 'questStatus', questId, status: 'active' }] },
          { text: '路怎么走？', nextNodeId: 'route' },
          { text: '先告辞。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: routeText },
      { id: 'active', text: routeText },
      { id: 'completed', text: completionText },
      { id: 'route', text: routeText },
      { id: 'farewell', text: farewellText },
    ],
  });
  return [
    questOptions(
      'dlg.r97-ji-wuchao', 'quest.r97-tide-ledger',
      '季无潮把一册翻卷了角的潮簿按在膝上：「澜心湾里船候潮、人候簿。沙脊三岔口，潮退才走船——北口那块潮痕碑，新一道的刻痕该描了。」',
      '「沿西沙脊向东北到三岔口，再往北直上脊尽头。碑上横痕层层，最新一道还带着湿沙，描下来便是最眼下的潮时。」',
      '季无潮把新潮时誊进潮簿：「三朝一转，刻痕不欺人。东北那片礁盘叫引航礁，守标的虞星槎若问起，就说澜心洲应了簿。」',
      '季无潮把潮簿揣回怀里，目光仍落在湾口的潮头上。',
    ),
    questOptions(
      'dlg.r97-yu-xingcha', 'quest.r97-beacon-relight',
      '虞星槎擦拭着航标的琉璃罩：「北去的船认我这盏灯。可灯何时点、点多久，得按澜心洲的潮簿来——洲上观汐台刻着一份灯谱，替我抄来。」',
      '「先南渡回澜心洲，下船沿南沙脊向西南，观汐台就在脊弯处。灯谱抄全了再渡回来，灯油我已经备好了。」',
      '虞星槎对着灯谱拨正灯芯，航标次第亮起：「潮簿对灯谱，澜心洲到天门关的夜路就亮了。往后北去的船，我替你留一盏。」',
      '虞星槎拍了拍塔柱，转身去添灯油。',
    ),
  ];
}

function createEvents() {
  return [
    { id: 'event.r97-lanxin-arrival', mapResourceId: MAP_IDS.lanxin, col: 7, row: 40, text: '澜心洲在潮线间铺开，三道岔脊一路向岛心收拢。湾里泊着候潮的旧船，桅灯未点，缆绳却都收得利落。', approachText: '脊上深浅两色水线交叠，潮退到一半。', once: true, discoverKnowledgeNodeId: 'place.r97-lanxin-isle', arrivalTransitionIds: ['gate.r97-windward-to-lanxin', 'gate.r97-tide-to-lanxin', 'gate.r97-pilot-to-lanxin'] },
    { id: 'event.r97-tide-mark-stone', mapResourceId: MAP_IDS.lanxin, col: 58, row: 22, text: '潮痕碑立在沙脊尽头的礁台上，碑身横着一道道旧刻痕，深浅不一。最新一道还带着湿沙——是昨夜大潮的水线。', approachText: '碑座下压着半枚磨平的炭笔，像常有人来描痕。', once: true, discoverKnowledgeNodeId: 'place.r97-tide-mark-stone', interaction: { prompt: '描读潮痕碑的新刻痕', range: 1, approachDirections: ['left', 'right', 'down'] } },
    { id: 'event.r97-lantern-terrace', mapResourceId: MAP_IDS.lanxin, col: 46, row: 76, text: '观汐台半陷在脊弯的沙里，台面刻着一列灯位：何时点、何时熄、何时留半盏，皆与潮时一一相对。', approachText: '台缘刻痕里嵌着干涸的灯油，指腹一抹仍是黏的。', once: true, discoverKnowledgeNodeId: 'place.r97-lantern-terrace', interaction: { prompt: '抄录观汐台的灯谱', range: 1, approachDirections: ['left', 'up', 'right'] } },
    { id: 'event.r97-pilot-arrival', mapResourceId: MAP_IDS.pilot, col: 50, row: 92, text: '引航礁在眼前铺开，黑礁连成一线，栈道自南向北直贯礁心。风里有一缕灯油味，航标就在礁脊某处亮着。', approachText: '栈板缝里塞着换下来的旧灯芯。', once: true, discoverKnowledgeNodeId: 'place.r97-pilot-reef', arrivalTransitionIds: ['gate.r97-lanxin-to-pilot', 'gate.r97-east-to-pilot'] },
    { id: 'event.r97-beacon-tower', mapResourceId: MAP_IDS.pilot, col: 72, row: 68, text: '星槎航标是一座三足木塔，顶悬琉璃罩灯。灯位刻度环环对潮时，与澜心洲的潮簿一脉相承。', approachText: '塔脚码着备用的灯油罐，封泥都新启过。', once: true, discoverKnowledgeNodeId: 'place.r97-beacon-tower', interaction: { prompt: '查看星槎航标的灯位', range: 1, approachDirections: ['left', 'up', 'down'] } },
    { id: 'event.r97-goose-window', mapResourceId: MAP_IDS.pilot, col: 50, row: 30, text: '望雁口是礁盘裂开的一道石窗，正对北面海天。候鸟北去时穿窗而过，守标人以此校准灯向。', approachText: '石窗内侧刻着雁形短痕，一只一组，记着北去的日子。', once: true, discoverKnowledgeNodeId: 'place.r97-goose-window', interaction: { prompt: '眺望雁口北面的海天', range: 1, approachDirections: ['left', 'right', 'down'] } },
  ];
}

function createLandmarks() {
  return [
    { id: 'landmark.r97-sandbar-gate', mapResourceId: MAP_IDS.lanxin, col: 12, row: 41, name: '澜心沙口', category: 'crossing', discoveryNodeId: 'place.r97-lanxin-isle' },
    { id: 'landmark.r97-tide-mark-stone', mapResourceId: MAP_IDS.lanxin, col: 58, row: 22, name: '潮痕碑', category: 'other', discoveryNodeId: 'place.r97-tide-mark-stone' },
    { id: 'landmark.r97-lantern-terrace', mapResourceId: MAP_IDS.lanxin, col: 46, row: 76, name: '观汐台', category: 'other', discoveryNodeId: 'place.r97-lantern-terrace' },
    { id: 'landmark.r97-reef-causeway', mapResourceId: MAP_IDS.pilot, col: 50, row: 88, name: '引航栈口', category: 'crossing', discoveryNodeId: 'place.r97-pilot-reef' },
    { id: 'landmark.r97-beacon-tower', mapResourceId: MAP_IDS.pilot, col: 72, row: 68, name: '星槎航标', category: 'other', discoveryNodeId: 'place.r97-beacon-tower' },
    { id: 'landmark.r97-goose-window', mapResourceId: MAP_IDS.pilot, col: 50, row: 30, name: '望雁口', category: 'other', discoveryNodeId: 'place.r97-goose-window' },
  ];
}

function createNodes() {
  const entries = [
    ['place.r97-lanxin-isle', 'place', '澜心洲', '东溟中部大岛，退潮沙脊三岔分接三面航路。'],
    [MAP_IDS.lanxin, 'place', '澜心洲探索地图', '西连风回、南通潮生、北接引航礁的百格岛洲。'],
    ['place.r97-tide-mark-stone', 'place', '潮痕碑', '北沙脊尽头的礁台碑，横刻历次大潮水线。'],
    ['place.r97-lantern-terrace', 'place', '观汐台', '南脊弯处的灯谱台，灯位与潮时一一相对。'],
    ['place.r97-pilot-reef', 'place', '引航礁', '澜心洲东北的礁盘，潮落方显，航标引北去船。'],
    [MAP_IDS.pilot, 'place', '引航礁探索地图', '南渡澜心洲、东泊天门关的百格礁盘。'],
    ['place.r97-beacon-tower', 'place', '星槎航标', '三足木塔悬琉璃灯，灯位刻度对潮时而转。'],
    ['place.r97-goose-window', 'place', '望雁口', '礁盘裂开的石窗，北去候鸟穿窗为灯校向。'],
    ['char.r97-ji-wuchao', 'character', '季无潮', '澜心湾老船师，守三岔沙脊与潮簿。'],
    ['char.r97-yu-xingcha', 'character', '虞星槎', '引航礁守标人，管星槎航标灯。'],
    ['quest.r97-tide-ledger', 'quest', '澜心潮簿', '读潮痕碑新刻痕并向季无潮复命。'],
    ['quest.r97-beacon-relight', 'quest', '重燃星槎灯', '抄录观汐台灯谱并回礁燃标。'],
    ['event.r97-lanxin-arrival', 'event', '踏上澜心洲', '登上退潮方显的三岔沙脊。'],
    ['event.r97-tide-mark-stone', 'event', '描读潮痕碑', '读到最新一道大潮水线。'],
    ['event.r97-lantern-terrace', 'event', '抄录观汐台', '得到与潮时相对的灯谱。'],
    ['event.r97-pilot-arrival', 'event', '登上引航礁', '踏上直贯礁心的黑礁栈道。'],
    ['event.r97-beacon-tower', 'event', '查看星槎航标', '记下航标的灯位刻度。'],
    ['event.r97-goose-window', 'event', '眺望望雁口', '望见北去海天与雁阵航路。'],
  ];
  return entries.map(([id, kind, title, summary]) => ({ id, kind, title, summary, knownByDefault: false }));
}

function createEdges() {
  const e = (id, fromId, toId, relation, summary) => ({ id: `kg.edge.r97-${id}`, fromId, toId, relation, summary });
  return [
    e('lanxin-map-located', MAP_IDS.lanxin, 'place.r97-lanxin-isle', 'locatedAt', '澜心洲地图承载三岔沙脊。'),
    e('tide-mark-located', 'place.r97-tide-mark-stone', MAP_IDS.lanxin, 'locatedAt', '潮痕碑立于北沙脊尽头。'),
    e('lantern-terrace-located', 'place.r97-lantern-terrace', MAP_IDS.lanxin, 'locatedAt', '观汐台位于南脊弯处。'),
    e('pilot-map-located', MAP_IDS.pilot, 'place.r97-pilot-reef', 'locatedAt', '引航礁地图承载礁心栈道。'),
    e('beacon-tower-located', 'place.r97-beacon-tower', MAP_IDS.pilot, 'locatedAt', '星槎航标立在东南礁脊。'),
    e('goose-window-located', 'place.r97-goose-window', MAP_IDS.pilot, 'locatedAt', '望雁口开在礁盘北缘。'),
    e('ji-located', 'char.r97-ji-wuchao', MAP_IDS.lanxin, 'locatedAt', '季无潮每日在澜心湾候潮。'),
    e('yu-located', 'char.r97-yu-xingcha', MAP_IDS.pilot, 'locatedAt', '虞星槎在礁心栈口守标。'),
    e('ji-participates', 'char.r97-ji-wuchao', 'quest.r97-tide-ledger', 'participatesIn', '季无潮委托玩家描读潮痕。'),
    e('tide-ledger-needs', 'quest.r97-tide-ledger', 'place.r97-tide-mark-stone', 'requires', '澜心潮簿需要潮痕碑的新刻痕。'),
    e('tide-ledger-rewards', 'quest.r97-tide-ledger', 'place.r97-pilot-reef', 'rewards', '复命后望见东北的引航礁。'),
    e('yu-participates', 'char.r97-yu-xingcha', 'quest.r97-beacon-relight', 'participatesIn', '虞星槎托玩家抄谱燃标。'),
    e('beacon-needs', 'quest.r97-beacon-relight', 'place.r97-lantern-terrace', 'requires', '重燃星槎灯需要观汐台灯谱。'),
    e('beacon-prerequisite', 'quest.r97-beacon-relight', 'quest.r97-tide-ledger', 'requires', '先复命潮簿，守标人才托付灯谱。'),
    e('beacon-rewards', 'quest.r97-beacon-relight', 'place.r97-beacon-tower', 'rewards', '燃标后记录星槎航标灯位。'),
    e('lanxin-arrival-triggers', 'event.r97-lanxin-arrival', 'place.r97-lanxin-isle', 'triggers', '踏上沙脊时发现澜心洲。'),
    e('tide-mark-triggers', 'event.r97-tide-mark-stone', 'place.r97-tide-mark-stone', 'triggers', '描读碑刻时发现大潮水线。'),
    e('lantern-terrace-triggers', 'event.r97-lantern-terrace', 'place.r97-lantern-terrace', 'triggers', '抄录台刻时得到灯谱。'),
    e('pilot-arrival-triggers', 'event.r97-pilot-arrival', 'place.r97-pilot-reef', 'triggers', '登上栈道时发现引航礁。'),
    e('beacon-tower-triggers', 'event.r97-beacon-tower', 'place.r97-beacon-tower', 'triggers', '查看木塔时读到灯位。'),
    e('goose-window-triggers', 'event.r97-goose-window', 'place.r97-goose-window', 'triggers', '眺望石窗时望见雁路。'),
  ];
}

// Every content cell must be non-solid and reachable from its map's player
// start, must not collide with any port trigger tile, and the event cells
// must stay pairwise distinct (landmarks intentionally share event cells).
function assertContentCells(maps, npcs, events, landmarks) {
  const byId = new Map(maps.map((map) => [map.id, map]));
  const reachedByMap = new Map(maps.map((map) => [map.id, reachableCells(map)]));
  const portCells = new Map();
  for (const map of maps) for (const [col, row] of PORT_TILES[map.id]) portCells.set(`${map.id}@${col},${row}`, 'port');
  const occupied = new Map(portCells);
  const check = (entity, label, mapResourceId, col, row) => {
    const map = byId.get(mapResourceId);
    if (map === undefined) throw new Error(`Round 97 內容 ${label} 引用未知地圖 ${mapResourceId}。`);
    if (isSolid(map, col, row)) throw new Error(`Round 97 內容 ${label} 位於不可通行格 (${col},${row})。`);
    if (!reachedByMap.get(mapResourceId).has(`${col},${row}`)) throw new Error(`Round 97 內容 ${label} 位於出生點不可達格 (${col},${row})。`);
    const key = `${mapResourceId}@${col},${row}`;
    // The same NPC may legitimately revisit a cell across periods (e.g. the
    // midnight/night watch); only cross-entity collisions are failures.
    if (occupied.has(key) && occupied.get(key) !== entity) throw new Error(`Round 97 內容格衝突：${label} 與 ${occupied.get(key)} 爭用 ${key}。`);
    occupied.set(key, entity);
  };
  for (const npc of npcs) {
    const entity = `NPC ${npc.id}`;
    check(entity, entity, npc.mapResourceId, npc.position.col, npc.position.row);
    if (npc.schedule.length !== periods.length) throw new Error(`Round 97 NPC ${npc.id} 日程需覆蓋 ${periods.length} 個時段。`);
    npc.schedule.forEach((entry, index) => {
      if (entry.periodId !== periods[index]) throw new Error(`Round 97 NPC ${npc.id} 第 ${index} 時段應為 ${periods[index]}。`);
      check(entity, `NPC ${npc.id} 時段 ${entry.periodId}`, npc.mapResourceId, entry.position.col, entry.position.row);
    });
  }
  for (const event of events) check(`事件 ${event.id}`, `事件 ${event.id}`, event.mapResourceId, event.col, event.row);
  for (const landmark of landmarks) {
    const map = byId.get(landmark.mapResourceId);
    if (map === undefined || isSolid(map, landmark.col, landmark.row)) throw new Error(`Round 97 地標 ${landmark.id} 位於不可通行格。`);
  }
}

// Quest objectives, dialogue conditions/effects, event discoveries, landmark
// discoveries and reward unlocks must all resolve to IDs this round defines.
function assertContentReferences(quests, dialogues, events, graphNodes, graphEdges) {
  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const npcIds = new Set(['char.r97-ji-wuchao', 'char.r97-yu-xingcha']);
  const questIds = new Set(quests.map((quest) => quest.id));
  for (const quest of quests) {
    if (!npcIds.has(quest.giverNpcId)) throw new Error(`Round 97 任務 ${quest.id} 委託人未定義。`);
    for (const prerequisite of quest.prerequisiteQuestIds ?? []) {
      if (!questIds.has(prerequisite)) throw new Error(`Round 97 任務 ${quest.id} 前置 ${prerequisite} 未定義。`);
    }
    for (const objective of quest.objectives) {
      const pool = objective.kind === 'discoverKnowledge' ? nodeIds : npcIds;
      if (!pool.has(objective.targetId)) throw new Error(`Round 97 任務目標 ${objective.id} 引用未知 ${objective.targetId}。`);
    }
    for (const nodeId of quest.rewards.discoverKnowledgeNodeIds ?? []) {
      if (!nodeIds.has(nodeId)) throw new Error(`Round 97 任務 ${quest.id} 獎勵發現引用未知節點 ${nodeId}。`);
    }
  }
  for (const dialogue of dialogues) {
    for (const node of dialogue.nodes) {
      for (const option of node.options ?? []) {
        for (const condition of option.conditions ?? []) {
          if (condition.kind === 'questStatus' && !questIds.has(condition.questId)) throw new Error(`Round 97 對話 ${dialogue.id} 條件引用未知任務。`);
        }
        for (const effect of option.effects ?? []) {
          if (effect.kind === 'acceptQuest' && !questIds.has(effect.questId)) throw new Error(`Round 97 對話 ${dialogue.id} 效果引用未知任務。`);
        }
      }
    }
  }
  for (const event of events) {
    if (!nodeIds.has(event.discoverKnowledgeNodeId)) throw new Error(`Round 97 事件 ${event.id} 發現節點未定義。`);
  }
  const referenced = new Set();
  for (const edge of graphEdges) { referenced.add(edge.fromId); referenced.add(edge.toId); }
  for (const node of graphNodes) {
    if (!referenced.has(node.id)) throw new Error(`Round 97 知識圖譜節點 ${node.id} 未被任何邊引用。`);
  }
}

// After merging into the shared graph, no edge may dangle off the node set.
function assertGraphClosure(allNodes, allEdges) {
  const ids = new Set(allNodes.map((node) => node.id));
  for (const edge of allEdges) {
    if (!ids.has(edge.fromId) || !ids.has(edge.toId)) throw new Error(`Round 97 知識圖譜邊 ${edge.id} 引用缺失節點。`);
  }
}

function isSolid(map, col, row) {
  const symbol = map.grid[row]?.[col];
  return symbol === undefined || map.tileTypes[symbol]?.solid !== false;
}

function reachableCells(map) {
  const start = `${map.playerStart.col},${map.playerStart.row}`;
  const seen = new Set([start]);
  const queue = [[map.playerStart.col, map.playerStart.row]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    for (const [dc, dr] of dirs) {
      const next = `${col + dc},${row + dr}`;
      if (seen.has(next) || isSolid(map, col + dc, row + dr)) continue;
      seen.add(next);
      queue.push([col + dc, row + dr]);
    }
  }
  return seen;
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
  if (mapResourceId === MAP_IDS.lanxin) return '东溟中部的大岛，退潮沙脊分接风回、潮生与引航礁三面航路，澜心湾泊船候潮。';
  return '澜心洲东北的礁盘，潮落方露出礁石与航标；为北上雁回崖、东泊天门关的引路之礁。';
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
      if (x >= 0 && y >= 0 && x < 100 && y < 100) grid[y][x] = value;
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
function readJsonSync(path) { return JSON.parse(readFileSync(path, 'utf8')); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
