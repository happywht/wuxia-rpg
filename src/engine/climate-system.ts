/**
 * Data-driven climate protocol: wire types, defensive parsing with
 * cross-resource semantic checks, and the Phaser-free {@link ClimateRuntime}
 * that derives the current season, deterministic daily weather and optional
 * tide phase from persisted game state.
 *
 * The module knows the *protocol* only — season names, weather names, tint
 * colors, precipitation styles and extra step minutes all come from
 * `data/base/worldview/climate.json` (shape pinned by
 * `data/schema/climate.schema.json`). Nothing here reads the real-world clock
 * or any entropy source: the weather of a day is a pure function of
 * (world seed, day index, climate data), so the same save always replays the
 * same weather, and a data author reshaping weights changes distributions
 * without touching engine code.
 *
 * Design notes:
 *
 * - Seasons partition the calendar months: with a calendar handed over, the
 *   parser demands every calendar month be claimed by exactly one season —
 *   no gaps, no overlaps. Without a calendar (the generic data-loader
 *   semantic validator) it still rejects duplicate season/weather ids and
 *   month ids claimed twice inside the document, so the resource never
 *   reaches the world half-validated.
 * - The daily draw is a single 32-bit hash of (seed, dayIndex) mapped onto
 *   the season's cumulative weight table. `Math.imul` keeps the mixing in
 *   exact 32-bit arithmetic; one weather per whole game day keeps the HUD
 *   stable and the visual layer free of per-minute churn.
 * - An optional tide cycle is a pure modulo of the in-game minute and a
 *   data-authored phase offset. The cycle divides one game day and its phase
 *   durations sum to its length; omitting the cycle keeps older MODs valid.
 * - The world seed protocol is a plain unsigned 32-bit integer. New runs
 *   generate one from an injectable random source (never the system date);
 *   Round 14-and-earlier v1 saves lack the field and restore to
 *   {@link DEFAULT_WORLD_SEED} so old worlds keep stable weather forever.
 */

import {
  type CalendarTimestamp,
  type GameCalendarData,
  MINUTES_PER_DAY,
  daysPerYear,
} from './game-calendar';

/** Inclusive bounds of the world-seed protocol (unsigned 32-bit). */
export const WORLD_SEED_MIN = 0;
export const WORLD_SEED_MAX = 4294967295;

/**
 * Stable default for v1 saves saved before Round 15 (no `worldSeed` field).
 * A fixed constant — not a derived value — so an old save always resumes in
 * the same weather on every load.
 */
export const DEFAULT_WORLD_SEED = 1;

/** Protocol bounds mirrored from the schema for the defensive parser. */
const MAX_SEASONS = 24;
const MAX_WEATHERS = 64;
const MAX_MONTH_IDS = 24;
const MAX_WEIGHT_ENTRIES = 64;
const MAX_WEIGHT = 1_000_000;
const MAX_TINT_ALPHA = 0.45;
const MAX_MINUTES = 1440;
const MAX_TIDE_PHASES = 16;

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/** One season: a set of calendar month ids plus its weighted weather table. */
export interface ClimateSeasonData {
  id: string;
  name: string;
  monthIds: string[];
  /** Draw weights for the season's daily weather; ids resolve to `weathers`. */
  weatherWeights: { weatherId: string; weight: number }[];
}

/** How a weather paints precipitation or atmospheric particles over the world layer. */
export interface ClimatePrecipitationData {
  kind: 'rain' | 'snow' | 'fog';
  /** 0–1; controls the procedural particle count. */
  density: number;
}

/** One weather state: tint, optional precipitation and extra step minutes. */
export interface ClimateWeatherData {
  id: string;
  name: string;
  /** Tint color as 0xRRGGBB (parsed from the "#RRGGBB" wire form). */
  tintColor: number;
  /** Tint opacity 0–0.45; capped so the world and HUD stay readable. */
  tintAlpha: number;
  /** Extra minutes every successful grid step costs under this weather. */
  stepMinutes: number;
  /** Null when the weather is dry (no particles). */
  precipitation: ClimatePrecipitationData | null;
}

