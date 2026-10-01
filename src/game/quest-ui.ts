import Phaser from 'phaser';

import {
  type QuestData,
  type QuestAccessContext,
  type QuestJournal,
  type QuestStatus,
  type QuestUpdateResult,
  abandonQuest,
  acceptQuest,
  hasQuestAccess,
  toggleTrackedQuest,
} from '../engine/quest-system';
import { uiFontSize } from './settings';
import { activeQuestProgressLabel, orderQuestRows } from './quest-presentation';
import { buildQuestDetailBlocks, buildQuestPanelGeometry, paginateQuestDetail, questFooterColumns } from './quest-panel-layout';
import { addPixelPanelChrome, UI_FONT_FAMILY, addPixelSelection } from './ui-theme';

/** Generic data-driven quest board and journal overlay. */

const UI = {
  overlayFill: 0x06080d,
  overlayAlpha: 0.74,
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  primary: '#d8dee9',
  muted: '#8a94a6',
  warning: '#e8b04b',
  active: '#f0c96a',
  complete: '#a8d8b0',
  failed: '#e0a8a8',
  idle: '#a8b2c4',
  fontFamily: UI_FONT_FAMILY,
} as const;

const PADDING = 24;
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 440;
const VISIBLE_ROWS = 6;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';

const LABELS = {
  journal: '任务日志',
  board: '任务名录',
  emptyJournal: '还没有接下任何差事。按 Q 可随时查看任务日志。',
  emptyBoard: '眼下没有托付给你的差事。',
  status: {
    locked: '前置未完成',
    offered: '待接取',
    active: '进行中',
    completed: '已完成',
    failed: '已失败',
  } satisfies Record<QuestStatus, string>,
  reward: '报酬',
  experience: '经验',
  currency: '银两',
  accept: 'Enter 接取',
  track: 'Enter 跟踪此差事',
  untrack: 'Enter 取消跟踪',
  navigate: 'N 导航至目标',
  abandon: 'A 放弃任务',
  hint: '↑/↓ 选择 · Enter 接取/跟踪 · N 导航 · A 放弃 · Esc 关闭',
  noSelection: '选择一项差事查看详情。',
} as const;

export interface QuestPanelModel {
  quests: ReadonlyMap<string, QuestData>;
  journal: QuestJournal;
  /** Present when opened from a quest-giver NPC; omitted for Q journal. */
  giverNpcId?: string;
  giverName?: string;
  /** Current item quantities used to initialize collect goals on acceptance. */
  itemCounts: ReadonlyMap<string, number>;
  /** Current membership and discoveries for quest eligibility checks. */
  access: QuestAccessContext;
  factionNames?: ReadonlyMap<string, string>;
  knowledgeNodeTitles?: ReadonlyMap<string, string>;
}

export interface QuestPanelOptions {
  onClose?: () => void;
  onUpdate?: (update: QuestUpdateResult) => void;
  /**
   * Round 60 N-key navigation: resolves one active quest's next unfinished
   * spatial objective. The scene answers whether navigation started (the
   * journal panel then closes in favour of the world map) or returns a
   * readable reason to keep showing here.
   */
  onNavigateQuest?: (questId: string) => { ok: boolean; message: string };
}

type PanelKeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

function statusColor(status: QuestStatus): string {
  if (status === 'completed') return UI.complete;
  if (status === 'failed') return UI.failed;
  if (status === 'active') return UI.active;
  return UI.idle;
}

function questStatusText(model: QuestPanelModel, quest: QuestData): string {
  const status = model.journal.states.get(quest.id)?.status ?? 'locked';
  return LABELS.status[status];
}

function questRow(model: QuestPanelModel, quest: QuestData): string {
  const state = model.journal.states.get(quest.id);
  if (state?.status !== 'active') return `${quest.name}　［${questStatusText(model, quest)}］`;
  return `${quest.name}　${activeQuestProgressLabel(quest, state)}　［${LABELS.status.active}］`;
}

