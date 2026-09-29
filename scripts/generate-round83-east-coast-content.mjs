import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const paths = {
  manifest: resolve(base, 'manifest.json'),
  world: resolve(base, 'world/world-map.json'),
  nodes: resolve(base, 'knowledge_graph/nodes.json'),
  edges: resolve(base, 'knowledge_graph/edges.json'),
  items: resolve(base, 'items/round-83-east-coast-items.json'),
  shops: resolve(base, 'shops/round-83-east-coast-shops.json'),
  encounters: resolve(base, 'battles/round-83-east-coast-encounters.json'),
  npcs: resolve(base, 'characters/round-83-east-coast-npcs.json'),
  dialogues: resolve(base, 'dialogues/round-83-east-coast-conversations.json'),
  quests: resolve(base, 'quests/round-83-east-coast-quests.json'),
};

const mapId = 'map.round-82-east-coast';
const fishermanId = 'char.r83-gu-chaosheng';
const merchantId = 'char.r83-jin-yunfan';
const raiderCharacterId = 'char.r83-tide-wake-leader';
const itemId = 'item.r83-sea-salt-ointment';
const shopId = 'shop.r83-blue-sail-provisions';
const encounterId = 'encounter.r83-tide-wake-looters';
const recoveryQuestId = 'quest.r83-net-recovery';
const channelQuestId = 'quest.r83-night-channel';
const netShoalsNodeId = 'place.r83-net-shoals';
const nightChannelNodeId = 'place.r83-night-channel';

const items = {
  items: [{
    id: itemId,
    name: '海盐敷膏',
    description: '青帆埠药摊以海盐、松脂和晒干的芦根调成的小罐敷膏，能压住擦伤的灼痛。',
    category: 'consumable',
    stackLimit: 9,
    buyPrice: 26,
    sellPrice: 8,
    consumable: { healthRestore: 22, qiRestore: 0 },
  }],
};

const shops = {
  shops: [{
    id: shopId,
    name: '青帆埠潮行补给摊',
    npcId: merchantId,
    greeting: '「行船靠潮，走路靠脚。海盐敷膏、回春膏和清心丸都在木匣里，买多少我记多少。」',
    sellRate: 0.55,
    stock: [
      { itemId, quantity: 6 },
      { itemId: 'item.huichun-gao', quantity: -1 },
      { itemId: 'item.qingxin-wan', quantity: 5 },
      { itemId: 'item.r32.clam-shell', quantity: 4 },
    ],
  }],
};

const encounters = {
  encounters: [{
    id: encounterId,
    name: '潮沟夺网客',
    mapResourceId: mapId,
    position: { col: 73, row: 68 },
    profileId: 'char.scribe-apprentice',
    knowledgeNodeId: raiderCharacterId,
    enemy: {
      name: '夺网头目',
      attributes: { body: 8, force: 8, agility: 7, insight: 5, resolve: 6 },
      health: 52,
      qi: 10,
      martialArtIds: ['skill.jianghu-sanshou', 'skill.lanmen-daofa'],
    },
    victoryExperience: 0,
    defeatRecovery: { healthRatio: 0.65, qiRatio: 0.6 },
    repeatable: true,
    texts: {
      approach: '潮沟边有人把旧渔网往船上拖，按 E 阻止夺网客',
      intro: '那人将湿网往肩上一甩：「退潮露出的东西，谁捡到就是谁的。」',
      victory: '夺网客丢下渔网退进礁石后，几只系船浮标也重新露了出来。',
      defeat: '你被夺网客逼离潮沟，渔网又被拖向浅滩。',
      flee: '你暂退到松坡边，夺网客仍守着那片退潮浅滩。',
    },
  }],
};

const npcs = {
  npcs: [
    {
      id: merchantId,
      name: '金云帆',
      mapResourceId: mapId,
      position: { col: 43, row: 50 },
      dialogueId: 'dlg.r83-jin-yunfan-provisions',
      shopId,
      spriteFrame: 40,
      spriteFrames: { down: 32, right: 40, up: 48, left: 56 },
      schedule: [
        { periodId: 'period.dawn', position: { col: 42, row: 49 } },
        { periodId: 'period.afternoon', position: { col: 44, row: 51 } },
        { periodId: 'period.dusk', position: { col: 46, row: 52 } },
        { periodId: 'period.night', position: { col: 35, row: 58 } },
      ],
    },
    {
      id: fishermanId,
      name: '顾潮生',
      mapResourceId: mapId,
      position: { col: 62, row: 63 },
      dialogueId: 'dlg.r83-gu-chaosheng-tide-line',
      questGiver: true,
      spriteFrame: 104,
      spriteFrames: { down: 96, right: 104, up: 112, left: 120 },
      schedule: [
        { periodId: 'period.dawn', position: { col: 60, row: 62 } },
        { periodId: 'period.afternoon', position: { col: 64, row: 66 } },
        { periodId: 'period.dusk', position: { col: 65, row: 68 } },
        { periodId: 'period.night', position: { col: 58, row: 68 } },
      ],
    },
  ],
};

