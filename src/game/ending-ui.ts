import Phaser from 'phaser';

import {
  evaluateEndings,
  selectEnding,
  type AssembledEndingSet,
  type EndingData,
  type EndingEvaluationContext,
  type EvaluatedEnding,
} from '../engine/ending-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface EndingPanelModel {
  endingSet: AssembledEndingSet;
  context: EndingEvaluationContext;
  onFinish: (ending: EndingData) => void;
}

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Finales are browsed with their unmet authored conditions, then shown as a terminal epilogue. */
export class EndingPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private model: EndingPanelModel | null = null;
  private openState = false;
  private selectedIndex = 0;
  private selectedEnding: EndingData | null = null;
  private notice: string | null = null;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1300).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: EndingPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.selectedIndex = 0;
    this.selectedEnding = null;
    this.notice = null;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  close(): void {
    if (this.selectedEnding !== null) {
      this.finish();
      return;
    }
    this.closePanel();
  }

  destroy(): void {
    this.closePanel();
    this.container.destroy();
  }

  private closePanel(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.model = null;
    this.selectedEnding = null;
    this.onClose?.();
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [codes.UP, () => this.move(-1)], [codes.W, () => this.move(-1)],
      [codes.DOWN, () => this.move(1)], [codes.S, () => this.move(1)],
      [codes.ENTER, () => this.confirm()], [codes.ESC, () => this.close()],
    ];
    for (const [code, handler] of pairs) {
      const key = keyboard.addKey(code);
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private evaluations(): EvaluatedEnding[] {
    const model = this.model;
    return model === null ? [] : evaluateEndings(model.endingSet, model.context);
  }

  private move(delta: number): void {
    if (this.selectedEnding !== null) return;
    const count = this.model?.endingSet.endings.length ?? 0;
    if (count < 1) return;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.notice = null;
    this.render();
  }

  private confirm(): void {
    if (this.selectedEnding !== null) {
      this.finish();
      return;
    }
    const model = this.model;
    const candidate = model?.endingSet.endings[this.selectedIndex];
    if (model === null || model === undefined || candidate === undefined) return;
    const result = selectEnding(model.endingSet, candidate.id, model.context);
    if (!result.ok) {
      this.notice = result.reason;
      this.render();
      return;
    }
    this.selectedEnding = result.ending;
    this.notice = null;
    this.render();
  }

  private finish(): void {
    const ending = this.selectedEnding;
    const model = this.model;
    if (ending === null || model === null) return;
    this.closePanel();
    model.onFinish(ending);
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const width = Math.min(860, this.scene.scale.width - 28);
    const height = Math.min(510, this.scene.scale.height - 24);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.96);

    if (this.selectedEnding !== null) {
      this.addText(left + 30, top + 24, this.selectedEnding.title, 25, UI_PALETTE.accent);
      this.addText(left + width - 24, top + 31, '终章', 12, UI_PALETTE.muted, 'right');
      this.addWrapped(this.selectedEnding.epilogue, left + 34, top + 105, width - 68, 17, UI_PALETTE.text);
      this.addWrapped('此行已至归处。按 Enter 或 Esc 结束旅程并返回主菜单。', left + 34, top + height - 74,
        width - 68, 13, UI_PALETTE.jade);
      return;
    }

    this.addText(left + 24, top + 17, model.endingSet.gate.name + ' · 结局推演', 20, UI_PALETTE.accent);
    this.addText(left + width - 22, top + 22, '↑/↓ 浏览　·　Enter 选择　·　Esc 离开', 11, UI_PALETTE.muted, 'right');
    const results = this.evaluations();
    if (results.length === 0) {
      this.addWrapped('当前没有可用的结局资料。', left + 30, top + 80, width - 60, 14, UI_PALETTE.muted);
      return;
    }

    const listX = left + 28;
    const listY = top + 67;
    const listWidth = Math.min(280, Math.floor(width * 0.36));
    results.forEach((result, index) => {
      const active = index === this.selectedIndex;
      const y = listY + index * 48;
      this.addWrapped((active ? '▸ ' : '　') + result.ending.title, listX, y, listWidth - 10, 13,
        active ? UI_PALETTE.accent : UI_PALETTE.text);
      this.addText(listX + 10, y + 22, result.available ? '已达成' : '未达成', 10,
        result.available ? UI_PALETTE.jade : UI_PALETTE.muted);
    });

    const selected = results[this.selectedIndex];
    if (selected !== undefined) {
      const detailX = left + listWidth + 44;
      const detailWidth = width - listWidth - 76;
      this.addText(detailX, listY, selected.ending.title, 17, UI_PALETTE.jade);
      if (selected.available) {
        this.addWrapped('此行已有归处，可以选择此结局。', detailX, listY + 35, detailWidth, 13, UI_PALETTE.text);
        this.addWrapped(selected.ending.epilogue, detailX, listY + 78, detailWidth, 12, UI_PALETTE.muted);
      } else {
        this.addText(detailX, listY + 38, '尚缺条件', 12, UI_PALETTE.text);
        selected.unmetHints.slice(0, 5).forEach((hint, index) => {
          this.addWrapped('· ' + hint, detailX + 4, listY + 67 + index * 30, detailWidth - 8, 11, UI_PALETTE.muted);
        });
      }
    }
    if (this.notice !== null) {
      this.addWrapped(this.notice, left + 30, top + height - 60, width - 60, 12, '#e8b04b');
    }
  }

  private addText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): void {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(text);
  }

  private addWrapped(value: string, x: number, y: number, width: number, size: number, color: string): void {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(text);
  }
}
