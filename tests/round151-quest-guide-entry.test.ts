/**
 * Round 151: R 面板差事接取入口的对话感知投影回归（Phaser-free 引擎 + 真实大陆资料）。
 *
 * 观察到的缺口：接取提示按「E 打开差事名录」泛化描述，但 GridScene 对相邻
 * NPC 的 E 键先解析铺面（如姜百味的货郎车），差事名录只在无铺委托人处出现；
 * 同时姜百味的 F 对话 greet 节点就有条件为 offered 的 acceptQuest 选项。本轮
 * 把装配后的对话与实时对白上下文接入投影：F 对话当前可达的接取选项才说
 * 「对话里选接取」，仅 authored 而当前条件未满足的保持限定措辞，不谎称可达；
 * 无对话数据时历史提示逐字节保持，旧无对白任务名录 E 路径仍成立。
 *
 * 用真实装配数据证明：姜百味（商店 giver）的待接条目改说按 E 开铺面、按 F
 * 对话选接取；邵长庚（无对白接取选项的非商店 giver）保持原名录 E 提示；防环
 * 对话图不挂起；投影只读，基础资料字节不变。
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {loadWorldData,type LoadedWorld} from '../src/game/world-loader';
import {createQuestJournal,acceptQuest,type QuestAccessContext,type QuestJournal} from '../src/engine/quest-system';
import {buildQuestGuideEntries,dialogueAcceptanceReach,type QuestGuideInput} from '../src/engine/quest-guide';
import type {RegionalGuideInput} from '../src/engine/regional-guide';
import {createShopStockRuntime} from '../src/engine/item-system';
import {createSocialState} from '../src/engine/social-state';
import {createFactionMembershipState} from '../src/engine/faction-system';
import type {DialogueRuntimeContext} from '../src/engine/dialogue-runtime';
import type {DialogueData} from '../src/engine/dialogue-graph';

const root=fileURLToPath(new URL('../',import.meta.url));
let world:LoadedWorld;
const stableFiles=['data/base/quests/round-07-quests.json','data/base/characters/round-03-npcs.json','data/base/dialogues/round-03-conversations.json'];
let stableBefore:string[];
const HOME_MAP='map.round-01-grid';
const IRON_RIDGE='map.round-62-iron-ridge';
const PEDDLER='char.jiang-baiwei';
const SHAO='char.shao-changgeng';
const ERRAND='quest.r31-peddler-errand';
const MARKS='quest.r62-north-pass-marks';

beforeAll(async()=>{
  stableBefore=stableFiles.map(p=>readFileSync(join(root,p),'utf8'));
  vi.spyOn(console,'info').mockImplementation(()=>{});
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r151.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}
    catch{return new Response('not found',{status:404});}});
  const loaded=await loadWorldData();
  if(!loaded.ok)throw Error(loaded.lines.join('\n'));
  world=loaded.world;
});
afterAll(()=>{
  // 基础资料字节不变：本轮不改 data/base、不改接取行为、数值与存档协议。
  expect(stableFiles.map(p=>readFileSync(join(root,p),'utf8'))).toEqual(stableBefore);
  vi.unstubAllGlobals();vi.restoreAllMocks();
});

function guide(map=HOME_MAP,period='period.morning',overrides:Partial<RegionalGuideInput>={}):RegionalGuideInput{
  return {worldMap:world.worldMap,currentMapResourceId:map,baseNpcs:world.assembly.npcs,
    periodNpcs:world.assembly.npcsByPeriod.get(period)??world.assembly.npcs,
    shops:world.assembly.shops,items:world.assembly.items,
    shopStocks:new Map([...world.assembly.shops].map(([id,shop])=>[id,createShopStockRuntime(shop)])),
    knownKnowledgeNodeIds:new Set(),...overrides};
}
/** Same live facts the F panel evaluates; only acceptance-side conditions matter here. */
function liveContext(journal:QuestJournal,speakerNpcId:string):DialogueRuntimeContext{
  return {quests:world.assembly.quests,journal,items:world.assembly.items,inventory:null,
    social:createSocialState(),speakerNpcId,knownKnowledgeNodeIds:new Set<string>(),
    knowledgeNodes:world.knowledgeGraph.nodes,character:null,factions:new Map(),martialArts:new Map(),
    factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.morning'};
}
function questInput(g:RegionalGuideInput,journal:QuestJournal,access:QuestAccessContext={},
  dialogue?:{dialogues:ReadonlyMap<string,DialogueData>;dialogueContextFor:(npcId:string)=>DialogueRuntimeContext}):QuestGuideInput{
  return {guide:g,quests:world.assembly.quests,journal,access,encounters:world.assembly.encounters,
    knowledgeNodeTitles:new Map([...world.knowledgeGraph.nodes].map(([id,node])=>[id,node.title])),
    ...(dialogue===undefined?{}:dialogue)};
}
const knowing=(...nodeIds:string[]):QuestAccessContext=>({factionId:null,knownKnowledgeNodeIds:new Set(nodeIds)});
const offerRow=(input:QuestGuideInput,id:string)=>buildQuestGuideEntries(input).find(e=>e.id==='offer:'+id);
// World assembly is populated by beforeAll; getters avoid reading it during module evaluation.
let sharedJournal:QuestJournal;
const liveDialogue={
  get dialogues(){return world.assembly.dialogues;},
  dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId),
};

