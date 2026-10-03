/**
 * Round 269: in-session quest completion receipts and the one-shot journal focus.
 *
 * A completed quest's authored rewards say what was PROMISED, not what was
 * PAID: experience past the level cap is discarded by grantExperience, and a
 * save restored mid-session has no historical payout at all. This module keeps
 * those two truths separate:
 * - `QuestSessionFeedback` records what the scene's real grant path actually
 *   paid (paidExperience = grant minus the discarded ceiling overflow, plus
 *   currency, cultivation and the applied consequences). It only stores; it
 *   never grants anything, touches no save schema, and clears on every world
 *   (re)adoption so a restored run never inherits the previous run's ledger.
 * - `questSettlementBlocks` renders the honest line for each journal status:
 *   unpaid preview for offered/active rows, no-pay for failed ones, the real
 *   in-session receipt when one exists, and an explicit "no record" wording
 *   (never a fabricated payout) for completions that predate this session.
 */

import type { QuestStatus } from '../engine/quest-system';

/** What one completed quest actually paid out — this session only. */
export interface QuestSessionReceipt {
  readonly questId: string;
  /** Experience that really entered the character (grant minus ceiling discard). */
  readonly paidExperience: number;
  /** Experience discarded at the level cap, quoted so +paid never reads as +authored. */
  readonly discardedExperience: number;
  readonly currency: number;
  /** Cultivation points awarded for the levels gained (0 without a meridian set). */
  readonly cultivation: number;
  readonly factionRenown: readonly { readonly factionId: string; readonly delta: number }[];
  /** Knowledge nodes first discovered by this completion's consequences. */
  readonly discoveredKnowledgeNodeIds: readonly string[];
}

/**
 * Per-run completion feedback. The receipts live until the scene adopts a
 * (new or restored) world; the pending focus lives only until the next GLOBAL
 * journal open consumes it — NPC boards neither read nor clear it.
 */
export class QuestSessionFeedback {
  private readonly receiptMap = new Map<string, QuestSessionReceipt>();
  private pendingFocus: string | null = null;

  /**
   * Only the real grant path may call this (after grantExperience/currency/
   * consequences actually applied). Records keep the most recent receipt per
   * quest and the most recent completion becomes the pending focus.
   */
  recordCompletion(receipt: QuestSessionReceipt): void {
    this.receiptMap.set(receipt.questId, receipt);
    this.pendingFocus = receipt.questId;
  }

  receiptOf(questId: string): QuestSessionReceipt | undefined {
    return this.receiptMap.get(questId);
  }

  /** Test/inspection view of the pending focus; consumers use take… below. */
  peekPendingFocusQuestId(): string | null {
    return this.pendingFocus;
  }

  /** The next global Q open consumes the focus exactly once, stale or not. */
  takePendingFocusQuestId(): string | null {
    const pending = this.pendingFocus;
    this.pendingFocus = null;
    return pending;
  }

  /** A fresh world (restart, restored save, data reload) starts without receipts. */
  reset(): void {
    this.receiptMap.clear();
    this.pendingFocus = null;
  }
}

export interface QuestSettlementNameMaps {
  factionNames?: ReadonlyMap<string, string>;
  knowledgeNodeTitles?: ReadonlyMap<string, string>;
}

/**
 * The settlement block(s) for one quest's detail body. Status decides which
 * honest wording applies; a receipt is only consulted for completed rows and
 * never invented for the others.
 */
export function questSettlementBlocks(input: {
  status: QuestStatus | undefined;
  receipt: QuestSessionReceipt | undefined;
  maps?: QuestSettlementNameMaps;
}): string[] {
  if (input.status === 'failed') {
    return ['结算：差事已失败，报酬未发放'];
  }
  if (input.status !== 'completed') {
    // Offered, active or locked: the reward line above is a promise, not a payout.
    return ['结算：差事尚未完成，以上报酬未入账'];
  }
  const receipt = input.receipt;
  if (receipt === undefined) {
    return ['结算：本会话无到账记录（读档或场景重建后不可追溯），以上为差事约定报酬'];
  }
  const parts = [
    receipt.discardedExperience > 0
      ? `经验 +${receipt.paidExperience}（封顶弃${receipt.discardedExperience}）`
      : `经验 +${receipt.paidExperience}`,
    `银两 +${receipt.currency}`,
  ];
  if (receipt.cultivation > 0) parts.push(`修为 +${receipt.cultivation}`);
  for (const renown of receipt.factionRenown) {
    const name = input.maps?.factionNames?.get(renown.factionId) ?? renown.factionId;
    parts.push(`${name}声望 ${renown.delta > 0 ? '+' : ''}${renown.delta}`);
  }
  for (const nodeId of receipt.discoveredKnowledgeNodeIds) {
    parts.push(`新见闻「${input.maps?.knowledgeNodeTitles?.get(nodeId) ?? nodeId}」`);
  }
  return [`本次到账：${parts.join(' · ')}`];
}
