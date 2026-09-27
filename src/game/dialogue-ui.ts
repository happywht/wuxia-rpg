import Phaser from 'phaser';

import {
  type DialogueData,
  type DialogueNodeData,
  DialogueSession,
} from '../engine/dialogue-graph';
import type { VisibleDialogueOption } from '../engine/dialogue-runtime';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY } from './ui-theme';

/**
 * Generic keyboard-driven dialogue panel.
 *
 * Renders one {@link DialogueSession} over the scene: speaker name, node
 * text, an optional effect-feedback line and the node's currently offered
 * options. Up/Down (or W/S) move the selection, Enter confirms an option —
 * or ends the conversation on a node without visible options — and Escape
 * closes the panel at any time. All visible strings (speaker name, node
 * text, option text) come from the data; this class only draws and forwards
 * input, so no world content lives here.
 *
 * Round 08: a host-supplied {@link DialogueHostController} filters options
 * by runtime conditions and executes option effects atomically before the
 * session advances; its feedback line (gains, quest results, refusals)
 * stays visible until the next confirm. Without a controller the panel
 * falls back to showing every option as a plain transition, which keeps
 * unconditional legacy conversations fully playable. A node whose options
 * all filter out behaves as an end node — Enter/Esc close instead of
 * locking the keyboard.
 *
 * While the panel is open the owning scene is expected to ignore movement
 * input (`isOpen` is the gate); keys are bound on open and unbound on close.
 */

const UI = {
  panelFill: 0x10141d,
  panelStroke: 0x3a4a63,
  speaker: '#e8b04b',
  textPrimary: '#d8dee9',
  textMuted: '#8a94a6',
  feedback: '#a8d8b0',
  feedbackWarn: '#e8b04b',
  optionIdle: '#a8b2c4',
  optionActive: '#f0c96a',
  fontFamily: UI_FONT_FAMILY,
} as const;

const PADDING = 22;
const NAME_LINE_HEIGHT = 24;
const OPTION_LINE_HEIGHT = 26;
const FEEDBACK_LINE_HEIGHT = 18;
const HINT_GAP = 12;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';

/** Keyboard bindings shared with scene movement (W/S) by design. */
type PanelKeyBinding = {
  key: Phaser.Input.Keyboard.Key;
  handler: () => void;
};

export interface DialogueConfirmOutcome {
  /** False when effects were refused; the session stays on the current node. */
  advanced: boolean;
  /** One feedback line (gains / quest result / refusal reason) or null. */
  feedback: string | null;
}

/**
 * Host-supplied Round 08 controller. `visibleOptions` runs the runtime
 * condition filter; `confirmOption` executes the option's effects
 * atomically, advances the session only on success and reports feedback.
 */
export interface DialogueHostController {
  visibleOptions(node: DialogueNodeData): readonly VisibleDialogueOption[];
  confirmOption(session: DialogueSession, visibleIndex: number): DialogueConfirmOutcome;
}

export interface DialoguePanelOptions {
  /** Invoked after the panel closed; the scene refreshes its HUD here. */
  onClose?: () => void;
}

