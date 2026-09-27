import Phaser from 'phaser';
import './style.css';

import { MenuScene } from './game/menu-scene';
import { GridScene } from './game/grid-scene';
import { createBrowserSaveStorage } from './engine/save-system';
import { applyGameSettings, loadGameSettings } from './game/settings';

/**
 * Round 09 boot: the menu scene starts first (new game / continue / settings)
 * and hands over to the grid scene with a startup payload. Persistent
 * settings (volume, text scale, and since Round 41 movement layout, gamepad,
 * high contrast and reduced motion) load and apply before any scene renders.
 * World content is not bundled here — scenes fetch it from `data/` at
 * runtime and degrade to a readable message when it is unavailable.
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

applyGameSettings(game, loadGameSettings(createBrowserSaveStorage() ?? unavailableStorage()));

// Give keyboard-only players and browser automation a clear focus target.
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
