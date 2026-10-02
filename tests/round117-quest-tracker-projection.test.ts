/**
 * Round 117: 切图后 HUD 差事行“附近人物”残留 —— 纯投影回归。
 *
 * 根因：updateQuestTrackerHud 只在启动、Q 日志导航、差事状态更新和通知
 * 计时到期四处被调用；switchRegion 与 NPC 换岗/伙伴重排路径都不重投影，
 * 于是真实跨区后 quest 行仍显示上一张地图的“附近：旧图人物 (c,r)”，直到
 * 无关状态偶然刷新。修复把整行文本/色调提纯为 projectQuestTrackerLine
 * （输入只有当前图 placedNpcs、玩家格、任务册与通知），并在切图、换岗、
 * 伙伴重排三处补上调用。以下测试直接驱动该投影：换任意输入立即得到当前
 * 地区的行文 —— 残留只可能来自“没刷新”，而三处调用点由源级护栏锁定。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectQuestTrackerLine } from '../src/game/quest-presentation';
import { createQuestJournal, type QuestData, type QuestJournal } from '../src/engine/quest-system';

interface NpcLike { col: number; row: number; record: { name: string; questGiver?: boolean } }

const quest = {
  id: 'q.r117-fixture', name: '试走差事', description: '', giverNpcId: 'n.giver',
  prerequisiteQuestIds: [],
  objectives: [
    { id: 'o1', kind: 'talkToNpc', targetId: 'n.other', requiredCount: 1, text: '找人问话' },
    { id: 'o2', kind: 'collectItem', targetId: 'item.x', requiredCount: 2, text: '收两件物' },
  ],
  failOnEncounterIds: [],
  rewards: { experience: 0, currency: 0 },
} as unknown as QuestData;
const quests = new Map([[quest.id, quest]]);

function journalWith (): QuestJournal {
  const journal = createQuestJournal(quests);
  journal.states.get(quest.id)!.status = 'active';
  journal.states.get(quest.id)!.objectiveCounts.set('o1', 1);
  return journal;
}
const project = (npcs: readonly NpcLike[], position: { col: number; row: number }, journal: QuestJournal = journalWith(), notice: string | null = null) =>
  projectQuestTrackerLine({ npcs, position, quests, journal, notice });

const ferryGuide: NpcLike = { col: 63, row: 61, record: { name: '渡口老丈', questGiver: true } };
const ridgeGuide: NpcLike = { col: 40, row: 45, record: { name: '岭上樵夫', questGiver: true } };
const plainPasserby: NpcLike = { col: 64, row: 63, record: { name: '过路客' } };

describe('Round117 HUD quest-line projection across regions and schedules', () => {
  it('boot and guide-less maps fall back to the plain journal hint', () => {
    expect(project([], { col: 5, row: 5 })).toEqual({ text: 'Q 查看差事 · H 查看操作', tone: 'guide' });
    // A map whose NPCs are all non-givers is equally "no guide here".
    expect(project([plainPasserby], { col: 63, row: 63 })).toEqual({ text: 'Q 查看差事 · H 查看操作', tone: 'guide' });
  });

  it('a notice wins while it lasts, then the live guide takes the line back', () => {
    expect(project([ferryGuide], { col: 63, row: 63 }, journalWith(), '差事完成：经验 +1')).toEqual({ text: '差事完成：经验 +1', tone: 'notice' });
    expect(project([ferryGuide], { col: 63, row: 63 }, journalWith(), null).tone).toBe('guide');
  });

  it('a tracked active quest shows its progress and beats the nearby guide', () => {
    const journal = journalWith();
    journal.trackedQuestId = quest.id;
    expect(project([ferryGuide], { col: 63, row: 63 }, journal)).toEqual({
      text: '跟踪：试走差事　找人问话 1/1 · 收两件物 0/2',
      tone: 'tracked',
    });
    // Tracked but no longer active (finished): the guide line returns.
    journal.states.get(quest.id)!.status = 'completed';
    expect(project([ferryGuide], { col: 63, row: 63 }, journal).tone).toBe('guide');
  });

  it('a region switch re-projects from the destination map placements immediately', () => {
    // Leaving the ferry: the scene swaps placedNpcs and the arrival cell in
    // switchRegion, then calls the tracker refresh — the old guide's name and
    // cell must be gone from the line in the same frame.
    const before = project([ferryGuide], { col: 63, row: 63 }, createQuestJournal(quests));
    expect(before.text).toBe('附近：渡口老丈 (63,61) · 相邻按 F 打听 / E 看托付 · Q 查差事');
    const after = project([ridgeGuide], { col: 40, row: 43 }, createQuestJournal(quests));
    expect(after.text).toBe('附近：岭上樵夫 (40,45) · 相邻按 F 打听 / E 看托付 · Q 查差事');
    expect(after.text).not.toContain('渡口老丈');
    // And a destination with no guide at all says so instead of naming the old one.
    expect(project([], { col: 40, row: 43 }, createQuestJournal(quests)).text).toBe('Q 查看差事 · H 查看操作');
  });

  it('a schedule change moves the quoted guide cell on the same map', () => {
    const morning: NpcLike = { col: 63, row: 61, record: { name: '渡口老丈', questGiver: true } };
    const night: NpcLike = { col: 60, row: 66, record: { name: '渡口老丈', questGiver: true } };
    expect(project([morning], { col: 63, row: 63 }, createQuestJournal(quests)).text).toContain('(63,61)');
    expect(project([night], { col: 63, row: 63 }, createQuestJournal(quests)).text).toContain('(60,66)');
  });

  it('the same-map projection is stable for identical inputs', () => {
    const journal = createQuestJournal(quests);
    const once = project([ferryGuide, plainPasserby], { col: 63, row: 62 }, journal);
    const twice = project([ferryGuide, plainPasserby], { col: 63, row: 62 }, journal);
    expect(once).toEqual(twice);
  });

  it('the three refresh call sites stay wired (source-level guard)', () => {
    // Behaviour is proven above on the pure projection; this guard only pins
    // the calls so a region switch or schedule change cannot silently stop
    // re-projecting the line (the Round 117 regression).
    const source = readFileSync(join(fileURLToPath(new URL('../', import.meta.url)), 'src/game/grid-scene.ts'), 'utf8');
    const switchRegionBody = source.slice(source.indexOf('  private switchRegion(')).split(/\n  private /)[0]!;
    expect(switchRegionBody).toContain('this.arriveAtMap(');
    const arrivalBody = source.slice(source.indexOf('  private arriveAtMap(')).split(/\n  private /)[0]!;
    expect(arrivalBody).toContain('this.updateQuestTrackerHud()');
    const syncNpcScheduleBody = source.slice(source.indexOf('  private syncNpcSchedule(')).split(/\n  private /)[0]!;
    expect(syncNpcScheduleBody).toContain('this.updateQuestTrackerHud()');
    const refreshNpcPlacementsBody = source.slice(source.indexOf('  private refreshNpcPlacements(')).split(/\n  private /)[0]!;
    expect(refreshNpcPlacementsBody).toContain('this.updateQuestTrackerHud()');
  });
});
