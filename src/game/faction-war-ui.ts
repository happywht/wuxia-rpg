import Phaser from 'phaser';

import { paginateFactionWarStages, type AssembledFactionWar, type FactionWarRecord } from '../engine/faction-war';
import type { FactionMembership } from '../engine/faction-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface FactionWarPanelModel {
  war: AssembledFactionWar;
  factions: ReadonlyMap<string, { name: string }>;
  membership: FactionMembership | null;
  record: FactionWarRecord;
  registrationBlockedReason: string | null;
  onRegister: () => void;
}
type KeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Signup card for one data-authored campaign; campaign content stays in JSON. */
export class FactionWarPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: KeyBinding[] = [];
  private readonly onClose?: () => void;
  private model: FactionWarPanelModel | null = null;
  private openState = false;
  private stagePageIndex = 0;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1260).setVisible(false);
  }
  get isOpen(): boolean { return this.openState; }
  open(model: FactionWarPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.stagePageIndex = 0;
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
    const pageUp = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_UP);
    const pageUpHandler = (): void => this.shiftStagePage(-1);
    pageUp.on('down', pageUpHandler);
    this.bindings.push({ key: pageUp, handler: pageUpHandler });
    const pageDown = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_DOWN);
    const pageDownHandler = (): void => this.shiftStagePage(1);
    pageDown.on('down', pageDownHandler);
    this.bindings.push({ key: pageDown, handler: pageDownHandler });
  }
  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }
  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const war = model.war.record;
    const width = Math.min(760, this.scene.scale.width - 48);
    const height = Math.min(490, this.scene.scale.height - 36);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.92);
    const first = model.factions.get(war.firstFactionId)?.name ?? war.firstFactionId;
    const second = model.factions.get(war.secondFactionId)?.name ?? war.secondFactionId;
    this.addText(left + 28, top + 18, war.name, 21, UI_PALETTE.accent);
    this.addWrapped(war.description, left + 30, top + 53, width - 60, 12, UI_PALETTE.text);
    this.addText(left + 30, top + 126, '参战门派', 14, UI_PALETTE.jade);
    this.addText(left + 44, top + 152, first + '　×　' + second, 14, UI_PALETTE.text);
    const footerY = top + height - 92;
    const pageSize = this.stagePageSize(height);
    const page = paginateFactionWarStages(war.stages, this.stagePageIndex, pageSize);
    this.stagePageIndex = page.pageIndex;
    const pageLabel = page.pageCount > 1 ? ' · 第 ' + (page.pageIndex + 1) + '/' + page.pageCount + ' 页' : '';
    this.addText(left + 30, top + 184,
      '会盟阶段（贡献门槛 ' + war.contributionThreshold + '）' + pageLabel,
      14, UI_PALETTE.jade);
    page.stages.forEach((stage, index) => {
      const stageIndex = page.pageIndex * pageSize + index + 1;
      const rowY = top + 211 + index * 34;
      this.addText(left + 44, rowY,
        stageIndex + '．' + this.shortText(stage.title, 22) + '　·　胜利贡献 +' + stage.contribution,
        11, UI_PALETTE.text);
      const firstEnemy = this.shortText(first, 8) + '：' + this.shortText(stage.firstFactionOpponent.enemy.name, 10);
      const secondEnemy = this.shortText(second, 8) + '：' + this.shortText(stage.secondFactionOpponent.enemy.name, 10);
      this.addText(left + 44, rowY + 15, firstEnemy, 10, UI_PALETTE.muted);
      this.addText(left + width / 2, rowY + 15, secondEnemy, 10, UI_PALETTE.muted);
    });
    const stats = model.record;
    this.addText(left + 30, footerY, '战绩　报名 ' + stats.attempts + ' 次　·　胜 ' + stats.victories +
      '　·　平 ' + stats.stalemates + '　·　负 ' + stats.defeats, 12, UI_PALETTE.muted);
    const last = stats.lastOutcome === null ? '暂无' : stats.lastOutcome === 'victory' ? '胜' : stats.lastOutcome === 'stalemate' ? '平' : '负';
    this.addText(left + 30, footerY + 22, '最高贡献 ' + stats.bestContribution + '　·　上次贡献 ' + stats.lastContribution + '（' + last + '）', 12, UI_PALETTE.muted);
    if (model.registrationBlockedReason !== null) {
      this.addWrapped(model.registrationBlockedReason, left + 30, top + height - 39, width - 60, 12, '#e8b04b');
    } else {
      const pageHelp = page.pageCount > 1 ? '　·　PgUp/PgDn 翻阶段' : '';
      this.addText(left + 30, top + height - 35, 'Enter 报名并参加会盟' + pageHelp + '　·　Esc 离开', 12, UI_PALETTE.accent);
    }
  }
  private stagePageSize(height: number): number {
    const footerY = height - 92;
    return Math.max(1, Math.floor((footerY - 211 - 12) / 34));
  }
  private shiftStagePage(delta: number): void {
    const model = this.model;
    if (model === null) return;
    const height = Math.min(490, this.scene.scale.height - 36);
    const page = paginateFactionWarStages(model.war.record.stages, this.stagePageIndex, this.stagePageSize(height));
    this.stagePageIndex = Math.min(Math.max(0, page.pageIndex + delta), Math.max(0, page.pageCount - 1));
    this.render();
  }
  private shortText(value: string, maxCodePoints: number): string {
    const characters = Array.from(value);
    return characters.length <= maxCodePoints ? value : characters.slice(0, maxCodePoints - 1).join('') + '…';
  }
  private addText(x: number, y: number, text: string, size: number, color: string): void {
    const object = this.scene.add.text(x, y, text, { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color }).setOrigin(0, 0);
    this.container.add(object);
  }
  private addWrapped(text: string, x: number, y: number, width: number, size: number, color: string): void {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color,
      wordWrap: { width }, lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(object);
  }
}
