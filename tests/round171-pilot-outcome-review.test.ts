import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {deepenSeaDialogues} from '../scripts/lib/round102-sea-content.mjs';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const set=JSON.parse(readFileSync('data/base/dialogues/round-97-lanxin-reef-conversations.json','utf8'));
const d=set.conversations.find((x:{id:string})=>x.id==='dlg.r97-ji-wuchao');
describe('Round171 pilot outcome review',()=>{
 it('parses and remains stable under repeated authoring',()=>{expect(parseDialogueSet(set).ok).toBe(true);expect(deepenSeaDialogues(deepenSeaDialogues(structuredClone(set)))).toEqual(set);});
 for(const branch of ['public','crew'])it(`reviews ${branch} only after its actual decision without charging again`,()=>{const id=`r171-pilot-${branch}-review`;const entry=d.nodes[0].options.find((o:{nextNodeId:string})=>o.nextNodeId===id);expect(entry.conditions).toEqual([{kind:'knowledgeKnown',nodeId:`event.r102-pilot-${branch}`}]);expect(entry.effects).toBeUndefined();const node=d.nodes.find((n:{id:string})=>n.id===id);expect(node.effects).toBeUndefined();expect(node.options).toBeUndefined();for(const t of ['不用再交','观汐台灯谱','引航礁虞星槎','不会因复谈更改'])expect(node.text).toContain(t);});
 it('preserves different access and burden without promising automatic navigation',()=>{const pub=d.nodes.find((n:{id:string})=>n.id==='r171-pilot-public-review').text;const crew=d.nodes.find((n:{id:string})=>n.id==='r171-pilot-crew-review').text;expect(pub).toContain('厚蚌壳片2片');expect(pub).toContain('假号客也能照学');expect(crew).toContain('清心丸1份');expect(crew).toContain('陌生散船仍要停下核簿');});
});
