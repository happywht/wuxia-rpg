import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {deepenSeaDialogues} from '../scripts/lib/round102-sea-content.mjs';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const set=JSON.parse(readFileSync('data/base/dialogues/round-83-east-coast-conversations.json','utf8'));
const d=set.conversations.find((x:{id:string})=>x.id==='dlg.r83-gu-chaosheng-tide-line');
describe('Round161 repeatable sea supply aftermath',()=>{
 it('is valid and stable after repeated authoring',()=>{
  expect(parseDialogueSet(set).ok).toBe(true);
  expect(deepenSeaDialogues(structuredClone(set))).toEqual(set);
  expect(deepenSeaDialogues(deepenSeaDialogues(structuredClone(set)))).toEqual(set);
 });
 for(const flag of ['shore-aid','keeper-aid'])it(`gates ${flag} guidance on the actual choice without repeating payment`,()=>{
  const id=`r102-echo-${flag}`;
  const option=d.nodes.find((n:{id:string})=>n.id===d.startNodeId).options.find((o:{nextNodeId:string})=>o.nextNodeId===id);
  expect(option.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r102-${flag}`}]);
  expect(option.effects).toBeUndefined();
  const node=d.nodes.find((n:{id:string})=>n.id===id);
  expect(node.effects).toBeUndefined();
  for(const text of ['不用再给','(91,71)','(97,50)','六项差事'])expect(node.text).toContain(text);
 });
 it('preserves the distinct unpaid side rather than promising both sides aid',()=>{
  expect(d.nodes.find((n:{id:string})=>n.id==='r102-echo-shore-aid').text).toContain('还缺急药');
  expect(d.nodes.find((n:{id:string})=>n.id==='r102-echo-keeper-aid').text).toContain('仍等后批');
 });
});
