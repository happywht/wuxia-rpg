import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

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
    ]);
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
      { id: 'bad-cell', mapResourceId: 'map.round-10-mist-ferry', col: 30, row: 3, name: '越界标记', category: 'other' },
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
});
