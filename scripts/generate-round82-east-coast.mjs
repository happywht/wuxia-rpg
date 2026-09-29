import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  world: resolve(base, 'world/world-map.json'),
  manifest: resolve(base, 'manifest.json'),
  cloudMap: resolve(base, 'maps/round-74-cloud-ridge.json'),
  templateMap: resolve(base, 'maps/round-79-isles.json'),
  map: resolve(base, 'maps/round-82-east-coast.json'),
  npcs: resolve(base, 'characters/round-82-east-coast-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-82-east-coast-conversations.json'),
  quests: resolve(base, 'quests/round-82-east-coast-quests.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
};
const mapId = 'map.round-82-east-coast';
const npcId = 'char.r82-wen-chaozhi';
const questId = 'quest.r82-follow-the-tide';
const nodeIds = {
  coast: 'place.r82-east-coast',
  market: 'place.r82-blue-sail-market',
  beacon: 'place.r82-east-tide-gauge',
  cove: 'place.r82-fog-cove',
  npc: npcId,
  quest: questId,
  arrival: 'event.r82-arrival',
  marketEvent: 'event.r82-blue-sail-market',
  beaconEvent: 'event.r82-tide-gauge',
};
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
async function appendGraphEntries(path, field, additions) {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  const existing = parsed[field] ?? [];
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const exact = additions.every((entry) => JSON.stringify(byId.get(entry.id)) === JSON.stringify(entry));
  if (exact) return;
  if (additions.some((entry) => byId.has(entry.id))) {
    throw new Error('Round 82 图谱条目与生成器声明不一致；请先移除冲突的 Round 82 条目。');
  }
  const closing = raw.lastIndexOf('\n  ]');
  if (closing < 0 || raw.slice(closing).trim() !== ']\n}') {
    throw new Error('无法保持知识图谱文件原格式追加 ' + field + '。');
  }
  const lines = additions.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, raw.slice(0, closing) + ',\n' + lines + raw.slice(closing));
}

const [world, manifest, templateMap, cloudMap, nodes, edges] = await Promise.all([
  readJson(paths.world), readJson(paths.manifest), readJson(paths.templateMap),
  readJson(paths.cloudMap), readJson(paths.nodes), readJson(paths.edges),
]);
if (world.atlasArt?.columns !== 336 || world.atlasArt?.rows !== 224) {
  throw new Error('Round 82 需要 Round 81 的 336×224 可移动舆图。');
}
const punyId = 'opengameart.puny-world';
const townId = 'opengameart.rpg-town';
const actorId = 'opengameart.puny-characters';
const tilesets = [punyId, townId, actorId].map((id) => {
  const declaration = templateMap.art?.tilesets.find((entry) => entry.id === id);
  if (declaration === undefined) throw new Error('缺少已登记素材图集：' + id);
  return declaration;
});
const punyTileset = tilesets.find((entry) => entry.id === punyId);
const townTileset = tilesets.find((entry) => entry.id === townId);
const actorTileset = tilesets.find((entry) => entry.id === actorId);
if (!punyTileset || !townTileset || !actorTileset) throw new Error('新区像素图集配置不完整。');

const start = at(6, 50);
const coastReturn = at(5, 50);
const market = at(47, 49);
const npcPosition = at(50, 52);
const tideGauge = at(78, 72);
const fogCove = at(68, 78);
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
addRoad([start, at(17, 50), at(26, 46), at(37, 47), market]);
addRoad([market, at(55, 54), at(61, 64), at(68, 69), tideGauge]);
addRoad([at(43, 52), at(34, 59), at(28, 70), at(31, 80)]);
addRoad([market, at(40, 37), at(43, 29)]);

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
  { id: 'landmark.r82-west-dock', mapResourceId: mapId, ...start, name: '西岸栈桥', category: 'crossing' },
  { id: 'landmark.r82-blue-sail-market', mapResourceId: mapId, ...market, name: '青帆埠', category: 'settlement', discoveryNodeId: nodeIds.market },
  { id: 'landmark.r82-east-tide-gauge', mapResourceId: mapId, ...tideGauge, name: '东汊潮尺', category: 'other', discoveryNodeId: nodeIds.beacon },
  { id: 'landmark.r82-fog-cove', mapResourceId: mapId, ...fogCove, name: '雾隐湾', category: 'water', discoveryNodeId: nodeIds.cove },
];
for (const point of [start, coastReturn, market, npcPosition, tideGauge, fogCove]) reserveAnchor('人物/关口/地标', point, 2);
for (const landmark of landmarks) reserveAnchor('地标 ' + landmark.id, landmark, 1);

