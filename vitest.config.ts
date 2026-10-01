import { defineConfig } from 'vitest/config';

/**
 * Standalone Vitest configuration (Round 38).
 *
 * Deliberately separate from `vite.config.ts`: the app config is an async
 * factory that imports the dev-only data hot-reload plugin and registers the
 * `mods/` dev-server middleware — side effects a test runner must not start.
 * When both files exist Vitest picks `vitest.config.ts` and never loads the
 * app config, keeping the engine tests free of dev-server state.
 *
 * Tests are Phaser-free engine units plus the shared data validator, so the
 * plain Node environment is enough — no DOM, no browser, no network.
 *
 * Round 40 adds the separate benchmark channel: `benchmark.include` matches
 * every `*.bench.ts` under tests/, which the plain `test.include` glob above
 * never picks up. `npm test` therefore runs unit tests only, while
 * `npm run benchmark:round-40` launches `vitest bench` explicitly — the two
 * never mix in one run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Keep schema-heavy suites from competing for CPU with the live preview.
    // Round110's unrestricted run spawned 100 workers and hit four 5s limits.
    maxWorkers: 2,
    benchmark: {
      include: ['tests/**/*.bench.ts'],
      // The render benchmark intentionally keeps Vitest's module runner (and
      // its export-getter overhead) ON so before/after runs share one
      // measurement basis; the overhead itself is documented in
      // docs/PERFORMANCE.md. This flag only silences the repeated console
      // warning Vitest prints per benchmark task.
      suppressExportGetterWarnings: true,
    },
  },
});
