import {readFileSync,mkdtempSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {loadWorldData,type LoadedWorld} from '../src/game/world-loader';
import {findGridPath} from '../src/engine/grid-path';
import {gridMapGroundTextureKey,gridMapDepthTextureKey} from '../src/engine/grid-map-renderer';
import {createCharacterState} from '../src/engine/character-progression';
import {createShopStockRuntime,createInventoryState,buyItem,countItem} from '../src/engine/item-system';
import {createQuestJournal} from '../src/engine/quest-system';
import {createSocialState} from '../src/engine/social-state';
import {captureSaveSnapshot,parseSaveSnapshot,planSnapshotRestore,restoreRunState} from '../src/engine/save-system';
import {buildRegionalGuideEntries,resolveRegionalGuideDestination,type RegionalGuideInput} from '../src/engine/regional-guide';
import {cloudRouteCells,applyCloudRouteRefinement,CLOUD_SHOP} from '../scripts/lib/round112-cloud-routes.mjs';
const root=resolve('.'), CLOUD='map.round-74-cloud-ridge',SHOP=CLOUD_SHOP.id;
let world:LoadedWorld;
beforeAll(async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r112.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}catch{return new Response('not found',{status:404});}});
  const loaded=await loadWorldData();if(!loaded.ok)throw Error(loaded.lines.join('\n'));world=loaded.world;
});
afterAll(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function guide(stocks=new Map([...world.assembly.shops].map(([id,s])=>[id,createShopStockRuntime(s)]))):RegionalGuideInput {
  return {worldMap:world.worldMap,currentMapResourceId:CLOUD,baseNpcs:world.assembly.npcs,
    periodNpcs:world.assembly.npcsByPeriod.get('period.morning'),shops:world.assembly.shops,items:world.assembly.items,
    shopStocks:stocks,knownKnowledgeNodeIds:new Set()};
}
describe('Round112 existing Cloud Ridge paths, paving and limited provisions',()=>{
  it('assembles all stable content with one shop on the existing quest NPC',()=>{
    expect(world.optionalWarnings).toEqual([]);expect(world.maps.size).toBe(22);expect(world.assembly.quests.size).toBe(65);
    expect(world.worldMap.transitions).toHaveLength(50);
    const shop=world.assembly.shops.get(SHOP)!;expect(shop.record.npcId).toBe('char.r74-shen-yuji');
    expect(shop.stock).toEqual([{itemId:'item.huichun-gao',quantity:3},{itemId:'item.qingxin-wan',quantity:2}]);
    const npc=world.assembly.npcs.find(n=>n.record.id===shop.record.npcId)!;
    expect(npc.record.questGiver).toBe(true);expect(npc.record.dialogueId).toBe('dlg.r74-shen-yuji-cloud-ridge');
  });
  it('puts opaque copied paving under actors while retaining tree and roof foreground',()=>{
    const map=world.maps.get(CLOUD)!,floor=map.data.art!.layers.find(l=>l.id==='cloud-ridge-waystation-1')!;
    expect(map.canEnter(52,41)).toBe(true);expect(floor.cells[41]![52]).toBe(520);expect(floor.depthSort).toBeUndefined();
    for(const id of ['cloud-ridge-pines','cloud-ridge-scree','cloud-ridge-waystation-2'])
      expect(map.data.art!.layers.find(l=>l.id===id)!.depthSort).toBe('y');
    expect(gridMapGroundTextureKey(map)).not.toBe(gridMapDepthTextureKey(map));
  });
  it('makes authored cardinal trails walkable and visibly paved without erasing side terrain',()=>{
    const map=world.maps.get(CLOUD)!,trails=map.data.art!.layers.find(l=>l.id==='cloud-ridge-stone-trails')!;
    for(const [col,row] of cloudRouteCells()) {expect(map.canEnter(col,row),`${col},${row}`).toBe(true);expect(trails.cells[row]![col]).toBeGreaterThanOrEqual(576);}
    expect(map.data.grid.join('').split('#').length-1).toBeGreaterThan(1000);
    expect(map.data.art!.layers.find(l=>l.id==='cloud-ridge-pines')!.cells.flat().filter(Boolean).length).toBeGreaterThan(30);
    const occupied=new Set(['39,43','76,42']);
    const surface={columns:map.columns,rows:map.rows,inBounds:(c:number,r:number)=>map.inBounds(c,r),
      canEnter:(c:number,r:number)=>map.canEnter(c,r)&&!occupied.has(`${c},${r}`)};
    expect(findGridPath(surface,{col:40,row:43},{col:27,row:31})!.length-1).toBe(25);
    expect(findGridPath(surface,{col:40,row:43},{col:75,row:42})!.length-1).toBe(36);
    expect(findGridPath(surface,{col:50,row:97},{col:40,row:43})!.length-1).toBe(64);
    expect(findGridPath(surface,{col:40,row:43},{col:62,row:3})!.length-1).toBe(62);
  });
  it('keeps current NPC schedules and all region gate/event anchors reachable',()=>{
    const map=world.maps.get(CLOUD)!;
    const points=[...world.worldMap.transitions.flatMap(g=>[g.from,g.to]).filter(p=>p.mapResourceId===CLOUD),
      ...world.worldMap.events.filter(p=>p.mapResourceId===CLOUD)];
    for(const period of world.assembly.npcsByPeriod.values())for(const npc of period)if(npc.record.mapResourceId===CLOUD)points.push({mapResourceId:CLOUD,col:npc.col,row:npc.row});
    for(const p of points)expect(findGridPath(map,map.data.playerStart,p),`${p.col},${p.row}`).not.toBeNull();
    const cloned=structuredClone(map.data);expect(applyCloudRouteRefinement(cloned)).toEqual(map.data);
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
  it('persists actual transactions through v1 parse, preflight and restoration',()=>{
    const profile=[...world.assembly.progression.profiles.values()][0]!,shop=world.assembly.shops.get(SHOP)!,stock=createShopStockRuntime(shop);
    const character=createCharacterState(profile),inventory=createInventoryState(profile,[]);inventory.currency=120;
    expect(buyItem(inventory,stock,world.assembly.items.get('item.huichun-gao')!,2).ok).toBe(true);
    expect(buyItem(inventory,stock,world.assembly.items.get('item.qingxin-wan')!).ok).toBe(true);
    const snapshot=captureSaveSnapshot({displayName:'云栈付费测试',mapResourceId:CLOUD,playerCol:40,playerRow:43,character,inventory,
      shopStocks:new Map([[SHOP,stock]]),journal:createQuestJournal(world.assembly.quests),social:createSocialState(),
      completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:new Set(),elapsedGameMinutes:0,worldSeed:112,factionMembership:null});
    const parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));expect(parsed.ok).toBe(true);if(!parsed.ok)return;
    const refs={profileIds:new Set([profile.id]),profileRecords:new Map([[profile.id,profile]]),mapResourceId:CLOUD,
      isWalkableCell:(col:number,row:number)=>world.maps.get(CLOUD)!.canEnter(col,row),isCellOccupied:()=>false,
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
  it('guides to the current shop schedule, shows actual depletion and falls back across gates',()=>{
    const input=guide(),entry=buildRegionalGuideEntries(input).find(e=>e.category==='supply'&&e.title===CLOUD_SHOP.name)!;
    expect(entry.detail).toContain('本地');expect(entry.detail).toContain('回春膏 15两余3');
    expect(resolveRegionalGuideDestination(input,entry.destinationId!)!.col).toBe(38);
    expect(resolveRegionalGuideDestination(input,entry.destinationId!)!.row).toBe(42);
    input.shopStocks.get(SHOP)!.set('item.huichun-gao',0);input.shopStocks.get(SHOP)!.set('item.qingxin-wan',0);
    const fallback=buildRegionalGuideEntries(input).filter(e=>e.category==='supply');expect(fallback.some(e=>e.title===CLOUD_SHOP.name)).toBe(false);
    expect(fallback[0]!.detail).toContain('跨');
  });
  it('incremental replay and R74→R76→R78 regeneration preserve the current cloud output and other maps',()=>{
    const temp=resolve(mkdtempSync(join(tmpdir(),'wuxia-r112-')));expect(temp.startsWith(resolve(tmpdir())+sep)).toBe(true);
    try {
      mkdirSync(join(temp,'data'),{recursive:true});cpSync(join(root,'data/base'),join(temp,'data/base'),{recursive:true});cpSync(join(root,'scripts'),join(temp,'scripts'),{recursive:true});
      const targets=['maps/round-74-cloud-ridge.json','shops/round-06-shops.json','characters/round-74-cloud-ridge-npcs.json','dialogues/round-74-cloud-ridge-conversations.json','world/world-map.json'];
      const frozen=new Map([...world.maps.keys()].filter(id=>id!==CLOUD).map(id=>[id,JSON.stringify(world.maps.get(id)!.data)]));
      for(let i=0;i<2;i++)execFileSync(process.execPath,[join(temp,'scripts/deepen-round112-cloud.mjs')],{cwd:temp});
      for(const file of targets)expect(readFileSync(join(temp,'data/base',file),'utf8'),file).toBe(readFileSync(join(root,'data/base',file),'utf8'));
      for(const name of ['generate-round74-cloud-ridge.mjs','generate-round76-region-landmarks.mjs','generate-round78-actor-depth.mjs','deepen-round112-cloud.mjs'])
        execFileSync(process.execPath,[join(temp,'scripts',name)],{cwd:temp});
      const regenerated=JSON.parse(readFileSync(join(temp,'data/base/maps/round-74-cloud-ridge.json'),'utf8'));
      const current=world.maps.get(CLOUD)!.data;
      if(JSON.stringify(regenerated)!==JSON.stringify(current)) {
        const differences:string[]=[];
        function diff(a:unknown,b:unknown,path='map') {
          if(differences.length>=10||a===b)return;
          if(a&&b&&typeof a==='object'&&typeof b==='object') {
            for(const key of new Set([...Object.keys(a),...Object.keys(b)]))
              diff((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],path+'.'+key);
          } else differences.push(`${path}: ${JSON.stringify(b)}→${JSON.stringify(a)}`);
        }
        diff(regenerated,current);
        console.error('Regeneration differences:',differences.join('; '));
      }
      expect(regenerated).toEqual(current);
      for(const [id,data] of frozen){const manifest=JSON.parse(readFileSync(join(temp,'data/base/manifest.json'),'utf8'));const resource=manifest.resources.find((r:{id:string})=>r.id===id);expect(JSON.stringify(JSON.parse(readFileSync(join(temp,'data/base',resource.path),'utf8'))),id).toBe(data);}
    } finally {expect(temp.startsWith(resolve(tmpdir())+sep)).toBe(true);rmSync(temp,{recursive:true,force:true});}
  });
});