const gateFromCloud = at(96, 50);
const cloudArrival = at(95, 50);
for (const point of [gateFromCloud, cloudArrival]) {
  const glyph = cloudMap.grid[point.row]?.[point.col];
  if (glyph === undefined || cloudMap.tileTypes[glyph]?.solid) {
    throw new Error('云岭海岸关口落点不可通行：' + key(point.col, point.row));
  }
}
if (cloudMap.playerStart.col === gateFromCloud.col && cloudMap.playerStart.row === gateFromCloud.row) {
  throw new Error('云岭海岸关口与玩家出生点重合。');
}

function hashCell(col, row, salt) {
  let value = Math.imul(col + 101, 0x45d9f3b) ^ Math.imul(row + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function inMainland(col, row) {
  const dx = (col - 50) / 46;
  const dy = (row - 51) / 44;
  const edge = ((hashCell(col, row, 0x8201) % 1000) / 1000 - 0.5) * 0.06;
  const mainland = dx * dx + dy * dy <= 1 + edge;
  const bayX = (col - 89) / 24;
  const bayY = (row - 50) / 20;
  const bay = bayX * bayX + bayY * bayY <= 1;
  return mainland && !bay;
}
function isLand(col, row) {
  return inside(col, row) && inMainland(col, row);
}
const groves = [
  { col: 27, row: 31, rx: 12, ry: 11, density: 28, salt: 0x8211 },
  { col: 29, row: 74, rx: 13, ry: 14, density: 23, salt: 0x8212 },
  { col: 59, row: 30, rx: 11, ry: 9, density: 18, salt: 0x8213 },
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
    const seed = hashCell(col, row, 0x8202);
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
      trees[row][col] = treeFrames[hashCell(col, row, 0x8203) % treeFrames.length];
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
function reachableFrom(origin) {
  if (grid[origin.row]?.[origin.col] === undefined || ['#', '~'].includes(grid[origin.row][origin.col])) {
    throw new Error('青帆埠入口受阻：' + key(origin.col, origin.row));
  }
  const reached = new Set([key(origin.col, origin.row)]);
  const queue = [origin];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = current.col + dx;
      const row = current.row + dy;
      const next = key(col, row);
      if (!inside(col, row) || ['#', '~'].includes(grid[row][col]) || reached.has(next)) continue;
      reached.add(next);
      queue.push(at(col, row));
    }
  }
  return reached;
}
const reachable = reachableFrom(start);
for (const point of [coastReturn, market, npcPosition, tideGauge, fogCove]) {
  if (!reachable.has(key(point.col, point.row))) throw new Error('青帆埠锚点不可达：' + key(point.col, point.row));
}
if (landCount < 5_000 || reachable.size < 4_000) {
  throw new Error('海岸地形/连通格数量不足：陆地 ' + landCount + '，连通 ' + reachable.size);
}

const marketDetails = blank();
const marketPlacements = [
  { col: 44, row: 44, gid: 182 },
  { col: 45, row: 44, gid: 183 },
  { col: 46, row: 44, gid: 184 },
  { col: 44, row: 45, gid: 185 },
  { col: 45, row: 45, gid: 186 },
  { col: 46, row: 45, gid: 108 },
  { col: tideGauge.col, row: tideGauge.row, gid: 29 },
];
for (const item of marketPlacements) {
  if (!inside(item.col, item.row) || !isLand(item.col, item.row)) {
    throw new Error('青帆埠装饰越界或压在海水上：' + key(item.col, item.row));
  }
  if (item.gid < 1 || item.gid >= 345 || item.gid > townTileset.tileCount) {
    throw new Error('青帆埠装饰帧未经核验：' + item.gid);
  }
  if (anchors.has(key(item.col, item.row)) && item.col !== tideGauge.col) {
    throw new Error('青帆埠装饰覆盖玩法锚点：' + key(item.col, item.row));
  }
  marketDetails[item.row][item.col] = item.gid;
}
const mapData = {
  id: mapId,
  name: '东溟海岸·青帆埠',
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
    actors: { ...templateMap.art.actors },
    layers: [
      { id: 'r82-sea', tilesetId: punyId, cells: sea },
      { id: 'r82-coastal-ground', tilesetId: punyId, cells: ground },
      { id: 'r82-blue-sail-market', tilesetId: townId, cells: marketDetails },
      { id: 'r82-pine-groves', tilesetId: punyId, depthSort: 'y', cells: trees },
    ],
  },
};
const npcs = {
  npcs: [{
    id: npcId,
    name: '温朝之',
    mapResourceId: mapId,
    position: npcPosition,
    dialogueId: 'dlg.r82-wen-chaozhi-tide-record',
    questGiver: true,
    spriteFrame: 144,
    spriteFrames: { down: 128, right: 136, up: 144, left: 152 },
  }],
};
const quests = {
  quests: [{
    id: questId,
    name: '潮尺旧记',
    description: '温朝之请你到东汊潮尺核对刻痕，把被潮雾遮住的沿岸水路补进青帆埠旧簿。',
    giverNpcId: npcId,
    objectives: [{
      id: 'objective.r82-read-tide-gauge',
      kind: 'discoverKnowledge',
      targetId: nodeIds.beacon,
      requiredCount: 1,
      text: '调查青帆埠东面的石潮尺',
    }],
    rewards: {
      experience: 36,
      currency: 28,
      discoverKnowledgeNodeIds: [nodeIds.cove],
    },
  }],
};
const dialogues = {
  conversations: [{
    id: 'dlg.r82-wen-chaozhi-tide-record',
    startNodeId: 'greet',
    nodes: [
      {
        id: 'greet',
        text: '温朝之把一册被海风卷起边角的簿子压在柜台上：「旧潮尺就在东汊。刻痕若还认得出来，我就能把这段沿岸水路补给外来的行船人。」',
        options: [
          {
            text: '我去核对东汊潮尺。',
            nextNodeId: 'accepted',
            conditions: [{ kind: 'questStatus', questId, status: 'offered' }],
            effects: [{ kind: 'acceptQuest', questId }],
          },
          {
            text: '我已把刻痕抄回来了。',
            nextNodeId: 'completed',
            conditions: [{ kind: 'questStatus', questId, status: 'completed' }],
          },
          { text: '说说青帆埠的水路。', nextNodeId: 'routes' },
          { text: '改日再谈。', nextNodeId: 'farewell' },
        ],
      },
      { id: 'accepted', text: '「沿栈桥向南绕过潮汊，岸边三道短痕才是今秋的水位。石面滑，站在西南一侧看最清楚。」' },
      { id: 'completed', text: '温朝之将你的拓记抄进旧簿：「东边雾湾的礁脊也标出来了。往后走这条水路，不必再摸着黑猜潮头。」' },
      { id: 'routes', text: '「青帆埠靠的是潮汊旧道。风急时不争近路，沿松坡走到石潮尺，再顺着沙脊回湾。」' },
      { id: 'farewell', text: '温朝之把旧簿合上，留出一角柜台给等船的行旅歇脚。' },
    ],
  }],
};
const region = {
  mapResourceId: mapId,
  name: '东溟海岸·青帆埠',
  description: '青帆埠倚着东汊海湾，木栈桥、松坡和旧潮尺串起一条能步行抵达的海岸路。',
  atlasPosition: { x: 85, y: 44 },
};
const transitions = [
  {
    id: 'gate.r82-cloud-ridge-to-east-coast',
    name: '越岭东行',
    from: { mapResourceId: cloudMap.id, ...gateFromCloud },
    to: { mapResourceId: mapId, ...start },
  },
  {
    id: 'gate.r82-east-coast-to-cloud-ridge',
    name: '回望云岭',
    from: { mapResourceId: mapId, ...coastReturn },
    to: { mapResourceId: cloudMap.id, ...cloudArrival },
  },
];
const events = [
  {
    id: 'event.r82-arrival',
    mapResourceId: mapId,
    ...start,
    text: '越过云岭最后一道松坡，海风穿过东汊，青帆埠的木栈桥在潮光里显出轮廓。',
    approachText: '往东南的路坡渐缓，风里已经有咸涩的潮气。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.coast,
  },
  {
    id: 'event.r82-blue-sail-market',
    mapResourceId: mapId,
    ...market,
    text: '柜台上挂着几页褪色的渡潮簿，末页记着每年秋汛前改道的日期。',
    approachText: '青帆集市的柜台边压着一本潮渍斑斑的旧簿。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.market,
  },
  {
    id: 'event.r82-tide-gauge',
    mapResourceId: mapId,
    ...tideGauge,
    text: '三道刻痕由深至浅排在石面上，最浅的一道旁边还留着一枚旧帆钉。',
    approachText: '潮汊尽头的石面泛着白盐，刻线在水痕间断断续续。',
    once: true,
    discoverKnowledgeNodeId: nodeIds.beacon,
    interaction: {
      prompt: '抄录东汊石潮尺的刻痕',
      range: 1,
      approachDirections: ['left', 'down'],
    },
  },
];
const newNodes = [
  { id: mapId, kind: 'place', title: '青帆埠海岸区域', summary: '从云岭古道步行东行可抵达的海湾与栈桥区域。', knownByDefault: false },
  { id: nodeIds.coast, kind: 'place', title: '东溟海岸·青帆埠', summary: '云岭古道以东的海岸港埠，松坡小路通往潮汊和栈桥。', knownByDefault: false },
  { id: nodeIds.market, kind: 'place', title: '青帆埠渡潮簿', summary: '镇中旧簿收录行船避开秋汛暗流的日期与路向。', knownByDefault: false },
  { id: nodeIds.beacon, kind: 'place', title: '东汊石潮尺', summary: '海湾岸边三道石刻记录了季节水位变化。', knownByDefault: false },
  { id: nodeIds.cove, kind: 'place', title: '雾隐湾', summary: '沿岸沙脊绕过潮汊后可见的回湾，避开外海礁线。', knownByDefault: false },
  { id: nodeIds.npc, kind: 'character', title: '温朝之', summary: '青帆埠渡潮簿的保管人，熟悉旧栈桥和近海水路。', knownByDefault: false },
  { id: nodeIds.quest, kind: 'quest', title: '潮尺旧记', summary: '替温朝之核对东汊石潮尺，补全海岸行船记录。', knownByDefault: false },
  { id: nodeIds.arrival, kind: 'event', title: '越岭见海', summary: '走出云岭松坡后首次抵达东溟海岸。', knownByDefault: false },
  { id: nodeIds.marketEvent, kind: 'event', title: '渡潮簿旧页', summary: '翻看青帆埠柜台上的旧水路记录。', knownByDefault: false },
  { id: nodeIds.beaconEvent, kind: 'event', title: '东汊潮尺刻痕', summary: '调查石潮尺并记录季节水位。', knownByDefault: false },
];
const newEdges = [
  { id: 'kg.edge.r82-arrival-coast', fromId: nodeIds.arrival, toId: nodeIds.coast, relation: 'triggers', summary: '初抵青帆埠时发现东溟海岸。' },
  { id: 'kg.edge.r82-coast-map', fromId: nodeIds.coast, toId: mapId, relation: 'locatedAt', summary: '东溟海岸由青帆埠的百格探索地图承载。' },
  { id: 'kg.edge.r82-market-place', fromId: nodeIds.marketEvent, toId: nodeIds.market, relation: 'triggers', summary: '翻看旧簿后得知青帆埠的潮路记载。' },
  { id: 'kg.edge.r82-gauge-place', fromId: nodeIds.beaconEvent, toId: nodeIds.beacon, relation: 'triggers', summary: '抄录东汊潮尺后发现旧水位刻痕。' },
  { id: 'kg.edge.r82-npc-location', fromId: nodeIds.npc, toId: mapId, relation: 'locatedAt', summary: '温朝之在青帆埠保管渡潮簿。' },
  { id: 'kg.edge.r82-npc-quest', fromId: nodeIds.npc, toId: nodeIds.quest, relation: 'participatesIn', summary: '温朝之委托玩家补全东汊潮尺记录。' },
  { id: 'kg.edge.r82-quest-gauge', fromId: nodeIds.quest, toId: nodeIds.beacon, relation: 'requires', summary: '潮尺旧记需要玩家调查东汊石潮尺。' },
  { id: 'kg.edge.r82-quest-cove', fromId: nodeIds.quest, toId: nodeIds.cove, relation: 'rewards', summary: '完成潮尺旧记后，温朝之补绘雾隐湾的安全水路。' },
];
const resourceEntries = [
  { id: 'map.round-82-east-coast', path: 'maps/round-82-east-coast.json', schema: 'grid-map' },
  { id: 'npc.round-82-east-coast-set', path: 'characters/round-82-east-coast-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-82-east-coast-set', path: 'dialogues/round-82-east-coast-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-82-east-coast-set', path: 'quests/round-82-east-coast-quests.json', schema: 'quest-set' },
];

