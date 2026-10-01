/**
 * Round 110: R 面板差事分类的任务发现回归（Phaser-free 引擎 + 真实大陆资料）。
 *
 * 观察到的缺口：铁嶂正常档无进行中差事时「活动差事」页空白，而 Q 日志
 * 首屏却列出远方海岛的待接差事。本轮把该分类改为同时组装进行中差事与
 * 当前地区可接委托：待接项标注「待接取」并给出委托人与实际日程坐标，
 * 导航只带路到委托人；hasQuestAccess 不通过、giver 缺失（MOD 缺 NPC）、
 * giver 离区或已招同行（不可见时）一律不谎称可接。
 *
 * 用真实装配数据证明：北隘校标（雾岬见闻已知时）能在铁嶂出现并导航到
 * 邵长庚的当值格；驿镇更簿依前置完成后才出现；接取后条目转为原 objective
 * 导航；旧档乱序/缺 state 的日志与被过滤的 giver 均不崩溃；helper 只读，
 * 基础资料字节不变。
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {loadWorldData,type LoadedWorld} from '../src/game/world-loader';
import {createQuestJournal,acceptQuest,abandonQuest,applyQuestSignal,type QuestAccessContext,type QuestJournal} from '../src/engine/quest-system';
import type {PlacedNpc} from '../src/engine/npc-placement';
import {QUEST_NAVIGATION_ID_PREFIX,resolveQuestNavigationTarget} from '../src/engine/quest-navigation';
import {buildQuestGuideEntries,type QuestGuideInput} from '../src/engine/quest-guide';
import {resolveRegionalGuideDestination,REGION_GUIDE_PREFIX,type RegionalGuideInput} from '../src/engine/regional-guide';
import {resolveCellNavigationGuide} from '../src/engine/world-navigation-guidance';
import {createShopStockRuntime,createInventoryState} from '../src/engine/item-system';
import {captureSaveSnapshot,parseSaveSnapshot,planSnapshotRestore,restoreRunState} from '../src/engine/save-system';
import {createCharacterState,parseCharacterProfileSet} from '../src/engine/character-progression';
import {createSocialState} from '../src/engine/social-state';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path:string)=>JSON.parse(readFileSync(join(root,path),'utf8'));
let world:LoadedWorld;
const stableFiles=['data/base/world/world-map.json','data/base/quests/round-07-quests.json','data/base/characters/round-03-npcs.json'];
let stableBefore:string[];
const IRON_RIDGE='map.round-62-iron-ridge';
const SHAO='char.shao-changgeng';

beforeAll(async()=>{
  stableBefore=stableFiles.map(p=>readFileSync(join(root,p),'utf8'));
  vi.spyOn(console,'info').mockImplementation(()=>{});
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r110.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}
    catch{return new Response('not found',{status:404});}});
  const loaded=await loadWorldData();
  if(!loaded.ok)throw Error(loaded.lines.join('\n'));
  world=loaded.world;
});
afterAll(()=>{
  // 基础资料字节不变：本轮不重跑生成器、不写 data/base。
  expect(stableFiles.map(p=>readFileSync(join(root,p),'utf8'))).toEqual(stableBefore);
  vi.unstubAllGlobals();vi.restoreAllMocks();
});

function guide(map=IRON_RIDGE,period='period.morning',overrides:Partial<RegionalGuideInput>={}):RegionalGuideInput{
  return {worldMap:world.worldMap,currentMapResourceId:map,baseNpcs:world.assembly.npcs,
    periodNpcs:world.assembly.npcsByPeriod.get(period)??world.assembly.npcs,
    shops:world.assembly.shops,items:world.assembly.items,
    shopStocks:new Map([...world.assembly.shops].map(([id,shop])=>[id,createShopStockRuntime(shop)])),
    knownKnowledgeNodeIds:new Set(),...overrides};
}
function questInput(g:RegionalGuideInput,journal:QuestJournal,access:QuestAccessContext={}):QuestGuideInput{
  return {guide:g,quests:world.assembly.quests,journal,access,encounters:world.assembly.encounters,
    knowledgeNodeTitles:new Map([...world.knowledgeGraph.nodes].map(([id,node])=>[id,node.title]))};
}
const knowing=(...nodeIds:string[]):QuestAccessContext=>({factionId:null,knownKnowledgeNodeIds:new Set(nodeIds)});
const offerIds=(g:RegionalGuideInput,journal:QuestJournal,access:QuestAccessContext={})=>
  buildQuestGuideEntries(questInput(g,journal,access)).filter(e=>e.id.startsWith('offer:'));

describe('Round110 quest discovery in the regional guide',()=>{
 it('assembles the continent without warnings and keeps the quest count',()=>{
  expect(world.optionalWarnings).toEqual([]);
  expect(world.assembly.quests.size).toBe(65);
 });

 it('北隘校标 appears on 铁嶂 once the 雾岬 knowledge is known and routes to 邵长庚',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  // Without the required knowledge the commission is filtered, not advertised.
  expect(offerIds(g,journal).some(e=>e.id==='offer:quest.r62-north-pass-marks')).toBe(false);
  const entries=offerIds(g,journal,knowing('place.mist-north-cap'));
  const marks=entries.find(e=>e.id==='offer:quest.r62-north-pass-marks')!;
  expect(marks).toBeDefined();
  expect(marks.title).toBe('北隘校标（待接取）');
  expect(marks.detail).toContain('待接取');
  expect(marks.detail).toContain('委托人 邵长庚 (49,48)'); // Morning schedule cell, not the base (48,49).
  expect(marks.detail).toContain('走到近旁按E打开差事名录，Enter接取；F交谈。'); // Plain non-shop giver standing here.
  expect(marks.detail).toContain(world.assembly.quests.get('quest.r62-north-pass-marks')!.description.slice(0,12));
  expect(marks.destinationId).toBe(REGION_GUIDE_PREFIX+'npc:'+SHAO);
  const target=resolveRegionalGuideDestination(g,marks.destinationId!)!;
  expect(target).toMatchObject({mapResourceId:IRON_RIDGE,col:49,row:48,name:'邵长庚',arrivalAction:'talk'});
  // The giver cell is actually walkable from the map's authored start.
  const grid=world.maps.get(IRON_RIDGE)!;
  const blockers=new Set([
    ...(g.periodNpcs??[]).filter(n=>n.record.mapResourceId===IRON_RIDGE).map(n=>`${n.col},${n.row}`),
    ...world.assembly.encounters.filter(e=>e.record.mapResourceId===IRON_RIDGE).map(e=>`${e.col},${e.row}`)]);
  const walk=resolveCellNavigationGuide(world.worldMap,IRON_RIDGE,target,grid,grid.data.playerStart,blockers);
  expect(['en-route','at-gate','arrived']).toContain(walk.status);
 });

 it('locked follow-ups stay hidden until their prerequisite completes',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  expect(journal.states.get('quest.r62-post-ledger')!.status).toBe('locked');
  expect(offerIds(g,journal,access).some(e=>e.id==='offer:quest.r62-post-ledger')).toBe(false);
  acceptQuest(world.assembly.quests,journal,'quest.r62-north-pass-marks',new Map(),access);
  applyQuestSignal(world.assembly.quests,journal,{type:'knowledge-discovery',nodeId:'place.iron-ridge-pass'});
  expect(journal.states.get('quest.r62-north-pass-marks')!.status).toBe('completed');
  expect(journal.states.get('quest.r62-post-ledger')!.status).toBe('offered');
  expect(offerIds(g,journal,access).some(e=>e.id==='offer:quest.r62-post-ledger')).toBe(true);
 });

 it('accepting turns the offer into the original objective navigation',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  acceptQuest(world.assembly.quests,journal,'quest.r62-north-pass-marks',new Map(),access);
  const entries=buildQuestGuideEntries(questInput(g,journal,access));
  expect(entries.some(e=>e.id==='offer:quest.r62-north-pass-marks')).toBe(false);
  const active=entries.find(e=>e.id==='quest:quest.r62-north-pass-marks')!;
  expect(active).toBeDefined();
  expect(active.destinationId!.startsWith(QUEST_NAVIGATION_ID_PREFIX)).toBe(true);
  expect(active.detail).toContain('到碎岭旧道核对界石凿痕'); // Authored objective text drives the row.
 });

 it('remote offered commissions stay off the local page until the player walks there',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  // The Q-journal opening screen problem: these distant offered quests exist…
  const remote=[...world.assembly.quests.values()].filter(q=>
    journal.states.get(q.id)!.status==='offered'&&q.requiredKnowledgeNodeId===undefined&&
    world.assembly.npcs.find(n=>n.record.id===q.giverNpcId)!.record.mapResourceId!==IRON_RIDGE);
  expect(remote.length).toBeGreaterThan(3); // e.g. 远方海岛/盐道委托确实同时处于可接。
  expect(remote.some(q=>q.id==='quest.r67-well-waterline')).toBe(true);
  // …but none of them (nor any locked one) is advertised on the 铁嶂 page.
  const ids=offerIds(g,journal).map(e=>e.id);
  expect(ids.some(id=>remote.some(q=>'offer:'+q.id===id))).toBe(false);
  for(const entry of offerIds(g,journal)){
    const quest=world.assembly.quests.get(entry.id.slice('offer:'.length))!;
    const giver=resolveRegionalGuideDestination(g,entry.destinationId!)!;
    expect(giver.mapResourceId).toBe(IRON_RIDGE);
    expect(journal.states.get(quest.id)!.status).toBe('offered');
  }
  // On the giver's own map the same commission appears.
  const saltRoad=guide('map.round-67-salt-road');
  expect(offerIds(saltRoad,journal).some(e=>e.id==='offer:quest.r67-well-waterline')).toBe(true);
 });

 it('giver coordinates follow the live period schedule',()=>{
  const g=guide(IRON_RIDGE,'period.night'),journal=createQuestJournal(world.assembly.quests);
  const marks=offerIds(g,journal,knowing('place.mist-north-cap')).find(e=>e.id==='offer:quest.r62-north-pass-marks')!;
  expect(marks.detail).toContain('委托人 邵长庚 (48,50)'); // Night schedule cell.
  expect(marks.detail).not.toContain('(49,48)');
 });

 it('a recruited companion giver keeps its offer at the real walking cell',()=>{
  const shao=world.assembly.npcs.find(n=>n.record.id===SHAO)!;
  const g=guide(IRON_RIDGE,'period.morning',{follower:{npc:shao,col:52,row:52,mapResourceId:IRON_RIDGE}});
  const journal=createQuestJournal(world.assembly.quests);
  const marks=offerIds(g,journal,knowing('place.mist-north-cap')).find(e=>e.id==='offer:quest.r62-north-pass-marks')!;
  expect(marks.detail).toContain('真实同行位置');
  expect(marks.detail).toContain('(52,52)');
  expect(marks.detail).toContain('接取可在Q日志选中本差事后Enter；交谈按P再T。'); // Companion entry, not a board E.
  expect(resolveRegionalGuideDestination(g,marks.destinationId!)).toMatchObject({col:52,row:52,arrivalAction:'companion'});
  // An activated follower whose marker is not on this map resolves nowhere, so no offer.
  const hidden=guide(IRON_RIDGE,'period.morning',{activeFollowerNpcId:SHAO});
  expect(offerIds(hidden,journal,knowing('place.mist-north-cap')).some(e=>e.id==='offer:quest.r62-north-pass-marks')).toBe(false);
 });

 it('a MOD-missing giver is skipped instead of pinning stale home coordinates',()=>{
  const strip=(list:readonly PlacedNpc[])=>list.filter(n=>n.record.id!==SHAO);
  const g=guide(IRON_RIDGE,'period.morning',{baseNpcs:strip(world.assembly.npcs),
    periodNpcs:strip(world.assembly.npcsByPeriod.get('period.morning')??world.assembly.npcs)});
  const journal=createQuestJournal(world.assembly.quests);
  expect(offerIds(g,journal,knowing('place.mist-north-cap')).some(e=>e.id==='offer:quest.r62-north-pass-marks')).toBe(false);
  expect(resolveRegionalGuideDestination(g,REGION_GUIDE_PREFIX+'npc:'+SHAO)).toBeNull();
 });

 it('a hand-built legacy-style sparse journal stays stable (not a v1 parse/restore)',()=>{
  // Hand-built 旧式 journal：仅打乱 states 顺序或删去个别 state，模拟极旧
  // 存档缺新任务的形状；完整的 v1 capture→parse→restore 往返由下方专项覆盖。
  const journal=createQuestJournal(world.assembly.quests),access=knowing('place.mist-north-cap');
  const g=guide();
  const ordered=buildQuestGuideEntries(questInput(g,journal,access)).map(e=>e.id);
  const reversed:QuestJournal={trackedQuestId:null,states:new Map([...journal.states.entries()].reverse())};
  expect(buildQuestGuideEntries(questInput(g,reversed,access)).map(e=>e.id)).toEqual(ordered);
  const sparse:QuestJournal={trackedQuestId:null,states:new Map(journal.states)};
  sparse.states.delete('quest.r62-north-pass-marks');
  const sparseIds=buildQuestGuideEntries(questInput(g,sparse,access)).map(e=>e.id);
  expect(sparseIds.some(id=>id==='offer:quest.r62-north-pass-marks')).toBe(false);
  expect(ordered.filter(id=>id!=='offer:quest.r62-north-pass-marks')).toEqual(sparseIds); // No crash; remaining band intact.
 });

 it('assembly is read-only: journal, stocks and quests are untouched',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  const snap=()=>JSON.stringify({states:[...journal.states].map(([id,s])=>[id,s.status,[...s.objectiveCounts]]),tracked:journal.trackedQuestId,
    stocks:[...g.shopStocks].map(([id,s])=>[id,[...s]])});
  const before=snap();
  buildQuestGuideEntries(questInput(g,journal,access));
  buildQuestGuideEntries(questInput(g,journal,access));
  expect(snap()).toBe(before);
 });

 it('faction-gated mainland commissions follow the real membership filter',()=>{
  const g=guide('map.round-10-mist-ferry'),journal=createQuestJournal(world.assembly.quests);
  const quest=world.assembly.quests.get('quest.r43-tiezhang-stone-post')!;
  expect(quest.requiredFactionId).toBe('faction.tiezhang-pai'); // 真实派别门，非注入。
  expect(quest.requiredKnowledgeNodeId).toBe('event.r43-wayfarer-letter'); // 且带真实见闻门。
  expect(journal.states.get(quest.id)!.status).toBe('offered');
  const gate=(factionId:string|null,letter:boolean)=>offerIds(g,journal,
    {factionId,knownKnowledgeNodeIds:new Set(letter?['event.r43-wayfarer-letter']:[])});
  expect(gate(null,true).some(e=>e.id==='offer:'+quest.id)).toBe(false); // No membership.
  expect(gate('faction.tingyu-jiange',true).some(e=>e.id==='offer:'+quest.id)).toBe(false); // Wrong membership.
  expect(gate('faction.tiezhang-pai',false).some(e=>e.id==='offer:'+quest.id)).toBe(false); // Missing letter.
  const member=gate('faction.tiezhang-pai',true).find(e=>e.id==='offer:'+quest.id)!;
  expect(member).toBeDefined();
  expect(member.detail).toContain('委托人 石北'); // Local giver on the mist-ferry map, no shop: board E applies.
  expect(member.detail).toContain('走到近旁按E打开差事名录');
 });

 it('a real shopkeeper giver routes acceptance through the Q journal, not a board E',()=>{
  const g=guide('map.round-01-grid'),journal=createQuestJournal(world.assembly.quests);
  const errand=offerIds(g,journal).find(e=>e.id==='offer:quest.r31-peddler-errand')!;
  expect(errand).toBeDefined();
  expect(errand.detail).toContain('委托人 姜百味 (45,39)'); // Base cell: no morning schedule entry.
  expect(errand.detail).toContain('接取可在Q日志选中本差事后Enter；F交谈。');
  expect(errand.detail).not.toContain('按E打开差事名录'); // E opens the peddler cart instead.
  const target=resolveRegionalGuideDestination(g,errand.destinationId!)!;
  expect(target).toMatchObject({name:'姜百味',arrivalAction:'shop'});
 });

 it('active journeys with cross-region objectives stay listed from any region',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  // Remote acceptance via the Q journal stays allowed this round; the player
  // is still standing on 铁嶂.
  expect(acceptQuest(world.assembly.quests,journal,'quest.r67-well-waterline',new Map(),{}).ok).toBe(true);
  const active=buildQuestGuideEntries(questInput(g,journal)).find(e=>e.id==='quest:quest.r67-well-waterline')!;
  expect(active).toBeDefined();
  expect(active.destinationId!.startsWith(QUEST_NAVIGATION_ID_PREFIX)).toBe(true);
  const resolution=resolveQuestNavigationTarget({quests:world.assembly.quests,journal,questId:'quest.r67-well-waterline',
    worldMap:world.worldMap,baseNpcs:world.assembly.npcs,periodNpcs:g.periodNpcs??world.assembly.npcs,
    encounters:world.assembly.encounters,currentMapResourceId:g.currentMapResourceId,
    knowledgeNodeTitles:new Map([...world.knowledgeGraph.nodes].map(([id,node])=>[id,node.title]))});
  expect(resolution.status).toBe('target');
  if(resolution.status==='target')expect(resolution.target.mapResourceId).toBe('map.round-67-salt-road');
 });

 it('an active non-spatial goal keeps its row as information only',()=>{
  const template=world.assembly.quests.get('quest.r62-north-pass-marks')!;
  const fixture={...structuredClone(template),id:'quest.r110-fixture-use',name:'试服丹药',
    giverNpcId:SHAO,requiredKnowledgeNodeId:undefined,
    objectives:[{id:'objective.r110-use',kind:'useItem' as const,targetId:'item.huichun-gao',requiredCount:1,text:'服下一帖回春膏'}]};
  const quests=new Map([...world.assembly.quests,[fixture.id,fixture as typeof template]]);
  const journal=createQuestJournal(quests);
  expect(acceptQuest(quests,journal,fixture.id,new Map([['item.huichun-gao',1]]),{}).ok).toBe(true);
  const row=buildQuestGuideEntries({...questInput(guide(),journal),quests}).find(e=>e.id==='quest:'+fixture.id)!;
  expect(row).toBeDefined();
  expect(row.destinationId).toBeNull();
  expect(row.detail).toContain('下一步暂不是空间目标');
 });

 it('completed and failed journeys never re-list as rows or offers',()=>{
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  acceptQuest(world.assembly.quests,journal,'quest.r62-north-pass-marks',new Map(),access);
  applyQuestSignal(world.assembly.quests,journal,{type:'knowledge-discovery',nodeId:'place.iron-ridge-pass'});
  expect(journal.states.get('quest.r62-north-pass-marks')!.status).toBe('completed');
  acceptQuest(world.assembly.quests,journal,'quest.r67-well-waterline',new Map(),{});
  expect(abandonQuest(journal,'quest.r67-well-waterline').ok).toBe(true);
  const entries=buildQuestGuideEntries(questInput(g,journal,access));
  expect(entries.some(e=>e.id==='quest:quest.r62-north-pass-marks'||e.id==='offer:quest.r62-north-pass-marks')).toBe(false);
  expect(entries.some(e=>e.id==='quest:quest.r67-well-waterline'||e.id==='offer:quest.r67-well-waterline')).toBe(false);
 });

 it('a real capture→parse→plan→restore journal reproduces the same guide',()=>{
  const profileParse=parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
  if(!profileParse.ok)throw Error(profileParse.errors.join('\n'));
  const profile=profileParse.set.profiles[0]!;
  const g=guide(),journal=createQuestJournal(world.assembly.quests);
  const access=knowing('place.mist-north-cap');
  acceptQuest(world.assembly.quests,journal,'quest.r62-north-pass-marks',new Map(),access);
  const before=buildQuestGuideEntries(questInput(g,journal,access));
  const character=createCharacterState(profile);
  const snapshot=captureSaveSnapshot({displayName:'铁嶂行旅',mapResourceId:IRON_RIDGE,playerCol:48,playerRow:48,
    character,inventory:createInventoryState(profile,[]),journal,social:createSocialState(),shopStocks:new Map(),
    completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:access.knownKnowledgeNodeIds!,
    elapsedGameMinutes:0,worldSeed:110});
  const parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if(!parsed.ok)throw Error(parsed.message);
  const plan=planSnapshotRestore(parsed.snapshot,{
    profileIds:new Set([profile.id]),profileRecords:new Map([[profile.id,profile]]),
    mapResourceId:IRON_RIDGE,isWalkableCell:()=>true,isCellOccupied:()=>false,
    itemIds:new Set(world.assembly.items.keys()),itemRecords:world.assembly.items,
    martialArtIds:new Set(character.martialArtIds),
    questIds:new Set(world.assembly.quests.keys()),
    questObjectiveIds:new Map([...world.assembly.quests].map(([id,q])=>[id,new Set(q.objectives.map(o=>o.id))])),
    questRecords:world.assembly.quests,
    encounterIds:new Set(world.assembly.encounters.map(e=>e.record.id)),
    shopIds:new Set(world.assembly.shops.keys()),
    npcIds:new Set(world.assembly.npcs.map(n=>n.record.id)),
    knowledgeNodeIds:new Set(world.knowledgeGraph.nodes.keys()),
  });
  if(!plan.ok)throw Error(plan.errors.join('\n'));
  const restored=restoreRunState({snapshot:plan.snapshot,profile,items:world.assembly.items,
    quests:world.assembly.quests,shops:world.assembly.shops});
  expect(buildQuestGuideEntries(questInput(g,restored.journal,access))).toEqual(before);
 });
});
