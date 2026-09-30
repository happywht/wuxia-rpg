import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'data/base');
const merchantId = 'char.r86-lu-yubai';
const shopId = 'shop.r86-tide-isle-supplies';
const encounterId = 'encounter.r86-reef-raiders';
const placeId = 'place.r86-tide-isle-supply';
const eventId = 'event.r86-reef-raiders';
const raiderId = 'char.r86-heiqi-qi';
const mapId = 'map.round-85-tide-isle';
const npcPosition = { col: 18, row: 54 };
const encounterPosition = { col: 57, row: 51 };

const npcSet = {
  npcs: [{
    id: merchantId,
    name: '陆余白',
    mapResourceId: mapId,
    position: npcPosition,
    dialogueId: 'dlg.r86-lu-yubai-tide-supplies',
    shopId,
    spriteFrame: 272,
    spriteFrames: { down: 256, right: 264, up: 272, left: 280 },
  }],
};

const dialogueSet = {
  conversations: [{
    id: 'dlg.r86-lu-yubai-tide-supplies',
    startNodeId: 'hello',
    nodes: [
      {
        id: 'hello',
        text: '陆余白把药囊放在潮线外的石台上：「岛上没药铺，这几味常用药只备了几份。过礁前看清水色，别等伤口见了海水才想起买药。」',
        options: [
          { text: '退潮时这片礁盘很危险？', nextNodeId: 'reef' },
          { text: '我先看看补给。', nextNodeId: 'farewell' },
        ],
      },
      {
        id: 'reef',
        text: '「低潮会露出一条窄路，也会有人趁乱翻船货。你若听见礁石后有人喊价，先看清他手里拿的是药还是刀。」',
        options: [{ text: '记下了。', nextNodeId: 'farewell' }],
      },
      { id: 'farewell', text: '陆余白把余下的药包重新系紧，免得涨潮时被浪头卷走。' },
    ],
  }],
};

const shopSet = {
  shops: [{
    id: shopId,
    name: '潮线药囊',
    npcId: merchantId,
    greeting: '陆余白掀开油布药囊：「货不多，都是过礁能用上的。买走一份，下一批得等船靠岸。」',
    sellRate: 0.3,
    stock: [
      { itemId: 'item.huichun-gao', quantity: 3 },
      { itemId: 'item.qingxin-wan', quantity: 3 },
      { itemId: 'item.r32.songzhen-xuesan', quantity: 2 },
      { itemId: 'item.r32.ouling-huqitang', quantity: 2 },
    ],
  }],
};

const encounterSet = {
  encounters: [{
    id: encounterId,
    name: '礁道夺货客',
    mapResourceId: mapId,
    position: encounterPosition,
    profileId: 'char.scribe-apprentice',
    knowledgeNodeId: raiderId,
    tideIds: ['tide.low'],
    enemy: {
      name: '黑鳍七',
      attributes: { body: 7, force: 8, agility: 8, insight: 5, resolve: 6 },
      health: 48,
      qi: 8,
      martialArtIds: ['skill.jianghu-sanshou', 'skill.lanmen-daofa'],
    },
    victoryExperience: 0,
    defeatRecovery: { healthRatio: 0.7, qiRatio: 0.65 },
    repeatable: true,
    texts: {
      approach: '退潮礁道上有人拦住去路，按 E 应战；涨潮后礁客会退回船边。',
      intro: '黑鳍七横刀挡在礁道中央：「潮水退了，这批船货就归我。」',
      victory: '黑鳍七被逼退到浪线外，暂时让出了窄道。',
      defeat: '你被黑鳍七压退到安全水线，潮声盖过了他的笑声。',
      flee: '你退回干燥处，黑鳍七仍在低潮礁道上徘徊。',
    },
  }],
};

const resources = [
  { id: 'npc.round-86-tide-isle-set', path: 'characters/round-86-tide-isle-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-86-tide-isle-set', path: 'dialogues/round-86-tide-isle-conversations.json', schema: 'dialogue-set' },
  { id: 'shop.round-86-tide-isle-set', path: 'shops/round-86-tide-isle-shops.json', schema: 'shops-set' },
  { id: 'encounter.round-86-tide-isle-set', path: 'battles/round-86-tide-isle-encounters.json', schema: 'battle-encounters' },
];

const nodes = [
  { id: merchantId, kind: 'character', title: '陆余白', summary: '潮生屿潮线外的药囊商，按有限库存售卖过礁药物，并熟悉低潮时的礁道风险。', knownByDefault: false },
  { id: placeId, kind: 'place', title: '潮线药囊摊', summary: '陆余白在潮生屿设置的临时补给点，摆在可步行的内岸，货品数量有限。', knownByDefault: false },
  { id: raiderId, kind: 'character', title: '黑鳍七', summary: '只在低潮礁道露面的夺货客，守着退潮后显露的窄路拦截行旅。', knownByDefault: false },
  { id: eventId, kind: 'event', title: '低潮夺货', summary: '低潮时黑鳍七一伙人在潮生屿礁道拦船货；涨潮后退回浪线外。', knownByDefault: false },
];

