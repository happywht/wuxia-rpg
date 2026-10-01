import Phaser from 'phaser';

import {
  type CharacterProfileData,
  type CharacterState,
  ATTRIBUTE_IDS,
} from '../engine/character-progression';
import {
  type EquipmentSlotId,
  type InventoryState,
  type ItemRecordData,
  equippedItemId,
  isEquipped,
  unequipItem,
  useConsumable,
  equipItem,
} from '../engine/item-system';
import { uiFontSize } from './settings';
import { wrapDialogueText, paginateDialogueLines } from './dialogue-layout';
import { addPixelPanelChrome, UI_FONT_FAMILY, addPixelSelection } from './ui-theme';

/**
 * Generic keyboard-driven backpack panel (Round 06).
 *
 * Renders the player's money, vital pools, effective attributes (with the
 * profile's own attribute labels), equipment slots and item stacks; the
 * selected stack's data description shows below the list. Enter uses a
 * consumable, equips/unequips equipment and reports unusable categories;
 * Up/Down (W/S) move the selection, Space pages through a long description
 * and Esc closes. All names, descriptions and numbers come from data — this
 * class only draws, forwards input and calls the Phaser-free item engine, so
 * no world content lives here. The owning scene gates movement input on
 * `isOpen`, exactly like the dialogue and battle panels.
 *
 * Round 109 geometry: the panel clamps to the viewport, every text block is
 * wrapped with the shared measured grapheme wrapper (no Phaser wordWrap), and
 * list/detail/footer heights are derived from the live font size, so long
 * residual-scroll descriptions page inside the panel instead of spilling
 * past the right edge — at 640×360 with the 1.5 font scale included. Enter
 * semantics, engine rules and the data itself are untouched.
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
  rowIdle: '#a8b2c4',
  rowActive: '#f0c96a',
  rowEquipped: '#a8d8b0',
  fontFamily: UI_FONT_FAMILY,
} as const;

const PADDING = 24;
const COMPACT_PADDING = 16;
/** Panel never wider/taller than these; smaller viewports clamp instead. */
const PANEL_MAX_WIDTH = 560;
const PANEL_MAX_HEIGHT = 452;
/** Minimum gap between the panel and the viewport edges. */
const VIEW_MARGIN = 12;
/** Rows visible at once; longer lists scroll around the selection. */
const LIST_ROWS_MAX = 8;
/** Description lines aimed for; squeezed panels may shrink towards one. */
const DETAIL_LINES_MAX = 4;
/** Shared body line step (font px + spacing), mirroring the test geometry. */
const LINE_SPACING = 3;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';
const EQUIPPED_MARK = '［装备中］';

/** Mechanic-only labels rendered next to data-driven values. */
const LABELS = {
  title: '背包',
  currency: '银两',
  capacity: '容量',
  level: '等级',
  health: '生命',
  qi: '内力',
  equippedTitle: '已装备',
  emptySlots: '（空）',
  slotWeapon: '兵刃',
  slotGarment: '衣装',
  slotOrnament: '配饰',
  consumableUse: 'Enter 使用',
  equipAction: 'Enter 装备',
  unequipAction: 'Enter 卸下',
  miscAction: '此物此刻用不上',
  selectHint: '↑/↓ 选择 · Enter 使用/装备 · Space 读说明 · Esc 关闭',
  stacksHidden: '……（其余堆数未显示）',
  detailPageRead: 'Space 续读',
} as const;

/** Parses a `uiFontSize` pixel string; defensive fallback keeps geometry sane. */
function fontPx(spec: string): number {
  const value = Number.parseInt(spec, 10);
  return Number.isFinite(value) && value > 0 ? value : 12;
}

/**
 * Picks the widest single-line variant that fits: the full row first, then
 * the name/count/equipped summary, then a grapheme-truncated tail (the data
 * caps names at six characters, so the truncation branch is a safety net).
 */
function fitRowLine(
  full: string,
  summary: string,
  maxWidth: number,
  measure: (value: string) => number,
): string {
  if (measure(full) <= maxWidth) {
    return full;
  }
  if (measure(summary) <= maxWidth) {
    return summary;
  }
  const marker = '…';
  let line = '';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(summary)) {
    if (line !== '' && measure(line + segment + marker) > maxWidth) {
      break;
    }
    line += segment;
  }
  return line + marker;
}

