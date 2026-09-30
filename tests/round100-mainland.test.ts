import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet, type DialogueData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, isConditionMet, assembleDialogueReferences, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { parseQuestSet, createQuestJournal, acceptQuest, applyQuestSignal } from '../src/engine/quest-system';
import { createCharacterState, parseCharacterProfileSet } from '../src/engine/character-progression';
import { parseItemSet, indexItems, createInventoryState, countItem } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { captureSaveSnapshot, parseSaveSnapshot, restoreRunState } from '../src/engine/save-system';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
const read = (path:string) => JSON.parse(readFileSync(new URL('../data/base/'+path,import.meta.url),'utf8'));
function runtime() {
 const pp=parseCharacterProfileSet(read('characters/round-04-profiles.json'));if(!pp.ok)throw Error(pp.errors.join());const profile=pp.set.profiles[0]!;
 const ip=parseItemSet(read('items/round-06-items.json'));if(!ip.ok)throw Error(ip.errors.join());const items=indexItems(ip.set).byId;
 const quests=new Map();for(const path of ['quests/round-07-quests.json','quests/round-74-cloud-ridge-quests.json']){const p=parseQuestSet(read(path));if(!p.ok)throw Error(p.errors.join());for(const q of p.set.quests)quests.set(q.id,q);}
 const dialogues=new Map<string,DialogueData>();for(const path of ['dialogues/round-62-conversations.json','dialogues/round-67-conversations.json','dialogues/round-74-cloud-ridge-conversations.json']){const p=parseDialogueSet(read(path));if(!p.ok)throw Error(p.errors.join());for(const d of p.set.conversations)dialogues.set(d.id,d);}
 const knowledgeNodes=new Map<string,KnowledgeNodeData>(read('knowledge_graph/nodes.json').nodes.map((n:KnowledgeNodeData)=>[n.id,n]));
 const ctx:DialogueRuntimeContext={quests,journal:createQuestJournal(quests),items,inventory:createInventoryState(profile,[{itemId:'item.huichun-gao',quantity:2}]),social:createSocialState(),speakerNpcId:'char.qin-suyan',knownKnowledgeNodeIds:new Set(),knowledgeNodes,character:createCharacterState(profile),factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.midday'};
 return {ctx,profile,dialogues};
}
const RIDGE='dlg.qin-suyan-iron-ridge',SALT='dlg.luo-jinzi-salt-road',CLOUD='dlg.r74-shen-yuji-cloud-ridge';
function node(run:ReturnType<typeof runtime>,dialogue:string,id:string){return run.dialogues.get(dialogue)!.nodes.find(n=>n.id===id)!;}
function complete(run:ReturnType<typeof runtime>,id:string){run.ctx.journal.states.get(id)!.status='completed';}
function choose(run:ReturnType<typeof runtime>,dialogue:string,nodeId:string,target:string){const o=getVisibleOptions(node(run,dialogue,nodeId),run.ctx).find(v=>v.option.nextNodeId===target);expect(o).toBeDefined();const result=applyDialogueEffects(o!.option.effects??[],run.ctx);expect(result.ok).toBe(true);return o!.option;}
describe('Round100 mainland decisions',()=>{
 it('negative knowledge condition parses, defaults positive, rejects malformed flag',()=>{
  const run=runtime();expect(isConditionMet({kind:'knowledgeKnown',nodeId:'event.r100-record-settled',isKnown:false},run.ctx)).toBe(true);
  expect(isConditionMet({kind:'knowledgeKnown',nodeId:'event.r100-record-settled'},run.ctx)).toBe(false);
  const raw={conversations:[{id:'test',startNodeId:'a',nodes:[{id:'a',text:'x',options:[{text:'x',nextNodeId:'b',conditions:[{kind:'knowledgeKnown',nodeId:'test',isKnown:'false'}]}]},{id:'b',text:'b'}]}]};const bad=parseDialogueSet(raw);expect(bad.ok).toBe(true);if(bad.ok){expect(bad.set.conversations).toEqual([]);expect(bad.warnings.length).toBeGreaterThan(0);}
 });
 it('all actual choice references assemble without dropped options',()=>{
  const r=runtime();const result=assembleDialogueReferences({conversations:r.dialogues,quests:r.ctx.quests,items:r.ctx.items,placedNpcIds:new Set(['char.shao-changgeng','char.qin-suyan','char.luo-jinzi','char.r74-shen-yuji']),knowledgeNodeIds:new Set(r.ctx.knowledgeNodes.keys()),factionIds:new Set(),martialArtIds:new Set(),timeOfDayPeriodIds:new Set(['period.midday'])});expect(result.warnings).toEqual([]);
 });
 it.each(['open','guard'])('record %s has explicit cost, locks alternate and reaches another NPC',branch=>{
  const r=runtime();r.ctx.social.renown=10;complete(r,'quest.r62-post-ledger');choose(r,RIDGE,'greet','r100-record-choice');choose(r,RIDGE,'r100-record-choice','r100-record-'+branch);
  expect(getRelationship(r.ctx.social,'char.qin-suyan')).toBe(branch==='open'?-4:4);expect(r.ctx.social.renown).toBe(branch==='open'?13:8);
  expect(getVisibleOptions(node(r,RIDGE,'greet'),r.ctx).some(v=>v.option.nextNodeId==='r100-record-choice')).toBe(false);
  expect(getVisibleOptions(node(r,RIDGE,'r100-record-choice'),r.ctx).filter(v=>v.option.effects?.length)).toHaveLength(0);
  const echo=branch==='open'?'r100-open-echo':'r100-guard-echo';expect(getVisibleOptions(node(r,SALT,'greet'),r.ctx).some(v=>v.option.nextNodeId===echo)).toBe(true);
 });
 it.each(['aid','reserve'])('well %s records material or social cost and cloud response',branch=>{
  const r=runtime();r.ctx.social.renown=10;complete(r,'quest.r67-well-waterline');choose(r,SALT,'greet','r100-well-choice');choose(r,SALT,'r100-well-choice','r100-well-'+branch);
  expect(countItem(r.ctx.inventory!,'item.huichun-gao')).toBe(branch==='aid'?1:2);expect(getRelationship(r.ctx.social,'char.luo-jinzi')).toBe(branch==='aid'?4:-4);expect(r.ctx.social.renown).toBe(branch==='aid'?10:8);
  expect(getVisibleOptions(node(r,SALT,'greet'),r.ctx).some(v=>v.option.nextNodeId==='r100-well-choice')).toBe(false);
  expect(getVisibleOptions(node(r,CLOUD,'greet'),r.ctx).some(v=>v.option.nextNodeId==='r100-'+branch+'-echo')).toBe(true);
 });
 it('missing ointment hides aid and effect refusal leaves no partial choice',()=>{
  const r=runtime();r.ctx.inventory!.stacks=[];const choice=node(r,SALT,'r100-well-choice').options![0]!;
  expect(getVisibleOptions(node(r,SALT,'r100-well-choice'),r.ctx).some(v=>v.option===choice)).toBe(false);
  expect(applyDialogueEffects(choice.effects!,r.ctx).ok).toBe(false);expect(r.ctx.knownKnowledgeNodeIds.size).toBe(0);expect(r.ctx.social.morality).toBe(0);expect(getRelationship(r.ctx.social,'char.luo-jinzi')).toBe(0);
 });
 it('normal talk signal completes ledger before choice panel visibility',()=>{
  const r=runtime();complete(r,'quest.r62-north-pass-marks');r.ctx.journal.states.get('quest.r62-post-ledger')!.status='offered';expect(acceptQuest(r.ctx.quests,r.ctx.journal,'quest.r62-post-ledger').ok).toBe(true);
  expect(getVisibleOptions(node(r,RIDGE,'greet'),r.ctx).some(v=>v.option.nextNodeId==='r100-record-choice')).toBe(false);
  applyQuestSignal(r.ctx.quests,r.ctx.journal,{type:'npc-talk',npcId:'char.qin-suyan'});expect(getVisibleOptions(node(r,RIDGE,'greet'),r.ctx).some(v=>v.option.nextNodeId==='r100-record-choice')).toBe(true);
 });
 it('stage answer requires three investigations, closure requires both battles and decisions',()=>{
  const r=runtime();const visible=()=>getVisibleOptions(node(r,CLOUD,'greet'),r.ctx).map(v=>v.option.nextNodeId);
  expect(visible()).not.toContain('r100-paper-check');for(const id of ['quest.r62-post-ledger','quest.r67-well-waterline','quest.r74-cloud-marks'])complete(r,id);expect(visible()).toContain('r100-paper-check');choose(r,CLOUD,'greet','r100-paper-check');expect(visible()).not.toContain('r100-mainland-close');
  choose(r,RIDGE,'r100-record-choice','r100-record-guard');choose(r,SALT,'r100-well-choice','r100-well-aid');for(const id of ['quest.r62-clear-ridge-road','quest.r74-cloud-bridge'])complete(r,id);choose(r,CLOUD,'greet','r100-mainland-close');expect(r.ctx.knownKnowledgeNodeIds.has('event.r100-mainland-close')).toBe(true);
 });
 it('actual capture/parse/restore preserves choices, costs and repeat lock',()=>{
  const r=runtime();r.ctx.social.renown=10;complete(r,'quest.r62-post-ledger');complete(r,'quest.r67-well-waterline');choose(r,RIDGE,'r100-record-choice','r100-record-open');choose(r,SALT,'r100-well-choice','r100-well-aid');
  const snapshot=captureSaveSnapshot({displayName:'round100',mapResourceId:'map.round-62-iron-ridge',playerCol:4,playerRow:7,character:r.ctx.character!,inventory:r.ctx.inventory!,journal:r.ctx.journal,social:r.ctx.social,shopStocks:new Map(),completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:r.ctx.knownKnowledgeNodeIds,elapsedGameMinutes:10,worldSeed:123});const parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));expect(parsed.ok).toBe(true);if(!parsed.ok)return;
  const restored=restoreRunState({snapshot:parsed.snapshot,profile:r.profile,items:r.ctx.items,quests:r.ctx.quests,shops:new Map()});const newCtx={...r.ctx,inventory:restored.inventory,social:restored.social,journal:restored.journal,knownKnowledgeNodeIds:new Set(restored.knownKnowledgeNodeIds)};
  expect(newCtx.knownKnowledgeNodeIds).toEqual(r.ctx.knownKnowledgeNodeIds);expect(countItem(newCtx.inventory,'item.huichun-gao')).toBe(1);expect(newCtx.social.renown).toBe(13);expect(getRelationship(newCtx.social,'char.qin-suyan')).toBe(-4);expect(getVisibleOptions(node(r,RIDGE,'greet'),newCtx).some(v=>v.option.nextNodeId==='r100-record-choice')).toBe(false);
 });
});
