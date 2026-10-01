import Phaser from 'phaser';

import {
  checkAlchemyRecipe,
  selectAlchemyOutcome,
  type AssembledAlchemyStation,
} from '../engine/alchemy-system';
import type { InventoryState, ItemRecordData } from '../engine/item-system';
import { uiFontSize } from './settings';
import {
  buildAlchemyDetailBlocks,
  craftingFooterColumns,
  buildCraftingPanelGeometry,
  craftingIngredientViews,
  paginateCraftingDetail,
  type CraftingPanelGeometry,
} from './crafting-panel-layout';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface AlchemyPanelModel {
  station: AssembledAlchemyStation;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  insight: number;
  /** Optional live read for growth caused by crafting rewards. */
  getInsight?: () => number;
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
  /** Round 120: complete measured detail pages for the selected formula. */
  private detailPages: string[] = [''];
  private detailPage = 0;

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
    this.detailPage = 0; // A new formula starts its detail from page one.
    this.render();
  }

  /** Round 120: PageUp/PageDown walk the selected formula's detail linearly. */
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
    if (!model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId)) {
      this.notice = recipe.discoveryHint;
      this.render();
      return;
    }
    const outcome = model.onCraft(recipe.id);
    this.notice = outcome.message;
    this.detailPage = 0; // The craft outcome rewrites the live detail.
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const insight = model.getInsight?.() ?? model.insight;
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildCraftingPanelGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(21),
      subtitleHeight: lineSize(11),
      rowHeight: lineSize(12) + 6,
      detailLineHeight: lineSize(12),
      statusHeight: lineSize(11),
      hintHeight: lineSize(10),
      maxVisibleRows: Math.min(5, Math.max(1, model.station.recipes.length)),
      maxWidth: 860,
      maxHeight: 510,
    });
    // Font-synced probes measure at each real glyph size (Round 119 pattern).
    const probe = (size: number) => this.addText('', -500, -500, size, UI_PALETTE.muted);
    const measureAt = (p: Phaser.GameObjects.Text) => (text: string): number => p.context.measureText(text).width;
    const measure = measureAt(probe(12));
    const measureLegend = measureAt(probe(11));
    const { left, top, width, height, contentWidth } = geometry;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.93);

    const titleText = this.addText(`${model.station.record.name} · 炼丹`, left + 24, top + 15, 21, UI_PALETTE.accent);
    titleText.setText(this.fitGrapheme(`${model.station.record.name} · 炼丹`, contentWidth, measureAt(titleText)));
    const legend = this.fitGrapheme('↑/↓ 选择 · Enter 制作 · Esc 收起', contentWidth, measureLegend);
    this.addText(legend, left + 30, top + 16 + lineSize(21) + 6, 11, UI_PALETTE.muted);

    const recipes = model.station.recipes;
    if (recipes.length === 0) {
      this.addText('此处暂时没有可用药方。', left + 28, geometry.listTop, 14, UI_PALETTE.muted);
      this.drawFooter(geometry, model, null, null);
      return;
    }
    const recipeStart = geometry.visibleRows > 0
      ? Math.max(0, Math.min(this.selectedIndex - 2, recipes.length - geometry.visibleRows))
      : 0;
    recipes.slice(recipeStart, recipeStart + geometry.visibleRows).forEach((recipe, visibleIndex) => {
      const index = recipeStart + visibleIndex;
      const known = model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId);
      const title = known ? recipe.name : `未识药方 ${index + 1}`;
      const y = geometry.listTop + visibleIndex * geometry.rowHeight;
      const active = index === this.selectedIndex;
      const label = `${active ? '▸' : '　'}${known ? '已识' : '未识'} · ${title}`;
      const rowText = this.addText(label, left + 28, y, 12,
        active ? UI_PALETTE.accent : known ? UI_PALETTE.jade : UI_PALETTE.muted);
      // A MOD-flooded name keeps its readable head here; the full title
      // always stays in the paged detail below.
      rowText.setText(this.fitGrapheme(label, contentWidth - 150, measure));
      this.addText(known ? `工钱 ${recipe.currencyCost} 两` : '寻访线索', left + width - 28, y, 10, UI_PALETTE.text, 'right');
    });

    const recipe = recipes[this.selectedIndex];
    if (recipe === undefined) { this.drawFooter(geometry, model, null, null); return; }
    const known = model.knownKnowledgeNodeIds.has(recipe.discoveryNodeId);
    const ingredientViews = known ? craftingIngredientViews(recipe, model.inventory, model.items) : [];
    const quality = known ? selectAlchemyOutcome(recipe, insight) : null;
    const resultItem = quality === null ? undefined : model.items.get(quality.resultItemId);
    const outcome = quality !== null && resultItem?.consumable !== null && resultItem?.consumable !== undefined
      ? {
          qualityName: quality.name,
          itemName: resultItem.name,
          healthRestore: resultItem.consumable.healthRestore,
          qiRestore: resultItem.consumable.qiRestore,
          description: resultItem.description,
        }
      : null;
    const eligibility = known ? checkAlchemyRecipe({
      recipe,
      insight,
      knownKnowledgeNodeIds: model.knownKnowledgeNodeIds,
      inventory: model.inventory,
      items: model.items,
    }) : { available: false, reason: null };
    const blocks = buildAlchemyDetailBlocks({
      recipe, known, index: this.selectedIndex + 1, ingredientViews, outcome, eligibility,
    });
    if (known) blocks.unshift(`工钱 ${recipe.currencyCost} 两 · 现有银两 ${model.inventory.currency} · 悟性 ${insight}`);
    if (this.notice !== null) blocks.unshift(`操作结果：${this.notice}`);
    const pages = paginateCraftingDetail(blocks, contentWidth, geometry.detailCapacity, measure);
    this.detailPages = pages;
    this.detailPage = Math.min(this.detailPage, pages.length - 1);
    this.addText(pages[this.detailPage] ?? '', left + 30, geometry.detailTop, 12, UI_PALETTE.text);
    this.drawFooter(geometry, model, eligibility.available ? '材料与工钱齐备，可以开炉。' : eligibility.reason, pages);
  }

  /** Fixed accessible bands: status/notice left, paging trail right, facts below. */
  private drawFooter(
    geometry: CraftingPanelGeometry,
    model: AlchemyPanelModel,
    eligibilityText: string | null,
    pages: readonly string[] | null,
  ): void {
    const { left, width, contentWidth } = geometry;
    const statusProbe = this.addText('', -500, -500, 11, UI_PALETTE.muted);
    const measureStatus = (text: string): number => statusProbe.context.measureText(text).width;
    const status = this.notice ?? eligibilityText ?? '当前无法炼药。';
    const statusText = this.addText(status, left + 30, geometry.statusTop, 11,
      this.notice !== null ? UI_PALETTE.accent : eligibilityText !== null && eligibilityText.includes('齐备') ? UI_PALETTE.jade : '#e8b04b');
    const columns = craftingFooterColumns(contentWidth);
    statusText.setText(this.fitGrapheme(status, columns.statusWidth, measureStatus));
    if (pages !== null && pages.length > 1) {
      const paging = this.addText('', left + width - 28, geometry.statusTop, 10, UI_PALETTE.muted, 'right');
      paging.setText(this.fitGrapheme(`详情${this.detailPage + 1}/${pages.length}页 PgDn/PgUp`, columns.trailWidth, (value) => paging.context.measureText(value).width));
    }
    this.addText(`现有银两 ${model.inventory.currency} · 悟性 ${model.getInsight?.() ?? model.insight}`, left + 30, geometry.hintTop, 10, UI_PALETTE.muted);
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
