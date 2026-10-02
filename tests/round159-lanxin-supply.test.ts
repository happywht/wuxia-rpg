import {createCharacterState} from '../src/engine/character-progression';
import {createQuestJournal} from '../src/engine/quest-system';
import {createSocialState} from '../src/engine/social-state';
import {captureSaveSnapshot,parseSaveSnapshot,planSnapshotRestore,restoreRunState} from '../src/engine/save-system';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {loadWorldData,type LoadedWorld} from '../src/game/world-loader';
import {createShopStockRuntime,createInventoryState,buyItem,countItem} from '../src/engine/item-system';
import {resolveRegionalGuideDestination,type RegionalGuideInput} from '../src/engine/regional-guide';

const root=resolve('.'), SHOP='shop.r159-lanxin-provisions';
let world:LoadedWorld;
beforeAll(async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r112.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}catch{return new Response('not found',{status:404});}});
  const loaded=await loadWorldData();if(!loaded.ok)throw Error(loaded.lines.join('\n'));world=loaded.world;
});
afterAll(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('Round159 Lanxin finite supplies',()=>{
  it('connects existing keeper to finite shop without new resources',()=>{
    expect(world.optionalWarnings).toEqual([]);
    expect(world.worldMap.regionGuides!.find(r=>r.mapResourceId==='map.round-97-lanxin-isle')!.advice).toContain('候潮备药匣');
    expect(world.maps.size).toBe(22);expect(world.assembly.quests.size).toBe(65);
    const shop=world.assembly.shops.get(SHOP)!;
    expect(shop.record.npcId).toBe('char.r97-ji-wuchao');
    expect(shop.stock).toEqual([{itemId:'item.huichun-gao',quantity:3},{itemId:'item.qingxin-wan',quantity:2}]);
    const npc=world.assembly.npcs.find(n=>n.record.id===shop.record.npcId)!;
    expect(npc.record.shopId).toBe(SHOP);expect(npc.record.questGiver).toBe(true);
    expect(npc.record.dialogueId).toBe('dlg.r97-ji-wuchao');
  });
  it('uses real price and finite stock, refuses unpaid or exhausted purchases atomically',()=>{
    const profile=[...world.assembly.progression.profiles.values()][0]!,shop=world.assembly.shops.get(SHOP)!,stock=createShopStockRuntime(shop);
    const inv=createInventoryState(profile,[]),ointment=world.assembly.items.get('item.huichun-gao')!;inv.currency=45;
    expect(buyItem(inv,stock,ointment,3)).toEqual({ok:true,outcome:{cost:45,quantity:3}});
    expect(inv.currency).toBe(0);expect(countItem(inv,ointment.id)).toBe(3);expect(stock.get(ointment.id)).toBe(0);
    const before=JSON.stringify([inv,[...stock]]);expect(buyItem(inv,stock,ointment).ok).toBe(false);
    expect(buyItem(inv,stock,world.assembly.items.get('item.qingxin-wan')!).ok).toBe(false);
    expect(JSON.stringify([inv,[...stock]])).toBe(before);
  });
  it('resolves current schedule shop destination with E arrival action',()=>{
    for(const periodNpcs of world.assembly.npcsByPeriod.values()) {
      const input:RegionalGuideInput={worldMap:world.worldMap,currentMapResourceId:'map.round-97-lanxin-isle',baseNpcs:world.assembly.npcs,periodNpcs,shops:world.assembly.shops,items:world.assembly.items,shopStocks:new Map(),knownKnowledgeNodeIds:new Set()};
      const npc=periodNpcs.find(n=>n.record.id==='char.r97-ji-wuchao')!;
      const dest=resolveRegionalGuideDestination(input,'region-guide:npc:'+npc.record.id);
      expect(dest).toMatchObject({col:npc.col,row:npc.row,arrivalAction:'shop'});
    }
  });
  it('persists actual transactions through v1 parse, preflight and restoration',()=>{
    const profile=[...world.assembly.progression.profiles.values()][0]!,shop=world.assembly.shops.get(SHOP)!,stock=createShopStockRuntime(shop);
    const character=createCharacterState(profile),inventory=createInventoryState(profile,[]);inventory.currency=120;
    expect(buyItem(inventory,stock,world.assembly.items.get('item.huichun-gao')!,2).ok).toBe(true);
    expect(buyItem(inventory,stock,world.assembly.items.get('item.qingxin-wan')!).ok).toBe(true);
    const snapshot=captureSaveSnapshot({displayName:'候潮付费测试',mapResourceId:'map.round-97-lanxin-isle',playerCol:49,playerRow:50,character,inventory,
      shopStocks:new Map([[SHOP,stock]]),journal:createQuestJournal(world.assembly.quests),social:createSocialState(),
      completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:new Set(),elapsedGameMinutes:0,worldSeed:112,factionMembership:null});
    const parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));expect(parsed.ok).toBe(true);if(!parsed.ok)return;
    const refs={profileIds:new Set([profile.id]),profileRecords:new Map([[profile.id,profile]]),mapResourceId:'map.round-97-lanxin-isle',
      isWalkableCell:(col:number,row:number)=>world.maps.get('map.round-97-lanxin-isle')!.canEnter(col,row),isCellOccupied:()=>false,
      itemIds:new Set(world.assembly.items.keys()),itemRecords:world.assembly.items,martialArtIds:new Set(world.assembly.progression.martialArts.keys()),
      questIds:new Set(world.assembly.quests.keys()),questObjectiveIds:new Map([...world.assembly.quests].map(([id,q])=>[id,new Set(q.objectives.map(o=>o.id))])),
      encounterIds:new Set(world.assembly.encounters.map(e=>e.record.id)),shopIds:new Set(world.assembly.shops.keys()),shopRecords:world.assembly.shops,questRecords:world.assembly.quests,
      npcIds:new Set(world.assembly.npcs.map(n=>n.record.id)),regionalEventIds:new Set(world.worldMap.events.map(e=>e.id)),knowledgeNodeIds:new Set(world.knowledgeGraph.nodes.keys()),
      factionIds:new Set(world.assembly.progression.factions.keys()),factionMentorNpcIds:new Map([...world.assembly.progression.factions].map(([id,f])=>[id,new Set(f.mentorNpcIds)]))};
    const plan=planSnapshotRestore(parsed.snapshot,refs);expect(plan.ok).toBe(true);if(!plan.ok)return;expect(plan.warnings).toEqual([]);
    const restored=restoreRunState({snapshot:plan.snapshot,profile,items:world.assembly.items,quests:world.assembly.quests,shops:world.assembly.shops});
    expect(restored.inventory.currency).toBe(78);expect(countItem(restored.inventory,'item.huichun-gao')).toBe(2);
    expect([...restored.shopStocks.get(SHOP)!]).toEqual([['item.huichun-gao',1],['item.qingxin-wan',1]]);
    const legacy=structuredClone(snapshot);legacy.shopStocks=[];
    expect([...restoreRunState({snapshot:legacy,profile,items:world.assembly.items,quests:world.assembly.quests,shops:world.assembly.shops}).shopStocks.get(SHOP)!])
      .toEqual([['item.huichun-gao',3],['item.qingxin-wan',2]]);
  });
});
