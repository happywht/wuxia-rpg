import Phaser from 'phaser';

import {
  type AssembledShop,
  type InventoryState,
  type ItemRecordData,
  type ShopStockRuntime,
  UNLIMITED_STOCK,
  buyItem,
  computeSellPrice,
  isEquipped,
  sellItem,
} from '../engine/item-system';

/**
 * Generic keyboard-driven merchant panel (Round 06).
 *
 * Two tabs share one panel: the shop shelf (buy) and the player's bag
 * (sell); Left/Right (A/D) switch tabs, Up/Down (W/S) move the selection,
 * Enter trades exactly one unit of the selected row and Esc closes. Shop
 * name, greeting, item names, descriptions, prices and stock levels all
 * come from data — this class only draws, forwards input and calls the
 * Phaser-free trade engine, so no world content lives here. The owning
 * scene gates movement input on `isOpen`, exactly like the other panels.
 */

const UI = {
  overlayFill: 0x06080d,
  overlayAlpha: 0.72,
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  accent: '#f0c96a',
  tabActive: '#f0c96a',
  tabIdle: '#8a94a6',
  rowIdle: '#a8b2c4',
  rowActive: '#f0c96a',
  rowDisabled: '#5a6272',
  rowEquipped: '#a8d8b0',
  fontFamily: 'sans-serif',
} as const;

const PADDING = 24;
const ROW_HEIGHT = 26;
/** Rows visible at once; longer lists scroll around the selection. */
const VISIBLE_ROWS = 7;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';
const EQUIPPED_MARK = '［装备中］';
const UNSELLABLE_MARK = '［不可售］';
const UNLIMITED_MARK = '充足';
const EMPTY_SHELF = '（货架空空如也）';
const EMPTY_BAG = '（背包里没有可出售的物品）';
const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 452;

/** Mechanic-only labels rendered next to data-driven values. */
const LABELS = {
  currency: '银两',
  buyTab: '购买',
  sellTab: '出售',
  price: '价',
  sellPrice: '可得',
  stock: '存货',
  selectHint: '↑/↓ 选择 · ←/→ 买卖切换 · Enter 交易一件 · Esc 关闭',
  stocksHidden: '……（其余条目未显示）',
} as const;

/** Everything the panel renders and operates on. */
export interface ShopPanelModel {
  shop: AssembledShop;
  stock: ShopStockRuntime;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
}

type ShopTab = 'buy' | 'sell';

type PanelKeyBinding = {
  key: Phaser.Input.Keyboard.Key;
  handler: () => void;
};

export interface ShopPanelOptions {
  /** Invoked after the panel closed; the scene unlocks movement here. */
  onClose?: () => void;
  /** Invoked after a successful trade so collect-objectives can be refreshed. */
  onChange?: () => void;
}

