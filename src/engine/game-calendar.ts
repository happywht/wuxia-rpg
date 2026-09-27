/**
 * Data-driven in-game calendar protocol: wire types, defensive parsing with
 * cross-field semantic checks, and the Phaser-free {@link GameClock} that
 * converts elapsed minutes into calendar dates and circular day periods.
 *
 * The module knows the *protocol* only — month names, period names and
 * lighting levels all come from `data/base/worldview/calendar.json` (shape
 * pinned by `data/schema/game-calendar.schema.json`). Nothing here reads the
 * real-world clock: time advances exclusively through successful player
 * actions, so a blocked move, a refused transition or an open overlay
 * consumes nothing.
 *
 * Design notes:
 *
 * - The authoritative state is a single elapsed-minute counter relative to
 *   the calendar's configured start. Derived year/month/day values are
 *   recomputed on demand, so a data update that changes month lengths never
 *   contradicts a saved counter (saves persist minutes, not dates).
 * - Day periods partition the 1440-minute day circularly: the period with
 *   `startMinute === 0` exists (semantic validation rejects calendars
 *   without it and without unique start minutes), which lets the lookup
 *   treat midnight-crossing periods — typically night — as a plain wrap
 *   instead of a special case.
 */

/** Fixed protocol constant: one in-game day is always 1440 minutes. */
export const MINUTES_PER_DAY = 1440;

/** Protocol bounds mirrored from the schema for the defensive parser. */
const MAX_MONTHS = 24;
const MAX_MONTH_DAYS = 60;
const MAX_PERIODS = 24;
const MAX_YEAR = 9999;

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/** One calendar month; `days` counts in-game days, not real ones. */
export interface CalendarMonthData {
  id: string;
  name: string;
  days: number;
}

/**
 * One day period such as dawn or night. `startMinute` is the minute of the
 * day (0–1439) at which the period begins; the period lasts until the next
 * period starts (or until midnight wraps back to the zero-minute period).
 * `lightLevel` (0–1) is the scene illumination the period provides.
 */
export interface CalendarPeriodData {
  id: string;
  name: string;
  startMinute: number;
  lightLevel: number;
}

/** Configured minute costs of the three time-advancing player actions. */
export interface CalendarActionCosts {
  /** Minutes per successful grid step; 0 disables movement cost. */
  stepMinutes: number;
  /** Minutes per successful region transition. */
  travelMinutes: number;
  /** Minutes per explicit wait command. */
  waitMinutes: number;
}

/** Wire format of a game-calendar JSON resource. */
export interface GameCalendarData {
  id: string;
  /** In-game moment a fresh run starts from. */
  start: {
    year: number;
    monthId: string;
    day: number;
    minuteOfDay: number;
  };
  months: readonly CalendarMonthData[];
  /** Sorted ascending by `startMinute`; begins with the zero-minute period. */
  periods: readonly CalendarPeriodData[];
  actionCosts: CalendarActionCosts;
}

export type CalendarParseResult =
  | { ok: true; calendar: GameCalendarData }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Defensive parsing + semantic validation
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Non-empty string or null. */
function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Finite integer in [min, max] or null. */
function requireIntegerInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** Finite number in [min, max] or null (lightLevel allows fractions). */
function requireNumberInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/**
 * Defensive re-parse of a game-calendar document. The Ajv schema already
 * rejected static shape violations at load time; this layer adds the
 * cross-field semantics a schema cannot express (unique ids and start
 * minutes, a zero-minute period, start references resolving, the start day
 * fitting its month, non-empty action costs). Every problem is readable and
 * together they refuse the whole resource — a calendar is required world
 * data, so partial adoption would silently desynchronise time from data.
 */
