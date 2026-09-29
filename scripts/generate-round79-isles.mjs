import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapId = 'map.round-79-isles';
const mapPath = resolve(root, 'data/base/maps/round-79-isles.json');
const worldPath = resolve(root, 'data/base/world/world-map.json');
const manifestPath = resolve(root, 'data/base/manifest.json');
const ferryPath = resolve(root, 'data/base/maps/round-10-mist-ferry.json');
const sourceMapPath = resolve(root, 'data/base/maps/round-74-cloud-ridge.json');
const columns = 100;
const rows = 100;
const idPunyWorld = 'opengameart.puny-world';
const imagePunyWorld = 'assets/opengameart/puny-world/tileset.png';
const inside = (col, row) => col >= 0 && row >= 0 && col < columns && row < rows;
const key = (col, row) => `${col},${row}`;
const blank = () => Array.from({ length: rows }, () => Array(columns).fill(0));

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [world, manifest, ferryMap, sourceMap] = await Promise.all([
  readJson(worldPath), readJson(manifestPath), readJson(ferryPath), readJson(sourceMapPath),
]);
const npcResource = (manifest.resources ?? []).find((resource) => resource.id === 'npc.round-79-isles-set');
if (npcResource === undefined) throw new Error('先把 Round 79 群岛 NPC 资料加入 manifest。');
const npcData = await readJson(resolve(root, 'data/base', npcResource.path));
const hostNpc = npcData.npcs.find((npc) => npc.mapResourceId === mapId);
if (hostNpc === undefined) throw new Error('群岛 NPC 资料尚未声明本地图角色，拒绝生成会压住角色的地貌。');

const tideGate = { col: 97, row: 90 };
const returnGate = { col: 96, row: 90 };
const playerStart = { col: 50, row: 12 };
const entryNeighbor = { col: 49, row: 12 };
const landmarks = [
  { id: 'landmark.r79-north-landing', mapResourceId: mapId, col: 50, row: 12, name: '落潮北汀', category: 'crossing' },
  { id: 'landmark.r79-tide-inn', mapResourceId: mapId, col: 55, row: 54, name: '潮声驿', category: 'settlement' },
  { id: 'landmark.r79-west-reef', mapResourceId: mapId, col: 12, row: 31, name: '双礁浅滩', category: 'water', discoveryNodeId: 'place.r79-west-reef' },
  { id: 'landmark.r79-white-beacon', mapResourceId: mapId, col: 80, row: 68, name: '白沙灯标', category: 'other', discoveryNodeId: 'place.r79-white-beacon' },
];
const newTransitions = [
  {
    id: 'gate.r79-ferry-to-isles', name: '南渡海路',
    from: { mapResourceId: ferryMap.id, ...tideGate },
    to: { mapResourceId: mapId, ...playerStart },
  },
  {
    id: 'gate.r79-isles-to-ferry', name: '归帆渡口',
    from: { mapResourceId: mapId, ...entryNeighbor },
    to: { mapResourceId: ferryMap.id, ...returnGate },
  },
];

world.regions = (world.regions ?? []).filter((region) => region.mapResourceId !== mapId);
world.regions.push({
  mapResourceId: mapId,
  name: '东海群岛·落潮湾',
  description: '涨落潮间有沙洲连岛，旧灯标记着避开礁脉的海路。',
  atlasPosition: { x: 50, y: 89 },
});
world.landmarks = [
  ...(world.landmarks ?? []).filter((landmark) => landmark.mapResourceId !== mapId),
  ...landmarks,
];
world.transitions = [
  ...(world.transitions ?? []).filter((transition) => !transition.id.startsWith('gate.r79-')),
  ...newTransitions,
];
world.events = [
  ...(world.events ?? []).filter((event) => !event.id.startsWith('event.r79-')),
  {
    id: 'event.r79-arrival', mapResourceId: mapId, col: playerStart.col, row: playerStart.row,
    text: '你从渡口上岸，沙汀外的岛影被潮雾分成几段。',
    approachText: '前方潮水正在退去，沙脊尽头立着一块旧渡牌。',
    once: true, discoverKnowledgeNodeId: 'place.r79-isles',
  },
  {
    id: 'event.r79-west-reef', mapResourceId: mapId, col: 12, row: 31,
    text: '退潮后礁缝露出一串旧绳结，绳头都朝向北面的沙汀。',
    approachText: '潮线退远了些，双礁之间像是露出一条窄路。',
    once: true, discoverKnowledgeNodeId: 'place.r79-west-reef',
  },
  {
    id: 'event.r79-white-beacon', mapResourceId: mapId, col: 80, row: 68,
    text: '灯标底座刻着三道潮痕，最深的一道指向礁脉西侧的回湾。',
    approachText: '白沙上的旧石灯标露出半截，基座刻痕还未被盐风磨平。',
    once: true, discoverKnowledgeNodeId: 'place.r79-white-beacon',
  },
];
const mapResource = { id: mapId, path: 'maps/round-79-isles.json', schema: 'grid-map' };
manifest.resources = [
  ...(manifest.resources ?? []).filter((resource) => resource.id !== mapId),
];
const atlasIndex = manifest.resources.findIndex((resource) => resource.id === 'world.atlas');
if (atlasIndex < 0) throw new Error('基础 manifest 缺少 world.atlas，不能把新区留在可玩地图集合之外。');
manifest.resources.splice(atlasIndex, 0, mapResource);

