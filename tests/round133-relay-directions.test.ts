import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { people, relays, relayWaitingDirections, deepenPeopleConversation } from '../scripts/lib/round105-people-content.mjs';
import { applyRelayWaitingDirections } from '../scripts/lib/round133-relay-directions.mjs';
import type { DialogueData } from '../src/engine/dialogue-graph';
const load=(id:string):DialogueData=>{const person=people.find(p=>p.dialogueId===id)!;return JSON.parse(readFileSync(`data/base/dialogues/${person.file}`,'utf8')).conversations.find((c:DialogueData)=>c.id===id);};
describe('Round133 authored relay waiting directions',()=>{
 for(const relay of relays){
  it(`${relay.key} preserves waiting gates and has no effects`,()=>{
   const c=load(relay.sourceDialogueId),id=`r105-${relay.key}-waiting`,node=c.nodes.find(n=>n.id===id)!;
   expect(node.text).toBe(relayWaitingDirections[relay.key]);expect(node.text).toContain(relay.key==='ledger'?'聂栖雁':relay.key==='carving'?'柳寻径':'季无潮');
   expect(node).not.toHaveProperty('effects');
   const option=c.nodes.find(n=>n.id==='greet')!.options!.find(o=>o.nextNodeId===id)!;
   expect(option.effects??[]).toEqual([]);expect(option.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-message`},{kind:'knowledgeKnown',nodeId:`event.r105-${relay.key}-delivered`,isKnown:false}]);
  });
  it(`${relay.key} regenerates the same waiting text and remains idempotent`,()=>{
   const c=load(relay.sourceDialogueId),id=`r105-${relay.key}-waiting`;
   deepenPeopleConversation(c);expect(c.nodes.find(n=>n.id===id)!.text).toBe(relayWaitingDirections[relay.key]);
   const once=structuredClone(c);deepenPeopleConversation(c);expect(c).toEqual(once);
  });
 }
 it('raw author preserves every unrelated field and formatting on repeat',()=>{
  for(const relay of relays){const person=people.find(p=>p.dialogueId===relay.sourceDialogueId)!;const raw=readFileSync(`data/base/dialogues/${person.file}`,'utf8');expect(applyRelayWaitingDirections(raw)).toBe(raw);const before=JSON.parse(raw);const node=before.conversations.find((c:DialogueData)=>c.id===relay.sourceDialogueId).nodes.find((n:{id:string})=>n.id===`r105-${relay.key}-waiting`);node.text='旧待送说明';const input=JSON.stringify(before,null,2);const result=applyRelayWaitingDirections(input);const expected=structuredClone(before);expected.conversations.find((c:DialogueData)=>c.id===relay.sourceDialogueId).nodes.find((n:{id:string})=>n.id===node.id).text=relayWaitingDirections[relay.key];expect(JSON.parse(result)).toEqual(expected);expect(applyRelayWaitingDirections(result)).toBe(result);}
 });
 it('sea directions distinguish unlocked fare service from first exploration',()=>{
  expect(relayWaitingDirections['road-sea']).toContain('未探索时从云岭东口先走陆路');
  expect(relayWaitingDirections['road-sea']).toContain('风回岛');expect(relayWaitingDirections['road-sea']).toContain('他回应前仍是待送');
 });
});

