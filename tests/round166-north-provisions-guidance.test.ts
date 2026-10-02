import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {parseDialogueSet} from '../src/engine/dialogue-graph';
const read=(p:string)=>JSON.parse(readFileSync('data/base/'+p,'utf8'));
const set=read('dialogues/round-92-north-pass-conversations.json');
const talk=set.conversations.find((d:{id:string})=>d.id==='dlg.r92-gu-zhaoxue-vigil');
const guide=talk.nodes.find((n:{id:string})=>n.id==='r166-provisions-budget');
describe('Round166 north decision supplies guidance',()=>{
 it('parses and exposes a repeatable unconditional read-only entry',()=>{expect(parseDialogueSet(set).ok).toBe(true);const entry=talk.nodes.find((n:{id:string})=>n.id==='greet').options.find((o:{nextNodeId:string})=>o.nextNodeId===guide.id);expect(entry).toBeDefined();expect(entry.conditions).toBeUndefined();expect(entry.effects).toBeUndefined();expect(guide.effects).toBeUndefined();expect(guide.options).toBeUndefined();});
 it('explains separate healing and two-decision budget',()=>{for(const text of ['共需2颗','共2份','战斗补气','救伤','不会因复谈补满','仍要亲自核查'])expect(guide.text).toContain(text);});
 it('agrees with actual finite shop and public costs',()=>{const shop=read('shops/round-06-shops.json').shops.find((s:{id:string})=>s.id==='shop.r158-north-provisions');expect(shop.stock).toEqual([{itemId:'item.huichun-gao',quantity:3},{itemId:'item.qingxin-wan',quantity:2}]);const liu=read('dialogues/round-93-snow-pine-valley-conversations.json').conversations.find((d:{id:string})=>d.id==='dlg.r93-liu-xunjing-rounds');for(const [d,id] of [[talk,'r101-code-choice'],[liu,'r101-mark-choice']]){const choice=d.nodes.find((n:{id:string})=>n.id===id);expect(choice.options[0].effects).toContainEqual({kind:'takeItem',itemId:'item.qingxin-wan',quantity:1});expect(choice.options[1].effects).toContainEqual({kind:'takeItem',itemId:'item.huichun-gao',quantity:1});}});
 it('shared author regenerates exactly the same guide and entry',()=>{const output=execFileSync(process.execPath,['--input-type=module','-e',"import {deepenNorthDialogues} from './scripts/lib/round101-north-content.mjs';import {readFileSync} from 'node:fs';const d=JSON.parse(readFileSync('data/base/dialogues/round-92-north-pass-conversations.json','utf8'));deepenNorthDialogues(d);const t=d.conversations.find(x=>x.id==='dlg.r92-gu-zhaoxue-vigil');console.log(JSON.stringify(t.nodes.find(x=>x.id==='r166-provisions-budget')));"],{encoding:'utf8'});expect(JSON.parse(output)).toEqual(guide);});
});