export class ShopPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private readonly onChange?: () => void;

  private model: ShopPanelModel | null = null;
  private tab: ShopTab = 'buy';
  private selection = 0;
  private status: string | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, options: ShopPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.onChange = options.onChange;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1150);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Starts rendering `model`; keys bind for the panel's lifetime. */
  open(model: ShopPanelModel): void {
    if (this.openState) {
      return;
    }
    this.model = model;
    this.tab = 'buy';
    this.selection = 0;
    this.status = null;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  /** Closes the panel and releases the keyboard bindings. */
  close(): void {
    if (!this.openState) {
      return;
    }
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.model = null;
    this.onClose?.();
  }

  /** Destroys the panel for good (scene teardown). */
  destroy(): void {
    this.close();
    this.container.destroy();
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) {
      return;
    }
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [KeyCodes.UP, () => this.moveSelection(-1)],
      [KeyCodes.W, () => this.moveSelection(-1)],
      [KeyCodes.DOWN, () => this.moveSelection(1)],
      [KeyCodes.S, () => this.moveSelection(1)],
      [KeyCodes.LEFT, () => this.switchTab('buy')],
      [KeyCodes.A, () => this.switchTab('buy')],
      [KeyCodes.RIGHT, () => this.switchTab('sell')],
      [KeyCodes.D, () => this.switchTab('sell')],
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.ESC, () => this.close()],
    ];
    for (const [code, handler] of pairs) {
      const key = keyboard.addKey(code);
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) {
      key.off('down', handler);
    }
    this.bindings.length = 0;
  }

  /** Rows of the active tab: shelf entries when buying, stacks when selling. */
  private get rowCount(): number {
    const model = this.model;
    if (model === null) {
      return 0;
    }
    return this.tab === 'buy' ? model.shop.stock.length : model.inventory.stacks.length;
  }

  private switchTab(tab: ShopTab): void {
    if (this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.selection = 0;
    this.status = null;
    this.render();
  }

  private moveSelection(delta: number): void {
    const count = this.rowCount;
    if (count === 0) {
      return;
    }
    this.status = null;
    this.selection = (this.selection + delta + count) % count;
    this.render();
  }

  private confirm(): void {
    const model = this.model;
    if (model === null) {
      return;
    }
    if (this.tab === 'buy') {
      const stockEntry = model.shop.stock[this.selection];
      const item = stockEntry === undefined ? undefined : model.items.get(stockEntry.itemId);
      if (item === undefined) {
        return; // Defensive: rows always resolve at assembly time.
      }
      const outcome = buyItem(model.inventory, model.stock, item, 1);
      this.status = outcome.ok
        ? `购入「${item.name}」：${LABELS.currency} -${outcome.outcome.cost}`
        : outcome.message;
      if (outcome.ok) this.onChange?.();
      this.render();
      return;
    }

    const stack = model.inventory.stacks[this.selection];
    const item = stack === undefined ? undefined : model.items.get(stack.itemId);
    if (item === undefined) {
      return; // Defensive: rows always resolve at assembly time.
    }
    const outcome = sellItem(model.inventory, model.stock, model.shop.record, item, 1);
    this.status = outcome.ok
      ? `售出「${item.name}」：${LABELS.currency} +${outcome.outcome.revenue}`
      : outcome.message;
    this.clampSelection();
    if (outcome.ok) this.onChange?.();
    this.render();
  }

  /** Keeps the cursor valid after a sale removed the last stack. */
  private clampSelection(): void {
    const count = this.rowCount;
    if (count === 0) {
      this.selection = 0;
      return;
    }
    this.selection = Math.min(this.selection, count - 1);
  }

  /** Rebuilds every panel element from the current model state. */
  private render(): void {
    const model = this.model;
    if (model === null) {
      return;
    }
    this.container.removeAll(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelLeft = (width - PANEL_WIDTH) / 2;
    const panelTop = (height - PANEL_HEIGHT) / 2 + 6;
    const contentWidth = PANEL_WIDTH - PADDING * 2;

    const overlay = this.scene.add.rectangle(0, 0, width, height, UI.overlayFill, UI.overlayAlpha);
    overlay.setOrigin(0, 0);
    this.container.add(overlay);

    const panel = this.scene.add.rectangle(
      panelLeft + PANEL_WIDTH / 2,
      panelTop + PANEL_HEIGHT / 2,
      PANEL_WIDTH,
      PANEL_HEIGHT,
      UI.panelFill,
    );
    panel.setStrokeStyle(2, UI.panelStroke);
    this.container.add(panel);

    // Header: shop name (data), tabs and the player's money.
    const nameText = this.scene.add
      .text(panelLeft + PADDING, panelTop + 16, model.shop.record.name, {
        fontFamily: UI.fontFamily,
        fontSize: '18px',
        color: UI.accent,
      })
      .setOrigin(0, 0);
    this.container.add(nameText);

    const tabText = this.scene.add
      .text(
        panelLeft + PANEL_WIDTH / 2,
        panelTop + 20,
        `${this.tab === 'buy' ? '▶' : '　'}${LABELS.buyTab}　｜　${this.tab === 'sell' ? '▶' : '　'}${LABELS.sellTab}`,
        {
          fontFamily: UI.fontFamily,
          fontSize: '13px',
          color: UI.textPrimary,
        },
      )
      .setOrigin(0.5, 0);
    this.container.add(tabText);

    const moneyText = this.scene.add
      .text(panelLeft + PANEL_WIDTH - PADDING, panelTop + 20, `${LABELS.currency} ${model.inventory.currency}`, {
        fontFamily: UI.fontFamily,
        fontSize: '13px',
        color: UI.textWarn,
      })
      .setOrigin(1, 0);
    this.container.add(moneyText);

    // Greeting (data text) under the header.
    const greetingText = this.scene.add
      .text(panelLeft + PADDING, panelTop + 44, model.shop.record.greeting, {
        fontFamily: UI.fontFamily,
        fontSize: '12px',
        color: UI.textMuted,
        wordWrap: { width: contentWidth },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    this.container.add(greetingText);

    // Rows of the active tab inside a scrolling window.
    const listTop = panelTop + 96;
    const rowCount = this.rowCount;
    if (rowCount === 0) {
      const emptyText = this.scene.add
        .text(panelLeft + PADDING, listTop, this.tab === 'buy' ? EMPTY_SHELF : EMPTY_BAG, {
          fontFamily: UI.fontFamily,
          fontSize: '13px',
          color: UI.textMuted,
        })
        .setOrigin(0, 0);
      this.container.add(emptyText);
    } else {
      const windowStart = Math.floor(this.selection / VISIBLE_ROWS) * VISIBLE_ROWS;
      for (let offset = 0; offset < VISIBLE_ROWS; offset += 1) {
        const index = windowStart + offset;
        if (index >= rowCount) {
          break;
        }
        const line =
          this.tab === 'buy' ? this.buyLine(index) : this.sellLine(index);
        if (line === null) {
          continue;
        }
        const rowText = this.scene.add
          .text(
            panelLeft + PADDING + 6,
            listTop + offset * ROW_HEIGHT,
            `${index === this.selection ? CURSOR_ACTIVE : CURSOR_IDLE}${line.text}`,
            {
              fontFamily: UI.fontFamily,
              fontSize: '13px',
              color: line.color,
            },
          )
          .setOrigin(0, 0);
        this.container.add(rowText);
      }
      if (windowStart + VISIBLE_ROWS < rowCount) {
        const moreText = this.scene.add
          .text(panelLeft + PADDING + 6, listTop + VISIBLE_ROWS * ROW_HEIGHT, LABELS.stocksHidden, {
            fontFamily: UI.fontFamily,
            fontSize: '11px',
            color: UI.textMuted,
          })
          .setOrigin(0, 0);
        this.container.add(moreText);
      }
    }

    // Selected row's item description (data text).
    const detailTop = listTop + (VISIBLE_ROWS + 1) * ROW_HEIGHT + 6;
    const selectedItem = this.selectedItem();
    if (selectedItem !== undefined) {
      const detailText = this.scene.add
        .text(panelLeft + PADDING, detailTop, selectedItem.description, {
          fontFamily: UI.fontFamily,
          fontSize: '12px',
          color: UI.textMuted,
          wordWrap: { width: contentWidth },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      this.container.add(detailText);
    }

    // Status line (latest trade result) and the key hint.
    if (this.status !== null) {
      const statusText = this.scene.add
        .text(panelLeft + PADDING, panelTop + PANEL_HEIGHT - 44, this.status, {
          fontFamily: UI.fontFamily,
          fontSize: '12px',
          color: UI.textWarn,
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0, 0);
      this.container.add(statusText);
    }

    const hintText = this.scene.add
      .text(panelLeft + PANEL_WIDTH - PADDING, panelTop + PANEL_HEIGHT - 20, LABELS.selectHint, {
        fontFamily: UI.fontFamily,
        fontSize: '10px',
        color: UI.textMuted,
      })
      .setOrigin(1, 1);
    this.container.add(hintText);
  }

  /** Item behind the selected row of the active tab, if resolvable. */
  private selectedItem(): ItemRecordData | undefined {
    const model = this.model;
    if (model === null) {
      return undefined;
    }
    if (this.tab === 'buy') {
      const stockEntry = model.shop.stock[this.selection];
      return stockEntry === undefined ? undefined : model.items.get(stockEntry.itemId);
    }
    const stack = model.inventory.stacks[this.selection];
    return stack === undefined ? undefined : model.items.get(stack.itemId);
  }

  /** Buy-tab row text: name, price and remaining stock. */
  private buyLine(index: number): { text: string; color: string } | null {
    const model = this.model;
    const stockEntry = model?.shop.stock[index];
    if (model === null || stockEntry === undefined) {
      return null;
    }
    const item = model.items.get(stockEntry.itemId);
    if (item === undefined) {
      return null;
    }
    const remaining = model.stock.get(item.id) ?? 0;
    const stockLabel =
      remaining === UNLIMITED_STOCK ? UNLIMITED_MARK : String(Math.max(0, remaining));
    const affordable = model.inventory.currency >= item.buyPrice && remaining !== 0;
    return {
      text: `${item.name}　${LABELS.price} ${item.buyPrice}　${LABELS.stock} ${stockLabel}`,
      color: index === this.selection ? (affordable ? UI.rowActive : UI.rowDisabled) : affordable ? UI.rowIdle : UI.rowDisabled,
    };
  }

  /** Sell-tab row text: name, count, payout and lock/unsellable marks. */
  private sellLine(index: number): { text: string; color: string } | null {
    const model = this.model;
    const stack = model?.inventory.stacks[index];
    if (model === null || stack === undefined) {
      return null;
    }
    const item = model.items.get(stack.itemId);
    if (item === undefined) {
      return null;
    }
    const equipped = isEquipped(model.inventory, item.id);
    const payout = computeSellPrice(item, model.shop.record);
    const marks =
      equipped
        ? ` ${EQUIPPED_MARK}`
        : payout <= 0
          ? ` ${UNSELLABLE_MARK}`
          : '';
    return {
      text: `${item.name} ×${stack.quantity}　${LABELS.sellPrice} ${payout}${marks}`,
      color: equipped ? UI.rowEquipped : payout <= 0 ? UI.rowDisabled : UI.rowIdle,
    };
  }
}
