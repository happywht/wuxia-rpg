import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const raw=JSON.parse(readFileSync('data/base/dialogues/round-93-snow-pine-valley-conversations.json','utf8'));
const talk=raw.conversations.find((d:{id:string})=>d.id==='dlg.r93-liu-xunjing-rounds');
describe('Round168 boundary outcome reviews',()=>{
 it('keeps schema and exposes one entry per mutually exclusive fact',()=>{expect(parseDialogueSet(raw).ok).toBe(true);for(const branch of ['public','private']){const id='r168-'+branch+'-review';const entry=talk.nodes[0].options.find((o:{nextNodeId:string})=>o.nextNodeId===id);expect(entry.conditions).toEqual([{kind:'knowledgeKnown',nodeId:'event.r101-mark-'+branch}]);expect(entry.effects).toBeUndefined();}});
 it('reviews never charge, reward or deliver messages',()=>{for(const branch of ['public','private']){const node=talk.nodes.find((n:{id:string})=>n.id==='r168-'+branch+'-review');expect(node.effects).toBeUndefined();expect(node.options).toBeUndefined();expect(node.text).toContain('复谈不再收药或付谢仪');expect(node.text).toContain('还须先听沈雨霁说明再转述');}});
 it('preserves different medicine and public access consequences',()=>{expect(talk.nodes.find((n:{id:string})=>n.id==='r168-public-review').text).toContain('清心丸');expect(talk.nodes.find((n:{id:string})=>n.id==='r168-private-review').text).toContain('回春膏');expect(talk.nodes.find((n:{id:string})=>n.id==='r168-public-review').text).toContain('旧账争执');expect(talk.nodes.find((n:{id:string})=>n.id==='r168-private-review').text).toContain('不便自行核看');});
 it('shared updater stays semantically idempotent on shipped data',()=>{const s=execFileSync(process.execPath,['--input-type=module','-e',"import {readFileSync} from 'node:fs';import {deepenNorthDialogues} from './scripts/lib/round101-north-content.mjs';const d=JSON.parse(readFileSync('data/base/dialogues/round-93-snow-pine-valley-conversations.json','utf8'));deepenNorthDialogues(d);deepenNorthDialogues(d);console.log(JSON.stringify(d));"],{encoding:'utf8'});expect(JSON.parse(s)).toEqual(raw);});
});
