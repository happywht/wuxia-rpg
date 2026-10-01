/**
 * Round 143: pure save-overwrite confirmation projection and state machine
 * (Phaser-free).
 *
 * Overwriting a non-empty slot is the save page's one destructive storage
 * action, so Enter first opens a measured, paginated confirmation: the exact
 * slot label, the character name/level and the old saved timestamp inside the
 * slot (or the readable reason the payload cannot be loaded), and the
 * permanent replacement consequence. The choice starts on cancel — Enter
 * without an explicit move keeps the old save — and Confirm may only commit
 * after every body page has been read. Committing re-reads the same storage
 * key and compares it against the opaque raw payload captured at prompt
 * time: any change underneath (another tab saved, a repaired or re-corrupted
 * slot, even a byte-different payload behind an identical summary) refuses
 * the write and asks for a fresh confirmation. The raw payload lives in
 * memory only and is never rendered or logged.
 */
import {
  SAVE_KEY_PREFIX,
  formatSavedAt,
  parseSaveSnapshot,
  type SaveSlotId,
  type SaveStorage,
} from '../engine/save-system';
import { paginateDialogueBlocks, wrapDialogueText } from './dialogue-layout';

export type SaveOverwriteChoice = 'cancel' | 'confirm';

/** Readable prompt facts derived from the captured raw payload (never throws). */
export interface SaveOverwritePayloadFacts {
  displayName: string | null;
  level: number | null;
  savedAtText: string | null;
  /** Present iff the payload cannot be loaded as a save (corrupt/version). */
  damageNote: string | null;
}

export interface SaveOverwriteConfirmationState {
  /** Stored at prompt time; the commit recheck targets exactly this slot. */
  readonly slotId: SaveSlotId;
  readonly slotLabel: string;
  readonly facts: SaveOverwritePayloadFacts;
  /**
   * Opaque raw slot text captured at prompt time. In-memory only: it feeds
   * the commit recheck and is never rendered or logged.
   */
  readonly rawPayload: string | null;
  /** Measured, lossless body pages (wrapDialogueText + block pagination). */
  readonly bodyPages: readonly string[];
  page: number;
  /** Starts on cancel: Enter without an explicit move keeps the old save. */
  choice: SaveOverwriteChoice;
  /** Sticky: once the reader reached the final page, all pages were read. */
  readAllPages: boolean;
}

export interface SaveOverwriteGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  contentWidth: number;
  bodyTop: number;
  /** At least one readable body line at any live font scale. */
  bodyCapacity: number;
  choiceTop: number;
  hintTop: number;
}

export interface SaveOverwriteGeometryInput {
  viewWidth: number;
  viewHeight: number;
  titleHeight: number;
  bodyLineHeight: number;
  choiceHeight: number;
  hintHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  padding?: number;
}

/**
 * Reserves the hint and the two choice rows from the bottom edge first; the
 * body takes whatever remains (never below one line), so the confirmation
 * stays readable at the maximum font scale on the narrowest canvas.
 */
export function buildSaveOverwriteGeometry(input: SaveOverwriteGeometryInput): SaveOverwriteGeometry {
  const padding = input.padding ?? 24;
  const width = Math.min(input.maxWidth ?? 560, Math.max(260, input.viewWidth - 80));
  const height = Math.min(input.maxHeight ?? 360, Math.max(200, input.viewHeight - 80));
  const left = Math.round((input.viewWidth - width) / 2);
  const top = Math.round((input.viewHeight - height) / 2);
  const hintTop = top + height - 10 - input.hintHeight;
  const choiceTop = hintTop - 4 - 2 * input.choiceHeight;
  const bodyTop = top + 16 + input.titleHeight + 8;
  const capacity = Math.floor((choiceTop - 6 - bodyTop) / input.bodyLineHeight);
  return {
    left, top, width, height,
    contentWidth: width - padding * 2,
    bodyTop,
    bodyCapacity: Math.max(1, capacity),
    choiceTop, hintTop,
  };
}