const shape = [
  { col: 50, row: 55, radiusX: 42, radiusY: 44, salt: 0x7901 },
  { col: 9, row: 31, radiusX: 5, radiusY: 7, salt: 0x7902 },
  { col: 92, row: 35, radiusX: 6, radiusY: 9, salt: 0x7903 },
  { col: 87, row: 81, radiusX: 6, radiusY: 8, salt: 0x7904 },
];
function hashCell(col, row, salt = 0) {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function isLand(col, row) {
  return shape.some((part) => {
    const dx = (col - part.col) / part.radiusX;
    const dy = (row - part.row) / part.radiusY;
    const edgeVariation = ((hashCell(col, row, part.salt) % 1000) / 1000 - 0.5) * 0.08;
    return dx * dx + dy * dy <= 1 + edgeVariation;
  });
}

const roads = new Set();
function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const ratio = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * ratio);
    const row = Math.round(from.row + (to.row - from.row) * ratio);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (inside(col + dx, row + dy)) roads.add(key(col + dx, row + dy));
    }
  }
}
function addRoad(points) {
  for (let index = 1; index < points.length; index++) addRoadSegment(points[index - 1], points[index]);
}
addRoad([playerStart, { col: 50, row: 22 }, { col: 43, row: 34 }, { col: 47, row: 44 }, { col: 55, row: 54 }]);
addRoad([{ col: 55, row: 54 }, { col: 67, row: 58 }, { col: 80, row: 68 }]);
addRoad([{ col: 43, row: 34 }, { col: 29, row: 31 }, { col: 18, row: 31 }, { col: 12, row: 31 }]);
addRoad([{ col: 55, row: 54 }, { col: 63, row: 71 }, { col: 75, row: 81 }, { col: 87, row: 81 }]);

const anchors = new Map();
function addAnchor(label, point) {
  if (!inside(point.col, point.row)) throw new Error(`${label} 坐标越界。`);
  anchors.set(key(point.col, point.row), label);
  for (let row = point.row - 1; row <= point.row + 1; row++) {
    for (let col = point.col - 1; col <= point.col + 1; col++) {
      if (inside(col, row) && !anchors.has(key(col, row))) anchors.set(key(col, row), `${label} 邻格`);
    }
  }
}
for (const point of [playerStart, entryNeighbor, tideGate, returnGate, hostNpc.position]) addAnchor('航道/人物锚点', point);
for (const landmark of landmarks) addAnchor(`地标 ${landmark.id}`, landmark);

