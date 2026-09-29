import Phaser from 'phaser';

import {
  type CombatantView,
  type CombatSession,
  type PlayerActionView,
} from '../engine/turn-based-combat';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, UI_FONT_FAMILY, addPixelSelection } from './ui-theme';

/**
 * Generic keyboard-driven battle overlay.
 *
 * Renders one {@link CombatSession}: both combatants' health/qi bars and
 * values, a readable battle log, and the player's action list (martial-art
 * names and numbers all come from data). Up/Down (or W/S) move the
 * selection, Enter confirms — or closes the panel once the battle is over —
 * and Escape flees (or closes an over battle). Unaffordable actions stay
 * selectable but show a local notice on confirm; the session refuses them
 * without consuming the turn.
 *
 * This class only draws and forwards input, so no world content lives here;
 * the owning scene gates movement input on `isOpen`, exactly like the
 * dialogue panel.
 */

const UI = {
  overlayFill: 0x06080d,
  overlayAlpha: 0.72,
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  barTrack: 0x232a38,
  barStroke: 0x3a4a63,
  barHealth: 0xb84a3f,
  barQi: 0x3f6fb8,
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  textWarn: '#e8b04b',
  combatantName: '#f0c96a',
  actionIdle: '#a8b2c4',
  actionActive: '#f0c96a',
  actionDisabled: '#5a6272',
  logPlayer: '#a8d8b0',
  logCompanion: '#7ed6bd',
  logEnemy: '#e0a8a8',
  logResult: '#f0c96a',
  fontFamily: UI_FONT_FAMILY,
} as const;

const PADDING = 24;
const BAR_WIDTH = 250;
const BAR_HEIGHT = 12;
const BAR_GAP = 18;
/** Vertical budget for the log block; older entries drop off first. */
const LOG_HEIGHT_BUDGET = 128;
const ACTION_LINE_HEIGHT = 26;
const VISIBLE_ACTION_ROWS = 5;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';
/** Fixed panel height: two combatant blocks, log budget, up to five rows, hint. */
const PANEL_HEIGHT = 396;

/** Mechanic-only labels this panel renders next to data-driven values. */
const LABELS = {
  health: '生命',
  qi: '内力',
  attackKind: '攻击',
  healKind: '恢复',
  guardKind: '守御',
  fleeAction: '撤退',
  selectHint: '↑/↓ 滚动与选择 · Enter 确认 · Esc 撤退',
  closeHint: 'Enter / Esc 离开战场',
  insufficientQi: '内力不足，该行动无法使出',
} as const;

function actionKindLabel(kind: PlayerActionView['art']['combat']['kind']): string {
  switch (kind) {
    case 'attack': return LABELS.attackKind;
    case 'heal': return LABELS.healKind;
    case 'guard': return LABELS.guardKind;
  }
}

function actionLineText(action: PlayerActionView, active: boolean): string {
  const combat = action.art.combat;
  const effect = combat.kind === 'guard'
    ? `${actionKindLabel(combat.kind)} 至多减伤 ${combat.power}`
    : `${actionKindLabel(combat.kind)} ${combat.power}`;
  return `${active ? CURSOR_ACTIVE : CURSOR_IDLE}「${action.art.name}」　${effect} · ${LABELS.qi} ${combat.qiCost}`;
}

type PanelKeyBinding = {
  key: Phaser.Input.Keyboard.Key;
  handler: () => void;
};

export interface BattlePanelOptions {
  /** Invoked after the panel closed; the scene unlocks movement here. */
  onClose?: () => void;
}

