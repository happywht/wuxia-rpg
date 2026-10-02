import {describe,it,expect} from 'vitest';
import {projectQuestTrackerLine} from '../src/game/quest-presentation';
import {createQuestJournal} from '../src/engine/quest-system';
const quests=new Map();
function line(shopId?:string|null,notice:string|null=null) {
 return projectQuestTrackerLine({npcs:[{col:4,row:5,record:{name:'fixture',questGiver:true,...(shopId===undefined?{}:{shopId})}}],position:{col:4,row:4},quests,journal:createQuestJournal(quests),notice});
}
describe('Round160 merchant guide action',()=>{
 it('quotes F, E shop and Q quest actions for a shop giver',()=>{
  expect(line('fixture.shop').text).toBe('附近：fixture (4,5) · 相邻按 F 打听 / E 看商铺 · Q 查差事');
 });
 it('preserves ordinary and legacy missing/null shop hints',()=>{
  for(const shop of [undefined,null,''])expect(line(shop).text).toContain('E 看托付');
 });
 it('keeps reward notice priority',()=>{
  expect(line('fixture.shop','notice')).toEqual({text:'notice',tone:'notice'});
 });
});
