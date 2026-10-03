/**
 * Round 09 pause menu overlay: opened with Escape while exploring, closed
 * with Escape or the "继续" entry. Pages:
 *
 * - main — continue / save to a slot / settings / return to the main menu;
 * - save — the three slots with their current summaries; Enter on an empty
 *   slot saves immediately behind a fresh storage read, while a non-empty
 *   slot (readable or damaged) first opens the Round 143 overwrite
 *   confirmation: exact slot label, name/level and old timestamp, default
 *   cancel, commit only after every body page was read and the slot's raw
 *   payload still matches the one captured at prompt time (the host supplies
 *   the capture so this class never touches gameplay state);
 * - settings — the same six persistent settings as the main menu (volume,
 *   text scale, movement layout, gamepad, high contrast, reduced motion,
 *   rendered and adjusted through the shared settings helpers), adjusted
 *   with Left/Right and applied immediately (volume bus, canvas contrast,
 *   every panel's font size through {@link uiFontSize});
 * - confirm-quit — an explicit confirm step before an unsaved run ends.
 *
 * While open the owning scene ignores movement input (`isOpen` is the
 * gate); keys are bound on open and unbound on close, matching every other
 * panel in this project. Since Round 41 the owning scene also routes
 * standard-gamepad press edges to {@link PauseMenuPanel.handleGamepadEdges}
 * while this panel owns the screen. Labels here are interface mechanics only.
 */

import Phaser from 'phaser';

import {
  SAVE_KEY_PREFIX,
  SAVE_SLOT_IDS,
  type SaveSlotId,
  SAVE_SLOT_LABELS,
  type SaveSlotSummary,
  formatSavedAt,
  listSaveSlots,
  type SaveStorage,
} from '../engine/save-system';
import {
  buildSaveOverwriteGeometry,
  createSaveOverwriteConfirmation,
  describeSaveOverwritePayload,
  moveSaveOverwriteChoice,
  type SaveOverwriteConfirmationState,
  turnSaveOverwritePage,
  truncateGrapheme,
  verifySaveOverwriteTarget,
} from './save-overwrite-confirmation';
import {
  DEFAULT_GAME_SETTINGS,
  type GameSettings,
  SETTINGS_ROW_COUNT,
  adjustGameSetting,
  applyGameSettings,
  saveGameSettings,
  settingsRows,
  uiFontSize,
} from './settings';
import type { StandardPadAction } from './input-settings';
import { layoutSaveSlotRows } from './save-slot-layout';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY } from './ui-theme';

const UI = {
  overlay: 0x000000,
  overlayAlpha: 0.55,
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  textActive: '#f0c96a',
  textIdle: '#a8b2c4',
  fontFamily: UI_FONT_FAMILY,
} as const;

const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';

/** Matches {@link buildSaveOverwriteGeometry}'s default padding. */
const OVERWRITE_PROMPT_PADDING = 24;

type PausePage = 'main' | 'save' | 'settings' | 'confirm-quit';

const MAIN_ENTRIES = [
  { id: 'continue', label: '继续游戏' },
  { id: 'save', label: '保存进度' },
  { id: 'settings', label: '设置' },
  { id: 'quit', label: '返回主菜单' },
] as const;

type MainEntryId = (typeof MAIN_ENTRIES)[number]['id'];

export interface PauseMenuPanelOptions {
  storage: SaveStorage | null;
  /**
   * Captures and writes the live run into one slot; returns readable
   * feedback. Round 143: only reached for an empty slot (behind a fresh
   * storage read) or after the overwrite confirmation committed — the panel
   * itself owns the guard, the callback keeps its atomic write semantics.
   */
  save: (slotId: SaveSlotId) => { ok: boolean; message: string };
  /** Invoked after the player confirmed leaving the run. */
  returnToMenu: () => void;
  /** Applies live presentation changes while the settings page is still open. */
  onSettingsChanged?: (settings: GameSettings) => void;
  /** Invoked after the panel closed by any path (the scene refreshes HUD here). */
  onClose?: () => void;
}

