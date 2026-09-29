/** Round 80: E-key region interactions — optional protocol, facing/range selection and assembly gating. */

import { readFileSync } from 'node:fs';
import Ajv, { type AnySchema } from 'ajv';
import { describe, expect, it } from 'vitest';

import { GridMap, type GridMapData } from '../src/engine/grid-map';
import {
  assembleWorldMap,
  parseWorldMap,
  selectInteractableRegionEvent,
  selectTriggeredRegionEvents,
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
    ...overrides,
  };
}

const emptyContext: RegionEventContext = {
  knownKnowledgeNodeIds: new Set<string>(),
  periodId: null,
  weatherId: null,
};

/** Minimal validated map: '.' walkable, '#' solid. */
function makeGridMap(lines: string[], id = 'map.a'): GridMap {
  const data: GridMapData = {
    id,
    name: id,
    tileSize: 16,
    columns: lines[0]!.length,
    rows: lines.length,
    tileTypes: {
      '.': { color: '#cccccc', solid: false },
      '#': { color: '#333333', solid: true },
    },
    grid: [...lines],
    playerStart: { col: 0, row: 0 },
  };
  return new GridMap(data);
}

function makeWorld(events: unknown[]): Record<string, unknown> {
  return {
    id: 'world.round80-test',
    startingMapResourceId: 'map.a',
    regions: [{ mapResourceId: 'map.a', name: '甲', description: '测试区域', atlasPosition: { x: 1, y: 1 } }],
    transitions: [],
    landmarks: [],
    randomEvents: [],
    events,
  };
}

const plainEvent = { id: 'event.step', mapResourceId: 'map.a', col: 4, row: 2, text: '踏入即触发。', once: true };