world.regions = (world.regions ?? []).filter((entry) => entry.mapResourceId !== mapId);
world.regions.push(region);
world.landmarks = [
  ...(world.landmarks ?? []).filter((entry) => !entry.id.startsWith('landmark.r82-')),
  ...landmarks,
];
world.transitions = [
  ...(world.transitions ?? []).filter((entry) => !entry.id.startsWith('gate.r82-')),
  ...transitions,
];
world.events = [
  ...(world.events ?? []).filter((entry) => !entry.id.startsWith('event.r82-')),
  ...events,
];
manifest.resources = (manifest.resources ?? []).filter((entry) => !resourceEntries.some((addition) => addition.id === entry.id));
const atlasIndex = manifest.resources.findIndex((entry) => entry.id === 'world.atlas');
if (atlasIndex < 0) throw new Error('manifest 缺少 world.atlas，拒绝孤立新增区域。');
manifest.resources.splice(atlasIndex, 0, ...resourceEntries);
nodes.nodes = [
  ...(nodes.nodes ?? []).filter((entry) =>
    entry.id !== mapId &&
    !entry.id.startsWith('place.r82-') &&
    !entry.id.startsWith('char.r82-') &&
    !entry.id.startsWith('quest.r82-') &&
    !entry.id.startsWith('event.r82-')),
  ...newNodes,
];
edges.edges = [
  ...(edges.edges ?? []).filter((entry) => !entry.id.startsWith('kg.edge.r82-')),
  ...newEdges,
];

await Promise.all([
  writeJson(paths.map, mapData),
  writeJson(paths.npcs, npcs),
  writeJson(paths.dialogues, dialogues),
  writeJson(paths.quests, quests),
  writeJson(paths.world, world),
  writeJson(paths.manifest, manifest),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);
console.log(
  'Generated ' + mapData.name + ': ' + landCount + ' coastal land cells, ' +
  reachable.size + ' entrance-reachable walkable cells, ' + treeCount + ' pine tiles, ' +
  shoreCount + ' shore cells; two-way Cloud Ridge gates and ' + landmarks.length + ' landmarks.',
);
