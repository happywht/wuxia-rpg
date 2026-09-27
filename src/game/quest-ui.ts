import Phaser from 'phaser';

import {
  type QuestData,
  type QuestAccessContext,
  type QuestJournal,
  type QuestStatus,
  type QuestUpdateResult,
  abandonQuest,
  acceptQuest,
  getQuestObjectiveProgress,
  hasQuestAccess,
  toggleTrackedQuest,
} from '../engine/quest-system';
import { uiFontSize } from './settings';
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
const ROW_HEIGHT = 25;
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
  abandon: 'A 放弃任务',
  hint: '↑/↓ 选择 · Enter 接取/跟踪 · A 放弃 · Esc 关闭',
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
}

export interface QuestPanelOptions {
  onClose?: () => void;
  onUpdate?: (update: QuestUpdateResult) => void;
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
  const objective = quest.objectives[0];
  if (objective === undefined) return `${quest.name}　［${LABELS.status.active}］`;
  const current = state.objectiveCounts.get(objective.id) ?? 0;
  return `${quest.name}　${current}/${objective.requiredCount}　［${LABELS.status.active}］`;
}

export class QuestPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private readonly onUpdate?: (update: QuestUpdateResult) => void;
  private model: QuestPanelModel | null = null;
  private selection = 0;
  private status: string | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, options: QuestPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.onUpdate = options.onUpdate;
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
      [KeyCodes.A, () => this.abandonSelected()],
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
    return [...model.quests.values()].filter((quest) => {
      if (model.giverNpcId !== undefined && quest.giverNpcId !== model.giverNpcId) return false;
      const status = model.journal.states.get(quest.id)?.status;
      if (status !== 'offered') return true; // Keep accepted tasks visible after leaving a faction.
        if (!hasQuestAccess(quest, model.access)) return false;
      return true;
    });
  }

  private moveSelection(delta: number): void {
    const rows = this.rows;
    if (rows.length === 0) return;
    this.selection = (this.selection + delta + rows.length) % rows.length;
    this.status = null;
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
    this.render();
  }

  private abandonSelected(): void {
    const model = this.model;
    const quest = this.selectedQuest();
    if (model === null || quest === undefined) return;
    const result = abandonQuest(model.journal, quest.id);
    this.status = result.ok ? `已放弃「${quest.name}」` : '只能放弃进行中的差事';
    if (result.ok) this.onUpdate?.(result.update);
    this.render();
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    this.container.removeAll(true);
    const rows = this.rows;
    this.selection = rows.length === 0 ? 0 : Math.min(this.selection, rows.length - 1);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const left = (width - PANEL_WIDTH) / 2;
    const top = (height - PANEL_HEIGHT) / 2;
    const contentWidth = PANEL_WIDTH - PADDING * 2;

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: left, y: top, width: PANEL_WIDTH, height: PANEL_HEIGHT },
      UI.overlayAlpha,
    );

    const isBoard = model.giverNpcId !== undefined;
    const title = isBoard
      ? `${LABELS.board} · ${model.giverName ?? ''}`
      : LABELS.journal;
    this.addText(title, left + PADDING, top + 16, 18, UI.warning);
    this.addText(isBoard ? '接取差事后可按 Q 随时查看日志' : '差事进度随物品、交谈与战斗自动更新',
      left + PADDING, top + 43, 11, UI.muted);

    const listTop = top + 72;
    if (rows.length === 0) {
      this.addText(isBoard ? LABELS.emptyBoard : LABELS.emptyJournal, left + PADDING, listTop, 13, UI.muted);
    } else {
      const windowStart = Math.floor(this.selection / VISIBLE_ROWS) * VISIBLE_ROWS;
      for (let offset = 0; offset < VISIBLE_ROWS; offset += 1) {
        const quest = rows[windowStart + offset];
        if (quest === undefined) break;
        const state = model.journal.states.get(quest.id);
        const active = windowStart + offset === this.selection;
        if (active) {
          addPixelSelection(this.scene, this.container, {
            x: left + PADDING,
            y: listTop + offset * ROW_HEIGHT - 2,
            width: PANEL_WIDTH - PADDING * 2,
            height: ROW_HEIGHT,
          });
        }
        this.addText(
          `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${questRow(model, quest)}`,
          left + PADDING,
          listTop + offset * ROW_HEIGHT,
          12,
          state === undefined ? UI.idle : statusColor(state.status),
        );
      }
    }

    const detailTop = listTop + VISIBLE_ROWS * ROW_HEIGHT + 10;
    const selected = rows[this.selection];
    if (selected === undefined) {
      this.addText(LABELS.noSelection, left + PADDING, detailTop, 12, UI.muted);
    } else {
      const state = model.journal.states.get(selected.id);
      const description = this.addWrappedText(
        selected.description,
        left + PADDING,
        detailTop,
        contentWidth,
        12,
        UI.primary,
      );
      let detailY = detailTop + Math.max(18, description.height) + 6;
      const objectiveLines = state === undefined
        ? []
        : getQuestObjectiveProgress(selected, state).map(({ objective, current }) =>
            `目标 ${current}/${objective.requiredCount}：${objective.text}`,
          );
      objectiveLines.forEach((line) => {
        const objective = this.addWrappedText(line, left + PADDING, detailY, contentWidth, 11, UI.muted);
        detailY += Math.max(16, objective.height) + 3;
      });
      this.addText(
        `${LABELS.reward}：${LABELS.experience} +${selected.rewards.experience} · ${LABELS.currency} +${selected.rewards.currency}`,
        left + PADDING,
        detailY + 2,
        11,
        UI.warning,
      );
      if (state?.status === 'active') {
        this.addText(
          model.journal.trackedQuestId === selected.id ? LABELS.untrack : LABELS.track,
          left + PADDING,
          detailY + 22,
          10,
          UI.muted,
        );
      }
    }

    if (this.status !== null) {
      this.addWrappedText(this.status, left + PADDING, top + PANEL_HEIGHT - 45, contentWidth - 150, 11, UI.warning);
    }
    this.addText(LABELS.hint, left + PANEL_WIDTH - PADDING, top + PANEL_HEIGHT - 18, 10, UI.muted, 'right');
  }

  private addText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      align,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
  }

  private addWrappedText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    color: string,
  ): Phaser.GameObjects.Text {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      wordWrap: { width: maxWidth },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(node);
    return node;
  }
}