describe('Round 80 region interaction protocol', () => {
  it('keeps legacy step events untouched and preserves authored interaction fields', () => {
    const legacy = parseWorldMap(makeWorld([plainEvent]));
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.data.events[0]!.interaction).toBeUndefined();

    const declared = parseWorldMap(makeWorld([{
      ...plainEvent,
      id: 'event.inspect',
      interaction: { prompt: '细看石碑。', range: 3, approachDirections: ['up', 'left'] },
    }]));
    expect(declared.ok).toBe(true);
    if (declared.ok) {
      expect(declared.data.events[0]!.interaction).toEqual({
        prompt: '细看石碑。',
        range: 3,
        approachDirections: ['up', 'left'],
      });
    }

    const minimal = parseWorldMap(makeWorld([{
      ...plainEvent,
      id: 'event.inspect-minimal',
      interaction: { prompt: '查看。' },
    }]));
    expect(minimal.ok).toBe(true);
    if (minimal.ok) {
      expect(minimal.data.events[0]!.interaction).toEqual({ prompt: '查看。' });
    }
  });

  it('rejects malformed interaction declarations at the parser boundary', () => {
    const expectRejected = (interaction: unknown, keyword: string): void => {
      const parsed = parseWorldMap(makeWorld([{ ...plainEvent, interaction }]));
      expect(parsed.ok, JSON.stringify(interaction)).toBe(false);
      if (!parsed.ok) expect(parsed.errors.join('\n')).toContain(keyword);
    };
    expectRejected({ prompt: '   ' }, 'interaction.prompt');
    expectRejected({ range: 1 }, 'interaction.prompt');
    expectRejected({ prompt: '看。', range: 0 }, 'interaction.range');
    expectRejected({ prompt: '看。', range: 5 }, 'interaction.range');
    expectRejected({ prompt: '看。', range: 1.5 }, 'interaction.range');
    expectRejected({ prompt: '看。', approachDirections: [] }, 'interaction.approachDirections');
    expectRejected({ prompt: '看。', approachDirections: ['north'] }, 'interaction.approachDirections');
    expectRejected({ prompt: '看。', approachDirections: ['up', 'up'] }, 'interaction.approachDirections');
    expectRejected({ prompt: '看。', radius: 2 }, '不是受支持的字段');
  });

  it('enforces the same contract through the manifest Ajv schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson('../data/schema/world-map.schema.json') as AnySchema);

    expect(validate(readJson('../data/base/world/world-map.json'))).toBe(true);

    const expectSchemaRejected = (interaction: unknown): void => {
      const valid = validate(makeWorld([{ ...plainEvent, interaction }]));
      expect(valid, JSON.stringify(interaction)).toBe(false);
    };
    expectSchemaRejected({ prompt: '' });
    expectSchemaRejected({ prompt: '看。', range: 0 });
    expectSchemaRejected({ prompt: '看。', range: 5 });
    expectSchemaRejected({ prompt: '看。', approachDirections: [] });
    expectSchemaRejected({ prompt: '看。', approachDirections: ['up', 'up'] });
    expectSchemaRejected({ prompt: '看。', approachDirections: ['north'] });
    expectSchemaRejected({ prompt: '看。', extra: true });
  });

  it('keeps interaction events out of step-trigger selection', () => {
    const events = [
      makeEvent({ id: 'event.inspect', col: 4, row: 2, interaction: { prompt: '调查。' } }),
      makeEvent({ id: 'event.step', col: 4, row: 2 }),
    ];
    const onCell = { mapResourceId: 'map.a', col: 4, row: 2 };
    expect(selectTriggeredRegionEvents(events, onCell, new Set(), emptyContext).map(({ id }) => id))
      .toEqual(['event.step']);
  });

  it('selects aligned targets within the declared or default range with the facing toward them', () => {
    const nearby = makeEvent({ id: 'event.sign', col: 4, row: 2, interaction: { prompt: '看牌。' } });
    const far = makeEvent({ id: 'event.tower', col: 4, row: 8, interaction: { prompt: '望塔。', range: 3 } });
    const events = [nearby, far];
    const at = (col: number, row: number) => ({ mapResourceId: 'map.a', col, row });

    expect(selectInteractableRegionEvent(events, at(4, 1), new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.sign' }, prompt: '看牌。', approachDirection: 'down', distance: 1 });
    expect(selectInteractableRegionEvent(events, at(4, 3), new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.sign' }, approachDirection: 'up' });
    expect(selectInteractableRegionEvent(events, at(3, 2), new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.sign' }, approachDirection: 'right' });
    expect(selectInteractableRegionEvent(events, at(5, 2), new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.sign' }, approachDirection: 'left' });

    // Standing on the cell, drifting past the default range, diagonal cells and
    // other maps never qualify.
    expect(selectInteractableRegionEvent(events, at(4, 2), new Set(), emptyContext)).toBeNull();
    expect(selectInteractableRegionEvent(events, at(4, 4), new Set(), emptyContext)).toBeNull();
    expect(selectInteractableRegionEvent(events, at(3, 3), new Set(), emptyContext)).toBeNull();
    expect(selectInteractableRegionEvent(events, { mapResourceId: 'map.b', col: 4, row: 3 }, new Set(), emptyContext))
      .toBeNull();

    // An authored range reaches further, but only along the aligned line.
    expect(selectInteractableRegionEvent(events, at(4, 5), new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.tower' }, approachDirection: 'down', distance: 3 });
    expect(selectInteractableRegionEvent(events, at(4, 4), new Set(), emptyContext)).toBeNull();
  });

  it('filters candidates by the authored approach directions', () => {
    const events = [makeEvent({
      id: 'event.facing',
      col: 4,
      row: 2,
      interaction: { prompt: '看。', approachDirections: ['up', 'left'] },
    })];
    const at = (col: number, row: number) => ({ mapResourceId: 'map.a', col, row });
    expect(selectInteractableRegionEvent(events, at(4, 3), new Set(), emptyContext))
      .toMatchObject({ approachDirection: 'up' });
    expect(selectInteractableRegionEvent(events, at(5, 2), new Set(), emptyContext))
      .toMatchObject({ approachDirection: 'left' });
    expect(selectInteractableRegionEvent(events, at(4, 1), new Set(), emptyContext)).toBeNull();
    expect(selectInteractableRegionEvent(events, at(3, 2), new Set(), emptyContext)).toBeNull();

    // Without a direction list every cardinal facing is accepted.
    const open = [makeEvent({ id: 'event.open', col: 4, row: 2, interaction: { prompt: '看。' } })];
    for (const position of [at(4, 1), at(4, 3), at(3, 2), at(5, 2)]) {
      expect(selectInteractableRegionEvent(open, position, new Set(), emptyContext)).not.toBeNull();
    }
  });

  it('checks line of sight through intermediate cells but never the solid target itself', () => {
    const events = [makeEvent({
      id: 'event.foyer',
      col: 6,
      row: 2,
      interaction: { prompt: '看深处。', range: 3 },
    })];
    const from = { mapResourceId: 'map.a', col: 3, row: 2 };
    const allPassable = () => true;
    expect(selectInteractableRegionEvent(events, from, new Set(), emptyContext, allPassable))
      .toMatchObject({ distance: 3 });

    // A wall strictly between the player and the target blocks the inspection.
    const wallAtCol4 = (col: number) => col !== 4;
    expect(selectInteractableRegionEvent(events, from, new Set(), emptyContext, wallAtCol4)).toBeNull();

    // The target cell itself may be solid and is never tested by the callback.
    const onlyTargetBlocked = (col: number, row: number) => !(col === 6 && row === 2);
    expect(selectInteractableRegionEvent(events, from, new Set(), emptyContext, onlyTargetBlocked))
      .toMatchObject({ event: { id: 'event.foyer' } });
  });

  it('keeps live conditions and once-completion in force for interactions', () => {
    const gated = [makeEvent({
      id: 'event.gated',
      col: 4,
      row: 2,
      interaction: { prompt: '看。' },
      conditions: { knowledgeNodeIds: ['node.key'] },
    })];
    const at = { mapResourceId: 'map.a', col: 4, row: 3 };
    expect(selectInteractableRegionEvent(gated, at, new Set(), emptyContext)).toBeNull();
    const knowing: RegionEventContext = { ...emptyContext, knownKnowledgeNodeIds: new Set(['node.key']) };
    expect(selectInteractableRegionEvent(gated, at, new Set(), knowing))
      .toMatchObject({ event: { id: 'event.gated' } });
    expect(selectInteractableRegionEvent(gated, at, new Set(['event.gated']), knowing)).toBeNull();

    const repeatable = [makeEvent({
      id: 'event.repeatable',
      col: 4,
      row: 2,
      once: false,
      interaction: { prompt: '再看。' },
    })];
    expect(selectInteractableRegionEvent(repeatable, at, new Set(['event.repeatable']), knowing))
      .toMatchObject({ event: { id: 'event.repeatable' } });
  });

  it('prefers the nearest target and breaks equal-distance ties by stable id', () => {
    const events = [
      makeEvent({ id: 'event.zeta', col: 3, row: 2, interaction: { prompt: '左。' } }),
      makeEvent({ id: 'event.alpha', col: 5, row: 2, interaction: { prompt: '右。' } }),
    ];
    const at = { mapResourceId: 'map.a', col: 4, row: 2 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selection = selectInteractableRegionEvent(events, at, new Set(), emptyContext);
      expect(selection).toMatchObject({ event: { id: 'event.alpha' }, distance: 1 });
    }

    // Distance wins over id order: both candidates are eligible, the nearer
    // zeta beats the smaller-id alpha standing two cells away.
    const ranged = [
      makeEvent({ id: 'event.alpha', col: 4, row: 2, interaction: { prompt: '远处。', range: 4 } }),
      makeEvent({ id: 'event.zeta', col: 7, row: 2, interaction: { prompt: '近处。' } }),
    ];
    expect(selectInteractableRegionEvent(ranged, { ...at, col: 6 }, new Set(), emptyContext))
      .toMatchObject({ event: { id: 'event.zeta' }, distance: 1 });
  });

  it('assembles interaction targets on solid cells once a declared approach stands free', () => {
    const map = makeGridMap([
      '.....',
      '..#..',
      '.....',
    ]);
    const data = parseWorldMap(makeWorld([
      // Solid target at (2,1), approachable only from below while facing up.
      { ...plainEvent, id: 'event.solid-sign', col: 2, row: 1, interaction: { prompt: '看石牌。', approachDirections: ['up'] } },
      // Legacy enter events still require a walkable trigger cell.
      { ...plainEvent, id: 'event.enter-solid', col: 2, row: 1 },
      { ...plainEvent, id: 'event.enter-open', col: 1, row: 1 },
    ]));
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    const assembled = assembleWorldMap(data.data, new Map([['map.a', map]]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.events.map(({ id }) => id)).toEqual(['event.solid-sign', 'event.enter-open']);
    expect(assembled.warnings.join('\n')).toContain('event.enter-solid');
    expect(assembled.warnings.join('\n')).toContain('触发坐标不可通行');
    expect(assembled.warnings.join('\n')).not.toContain('event.solid-sign');
  });

  it('disables interaction events without a walkable approach or outside the map bounds', () => {
    const map = makeGridMap([
      '.....',
      '#####',
      '.....',
    ]);
    const data = parseWorldMap(makeWorld([
      // Target and every cell of its declared left/right approach line are solid.
      { ...plainEvent, id: 'event.walled', col: 2, row: 1, interaction: { prompt: '看。', approachDirections: ['left', 'right'], range: 2 } },
      // In-bounds check replaces walkability for interaction coordinates.
      { ...plainEvent, id: 'event.off-map', col: 9, row: 9, interaction: { prompt: '看。' } },
      // A wider range rescues a target whose adjacent cells are blocked.
      { ...plainEvent, id: 'event.deep-stand', col: 2, row: 1, interaction: { prompt: '看。', approachDirections: ['up'], range: 2 } },
    ]));
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    const assembled = assembleWorldMap(data.data, new Map([['map.a', map]]));
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.events.map(({ id }) => id)).toEqual(['event.deep-stand']);
    const warnings = assembled.warnings.join('\n');
    expect(warnings).toContain('event.walled');
    expect(warnings).toContain('无可通行接近格');
    expect(warnings).toContain('event.off-map');
    expect(warnings).toContain('交互坐标超出地图范围');
  });

  it('still validates discovery references on interaction events during assembly', () => {
    const map = makeGridMap(['.....', '.....', '.....']);
    const data = parseWorldMap(makeWorld([{
      ...plainEvent,
      id: 'event.dangling',
      interaction: { prompt: '看。' },
      discoverKnowledgeNodeId: 'node.deleted-by-mod',
    }]));
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    const assembled = assembleWorldMap(data.data, new Map([['map.a', map]]), {
      knowledgeNodeIds: new Set(['node.known']),
      periodIds: new Set(),
      weatherIds: new Set(),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.events).toEqual([]);
    expect(assembled.warnings.join('\n')).toContain('node.deleted-by-mod');
  });

  it('ships the broken bridge, white beacon and east-coast tide gauge as interaction scenery', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const interactive = parsed.data.events.filter(({ interaction }) => interaction !== undefined);
    expect(interactive.map(({ id }) => id)).toEqual([
      'event.r74-cloud-bridge', 'event.r79-white-beacon', 'event.r82-tide-gauge', 'event.r83-night-channel',
    ]);

    const bridge = interactive.find(({ id }) => id === 'event.r74-cloud-bridge')!;
    expect(bridge.interaction).toEqual({
      prompt: '查看断索悬桥的断口',
      approachDirections: ['left', 'right'],
    });
    const beacon = interactive.find(({ id }) => id === 'event.r79-white-beacon')!;
    expect(beacon.interaction).toEqual({
      prompt: '细看白沙上的石灯标',
      approachDirections: ['up', 'left', 'right'],
    });
    const tideGauge = interactive.find(({ id }) => id === 'event.r82-tide-gauge')!;
    expect(tideGauge.interaction).toEqual({
      prompt: '抄录东汊石潮尺的刻痕',
      range: 1,
      approachDirections: ['left', 'down'],
    });
    // Both stay within the authored default range of one cell.
    expect(bridge.interaction!.range).toBeUndefined();
    expect(beacon.interaction!.range).toBeUndefined();
  });

  it('answers the shipped island and ridge geometry through real map collision', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const manifest = readJson('../data/base/manifest.json') as { resources: { id: string; path: string; schema: string }[] };
    const maps = new Map<string, GridMap>();
    for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
      const mapJson = readJson(`../data/base/${resource.path}`) as GridMapData;
      maps.set(resource.id, new GridMap(mapJson));
    }

    const assembled = assembleWorldMap(parsed.data, maps);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.events.map(({ id }) => id)).toContain('event.r74-cloud-bridge');
    expect(assembled.events.map(({ id }) => id)).toContain('event.r79-white-beacon');

    const isles = maps.get('map.round-79-isles')!;
    const ridge = maps.get('map.round-74-cloud-ridge')!;
    const events = assembled.events;
    const onIsles = (col: number, row: number) => ({ mapResourceId: 'map.round-79-isles', col, row });
    const onRidge = (col: number, row: number) => ({ mapResourceId: 'map.round-74-cloud-ridge', col, row });

    // The beacon inspects from the south, east and west only.
    expect(selectInteractableRegionEvent(events, onIsles(80, 69), new Set(), emptyContext, isles.canEnter.bind(isles)))
      .toMatchObject({ event: { id: 'event.r79-white-beacon' }, prompt: '细看白沙上的石灯标', approachDirection: 'up', distance: 1 });
    expect(selectInteractableRegionEvent(events, onIsles(79, 68), new Set(), emptyContext, isles.canEnter.bind(isles)))
      .toMatchObject({ approachDirection: 'right' });
    expect(selectInteractableRegionEvent(events, onIsles(81, 68), new Set(), emptyContext, isles.canEnter.bind(isles)))
      .toMatchObject({ approachDirection: 'left' });
    expect(selectInteractableRegionEvent(events, onIsles(80, 67), new Set(), emptyContext, isles.canEnter.bind(isles)))
      .toBeNull();

    // The broken bridge inspects along its axis only.
    expect(selectInteractableRegionEvent(events, onRidge(71, 42), new Set(), emptyContext, ridge.canEnter.bind(ridge)))
      .toMatchObject({ event: { id: 'event.r74-cloud-bridge' }, prompt: '查看断索悬桥的断口', approachDirection: 'right', distance: 1 });
    expect(selectInteractableRegionEvent(events, onRidge(73, 42), new Set(), emptyContext, ridge.canEnter.bind(ridge)))
      .toMatchObject({ approachDirection: 'left' });
    expect(selectInteractableRegionEvent(events, onRidge(72, 41), new Set(), emptyContext, ridge.canEnter.bind(ridge)))
      .toBeNull();
    expect(selectInteractableRegionEvent(events, onRidge(72, 43), new Set(), emptyContext, ridge.canEnter.bind(ridge)))
      .toBeNull();

    // Stepping onto either scenery cell no longer settles the event.
    expect(selectTriggeredRegionEvents(events, onIsles(80, 68), new Set(), emptyContext)).toEqual([]);
    expect(selectTriggeredRegionEvents(events, onRidge(72, 42), new Set(), emptyContext)).toEqual([]);
  });
});
