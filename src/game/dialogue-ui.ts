import Phaser from 'phaser';

import {
  type DialogueData,
  type DialogueNodeData,
  DialogueSession,
} from '../engine/dialogue-graph';
import type { VisibleDialogueOption } from '../engine/dialogue-runtime';
import { uiFontSize } from './settings';
import { wrapDialogueText, paginateDialogueLines, dialogueConfirmAction } from './dialogue-layout';
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
const CURSOR_ACTIVE = '▸ ';

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
  oralPrerequisites?(node: DialogueNodeData): string;
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
  private bodyPage = 0;
  private optionPage = 0;
  private bodyPages: string[] = [''];
  private optionPages: string[] = [''];

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
    this.bodyPage = 0;
    this.optionPage = 0;
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
      [KeyCodes.PAGE_UP, () => this.changePage(-1, false)],
      [KeyCodes.PAGE_DOWN, () => this.changePage(1, false)],
      [KeyCodes.LEFT, () => this.changePage(-1, true)],
      [KeyCodes.RIGHT, () => this.changePage(1, true)],
      [KeyCodes.TAB, () => { if (this.session && this.controller?.oralPrerequisites) { this.feedback = this.controller.oralPrerequisites(this.session.currentNode); this.feedbackWarn = false; this.bodyPage = 0; this.renderNode(); } }],
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
    this.optionPage = 0;
    this.renderNode();
  }

  private confirm(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    const action = dialogueConfirmAction(this.bodyPage, this.bodyPages.length, this.optionPage, this.optionPages.length);
    if (action !== 'confirm') { this.changePage(1, action === 'option'); return; }
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
      this.bodyPage = 0;
      this.optionPage = 0;
      this.renderNode();
      return;
    }
    const choice = visible[this.selection];
    if (choice !== undefined) {
      session.choose(choice.index);
    }
    this.selection = 0;
    this.bodyPage = 0;
    this.optionPage = 0;
    this.feedback = null;
    this.renderNode();
  }

  private changePage(delta: number, option: boolean): void {
    if (option) this.optionPage = Math.max(0, Math.min(this.optionPages.length - 1, this.optionPage + delta));
    else this.bodyPage = Math.max(0, Math.min(this.bodyPages.length - 1, this.bodyPage + delta));
    this.renderNode();
  }

  /** Bounded panel: all body, feedback and option text remains keyboard-readable. */
  private renderNode(): void {
    const session = this.session;
    if (session === null) return;
    this.container.removeAll(true);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panelWidth = Math.min(760, width - 48);
    const panelHeight = Math.min(420, height - 48);
    const left = (width - panelWidth) / 2;
    const top = height - 24 - panelHeight;
    const contentWidth = panelWidth - PADDING * 2;
    const visible = this.visibleOptions();
    this.selection = Math.min(this.selection, Math.max(0, visible.length - 1));
    const bodyFont = Number.parseInt(uiFontSize(14), 10);
    const optionFont = Number.parseInt(uiFontSize(13), 10);
    const bodyLineHeight = bodyFont + 6;
    const optionLineHeight = optionFont + 6;
    const optionHeight = visible.length > 0 ? Math.max(80, optionLineHeight * 3) : 0;
    const hintHeight = 44;
    const bodyHeight = panelHeight - PADDING * 2 - NAME_LINE_HEIGHT - hintHeight - optionHeight - 16;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width: panelWidth, height: panelHeight }, 0.35);
    const makeText = (x: number, y: number, text: string, size: string, color: string) => {
      const label = this.scene.add.text(x, y, text, { fontFamily: UI.fontFamily, fontSize: size, color, lineSpacing: 6 }).setOrigin(0, 0);
      this.container.add(label);
      return label;
    };
    makeText(left + PADDING, top + PADDING, this.speakerName, uiFontSize(15), UI.speaker);
    const body = makeText(left + PADDING, top + PADDING + NAME_LINE_HEIGHT, '', uiFontSize(14), UI.textPrimary);
    body.setText('测'); // Initialize canvas font metrics before measuring mixed scripts.
    const source = session.currentNode.text + (this.feedback === null ? '' : `\n\n—— ${this.feedback}`);
    this.bodyPages = paginateDialogueLines(wrapDialogueText(source, contentWidth - 8, value => body.context.measureText(value).width), Math.floor(bodyHeight / bodyLineHeight));
    this.bodyPage = Math.min(this.bodyPage, this.bodyPages.length - 1);
    body.setText(this.bodyPages[this.bodyPage]!);
    if (this.feedbackWarn) body.setColor(UI.feedbackWarn);
    const choice = visible[this.selection];
    this.optionPages = [''];
    if (choice !== undefined) {
      const optionY = top + panelHeight - PADDING - hintHeight - optionHeight;
      addPixelSelection(this.scene, this.container, { x: left + PADDING, y: optionY, width: contentWidth, height: optionHeight });
      const label = makeText(left + PADDING + 8, optionY + 4, '测', uiFontSize(13), UI.optionActive);
      this.optionPages = paginateDialogueLines(wrapDialogueText(CURSOR_ACTIVE + choice.option.text, contentWidth - 24, value => label.context.measureText(value).width), Math.floor((optionHeight - 12) / optionLineHeight));
      this.optionPage = Math.min(this.optionPage, this.optionPages.length - 1);
      label.setText(this.optionPages[this.optionPage]!);
    }
    const status = `正文 ${this.bodyPage + 1}/${this.bodyPages.length}` + (choice === undefined ? '' : ` · 选项 ${this.selection + 1}/${visible.length} · 选项页 ${this.optionPage + 1}/${this.optionPages.length}`);
    makeText(left + PADDING, top + panelHeight - PADDING - hintHeight + 4, status, uiFontSize(10), UI.textMuted);
    makeText(left + PADDING, top + panelHeight - PADDING - 18, '↑/↓ 选项 · Tab 转述条件 · PgUp/PgDn 正文 · ←/→ 选项页 · Enter 翻页/确认 · Esc 关闭', uiFontSize(10), UI.textMuted);
  }
}
