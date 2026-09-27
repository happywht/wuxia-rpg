import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Round 40 benchmark launcher (`npm run benchmark:round-40`).
 *
 * Runs two measurement passes and merges their exit codes:
 *
 * 1. `vitest bench --run --silent=false` with --expose-gc propagated to the
 *    pool workers through NODE_OPTIONS, so the 50-round long-run heap
 *    observation can force a full GC before reading heapUsed. Without the
 *    flag the benchmarks still run; the long-run report then labels its heap
 *    delta as an upper bound measured without forced GC.
 * 2. The bare-Node render pass (scripts/benchmark-round-40-bare.mjs): the
 *    same renderer esbuild-bundled and timed in plain Node, because the
 *    Vitest module runner inflates absolute per-op numbers by orders of
 *    magnitude (export getters) — see docs/PERFORMANCE.md.
 *
 * Exit code is non-zero when either pass fails, so CI can treat a benchmark
 * failure (structural assertion or module error) as non-zero.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');

const runPass = (file, args, extraEnv = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
      windowsHide: true,
    });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });

const vitestCode = await runPass(
  vitestCli,
  ['bench', '--run', '--silent=false'],
  { NODE_OPTIONS: [process.env.NODE_OPTIONS, '--expose-gc'].filter(Boolean).join(' ') },
);
const bareCode = await runPass(path.join(root, 'scripts', 'benchmark-round-40-bare.mjs'), []);

process.exit(vitestCode === 0 && bareCode === 0 ? 0 : 1);
