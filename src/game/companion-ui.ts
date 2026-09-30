import Phaser from 'phaser';
import { wrapDialogueText } from './dialogue-layout';

import { resolveCompanionStance, type CompanionData } from '../engine/companion-system';
import type { SocialState } from '../engine/social-state';
import { getRelationship } from '../engine/social-state';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface CompanionPanelModel {
  companions: ReadonlyMap<string, CompanionData>;
  activeCompanionId: string | null;
  npcNames: ReadonlyMap<string, string>;
  social: Readonly<SocialState>;
  mapResourceId: string;
  onDismiss: () => void;
  onTalk: () => void;
}

type PanelBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Compact, data-driven roster and dismissal panel (P / Esc closes). */
export class CompanionPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelBinding[] = [];
  private readonly onClose?: () => void;
  private model: CompanionPanelModel | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1200).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: CompanionPanelModel): void {
    if (this.openState) return;
    this.model = model;
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
    const closeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const closeHandler = (): void => this.close();
    closeKey.on('down', closeHandler);
    this.bindings.push({ key: closeKey, handler: closeHandler });
    const dismissKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const dismissHandler = (): void => {
      const model = this.model;
      if (model?.activeCompanionId === null || model?.activeCompanionId === undefined) return;
      model.onDismiss();
      this.close();
    };
    dismissKey.on('down', dismissHandler);
    this.bindings.push({ key: dismissKey, handler: dismissHandler });
    const talkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    const talkHandler = (): void => {
      const model = this.model;
      if (!model?.activeCompanionId) return;
      this.close();
      model.onTalk();
    };
    talkKey.on('down', talkHandler);
    this.bindings.push({ key: talkKey, handler: talkHandler });
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const width = Math.min(660, this.scene.scale.width - 56);
    const height = Math.min(370, this.scene.scale.height - 56);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.88);
    this.addText(left + 26, top + 20, '同行伙伴', 20, UI_PALETTE.accent);
    this.addText(left + 28, top + 54, 'T 与同行者交谈 · Enter 暂离 · P / Esc 收起', 12, UI_PALETTE.muted);

    const entries = [...model.companions.values()];
    if (entries.length === 0) {
      this.addText(left + 32, top + 100, '当前世界没有可用的伙伴资料。', 14, UI_PALETTE.muted);
      return;
    }
    let y = top + 100;
    for (const companion of entries) {
      const npcName = model.npcNames.get(companion.npcId) ?? companion.npcId;
      const active = model.activeCompanionId === companion.id;
      const stance = resolveCompanionStance(companion, { mapResourceId: model.mapResourceId,
        sharedKnowledgeNodeIds: model.social.npcKnowledge.get(companion.npcId) ?? new Set() });
      const support = stance.combatSupport.kind === 'attack'
        ? `每 ${stance.combatSupport.everyPlayerActions} 次成功行动造成 ${stance.combatSupport.power} 点援护伤害`
        : `每 ${stance.combatSupport.everyPlayerActions} 次成功行动恢复 ${stance.combatSupport.power} 点生命`;
      this.addText(left + 32, y, `${active ? '◆ 同行　' : '◇ 可邀　'}${npcName}　·　关系 ${getRelationship(model.social, companion.npcId)}`, 14, active ? UI_PALETTE.jade : UI_PALETTE.text);
      y += 24;
      const detail = this.scene.add.text(left + 50, y, `【${stance.label}】${stance.description} ${support}。`, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: uiFontSize(12),
        color: UI_PALETTE.muted,
        wordWrap: { width: width - 92 },
      }).setOrigin(0, 0);
      detail.setText(wrapDialogueText(detail.text, width - 92, value => detail.context.measureText(value).width).join('\n'));
      this.container.add(detail);
      y += Math.max(28, detail.height) + 18;
    }
    if (model.activeCompanionId !== null) {
      this.addText(left + width - 28, top + height - 25, 'T 交谈 · Enter 暂离 · P / Esc 收起', 11, UI_PALETTE.accent, 'right');
    }
  }

  private addText(x: number, y: number, text: string, size: number, color: string, align: 'left' | 'right' = 'left'): void {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(align === 'left' ? 0 : 1, 0);
    this.container.add(object);
  }
}
