/**
 * Round 109: 区域指南补给详情的逐行呈现与可选实况输入回归。
 *
 * 六个代表区域使用目标规定的稳定地图ID，地区名/角色从真实资料推导。
 * 参数在注册测试前已确定，不能在beforeAll才填入而漏注册。补给药材逐行
 * 展示、可选 liveCurrency/travelMinutes（来自背包银两与日历
 * actionCosts.travelMinutes，transition 数据本身无分钟字段）改变文案，
 * 旧调用方（不传可选字段）的语义保持不变。这是静态资料推导，不是
 * 键盘旅程。
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {loadWorldData,type LoadedWorld} from '../src/game/world-loader';
import {buildRegionalGuideEntries,resolveRegionalGuideDestination,type RegionalGuideInput} from '../src/engine/regional-guide';
import {createShopStockRuntime} from '../src/engine/item-system';
import {findWorldTravelRoute} from '../src/engine/world-travel';
const root=fileURLToPath(new URL('../',import.meta.url));
let world:LoadedWorld;
/** Exact six maps from PROJECT-GOALS, known when Vitest registers cases. */
const representativeMaps=[
 'map.round-01-grid','map.round-10-mist-ferry','map.round-74-cloud-ridge',
 'map.round-82-east-coast','map.round-92-north-pass','map.round-97-lanxin-isle',
] as const;
beforeAll(async()=>{
  vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r109.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}
    catch{return new Response('not found',{status:404});}});
  const loaded=await loadWorldData();if(!loaded.ok)throw Error(loaded.lines.join('\n'));world=loaded.world;
});
afterAll(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function input(map:string,overrides:Partial<RegionalGuideInput>={}):RegionalGuideInput{return{worldMap:world.worldMap,currentMapResourceId:map,
  baseNpcs:world.assembly.npcs,periodNpcs:world.assembly.npcsByPeriod.get('period.morning'),shops:world.assembly.shops,items:world.assembly.items,
  shopStocks:new Map([...world.assembly.shops].map(([id,shop])=>[id,createShopStockRuntime(shop)])),knownKnowledgeNodeIds:new Set(),...overrides};}

describe('Round109 real-data supply lines and optional live inputs',()=>{
 it('resolves the exact six goal regions and their authored roles',()=>{
  expect(representativeMaps).toHaveLength(6);
  expect(new Set(representativeMaps).size).toBe(6);
  for(const map of representativeMaps){expect(world.maps.has(map)).toBe(true);
   expect(world.worldMap.regionGuides?.some(guide=>guide.mapResourceId===map)).toBe(true);}
 });

 for(const map of representativeMaps)it(map+' lists every stocked medicine on its own line with the live balance',()=>{
  const currency=321;const travelMinutes=30; // Declared per-gate cost fixture (calendar actionCosts).
  const guideInput=input(map,{liveCurrency:currency,travelMinutes});
  const entries=buildRegionalGuideEntries(guideInput);
  const supply=entries.filter(e=>e.category==='supply');
  expect(supply.length).toBeGreaterThan(0);
  for(const entry of supply){
    const lines=entry.detail.split('\n');
    const medicineLines=lines.filter(line=>line.includes('两')&&(line.includes('余')||line.includes('常备')));
    expect(medicineLines.length).toBeGreaterThan(0);
    // One stocked medicine per line: the effect paren appears at most once.
    for(const line of medicineLines)expect(line.split('（命+').length-1).toBeLessThanOrEqual(1);
    expect(medicineLines.join('')).not.toContain('；'); // Old semicolon blob is gone.
    expect(entry.detail).toContain(`现有银两 ${currency}`);
    const target=resolveRegionalGuideDestination(guideInput,entry.destinationId!);
    if(target!==null){
      const route=findWorldTravelRoute(world.worldMap,map,target.mapResourceId);
      if(route&&route.legs.length>0)expect(entry.detail).toContain(`关口行程约 ${route.legs.length*travelMinutes} 分钟`);
    }
  }
  const gates=world.worldMap.transitions.filter(g=>g.from.mapResourceId===map);
  const exits=entries.filter(e=>e.category==='exit');
  expect(exits).toHaveLength(gates.length);
  for(const exit of exits){
   const gate=gates.find(g=>exit.id==='exit:'+g.id)!;
   expect(exit.detail).toContain(`过此关口按日程需 ${gate.travelMinutes ?? travelMinutes} 分钟（不含步行）`);
   if((gate.fare ?? 0)>0)expect(exit.detail).toContain(`费用 ${gate.fare} 银两`);
  }
 });

 it('keeps every medicine on its own line for legacy callers without live inputs',()=>{
  for(const map of representativeMaps){
    const entries=buildRegionalGuideEntries(input(map));
    for(const entry of entries.filter(e=>e.category==='supply')){
      const medicineLines=entry.detail.split('\n').filter(line=>line.includes('两')&&(line.includes('余')||line.includes('常备')));
      expect(medicineLines.length).toBeGreaterThan(0);
      expect(medicineLines.join('')).not.toContain('；');
      expect(entry.detail).toContain('价格不代表已有银两');
      expect(entry.detail).not.toContain('现有银两');
      expect(entry.detail).not.toContain('分钟');
    }
    for(const exit of entries.filter(e=>e.category==='exit')){
     const gate=world.worldMap.transitions.find(g=>exit.id==='exit:'+g.id)!;
     if(gate.travelMinutes===undefined)expect(exit.detail).not.toContain('分钟');
     else expect(exit.detail).toContain(`${gate.travelMinutes} 分钟`);
    }
  }
 });

 it('a real zero balance is quoted rather than treated as a missing input',()=>{
  const map=representativeMaps[0]!;
  const entries=buildRegionalGuideEntries(input(map,{liveCurrency:0}));
  expect(entries.filter(e=>e.category==='supply').length).toBeGreaterThan(0);
  for(const entry of entries.filter(e=>e.category==='supply'))expect(entry.detail).toContain('现有银两 0');
 });
});
