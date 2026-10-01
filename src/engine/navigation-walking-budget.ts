import type { CalendarActionCosts } from './game-calendar';
import type { WorldNavigationGuide } from './world-navigation-guidance';

/** A projection of the current local path, never a charge or a saved promise. */
export interface NavigationWalkingBudget {
  steps: number;
  minutesPerStep: number;
  minutes: number;
  mayCrossMidnight: boolean;
}

export function estimateNavigationWalkingBudget(
  guide: WorldNavigationGuide | null,
  costs: Pick<CalendarActionCosts, 'stepMinutes'> | undefined,
  weatherStepMinutes: number,
  minuteOfDay?: number,
): NavigationWalkingBudget | null {
  if (guide?.status !== 'en-route' || costs === undefined || guide.path.length < 2) return null;
  if (![costs.stepMinutes, weatherStepMinutes].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  if (minuteOfDay !== undefined && (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 1440)) return null;
  const steps = guide.path.length - 1;
  const minutesPerStep = costs.stepMinutes + weatherStepMinutes;
  const minutes = steps * minutesPerStep;
  if (!Number.isSafeInteger(minutes)) return null;
  return { steps, minutesPerStep, minutes,
    mayCrossMidnight: minuteOfDay !== undefined && minutes > 0 && minuteOfDay + minutes >= 1440 };
}

export function navigationWalkingBudgetHint(budget: NavigationWalkingBudget): string {
  return `本区步行估算${budget.minutes}分（当前天气，不含过关）${budget.mayCrossMidnight ? '；可能跨午夜，天气变化后重算' : '；时段与天气变化会重算'}`;
}
