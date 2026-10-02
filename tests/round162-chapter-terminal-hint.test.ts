import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {deepenSeaDialogues} from '../scripts/lib/round102-sea-content.mjs';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const set=JSON.parse(readFileSync('data/base/dialogues/round-97-lanxin-reef-conversations.json','utf8'));
const d=set.conversations.find((x:{id:string})=>x.id==='dlg.r97-yu-xingcha');
const id='r162-three-chapter-terminal';
describe('Round162 three-chapter terminal handoff',()=>{
 it('requires all three actual closes and makes no effects',()=>{
  const o=d.nodes.find((n:{id:string})=>n.id===d.startNodeId).options.find((o:{nextNodeId:string})=>o.nextNodeId===id);
  expect(o.conditions).toEqual(['r100-mainland','r101-north','r102-sea'].map(x=>({kind:'knowledgeKnown',nodeId:`event.${x}-close`})));
  expect(o.effects).toBeUndefined();expect(d.nodes.find((n:{id:string})=>n.id===id).effects).toBeUndefined();
 });
 it('uses the current terminal gate without claiming every ending is unlocked',()=>{
  const gate=JSON.parse(readFileSync('data/base/endings/round-27-endings.json','utf8')).gate;
  const text=d.nodes.find((n:{id:string})=>n.id===id).text;
  const region=JSON.parse(readFileSync('data/base/world/world-map.json','utf8')).regions.find((r:{mapResourceId:string})=>r.mapResourceId===gate.mapResourceId);
  expect(text).toContain(region.name);expect(text).toContain(gate.name);expect(text).toContain(`(${gate.position.col},${gate.position.row})`);
  for(const value of ['相邻按E','R行旅','不会结束旅程','不等于每种归处都已满足'])expect(text).toContain(value);
 });
 it('stays schema-valid and stable across repeated author transformations',()=>{
  expect(parseDialogueSet(set).ok).toBe(true);
  expect(deepenSeaDialogues(structuredClone(set))).toEqual(set);
  expect(deepenSeaDialogues(deepenSeaDialogues(structuredClone(set)))).toEqual(set);
 });
});
