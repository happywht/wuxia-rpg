import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

/** Small, data-independent keyboard reference for exploration and overlays. */
export class ControlsPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private openState = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(1200).setVisible(false);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.container.setVisible(true);
    this.render();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
  }

  destroy(): void {
    this.close();
    this.container.destroy();
  }

  private render(): void {
    this.container.removeAll(true);
    const left = 154;
    const top = 66;
    const width = 652;
    const height = 408;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.86);

    this.addText('操作手册', left + 26, top + 22, 21, UI_PALETTE.accent);
    this.addText('探索', left + 28, top + 66, 13, UI_PALETTE.jade);
    this.addText('方向键 / WASD　移动', left + 44, top + 93, 14, UI_PALETTE.text);
    this.addText('E　交互相邻人物、关口、区域事件、工位或终章石', left + 44, top + 122, 13, UI_PALETTE.text);
    this.addText('F　与相邻人物直接交谈', left + 44, top + 151, 14, UI_PALETTE.text);
    this.addText('V　原地等候片刻（面板打开时无效）', left + 44, top + 180, 14, UI_PALETTE.text);
    this.addText('B 背包　N 经脉　C 自创武学　P 伙伴　J 师门　G 成就', left + 44, top + 209, 12, UI_PALETTE.text);
    this.addText('Q 差事　M 舆图　K 百科　L 图鉴　Esc 暂停', left + 44, top + 231, 12, UI_PALETTE.text);
    this.addText('内修消耗修为和背包材料；图鉴进度随人物、地点、物品与武学发现更新', left + 44, top + 253, 10, UI_PALETTE.muted);

    this.addText('面板', left + 28, top + 278, 13, UI_PALETTE.jade);
    this.addText('↑/↓ 或 W/S　选择条目　·　Enter　确认', left + 44, top + 305, 13, UI_PALETTE.text);
    this.addText('商店可用 ←/→ 或 A/D 切换买卖；战斗中 Esc 可撤退。', left + 44, top + 334, 12, UI_PALETTE.muted);
    this.addText('H 或 Esc 收起　·　方向键在帮助页打开时不会移动', left + width - 24, top + height - 24, 11, UI_PALETTE.accent, 'right');
  }

  private addText(
    text: string,
    x: number,
    y: number,
    baseSize: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(baseSize),
      color,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
  }
}