const dialogues = {
  conversations: [
    {
      id: 'dlg.r83-jin-yunfan-provisions',
      startNodeId: 'greet',
      nodes: [
        {
          id: 'greet',
          text: '金云帆把几只药罐摆在潮簿旁：「我收的是沿岸行船人的钱，卖的也是沿岸行船人的东西。」',
          options: [
            { text: '海盐敷膏怎么用？', nextNodeId: 'ointment' },
            { text: '青帆埠近来有什么动静？', nextNodeId: 'harbor' },
            { text: '我先看看货。', nextNodeId: 'farewell' },
          ],
        },
        { id: 'ointment', text: '「浅伤先洗净再敷。若伤口深，别拿盐膏硬堵，找郎中看过再说。」' },
        { id: 'harbor', text: '「退潮后有人往潮沟里拖东西。顾潮生看过几回，最近连系浮标也少了。」' },
        { id: 'farewell', text: '金云帆将木匣盖好，给后来等船的人让出半张凳子。' },
      ],
    },
    {
      id: 'dlg.r83-gu-chaosheng-tide-line',
      startNodeId: 'greet',
      nodes: [
        {
          id: 'greet',
          text: '顾潮生把一段断开的浮标绳放在膝边：「潮尺记的是水位，可没人把夜里那道回湾线标清。先把潮沟里拖网的人赶走，我再带你认灯。」',
          options: [
            {
              text: '我去潮沟找回浮标和网具。',
              nextNodeId: 'recovery-accepted',
              conditions: [{ kind: 'questStatus', questId: recoveryQuestId, status: 'offered' }],
              effects: [{ kind: 'acceptQuest', questId: recoveryQuestId }],
            },
            {
              text: '网具已经拿回来了。',
              nextNodeId: 'recovery-complete',
              conditions: [{ kind: 'questStatus', questId: recoveryQuestId, status: 'completed' }],
            },
            {
              text: '我去辨认夜里的回湾线。',
              nextNodeId: 'channel-accepted',
              conditions: [{ kind: 'questStatus', questId: channelQuestId, status: 'offered' }],
              effects: [{ kind: 'acceptQuest', questId: channelQuestId }],
            },
            {
              text: '回湾线已经记下了。',
              nextNodeId: 'channel-complete',
              conditions: [{ kind: 'questStatus', questId: channelQuestId, status: 'completed' }],
            },
            { text: '先说说这片潮沟。', nextNodeId: 'tidal-flat' },
          ],
        },
        { id: 'recovery-accepted', text: '「浅滩东边有拖网的脚印，别踩进湿沙里的旧木桩。浮标绳断口还挂着蓝漆。」' },
        { id: 'recovery-complete', text: '「浮标能重新连起来了。等入夜以后，再去浅滩北侧看灯影落在哪道浪线上。」' },
        { id: 'channel-accepted', text: '「天色暗下来再找。石标背海的一面有一条刻线，灯影碰到刻线时，浅湾就能绕过外礁。」' },
        { id: 'channel-complete', text: '「这回涨潮时就有路标可循。走水路的人不用再拿命赌浪头了。」' },
        { id: 'tidal-flat', text: '「白日看沙纹只能辨风，天黑后才看得出潮沟怎么转。两样都要记，才算真懂这段海岸。」' },
      ],
    },
  ],
};

const quests = {
  quests: [
    {
      id: recoveryQuestId,
      name: '潮沟夺网',
      description: '顾潮生说退潮后有人从潮沟拖走网具和浮标。击退夺网客，找回浅滩上的潮标。',
      giverNpcId: fishermanId,
      prerequisiteQuestIds: ['quest.r82-follow-the-tide'],
      objectives: [{
        id: 'objective.r83-defeat-tide-wake-looters',
        kind: 'defeatEncounter',
        targetId: encounterId,
        requiredCount: 1,
        text: '击退潮沟里的夺网客',
      }],
      rewards: {
        experience: 42,
        currency: 34,
        discoverKnowledgeNodeIds: [netShoalsNodeId],
      },
    },
    {
      id: channelQuestId,
      name: '暮潮牵标',
      description: '浮标网具复位后，顾潮生请你在黄昏或入夜时辨出石标上的回湾刻线。',
      giverNpcId: fishermanId,
      prerequisiteQuestIds: [recoveryQuestId],
      objectives: [{
        id: 'objective.r83-discover-night-channel',
        kind: 'discoverKnowledge',
        targetId: nightChannelNodeId,
        requiredCount: 1,
        text: '在黄昏或入夜时调查浅滩石标',
      }],
      rewards: {
        experience: 36,
        currency: 30,
      },
    },
  ],
};