/** Parses the captured raw payload into prompt facts; hostile text never throws. */
export function describeSaveOverwritePayload(raw: string): SaveOverwritePayloadFacts {
  const failed = (note: string): SaveOverwritePayloadFacts => ({
    displayName: null, level: null, savedAtText: null, damageNote: note,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failed('存档 JSON 无法解析');
  }
  const result = parseSaveSnapshot(parsed);
  if (!result.ok) {
    return failed(result.message);
  }
  return {
    displayName: result.snapshot.displayName,
    level: result.snapshot.player.level,
    savedAtText: formatSavedAt(result.snapshot.savedAt),
    damageNote: null,
  };
}

/** Assembles the confirmation body blocks losslessly for the measured pager. */
export function buildSaveOverwriteBlocks(input: {
  slotLabel: string;
  facts: SaveOverwritePayloadFacts;
}): string[] {
  const { facts } = input;
  const blocks = [`拟覆盖存档：${input.slotLabel}`];
  if (facts.damageNote !== null) {
    blocks.push(`该槽现有无法读取的存档（${facts.damageNote}）。保存会替换这些数据。`);
  } else {
    blocks.push(
      `槽中已有进度：${facts.displayName ?? '未知侠名'} Lv.${facts.level ?? '?'} · 保存于 ${facts.savedAtText ?? '未知时间'}`,
    );
  }
  blocks.push('确认后，上述旧进度将被本次进度永久替换，无法找回。');
  blocks.push('读完全部说明后，方可选择「确认覆盖」。');
  return blocks;
}

/** Wraps and paginates the blocks at the real measured width and capacity. */
export function createSaveOverwriteConfirmation(input: {
  slotId: SaveSlotId;
  slotLabel: string;
  facts: SaveOverwritePayloadFacts;
  rawPayload: string | null;
  width: number;
  capacity: number;
  measure: (text: string) => number;
}): SaveOverwriteConfirmationState {
  const lines: string[] = [];
  const blocks = buildSaveOverwriteBlocks({ slotLabel: input.slotLabel, facts: input.facts });
  for (const [index, block] of blocks.entries()) {
    if (index > 0) lines.push(''); // Blank separators feed the block pager.
    lines.push(...wrapDialogueText(block, Math.max(1, input.width), input.measure));
  }
  const pages = paginateDialogueBlocks(lines, input.capacity);
  return {
    slotId: input.slotId,
    slotLabel: input.slotLabel,
    facts: input.facts,
    rawPayload: input.rawPayload,
    bodyPages: pages,
    page: 0,
    choice: 'cancel',
    readAllPages: pages.length <= 1,
  };
}

/** Two-choice cyclic move shared with the row list's feel. */
export function moveSaveOverwriteChoice(state: SaveOverwriteConfirmationState, delta: number): void {
  const options: SaveOverwriteChoice[] = ['cancel', 'confirm'];
  const index = options.indexOf(state.choice);
  state.choice = options[(index + delta + options.length) % options.length]!;
}

/** Linear page walk (no wrap); reaching the final page latches the read gate. */
export function turnSaveOverwritePage(state: SaveOverwriteConfirmationState, step: number): void {
  if (state.bodyPages.length <= 1) return;
  const next = Math.min(state.bodyPages.length - 1, Math.max(0, state.page + step));
  state.page = next;
  if (next >= state.bodyPages.length - 1) state.readAllPages = true;
}

export type SaveOverwritePrecheck =
  | { kind: 'unchanged' }
  | { kind: 'changed'; message: string }
  | { kind: 'unavailable'; message: string };

/**
 * Commit guard: re-reads the exact slot key and compares the opaque raw
 * payload captured at prompt time. Any difference — a new save, a deleted
 * slot, a byte-level change behind an identical summary — or a storage error
 * refuses the write; the caller refreshes its slot list and requires a fresh
 * confirmation before anything may be written.
 */
export function verifySaveOverwriteTarget(
  storage: SaveStorage,
  state: SaveOverwriteConfirmationState,
): SaveOverwritePrecheck {
  let raw: string | null;
  try {
    raw = storage.read(`${SAVE_KEY_PREFIX}${state.slotId}`);
  } catch {
    return { kind: 'unavailable', message: '浏览器本地存储当前不可用，本次未写入存档' };
  }
  if (raw !== state.rawPayload) {
    return { kind: 'changed', message: '该槽存档在确认期间发生了变化，本次未写入，请重新查看后再确认' };
  }
  return { kind: 'unchanged' };
}

/** Grapheme-truncates control hints with an ellipsis until they fit the width. */
export function truncateGrapheme(value: string, maxWidth: number, measure: (text: string) => number): string {
  if (value.length === 0 || measure(value) <= maxWidth) return value;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let kept = '';
  for (const { segment } of segmenter.segment(value)) {
    if (measure(kept + segment + '…') > maxWidth) break;
    kept += segment;
  }
  return `${kept}…`;
}
