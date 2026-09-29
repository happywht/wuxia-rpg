/** Round 75: fixed-event approach clues — schema/parser compatibility, nearest-event selection and HUD-safe output. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  parseWorldMap,
  REGION_EVENT_APPROACH_RADIUS,
  selectRegionEventApproachClue,
  type RegionEventData,
  type RegionEventContext,
} from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function makeEvent(overrides: Partial<RegionEventData> & Pick<RegionEventData, 'id' | 'col' | 'row'>): RegionEventData {
  return {
    mapResourceId: 'map.a',
    text: `SECRET-${overrides.id}`,
    once: true,
    approachText: `线索-${overrides.id}`,
    ...overrides,
  };
}

const emptyContext: RegionEventContext = {
  knownKnowledgeNodeIds: new Set<string>(),
  periodId: null,
  weatherId: null,
};

describe('Round 75 region-event approach clues', () => {
  it('parses legacy maps without approachText and accepts or rejects the new optional field', () => {
    const legacyBase = {
      id: 'world.legacy',
      startingMapResourceId: 'map.a',
      regions: [{ mapResourceId: 'map.a', name: '甲', description: '旧图', atlasPosition: { x: 1, y: 1 } }],
      transitions: [],
      landmarks: [],
      randomEvents: [],
    };
    const legacy = parseWorldMap({
      ...legacyBase,
      events: [{ id: 'event.a1', mapResourceId: 'map.a', col: 3, row: 3, text: '完整文本。', once: true }],
    });
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.data.events[0]!.approachText).toBeUndefined();

    const withClue = parseWorldMap({
      ...legacyBase,
      events: [{ id: 'event.a1', mapResourceId: 'map.a', col: 3, row: 3, text: '完整文本。', approachText: '近处有痕迹。', once: true }],
    });
    expect(withClue.ok).toBe(true);
    if (withClue.ok) expect(withClue.data.events[0]!.approachText).toBe('近处有痕迹。');

    const blankClue = parseWorldMap({
      ...legacyBase,
      events: [{ id: 'event.a1', mapResourceId: 'map.a', col: 3, row: 3, text: '完整文本。', approachText: '   ', once: true }],
    });
    expect(blankClue.ok).toBe(false);
    if (!blankClue.ok) expect(blankClue.errors.join('\n')).toContain('approachText');
  });

  it('ships clues on fixed discovery events across all seven regions and leaves random events untouched', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mapsWithClues = new Set<string>();
    for (const event of parsed.data.events) {
      expect(event.approachText, `${event.id} 需要临近线索`).toBeTruthy();
      mapsWithClues.add(event.mapResourceId);
    }
    expect(mapsWithClues.size).toBe(7);
    // Arrival and non-arrival landmarks both carry clues in shipped data.
    expect(parsed.data.events.some(({ id }) => id.endsWith('-arrival'))).toBe(true);
    expect(parsed.data.events.some(({ id }) => !id.endsWith('-arrival'))).toBe(true);

    const raw = readJson('../data/base/world/world-map.json') as { randomEvents: Record<string, unknown>[] };
    expect(raw.randomEvents.every((event) => event.approachText === undefined)).toBe(true);
  });

  it('returns the nearest eligible clue within the documented radius and stays silent on the trigger cell', () => {
    expect(REGION_EVENT_APPROACH_RADIUS).toBe(2);
    const events = [
      makeEvent({ id: 'event.near', col: 10, row: 10 }),
      makeEvent({ id: 'event.far', col: 15, row: 10 }),
    ];
    const at = (col: number, row: number) => ({ mapResourceId: 'map.a', col, row });
    // Nearest wins: distance 1 beats distance 3.
    expect(selectRegionEventApproachClue(events, at(10, 9), new Set(), emptyContext)).toBe('线索-event.near');
    // The exact trigger cell stays silent; the discovery fires there instead.
    expect(selectRegionEventApproachClue(events, at(10, 10), new Set(), emptyContext)).toBeNull();
    // Beyond the default radius nothing surfaces.
    expect(selectRegionEventApproachClue(events, at(10, 13), new Set(), emptyContext)).toBeNull();
    // Events on another map never leak into the hint.
    expect(selectRegionEventApproachClue(events, { mapResourceId: 'map.b', col: 10, row: 10 }, new Set(), emptyContext)).toBeNull();
    // A configurable radius widens the reach deterministically.
    expect(selectRegionEventApproachClue(events, at(10, 13), new Set(), emptyContext, 3)).toBe('线索-event.near');
    expect(selectRegionEventApproachClue(events, at(10, 13), new Set(), emptyContext, Number.NaN)).toBeNull();
    expect(selectRegionEventApproachClue(events, at(10, 13), new Set(), emptyContext, -1)).toBeNull();
  });

  it('breaks equal-distance ties deterministically by event id', () => {
    const events = [
      makeEvent({ id: 'event.zeta', col: 8, row: 8 }),
      makeEvent({ id: 'event.alpha', col: 8, row: 10 }),
    ];
    const at = { mapResourceId: 'map.a', col: 8, row: 9 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(selectRegionEventApproachClue(events, at, new Set(), emptyContext)).toBe('线索-event.alpha');
    }
  });

  it('applies live event conditions before surfacing a clue', () => {
    const events = [makeEvent({
      id: 'event.gated',
      col: 4,
      row: 4,
      conditions: { knowledgeNodeIds: ['event.old-footprints'], periodIds: ['period.dusk'] },
    })];
    const at = { mapResourceId: 'map.a', col: 4, row: 3 };
    expect(selectRegionEventApproachClue(events, at, new Set(), emptyContext)).toBeNull();
    expect(selectRegionEventApproachClue(events, at, new Set(), {
      ...emptyContext,
      knownKnowledgeNodeIds: new Set(['event.old-footprints']),
      periodId: 'period.dusk',
    })).toBe('线索-event.gated');
    expect(selectRegionEventApproachClue(events, at, new Set(), {
      ...emptyContext,
      knownKnowledgeNodeIds: new Set(['event.old-footprints']),
      periodId: 'period.night',
    })).toBeNull();
  });

  it('suppresses completed one-shot events and already-known discovery nodes', () => {
    const oneShot = [makeEvent({ id: 'event.once', col: 2, row: 2 })];
    const at = { mapResourceId: 'map.a', col: 2, row: 1 };
    expect(selectRegionEventApproachClue(oneShot, at, new Set(['event.once']), emptyContext)).toBeNull();

    const discovered = [makeEvent({ id: 'event.repeat', col: 2, row: 2, once: false, discoverKnowledgeNodeId: 'place.x' })];
    expect(selectRegionEventApproachClue(discovered, at, new Set(), {
      ...emptyContext,
      knownKnowledgeNodeIds: new Set(['place.x']),
    })).toBeNull();
    // Unknown node on a repeatable event still hints.
    expect(selectRegionEventApproachClue(discovered, at, new Set(), emptyContext)).toBe('线索-event.repeat');
  });

  it('requires an authored approachText and never leaks full event text or node ids', () => {
    const silent = [makeEvent({ id: 'event.silent', col: 6, row: 6, approachText: undefined })];
    const at = { mapResourceId: 'map.a', col: 6, row: 5 };
    expect(selectRegionEventApproachClue(silent, at, new Set(), emptyContext)).toBeNull();

    const clue = selectRegionEventApproachClue(silent.map((event) => ({ ...event, approachText: '线索-event.silent' })), at, new Set(), emptyContext);
    expect(clue).toBe('线索-event.silent');
    expect(clue).not.toContain('SECRET-');

    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const event of parsed.data.events) {
      expect(event.approachText).not.toContain(event.text);
      if (event.discoverKnowledgeNodeId !== undefined) {
        expect(event.approachText).not.toContain(event.discoverKnowledgeNodeId);
      }
    }
  });

  it('resolves a real ferry clue at distance two with its authored weather and period conditions', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const at = { mapResourceId: 'map.round-10-mist-ferry', col: 5, row: 2 };
    // The reedbank clue sits at distance 2 but needs dusk/rain plus the footprints.
    expect(selectRegionEventApproachClue(parsed.data.events, at, new Set(), emptyContext)).toBeNull();
    const duskRainContext: RegionEventContext = {
      knownKnowledgeNodeIds: new Set(['event.old-footprints']),
      periodId: 'period.dusk',
      weatherId: 'weather.drizzle',
    };
    expect(selectRegionEventApproachClue(parsed.data.events, at, new Set(), duskRainContext))
      .toBe('雨声里芦苇丛下似压着硬物。');
  });
});
