import Phaser from 'phaser';

import {
  type QuestData,
  type QuestAccessContext,
  type QuestJournal,
  type QuestStatus,
  type QuestUpdateResult,
  acceptQuest,
  hasQuestAccess,
  toggleTrackedQuest,
} from '../engine/quest-system';
import { uiFontSize } from './settings';
import { activeQuestProgressLabel, orderQuestRows } from './quest-presentation';
import { buildQuestDetailBlocks, buildQuestPanelGeometry, paginateQuestDetail, questFooterColumns } from './quest-panel-layout';
import {
  type QuestAbandonConfirmationState,
  buildAbandonConfirmationGeometry,
  buildFailedQuestTerminalBlocks,
  createQuestAbandonConfirmation,
  moveAbandonChoice,
  questSuccessorNames,
  submitAbandonConfirmation,
  turnAbandonPage,
} from './quest-abandon-confirmation';
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
  abandonTitle: '放弃「{name}」？',
  abandonKeep: '保持进行（默认）',
  abandonCommit: '永久放弃',
  abandonCommitLocked: '永久放弃（需先读完全部说明）',
  abandonHint: '↑/↓ 选择 · {pages}Enter 执行 · Esc 取消',
  abandonPageHint: 'PgDn 读说明 {page}/{count}页 · ',
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
  /** Round 140: live A-key abandon confirmation; null while no prompt shows. */
  private abandonPrompt: QuestAbandonConfirmationState | null = null;
  private abandonNotice: string | null = null;

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
    this.abandonPrompt = null;
    this.abandonNotice = null;
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
    this.abandonPrompt = null; // Q/close discards a pending prompt wholesale.
    this.abandonNotice = null;
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
      [KeyCodes.ESC, () => this.escape()],
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
    if (this.abandonPrompt !== null) { // While the prompt shows, ↑/↓ move its choice.
      moveAbandonChoice(this.abandonPrompt, delta);
      this.render();
      return;
    }
    const rows = this.rows;
    if (rows.length === 0) return;
    this.selection = (this.selection + delta + rows.length) % rows.length;
    this.status = null;
    this.detailPage = 0; // Round 119: a new row starts its detail from page one.
    this.render();
  }

  /** Round 119: PageUp/PageDown walk the selected row's detail pages linearly. */
  private turnDetailPage(step: number): void {
    if (this.abandonPrompt !== null) { // …or the prompt's own body pages.
      turnAbandonPage(this.abandonPrompt, step);
      this.render();
      return;
    }
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
    if (this.abandonPrompt !== null) { // Enter on the prompt: default cancel, explicit Confirm commits.
      this.confirmAbandonPrompt();
      return;
    }
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
    if (this.abandonPrompt !== null) return; // Navigation stays disabled while the prompt shows.
    const quest = this.selectedQuest();
    if (quest === undefined || this.onNavigateQuest === undefined) return;
    const outcome = this.onNavigateQuest(quest.id);
    if (!outcome.ok) {
      this.status = outcome.message;
      this.render();
    }
  }

  /**
   * Round 140: A on an active quest opens a measured confirmation prompt
   * (default cancel) instead of failing the quest outright. A while the
   * prompt already shows is a no-op — repeated presses never confirm.
   */
  private abandonSelected(): void {
    if (this.abandonPrompt !== null) return;
    const model = this.model;
    const quest = this.selectedQuest();
    if (model === null || quest === undefined) return;
    if (model.journal.states.get(quest.id)?.status !== 'active') {
      this.status = '只能放弃进行中的差事';
      this.render();
      return;
    }
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildAbandonConfirmationGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(16),
      bodyLineHeight: lineSize(12),
      choiceHeight: lineSize(13),
      hintHeight: lineSize(10),
    });
    // Same font-synced probe contract as the panel: the measuring Text lives
    // on the container, so the re-render below reclaims it.
    const probe = this.addText('', -400, -400, 12, UI.muted);
    this.abandonPrompt = createQuestAbandonConfirmation({
      quest,
      successorNames: questSuccessorNames(model.quests, model.journal, quest.id),
      width: geometry.contentWidth,
      capacity: geometry.bodyCapacity,
      measure: (text) => probe.context.measureText(text).width,
    });
    this.abandonNotice = null;
    this.status = null;
    this.render();
  }

  /** Esc: cancel a pending prompt but keep the journal panel open; else close. */
  private escape(): void {
    if (this.abandonPrompt !== null) {
      this.abandonPrompt = null;
      this.abandonNotice = null;
      this.render();
      return;
    }
    this.close();
  }

  /**
   * Enter on the prompt. Cancel simply drops it; Confirm must have read every
   * body page, then the pure submit revalidates the stored quest id and its
   * active status through abandonQuest — firing onUpdate exactly once.
   */
  private confirmAbandonPrompt(): void {
    const prompt = this.abandonPrompt!;
    const model = this.model!;
    const outcome = submitAbandonConfirmation(prompt, model.journal);
    if (outcome.kind === 'not-read') {
      this.abandonNotice = `请先用 PgDn 读完全部说明（第${prompt.page + 1}/${prompt.bodyPages.length}页）`;
      this.render();
      return;
    }
    const name = prompt.questName;
    const questId = prompt.questId;
    this.abandonPrompt = null;
    this.abandonNotice = null;
    if (outcome.kind === 'abandoned') {
      this.status = `已放弃「${name}」，此差事永久失败`;
      this.onUpdate?.(outcome.update);
    } else if (outcome.kind === 'stale') {
      this.status = `「${name}」已不在进行中，本次未放弃`;
    } else {
      this.status = `已保留「${name}」，差事仍在进行`;
    }
    this.selection = Math.max(0, this.rows.findIndex(row => row.id === questId));
    this.detailPage = 0; // The row's terminal detail restarts from page one.
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
      // Round 140: a failed row additionally explains its terminal state and
      // the other open work, without ever promising the original retry.
      const blocks = buildQuestDetailBlocks(selected, state, {
        factionNames: model.factionNames,
        knowledgeNodeTitles: model.knowledgeNodeTitles,
      }, model.itemCounts);
      if (state?.status === 'failed') {
        blocks.push(...buildFailedQuestTerminalBlocks({
          quest: selected,
          offeredQuestNames: [...model.quests.values()]
            .filter(other => other.id !== selected.id
              && model.journal.states.get(other.id)?.status === 'offered'
              && hasQuestAccess(other, model.access))
            .map(other => other.name),
        }));
      }
      const pages = paginateQuestDetail(
        blocks,
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

    if (this.abandonPrompt !== null) this.renderAbandonPrompt();
  }

  /**
   * Round 140: the abandon confirmation rides on top of the open panel as an
   * opaque sub-panel: measured title, the prompt's current body page, the two
   * choice rows (default cancel highlighted) and a hint/notice line. The
   * underlying journal stays visible around it and untouched.
   */
  private renderAbandonPrompt(): void {
    const prompt = this.abandonPrompt;
    if (prompt === null) return;
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildAbandonConfirmationGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(16),
      bodyLineHeight: lineSize(12),
      choiceHeight: lineSize(13),
      hintHeight: lineSize(10),
    });
    const probeTitle = this.addText('', -400, -400, 16, UI.muted);
    const probeLegend = this.addText('', -400, -400, 10, UI.muted);
    const measureTitle = (text: string) => probeTitle.context.measureText(text).width;
    const measureLegend = (text: string) => probeLegend.context.measureText(text).width;

    addPixelPanelChrome(this.scene, this.container, {
      x: geometry.left,
      y: geometry.top,
      width: geometry.width,
      height: geometry.height,
    });

    const title = LABELS.abandonTitle.replace('{name}', prompt.questName);
    const titleText = this.addText(title, geometry.left + PADDING, geometry.top + 16, 16, UI.warning);
    titleText.setText(this.fitGrapheme(title, geometry.contentWidth, measureTitle));

    this.addText(prompt.bodyPages[prompt.page] ?? '', geometry.left + PADDING, geometry.bodyTop, 12, UI.primary);

    const choices = [
      {
        selected: prompt.choice === 'cancel',
        label: LABELS.abandonKeep,
        color: prompt.choice === 'cancel' ? UI.active : UI.idle,
      },
      {
        selected: prompt.choice === 'confirm',
        label: prompt.readAllPages ? LABELS.abandonCommit : LABELS.abandonCommitLocked,
        color: UI.failed,
      },
    ];
    choices.forEach((choice, index) => {
      const y = geometry.choiceTop + index * lineSize(13);
      if (choice.selected) {
        addPixelSelection(this.scene, this.container, {
          x: geometry.left + PADDING,
          y: y - 2,
          width: geometry.width - PADDING * 2,
          height: lineSize(13),
        });
      }
      this.addText(
        `${choice.selected ? CURSOR_ACTIVE : CURSOR_IDLE}${choice.label}`,
        geometry.left + PADDING,
        y,
        13,
        choice.color,
      );
    });

    const notice = this.abandonNotice;
    // Compact page label: the full "PgDn/PgUp" legend measured past the body
    // width at the max font scale, which truncated the Esc leg mid-string.
    const pagesLabel = prompt.bodyPages.length > 1
      ? LABELS.abandonPageHint
        .replace('{page}', String(prompt.page + 1))
        .replace('{count}', String(prompt.bodyPages.length))
      : '';
    const foot = notice ?? LABELS.abandonHint.replace('{pages}', pagesLabel);
    const footText = this.addText(
      foot,
      geometry.left + geometry.width - PADDING,
      geometry.hintTop,
      10,
      notice === null ? UI.muted : UI.warning,
      'right',
    );
    footText.setText(this.fitGrapheme(foot, geometry.contentWidth, measureLegend));
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
