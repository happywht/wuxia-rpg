import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClimateRuntime, parseClimate, validateClimateRegions } from '../src/engine/climate-system';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { regionEventConditionsMet } from '../src/engine/world-map';
import { regionEventNavigationHint } from '../src/engine/region-event-navigation';
import { loadWorldData, type LoadedWorld } from '../src/game/world-loader';

const raw = JSON.parse(readFileSync('data/base/worldview/climate.json', 'utf8'));
const calendar = parseGameCalendar(JSON.parse(readFileSync('data/base/worldview/calendar.json', 'utf8')));
if (!calendar.ok) throw Error(calendar.errors.join('\n'));
const parsed = parseClimate(raw, calendar.calendar);
if (!parsed.ok) throw Error(parsed.errors.join('\n'));
const climate = new ClimateRuntime(parsed.climate, calendar.calendar);
const north = 'map.round-92-north-pass';
const warm = 'map.round-01-grid';
const stamp = { year: 1, monthIndex: 0, day: 4, minuteOfDay: 115 };
let world: LoadedWorld;
beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try { return new Response(readFileSync(join(resolve('.'), 'data', decodeURIComponent(new URL(url, 'http://r114.test').pathname)), 'utf8'), { headers: { 'content-type': 'application/json' } }); }
    catch { return new Response('missing', { status: 404 }); }
  });
  const result = await loadWorldData();
  if (!result.ok) throw Error(result.lines.join('\n'));
  world = result.world;
});
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Round114 optional regional climate', () => {
  it('assembles stable world content and resolves every profile map', () => {
    expect(world.optionalWarnings).toEqual([]);
    expect(world.maps.size).toBe(22);
    expect(validateClimateRegions(world.climate, new Set(world.maps.keys()))).toEqual([]);
    expect(world.climate.regionalWeatherProfiles![0]!.mapResourceIds).toHaveLength(3);
  });
  it('preserves every legacy nonregional daily result and accepts old MOD climate', () => {
    const legacy = structuredClone(raw); delete legacy.regionalWeatherProfiles;
    const result = parseClimate(legacy, calendar.calendar);
    if (!result.ok) throw Error(result.errors.join('\n'));
    const old = new ClimateRuntime(result.climate, calendar.calendar);
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) for (const seed of [0, 1, 12345, 4294967295]) {
      const day = { ...stamp, monthIndex };
      expect(climate.weatherForDay(seed, day, warm)).toEqual(old.weatherForDay(seed, day));
      expect(old.weatherForDay(seed, day, north)).toEqual(old.weatherForDay(seed, day));
    }
  });
  it('shares northern weather, remains deterministic and has both snow and clear days', () => {
    const samples = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      const date = { ...stamp, day };
      const weather = climate.weatherForDay(1, date, north);
      samples.add(weather.id);
      for (const map of raw.regionalWeatherProfiles[0].mapResourceIds) expect(climate.weatherForDay(1, date, map)).toEqual(weather);
      expect(climate.weatherForDay(1, date, north)).toEqual(weather);
    }
    expect(samples.has('weather.snow')).toBe(true);
    expect(samples.has('weather.clear')).toBe(true);
  });
  it('makes spring beacon conditions achievable while preserving the actual time gate', () => {
    const event = world.worldMap.events.find(e => e.id === 'event.r92-snow-beacon')!;
    const day = Array.from({ length: 30 }, (_, i) => i + 1).find(day => climate.weatherForDay(1, { ...stamp, day }, north).id === 'weather.snow')!;
    expect(day).toBeGreaterThan(0);
    const context = { knownKnowledgeNodeIds: new Set<string>(), weatherId: climate.weatherForDay(1, { ...stamp, day }, north).id, periodId: 'period.midnight',
      possibleWeatherIds: new Set(climate.weatherWeightsForStamp(stamp, north).filter(e => e.weight > 0).map(e => e.weatherId)) };
    expect(regionEventConditionsMet(event, context)).toBe(true);
    expect(regionEventNavigationHint(event, context)).toContain('按 E');
    expect(regionEventConditionsMet(event, { ...context, periodId: 'period.midday' })).toBe(false);
    expect(regionEventNavigationHint(event, { ...context, weatherId: 'weather.clear' })).not.toContain('本季不会出现');
  });
  it.each(['unknown-weather', 'zero-total', 'duplicate-map', 'duplicate-profile'])('rejects malformed %s region data', mode => {
    const bad = structuredClone(raw), p = bad.regionalWeatherProfiles[0];
    if (mode === 'unknown-weather') p.weatherWeights[0].weatherId = 'weather.missing';
    if (mode === 'zero-total') p.weatherWeights.forEach((e: { weight: number }) => { e.weight = 0; });
    if (mode === 'duplicate-map') p.mapResourceIds.push(p.mapResourceIds[0]);
    if (mode === 'duplicate-profile') bad.regionalWeatherProfiles.push(structuredClone(p));
    expect(parseClimate(bad, calendar.calendar).ok).toBe(false);
  });
  it('reports unknown authored map references without weakening optional-map degradation', () => {
    expect(validateClimateRegions(parsed.climate, new Set([warm]))).toHaveLength(3);
    const declared = new Set(world.worldMap.data.regions.map(r => r.mapResourceId));
    expect(validateClimateRegions(parsed.climate, declared)).toEqual([]);
    expect(climate.regionalProfileForMap('unknown')).toBeUndefined();
  });
  it('routes all live presentation, time cost and event contexts through current local reading', () => {
    const source = readFileSync('src/game/grid-scene.ts', 'utf8');
    expect(source).toContain('climate.weatherForDay(this.worldSeed, stamp, this.currentMapResourceId)');
    expect(source).toContain('weatherWeightsForStamp(this.clock.snapshot(), this.currentMapResourceId)');
    expect(source).toContain('this.currentClimate()?.weather.stepMinutes');
    expect(source).toContain('weatherId: climate?.weather.id ?? null');
    expect(source).toContain('reading.regionalClimateName');
  });
  it('keeps route advice aligned with actual gates and generation source', () => {
    const map = JSON.parse(readFileSync('data/base/world/world-map.json', 'utf8'));
    const role = map.regionGuides.find((entry: { mapResourceId: string }) => entry.mapResourceId === north);
    expect(role.advice).toContain('落雪并不保证次日出现');
    expect(role.advice).toContain('R→出区');
    for (const gate of map.transitions.filter((entry: { from: { mapResourceId: string } }) => entry.from.mapResourceId === north)) {
      if (gate.from.col === 3 || gate.from.row === 97) expect(role.advice).toContain(`(${gate.from.col},${gate.from.row})`);
    }
    expect(readFileSync('scripts/lib/round106-region-content.mjs', 'utf8')).toContain(role.advice);
  });
});
