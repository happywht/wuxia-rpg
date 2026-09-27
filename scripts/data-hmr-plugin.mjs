import path from 'node:path';

/**
 * Round 36 dev-only data hot reload: a Vite plugin that watches the world
 * content JSON and notifies the browser through a custom HMR event instead
 * of letting Vite touch the module graph or reload the page.
 *
 * Mechanics (verified against the installed Vite 8.3.x sources):
 * - The dev-server watcher funnels every change/add/unlink event through
 *   `handleHMRUpdate`, which calls each plugin's Environment-API `hotUpdate`
 *   hook once per environment — the file does NOT need to be part of the
 *   module graph (public-dir and unimported files reach this hook too).
 * - Returning `[]` marks the update as fully custom-handled: no module HMR
 *   propagation and no full-page reload for that file.
 * - Only repository-internal JSON below `data/` and `mods/` is
 *   classified as a data change; source files, dependencies, non-JSON files
 *   and paths outside the project root are left to Vite's default handling.
 *
 * The client side of the protocol lives in `src/game/data-hot-reload.ts`;
 * the event name is duplicated there on purpose (server Node module vs.
 * browser module) and the Round 36 smoke asserts both spellings match.
 */

/** Custom HMR event broadcast to the client environment. */
export const DATA_CHANGE_EVENT = 'wuxia:data-change';

/** The two watched content layers, mirrored by the client bridge types. */
export const DATA_LAYERS = ['data', 'mods'];

/**
 * Safe path segments may start with a letter, digit, `_`, `-` or CJK
 * character but never `.`, which rules out `..` traversal, dotfiles,
 * absolute paths, backslashes and empty segments in a single rule. Mirrors
 * the pattern the mod middleware and the manifest schema already enforce,
 * so watcher-side classification and loader-side validation agree.
 */
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_\-一-鿿][A-Za-z0-9._\-一-鿿]*$/;

/**
 * Classifies an absolute watcher path as a hot-reloadable data file.
 *
 * @param {string} root project root the watcher reports paths against
 * @param {string} file absolute (slash-normalized) path of the changed file
 * @returns {{ layer: 'data' | 'mods', relative: string } | null} the layer
 *   and the path below that layer (`base/maps/x.json`, `m/maps/x.json`),
 *   or null when the path is outside both layers, unsafe or not JSON.
 */
export function classifyDataFile(root, file) {
  if (typeof file !== 'string' || file.length === 0) {
    return null;
  }
  const relative = path.relative(path.resolve(root), file);
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null; // Outside the project root: never a content change.
  }
  const posix = relative.split(path.sep).join('/');
  const layer = posix.startsWith('data/') ? 'data' : posix.startsWith('mods/') ? 'mods' : null;
  if (layer === null || !posix.endsWith('.json')) {
    return null; // Source code, config, non-JSON assets: not world content.
  }
  const below = posix.slice(layer.length + 1);
  if (below.length === 0 || below.split('/').some((segment) => !SAFE_SEGMENT_PATTERN.test(segment))) {
    return null; // Dotfiles, `..` tricks or empty segments: ignore.
  }
  return { layer, relative: below };
}

/**
 * Builds the dev-server plugin. `apply: 'serve'` keeps it (and everything
 * it imports) out of production builds entirely.
 *
 * @param {string} [root=process.cwd()] project root to classify paths against
 */
export function dataHotReload(root = process.cwd()) {
  const resolvedRoot = path.resolve(root);
  return {
    name: 'wuxia-rpg-data-hot-reload',
    apply: 'serve',
    hotUpdate(options) {
      // Broadcast to browsers only; other environments (if any) keep the
      // default handling for the file.
      if (this.environment?.name !== 'client') {
        return undefined;
      }
      const classified = classifyDataFile(resolvedRoot, options.file);
      if (classified === null) {
        return undefined; // Not a data/mods JSON: Vite's default behavior.
      }
      this.environment.hot.send({
        type: 'custom',
        event: DATA_CHANGE_EVENT,
        data: {
          layer: classified.layer,
          relative: classified.relative,
          changeType: options.type,
        },
      });
      // The reload is driven entirely by the custom event: suppress the
      // module update (and any fallback full-reload) for this file.
      return [];
    },
  };
}
