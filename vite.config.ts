import { defineConfig } from 'vite';

/**
 * Keep world data as plain files and serve it from the same `data/` directory
 * during development and production. Vite serves a public directory at the
 * site root, so `data/base/maps/example.json` is fetched from `/base/maps/example.json`.
 * If `data/` is removed, Vite skips the missing public directory and the scene
 * reports the failed map request in-game.
 */
export default defineConfig({
  publicDir: 'data',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
