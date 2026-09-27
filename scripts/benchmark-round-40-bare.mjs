import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Round 40 supplementary measurement: bare-Node render timing.
 *
 * `vitest bench` runs source modules through Vitest's module runner, which
 * wraps every export in a getter — fine for run-over-run comparison, but the
 * absolute per-op numbers are inflated by orders of magnitude (see
 * docs/PERFORMANCE.md). This script bundles the real renderer with esbuild
 * (internal imports collapse into direct references — the approach the
 * Vitest benchmarking guide recommends for library authors) and times
 * `renderGridMap` against a recording scene in plain Node, reporting the
 * realistic order of magnitude for draw-command generation.
 *
 * Same measurement boundary as the main benchmark: a recording scene
 * stand-in, no real Phaser construction, no GPU.
 *
 * Bundling uses Vite's build API (a direct devDependency — no reliance on
 * transitive tools like esbuild).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runnerTs = path.join(root, '.tmp-round-40-bare-runner.ts');
const runnerMjs = path.join(root, '.tmp-round-40-bare-runner.mjs');

const runnerSource = `
import { readFileSync } from 'node:fs';
import { parseGridMap } from './src/engine/grid-map';
import { renderGridMap } from './src/engine/grid-map-renderer';

const raw = JSON.parse(readFileSync('data/base/maps/round-01-grid.json', 'utf8'));
const realParsed = parseGridMap(raw);
if (!realParsed.ok) throw new Error(realParsed.errors.join('; '));
const realMap = realParsed.map;

function synthetic(columns, rows) {
  const grid = [];
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const value = (row * 31 + col * 17 + ((row * col) >> 3)) % 7;
      line += value === 0 ? '#' : value < 3 ? '~' : '.';
    }
    grid.push(line);
  }
  grid[0] = '.' + grid[0].slice(1);
  const parsed = parseGridMap({
    id: 'synthetic', name: '合成', tileSize: 48, columns, rows,
    tileTypes: {
      '.': { color: '#343c4d', solid: false },
      '~': { color: '#4a5a78', solid: false },
      '#': { color: '#8a94a6', solid: true },
    },
    grid, playerStart: { col: 0, row: 0 },
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.map;
}

const counters = { containers: 0, rectangles: 0, graphics: 0 };
const scene = {
  add: {
    container: (x, y) => { counters.containers += 1; return { x, y, add() { return this; }, destroy() {} }; },
    rectangle: () => { counters.rectangles += 1; return { setStrokeStyle() { return this; } }; },
    graphics: () => { counters.graphics += 1; return { fillStyle() { return this; }, fillRect() { return this; }, lineStyle() { return this; }, strokeRect() { return this; } }; },
  },
};

console.log('[round-40] bare-Node render benchmark (vite-bundled source, recording scene, no GPU):');
for (const [label, map] of [['16x9 real fixture', realMap], ['32x24 synthetic', synthetic(32, 24)], ['64x48 synthetic', synthetic(64, 48)], ['128x96 synthetic', synthetic(128, 96)]]) {
  renderGridMap(scene, map, 0, 0); // warmup
  counters.containers = 0; counters.rectangles = 0; counters.graphics = 0;
  const iterations = 200;
  const startedAt = performance.now();
  for (let i = 0; i < iterations; i++) renderGridMap(scene, map, 0, 0);
  const msPerRender = (performance.now() - startedAt) / iterations;
  const sceneObjectsPerRender = (counters.containers + counters.rectangles + counters.graphics) / iterations;
  console.log(
    '  render ' + label + ' (' + (map.columns * map.rows) + ' cells): ' + msPerRender.toFixed(3) + ' ms/render, ' +
    ((msPerRender * 1000) / (map.columns * map.rows)).toFixed(2) + ' us/cell, ' +
    sceneObjectsPerRender + ' scene objects per render (single-machine observation, not a threshold)',
  );
}
`;

try {
  await writeFile(runnerTs, runnerSource, 'utf8');
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: runnerTs, // Node externals (node:fs) stay external instead of browser stubs
      lib: { entry: runnerTs, formats: ['es'] },
      outDir: path.dirname(runnerMjs),
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: path.basename(runnerMjs) } },
    },
  });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerMjs], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bare runner exited with ${code}`))));
    child.on('error', reject);
  });
} finally {
  await rm(runnerTs, { force: true });
  await rm(runnerMjs, { force: true });
}
