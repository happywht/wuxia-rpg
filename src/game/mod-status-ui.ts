import Phaser from 'phaser';

import { type Diagnostic } from '../engine/data-loader';
import { uiFontSize } from './settings';
import { type LoadedResourceSource } from './world-loader';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY } from './ui-theme';

/**
 * Round 35 F2 panel: MOD precedence made inspectable in-game. Three pages —
 * enabled-mod order (later wins), the final source of every loaded resource,
 * and MOD-layer diagnostics with the offending file path and a repair hint.
 * Purely structural UI: every name, path and message comes from the loader.
 */

const UI = {
  overlayFill: 0x06080d,
  overlayAlpha: 0.78,
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  primary: '#d8dee9',
  muted: '#8a94a6',
  warning: '#e8b04b',
  jade: '#b9d8c4',
  fontFamily: UI_FONT_FAMILY,
} as const;

const PANEL_WIDTH = 850;
const PANEL_HEIGHT = 468;
const VISIBLE_ROWS = 10;
const ROW_HEIGHT = 31;
const PAGE_TITLES = ['生效顺序', '资源来源', 'MOD 诊断'] as const;

export interface ModStatusPanelModel {
  enabledMods: readonly string[];
  resourceSources: readonly LoadedResourceSource[];
  modDiagnostics: readonly Diagnostic[];
}

export interface ModStatusPanelOptions {
  onClose?: () => void;
}

type PanelKeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

function describeSource(source: LoadedResourceSource['source']): string {
  return source.kind === 'base' ? '基础资料（data/base/…）' : `MOD：${source.modId}`;
}