const edges = [
  { id: 'edge.r86-lu-yubai-supply', fromId: merchantId, toId: placeId, relation: 'locatedAt', summary: '陆余白在潮线药囊摊售卖有限补给。' },
  { id: 'edge.r86-supply-isle', fromId: placeId, toId: 'place.r85-tide-isle', relation: 'locatedAt', summary: '潮线药囊摊位于南溟·潮生屿内岸。' },
  { id: 'edge.r86-raider-participates', fromId: raiderId, toId: eventId, relation: 'participatesIn', summary: '黑鳍七在低潮时带人拦截礁道旅客。' },
  { id: 'edge.r86-event-isle', fromId: eventId, toId: 'place.r85-tide-isle', relation: 'locatedAt', summary: '低潮夺货发生在南溟·潮生屿东侧礁道。' },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeNewJson(path, value, label) {
  const next = JSON.stringify(value, null, 2) + '\n';
  let previous = null;
  try {
    previous = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous === null) {
    await writeFile(path, next);
    return;
  }
  if (previous !== next) throw new Error(label + ' 内容与 Round 86 生成器不一致，请人工检查后再处理。');
}

async function appendEntries(path, field, additions) {
  const raw = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  const parsed = JSON.parse(raw);
  const existing = parsed[field] ?? [];
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const missing = [];
  for (const entry of additions) {
    const previous = byId.get(entry.id);
    if (previous === undefined) missing.push(entry);
    else if (JSON.stringify(previous) !== JSON.stringify(entry)) {
      throw new Error(path + ' 已含不一致的 Round 86 条目；拒绝覆盖。');
    }
  }
  if (missing.length === 0) return;
  const fieldIndex = raw.indexOf('"' + field + '"');
  const opening = raw.indexOf('[', fieldIndex);
  if (fieldIndex < 0 || opening < 0) throw new Error('无法定位 ' + path + ' 中的数组 ' + field + '。');
  let depth = 0;
  let inString = false;
  let escaped = false;
  let closing = -1;
  for (let index = opening; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) {
      closing = index;
      break;
    }
  }
  if (closing < 0) throw new Error('无法定位 ' + path + ' 中的数组 ' + field + ' 结尾。');
  const closingLineStart = raw.lastIndexOf('\n', closing) + 1;
  const beforeClosing = raw.slice(0, closingLineStart);
  const contentBefore = existing.length > 0 ? beforeClosing.slice(0, -1) + ',\n' : beforeClosing;
  const lines = missing.map((entry) => '    ' + JSON.stringify(entry)).join(',\n');
  await writeFile(path, contentBefore + lines + '\n' + raw.slice(closingLineStart));
}

const [island, climate, itemSet, profiles, martialArts, manifest] = await Promise.all([
  readJson(resolve(base, 'maps/round-85-tide-isle.json')),
  readJson(resolve(base, 'worldview/climate.json')),
  readJson(resolve(base, 'items/round-06-items.json')),
  readJson(resolve(base, 'characters/round-04-profiles.json')),
  readJson(resolve(base, 'skills/round-04-martial-arts.json')),
  readJson(resolve(base, 'manifest.json')),
]);

function walkable(position) {
  const glyph = island.grid[position.row]?.[position.col];
  return glyph !== undefined && island.tileTypes[glyph] !== undefined && !island.tileTypes[glyph].solid;
}

if (island.id !== mapId || !walkable(npcPosition) || !walkable(encounterPosition)) {
  throw new Error('Round 86 补给摊或礁道遭遇的地图引用/格位无效。');
}
if (npcPosition.col === encounterPosition.col && npcPosition.row === encounterPosition.row) {
  throw new Error('Round 86 补给摊与礁道遭遇不能占用同一格。');
}
const tideIds = new Set(climate.tideCycle?.phases.map((phase) => phase.id) ?? []);
if (!tideIds.has('tide.low')) throw new Error('climate.base 未声明 tide.low。');
if (!profiles.profiles.some((profile) => profile.id === encounterSet.encounters[0].profileId)) {
  throw new Error('礁道遭遇引用了未知玩家模板。');
}
const knownItems = new Set(itemSet.items.map((item) => item.id));
if (shopSet.shops[0].stock.some((entry) => !knownItems.has(entry.itemId))) {
  throw new Error('潮线药囊引用了未知基础物品。');
}
const knownArts = new Set(martialArts.martialArts.map((art) => art.id));
if (encounterSet.encounters[0].enemy.martialArtIds.some((id) => !knownArts.has(id))) {
  throw new Error('礁道遭遇引用了未知武学。');
}

await Promise.all([
  writeNewJson(resolve(base, 'characters/round-86-tide-isle-npcs.json'), npcSet, '人物集'),
  writeNewJson(resolve(base, 'dialogues/round-86-tide-isle-conversations.json'), dialogueSet, '对白集'),
  writeNewJson(resolve(base, 'shops/round-86-tide-isle-shops.json'), shopSet, '商店集'),
  writeNewJson(resolve(base, 'battles/round-86-tide-isle-encounters.json'), encounterSet, '遭遇集'),
]);
await appendEntries(resolve(base, 'manifest.json'), 'resources', resources);
await appendEntries(resolve(base, 'knowledge_graph/nodes.json'), 'nodes', nodes);
await appendEntries(resolve(base, 'knowledge_graph/edges.json'), 'edges', edges);

console.log(`Round 86 content is ready: one island supplier, ${shopSet.shops[0].stock.length} finite-stock medicine lines, and one repeatable low-tide encounter.`);
