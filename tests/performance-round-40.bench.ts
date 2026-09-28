/**
 * Round 40 benchmarks: grid-map render assembly, real-data loading and a
 * 50-round long-run heap observation.
 *
 * Runs only via `npm run benchmark:round-40` (launcher: scripts/benchmark-
 * round-40.mjs → `vitest bench --run --silent=false` with --expose-gc
 * propagated through NODE_OPTIONS). The regular `npm test` glob only matches
 * `*.test.ts` files, and Vitest's plain `run` mode ignores benchmark files,
 * so benchmarks stay isolated from the unit-test gate.
 *
 * Measurement boundary (see docs/PERFORMANCE.md): the render benchmark
 * measures draw-command generation plus scene-object allocation against a
 * lightweight recording scene stand-in — not real Phaser construction and
 * not GPU rasterization. The data benchmark runs the real manifest → AJV →
 * resource pipeline over an in-memory fetch stub seeded from the real
 * data/base + data/schema files, so no network latency is measured.
 *
 * Numbers are descriptive observations on this machine, never pass/fail
 * thresholds; the only assertions are structural (resource/diagnostic
 * counts), which do not depend on machine speed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { renderGridMap } from '../src/engine/grid-map-renderer';
import { loadGameData } from '../src/engine/data-loader';

// Capture into plain locals before any timed section: repeated access to
// live module bindings goes through export getters, which Vitest 5 warns
// adds measurable overhead to benchmarks.
const render = renderGridMap;
const load = loadGameData;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gc = (globalThis as { gc?: () => void }).gc;

console.log('[round-40] environment:');
console.log(`  node ${process.version} on ${process.platform} ${process.arch}`);
console.log(`  cpu: ${cpus()[0]?.model?.trim() ?? 'unknown'} (${cpus().length} cores)`);
console.log(`  gc: ${typeof gc === 'function' ? 'exposed (--expose-gc)' : 'NOT exposed — heap deltas observed without forced GC'}`);

// ---------------------------------------------------------------------------
// Fixture maps: the current real collision grid (art omitted) plus deterministic synthetic sizes
// ---------------------------------------------------------------------------

function parseOrThrow(raw: unknown, label: string): GridMap {
  const parsed = parseGridMap(raw);
  if (!parsed.ok) {
    throw new Error(`${label} must parse: ${parsed.errors.join('; ')}`);
  }
  return parsed.map;
}

const realMapData = JSON.parse(readFileSync(path.join(repoRoot, 'data', 'base', 'maps', 'round-01-grid.json'), 'utf8')) as Record<string, unknown>;
delete realMapData.art; // keep this benchmark focused on the fallback command renderer, not atlas texture baking
const realMap = parseOrThrow(realMapData, '100x100 real grid fixture');

/** Deterministic layout — same map every run, no Math.random noise. */
function syntheticMap(columns: number, rows: number): GridMap {
  const grid: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const value = (row * 31 + col * 17 + ((row * col) >> 3)) % 7;
      line += value === 0 ? '#' : value < 3 ? '~' : '.';
    }
    grid.push(line);
  }
  grid[0] = `.${(grid[0] ?? '').slice(1)}`; // keep (0, 0) walkable for playerStart
  return parseOrThrow(
    {
      id: `synthetic-${columns}x${rows}`,
      name: `合成 ${columns}×${rows}`,
      tileSize: 48,
      columns,
      rows,
      tileTypes: {
        '.': { color: '#343c4d', solid: false },
        '~': { color: '#4a5a78', solid: false },
        '#': { color: '#8a94a6', solid: true },
      },
      grid,
      playerStart: { col: 0, row: 0 },
    },
    `synthetic ${columns}x${rows}`,
  );
}

const map32x24 = syntheticMap(32, 24);
const map64x48 = syntheticMap(64, 48);
const map128x96 = syntheticMap(128, 96);

// ---------------------------------------------------------------------------
// Recording scene stand-in: counts allocated scene objects and graphics
// draw calls. The same stand-in measures both the tile-per-rectangle
// renderer and the single-Graphics renderer, so object counts are directly
// comparable across the optimization.
// ---------------------------------------------------------------------------

interface SceneCounters {
  containers: number;
  rectangles: number;
  graphics: number;
  drawCalls: number;
}

interface RecordingScene {
  scene: unknown;
  counters: SceneCounters;
}