export class PauseMenuPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: { key: Phaser.Input.Keyboard.Key; handler: () => void }[] = [];
  private readonly options: PauseMenuPanelOptions;

  private page: PausePage = 'main';
  private selection = 0;
  /** Round 121: which page of the selected slot's (paged) label is read. */
  private slotLabelPage = 0;
  private feedback: string | null = null;
  private feedbackWarn = false;
  private openState = false;
  private slotSummaries: SaveSlotSummary[] = [];
  private slotsAvailable = false;
  private slotsMessage: string | null = null;
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  /** Round 143: live overwrite confirmation; null while no prompt shows. */
  private overwritePrompt: SaveOverwriteConfirmationState | null = null;
  private overwriteNotice: string | null = null;

  constructor(scene: Phaser.Scene, options: PauseMenuPanelOptions) {
    this.scene = scene;
    this.options = options;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(2000);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Opens the pause menu on its main page. */
  open(settings: GameSettings): void {
    if (this.openState) {
      return;
    }
    this.openState = true;
    this.settings = { ...settings };
    this.page = 'main';
    this.selection = 0;
    this.feedback = null;
    this.overwritePrompt = null; // Opening always starts without a pending confirmation.
    this.overwriteNotice = null;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  /** Closes the menu and releases the keyboard bindings. */
  close(): void {
    if (!this.openState) {
      return;
    }
    this.openState = false;
    this.overwritePrompt = null; // Closing discards a pending confirmation wholesale.
    this.overwriteNotice = null;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.options.onClose?.();
  }

  /** Destroys the panel for good (scene teardown). */
  destroy(): void {
    this.close();
    this.container.destroy();
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

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
      [KeyCodes.LEFT, () => this.adjustSetting(-1)],
      [KeyCodes.RIGHT, () => this.adjustSetting(1)],
      [KeyCodes.PAGE_UP, () => this.turnSlotLabelPage(-1)],
      [KeyCodes.PAGE_DOWN, () => this.turnSlotLabelPage(1)],
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.ESC, () => this.back()],
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

  private rowCount(): number {
    switch (this.page) {
      case 'main':
        return MAIN_ENTRIES.length;
      case 'save':
        return SAVE_SLOT_IDS.length;
      case 'settings':
        return SETTINGS_ROW_COUNT;
      case 'confirm-quit':
        return 2; // 确认 / 取消
    }
  }

  private moveSelection(delta: number): void {
    // Round 143: while the overwrite prompt shows, ↑/↓ move its choice.
    if (this.page === 'save' && this.overwritePrompt !== null) {
      moveSaveOverwriteChoice(this.overwritePrompt, delta);
      this.render();
      return;
    }
    const count = this.rowCount();
    if (count === 0) {
      return;
    }
    this.selection = (this.selection + delta + count) % count;
    // Round 121: a newly selected slot starts its paged label from page one.
    if (this.page === 'save') this.slotLabelPage = 0;
    this.render();
  }

  /** Round 121: on the save page, PageUp/PageDown read the selected label only. */
  private turnSlotLabelPage(step: number): void {
    if (this.page !== 'save') return;
    // Round 143: while the overwrite prompt shows, the keys read its body.
    if (this.overwritePrompt !== null) {
      turnSaveOverwritePage(this.overwritePrompt, step);
      this.overwriteNotice = null;
      this.render();
      return;
    }
    const row = this.slotRows[this.selection];
    if (row === undefined || row.pages.length <= 1) return;
    const next = Math.min(row.pages.length - 1, Math.max(0, this.slotLabelPage + step));
    if (next === this.slotLabelPage) return;
    this.slotLabelPage = next;
    this.render();
  }

  /** The last rendered save-page row layouts (paging facts for the key handler). */
  private slotRows: readonly { pages: readonly string[] }[] = [];

  private adjustSetting(delta: number): void {
    if (this.page === 'save' && this.overwritePrompt !== null) {
      turnSaveOverwritePage(this.overwritePrompt, delta);
      this.overwriteNotice = null;
      this.render();
      return;
    }
    if (this.page !== 'settings') {
      return;
    }
    // Shared with the main-menu settings page, so both always expose and
    // apply the identical rows and adjustment rules.
    const next = adjustGameSetting(this.settings, this.selection, delta);
    if (next === this.settings) {
      return; // Clamped no-op (volume at an end of its bar).
    }
    this.settings = next;
    applyGameSettings(this.scene.game, this.settings);
    if (this.options.storage !== null) {
      saveGameSettings(this.options.storage, this.settings);
    }
    this.options.onSettingsChanged?.({ ...this.settings });
    this.render();
  }

  /** The settings as last adjusted (the scene persists them for its own state). */
  currentSettings(): GameSettings {
    return { ...this.settings };
  }

  /**
   * Round 41 gamepad routing: the grid scene polls the pad while this panel
   * owns the screen and hands the press edges over. D-pad/stick up/down
   * moves the row, left/right adjusts the focused setting, A confirms and
   * B goes one page back — exactly the keyboard contract.
   */
  handleGamepadEdges(edges: StandardPadAction): void {
    if (!this.openState) {
      return;
    }
    if (edges.direction === 'up') this.moveSelection(-1);
    else if (edges.direction === 'down') this.moveSelection(1);
    else if (edges.direction === 'left') this.adjustSetting(-1);
    else if (edges.direction === 'right') this.adjustSetting(1);
    if (edges.confirm) this.confirm();
    if (edges.back) this.back();
  }

  private confirm(): void {
    switch (this.page) {
      case 'main': {
        const entry = MAIN_ENTRIES[this.selection];
        if (entry === undefined) {
          return;
        }
        this.activateMainEntry(entry.id);
        return;
      }
      case 'save': {
        // Round 143: Enter on the prompt itself (default cancel keeps the slot).
        if (this.overwritePrompt !== null) {
          this.confirmOverwritePrompt();
          return;
        }
        const slotId = SAVE_SLOT_IDS[this.selection];
        if (slotId === undefined) {
          return;
        }
        if (!this.slotsAvailable || this.options.storage === null) {
          this.setFeedback(this.slotsMessage ?? '浏览器本地存储不可用，无法保存', true);
          this.render();
          return;
        }
        // A fresh read decides emptiness: a slot filled since the summary was
        // listed still opens the confirmation instead of overwriting blind.
        let raw: string | null;
        try {
          raw = this.options.storage.read(`${SAVE_KEY_PREFIX}${slotId}`);
        } catch {
          this.refreshSlots();
          this.setFeedback('浏览器本地存储当前不可用，无法保存', true);
          this.render();
          return;
        }
        if (raw === null) {
          // Empty right now: save directly behind the read that proved it.
          const result = this.options.save(slotId);
          this.setFeedback(`${SAVE_SLOT_LABELS[slotId]}：${result.message}`, !result.ok);
          this.refreshSlots();
          this.render();
          return;
        }
        // Non-empty (readable or damaged): confirm first, write never yet.
        this.openOverwritePrompt(slotId, raw);
        return;
      }
      case 'settings':
        return; // Left/Right owns the settings page.
      case 'confirm-quit': {
        if (this.selection === 0) {
          this.close();
          this.options.returnToMenu();
        } else {
          this.back();
        }
        return;
      }
    }
  }

  private activateMainEntry(id: MainEntryId): void {
    if (id === 'continue') {
      this.close();
      return;
    }
    if (id === 'quit') {
      this.page = 'confirm-quit';
      this.selection = 1; // Default to 取消: leaving is the destructive step.
      this.setFeedback(null, false);
      this.render();
      return;
    }
    this.page = id; // 'save' | 'settings'
    this.selection = 0;
    this.slotLabelPage = 0; // Entering a page always starts its labels fresh.
    this.setFeedback(null, false);
    if (id === 'save') {
      this.refreshSlots();
      if (!this.slotsAvailable) {
        this.setFeedback(this.slotsMessage ?? '浏览器本地存储不可用，无法保存', true);
      }
    }
    this.render();
  }

  private back(): void {
    // Round 143: Esc cancels a pending overwrite confirmation but keeps the
    // save page open — the slot selection and its label page stay as they
    // were, so the player lands back on the exact row they were reading.
    if (this.page === 'save' && this.overwritePrompt !== null) {
      this.overwritePrompt = null;
      this.overwriteNotice = null;
      this.render();
      return;
    }
    if (this.page === 'main') {
      this.close();
      return;
    }
    this.page = 'main';
    this.selection = 0;
    this.slotLabelPage = 0;
    this.setFeedback(null, false);
    this.render();
  }

  private setFeedback(message: string | null, warn: boolean): void {
    this.feedback = message;
    this.feedbackWarn = warn;
  }

  private refreshSlots(): void {
    if (this.options.storage === null) {
      this.slotsAvailable = false;
      this.slotsMessage = '浏览器本地存储不可用，无法保存';
      this.slotSummaries = [];
      return;
    }
    const listing = listSaveSlots(this.options.storage);
    this.slotsAvailable = listing.ok;
    this.slotsMessage = listing.ok ? null : listing.message;
    this.slotSummaries = listing.slots;
  }

  // -------------------------------------------------------------------------
  // Round 143: save-overwrite confirmation
  // -------------------------------------------------------------------------

  /**
   * Enter on a non-empty slot (readable or damaged) opens the measured,
   * paginated confirmation bound to the exact slot id and the raw payload
   * just read. The default choice is cancel; nothing is written while the
   * prompt shows, and the slot selection/label page are left untouched so
   * cancelling lands back on the same row.
   */
  private openOverwritePrompt(slotId: SaveSlotId, raw: string): void {
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildSaveOverwriteGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(16),
      bodyLineHeight: lineSize(12),
      choiceHeight: lineSize(13),
      hintHeight: lineSize(10),
    });
    // Same font-synced probe contract as the save rows: the measuring Text
    // lives on the container, so the re-render below reclaims it.
    const probe = this.scene.add.text(-500, -500, '', { fontFamily: UI.fontFamily, fontSize: uiFontSize(12) });
    this.container.add(probe);
    this.overwritePrompt = createSaveOverwriteConfirmation({
      slotId,
      facts: describeSaveOverwritePayload(raw),
      rawPayload: raw,
      width: geometry.contentWidth,
      capacity: geometry.bodyCapacity,
      measure: (text) => probe.context.measureText(text).width,
    });
    this.overwriteNotice = null;
    this.setFeedback(null, false);
    this.render();
  }

  /**
   * Enter on the prompt. Cancel drops it back onto the same slot (and its
   * label page); Confirm must have read every body page, then re-reads the
   * exact slot key and compares the captured raw payload — any change or
   * storage error refuses the write, refreshes the slots and requires a new
   * confirmation. The pending state is cleared *before* the save callback
   * fires, so a repeated Enter can never write twice.
   */
  private confirmOverwritePrompt(): void {
    const prompt = this.overwritePrompt;
    if (prompt === null) {
      return;
    }
    if (prompt.choice === 'cancel') {
      this.overwritePrompt = null;
      this.overwriteNotice = null;
      this.setFeedback(`已取消覆盖，${SAVE_SLOT_LABELS[prompt.slotId]}的原存档保留`, false);
      this.render();
      return;
    }
    if (!prompt.readAllPages) {
      this.overwriteNotice = `请先翻页读完说明（${prompt.page + 1}/${prompt.bodyPages.length}）`;
      this.render();
      return;
    }
    const storage = this.options.storage;
    const { slotId } = prompt;
    const slotLabel = SAVE_SLOT_LABELS[slotId];
    // One-shot: the pending confirmation is consumed before any side effect,
    // so a callback failure or a replayed Enter cannot recommit the same one.
    this.overwritePrompt = null;
    this.overwriteNotice = null;
    if (storage === null) {
      this.refreshSlots();
      this.setFeedback('浏览器本地存储不可用，无法保存', true);
      this.render();
      return;
    }
    const precheck = verifySaveOverwriteTarget(storage, prompt);
    if (precheck.kind !== 'unchanged') {
      // The slot changed underneath (or storage failed): nothing written,
      // refreshed list, and only a freshly opened confirmation may commit.
      this.refreshSlots();
      this.setFeedback(`${slotLabel}：${precheck.message}`, true);
      this.render();
      return;
    }
    const result = this.options.save(slotId);
    this.setFeedback(`${slotLabel}：${result.message}`, !result.ok);
    this.refreshSlots();
    this.render();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render(): void {
    this.container.removeAll(true);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    const panelWidth = Math.min(640, width - 96);
    // Round 121 (correction): fit the panel inside a short viewport instead
    // of hanging past its edges (the row region and hint follow the panel).
    const panelHeight = Math.min(380, height - 40);
    const left = (width - panelWidth) / 2;
    const top = (height - panelHeight) / 2;
    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: left, y: top, width: panelWidth, height: panelHeight },
      UI.overlayAlpha,
    );

    const titles: Record<PausePage, string> = {
      main: '暂停',
      save: '保存进度',
      settings: '设置',
      'confirm-quit': '返回主菜单',
    };
    this.container.add(
      this.scene.add
        .text(width / 2, top + 34, titles[this.page], {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(20),
          color: UI.textPrimary,
        })
        .setOrigin(0.5),
    );

    switch (this.page) {
      case 'main':
        this.renderMainEntries(top);
        break;
      case 'save':
        this.renderSaveEntries(top);
        if (this.overwritePrompt !== null) {
          this.renderOverwritePrompt();
          return; // The confirmation owns the footer; do not overdraw it.
        }
        break;
      case 'settings':
        this.renderSettingsEntries(top);
        break;
      case 'confirm-quit':
        this.renderConfirmQuit(top, panelWidth);
        break;
    }

    if (this.feedback !== null) {
      this.container.add(
        this.scene.add
          .text(width / 2, top + panelHeight - 62, this.feedback, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(12),
            color: this.feedbackWarn ? UI.textWarn : UI.textPrimary,
            wordWrap: { width: panelWidth - 64, useAdvancedWrap: true },
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }

    const hints: Record<PausePage, string> = {
      main: '↑/↓ 选择 · Enter 确认 · Esc 继续',
      save: '↑↓选槽 · Enter保存 · PgUp/PgDn标签 · Esc返回',
      settings: '↑/↓ 选择 · ←/→ 调整（立即保存） · Esc 返回',
      'confirm-quit': '↑/↓ 选择 · Enter 确认 · Esc 返回',
    };
    this.container.add(
      this.scene.add
        .text(width / 2, top + panelHeight - 26, hints[this.page], {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(10),
          color: UI.textMuted,
        })
        .setOrigin(0.5),
    );
  }

  private renderMainEntries(top: number): void {
    const width = this.scene.scale.width;
    MAIN_ENTRIES.forEach((entry, index) => {
      const active = index === this.selection;
      if (active) {
        addPixelSelection(this.scene, this.container, {
          x: (width - 360) / 2,
          y: top + 75 + index * 42,
          width: 360,
          height: 32,
        });
      }
      this.container.add(
        this.scene.add
          .text(width / 2, top + 90 + index * 42, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${entry.label}`, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(16),
            color: active ? UI.textActive : UI.textIdle,
          })
          .setOrigin(0.5),
      );
    });
  }

  private renderSaveEntries(top: number): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelHeight = Math.min(380, height - 40);
    const px14 = Number.parseInt(uiFontSize(14), 10);
    const lineSize14 = Math.ceil(px14 * 1.5);
    // Round 121 (correction): measured wrapping inside a viewport-bounded row
    // region — a fitting stack keeps natural heights, an overflowing one
    // paginates each label into equal shares. Never pushes the last slot,
    // the note or the hint off-screen.
    const labels = SAVE_SLOT_IDS.map((slotId, index) => {
      const summary = this.slotSummaries[index];
      const active = index === this.selection;
      const line =
        summary !== undefined && summary.state === 'ok'
          ? `${SAVE_SLOT_LABELS[slotId]} · ${summary.displayName} Lv.${summary.level} · ${formatSavedAt(summary.savedAt ?? '')}`
          : summary !== undefined && summary.state === 'error'
            ? `${SAVE_SLOT_LABELS[slotId]} · 已有损坏存档（保存将覆盖）`
            : `${SAVE_SLOT_LABELS[slotId]} · 空（新建存档）`;
      return `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${line}`;
    });
    const probe = this.scene.add.text(-500, -500, '', { fontFamily: UI.fontFamily, fontSize: uiFontSize(14) });
    this.container.add(probe);
    const measure = (text: string): number => probe.context.measureText(text).width;
    const rows = layoutSaveSlotRows({
      labels, width: Math.min(640, width - 96) - 124, measure, lineHeight: lineSize14,
      top: top + 76, bottom: Math.min(top + panelHeight, height) - 100,
    });
    this.slotRows = rows;
    SAVE_SLOT_IDS.forEach((_slotId, index) => {
      const active = index === this.selection;
      const row = rows[index]!;
      // Only the selected slot pages; every other slot shows its first page.
      const pageIndex = active ? Math.min(this.slotLabelPage, row.pages.length - 1) : 0;
      const shown = (row.pages[pageIndex] ?? row.pages[0] ?? '').split('\n');
      if (active) {
        addPixelSelection(this.scene, this.container, {
          x: (width - Math.min(640, width - 96)) / 2 + 20,
          y: row.y,
          width: Math.min(640, width - 96) - 40,
          height: row.height,
        });
      }
      this.container.add(
        this.scene.add
          .text(width / 2 - 30, row.y + Math.max(0, (row.height - shown.length * lineSize14) / 2), shown.join('\n'), {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(14),
            lineSpacing: Math.ceil(px14 * 0.4),
            color: active ? UI.textActive : UI.textIdle,
          })
          .setOrigin(0.5, 0),
      );
      if (active && row.paged) {
        this.container.add(
          this.scene.add
            .text((width + Math.min(640, width - 96)) / 2 - 20, row.y + 4, `${pageIndex + 1}/${row.pages.length}`, {
              fontFamily: UI.fontFamily,
              fontSize: uiFontSize(9),
              color: UI.textMuted,
            })
            .setOrigin(1, 0),
        );
      }
    });

  }

  private renderSettingsEntries(top: number): void {
    const width = this.scene.scale.width;
    // Six rows since Round 41 (volume / text / movement layout / gamepad /
    // contrast / reduced motion); spacing keeps the largest text scale fit.
    settingsRows(this.settings).forEach((row, index) => {
      const active = index === this.selection;
      if (active) {
        addPixelSelection(this.scene, this.container, {
          x: (width - 540) / 2,
          y: top + 77 + index * 42,
          width: 540,
          height: 38,
        });
      }
      this.container.add(
        this.scene.add
          .text(width / 2, top + 92 + index * 42, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${row}`, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(15),
            color: active ? UI.textActive : UI.textIdle,
          })
          .setOrigin(0.5),
      );
    });
    if (this.options.storage === null) {
      this.container.add(
        this.scene.add
          .text(width / 2, top + 330, '浏览器本地存储不可用：设置仅本次会话有效', {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(11),
            color: UI.textWarn,
          })
          .setOrigin(0.5),
      );
    }
  }

  /**
   * Round 143: the overwrite confirmation rides on top of the save page as
   * an opaque sub-panel: measured title, the prompt's current body page, the
   * two choice rows (default cancel highlighted) and a hint/notice line. The
   * slot list stays visible around it, untouched; the raw payload is never
   * part of any rendered text.
   */
  private renderOverwritePrompt(): void {
    const prompt = this.overwritePrompt;
    if (prompt === null) {
      return;
    }
    const px = (size: number) => Number.parseInt(uiFontSize(size), 10);
    const lineSize = (size: number) => Math.ceil(px(size) * 1.5);
    const geometry = buildSaveOverwriteGeometry({
      viewWidth: this.scene.scale.width,
      viewHeight: this.scene.scale.height,
      titleHeight: lineSize(16),
      bodyLineHeight: lineSize(12),
      choiceHeight: lineSize(13),
      hintHeight: lineSize(10),
      padding: OVERWRITE_PROMPT_PADDING,
    });
    // Font-synced probes for the two fit-truncated chrome lines; they live on
    // the container, so the next re-render reclaims them.
    const probeTitle = this.scene.add.text(-500, -500, '', { fontFamily: UI.fontFamily, fontSize: uiFontSize(16) });
    const probeHint = this.scene.add.text(-500, -500, '', { fontFamily: UI.fontFamily, fontSize: uiFontSize(10) });
    this.container.add(probeTitle);
    this.container.add(probeHint);

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: geometry.left, y: geometry.top, width: geometry.width, height: geometry.height },
      UI.overlayAlpha,
    );

    const title = `覆盖${SAVE_SLOT_LABELS[prompt.slotId]}？`;
    this.container.add(
      this.scene.add.text(
        geometry.left + OVERWRITE_PROMPT_PADDING,
        geometry.top + 16,
        truncateGrapheme(title, geometry.contentWidth, (text) => probeTitle.context.measureText(text).width),
        { fontFamily: UI.fontFamily, fontSize: uiFontSize(16), color: UI.textWarn },
      ),
    );

    this.container.add(
      this.scene.add.text(geometry.left + OVERWRITE_PROMPT_PADDING, geometry.bodyTop, prompt.bodyPages[prompt.page] ?? '', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        lineSpacing: Math.ceil(px(12) * 0.5),
        color: UI.textPrimary,
      }),
    );

    const choices = [
      {
        selected: prompt.choice === 'cancel',
        label: '取消覆盖（默认）',
        color: prompt.choice === 'cancel' ? UI.textActive : UI.textIdle,
      },
      {
        selected: prompt.choice === 'confirm',
        label: prompt.readAllPages ? '确认覆盖' : '确认覆盖（先读说明）',
        color: UI.textWarn,
      },
    ];
    choices.forEach((choice, index) => {
      const y = geometry.choiceTop + index * lineSize(13);
      if (choice.selected) {
        addPixelSelection(this.scene, this.container, {
          x: geometry.left + OVERWRITE_PROMPT_PADDING,
          y: y - 2,
          width: geometry.width - OVERWRITE_PROMPT_PADDING * 2,
          height: lineSize(13),
        });
      }
      this.container.add(
        this.scene.add.text(
          geometry.left + OVERWRITE_PROMPT_PADDING,
          y,
          `${choice.selected ? CURSOR_ACTIVE : CURSOR_IDLE}${choice.label}`,
          { fontFamily: UI.fontFamily, fontSize: uiFontSize(13), color: choice.color },
        ),
      );
    });

    // Compact page label (the full "PageUp/PageDown" legend measures past the
    // body width at the max font scale); a notice, when present, wins the line.
    const pagesLabel = prompt.bodyPages.length > 1
      ? `←→/Pg翻页 ${prompt.page + 1}/${prompt.bodyPages.length} · `
      : '';
    const foot = this.overwriteNotice ?? `↑↓选择 · ${pagesLabel}Enter 执行 · Esc 取消`;
    this.container.add(
      this.scene.add
        .text(
          geometry.left + geometry.width - OVERWRITE_PROMPT_PADDING,
          geometry.hintTop,
          truncateGrapheme(foot, geometry.contentWidth, (text) => probeHint.context.measureText(text).width),
          { fontFamily: UI.fontFamily, fontSize: uiFontSize(10), color: this.overwriteNotice === null ? UI.textMuted : UI.textWarn },
        )
        .setOrigin(1, 0),
    );
  }

  private renderConfirmQuit(top: number, panelWidth: number): void {
    const width = this.scene.scale.width;
    const warn = this.scene.add
      .text(width / 2, top + 108, '未保存进度会丢失\n已存档可继续读取', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textWarn,
        wordWrap: { width: panelWidth - 64 },
      })
      .setOrigin(0.5);
    this.container.add(warn);
    const rows = ['确定返回', '取消'];
    rows.forEach((row, index) => {
      const active = index === this.selection;
      if (active) {
        addPixelSelection(this.scene, this.container, {
          x: (width - 360) / 2,
          y: top + 164 + index * 40,
          width: 360,
          height: 32,
        });
      }
      this.container.add(
        this.scene.add
          .text(width / 2, top + 180 + index * 40, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${row}`, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(15),
            color: active ? UI.textActive : UI.textIdle,
          })
          .setOrigin(0.5),
      );
    });
  }
}
