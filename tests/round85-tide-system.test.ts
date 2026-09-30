import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ClimateRuntime, parseClimate } from '../src/engine/climate-system';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { regionEventConditionsMet } from '../src/engine/world-map';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const baseCalendar = readJson('data/base/worldview/calendar.json');
const baseClimate = readJson('data/base/worldview/climate.json');

function climateRuntime(raw: Record<string, unknown> = baseClimate): ClimateRuntime {
  const calendarResult = parseGameCalendar(baseCalendar);
  if (!calendarResult.ok) throw new Error(calendarResult.errors.join('; '));
  const climateResult = parseClimate(raw, calendarResult.calendar);
  if (!climateResult.ok) throw new Error(climateResult.errors.join('; '));
  return new ClimateRuntime(climateResult.climate, calendarResult.calendar);
}

function atMinute(minuteOfDay: number) {
  return { year: 1, monthIndex: 0, day: 1, minuteOfDay };
}

describe('Round 85 data-driven tide cycle', () => {
  it('selects phase boundaries from in-game minutes and repeats the cycle deterministically', () => {
    const runtime = climateRuntime();
    expect(runtime.tideForStamp(atMinute(480))?.id).toBe('tide.high');
    expect(runtime.tideForStamp(atMinute(659))?.id).toBe('tide.high');
    expect(runtime.tideForStamp(atMinute(660))?.id).toBe('tide.ebb');
    expect(runtime.tideForStamp(atMinute(840))?.id).toBe('tide.low');
    expect(runtime.tideForStamp(atMinute(1020))?.id).toBe('tide.flood');
    expect(runtime.tideForStamp(atMinute(1200))?.id).toBe('tide.high');
    expect(runtime.tideForStamp(atMinute(0))?.id).toBe('tide.ebb');
  });

  it('keeps older climate overrides without a tide cycle valid', () => {
    const legacyClimate = { ...baseClimate };
    delete legacyClimate.tideCycle;
    const runtime = climateRuntime(legacyClimate);
    expect(runtime.tideForStamp(atMinute(840))).toBeNull();
  });

  it('rejects cycles whose phases do not sum to the cycle length', () => {
    const invalid = structuredClone(baseClimate);
    const tideCycle = invalid.tideCycle as {
      phases: { durationMinutes: number }[];
    };
    tideCycle.phases[0]!.durationMinutes -= 1;
    const parsed = parseClimate(invalid);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain('相位持续分钟合计');
  });

  it('rejects duplicate phase ids and cycles that do not divide a game day', () => {
    const duplicate = structuredClone(baseClimate);
    const duplicateCycle = duplicate.tideCycle as {
      phases: { id: string }[];
    };
    duplicateCycle.phases[1]!.id = duplicateCycle.phases[0]!.id;
    const duplicateResult = parseClimate(duplicate);
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) expect(duplicateResult.errors.join('\n')).toContain('相位 id');

    const nonDivisor = structuredClone(baseClimate);
    (nonDivisor.tideCycle as { cycleMinutes: number }).cycleMinutes = 700;
    const nonDivisorResult = parseClimate(nonDivisor);
    expect(nonDivisorResult.ok).toBe(false);
    if (!nonDivisorResult.ok) expect(nonDivisorResult.errors.join('\n')).toContain('整除一个 1440 分钟');

    const badOffset = structuredClone(baseClimate);
    (badOffset.tideCycle as { phaseOffsetMinutes: number }).phaseOffsetMinutes = 720;
    const badOffsetResult = parseClimate(badOffset);
    expect(badOffsetResult.ok).toBe(false);
    if (!badOffsetResult.ok) expect(badOffsetResult.errors.join('\n')).toContain('必须小于 cycleMinutes');
  });

  it('gates regional events on the current tide id', () => {
    const event = { conditions: { tideIds: ['tide.low'] } };
    const context = (tideId: string | null) => ({
      knownKnowledgeNodeIds: new Set<string>(),
      periodId: null,
      weatherId: null,
      tideId,
    });
    expect(regionEventConditionsMet(event, context('tide.low'))).toBe(true);
    expect(regionEventConditionsMet(event, context('tide.high'))).toBe(false);
    expect(regionEventConditionsMet(event, context(null))).toBe(false);
  });
});
