import Phaser from 'phaser';

import { checkMeridianEligibility, type MeridianSetData } from '../engine/meridian-system';
import type { CharacterState } from '../engine/character-progression';
import type { InventoryState, ItemRecordData } from '../engine/item-system';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface MeridianPanelModel {
  set: MeridianSetData;
  character: CharacterState;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
  onUnlock: (nodeId: string) => { ok: boolean; message: string };
}

type Binding = { key: Phaser.Input.Keyboard.Key; handler: () => void };
const VISIBLE_ROWS = 8;

/** Data-driven cultivation overlay. All node labels, costs and effects come from loaded game data. */
export class MeridianPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: Binding[] = [];
  private readonly onClose?: () => void;
  private model: MeridianPanelModel | null = null;
  private openState = false;
  private selection = 0;
  private notice: string | null = null;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1280).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: MeridianPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.selection = 0;
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
      [codes.ENTER, () => this.unlock()], [codes.ESC, () => this.close()],
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
    const nodes = this.model?.set.nodes ?? [];
    if (nodes.length === 0) return;
    this.selection = (this.selection + delta + nodes.length) % nodes.length;
    this.notice = null;
    this.render();
  }

  private unlock(): void {
    const model = this.model;
    const node = model?.set.nodes[this.selection];
    if (model === null || model === undefined || node === undefined) return;
    const outcome = model.onUnlock(node.id);
    this.notice = outcome.message;
    this.render();
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    this.container.removeAll(true);
    const left = 58;
    const top = 38;
    const width = 844;
    const height = 464;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.9);
    this.addText('经脉内修', left + 24, top + 18, 21, UI_PALETTE.accent);
    this.addText(`修为 ${model.character.cultivationPoints}　·　已通 ${model.character.unlockedMeridianNodeIds.length}/${model.set.nodes.length}`, left + width - 24, top + 24, 13, UI_PALETTE.jade, 'right');

    const listX = left + 22;
    const listY = top + 60;
    const listWidth = 270;
    const rowHeight = 42;
    const start = Math.max(0, Math.min(model.set.nodes.length - VISIBLE_ROWS, this.selection - Math.floor(VISIBLE_ROWS / 2)));
    for (let visible = 0; visible < VISIBLE_ROWS; visible += 1) {
      const index = start + visible;
      const node = model.set.nodes[index];
      if (node === undefined) break;
      const y = listY + visible * rowHeight;
      if (index === this.selection) addPixelSelection(this.scene, this.container, {
        x: listX, y: y - 3, width: listWidth, height: rowHeight - 2,
      });
      const unlocked = model.character.unlockedMeridianNodeIds.includes(node.id);
      this.addText(`${unlocked ? '●' : '○'} ${node.name}`, listX + 8, y + 2, 13, unlocked ? UI_PALETTE.jade : UI_PALETTE.text);
      this.addText(`等级 ${node.minimumLevel}　修为 ${node.pointCost}`, listX + 22, y + 21, 10, UI_PALETTE.muted);
    }

    const node = model.set.nodes[this.selection];
    const detailX = left + 318;
    const detailWidth = width - 344;
    if (node !== undefined) {
      this.addText(node.name, detailX, listY, 18, UI_PALETTE.accent);
      this.addWrapped(node.description, detailX, listY + 34, detailWidth, 12, UI_PALETTE.text);
      const effects: string[] = [];
      for (const [id, amount] of Object.entries(node.effects.attributes)) {
        if (amount > 0) effects.push(`${({ body: '体魄', force: '臂力', agility: '身法', insight: '悟性', resolve: '定力' } as Record<string, string>)[id] ?? id} +${amount}`);
      }
      if (node.effects.health > 0) effects.push(`气血上限 +${node.effects.health}`);
      if (node.effects.qi > 0) effects.push(`内力上限 +${node.effects.qi}`);
      this.addText(`效果：${effects.join('　·　')}`, detailX, listY + 86, 12, UI_PALETTE.jade);
      this.addText(`前置：${node.prerequisites.length === 0 ? '无' : node.prerequisites.map((id) => model.set.nodes.find((entry) => entry.id === id)?.name ?? id).join('、')}`, detailX, listY + 116, 11, UI_PALETTE.text);
      const costs = node.itemCosts.length === 0
        ? '材料：无'
        : `材料：${node.itemCosts.map((cost) => `${model.items.get(cost.itemId)?.name ?? cost.itemId} ×${cost.quantity}`).join('、')}`;
      this.addText(costs, detailX, listY + 141, 11, UI_PALETTE.text);
      const eligibility = checkMeridianEligibility({
        set: model.set,
        nodeId: node.id,
        level: model.character.level,
        cultivationPoints: model.character.cultivationPoints,
        unlockedNodeIds: model.character.unlockedMeridianNodeIds,
        inventory: model.inventory,
        items: model.items,
      });
      this.addWrapped(eligibility.available ? '可打通此穴位。' : eligibility.reason ?? '', detailX, listY + 174, detailWidth, 11, eligibility.available ? UI_PALETTE.jade : UI_PALETTE.muted);
    }
    if (this.notice !== null) this.addWrapped(this.notice, detailX, top + height - 76, detailWidth, 11, UI_PALETTE.accent);
    this.addText('↑/↓ 或 W/S 选穴　·　Enter 打通　·　N / Esc 收起', left + width - 24, top + height - 24, 11, UI_PALETTE.accent, 'right');
  }

  private addWrapped(text: string, x: number, y: number, width: number, size: number, color: string): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width },
      lineSpacing: 4,
    });
    this.container.add(node);
  }

  private addText(text: string, x: number, y: number, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
  }
}
