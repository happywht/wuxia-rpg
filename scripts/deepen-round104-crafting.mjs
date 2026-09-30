/** Incremental authored content; never regenerate historic maps or atlas. */
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const save = async (p, value) => writeFile(new URL(p, root),
  (JSON.stringify(value, null, 2) + '\n').replace(/\n/g, p.includes('knowledge_graph/') ? '\r\n' : '\n'));
const objective = (id, kind, targetId, text, extra = {}) => ({ id: `objective.r104-${id}`, kind, targetId, requiredCount: 1, text, ...extra });
export const loops = [
  {
    questId: 'quest.r31-herbal-stocktaking', dialogueId: 'dlg.rong-su-qing-herbalist', key: 'medicine',
    nodeId: 'event.r104-medicine-practice', title: '药炉疗伤实践',
    description: '先备三根苍崖根，留下路上备用；向容素青问生肌散药方，用寒珠草两份和苍崖根一份在渡口药炉炼制，工钱18。接下来的三档成药都能用于伤后恢复，没有可恢复损耗不必服药。确实用过再来核对药案。材料不向药庐缴纳。',
    objectives: [
      objective('formula', 'discoverKnowledge', 'event.formula-shengji-san', '向容素青请教生肌散的炼法'),
      objective('brew', 'craftRecipe', 'alchemy.recipe.shengji-san', '备寒珠草×2、苍崖根×1与18银两，去渡口药炉炼生肌散'),
      objective('heal', 'useItem', 'item.shengji-san-cu', '损耗后按I打开背包，实际使用一剂生肌散（任意品质；无恢复收益会保留药）', {
        alternativeTargetIds: ['item.shengji-san-zhong', 'item.shengji-san-shang'],
      }),
      objective('medicine-report', 'talkToNpc', 'char.rong-su-qing', '回渡口向容素青复核炼药与疗伤'),
    ],
    brief: '容素青拨开药簿：「三根先备在你自己包里，不是缴药。问我生肌散药方，再去药炉炼；寒珠草两份、苍崖根一份、工钱十八。姜百味在江南常卖药材。三档药都算，损耗后在背包里用，无可恢复的生命内力就莫糟蹋。用过再来，我核药案。」',
    echo: '容素青核完药案：「备料、守炉、用药，都走过了；剩下的根你留作路上急用。方子以金创血亏为主，中正与上乘兼续内力。此后缺药先查包与银两，再决定买成药还是重新守炉。」',
    legacy: '容素青点头：「从前清点的三根我记得，旧谢仪不再重付。新药炉实践没有记在你旧案里；愿意学方炼药、伤后试用仍可，别把旧清点当成已经炼过。」',
  },
  {
    questId: 'quest.r31-blade-quench-stock', dialogueId: 'dlg.zhu-jiuxian-mentor', key: 'forge',
    nodeId: 'event.r104-forge-practice', title: '淬锋实战实践',
    description: '先备熟铁砂两份，用青铜笔剑在渡口铁砧重理刃口，工钱24；穿戴中的旧剑须先卸下。锻成淬锋短剑后在背包装备，再击退渡口芦桥集口的旧例索钱人，回来向祝九弦复命。这是共通兵刃练习，不会自动授刀法或拜师。',
    objectives: [
      objective('forge', 'craftRecipe', 'forge.recipe.refine-bronze-pen-sword', '备青铜笔剑、熟铁砂×2与24银两，在渡口铁砧重理刃口（旧剑先卸下）'),
      objective('equip', 'equipItem', 'item.qingtong-jian', '按I打开背包，装备锻成的淬锋短剑'),
      objective('challenge', 'defeatEncounter', 'encounter.r58-market-toll-claimer', '装备淬锋短剑交手，击退渡口芦桥集口旧例索钱人', { requiredEquippedItemId: 'item.qingtong-jian' }),
      objective('forge-report', 'talkToNpc', 'char.zhu-jiuxian', '回渡口向祝九弦报告淬锋与交手'),
    ],
    brief: '祝九弦敲了敲铁砧：「先备两份熟铁砂。旧青铜笔剑在江南姜百味担上买，带来重理刃口，工钱二十四；穿戴着的先卸下。成了淬锋短剑，背包里装备，再去渡口芦桥集口赶散旧例索钱人。这不是传刀法，先看同类兵刃怎么把劲递出去。赢了回来。」',
    echo: '祝九弦验过刃线：「比旧剑多两分力道，交手也练过；这一回的谢仪给过便不重付。那伙索钱人再来仍要应对，别当一场胜利就永远清了集口。丢了旧器还能向姜百味补买，缺银便先做差事，别在炉边把钱耗光。」',
    legacy: '祝九弦点头：「你旧案里的两份淬料算清过，谢仪也结了，不追补成新锻造实战。铁砧和共通配方仍在；自己备器、卸下旧器再锻，不必为旧差事再交一遍。」',
  },
];

