import { readFileSync, writeFileSync } from 'node:fs';
import {
  R271_DELIVERY_EXPECTATION,
  repairDialoguesRaw,
  repairKnowledgeGraph,
  repairQuestsRaw,
} from './lib/round271-journey-delivery.mjs';
// Resolve against this script so the runner works from any cwd; preflight
// every repair (including the post-write self-check) before files are written.

const questUrl = new URL('../data/base/quests/round-07-quests.json', import.meta.url);
const dialogueUrl = new URL('../data/base/dialogues/round-03-conversations.json', import.meta.url);
const nodesUrl = new URL('../data/base/knowledge_graph/nodes.json', import.meta.url);
const edgesUrl = new URL('../data/base/knowledge_graph/edges.json', import.meta.url);

const questRaw = readFileSync(questUrl, 'utf8');
const dialogueRaw = readFileSync(dialogueUrl, 'utf8');
const nodesRaw = readFileSync(nodesUrl, 'utf8');
const edgesRaw = readFileSync(edgesUrl, 'utf8');

const questNext = repairQuestsRaw(questRaw);
const dialogueNext = repairDialoguesRaw(dialogueRaw);
const nodesDoc = JSON.parse(nodesRaw);
const edgesDoc = JSON.parse(edgesRaw);
repairKnowledgeGraph(nodesDoc, edgesDoc);
// Machine-shaped knowledge-graph files ship with CRLF endings (matches the
// deepen-round103/104 writers).
const graphNext = (doc) => JSON.stringify(doc, null, 2).replace(/\n/g, '\r\n') + '\r\n';
const nodesNext = graphNext(nodesDoc);
const edgesNext = graphNext(edgesDoc);

// Post-write self-check: outputs parse and expose the R271 shape before any
// byte is committed; a refused repair throws above leaving data untouched.
const questCheck = JSON.parse(questNext);
for (const questId of R271_DELIVERY_EXPECTATION.deliveryQuestIds) {
  const quest = questCheck.quests.find((entry) => entry.id === questId);
  if (!quest?.orderedObjectives) throw new Error(`round271 自检失败：${questId} 未加有序交付目标`);
  if (quest.objectives.at(-1).kind !== 'discoverKnowledge' || !quest.objectives.at(-1).navigationNpcId) {
    throw new Error(`round271 自检失败：${questId} 末目标不是带回导NPC的交付见闻`);
  }
}
const dialogueCheck = JSON.parse(dialogueNext);
const nodeCheck = JSON.parse(nodesNext);
const edgeCheck = JSON.parse(edgesNext);
for (const nodeId of R271_DELIVERY_EXPECTATION.eventNodeIds) {
  if (!nodeCheck.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`round271 自检失败：缺少见闻节点 ${nodeId}`);
  }
}
for (const edgeId of R271_DELIVERY_EXPECTATION.edgeIds) {
  if (!edgeCheck.edges.some((edge) => edge.id === edgeId)) {
    throw new Error(`round271 自检失败：缺少见闻边 ${edgeId}`);
  }
}
if (questNext.includes('按I打开背包') || dialogueNext.includes('按I打开背包')) {
  throw new Error('round271 自检失败：仍残留按I打开背包的旧制作指导');
}
for (const [url, raw, next] of [
  [questUrl, questRaw, questNext],
  [dialogueUrl, dialogueRaw, dialogueNext],
  [nodesUrl, nodesRaw, nodesNext],
  [edgesUrl, edgesRaw, edgesNext],
]) {
  if (raw !== next) writeFileSync(url, next);
}
console.log('Round271：巷口送药与茶棚凉汤改为有序备料→当面交付（F交谈、原子takeItem+交付见闻、一次性酬偿+关系3），制作指导改按B打开背包；稳定任务ID、收集目标文本与既有奖励不变。');
