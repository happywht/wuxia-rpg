import { readFileSync, writeFileSync } from 'node:fs';
import {
  R273_PIER_DELIVERY_EXPECTATION,
  repairDialogueSchemaRaw,
  repairDialoguesRaw,
  repairKnowledgeGraph,
  repairQuestsRaw,
} from './lib/round273-pier-delivery.mjs';
// Resolve against this script so the runner works from any cwd; preflight
// every repair (including the post-write self-check) before files are written.

const paths = {
  quests: '../data/base/quests/round-07-quests.json',
  dialogues: '../data/base/dialogues/round-30-conversations.json',
  nodes: '../data/base/knowledge_graph/nodes.json',
  edges: '../data/base/knowledge_graph/edges.json',
  schema: '../data/schema/dialogue-set.schema.json',
};
const raw = {};
for (const [key, path] of Object.entries(paths)) raw[key] = readFileSync(new URL(path, import.meta.url), 'utf8');

const questNext = repairQuestsRaw(raw.quests);
const dialogueNext = repairDialoguesRaw(raw.dialogues);
const schemaNext = repairDialogueSchemaRaw(raw.schema);
const nodesDoc = JSON.parse(raw.nodes);
const edgesDoc = JSON.parse(raw.edges);
repairKnowledgeGraph(nodesDoc, edgesDoc);
// Machine-shaped knowledge-graph files ship with CRLF endings (matches the
// deepen-round103/104 and round271 writers).
const graphNext = (doc) => JSON.stringify(doc, null, 2).replace(/\n/g, '\r\n') + '\r\n';
const nodesNext = graphNext(nodesDoc);
const edgesNext = graphNext(edgesDoc);

// Post-write self-check: outputs parse and expose the R273 shape before any
// byte is committed; a refused repair throws above leaving data untouched.
const questCheck = JSON.parse(questNext);
const pier = questCheck.quests.find((entry) => entry.id === R273_PIER_DELIVERY_EXPECTATION.questId);
if (!pier?.orderedObjectives) throw new Error('round273 自检失败：修桥差事未加有序交付目标');
if (pier.objectives.at(-1).targetId !== R273_PIER_DELIVERY_EXPECTATION.eventId ||
    pier.objectives.at(-1).navigationNpcId !== 'char.bai-luzhou') {
  throw new Error('round273 自检失败：修桥末目标不是带回导NPC的交付见闻');
}
const dialogueCheck = JSON.parse(dialogueNext);
const conversation = dialogueCheck.conversations.find((entry) => entry.id === R273_PIER_DELIVERY_EXPECTATION.conversationId);
const confirmNode = conversation?.nodes.find((node) => node.id === R273_PIER_DELIVERY_EXPECTATION.confirmNodeId);
if (!confirmNode?.confirmEffects) throw new Error('round273 自检失败：交付确认节点未开二次确认');
const commitOption = confirmNode.options.find((option) => option.nextNodeId === 'r273-pier-delivered');
const kinds = commitOption?.effects.map((effect) => effect.kind);
if (JSON.stringify(kinds) !== JSON.stringify(['takeItem', 'takeItem', 'advanceTime', 'discoverKnowledgeNode'])) {
  throw new Error('round273 自检失败：动工效果序列形状不对');
}
const minutes = commitOption.effects.find((effect) => effect.kind === 'advanceTime')?.minutes;
if (minutes !== R273_PIER_DELIVERY_EXPECTATION.constructionMinutes) {
  throw new Error('round273 自检失败：工期分钟数不对');
}
const schemaCheck = JSON.parse(schemaNext);
const schemaKinds = schemaCheck.definitions.effect.oneOf
  .map((entry) => entry.properties?.kind?.const)
  .filter((kind) => kind !== undefined);
if (!schemaKinds.includes('advanceTime')) throw new Error('round273 自检失败：Schema 缺少 advanceTime 效果');

for (const [key, path] of Object.entries(paths)) {
  const next = { quests: questNext, dialogues: dialogueNext, nodes: nodesNext, edges: edgesNext, schema: schemaNext }[key];
  if (raw[key] !== next) writeFileSync(new URL(path, import.meta.url), next);
}
console.log('Round273：先修栈桥改为有序备料→按F当面交料并确认动工（原子扣熟铁砂×3、韧皮×2，通用advanceTime事务内推进两日工期），交付见闻复用稳定r31-pier-reinforced并更新图谱事实；新增通用advanceTime对白效果Schema；稳定任务ID/奖励/互斥组/后续不变。');
