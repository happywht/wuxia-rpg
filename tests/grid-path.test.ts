import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { type CellPosition, GridMap, parseGridMap } from '../src/engine/grid-map';
import { findGridPath, summarizePathRuns } from '../src/engine/grid-path';

const TILE_TYPES = {
  '.': { color: '#000000', solid: false },
  ',': { color: '#101010', solid: false },
  '#': { color: '#202020', solid: true },
  '~': { color: '#303030', solid: true },
} as const;

/** Builds a walk/solid grid from ASCII rows: `.`/`,` walk, `#`/`~` block. */
function makeMap(rows: string[]): GridMap {
  return new GridMap({
    id: 'map.path-test',
    name: '寻路测试图',
    tileSize: 16,
    columns: rows[0]!.length,
    rows: rows.length,
    tileTypes: TILE_TYPES,
    grid: rows,
    playerStart: { col: 0, row: 0 },
  });
}

/** Shared invariants: starts where asked, orthogonal steps, walkable, no loops. */
function expectValidRoute(map: GridMap, path: CellPosition[], start: CellPosition): void {
  expect(path[0]).toEqual(start);
  expect(new Set(path.map(({ col, row }) => `${col},${row}`)).size).toBe(path.length);
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    expect(map.canEnter(to.col, to.row)).toBe(true);
    expect(Math.abs(to.col - from.col) + Math.abs(to.row - from.row)).toBe(1);
  }
}

describe('deterministic four-way grid pathfinding', () => {
  it('returns the straight open-field route including both endpoints', () => {
    const map = makeMap([
      '.....',
      '.....',
      '.....',
    ]);
    const path = findGridPath(map, { col: 1, row: 1 }, { col: 3, row: 1 });
    expect(path).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
    ]);
  });

  it('detours around a wall with the shortest route', () => {
    const map = makeMap([
      '.....',
      '.###.',
      '.....',
    ]);
    const path = findGridPath(map, { col: 1, row: 0 }, { col: 1, row: 2 });
    expect(path).not.toBeNull();
    expectValidRoute(map, path!, { col: 1, row: 0 });
    expect(path!.length).toBe(5);
    expect(path![path!.length - 1]).toEqual({ col: 1, row: 2 });
  });

  it('breaks equal-length ties with the fixed north/east/south/west order', () => {
    const map = makeMap([
      '..',
      '..',
    ]);
    const start = { col: 0, row: 1 };
    const goal = { col: 1, row: 0 };
    const path = findGridPath(map, start, goal);
    // North expands before east, so the route climbs before turning east.
    expect(path).toEqual([
      { col: 0, row: 1 },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    // Deterministic: an identical call yields the identical cell list.
    expect(findGridPath(map, start, goal)).toEqual(path);
  });

  it('stops at the closest walkable cell beside a solid goal within the default radius', () => {
    const map = makeMap([
      '.......',
      '.......',
      '...~...',
      '.......',
      '.......',
    ]);
    const goal = { col: 3, row: 2 };
    const path = findGridPath(map, { col: 0, row: 0 }, goal);
    expect(path).not.toBeNull();
    expectValidRoute(map, path!, { col: 0, row: 0 });
    const stop = path![path!.length - 1]!;
    const distance = Math.abs(stop.col - goal.col) + Math.abs(stop.row - goal.row);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(2);
    expect(path!.length).toBe(4);
  });

  it('starts on an approach cell without moving when already beside a blocked goal', () => {
    const map = makeMap([
      '...',
      '.~.',
      '...',
    ]);
    const path = findGridPath(map, { col: 1, row: 0 }, { col: 1, row: 1 });
    expect(path).toEqual([{ col: 1, row: 0 }]);
  });

  it('honours a custom approach radius and fails when no stop cell is in range', () => {
    const map = makeMap([
      '###',
      '#~#',
      '###',
      '...',
      '...',
      '...',
    ]);
    const start = { col: 1, row: 5 };
    const goal = { col: 1, row: 1 };
    expect(findGridPath(map, start, goal, { approachRadius: 0 })).toBeNull();
    expect(findGridPath(map, start, goal, { approachRadius: 1 })).toBeNull();
    const path = findGridPath(map, start, goal, { approachRadius: 2 });
    expect(findGridPath(map, start, goal, { approachRadius: Number.POSITIVE_INFINITY })).toEqual(path);
    expect(path).toEqual([
      { col: 1, row: 5 },
      { col: 1, row: 4 },
      { col: 1, row: 3 },
    ]);
  });

  it('returns null for invalid endpoints', () => {
    const map = makeMap([
      '#..',
      '...',
    ]);
    const goal = { col: 2, row: 1 };
    expect(findGridPath(map, { col: -1, row: 0 }, goal)).toBeNull();
    expect(findGridPath(map, { col: 0, row: 9 }, goal)).toBeNull();
    expect(findGridPath(map, { col: 0, row: 0 }, goal)).toBeNull(); // solid start
    expect(findGridPath(map, { col: 1, row: 0 }, { col: 9, row: 9 })).toBeNull();
    expect(findGridPath(map, { col: 1, row: 0 }, { col: -2, row: 1 })).toBeNull();
  });

  it('returns null when a walkable goal is sealed off by solid tiles', () => {
    const map = makeMap([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]);
    expect(findGridPath(map, { col: 0, row: 0 }, { col: 2, row: 2 })).toBeNull();
  });

  it('returns the start alone when already at the goal', () => {
    const map = makeMap(['...', '...']);
    expect(findGridPath(map, { col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([{ col: 1, row: 1 }]);
  });

  it('routes across the real mist-ferry map from spawn to the reedbank landing cell', () => {
    const parsed = parseGridMap(JSON.parse(
      readFileSync(new URL('../data/base/maps/round-10-mist-ferry.json', import.meta.url), 'utf8'),
    ) as unknown);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const path = findGridPath(parsed.map, parsed.map.playerStart, { col: 1, row: 4 });
    expect(path).not.toBeNull();
    expectValidRoute(parsed.map, path!, parsed.map.playerStart);
    expect(path![path!.length - 1]).toEqual({ col: 1, row: 4 });
    expect(path!.length).toBe(10); // manhattan 9, no detour around the water
  });

  it('collapses a route into per-direction runs and leaves single cells empty', () => {
    const runs = summarizePathRuns([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ]);
    expect(runs).toEqual([
      { direction: 'east', steps: 2, from: { col: 0, row: 0 }, to: { col: 2, row: 0 } },
      { direction: 'south', steps: 2, from: { col: 2, row: 0 }, to: { col: 2, row: 2 } },
    ]);
    expect(summarizePathRuns([{ col: 3, row: 3 }])).toEqual([]);
  });
});
