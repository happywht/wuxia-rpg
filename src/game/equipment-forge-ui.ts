import Phaser from 'phaser';

import {
  checkEquipmentForgeRecipe,
  type AssembledEquipmentForgeStation,
} from '../engine/equipment-forge';
import type { InventoryState, ItemRecordData } from '../engine/item-system';
import { uiFontSize } from './settings';
import {
  craftingFooterColumns,
  buildCraftingPanelGeometry,
  buildForgeDetailBlocks,
  craftingIngredientViews,
  paginateCraftingDetail,
  type CraftingPanelGeometry,
} from './crafting-panel-layout';
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
  /** Round 120: complete measured detail pages for the selected recipe. */
  private detailPages: string[] = [''];
  private detailPage = 0;

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
    this.detailPage = 0;
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
      [codes.PAGE_UP, () => this.turnDetailPage(-1)],
      [codes.PAGE_DOWN, () => this.turnDetailPage(1)],
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
    this.detailPage = 0; // A new recipe starts its detail from page one.
    this.render();
  }

  /** Round 120: PageUp/PageDown walk the selected recipe's detail linearly. */
  private turnDetailPage(step: number): void {
    if (this.detailPages.length <= 1) return;
    const next = Math.min(this.detailPages.length - 1, Math.max(0, this.detailPage + step));
    if (next === this.detailPage) return; // Already at an edge: no churn.
    this.detailPage = next;
    this.render();
  }

  private confirm(): void {
    const model = this.model;
    const recipe = model?.station.recipes[this.selectedIndex];
    if (model === null || model === undefined || recipe === undefined) return;
    const outcome = model.onCraft(recipe.id);
    this.notice = outcome.message;
    this.detailPage = 0; // The craft outcome rewrites the live detail.
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildCraftingPanelGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(21),
      subtitleHeight: lineSize(11),
      rowHeight: lineSize(13) + 5,
      detailLineHeight: lineSize(12),
      statusHeight: lineSize(11),
      hintHeight: lineSize(10),
      maxVisibleRows: Math.min(5, Math.max(1, model.station.recipes.length)),
      maxWidth: 840,
      maxHeight: 508,
    });
    // Font-synced probes measure at each real glyph size (Round 119 pattern).
    const probe = (size: number) => this.addText('', -500, -500, size, UI_PALETTE.muted);
    const measureAt = (p: Phaser.GameObjects.Text) => (text: string): number => p.context.measureText(text).width;
    const measure = measureAt(probe(12));
    const measureTitle = measureAt(probe(13));
    const measureLegend = measureAt(probe(11));
    const { left, top, width, height, contentWidth } = geometry;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.92);

    const heading = `${model.station.record.name} · 装备锻造`;
    const titleText = this.addText(heading, left + 24, top + 16, 21, UI_PALETTE.accent);
    titleText.setText(this.fitGrapheme(heading, contentWidth, measureAt(titleText)));
    const legend = this.fitGrapheme('↑/↓ 选择 · Enter 制作 · Esc 收起', contentWidth, measureLegend);
    this.addText(legend, left + 30, top + 16 + lineSize(21) + 6, 11, UI_PALETTE.muted);

    const recipes = model.station.recipes;
    if (recipes.length === 0) {
      this.addText('此处暂时没有可用的锻造配方。', left + 28, geometry.listTop, 14, UI_PALETTE.muted);
      this.drawFooter(geometry, model, null, null);
      return;
    }
    const recipeStart = geometry.visibleRows > 0
      ? Math.max(0, Math.min(this.selectedIndex - 2, recipes.length - geometry.visibleRows))
      : 0;
    recipes.slice(recipeStart, recipeStart + geometry.visibleRows).forEach((recipe, visibleIndex) => {
      const index = recipeStart + visibleIndex;
      const y = geometry.listTop + visibleIndex * geometry.rowHeight;
      const active = index === this.selectedIndex;
      const label = `${active ? '▸ ' : '　'}${recipe.name}`;
      const rowText = this.addText(label, left + 28, y, 13, active ? UI_PALETTE.accent : UI_PALETTE.jade);
      // The list may ellipsize a MOD-flooded name; the paged detail below
      // always carries the full selected title.
      rowText.setText(this.fitGrapheme(label, contentWidth - 150, measureTitle));
      this.addText(`工钱 ${recipe.currencyCost} 两`, left + width - 28, y, 11, UI_PALETTE.text, 'right');
    });

    const recipe = recipes[this.selectedIndex];
    if (recipe === undefined) { this.drawFooter(geometry, model, null, null); return; }
    const ingredientViews = craftingIngredientViews(recipe, model.inventory, model.items);
    const result = model.items.get(recipe.resultItemId);
    let resultView = null;
    if (result?.equipment !== null && result?.equipment !== undefined) {
      const stats = ATTRIBUTES
        .filter((key) => (result.equipment?.attributeBonuses[key] ?? 0) > 0)
        .map((key) => `${model.attributeLabels[key] ?? key} +${result.equipment?.attributeBonuses[key]}`);
      if (result.equipment.healthBonus > 0) stats.push(`气血上限 +${result.equipment.healthBonus}`);
      if (result.equipment.qiBonus > 0) stats.push(`内力上限 +${result.equipment.qiBonus}`);
      resultView = {
        name: result.name,
        statsLine: `${stats.join('　·　') || '无属性加成'}　·　${SLOT_LABELS[result.equipment.slot] ?? result.equipment.slot}`,
        description: result.description,
      };
    }
    const eligibility = checkEquipmentForgeRecipe({ recipe, inventory: model.inventory, items: model.items });
    const blocks = buildForgeDetailBlocks({ recipe, ingredientViews, result: resultView, eligibility });
    blocks.unshift(`工钱 ${recipe.currencyCost} 两 · 现有银两 ${model.inventory.currency}`);
    if (this.notice !== null) blocks.unshift(`操作结果：${this.notice}`);
    const pages = paginateCraftingDetail(blocks, contentWidth, geometry.detailCapacity, measure);
    this.detailPages = pages;
    this.detailPage = Math.min(this.detailPage, pages.length - 1);
    this.addText(pages[this.detailPage] ?? '', left + 30, geometry.detailTop, 12, UI_PALETTE.text);
    this.drawFooter(geometry, model, eligibility.available ? '条件齐备，可以锻造。' : eligibility.reason, pages);
  }

  /** Fixed accessible bands: status/notice left, paging trail right, facts below. */
  private drawFooter(
    geometry: CraftingPanelGeometry,
    model: EquipmentForgePanelModel,
    eligibilityText: string | null,
    pages: readonly string[] | null,
  ): void {
    const { left, width, contentWidth } = geometry;
    const statusProbe = this.addText('', -500, -500, 11, UI_PALETTE.muted);
    const measureStatus = (text: string): number => statusProbe.context.measureText(text).width;
    const status = this.notice ?? eligibilityText ?? '当前无法锻造。';
    const statusText = this.addText(status, left + 30, geometry.statusTop, 11,
      this.notice !== null ? UI_PALETTE.accent : eligibilityText !== null && eligibilityText.includes('齐备') ? UI_PALETTE.jade : '#e8b04b');
    const columns = craftingFooterColumns(contentWidth);
    statusText.setText(this.fitGrapheme(status, columns.statusWidth, measureStatus));
    if (pages !== null && pages.length > 1) {
      const paging = this.addText('', left + width - 28, geometry.statusTop, 10, UI_PALETTE.muted, 'right');
      paging.setText(this.fitGrapheme(`详情${this.detailPage + 1}/${pages.length}页 PgDn/PgUp`, columns.trailWidth, (value) => paging.context.measureText(value).width));
    }
    this.addText(`现有银两 ${model.inventory.currency}`, left + 30, geometry.hintTop, 10, UI_PALETTE.muted);
  }

  /** Grapheme-truncates with an ellipsis until the value fits the width. */
  private fitGrapheme(value: string, maxWidth: number, measure: (text: string) => number): string {
    if (value.length === 0 || measure(value) <= maxWidth) return value;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let kept = '';
    for (const { segment } of segmenter.segment(value)) {
      if (measure(kept + segment + '…') > maxWidth) break;
      kept += segment;
    }
    return kept + '…';
  }

  private addText(value: string, x: number, y: number, size: number, color: string, align: 'left' | 'right' = 'left'): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      lineSpacing: Math.ceil(Number.parseInt(uiFontSize(size), 10) * 0.4),
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(text);
    return text;
  }
}
