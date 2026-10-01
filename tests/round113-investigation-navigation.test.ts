import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGridMap } from '../src/engine/grid-map';
import { findRegionEventInteractionPath, regionEventNavigationHint } from '../src/engine/region-event-navigation';
import { regionEventConditionsMet, selectInteractableRegionEvent, type RegionEventData, type RegionEventContext, type WorldMapAssembly } from '../src/engine/world-map';
import { resolveCellNavigationGuide } from '../src/engine/world-navigation-guidance';

const ready: RegionEventContext = { knownKnowledgeNodeIds: new Set(['known']), periodId: 'day', weatherId: 'snow', tideId: 'low', nearbyNpcIds: new Set(['npc']) };
const event: RegionEventData = { id: 'inspect', mapResourceId: 'map', col: 2, row: 2, text: 'test', once: true, interaction: { prompt: '查看刻纹', approachDirections: ['down'] } };
const surface = { columns: 5, rows: 5, inBounds: (c: number, r: number) => c >= 0 && r >= 0 && c < 5 && r < 5,
  canEnter: (c: number, r: number) => c >= 0 && r >= 0 && c < 5 && r < 5 };

describe('Round113 investigation geometry and condition feedback', () => {
  it('never declares the walkable target itself an interaction cell', () => {
    const path = findRegionEventInteractionPath(surface, { col: 2, row: 2 }, event)!;
    expect(path).toEqual([{ col: 2, row: 2 }, { col: 2, row: 1 }]);
    expect(selectInteractableRegionEvent([event], { ...path.at(-1)!, mapResourceId: 'map' }, new Set(), ready)?.event.id).toBe(event.id);
  });
  it('routes around an excluded facing and stops at the permitted side', () => {
    expect(findRegionEventInteractionPath(surface, { col: 2, row: 3 }, event)?.at(-1)).toEqual({ col: 2, row: 1 });
    expect(findRegionEventInteractionPath(surface, { col: 2, row: 1 }, event)).toHaveLength(1);
  });
  it('respects range and actual line of sight even when the target is solid', () => {
    const ranged = { ...event, interaction: { ...event.interaction!, range: 2 } };
    const blocked = { ...surface, canEnter: (c: number, r: number) => surface.canEnter(c, r) && !(c === 2 && (r === 1 || r === 2)) };
    expect(findRegionEventInteractionPath(blocked, { col: 2, row: 0 }, ranged)).toBeNull();
    const solid = { ...surface, canEnter: (c: number, r: number) => surface.canEnter(c, r) && !(c === 2 && r === 2) };
    expect(findRegionEventInteractionPath(solid, { col: 2, row: 0 }, ranged)).toHaveLength(1);
  });
  it.each(['knowledgeNodeIds', 'periodIds', 'weatherIds', 'tideIds', 'nearbyNpcIds'] as const)('explains a blocked %s without changing it', key => {
    const gated = { ...event, conditions: { [key]: ['missing'] } };
    expect(regionEventConditionsMet(gated, ready)).toBe(false);
    expect(regionEventNavigationHint(gated, ready)).toContain('尚缺');
    expect(findRegionEventInteractionPath(surface, { col: 2, row: 2 }, gated)).toHaveLength(2);
    expect(selectInteractableRegionEvent([gated], { col: 2, row: 1, mapResourceId: 'map' }, new Set(), ready)).toBeNull();
  });
  it('requires all knowledge/person entries and accepts alternative time/weather entries', () => {
    const gated = { ...event, conditions: { knowledgeNodeIds: ['known'], nearbyNpcIds: ['npc'], periodIds: ['night', 'day'], weatherIds: ['sun', 'snow'], tideIds: ['low'] } };
    expect(regionEventConditionsMet(gated, ready)).toBe(true);
    expect(regionEventNavigationHint(gated, ready)).toBe('按 E 查看刻纹');
    expect(regionEventNavigationHint(gated)).toContain('须满足现场条件');
    expect(regionEventNavigationHint({ ...gated, conditions: { knowledgeNodeIds: ['known', 'missing'] } }, ready)).toContain('前置见闻');
  });
  it('repairs the actual northern self-cell checkpoint with no content changes', () => {
    const raw = JSON.parse(readFileSync('data/base/world/world-map.json', 'utf8'));
    const actual = raw.events.find((e: RegionEventData) => e.id === 'event.r91-goose-terrace') as RegionEventData;
    const parsed = parseGridMap(JSON.parse(readFileSync('data/base/maps/round-91-cloud-north-terrace.json', 'utf8')));
    if (!parsed.ok) throw Error(parsed.errors.join('\n'));
    const world: WorldMapAssembly = { data: raw, regions: raw.regions, landmarks: raw.landmarks, transitions: raw.transitions, events: raw.events, randomEvents: raw.randomEvents, warnings: [] };
    const context = { ...ready, periodId: 'period.midday' };
    const destination = { ...actual, name: '调查', approachRadius: 0, arrivalAction: 'discover' as const };
    const guide = resolveCellNavigationGuide(world, actual.mapResourceId, destination, parsed.map, { col: 50, row: 12 }, undefined, context);
    expect(guide.status).toBe('en-route');
    if (guide.status !== 'en-route') throw Error('wrong segment');
    expect(guide.path).toHaveLength(2);
    expect(selectInteractableRegionEvent([actual], { ...guide.path.at(-1)!, mapResourceId: actual.mapResourceId }, new Set(), context)?.event.id).toBe(actual.id);
    expect(guide.inspectionHint).toContain('按 E');
    const landmark = resolveCellNavigationGuide(world, actual.mapResourceId, { ...destination, arrivalAction: undefined, approachRadius: 2 }, parsed.map, { col: 50, row: 12 });
    expect(landmark).toMatchObject({ status: 'en-route', path: guide.path });
    const blocked = resolveCellNavigationGuide(world, actual.mapResourceId, destination, parsed.map, { col: 50, row: 12 },
      new Set(['50,11', '49,12', '51,12']), context);
    expect(blocked.status).toBe('route-blocked');
    const completed = resolveCellNavigationGuide(world, actual.mapResourceId, { ...destination, arrivalAction: undefined }, parsed.map,
      { col: 50, row: 12 }, undefined, { ...context, completedEventIds: new Set([actual.id]) });
    expect(completed).toMatchObject({ status: 'arrived' });
    if (completed.status === 'arrived') expect(completed.inspectionHint).toBeUndefined();
  });
  it('reports the actual spring impossibility instead of promising short waits', () => {
    const raw = JSON.parse(readFileSync('data/base/world/world-map.json', 'utf8'));
    const actual = raw.events.find((e: RegionEventData) => e.id === 'event.r92-snow-beacon') as RegionEventData;
    const climate = JSON.parse(readFileSync('data/base/worldview/climate.json', 'utf8'));
    const spring = climate.seasons.find((s: { id: string }) => s.id === 'season.spring');
    const context = { ...ready, periodId: 'period.dusk', weatherId: 'weather.clear',
      possibleWeatherIds: new Set<string>(spring.weatherWeights.map((e: { weatherId: string }) => e.weatherId)),
      conditionLabel: (kind: string, id: string) => kind === 'weather' && id === 'weather.snow' ? '落雪' : undefined };
    expect(regionEventConditionsMet(actual, context)).toBe(false);
    expect(regionEventNavigationHint(actual, context)).toContain('尚缺：落雪；所需天气本季不会出现');
    expect(regionEventNavigationHint(actual, { ...context, possibleWeatherIds: new Set(['weather.snow']) })).toContain('V 等候');
  });
});
