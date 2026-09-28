// Round 34 文档一致性审计（只读）。
// 以 data/base 的 JSON 与 data/schema 的封闭枚举为事实来源，核验
// docs/MAP-ATLAS.md、docs/DIALOGUE-GUIDE.md、docs/QUESTS.md、docs/WORLD-SETTING.md
// 是否与当前资料一致。不访问网络、不写入任何文件；发现缺失或漂移时以非零退出。
// 所有计数均由数据推导（manifest/Schema/集合长度），不硬编码任务/地图/节点总数，
// 也不依赖 app UI 中的易变中文措辞——只断言 JSON 里稳定存在的 id、name、kind 与坐标。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readText = async (path) => readFile(path, 'utf8');

const failures = [];
const fail = (doc, message) => failures.push(`docs/${doc}: ${message}`);

// ---- 1. 按 manifest schema 家族收集事实（多资源合并，与加载器同规则） ----
const manifest = await readJson(resolve(root, 'data/base/manifest.json'));
const bySchema = new Map();
for (const resource of manifest.resources) {
  if (!bySchema.has(resource.schema)) bySchema.set(resource.schema, []);
  bySchema.get(resource.schema).push(resource);
}
const loadFamily = async (schemaId) => {
  const out = [];
  for (const resource of bySchema.get(schemaId) ?? []) {
    out.push({ resource, data: await readJson(resolve(root, 'data/base', resource.path)) });
  }
  return out;
};

// 地图：id 必须与 manifest 资源 id 一致（引擎协议）。
const mapById = new Map();
for (const { resource, data } of await loadFamily('grid-map')) {
  if (data.id !== resource.id) {
    fail('MAP-ATLAS.md', `地图 JSON id "${data.id}" 与 manifest 资源 id "${resource.id}" 不一致（数据侧错误）`);
    continue;
  }
  mapById.set(resource.id, data);
}

const worldFamily = await loadFamily('world-map');
if (worldFamily.length !== 1) {
  fail('MAP-ATLAS.md', `manifest 应登记唯一 world-map 资源，实际 ${worldFamily.length} 个`);
}
const world = worldFamily[0]?.data ?? { regions: [], transitions: [], events: [], randomEvents: [] };

const npcById = new Map();
for (const { data } of await loadFamily('npc-set')) {
  for (const npc of data.npcs ?? []) npcById.set(npc.id, npc);
}
const itemById = new Map();
for (const { data } of await loadFamily('items-set')) {
  for (const item of data.items ?? []) itemById.set(item.id, item);
}
const encounterById = new Map();
for (const { data } of await loadFamily('battle-encounters')) {
  for (const encounter of data.encounters ?? []) encounterById.set(encounter.id, encounter);
}
const quests = [];
for (const { data } of await loadFamily('quest-set')) {
  for (const quest of data.quests ?? []) quests.push(quest);
}
const factionNames = [];
const factionById = new Map();
for (const { data } of await loadFamily('faction-set')) {
  for (const faction of data.factions ?? []) {
    factionNames.push(faction.name);
    factionById.set(faction.id, faction);
  }
}
const profiles = [];
for (const { data } of await loadFamily('character-profiles')) {
  profiles.push(...(data.profiles ?? []));
}
const calendar = (await loadFamily('game-calendar'))[0]?.data;
const climate = (await loadFamily('climate'))[0]?.data;
const knowledgeNodeIds = new Set();
const knowledgeNodeById = new Map();
for (const { data } of await loadFamily('knowledge-nodes')) {
  for (const node of data.nodes ?? []) {
    knowledgeNodeIds.add(node.id);
    knowledgeNodeById.set(node.id, node);
  }
}
const dialogueSchema = await readJson(resolve(root, 'data/schema/dialogue-set.schema.json'));
const questSchema = await readJson(resolve(root, 'data/schema/quest-set.schema.json'));

// ---- 2. 可走性按各图 tileTypes 复现（与 grid-map canEnter 同语义） ----
const cellKey = ({ col, row }) => `(${col}, ${row})`;
const inBounds = (map, col, row) =>
  Number.isInteger(col) && Number.isInteger(row) &&
  col >= 0 && col < map.columns && row >= 0 && row < map.rows;
