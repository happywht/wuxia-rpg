/**
 * Round 273 dialogue world-time protocol: a generic `advanceTime` effect.
 *
 * Unlike the deferred external requests (battle/teleport settle after the
 * panel closes), world time is part of the atomic effect transaction: the
 * staged context carries a clock port, validation runs against it and only
 * the final commit advances the real clock — a refused option never moves
 * time, and no post-commit callback can be skipped to dodge the cost.
 */

/** Upper bound mirrors the teleport `travelMinutes` protocol scale (7 days). */
export const MAX_DIALOGUE_ADVANCE_MINUTES = 10080;

/**
 * Minimal mutable clock port. `GameClock` satisfies this structurally, so the
 * scene hands its live clock in and the runtime commits straight into it.
 */
export interface DialogueClockPort {
  readonly elapsedMinutes: number;
  advance(minutes: number): boolean;
}

/** One validated world-time advance request. */
export interface DialogueTimeAdvanceRequest {
  minutes: number;
}

export type DialogueTimeAdvanceResult =
  | { ok: true; request: DialogueTimeAdvanceRequest }
  | { ok: false; reason: string };

/**
 * Validates one `advanceTime` effect against the transaction clock: minutes
 * must be a bounded positive integer and the resulting elapsed counter must
 * stay a safe integer. Absent clocks (legacy headless consumers) refuse with
 * a readable reason instead of silently dropping the cost.
 */
export function preflightDialogueTime(
  effect: { minutes: number },
  clock: DialogueClockPort | undefined,
): DialogueTimeAdvanceResult {
  if (clock === undefined) {
    return { ok: false, reason: '当前没有世界时钟，无法计入耗时' };
  }
  if (!Number.isSafeInteger(clock.elapsedMinutes) || clock.elapsedMinutes < 0) {
    return { ok: false, reason: '世界时钟状态无效，无法计入耗时' };
  }
  if (!Number.isSafeInteger(effect.minutes) || effect.minutes <= 0) {
    return { ok: false, reason: '耗时须为正的整数分钟' };
  }
  if (effect.minutes > MAX_DIALOGUE_ADVANCE_MINUTES) {
    return { ok: false, reason: `单次耗时至多 ${MAX_DIALOGUE_ADVANCE_MINUTES} 分钟` };
  }
  if (!Number.isSafeInteger(clock.elapsedMinutes + effect.minutes)) {
    return { ok: false, reason: '世界时间累计已到上限，无法继续计入耗时' };
  }
  return { ok: true, request: { minutes: effect.minutes } };
}

/** Mechanical protocol label for the feedback line (whole days collapse). */
export function formatDialogueAdvanceMinutes(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return `世界时间 +${minutes / 1440} 日`;
  }
  return `世界时间 +${minutes} 分钟`;
}

/**
 * Staged clock used inside one effect transaction: collects advances without
 * touching the real port so a later refusal discards the whole time cost.
 */
export class StagedDialogueClock implements DialogueClockPort {
  private minutes: number;

  constructor(elapsedMinutes: number) {
    this.minutes = Number.isSafeInteger(elapsedMinutes) && elapsedMinutes >= 0 ? elapsedMinutes : 0;
  }

  get elapsedMinutes(): number {
    return this.minutes;
  }

  advance(minutes: number): boolean {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) return false;
    const next = this.minutes + minutes;
    if (!Number.isSafeInteger(next)) return false;
    this.minutes = next;
    return true;
  }

  /** Commits the staged elapsed counter into the live port (delta advance). */
  commitTo(target: DialogueClockPort): boolean {
    return target.advance(this.minutes - target.elapsedMinutes);
  }
}
