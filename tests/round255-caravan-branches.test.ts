import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { parseKnowledgeEdgeSet, parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { acceptQuest, applyQuestSignal, createQuestJournal, parseQuestSet } from '../src/engine/quest-system';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const parsedQuests = parseQuestSet(read('data/base/quests/round-07-quests.json'));
const parsedDialogues = parseDialogueSet(read('data/base/dialogues/round-30-conversations.json'));
const parsedNodes = parseKnowledgeNodeSet(read('data/base/knowledge_graph/nodes.json'));
const parsedEdges = parseKnowledgeEdgeSet(read('data/base/knowledge_graph/edges.json'));
if (!parsedQuests.ok) throw new Error(parsedQuests.errors.join('\n'));
const questSet = parsedQuests.set;
if (!parsedDialogues.ok) throw new Error(parsedDialogues.errors.join('\n'));
if (!parsedNodes.ok) throw new Error(parsedNodes.errors.join('\n'));
if (!parsedEdges.ok) throw new Error(parsedEdges.errors.join('\n'));

const ids = {
  provision: 'quest.r31-caravan-provisioning', guard: 'quest.r31-guard-the-caravan',
  pier: 'quest.r31-mend-the-pier', gratitude: 'quest.r31-caravan-gratitude', toll: 'quest.r31-pier-toll-clearing',
  escorted: 'event.r31-caravan-escorted', reinforced: 'event.r31-pier-reinforced',
};

function readyJournal() {
  const quests = new Map(questSet.quests.map((quest) => [quest.id, quest]));
  const journal = createQuestJournal(quests);
  for (const id of ['quest.r31-herbal-stocktaking', 'quest.r31-mist-shore-watch']) {
    journal.states.get(id)!.status = 'completed';
  }
  journal.states.get(ids.provision)!.status = 'completed';
  journal.states.get(ids.guard)!.status = 'offered';
  journal.states.get(ids.pier)!.status = 'offered';
  return { quests, journal };
}

describe('Round255 药队路线后果', () => {
  it('护送胜利只留下护送见闻并开放答谢；败北不留下成功记录', () => {
    const { quests, journal } = readyJournal();
    const accepted = acceptQuest(quests, journal, ids.guard);
    expect(accepted.ok && accepted.update.failedQuestIds).toContain(ids.pier);
    const failed = journal.states.get(ids.guard)!;
    expect(applyQuestSignal(quests, journal, { type: 'encounter-defeat', encounterId: 'encounter.ferry-reed-ambush' }).failedQuestIds)
      .toContain(ids.guard);
    expect(failed.status).toBe('failed');
    expect(applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId: 'encounter.ferry-reed-ambush' }).completed)
      .toHaveLength(0);
    expect(journal.states.get(ids.gratitude)?.status).toBe('locked');

    const success = readyJournal();
    acceptQuest(success.quests, success.journal, ids.guard);
    const win = applyQuestSignal(success.quests, success.journal, { type: 'encounter-victory', encounterId: 'encounter.ferry-reed-ambush' });
    expect(win.completed.find((entry) => entry.questId === ids.guard)?.discoverKnowledgeNodeIds).toEqual([ids.escorted]);
    expect(success.journal.states.get(ids.gratitude)?.status).toBe('offered');
    expect(success.journal.states.get(ids.toll)?.status).toBe('locked');
  });

  it('修桥材料完成只留下加固见闻并开放通渡；护送路线保持封止', () => {
    const { quests, journal } = readyJournal();
    const accepted = acceptQuest(quests, journal, ids.pier);
    expect(accepted.ok && accepted.update.failedQuestIds).toContain(ids.guard);
    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.iron-sand', quantity: 3 });
    const finish = applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.tough-leather', quantity: 2 });
    expect(finish.completed.find((entry) => entry.questId === ids.pier)?.discoverKnowledgeNodeIds).toEqual([ids.reinforced]);
    expect(journal.states.get(ids.toll)?.status).toBe('offered');
    expect(journal.states.get(ids.gratitude)?.status).toBe('locked');
  });

  it('知识图谱与渡董对白只为各自路线提供独立回应', () => {
    const conversation = parsedDialogues.set.conversations.find((entry) => entry.id === 'dlg.bai-luzhou-ferry-master')!;
    const greet = conversation.nodes.find((node) => node.id === 'greet')!;
    const escortedChoice = greet.options?.find((option) => option.nextNodeId === 'r31-caravan-escorted');
    const pierChoice = greet.options?.find((option) => option.nextNodeId === 'r31-pier-reinforced');
    expect(escortedChoice?.conditions).toEqual([{ kind: 'knowledgeKnown', nodeId: ids.escorted }]);
    expect(pierChoice?.conditions).toEqual([{ kind: 'knowledgeKnown', nodeId: ids.reinforced }]);
    expect(parsedNodes.data.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([ids.escorted, ids.reinforced]));
    expect(parsedEdges.data.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromId: ids.guard, toId: ids.escorted, relation: 'rewards' }),
      expect.objectContaining({ fromId: ids.pier, toId: ids.reinforced, relation: 'rewards' }),
    ]));
  });
});
