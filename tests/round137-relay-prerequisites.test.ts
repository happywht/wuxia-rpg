import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relays, people, relayWaitingDirections } from '../scripts/lib/round105-people-content.mjs';
import type { DialogueData } from '../src/engine/dialogue-graph';
const expected: Record<string, string[]> = {
  ledger: ['雁候差事', '公开署名', '保护姓名'],
  carving: ['界标年代差事', '公开注记', '私记', '若尚未决定', '柳寻径'],
  'road-sea': ['澜心潮簿', '公开传示潮时', '熟船传示', '若尚未决定', '季无潮'],
};
describe('Round137 relay instructions explain actual prerequisite decisions', () => {
  for (const relay of relays) it(`${relay.key} explains every existing decision without changing delivery gates`, () => {
    const sourcePerson = people.find(p => p.dialogueId === relay.sourceDialogueId)!;
    const source: DialogueData = JSON.parse(readFileSync(`data/base/dialogues/${sourcePerson.file}`, 'utf8')).conversations.find((c: DialogueData) => c.id === relay.sourceDialogueId);
    const id = `r105-${relay.key}-waiting`, node = source.nodes.find(n => n.id === id)!;
    expect(node.text).toBe(relayWaitingDirections[relay.key]);
    for (const text of expected[relay.key]!) expect(node.text).toContain(text);
    expect(node.text).not.toContain('她的守更差事');
    const option = source.nodes.find(n => n.id === source.startNodeId)!.options!.find(o => o.nextNodeId === id)!;
    expect(option.effects ?? []).toEqual([]);
    expect(option.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-message`},{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-delivered`,isKnown:false}]);
    const targetPerson = people.find(p => p.dialogueId === relay.targetDialogueId)!;
    const target: DialogueData = JSON.parse(readFileSync(`data/base/dialogues/${targetPerson.file}`, 'utf8')).conversations.find((c: DialogueData) => c.id === relay.targetDialogueId);
    for (const [i, variant] of relay.variants.entries()) {
      const receive = target.nodes.find(n => n.id === target.startNodeId)!.options!.find(o => o.nextNodeId === `r105-${relay.key}-receive-${i}`)!;
      expect(receive.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-message`},{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-delivered`,isKnown:false},{kind:'questStatus',questId:relay.targetQuestId,status:'completed'},{kind:'knowledgeKnown',nodeId:variant.flag}]);
    }
  });
});
