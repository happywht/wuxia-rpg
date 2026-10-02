import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { parseQuestSet,createQuestJournal,acceptQuest,applyQuestSignal,reconcileQuestFacts,resetFutureOrderedObjectiveCounts,type QuestData } from '../src/engine/quest-system';
import { parseDialogueSet,type DialogueData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects,getVisibleOptions,assembleDialogueReferences,type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { parseCharacterProfileSet,createCharacterState,grantExperience,parseMartialArtSet } from '../src/engine/character-progression';
import { parseItemSet,indexItems,createInventoryState,countItem } from '../src/engine/item-system';
import { createSocialState,getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { captureSaveSnapshot,parseSaveSnapshot,planSnapshotRestore,restoreRunState } from '../src/engine/save-system';
import { parseGridMap } from '../src/engine/grid-map';
import { findGridPathToAdjacentCell } from '../src/engine/grid-path';
import { parseBattleEncounterSet,CombatSession } from '../src/engine/turn-based-combat';
import { regionEventConditionsMet,type RegionEventData } from '../src/engine/world-map';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
const read=(p:string)=>JSON.parse(readFileSync(new URL('../data/base/'+p,import.meta.url),'utf8'));
const names=['round-91-cloud-north-terrace','round-92-north-pass','round-93-snow-pine-valley','round-94-frontiers'];
const GU='char.r92-gu-zhaoxue',NIE='char.r91-nie-qiyan',LIU='char.r93-liu-xunjing',SHEN='char.r94-shen-wenqiu';
const BEACON='quest.r92-snow-beacon',ENEMY='encounter.r101-beacon-raider';
const DG='dlg.r92-gu-zhaoxue-vigil',DL='dlg.r93-liu-xunjing-rounds',DN='dlg.r91-nie-qiyan-vigil',DS='dlg.r94-shen-wenqiu';
function run(){
 const p=parseCharacterProfileSet(read('characters/round-04-profiles.json'));if(!p.ok)throw Error(p.errors.join());const profile=p.set.profiles[0]!;
 const itemsParsed=parseItemSet(read('items/round-06-items.json'));if(!itemsParsed.ok)throw Error(itemsParsed.errors.join());const items=indexItems(itemsParsed.set).byId;
 const quests=new Map<string,QuestData>(),dialogues=new Map<string,DialogueData>(),npcIds=new Set<string>();
 for(const name of names){const q=parseQuestSet(read('quests/'+name+'-quests.json')),d=parseDialogueSet(read('dialogues/'+name+'-conversations.json'));if(!q.ok||!d.ok)throw Error('北境资料解析失败');for(const entry of q.set.quests)quests.set(entry.id,entry);for(const entry of d.set.conversations)dialogues.set(entry.id,entry);for(const npc of read('characters/'+name+'-npcs.json').npcs)npcIds.add(npc.id);}
 const knowledgeNodes=new Map<string,KnowledgeNodeData>(read('knowledge_graph/nodes.json').nodes.map((n:KnowledgeNodeData)=>[n.id,n]));
 const arts=parseMartialArtSet(read('skills/round-04-martial-arts.json'));if(!arts.ok)throw Error(arts.errors.join());const martialArts=new Map(arts.set.martialArts.map(a=>[a.id,a]));
 const ctx:DialogueRuntimeContext={quests,journal:createQuestJournal(quests),items,inventory:createInventoryState(profile,[{itemId:'item.huichun-gao',quantity:4},{itemId:'item.qingxin-wan',quantity:4}]),social:createSocialState(),speakerNpcId:GU,knownKnowledgeNodeIds:new Set(),knowledgeNodes,character:createCharacterState(profile),factions:new Map(),martialArts,factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.night'};ctx.social.renown=10;
 return {ctx,profile,dialogues,npcIds};
}
type Run=ReturnType<typeof run>;
const node=(r:Run,d:string,id:string)=>r.dialogues.get(d)!.nodes.find(n=>n.id===id)!;
const visible=(r:Run,d:string,id='greet')=>getVisibleOptions(node(r,d,id),r.ctx);
function choose(r:Run,d:string,id:string,target:string){const v=visible(r,d,id).find(v=>v.option.nextNodeId===target);expect(v).toBeDefined();const result=applyDialogueEffects(v!.option.effects??[],r.ctx);expect(result.ok).toBe(true);}
const complete=(r:Run,id:string)=>{r.ctx.journal.states.get(id)!.status='completed';};
function capture(r:Run){return captureSaveSnapshot({displayName:'北境测试',mapResourceId:'map.round-92-north-pass',playerCol:50,playerRow:97,character:r.ctx.character!,inventory:r.ctx.inventory!,journal:r.ctx.journal,social:r.ctx.social,shopStocks:new Map(),completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:r.ctx.knownKnowledgeNodeIds,elapsedGameMinutes:10,worldSeed:123});}
function refs(r:Run){return {profileIds:new Set([r.profile.id]),profileRecords:new Map([[r.profile.id,r.profile]]),mapResourceId:'map.round-92-north-pass',isWalkableCell:()=>true,isCellOccupied:()=>false,itemIds:new Set(r.ctx.items.keys()),itemRecords:r.ctx.items,martialArtIds:new Set(r.ctx.martialArts.keys()),questIds:new Set(r.ctx.quests.keys()),questObjectiveIds:new Map([...r.ctx.quests].map(([id,q])=>[id,new Set(q.objectives.map(o=>o.id))])),questRecords:r.ctx.quests,encounterIds:new Set([ENEMY]),shopIds:new Set<string>(),npcIds:r.npcIds,knowledgeNodeIds:new Set(r.ctx.knowledgeNodes.keys())};}
describe('Round101 ordered objectives',()=>{
 it('rejects invalid ordered flag and retains legacy parallel default',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!;expect(q.orderedObjectives).toBe(true);expect(parseQuestSet({quests:[{...q,orderedObjectives:'true'}]}).ok).toBe(false);
  const parallel={...q,orderedObjectives:undefined};const quests=new Map([[q.id,parallel]]),journal=createQuestJournal(quests);acceptQuest(quests,journal,q.id);applyQuestSignal(quests,journal,{type:'npc-talk',npcId:GU});expect(journal.states.get(q.id)!.objectiveCounts.get(q.objectives.at(-1)!.id)).toBe(1);
 });
 it('requires arrival, weather discovery, actual victory then a new report; pays once',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!,j=r.ctx.journal;acceptQuest(r.ctx.quests,j,BEACON);
  applyQuestSignal(r.ctx.quests,j,{type:'npc-talk',npcId:GU});expect(j.states.get(BEACON)!.objectiveCounts.get(q.objectives.at(-1)!.id)).toBe(0);
  applyQuestSignal(r.ctx.quests,j,{type:'encounter-victory',encounterId:ENEMY});expect(j.states.get(BEACON)!.objectiveCounts.get('objective.r101-clear-beacon-raider')).toBe(0);
  for(const nodeId of ['place.r92-north-pass','place.r92-snow-beacon'])applyQuestSignal(r.ctx.quests,j,{type:'knowledge-discovery',nodeId});
  expect(applyQuestSignal(r.ctx.quests,j,{type:'npc-talk',npcId:GU}).completed).toEqual([]);
  applyQuestSignal(r.ctx.quests,j,{type:'encounter-victory',encounterId:ENEMY});const result=applyQuestSignal(r.ctx.quests,j,{type:'npc-talk',npcId:GU});expect(result.completed.map(x=>x.questId)).toEqual([BEACON]);expect(result.completed[0]!.currency).toBe(26);expect(applyQuestSignal(r.ctx.quests,j,{type:'npc-talk',npcId:GU}).completed).toEqual([]);
 });
 it('replays already won nonrepeatable encounter when its ordered stage becomes current',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!;acceptQuest(r.ctx.quests,r.ctx.journal,BEACON);const facts={knownKnowledgeNodeIds:new Set(['place.r92-snow-beacon','place.r92-north-pass']),completedEncounterIds:new Set([ENEMY])};
  reconcileQuestFacts(r.ctx.quests,r.ctx.journal,facts);expect(r.ctx.journal.states.get(BEACON)!.objectiveCounts.get('objective.r101-clear-beacon-raider')).toBe(1);expect(r.ctx.journal.states.get(BEACON)!.objectiveCounts.get(q.objectives.at(-1)!.id)).toBe(0);
  expect(applyQuestSignal(r.ctx.quests,r.ctx.journal,{type:'npc-talk',npcId:GU}).completed).toHaveLength(1);
 });
 it('one saved victory cannot satisfy a repeated-kill requirement',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!;q.objectives=[{id:'fight',kind:'defeatEncounter',targetId:ENEMY,requiredCount:2,text:'fight twice'}];r.ctx.journal=createQuestJournal(r.ctx.quests);acceptQuest(r.ctx.quests,r.ctx.journal,BEACON);
  for(let i=0;i<3;i++)reconcileQuestFacts(r.ctx.quests,r.ctx.journal,{completedEncounterIds:new Set([ENEMY])});expect(r.ctx.journal.states.get(BEACON)!.objectiveCounts.get('fight')).toBe(1);expect(r.ctx.journal.states.get(BEACON)!.status).toBe('active');
 });
 it('a single conversation does not satisfy two consecutive talk stages',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!;q.objectives=['first','second'].map(id=>({id,kind:'talkToNpc' as const,targetId:GU,requiredCount:1,text:id}));r.ctx.journal=createQuestJournal(r.ctx.quests);acceptQuest(r.ctx.quests,r.ctx.journal,BEACON);expect(applyQuestSignal(r.ctx.quests,r.ctx.journal,{type:'npc-talk',npcId:GU}).completed).toHaveLength(0);expect(r.ctx.journal.states.get(BEACON)!.objectiveCounts.get('second')).toBe(0);expect(applyQuestSignal(r.ctx.quests,r.ctx.journal,{type:'npc-talk',npcId:GU}).completed).toHaveLength(1);
 });
 it('preflight warns and clears premature old active report, preserves old completed task',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!;acceptQuest(r.ctx.quests,r.ctx.journal,BEACON);const s=r.ctx.journal.states.get(BEACON)!;s.objectiveCounts.set(q.objectives.at(-1)!.id,1);let snapshot=capture(r);const plan=planSnapshotRestore(snapshot,refs(r));expect(plan.ok).toBe(true);if(!plan.ok)return;expect(plan.warnings.some(w=>w.includes('有序阶段'))).toBe(true);
  const restored=restoreRunState({snapshot:plan.snapshot,profile:r.profile,items:r.ctx.items,quests:r.ctx.quests,shops:new Map()});expect(restored.journal.states.get(BEACON)!.objectiveCounts.get(q.objectives.at(-1)!.id)).toBe(0);
  s.status='completed';snapshot=capture(r);const completed=planSnapshotRestore(snapshot,refs(r));expect(completed.ok).toBe(true);if(completed.ok){expect(completed.snapshot.quests.states.find(s=>s.questId===BEACON)!.status).toBe('completed');expect(completed.warnings.some(w=>w.includes('有序阶段'))).toBe(false);}
 });
 it('reset helper leaves current partial stage but clears all later counts',()=>{
  const r=run(),q=r.ctx.quests.get(BEACON)!,s=r.ctx.journal.states.get(BEACON)!;s.status='active';s.objectiveCounts.set(q.objectives[0]!.id,1);s.objectiveCounts.set(q.objectives.at(-1)!.id,1);expect(resetFutureOrderedObjectiveCounts(q,s)).toEqual([q.objectives.at(-1)!.id]);expect(s.objectiveCounts.get(q.objectives[0]!.id)).toBe(1);
 });
});
describe('Round101 choices and records',()=>{
 it('assembles all shipped northern option references without dropping choices',()=>{
  const r=run();const a=assembleDialogueReferences({encounterIds:new Set(read('battles/round-05-encounters.json').encounters.map((e:{id:string})=>e.id)),conversations:r.dialogues,quests:r.ctx.quests,items:r.ctx.items,placedNpcIds:r.npcIds,knowledgeNodeIds:new Set(r.ctx.knowledgeNodes.keys()),factionIds:new Set(),martialArtIds:new Set(r.ctx.martialArts.keys()),timeOfDayPeriodIds:new Set(['period.night']),weatherIds:new Set(read('worldview/climate.json').weathers.map((w:{id:string})=>w.id))});expect(a.warnings).toEqual([]);
 });
 it.each(['open','limited'])('code %s has material/social cost, repeat lock and north-terrace echo',branch=>{
  const r=run();complete(r,BEACON);choose(r,DG,'greet','r101-code-choice');choose(r,DG,'r101-code-choice','r101-code-'+branch);
  expect(countItem(r.ctx.inventory!,branch==='open'?'item.qingxin-wan':'item.huichun-gao')).toBe(3);expect(getRelationship(r.ctx.social,GU)).toBe(branch==='open'?-4:4);expect(getRelationship(r.ctx.social,NIE)).toBe(branch==='open'?3:-3);
  expect(visible(r,DG).some(v=>v.option.nextNodeId==='r101-code-choice')).toBe(false);expect(visible(r,DG,'r101-code-choice').filter(v=>v.option.effects?.length)).toHaveLength(0);expect(visible(r,DN).some(v=>v.option.nextNodeId==='r101-'+branch+'-echo')).toBe(true);
 });
 it.each(['public','private'])('old mark %s is mutually exclusive, paid and heard at other passes',branch=>{
  const r=run();complete(r,'quest.r93-boundary-mark');choose(r,DL,'greet','r101-mark-choice');choose(r,DL,'r101-mark-choice','r101-mark-'+branch);expect(countItem(r.ctx.inventory!,branch==='public'?'item.qingxin-wan':'item.huichun-gao')).toBe(3);expect(getRelationship(r.ctx.social,LIU)).toBe(branch==='public'?-4:4);expect(visible(r,DL).some(v=>v.option.nextNodeId==='r101-mark-choice')).toBe(false);expect(visible(r,DG).some(v=>v.option.nextNodeId==='r101-'+branch+'-echo')).toBe(true);expect(visible(r,DS).some(v=>v.option.nextNodeId==='r101-'+branch+'-echo')).toBe(true);
 });
 it('absent medicines hide paid branches and refusal leaves no flags or social changes',()=>{
  const r=run();r.ctx.inventory!.stacks=[];for(const [d,id]of [[DG,'r101-code-choice'],[DL,'r101-mark-choice']]){expect(visible(r,d!,id!).filter(v=>v.option.effects?.length)).toHaveLength(0);for(const o of node(r,d!,id!).options!.filter(o=>o.effects?.length))expect(applyDialogueEffects(o.effects!,r.ctx).ok).toBe(false);}
  expect(r.ctx.knownKnowledgeNodeIds.size).toBe(0);expect(r.ctx.social.renown).toBe(10);expect(getRelationship(r.ctx.social,GU)).toBe(0);
 });
 it('requires four reports, both decisions and crosscheck for northern stage closure',()=>{
  const r=run();for(const id of ['quest.r91-goose-vigil',BEACON,'quest.r93-boundary-mark'])complete(r,id);choose(r,DL,'greet','r101-north-check');expect(visible(r,DS).some(v=>v.option.nextNodeId==='r101-north-close')).toBe(false);choose(r,DG,'r101-code-choice','r101-code-open');choose(r,DL,'r101-mark-choice','r101-mark-private');complete(r,'quest.r94-snowline-signal');choose(r,DS,'greet','r101-north-close');expect(r.ctx.knownKnowledgeNodeIds.has('event.r101-north-close')).toBe(true);
 });
 it('actual capture/parse/preflight/restore retains costs, both decisions and filtered echoes',()=>{
  const r=run();complete(r,BEACON);complete(r,'quest.r93-boundary-mark');choose(r,DG,'r101-code-choice','r101-code-limited');choose(r,DL,'r101-mark-choice','r101-mark-private');const snap=capture(r),parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snap)));expect(parsed.ok).toBe(true);if(!parsed.ok)return;const plan=planSnapshotRestore(parsed.snapshot,refs(r));expect(plan.ok).toBe(true);if(!plan.ok)return;expect(plan.warnings).toEqual([]);const restored=restoreRunState({snapshot:plan.snapshot,profile:r.profile,items:r.ctx.items,quests:r.ctx.quests,shops:new Map()});r.ctx.inventory=restored.inventory;r.ctx.social=restored.social;r.ctx.journal=restored.journal;r.ctx.knownKnowledgeNodeIds=new Set(restored.knownKnowledgeNodeIds);
  expect(countItem(r.ctx.inventory,'item.huichun-gao')).toBe(2);expect(r.ctx.social.renown).toBe(6);expect(getRelationship(r.ctx.social,SHEN)).toBe(-3);expect(visible(r,DG).some(v=>v.option.nextNodeId==='r101-code-choice')).toBe(false);expect(visible(r,DS).some(v=>v.option.nextNodeId==='r101-private-echo')).toBe(true);
 });
});
describe('Round101 northern runtime facts',()=>{
 it('snow beacon permits only actual snow at dusk/night/midnight',()=>{
  const e=read('world/world-map.json').events.find((e:RegionEventData)=>e.id==='event.r92-snow-beacon');for(const periodId of ['period.morning','period.dusk','period.night','period.midnight'])for(const weatherId of ['weather.snow','weather.clear'])expect(regionEventConditionsMet(e,{knownKnowledgeNodeIds:new Set(),periodId,weatherId})).toBe(weatherId==='weather.snow'&&periodId!=='period.morning');
 });
 it('challenge is reachable and avoids all NPC schedule and fixed event cells',()=>{
  const bp=parseBattleEncounterSet(read('battles/round-05-encounters.json')),mp=parseGridMap(read('maps/round-92-north-pass.json'));expect(bp.ok&&mp.ok).toBe(true);if(!bp.ok||!mp.ok)return;const e=bp.set.encounters.find(e=>e.id===ENEMY)!;expect(e.repeatable).toBe(false);expect(mp.map.canEnter(e.position.col,e.position.row)).toBe(true);expect(findGridPathToAdjacentCell(mp.map,mp.map.playerStart,e.position)).not.toBeNull();
  const npc=read('characters/round-92-north-pass-npcs.json').npcs[0];for(const entry of [{position:npc.position},...npc.schedule])expect(entry.position).not.toEqual(e.position);for(const event of read('world/world-map.json').events.filter((event:RegionEventData)=>event.mapResourceId===e.mapResourceId))expect({col:event.col,row:event.row}).not.toEqual(e.position);
 });
 it('data-driven challenge is winnable by level-five starting arts without a companion',()=>{
  const r=run(),b=parseBattleEncounterSet(read('battles/round-05-encounters.json'));if(!b.ok)throw Error(b.errors.join());grantExperience(r.profile,r.ctx.character!,280);expect(r.ctx.character!.level).toBe(5);const battle=new CombatSession({encounter:b.set.encounters.find(e=>e.id===ENEMY)!,profile:r.profile,player:r.ctx.character!,martialArts:r.ctx.martialArts});let turns=0;while(!battle.isOver&&turns<30){expect(battle.playerUse('skill.jianghu-sanshou').ok).toBe(true);turns++;}expect(battle.finalResult?.outcome).toBe('victory');expect(battle.finalResult?.experienceGained).toBe(48);
 });
});
