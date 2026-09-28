import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { type GridMap } from '../src/engine/grid-map';
import {
  assembleWorldMap,
  parseWorldMap,
  selectTriggeredRandomRegionEvent,
  type RegionEventContext,
  type WorldMapData,
} from '../src/engine/world-map';

const readWorld = (): Record<string, unknown> => JSON.parse(
  readFileSync(new URL('../data/base/world/world-map.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

const context: RegionEventContext = {
  knownKnowledgeNodeIds: new Set(['event.old-footprints']),
  periodId: 'period.dusk',
  weatherId: 'weather.rain',
};

function parseBaseWorld(): WorldMapData {
  const parsed = parseWorldMap(readWorld());
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.data;
}

describe('world map roaming events', () => {
  it('defaults the optional roaming list for legacy world-map files', () => {
    const legacy = readWorld();
    delete legacy.randomEvents;
    const parsed = parseWorldMap(legacy);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.randomEvents).toEqual([]);
  });

  it('rejects invalid probabilities at the defensive parser boundary', () => {
    const raw = readWorld();
    const entries = raw.randomEvents as Array<Record<string, unknown>>;
    entries[0] = { ...entries[0], chance: Number.NaN };
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain('chance');
  });

  it('isolates a roaming event with a dangling discovery reference', () => {
    const raw = readWorld();
    const entries = raw.randomEvents as Array<Record<string, unknown>>;
    entries.push({
      ...entries[0],
      id: 'event.r43-broken-mod-example',
      discoverKnowledgeNodeId: 'event.deleted-by-mod',
    });
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapStub = (id: string): GridMap => ({
      data: { id, name: id, columns: 16, rows: 9, playerStart: { col: 7, row: 7 } },
      playerStart: { col: 7, row: 7 },
      canEnter: () => true,
    }) as unknown as GridMap;
    const assembled = assembleWorldMap(parsed.data, new Map([
      ['map.round-01-grid', mapStub('map.round-01-grid')],
      ['map.round-10-mist-ferry', mapStub('map.round-10-mist-ferry')],
    ]), {
      knowledgeNodeIds: new Set([
        'event.old-footprints', 'event.r43-wayfarer-letter', 'place.reedbank', 'event.r44-dock-claim',
        'place.mist-sluice', 'place.mist-north-cap', 'place.mist-south-pool',
      ]),
      periodIds: new Set(['period.dusk', 'period.night']),
      weatherIds: new Set(['weather.drizzle', 'weather.rain', 'weather.storm']),
      npcIds: new Set(['char.shi-bei', 'char.bai-luzhou']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.randomEvents.map((event) => event.id)).toEqual([
      'event.r43-wayfarer-letter',
      'event.r44-dock-claim',
    ]);
    expect(assembled.warnings).toHaveLength(1);
    expect(assembled.warnings[0]).toContain('event.deleted-by-mod');
  });

  it('selects deterministically from stable id order and then tests authored probability', () => {
    const [source] = parseBaseWorld().randomEvents;
    expect(source).toBeDefined();
    const candidates = [
      { ...source!, id: 'event.b-second', chance: 0.12 },
      { ...source!, id: 'event.a-first', chance: 0.12 },
    ];
    const samples = [0.9, 0.1];
    const selected = selectTriggeredRandomRegionEvent(
      candidates,
      'map.round-10-mist-ferry',
      new Set(),
      context,
      () => samples.shift() ?? 0,
    );
    expect(selected?.id).toBe('event.b-second');
  });

  it('does not consult randomness when map, story, weather or time conditions fail', () => {
    const events = parseBaseWorld().randomEvents;
    const failIfCalled = (): number => { throw new Error('no eligible event should roll'); };
    expect(selectTriggeredRandomRegionEvent(events, 'map.round-01-grid', new Set(), context, failIfCalled)).toBeNull();
    expect(selectTriggeredRandomRegionEvent(events, 'map.round-10-mist-ferry', new Set(), {
      ...context,
      periodId: 'period.morning',
    }, failIfCalled)).toBeNull();
    expect(selectTriggeredRandomRegionEvent(events, 'map.round-10-mist-ferry', new Set(), {
      ...context,
      knownKnowledgeNodeIds: new Set(),
    }, failIfCalled)).toBeNull();
  });

  it('respects chance, one-shot completion and repeatable event policy', () => {
    const [source] = parseBaseWorld().randomEvents;
    expect(source).toBeDefined();
    const event = source!;
    const roll = (...values: number[]) => {
      const samples = [...values];
      return () => samples.shift() ?? 0;
    };
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set(), context, roll(0, 0.119))).toEqual(event);
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set(), context, roll(0, 0.12))).toBeNull();
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set([event.id]), context, () => {
      throw new Error('completed one-shot must not roll');
    })).toBeNull();
    const repeatable = { ...event, once: false };
    expect(selectTriggeredRandomRegionEvent([repeatable], event.mapResourceId, new Set([event.id]), context, roll(0, 0))).toEqual(repeatable);
  });

  it('requires every authored nearby NPC id to be in the four-way interaction context', () => {
    const [source] = parseBaseWorld().randomEvents;
    expect(source).toBeDefined();
    const event = {
      ...source!,
      conditions: {
        ...source!.conditions,
        nearbyNpcIds: ['char.shi-bei', 'char.bai-luzhou'],
      },
    };
    const bothPresent = { ...context, nearbyNpcIds: new Set(['char.shi-bei', 'char.bai-luzhou']) };
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set(), bothPresent, () => 0)).toEqual(event);
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set(), {
      ...bothPresent,
      nearbyNpcIds: new Set(['char.shi-bei']),
    }, () => { throw new Error('missing required NPC should not roll'); })).toBeNull();
    expect(selectTriggeredRandomRegionEvent([event], event.mapResourceId, new Set(), context, () => {
      throw new Error('missing nearby NPC context should count as nobody present');
    })).toBeNull();
  });

  it('isolates only an event whose nearby NPC reference is invalid', () => {
    const raw = readWorld();
    const events = raw.randomEvents as Array<Record<string, unknown>>;
    events.push({
      ...events[0],
      id: 'event.r44-broken-nearby-npc-example',
      conditions: {
        knowledgeNodeIds: ['event.r43-wayfarer-letter'],
        nearbyNpcIds: ['char.deleted-by-mod'],
      },
    });
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapStub = (id: string): GridMap => ({
      data: { id, name: id, columns: 16, rows: 9, playerStart: { col: 7, row: 7 } },
      playerStart: { col: 7, row: 7 },
      canEnter: () => true,
    }) as unknown as GridMap;
    const assembled = assembleWorldMap(parsed.data, new Map([
      ['map.round-01-grid', mapStub('map.round-01-grid')],
      ['map.round-10-mist-ferry', mapStub('map.round-10-mist-ferry')],
    ]), {
      knowledgeNodeIds: new Set([
        'event.old-footprints', 'event.r43-wayfarer-letter', 'place.reedbank', 'event.r44-dock-claim',
        'place.mist-north-cap', 'place.mist-south-pool',
      ]),
      periodIds: new Set(['period.dusk', 'period.night']),
      weatherIds: new Set(['weather.drizzle', 'weather.rain', 'weather.storm']),
      npcIds: new Set(['char.shi-bei', 'char.bai-luzhou']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.randomEvents.map((event) => event.id)).toEqual([
      'event.r43-wayfarer-letter',
      'event.r44-dock-claim',
    ]);
    expect(assembled.warnings.join('\n')).toContain('char.deleted-by-mod');
  });
});
