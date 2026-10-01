/**
 * Round 119: pure quest-panel layout and detail pagination (Phaser-free).
 *
 * The panel's bands derive from measured text heights — never fixed slots —
 * so the maximum font scale and narrow canvases keep the row list, the
 * complete detail body and the accessible footer/status mutually disjoint.
 * Detail content is assembled losslessly (description, every objective with
 * live progress, the full reward line) and paginated with blank-line-aware
 * blocks, so no authored or MOD-length text is ever dropped to fit.
 */
import type { QuestData, QuestProgressState } from '../engine/quest-system';
import { paginateDialogueBlocks, wrapDialogueText } from './dialogue-layout';

export interface QuestPanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  contentWidth: number;
  listTop: number;
  rowHeight: number;
  /** Row capacity actually offered (1..maxVisibleRows) at the live font scale. */
  visibleRows: number;
  detailTop: number;
  detailLineHeight: number;
  /** At least one readable detail line whenever any row shows. */
  detailCapacity: number;
  statusTop: number;
  hintTop: number;
}

export interface QuestPanelGeometryInput {
  viewWidth: number;
  viewHeight: number;
  titleHeight: number;
  subtitleHeight: number;
  rowHeight: number;
  detailLineHeight: number;
  statusHeight: number;
  hintHeight: number;
  /** Classic row ceiling; the band may hold fewer at large font scales. */
  maxVisibleRows?: number;
  padding?: number;
  listGap?: number;
}

/**
 * Reserves the footer (hint, then status above it) from the bottom edge
 * first, then splits the remaining band between rows and the detail body:
 * rows shrink from the classic ceiling before the detail reserve drops
 * below two lines, and never into a band too short to hold them.
 */
export function buildQuestPanelGeometry(input: QuestPanelGeometryInput): QuestPanelGeometry {
  const padding = input.padding ?? 24;
  const gap = input.listGap ?? 8;
  const maxRows = input.maxVisibleRows ?? 6;
  const width = Math.min(720, Math.max(280, input.viewWidth - 40));
  const height = Math.min(440, Math.max(240, input.viewHeight - 40));
  const left = Math.round((input.viewWidth - width) / 2);
  const top = Math.round((input.viewHeight - height) / 2);
  const hintTop = top + height - 10 - input.hintHeight;
  const statusTop = hintTop - 2 - input.statusHeight;
  const listTop = top + 16 + input.titleHeight + 6 + input.subtitleHeight + 8;
  const middle = Math.max(0, statusTop - 6 - listTop);
  let visibleRows = Math.min(maxRows, Math.max(1, Math.floor((middle - gap - 2 * input.detailLineHeight) / input.rowHeight)));
  if (visibleRows <= 0) visibleRows = 1;
  let detailCapacity = Math.floor((middle - gap - visibleRows * input.rowHeight) / input.detailLineHeight);
  // Comfort ladder: two detail lines are comfortable, one is still readable;
  // only then may the row ceiling shrink further (already at its floor).
  if (detailCapacity < 1) {
    detailCapacity = Math.max(1, Math.floor((middle - gap - input.rowHeight) / input.detailLineHeight));
    visibleRows = 1;
  }
  const detailTop = listTop + visibleRows * input.rowHeight + gap;
  return {
    left, top, width, height,
    contentWidth: width - padding * 2,
    listTop, rowHeight: input.rowHeight, visibleRows,
    detailTop, detailLineHeight: input.detailLineHeight,
    detailCapacity: Math.max(1, detailCapacity),
    statusTop, hintTop,
  };
}

export interface QuestDetailNameMaps {
  factionNames?: ReadonlyMap<string, string>;
  knowledgeNodeTitles?: ReadonlyMap<string, string>;
}

/**
 * Assembles one quest's complete detail body as blank-line-separated blocks:
 * the authored description, every objective with its live progress, and the
 * full reward line (experience, silver, faction renown, discoveries). Pure
 * and lossless — long MOD text is returned verbatim for the measured wrapper.
 */
export function buildQuestDetailBlocks(
  quest: QuestData,
  state: QuestProgressState | undefined,
  maps: QuestDetailNameMaps = {},
): string[] {
  const blocks: string[] = [quest.name, quest.description];
  if (state !== undefined) {
    for (const objective of quest.objectives) {
      const current = state.objectiveCounts.get(objective.id) ?? 0;
      blocks.push(`目标 ${current}/${objective.requiredCount}：${objective.text}`);
    }
  }
  const rewards = [
    `经验 +${quest.rewards.experience}`,
    `银两 +${quest.rewards.currency}`,
    ...(quest.rewards.factionRenown ?? []).map((reward) =>
      `${maps.factionNames?.get(reward.factionId) ?? reward.factionId}声望 ${reward.delta > 0 ? '+' : ''}${reward.delta}`),
    ...(quest.rewards.discoverKnowledgeNodeIds ?? []).map((nodeId) =>
      `见闻「${maps.knowledgeNodeTitles?.get(nodeId) ?? nodeId}」`),
  ];
  blocks.push(`报酬：${rewards.join(' · ')}`);
  return blocks;
}

/** Two footer columns reserve an actual gap, even with long status text. */
export function questFooterColumns(contentWidth: number): { statusWidth: number; trailWidth: number; gap: number } {
  const gap = 8;
  const trailWidth = Math.min(320, Math.floor((contentWidth - gap) / 2));
  return { statusWidth: contentWidth - trailWidth - gap, trailWidth, gap };
}

/** Wraps the blocks at the real measured width and paginates them losslessly. */
export function paginateQuestDetail(
  blocks: readonly string[],
  width: number,
  capacity: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const [index, block] of blocks.entries()) {
    if (index > 0) lines.push(''); // Blank separators feed the block pager.
    lines.push(...wrapDialogueText(block, width, measure));
  }
  return paginateDialogueBlocks(lines, capacity);
}
