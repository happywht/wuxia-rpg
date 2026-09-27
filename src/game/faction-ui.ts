import Phaser from 'phaser';

import type { FactionData } from '../engine/character-progression';
import type { FactionMembership } from '../engine/faction-system';
import type { QuestData } from '../engine/quest-system';
import { getFactionRenown, type SocialState } from '../engine/social-state';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface FactionPanelModel {
  factions: ReadonlyMap<string, FactionData>;
  membership: FactionMembership | null;
  social: Readonly<SocialState>;
  npcNames: ReadonlyMap<string, string>;
  quests: ReadonlyMap<string, QuestData>;
}

type PanelBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

const ATTRIBUTE_NAMES: Record<string, string> = {
  body: '体魄',
  force: '力道',
  agility: '身法',
  insight: '悟性',
  resolve: '定力',
};

/** Read-only school/lineage dossier; rules and world content come from JSON. */
export class FactionPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelBinding[] = [];
  private readonly onClose?: () => void;
  private model: FactionPanelModel | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(1200).setVisible(false);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(model: FactionPanelModel): void {
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
    const key = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const handler = (): void => this.close();
    key.on('down', handler);
    this.bindings.push({ key, handler });
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    const width = Math.min(820, this.scene.scale.width - 56);
    const height = Math.min(452, this.scene.scale.height - 56);
    const left = (this.scene.scale.width - width) / 2;
    const top = (this.scene.scale.height - height) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.86);
    this.addText(left + 28, top + 18, '师门与拜师', 20, UI_PALETTE.accent);
    this.addText(left + 30, top + 52, '与师父交谈可申请拜师或依门规退门；J / Esc 收起。', 12, UI_PALETTE.muted);

    const membership = model.membership;
    if (membership !== null) {
      const current = model.factions.get(membership.factionId);
      const masterName = model.npcNames.get(membership.masterNpcId) ?? membership.masterNpcId;
      if (current !== undefined) {
        this.addText(left + 30, top + 88, `当前身份：${current.name}弟子 · 师从${masterName}`, 14, UI_PALETTE.jade);
      } else {
        this.addText(left + 30, top + 88, `当前师门资料暂不可用（${membership.factionId}）`, 14, UI_PALETTE.jade);
      }
    } else {
      this.addText(left + 30, top + 88, '当前尚无门派；以下为已登记门派与入门条件。', 14, UI_PALETTE.jade);
    }
    this.addText(
      left + 30,
      top + 110,
      `个人行声：善恶 ${this.signed(model.social.morality)} · 江湖声望 ${model.social.renown}/1000`,
      12,
      UI_PALETTE.muted,
    );

    let y = top + 137;
    const factions = [...model.factions.values()];
    if (factions.length === 0) {
      this.addWrapped('当前没有有效门派资料。', left + 30, y, width - 60, 13, UI_PALETTE.muted);
      return;
    }
    for (const faction of factions) {
      const isCurrent = membership?.factionId === faction.id;
      const mentors = faction.mentorNpcIds.map((id) => model.npcNames.get(id) ?? id);
      const admission = this.admissionSummary(faction, model);
      const factionRenown = getFactionRenown(model.social, faction.id);
      const departure = faction.departure.allowed
        ? `退门代价：善恶 ${this.signed(faction.departure.moralityDelta)}、江湖声望 ${this.signed(faction.departure.renownDelta)}、本门声望 ${this.signed(faction.departure.factionRenownDelta)}；${faction.departure.forgetFactionMartialArts ? '遗忘本门武学' : '保留已学武学'}`
        : '退门：门规不许';
      const heading = `${isCurrent ? '◆ ' : '◇ '}${faction.name}${mentors.length > 0 ? ` · 师父：${mentors.join('、')}` : ' · 暂无登记师父'}`;
      this.addText(left + 30, y, heading, 13, isCurrent ? UI_PALETTE.accent : UI_PALETTE.text);
      y += 24;
      const detail = `本门声望：${factionRenown}/1000。入门：${admission}。${departure}。`;
      const node = this.addWrapped(detail, left + 48, y, width - 88, 11, UI_PALETTE.muted);
      y += Math.max(28, node.height) + 13;
    }
  }

  private admissionSummary(faction: FactionData, model: FactionPanelModel): string {
    const admission = faction.admission;
    const requirements: string[] = [];
    if (admission.minimumLevel !== undefined) requirements.push(`等级≥${admission.minimumLevel}`);
    for (const [id, value] of Object.entries(admission.minimumAttributes)) {
      requirements.push(`${ATTRIBUTE_NAMES[id] ?? id}≥${value}`);
    }
    if (admission.minimumMorality !== undefined || admission.maximumMorality !== undefined) {
      requirements.push(`善恶 ${admission.minimumMorality ?? '无下限'}～${admission.maximumMorality ?? '无上限'}`);
    }
    if (admission.minimumRenown !== undefined) requirements.push(`声望≥${admission.minimumRenown}`);
    if (admission.minimumFactionRenown !== undefined) {
      requirements.push(`本门声望≥${admission.minimumFactionRenown}`);
    }
    if (admission.minimumTeacherRelationship !== undefined) {
      requirements.push(`师父关系≥${admission.minimumTeacherRelationship}`);
    }
    for (const questId of admission.requiredQuestIds) {
      requirements.push(`完成「${model.quests.get(questId)?.name ?? questId}」`);
    }
    return requirements.length > 0 ? requirements.join('、') : '无额外条件';
  }

  private signed(value: number): string {
    return `${value >= 0 ? '+' : ''}${value}`;
  }

  private addText(x: number, y: number, text: string, size: number, color: string): void {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
    }).setOrigin(0, 0);
    this.container.add(object);
  }

  private addWrapped(text: string, x: number, y: number, width: number, size: number, color: string): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      color,
      wordWrap: { width },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(object);
    return object;
  }
}
