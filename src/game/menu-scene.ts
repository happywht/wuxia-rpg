/**
 * Round 09 main menu scene: the first screen players see. Hosts the
 * new-game character creation (template + display name), the save-slot
 * browser (continue/delete) and the persistent settings page.
 *
 * The world loads through the shared {@link loadWorldData} pipeline so the
 * menu sees exactly the datasets the gameplay scene will see — template
 * lists come from `data/`, and data failures keep the readable error panel
 * behaviour of every prior round. Starting a run hands over to the grid
 * scene via scene data (`{kind:'new'|'load', ...}`); saves are only
 * *listed* here, the actual read/preflight/restore runs inside the grid
 * scene against its loaded world (single restore path).
 *
 * All labels drawn here are interface mechanics (menu verbs, slot names),
 * not world content; the game title itself comes from `document.title`, so
 * index.html stays its single source.
 */

import Phaser from 'phaser';

import {
  type CharacterProfileData,
} from '../engine/character-progression';
import {
  SAVE_SLOT_IDS,
  type SaveSlotId,
  SAVE_SLOT_LABELS,
  createBrowserSaveStorage,
  deleteSaveSlot,
  formatSavedAt,
  listSaveSlots,
  type SaveSlotSummary,
  type SaveStorage,
} from '../engine/save-system';
import {
  type GameSettings,
  TEXT_SCALE_LABELS,
  applyGameSettings,
  loadGameSettings,
  saveGameSettings,
  uiFontSize,
  volumeLabel,
} from './settings';
import { loadWorldData } from './world-loader';

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;