describe('Round151 dialogue-aware quest admission hints',()=>{
 it('assembles the continent without warnings and keeps the quest count',()=>{
  expect(world.optionalWarnings).toEqual([]);
  expect(world.assembly.quests.size).toBe(65);
 });

 it('the real shopkeeper giver now explains the shop-first E and the live F acceptance',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const g=guide();
  const errand=offerRow(questInput(g,sharedJournal,{},liveDialogue),ERRAND)!;
  expect(errand).toBeDefined();
  // The acceptance itself: the peddler's greet node carries an acceptQuest
  // option conditioned on the offered status, which holds in this journal.
  expect(dialogueAcceptanceReach(world.assembly.dialogues.get('dlg.jiang-baiwei-peddler'),ERRAND,
    liveContext(sharedJournal,PEDDLER))).toBe('now');
  expect(errand.detail).toContain('按E开的是铺面交易；接取按F交谈，对话里选接取；Q日志选中本差事后Enter亦可。');
  expect(errand.detail).not.toContain('按E打开差事名录'); // E opens the peddler cart instead.
 });

 it('a plain non-shop giver without a dialogue acceptance keeps the historical board hint',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  const marks=offerRow(questInput(guide(IRON_RIDGE),sharedJournal,access,liveDialogue),MARKS)!;
  expect(marks).toBeDefined();
  expect(dialogueAcceptanceReach(world.assembly.dialogues.get('dlg.shao-changgeng-iron-ridge'),MARKS,
    liveContext(sharedJournal,SHAO))).toBe('absent');
  expect(marks.detail).toContain('走到近旁按E打开差事名录，Enter接取；F交谈。'); // 旧无对白名录 E 路径仍成立。
 });

 it('without dialogue inputs the historical hints stay byte-for-byte',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const errand=offerRow(questInput(guide(),sharedJournal),ERRAND)!;
  expect(errand.detail).toContain('接取可在Q日志选中本差事后Enter；F交谈。');
  // Dialogue data without a live context resolver changes nothing either.
  const halfTyped=questInput(guide(),sharedJournal,{},{dialogues:world.assembly.dialogues,
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)});
  delete (halfTyped as Partial<QuestGuideInput>).dialogueContextFor;
  expect(offerRow(halfTyped,ERRAND)!.detail).toBe(errand.detail);
 });

 it('an authored acceptance whose conditions do not hold stays qualified, never "选接取"',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  // The peddler's acceptance option requires the offered status; after the
  // player accepts elsewhere the option is authored but no longer visible.
  acceptQuest(world.assembly.quests,sharedJournal,ERRAND,new Map(),{});
  expect(sharedJournal.states.get(ERRAND)!.status).toBe('active');
  const reach=dialogueAcceptanceReach(world.assembly.dialogues.get('dlg.jiang-baiwei-peddler'),ERRAND,
    liveContext(sharedJournal,PEDDLER));
  expect(reach).toBe('exists');
  // The offer row itself disappears once accepted — behaviour unchanged — so
  // the qualified wording is asserted through a still-offered fixture below.
 });

 it('a cyclic conversation graph terminates and reports honestly',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const cyclic:DialogueData={id:'dlg.r151-cyclic',startNodeId:'a',nodes:[
    {id:'a',text:'…',options:[
      {text:'再想想',nextNodeId:'b'},
      {text:'接下差事',nextNodeId:'done',conditions:[{kind:'questStatus',questId:ERRAND,status:'active'}],
        effects:[{kind:'acceptQuest',questId:ERRAND}]}]},
    {id:'b',text:'…',options:[{text:'回头',nextNodeId:'a'}]},
    {id:'done',text:'…'}]};
  expect(dialogueAcceptanceReach(cyclic,ERRAND,liveContext(sharedJournal,PEDDLER))).toBe('exists');
  expect(dialogueAcceptanceReach(cyclic,ERRAND,undefined)).toBe('exists');
  expect(dialogueAcceptanceReach(undefined,ERRAND,liveContext(sharedJournal,PEDDLER))).toBe('absent');
 });

 it('acceptance behind effect-free visible transitions is promised as reachable',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const twoHop:DialogueData={id:'dlg.r151-two-hop',startNodeId:'greet',nodes:[
    {id:'greet',text:'…',options:[{text:'问差事',nextNodeId:'offer'}]},
    {id:'offer',text:'…',options:[{text:'接下',nextNodeId:'done',
      conditions:[{kind:'questStatus',questId:ERRAND,status:'offered'}],
      effects:[{kind:'acceptQuest',questId:ERRAND}]}]},
    {id:'done',text:'…'}]};
  const dialogues=new Map([['dlg.jiang-baiwei-peddler',twoHop]]);
  const g=guide();
  const errand=offerRow(questInput(g,sharedJournal,{},{dialogues,
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)}),ERRAND)!;
  // Shopkeeper: E is still the store, but the F path is genuinely open now.
  expect(errand.detail).toContain('按E开的是铺面交易；接取按F交谈，对话里选接取；Q日志选中本差事后Enter亦可。');
  // Same reachable acceptance on a plain non-shop giver keeps the board E too.
  const shaoFix=guide(IRON_RIDGE,'period.morning');
  const marksFix:DialogueData={...twoHop,id:'dlg.r151-two-hop-shao',nodes:twoHop.nodes.map(node=>
    node.id==='offer'?{...node,options:node.options!.map(option=>({...option,
      effects:[{kind:'acceptQuest',questId:MARKS}],conditions:[{kind:'questStatus',questId:MARKS,status:'offered'}]}))}:node)};
  const dialoguesShao=new Map([['dlg.shao-changgeng-iron-ridge',marksFix]]);
  const marks=offerRow(questInput(shaoFix,sharedJournal,knowing('place.mist-north-cap'),{dialogues:dialoguesShao,
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)}),MARKS)!;
  expect(marks.detail).toContain('走到近旁按E打开差事名录，Enter接取；或F交谈，对话里选接取。');
 });

 it('acceptance reachable only through effectful transitions stays qualified on both giver kinds',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const gated:DialogueData={id:'dlg.r151-gated',startNodeId:'greet',nodes:[
    {id:'greet',text:'…',options:[
      {text:'先赊一贴药',nextNodeId:'offer',effects:[{kind:'giveItem',itemId:'item.huichun-gao',quantity:1}]},
      {text:'不急',nextNodeId:'bye'}]},
    {id:'offer',text:'…',options:[{text:'接下差事',nextNodeId:'done',
      conditions:[{kind:'questStatus',questId:ERRAND,status:'offered'}],
      effects:[{kind:'acceptQuest',questId:ERRAND}]}]},
    {id:'bye',text:'…'},{id:'done',text:'…'}]};
  const dialogues=new Map([['dlg.jiang-baiwei-peddler',gated]]);
  const errand=offerRow(questInput(guide(),sharedJournal,{},{dialogues,
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)}),ERRAND)!;
  expect(errand.detail).toContain('按E开的是铺面交易；接取可在Q日志选中本差事后Enter；F交谈的接取选项须满足条件才出现。');
  expect(errand.detail).not.toContain('对话里选接取'); // Never promise the live F path here.
  const gatedShao:DialogueData={...gated,id:'dlg.r151-gated-shao',nodes:gated.nodes.map(node=>
    node.id==='offer'?{...node,options:node.options!.map(option=>({...option,
      effects:[{kind:'acceptQuest',questId:MARKS}],conditions:[{kind:'questStatus',questId:MARKS,status:'offered'}]}))}:node)};
  const marks=offerRow(questInput(guide(IRON_RIDGE),sharedJournal,knowing('place.mist-north-cap'),
    {dialogues:new Map([['dlg.shao-changgeng-iron-ridge',gatedShao]]),
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)}),MARKS)!;
  expect(marks.detail).toContain('走到近旁按E打开差事名录，Enter接取；F交谈（接取选项须满足条件才出现）。');
  expect(marks.detail).not.toContain('或F交谈');
 });

 it('a companion giver with a live dialogue acceptance points at P→T first',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const shao=world.assembly.npcs.find(n=>n.record.id===SHAO)!;
  const g=guide(IRON_RIDGE,'period.morning',{follower:{npc:shao,col:52,row:52,mapResourceId:IRON_RIDGE}});
  const companionAccept:DialogueData={id:'dlg.r151-companion',startNodeId:'greet',nodes:[
    {id:'greet',text:'…',options:[{text:'接下差事',nextNodeId:'done',
      conditions:[{kind:'questStatus',questId:MARKS,status:'offered'}],
      effects:[{kind:'acceptQuest',questId:MARKS}]}]},
    {id:'done',text:'…'}]};
  const marks=offerRow(questInput(g,sharedJournal,knowing('place.mist-north-cap'),
    {dialogues:new Map([['dlg.shao-changgeng-iron-ridge',companionAccept]]),
    dialogueContextFor:(npcId:string)=>liveContext(sharedJournal,npcId)}),MARKS)!;
  expect(marks.detail).toContain('接取按P再T交谈，对话里选接取；Q日志选中本差事后Enter亦可。');
 });

 it('projection is read-only: journals and conversations are untouched',()=>{
  sharedJournal=createQuestJournal(world.assembly.quests);
  const snap=()=>JSON.stringify({states:[...sharedJournal.states].map(([id,s])=>[id,s.status]),
    conversations:[...world.assembly.dialogues].map(([id,c])=>id+c.nodes.length)});
  const before=snap();
  buildQuestGuideEntries(questInput(guide(),sharedJournal,{},liveDialogue));
  buildQuestGuideEntries(questInput(guide(),sharedJournal,{},liveDialogue));
  expect(snap()).toBe(before);
 });
});
