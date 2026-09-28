/**
 * Round 40 structural regression tests for the grid-map renderer.
 *
 * The renderer imports Phaser as types only, so these tests run in the bare
 * Node environment against a recording scene stand-in. They pin down the
 * structural contract of the Round 40 single-Graphics rewrite:
 *
 * - scene-object count is O(1) per map (one container + one graphics layer),
 *   never growing with grid area — the core regression these tests guard;
 * - draw-command order per cell stays base fill → border stroke → top
 *   highlight → right-edge shadow, with the exact geometry, colors and
 *   alphas of the pre-Round-40 tile-per-rectangle renderer, so the visual
 *   result is unchanged;
 * - the drawn extent always equals the map's pixel dimensions.
 *
 * Timing and heap behaviour live in tests/performance-round-40.bench.ts —
 * deliberately outside this unit-test gate.
 */

import { describe, expect, it } from 'vitest';

import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import {
  buildGridMapDrawCommands,
  cellCenterOffset,
  renderGridMap,
  type GridMapDrawCommand,
} from '../src/engine/grid-map-renderer';

function makeMap(columns: number, rows: number): GridMap {
  const grid: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < columns; col++) {
      line += (row + col) % 5 === 0 ? '#' : '.';
    }
    grid.push(line);
  }
  grid[0] = `.${(grid[0] ?? '').slice(1)}`; // keep playerStart walkable
  const parsed = parseGridMap({
    id: `test-${columns}x${rows}`,
    name: '测试地图',
    tileSize: 16,
    columns,
    rows,
    tileTypes: {
      '.': { color: '#343c4d', solid: false },
      '#': { color: '#8a94a6', solid: true },
    },
    grid,
    playerStart: { col: 0, row: 0 },
  });
  if (!parsed.ok) {
    throw new Error(`test map must parse: ${parsed.errors.join('; ')}`);
  }
  return parsed.map;
}

/** Recording scene stand-in: counts scene objects and graphics calls. */
function createRecordingScene(): {
  scene: unknown;
  counts: { containers: number; rectangles: number; graphics: number };
  draws: { op: string; args: number[] }[];
  containerChildren: unknown[][];
  scrollFactorCalls: number[];
} {
  const counts = { containers: 0, rectangles: 0, graphics: 0 };
  const draws: { op: string; args: number[] }[] = [];
  const containerChildren: unknown[][] = [];
  const scrollFactorCalls: number[] = [];
  const scene = {
    add: {
      container: (x: number, y: number) => {
        counts.containers += 1;
        const children: unknown[] = [];
        containerChildren.push(children);
        return {
          x,
          y,
          setScrollFactor(value: number) {
            scrollFactorCalls.push(value);
            return this;
          },
          add(child: unknown) {
            children.push(child);
            return this;
          },
          destroy() {},
        };
      },
      rectangle: () => {
        counts.rectangles += 1;
        return { setStrokeStyle() {
          return this;
        } };
      },
      graphics: () => {
        counts.graphics += 1;
        return {
          setScrollFactor(value: number) {
            scrollFactorCalls.push(value);
            return this;
          },
          fillStyle(color: number, alpha: number) {
            draws.push({ op: 'fillStyle', args: [color, alpha] });
            return this;
          },
          fillRect(x: number, y: number, width: number, height: number) {
            draws.push({ op: 'fillRect', args: [x, y, width, height] });
            return this;
          },
          lineStyle(lineWidth: number, color: number, alpha: number) {
            draws.push({ op: 'lineStyle', args: [lineWidth, color, alpha] });
            return this;
          },
          strokeRect(x: number, y: number, width: number, height: number) {
            draws.push({ op: 'strokeRect', args: [x, y, width, height] });
            return this;
          },
        };
      },
    },
  };
  return { scene, counts, draws, containerChildren, scrollFactorCalls };
}