const newLandmark = {
  id: 'landmark.r83-night-channel',
  mapResourceId: mapId,
  col: 63,
  row: 72,
  name: '暮潮牵标',
  category: 'other',
  discoveryNodeId: nightChannelNodeId,
};

const newEvent = {
  id: 'event.r83-night-channel',
  mapResourceId: mapId,
  col: 63,
  row: 72,
  text: '石标背面有一道细刻，夜潮灯影落在刻线里时，沙脊外侧正好让出一条回湾水路。',
  approachText: '旧石标朝海的一面被盐壳盖住，旁边留有刚换过的浮标绳。',
  once: true,
  conditions: {
    knowledgeNodeIds: [netShoalsNodeId],
    periodIds: ['period.dusk', 'period.night'],
  },
  discoverKnowledgeNodeId: nightChannelNodeId,
  interaction: {
    prompt: '辨认暮潮灯影下的石标刻线',
    range: 1,
    approachDirections: ['left', 'down'],
  },
};

const newNodes = [
  { id: merchantId, kind: 'character', title: '金云帆', summary: '在青帆埠经营潮行补给摊，按时辰往返集市与近岸住处。', knownByDefault: false },
  { id: fishermanId, kind: 'character', title: '顾潮生', summary: '青帆埠巡潮渔户，白日查看浮标，入夜记录回湾灯影。', knownByDefault: false },
  { id: raiderCharacterId, kind: 'character', title: '潮沟夺网头目', summary: '退潮时带人拖走网具与系船浮标的夺网客头目。', knownByDefault: false },
  { id: itemId, kind: 'item', title: '海盐敷膏', summary: '青帆埠以海盐、松脂和芦根调成的浅伤敷膏。', knownByDefault: false },
  { id: netShoalsNodeId, kind: 'place', title: '回标浅滩', summary: '潮沟夺网客撤走后重新接回浮标绳的浅滩。', knownByDefault: false },
  { id: nightChannelNodeId, kind: 'place', title: '暮潮牵标', summary: '灯影与石刻重合时显出的安全回湾线。', knownByDefault: false },
  { id: 'event.r83-tide-wake-looters', kind: 'event', title: '潮沟夺网', summary: '潮沟夺网客拖走沿岸渔具并占住退潮浅滩。', knownByDefault: false },
  { id: 'event.r83-night-channel', kind: 'event', title: '暮潮石标', summary: '黄昏或入夜后可按灯影辨认石标回湾线。', knownByDefault: false },
  { id: recoveryQuestId, kind: 'quest', title: '潮沟夺网', summary: '击退夺网客，找回浅滩的网具与浮标。', knownByDefault: false },
  { id: channelQuestId, kind: 'quest', title: '暮潮牵标', summary: '在黄昏或入夜时辨认沿岸回湾航线。', knownByDefault: false },
];

const newEdges = [
  { id: 'kg.edge.r83-merchant-location', fromId: merchantId, toId: 'place.r82-east-coast', relation: 'locatedAt', summary: '金云帆在青帆埠经营潮行补给摊。' },
  { id: 'kg.edge.r83-merchant-stock', fromId: merchantId, toId: itemId, relation: 'holds', summary: '金云帆的补给摊售有海盐敷膏。' },
  { id: 'kg.edge.r83-fisher-location', fromId: fishermanId, toId: 'place.r82-east-coast', relation: 'locatedAt', summary: '顾潮生在青帆埠附近巡潮。' },
  { id: 'kg.edge.r83-fisher-recovery', fromId: fishermanId, toId: recoveryQuestId, relation: 'participatesIn', summary: '顾潮生委托玩家找回潮沟网具。' },
  { id: 'kg.edge.r83-fisher-channel', fromId: fishermanId, toId: channelQuestId, relation: 'participatesIn', summary: '顾潮生请玩家辨认暮潮回湾线。' },
  { id: 'kg.edge.r83-raiders-location', fromId: raiderCharacterId, toId: 'place.r82-east-coast', relation: 'locatedAt', summary: '夺网客头目出没在东汊潮沟浅滩。' },
  { id: 'kg.edge.r83-encounter-raider', fromId: 'event.r83-tide-wake-looters', toId: raiderCharacterId, relation: 'triggers', summary: '在潮沟浅滩遭遇夺网头目。' },
  { id: 'kg.edge.r83-recovery-encounter', fromId: recoveryQuestId, toId: 'event.r83-tide-wake-looters', relation: 'requires', summary: '潮沟夺网要求击退夺网客。' },
  { id: 'kg.edge.r83-recovery-shoals', fromId: recoveryQuestId, toId: netShoalsNodeId, relation: 'rewards', summary: '找回浮标后重新得知回标浅滩。' },
  { id: 'kg.edge.r83-night-event-place', fromId: 'event.r83-night-channel', toId: nightChannelNodeId, relation: 'triggers', summary: '夜潮灯影照亮回湾石标后发现安全航线。' },
  { id: 'kg.edge.r83-channel-quest-place', fromId: channelQuestId, toId: nightChannelNodeId, relation: 'requires', summary: '暮潮牵标要求玩家调查夜间石标。' },
];

