import { addWeatherPatrol } from '../scripts/lib/round141-weather-dialogue.mjs';
import { addDialogueDrill } from '../scripts/lib/round148-dialogue-drill.mjs';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { relays, people, deepenPeopleConversation } from '../scripts/lib/round105-people-content.mjs';
import { addRelayFollowups, relayFollowups } from '../scripts/lib/round136-relay-followups.mjs';
import { validateConversation, type DialogueData } from '../src/engine/dialogue-graph';
import { getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createSocialState, teachNpcKnowledge } from '../src/engine/social-state';
const load = (id: string): DialogueData => {
  const person = people.find(p => p.dialogueId === id)!;
  return JSON.parse(readFileSync(`data/base/dialogues/${person.file}`, 'utf8')).conversations.find((c: DialogueData) => c.id === id);
};
describe('Round136 remembered branch consequences', () => {
  for (const relay of relays) {
    it(`${relay.key} authored pure nodes preserve unrelated data and repeat exactly`, () => {
      const c = load(relay.targetDialogueId);
      expect(validateConversation(c)).toEqual([]);
      expect(addRelayFollowups(structuredClone(c), relays)).toEqual(c);
      expect(deepenPeopleConversation(structuredClone(c))).toEqual(c);
      const before = structuredClone(c);
      before.nodes = before.nodes.filter(n => !n.id.startsWith('r136-'));
      for (const node of before.nodes) if (node.options) node.options = node.options.filter(o => !o.nextNodeId?.startsWith('r136-'));
      expect(addDialogueDrill(addWeatherPatrol(addRelayFollowups(before, relays)))).toEqual(c);
      for (const [i] of relay.variants.entries()) {
        const node = c.nodes.find(n => n.id === `r136-${relay.key}-followup-${i}`)!;
        expect(node.text).toBe(relayFollowups[relay.key]![i]);
        expect(node).not.toHaveProperty('effects');
        expect(c.nodes[0]!.options!.find(o => o.nextNodeId === node.id)!.effects ?? []).toEqual([]);
      }
    });
    for (const [index, variant] of relay.variants.entries()) {
      it(`${relay.key}/${index} requires all four actual evidence gates`, () => {
        const c = load(relay.targetDialogueId), id = `r136-${relay.key}-followup-${index}`;
        const delivered = `event.r105-${relay.key}-delivered`, message = `event.r105-${relay.key}-message`;
        const own = new Set([delivered, variant.flag]), social = createSocialState();
        teachNpcKnowledge(social, relay.targetNpcId, message);
        teachNpcKnowledge(social, relay.targetNpcId, variant.flag);
        const ctx = { social, speakerNpcId: relay.targetNpcId, knownKnowledgeNodeIds: own } as DialogueRuntimeContext;
        const visible = () => getVisibleOptions({id:'test',text:'test',options:c.nodes[0]!.options!.filter(o=>o.nextNodeId?.startsWith('r136-'))}, ctx).map(o => o.option.nextNodeId);
        expect(visible()).toEqual([id]);
        for (const key of [delivered, variant.flag]) { own.delete(key); expect(visible()).toEqual([]); own.add(key); }
        const memory = social.npcKnowledge.get(relay.targetNpcId)!;
        for (const key of [message, variant.flag]) { memory.delete(key); expect(visible()).toEqual([]); memory.add(key); }
        ctx.speakerNpcId = relay.sourceNpcId;
        expect(visible()).toEqual([]);
      });
    }
  }
  it('never modifies non-recipient dialogues', () => {
    const c = load(relays[0]!.sourceDialogueId), before = structuredClone(c);
    expect(addRelayFollowups(c, relays)).toEqual(before);
  });
});
