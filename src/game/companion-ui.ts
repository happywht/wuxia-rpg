import Phaser from 'phaser';
import { paginateDialogueBlocks, wrapDialogueText } from './dialogue-layout';

import { resolveCompanionStance, type CompanionData } from '../engine/companion-system';
import { projectKnowledgeProgress, type KnowledgeNodeData } from '../engine/knowledge-graph';
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
  knowledgeTitles?: ReadonlyMap<string, string>;
  knowledgeNodes?: ReadonlyMap<string, KnowledgeNodeData>;
  playerKnownNodeIds?: ReadonlySet<string>;
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
  private page = 0;
  private pageCount = 1;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1200).setVisible(false);
  }

  get isOpen(): boolean { return this.openState; }

  open(model: CompanionPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.page = 0;
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
    for (const [code, delta] of [[Phaser.Input.Keyboard.KeyCodes.PAGE_UP, -1], [Phaser.Input.Keyboard.KeyCodes.PAGE_DOWN, 1]] as const) {
      const key = keyboard.addKey(code);
      const handler = (): void => {
        const next = Math.max(0, Math.min(this.pageCount - 1, this.page + delta));
        if (next === this.page) return;
        this.page = next;
        this.render();
      };
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
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
    const height = Math.min(420, this.scene.scale.height - 56);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.88);
    this.addText(left + 26, top + 20, '同行伙伴', 20, UI_PALETTE.accent);
    const contentWidth = Math.max(1, width - 92);
    const legend = this.addText(left + 32, top + 54, '', 12, UI_PALETTE.muted);
    legend.setText(wrapDialogueText('T 与同行者交谈 · Enter 暂离 · P / Esc 收起', contentWidth, value => legend.context.measureText(value).width).join('\n'));
    const bodyTop = top + 54 + legend.height + 18;
    const footerTop = top + height - Math.ceil(Number.parseFloat(uiFontSize(11)) * 1.5) - 18;
    const body = this.addText(left + 32, bodyTop, '', 12, UI_PALETTE.text);
    body.setText('测');
    const baseLineHeight = Math.max(body.height, Number.parseFloat(uiFontSize(12)));
    const lineHeight = Math.ceil(baseLineHeight + 4);
    body.setLineSpacing?.(lineHeight - baseLineHeight);
    const measure = (value: string): number => body.context.measureText(value).width;

    const entries = [...model.companions.values()];
    if (entries.length === 0) {
      body.setText('当前世界没有可用的伙伴资料。');
    }
    const blocks: string[] = [];
    for (const companion of entries) {
      const npcName = model.npcNames.get(companion.npcId) ?? companion.npcId;
      const active = model.activeCompanionId === companion.id;
      const stance = resolveCompanionStance(companion, { mapResourceId: model.mapResourceId,
        sharedKnowledgeNodeIds: model.social.npcKnowledge.get(companion.npcId) ?? new Set() });
      const support = stance.combatSupport.kind === 'attack'
        ? `每 ${stance.combatSupport.everyPlayerActions} 次成功行动造成 ${stance.combatSupport.power} 点援护伤害`
        : `每 ${stance.combatSupport.everyPlayerActions} 次成功行动恢复 ${stance.combatSupport.power} 点生命`;
      const memories = [...(model.social.npcKnowledge.get(companion.npcId) ?? [])].sort();
      const heard = memories.length === 0 ? '尚无已记录的见闻。'
        : `已知见闻 ${memories.length} 项：${memories.map(id => {
          const title = model.knowledgeTitles?.get(id) ?? id;
          const node = model.knowledgeNodes?.get(id);
          const progress = node !== undefined && model.playerKnownNodeIds !== undefined ? projectKnowledgeProgress(node, model.playerKnownNodeIds) : undefined;
          return progress === undefined ? title : `${title}【玩家：${progress.label}】`;
        }).join('、')}。`;
      blocks.push(`${active ? '◆ 同行' : '◇ 未同行'} ${npcName} · 关系 ${getRelationship(model.social, companion.npcId)}\n【${stance.label}】${stance.description}\n${active ? '同行时，' : '未同行，不触发援护；再次同行时，'}${support}。\n${heard}\n含人物原有知识与已相告内容；传话进度以自己的见闻和接收人回应为准。`);
    }
    const text = blocks.length ? blocks.join('\n\n') : '当前世界没有可用的伙伴资料。';
    const pages = paginateDialogueBlocks(wrapDialogueText(text, contentWidth, measure), Math.max(1, Math.floor((footerTop - bodyTop - 10) / lineHeight)));
    this.pageCount = pages.length;
    this.page = Math.min(this.page, pages.length - 1);
    body.setText(pages[this.page]!);
    this.addText(left + 32, footerTop, `第${this.page + 1}/${pages.length}页 · PgUp/PgDn 翻页`, 11, UI_PALETTE.accent);
  }

  private addText(x: number, y: number, text: string, size: number, color: string, align: 'left' | 'right' = 'left'): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(align === 'left' ? 0 : 1, 0);
    this.container.add(object);
    return object;
  }
}
