import Phaser from 'phaser';

import {
  evaluateAchievements,
  type AchievementEvaluationContext,
  type AchievementRunState,
  type AchievementSetData,
  type EvaluatedAchievement,
} from '../engine/achievement-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface AchievementPanelModel {
  set: AchievementSetData;
  state: AchievementRunState;
  context: AchievementEvaluationContext;
}

type KeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };
const ROW_HEIGHT = 38;
const VISIBLE_ROWS = 9;
const VISIBLE_CONDITIONS = 7;
const CONDITION_ROW_HEIGHT = 36;

/** Data-driven run achievements with locked-condition and reward feedback. */
export class AchievementPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: KeyBinding[] = [];
  private readonly onClose?: () => void;
  private model: AchievementPanelModel | null = null;
  private openState = false;
  private selection = 0;
  private scroll = 0;
  private focus: 'achievements' | 'conditions' = 'achievements';
  private conditionSelection = 0;
  private conditionScroll = 0;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1300);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: AchievementPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.selection = 0;
    this.scroll = 0;
    this.focus = 'achievements';
    this.conditionSelection = 0;
    this.conditionScroll = 0;
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

  destroy(): void {
    this.close();
    this.container.destroy();
  }

  private rows(): EvaluatedAchievement[] {
    return this.model === null ? [] : evaluateAchievements(this.model.set, {
      ...this.model.context,
      state: this.model.state,
    });
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [codes.UP, () => this.move(-1)], [codes.W, () => this.move(-1)],
      [codes.DOWN, () => this.move(1)], [codes.S, () => this.move(1)],
      [codes.PAGE_UP, () => this.move(-(this.focus === 'conditions' ? VISIBLE_CONDITIONS : VISIBLE_ROWS))],
      [codes.PAGE_DOWN, () => this.move(this.focus === 'conditions' ? VISIBLE_CONDITIONS : VISIBLE_ROWS)],
      [codes.LEFT, () => this.setFocus('achievements')],
      [codes.RIGHT, () => this.setFocus('conditions')],
      [codes.ESC, () => this.close()],
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

  private move(delta: number): void {
    if (this.focus === 'conditions') {
      const count = this.rows()[this.selection]?.conditions.length ?? 0;
      if (count < 1) return;
      this.conditionSelection = (this.conditionSelection + delta + count) % count;
      if (this.conditionSelection < this.conditionScroll) this.conditionScroll = this.conditionSelection;
      if (this.conditionSelection >= this.conditionScroll + VISIBLE_CONDITIONS) {
        this.conditionScroll = this.conditionSelection - VISIBLE_CONDITIONS + 1;
      }
      this.render();
      return;
    }
    const count = this.model?.set.achievements.length ?? 0;
    if (count < 1) return;
    this.selection = (this.selection + delta + count) % count;
    if (this.selection < this.scroll) this.scroll = this.selection;
    if (this.selection >= this.scroll + VISIBLE_ROWS) this.scroll = this.selection - VISIBLE_ROWS + 1;
    this.conditionSelection = 0;
    this.conditionScroll = 0;
    this.render();
  }

  private setFocus(focus: 'achievements' | 'conditions'): void {
    if (focus === 'conditions' && (this.rows()[this.selection]?.conditions.length ?? 0) < 1) return;
    this.focus = focus;
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const rows = this.rows();
    this.selection = rows.length === 0 ? 0 : Math.min(this.selection, rows.length - 1);
    this.scroll = Math.min(this.scroll, Math.max(0, rows.length - VISIBLE_ROWS));
    const width = Math.min(890, this.scene.scale.width - 28);
    const height = Math.min(500, this.scene.scale.height - 24);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.96);
    this.addText(left + 24, top + 17, '江湖成就', 21, UI_PALETTE.accent);
    this.addText(left + width - 22, top + 22,
      '↑/↓ 选择　·　←/→ 列表/条件　·　PageUp/PageDown 翻页　·　Esc 关闭',
      11, UI_PALETTE.muted, 'right');

    const unlockedCount = rows.filter((row) => row.unlocked).length;
    this.addText(left + 28, top + 48, '已解锁 ' + unlockedCount + ' / ' + rows.length,
      11, UI_PALETTE.jade);
    const listX = left + 26;
    const listY = top + 75;
    const listWidth = Math.min(340, Math.floor(width * 0.4));
    const visible = rows.slice(this.scroll, this.scroll + VISIBLE_ROWS);
    visible.forEach((row, localIndex) => {
      const index = this.scroll + localIndex;
      const y = listY + localIndex * ROW_HEIGHT;
      const active = index === this.selection;
      if (active) addPixelSelection(this.scene, this.container, {
        x: listX, y: y - 2, width: listWidth - 6, height: ROW_HEIGHT - 2,
      });
      const marker = row.unlocked ? '● ' : '○ ';
      const label = marker + row.achievement.title;
      this.addText(listX + 8, y + 3, label, 12,
        row.unlocked ? UI_PALETTE.jade : active ? UI_PALETTE.accent : UI_PALETTE.text);
      this.addText(listX + listWidth - 14, y + 5, row.unlocked ? '已解锁' : '进行中',
        9, row.unlocked ? UI_PALETTE.jade : UI_PALETTE.muted, 'right');
      const first = row.conditions[0];
      if (first !== undefined && !row.unlocked) {
        this.addText(listX + 26, y + 21, first.currentText + ' / ' + first.targetText,
          9, UI_PALETTE.muted);
      }
    });
    if (rows.length > VISIBLE_ROWS) {
      this.addText(listX + 10, listY + VISIBLE_ROWS * ROW_HEIGHT + 3,
        '滚动 ' + (this.scroll + 1) + '–' + Math.min(this.scroll + VISIBLE_ROWS, rows.length) +
          ' / ' + rows.length, 9, UI_PALETTE.muted);
    }

    const selected = rows[this.selection];
    if (selected !== undefined) {
      this.renderDetails(selected, left + listWidth + 52, listY, width - listWidth - 88);
    }
    if (rows.length === 0) {
      this.addText(left + 32, top + 100, '本世界尚无成就资料。', 13, UI_PALETTE.muted);
    }
  }

  private renderDetails(row: EvaluatedAchievement, x: number, y: number, width: number): void {
    const achievement = row.achievement;
    this.addWrapped(achievement.title, x, y, width, 19, row.unlocked ? UI_PALETTE.jade : UI_PALETTE.accent);
    this.addWrapped(achievement.description, x, y + 34, width, 12, UI_PALETTE.text);
    const rewardParts: string[] = [];
    if ((achievement.reward.experience ?? 0) > 0) rewardParts.push('经验 +' + achievement.reward.experience);
    if ((achievement.reward.currency ?? 0) > 0) rewardParts.push('银两 +' + achievement.reward.currency);
    this.addWrapped('达成奖励：' + rewardParts.join(' · '), x, y + 78, width, 11, UI_PALETTE.jade);
    this.addText(x, y + 112, row.unlocked
      ? '奖励已随成就发放。'
      : '完成全部条件以解锁。', 11, row.unlocked ? UI_PALETTE.jade : UI_PALETTE.muted);

    this.conditionSelection = Math.min(this.conditionSelection, row.conditions.length - 1);
    this.conditionScroll = Math.min(
      this.conditionScroll,
      Math.max(0, row.conditions.length - VISIBLE_CONDITIONS),
    );
    row.conditions.slice(this.conditionScroll, this.conditionScroll + VISIBLE_CONDITIONS)
      .forEach((condition, localIndex) => {
      const index = this.conditionScroll + localIndex;
      const lineY = y + 146 + localIndex * CONDITION_ROW_HEIGHT;
      const color = condition.met ? UI_PALETTE.jade : UI_PALETTE.muted;
      if (this.focus === 'conditions' && index === this.conditionSelection) {
        addPixelSelection(this.scene, this.container, {
          x, y: lineY - 2, width, height: CONDITION_ROW_HEIGHT - 2,
        });
      }
      this.addWrapped((condition.met ? '✓ ' : '· ') + condition.hint,
        x + 4, lineY, width - 8, 10, color);
      this.addText(x + 22, lineY + 18,
        condition.currentText + ' / ' + condition.targetText, 9, color);
    });
    if (row.conditions.length > VISIBLE_CONDITIONS) {
      this.addText(x + 4, y + 146 + VISIBLE_CONDITIONS * CONDITION_ROW_HEIGHT,
        '条件 ' + (this.conditionScroll + 1) + '–' +
          Math.min(this.conditionScroll + VISIBLE_CONDITIONS, row.conditions.length) +
          ' / ' + row.conditions.length + '　（←/→ 聚焦；↑/↓ 浏览）',
        9, this.focus === 'conditions' ? UI_PALETTE.accent : UI_PALETTE.muted);
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
