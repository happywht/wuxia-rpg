import Phaser from 'phaser';
import './style.css';

import { MenuScene } from './game/menu-scene';
import { GridScene } from './game/grid-scene';
import { resolveGameStorage } from './game/game-storage';
import { applyGameSettings, loadGameSettings } from './game/settings';

/**
 * Round 09 boot: the menu scene starts first (new game / continue / settings)
 * and hands over to the grid scene with a startup payload. Persistent
 * settings (volume, text scale, and since Round 41 movement layout, gamepad,
 * high contrast and reduced motion) load and apply before any scene renders.
 * World content is not bundled here — scenes fetch it from `data/` at
 * runtime and degrade to a readable message when it is unavailable.
 *
 * Round 270: one storage seam decides the namespace — normal player runs
 * keep the exact engine behaviour; a DEV run with an explicit valid `?qa=`
 * query gets fully QA-prefixed storage (saves AND settings) plus the F8
 * checkpoint workbench. Anything ambiguous refuses storage instead of
 * falling back to the player namespace.
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'app',
  backgroundColor: '#0b0e14',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Round 41: enable the Gamepad plugin for every scene. Without a device
  // nothing changes — each consumer still gates on the persisted setting.
  input: {
    gamepad: true,
  },
  scene: [MenuScene, GridScene],
});

const storageResolution = resolveGameStorage({
  dev: import.meta.env.DEV,
  search: window.location.search,
});
applyGameSettings(game, loadGameSettings(storageResolution.storage ?? unavailableStorage()));

// DEV + valid QA run only (dynamic import keeps the workbench out of
// production bundles entirely; a refused or normal run never reaches here).
if (import.meta.env.DEV && storageResolution.mode === 'qa' && storageResolution.qaRunId !== null) {
  const { qaRunId: runId, storage } = storageResolution;
  void import('./game/qa-workbench').then((workbench) => {
    workbench.installQaWorkbench({ game, runId, storage: storage ?? unavailableStorage(), storageAvailable: storage !== null });
  });
}

// Give keyboard-only players and browser automation a clear focus target.
if (storageResolution.mode === 'refused') {
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');
  notice.textContent = storageResolution.message;
  Object.assign(notice.style, { position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '20000',
    padding: '8px', background: '#562a2a', color: '#fff', fontSize: '14px' });
  document.body.append(notice);
}

game.canvas.tabIndex = 0;
game.canvas.setAttribute('aria-label', '网格地图游戏画面');
game.canvas.focus();

/** Reads miss and writes refuse when the browser disallows storage. */
function unavailableStorage() {
  return {
    read: () => null,
    write: () => {
      throw new Error('浏览器本地存储不可用');
    },
    remove: () => {
      throw new Error('浏览器本地存储不可用');
    },
  };
}
