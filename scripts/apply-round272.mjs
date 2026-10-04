import { readFileSync, writeFileSync } from 'node:fs';
import { repairDialogueFacts, repairQuestFacts, repairWatchPrerequisite, repairWatchEdge, repairProwler } from './lib/round272-journey-facts.mjs';
const paths = [
  [new URL('../data/base/dialogues/round-03-conversations.json', import.meta.url), repairDialogueFacts],
  [new URL('../data/base/quests/round-07-quests.json', import.meta.url), raw => repairWatchPrerequisite(repairQuestFacts(raw))],
  [new URL('../data/base/knowledge_graph/edges.json', import.meta.url), repairWatchEdge],
  [new URL('../data/base/battles/round-05-encounters.json', import.meta.url), repairProwler]
];
// Prepare every output before the first write; drift in any document refuses all edits.
const changes = paths.map(([url, repair]) => { const raw = readFileSync(url, 'utf8'); return { url, raw, next: repair(raw) }; });
for (const change of changes) if (change.raw !== change.next) writeFileSync(change.url, change.next);
console.log('Round272: 补给/药方三处事实同步，巡岸问药后并行，探子攻击循环可读，封箱双成果门槛保留；不改奖励、费用、失败规则或旧档协议。');
