/// <reference types="vite/client" />

/**
 * Round 36 dev-mode data hot reload: payload of the `wuxia:data-change`
 * custom HMR event broadcast by scripts/data-hmr-plugin.mjs. Declaring the
 * interface here extends vite/client's CustomEventMap, so
 * `import.meta.hot.on('wuxia:data-change', …)` is fully typed in
 * src/game/data-hot-reload.ts.
 */
interface CustomEventMap {
  'wuxia:data-change': {
    /** `data` = public world JSON below data/, `mods` = override layer. */
    layer: 'data' | 'mods';
    /** Posix path below the layer root, e.g. `base/maps/x.json`. */
    relative: string;
    /** Watcher event kind that produced the notice. */
    changeType: 'create' | 'update' | 'delete';
  };
}
