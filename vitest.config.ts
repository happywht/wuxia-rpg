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
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
