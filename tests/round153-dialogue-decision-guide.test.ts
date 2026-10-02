import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {buildDialogueDecisionGuideEntries,reachableDialogueDecisions,type QuestGuideInput} from '../src/engine/quest-guide';
import type {DialogueData} from '../src/engine/dialogue-graph';
import {getVisibleOptions,type DialogueRuntimeContext} from '../src/engine/dialogue-runtime';
import {createSocialState} from '../src/engine/social-state';
import {createFactionMembershipState} from '../src/engine/faction-system';
import type {PlacedNpc} from '../src/engine/npc-placement';
import type {WorldMapAssembly} from '../src/engine/world-map';
const context=():DialogueRuntimeContext=>({quests:new Map(),journal:{states:new Map(),trackedQuestId:null},items:new Map(),inventory:null,social:createSocialState(),speakerNpcId:'npc',knownKnowledgeNodeIds:new Set(),knowledgeNodes:new Map(),character:null,factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'morning'});
const graph=():DialogueData=>({id:'dlg',startNodeId:'start',nodes:[{id:'start',text:'入口',options:[{text:'去看看',nextNodeId:'choice'}]},{id:'choice',text:'原始决定全文',confirmEffects:true,options:[{text:'承担声望−2',nextNodeId:'end',effects:[{kind:'adjustRenown',delta:-2}],conditions:[{kind:'knowledgeKnown',nodeId:'settled',isKnown:false}]},{text:'稍后再定',nextNodeId:'start'}]},{id:'end',text:'结束'}]});
const npc:PlacedNpc={record:{id:'npc',name:'测试人',mapResourceId:'map',position:{col:1,row:2},dialogueId:'dlg',shopId:null,questGiver:false,schedule:[]},col:1,row:2};
function input(g=graph(),ctx=context()):QuestGuideInput{return {guide:{worldMap:{} as WorldMapAssembly,currentMapResourceId:'map',baseNpcs:[npc],shops:new Map(),items:new Map(),shopStocks:new Map(),knownKnowledgeNodeIds:ctx.knownKnowledgeNodeIds},quests:new Map(),journal:ctx.journal,access:{},encounters:[],dialogues:new Map([['dlg',g]]),dialogueContextFor:()=>ctx};}
describe('Round153 current dialogue decision guide',()=>{
 it('shows only current effectful choices and preserves authored body and cost',()=>{const rows=buildDialogueDecisionGuideEntries(input());expect(rows).toHaveLength(1);expect(rows[0]!.detail).toContain('原始决定全文');expect(rows[0]!.detail).toContain('承担声望−2');expect(rows[0]!.detail).not.toContain('稍后再定');expect(rows[0]!.destinationId).toBe('region-guide:npc:npc');expect(rows[0]!.detail).toContain('F交谈');});
 it('does not leak hidden entrance nodes',()=>{const g=graph();g.nodes[0]!.options![0]!.conditions=[{kind:'knowledgeKnown',nodeId:'missing'}];expect(reachableDialogueDecisions(g,context())).toEqual([]);});
 it('does not promise paths requiring an earlier effect',()=>{const g=graph();g.nodes[0]!.options![0]!.effects=[{kind:'adjustRenown',delta:1}];expect(reachableDialogueDecisions(g,context())).toEqual([]);});
 it('does not list a settled decision with only plain options remaining',()=>{const c=context();c.knownKnowledgeNodeIds.add('settled');expect(buildDialogueDecisionGuideEntries(input(graph(),c))).toEqual([]);});
 it('requires explicit confirmation flag, not arbitrary reward dialogue',()=>{const g=graph();delete g.nodes[1]!.confirmEffects;expect(reachableDialogueDecisions(g,context())).toEqual([]);});
 it('terminates cycles and deduplicates multiple entry paths',()=>{const g=graph();g.nodes[0]!.options!.push({text:'又一入口',nextNodeId:'choice'});expect(reachableDialogueDecisions(g,context())).toHaveLength(1);});
 it('requires live inputs and respects missing dialogue/NPC and other regions',()=>{const i=input();delete i.dialogues;expect(buildDialogueDecisionGuideEntries(i)).toEqual([]);i.dialogues=new Map();expect(buildDialogueDecisionGuideEntries(i)).toEqual([]);i.dialogues=new Map([['dlg',graph()]]);i.guide.baseNpcs=[];expect(buildDialogueDecisionGuideEntries(i)).toEqual([]);i.guide.baseNpcs=[npc];i.guide.currentMapResourceId='away';expect(buildDialogueDecisionGuideEntries(i)).toEqual([]);});
 it('uses current placement and real companion entry',()=>{const i=input();i.guide.currentMapNpcs=[{...npc,col:9,row:8}];expect(buildDialogueDecisionGuideEntries(i)[0]!.detail).toContain('(9,8)');i.guide.follower={npc,col:7,row:6,mapResourceId:'map'};expect(buildDialogueDecisionGuideEntries(i)[0]!.detail).toContain('(7,6)');expect(buildDialogueDecisionGuideEntries(i)[0]!.detail).toContain('P再T交谈');});
 it('reads actual mainland choice, honours missing medicine and completion gates',()=>{const set=JSON.parse(readFileSync('data/base/dialogues/round-62-conversations.json','utf8'));const g:DialogueData=set.conversations[1];const c=context();c.journal.states.set('quest.r62-post-ledger',{questId:'quest.r62-post-ledger',status:'completed',objectiveCounts:new Map()});const found=reachableDialogueDecisions(g,c);expect(found.map(n=>n.id)).toContain('r100-record-choice');const i=input(g,c);i.dialogues=new Map([['dlg',g]]);const row=buildDialogueDecisionGuideEntries(i)[0]!;expect(row.detail).toContain('公开更次与署名');expect(row.detail).not.toContain('隐去姓名并留回春膏');});
 it('projection changes no journal, relationships, knowledge or graph',()=>{const c=context(),g=graph(),i=input(g,c);const before=JSON.stringify([g,[...c.journal.states],[...c.knownKnowledgeNodeIds],c.social]);buildDialogueDecisionGuideEntries(i);expect(JSON.stringify([g,[...c.journal.states],[...c.knownKnowledgeNodeIds],c.social])).toBe(before);});
});