export function parseGameCalendar(raw: unknown): CalendarParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw) || !requireNonEmptyString((raw as { id?: unknown }).id)) {
    return { ok: false, errors: ['game-calendar：根节点应为含非空 id 的对象'] };
  }

  const rawMonths = (raw as { months?: unknown }).months;
  const months: CalendarMonthData[] = [];
  if (!Array.isArray(rawMonths) || rawMonths.length === 0) {
    errors.push('months：应为至少含一个月的数组');
  } else {
    const seenMonthIds = new Set<string>();
    rawMonths.forEach((entry, index) => {
      const label = `months[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const id = source === null ? null : requireNonEmptyString(source.id);
      const name = source === null ? null : requireNonEmptyString(source.name);
      const days = source === null ? null : requireIntegerInRange(source.days, 1, MAX_MONTH_DAYS);
      if (id === null) errors.push(`${label}.id：应为非空字符串`);
      else if (seenMonthIds.has(id)) errors.push(`${label}.id："${id}" 与前面的月份重复`);
      if (name === null) errors.push(`${label}.name：应为非空字符串`);
      if (days === null) errors.push(`${label}.days：应为 1–${MAX_MONTH_DAYS} 的整数`);
      if (id !== null && name !== null && days !== null) {
        seenMonthIds.add(id);
        months.push({ id, name, days });
      }
    });
    if (rawMonths.length > MAX_MONTHS) {
      errors.push(`months：最多 ${MAX_MONTHS} 个月`);
    }
  }

  const rawPeriods = (raw as { periods?: unknown }).periods;
  const periods: CalendarPeriodData[] = [];
  if (!Array.isArray(rawPeriods) || rawPeriods.length === 0) {
    errors.push('periods：应为至少含一个时段的数组');
  } else {
    const seenPeriodIds = new Set<string>();
    const seenStartMinutes = new Set<number>();
    let hasZeroMinutePeriod = false;
    rawPeriods.forEach((entry, index) => {
      const label = `periods[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const id = source === null ? null : requireNonEmptyString(source.id);
      const name = source === null ? null : requireNonEmptyString(source.name);
      const startMinute =
        source === null ? null : requireIntegerInRange(source.startMinute, 0, MINUTES_PER_DAY - 1);
      const lightLevel = source === null ? null : requireNumberInRange(source.lightLevel, 0, 1);
      if (id === null) errors.push(`${label}.id：应为非空字符串`);
      else if (seenPeriodIds.has(id)) errors.push(`${label}.id："${id}" 与前面的时段重复`);
      if (name === null) errors.push(`${label}.name：应为非空字符串`);
      if (startMinute === null) {
        errors.push(`${label}.startMinute：应为 0–${MINUTES_PER_DAY - 1} 的整数`);
      } else {
        if (seenStartMinutes.has(startMinute)) {
          errors.push(`${label}.startMinute：${startMinute} 与前面时段的起点重复`);
        }
        if (startMinute === 0) hasZeroMinutePeriod = true;
      }
      if (lightLevel === null) errors.push(`${label}.lightLevel：应为 0–1 的数值`);
      if (id !== null && name !== null && startMinute !== null && lightLevel !== null) {
        seenPeriodIds.add(id);
        seenStartMinutes.add(startMinute);
        periods.push({ id, name, startMinute, lightLevel });
      }
    });
    if (rawPeriods.length > MAX_PERIODS) {
      errors.push(`periods：最多 ${MAX_PERIODS} 个时段`);
    }
    if (Array.isArray(rawPeriods) && rawPeriods.length > 0 && !hasZeroMinutePeriod) {
      errors.push('periods：缺少 startMinute 为 0 的零点时段（午夜起点的时段必须显式定义）');
    }
  }

  const startEntry = (raw as { start?: unknown }).start;
  const startSource = isPlainObject(startEntry) ? startEntry : null;
  const startYear = startSource === null ? null : requireIntegerInRange(startSource.year, 1, MAX_YEAR);
  const startMonthId = startSource === null ? null : requireNonEmptyString(startSource.monthId);
  const startMinuteOfDay =
    startSource === null ? null : requireIntegerInRange(startSource.minuteOfDay, 0, MINUTES_PER_DAY - 1);
  if (startSource === null || startYear === null || startMonthId === null || startMinuteOfDay === null) {
    errors.push('start：应含 year（1–9999 整数）、monthId（非空）、minuteOfDay（0–1439 整数）');
  }
  if (startMonthId !== null && months.length > 0 && !months.some((month) => month.id === startMonthId)) {
    errors.push(`start.monthId："${startMonthId}" 未在 months 中声明`);
  }
  // The day bound depends on the referenced month's length, so it can only
  // be checked once both halves parsed.
  if (startSource !== null && startMonthId !== null) {
    const month = months.find((entry) => entry.id === startMonthId);
    const declaredDay = startSource.day;
    if (month === undefined && months.length > 0) {
      // Already reported above as a dangling monthId; nothing new to add.
    } else if (month !== undefined) {
      const day = requireIntegerInRange(declaredDay, 1, month.days);
      if (day === null) {
        errors.push(`start.day：应为 1–${month.days} 的整数（月份 "${month.id}" 共 ${month.days} 天）`);
      }
    } else if (requireIntegerInRange(declaredDay, 1, MAX_MONTH_DAYS) === null) {
      errors.push(`start.day：应为 1–${MAX_MONTH_DAYS} 的整数`);
    }
  }

  const costsSource = isPlainObject((raw as { actionCosts?: unknown }).actionCosts)
    ? (raw as { actionCosts: Record<string, unknown> }).actionCosts
    : null;
  const stepMinutes =
    costsSource === null ? null : requireIntegerInRange(costsSource.stepMinutes, 0, MINUTES_PER_DAY);
  const travelMinutes =
    costsSource === null ? null : requireIntegerInRange(costsSource.travelMinutes, 1, MINUTES_PER_DAY);
  const waitMinutes =
    costsSource === null ? null : requireIntegerInRange(costsSource.waitMinutes, 1, MINUTES_PER_DAY);
  if (stepMinutes === null || travelMinutes === null || waitMinutes === null) {
    errors.push(
      'actionCosts：应含 stepMinutes（0–1440 整数）、travelMinutes（1–1440 整数）与 waitMinutes（1–1440 整数）',
    );
  }

  if (
    errors.length > 0 ||
    startYear === null ||
    startMonthId === null ||
    startMinuteOfDay === null ||
    stepMinutes === null ||
    travelMinutes === null ||
    waitMinutes === null
  ) {
    return { ok: false, errors };
  }
  const startDay = requireIntegerInRange(
    startSource?.day,
    1,
    months.find((month) => month.id === startMonthId)?.days ?? MAX_MONTH_DAYS,
  );
  if (startDay === null) {
    return { ok: false, errors }; // Unreachable: reported in the block above.
  }

  // Ascending start-minute order with the zero-minute period first makes the
  // circular lookup in GameClock a linear scan.
  periods.sort((a, b) => a.startMinute - b.startMinute);
  return {
    ok: true,
    calendar: {
      id: (raw as { id: string }).id,
      start: { year: startYear, monthId: startMonthId, day: startDay, minuteOfDay: startMinuteOfDay },
      months,
      periods,
      actionCosts: { stepMinutes, travelMinutes, waitMinutes },
    },
  };
}