const isWalkable = (map, col, row) => {
  if (!inBounds(map, col, row)) return false;
  const rowText = map.grid[row];
  if (typeof rowText !== 'string' || col >= rowText.length) return false;
  const tile = map.tileTypes[rowText[col]];
  return tile !== undefined && tile.solid !== true;
};

// ---- 3. 数据侧一致性：区域、关口、事件引用与坐标 ----
const regionNames = world.regions.map((region) => region.name);
const mapIds = new Set(mapById.keys());
for (const region of world.regions) {
  if (!mapIds.has(region.mapResourceId)) {
    fail('MAP-ATLAS.md', `区域 "${region.name}" 引用的地图 "${region.mapResourceId}" 未登记为 grid-map 资源`);
  }
}
const regionMapIds = new Set(world.regions.map((region) => region.mapResourceId));
for (const mapId of mapIds) {
  if (!regionMapIds.has(mapId)) {
    fail('MAP-ATLAS.md', `grid-map 资源 "${mapId}" 未出现在 world-map 的 regions 中，文档无法给出舆图坐标`);
  }
}

for (const transition of world.transitions ?? []) {
  for (const [label, endpoint] of [['from', transition.from], ['to', transition.to]]) {
    const map = mapById.get(endpoint.mapResourceId);
    if (!regionMapIds.has(endpoint.mapResourceId)) {
      fail('MAP-ATLAS.md', `关口 "${transition.id}" 的 ${label} 地图 "${endpoint.mapResourceId}" 不在世界图区域中`);
    } else if (!map || !isWalkable(map, endpoint.col, endpoint.row)) {
      fail('MAP-ATLAS.md', `关口 "${transition.id}" 的 ${label} 坐标 ${cellKey(endpoint)} 不可通行或超出地图边界`);
    }
  }
  const fromMap = mapById.get(transition.from.mapResourceId);
  if (fromMap && transition.from.col === fromMap.playerStart.col && transition.from.row === fromMap.playerStart.row) {
    fail('MAP-ATLAS.md', `关口 "${transition.id}" 的 from 坐标与玩家出生点重叠（引擎会禁用该关口）`);
  }
}

