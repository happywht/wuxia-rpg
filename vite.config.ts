import { defineConfig } from 'vite';

/**
 * Round 00: minimal build config only.
 * Engine/data pipeline options (JSON data loading, schema validation,
 * mod overrides, hot reload) are intentionally deferred to later rounds.
 */
export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