export class DialoguePanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;

  private session: DialogueSession | null = null;
  private controller: DialogueHostController | null = null;
  private speakerName = '';
  private selection = 0;
  private feedback: string | null = null;
  private feedbackWarn = false;
  private openState = false;

  constructor(scene: Phaser.Scene, options: DialoguePanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1000);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /**
   * Starts playing `conversation` spoken by `speakerName`. The optional
   * controller filters options and executes effects; without it every
   * option plays as a plain transition (legacy behaviour).
   */
  open(
    conversation: DialogueData,
    speakerName: string,
    controller: DialogueHostController | null = null,
  ): void {
    if (this.openState) {
      return;
    }
    this.session = new DialogueSession(conversation);
    this.controller = controller;
    this.speakerName = speakerName;
    this.selection = 0;
    this.feedback = null;
    this.feedbackWarn = false;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.renderNode();
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
    this.controller = null;
    this.feedback = null;
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
      [KeyCodes.ESC, () => this.close()],
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

  /** Condition-filtered options of the current node (all when unconditional). */
  private visibleOptions(): readonly VisibleDialogueOption[] {
    const session = this.session;
    if (session === null) {
      return [];
    }
    if (this.controller !== null) {
      return this.controller.visibleOptions(session.currentNode);
    }
    return session.options.map((option, index) => ({ index, option }));
  }

  private moveSelection(delta: number): void {
    const count = this.visibleOptions().length;
    if (count === 0) {
      return;
    }
    this.selection = (this.selection + delta + count) % count;
    this.updateOptionStyles();
  }

  private confirm(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    const visible = this.visibleOptions();
    if (visible.length === 0) {
      this.close(); // Enter on an (effectively) option-less node ends the talk.
      return;
    }
    if (this.controller !== null) {
      const outcome = this.controller.confirmOption(session, this.selection);
      this.feedback = outcome.feedback;
      this.feedbackWarn = !outcome.advanced;
      this.selection = outcome.advanced ? 0 : this.selection;
      this.renderNode();
      return;
    }
    const choice = visible[this.selection];
    if (choice !== undefined) {
      session.choose(choice.index);
    }
    this.selection = 0;
    this.feedback = null;
    this.renderNode();
  }

  /** Rebuilds every panel element for the session's current node. */
  private renderNode(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    this.container.removeAll(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelWidth = Math.min(760, width - 96);
    const contentWidth = panelWidth - PADDING * 2;
    const visible = this.visibleOptions();
    this.selection = Math.min(this.selection, Math.max(0, visible.length - 1));

    const nodeText = this.scene.add
      .text(0, 0, session.currentNode.text, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(14),
        color: UI.textPrimary,
        lineSpacing: 6,
        wordWrap: { width: contentWidth },
      })
      .setOrigin(0, 0);

    const optionCount = visible.length;
    const feedbackHeight = this.feedback === null ? 0 : FEEDBACK_LINE_HEIGHT + HINT_GAP / 2;
    const panelHeight =
      PADDING * 2 +
      NAME_LINE_HEIGHT +
      6 +
      nodeText.height +
      feedbackHeight +
      (optionCount > 0 ? HINT_GAP + optionCount * OPTION_LINE_HEIGHT : 0) +
      HINT_GAP +
      18;

    const left = (width - panelWidth) / 2;
    const top = height - 24 - panelHeight;

    addPixelPanelChrome(this.scene, this.container, {
      x: left,
      y: top,
      width: panelWidth,
      height: panelHeight,
    });
    this.container.add(nodeText);

    const nameText = this.scene.add
      .text(left + PADDING, top + PADDING, this.speakerName, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(15),
        color: UI.speaker,
      })
      .setOrigin(0, 0);
    this.container.add(nameText);

    nodeText.setPosition(left + PADDING, top + PADDING + NAME_LINE_HEIGHT);

    let cursorY = top + PADDING + NAME_LINE_HEIGHT + 6 + nodeText.height;
    if (this.feedback !== null) {
      const feedbackText = this.scene.add
        .text(left + PADDING, cursorY + HINT_GAP / 2, `—— ${this.feedback}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(12),
          color: this.feedbackWarn ? UI.feedbackWarn : UI.feedback,
          wordWrap: { width: contentWidth },
        })
        .setOrigin(0, 0);
      this.container.add(feedbackText);
      cursorY += feedbackHeight;
    }

    cursorY += HINT_GAP;
    visible.forEach(({ option }, index) => {
      if (index === this.selection) {
        addPixelSelection(this.scene, this.container, {
          x: left + PADDING,
          y: cursorY - 2,
          width: contentWidth,
          height: OPTION_LINE_HEIGHT,
        });
      }
      const optionText = this.scene.add
        .text(left + PADDING + 8, cursorY, `${index === this.selection ? CURSOR_ACTIVE : CURSOR_IDLE}${option.text}`, {
          fontFamily: UI.fontFamily,
          fontSize: uiFontSize(13),
          color: index === this.selection ? UI.optionActive : UI.optionIdle,
        })
        .setOrigin(0, 0);
      this.container.add(optionText);
      cursorY += OPTION_LINE_HEIGHT;
    });

    const hintText =
      optionCount > 0 ? '↑/↓ 选择 · Enter 确认 · Esc 关闭' : 'Enter / Esc 结束对话';
    const hint = this.scene.add
      .text(left + panelWidth - PADDING, top + panelHeight - PADDING - 4, hintText, {
        fontFamily: UI.fontFamily,
        fontSize: uiFontSize(10),
        color: UI.textMuted,
      })
      .setOrigin(1, 1);
    this.container.add(hint);
  }

  /** Rebuilds the option rows so the focus band follows the current choice. */
  private updateOptionStyles(): void {
    this.renderNode();
  }
}