describe('buildGridMapDrawCommands', () => {
  it('emits exactly four commands per rendered cell', () => {
    const map = makeMap(3, 2); // 6 cells
    const commands = buildGridMapDrawCommands(map);
    expect(commands).toHaveLength(24);
    expect(commands.every((command) => command.op === 'fillRect' || command.op === 'strokeRect')).toBe(true);
  });

  it('keeps the per-cell order base fill → border stroke → highlight → shadow with exact geometry', () => {
    const single = parseGridMap({
      id: 'single',
      name: '单格',
      tileSize: 16,
      columns: 1,
      rows: 1,
      tileTypes: { '.': { color: '#343c4d', solid: false } },
      grid: ['.'],
      playerStart: { col: 0, row: 0 },
    });
    if (!single.ok) {
      throw new Error(single.errors.join('; '));
    }
    // tileSize 16 → edge = max(1, round(16/16)) = 1
    // #343c4d = rgb(52,60,77); highlight +18 → rgb(70,78,95) = 0x464e5f; shadow −20 → rgb(32,40,57) = 0x202839
    const expected: GridMapDrawCommand[] = [
      { op: 'fillRect', x: 0, y: 0, width: 16, height: 16, color: 0x343c4d, alpha: 1 },
      { op: 'strokeRect', x: 0, y: 0, width: 16, height: 16, color: 0x0b0e14, alpha: 0.35 },
      { op: 'fillRect', x: 1, y: 0, width: 14, height: 1, color: 0x464e5f, alpha: 0.75 },
      { op: 'fillRect', x: 15, y: 1, width: 1, height: 14, color: 0x202839, alpha: 0.75 },
    ];
    expect(buildGridMapDrawCommands(single.map)).toEqual(expected);
  });

  it('offsets cell geometry by column and row', () => {
    const map = makeMap(2, 2);
    const commands = buildGridMapDrawCommands(map);
    // Cell (1, 0) is the 5th–8th command block (index 4..7).
    const cell = commands.slice(4, 8);
    expect(cell.map((command) => [command.op, command.x, command.y, command.width, command.height])).toEqual([
      ['fillRect', 16, 0, 16, 16],
      ['strokeRect', 16, 0, 16, 16],
      ['fillRect', 17, 0, 14, 1],
      ['fillRect', 31, 1, 1, 14],
    ]);
  });

  it('covers exactly the map pixel extent', () => {
    const map = makeMap(7, 5);
    const commands = buildGridMapDrawCommands(map);
    expect(Math.min(...commands.map((command) => command.x))).toBe(0);
    expect(Math.min(...commands.map((command) => command.y))).toBe(0);
    expect(Math.max(...commands.map((command) => command.x + command.width))).toBe(map.pixelWidth);
    expect(Math.max(...commands.map((command) => command.y + command.height))).toBe(map.pixelHeight);
  });

  it('derives identical colors for identical tile types (cached derivations stay consistent)', () => {
    const map = makeMap(4, 4);
    const commands = buildGridMapDrawCommands(map);
    const fills = commands.filter((command) => command.op === 'fillRect' && command.width === 16 && command.height === 16);
    const byColor = new Set(fills.map((command) => command.color));
    // Exactly the two authored tile colors appear as base fills.
    expect(byColor.size).toBe(2);
    expect(byColor.has(0x343c4d)).toBe(true);
    expect(byColor.has(0x8a94a6)).toBe(true);
  });
});

describe('renderGridMap scene-object allocation (Round 40 O(1) contract)', () => {
  it('allocates one container and one graphics layer, and no rectangles', () => {
    const { scene, counts } = createRecordingScene();
    renderGridMap(scene as never, makeMap(16, 9), 0, 0);
    expect(counts).toEqual({ containers: 1, rectangles: 0, graphics: 1 });
  });

  it('opts the world container and fallback graphics out of the HUD fixed-scroll default', () => {
    const { scene, scrollFactorCalls } = createRecordingScene();
    renderGridMap(scene as never, makeMap(2, 2), 0, 0);
    expect(scrollFactorCalls).toEqual([1, 1]);
  });

  it('keeps the scene-object count constant as grid area grows 16×', () => {
    const small = createRecordingScene();
    renderGridMap(small.scene as never, makeMap(16, 9), 0, 0);
    const large = createRecordingScene();
    renderGridMap(large.scene as never, makeMap(64, 36), 0, 0);

    const smallObjects = small.counts.containers + small.counts.rectangles + small.counts.graphics;
    const largeObjects = large.counts.containers + large.counts.rectangles + large.counts.graphics;
    expect(smallObjects).toBe(2);
    expect(largeObjects).toBe(2); // does not grow with the 144 → 2304 cells
    expect(large.counts.rectangles).toBe(0);
  });

  it('parents the graphics layer inside the returned container, preserving map-transition destroy semantics', () => {
    const { scene, containerChildren } = createRecordingScene();
    const container = renderGridMap(scene as never, makeMap(3, 3), 40, 60);
    // The container is exactly what scene.add.container produced (the public
    // destroy() target in grid-scene.ts), and it holds the graphics layer:
    // Phaser's Container.destroy() destroys children with it, so the map-
    // transition destroy path in grid-scene.ts keeps working unchanged.
    expect(container).toHaveProperty('x', 40);
    expect(container).toHaveProperty('y', 60);
    expect(containerChildren).toHaveLength(1);
    expect(containerChildren[0]).toHaveLength(1);
  });

  it('bakes one draw call per command and de-duplicates consecutive identical style calls', () => {
    const map = makeMap(4, 4);
    const { scene, draws } = createRecordingScene();
    renderGridMap(scene as never, map, 0, 0);
    const commands = buildGridMapDrawCommands(map);
    const shapeDraws = draws.filter((draw) => draw.op === 'fillRect' || draw.op === 'strokeRect');
    expect(shapeDraws).toHaveLength(commands.length);

    // lineStyle is set once (all strokes share color/alpha/width); fillStyle
    // only changes when the color/alpha actually changes.
    const lineStyles = draws.filter((draw) => draw.op === 'lineStyle');
    expect(lineStyles).toHaveLength(1);
    expect(lineStyles[0]?.args).toEqual([1, 0x0b0e14, 0.35]);
  });
});

describe('cellCenterOffset', () => {
  it('returns the pixel centre of a cell as a plain { x, y } offset', () => {
    expect(cellCenterOffset(makeMap(3, 3), 0, 0)).toEqual({ x: 8, y: 8 });
    expect(cellCenterOffset(makeMap(3, 3), 2, 1)).toEqual({ x: 40, y: 24 });
  });
});
