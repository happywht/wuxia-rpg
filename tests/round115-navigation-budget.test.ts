import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateNavigationWalkingBudget, navigationWalkingBudgetHint } from '../src/engine/navigation-walking-budget';
import type { WorldNavigationGuide, WorldNavigationGuideSegment } from '../src/engine/world-navigation-guidance';
import { ClimateRuntime, parseClimate } from '../src/engine/climate-system';
import { parseGameCalendar } from '../src/engine/game-calendar';

function guide(steps: number): WorldNavigationGuideSegment {
  return { status: 'en-route', destinationName: '目标', destinationRegionName: '地区',
    regionRouteNames: ['地区', '其他地区'], nextTransitionName: '关口',
    path: Array.from({ length: steps + 1 }, (_, row) => ({ col: 0, row })) };
}
const costs = { stepMinutes: 1 };
describe('Round115 current-region walking budget', () => {
  it('uses successful local steps, counts no starting cell and excludes gate costs', () => {
    const budget = estimateNavigationWalkingBudget(guide(60), costs, 2, 202)!;
    expect(budget).toEqual({ steps: 60, minutesPerStep: 3, minutes: 180, mayCrossMidnight: false });
    expect(navigationWalkingBudgetHint(budget)).toContain('不含过关');
    expect(navigationWalkingBudgetHint(budget)).toContain('本区');
  });
  it('updates as the remaining path and weather change instead of persisting a total', () => {
    expect(estimateNavigationWalkingBudget(guide(59), costs, 2)?.minutes).toBe(177);
    expect(estimateNavigationWalkingBudget(guide(59), costs, 0)?.minutes).toBe(59);
    expect(estimateNavigationWalkingBudget(guide(59), costs, 3)?.minutes).toBe(236);
  });
  it('warns at an exact midnight boundary and never claims the next weather', () => {
    const budget = estimateNavigationWalkingBudget(guide(49), costs, 2, 1293)!;
    expect(budget.mayCrossMidnight).toBe(true);
    expect(navigationWalkingBudgetHint(budget)).toContain('可能跨午夜');
    expect(estimateNavigationWalkingBudget(guide(48), costs, 2, 1293)?.mayCrossMidnight).toBe(false);
  });
  it('accepts zero-time movement but does not invent a midnight crossing', () => {
    expect(estimateNavigationWalkingBudget(guide(100), { stepMinutes: 0 }, 0, 1439))
      .toEqual({ steps: 100, minutesPerStep: 0, minutes: 0, mayCrossMidnight: false });
  });
  it('recomputes a wait within the same night period without charging the path', () => {
    const path = guide(30);
    expect(estimateNavigationWalkingBudget(path, costs, 2, 1320)?.mayCrossMidnight).toBe(false);
    expect(estimateNavigationWalkingBudget(path, costs, 2, 1380)?.mayCrossMidnight).toBe(true);
    expect(path.path).toHaveLength(31);
  });
  it.each(['arrived', 'at-gate', 'route-blocked', 'route-broken', 'target-lost'] as const)('does not quote a walk for %s', status => {
    const projected = { ...guide(60), status } as WorldNavigationGuide;
    expect(estimateNavigationWalkingBudget(projected, costs, 2)).toBeNull();
  });
  it('omits unavailable or invalid inputs rather than fabricating a free journey', () => {
    expect(estimateNavigationWalkingBudget(null, costs, 2)).toBeNull();
    expect(estimateNavigationWalkingBudget(guide(60), undefined, 2)).toBeNull();
    expect(estimateNavigationWalkingBudget(guide(0), costs, 2)).toBeNull();
    for (const value of [-1, NaN, Infinity, 0.5]) expect(estimateNavigationWalkingBudget(guide(60), costs, value)).toBeNull();
    expect(estimateNavigationWalkingBudget(guide(60), { stepMinutes: -1 }, 0)).toBeNull();
    expect(estimateNavigationWalkingBudget(guide(60), costs, 2, 1440)).toBeNull();
    expect(estimateNavigationWalkingBudget(guide(60), { stepMinutes: Number.MAX_SAFE_INTEGER }, 2)).toBeNull();
  });
  it('derives northern and warm-region costs from the actual calendar and climate tables', () => {
    const calendar = parseGameCalendar(JSON.parse(readFileSync('data/base/worldview/calendar.json', 'utf8')));
    if (!calendar.ok) throw Error(calendar.errors.join('\n'));
    const data = parseClimate(JSON.parse(readFileSync('data/base/worldview/climate.json', 'utf8')), calendar.calendar);
    if (!data.ok) throw Error(data.errors.join('\n'));
    const climate = new ClimateRuntime(data.climate, calendar.calendar);
    const stamp = { year: 1, monthIndex: 0, day: 4, minuteOfDay: 202 };
    for (const map of ['map.round-92-north-pass', 'map.round-91-cloud-north-terrace']) {
      const weather = climate.weatherForDay(1, stamp, map);
      const budget = estimateNavigationWalkingBudget(guide(60), calendar.calendar.actionCosts, weather.stepMinutes, stamp.minuteOfDay)!;
      expect(budget.minutes).toBe(60 * (calendar.calendar.actionCosts.stepMinutes + weather.stepMinutes));
    }
  });
  it('connects the live scene HUD to current path, calendar, local weather and clock', () => {
    const source = readFileSync('src/game/grid-scene.ts', 'utf8');
    expect(source).toContain('estimateNavigationWalkingBudget(guide, this.clock?.calendar.actionCosts');
    expect(source).toContain('this.currentClimate()?.weather.stepMinutes ?? 0, this.clock?.snapshot().minuteOfDay');
    expect(source).toContain('navigationWalkingBudgetHint(budget)');
    const move = source.slice(source.indexOf('private tryMove('), source.indexOf('private updatePlayerActorFrame('));
    expect(move.indexOf('this.refreshNavigationGuide()')).toBeGreaterThan(move.indexOf('this.advanceTime(baseStepMinutes + weatherStepMinutes)'));
    const wait = source.slice(source.indexOf('private handleWait('), source.indexOf('private updateTimeHud('));
    expect(wait.indexOf('this.refreshNavigationGuide()')).toBeGreaterThan(wait.indexOf('this.advanceTime(minutes)'));
  });
});
