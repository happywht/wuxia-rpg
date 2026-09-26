/**
 * Round 09 pause menu overlay: opened with Escape while exploring, closed
 * with Escape or the "继续" entry. Pages:
 *
 * - main — continue / save to a slot / settings / return to the main menu;
 * - save — the three slots with their current summaries; Enter overwrites
 *   the slot with a fresh snapshot of the live run (the host supplies the
 *   capture so this class never touches gameplay state);
 * - settings — the same two persistent settings as the main menu, adjusted
 *   with Left/Right and applied immediately (volume bus + every panel's
 *   font size through {@link uiFontSize});
 * - confirm-quit — an explicit confirm step before an unsaved run ends.
 *
 * While open the owning scene ignores movement input (`isOpen` is the
 * gate); keys are bound on open and unbound on close, matching every other
 * panel in this project. Labels here are interface mechanics only.
 */

import Phaser from 'phaser';

import {
  SAVE_SLOT_IDS,
  type SaveSlotId,
  SAVE_SLOT_LABELS,
  type SaveSlotSummary,
  formatSavedAt,
  listSaveSlots,
  type SaveStorage,
} from '../engine/save-system';
import {
  TEXT_SCALE_LABELS,
  applyGameSettings,
  saveGameSettings,
  uiFontSize,
  volumeLabel,
} from './settings';

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
  fontFamily: 'sans-serif',
} as const;

const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';

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
  /** Captures and writes the live run into one slot; returns readable feedback. */
  save: (slotId: SaveSlotId) => { ok: boolean; message: string };
  /** Invoked after the player confirmed leaving the run. */
  returnToMenu: () => void;
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
  private feedback: string | null = null;
  private feedbackWarn = false;
  private openState = false;
  private slotSummaries: SaveSlotSummary[] = [];
  private slotsAvailable = false;
  private slotsMessage: string | null = null;
  private settings = { volume: 8, textScaleIndex: 1 };

  constructor(scene: Phaser.Scene, options: PauseMenuPanelOptions) {
    this.scene = scene;
    this.options = options;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(2000);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Opens the pause menu on its main page. */
  open(settings: { volume: number; textScaleIndex: number }): void {
    if (this.openState) {
      return;
    }
    this.openState = true;
    this.settings = { ...settings };
    this.page = 'main';
    this.selection = 0;
    this.feedback = null;
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
        return 2;
      case 'confirm-quit':
        return 2; // 确认 / 取消
    }
  }

  private moveSelection(delta: number): void {
    const count = this.rowCount();
    if (count === 0) {
      return;
    }
    this.selection = (this.selection + delta + count) % count;
    this.render();
  }

  private adjustSetting(delta: number): void {
    if (this.page !== 'settings') {
      return;
    }
    if (this.selection === 0) {
      this.settings.volume = Phaser.Math.Clamp(this.settings.volume + delta, 0, 10);
    } else {
      const count = TEXT_SCALE_LABELS.length;
      this.settings.textScaleIndex = (this.settings.textScaleIndex + delta + count) % count;
    }
    applyGameSettings(this.scene.game, this.settings);
    if (this.options.storage !== null) {
      saveGameSettings(this.options.storage, this.settings);
    }
    this.render();
  }

  /** The settings as last adjusted (the scene persists them for its own state). */
  currentSettings(): { volume: number; textScaleIndex: number } {
    return { ...this.settings };
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
        const slotId = SAVE_SLOT_IDS[this.selection];
        if (slotId === undefined) {
          return;
        }
        if (!this.slotsAvailable) {
          this.setFeedback(this.slotsMessage ?? '浏览器本地存储不可用，无法保存', true);
          return;
        }
        const result = this.options.save(slotId);
        this.setFeedback(`${SAVE_SLOT_LABELS[slotId]}：${result.message}`, !result.ok);
        this.refreshSlots();
        this.render();
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
    if (this.page === 'main') {
      this.close();
      return;
    }
    this.page = 'main';
    this.selection = 0;
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
  // Rendering
  // -------------------------------------------------------------------------

  private render(): void {
    this.container.removeAll(true);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;

    const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, UI.overlay);
    overlay.setAlpha(UI.overlayAlpha);
    this.container.add(overlay);

    const panelWidth = Math.min(640, width - 96);
    const panelHeight = 380;
    const left = (width - panelWidth) / 2;
    const top = (height - panelHeight) / 2;
    const panel = this.scene.add.rectangle(
      left + panelWidth / 2,
      top + panelHeight / 2,
      panelWidth,
      panelHeight,
      UI.panelFill,
    );
    panel.setStrokeStyle(2, UI.panelStroke);
    this.container.add(panel);

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
        this.renderSaveEntries(top, panelWidth);
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
          .text(width / 2, top + panelHeight - 52, this.feedback, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(12),
            color: this.feedbackWarn ? UI.textWarn : UI.textPrimary,
            wordWrap: { width: panelWidth - 64 },
            align: 'center',
          })
          .setOrigin(0.5),
      );
    }

    const hints: Record<PausePage, string> = {
      main: '↑/↓ 选择 · Enter 确认 · Esc 继续',
      save: '↑/↓ 选择 · Enter 覆盖保存 · Esc 返回',
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

  private renderSaveEntries(top: number, panelWidth: number): void {
    const width = this.scene.scale.width;
    SAVE_SLOT_IDS.forEach((slotId, index) => {
      const summary = this.slotSummaries[index];
      const active = index === this.selection;
      const line =
        summary !== undefined && summary.state === 'ok'
          ? `${SAVE_SLOT_LABELS[slotId]} · ${summary.displayName} Lv.${summary.level} · ${formatSavedAt(summary.savedAt ?? '')}`
          : summary !== undefined && summary.state === 'error'
            ? `${SAVE_SLOT_LABELS[slotId]} · 已有损坏存档（保存将覆盖）`
            : `${SAVE_SLOT_LABELS[slotId]} · 空（新建存档）`;
      this.container.add(
        this.scene.add
          .text(width / 2, top + 96 + index * 48, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${line}`, {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(14),
            color: active ? UI.textActive : UI.textIdle,
            wordWrap: { width: panelWidth - 64 },
          })
          .setOrigin(0.5),
      );
    });
    this.container.add(
      this.scene.add
        .text(width / 2, top + 96 + SAVE_SLOT_IDS.length * 48 + 14, 'Enter 将以当前进度覆盖所选槽位', {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(11),
          color: UI.textMuted,
        })
        .setOrigin(0.5),
    );
  }

  private renderSettingsEntries(top: number): void {
    const width = this.scene.scale.width;
    const rows = [
      `音量　${volumeLabel(this.settings.volume)}（${this.settings.volume}/10）`,
      `文字大小　${TEXT_SCALE_LABELS[this.settings.textScaleIndex] ?? '标准'}（重开的面板即时生效）`,
    ];
    rows.forEach((row, index) => {
      const active = index === this.selection;
      this.container.add(
        this.scene.add
          .text(width / 2, top + 120 + index * 48, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${row}`, {
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
          .text(width / 2, top + 240, '浏览器本地存储不可用：设置仅本次会话有效', {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(11),
            color: UI.textWarn,
          })
          .setOrigin(0.5),
      );
    }
  }

  private renderConfirmQuit(top: number, panelWidth: number): void {
    const width = this.scene.scale.width;
    const warn = this.scene.add
      .text(width / 2, top + 120, '未保存的进度将丢失，确定返回主菜单吗？', {
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
