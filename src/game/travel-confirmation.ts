import Phaser from 'phaser';
import { uiFontSize } from './settings';
import { UI_FONT_FAMILY, addPixelPanelChrome } from './ui-theme';
import { paginateDialogueLines, wrapDialogueText } from './dialogue-layout';

/** A quote is reviewable before committing; close first, then revalidate travel. */
export class TravelConfirmationPanel {
  private container: Phaser.GameObjects.Container;
  private bindings: { key: Phaser.Input.Keyboard.Key; handler: () => void }[] = [];
  private confirm: (() => void) | null = null;
  private opened = false;
  private pages: string[] = [];
  private page = 0;
  private bodyText: Phaser.GameObjects.Text | null = null;
  private footerText: Phaser.GameObjects.Text | null = null;
  constructor(private scene: Phaser.Scene, private onClose: () => void) {
    this.container = scene.add.container(0, 0).setDepth(2100).setVisible(false);
  }
  get isOpen(): boolean { return this.opened; }
  open(name: string, fare: number, minutes: number, currency: number, confirm: () => void): void {
    if (this.opened) return;
    this.opened = true;
    this.confirm = confirm;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const left = width * .1, top = height * .2, panelWidth = width * .8, panelHeight = height * .6;
    this.container.setVisible(true);
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width: panelWidth, height: panelHeight }, .55);
    const text = this.scene.add.text(left + 20, top + 20, '', { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(14), color: '#d8dee9' });
    const body = `乘行确认\n${name}\n费用 ${fare} 银两 · 耗时 ${minutes} 分钟\n当前银两 ${currency}\n目的地受阻或银两不足时不扣费。`;
    text.setText('测');
    const lineHeight = text.height + 2;
    text.setLineSpacing(2);
    const capacity = Math.max(1, Math.floor((panelHeight - 90) / lineHeight));
    this.pages = paginateDialogueLines(wrapDialogueText(body, panelWidth - 40, value => { text.setText(value); return text.width; }), capacity);
    this.page = 0;
    this.bodyText = text;
    this.footerText = this.scene.add.text(left + 20, top + panelHeight - 45, '', { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(10), color: '#8a94a6' });
    this.container.add(this.footerText);
    this.container.add(text);
    this.renderPage();
    const keyboard = this.scene.input.keyboard;
    if (keyboard !== null) {
      for (const [code, handler] of [[Phaser.Input.Keyboard.KeyCodes.ENTER, () => this.accept()], [Phaser.Input.Keyboard.KeyCodes.ESC, () => this.close()], [Phaser.Input.Keyboard.KeyCodes.PAGE_UP, () => { this.page = Math.max(0, this.page - 1); this.renderPage(); }]] as const) {
        const key = keyboard.addKey(code); key.on('down', handler); this.bindings.push({ key, handler });
      }
    }
  }
  accept(): void {
    const callback = this.confirm;
    if (!this.opened) return;
    if (this.page < this.pages.length - 1) { this.page += 1; this.renderPage(); return; }
    // Keep a pending data reload from replacing the reviewed gate before
    // the synchronous travel revalidation/commit has finished.
    this.close(false);
    try { callback?.(); } finally { this.onClose(); }
  }
  private renderPage(): void {
    this.bodyText?.setText(this.pages[this.page] ?? '');
    this.footerText?.setText(`${this.page + 1}/${this.pages.length} · Enter ${this.page < this.pages.length - 1 ? '续读' : '确认'} · Esc 取消`);
  }
  close(notify = true): void {
    if (!this.opened) return;
    this.opened = false; this.confirm = null;
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings = [];
    this.container.setVisible(false).removeAll(true);
    this.bodyText = null; this.footerText = null; this.pages = [];
    if (notify) this.onClose();
  }
  destroy(): void { this.close(); this.container.destroy(); }
}