// ---------------------------------------------------------------------------
// Game clock
// ---------------------------------------------------------------------------

/** A resolved calendar moment; `monthIndex` is 0-based, `day` 1-based. */
export interface CalendarTimestamp {
  year: number;
  monthIndex: number;
  day: number;
  minuteOfDay: number;
}

/** Total in-game days one full year of the calendar spans. */
export function daysPerYear(calendar: GameCalendarData): number {
  return calendar.months.reduce((total, month) => total + month.days, 0);
}

/**
 * Pure time rule engine for one run. Holds a single elapsed-minute counter
 * relative to the calendar's start and derives every date/period answer from
 * it; it never reads the system clock and only {@link advance} mutates it.
 */
export class GameClock {
  private readonly calendarData: GameCalendarData;
  private elapsed: number;

  constructor(calendar: GameCalendarData, elapsedMinutes = 0) {
    this.calendarData = calendar;
    this.elapsed = Number.isSafeInteger(elapsedMinutes) && elapsedMinutes >= 0 ? elapsedMinutes : 0;
  }

  get calendar(): GameCalendarData {
    return this.calendarData;
  }

  /** Minutes elapsed since the calendar start; 0 is the start moment. */
  get elapsedMinutes(): number {
    return this.elapsed;
  }

  /**
   * Advances time by a positive, finite number of minutes. Returns whether
   * the clock moved — zero, negative, fractional or NaN inputs (blocked,
   * failed or no-op actions) change nothing.
   */
  advance(minutes: number): boolean {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) {
      return false;
    }
    const nextElapsed = this.elapsed + minutes;
    if (!Number.isSafeInteger(nextElapsed)) {
      return false;
    }
    this.elapsed = nextElapsed;
    return true;
  }

  /** Derived calendar moment of the current elapsed counter. */
  snapshot(): CalendarTimestamp {
    const { start, months } = this.calendarData;
    // Split before adding the start minute so even a maximum-safe elapsed
    // counter retains exact day/minute arithmetic.
    const elapsedDays = Math.floor(this.elapsed / MINUTES_PER_DAY);
    const elapsedMinuteOfDay = this.elapsed % MINUTES_PER_DAY;
    const minuteSum = start.minuteOfDay + elapsedMinuteOfDay;
    const minuteOfDay = minuteSum % MINUTES_PER_DAY;

    let year = start.year;
    let monthIndex = months.findIndex((month) => month.id === start.monthId);
    if (monthIndex < 0) monthIndex = 0; // Parser guarantees resolution; defensive only.
    let dayOffset = start.day - 1 + elapsedDays + Math.floor(minuteSum / MINUTES_PER_DAY);

    // Fold whole years arithmetically first so very large counters stay O(1)
    // per year, then walk the (short) month tail.
    const yearLength = daysPerYear(this.calendarData);
    if (yearLength > 0 && dayOffset >= yearLength) {
      year += Math.floor(dayOffset / yearLength);
      dayOffset %= yearLength;
    }
    while (dayOffset >= (months[monthIndex]?.days ?? 1)) {
      dayOffset -= months[monthIndex]?.days ?? 1;
      monthIndex += 1;
      if (monthIndex >= months.length) {
        monthIndex = 0;
        year += 1;
      }
    }

    return { year, monthIndex, day: dayOffset + 1, minuteOfDay };
  }

  /**
   * The period currently in effect. With the zero-minute period guaranteed
   * by parsing, the linear scan over ascending start minutes handles
   * midnight-crossing periods naturally: minutes before the first non-zero
   * start simply belong to the last period of the day.
   */
  currentPeriod(): CalendarPeriodData {
    const { periods } = this.calendarData;
    const minuteOfDay = this.snapshot().minuteOfDay;
    const first = periods[0];
    if (first === undefined) {
      // Parser guarantees at least one period; unreachable defensively.
      throw new Error('calendar periods must not be empty');
    }
    let current = first;
    for (const period of periods) {
      if (period.startMinute <= minuteOfDay) {
        current = period;
      } else {
        break;
      }
    }
    return current;
  }

  /** Minutes passed since the current period began (0 exactly at its start). */
  minutesIntoPeriod(): number {
    const minuteOfDay = this.snapshot().minuteOfDay;
    const current = this.currentPeriod();
    if (current.startMinute <= minuteOfDay) {
      return minuteOfDay - current.startMinute;
    }
    // Midnight wrap: from the last period's start through midnight into today.
    return MINUTES_PER_DAY - current.startMinute + minuteOfDay;
  }
}