const resourceEntries = [
  { id: 'npc.round-83-east-coast-set', path: 'characters/round-83-east-coast-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-83-east-coast-set', path: 'dialogues/round-83-east-coast-conversations.json', schema: 'dialogue-set' },
  { id: 'quest.round-83-east-coast-set', path: 'quests/round-83-east-coast-quests.json', schema: 'quest-set' },
  { id: 'item.round-83-east-coast-set', path: 'items/round-83-east-coast-items.json', schema: 'items-set' },
  { id: 'shop.round-83-east-coast-set', path: 'shops/round-83-east-coast-shops.json', schema: 'shops-set' },
  { id: 'encounter.round-83-east-coast-set', path: 'battles/round-83-east-coast-encounters.json', schema: 'battle-encounters' },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

async function appendGraphEntries(path, field, additions) {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  const existing = parsed[field] ?? [];
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  if (additions.every((entry) => JSON.stringify(byId.get(entry.id)) === JSON.stringify(entry))) return;
  if (additions.some((entry) => byId.has(entry.id))) {
    throw new Error('Round 83 图谱条目与生成器声明不一致；请先移除冲突的 Round 83 条目。');
  }
  const closing = raw.lastIndexOf('\n  ]');
  if (closing < 0 || raw.slice(closing).trim() !== ']\n}') {
    throw new Error('无法保持知识图谱文件原格式追加 ' + field + '。');
  }
  const lines = additions.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, raw.slice(0, closing) + ',\n' + lines + raw.slice(closing));
}

const [manifest, world] = await Promise.all([readJson(paths.manifest), readJson(paths.world)]);
if (!world.regions.some((region) => region.mapResourceId === mapId)) {
  throw new Error('缺少 Round 82 东溟海岸区域，拒绝追加孤立港镇内容。');
}
if (!world.landmarks.some((landmark) => landmark.id === 'landmark.r82-east-tide-gauge')) {
  throw new Error('缺少东汊石潮尺锚点，拒绝跳过潮尺任务前置的沿岸内容。');
}

world.landmarks = [
  ...(world.landmarks ?? []).filter((entry) => !entry.id.startsWith('landmark.r83-')),
  newLandmark,
];
world.events = [
  ...(world.events ?? []).filter((entry) => !entry.id.startsWith('event.r83-')),
  newEvent,
];
manifest.resources = (manifest.resources ?? []).filter((entry) =>
  !resourceEntries.some((addition) => addition.id === entry.id));
const worldIndex = manifest.resources.findIndex((entry) => entry.id === 'world.atlas');
if (worldIndex < 0) throw new Error('manifest 缺少 world.atlas，拒绝登记孤立港镇资源。');
manifest.resources.splice(worldIndex, 0, ...resourceEntries);

await Promise.all([
  writeJson(paths.items, items),
  writeJson(paths.shops, shops),
  writeJson(paths.encounters, encounters),
  writeJson(paths.npcs, npcs),
  writeJson(paths.dialogues, dialogues),
  writeJson(paths.quests, quests),
  writeJson(paths.manifest, manifest),
  writeJson(paths.world, world),
  appendGraphEntries(paths.nodes, 'nodes', newNodes),
  appendGraphEntries(paths.edges, 'edges', newEdges),
]);

console.log('Generated Round 83 青帆埠：2 位居民、7 时段移动、1 项海岸商品、1 家补给摊、1 场可重试战斗、2 段任务与暮潮航标。');
