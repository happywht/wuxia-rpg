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
import { addPixelPanelChrome, UI_FONT_FAMILY, addPixelSelection } from './ui-theme';

/**
 * Generic keyboard-driven backpack panel (Round 06).
 *
 * Renders the player's money, vital pools, effective attributes (with the
 * profile's own attribute labels), equipment slots and item stacks; the
 * selected stack's data description shows below the list. Enter uses a
 * consumable, equips/unequips equipment and reports unusable categories;
 * Up/Down (W/S) move the selection and Esc closes. All names, descriptions
 * and numbers come from data — this class only draws, forwards input and
 * calls the Phaser-free item engine, so no world content lives here. The
 * owning scene gates movement input on `isOpen`, exactly like the dialogue
 * and battle panels.
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
const ROW_HEIGHT = 26;
/** Rows visible at once; longer lists scroll around the selection. */
const VISIBLE_ROWS = 8;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';
const EQUIPPED_MARK = '［装备中］';
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 452;

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
  selectHint: '↑/↓ 选择 · Enter 使用/装备 · Esc 关闭',
  stacksHidden: '……（其余堆数未显示）',
} as const;

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
}

export class InventoryPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private readonly onChange?: () => void;

  private model: InventoryPanelModel | null = null;
  private selection = 0;
  private status: string | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, options: InventoryPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.onChange = options.onChange;
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
      if (outcome.ok) this.onChange?.();
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
      if (outcome.ok) this.onChange?.();
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

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelLeft = (width - PANEL_WIDTH) / 2;
    const panelTop = (height - PANEL_HEIGHT) / 2 + 6;
    const contentWidth = PANEL_WIDTH - PADDING * 2;

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: panelLeft, y: panelTop, width: PANEL_WIDTH, height: PANEL_HEIGHT },
      UI.overlayAlpha,
    );

    // Header: title, money and stack capacity.
    const title = this.scene.add
      .text(panelLeft + PADDING, panelTop + 16, LABELS.title, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(18),
        color: UI.accent,
      })
      .setOrigin(0, 0);
    this.container.add(title);

    const moneyLine = `${LABELS.currency} ${model.inventory.currency}　${LABELS.capacity} ${model.inventory.stacks.length}/${model.inventory.capacity}`;
    const moneyText = this.scene.add
      .text(panelLeft + PANEL_WIDTH - PADDING, panelTop + 20, moneyLine, {
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
    const vitalsText = this.scene.add
      .text(panelLeft + PADDING, panelTop + 44, vitalLine, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textPrimary,
      })
      .setOrigin(0, 0);
    this.container.add(vitalsText);

    const attributesText = this.scene.add
      .text(panelLeft + PADDING, panelTop + 64, attributeParts.join('　'), {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textPrimary,
      })
      .setOrigin(0, 0);
    this.container.add(attributesText);

    // Equipment slots strip.
    const slotParts = (['weapon', 'garment', 'ornament'] as const).map((slot) => {
      const itemId = equippedItemId(model.inventory, slot);
      const item = itemId === undefined ? undefined : model.items.get(itemId);
      return `${slotLabel(slot)}：${item === undefined ? LABELS.emptySlots : item.name}`;
    });
    const slotsText = this.scene.add
      .text(panelLeft + PADDING, panelTop + 84, `${LABELS.equippedTitle}　${slotParts.join('　')}`, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.rowEquipped,
        wordWrap: { width: contentWidth },
      })
      .setOrigin(0, 0);
    this.container.add(slotsText);

    // Item rows inside a scrolling window around the selection.
    const listTop = panelTop + 116;
    const stacks = model.inventory.stacks;
    if (stacks.length === 0) {
      const emptyText = this.scene.add
        .text(panelLeft + PADDING, listTop, LABELS.emptySlots, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(13),
          color: UI.textMuted,
        })
        .setOrigin(0, 0);
      this.container.add(emptyText);
    } else {
      const windowStart = Math.floor(this.selection / VISIBLE_ROWS) * VISIBLE_ROWS;
      stacks.slice(windowStart, windowStart + VISIBLE_ROWS).forEach((stack, offset) => {
        const index = windowStart + offset;
        const item = model.items.get(stack.itemId);
        if (item === undefined) {
          return; // Defensive: rows always resolve at assembly time.
        }
        const active = index === this.selection;
        const equipped = isEquipped(model.inventory, item.id);
        if (active) {
          addPixelSelection(this.scene, this.container, {
            x: panelLeft + PADDING,
            y: listTop + offset * ROW_HEIGHT - 2,
            width: PANEL_WIDTH - PADDING * 2,
            height: ROW_HEIGHT,
          });
        }
        const line = this.scene.add
          .text(
            panelLeft + PADDING + 6,
            listTop + offset * ROW_HEIGHT,
            `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${stackLineText(item, stack.quantity, equipped)}`,
            {
              fontFamily: UI.fontFamily,
              fontSize: uiFontSize(13),
              color: equipped ? UI.rowEquipped : active ? UI.rowActive : UI.rowIdle,
            },
          )
          .setOrigin(0, 0);
        this.container.add(line);
      });
      if (windowStart + VISIBLE_ROWS < stacks.length) {
        const moreText = this.scene.add
          .text(panelLeft + PADDING + 6, listTop + VISIBLE_ROWS * ROW_HEIGHT, LABELS.stacksHidden, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(11),
            color: UI.textMuted,
          })
          .setOrigin(0, 0);
        this.container.add(moreText);
      }
    }

    // Selected item description (data text) and action hint.
    const detailTop = listTop + (VISIBLE_ROWS + 1) * ROW_HEIGHT + 6;
    const selectedStack = stacks[this.selection];
    const selectedItem =
      selectedStack === undefined ? undefined : model.items.get(selectedStack.itemId);
    if (selectedItem !== undefined) {
      const detailText = this.scene.add
        .text(panelLeft + PADDING, detailTop, selectedItem.description, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textMuted,
          wordWrap: { width: contentWidth },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      this.container.add(detailText);

      const actionText = this.scene.add
        .text(
          panelLeft + PANEL_WIDTH - PADDING,
          detailTop + detailText.height + 8,
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
    if (this.status !== null) {
      const statusText = this.scene.add
        .text(panelLeft + PADDING, panelTop + PANEL_HEIGHT - 44, this.status, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textWarn,
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0, 0);
      this.container.add(statusText);
    }

    const hintText = this.scene.add
      .text(panelLeft + PANEL_WIDTH - PADDING, panelTop + PANEL_HEIGHT - 20, LABELS.selectHint, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textMuted,
      })
      .setOrigin(1, 1);
    this.container.add(hintText);
  }
}
