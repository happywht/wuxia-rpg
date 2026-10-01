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
import { wrapDialogueText, paginateDialogueBlocks } from './dialogue-layout';

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
  private selectedRoute: { id: string; title: string } | null = null;
  private confirming = false;
  private detailPage = 0;
  private pageCount = 1;
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
    this.selectedRoute = null; // A stale route from a previous view must not leak into a new one.
    this.confirming = false;
    this.detailPage = 0;
    this.pageCount = 1; // Stale counts from a previous view must not invite a next page.
    this.notice = null;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  close(): void {
    if (this.confirming) {
      this.confirming = false;
      this.notice = null;
      this.render();
      return;
    }
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
    this.selectedRoute = null;
    this.confirming = false;
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
      [codes.SPACE, () => this.turnPage(1)],
      [codes.RIGHT, () => this.turnPage(1)], [codes.LEFT, () => this.turnPage(-1)],
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
    if (this.selectedEnding !== null) { this.turnPage(delta); return; }
    if (this.confirming) return;
    const count = this.model?.endingSet.endings.length ?? 0;
    if (count < 1) return;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.notice = null;
    this.detailPage = 0;
    this.render();
  }

  private confirm(): void {
    if (this.selectedEnding !== null) {
      if (this.detailPage < this.pageCount - 1) this.turnPage(1);
      else this.finish();
      return;
    }
    const model = this.model;
    const candidate = model?.endingSet.endings[this.selectedIndex];
    if (model === null || model === undefined || candidate === undefined) return;
    const result = selectEnding(model.endingSet, candidate.id, model.context);
    if (!result.ok) {
      this.confirming = false;
      this.notice = result.reason;
      this.render();
      return;
    }
    if (!this.confirming) {
      this.confirming = true;
      this.detailPage = 0;
    } else {
      if (this.detailPage < this.pageCount - 1) { this.turnPage(1); return; }
      this.selectedEnding = result.ending;
      this.selectedRoute = result.route;
      this.confirming = false;
      this.detailPage = 0;
    }
    this.notice = null;
    this.render();
  }

  private turnPage(delta: number): void {
    if (!this.openState) return;
    this.detailPage = Math.max(0, Math.min(this.pageCount - 1, this.detailPage + delta));
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
    this.pageCount = 1; // Only addPaged raises it again; unpaged views show no pager.
    const width = Math.min(860, this.scene.scale.width - 28);
    const height = Math.min(510, this.scene.scale.height - 24);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.96);

    if (this.selectedEnding !== null) {
      this.addText(left + 30, top + 24, this.selectedEnding.title, 25, UI_PALETTE.accent);
      this.addText(left + width - 24, top + 31, '终章', 12, UI_PALETTE.muted, 'right');
      // Keep short receipts above the body. Long authored titles belong in
      // the lossless pager rather than consuming an unbounded header height.
      const routeText = this.selectedRoute === null ? '' : '采用路径：' + this.selectedRoute.title;
      const probe = this.scene.add.text(0, 0, '', { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(12) });
      const routeLines = wrapDialogueText(routeText, width - 68, value => probe.context.measureText(value).width);
      const routeLineHeight = Math.ceil(Number.parseInt(uiFontSize(12), 10) * 1.5);
      const inlineRoute = routeLines.length * routeLineHeight <= 34;
      probe.destroy();
      if (routeText && inlineRoute) this.addWrapped(routeText, left + 34, top + 58, width - 68, 12, UI_PALETTE.muted);
      const body = routeText && !inlineRoute ? routeText + '\n\n' + this.selectedEnding.epilogue : this.selectedEnding.epilogue;
      this.addPaged(body, left + 34, top + 92, width - 68, height - 174, 17, UI_PALETTE.text);
      // The footer must match reality: a single page never offers a next
      // page, and a multi-page read distinguishes "next page" from the
      // final page's finish.
      const pager = this.pageCount > 1 ? `终章 ${this.detailPage + 1}/${this.pageCount} · ←/→或Space翻页 · ` : '终章已完整显示 · ';
      const enter = this.pageCount > 1 && this.detailPage < this.pageCount - 1 ? 'Enter读下一页' : 'Enter结束本次旅程';
      this.addWrapped(`${pager}${enter}，Esc结束。`,
        left + 34, top + height - 64, width - 68, 12, UI_PALETTE.jade);
      return;
    }

    if (this.confirming) {
      const ending = model.endingSet.endings[this.selectedIndex];
      const route = this.evaluations()[this.selectedIndex]?.selectedRoute ?? null;
      this.addText(left + 30, top + 24, '确认此行归处', 23, UI_PALETTE.accent);
      const body = (ending?.title ?? '') + '\n采用路径：' + (route?.title ?? '原有旅程') +
        '\n\n终章结束后返回主菜单。不会自动保存或覆盖存档；已有存档仍可继续。';
      this.addPaged(body, left + 34, top + 90, width - 68, height - 162, 12, UI_PALETTE.text);
      const action = this.detailPage < this.pageCount - 1 ? 'Enter读下一页' : 'Enter确认进入终章';
      this.addWrapped(`确认 ${this.detailPage + 1}/${this.pageCount} · ←/→翻页 · ${action} · Esc取消`,
        left + 34, top + height - 64, width - 68, 12, UI_PALETTE.jade);
      return;
    }

    this.addText(left + 24, top + 17, model.endingSet.gate.name + ' · 结局推演', 20, UI_PALETTE.accent);
    this.addText(left + width - 22, top + 22, '↑/↓ 浏览　·　Enter 确认　·　Esc 离开', 11, UI_PALETTE.muted, 'right');
    const results = this.evaluations();
    if (results.length === 0) {
      this.addWrapped('当前没有可用的结局资料。', left + 30, top + 80, width - 60, 14, UI_PALETTE.muted);
      return;
    }

    const listX = left + 28;
    const listY = top + 67;
    const listWidth = Math.min(280, Math.floor(width * 0.36));
    const listCapacity = Math.max(1, Math.floor((height - 132) / 48));
    const listStart = Math.floor(this.selectedIndex / listCapacity) * listCapacity;
    results.slice(listStart, listStart + listCapacity).forEach((result, offset) => {
      const index = listStart + offset;
      const active = index === this.selectedIndex;
      const y = listY + offset * 48;
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
      const body = selected.available ? '此行已有归处（采用路径：' + (selected.selectedRoute?.title ?? '原有旅程') +
        '）。Enter先打开可取消的结束确认。\n\n' + selected.resolvedEpilogue :
        '任一完整路径达成即可，各路径内需满足全部条件：\n\n' + selected.routes.map(route =>
          route.title + (route.available ? ' · 已达成' : '\n' + route.unmetHints.map(hint => '· ' + hint).join('\n'))).join('\n\n');
      this.addPaged(body, detailX, listY + 38, detailWidth, height - 179, 12, UI_PALETTE.text);
      const detailPager = this.pageCount > 1
        ? `详情 ${this.detailPage + 1}/${this.pageCount} · Space/←/→翻页`
        : '详情已完整显示';
      this.addWrapped(detailPager, detailX, top + height - 65,
        detailWidth, 11, UI_PALETTE.muted);
    }
    if (this.notice !== null) {
      this.addWrapped('尚未达成。请查看右侧各路径缺项。', left + 30, top + height - 34, width - 60, 11, '#e8b04b');
    }
  }

  private addPaged(value: string, x: number, y: number, width: number, height: number, size: number, color: string): void {
    const text = this.scene.add.text(x, y, '', { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color, lineSpacing: 3 }).setOrigin(0, 0);
    const lineHeight = Math.ceil(Number.parseInt(uiFontSize(size), 10) * 1.5);
    // Block-aware pagination: authored epilogues are blank-line separated
    // `title\nbody` chapters, and a chapter title never strands alone at a
    // page bottom.
    const pages = paginateDialogueBlocks(wrapDialogueText(value, width, content => text.context.measureText(content).width),
      Math.max(1, Math.floor(height / lineHeight)));
    this.pageCount = pages.length;
    this.detailPage = Math.min(this.detailPage, pages.length - 1);
    text.setText(pages[this.detailPage]!);
    this.container.add(text);
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

  /** Wraps and draws text, returning the measured wrapped line count. */
  private addWrapped(value: string, x: number, y: number, width: number, size: number, color: string): number {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      lineSpacing: 3,
    }).setOrigin(0, 0);
    const lines = wrapDialogueText(value, width, content => text.context.measureText(content).width);
    text.setText(lines.join('\n'));
    this.container.add(text);
    return lines.length;
  }
}
