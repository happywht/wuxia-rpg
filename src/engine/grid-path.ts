/**
 * Deterministic four-way shortest-path search over a grid map.
 *
 * Pure engine logic with no Phaser dependency: the scene hands over a
 * map-like surface and receives a reproducible cell-by-cell route. Ties
 * between equal-length routes are broken by the fixed north/east/south/west
 * expansion order, so the same inputs always yield the same path.
 *
 * Solid goals (lakes, buildings — landmarks often sit on one) are supported
 * through an approach search: within a configurable Manhattan radius around
 * the blocked goal, the walkable cell with the shortest walking distance
 * from the start becomes the route's stop cell.
 */

import type { CellPosition, GridMap } from './grid-map';

/** Cardinal step direction, named in screen orientation (row 0 is north). */
export type GridDirection = 'north' | 'east' | 'south' | 'west';

/** Read-only surface queries the pathfinder needs; any GridMap satisfies it. */
export type GridPathSurface = Pick<GridMap, 'columns' | 'rows' | 'inBounds' | 'canEnter'>;

/** Fixed expansion order; keeps equal-length route ties reproducible. */
const DIRECTIONS: readonly { direction: GridDirection; dc: number; dr: number }[] = [
  { direction: 'north', dc: 0, dr: -1 },
  { direction: 'east', dc: 1, dr: 0 },
  { direction: 'south', dc: 0, dr: 1 },
  { direction: 'west', dc: -1, dr: 0 },
];

/** Default Manhattan radius searched around a blocked goal for a stop cell. */
export const DEFAULT_APPROACH_RADIUS = 2;

export interface GridPathOptions {
  /**
   * Manhattan radius around a solid goal searched for the nearest reachable
   * walkable stop cell. Ignored when the goal itself is walkable.
   * @default 2
   */
  approachRadius?: number;
}

/** One straight segment of a route, for compact step/direction descriptions. */
export interface PathRun {
  direction: GridDirection;
  steps: number;
  from: CellPosition;
  to: CellPosition;
}

/**
 * Finds the shortest four-way route from `start` to `goal`.
 *
 * Returns the full cell list including both endpoints (`[start]` when already
 * at the goal), or null when an endpoint is invalid (out of bounds, solid
 * start, out-of-bounds goal) or no walkable route/stop cell exists. A solid
 * in-bounds goal redirects the route to the closest approach cell within
 * `options.approachRadius`.
 */
export function findGridPath(
  map: GridPathSurface,
  start: CellPosition,
  goal: CellPosition,
  options: GridPathOptions = {},
): CellPosition[] | null {
  if (!map.canEnter(start.col, start.row)) return null;
  if (!map.inBounds(goal.col, goal.row)) return null;
  if (start.col === goal.col && start.row === goal.row) {
    return [{ col: start.col, row: start.row }];
  }
  const requestedRadius = options.approachRadius ?? DEFAULT_APPROACH_RADIUS;
  const radius = Number.isFinite(requestedRadius)
    ? Math.min(map.columns + map.rows, Math.max(0, Math.trunc(requestedRadius)))
    : DEFAULT_APPROACH_RADIUS;
  const targets = collectStopTargets(map, goal, radius);
  if (targets.size === 0) return null;

  // Breadth-first search over flat indices: 256×256 worst case is 65,536
  // cells, one Int32Array of parents, and one scan — cheap enough to rerun
  // on every player step.
  const columns = map.columns;
  const parent = new Int32Array(columns * map.rows).fill(-1);
  const startIndex = start.row * columns + start.col;
  parent[startIndex] = startIndex;
  const queue: number[] = [startIndex];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (targets.has(current)) return reconstructPath(parent, columns, current);
    const col = current % columns;
    const row = (current - col) / columns;
    for (const { dc, dr } of DIRECTIONS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (!map.canEnter(nextCol, nextRow)) continue;
      const nextIndex = nextRow * columns + nextCol;
      if (parent[nextIndex] !== -1) continue;
      parent[nextIndex] = current;
      queue.push(nextIndex);
    }
  }
  return null;
}

/**
 * Routes to the closest reachable, walkable cell orthogonally beside a target.
 * This is useful for interactions whose target occupies its own cell: the
 * player must stop beside it to press the interaction key. Candidate order is
 * north/east/south/west, then shortest path, keeping ties deterministic.
 */
export function findGridPathToAdjacentCell(
  map: GridPathSurface,
  start: CellPosition,
  target: CellPosition,
): CellPosition[] | null {
  if (!map.inBounds(target.col, target.row)) return null;
  const candidates = [
    { col: target.col, row: target.row - 1 },
    { col: target.col + 1, row: target.row },
    { col: target.col, row: target.row + 1 },
    { col: target.col - 1, row: target.row },
  ];
  let best: CellPosition[] | null = null;
  for (const candidate of candidates) {
    if (!map.canEnter(candidate.col, candidate.row)) continue;
    const path = findGridPath(map, start, candidate, { approachRadius: 0 });
    if (path !== null && (best === null || path.length < best.length)) best = path;
  }
  return best;
}

/**
 * Collapses a cell path into straight per-direction runs, e.g. "east 2,
 * south 3". A single-cell path summarizes to an empty list.
 */
export function summarizePathRuns(path: readonly CellPosition[]): PathRun[] {
  const runs: PathRun[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const direction = directionOf(from, to);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.direction === direction) {
      last.steps += 1;
      last.to = to;
    } else {
      runs.push({ direction, steps: 1, from: { ...from }, to: { ...to } });
    }
  }
  return runs;
}

/** Returns a compact run prefix and makes omitted later turns explicit. */
export function summarizePathRunPrefix(
  path: readonly CellPosition[],
  maxRuns = 3,
): { runs: PathRun[]; hasMore: boolean } {
  const allRuns = summarizePathRuns(path);
  const limit = Number.isFinite(maxRuns) ? Math.max(0, Math.trunc(maxRuns)) : 3;
  return { runs: allRuns.slice(0, limit), hasMore: allRuns.length > limit };
}

/** Walkable cells the route may end on: the goal itself, or its approach ring. */
function collectStopTargets(map: GridPathSurface, goal: CellPosition, radius: number): Set<number> {
  const targets = new Set<number>();
  if (map.canEnter(goal.col, goal.row)) {
    targets.add(goal.row * map.columns + goal.col);
    return targets;
  }
  for (let dr = -radius; dr <= radius; dr += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      if (Math.abs(dc) + Math.abs(dr) > radius) continue;
      const col = goal.col + dc;
      const row = goal.row + dr;
      if (map.canEnter(col, row)) targets.add(row * map.columns + col);
    }
  }
  return targets;
}

/** Walks the parent chain back to the start and returns start→end order. */
function reconstructPath(parent: Int32Array, columns: number, endIndex: number): CellPosition[] {
  const path: CellPosition[] = [];
  for (let index = endIndex; ; index = parent[index]!) {
    const col = index % columns;
    path.push({ col, row: (index - col) / columns });
    if (parent[index] === index) break;
  }
  return path.reverse();
}

/** Direction of one orthogonal step; diagonal/zero steps are caller bugs. */
function directionOf(from: CellPosition, to: CellPosition): GridDirection {
  if (to.col === from.col && to.row === from.row - 1) return 'north';
  if (to.col === from.col + 1 && to.row === from.row) return 'east';
  if (to.col === from.col && to.row === from.row + 1) return 'south';
  if (to.col === from.col - 1 && to.row === from.row) return 'west';
  throw new Error(`path step (${from.col},${from.row})→(${to.col},${to.row}) is not orthogonal`);
}
