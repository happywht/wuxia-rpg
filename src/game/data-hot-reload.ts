/**
 * Round 36 browser-side bridge for dev-mode data hot reload.
 *
 * Subscribes to the `wuxia:data-change` custom HMR event broadcast by
 * scripts/data-hmr-plugin.mjs and hands merged batches to a listener. The
 * server plugin already suppresses Vite's default module update and page
 * reload for data/mods JSON, so the subscriber decides what a reload means:
 * the menu re-runs the shared world loader, the gameplay scene waits for a
 * safe boundary and rebuilds the world around the captured run snapshot
 * (see menu-scene.ts / grid-scene.ts).
 *
 * Editor saves burst several watcher events within a few milliseconds;
 * notices are therefore collected per file (latest change wins) inside a
 * short debounce window and delivered as one batch. The unsubscribe
 * function cancels the pending timer and detaches the HMR listener, so a
 * scene shutdown or HMR replacement never leaks or fires afterwards.
 *
 * In production builds `import.meta.env.DEV` folds to `false`, the HMR
 * context does not exist, and every subscriber receives an inert no-op —
 * callers guard the subscription site with the same static check, so the
 * bridge module is side-effect free and tree-shaken from the bundle.
 */

/** Custom HMR event name; must match DATA_CHANGE_EVENT in the server plugin. */
const DATA_CHANGE_EVENT_NAME = 'wuxia:data-change';

/** Default merge window (ms) that collapses an editor's write burst. */
const DEFAULT_MERGE_WINDOW_MS = 80;

/** One merged file notice as delivered inside a batch. */
export interface DataChangeNotice {
  layer: 'data' | 'mods';
  relative: string;
  changeType: 'create' | 'update' | 'delete';
}

/** Batch delivered once per debounce window; one entry per changed file. */
export type DataChangeBatch = readonly DataChangeNotice[];

export type DataChangeListener = (batch: DataChangeBatch) => void;

/** Unsubscribe function; also cancels any batch still inside the window. */
export type UnsubscribeDataChanges = () => void;

/**
 * Subscribes to dev-server data change notices.
 *
 * @param listener receives one merged batch per debounce window
 * @param mergeWindowMs debounce window; repeated notices for the same file
 *   keep only the latest change type
 * @returns unsubscribe function (no-op outside `vite dev`)
 */
export function subscribeDataChanges(
  listener: DataChangeListener,
  mergeWindowMs: number = DEFAULT_MERGE_WINDOW_MS,
): UnsubscribeDataChanges {
  if (!import.meta.env.DEV || import.meta.hot === undefined) {
    return () => {
      // Production / no HMR channel: nothing was ever registered.
    };
  }
  const hot = import.meta.hot;
  const pending = new Map<string, DataChangeNotice>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const onNotice = (notice: DataChangeNotice): void => {
    if (closed) {
      return;
    }
    // Same-file bursts collapse to the final state (e.g. update → delete).
    pending.set(`${notice.layer}/${notice.relative}`, notice);
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      if (closed || pending.size === 0) {
        return;
      }
      const batch = [...pending.values()];
      pending.clear();
      listener(batch);
    }, mergeWindowMs);
  };

  hot.on(DATA_CHANGE_EVENT_NAME, onNotice);
  return () => {
    if (closed) {
      return;
    }
    closed = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    pending.clear();
    hot.off(DATA_CHANGE_EVENT_NAME, onNotice);
  };
}