export class ModStatusPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private model: ModStatusPanelModel | null = null;
  private pageIndex = 0;
  private selection = 0;
  private openState = false;

  constructor(scene: Phaser.Scene, options: ModStatusPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1200);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(model: ModStatusPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.pageIndex = 0;
    this.selection = 0;
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

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    // The owning scene handles F2 for both open and close; the panel keeps
    // Escape locally so a single F2 press never toggles twice on one event.
    keyboard.addCapture(codes.F2);
    const pairs: [number, () => void][] = [
      [codes.UP, () => this.moveSelection(-1)],
      [codes.W, () => this.moveSelection(-1)],
      [codes.DOWN, () => this.moveSelection(1)],
      [codes.S, () => this.moveSelection(1)],
      [codes.LEFT, () => this.changePage(-1)],
      [codes.A, () => this.changePage(-1)],
      [codes.RIGHT, () => this.changePage(1)],
      [codes.D, () => this.changePage(1)],
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
    this.scene.input.keyboard?.removeCapture(Phaser.Input.Keyboard.KeyCodes.F2);
  }

  private changePage(delta: number): void {
    this.pageIndex = (this.pageIndex + delta + PAGE_TITLES.length) % PAGE_TITLES.length;
    this.selection = 0;
    this.render();
  }

  /** Row count of the active page; the order page lists one row per mod. */
  private get rowCount(): number {
    const model = this.model;
    if (model === null) return 0;
    if (this.pageIndex === 0) return model.enabledMods.length;
    if (this.pageIndex === 1) return model.resourceSources.length;
    return model.modDiagnostics.length;
  }

  private moveSelection(delta: number): void {
    const count = this.rowCount;
    if (count === 0) return;
    this.selection = (this.selection + delta + count) % count;
    this.render();
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    this.container.removeAll(true);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const left = (width - PANEL_WIDTH) / 2;
    const top = (height - PANEL_HEIGHT) / 2;
    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: left, y: top, width: PANEL_WIDTH, height: PANEL_HEIGHT },
      UI.overlayAlpha,
    );

    const modCount = model.enabledMods.length;
    const fromMods = model.resourceSources.filter((entry) => entry.source.kind === 'mod').length;
    this.addText('MOD / 资料状态', left + 22, top + 16, 19, UI.warning);
    this.addText(
      `启用 ${modCount} 个 · 来源为 MOD 的资源 ${fromMods}/${model.resourceSources.length} · 诊断 ${model.modDiagnostics.length} 条`,
      left + 22, top + 47, 11, UI.muted,
    );
    this.addText(
      `←/→ 页：${PAGE_TITLES[this.pageIndex]}　·　F2 或 Esc 关闭`,
      left + PANEL_WIDTH - 22, top + PANEL_HEIGHT - 25, 10, UI.muted, 'right',
    );
    this.addLine(left + 322, top + 75, left + 322, top + PANEL_HEIGHT - 46);

    const count = this.rowCount;
    this.selection = count === 0 ? 0 : Math.min(this.selection, count - 1);
    const windowStart = Math.floor(this.selection / VISIBLE_ROWS) * VISIBLE_ROWS;
    const listTop = top + 83;
    const labels = this.rowLabels();
    for (let offset = 0; offset < VISIBLE_ROWS; offset += 1) {
      const index = windowStart + offset;
      if (index >= count) break;
      const label = labels[index];
      if (label === undefined) break;
      const selected = index === this.selection;
      if (selected) {
        addPixelSelection(this.scene, this.container, {
          x: left + 14,
          y: listTop + offset * ROW_HEIGHT - 2,
          width: 292,
          height: ROW_HEIGHT,
        });
      }
      this.addText(
        `${selected ? '▸ ' : '  '}${label.text}`,
        left + 22, listTop + offset * ROW_HEIGHT, 12,
        selected ? UI.warning : label.color,
      );
    }
    if (count === 0) {
      this.addText(this.emptyLine(), left + 22, listTop, 12, UI.muted);
    }

    this.renderDetail(left + 346, listTop, this.selection);
  }

  /** Left-column entries for the active page, colour-coded by outcome. */
  private rowLabels(): { text: string; color: string }[] {
    const model = this.model;
    if (model === null) return [];
    if (this.pageIndex === 0) {
      return model.enabledMods.map((modId) => ({ text: modId, color: UI.jade }));
    }
    if (this.pageIndex === 1) {
      return model.resourceSources.map((entry) => ({
        text: `${entry.id}　← ${entry.source.kind === 'base' ? '基础' : entry.source.modId}`,
        color: entry.source.kind === 'base' ? UI.primary : UI.jade,
      }));
    }
    return model.modDiagnostics.map((diagnostic) => ({
      text: `${diagnostic.origin.replace('mod:', '')} · ${diagnostic.resource ?? '—'}`,
      color: UI.warning,
    }));
  }

  private emptyLine(): string {
    if (this.pageIndex === 0) {
      return '未启用任何 MOD（manifest 的 enabledMods 为空）。';
    }
    if (this.pageIndex === 1) {
      return '本轮没有成功加载任何资源。';
    }
    return '没有 MOD 覆盖被拒绝。';
  }

  /** Right pane: rule text on page 0, per-entry detail on pages 1–2. */
  private renderDetail(detailX: number, listTop: number, index: number): void {
    const model = this.model;
    if (model === null) return;
    const detailWidth = PANEL_WIDTH - 368;
    if (this.pageIndex === 0) {
      this.addText('覆盖规则', detailX, listTop, 10, UI.warning);
      this.addWrappedText(
        'manifest 的 enabledMods 自前向后依次整文件覆盖同路径资源：后声明且校验通过的层获胜；'
        + '解析或校验失败的覆盖被拒绝，游戏继续使用上一份有效资料。',
        detailX, listTop + 24, detailWidth, 12, UI.primary,
      );
      const selected = model.enabledMods[index];
      if (selected === undefined) return;
      this.addText('选中条目', detailX, listTop + 104, 10, UI.warning);
      this.addWrappedText(
        `${index + 1}. ${selected} —— 优先级第 ${index + 1}/${model.enabledMods.length} 位；`
        + `其覆盖文件位于 mods/${selected}/ 下，与 data/base/ 的相对路径一一对应。`,
        detailX, listTop + 128, detailWidth, 12, UI.jade,
      );
      this.addWrappedText(
        '调整顺序：编辑 data/base/manifest.json 的 enabledMods 数组后重新进入游戏。',
        detailX, listTop + 196, detailWidth, 11, UI.muted,
      );
      return;
    }
    if (this.pageIndex === 1) {
      const entry = model.resourceSources[index];
      if (entry === undefined) return;
      this.addText('资源详情', detailX, listTop, 10, UI.warning);
      this.addText(entry.id, detailX, listTop + 20, 15, UI.primary);
      this.addWrappedText(
        `最终来源：${describeSource(entry.source)}`,
        detailX, listTop + 48, detailWidth, 12,
        entry.source.kind === 'base' ? UI.muted : UI.jade,
      );
      this.addWrappedText(
        `基础路径：data/base/${entry.path}`,
        detailX, listTop + 76, detailWidth, 11, UI.muted,
      );
      if (entry.source.kind === 'mod') {
        this.addWrappedText(
          `生效覆盖：mods/${entry.source.modId}/${entry.path}`,
          detailX, listTop + 98, detailWidth, 11, UI.jade,
        );
      } else {
        this.addWrappedText(
          '没有启用的 MOD 提供该资源的有效覆盖。',
          detailX, listTop + 98, detailWidth, 11, UI.muted,
        );
      }
      this.addWrappedText(`schema：${entry.schema}`, detailX, listTop + 126, detailWidth, 11, UI.muted);
      return;
    }
    const diagnostic = model.modDiagnostics[index];
    if (diagnostic === undefined) return;
    this.addText('诊断详情', detailX, listTop, 10, UI.warning);
    this.addWrappedText(diagnostic.message, detailX, listTop + 20, detailWidth, 13, UI.primary);
    this.addWrappedText(
      `资源：${diagnostic.resource ?? '—'}　·　层：${diagnostic.origin}`,
      detailX, listTop + 62, detailWidth, 11, UI.muted,
    );
    let cursor = listTop + 84;
    if (diagnostic.path !== undefined) {
      this.addWrappedText(`文件：${diagnostic.path}`, detailX, cursor, detailWidth, 11, UI.jade);
      cursor += 22;
    }
    if (diagnostic.details.length > 0) {
      const details = diagnostic.details.slice(0, 4);
      if (diagnostic.details.length > details.length) {
        details.push(`……另有 ${diagnostic.details.length - details.length} 条校验错误`);
      }
      this.addWrappedText(details.join('\n'), detailX, cursor, detailWidth, 10, UI.muted);
      cursor += details.length * 16 + 8;
    }
    if (diagnostic.hint !== undefined) {
      this.addText('修复建议', detailX, cursor, 10, UI.warning);
      this.addWrappedText(diagnostic.hint, detailX, cursor + 18, detailWidth, 11, UI.jade);
    }
  }

  private addText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      align,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
  }

  private addWrappedText(text: string, x: number, y: number, width: number, fontSize: number, color: string): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      wordWrap: { width },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(node);
  }

  private addLine(x1: number, y1: number, x2: number, y2: number): void {
    const line = this.scene.add.line(0, 0, x1, y1, x2, y2, UI.panelStroke).setOrigin(0, 0);
    this.container.add(line);
  }
}
