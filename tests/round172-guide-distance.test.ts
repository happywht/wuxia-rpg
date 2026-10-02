import { describe, expect, it } from 'vitest';
import { projectQuestTrackerLine } from '../src/game/quest-presentation';
import { createQuestJournal } from '../src/engine/quest-system';
const quests = new Map();
function project(col: number, row: number, shopId?: string) {
  return projectQuestTrackerLine({npcs:[{col:4,row:5,record:{name:'fixture',questGiver:true,shopId}}],position:{col,row},quests,journal:createQuestJournal(quests),notice:null}).text;
}
describe('Round172 live guide proximity', () => {
  it('keeps adjacent ordinary and shop interaction hints', () => {
    expect(project(4,4)).toContain('附近：fixture');
    expect(project(3,5,'shop.fixture')).toContain('E 看商铺');
  });
  it('quotes Manhattan distance for a remote guide without calling it nearby', () => {
    expect(project(50,96)).toContain('相距137格');
    expect(project(50,96)).not.toContain('附近：');
  });
  it('does not imply diagonal or same-cell interaction', () => {
    expect(project(3,4)).toContain('相距2格');
    expect(project(4,5)).toContain('相距0格');
  });
  it('updates the hint as the player approaches and leaves', () => {
    expect(project(4,3)).toContain('人物线索：');
    expect(project(4,4)).toContain('附近：');
    expect(project(4,2)).toContain('相距3格');
  });
});