// Preserve every unrelated byte in hand-authored quest/dialogue files.
async function patchRecord(p, arrayKey, id, transform) {
  let source = await readFile(new URL(p, root), 'utf8');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const parsed = JSON.parse(source);
  const record = parsed[arrayKey].find(r => r.id === id);
  if (!record) throw new Error(`缺少受管条目 ${id}`);
  const anchor = source.indexOf(`"id": "${id}"`);
  const start = source.lastIndexOf('    {', anchor);
  const next = source.indexOf(newline + '    }', anchor);
  if (start < 0 || next < 0) throw new Error(`受管条目边界无效 ${id}`);
  transform(record);
  const replacement = JSON.stringify(record, null, 2).split('\n').map(line => '    ' + line).join(newline);
  source = source.slice(0, start) + replacement + source.slice(next + newline.length + 5);
  JSON.parse(source);
  await writeFile(new URL(p, root), source);
}

const schemaPath = 'data/schema/quest-set.schema.json';
const schema = await read(schemaPath);
schema.definitions['defeat-objective'].properties.requiredEquippedItemId = { $ref: '#/definitions/id' };
for (const kind of ['craftRecipe', 'useItem', 'equipItem']) {
  const definition = structuredClone(schema.definitions['collect-objective']);
  definition.properties.kind = { const: kind };
  definition.properties.requiredCount.maximum = 99;
  if (kind !== 'craftRecipe') definition.properties.alternativeTargetIds = {
    type: 'array', uniqueItems: true, maxItems: 16, items: { $ref: '#/definitions/id' },
  };
  schema.definitions[`${kind}-objective`] = definition;
  const reference = { $ref: `#/definitions/${kind}-objective` };
  const choices = schema.definitions.quest.properties.objectives.items.oneOf;
  if (!choices.some(c => c.$ref === reference.$ref)) choices.push(reference);
}
await save(schemaPath, schema);
for (const loop of loops) {
  await patchRecord('data/base/quests/round-07-quests.json', 'quests', loop.questId, quest => {
    quest.description = loop.description;
    quest.orderedObjectives = true;
    quest.objectives = [quest.objectives[0], ...loop.objectives];
    quest.rewards.discoverKnowledgeNodeIds = [loop.nodeId];
  });
  await patchRecord(loop.key === 'medicine' ? 'data/base/dialogues/round-03-conversations.json' : 'data/base/dialogues/round-30-conversations.json', 'conversations', loop.dialogueId, conversation => {
    const greet = conversation.nodes.find(n => n.id === conversation.startNodeId);
    const entries = [
      { id: `r104-${loop.key}-brief`, text: loop.brief, option: '这项制作差事，材料与用处怎么安排？', conditions: [{ kind: 'questStatus', questId: loop.questId, status: 'active' }] },
      { id: `r104-${loop.key}-echo`, text: loop.echo, option: '制作与用途都做过了，来核对。', conditions: [{ kind: 'questStatus', questId: loop.questId, status: 'completed' }, { kind: 'knowledgeKnown', nodeId: loop.nodeId }] },
      { id: `r104-${loop.key}-legacy`, text: loop.legacy, option: '旧清点的差事还记得吗？', conditions: [{ kind: 'questStatus', questId: loop.questId, status: 'completed' }, { kind: 'knowledgeKnown', nodeId: loop.nodeId, isKnown: false }] },
    ];
    for (const entry of entries) {
      const existing = conversation.nodes.findIndex(n => n.id === entry.id);
      const node = { id: entry.id, text: entry.text };
      if (existing < 0) conversation.nodes.push(node); else conversation.nodes[existing] = node;
      const option = { text: entry.option, nextNodeId: entry.id, conditions: entry.conditions };
      const optionIndex = greet.options.findIndex(o => o.nextNodeId === entry.id);
      if (optionIndex < 0) greet.options.splice(Math.max(0, greet.options.length - 1), 0, option); else greet.options[optionIndex] = option;
    }
  });
}
const upsert = (entries, value) => {
  const index = entries.findIndex(e => e.id === value.id);
  if (index < 0) entries.push(value); else entries[index] = value;
};
const nodes = await read('data/base/knowledge_graph/nodes.json');
const edges = await read('data/base/knowledge_graph/edges.json');
for (const loop of loops) {
  upsert(nodes.nodes, { id: loop.nodeId, kind: 'event', title: loop.title, summary: loop.description, knownByDefault: false });
  upsert(edges.edges, { id: `kg.edge.r104-${loop.key}-practice`, fromId: loop.key === 'medicine' ? 'char.rong-su-qing' : 'char.zhu-jiuxian', toId: loop.nodeId, relation: 'knows', summary: '制作与用途完整结案后的复核记录；静态边不代替玩家实践。' });
}
await save('data/base/knowledge_graph/nodes.json', nodes);
await save('data/base/knowledge_graph/edges.json', edges);
const shopPath = new URL('data/base/shops/round-06-shops.json', root);
const shopSource = await readFile(shopPath, 'utf8');
const updatedShop = shopSource.replace(/("itemId": "item.qingtong-bijian",\s*"quantity": )-?\d+/, '$1-1');
if (updatedShop === shopSource && !JSON.parse(shopSource).shops[0].stock.some(s => s.itemId === 'item.qingtong-bijian' && s.quantity === -1)) {
  throw new Error('商店基础兵刃库存锚点缺失');
}
await writeFile(shopPath, updatedShop);
console.log('Round104两项制作差事、行动Schema、2实践节点/边、可补买基础兵刃已同步。');
