import Phaser from 'phaser';
import { buildMartialArtsDossier, type MartialArtsDossierInput } from '../engine/martial-arts-dossier';
import { buildDossierGeometry, paginateFactionDossier } from './faction-panel-layout';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

/** Lossless paged reader. The scene owns U; this panel owns only paging/Esc. */
export class MartialArtsPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: { key: Phaser.Input.Keyboard.Key; handler: () => void }[] = [];
  private blocks: string[] = [];
  private page = 0;
  private pageCount = 1;
  private openState = false;
  constructor(private readonly scene: Phaser.Scene, private readonly onClose?: () => void) {
    this.container = scene.add.container(0, 0).setDepth(1200).setVisible(false);
  }
  get isOpen(): boolean { return this.openState; }
  open(input: MartialArtsDossierInput): void {
    if (this.openState) return;
    this.blocks = buildMartialArtsDossier(input);
    this.page = 0;
    this.openState = true;
    this.container.setVisible(true);
    const codes = Phaser.Input.Keyboard.KeyCodes;
    for (const [code, handler] of [[codes.ESC, () => this.close()], [codes.PAGE_UP, () => this.turn(-1)], [codes.PAGE_DOWN, () => this.turn(1)]] as const) {
      const key = this.scene.input.keyboard?.addKey(code);
      if (key === undefined) continue;
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
    this.render();
  }
  close(): void {
    if (!this.openState) return;
    this.openState = false;
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
    this.container.setVisible(false).removeAll(true);
    this.blocks = [];
    this.onClose?.();
  }
  destroy(): void { this.close(); this.container.destroy(); }
  private turn(step: number): void {
    const next = Math.max(0, Math.min(this.pageCount - 1, this.page + step));
    if (next === this.page) return;
    this.page = next;
    this.render();
  }
  private render(): void {
    this.container.removeAll(true);
    const line = (size: number) => Math.ceil(Number.parseInt(uiFontSize(size), 10) * 1.5);
    const g = buildDossierGeometry({ viewWidth: this.scene.scale.width, viewHeight: this.scene.scale.height,
      titleHeight: line(20), instructionHeight: line(11), bodyLineHeight: line(12), statusHeight: line(10), hintHeight: line(10) });
    addPixelPanelChrome(this.scene, this.container, { x: g.left, y: g.top, width: g.width, height: g.height }, 0.94);
    this.text('武学与成长', g.left + 30, g.top + 18, 20, UI_PALETTE.accent);
    this.text('PgUp/PgDn 翻页；U 或 Esc 收起。已学招式可在战斗中选用。', g.left + 30, g.top + 18 + line(20) + 6, 11, UI_PALETTE.muted);
    const probe = this.text('', -500, -500, 12, UI_PALETTE.text);
    const pages = paginateFactionDossier(this.blocks, g.contentWidth, g.bodyCapacity, value => probe.context.measureText(value).width);
    this.pageCount = pages.length;
    this.page = Math.min(this.page, pages.length - 1);
    this.text(pages[this.page] ?? '', g.left + 30, g.bodyTop, 12, UI_PALETTE.text);
    this.text(`${this.page + 1}/${pages.length}页 · 只读`, g.left + 30, g.statusTop, 10, UI_PALETTE.muted);
    this.text('PgUp/PgDn 翻页 · U/Esc 收起', g.left + 30, g.hintTop, 10, UI_PALETTE.muted);
  }
  private text(value: string, x: number, y: number, size: number, color: string): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, value, { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size),
      lineSpacing: Math.ceil(Number.parseInt(uiFontSize(size), 10) * 0.4), color });
    this.container.add(object);
    return object;
  }
}
