import Phaser from 'phaser';

import { type DialogueData, DialogueSession } from '../engine/dialogue-graph';

/**
 * Generic keyboard-driven dialogue panel.
 *
 * Renders one {@link DialogueSession} over the scene: speaker name, node
 * text and the node's options. Up/Down (or W/S) move the selection, Enter
 * confirms an option — or ends the conversation on an option-less end node —
 * and Escape closes the panel at any time. All visible strings (speaker
 * name, node text, option text) come from the data; this class only draws
 * and forwards input, so no world content lives here.
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
  optionIdle: '#a8b2c4',
  optionActive: '#f0c96a',
  fontFamily: 'sans-serif',
} as const;

const PADDING = 22;
const NAME_LINE_HEIGHT = 24;
const OPTION_LINE_HEIGHT = 26;
const HINT_GAP = 12;
const CURSOR_ACTIVE = '▸ ';
const CURSOR_IDLE = '  ';

/** Keyboard bindings shared with scene movement (W/S) by design. */
type PanelKeyBinding = {
  key: Phaser.Input.Keyboard.Key;
  handler: () => void;
};

export interface DialoguePanelOptions {
  /** Invoked after the panel closed; the scene refreshes its HUD here. */
  onClose?: () => void;
}

export class DialoguePanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly optionTexts: Phaser.GameObjects.Text[] = [];
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;

  private session: DialogueSession | null = null;
  private speakerName = '';
  private selection = 0;
  private openState = false;

  constructor(scene: Phaser.Scene, options: DialoguePanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1000);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  /** Starts playing `conversation` spoken by `speakerName`. */
  open(conversation: DialogueData, speakerName: string): void {
    if (this.openState) {
      return;
    }
    this.session = new DialogueSession(conversation);
    this.speakerName = speakerName;
    this.selection = 0;
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
    this.optionTexts.length = 0;
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

  private moveSelection(delta: number): void {
    const count = this.session?.options.length ?? 0;
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
    if (session.isAtEndNode) {
      this.close(); // Enter on an end node ends the conversation.
      return;
    }
    session.choose(this.selection);
    this.selection = 0;
    this.renderNode();
  }

  /** Rebuilds every panel element for the session's current node. */
  private renderNode(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    this.container.removeAll(true);
    this.optionTexts.length = 0;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelWidth = Math.min(760, width - 96);
    const contentWidth = panelWidth - PADDING * 2;

    const nodeText = this.scene.add
      .text(0, 0, session.currentNode.text, {
        fontFamily: UI.fontFamily,
        fontSize: '14px',
        color: UI.textPrimary,
        lineSpacing: 6,
        wordWrap: { width: contentWidth },
      })
      .setOrigin(0, 0);

    const optionCount = session.options.length;
    const panelHeight =
      PADDING * 2 +
      NAME_LINE_HEIGHT +
      6 +
      nodeText.height +
      (optionCount > 0 ? HINT_GAP + optionCount * OPTION_LINE_HEIGHT : 0) +
      HINT_GAP +
      18;

    const left = (width - panelWidth) / 2;
    const top = height - 24 - panelHeight;

    const panel = this.scene.add.rectangle(
      left + panelWidth / 2,
      top + panelHeight / 2,
      panelWidth,
      panelHeight,
      UI.panelFill,
    );
    panel.setStrokeStyle(2, UI.panelStroke);
    this.container.add(panel);
    this.container.add(nodeText);

    const nameText = this.scene.add
      .text(left + PADDING, top + PADDING, this.speakerName, {
        fontFamily: UI.fontFamily,
        fontSize: '15px',
        color: UI.speaker,
      })
      .setOrigin(0, 0);
    this.container.add(nameText);

    nodeText.setPosition(left + PADDING, top + PADDING + NAME_LINE_HEIGHT);

    let cursorY = top + PADDING + NAME_LINE_HEIGHT + 6 + nodeText.height + HINT_GAP;
    session.options.forEach((option, index) => {
      const optionText = this.scene.add
        .text(left + PADDING + 8, cursorY, `${index === this.selection ? CURSOR_ACTIVE : CURSOR_IDLE}${option.text}`, {
          fontFamily: UI.fontFamily,
          fontSize: '13px',
          color: index === this.selection ? UI.optionActive : UI.optionIdle,
        })
        .setOrigin(0, 0);
      this.container.add(optionText);
      this.optionTexts.push(optionText);
      cursorY += OPTION_LINE_HEIGHT;
    });

    const hintText =
      optionCount > 0 ? '↑/↓ 选择 · Enter 确认 · Esc 关闭' : 'Enter / Esc 结束对话';
    const hint = this.scene.add
      .text(left + panelWidth - PADDING, top + panelHeight - PADDING - 4, hintText, {
        fontFamily: UI.fontFamily,
        fontSize: '10px',
        color: UI.textMuted,
      })
      .setOrigin(1, 1);
    this.container.add(hint);
  }

  /** Cheap refresh of the option cursor/colors after an Up/Down press. */
  private updateOptionStyles(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    this.optionTexts.forEach((text, index) => {
      const active = index === this.selection;
      const option = session.options.at(index);
      text.setText(`${active ? CURSOR_ACTIVE : CURSOR_IDLE}${option?.text ?? ''}`);
      text.setColor(active ? UI.optionActive : UI.optionIdle);
    });
  }
}
