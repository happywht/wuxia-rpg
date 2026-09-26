import Phaser from 'phaser';
import './style.css';

import { GridScene } from './game/grid-scene';

/**
 * Round 01 boot: starts the grid-map gameplay scene in a responsive canvas.
 * World content is not bundled here — the scene fetches it from `data/` at
 * runtime and degrades to a readable message when the data is unavailable.
 */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'app',
  backgroundColor: '#0b0e14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GridScene],
});

// Give keyboard-only players and browser automation a clear focus target.
game.canvas.tabIndex = 0;
game.canvas.setAttribute('aria-label', '网格地图游戏画面');
game.canvas.focus();
