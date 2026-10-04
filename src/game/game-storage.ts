/**
 * Round 270 game-level storage factory: one seam where the menu, grid and
 * boot entry decide *which* localStorage namespace the run uses.
 *
 * Normal runs keep the exact engine behaviour (`createBrowserSaveStorage`).
 * A DEV run started with an explicit `?qa=<runId>` query instead gets every
 * storage key — availability probe, settings and all three save slots —
 * namespaced behind `wuxia-rpg.qa.<runId>.`, so a QA session can never read,
 * write or remove a player key. Anything ambiguous refuses storage outright
 * (the existing "browser disallows storage" paths take over): an invalid id,
 * two `qa` entries or a production build never silently falls back to the
 * player namespace.
 *
 * The resolution itself is pure — `search` and the localStorage accessor are
 * injected, so tests cover every branch without touching `window` or
 * `import.meta`. The generic engine stays untouched: no game or QA names
 * leak into src/engine.
 */

import {
  SAVE_KEY_PREFIX,
  type SaveStorage,
  createBrowserSaveStorage,
} from '../engine/save-system';

// ---------------------------------------------------------------------------
// QA run id protocol
// ---------------------------------------------------------------------------

/** Minimum length of a QA run id (`?qa=`). */
export const QA_RUN_ID_MIN_LENGTH = 3;

/** Maximum length of a QA run id (`?qa=`). */
export const QA_RUN_ID_MAX_LENGTH = 48;

/** Lowercase id: starts with a letter, then letters/digits/hyphens only. */
const QA_RUN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * True iff `value` is a legal QA run id: 3–48 characters, lowercase, starts
 * with a letter, continues with letters/digits/hyphens.
 */
export function isValidQaRunId(value: string): boolean {
  return (
    value.length >= QA_RUN_ID_MIN_LENGTH &&
    value.length <= QA_RUN_ID_MAX_LENGTH &&
    QA_RUN_ID_PATTERN.test(value)
  );
}

/** localStorage subset the prefixed adapter needs (tests inject a Map). */
export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Every QA key lives under `wuxia-rpg.qa.<runId>.<engine key>`. */
export function qaStorageKeyPrefix(runId: string): string {
  return `wuxia-rpg.qa.${runId}.`;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type GameStorageMode = 'normal' | 'qa' | 'refused';

export interface GameStorageResolution {
  mode: GameStorageMode;
  /** QA run id iff mode === 'qa'. */
  qaRunId: string | null;
  /**
   * Storage adapter, or null when unavailable. `refused` is ALWAYS null —
   * a refused QA query must degrade to "no storage", never to the player
   * namespace (the scenes' existing null branch handles the UX).
   */
  storage: SaveStorage | null;
  /** Human-readable reason iff mode === 'refused'. */
  message: string | null;
}

export interface ResolveGameStorageOptions {
  /** Production builds can never enable QA (`import.meta.env.DEV`). */
  dev: boolean;
  /** Raw query string (`window.location.search`, `?qa=…` included). */
  search: string;
  /**
   * localStorage accessor for tests; may return null or throw when the
   * environment disallows storage. Omitted in production callers.
   */
  openLocalStorage?: () => BrowserStorageLike | null;
}

const REFUSE_INVALID =
  'QA 标识非法（需 3–48 位小写字母开头，仅含小写字母/数字/连字符）：已拒绝访问存档存储，且不会回退到玩家存档';
const REFUSE_MULTIPLE = '查询中出现了多个 qa 参数：已拒绝访问存档存储，且不会回退到玩家存档';
const REFUSE_PRODUCTION = '正式构建不支持 QA 运行：已拒绝访问存档存储，且不会回退到玩家存档';

/**
 * Resolves which storage namespace this run uses. Pure: all environment
 * access is injected. See the module comment for the refusal rules.
 */
export function resolveGameStorage(options: ResolveGameStorageOptions): GameStorageResolution {
  const qaValues = new URLSearchParams(options.search).getAll('qa');

  if (qaValues.length === 0) {
    // Normal player run: byte-for-byte the pre-Round-270 behaviour.
    if (options.openLocalStorage === undefined) {
      return { mode: 'normal', qaRunId: null, storage: createBrowserSaveStorage(), message: null };
    }
    const localStorage = safeOpen(options.openLocalStorage);
    return {
      mode: 'normal',
      qaRunId: null,
      storage: localStorage === null ? null : probeBrowserStorage(localStorage, ''),
      message: null,
    };
  }

  // getAll guarantees length ≥ 1 here; the fallback fails validation safely.
  const qaQuery = qaValues[0] ?? '';
  if (!options.dev) {
    return { mode: 'refused', qaRunId: null, storage: null, message: REFUSE_PRODUCTION };
  }
  if (qaValues.length > 1) {
    return { mode: 'refused', qaRunId: null, storage: null, message: REFUSE_MULTIPLE };
  }
  if (!isValidQaRunId(qaQuery)) {
    return { mode: 'refused', qaRunId: null, storage: null, message: REFUSE_INVALID };
  }

  const opener = options.openLocalStorage ?? defaultOpenLocalStorage;
  const localStorage = safeOpen(opener);
  if (localStorage === null) {
    return { mode: 'qa', qaRunId: qaQuery, storage: null, message: null };
  }
  const storage = probeBrowserStorage(localStorage, qaStorageKeyPrefix(qaQuery));
  return { mode: 'qa', qaRunId: qaQuery, storage, message: null };
}

/** Runtime seam for the scenes/boot (the only impure entry in this module). */
export function resolveGameStorageForRuntime(): GameStorageResolution {
  return resolveGameStorage({
    dev: import.meta.env.DEV,
    search: window.location.search,
  });
}

// ---------------------------------------------------------------------------
// Prefixed browser adapter
// ---------------------------------------------------------------------------

function defaultOpenLocalStorage(): BrowserStorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // Some private modes throw on the bare property access.
  }
}

function safeOpen(open: () => BrowserStorageLike | null): BrowserStorageLike | null {
  try {
    return open();
  } catch {
    return null;
  }
}

/**
 * Engine-equivalent localStorage adapter, optionally behind `prefix`. The
 * availability probe writes and removes a probe key *inside the same
 * namespace* it will serve, so a QA run never probes a player key.
 */
function probeBrowserStorage(
  localStorage: BrowserStorageLike,
  prefix: string,
): SaveStorage | null {
  try {
    const probeKey = `${prefix}${SAVE_KEY_PREFIX}probe`;
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
  } catch {
    return null;
  }
  return {
    read(key) {
      const value = localStorage.getItem(`${prefix}${key}`);
      return value === null ? null : value;
    },
    write(key, value) {
      localStorage.setItem(`${prefix}${key}`, value); // May throw (quota/disabled).
    },
    remove(key) {
      localStorage.removeItem(`${prefix}${key}`);
    },
  };
}