/** One named interval in the data-authored repeating tide cycle. */
export interface ClimateTidePhaseData {
  id: string;
  name: string;
  durationMinutes: number;
}

/** A deterministic cycle whose length must partition the 24-hour game day. */
export interface ClimateTideCycleData {
  cycleMinutes: number;
  phaseOffsetMinutes: number;
  phases: readonly ClimateTidePhaseData[];
}

/** Wire format of a climate JSON resource. */
export interface ClimateData {
  id: string;
  seasons: readonly ClimateSeasonData[];
  weathers: readonly ClimateWeatherData[];
  /** Optional local distributions; absent maps retain their seasonal table. */
  regionalWeatherProfiles?: readonly RegionalWeatherProfile[];
  /** Optional for old climate MODs and saves that predate tide simulation. */
  tideCycle?: ClimateTideCycleData;
}

export interface RegionalWeatherProfile {
  id: string;
  name: string;
  mapResourceIds: string[];
  weatherWeights: { weatherId: string; weight: number }[];
}

/** Validate authored region references without making degraded optional maps fatal. */
export function validateClimateRegions(climate: ClimateData, declaredMapIds: ReadonlySet<string>): string[] {
  return (climate.regionalWeatherProfiles ?? []).flatMap(profile => profile.mapResourceIds
    .filter(id => !declaredMapIds.has(id)).map(id => `地域气候 "${profile.id}" 引用未登记区域 "${id}"`));
}

export type ClimateParseResult =
  | { ok: true; climate: ClimateData }
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

/** Finite number in [min, max] or null (fractions allowed). */
function requireNumberInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** "#RRGGBB" → 0xRRGGBB, or null. */
function parseTintColor(value: unknown): number | null {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return null;
  }
  return Number.parseInt(value.slice(1), 16);
}