export class QuestPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private readonly onUpdate?: (update: QuestUpdateResult) => void;
  private readonly onNavigateQuest?: (questId: string) => { ok: boolean; message: string };
  private model: QuestPanelModel | null = null;
  private selection = 0;
  private status: string | null = null;
  private openState = false;
  /** Round 119: complete measured detail pages for the selected row. */
  private detailPages: string[] = [''];
  private detailPage = 0;

  constructor(scene: Phaser.Scene, options: QuestPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.onUpdate = options.onUpdate;
    this.onNavigateQuest = options.onNavigateQuest;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1200);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(model: QuestPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.selection = 0;
    this.status = null;
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
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [KeyCodes.UP, () => this.moveSelection(-1)],
      [KeyCodes.W, () => this.moveSelection(-1)],
      [KeyCodes.DOWN, () => this.moveSelection(1)],
      [KeyCodes.S, () => this.moveSelection(1)],
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.N, () => this.navigateSelected()],
      [KeyCodes.A, () => this.abandonSelected()],
      [KeyCodes.PAGE_UP, () => this.turnDetailPage(-1)],
      [KeyCodes.PAGE_DOWN, () => this.turnDetailPage(1)],
      [KeyCodes.ESC, () => this.close()],
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

  private get rows(): QuestData[] {
    const model = this.model;
    if (model === null) return [];
    const rows = [...model.quests.values()].filter((quest) => {
      if (model.giverNpcId !== undefined && quest.giverNpcId !== model.giverNpcId) return false;
      const status = model.journal.states.get(quest.id)?.status;
      if (status !== 'offered') return true; // Keep accepted tasks visible after leaving a faction.
      if (!hasQuestAccess(quest, model.access)) return false;
      return true;
    });
    return orderQuestRows(rows, model.journal);
  }

  private moveSelection(delta: number): void {
    const rows = this.rows;
    if (rows.length === 0) return;
    this.selection = (this.selection + delta + rows.length) % rows.length;
    this.status = null;
    this.detailPage = 0; // Round 119: a new row starts its detail from page one.
    this.render();
  }

  /** Round 119: PageUp/PageDown walk the selected row's detail pages linearly. */
  private turnDetailPage(step: number): void {
    if (this.detailPages.length <= 1) return;
    const next = Math.min(this.detailPages.length - 1, Math.max(0, this.detailPage + step));
    if (next === this.detailPage) return; // Already at an edge: no churn.
    this.detailPage = next;
    this.render();
  }

  private selectedQuest(): QuestData | undefined {
    return this.rows[this.selection];
  }

  private confirm(): void {
    const model = this.model;
    const quest = this.selectedQuest();
    if (model === null || quest === undefined) return;
    const state = model.journal.states.get(quest.id);
    if (state?.status === 'offered') {
      const result = acceptQuest(model.quests, model.journal, quest.id, model.itemCounts, model.access);
      if (!result.ok) {
        this.status = `无法接取：${result.reason}`;
        this.render();
        return;
      }
      this.status = result.update.failedQuestIds.length > 0
        ? `已接取「${quest.name}」，另一条岔路就此封止`
        : `已接取「${quest.name}」`;
      this.onUpdate?.(result.update);
    } else if (state?.status === 'active') {
      toggleTrackedQuest(model.journal, quest.id);
      this.status = model.journal.trackedQuestId === quest.id
        ? `正在跟踪「${quest.name}」`
        : `已取消跟踪「${quest.name}」`;
      this.onUpdate?.({ changed: true, completed: [], failedQuestIds: [] });
    } else if (state?.status === 'locked') {
      this.status = '前置差事尚未完成';
    } else {
      this.status = state?.status === 'completed' ? '这项差事已完成' : '这项差事已结束';
    }
    this.selection = Math.max(0, this.rows.findIndex(row => row.id === quest.id));
    this.detailPage = 0; // Acceptance/tracking changed the row's live detail.
    this.render();
  }

  /**
   * N key: hand the selected active quest to the scene's objective resolver.
   * A successful answer closes this panel (the world map takes over); a
   * failure keeps the panel open with the scene's readable reason.
   */
  private navigateSelected(): void {
    const quest = this.selectedQuest();
    if (quest === undefined || this.onNavigateQuest === undefined) return;
    const outcome = this.onNavigateQuest(quest.id);
    if (!outcome.ok) {
      this.status = outcome.message;
      this.render();
    }
  }

  private abandonSelected(): void {
    const model = this.model;
    const quest = this.selectedQuest();
    if (model === null || quest === undefined) return;
    const result = abandonQuest(model.journal, quest.id);
    this.status = result.ok ? `已放弃「${quest.name}」` : '只能放弃进行中的差事';
    if (result.ok) this.onUpdate?.(result.update);
    this.selection = Math.max(0, this.rows.findIndex(row => row.id === quest.id));
    this.detailPage = 0; // The abandoned row's detail restarts from page one.
    this.render();
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    this.container.removeAll(true);
    const rows = this.rows;
    this.selection = rows.length === 0 ? 0 : Math.min(this.selection, rows.length - 1);

    // Round 119 measured geometry: the panel fits the real canvas, every band
    // derives from live text heights, and the footer (hint + status) is
    // reserved from the bottom edge before rows and detail share the rest.
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const width = Math.min(PANEL_WIDTH, this.scene.scale.width - 40);
    const height = Math.min(PANEL_HEIGHT, this.scene.scale.height - 40);
    const left = Math.round((this.scene.scale.width - width) / 2);
    const top = Math.round((this.scene.scale.height - height) / 2);
    const geometry = buildQuestPanelGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(18),
      subtitleHeight: lineSize(11),
      rowHeight: lineSize(12) + 6,
      detailLineHeight: lineSize(12),
      statusHeight: lineSize(11),
      hintHeight: lineSize(10),
      maxVisibleRows: Math.min(VISIBLE_ROWS, Math.max(1, rows.length)),
    });
    // Font-synced probes: Phaser syncs a Text object's canvas context to its
    // own style on creation, so each probe measures at its real glyph size —
    // fitting a 10px legend with 12px metrics would truncate it unfairly.
    const probe = (size: number) => this.addText('', -400, -400, size, UI.muted);
    const measureAt = (p: Phaser.GameObjects.Text) => (text: string): number => p.context.measureText(text).width;
    const measure = measureAt(probe(12)); // Body: rows, detail, status.
    const measureTitle = measureAt(probe(18));
    const measureLegend = measureAt(probe(10));

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: left, y: top, width, height },
      UI.overlayAlpha,
    );

    const isBoard = model.giverNpcId !== undefined;
    const title = isBoard
      ? `${LABELS.board} · ${model.giverName ?? ''}`
      : LABELS.journal;
    const titleText = this.addText(title, left + PADDING, top + 16, 18, UI.warning);
    titleText.setText(this.fitGrapheme(title, geometry.contentWidth, measureTitle));
    this.addText(isBoard ? '接取差事后可按 Q 随时查看日志' : '差事进度随物品、交谈与战斗自动更新',
      left + PADDING, top + 16 + lineSize(18) + 6, 11, UI.muted);

    if (rows.length === 0) {
      this.addText(isBoard ? LABELS.emptyBoard : LABELS.emptyJournal, left + PADDING, geometry.listTop, 13, UI.muted);
    } else {
      const windowStart = geometry.visibleRows > 0
        ? Math.floor(this.selection / geometry.visibleRows) * geometry.visibleRows
        : 0;
      for (let offset = 0; offset < geometry.visibleRows; offset += 1) {
        const quest = rows[windowStart + offset];
        if (quest === undefined) break;
        const state = model.journal.states.get(quest.id);
        const active = windowStart + offset === this.selection;
        if (active) {
          addPixelSelection(this.scene, this.container, {
            x: left + PADDING,
            y: geometry.listTop + offset * geometry.rowHeight - 2,
            width: width - PADDING * 2,
            height: geometry.rowHeight,
          });
        }
        const label = `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${questRow(model, quest)}`;
        const rowText = this.addText(
          label,
          left + PADDING,
          geometry.listTop + offset * geometry.rowHeight,
          12,
          state === undefined ? UI.idle : statusColor(state.status),
        );
        // A MOD-flooded name keeps its readable head with an ellipsis here;
        // the full title stays in the detail body below.
        rowText.setText(this.fitGrapheme(label, geometry.contentWidth - 8, measure));
      }
    }

    const selected = rows[this.selection];
    const state = selected === undefined ? undefined : model.journal.states.get(selected.id);
    if (selected === undefined) {
      this.detailPages = [''];
      this.detailPage = 0;
      this.addText(LABELS.noSelection, left + PADDING, geometry.detailTop, 12, UI.muted);
    } else {
      // Complete lossless body: description, staged objectives (live stage
      // boundary for ordered quests, live inventory beside journal counts),
      // full rewards — wrapped at the measured width and paginated to the band.
      const pages = paginateQuestDetail(
        buildQuestDetailBlocks(selected, state, {
          factionNames: model.factionNames,
          knowledgeNodeTitles: model.knowledgeNodeTitles,
        }, model.itemCounts),
        geometry.contentWidth,
        geometry.detailCapacity,
        measure,
      );
      this.detailPages = pages;
      this.detailPage = Math.min(this.detailPage, pages.length - 1);
      this.addText(pages[this.detailPage] ?? '', left + PADDING, geometry.detailTop, 12, UI.primary);
    }

    // Fixed accessible bands: status on the left of its reserved line; the
    // paging state and the active-row action share the right end (the page
    // hint must survive the max font scale, so it never rides the legend);
    // the key legend keeps the bottom edge.
    const footerColumns = questFooterColumns(geometry.contentWidth);
    if (this.status !== null) {
      const statusText = this.addText(this.status, left + PADDING, geometry.statusTop, 11, UI.warning);
      statusText.setText(this.fitGrapheme(this.status, footerColumns.statusWidth, measure));
    }
    const trail: string[] = [];
    if (this.detailPages.length > 1) trail.push(`详情${this.detailPage + 1}/${this.detailPages.length}页 PgDn/PgUp`);
    if (state?.status === 'active') {
      const tracked = model.journal.trackedQuestId === selected!.id;
      trail.push(`${tracked ? LABELS.untrack : LABELS.track} · ${LABELS.navigate}`);
    }
    if (trail.length > 0) {
      const trailText = this.addText('', left + width - PADDING, geometry.statusTop, 10, UI.muted, 'right');
      trailText.setText(this.fitGrapheme(trail.join(' · '), footerColumns.trailWidth, measureLegend));
    }
    const hint = this.fitGrapheme(LABELS.hint, geometry.contentWidth, measureLegend);
    this.addText(hint, left + width - PADDING, geometry.hintTop, 10, UI.muted, 'right');
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

  private addText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): Phaser.GameObjects.Text {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      align,
      lineSpacing: Math.ceil(Number.parseInt(uiFontSize(fontSize), 10) * 0.4),
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
    return node;
  }
}