function slotLabel(slot: EquipmentSlotId): string {
  if (slot === 'weapon') {
    return LABELS.slotWeapon;
  }
  return slot === 'garment' ? LABELS.slotGarment : LABELS.slotOrnament;
}

/** One line summarizing a stack: name, count and category-driven suffix. */
function stackLineText(item: ItemRecordData, quantity: number, equipped: boolean): string {
  const marks = equipped ? ` ${EQUIPPED_MARK}` : '';
  if (item.category === 'consumable' && item.consumable !== null) {
    const parts: string[] = [];
    if (item.consumable.healthRestore > 0) {
      parts.push(`${LABELS.health}+${item.consumable.healthRestore}`);
    }
    if (item.consumable.qiRestore > 0) {
      parts.push(`${LABELS.qi}+${item.consumable.qiRestore}`);
    }
    return `${item.name} ×${quantity}　${parts.join(' ')}${marks}`;
  }
  if (item.category === 'equipment' && item.equipment !== null) {
    const parts: string[] = [slotLabel(item.equipment.slot)];
    for (const attributeId of ATTRIBUTE_IDS) {
      const bonus = item.equipment.attributeBonuses[attributeId];
      if (bonus !== undefined && bonus > 0) {
        parts.push(`${attributeId}+${bonus}`);
      }
    }
    if (item.equipment.healthBonus > 0) {
      parts.push(`${LABELS.health}+${item.equipment.healthBonus}`);
    }
    if (item.equipment.qiBonus > 0) {
      parts.push(`${LABELS.qi}+${item.equipment.qiBonus}`);
    }
    return `${item.name} ×${quantity}　${parts.join(' ')}${marks}`;
  }
  return `${item.name} ×${quantity}${marks}`;
}

/** What Enter does with the selected stack, for the status line. */
function actionHintFor(item: ItemRecordData, equipped: boolean): string {
  if (item.category === 'consumable') {
    return LABELS.consumableUse;
  }
  if (item.category === 'equipment') {
    return equipped ? LABELS.unequipAction : LABELS.equipAction;
  }
  return LABELS.miscAction;
}

/** Everything the panel renders and operates on. */
export interface InventoryPanelModel {
  profile: CharacterProfileData;
  character: CharacterState;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
}

type PanelKeyBinding = {
  key: Phaser.Input.Keyboard.Key;
  handler: () => void;
};

export interface InventoryPanelOptions {
  /** Invoked after the panel closed; the scene unlocks movement here. */
  onClose?: () => void;
  /** Invoked after an operation succeeds and changes player item counts. */
  onChange?: () => void;
  /** Successful live action only; inventory snapshots never imply an action. */
  onAction?: (action: { type: 'item-used' | 'item-equipped'; itemId: string }) => void;
}