const periodIds = new Set((calendar?.periods ?? []).map((period) => period.id));
const weatherIds = new Set((climate?.weathers ?? []).map((weather) => weather.id));
for (const event of world.events ?? []) {
  if (!regionMapIds.has(event.mapResourceId)) {
    fail('MAP-ATLAS.md', `区域事件 "${event.id}" 的地图 "${event.mapResourceId}" 不在世界图区域中`);
  } else {
    const map = mapById.get(event.mapResourceId);
    if (!map || !isWalkable(map, event.col, event.row)) {
      fail('MAP-ATLAS.md', `区域事件 "${event.id}" 的触发坐标 (${event.col}, ${event.row}) 不可通行或超出地图边界`);
    }
  }
  for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
    if (!knowledgeNodeIds.has(nodeId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 条件引用的知识节点 "${nodeId}" 未登记`);
  }
  for (const periodId of event.conditions?.periodIds ?? []) {
    if (!periodIds.has(periodId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 条件引用的时段 "${periodId}" 未登记`);
  }
  for (const weatherId of event.conditions?.weatherIds ?? []) {
    if (!weatherIds.has(weatherId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 条件引用的天气 "${weatherId}" 未登记`);
  }
  for (const npcId of event.conditions?.nearbyNpcIds ?? []) {
    if (!npcById.has(npcId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 条件引用的人物 "${npcId}" 未登记`);
  }
  if (event.discoverKnowledgeNodeId !== undefined && !knowledgeNodeIds.has(event.discoverKnowledgeNodeId)) {
    fail('MAP-ATLAS.md', `区域事件 "${event.id}" 的发现节点 "${event.discoverKnowledgeNodeId}" 未登记`);
  }
}
for (const event of world.randomEvents ?? []) {
  if (!regionMapIds.has(event.mapResourceId)) {
    fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 的地图 "${event.mapResourceId}" 不在世界图区域中`);
  }
  if (!Number.isFinite(event.chance) || event.chance < 0 || event.chance > 1) {
    fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 的 chance 不在 0–1 范围内`);
  }
  for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
    if (!knowledgeNodeIds.has(nodeId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 条件引用的知识节点 "${nodeId}" 未登记`);
  }
  for (const periodId of event.conditions?.periodIds ?? []) {
    if (!periodIds.has(periodId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 条件引用的时段 "${periodId}" 未登记`);
  }
  for (const weatherId of event.conditions?.weatherIds ?? []) {
    if (!weatherIds.has(weatherId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 条件引用的天气 "${weatherId}" 未登记`);
  }
  for (const npcId of event.conditions?.nearbyNpcIds ?? []) {
    if (!npcById.has(npcId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 条件引用的人物 "${npcId}" 未登记`);
  }
  if (event.discoverKnowledgeNodeId !== undefined && !knowledgeNodeIds.has(event.discoverKnowledgeNodeId)) {
    fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 的发现节点 "${event.discoverKnowledgeNodeId}" 未登记`);
  }
}

// ---- 4. 从 Schema 提取封闭枚举 kind（文档必须逐一覆盖） ----
const schemaKinds = (definition) =>
  definition.oneOf.map((branch) => branch.properties?.kind?.const).filter((kind) => kind !== undefined);
const conditionKinds = schemaKinds(dialogueSchema.definitions.condition);
const effectKinds = schemaKinds(dialogueSchema.definitions.effect);
const objectiveRefs = questSchema.definitions.quest.properties.objectives.items.oneOf
  .map((ref) => ref.$ref?.split('/').pop())
  .filter((name) => name !== undefined);
const objectiveKinds = objectiveRefs.map((name) => questSchema.definitions[name]?.properties?.kind?.const)
  .filter((kind) => kind !== undefined);

// ---- 5. 文档覆盖核验 ----
const atlas = await readText(resolve(root, 'docs/MAP-ATLAS.md'));
const atlasLines = atlas.split(/\r?\n/);
const dialogueGuide = await readText(resolve(root, 'docs/DIALOGUE-GUIDE.md'));
const questsDoc = await readText(resolve(root, 'docs/QUESTS.md'));
const worldSetting = await readText(resolve(root, 'docs/WORLD-SETTING.md'));

// 5.1 地图图册：地图 id、区域名、舆图坐标、尺寸、起点须在同一总表行对应。
const mapTableStart = atlas.indexOf('## 当前地图资源总表');
const mapTableEnd = atlas.indexOf('## 关口端点', mapTableStart);
const mapTable = mapTableStart < 0 || mapTableEnd < 0 ? '' : atlas.slice(mapTableStart, mapTableEnd);
const documentedMapIds = new Set(
  [...mapTable.matchAll(/^\|\s*`([^`]+)`/gm)].map((match) => match[1]),
);
for (const [mapId, map] of mapById) {
  if (!documentedMapIds.has(mapId)) fail('MAP-ATLAS.md', `地图总表缺少资源 id "${mapId}"`);
  const region = world.regions.find((candidate) => candidate.mapResourceId === mapId);
  const row = mapTable.split(/\r?\n/).find((line) => line.startsWith('| `' + mapId + '`'));
  if (row === undefined || region === undefined) continue;
  const size = `${map.columns}×${map.rows}`;
  const start = cellKey(map.playerStart);
  const pos = `(${region.atlasPosition.x}, ${region.atlasPosition.y})`;
  for (const [label, token] of [['区域名', region.name], ['舆图坐标', pos], ['尺寸', size], ['玩家起点', start]]) {
    if (!row.includes(token)) fail('MAP-ATLAS.md', `地图 "${mapId}" 所在行缺少${label} ${token}`);
  }
}
for (const mapId of documentedMapIds) {
  if (!mapById.has(mapId)) fail('MAP-ATLAS.md', `地图总表有未登记的 grid-map id "${mapId}"`);
}

// 5.2 地图图册：每个关口 id 所在行必须同时写出两端坐标。
for (const transition of world.transitions ?? []) {
  const row = atlasLines.find((line) => line.includes(transition.id));
  if (row === undefined) {
    fail('MAP-ATLAS.md', `缺少关口 id "${transition.id}"`);
    continue;
  }
  const fromKey = cellKey(transition.from);
  const toKey = cellKey(transition.to);
  for (const [label, mapId] of [['from 地图', transition.from.mapResourceId], ['to 地图', transition.to.mapResourceId]]) {
    if (!row.includes(mapId)) fail('MAP-ATLAS.md', `关口 "${transition.id}" 所在行缺少${label} id "${mapId}"`);
  }
  if (!row.includes(fromKey)) fail('MAP-ATLAS.md', `关口 "${transition.id}" 所在行缺少 from 坐标 ${fromKey}`);
  if (!row.includes(toKey)) fail('MAP-ATLAS.md', `关口 "${transition.id}" 所在行缺少 to 坐标 ${toKey}`);
}

// 5.3 地图图册：每个区域事件 id 所在行必须写出触发坐标。
for (const event of world.events ?? []) {
  const row = atlasLines.find((line) => line.includes(event.id));
  if (row === undefined) {
    fail('MAP-ATLAS.md', `缺少区域事件 id "${event.id}"`);
    continue;
  }
  const pos = `(${event.col}, ${event.row})`;
  if (!row.includes(pos)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少触发坐标 ${pos}`);
  if (!row.includes(event.mapResourceId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少地图 id "${event.mapResourceId}"`);
  const onceLabel = event.once === true ? '是' : '否';
  if (!row.includes(onceLabel)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少一次性值 "${onceLabel}"`);
  for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
    if (!row.includes(nodeId)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少线索条件 "${nodeId}"`);
  }
  for (const periodId of event.conditions?.periodIds ?? []) {
    const name = calendar?.periods?.find((period) => period.id === periodId)?.name;
    if (name !== undefined && !row.includes(name)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少时段条件 "${name}"`);
  }
  for (const weatherId of event.conditions?.weatherIds ?? []) {
    const name = climate?.weathers?.find((weather) => weather.id === weatherId)?.name;
    if (name !== undefined && !row.includes(name)) fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少天气条件 "${name}"`);
  }
  if (event.discoverKnowledgeNodeId !== undefined && !row.includes(event.discoverKnowledgeNodeId)) {
    fail('MAP-ATLAS.md', `区域事件 "${event.id}" 所在行缺少成功发现节点 "${event.discoverKnowledgeNodeId}"`);
  }
}

// 5.3.1 地图图册：每个漫游奇遇都要登记地图、概率、条件和发现节点。
const randomTableStart = atlas.indexOf('### 随机漫游奇遇');
const randomTableEnd = atlas.indexOf('## 资料协议', randomTableStart);
const randomTable = randomTableStart < 0 || randomTableEnd < 0
  ? ''
  : atlas.slice(randomTableStart, randomTableEnd);
for (const event of world.randomEvents ?? []) {
  const row = randomTable.split(/\r?\n/).find((line) => line.includes(event.id) && line.startsWith('|'));
  if (row === undefined) {
    fail('MAP-ATLAS.md', `漫游奇遇清单缺少 "${event.id}"`);
    continue;
  }
  const mapName = world.regions.find((region) => region.mapResourceId === event.mapResourceId)?.name;
  if (mapName !== undefined && !row.includes(mapName)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少地图名 "${mapName}"`);
  if (!row.includes(event.mapResourceId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少地图 id "${event.mapResourceId}"`);
  if (!row.includes(`${Math.round(event.chance * 100)}%`)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少概率`);
  const onceLabel = event.once === true ? '是' : '否';
  if (!row.includes(onceLabel)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少一次性值 "${onceLabel}"`);
  for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
    if (!row.includes(nodeId)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少见闻条件 "${nodeId}"`);
  }
  for (const periodId of event.conditions?.periodIds ?? []) {
    const name = calendar?.periods?.find((period) => period.id === periodId)?.name;
    if (name !== undefined && !row.includes(name)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少时段条件 "${name}"`);
  }
  for (const weatherId of event.conditions?.weatherIds ?? []) {
    const name = climate?.weathers?.find((weather) => weather.id === weatherId)?.name;
    if (name !== undefined && !row.includes(name)) fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少天气条件 "${name}"`);
  }
  for (const npcId of event.conditions?.nearbyNpcIds ?? []) {
    const npc = npcById.get(npcId);
    if (npc === undefined) {
      fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 条件引用的人物 "${npcId}" 未登记（数据侧错误）`);
    } else if (!row.includes(npc.id) || !row.includes(npc.name)) {
      fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行须同时列出人物 id "${npc.id}" 与姓名 "${npc.name}"`);
    }
  }
  if (event.discoverKnowledgeNodeId !== undefined && !row.includes(event.discoverKnowledgeNodeId)) {
    fail('MAP-ATLAS.md', `漫游奇遇 "${event.id}" 所在行缺少发现节点 "${event.discoverKnowledgeNodeId}"`);
  }
}

// 5.4 对白指南：Schema 的每个条件/效果 kind 逐一覆盖。
for (const kind of conditionKinds) {
  if (!dialogueGuide.includes('`' + kind + '`')) fail('DIALOGUE-GUIDE.md', `缺少对白条件 kind "${kind}" 的条目`);
}
for (const kind of effectKinds) {
  if (!dialogueGuide.includes('`' + kind + '`')) fail('DIALOGUE-GUIDE.md', `缺少对白效果 kind "${kind}" 的条目`);
}

// 5.5 任务志：目标 kind 与每项任务的名称/发布人/前置/失败遭遇/报酬行。
for (const kind of objectiveKinds) {
  if (!questsDoc.includes('`' + kind + '`')) fail('QUESTS.md', `缺少任务目标 kind "${kind}" 的说明`);
}
const questTableStart = questsDoc.indexOf('## 总表');
const questTableEnd = questsDoc.indexOf('## 分支路线图', questTableStart);
const questTable = questTableStart < 0 || questTableEnd < 0 ? '' : questsDoc.slice(questTableStart, questTableEnd);
const normalizeQuestName = (value) => value.replaceAll('**', '').replace(/[（(].*$/, '').trim();
const documentedQuestRows = questTable.split(/\r?\n/)
  .filter((line) => line.startsWith('|'))
  .map((line) => ({ line, name: normalizeQuestName(line.split('|')[1] ?? '') }))
  .filter((row) => row.name !== '' && row.name !== '差事' && !/^-+$/.test(row.name));
const documentedQuestNames = new Set(documentedQuestRows.map((row) => row.name));
for (const name of documentedQuestNames) {
  if (!quests.some((quest) => quest.name === name)) fail('QUESTS.md', `总表有未登记的任务词条 "${name}"`);
}
for (const quest of quests) {
  const giver = npcById.get(quest.giverNpcId);
  if (giver === undefined) {
    fail('QUESTS.md', `任务 "${quest.name}" 的发布人 NPC "${quest.giverNpcId}" 未在 npc-set 中登记（数据侧错误）`);
    continue;
  }
  const row = documentedQuestRows.find((candidate) => candidate.name === quest.name)?.line;
  if (row === undefined) {
    fail('QUESTS.md', `总表缺少任务 "${quest.name}"`);
    continue;
  }
  const reward = `${quest.rewards.experience} / ${quest.rewards.currency}`;
  const standingRewards = (quest.rewards.factionRenown ?? []).map(({ factionId, delta }) => {
    const faction = factionById.get(factionId);
    if (faction === undefined) {
      fail('QUESTS.md', `任务 "${quest.name}" 的声望奖励门派 "${factionId}" 未登记（数据侧错误）`);
      return null;
    }
    return `声望 ${faction.name} ${delta > 0 ? '+' : ''}${delta}`;
  });
  const rewardKnowledgeTitles = (quest.rewards.discoverKnowledgeNodeIds ?? []).map((id) => {
    const node = knowledgeNodeById.get(id);
    if (node === undefined) {
      fail('QUESTS.md', `任务 "${quest.name}" 的结算见闻节点 "${id}" 未登记（数据侧错误）`);
      return null;
    }
    return `见闻 ${node.title}`;
  });
  const encounterNames = (quest.failOnEncounterIds ?? []).map((id) => {
    const encounter = encounterById.get(id);
    if (encounter === undefined) {
      fail('QUESTS.md', `任务 "${quest.name}" 的失败遭遇 "${id}" 未在 battle-encounters 中登记（数据侧错误）`);
      return null;
    }
    return encounter.name;
  });
  const prerequisiteNames = (quest.prerequisiteQuestIds ?? []).map((id) =>
    quests.find((other) => other.id === id)?.name ?? null);
  if (prerequisiteNames.includes(null)) {
    fail('QUESTS.md', `任务 "${quest.name}" 的前置 id 存在未登记任务（数据侧错误）`);
  }
  const regionName = world.regions.find((region) => region.mapResourceId === giver.mapResourceId)?.name;
  if (regionName === undefined) fail('QUESTS.md', `任务 "${quest.name}" 发布人的地图 "${giver.mapResourceId}" 未映射到区域（数据侧错误）`);
  const objectiveNames = [];
  for (const objective of quest.objectives) {
    if (objective.kind === 'collectItem') {
      const item = itemById.get(objective.targetId);
      if (item === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的目标物品 "${objective.targetId}" 未登记（数据侧错误）`);
      else objectiveNames.push(item.name, `×${objective.requiredCount}`);
    } else if (objective.kind === 'talkToNpc') {
      const target = npcById.get(objective.targetId);
      if (target === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的谈话目标 "${objective.targetId}" 未登记（数据侧错误）`);
      else objectiveNames.push(target.name);
    } else if (objective.kind === 'defeatEncounter') {
      const target = encounterById.get(objective.targetId);
      if (target === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的战斗目标 "${objective.targetId}" 未登记（数据侧错误）`);
      else objectiveNames.push(target.name);
    } else if (objective.kind === 'discoverKnowledge') {
      const target = knowledgeNodeById.get(objective.targetId);
      if (target === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的见闻目标 "${objective.targetId}" 未登记（数据侧错误）`);
      else objectiveNames.push(target.title);
    }
  }
  const eligibilityNames = [];
  if (quest.requiredFactionId !== undefined) {
    const faction = factionById.get(quest.requiredFactionId);
    if (faction === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的资格门派 "${quest.requiredFactionId}" 未登记（数据侧错误）`);
    else eligibilityNames.push(faction.name);
  }
  if (quest.requiredKnowledgeNodeId !== undefined) {
    const node = knowledgeNodeById.get(quest.requiredKnowledgeNodeId);
    if (node === undefined) fail('QUESTS.md', `任务 "${quest.name}" 的资格见闻 "${quest.requiredKnowledgeNodeId}" 未登记（数据侧错误）`);
    else eligibilityNames.push(node.title);
  }
  const required = [quest.name, giver.name, regionName, reward,
    ...standingRewards.filter(Boolean), ...rewardKnowledgeTitles.filter(Boolean), ...encounterNames.filter(Boolean),
    ...prerequisiteNames.filter(Boolean), ...objectiveNames, ...eligibilityNames].filter(Boolean);
  const missing = required.filter((token) => !row.includes(token));
  if (missing.length > 0) {
    fail('QUESTS.md', `任务 "${quest.name}" 同一总表行缺少：${missing.join('、')}`);
  }
}