const UI = {
  background: '#0b0e14',
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

/** Home entries; ids drive the page switch. */
type HomePageEntry = 'new' | 'continue' | 'settings';

/** Non-content menu strings (interface mechanics only). */
const HOME_ENTRIES: { id: HomePageEntry; label: string }[] = [
  { id: 'new', label: '开始新游戏' },
  { id: 'continue', label: '继续游戏' },
  { id: 'settings', label: '设置' },
];

type MenuPage = 'loading' | 'error' | 'home' | 'new-game' | 'slots' | 'settings';

/** Startup payload handed to the grid scene via scene.start data. */
export interface GridStartupData {
  kind: 'new' | 'load';
  /** New game: chosen template id and display name. */
  profileId?: string;
  displayName?: string;
  /** Load: the slot to read and restore. */
  slotId?: SaveSlotId;
}

export class MenuScene extends Phaser.Scene {
  private page: MenuPage = 'loading';
  private errorTitle = '';
  private errorLines: string[] = [];

  private profiles: CharacterProfileData[] = [];
  private storage: SaveStorage | null = null;
  private settings: GameSettings = { volume: 8, textScaleIndex: 1 };

  private homeSelection = 0;
  private profileSelection = 0;
  private slotSelection = 0;
  private settingsSelection = 0;
  private displayNameDraft = '';
  /** Slot id pending a delete confirmation (null = none). */
  private deleteCandidate: SaveSlotId | null = null;
  private slotSummaries: SaveSlotSummary[] = [];
  private slotsAvailable = false;
  private slotsMessage: string | null = null;
  private feedback: string | null = null;

  private readonly bindings: { key: Phaser.Input.Keyboard.Key; handler: () => void }[] = [];

  constructor() {
    super('menu');
  }

  create(): void {
    this.storage = createBrowserSaveStorage();
    this.settings = loadGameSettings(this.storage ?? unavailableStorage());
    applyGameSettings(this.game, this.settings);

    this.bindKeys();
    this.showLoading();
    void this.loadWorld();
  }

  private async loadWorld(): Promise<void> {
    const outcome = await loadWorldData();
    if (!outcome.ok) {
      this.errorTitle = outcome.title;
      this.errorLines = outcome.lines;
      this.page = 'error';
      this.renderPage();
      return;
    }
    this.profiles = [...outcome.world.assembly.progression.profiles.values()];
    this.page = 'home';
    this.homeSelection = 0;
    this.renderPage();
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      return;
    }
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [KeyCodes.UP, () => this.moveSelection(-1)],
      [KeyCodes.DOWN, () => this.moveSelection(1)],
      [KeyCodes.LEFT, () => this.adjustSetting(-1)],
      [KeyCodes.RIGHT, () => this.adjustSetting(1)],
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.ESC, () => this.back()],
      [KeyCodes.D, () => this.requestDeleteSlot()],
      [KeyCodes.R, () => this.retryLoad()],
    ];
    for (const [code, handler] of pairs) {
      const key = keyboard.addKey(code);
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
    // Raw keydown feeds the display-name draft (printable chars + backspace).
    keyboard.addCapture([KeyCodes.BACKSPACE, KeyCodes.SPACE]);
    const onRawKeydown = (event: KeyboardEvent): void => {
      if (this.page !== 'new-game') {
        return;
      }
      if (event.key === 'Backspace') {
        this.displayNameDraft = this.displayNameDraft.slice(0, -1);
        this.renderPage();
        return;
      }
      if (event.key.length === 1 && this.displayNameDraft.length < 24) {
        this.displayNameDraft += event.key;
        this.renderPage();
      }
    };
    keyboard.on('keydown', onRawKeydown);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const { key, handler } of this.bindings) {
        key.off('down', handler);
      }
      this.bindings.length = 0;
      keyboard.off('keydown', onRawKeydown);
    });
  }

  /** Up/Down: move the active row of whatever page is showing. */
  private moveSelection(delta: number): void {
    switch (this.page) {
      case 'home': {
        const count = HOME_ENTRIES.length;
        this.homeSelection = (this.homeSelection + delta + count) % count;
        break;
      }
      case 'new-game': {
        const count = this.profiles.length;
        if (count > 0) {
          this.profileSelection = (this.profileSelection + delta + count) % count;
        }
        break;
      }
      case 'slots': {
        const count = SAVE_SLOT_IDS.length;
        this.slotSelection = (this.slotSelection + delta + count) % count;
        this.deleteCandidate = null;
        break;
      }
      case 'settings': {
        const count = 2;
        this.settingsSelection = (this.settingsSelection + delta + count) % count;
        break;
      }
      default:
        return;
    }
    this.renderPage();
  }

  /** Left/Right: adjust the focused setting (settings page only). */
  private adjustSetting(delta: number): void {
    if (this.page !== 'settings') {
      return;
    }
    if (this.settingsSelection === 0) {
      this.settings.volume = Phaser.Math.Clamp(this.settings.volume + delta, 0, 10);
    } else {
      const count = TEXT_SCALE_LABELS.length;
      this.settings.textScaleIndex =
        (this.settings.textScaleIndex + delta + count) % count;
    }
    applyGameSettings(this.game, this.settings);
    if (this.storage !== null) {
      saveGameSettings(this.storage, this.settings); // Session-only on refusal.
    }
    this.renderPage();
  }

  /** Enter: activate the active row of whatever page is showing. */
  private confirm(): void {
    switch (this.page) {
      case 'home': {
        const entry = HOME_ENTRIES[this.homeSelection];
        if (entry === undefined) {
          return;
        }
        if (entry.id === 'new') {
          this.openNewGame();
        } else if (entry.id === 'continue') {
          this.openSlots();
        } else {
          this.openSettings();
        }
        return;
      }
      case 'new-game': {
        const profile = this.profiles[this.profileSelection];
        if (profile === undefined) {
          return; // No valid template: nothing to start.
        }
        const displayName =
          this.displayNameDraft.trim().length > 0 ? this.displayNameDraft.trim() : profile.name;
        this.startGrid({ kind: 'new', profileId: profile.id, displayName });
        return;
      }
      case 'slots': {
        const slotId = SAVE_SLOT_IDS[this.slotSelection];
        if (slotId === undefined) {
          return;
        }
        if (this.deleteCandidate === slotId) {
          this.confirmDeleteSlot(slotId);
          return;
        }
        const summary = this.slotSummaries[this.slotSelection];
        if (summary?.state !== 'ok' || this.storage === null) {
          return; // Empty or broken slot: nothing to load.
        }
        this.startGrid({ kind: 'load', slotId });
        return;
      }
      default:
        return;
    }
  }

  /** Esc: one page back (home pages keep standing). */
  private back(): void {
    if (this.page === 'error') {
      return; // The error page only offers retry (R).
    }
    if (this.page === 'new-game' || this.page === 'slots' || this.page === 'settings') {
      this.feedback = null;
      this.page = 'home';
      this.renderPage();
    }
  }

  /** D: arm/delete the selected slot (slots page only). */
  private requestDeleteSlot(): void {
    if (this.page !== 'slots') {
      return;
    }
    const slotId = SAVE_SLOT_IDS[this.slotSelection];
    const summary = this.slotSummaries[this.slotSelection];
    if (slotId === undefined || summary === undefined || summary.state === 'empty') {
      return; // Nothing saved there: nothing to delete.
    }
    // Both readable saves and broken payloads are deletable — a corrupt slot
    // must never become undeletable dead weight.
    if (this.deleteCandidate === slotId) {
      this.confirmDeleteSlot(slotId);
      return;
    }
    this.deleteCandidate = slotId;
    this.renderPage();
  }

  private confirmDeleteSlot(slotId: SaveSlotId): void {
    if (this.storage === null) {
      return;
    }
    const result = deleteSaveSlot(this.storage, slotId);
    this.deleteCandidate = null;
    this.feedback = result.ok
      ? `已删除${SAVE_SLOT_LABELS[slotId]}`
      : `删除失败：${result.message}`;
    this.refreshSlots();
    this.renderPage();
  }

  /** R: retry the world load from the error page. */
  private retryLoad(): void {
    if (this.page !== 'error') {
      return;
    }
    this.page = 'loading';
    this.renderPage();
    void this.loadWorld();
  }

  private startGrid(data: GridStartupData): void {
    this.scene.start('grid', data);
  }

  // -------------------------------------------------------------------------
  // Page transitions
  // -------------------------------------------------------------------------

  private openNewGame(): void {
    if (this.profiles.length === 0) {
      this.feedback = '当前资料中没有可用的角色模板，无法开始新游戏（详情见控制台）';
      console.warn('[menu] 无可用角色模板：角色模板资料缺失或全部无效');
      this.renderPage();
      return;
    }
    this.page = 'new-game';
    this.profileSelection = 0;
    this.displayNameDraft = '';
    this.feedback = null;
    this.renderPage();
  }

  private openSlots(): void {
    this.page = 'slots';
    this.slotSelection = 0;
    this.deleteCandidate = null;
    this.feedback = null;
    this.refreshSlots();
    this.renderPage();
  }

  private openSettings(): void {
    this.page = 'settings';
    this.settingsSelection = 0;
    this.feedback = this.storage === null ? '浏览器本地存储不可用：设置仅本次会话有效' : null;
    this.renderPage();
  }

  private refreshSlots(): void {
    if (this.storage === null) {
      this.slotsAvailable = false;
      this.slotsMessage = '浏览器本地存储不可用，无法读取存档';
      this.slotSummaries = [];
      return;
    }
    const listing = listSaveSlots(this.storage);
    this.slotsAvailable = listing.ok;
    this.slotsMessage = listing.ok ? null : listing.message;
    this.slotSummaries = listing.slots;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private showLoading(): void {
    this.children.removeAll(true);
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, '正在加载资料…', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textMuted,
      })
      .setOrigin(0.5);
  }

  private renderPage(): void {
    this.children.removeAll(true);

    switch (this.page) {
      case 'loading':
        this.showLoading();
        return;
      case 'error':
        this.renderErrorPage();
        return;
      case 'home':
        this.renderHomePage();
        return;
      case 'new-game':
        this.renderNewGamePage();
        return;
      case 'slots':
        this.renderSlotsPage();
        return;
      case 'settings':
        this.renderSettingsPage();
        return;
    }
  }

  private drawBackdrop(): void {
    this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x0b0e14);
  }

  private drawTitle(): void {
    this.add
      .text(VIEW_WIDTH / 2, 96, document.title, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(30),
        color: UI.textPrimary,
      })
      .setOrigin(0.5);
  }

  private drawHint(text: string, y = VIEW_HEIGHT - 26): void {
    this.add
      .text(VIEW_WIDTH / 2, y, text, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(11),
        color: UI.textMuted,
      })
      .setOrigin(0.5);
  }

  private drawFeedback(y: number): void {
    if (this.feedback === null) {
      return;
    }
    this.add
      .text(VIEW_WIDTH / 2, y, this.feedback, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(12),
        color: UI.textWarn,
        wordWrap: { width: VIEW_WIDTH - 160 },
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private renderHomePage(): void {
    this.drawBackdrop();
    this.drawTitle();

    HOME_ENTRIES.forEach((entry, index) => {
      const active = index === this.homeSelection;
      this.add
        .text(
          VIEW_WIDTH / 2,
          240 + index * 40,
          `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${entry.label}`,
          {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(18),
            color: active ? UI.textActive : UI.textIdle,
          },
        )
        .setOrigin(0.5);
    });

    if (this.profiles.length === 0) {
      this.add
        .text(VIEW_WIDTH / 2, 380, '（当前资料中没有可用角色模板）', {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(11),
          color: UI.textWarn,
        })
        .setOrigin(0.5);
    }

    this.drawFeedback(410);
    this.drawHint('↑/↓ 选择 · Enter 确认');
  }

  private renderNewGamePage(): void {
    this.drawBackdrop();
    this.add
      .text(VIEW_WIDTH / 2, 60, '创建角色', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(22),
        color: UI.textPrimary,
      })
      .setOrigin(0.5);

    // Left: template list; Right: details of the selected template.
    this.profiles.forEach((profile, index) => {
      const active = index === this.profileSelection;
      this.add
        .text(80, 130 + index * 36, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${profile.name}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(16),
          color: active ? UI.textActive : UI.textIdle,
        })
        .setOrigin(0, 0);
    });

    const profile = this.profiles[this.profileSelection];
    if (profile !== undefined) {
      const detailX = 380;
      this.add
        .text(detailX, 130, profile.name, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(16),
          color: UI.textPrimary,
        })
        .setOrigin(0, 0);
      this.add
        .text(detailX, 160, profile.description, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textMuted,
          wordWrap: { width: 500 },
          lineSpacing: 5,
        })
        .setOrigin(0, 0);
      const attributes = (Object.keys(profile.attributes) as (keyof typeof profile.attributes)[])
        .map((id) => `${profile.attributeLabels[id]} ${profile.attributes[id]}`)
        .join(' · ');
      this.add
        .text(detailX, 250, attributes, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textPrimary,
        })
        .setOrigin(0, 0);
      this.add
        .text(detailX, 274, `起始等级 ${profile.startingLevel} · 起始银两 ${profile.startingCurrency}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textPrimary,
        })
        .setOrigin(0, 0);
    }

    const draft = this.displayNameDraft.length > 0 ? this.displayNameDraft : '（留空使用模板名）';
    const draftColor =
      this.displayNameDraft.length > 0 ? UI.textPrimary : UI.textMuted;
    this.add
      .text(80, 330, `姓名：${draft}_`, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: draftColor,
      })
      .setOrigin(0, 0);

    this.drawHint('↑/↓ 选择模板 · 直接输入姓名（Backspace 删除） · Enter 开始闯荡 · Esc 返回（画布内暂只支持英文与数字输入）', VIEW_HEIGHT - 36);
  }

  private renderSlotsPage(): void {
    this.drawBackdrop();
    this.add
      .text(VIEW_WIDTH / 2, 70, '继续游戏', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(22),
        color: UI.textPrimary,
      })
      .setOrigin(0.5);

    if (!this.slotsAvailable) {
      this.add
        .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, this.slotsMessage ?? '浏览器本地存储不可用', {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(14),
          color: UI.textWarn,
          align: 'center',
        })
        .setOrigin(0.5);
      this.drawHint('Esc 返回主菜单');
      return;
    }

    SAVE_SLOT_IDS.forEach((slotId, index) => {
      const summary = this.slotSummaries[index];
      const active = index === this.slotSelection;
      const armed = this.deleteCandidate === slotId;
      let line: string;
      if (summary === undefined) {
        line = SAVE_SLOT_LABELS[slotId];
      } else if (summary.state === 'ok') {
        line = `${SAVE_SLOT_LABELS[slotId]} · ${summary.displayName} Lv.${summary.level} · ${formatSavedAt(summary.savedAt ?? '')}`;
      } else if (summary.state === 'error') {
        line = `${SAVE_SLOT_LABELS[slotId]} · 无法读取：${summary.error}`;
      } else {
        line = `${SAVE_SLOT_LABELS[slotId]} · 空`;
      }
      if (armed) {
        line += '　—— 再按 Enter 确认删除，按 D 取消';
      }
      this.add
        .text(
          VIEW_WIDTH / 2,
          160 + index * 60,
          `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${line}`,
          {
            fontFamily: UI.fontFamily,
            fontSize: uiFontSize(15),
            color: armed ? UI.textWarn : active ? UI.textActive : UI.textIdle,
            wordWrap: { width: VIEW_WIDTH - 200 },
          },
        )
        .setOrigin(0.5);
    });

    this.drawFeedback(390);
    this.drawHint('↑/↓ 选择 · Enter 读档 · D 删除存档 · Esc 返回');
  }

  private renderSettingsPage(): void {
    this.drawBackdrop();
    this.add
      .text(VIEW_WIDTH / 2, 70, '设置', {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(22),
        color: UI.textPrimary,
      })
      .setOrigin(0.5);

    const rows = [
      `音量　${volumeLabel(this.settings.volume)}（${this.settings.volume}/10）`,
      `文字大小　${TEXT_SCALE_LABELS[this.settings.textScaleIndex] ?? '标准'}（本页与游戏界面即时生效）`,
    ];
    rows.forEach((row, index) => {
      const active = index === this.settingsSelection;
      this.add
        .text(VIEW_WIDTH / 2, 180 + index * 48, `${active ? CURSOR_ACTIVE : CURSOR_IDLE}${row}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(15),
          color: active ? UI.textActive : UI.textIdle,
        })
        .setOrigin(0.5);
    });

    this.drawFeedback(330);
    this.drawHint('↑/↓ 选择 · ←/→ 调整（立即保存） · Esc 返回');
  }

  private renderErrorPage(): void {
    this.drawBackdrop();
    const panelWidth = VIEW_WIDTH - 96;
    const panelHeight = 320;
    this.add
      .rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, panelWidth, panelHeight, UI.panelFill)
      .setStrokeStyle(2, UI.panelStroke);

    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - panelHeight / 2 + 36, this.errorTitle, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(20),
        color: UI.textWarn,
      })
      .setOrigin(0.5);

    const body = [
      ...this.errorLines,
      '',
      '请检查 data/ 下的清单、schema 与地图 JSON，或 mods/ 中的覆盖文件。',
      '按 R 重新加载，或刷新页面。',
    ].join('\n');
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 8, body, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(13),
        color: UI.textMuted,
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: panelWidth - 48 },
      })
      .setOrigin(0.5);
  }
}

/**
 * Fallback storage used when the browser disallows localStorage: reads miss
 * and writes are refused, so settings stay session-only and never crash.
 */
function unavailableStorage(): SaveStorage {
  return {
    read: () => null,
    write: () => {
      throw new Error('浏览器本地存储不可用');
    },
    remove: () => {
      throw new Error('浏览器本地存储不可用');
    },
  };
}
