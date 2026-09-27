import Phaser from 'phaser';

import type { ArenaRecord, AssembledArena } from '../engine/arena-challenge';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface ArenaPanelModel {
  arena: AssembledArena;
  record: ArenaRecord;
  rewardLines: readonly string[];
  registrationBlockedReason: string | null;
  onRegister: () => void;
}

type KeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Signup and persistent record card for one adjacent, data-authored arena. */
export class ArenaPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: KeyBinding[] = [];
  private readonly onClose?: () => void;
  private model: ArenaPanelModel | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1250).setVisible(false);
  }
  get isOpen(): boolean { return this.openState; }

  open(model: ArenaPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }
  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.model = null;
    this.onClose?.();
  }
  destroy(): void { this.close(); this.container.destroy(); }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const esc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const escHandler = (): void => this.close();
    esc.on('down', escHandler);
    this.bindings.push({ key: esc, handler: escHandler });
    const enter = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const enterHandler = (): void => {
      const model = this.model;
      if (model === null || model.registrationBlockedReason !== null) return;
      model.onRegister();
      this.close();
    };
    enter.on('down', enterHandler);
    this.bindings.push({ key: enter, handler: enterHandler });
  }
  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }
  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const { arena } = model;
    const width = Math.min(700, this.scene.scale.width - 48);
    const height = Math.min(410, this.scene.scale.height - 40);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.9);
    this.addText(left + 28, top + 20, arena.record.name, 21, UI_PALETTE.accent);
    this.addWrapped(left + 30, top + 58, arena.record.description, width - 60, 13, UI_PALETTE.text);
    this.addText(left + 30, top + 123, '赛程', 14, UI_PALETTE.jade);
    arena.record.opponents.forEach((opponent, index) => {
      const arts = arena.enemyArts.get(opponent.id) ?? [];
      this.addText(left + 42, top + 151 + index * 25,
        (index + 1) + '．' + opponent.name + '　·　' + opponent.enemy.name + '　·　武学 ' + arts.length + ' 种',
        13, UI_PALETTE.text);
    });
    const rowsTop = top + 151 + arena.record.opponents.length * 25 + 8;
    this.addText(left + 30, rowsTop, '首夺彩头 / 重赛规则', 14, UI_PALETTE.jade);
    this.addText(left + 42, rowsTop + 26, model.rewardLines.join('　'), 13, UI_PALETTE.text);
    const stats = model.record;
    this.addText(left + 30, rowsTop + 62,
      '战绩　报名 ' + stats.attempts + ' 次　·　最佳胜场 ' + stats.bestWins +
      '　·　夺魁 ' + stats.championships + ' 次　·　上次胜场 ' + stats.lastWins,
      12, UI_PALETTE.muted);
    if (model.registrationBlockedReason !== null) {
      this.addWrapped(left + 30, top + height - 62, model.registrationBlockedReason, width - 60, 13, '#e8b04b');
      this.addText(left + width - 24, top + height - 29, 'Esc 离开', 11, UI_PALETTE.accent, 'right');
    } else {
      this.addText(left + 30, top + height - 33, 'Enter 报名并开始连战　·　Esc 离开', 12, UI_PALETTE.accent);
    }
  }
  private addText(x: number, y: number, text: string, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const item = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color,
    }).setOrigin(align === 'left' ? 0 : 1, 0);
    this.container.add(item);
  }
  private addWrapped(x: number, y: number, text: string, width: number, size: number, color: string): void {
    const item = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color,
      wordWrap: { width },
    }).setOrigin(0, 0);
    this.container.add(item);
  }
}