export class InventoryPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private readonly onChange?: () => void;
  private readonly onAction?: InventoryPanelOptions['onAction'];

  private model: InventoryPanelModel | null = null;
  private selection = 0;
  private status: string | null = null;
  private openState = false;
  /** Current page of the selected stack's description (0-based). */
  private detailPage = 0;
  /** Page count of the last rendered description; 1 when there is none. */
  private detailPages = 1;

  constructor(scene: Phaser.Scene, options: InventoryPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.onChange = options.onChange;
    this.onAction = options.onAction;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1050);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Starts rendering the given model; keys bind for the panel's lifetime. */
  open(model: InventoryPanelModel): void {
    if (this.openState) {
      return;
    }
    this.model = model;
    this.selection = 0;
    this.status = null;
    this.detailPage = 0;
    this.detailPages = 1;
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
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.SPACE, () => this.turnDetailPage()],
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

  private moveSelection(delta: number): void {
    const count = this.model?.inventory.stacks.length ?? 0;
    if (count === 0) {
      return;
    }
    this.status = null;
    this.selection = (this.selection + delta + count) % count;
    this.detailPage = 0; // A different stack starts its description over.
    this.render();
  }

  /**
   * Space advances the selected description's pages cyclically. It never
   * uses, equips, crafts or closes anything — reading costs nothing.
   */
  private turnDetailPage(): void {
    if (this.detailPages <= 1) {
      return;
    }
    this.detailPage = (this.detailPage + 1) % this.detailPages;
    this.render();
  }

  private confirm(): void {
    const model = this.model;
    if (model === null) {
      return;
    }
    const stack = model.inventory.stacks[this.selection];
    const item = stack === undefined ? undefined : model.items.get(stack.itemId);
    if (stack === undefined || item === undefined) {
      return; // Defensive: rows always resolve at render time.
    }

    if (item.category === 'consumable') {
      const outcome = useConsumable(model.inventory, model.character, item);
      this.status = outcome.ok
        ? `${item.name}：${LABELS.health}+${outcome.outcome.healthHealed} · ${LABELS.qi}+${outcome.outcome.qiRestored}`
        : outcome.message;
      this.clampSelection();
      if (outcome.ok) {
        this.onAction?.({ type: 'item-used', itemId: item.id });
        this.onChange?.();
      }
      this.render();
      return;
    }
    if (item.category === 'equipment') {
      const context = {
        inventory: model.inventory,
        character: model.character,
        profile: model.profile,
        items: model.items,
      };
      const outcome = isEquipped(model.inventory, item.id)
        ? unequipItem(context, item.equipment?.slot ?? 'weapon')
        : equipItem(context, item);
      this.status = outcome.ok
        ? `${item.name}：${slotLabel(outcome.slot)}${isEquipped(model.inventory, item.id) ? ' 已装备' : ' 已卸下'}`
        : outcome.message;
      this.clampSelection();
      if (outcome.ok) {
        if (isEquipped(model.inventory, item.id)) this.onAction?.({ type: 'item-equipped', itemId: item.id });
        this.onChange?.();
      }
      this.render();
      return;
    }
    this.status = `${item.name}：${LABELS.miscAction}`;
    this.render();
  }

  /** Keeps the cursor valid after a use removed the last stack. */
  private clampSelection(): void {
    const count = this.model?.inventory.stacks.length ?? 0;
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

    // Viewport-clamped panel geometry; every later block derives from the
    // live font sizes so nothing can spill past the frame at any scale.
    const viewWidth = this.scene.scale.width;
    const viewHeight = this.scene.scale.height;
    const panelWidth = Math.min(PANEL_MAX_WIDTH, viewWidth - VIEW_MARGIN * 2);
    const panelHeight = Math.min(PANEL_MAX_HEIGHT, viewHeight - VIEW_MARGIN * 2);
    const panelLeft = Math.round((viewWidth - panelWidth) / 2);
    const panelTop = Math.round((viewHeight - panelHeight) / 2 + 6);
    const padding = panelWidth >= PANEL_MAX_WIDTH - 80 ? PADDING : COMPACT_PADDING;
    const contentWidth = panelWidth - padding * 2;

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: panelLeft, y: panelTop, width: panelWidth, height: panelHeight },
      UI.overlayAlpha,
    );

    const titleSize = fontPx(uiFontSize(18));
    const bodySize = fontPx(uiFontSize(12));
    const rowSize = fontPx(uiFontSize(13));
    const moreSize = fontPx(uiFontSize(11));
    const hintSize = fontPx(uiFontSize(10));
    const bodyLine = bodySize + LINE_SPACING;
    const rowHeight = Math.max(rowSize + 8, rowSize * 2);
    const moreLine = moreSize + LINE_SPACING;
    const hintLine = hintSize + LINE_SPACING;
    const detailLine = Math.max(bodySize + 4, Math.ceil(bodySize * 1.5));

    // Measuring probes share the panel container, so teardown reclaims them.
    const measureWith = (size: number): ((value: string) => number) => {
      const probe = this.scene.add.text(0, 0, '', {
        fontFamily: UI.fontFamily,
        fontSize: `${size}px`,
        color: UI.textMuted,
      });
      this.container.add(probe);
      return (value: string): number => probe.context.measureText(value).width;
    };
    const wrapLines = (text: string, size: number): string[] =>
      wrapDialogueText(text, contentWidth, measureWith(size));
    const addWrapped = (
      x: number,
      y: number,
      lines: readonly string[],
      size: number,
      color: string,
      align?: 'right',
    ): void => {
      const text = this.scene.add
        .text(x, y, lines.join('\n'), {
          fontFamily: UI.fontFamily,
          fontSize: `${size}px`,
          color,
          align,
        })
        .setOrigin(align === 'right' ? 1 : 0, 0);
      this.container.add(text);
    };

    // Header: title, money and stack capacity.
    const headerTop = panelTop + Math.max(10, Math.round(titleSize * 0.55));
    const title = this.scene.add
      .text(panelLeft + padding, headerTop, LABELS.title, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(18),
        color: UI.accent,
      })
      .setOrigin(0, 0);
    this.container.add(title);

    const moneyLine = `${LABELS.currency} ${model.inventory.currency}　${LABELS.capacity} ${model.inventory.stacks.length}/${model.inventory.capacity}`;
    const moneyText = this.scene.add
      .text(panelLeft + panelWidth - padding, headerTop + Math.round((titleSize - bodySize) / 2), moneyLine, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textWarn,
      })
      .setOrigin(1, 0);
    this.container.add(moneyText);

    // Character strip: level, vitals and effective attributes (data labels).
    const attributeParts = ATTRIBUTE_IDS.map(
      (attributeId) =>
        `${model.profile.attributeLabels[attributeId]} ${model.character.attributes[attributeId]}`,
    );
    const vitalLine = `${LABELS.level} ${model.character.level}　${LABELS.health} ${model.character.health.current}/${model.character.health.max}　${LABELS.qi} ${model.character.qi.current}/${model.character.qi.max}`;
    const vitalLines = wrapLines(vitalLine, bodySize);
    addWrapped(panelLeft + padding, headerTop + titleSize + Math.max(8, Math.round(bodySize * 0.45)), vitalLines, bodySize, UI.textPrimary);

    const attributeLines = wrapLines(attributeParts.join('　'), bodySize);
    const attributesTop = headerTop + titleSize + Math.max(8, Math.round(bodySize * 0.45)) + vitalLines.length * bodyLine + Math.max(4, Math.round(bodySize * 0.3));
    addWrapped(panelLeft + padding, attributesTop, attributeLines, bodySize, UI.textPrimary);

    // Equipment slots strip.
    const slotParts = (['weapon', 'garment', 'ornament'] as const).map((slot) => {
      const itemId = equippedItemId(model.inventory, slot);
      const item = itemId === undefined ? undefined : model.items.get(itemId);
      return `${slotLabel(slot)}：${item === undefined ? LABELS.emptySlots : item.name}`;
    });
    const slotLines = wrapLines(`${LABELS.equippedTitle}　${slotParts.join('　')}`, bodySize);
    const slotsTop = attributesTop + attributeLines.length * bodyLine + Math.max(4, Math.round(bodySize * 0.3));
    addWrapped(panelLeft + padding, slotsTop, slotLines, bodySize, UI.rowEquipped);

    const listTop = slotsTop + slotLines.length * bodyLine + Math.max(6, Math.round(rowSize * 0.4));
    const listGap = Math.max(6, Math.round(rowSize * 0.4));

    // Footer (status line + key hint) reserves its real height first.
    const hintLines = wrapLines(LABELS.selectHint, hintSize);
    const hintBottom = panelTop + panelHeight - Math.max(10, Math.round(hintSize * 0.8));
    const hintTop = hintBottom - hintLines.length * hintLine;
    const statusLines = this.status === null ? [] : wrapLines(this.status, bodySize);
    const statusTop =
      hintTop - Math.max(4, Math.round(bodySize * 0.35)) - statusLines.length * bodyLine;
    const detailLimit = statusTop - Math.max(4, Math.round(bodySize * 0.3));

    // Split the remaining height between the row window and the description,
    // always keeping at least one line of each and a fixed action row.
    const stacks = model.inventory.stacks;
    const actionBlock = bodyLine + 8;
    const budget = detailLimit - listTop;
    const layoutFor = (moreReserve: number): { rows: number; capacity: number } => {
      const usable = Math.max(0, budget - listGap - actionBlock - moreReserve);
      let capacity = Math.min(
        DETAIL_LINES_MAX,
        Math.max(1, Math.floor((usable - rowHeight) / detailLine)),
      );
      const rows = Math.max(
        1,
        Math.min(LIST_ROWS_MAX, Math.floor((usable - capacity * detailLine) / rowHeight)),
      );
      capacity = Math.min(
        DETAIL_LINES_MAX,
        Math.max(1, Math.floor((usable - rows * rowHeight) / detailLine)),
      );
      return { rows, capacity };
    };
    const firstPass = layoutFor(0);
    const moreReserve = stacks.length > firstPass.rows ? moreLine + 2 : 0;
    const { rows: visibleRows, capacity: detailCapacity } = layoutFor(moreReserve);

    const listBottom = listTop + visibleRows * rowHeight;
    if (stacks.length === 0) {
      const emptyText = this.scene.add
        .text(panelLeft + padding, listTop, LABELS.emptySlots, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(13),
          color: UI.textMuted,
        })
        .setOrigin(0, 0);
      this.container.add(emptyText);
    } else {
      const windowStart = Math.floor(this.selection / visibleRows) * visibleRows;
      const rowMeasure = measureWith(rowSize);
      stacks.slice(windowStart, windowStart + visibleRows).forEach((stack, offset) => {
        const index = windowStart + offset;
        const item = model.items.get(stack.itemId);
        if (item === undefined) {
          return; // Defensive: rows always resolve at assembly time.
        }
        const active = index === this.selection;
        const equipped = isEquipped(model.inventory, item.id);
        if (active) {
          addPixelSelection(this.scene, this.container, {
            x: panelLeft + padding,
            y: listTop + offset * rowHeight - 2,
            width: panelWidth - padding * 2,
            height: rowHeight,
          });
        }
        const full = `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${stackLineText(item, stack.quantity, equipped)}`;
        const summary = `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${item.name} ×${stack.quantity}${equipped ? ` ${EQUIPPED_MARK}` : ''}`;
        const lineText = this.scene.add
          .text(
            panelLeft + padding + 6,
            listTop + offset * rowHeight,
            fitRowLine(full, summary, contentWidth - 6, rowMeasure),
            {
              fontFamily: UI.fontFamily,
              fontSize: uiFontSize(13),
              color: equipped ? UI.rowEquipped : active ? UI.rowActive : UI.rowIdle,
            },
          )
          .setOrigin(0, 0);
        this.container.add(lineText);
      });
      if (windowStart + visibleRows < stacks.length) {
        const moreText = this.scene.add
          .text(panelLeft + padding + 6, listBottom + 2, LABELS.stacksHidden, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(11),
            color: UI.textMuted,
          })
          .setOrigin(0, 0);
        this.container.add(moreText);
      }
    }

    // Selected item description (data text), paginated for full reading.
    const detailTop = listBottom + moreReserve + listGap;
    const selectedStack = stacks[this.selection];
    const selectedItem =
      selectedStack === undefined ? undefined : model.items.get(selectedStack.itemId);
    if (selectedItem === undefined) {
      this.detailPages = 1;
      this.detailPage = 0;
    } else {
      const detailText = this.scene.add
        .text(panelLeft + padding, detailTop, '', {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textMuted,
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      this.container.add(detailText);
      const pages = paginateDialogueLines(
        wrapDialogueText(selectedItem.description, contentWidth, (value) =>
          detailText.context.measureText(value).width,
        ),
        detailCapacity,
      );
      this.detailPages = pages.length;
      this.detailPage = Math.min(this.detailPage, pages.length - 1);
      detailText.setText(pages[this.detailPage] ?? '');
    }

    // Fixed action row inside the reserved detail space: page hint left,
    // Enter hint right — Space paging never changes what Enter does.
    const actionTop = detailTop + detailCapacity * detailLine + 4;
    if (selectedItem !== undefined && this.detailPages > 1) {
      addWrapped(
        panelLeft + padding,
        actionTop,
        [
          `说明 ${this.detailPage + 1}/${this.detailPages} · ${LABELS.detailPageRead}`,
        ],
        bodySize,
        UI.textMuted,
      );
    }
    if (selectedItem !== undefined) {
      const actionText = this.scene.add
        .text(
          panelLeft + panelWidth - padding,
          actionTop,
          actionHintFor(selectedItem, isEquipped(model.inventory, selectedItem.id)),
          {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(12),
            color: UI.accent,
          },
        )
        .setOrigin(1, 0);
      this.container.add(actionText);
    }

    // Status line (latest operation result) and the key hint.
    if (statusLines.length > 0) {
      addWrapped(panelLeft + padding, statusTop, statusLines, bodySize, UI.textWarn);
    }
    const hintText = this.scene.add
      .text(panelLeft + panelWidth - padding, hintBottom, hintLines.join('\n'), {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textMuted,
        align: 'right',
      })
      .setOrigin(1, 1);
    this.container.add(hintText);
  }
}
