import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(projectRoot, 'mods');
const modsUrlPrefix = '/mods/';
const jsonContentType = 'application/json; charset=utf-8';

/**
 * Safe path segments may start with a letter, digit, `_`, `-` or CJK
 * character but never `.`, which rules out `..` traversal, dotfiles,
 * absolute paths, backslashes and empty segments in a single rule. Mirrors
 * the patterns in data/schema/manifest.schema.json and the loader's own
 * checks, so the server and the client agree on what a mod path may be.
 */
const safeSegmentPattern = /^[A-Za-z0-9_\-一-鿿][A-Za-z0-9._\-一-鿿]*$/;

function isSafeModRelativePath(relative: string): boolean {
  return (
    relative.length > 0 &&
    relative.endsWith('.json') &&
    relative.split('/').every((segment) => safeSegmentPattern.test(segment))
  );
}

function isWithinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

interface ModFile {
  /** Posix-style path below `mods/`, e.g. `example/maps/round-01-grid.json`. */
  relative: string;
  absolute: string;
}

/** Recursively collects the `.json` files inside `mods/`; everything else is ignored. */
function listModJsonFiles(): ModFile[] {
  const files: ModFile[] = [];
  if (!fs.existsSync(modsRoot)) {
    return files;
  }
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const relative = path.relative(modsRoot, absolute).split(path.sep).join('/');
      if (isSafeModRelativePath(relative)) {
        files.push({ relative, absolute });
      }
    }
  };
  walk(modsRoot);
  return files;
}

/**
 * Serves `mods/<modId>/<same-relative-path>` JSON during development and
 * copies the very same files into the production build. Only JSON inside
 * the repository `mods/` directory is ever reachable; traversal attempts,
 * non-JSON files and anything outside the root are answered with a 404.
 */
function modsDistribution(): Plugin {
  return {
    name: 'wuxia-rpg-mods-distribution',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rawUrl = request.url ?? '';
        if (!rawUrl.startsWith(modsUrlPrefix)) {
          next();
          return;
        }

        const pathname = rawUrl.split('?', 1)[0] ?? '';
        let relative = '';
        try {
          relative = decodeURIComponent(pathname.slice(modsUrlPrefix.length));
        } catch {
          // Malformed percent-encoding: the empty path fails the checks below.
        }
        if (!isSafeModRelativePath(relative)) {
          response.statusCode = 404;
          response.end();
          return;
        }

        const absolute = path.resolve(modsRoot, relative);
        if (!absolute.startsWith(modsRoot + path.sep)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        fs.realpath(modsRoot, (rootError, realRoot) => {
          if (rootError !== null) {
            response.statusCode = 404;
            response.end();
            return;
          }
          fs.realpath(absolute, (pathError, realFile) => {
            if (pathError !== null || !isWithinDirectory(realRoot, realFile)) {
              response.statusCode = 404;
              response.end();
              return;
            }
            fs.readFile(realFile, (readError, contents) => {
              if (readError !== null) {
                response.statusCode = 404;
                response.end();
                return;
              }
              response.statusCode = 200;
              response.setHeader('Content-Type', jsonContentType);
              // Match the public-dir behaviour (sirv dev mode): always
              // revalidate so the Round 36 data hot reload fetches the
              // freshest MOD overrides instead of a heuristic cache entry.
              response.setHeader('Cache-Control', 'no-cache');
              response.end(contents);
            });
          });
        });
      });
    },
    generateBundle() {
      for (const file of listModJsonFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `mods/${file.relative}`,
          source: fs.readFileSync(file.absolute),
        });
      }
    },
  };
}

/**
 * Keep world data as plain files and serve it from the same `data/` directory
 * during development and production. Vite copies the `data/` contents to
 * the deployment root inside `dist/`. With the relative `base: './'`,
 * `data/base/maps/example.json` is fetched from
 * `<deployment-base>/base/maps/example.json` and schemas from
 * `<deployment-base>/schema/<id>.schema.json`, including a repository-page
 * subpath. MOD overrides live in repository-root `mods/` (outside the public
 * dir); the plugin exposes `/mods/<modId>/…` in dev and emits `dist/mods/…`
 * for production, where the runtime loader joins it to the same base URL.
 * If `data/` is removed, Vite skips the missing public directory and the scene
 * reports the failed manifest request in-game.
 *
 * Round 36 adds the dev-only data hot-reload plugin (scripts/data-hmr-plugin.mjs):
 * data/mods JSON changes broadcast a custom HMR event instead of a page
 * reload. The import is dynamic and untyped because the plugin ships as
 * plain .mjs on purpose (it is also loaded by the Node-side smoke script);
 * esbuild inlines it into the bundled config either way.
 */
export default defineConfig(async () => {
  // @ts-expect-error the dev plugin is plain .mjs with no type declarations by design
  const { dataHotReload } = (await import('./scripts/data-hmr-plugin.mjs')) as {
    dataHotReload: (root: string) => Plugin;
  };
  return {
    // Relative asset/data paths keep the same build usable at `/` and under
    // a project-page prefix such as `/<repository>/` without repo-specific
    // configuration or root-origin fetches.
    base: './',
    publicDir: 'data',
    plugins: [modsDistribution(), dataHotReload(projectRoot)],
    server: {
      port: 5173,
    },
    build: {
      target: 'es2022',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'phaser-runtime',
                test: /[\\/]node_modules[\\/]phaser[\\/]/,
                priority: 100,
              },
            ],
          },
        },
      },
    },
  };
});
