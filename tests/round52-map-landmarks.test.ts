import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap, selectVisibleWorldLandmarks } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string) {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('Round 52 data-driven map landmarks', () => {
  it('loads the atlas pins from data and resolves only points inside authored regions', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const assembled = assembleWorldMap(parsed.data, new Map([
      ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
      ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    ]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.landmarks.map(({ id }) => id)).toEqual([
      'landmark.northwest-settlement',
      'landmark.village-lake',
      'landmark.eastern-pond',
      'landmark.south-hamlet',
      'landmark.stone-stairs-ferry',
      'landmark.reedbank-landing',
      'landmark.mist-north-cap',
      'landmark.mist-willow-market',
      'landmark.mist-old-sluice',
      'landmark.mist-south-pool',
    ]);
    // Legacy direct callers pass no reference ids, so the discovery gate on
    // the reedbank landing must not be validated (and not hide the landmark).
    expect(assembled.warnings).toEqual([]);
  });

  it('keeps legacy atlases valid without landmarks and reports only bad landmark rows', () => {
    const raw = readJson('../data/base/world/world-map.json') as Record<string, unknown>;
    delete raw.landmarks;
    const legacy = parseWorldMap(raw);
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.data.landmarks).toEqual([]);

    raw.landmarks = [
      { id: 'valid', mapResourceId: 'map.round-01-grid', col: 43, row: 37, name: '路口', category: 'route' },
      { id: 'bad-map', mapResourceId: 'map.deleted-by-mod', col: 3, row: 3, name: '失效标记', category: 'other' },
      { id: 'bad-cell', mapResourceId: 'map.round-10-mist-ferry', col: 100, row: 100, name: '越界标记', category: 'other' },
    ];
    const modified = parseWorldMap(raw);
    expect(modified.ok).toBe(true);
    if (!modified.ok) return;
    const assembled = assembleWorldMap(modified.data, new Map([
      ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
      ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    ]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.landmarks.map(({ id }) => id)).toEqual(['valid']);
    expect(assembled.warnings).toHaveLength(2);
    expect(assembled.warnings.join('\n')).toContain('bad-map');
    expect(assembled.warnings.join('\n')).toContain('bad-cell');
  });

  it('rejects unknown visual categories at the parser boundary', () => {
    const raw = readJson('../data/base/world/world-map.json') as { landmarks: Record<string, unknown>[] };
    raw.landmarks[0] = { ...raw.landmarks[0], category: 'story-specific-icon' };
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain('landmarks[0].category');
  });

  it('rejects non-string discovery gates at the parser boundary', () => {
    const raw = readJson('../data/base/world/world-map.json') as { landmarks: Record<string, unknown>[] };
    raw.landmarks[0] = { ...raw.landmarks[0], discoveryNodeId: 42 };
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain('landmarks[0].discoveryNodeId');
  });
});

describe('Round 53 landmark discovery gating', () => {
  const loadMaps = () => new Map([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
  ]);

  /** Reference ids covering every event/landmark gate in the shipped atlas. */
  const fullReferences = (knowledgeNodeIds: string[]) => ({
    knowledgeNodeIds: new Set([
      ...knowledgeNodeIds,
      'place.mist-sluice',
      'place.mist-north-cap',
      'place.mist-south-pool',
      'place.mist-willow-market',
      'place.south-hamlet',
    ]),
    periodIds: new Set(['period.dusk', 'period.night']),
    weatherIds: new Set(['weather.drizzle', 'weather.rain', 'weather.storm']),
    npcIds: new Set(['char.shi-bei', 'char.bai-luzhou']),
  });

  const parseAssembled = () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.data;
  };

  it('keeps the discovery-gated reedbank landing when its knowledge node is registered', () => {
    const assembled = assembleWorldMap(parseAssembled(), loadMaps(), fullReferences([
      'event.old-footprints', 'place.reedbank', 'event.r43-wayfarer-letter', 'event.r44-dock-claim',
    ]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.landmarks.map(({ id }) => id)).toContain('landmark.reedbank-landing');
    expect(assembled.landmarks.find(({ id }) => id === 'landmark.reedbank-landing')?.discoveryNodeId)
      .toBe('place.reedbank');
    expect(assembled.warnings).toEqual([]);
  });

  it('isolates only the landmark (and event) whose discovery node is unregistered', () => {
    const assembled = assembleWorldMap(parseAssembled(), loadMaps(), fullReferences([
      'event.old-footprints', 'event.r43-wayfarer-letter', 'event.r44-dock-claim',
    ]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.landmarks.map(({ id }) => id)).not.toContain('landmark.reedbank-landing');
    expect(assembled.landmarks).toHaveLength(9);
    expect(assembled.events.map(({ id }) => id)).not.toContain('event.reedbank-traces');
    const joined = assembled.warnings.join('\n');
    expect(joined).toContain('landmark.reedbank-landing');
    expect(joined).toContain('发现节点未登记：place.reedbank');
    expect(joined).toContain('event.reedbank-traces');
  });

  it('registers the shipped reedbank gate against the real knowledge node set', () => {
    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] };
    const assembled = assembleWorldMap(
      parseAssembled(),
      loadMaps(),
      fullReferences(nodes.nodes.map(({ id }) => id)),
    );
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.landmarks.map(({ id }) => id)).toContain('landmark.reedbank-landing');
    expect(assembled.warnings.join('\n')).not.toContain('发现节点未登记');
  });

  it('projects no gated landmark fields until the linked knowledge node is known', () => {
    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] };
    const parsed = parseAssembled();
    const assembled = assembleWorldMap(
      parsed,
      loadMaps(),
      fullReferences(nodes.nodes.map(({ id }) => id)),
    );
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;

    const undiscovered = selectVisibleWorldLandmarks(assembled.landmarks, new Set());
    const undiscoveredJson = JSON.stringify(undiscovered);
    expect(undiscovered).toHaveLength(4);
    expect(undiscoveredJson).not.toContain('芦岸登船点');
    expect(undiscoveredJson).not.toContain('landmark.reedbank-landing');
    expect(undiscoveredJson).not.toContain('place.reedbank');
    expect(undiscoveredJson).not.toContain('旧渠石闸');
    expect(undiscoveredJson).not.toContain('北岬水尺');
    expect(undiscoveredJson).not.toContain('南湾回水池');
    // Round 60 gates the two R58 landing landmarks behind their first-visit nodes.
    expect(undiscoveredJson).not.toContain('芦桥集');
    expect(undiscoveredJson).not.toContain('南麓聚落');

    const discovered = selectVisibleWorldLandmarks(assembled.landmarks, new Set(['place.reedbank']));
    expect(discovered).toHaveLength(5);
    expect(discovered.find(({ id }) => id === 'landmark.reedbank-landing')?.name).toBe('芦岸登船点');

    const bothNewSurveySites = selectVisibleWorldLandmarks(
      assembled.landmarks,
      new Set(['place.reedbank', 'place.mist-north-cap', 'place.mist-south-pool']),
    );
    expect(bothNewSurveySites).toHaveLength(7);
    expect(bothNewSurveySites.map(({ id }) => id)).toContain('landmark.mist-north-cap');
    expect(bothNewSurveySites.map(({ id }) => id)).toContain('landmark.mist-south-pool');
  });
});
