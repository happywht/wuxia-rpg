import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const raw=JSON.parse(readFileSync('data/base/dialogues/round-67-conversations.json','utf8'));
const d=raw.conversations.find((x:{id:string})=>x.id==='dlg.luo-jinzi-salt-road');
const source=readFileSync('scripts/deepen-round100-mainland.mjs','utf8');
describe('Round163 repeatable well-choice aftermath',()=>{
 it('keeps the expanded dialogue parseable',()=>{expect(parseDialogueSet(raw).ok).toBe(true);});
 for(const flag of ['aid','reserve'])it(`shows only the actual ${flag} choice without paying again`,()=>{
  const id=`r163-well-${flag}-followup`;
  const o=d.nodes.find((n:{id:string})=>n.id===d.startNodeId).options.find((o:{nextNodeId:string})=>o.nextNodeId===id);
  expect(o.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r100-well-${flag}`}]);expect(o.effects).toBeUndefined();
  const n=d.nodes.find((n:{id:string})=>n.id===id);expect(n.effects).toBeUndefined();
  for(const text of ['沈雨霁','相邻F','R行旅'])expect(n.text).toContain(text);
  expect(source).toContain(id);expect(source).toContain(n.text);
 });
 it('does not conceal who still lacks medicine',()=>{
  expect(d.nodes.find((n:{id:string})=>n.id==='r163-well-aid-followup').text).toContain('药囊却少了一份');
  expect(d.nodes.find((n:{id:string})=>n.id==='r163-well-reserve-followup').text).toContain('仍等后批');
 });
});
