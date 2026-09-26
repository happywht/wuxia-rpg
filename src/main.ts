import Phaser from 'phaser';
import './style.css';

/**
 * Round 00 boot placeholder.
 *
 * Renders a static technical panel only: no gameplay, no world content.
 * Concrete lore (names, places, quests, dialogue) lives in `data/` and must
 * never be hard-coded in engine code — see docs/ARCHITECTURE.md.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(cx, cy, this.scale.width - 48, this.scale.height - 48, 0x10141d)
      .setStrokeStyle(2, 0x3a4a63);

    this.add
      .text(cx, cy - 24, 'wuxia-rpg', {
        fontFamily: 'serif',
        fontSize: '32px',
        color: '#d8dee9',
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        cy + 20,
        '引擎引导占位 · 本轮不含玩法（Round 00）\n数据驱动的世界内容将在后续轮次由 data/ 加载。',
        {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#8a94a6',
          align: 'center',
        },
      )
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: 'app',
  backgroundColor: '#0b0e14',
  scene: BootScene,
});
