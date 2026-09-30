import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
const baseline = 'd181dc0fc50e78838df65dfbf240ce26ab6a68ea';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const old = p => JSON.parse(execFileSync('git', ['show', `${baseline}:${p}`], { encoding: 'utf8' }));
const equal = (a, b, label) => { if (!isDeepStrictEqual(a, b)) throw new Error(`无关语义变更 ${label}`); };
const managed = new Set(['quest.r31-herbal-stocktaking', 'quest.r31-blade-quench-stock']);
const qp = 'data/base/quests/round-07-quests.json';
equal(read(qp).quests.map(q => q.id), old(qp).quests.map(q => q.id), '任务集合');
for (const q of old(qp).quests) {
  const current = read(qp).quests.find(c => c.id === q.id);
  if (!managed.has(q.id)) equal(current, q, q.id);
  else { equal(current.objectives[0], q.objectives[0], `${q.id}原目标`); equal(current.rewards.experience, q.rewards.experience, '原经验'); equal(current.rewards.currency, q.rewards.currency, '原银两'); }
}
for (const file of ['round-03-conversations', 'round-30-conversations']) {
  const p = `data/base/dialogues/${file}.json`;
  for (const conversation of old(p).conversations) {
    const current = read(p).conversations.find(c => c.id === conversation.id);
    equal(current.startNodeId, conversation.startNodeId, '对白入口');
    for (const node of conversation.nodes) {
      const after = current.nodes.find(n => n.id === node.id);
      if (node.id !== conversation.startNodeId) equal(after, node, `${conversation.id}/${node.id}`);
      else equal({ ...after, options: after.options?.filter(o => !o.nextNodeId?.startsWith('r104-')) }, node, `${conversation.id}/原选项`);
    }
  }
}
for (const key of ['nodes', 'edges']) {
  const p = `data/base/knowledge_graph/${key}.json`;
  for (const item of old(p)[key]) equal(read(p)[key].find(c => c.id === item.id), item, item.id);
  equal(read(p)[key].length, old(p)[key].length + 2, `图谱${key}`);
}
const sp = 'data/base/shops/round-06-shops.json';
const before = old(sp); before.shops[0].stock.find(s => s.itemId === 'item.qingtong-bijian').quantity = -1;
equal(read(sp), before, '其他店货');
console.log('原65任务/原目标与经验银两、全部既有对白节点与选项、原417节点529边、其他库存均保持；仅两任务/六新对白/2见闻2边/笔剑供货属于本轮资料变更。');
