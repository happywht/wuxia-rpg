import Phaser from 'phaser';

import {
  checkEquipmentForgeRecipe,
  type AssembledEquipmentForgeStation,
} from '../engine/equipment-forge';
import type { InventoryState, ItemRecordData } from '../engine/item-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface EquipmentForgePanelModel {
  station: AssembledEquipmentForgeStation;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
  attributeLabels: Readonly<Record<string, string>>;
  onCraft: (recipeId: string) => { ok: boolean; message: string };
}

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };
const ATTRIBUTES = ['body', 'force', 'agility', 'insight', 'resolve'] as const;
const SLOT_LABELS: Readonly<Record<string, string>> = { weapon: '兵刃', garment: '衣装', ornament: '配饰' };

/** Keyboard-owned, data-driven equipment conversion interface. */
export class EquipmentForgePanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private model: EquipmentForgePanelModel | null = null;
  private openState = false;
  private selectedIndex = 0;
  private notice: string | null = null;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1280).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: EquipmentForgePanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.selectedIndex = 0;
    this.notice = null;
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

  private move(delta: number): void {
    const count = this.model?.station.recipes.length ?? 0;
    if (count < 1) return;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.notice = null;
    this.render();
  }

  private confirm(): void {
    const model = this.model;
    const recipe = model?.station.recipes[this.selectedIndex];
    if (model === null || model === undefined || recipe === undefined) return;
    const outcome = model.onCraft(recipe.id);
    this.notice = outcome.message;
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const width = Math.min(840, this.scene.scale.width - 32);
    const height = Math.min(508, this.scene.scale.height - 24);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.92);
    this.addText(left + 24, top + 16, `${model.station.record.name} · 装备锻造`, 21, UI_PALETTE.accent);
    this.addText(left + width - 22, top + 20, '↑/↓ 选择　·　Enter 锻造　·　Esc 收起', 11, UI_PALETTE.muted, 'right');

    const recipes = model.station.recipes;
    if (recipes.length === 0) {
      this.addWrapped('此处暂时没有可用的锻造配方。', left + 28, top + 76, width - 56, 14, UI_PALETTE.muted);
      return;
    }
    const visibleRecipeCount = Math.min(5, recipes.length);
    const recipeStart = Math.max(0, Math.min(this.selectedIndex - 2, recipes.length - visibleRecipeCount));
    recipes.slice(recipeStart, recipeStart + visibleRecipeCount).forEach((recipe, visibleIndex) => {
      const index = recipeStart + visibleIndex;
      const y = top + 55 + visibleIndex * 27;
      const active = index === this.selectedIndex;
      const selected = active ? '▸ ' : '　';
      this.addText(left + 28, y, selected + recipe.name, 13, active ? UI_PALETTE.accent : UI_PALETTE.jade);
      this.addText(left + width - 28, y, `工钱 ${recipe.currencyCost} 两`, 11, UI_PALETTE.text, 'right');
    });

    const recipe = recipes[this.selectedIndex];
    if (recipe === undefined) return;
    const detailY = top + 55 + visibleRecipeCount * 27 + 8;
    const descriptionPoints = Array.from(recipe.description);
    const description = descriptionPoints.length <= 96 ? recipe.description : descriptionPoints.slice(0, 95).join('') + '…';
    this.addWrapped(description, left + 30, detailY, width - 60, 11, UI_PALETTE.muted);

    const needs = recipe.ingredients.map((ingredient) => {
      const item = model.items.get(ingredient.itemId);
      const owned = model.inventory.stacks.find((stack) => stack.itemId === ingredient.itemId)?.quantity ?? 0;
      return `${item?.name ?? ingredient.itemId}　${owned}/${ingredient.quantity}`;
    });
    const needY = top + 237;
    this.addText(left + 30, needY, '投入', 12, UI_PALETTE.jade);
    if (needs.length === 0) {
      this.addText(left + 110, needY, '无', 11, UI_PALETTE.muted);
    } else {
      needs.forEach((need, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = left + 110 + col * Math.floor((width - 160) / 2);
        this.addText(x, needY + row * 20, need, 11, UI_PALETTE.text);
      });
    }

    const result = model.items.get(recipe.resultItemId);
    const previewY = top + 316;
    this.addText(left + 30, previewY, '产出预览', 12, UI_PALETTE.jade);
    if (result?.equipment !== null && result?.equipment !== undefined) {
      this.addText(left + 120, previewY, result.name, 13, UI_PALETTE.accent);
      const stats = ATTRIBUTES
        .filter((key) => (result.equipment?.attributeBonuses[key] ?? 0) > 0)
        .map((key) => `${model.attributeLabels[key] ?? key} +${result.equipment?.attributeBonuses[key]}`);
      if (result.equipment.healthBonus > 0) stats.push(`气血上限 +${result.equipment.healthBonus}`);
      if (result.equipment.qiBonus > 0) stats.push(`内力上限 +${result.equipment.qiBonus}`);
      this.addWrapped(`${stats.join('　·　') || '无属性加成'}　·　${SLOT_LABELS[result.equipment.slot] ?? result.equipment.slot}`, left + 120, previewY + 23, width - 155, 11, UI_PALETTE.text);
      this.addWrapped(result.description, left + 120, previewY + 47, width - 155, 10, UI_PALETTE.muted);
    } else {
      this.addText(left + 120, previewY, '产物资料当前不可用', 11, '#e8b04b');
    }

    const eligibility = checkEquipmentForgeRecipe({ recipe, inventory: model.inventory, items: model.items });
    const statusY = top + height - 70;
    const status = eligibility.available ? '条件齐备，可以锻造。' : eligibility.reason ?? '当前无法锻造。';
    this.addWrapped(status, left + 30, statusY, width - 60, 11, eligibility.available ? UI_PALETTE.jade : '#e8b04b');
    this.addText(left + 30, top + height - 40, `现有银两 ${model.inventory.currency}　·　制作后仍按普通装备存入背包`, 10, UI_PALETTE.muted);
    if (this.notice !== null) this.addWrapped(this.notice, left + width - 28, top + height - 43, width - 60, 10, UI_PALETTE.accent, 'right');
  }

  private addText(x: number, y: number, value: string, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(text);
  }

  private addWrapped(value: string, x: number, y: number, width: number, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width },
      lineSpacing: 2,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(text);
  }
}