export class BattlePanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;

  private session: CombatSession | null = null;
  private selection = 0;
  private notice: string | null = null;
  private openState = false;

  constructor(scene: Phaser.Scene, options: BattlePanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1100);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Starts rendering `session`; keys bind for the panel's lifetime. */
  open(session: CombatSession): void {
    if (this.openState) {
      return;
    }
    this.session = session;
    this.selection = 0;
    this.notice = null;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  /** Closes the panel and releases the keyboard bindings. */
  close(): void {
    if (!this.openState) {
      return;
    }
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.session = null;
    this.onClose?.();
  }

  /** Destroys the panel for good (scene teardown). */
  destroy(): void {
    this.close();
    this.container.destroy();
  }

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
      [KeyCodes.ENTER, () => this.confirm()],
      [KeyCodes.ESC, () => this.cancel()],
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

  /** Number of selectable rows: each player action plus the flee row. */
  private get rowCount(): number {
    return (this.session?.playerActions.length ?? 0) + 1;
  }

  private moveSelection(delta: number): void {
    if (this.session === null || this.session.isOver) {
      return;
    }
    const count = this.rowCount;
    if (count === 0) {
      return;
    }
    this.notice = null;
    this.selection = (this.selection + delta + count) % count;
    this.render();
  }

  private confirm(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    if (session.isOver) {
      this.close(); // Enter on a finished battle closes the overlay.
      return;
    }
    const action = session.playerActions[this.selection];
    if (action !== undefined) {
      if (!action.affordable) {
        this.notice = LABELS.insufficientQi;
        this.render();
        return;
      }
      const outcome = session.playerUse(action.art.id);
      this.notice = outcome.ok ? null : LABELS.insufficientQi;
      this.selection = Math.min(this.selection, this.rowCount - 1);
      this.render();
      return;
    }
    // Beyond the action rows sits the flee row.
    session.flee();
    this.notice = null;
    this.render();
  }

  private cancel(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    if (session.isOver) {
      this.close();
      return;
    }
    session.flee();
    this.notice = null;
    this.render();
  }

  /** Rebuilds every panel element from the session's current state. */
  private render(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    this.container.removeAll(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelWidth = Math.min(800, width - 80);
    const panelLeft = (width - panelWidth) / 2;
    const panelTop = (height - PANEL_HEIGHT) / 2 + 12;
    const contentWidth = panelWidth - PADDING * 2;

    addPixelPanelChrome(
      this.scene,
      this.container,
      { x: panelLeft, y: panelTop, width: panelWidth, height: PANEL_HEIGHT },
      UI.overlayAlpha,
    );

    this.renderCombatant(session.playerView, panelLeft + PADDING + BAR_WIDTH / 2, panelTop + PADDING);
    this.renderCombatant(
      session.enemyView,
      panelLeft + panelWidth - PADDING - BAR_WIDTH / 2,
      panelTop + PADDING,
    );

    const logBottom = this.renderLog(session, panelLeft + PADDING, panelTop + 118, contentWidth);
    if (!session.isOver) {
      this.renderActions(session.playerActions, panelLeft + PADDING + 6, logBottom + 10, contentWidth - 12);
    }
    this.renderHint(
      panelLeft + panelWidth - PADDING,
      panelTop + PANEL_HEIGHT - PADDING + 4,
      session.isOver ? LABELS.closeHint : LABELS.selectHint,
    );
  }

  /** One combatant block: name above a health and a qi bar with values. */
  private renderCombatant(view: CombatantView, centerX: number, top: number): void {
    const nameText = this.scene.add
      .text(centerX, top, view.name, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(16),
        color: UI.combatantName,
      })
      .setOrigin(0.5, 0);
    this.container.add(nameText);

    this.renderBar(LABELS.health, view.health, centerX, top + 30, UI.barHealth);
    this.renderBar(LABELS.qi, view.qi, centerX, top + 30 + BAR_HEIGHT + BAR_GAP, UI.barQi);
  }

  /** One labeled resource bar: track, proportional fill and value text. */
  private renderBar(
    label: string,
    vital: { current: number; max: number },
    centerX: number,
    top: number,
    fillColor: number,
  ): void {
    const objects: Phaser.GameObjects.GameObject[] = [];

    const labelText = this.scene.add
      .text(centerX - BAR_WIDTH / 2, top, `${label}  ${vital.current}/${vital.max}`, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(11),
        color: UI.textMuted,
      })
      .setOrigin(0, 0);
    objects.push(labelText);

    const barTop = top + 15;
    const track = this.scene.add.rectangle(
      centerX,
      barTop + BAR_HEIGHT / 2,
      BAR_WIDTH,
      BAR_HEIGHT,
      UI.barTrack,
    );
    track.setStrokeStyle(1, UI.barStroke);
    objects.push(track);

    const ratio = vital.max <= 0 ? 0 : Math.max(0, Math.min(1, vital.current / vital.max));
    const fillWidth = BAR_WIDTH * ratio;
    if (fillWidth > 0) {
      const fill = this.scene.add.rectangle(
        centerX - BAR_WIDTH / 2 + fillWidth / 2,
        barTop + BAR_HEIGHT / 2,
        fillWidth,
        BAR_HEIGHT - 2,
        fillColor,
      );
      objects.push(fill);
    }

    this.container.add(objects);
  }

  /**
   * Battle log: renders up to six of the newest entries and keeps the block
   * inside a fixed height budget — when wrapped lines overflow, the oldest
   * entries are dropped so the latest action always stays visible. Returns
   * the y coordinate just below the rendered block.
   */
  private renderLog(
    session: CombatSession,
    left: number,
    top: number,
    contentWidth: number,
  ): number {
    const candidates = session.log.slice(-6);
    const measured: { text: Phaser.GameObjects.Text; height: number }[] = [];

    // Measure from the newest entry backwards, then keep the newest prefix
    // of the rendered list that fits the budget.
    const created: Phaser.GameObjects.Text[] = [];
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const entry = candidates[index];
      if (entry === undefined) {
        continue;
      }
      const color =
        entry.kind === 'player-action'
          ? UI.logPlayer
          : entry.kind === 'companion-action'
            ? UI.logCompanion
          : entry.kind === 'enemy-action'
            ? UI.logEnemy
            : entry.kind === 'enemy-idle'
              ? UI.textMuted
              : UI.logResult;
      const line = this.scene.add
        .text(left, 0, entry.text, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color,
          wordWrap: { width: contentWidth },
          lineSpacing: 3,
        })
        .setOrigin(0, 0);
      created.push(line);
      measured.push({ text: line, height: Math.max(21, line.height) });
    }

    let used = 0;
    let kept = 0;
    for (const item of measured) {
      if (used + item.height > LOG_HEIGHT_BUDGET && kept > 0) {
        break;
      }
      used += item.height;
      kept += 1;
    }

    const keptLines = created.slice(0, kept);
    let cursorY = top;
    for (const line of keptLines) {
      line.setPosition(left, cursorY);
      this.container.add(line);
      cursorY += Math.max(21, line.height);
    }
    for (const line of created.slice(kept)) {
      line.destroy();
    }

    if (this.notice !== null && !session.isOver) {
      const noticeLine = this.scene.add
        .text(left, cursorY, this.notice, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: UI.textWarn,
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0, 0);
      this.container.add(noticeLine);
      cursorY += Math.max(21, noticeLine.height);
    }

    return cursorY;
  }

  /** Action list plus the flee row, with the cursor and affordability states. */
  private renderActions(actions: readonly PlayerActionView[], left: number, top: number, width: number): void {
    let cursorY = top;
    const windowStart = Math.floor(this.selection / VISIBLE_ACTION_ROWS) * VISIBLE_ACTION_ROWS;
    for (let offset = 0; offset < VISIBLE_ACTION_ROWS; offset += 1) {
      const index = windowStart + offset;
      const action = actions[index];
      if (action === undefined) break;
      const active = index === this.selection;
      if (active) {
        addPixelSelection(this.scene, this.container, {
          x: left - 6,
          y: cursorY - 2,
          width,
          height: ACTION_LINE_HEIGHT,
        });
      }
      const line = this.scene.add
        .text(left, cursorY, actionLineText(action, active), {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(13),
          color: !action.affordable
            ? UI.actionDisabled
            : active
              ? UI.actionActive
              : UI.actionIdle,
        })
        .setOrigin(0, 0);
      this.container.add(line);
      cursorY += ACTION_LINE_HEIGHT;
    }

    const fleeActive = this.selection === actions.length;
    if (actions.length < windowStart + VISIBLE_ACTION_ROWS) {
      if (fleeActive) {
        addPixelSelection(this.scene, this.container, {
          x: left - 6,
          y: cursorY - 2,
          width,
          height: ACTION_LINE_HEIGHT,
        });
      }
      const fleeLine = this.scene.add
        .text(left, cursorY, `${fleeActive ? CURSOR_ACTIVE : CURSOR_IDLE}${LABELS.fleeAction}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(13),
          color: fleeActive ? UI.actionActive : UI.actionIdle,
        })
        .setOrigin(0, 0);
      this.container.add(fleeLine);
    }
  }

  /** Bottom-right key hint inside the panel. */
  private renderHint(right: number, bottom: number, text: string): void {
    const hint = this.scene.add
      .text(right, bottom, text, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textMuted,
      })
      .setOrigin(1, 1);
    this.container.add(hint);
  }
}
