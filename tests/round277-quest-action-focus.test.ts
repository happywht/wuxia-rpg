import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { QuestSessionFeedback, captureQuestAcceptanceStatuses } from '../src/game/quest-feedback';
import { createQuestJournal, acceptQuest } from '../src/engine/quest-system';
import { DialogueSession, type DialogueData, type DialogueEffectData } from '../src/engine/dialogue-graph';
import { type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { loadWorldData, type LoadedWorld } from '../src/game/world-loader';
import { createInventoryState } from '../src/engine/item-system';
import { createCharacterState } from '../src/engine/character-progression';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createSocialState } from '../src/engine/social-state';
import { resolveRegionalGuideDestination, REGION_GUIDE_PREFIX } from '../src/engine/regional-guide';
import { resolveNpcPlacementsForPlayer } from '../src/engine/npc-schedule';
import { GameClock } from '../src/engine/game-calendar';
vi.mock('phaser',()=>({default:{Scene:class{},Math:{Vector2:class{constructor(public x=0,public y=0){}}}}}));
import { GridScene } from '../src/game/grid-scene';
let world:LoadedWorld;
beforeAll(async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=typeof input==='string'?input:input instanceof URL?input.href:input.url;try{return new Response(readFileSync(join(process.cwd(),'data',decodeURIComponent(new URL(u,'http://round277.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}catch{return new Response('missing',{status:404});}});
 const loaded=await loadWorldData();if(!loaded.ok)throw Error(loaded.lines.join());world=loaded.world;
});
afterAll(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const marks='quest.r74-cloud-marks',bridge='quest.r74-cloud-bridge';
const receipt=(questId:string)=>({questId,paidExperience:28,discardedExperience:0,currency:20,cultivation:1,factionRenown:[],discoveredKnowledgeNodeIds:[]});
function fixture(){const journal=createQuestJournal(world.assembly.quests);journal.states.get(marks)!.status='completed';journal.states.get(bridge)!.status='offered';const feedback=new QuestSessionFeedback();feedback.recordCompletion(receipt(marks));return {journal,feedback};}
describe('Round277 latest committed action focus',()=>{
 it('real successful acceptance supersedes completion focus but preserves receipt and once consumption',()=>{const {journal,feedback}=fixture(),before=captureQuestAcceptanceStatuses([{kind:'acceptQuest',questId:bridge}],journal);expect(acceptQuest(world.assembly.quests,journal,bridge).ok).toBe(true);feedback.recordAcceptances(before,journal);expect(feedback.takePendingFocusQuestId()).toBe(bridge);expect(feedback.takePendingFocusQuestId()).toBeNull();expect(feedback.receiptOf(marks)?.currency).toBe(20);expect(feedback.receiptOf(bridge)).toBeUndefined();});
 it('no-effects/ordinary updates never consume or replace a pending focus',()=>{const {journal,feedback}=fixture();feedback.recordAcceptances(captureQuestAcceptanceStatuses([{kind:'adjustRenown',delta:1}],journal),journal);expect(feedback.peekPendingFocusQuestId()).toBe(marks);});
 it('previous active, failed, missing and instant-completed tasks cannot claim a new active focus',()=>{const {journal,feedback}=fixture();journal.states.get(bridge)!.status='active';feedback.recordAcceptances(new Map([[bridge,'active']]),journal);expect(feedback.peekPendingFocusQuestId()).toBe(marks);for(const status of ['failed','completed','locked']as const){journal.states.get(bridge)!.status=status;feedback.recordAcceptances(new Map([[bridge,'offered'],['missing',undefined]]),journal);expect(feedback.peekPendingFocusQuestId()).toBe(marks);}});
 it('subsequent real completion replaces acceptance and remains honest about payment',()=>{const {journal,feedback}=fixture();journal.states.get(bridge)!.status='active';feedback.recordAcceptance(bridge,'active');feedback.recordCompletion(receipt(bridge));expect(feedback.peekPendingFocusQuestId()).toBe(bridge);expect(feedback.receiptOf(bridge)?.paidExperience).toBe(28);feedback.reset();expect(feedback.peekPendingFocusQuestId()).toBeNull();expect(feedback.receiptOf(bridge)).toBeUndefined();});
 it('multiple explicit acceptances preserve effect order, without changing the player tracked task',()=>{const {journal,feedback}=fixture();journal.states.get(bridge)!.status='active';journal.states.get(marks)!.status='active';journal.trackedQuestId=marks;feedback.recordAcceptances(new Map([[marks,'offered'],[bridge,'offered']]),journal);expect(feedback.peekPendingFocusQuestId()).toBe(bridge);expect(journal.trackedQuestId).toBe(marks);});
});
function sceneFixture(effects:DialogueEffectData[]){const {journal,feedback}=fixture();const profile=[...world.assembly.progression.profiles.values()][0]!;
 const context:DialogueRuntimeContext={quests:world.assembly.quests,journal,items:world.assembly.items,inventory:createInventoryState(profile,[]),social:createSocialState(),speakerNpcId:'char.r74-shen-yuji',knownKnowledgeNodeIds:new Set(),knowledgeNodes:world.knowledgeGraph.nodes,knowledgeEdges:world.knowledgeGraph.edges,character:createCharacterState(profile),factions:world.assembly.progression.factions,martialArts:world.assembly.progression.martialArts,factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.midnight'};
 const data:DialogueData={id:'dlg.fixture',startNodeId:'start',nodes:[{id:'start',text:'fixture',options:[{text:'fixture',nextNodeId:'done',effects}]},{id:'done',text:'done'}]};
 const scene=new GridScene();Object.assign(scene,{questFeedback:feedback,questJournal:journal,dialogueContextFor:()=>context,applyQuestUpdate:vi.fn(),syncKnowledgeFromRunFacts:vi.fn(),refreshAchievementUnlocks:()=>[]});
 const internal=scene as unknown as {confirmDialogueOption:(speaker:string,session:DialogueSession,index:number)=>{advanced:boolean};toggleQuestJournal:()=>void};return{context,feedback,internal,session:new DialogueSession(data),scene};
}
describe('Round277 real GridScene transaction integration',()=>{
 it('committed dialogue accept updates pending Q focus',()=>{const x=sceneFixture([{kind:'acceptQuest',questId:bridge}]);expect(x.internal.confirmDialogueOption(x.context.speakerNpcId,x.session,0).advanced).toBe(true);expect(x.context.journal.states.get(bridge)?.status).toBe('active');expect(x.feedback.peekPendingFocusQuestId()).toBe(bridge);expect(x.session.currentNode.id).toBe('done');});
 it('next real Q open receives accepted task focus once, while older receipt remains available',()=>{const x=sceneFixture([{kind:'acceptQuest',questId:bridge}]);x.internal.confirmDialogueOption(x.context.speakerNpcId,x.session,0);let focus:string|undefined;const panel={isOpen:false,open:(model:{focusQuestId?:string})=>{focus=model.focusQuestId;panel.isOpen=true;}};Object.assign(x.scene,{questPanel:panel,quests:x.context.quests,questJournal:x.context.journal,inventory:x.context.inventory,world,progression:world.assembly.progression,factionState:x.context.factionState,placedNpcs:[],playerCol:40,playerRow:43,anyOverlayOpen:()=>false,updateInteractHint:vi.fn()});x.internal.toggleQuestJournal();expect(focus).toBe(bridge);expect(x.feedback.peekPendingFocusQuestId()).toBeNull();expect(x.feedback.receiptOf(marks)?.currency).toBe(20);});
 it('refused later effect leaves quest and old focus unchanged',()=>{const x=sceneFixture([{kind:'acceptQuest',questId:bridge},{kind:'takeItem',itemId:'item.iron-sand',quantity:99}]);expect(x.internal.confirmDialogueOption(x.context.speakerNpcId,x.session,0).advanced).toBe(false);expect(x.context.journal.states.get(bridge)?.status).toBe('offered');expect(x.feedback.peekPendingFocusQuestId()).toBe(marks);expect(x.session.currentNode.id).toBe('start');});
 it('ordinary successful dialogue keeps pending completion, and does not fabricate acceptance',()=>{const x=sceneFixture([{kind:'adjustRenown',delta:1}]);expect(x.internal.confirmDialogueOption(x.context.speakerNpcId,x.session,0).advanced).toBe(true);expect(x.feedback.peekPendingFocusQuestId()).toBe(marks);});
});
describe('Round277 current schedule navigation diagnosis',()=>{
 const mapId='map.round-74-cloud-ridge',npcId='char.r74-shen-yuji';
 it.each([959,960,961])('night/midnight boundary elapsed %d resolves true live 39,43 without advancing clock',elapsed=>{const clock=new GameClock(world.calendar,elapsed),before=clock.elapsedMinutes;const map=world.maps.get(mapId)!;const live=resolveNpcPlacementsForPlayer({baseNpcs:world.assembly.npcs,periodNpcs:world.assembly.npcsByPeriod.get(clock.currentPeriod().id)!,mapResourceId:mapId,map,playerPosition:{col:40,row:43}});const target=resolveRegionalGuideDestination({worldMap:world.worldMap,currentMapResourceId:mapId,baseNpcs:world.assembly.npcs,periodNpcs:world.assembly.npcsByPeriod.get(clock.currentPeriod().id),currentMapNpcs:live,shops:world.assembly.shops,items:world.assembly.items,shopStocks:new Map(),knownKnowledgeNodeIds:new Set()},REGION_GUIDE_PREFIX+'npc:'+npcId);expect(target).toMatchObject({col:39,row:43});expect(clock.elapsedMinutes).toBe(before);});
 it('current placement and live fallback win over a compiled scheduled cell',()=>{const map=world.maps.get(mapId)!,scheduled=world.assembly.npcsByPeriod.get('period.dusk')!;const live=resolveNpcPlacementsForPlayer({baseNpcs:world.assembly.npcs,periodNpcs:scheduled,mapResourceId:mapId,map,playerPosition:{col:41,row:44}});const target=resolveRegionalGuideDestination({worldMap:world.worldMap,currentMapResourceId:mapId,baseNpcs:world.assembly.npcs,periodNpcs:scheduled,currentMapNpcs:live,shops:world.assembly.shops,items:world.assembly.items,shopStocks:new Map(),knownKnowledgeNodeIds:new Set()},REGION_GUIDE_PREFIX+'npc:'+npcId);expect(target).toMatchObject({col:39,row:43});});
});
