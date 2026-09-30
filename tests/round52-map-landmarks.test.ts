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
      ['map.round-62-iron-ridge', loadMap('../data/base/maps/round-62-iron-ridge.json')],
      ['map.round-67-salt-road', loadMap('../data/base/maps/round-67-salt-road.json')],
      ['map.round-74-cloud-ridge', loadMap('../data/base/maps/round-74-cloud-ridge.json')],
      ['map.round-79-isles', loadMap('../data/base/maps/round-79-isles.json')],
      ['map.round-82-east-coast', loadMap('../data/base/maps/round-82-east-coast.json')],
      ['map.round-84-windward-isle', loadMap('../data/base/maps/round-84-windward-isle.json')],
      ['map.round-85-tide-isle', loadMap('../data/base/maps/round-85-tide-isle.json')],
      ['map.round-87-southwest-isles', loadMap('../data/base/maps/round-87-southwest-isles.json')],
      ['map.round-91-cloud-north-terrace', loadMap('../data/base/maps/round-91-cloud-north-terrace.json')],
      ['map.round-92-north-pass', loadMap('../data/base/maps/round-92-north-pass.json')],
      ['map.round-93-snow-pine-valley', loadMap('../data/base/maps/round-93-snow-pine-valley.json')],
      ['map.round-94-east-gate', loadMap('../data/base/maps/round-94-east-gate.json')],
      ['map.round-94-returning-sails', loadMap('../data/base/maps/round-94-returning-sails.json')],
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
      'landmark.iron-ridge-north-gate',
      'landmark.iron-ridge-pass',
      'landmark.iron-ridge-post',
      'landmark.iron-ridge-beacon',
      'landmark.r67-west-gate',
      'landmark.r67-caravan-post',
      'landmark.r67-brine-well',
      'landmark.r67-old-salt-yard',
      'landmark.r74-cloud-south-gate',
      'landmark.r74-cloud-waystation',
      'landmark.r74-cloud-markers',
      'landmark.r74-cloud-bridge',
      'landmark.r79-north-landing',
      'landmark.r79-tide-inn',
      'landmark.r79-west-reef',
      'landmark.r79-white-beacon',
      'landmark.r82-west-dock',
      'landmark.r82-blue-sail-market',
      'landmark.r82-east-tide-gauge',
      'landmark.r82-fog-cove',
      'landmark.r83-night-channel',
      'landmark.r84-west-shore',
      'landmark.r84-stone-hamlet',
      'landmark.r84-windward-beacon',
      'landmark.r84-spring-hollow',
      'landmark.r85-west-shore',
      'landmark.r85-reef-channel',
      'landmark.r85-reef-keeper-camp',
      'landmark.r85-tide-pool',
      'landmark.r87-north-shore',
      'landmark.r87-fog-harbor',
      'landmark.r87-mist-signal',
      'landmark.r87-spring-hollow',
      'landmark.r89-east-channel-mark',
      'landmark.r91-terrace-gate',
      'landmark.r91-goose-bridge',
      'landmark.r91-goose-terrace',
      'landmark.r91-goose-stone',
      'landmark.r92-south-gate',
      'landmark.r92-mirror-river',
      'landmark.r92-snow-beacon',
      'landmark.r92-north-cairn',
      'landmark.r93-east-gate',
      'landmark.r93-pine-sea',
      'landmark.r93-old-mark',
      'landmark.r93-wind-gap',
      'landmark.r94-east-gate',
      'landmark.r94-east-beacon',
      'landmark.r94-south-pier',
      'landmark.r94-south-lantern',
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
      ['map.round-62-iron-ridge', loadMap('../data/base/maps/round-62-iron-ridge.json')],
      ['map.round-67-salt-road', loadMap('../data/base/maps/round-67-salt-road.json')],
      ['map.round-74-cloud-ridge', loadMap('../data/base/maps/round-74-cloud-ridge.json')],
      ['map.round-79-isles', loadMap('../data/base/maps/round-79-isles.json')],
      ['map.round-82-east-coast', loadMap('../data/base/maps/round-82-east-coast.json')],
      ['map.round-84-windward-isle', loadMap('../data/base/maps/round-84-windward-isle.json')],
      ['map.round-85-tide-isle', loadMap('../data/base/maps/round-85-tide-isle.json')],
      ['map.round-87-southwest-isles', loadMap('../data/base/maps/round-87-southwest-isles.json')],
      ['map.round-91-cloud-north-terrace', loadMap('../data/base/maps/round-91-cloud-north-terrace.json')],
      ['map.round-92-north-pass', loadMap('../data/base/maps/round-92-north-pass.json')],
      ['map.round-93-snow-pine-valley', loadMap('../data/base/maps/round-93-snow-pine-valley.json')],
      ['map.round-94-east-gate', loadMap('../data/base/maps/round-94-east-gate.json')],
      ['map.round-94-returning-sails', loadMap('../data/base/maps/round-94-returning-sails.json')],
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
    ['map.round-62-iron-ridge', loadMap('../data/base/maps/round-62-iron-ridge.json')],
    ['map.round-67-salt-road', loadMap('../data/base/maps/round-67-salt-road.json')],
    ['map.round-74-cloud-ridge', loadMap('../data/base/maps/round-74-cloud-ridge.json')],
    ['map.round-79-isles', loadMap('../data/base/maps/round-79-isles.json')],
    ['map.round-82-east-coast', loadMap('../data/base/maps/round-82-east-coast.json')],
    ['map.round-84-windward-isle', loadMap('../data/base/maps/round-84-windward-isle.json')],
    ['map.round-85-tide-isle', loadMap('../data/base/maps/round-85-tide-isle.json')],
    ['map.round-87-southwest-isles', loadMap('../data/base/maps/round-87-southwest-isles.json')],
    ['map.round-91-cloud-north-terrace', loadMap('../data/base/maps/round-91-cloud-north-terrace.json')],
    ['map.round-92-north-pass', loadMap('../data/base/maps/round-92-north-pass.json')],
    ['map.round-93-snow-pine-valley', loadMap('../data/base/maps/round-93-snow-pine-valley.json')],
    ['map.round-94-east-gate', loadMap('../data/base/maps/round-94-east-gate.json')],
    ['map.round-94-returning-sails', loadMap('../data/base/maps/round-94-returning-sails.json')],
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
      'map.round-62-iron-ridge',
      'place.iron-ridge-pass',
      'place.iron-ridge-post',
      'place.iron-ridge-beacon',
      'map.round-67-salt-road',
      'place.r67-brine-well',
      'event.r67-salt-road-arrival',
      'event.r67-well-reading',
      'place.r74-cloud-markers',
      'place.r74-cloud-bridge',
      'place.r74-cloud-ridge',
      'place.r79-isles',
      'place.r79-west-reef',
      'place.r79-white-beacon',
      'place.r82-east-coast',
      'place.r82-blue-sail-market',
      'place.r82-east-tide-gauge',
      'place.r82-fog-cove',
      'place.r83-net-shoals',
      'place.r83-night-channel',
      'place.r84-windward-isle',
      'place.r84-stone-hamlet',
      'place.r84-windward-beacon',
      'place.r84-spring-hollow',
      'place.r85-tide-isle',
      'place.r85-reef-channel',
      'place.r85-camp',
      'place.r85-tide-pool',
      'place.r87-southwest-isles',
      'place.r87-fog-harbor',
      'place.r87-mist-signal',
      'place.r87-spring-hollow',
      'event.r89-chart-clue',
      'place.r89-east-channel-mark',
      'place.r89-safe-return-current',
      'event.r90-arrival-blue-sail',
      'event.r90-return-cloud-ridge',
      'map.round-91-cloud-north-terrace',
      'place.r91-cloud-north-terrace',
      'place.r91-goose-bridge',
      'place.r91-goose-terrace',
      'place.r91-goose-stone',
      'event.r91-arrival',
      'event.r91-goose-bridge',
      'event.r91-goose-terrace',
      'event.r91-goose-stone',
      'map.round-92-north-pass',
      'map.round-93-snow-pine-valley',
      'place.r92-north-pass',
      'place.r92-mirror-river',
      'place.r92-snow-beacon',
      'place.r92-north-cairn',
      'event.r92-arrival',
      'event.r92-mirror-river',
      'event.r92-snow-beacon',
      'event.r92-north-cairn',
      'place.r93-snow-pine-valley',
      'place.r94-east-gate',
      'place.r94-east-beacon',
      'place.r94-cloud-window',
      'char.r94-shen-wenqiu',
      'quest.r94-snowline-signal',
      'event.r94-east-arrival',
      'event.r94-east-beacon',
      'place.r94-returning-sails',
      'place.r94-homeward-lantern',
      'place.r94-moon-reef',
      'char.r94-zhao-qianfan',
      'quest.r94-homeward-lantern',
      'event.r94-south-arrival',
      'event.r94-south-lantern',
      'place.r93-pine-sea',
      'place.r93-old-mark',
      'place.r93-wind-gap',
      'event.r93-arrival',
      'event.r93-pine-sea',
      'event.r93-old-mark',
      'event.r93-wind-gap',
    ]),
    periodIds: new Set(['period.dusk', 'period.night', 'period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon']),
    weatherIds: new Set(['weather.clear', 'weather.drizzle', 'weather.rain', 'weather.storm', 'weather.snow', 'weather.mist', 'weather.cloudy', 'weather.overcast']),
    npcIds: new Set(['char.shi-bei', 'char.bai-luzhou', 'char.r87-ao-wanqing', 'char.r89-cheng-wenzhou', 'char.r91-nie-qiyan', 'char.r92-gu-zhaoxue', 'char.r93-liu-xunjing']),
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
    expect(assembled.landmarks).toHaveLength(59);
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
    expect(undiscovered).toHaveLength(19);
    expect(undiscoveredJson).not.toContain('芦岸登船点');
    expect(undiscoveredJson).not.toContain('landmark.reedbank-landing');
    expect(undiscoveredJson).not.toContain('place.reedbank');
    expect(undiscoveredJson).not.toContain('旧渠石闸');
    expect(undiscoveredJson).not.toContain('回声苦井');
    expect(undiscoveredJson).not.toContain('北岬水尺');
    expect(undiscoveredJson).not.toContain('南湾回水池');
    // Round 60 gates the two R58 landing landmarks behind their first-visit nodes.
    expect(undiscoveredJson).not.toContain('芦桥集');
    expect(undiscoveredJson).not.toContain('南麓聚落');

    const discovered = selectVisibleWorldLandmarks(assembled.landmarks, new Set(['place.reedbank']));
    expect(discovered).toHaveLength(20);
    expect(discovered.find(({ id }) => id === 'landmark.reedbank-landing')?.name).toBe('芦岸登船点');

    const brineWellDiscovered = selectVisibleWorldLandmarks(
      assembled.landmarks,
      new Set(['place.r67-brine-well']),
    );
    expect(brineWellDiscovered.map(({ id }) => id)).toContain('landmark.r67-brine-well');

    const bothNewSurveySites = selectVisibleWorldLandmarks(
      assembled.landmarks,
      new Set(['place.reedbank', 'place.mist-north-cap', 'place.mist-south-pool']),
    );
    expect(bothNewSurveySites).toHaveLength(22);
    expect(bothNewSurveySites.map(({ id }) => id)).toContain('landmark.mist-north-cap');
    expect(bothNewSurveySites.map(({ id }) => id)).toContain('landmark.mist-south-pool');
  });
});
