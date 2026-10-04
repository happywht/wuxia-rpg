import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import Ajv from 'ajv';
import { loadWorldData, type LoadedWorld } from '../src/game/world-loader';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { transitionAccessReason } from '../src/engine/transition-access';
import { findWorldTravelRoute } from '../src/engine/world-travel';
import { buildWorldMapWaypoints } from '../src/engine/world-navigation';
import { resolveCellNavigationGuide } from '../src/engine/world-navigation-guidance';
import { buildRegionalGuideEntries, resolveRegionalGuideDestination, type RegionalGuideInput } from '../src/engine/regional-guide';
import { addCoastalService, addCoastalServiceDirections, COASTAL_SERVICES, COASTAL_SERVICE_KNOWLEDGE } from '../scripts/lib/round126-coastal-service.mjs';
const raw = JSON.parse(readFileSync('data/base/world/world-map.json','utf8'));
const ferry='map.round-10-mist-ferry', coast='map.round-82-east-coast';
const known = new Set([COASTAL_SERVICE_KNOWLEDGE]);
let world: LoadedWorld;
beforeAll(async () => {
  vi.spyOn(console,'info').mockImplementation(()=>{}); vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    try { return new Response(readFileSync(join(resolve('.'),'data',decodeURIComponent(new URL(url,'http://r126.test').pathname)),'utf8'),{status:200,headers:{'content-type':'application/json'}}); }
    catch { return new Response('not found',{status:404}); }
  });
  const loaded=await loadWorldData(); if(!loaded.ok) throw Error(loaded.lines.join('\n')); world=loaded.world;
});
afterAll(()=>{vi.unstubAllGlobals(); vi.restoreAllMocks();});
function guide(unlocked=false):RegionalGuideInput {
  return {worldMap:world.worldMap,currentMapResourceId:ferry,baseNpcs:world.assembly.npcs,
    shops:world.assembly.shops,items:world.assembly.items,shopStocks:new Map(),
    knownKnowledgeNodeIds:unlocked?known:new Set(),liveCurrency:531,travelMinutes:45};
}
describe('Round126 discovery-gated coastal service',()=>{
  it('accepts the optional protocol and keeps legacy gates open',()=>{
    expect(parseWorldMap(raw).ok).toBe(true);
    expect(transitionAccessReason(raw.transitions[0])).toBeNull();
    for(const gate of COASTAL_SERVICES) {
      expect(transitionAccessReason(gate)).toContain('先经陆路');
      expect(transitionAccessReason(gate,known)).toBeNull();
      const fallback={...gate,lockedText:undefined};
      expect(transitionAccessReason(fallback)).toContain(COASTAL_SERVICE_KNOWLEDGE);
    }
  });
  it('rejects blank and invalid optional fields in both parser and Schema',()=>{
    const schema=JSON.parse(readFileSync('data/schema/world-map.schema.json','utf8'));
    const validate=new Ajv({strict:false}).compile(schema); expect(validate(raw)).toBe(true);
    for(const field of ['requiredKnowledgeNodeId','lockedText'])for(const value of ['', '  ',null,5]) {
      const broken=structuredClone(raw); broken.transitions.at(-1)[field]=value;
      expect(parseWorldMap(broken).ok,field+String(value)).toBe(false);
      expect(validate(broken)).toBe(false);
    }
  });
  it('loads the existing world and keeps both endpoints free in every NPC period',()=>{
    expect(world.optionalWarnings).toEqual([]); expect(world.maps.size).toBe(22);
    expect(world.assembly.quests.size).toBe(65); expect(world.worldMap.transitions).toHaveLength(56); // incl. two R278 shore-boat gates
    expect(world.knowledgeGraph.nodes.has(COASTAL_SERVICE_KNOWLEDGE)).toBe(true);
    for(const service of COASTAL_SERVICES)for(const point of [service.from,service.to]) {
      expect(world.maps.get(point.mapResourceId)!.canEnter(point.col,point.row)).toBe(true);
      for(const period of world.assembly.npcsByPeriod.values())
        expect(period.some(n=>n.record.mapResourceId===point.mapResourceId&&n.col===point.col&&n.row===point.row)).toBe(false);
      expect(world.assembly.encounters.some(e=>e.record.mapResourceId===point.mapResourceId&&e.col===point.col&&e.row===point.row)).toBe(false);
    }
  });
  it('isolates a MOD gate whose discovery reference is missing',()=>{
    const broken=structuredClone(raw); broken.transitions.at(-1).requiredKnowledgeNodeId='place.missing';
    const parsed=parseWorldMap(broken); if(!parsed.ok)throw Error('fixture');
    const assembled=assembleWorldMap(parsed.data,world.maps,{knowledgeNodeIds:new Set(world.knowledgeGraph.nodes.keys()),periodIds:new Set(),weatherIds:new Set()});
    if('ok' in assembled)throw Error('assembly');
    expect(assembled.transitions).toHaveLength(55); // 56 minus the isolated broken gate
    expect(assembled.transitions.some(g=>g.id===COASTAL_SERVICES[0]!.id)).toBe(true);
    expect(assembled.warnings.join('\n')).toContain('通行见闻未登记：place.missing');
  });
  it('keeps first exploration on three land legs and unlocks both direct directions',()=>{
    expect(findWorldTravelRoute(world.worldMap,ferry,coast)!.legs).toHaveLength(3);
    expect(findWorldTravelRoute(world.worldMap,coast,ferry)!.legs).toHaveLength(3);
    expect(findWorldTravelRoute(world.worldMap,ferry,coast,known)!.legs.map(l=>l.transition.id)).toEqual([COASTAL_SERVICES[0]!.id]);
    expect(findWorldTravelRoute(world.worldMap,coast,ferry,known)!.legs.map(l=>l.transition.id)).toEqual([COASTAL_SERVICES[1]!.id]);
    const regionId='region:'+coast;
    expect(buildWorldMapWaypoints(world.worldMap,ferry,new Set()).some(p=>p.id===regionId)).toBe(false);
    expect(buildWorldMapWaypoints(world.worldMap,ferry,known).find(p=>p.id===regionId))
      .toMatchObject({position:{col:18,row:9},nextTransitionName:COASTAL_SERVICES[0]!.name});
  });
  it('uses the same qualification for live path guidance and R destinations',()=>{
    const destination={mapResourceId:coast,col:73,row:67,name:'测试目的地'};
    const locked=resolveCellNavigationGuide(world.worldMap,ferry,destination,world.maps.get(ferry)!,{col:18,row:10});
    const open=resolveCellNavigationGuide(world.worldMap,ferry,destination,world.maps.get(ferry)!,{col:18,row:10},undefined,undefined,known);
    expect('regionRouteNames' in locked&&locked.regionRouteNames).toHaveLength(4);
    expect('nextTransitionName' in open&&open.nextTransitionName).toBe(COASTAL_SERVICES[0]!.name);
    const entry=buildRegionalGuideEntries(guide()).find(e=>e.id==='exit:'+COASTAL_SERVICES[0]!.id)!;
    expect(entry.destinationId).toBeNull(); expect(entry.detail).toContain('尚未开通');
    const unlocked=buildRegionalGuideEntries(guide(true)).find(e=>e.id===entry.id)!;
    expect(unlocked.detail).toContain('30'); expect(unlocked.detail).toContain('90');
    expect(unlocked.destinationId).not.toBeNull();
    expect(resolveRegionalGuideDestination(guide(),unlocked.destinationId!)).toBeNull();
    expect(resolveRegionalGuideDestination(guide(true),unlocked.destinationId!)).not.toBeNull();
  });
  it('regenerates without replacing any of the previous 54 gates',()=>{
    expect(addCoastalService(raw)).toEqual(raw); expect(addCoastalService(addCoastalService(raw))).toEqual(raw);
    const previous={...raw,transitions:raw.transitions.filter((g:{id:string})=>!g.id.startsWith('gate.r126-'))};
    expect(addCoastalService(previous).transitions.slice(0,54)).toEqual(previous.transitions); // 52 through R123 + two R278 gates
    expect({...addCoastalService(previous),transitions:[]}).toEqual({...previous,transitions:[]});
  });
  it('adds three idempotent directions with no gameplay effects',()=>{
    let count=0;
    for(const file of ['round-30-conversations.json','round-83-east-coast-conversations.json']) {
      const set=JSON.parse(readFileSync('data/base/dialogues/'+file,'utf8'));
      const once=addCoastalServiceDirections(set);
      expect(addCoastalServiceDirections(once)).toEqual(once);
      for(const conversation of once.conversations)for(const node of conversation.nodes)if(node.id==='r126-coastal-service') {
        count++; expect(node.effects).toBeUndefined(); expect(node.text).toContain('30银'); expect(node.text).toContain('90世界分钟');
        expect(node.options.every((o:{effects?:unknown})=>o.effects===undefined)).toBe(true);
      }
    }
    expect(count).toBe(3);
  });
});