// 5.6 世界设定：已登记门派名与正式区域名。
for (const name of factionNames) {
  if (!worldSetting.includes(name)) fail('WORLD-SETTING.md', `缺少门派 "${name}"`);
}
for (const name of regionNames) {
  if (!worldSetting.includes(name)) fail('WORLD-SETTING.md', `缺少正式地图区域名 "${name}"`);
}
for (const npc of npcById.values()) {
  if (!worldSetting.includes(npc.name)) fail('WORLD-SETTING.md', `缺少已登记人物 "${npc.name}"`);
}
for (const profile of profiles) {
  if (!worldSetting.includes(profile.id) || !worldSetting.includes(profile.name)) {
    fail('WORLD-SETTING.md', `缺少主角模板 "${profile.id}" / "${profile.name}"`);
  }
}

// ---- 6. 结果输出 ----
if (failures.length > 0) {
  console.error(`Round 34 文档审计失败：${failures.length} 处不一致。`);
  for (const line of failures) console.error('  [FAIL] ' + line);
  process.exit(1);
}
console.log('通过：文档一致性审计。核验范围（计数由数据推导）：' +
  `${mapById.size} 张地图/${world.regions.length} 个区域/` +
  `${world.transitions?.length ?? 0} 个关口/${world.events?.length ?? 0} 个定点事件/` +
  `${world.randomEvents?.length ?? 0} 个漫游奇遇、` +
  `对白条件 ${conditionKinds} + 效果 ${effectKinds}、` +
  `${quests.length} 项任务（目标 kind：${objectiveKinds.join('/')}）、` +
  `${factionNames.length} 个门派名。`);
