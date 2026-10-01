import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { loadWorldData, type LoadedWorld } from '../src/game/world-loader';
import { buildRegionalGuideEntries, resolveRegionalGuideDestination, REGION_GUIDE_PREFIX, type RegionalGuideInput } from '../src/engine/regional-guide';
import { arrivalActionHint } from '../src/engine/world-navigation-guidance';
const root=fileURLToPath(new URL('../',import.meta.url));
let world:LoadedWorld;
beforeAll(async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  try{return new Response(readFileSync(join(root,'data',decodeURIComponent(new URL(url,'http://r145.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}});}
  catch{return new Response('not found',{status:404});}
 });
 const result=await loadWorldData();if(!result.ok)throw Error(result.lines.join('\n'));world=result.world;
});
afterAll(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function input():RegionalGuideInput{return {worldMap:world.worldMap,currentMapResourceId:'map.round-93-snow-pine-valley',baseNpcs:[],shops:new Map(),items:new Map(),shopStocks:new Map(),knownKnowledgeNodeIds:new Set(),endingGate:world.assembly.endings!.gate};}
const entry=(i:RegionalGuideInput)=>buildRegionalGuideEntries(i).find(row=>row.id.startsWith('ending:'))!;
describe('Round145 terminal gate guide',()=>{
 it('finds the real cross-region terminal gate without selecting or mutating an ending',()=>{
  const i=input();const before=JSON.stringify(i.endingGate);const e=entry(i);
  expect(e.category).toBe('landmark');expect(e.title).toContain(i.endingGate!.name);expect(e.detail).toContain('不代表结局条件已满足');
  expect(resolveRegionalGuideDestination(i,e.destinationId!)).toEqual({mapResourceId:i.endingGate!.mapResourceId,...i.endingGate!.position,name:i.endingGate!.name,approachRadius:1,arrivalAction:'ending'});
  expect(JSON.stringify(i.endingGate)).toBe(before);expect(i.knownKnowledgeNodeIds.size).toBe(0);
 });
 it('uses current authored coordinates and refuses stale or malformed selectors',()=>{
  const i=input();const e=entry(i);expect(resolveRegionalGuideDestination(i,REGION_GUIDE_PREFIX+'ending:missing')).toBeNull();expect(resolveRegionalGuideDestination(i,'ending:'+i.endingGate!.id)).toBeNull();
  const moved={...i,endingGate:{...i.endingGate!,position:{col:3,row:4}}};
  expect(resolveRegionalGuideDestination(moved,e.destinationId!)).toMatchObject({col:3,row:4});
  expect(resolveRegionalGuideDestination({...i,endingGate:{...i.endingGate!,id:'ending.gate.replaced'}},e.destinationId!)).toBeNull();
 });
 it('shows an unreachable gate without allowing navigation',()=>{
  const i=input();const blocked={...i,worldMap:{...i.worldMap,transitions:[]}};
  expect(entry(blocked).destinationId).toBeNull();expect(entry(blocked).detail).toContain('当前没有可达路线');
  expect(resolveRegionalGuideDestination(blocked,REGION_GUIDE_PREFIX+'ending:'+i.endingGate!.id)).toBeNull();
 });
 it('omitted gate preserves legacy entries and refuses stale destination',()=>{
  const i=input();const missing={...i,endingGate:undefined};expect(entry(missing)).toBeUndefined();expect(resolveRegionalGuideDestination(missing,entry(i).destinationId!)).toBeNull();
 });
 it('rejects missing gate region even when source and destination strings match',()=>{
  const i=input();const invalid={...i,currentMapResourceId:'missing',endingGate:{...i.endingGate!,mapResourceId:'missing'}};
  expect(entry(invalid).destinationId).toBeNull();expect(resolveRegionalGuideDestination(invalid,REGION_GUIDE_PREFIX+'ending:'+i.endingGate!.id)).toBeNull();
 });
 it('same-region gate needs no transition and arrival asks for deliberate inspection',()=>{
  const i=input();const same={...i,currentMapResourceId:i.endingGate!.mapResourceId};expect(entry(same).detail).toContain('跨 0 处关口');expect(entry(same).destinationId).not.toBeNull();
  expect(arrivalActionHint('ending')).toContain('按 E');expect(arrivalActionHint('ending')).toContain('不会自动结束');
 });
});
