// Round 103 incremental runner: deepens the five R43 faction errands with
// ordered field-practice objectives, mentor/verifier dialogue feedback and the
// practice-insight knowledge nodes. Idempotent — re-running re-applies the
// same values without touching unrelated bytes (quests/dialogues are patched
// as text; the hand-mixed data files keep their exact formatting). R43 quests
// have no dedicated generator (authored in round-07-quests.json); this script
// is the recorded incremental source on top of that current data.
import { readFile, writeFile } from 'node:fs/promises';
import {
  deepenFactionPracticeKnowledge,
  factionPracticeConfigs,
  patchFactionPracticeDialogues,
  patchFactionPracticeQuests,
} from './lib/round103-faction-practice.mjs';

const base = new URL('../data/base/', import.meta.url);
const readText = async path => readFile(new URL(path, base), 'utf8');
const writeText = async (path, text) => writeFile(new URL(path, base), text);

// JSON sources with mixed hand formatting: text in, text out.
const questPath = 'quests/round-07-quests.json';
await writeText(questPath, patchFactionPracticeQuests(await readText(questPath)));

for (const name of ['round-03-conversations', 'round-30-conversations']) {
  const path = `dialogues/${name}.json`;
  await writeText(path, patchFactionPracticeDialogues(await readText(path)));
}

// Machine-shaped knowledge-graph files go through parse/upsert/stringify,
// written back with the CRLF endings these files ship with.
const nodesRaw = await readText('knowledge_graph/nodes.json');
const nodes = JSON.parse(nodesRaw);
const edgesRaw = await readText('knowledge_graph/edges.json');
const edges = JSON.parse(edgesRaw);
deepenFactionPracticeKnowledge(nodes, edges);
// Keep an already applied file byte-identical, including its original EOL.
const serialize = (raw, value) => {
  if (JSON.stringify(JSON.parse(raw)) === JSON.stringify(value)) return raw;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return (JSON.stringify(value, null, 2) + '\n').replace(/\n/g, eol);
};
await writeText('knowledge_graph/nodes.json', serialize(nodesRaw, nodes));
await writeText('knowledge_graph/edges.json', serialize(edgesRaw, edges));

console.log(`Round103：${factionPracticeConfigs.length} 门派差事加有序地区实践与复命、师傅状态反馈与转抄、修习提示；实践见闻+声望5；地图/任务ID与原经验银两不变。`);

// Post-write self-check: every touched file must still parse, and the five
// quests must expose the deepened shape before the runner reports success.
for (const path of [questPath, 'dialogues/round-03-conversations.json', 'dialogues/round-30-conversations.json',
  'knowledge_graph/nodes.json', 'knowledge_graph/edges.json']) {
  JSON.parse(await readText(path));
}
const questSet = JSON.parse(await readText(questPath));
for (const config of factionPracticeConfigs) {
  const quest = questSet.quests.find(entry => entry.id === config.questId);
  if (!quest?.orderedObjectives) throw new Error(`round103 自检失败：${config.questId} 未加有序目标`);
  if (quest.rewards.factionRenown?.length !== 1 || quest.rewards.discoverKnowledgeNodeIds?.length !== 2) {
    throw new Error(`round103 自检失败：${config.questId} 奖励形状不对`);
  }
  if (quest.objectives[quest.objectives.length - 1].targetId !== config.mentorCharId) {
    throw new Error(`round103 自检失败：${config.questId} 末目标不是回师傅复命`);
  }
}
