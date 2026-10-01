/**
 * Round 140: pure quest-abandon confirmation projection and state machine
 * (Phaser-free).
 *
 * Abandoning an active quest is the one irreversible player action in the
 * journal, so the A key first opens a measured, paginated confirmation: the
 * exact authored quest name, the permanent failure, no rewards, and every
 * successor that stays locked forever. The choice starts on cancel, Enter on
 * cancel just closes the prompt, and Confirm may only commit after every body
 * page has been read — then the engine's abandonQuest revalidates the stored
 * quest id and active status exactly once.
 */
import {
  type QuestData,
  type QuestJournal,
  type QuestUpdateResult,
  abandonQuest,
} from '../engine/quest-system';
import { paginateQuestDetail } from './quest-panel-layout';

export type AbandonChoice = 'cancel' | 'confirm';

export interface QuestAbandonConfirmationState {
  /** Stored at prompt time; Confirm revalidates this id, never the selection. */
  readonly questId: string;
  readonly questName: string;
  /** Measured, lossless body pages (wrapDialogueText + block pagination). */
  readonly bodyPages: readonly string[];
  page: number;
  /** Starts on cancel: Enter without an explicit move keeps the quest. */
  choice: AbandonChoice;
  /** Sticky: once the reader reached the final page, all pages were read. */
  readAllPages: boolean;
}

export interface AbandonConfirmationGeometry {
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

export interface AbandonConfirmationGeometryInput {
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
 * body takes whatever remains (never below one line), so the prompt stays
 * readable at the maximum font scale on the narrowest canvas.
 */
export function buildAbandonConfirmationGeometry(input: AbandonConfirmationGeometryInput): AbandonConfirmationGeometry {
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

/** Successors still gated by this quest: their prerequisites name it and their current status is locked. */
export function questSuccessorNames(
  quests: ReadonlyMap<string, QuestData>,
  journal: QuestJournal,
  questId: string,
): string[] {
  const names: string[] = [];
  for (const quest of quests.values()) {
    if (quest.id === questId) continue;
    if (!quest.prerequisiteQuestIds.includes(questId)) continue;
    if (journal.states.get(quest.id)?.status !== 'locked') continue;
    names.push(quest.name);
  }
  return names;
}

/** Assembles the confirmation body blocks losslessly for the measured pager. */
export function buildQuestAbandonBlocks(quest: QuestData, successorNames: readonly string[]): string[] {
  const blocks = [
    `拟放弃差事：「${quest.name}」`,
    '放弃会立即把这项差事记为已失败——这是最终结果，永久无法重新接取。',
    '不会发放任何报酬：经验、银两、声望与见闻都不会支付。',
  ];
  if (successorNames.length > 0) {
    blocks.push(`以下后续差事将永远保持「前置未完成」，无法解锁：${successorNames.join('、')}。`);
  }
  blocks.push('读完全部说明后，方可选择「永久放弃」。');
  return blocks;
}

/** Wraps and paginates the blocks at the real measured width and band capacity. */
export function createQuestAbandonConfirmation(input: {
  quest: QuestData;
  successorNames: readonly string[];
  width: number;
  capacity: number;
  measure: (text: string) => number;
}): QuestAbandonConfirmationState {
  const pages = paginateQuestDetail(
    buildQuestAbandonBlocks(input.quest, input.successorNames),
    input.width,
    input.capacity,
    input.measure,
  );
  return {
    questId: input.quest.id,
    questName: input.quest.name,
    bodyPages: pages,
    page: 0,
    choice: 'cancel',
    readAllPages: pages.length <= 1,
  };
}

/** Two-choice cyclic move shared with the row list's feel. */
export function moveAbandonChoice(state: QuestAbandonConfirmationState, delta: number): void {
  const options: AbandonChoice[] = ['cancel', 'confirm'];
  const index = options.indexOf(state.choice);
  state.choice = options[(index + delta + options.length) % options.length]!;
}

/** Linear page walk (no wrap); reaching the final page latches the read gate. */
export function turnAbandonPage(state: QuestAbandonConfirmationState, step: number): void {
  if (state.bodyPages.length <= 1) return;
  const next = Math.min(state.bodyPages.length - 1, Math.max(0, state.page + step));
  state.page = next;
  if (next >= state.bodyPages.length - 1) state.readAllPages = true;
}

export type AbandonConfirmationOutcome =
  | { kind: 'cancelled' }
  | { kind: 'not-read' }
  | { kind: 'stale'; reason: string }
  | { kind: 'abandoned'; update: QuestUpdateResult };

/**
 * Commit path: Enter on cancel keeps the quest; Enter on Confirm only fires
 * when every body page was read, and the engine then revalidates the stored
 * quest id plus its active status — a status change since the prompt opened
 * degrades to a readable stale outcome instead of a silent failure.
 */
export function submitAbandonConfirmation(
  state: QuestAbandonConfirmationState,
  journal: QuestJournal,
): AbandonConfirmationOutcome {
  if (state.choice === 'cancel') return { kind: 'cancelled' };
  if (!state.readAllPages) return { kind: 'not-read' };
  const result = abandonQuest(journal, state.questId);
  if (!result.ok) return { kind: 'stale', reason: result.reason };
  return { kind: 'abandoned', update: result.update };
}

/** Terminal explanation appended to a failed row's detail: no retry promised, other work named. */
export function buildFailedQuestTerminalBlocks(input: {
  quest: QuestData;
  offeredQuestNames: readonly string[];
}): string[] {
  const blocks = [
    '这项差事已终止为失败：失败是最终结果，无法重新接取原差事。',
  ];
  if (input.offeredQuestNames.length > 0) {
    blocks.push(`仍可另接其他已开放的差事继续行事：${input.offeredQuestNames.join('、')}。`);
  } else {
    blocks.push('眼下没有立即开放的差事，可向各处托付人探问新的差事。');
  }
  return blocks;
}