function createRecordingScene(): RecordingScene {
  const counters: SceneCounters = { containers: 0, rectangles: 0, graphics: 0, drawCalls: 0 };
  const scene = {
    add: {
      container: (x: number, y: number) => {
        counters.containers += 1;
        return {
          x,
          y,
          setScrollFactor() {
            return this;
          },
          children: [] as unknown[],
          // Phaser's Container.add accepts a single child or an array.
          add(child: unknown | unknown[]) {
            this.children.push(...(Array.isArray(child) ? child : [child]));
            return this;
          },
          destroy() {},
        };
      },
      rectangle: () => {
        counters.rectangles += 1;
        return {
          setStrokeStyle() {
            return this;
          },
        };
      },
      graphics: () => {
        counters.graphics += 1;
        return {
          setScrollFactor() {
            return this;
          },
          fillStyle() {
            counters.drawCalls += 1;
            return this;
          },
          fillRect() {
            counters.drawCalls += 1;
            return this;
          },
          lineStyle() {
            counters.drawCalls += 1;
            return this;
          },
          strokeRect() {
            counters.drawCalls += 1;
            return this;
          },
        };
      },
    },
  };
  return { scene, counters };
}

console.log('[round-40] scene objects per single render (structure, not timing):');
for (const [label, map] of [
  ['100x100 real grid (art omitted)', realMap],
  ['32x24 synthetic', map32x24],
  ['64x48 synthetic', map64x48],
  ['128x96 synthetic', map128x96],
] as const) {
  const { scene, counters } = createRecordingScene();
  render(scene as never, map, 0, 0);
  const cells = map.columns * map.rows;
  console.log(
    `  ${label} (${cells} cells): containers=${counters.containers} rectangles=${counters.rectangles} ` +
      `graphics=${counters.graphics} drawCalls=${counters.drawCalls} ` +
      `sceneObjects=${counters.containers + counters.rectangles + counters.graphics}`,
  );
}

/** Minimal structural type of the Round 40 bench fixture we consume. */
interface BenchFixture {
  bench: (name: string, fn: () => unknown) => { run: () => Promise<unknown> };
}

/**
 * One synchronous benchmark run plus a one-line descriptive report.
 *
 * Sync tasks only: tinybench's per-op period is trustworthy for synchronous
 * functions here, while async task timing came back wildly inflated in
 * Vitest 5's rewritten (experimental) bench runner — async workloads below
 * are measured with explicit wall-clock loops instead. Even for sync tasks
 * the absolute numbers include Vitest's module-runner export-getter
 * overhead (see docs/PERFORMANCE.md §方法边界); they are comparable
 * run-over-run on one machine, not against browser wall clocks.
 */
async function runAndReport(testContext: BenchFixture, name: string, fn: () => void): Promise<void> {
  const result = (await testContext.bench(name, fn).run()) as {
    period?: number;
    totalTime?: number;
  } | null;
  const msPerOp = typeof result?.period === 'number' ? result.period * 1000 : Number.NaN;
  const opsPerSec = typeof result?.period === 'number' && result.period > 0 ? 1 / result.period : Number.NaN;
  const totalMs = typeof result?.totalTime === 'number' ? result.totalTime : Number.NaN;
  console.log(
    `  ${name}: ${msPerOp.toFixed(3)} ms/op, ${opsPerSec.toFixed(1)} ops/s ` +
      `(harness budget ${totalMs.toFixed(0)} ms; single-machine observation, not a threshold)`,
  );
}

test('grid-map render assembly across map sizes', async (testContext) => {
  const renderOnce = (map: GridMap): void => {
    const { scene } = createRecordingScene();
    render(scene as never, map, 0, 0);
  };

  console.log('[round-40] render benchmark (draw-command generation + scene-object assembly):');
  await runAndReport(testContext, 'render 100x100 real grid (art omitted)', () => renderOnce(realMap));
  await runAndReport(testContext, 'render 32x24 synthetic', () => renderOnce(map32x24));
  await runAndReport(testContext, 'render 64x48 synthetic', () => renderOnce(map64x48));
  await runAndReport(testContext, 'render 128x96 synthetic', () => renderOnce(map128x96));
});

// ---------------------------------------------------------------------------
// In-memory fetch stub seeded from the real data/ tree: the real manifest,
// schema and resource pipeline runs end-to-end with zero network latency.
// ---------------------------------------------------------------------------

const manifestFixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'data', 'base', 'manifest.json'), 'utf8'),
) as { resources: { id: string }[] };
const expectedResourceCount = manifestFixture.resources.length;
console.log(`[round-40] data fixture: ${expectedResourceCount} manifest resources, served from disk via in-memory fetch`);

interface InstalledFetch {
  servedFiles: number;
  restore: () => void;
}

function installMemoryFetch(): InstalledFetch {
  const served = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(absolute).isDirectory()) {
        walk(absolute, relative);
      } else if (entry.endsWith('.json')) {
        served.set(`/data/${relative.split(path.sep).join('/')}`, readFileSync(absolute, 'utf8'));
      }
    }
  };
  walk(path.join(repoRoot, 'data'), '');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(url, 'http://round-40-bench.local').pathname;
    const body = served.get(pathname);
    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  return {
    servedFiles: served.size,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

test('loadGameData: real manifest/schemas/resources through an in-memory fetch stub', async () => {
  const { servedFiles, restore } = installMemoryFetch();
  try {
    console.log(`  fetch stub serving ${servedFiles} JSON files read from data/ before the benchmark`);
    const rounds: number[] = [];
    for (let i = 0; i < 20; i++) {
      const startedAt = performance.now();
      const result = await load({ baseUrl: '/data' });
      rounds.push(performance.now() - startedAt);
      if (result.resources.size !== expectedResourceCount || result.diagnostics.length !== 0) {
        throw new Error(
          `unexpected load result: ${result.resources.size}/${expectedResourceCount} resources, ` +
            `${result.diagnostics.length} diagnostics`,
        );
      }
    }
    const totalMs = rounds.reduce((sum, ms) => sum + ms, 0);
    console.log(
      `[round-40] loadGameData benchmark (wall clock, zero network):\n` +
        `  loadGameData ${expectedResourceCount} resources: 20 rounds, ${(totalMs / rounds.length).toFixed(2)} ms/round avg, ` +
        `min ${Math.min(...rounds).toFixed(2)} ms, max ${Math.max(...rounds).toFixed(2)} ms, ` +
        `${((rounds.length * 1000) / totalMs).toFixed(2)} rounds/s (single-machine observation, not a threshold)`,
    );
  } finally {
    restore();
  }
});

test('50 consecutive full loads: stable counts, heap delta observed after GC', async () => {
  const { restore } = installMemoryFetch();
  const heapAfterGc = (): number => {
    gc?.();
    return process.memoryUsage().heapUsed;
  };

  try {
    const heapBefore = heapAfterGc();
    const rounds: { resources: number; diagnostics: number; ms: number }[] = [];
    for (let i = 0; i < 50; i++) {
      const startedAt = performance.now();
      const result = await load({ baseUrl: '/data' });
      rounds.push({
        resources: result.resources.size,
        diagnostics: result.diagnostics.length,
        ms: performance.now() - startedAt,
      });
    }
    const heapAfter = heapAfterGc();

    // Structural stability only — no timing or byte-count thresholds.
    for (const [index, round] of rounds.entries()) {
      expect(round.resources, `round ${index + 1} resource count`).toBe(expectedResourceCount);
      expect(round.diagnostics, `round ${index + 1} diagnostic count`).toBe(0);
    }

    const totalMs = rounds.reduce((sum, round) => sum + round.ms, 0);
    const deltaBytes = heapAfter - heapBefore;
    console.log('[round-40] 50-round long run:');
    console.log(`  every round loaded ${expectedResourceCount} resources with 0 diagnostics`);
    console.log(
      `  wall time: ${totalMs.toFixed(1)} ms total, ${(totalMs / rounds.length).toFixed(2)} ms/round avg, ` +
        `min ${Math.min(...rounds.map((round) => round.ms)).toFixed(2)} ms, max ${Math.max(...rounds.map((round) => round.ms)).toFixed(2)} ms`,
    );
    console.log(
      `  heapUsed after GC: ${(heapBefore / 1024 / 1024).toFixed(2)} MiB before → ${(heapAfter / 1024 / 1024).toFixed(2)} MiB after ` +
        `(delta ${deltaBytes >= 0 ? '+' : ''}${(deltaBytes / 1024).toFixed(1)} KiB; ${typeof gc === 'function' ? 'forced GC' : 'NO forced GC — value is an upper bound'})`,
    );
  } finally {
    restore();
  }
});
