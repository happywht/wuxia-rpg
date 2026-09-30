import {readFileSync,readdirSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import Ajv from 'ajv';
import {parseEndingSet,assembleEndingSet,evaluateEndings,selectEnding,type EndingEvaluationContext} from '../src/engine/ending-system';
import {parseDialogueSet,type DialogueData} from '../src/engine/dialogue-graph';
import {getVisibleOptions,applyDialogueEffects,type DialogueRuntimeContext} from '../src/engine/dialogue-runtime';
import {parseQuestSet,createQuestJournal,type QuestData} from '../src/engine/quest-system';
import {parseCharacterProfileSet,createCharacterState} from '../src/engine/character-progression';
import {parseItemSet,indexItems,createInventoryState,countItem} from '../src/engine/item-system';
import {createSocialState} from '../src/engine/social-state';
import {createFactionMembershipState} from '../src/engine/faction-system';
import {captureSaveSnapshot,parseSaveSnapshot,restoreRunState} from '../src/engine/save-system';
import {parseGridMap} from '../src/engine/grid-map';
import type {KnowledgeNodeData} from '../src/engine/knowledge-graph';
const root=resolve('data/base'),read=(p:string)=>JSON.parse(readFileSync(join(root,p),'utf8'));
const raw=read('endings/round-27-endings.json');
const parsed=parseEndingSet(raw);if(!parsed.ok)throw Error('endings');
const set={record:parsed.set,gate:parsed.set.gate,endings:parsed.set.endings};
const targets=['ending.r42-open-register','ending.r42-sheltered-witness','ending.open-water'];
it('new extension identifiers share schema and runtime bounds, including the reserved original route',()=>{
 const validate=new Ajv().compile(JSON.parse(readFileSync(resolve('data/schema/ending-set.schema.json'),'utf8')));
 expect(validate(raw)).toBe(true);
 for(const kind of ['route','section','variant'] as const){for(const id of kind==='route'?['original','a'.repeat(97)]:['a'.repeat(97)]){
  const data=structuredClone(raw),ending=data.endings.find((e:{id:string})=>e.id===targets[0])!;
  if(kind==='route')ending.unlockRoutes[0].id=id;
  else if(kind==='section')ending.epilogueSections[0].id=id;
  else ending.epilogueSections[0].variants[0].id=id;
  expect(validate(data)).toBe(false);const p=parseEndingSet(data);expect(p.ok).toBe(true);
  if(p.ok)expect(p.set.endings.some(e=>e.id===targets[0])).toBe(false);
 }}
});
const quests=new Map<string,QuestData>(),dialogues=new Map<string,DialogueData>();
for(const file of readdirSync(join(root,'quests')).filter(f=>f.endsWith('.json'))){const p=parseQuestSet(read('quests/'+file));if(!p.ok)throw Error(file);for(const q of p.set.quests)quests.set(q.id,q);}
for(const file of readdirSync(join(root,'dialogues')).filter(f=>f.endsWith('.json'))){const p=parseDialogueSet(read('dialogues/'+file));if(!p.ok)throw Error(file);for(const d of p.set.conversations)dialogues.set(d.id,d);}
const pp=parseCharacterProfileSet(read('characters/round-04-profiles.json'));if(!pp.ok)throw Error('profile');const profile=pp.set.profiles[0]!;
const itemList=['items/round-06-items.json','items/round-83-east-coast-items.json'].flatMap(path=>{const p=parseItemSet(read(path));if(!p.ok)throw Error(path);return p.set.items;});
const items=indexItems({items:itemList}).byId;
const knowledgeNodes=new Map<string,KnowledgeNodeData>(read('knowledge_graph/nodes.json').nodes.map((n:KnowledgeNodeData)=>[n.id,n]));
const choices=[
 ['dlg.qin-suyan-iron-ridge','r100-record-choice','r100-record-open','r100-record-guard','event.r100-record-open','event.r100-record-guard'],
 ['dlg.luo-jinzi-salt-road','r100-well-choice','r100-well-aid','r100-well-reserve','event.r100-well-aid','event.r100-well-reserve'],
 ['dlg.r92-gu-zhaoxue-vigil','r101-code-choice','r101-code-open','r101-code-limited','event.r101-code-open','event.r101-code-limited'],
 ['dlg.r93-liu-xunjing-rounds','r101-mark-choice','r101-mark-public','r101-mark-private','event.r101-mark-public','event.r101-mark-private'],
 ['dlg.r83-gu-chaosheng-tide-line','r102-supply-choice','r102-shore-aid','r102-keeper-aid','event.r102-shore-aid','event.r102-keeper-aid'],
 ['dlg.r97-ji-wuchao','r102-pilot-choice','r102-pilot-public','r102-pilot-crew','event.r102-pilot-public','event.r102-pilot-crew'],
] as const;
function run(){
 const journal=createQuestJournal(quests);
 // Completed prerequisite fixture, not a new-game or keyboard chapter journey.
 for(const state of journal.states.values())state.status='completed';
 const ctx:DialogueRuntimeContext={quests,journal,items,inventory:createInventoryState(profile,[
  {itemId:'item.huichun-gao',quantity:5},{itemId:'item.qingxin-wan',quantity:4},
  {itemId:'item.r83-sea-salt-ointment',quantity:1},{itemId:'item.r32.clam-shell',quantity:2}]),
  social:createSocialState(),speakerNpcId:'char.qin-suyan',knownKnowledgeNodeIds:new Set(),knowledgeNodes,
  character:createCharacterState(profile),factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.midday'};
 ctx.social.renown=20;return ctx;
}
function choose(ctx:DialogueRuntimeContext,dialogue:string,nodeId:string,target:string){
 const d=dialogues.get(dialogue)!,node=d.nodes.find(n=>n.id===nodeId)!;
 expect(node,nodeId).toBeDefined();
 const option=getVisibleOptions(node,ctx).find(o=>o.option.nextNodeId===target)?.option;
 expect(option,target).toBeDefined();expect(applyDialogueEffects(option!.effects??[],ctx).ok).toBe(true);
}
function closeChapters(ctx:DialogueRuntimeContext){
 for(const [d,target] of [
  ['dlg.r74-shen-yuji-cloud-ridge','r100-paper-check'],['dlg.r74-shen-yuji-cloud-ridge','r100-mainland-close'],
  ['dlg.r93-liu-xunjing-rounds','r101-north-check'],['dlg.r94-shen-wenqiu','r101-north-close'],
  ['dlg.r97-yu-xingcha','r102-sea-crosscheck'],['dlg.r97-yu-xingcha','r102-sea-close'],
 ])choose(ctx,d!,'greet',target!);
}
function evaluation(ctx:DialogueRuntimeContext):EndingEvaluationContext{return {questStatuses:new Map([...ctx.journal.states].map(([id,s])=>[id,s.status])),social:ctx.social,factionMembership:ctx.factionState!.membership,knownKnowledgeNodeIds:ctx.knownKnowledgeNodeIds};}
function snapshot(ctx:DialogueRuntimeContext){return captureSaveSnapshot({displayName:'终章组合',mapResourceId:set.gate.mapResourceId,playerCol:8,playerRow:3,character:ctx.character!,inventory:ctx.inventory!,journal:ctx.journal,social:ctx.social,shopStocks:new Map(),completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:ctx.knownKnowledgeNodeIds,elapsedGameMinutes:10,worldSeed:108});}
const combinations=Array.from({length:64},(_,mask)=>({mask,bits:Array.from({length:6},(_,index)=>(mask>>index)&1)}));
describe('Round108 real choice effects and chapter ending consequences',()=>{
 it.each(combinations)('six decisions mask $mask persist with costs and distinct aftermath',({mask,bits})=>{
  const ctx=run();choices.forEach((row,i)=>{choose(ctx,row[0],row[1],row[2+bits[i]!]!);expect(getVisibleOptions(dialogues.get(row[0])!.nodes.find(n=>n.id===row[1])!,ctx).filter(o=>o.option.effects?.length)).toHaveLength(0);});
  const cost={ointment:5-bits[0]!-Number(bits[1]===0)-bits[2]!-bits[3]!-bits[4]!,qi:4-Number(bits[2]===0)-Number(bits[3]===0)-bits[5]!};
  expect(countItem(ctx.inventory!,'item.huichun-gao')).toBe(cost.ointment);expect(countItem(ctx.inventory!,'item.qingxin-wan')).toBe(cost.qi);
  expect(countItem(ctx.inventory!,'item.r83-sea-salt-ointment')).toBe(bits[4]);expect(countItem(ctx.inventory!,'item.r32.clam-shell')).toBe(bits[5]!*2);
  closeChapters(ctx);const results=evaluateEndings(set,evaluation(ctx));
  expect(results.find(r=>r.ending.id===targets[0])!.available).toBe(bits[0]===0&&bits[2]===0&&bits[5]===0);
  expect(results.find(r=>r.ending.id===targets[1])!.available).toBe(bits[0]===1&&bits[2]===1&&bits[5]===1);
  expect(results.find(r=>r.ending.id===targets[2])!.available).toBe(true);
  const save=snapshot(ctx),decoded=parseSaveSnapshot(JSON.parse(JSON.stringify(save)));expect(decoded.ok).toBe(true);if(!decoded.ok)return;
  const restored=restoreRunState({snapshot:decoded.snapshot,profile,items,quests,shops:new Map()});
  const after=evaluation({...ctx,character:restored.character,inventory:restored.inventory,journal:restored.journal,social:restored.social,knownKnowledgeNodeIds:new Set(restored.knownKnowledgeNodeIds)});
  const afterResults=evaluateEndings(set,after);expect(afterResults).toEqual(results);
  const selected=selectEnding(set,targets[2]!,after);expect(selected.ok).toBe(true);if(!selected.ok)return;
  for(let i=0;i<3;i++){const section=parsed.set.endings.find(e=>e.id===targets[2])!.epilogueSections![i]!;const v=section.variants.find(v=>v.conditions.every(c=>c.kind==='knowledgeKnown'&&ctx.knownKnowledgeNodeIds.has(c.nodeId)))!;expect(v).toBeDefined();expect(selected.ending.epilogue).toContain(v.text);expect(selected.ending.epilogue).not.toContain(section.fallbackText);}
  if(process.env.WUXIA_R108_REPORT==='1'&&(mask===0||mask===63||mask===21))writeFileSync(resolve(`iterations/round-108/choice-${mask}-ending.json`),JSON.stringify({scope:'Real dialogue effects, supplied completed prerequisites and materials; not keyboard travel.',mask,bits,cost,known:[...ctx.knownKnowledgeNodeIds],endings:afterResults.filter(r=>targets.includes(r.ending.id)).map(r=>({id:r.ending.id,available:r.available,routes:r.routes,epilogue:r.resolvedEpilogue}))},null,2)+'\n');
 });
 it('partial choices without closure neither unlock a chapter path nor invent a completed answer',()=>{const ctx=run();choices.forEach(row=>choose(ctx,row[0],row[1],row[2]));const results=evaluateEndings(set,evaluation(ctx));for(const target of targets){const r=results.find(r=>r.ending.id===target)!;expect(r.available).toBe(false);expect(r.routes.at(-1)!.unmetHints.filter(h=>h.includes("结清")).length).toBe(3);expect(r.resolvedEpilogue).toContain('尚未结案');}});
 it('all chapter closes are required, and membership still blocks the free voyage path',()=>{const ctx=run();choices.forEach(row=>choose(ctx,row[0],row[1],row[2]));closeChapters(ctx);ctx.knownKnowledgeNodeIds.delete('event.r102-sea-close');expect(selectEnding(set,targets[0]!,evaluation(ctx)).ok).toBe(false);ctx.knownKnowledgeNodeIds.add('event.r102-sea-close');const e=evaluation(ctx);e.factionMembership={factionId:'faction.tingyu-jiange',masterNpcId:'char.ye-tingzhou'};expect(selectEnding(set,targets[2]!,e).ok).toBe(false);});
 it('legacy R42 and old-footprint paths stay available without added chapter prerequisites',()=>{const ctx=run();for(const flag of ['event.r42-public-record-vow','event.r42-protected-witness-vow','event.old-footprints'])ctx.knownKnowledgeNodeIds.add(flag);for(const id of targets){const result=selectEnding(set,id,evaluation(ctx));expect(result.ok).toBe(true);if(result.ok){expect(result.ending.epilogue.startsWith(parsed.set.endings.find(e=>e.id===id)!.epilogue)).toBe(true);expect(result.ending.epilogue).toContain('尚未结案');}}});
 it('malformed optional sections isolate only that ending, including duplicate and closed-schema keys',()=>{for(const bad of [[],[{id:'x',title:'X',fallbackText:'none',variants:[]}],[{id:'x',title:'X',fallbackText:'none',variants:[{id:'v',text:'text',conditions:[{kind:'knowledgeKnown',nodeId:'event.old-footprints',hint:'x'}],unexpected:true}]}]]){const data=structuredClone(raw);data.endings[0].epilogueSections=bad;const p=parseEndingSet(data);expect(p.ok).toBe(true);if(p.ok){expect(p.set.endings).toHaveLength(6);expect(p.warnings.length).toBeGreaterThan(0);}}});
 it('bad references in unlock paths and aftermath isolate the owning ending at assembly',()=>{const map=parseGridMap(read('maps/round-10-mist-ferry.json'));if(!map.ok)throw Error('map');for(const field of ['unlockRoutes','epilogueSections'] as const){const data=structuredClone(parsed.set);const ending=data.endings.find(e=>e.id===targets[0])!;const conditions=field==='unlockRoutes'?ending.unlockRoutes![0]!.conditions:ending.epilogueSections![0]!.variants[0]!.conditions;conditions.push({kind:'knowledgeKnown',nodeId:'event.does-not-exist',hint:'bad'});const result=assembleEndingSet({set:data,maps:new Map([[map.map.data.id,map.map]]),blockedCells:new Map(),knowledgeNodes,questIds:new Set(quests.keys()),npcIds:new Set(['char.lu-zhenniang','char.ye-tingzhou','char.shi-bei','char.wen-suxin']),factionIds:new Set(['faction.tingyu-jiange','faction.tiezhang-pai','faction.yunyin-shanzhuang'])});expect(result.endingSet?.endings).toHaveLength(6);expect(result.warnings.some(w=>w.includes('does-not-exist'))).toBe(true);}});
 it('the authoring source replays twice without changing unrelated seven original records',()=>{const dir=resolve(mkdtempSync(join(tmpdir(),'wuxia-r108-')));expect(dir.startsWith(resolve(tmpdir())+sep)).toBe(true);try{mkdirSync(join(dir,'data/base/endings'),{recursive:true});cpSync(join(root,'endings/round-27-endings.json'),join(dir,'data/base/endings/round-27-endings.json'));for(let n=0;n<2;n++)execFileSync(process.execPath,[resolve('scripts/deepen-round108-endings.mjs')],{cwd:dir});expect(readFileSync(join(dir,'data/base/endings/round-27-endings.json'),'utf8')).toBe(readFileSync(join(root,'endings/round-27-endings.json'),'utf8'));}finally{expect(dir.startsWith(resolve(tmpdir())+sep)).toBe(true);rmSync(dir,{recursive:true,force:true});}});
});
