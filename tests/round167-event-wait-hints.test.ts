import {describe,it,expect} from 'vitest';
import {regionEventNavigationHint} from '../src/engine/region-event-navigation';
import type {RegionEventData} from '../src/engine/world-map';
const make=(conditions:RegionEventData['conditions']):RegionEventData=>({id:'event.test',text:'测试',mapResourceId:'map.test',col:1,row:1,once:true,conditions,interaction:{prompt:'调查'}});
const context={knownKnowledgeNodeIds:new Set<string>(),periodId:'period.day',weatherId:'weather.clear',nearbyNpcIds:new Set<string>()};
describe('Round167 actionable region event waiting hints',()=>{
 it('does not promise waiting supplies knowledge',()=>{const text=regionEventNavigationHint(make({knowledgeNodeIds:['node.test']}),context);expect(text).toContain('先查 Q/R');expect(text).not.toContain('V 等候');});
 it('directs missing people to current navigation',()=>{expect(regionEventNavigationHint(make({nearbyNpcIds:['npc.test']}),context)).not.toContain('V 等候');});
 it('permits waiting for time and weather while retaining other prerequisites',()=>{const text=regionEventNavigationHint(make({periodIds:['period.night'],weatherIds:['weather.snow'],knowledgeNodeIds:['node.test']}),context);expect(text).toContain('V 等候');expect(text).toContain('前置见闻');});
 it('retains impossible season warning and eligible action',()=>{expect(regionEventNavigationHint(make({weatherIds:['weather.snow']}),{...context,possibleWeatherIds:new Set(['weather.clear'])})).toContain('本季不会出现');expect(regionEventNavigationHint(make({}),context)).toBe('按 E 调查');});
});
