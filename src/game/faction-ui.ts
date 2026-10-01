import Phaser from 'phaser';

import type { CharacterState, FactionData, MartialArtData } from '../engine/character-progression';
import { projectFactionAdmissions } from '../engine/faction-admission-preview';
import type { FactionMembership } from '../engine/faction-system';
import type { QuestData, QuestJournal } from '../engine/quest-system';
import { getFactionRenown, type SocialState } from '../engine/social-state';
import { uiFontSize } from './settings';
import {
  buildDossierGeometry,
  buildDossierIdentityBlocks,
  buildFactionBlock,
  paginateFactionDossier,
} from './faction-panel-layout';
import { addPixelPanelChrome, UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

export interface FactionPanelModel {
  factions: ReadonlyMap<string, FactionData>;
  membership: FactionMembership | null;
  social: Readonly<SocialState>;
  npcNames: ReadonlyMap<string, string>;
  /** Data-derived region name per assembled NPC id (Round 64 dossier). */
  npcRegionNames?: ReadonlyMap<string, string>;
  quests: ReadonlyMap<string, QuestData>;
  character?: Readonly<CharacterState> | null;
  journal?: Readonly<QuestJournal>;
  martialArts?: ReadonlyMap<string, MartialArtData>;
}

type PanelBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

/** Read-only school/lineage dossier; rules and world content come from JSON. */
export class FactionPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelBinding[] = [];
  private readonly onClose?: () => void;
  private model: FactionPanelModel | null = null;
  private openState = false;
  /** Round 121: complete measured dossier pages. */
  private detailPages: string[] = [''];
  private detailPage = 0;

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
      [codes.ESC, () => this.close()],
      [codes.PAGE_UP, () => this.turnDetailPage(-1)],
      [codes.PAGE_DOWN, () => this.turnDetailPage(1)],
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

  /** Round 121: PageUp/PageDown walk the dossier linearly; J/Esc unchanged. */
  private turnDetailPage(step: number): void {
    if (this.detailPages.length <= 1) return;
    const next = Math.min(this.detailPages.length - 1, Math.max(0, this.detailPage + step));
    if (next === this.detailPage) return;
    this.detailPage = next;
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const model = this.model;
    if (model === null) return;
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    // Round 121 (correction): dedicated LINEAR geometry — one fixed title, one
    // short mechanical instruction, then EVERYTHING (identity, social, every
    // faction block) pages through the whole remaining body. No row-list band,
    // so the reader cannot collapse to 1–2 lines beside unused rows.
    const geometry = buildDossierGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(20),
      instructionHeight: lineSize(11),
      bodyLineHeight: lineSize(12),
      statusHeight: lineSize(10),
      hintHeight: lineSize(10),
      maxWidth: 820,
      maxHeight: 452,
      padding: 30,
    });
    // Font-synced probes measure at each real glyph size (Round 119 pattern).
    const probe = (size: number) => this.addText('', -500, -500, size, UI_PALETTE.muted);
    const measureAt = (p: Phaser.GameObjects.Text) => (text: string): number => p.context.measureText(text).width;
    const measure = measureAt(probe(12));
    const measureLegend = measureAt(probe(10));
    const { left, top, width, height, contentWidth } = geometry;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width, height }, 0.86);
    this.addText('师门与拜师', left + 28, top + 18, 20, UI_PALETTE.accent);
    this.addText('与师父交谈可申请拜师或退门；PgUp/PgDn 翻档案。', left + 30, top + 18 + lineSize(20) + 6, 11, UI_PALETTE.muted);

    const membership = model.membership;
    // The identity line joins the paged body VERBATIM — a long MOD name wraps,
    // every master's name survives, nothing is ellipsized.
    const identityText = membership !== null
      ? (() => {
          const current = model.factions.get(membership.factionId);
          const masterName = model.npcNames.get(membership.masterNpcId) ?? membership.masterNpcId;
          return current !== undefined
            ? `当前身份：${current.name}弟子 · 师从${masterName}`
            : `当前师门资料暂不可用（${membership.factionId}）`;
        })()
      : '当前尚无门派；以下为已登记门派与入门条件。';
    const socialLine = `个人行声：善恶 ${this.signed(model.social.morality)} · 江湖声望 ${model.social.renown}/1000`;

    const factions = [...model.factions.values()];
    const admissionPreviews = model.character === undefined || model.journal === undefined || model.martialArts === undefined
      ? new Map() : projectFactionAdmissions({ ...model, character: model.character, journal: model.journal, martialArts: model.martialArts });
    const factionBlocks = factions.length === 0
      ? ['当前没有有效门派资料。']
      : factions.map(faction => buildFactionBlock({
          faction,
          isCurrent: membership?.factionId === faction.id,
          mentorLabels: faction.mentorNpcIds.map(id => {
            const name = model.npcNames.get(id) ?? id;
            const region = model.npcRegionNames?.get(id);
            // An unresolvable mentor keeps its name with a generic whereabouts
            // label — the dossier never hard-codes any place (Round 64).
            return region === undefined ? `${name}（行踪未详）` : `${name}（${region}）`;
          }),
          renown: getFactionRenown(model.social, faction.id),
          quests: model.quests,
          admissionPreview: admissionPreviews.get(faction.id),
        }));
    const blocks = [...buildDossierIdentityBlocks({ identityText, socialLine }), ...factionBlocks];
    const pages = paginateFactionDossier(blocks, contentWidth, geometry.bodyCapacity, measure);
    this.detailPages = pages;
    this.detailPage = Math.min(this.detailPage, pages.length - 1);
    this.addText(pages[this.detailPage] ?? '', left + 30, geometry.bodyTop, 12, UI_PALETTE.text);
    // Fixed accessible footer: paging state left, key legend right.
    if (this.detailPages.length > 1) {
      this.addText(`档案${this.detailPage + 1}/${this.detailPages.length}页 PgDn/PgUp`, left + 30, geometry.statusTop, 10, UI_PALETTE.muted);
    }
    const legend = this.fitGrapheme('J / Esc 收起', contentWidth, measureLegend);
    this.addText(legend, left + width - 28, geometry.hintTop, 10, UI_PALETTE.muted, 'right');
  }

  private signed(value: number): string {
    return `${value >= 0 ? '+' : ''}${value}`;
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

  private addText(text: string, x: number, y: number, size: number, color: string, align: 'left' | 'right' = 'left'): Phaser.GameObjects.Text {
    const object = this.scene.add.text(x, y, text, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: uiFontSize(size),
      lineSpacing: Math.ceil(Number.parseInt(uiFontSize(size), 10) * 0.4),
      color,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(object);
    return object;
  }
}