const ground = blank();
const ocean = blank();
const vegetation = blank();
const grid = Array.from({ length: rows }, () => Array(columns).fill('~'));
const oceanFrames = [286, 288, 290, 291, 294, 295, 296];
const grassFrames = [1, 2, 3, 28, 29, 30];
const sandFrames = [5, 6, 7, 32, 33, 34];
const treeFrames = [190, 193, 196, 199, 202, 205, 208, 211, 214, 217, 220, 223, 226, 229, 232, 235, 238, 241, 244, 247, 250, 253, 256, 259, 262, 265, 268];
const groves = [
  { col: 28, row: 47, radiusX: 10, radiusY: 11, density: 26, salt: 0x7911 },
  { col: 72, row: 38, radiusX: 11, radiusY: 12, density: 22, salt: 0x7912 },
  { col: 31, row: 73, radiusX: 9, radiusY: 11, density: 24, salt: 0x7913 },
  { col: 69, row: 84, radiusX: 8, radiusY: 9, density: 19, salt: 0x7914 },
];
const walkable = new Set();
let landCount = 0;
let treeCount = 0;
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const cellKey = key(col, row);
    const tileSeed = hashCell(col, row, 0x79a1);
    ocean[row][col] = oceanFrames[tileSeed % oceanFrames.length];
    if (!isLand(col, row)) continue;
    landCount++;
    const shoreline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isLand(col + dx, row + dy));
    const withinRoad = roads.has(cellKey);
    const groove = groves.find((part) => {
      const dx = (col - part.col) / part.radiusX;
      const dy = (row - part.row) / part.radiusY;
      return dx * dx + dy * dy <= 1;
    });
    const treeRoll = groove === undefined ? 100 : hashCell(col, row, groove.salt) % 100;
    const tree = !shoreline && !withinRoad && !anchors.has(cellKey) && groove !== undefined && treeRoll < groove.density;
    ground[row][col] = shoreline || (hashCell(col, row, 0x79a2) % 100 < 7)
      ? sandFrames[tileSeed % sandFrames.length]
      : grassFrames[tileSeed % grassFrames.length];
    grid[row][col] = shoreline || ground[row][col] === sandFrames[tileSeed % sandFrames.length] ? ',' : '.';
    if (tree) {
      vegetation[row][col] = treeFrames[hashCell(col, row, 0x79a3) % treeFrames.length];
      treeCount++;
      if (treeRoll % 100 < 62) grid[row][col] = '#';
    }
    if (withinRoad || anchors.has(cellKey)) {
      grid[row][col] = '.';
      if (withinRoad) ground[row][col] = sandFrames[tileSeed % sandFrames.length];
      vegetation[row][col] = 0;
      walkable.add(cellKey);
    } else if (grid[row][col] !== '#') walkable.add(cellKey);
  }
}

const mapGrid = grid.map((line) => line.join(''));
function reachableCells(start) {
  if (mapGrid[start.row]?.[start.col] === '~' || mapGrid[start.row]?.[start.col] === '#') {
    throw new Error(`海岛入口被挡住：${key(start.col, start.row)}`);
  }
  const reached = new Set([key(start.col, start.row)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    if (point === undefined) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = point.col + dx;
      const row = point.row + dy;
      const next = key(col, row);
      if (!inside(col, row) || ['~', '#'].includes(mapGrid[row]?.[col] ?? '~') || reached.has(next)) continue;
      reached.add(next);
      queue.push({ col, row });
    }
  }
  return reached;
}
const reached = reachableCells(playerStart);
if (landCount < 6_000 || reached.size < 5_500) {
  throw new Error(`群岛地形/可行格不足：陆地 ${landCount}，入口连通 ${reached.size}。`);
}
for (const point of [entryNeighbor, hostNpc.position, ...landmarks.map(({ col, row }) => ({ col, row }))]) {
  if (!reached.has(key(point.col, point.row))) throw new Error(`入口无法步行到达关键位置 ${key(point.col, point.row)}。`);
}
for (const point of [tideGate, returnGate]) {
  if (ferryMap.tileTypes[ferryMap.grid[point.row]?.[point.col] ?? '#']?.solid !== false) {
    throw new Error(`雾雨渡口航道锚点被阻挡：${key(point.col, point.row)}`);
  }
}

const punyTileset = {
  id: idPunyWorld, image: imagePunyWorld, tileSize: 16, columns: 27, rows: 65, spacing: 0, tileCount: 1755,
};
const tilesets = [...sourceMap.art.tilesets.filter((set) => set.id !== idPunyWorld), punyTileset];
const mapData = {
  id: mapId,
  name: '东海群岛·落潮湾',
  tileSize: sourceMap.tileSize,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#60905a', solid: false },
    ',': { color: '#c7b87d', solid: false },
    '#': { color: '#31564a', solid: true },
    '~': { color: '#198c9a', solid: true },
  },
  grid: mapGrid,
  playerStart,
  art: {
    tileSize: 16,
    tilesets,
    actors: sourceMap.art.actors,
    layers: [
      { id: 'r79-sea', tilesetId: idPunyWorld, cells: ocean },
      { id: 'r79-island-ground', tilesetId: idPunyWorld, cells: ground },
      { id: 'r79-pine-groves', tilesetId: idPunyWorld, depthSort: 'y', cells: vegetation },
    ],
  },
};

await Promise.all([
  writeFile(mapPath, `${JSON.stringify(mapData, null, 2)}\n`),
  writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
]);
console.log(`Generated ${columns}×${rows} ${mapData.name}: ${landCount} coastal land cells, ${reached.size} entrance-reachable cells, ${treeCount} forest sprites.`);
console.log(`Two-way gate ${newTransitions[0].id}/${newTransitions[1].id}; ${landmarks.length} data landmarks; map art directly references ${punyTileset.tileCount} CC0 16px tiles.`);
