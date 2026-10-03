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
  /** Round 120: crafting panels are a different size; defaults stay quest-panel. */
  maxWidth?: number;
  maxHeight?: number;
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
  const width = Math.min(input.maxWidth ?? 720, Math.max(280, input.viewWidth - 40));
  const height = Math.min(input.maxHeight ?? 440, Math.max(240, input.viewHeight - 40));
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
  prerequisiteQuestNames?: ReadonlyMap<string, string>;
  unfinishedQuestIds?: ReadonlySet<string>;
}

/**
 * Round 122: ordered quests present their real stage boundary, unordered ones
 * stay honestly simultaneous. The stage derivation mirrors quest-system
 * exactly: for ordered quests the CURRENT objective is the first whose count
 * is below its requirement; everything before it is done, everything after it
 * is later — even an out-of-order older save's stale counts never masquerade
 * as the current stage. Collect objectives also quote the LIVE inventory
 * beside the historical journal count, so a spent stockpile cannot be read as
 * currently-held supplies. Content-free: no world, NPC or item names live
 * here; every label derives from the objective's own data.
 */
export function buildQuestObjectiveStageLines(input: {
  quest: QuestData;
  state: QuestProgressState;
  liveItemCounts?: ReadonlyMap<string, number>;
}): string[] {
  const status = input.state.status;
  const count = (objective: QuestData['objectives'][number]): number =>
    input.state.objectiveCounts.get(objective.id) ?? 0;
  const live = (objective: QuestData['objectives'][number]): string => {
    if (objective.kind !== 'collectItem' || input.liveItemCounts === undefined) return '';
    const held = input.liveItemCounts.get(objective.targetId) ?? 0;
    return `（现持 ${held}/${objective.requiredCount}，尚缺 ${Math.max(0, objective.requiredCount - held)}）`;
  };
  // Only an active journey has a live stage boundary; offered/locked rows
  // keep the plain progress line — nothing has been stepped yet.
  if (status !== 'active') {
    return input.quest.objectives.map(objective =>
      `目标 ${count(objective)}/${objective.requiredCount}：${objective.text}`);
  }
  if (input.quest.orderedObjectives !== true) {
    // Unordered goals are genuinely simultaneous — one shared label, no
    // fabricated sequence.
    return input.quest.objectives.map(objective =>
      `[并行] 目标 ${count(objective)}/${objective.requiredCount}：${objective.text}${live(objective)}`);
  }
  const pending = input.quest.objectives.find(objective => count(objective) < objective.requiredCount);
  return input.quest.objectives.map(objective => {
    const stage = pending === undefined
      ? '已完成' // Everything counts complete (a completion transition is due).
      : objective === pending
        ? '当前'
        : (input.quest.objectives.indexOf(objective) < input.quest.objectives.indexOf(pending) ? '已完成' : '后续');
    if (stage === '已完成') return `[${stage}] ${objective.text}（记录 ${count(objective)}/${objective.requiredCount}）${live(objective)}`;
    if (stage === '当前') return `[${stage}] 目标 ${count(objective)}/${objective.requiredCount}：${objective.text}${live(objective)}`;
    return `[${stage}] ${objective.text}${live(objective)}`;
  });
}

/**
 * Assembles one quest's complete detail body as blank-line-separated blocks:
 * the authored description, every objective with its live progress, and the
 * full reward line (experience, silver, faction renown, discoveries). Pure
 * and lossless — long MOD text is returned verbatim for the measured wrapper.
 * Round 269: callers may append settlement blocks (unpaid preview / no-record
 * / actual in-session receipt) so the reward line never masquerades as paid.
 */
export function buildQuestDetailBlocks(
  quest: QuestData,
  state: QuestProgressState | undefined,
  maps: QuestDetailNameMaps = {},
  liveItemCounts?: ReadonlyMap<string, number>,
  settlementBlocks?: readonly string[],
): string[] {
  const blocks: string[] = [quest.name, quest.description];
  if (state?.status === 'locked' && quest.prerequisiteQuestIds.length > 0) {
    const unfinished = quest.prerequisiteQuestIds.filter((id) =>
      maps.unfinishedQuestIds === undefined || maps.unfinishedQuestIds.has(id));
    if (unfinished.length > 0) {
      blocks.push(`未完成前置差事：${unfinished.map((id) => maps.prerequisiteQuestNames?.get(id) ?? id).join('、')}`);
    }
  }
  if (state !== undefined) {
    blocks.push(buildQuestObjectiveStageLines({ quest, state, liveItemCounts }).join('\n'));
  }
  const rewards = [
    `经验 +${quest.rewards.experience}`,
    `银两 +${quest.rewards.currency}`,
    ...(quest.rewards.factionRenown ?? []).map((reward) =>
      `${maps.factionNames?.get(reward.factionId) ?? reward.factionId}声望 ${reward.delta > 0 ? '+' : ''}${reward.delta}`),
    ...(quest.rewards.discoverKnowledgeNodeIds ?? []).map((nodeId) =>
      `见闻「${maps.knowledgeNodeTitles?.get(nodeId) ?? nodeId}」`),
  ];
  const rewardLabel = state?.status === 'completed' || state?.status === 'failed'
    ? '约定报酬' : '预计报酬';
  blocks.push(`${rewardLabel}：${rewards.join(' · ')}${rewardLabel === '预计报酬' ? '（未结算）' : ''}`);
  if (settlementBlocks !== undefined) blocks.push(...settlementBlocks);
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