function parseTideCycle(value: unknown, errors: string[]): ClimateTideCycleData | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    errors.push('tideCycle：应为潮汐周期对象');
    return undefined;
  }

  const cycleMinutes = requireIntegerInRange(value.cycleMinutes, 1, MAX_MINUTES);
  const phaseOffsetMinutes = requireIntegerInRange(value.phaseOffsetMinutes, 0, MAX_MINUTES - 1);
  if (cycleMinutes === null) errors.push(`tideCycle.cycleMinutes：应为 1–${MAX_MINUTES} 的整数`);
  if (phaseOffsetMinutes === null) errors.push(`tideCycle.phaseOffsetMinutes：应为 0–${MAX_MINUTES - 1} 的整数`);

  const phases: ClimateTidePhaseData[] = [];
  const phaseIds = new Set<string>();
  if (!Array.isArray(value.phases) || value.phases.length < 2 || value.phases.length > MAX_TIDE_PHASES) {
    errors.push(`tideCycle.phases：应为 2–${MAX_TIDE_PHASES} 个潮位相位`);
  } else {
    value.phases.forEach((entry, index) => {
      const label = `tideCycle.phases[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const id = source === null ? null : requireNonEmptyString(source.id);
      const name = source === null ? null : requireNonEmptyString(source.name);
      const durationMinutes = source === null
        ? null
        : requireIntegerInRange(source.durationMinutes, 1, MAX_MINUTES);
      if (id === null || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) {
        errors.push(`${label}.id：应为非空稳定 id`);
      } else if (phaseIds.has(id)) {
        errors.push(`${label}.id：相位 id "${id}" 重复`);
      } else {
        phaseIds.add(id);
      }
      if (name === null) errors.push(`${label}.name：应为非空字符串`);
      if (durationMinutes === null) errors.push(`${label}.durationMinutes：应为 1–${MAX_MINUTES} 的整数`);
      if (id !== null && name !== null && durationMinutes !== null) {
        phases.push({ id, name, durationMinutes });
      }
    });
  }

  if (cycleMinutes !== null) {
    if (MINUTES_PER_DAY % cycleMinutes !== 0) {
      errors.push('tideCycle.cycleMinutes：必须整除一个 1440 分钟的游戏日');
    }
    if (phaseOffsetMinutes !== null && phaseOffsetMinutes >= cycleMinutes) {
      errors.push('tideCycle.phaseOffsetMinutes：必须小于 cycleMinutes');
    }
    const durationTotal = phases.reduce((sum, phase) => sum + phase.durationMinutes, 0);
    if (Array.isArray(value.phases) && durationTotal !== cycleMinutes) {
      errors.push(`tideCycle.phases：相位持续分钟合计 ${durationTotal}，应等于周期 ${cycleMinutes}`);
    }
  }

  if (cycleMinutes === null || phaseOffsetMinutes === null || phases.length < 2) return undefined;
  return { cycleMinutes, phaseOffsetMinutes, phases };
}

/**
 * Defensive re-parse of a climate document. The Ajv schema already rejected
 * static shape violations at load time; this layer adds the cross-field
 * semantics a schema cannot express:
 *
 * - unique season and weather ids;
 * - month ids claimed at most once *inside the document*;
 * - season weather-weights resolving to declared weathers with a positive
 *   total (zero-weight entries are legal but a season of only zeros is not);
 * - with `calendar` provided (the world-loader call): the seasons form an
 *   exact partition of the calendar months — every month claimed by exactly
 *   one season, none missing, none unknown.
 *
 * Every problem is readable and together they refuse the whole resource —
 * climate is required world data, so partial adoption would silently detach
 * weather from the calendar it is indexed against.
 */
export function parseClimate(
  raw: unknown,
  calendar?: GameCalendarData,
): ClimateParseResult {
  const errors: string[] = [];
  if (!isPlainObject(raw) || !requireNonEmptyString((raw as { id?: unknown }).id)) {
    return { ok: false, errors: ['climate：根节点应为含非空 id 的对象'] };
  }

  const weathers: ClimateWeatherData[] = [];
  const weatherById = new Map<string, ClimateWeatherData>();
  const rawWeathers = (raw as { weathers?: unknown }).weathers;
  if (!Array.isArray(rawWeathers) || rawWeathers.length === 0) {
    errors.push('weathers：应为至少含一种天气的数组');
  } else {
    rawWeathers.forEach((entry, index) => {
      const label = `weathers[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const id = source === null ? null : requireNonEmptyString(source.id);
      const name = source === null ? null : requireNonEmptyString(source.name);
      const tintColor = source === null ? null : parseTintColor(source.tintColor);
      const tintAlpha = source === null ? null : requireNumberInRange(source.tintAlpha, 0, MAX_TINT_ALPHA);
      const stepMinutes = source === null ? null : requireIntegerInRange(source.stepMinutes, 0, MAX_MINUTES);
      if (id === null) {
        errors.push(`${label}.id：应为非空字符串`);
      } else if (weatherById.has(id)) {
        errors.push(`${label}.id："${id}" 与前面的天气重复`);
      }
      if (name === null) errors.push(`${label}.name：应为非空字符串`);
      if (tintColor === null) errors.push(`${label}.tintColor：应为 #RRGGBB 十六进制颜色`);
      if (tintAlpha === null) {
        errors.push(`${label}.tintAlpha：应为 0–${MAX_TINT_ALPHA} 的数值`);
      }
      if (stepMinutes === null) {
        errors.push(`${label}.stepMinutes：应为 0–${MAX_MINUTES} 的整数`);
      }
      let precipitation: ClimatePrecipitationData | null = null;
      if (source !== null && source.precipitation !== undefined && source.precipitation !== null) {
        const precipSource = isPlainObject(source.precipitation) ? source.precipitation : null;
        const kind =
          precipSource?.kind === 'rain' || precipSource?.kind === 'snow' || precipSource?.kind === 'fog'
            ? precipSource.kind
            : null;
        const density =
          precipSource === null ? null : requireNumberInRange(precipSource.density, 0, 1);
        if (kind === null || density === null) {
          errors.push(
            `${label}.precipitation：应含 kind（rain/snow/fog）与 density（0–1 数值）`,
          );
        } else {
          precipitation = { kind, density };
        }
      }
      if (
        id !== null && name !== null && tintColor !== null &&
        tintAlpha !== null && stepMinutes !== null
      ) {
        const weather: ClimateWeatherData = {
          id,
          name,
          tintColor,
          tintAlpha,
          stepMinutes,
          precipitation,
        };
        weatherById.set(id, weather);
        weathers.push(weather);
      }
    });
    if (rawWeathers.length > MAX_WEATHERS) {
      errors.push(`weathers：最多 ${MAX_WEATHERS} 种天气`);
    }
  }

  const seasons: ClimateSeasonData[] = [];
  const seasonById = new Map<string, ClimateSeasonData>();
  const monthClaims = new Map<string, string>(); // monthId → claiming season id
  const rawSeasons = (raw as { seasons?: unknown }).seasons;
  if (!Array.isArray(rawSeasons) || rawSeasons.length === 0) {
    errors.push('seasons：应为至少含一个季节的数组');
  } else {
    rawSeasons.forEach((entry, index) => {
      const label = `seasons[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const id = source === null ? null : requireNonEmptyString(source.id);
      const name = source === null ? null : requireNonEmptyString(source.name);
      if (id === null) {
        errors.push(`${label}.id：应为非空字符串`);
      } else if (seasonById.has(id)) {
        errors.push(`${label}.id："${id}" 与前面的季节重复`);
      }
      if (name === null) errors.push(`${label}.name：应为非空字符串`);

      const monthIds: string[] = [];
      const seenMonths = new Set<string>();
      const rawMonthIds = source === null ? undefined : source.monthIds;
      if (!Array.isArray(rawMonthIds) || rawMonthIds.length === 0) {
        errors.push(`${label}.monthIds：应为至少含一个月份 id 的数组`);
      } else {
        for (const [monthIndex, monthId] of rawMonthIds.entries()) {
          const month = requireNonEmptyString(monthId);
          if (month === null) {
            errors.push(`${label}.monthIds[${monthIndex}]：应为非空字符串`);
            continue;
          }
          if (seenMonths.has(month)) {
            errors.push(`${label}.monthIds：月份 "${month}" 在本季节内重复声明`);
            continue;
          }
          seenMonths.add(month);
          const claimedBy = monthClaims.get(month);
          if (claimedBy !== undefined) {
            errors.push(
              `月份 "${month}" 同时归属季节 "${claimedBy}" 与 "${id ?? label}"——历法月份必须恰好归属一个季节`,
            );
            continue;
          }
          monthClaims.set(month, id ?? label);
          monthIds.push(month);
        }
        if (rawMonthIds.length > MAX_MONTH_IDS) {
          errors.push(`${label}.monthIds：最多 ${MAX_MONTH_IDS} 个月份`);
        }
      }

      const weatherWeights: { weatherId: string; weight: number }[] = [];
      const seenWeatherIds = new Set<string>();
      const rawWeights = source === null ? undefined : source.weatherWeights;
      if (!Array.isArray(rawWeights) || rawWeights.length === 0) {
        errors.push(`${label}.weatherWeights：应为至少含一项的加权表`);
      } else {
        let totalWeight = 0;
        rawWeights.forEach((weightEntry, weightIndex) => {
          const weightLabel = `${label}.weatherWeights[${weightIndex}]`;
          const weightSource = isPlainObject(weightEntry) ? weightEntry : null;
          const weatherId =
            weightSource === null ? null : requireNonEmptyString(weightSource.weatherId);
          const weight =
            weightSource === null ? null : requireIntegerInRange(weightSource.weight, 0, MAX_WEIGHT);
          if (weatherId === null) {
            errors.push(`${weightLabel}.weatherId：应为非空字符串`);
            return;
          }
          if (!weatherById.has(weatherId)) {
            errors.push(`${weightLabel}.weatherId："${weatherId}" 未在 weathers 中声明`);
            return;
          }
          if (weight === null) {
            errors.push(`${weightLabel}.weight：应为 0–${MAX_WEIGHT} 的整数`);
            return;
          }
          if (seenWeatherIds.has(weatherId)) {
            errors.push(`${weightLabel}.weatherId："${weatherId}" 在本季加权表中重复声明`);
            return;
          }
          seenWeatherIds.add(weatherId);
          totalWeight += weight;
          weatherWeights.push({ weatherId, weight });
        });
        if (rawWeights.length > MAX_WEIGHT_ENTRIES) {
          errors.push(`${label}.weatherWeights：最多 ${MAX_WEIGHT_ENTRIES} 项`);
        }
        // A season whose weights all read zero can never produce a weather.
        if (weatherWeights.length > 0 && totalWeight <= 0) {
          errors.push(`${label}.weatherWeights：权重和必须为正（全为 0 的季节永远抽不出天气）`);
        }
      }

      if (id !== null && name !== null) {
        const season: ClimateSeasonData = { id, name, monthIds, weatherWeights };
        seasonById.set(id, season);
        seasons.push(season);
      }
    });
    if (rawSeasons.length > MAX_SEASONS) {
      errors.push(`seasons：最多 ${MAX_SEASONS} 个季节`);
    }
  }

  // Cross-resource partition check runs only when the calendar is known —
  // the world-loader hands it over after its own parse succeeded.
  if (calendar !== undefined) {
    for (const month of calendar.months) {
      const claim = monthClaims.get(month.id);
      if (claim === undefined) {
        errors.push(`历法月份 "${month.id}"（${month.name}）未归属任何季节——季节必须完整划分历法`);
      }
    }
    for (const [monthId, seasonId] of monthClaims) {
      if (!calendar.months.some((month) => month.id === monthId)) {
        errors.push(`季节 "${seasonId}" 声明的月份 "${monthId}" 不在历法 months 中`);
      }
    }
  }

  const regionalWeatherProfiles: RegionalWeatherProfile[] = [];
  const rawProfiles = raw.regionalWeatherProfiles;
  if (rawProfiles !== undefined) {
    const claimedMaps = new Set<string>();
    const profileIds = new Set<string>();
    if (!Array.isArray(rawProfiles) || rawProfiles.length < 1 || rawProfiles.length > 64) {
      errors.push('regionalWeatherProfiles：应为1–64项地域天气表');
    } else rawProfiles.forEach((entry, index) => {
      const label = `regionalWeatherProfiles[${index}]`;
      if (!isPlainObject(entry)) { errors.push(`${label}：应为对象`); return; }
      const id = requireNonEmptyString(entry.id), name = requireNonEmptyString(entry.name);
      if (!id || profileIds.has(id)) errors.push(`${label}.id：为空或重复`);
      if (id) profileIds.add(id);
      if (!name) errors.push(`${label}.name：应为非空显示名`);
      const mapResourceIds: string[] = [];
      if (!Array.isArray(entry.mapResourceIds) || entry.mapResourceIds.length < 1 || entry.mapResourceIds.length > 64) {
        errors.push(`${label}.mapResourceIds：应为1–64张地图`);
      } else for (const value of entry.mapResourceIds) {
        const mapId = requireNonEmptyString(value);
        if (!mapId || claimedMaps.has(mapId)) errors.push(`${label}.mapResourceIds：为空或地图重复归属`);
        else { claimedMaps.add(mapId); mapResourceIds.push(mapId); }
      }
      const weatherWeights: RegionalWeatherProfile['weatherWeights'] = [];
      const seen = new Set<string>();
      if (!Array.isArray(entry.weatherWeights) || entry.weatherWeights.length < 1 || entry.weatherWeights.length > MAX_WEIGHT_ENTRIES) {
        errors.push(`${label}.weatherWeights：应为1–${MAX_WEIGHT_ENTRIES}项`);
      } else for (const value of entry.weatherWeights) {
        const weatherId = isPlainObject(value) ? requireNonEmptyString(value.weatherId) : null;
        const weight = isPlainObject(value) ? requireIntegerInRange(value.weight, 0, MAX_WEIGHT) : null;
        if (!weatherId || !weatherById.has(weatherId) || seen.has(weatherId) || weight === null) {
          errors.push(`${label}.weatherWeights：天气未声明、重复或权重无效`);
        } else { seen.add(weatherId); weatherWeights.push({ weatherId, weight }); }
      }
      if (weatherWeights.reduce((sum, e) => sum + e.weight, 0) <= 0) errors.push(`${label}.weatherWeights：权重和必须为正`);
      if (id && name) regionalWeatherProfiles.push({ id, name, mapResourceIds, weatherWeights });
    });
  }
  const tideCycle = parseTideCycle((raw as { tideCycle?: unknown }).tideCycle, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    climate: {
      id: (raw as { id: string }).id,
      seasons,
      weathers,
      ...(rawProfiles === undefined ? {} : { regionalWeatherProfiles }),
      ...(tideCycle === undefined ? {} : { tideCycle }),
    },
  };
}

// ---------------------------------------------------------------------------
// World seed protocol
// ---------------------------------------------------------------------------

/** True iff `value` is a valid unsigned 32-bit world seed. */
export function isWorldSeed(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= WORLD_SEED_MIN &&
    value <= WORLD_SEED_MAX
  );
}

/**
 * Generates a fresh world seed for a new run from an injectable random
 * source (tests pass a deterministic one; the default is `Math.random`).
 * Deliberately never derives from the real-world date/time — only the
 * player's run, not their wall clock, seeds the weather.
 */
export function generateWorldSeed(random: () => number = Math.random): number {
  const sample = random();
  if (!Number.isFinite(sample)) {
    return DEFAULT_WORLD_SEED;
  }
  return Math.min(WORLD_SEED_MAX, Math.max(WORLD_SEED_MIN, Math.floor(sample * 4294967296)));
}

// ---------------------------------------------------------------------------
// Deterministic daily draw
// ---------------------------------------------------------------------------

/** 2^32 as a float; dividing the hashed uint32 by it maps into [0, 1). */
const UINT32_RANGE = 4294967296;

/** splitmix32-style finalizer: exact 32-bit avalanche via Math.imul. */
function mix32(value: number): number {
  let z = value | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/**
 * The roll that picks a day's weather: a deterministic uint32 hash of the
 * world seed and the day index, mapped onto [0, 1). Same inputs — same
 * output, on every platform, forever.
 */
export function weatherRoll(worldSeed: number, dayIndex: number): number {
  const seed = worldSeed >>> 0;
  const day = dayIndex >>> 0;
  return mix32((seed ^ Math.imul(day + 0x9e3779b9, 0x85ebca6b)) >>> 0) / UINT32_RANGE;
}

// ---------------------------------------------------------------------------
// Climate runtime
// ---------------------------------------------------------------------------

/**
 * Pure season/weather rule engine for one loaded world. Built from the
 * climate data plus the calendar it was validated against; every answer is a
 * lookup or a pure derivation — no state, no clock reads, no randomness.
 */
export class ClimateRuntime {
  private readonly climateData: ClimateData;
  private readonly calendarData: GameCalendarData;
  /** monthIndex → season (the parser guaranteed a full partition). */
  private readonly seasonByMonthIndex: ClimateSeasonData[] = [];
  private readonly weatherById: ReadonlyMap<string, ClimateWeatherData>;

  constructor(climate: ClimateData, calendar: GameCalendarData) {
    this.climateData = climate;
    this.calendarData = calendar;
    const seasonByMonthId = new Map<string, ClimateSeasonData>();
    for (const season of climate.seasons) {
      for (const monthId of season.monthIds) {
        seasonByMonthId.set(monthId, season);
      }
    }
    this.seasonByMonthIndex = calendar.months.map(
      (month) => seasonByMonthId.get(month.id) ?? climate.seasons[0]!,
    );
    this.weatherById = new Map(climate.weathers.map((weather) => [weather.id, weather]));
  }

  get climate(): ClimateData {
    return this.climateData;
  }

  /** Season owning the given 0-based calendar month index. */
  seasonForMonth(monthIndex: number): ClimateSeasonData {
    const season = this.seasonByMonthIndex[monthIndex];
    // The parser guaranteed the partition; the first season is a defensive
    // stand-in for out-of-range indices only.
    return season ?? this.climateData.seasons[0]!;
  }

  /** Season in effect at a calendar timestamp. */
  seasonForStamp(stamp: CalendarTimestamp): ClimateSeasonData {
    return this.seasonForMonth(stamp.monthIndex);
  }

  /**
   * Days elapsed since the start of the calendar's first year: a stable per
   * day index that does not shift when the calendar's start moment moves.
   */
  dayIndexOf(stamp: CalendarTimestamp): number {
    const { months } = this.calendarData;
    let dayOfYear = 0;
    for (let index = 0; index < stamp.monthIndex && index < months.length; index += 1) {
      dayOfYear += months[index]!.days;
    }
    dayOfYear += stamp.day - 1;
    return stamp.year * daysPerYear(this.calendarData) + dayOfYear;
  }

  /**
   * The weather of one whole game day: a single weighted draw over the
   * season's table, keyed by (world seed, day index). Identical inputs
   * always return the identical weather entry; crossing a day or a season
   * boundary simply re-derives from the new date.
   */
  weatherForDay(worldSeed: number, stamp: CalendarTimestamp, mapResourceId?: string): ClimateWeatherData {
    const roll = weatherRoll(worldSeed, this.dayIndexOf(stamp));
    return this.drawWeather({ weatherWeights: this.weatherWeightsForStamp(stamp, mapResourceId) }, roll);
  }

  regionalProfileForMap(mapResourceId?: string): RegionalWeatherProfile | undefined {
    return mapResourceId === undefined ? undefined : this.climateData.regionalWeatherProfiles?.find(profile => profile.mapResourceIds.includes(mapResourceId));
  }

  weatherWeightsForStamp(stamp: CalendarTimestamp, mapResourceId?: string): readonly { weatherId: string; weight: number }[] {
    return this.regionalProfileForMap(mapResourceId)?.weatherWeights ?? this.seasonForStamp(stamp).weatherWeights;
  }

  /** Current named tide phase, or null for legacy climate resources without a cycle. */
  tideForStamp(stamp: CalendarTimestamp): ClimateTidePhaseData | null {
    const cycle = this.climateData.tideCycle;
    if (cycle === undefined) return null;
    let minute = (stamp.minuteOfDay + cycle.phaseOffsetMinutes) % cycle.cycleMinutes;
    for (const phase of cycle.phases) {
      if (minute < phase.durationMinutes) return phase;
      minute -= phase.durationMinutes;
    }
    return cycle.phases[0] ?? null;
  }

  /** Weighted-table draw with `roll` in [0, 1); exposed for direct testing. */
  drawWeather(season: { weatherWeights: readonly { weatherId: string; weight: number }[] }, roll: number): ClimateWeatherData {
    const entries = season.weatherWeights.filter((entry) => entry.weight > 0);
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = roll * total;
    let chosen = entries[entries.length - 1] ?? season.weatherWeights[0];
    for (const entry of entries) {
      cursor -= entry.weight;
      if (cursor < 0) {
        chosen = entry;
        break;
      }
    }
    const weather = chosen === undefined ? undefined : this.weatherById.get(chosen.weatherId);
    // The parser guaranteed resolution; the first weather is defensive only.
    return weather ?? this.climateData.weathers[0]!;
  }
}
