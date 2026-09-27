import Phaser from 'phaser';

import {
  checkAlchemyRecipe,
  selectAlchemyOutcome,
  type AssembledAlchemyStation,
} from '../engine/alchemy-system';
import type { InventoryState, ItemRecordData } from '../engine/item-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface AlchemyPanelModel {
  station: AssembledAlchemyStation;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  insight: number;
  onCraft: (recipeId: string) => { ok: boolean; message: string };
}

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Data-driven medicine station panel; undiscovered formulas reveal only their clue. */
export class AlchemyPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private model: AlchemyPanelModel | null = null;
  private openState = false;
  private selectedIndex = 0;
  private notice: string | null = null;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1280).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: AlchemyPanelModel): void {
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
    if (!model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId)) {
      this.notice = recipe.discoveryHint;
      this.render();
      return;
    }
    const outcome = model.onCraft(recipe.id);
    this.notice = outcome.message;
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const width = Math.min(860, this.scene.scale.width - 28);
    const height = Math.min(510, this.scene.scale.height - 24);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.93);
    this.addText(left + 24, top + 15, `${model.station.record.name} · 炼丹`, 21, UI_PALETTE.accent);
    this.addText(left + width - 22, top + 20, '↑/↓ 选药方　·　Enter 炼制　·　Esc 收起', 11, UI_PALETTE.muted, 'right');

    const recipes = model.station.recipes;
    if (recipes.length === 0) {
      this.addWrapped('此处暂时没有可用药方。', left + 28, top + 76, width - 56, 14, UI_PALETTE.muted);
      return;
    }
    const visibleRecipeCount = Math.min(5, recipes.length);
    const recipeStart = Math.max(0, Math.min(this.selectedIndex - 2, recipes.length - visibleRecipeCount));
    recipes.slice(recipeStart, recipeStart + visibleRecipeCount).forEach((recipe, visibleIndex) => {
      const index = recipeStart + visibleIndex;
      const known = model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId);
      const title = known ? recipe.name : `未识药方 ${index + 1}`;
      const y = top + 54 + visibleIndex * 28;
      const active = index === this.selectedIndex;
      this.addText(left + 28, y, `${active ? '▸' : '　'}${known ? '已识' : '未识'} · ${title}`, 12,
        active ? UI_PALETTE.accent : known ? UI_PALETTE.jade : UI_PALETTE.muted);
      this.addText(left + width - 28, y, known ? `工钱 ${recipe.currencyCost} 两` : '寻访线索', 10, UI_PALETTE.text, 'right');
    });

    const recipe = recipes[this.selectedIndex];
    if (recipe === undefined) return;
    const detailY = top + 55 + visibleRecipeCount * 28 + 7;
    if (!model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId)) {
      this.addText(left + 30, detailY, '尚未掌握此方', 14, UI_PALETTE.jade);
      this.addWrapped(recipe.discoveryHint, left + 30, detailY + 30, width - 60, 13, UI_PALETTE.text);
      this.addWrapped('与江湖人物交谈、留心见闻，或许能找到传授药方的人。', left + 30, detailY + 68, width - 60, 11, UI_PALETTE.muted);
      this.drawNotice(left, top, width, height);
      return;
    }

    const description = this.clip(recipe.description, 100);
    this.addWrapped(description, left + 30, detailY, width - 60, 11, UI_PALETTE.muted);
    const needs = recipe.ingredients.map((ingredient) => {
      const item = model.items.get(ingredient.itemId);
      const owned = model.inventory.stacks.find((stack) => stack.itemId === ingredient.itemId)?.quantity ?? 0;
      return `${item?.name ?? ingredient.itemId}　${owned}/${ingredient.quantity}`;
    });
    const needY = top + 255;
    this.addText(left + 30, needY, '药材', 12, UI_PALETTE.jade);
    needs.forEach((need, index) => {
      this.addText(left + 110 + (index % 2) * Math.floor((width - 160) / 2), needY + Math.floor(index / 2) * 20,
        need, 11, UI_PALETTE.text);
    });

    const quality = selectAlchemyOutcome(recipe, model.insight);
    const result = quality === null ? undefined : model.items.get(quality.resultItemId);
    const previewY = top + 330;
    this.addText(left + 30, previewY, '悟性与成药', 12, UI_PALETTE.jade);
    if (quality !== null && result?.consumable !== null && result?.consumable !== undefined) {
      this.addText(left + 130, previewY, `悟性 ${model.insight} → ${quality.name}「${result.name}」`, 12, UI_PALETTE.accent);
      this.addWrapped(`恢复气血 ${result.consumable.healthRestore}　·　恢复内力 ${result.consumable.qiRestore}　·　${this.clip(result.description, 70)}`,
        left + 130, previewY + 24, width - 168, 10, UI_PALETTE.text);
    } else {
      this.addText(left + 130, previewY, '当前品质的药品资料暂不可用', 11, '#e8b04b');
    }

    const eligibility = checkAlchemyRecipe({
      recipe,
      insight: model.insight,
      knownKnowledgeNodeIds: model.knownKnowledgeNodeIds,
      inventory: model.inventory,
      items: model.items,
    });
    const statusY = top + height - 68;
    this.addWrapped(eligibility.available ? '材料与工钱齐备，可以开炉。' : eligibility.reason ?? '当前无法炼药。',
      left + 30, statusY, width - 60, 11, eligibility.available ? UI_PALETTE.jade : '#e8b04b');
    this.addText(left + 30, top + height - 39,
      `现有银两 ${model.inventory.currency}　·　悟性只决定品质，不会随机损耗药材`, 10, UI_PALETTE.muted);
    this.drawNotice(left, top, width, height);
  }

  private drawNotice(left: number, top: number, width: number, height: number): void {
    if (this.notice !== null) this.addWrapped(this.notice, left + width - 28, top + height - 40, width - 60, 10, UI_PALETTE.accent, 'right');
  }

  private clip(value: string, maxLength: number): string {
    const points = Array.from(value);
    return points.length <= maxLength ? value : `${points.slice(0, maxLength - 1).join('')}…`;
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
