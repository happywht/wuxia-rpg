import Phaser from 'phaser';

import {
  CUSTOM_MARTIAL_ART_MAX_BUDGET,
  MAX_CUSTOM_MARTIAL_ARTS,
  craftCustomMartialArt,
  normalizeCustomMartialArtName,
  type MartialArtForgeComponentSet,
  type MartialArtRecipe,
} from '../engine/martial-art-forge';
import type { MartialArtData } from '../engine/character-progression';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface MartialArtForgePanelModel {
  components: MartialArtForgeComponentSet;
  existingArts: readonly MartialArtData[];
  occupiedIds: ReadonlySet<string>;
  currency: number;
  onCraft: (recipe: MartialArtRecipe, name: string) => { ok: boolean; message: string };
}
type Binding = { key: Phaser.Input.Keyboard.Key; handler: (key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void };
const SLOTS = ['intent', 'form', 'breath'] as const;
const SLOT_LABELS = ['招式意图', '运劲架势', '吐纳方式', '自拟名号'] as const;

/** Keyboard forge panel; all martial content and numeric effects come from data. */
export class MartialArtForgePanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private model: MartialArtForgePanelModel | null = null;
  private openState = false;
  private destroyed = false;
  private selectedRow = 0;
  private recipe: MartialArtRecipe = { intentId: '', formId: '', breathId: '' };
  private name = '';
  private notice: string | null = null;
  private readonly nameInput: HTMLInputElement;
  private readonly handleNameInput = (): void => {
    const normalized = normalizeCustomMartialArtName(this.nameInput.value);
    if (normalized !== this.nameInput.value) this.nameInput.value = normalized;
    this.name = normalized;
    this.notice = null;
    this.render();
  };
  private readonly handleNameKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveRow(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.confirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
    // A focused DOM input owns all key events, including IME and Backspace.
    event.stopPropagation();
  };
  private readonly handleSceneShutdown = (): void => {
    this.destroy();
  };

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1280).setVisible(false);
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.setAttribute('aria-label', '自创武学名号');
    Object.assign(this.nameInput.style, {
      position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0',
    });
    (scene.game.canvas.parentElement ?? document.body).append(this.nameInput);
    this.nameInput.addEventListener('input', this.handleNameInput);
    this.nameInput.addEventListener('keydown', this.handleNameKeydown);
    // The offscreen input outlives Phaser's children teardown, so the panel
    // also owns its own scene-lifecycle exit; destroy() detaches this hook.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
  }
  get isOpen(): boolean { return this.openState; }

  open(model: MartialArtForgePanelModel): void {
    if (this.openState || this.destroyed) return;
    this.model = model;
    this.selectedRow = 0;
    this.name = '';
    this.notice = null;
    this.recipe = {
      intentId: model.components.components.find((part) => part.slot === 'intent')?.id ?? '',
      formId: model.components.components.find((part) => part.slot === 'form')?.id ?? '',
      breathId: model.components.components.find((part) => part.slot === 'breath')?.id ?? '',
    };
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.nameInput.blur();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.model = null;
    this.onClose?.();
  }
  /**
   * Idempotent teardown of everything this panel owns outside Phaser's
   * children list: the DOM key listeners, the offscreen input element and
   * the scene SHUTDOWN hook. Safe to call repeatedly (world replacement
   * disposal plus a late scene shutdown).
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown);
    this.close();
    this.nameInput.removeEventListener('input', this.handleNameInput);
    this.nameInput.removeEventListener('keydown', this.handleNameKeydown);
    this.nameInput.remove();
    this.container.destroy();
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, (key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void][] = [
      [codes.UP, () => this.moveRow(-1)], [codes.W, () => this.moveRow(-1)],
      [codes.DOWN, () => this.moveRow(1)], [codes.S, () => this.moveRow(1)],
      [codes.LEFT, () => this.rotateChoice(-1)], [codes.A, () => this.rotateChoice(-1)],
      [codes.RIGHT, () => this.rotateChoice(1)], [codes.D, () => this.rotateChoice(1)],
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

  private moveRow(delta: number): void {
    this.selectedRow = (this.selectedRow + delta + SLOT_LABELS.length) % SLOT_LABELS.length;
    this.notice = null;
    if (this.selectedRow === 3) {
      this.nameInput.value = this.name;
      this.nameInput.focus({ preventScroll: true });
    } else {
      this.nameInput.blur();
    }
    this.render();
  }
  private rotateChoice(delta: number): void {
    if (this.selectedRow >= 3 || this.model === null) return;
    const slot = SLOTS[this.selectedRow];
    const options = this.model.components.components.filter((part) => part.slot === slot);
    if (options.length < 2) return;
    const key = slot === 'intent' ? 'intentId' : slot === 'form' ? 'formId' : 'breathId';
    const currentIndex = Math.max(0, options.findIndex((part) => part.id === this.recipe[key]));
    const next = options[(currentIndex + delta + options.length) % options.length];
    if (next === undefined) return;
    this.recipe = { ...this.recipe, [key]: next.id };
    this.notice = null;
    this.render();
  }

  private confirm(): void {
    const model = this.model;
    if (model === null) return;
    const result = craftCustomMartialArt({
      components: model.components, recipe: this.recipe, name: this.name,
      existingArts: model.existingArts, occupiedIds: model.occupiedIds,
    });
    if (!result.ok) {
      this.notice = result.reason;
      this.render();
      return;
    }
    if (model.currency < result.silverCost) {
      this.notice = `银两不足：创制需 ${result.silverCost}，现有 ${model.currency}。`;
      this.render();
      return;
    }
    const outcome = model.onCraft(this.recipe, this.name);
    if (outcome.ok) this.close();
    else {
      this.notice = outcome.message;
      this.render();
    }
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const width = Math.min(720, this.scene.scale.width - 64);
    const height = Math.min(448, this.scene.scale.height - 48);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.9);
    this.addText(left + 28, top + 18, '自创武学', 22, UI_PALETTE.accent);
    this.addWrapped('择一招式、一种架势、一法吐纳，自拟名号；功力预算与所需银两实时核算。', left + 30, top + 52, width - 60, 12, UI_PALETTE.muted);

    const choices = [this.recipe.intentId, this.recipe.formId, this.recipe.breathId];
    SLOT_LABELS.forEach((label, row) => {
      const y = top + 112 + row * 47;
      const active = this.selectedRow === row;
      const prefix = active ? '▸ ' : '　';
      if (row < 3) {
        const component = model.components.components.find((part) => part.id === choices[row]);
        const value = component === undefined
          ? '无可用组件'
          : `${this.shortText(component.name, 10)}　${this.shortText(component.style, 12)}　功力 ${this.signed(component.power)} · 内力 ${this.signed(component.qiCost)} · 银两 ${component.silverCost}`;
        if (component !== undefined) {
          this.addWrapped(this.shortText(component.description, 36), left + 230, y + 20, width - 264, 10, UI_PALETTE.muted);
        }
        this.addText(left + 30, y, prefix + label, 13, active ? UI_PALETTE.accent : UI_PALETTE.jade);
        this.addText(left + 170, y, value, 10, UI_PALETTE.text);
      } else {
        const value = Array.from(this.name).length > 0 ? this.name : '（选中此行后输入，Backspace 删除）';
        this.addText(left + 30, y, prefix + label, 13, active ? UI_PALETTE.accent : UI_PALETTE.jade);
        this.addText(left + 170, y, value, 11, UI_PALETTE.text);
      }
    });

    const preview = craftCustomMartialArt({
      components: model.components, recipe: this.recipe, name: this.name,
      existingArts: model.existingArts, occupiedIds: model.occupiedIds,
    });
    const previewY = top + height - 112;
    if (preview.ok) {
      const effect = preview.art.combat.kind === 'attack'
        ? '攻击'
        : preview.art.combat.kind === 'heal' ? '疗伤' : '守御';
      this.addText(left + 30, previewY,
        `预览：${effect}功力 ${preview.art.combat.power} · 内力 ${preview.art.combat.qiCost} · 预算 ${preview.budget}/${CUSTOM_MARTIAL_ART_MAX_BUDGET} · 创制 ${preview.silverCost} 两`,
        12, UI_PALETTE.jade);
    } else {
      this.addWrapped(preview.reason, left + 30, previewY, width - 60, 12, '#e8b04b');
    }
    const knownNames = model.existingArts.map((art) => this.shortText(art.name, 6)).join('、') || '暂无';
    this.addText(left + 30, previewY + 22,
      `已创 ${model.existingArts.length}/${MAX_CUSTOM_MARTIAL_ARTS} 门（${knownNames}）　·　银两 ${model.currency}　·　↑/↓ 选择 · ←/→ 换组件 · Enter 创制`,
      11, UI_PALETTE.muted);
    if (this.notice !== null) this.addWrapped(this.notice, left + 30, previewY + 43, width - 60, 11, '#e8b04b');
    this.addText(left + width - 24, top + height - 22, '选中名号行后键入　·　Esc 收起', 11, UI_PALETTE.accent, 'right');
  }

  private signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }
  private shortText(value: string, maxCodePoints: number): string {
    const points = Array.from(value);
    return points.length <= maxCodePoints ? value : points.slice(0, maxCodePoints - 1).join('') + '…';
  }
  private addText(x: number, y: number, text: string, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const item = this.scene.add.text(x, y, text, { fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color })
      .setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(item);
  }
  private addWrapped(text: string, x: number, y: number, width: number, size: number, color: string): void {
    const item = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY, fontSize: uiFontSize(size), color,
      wordWrap: { width }, lineSpacing: 2,
    }).setOrigin(0, 0);
    this.container.add(item);
  }
}