it('all six real chapter decisions retain two visible costly alternatives when prerequisites and supplies hold',()=>{
 const files=['round-62-conversations','round-67-conversations','round-83-east-coast-conversations','round-92-north-pass-conversations','round-93-snow-pine-valley-conversations','round-97-lanxin-reef-conversations'];
 let checked=0;
 for(const file of files){const set=JSON.parse(readFileSync(`data/base/dialogues/${file}.json`,'utf8')) as {conversations:DialogueData[]};
  for(const g of set.conversations){const decisions=g.nodes.filter(n=>n.confirmEffects);if(!decisions.length)continue;const c=context();
   c.inventory={currency:100,capacity:12,equipped:{},stacks:[{itemId:'item.huichun-gao',quantity:3},{itemId:'item.qingxin-wan',quantity:3},{itemId:'item.r83-sea-salt-balm',quantity:3},{itemId:'item.sea-shell',quantity:10}]};
   const conditions=g.nodes.flatMap(n=>(n.options??[]).flatMap(o=>o.conditions??[]));
   const unsettled=new Set(conditions.filter(x=>x.kind==='knowledgeKnown'&&x.isKnown===false).map(x=>x.kind==='knowledgeKnown'?x.nodeId:''));
   for(const cond of conditions){if(cond.kind==='questStatus'&&cond.status==='completed')c.journal.states.set(cond.questId,{questId:cond.questId,status:'completed',objectiveCounts:new Map()});if(cond.kind==='knowledgeKnown'&&cond.isKnown!==false&&!unsettled.has(cond.nodeId))c.knownKnowledgeNodeIds.add(cond.nodeId);if(cond.kind==='itemCount'&&!c.inventory.stacks.some(s=>s.itemId===cond.itemId))c.inventory.stacks.push({itemId:cond.itemId,quantity:cond.minCount});}
   const reachable=reachableDialogueDecisions(g,c);for(const node of decisions){expect(reachable.map(n=>n.id),file).toContain(node.id);expect(getVisibleOptions(node,c).filter(({option})=>(option.effects?.length??0)>0)).toHaveLength(2);checked++;}
   const before=JSON.stringify([g,[...c.knownKnowledgeNodeIds],c.inventory,[...c.journal.states],c.social]);
   expect(buildDialogueDecisionGuideEntries(input(g,c))).toHaveLength(decisions.length);
   expect(JSON.stringify([g,[...c.knownKnowledgeNodeIds],c.inventory,[...c.journal.states],c.social])).toBe(before);
   for(const id of unsettled)c.knownKnowledgeNodeIds.add(id);
   expect(reachableDialogueDecisions(g,c)).toEqual([]);
  }
 }
 expect(checked).toBe(6);
});
