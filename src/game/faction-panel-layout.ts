/**
 * Round 121: pure faction-dossier layout helpers (Phaser-free).
 *
 * Reuses the Round 119/120 measured geometry and lossless pagination. The
 * dossier body assembles every faction's complete record — heading with
 * current marker and mentors, admission conditions, departure penalties and
 * live renown — as blank-line-separated blocks, so a measured wrapper and
 * block pager present the full authored content at any font scale without
 * fixed clipping or overlap.
 */
import type { FactionData } from '../engine/character-progression';
import type { QuestData } from '../engine/quest-system';

export { buildQuestPanelGeometry as buildFactionPanelGeometry, paginateQuestDetail as paginateFactionDossier, type QuestPanelGeometry as FactionPanelGeometry } from './quest-panel-layout';

export interface DossierGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  contentWidth: number;
  /** Top of the linear body: everything below the fixed title/instruction line. */
  bodyTop: number;
  bodyLineHeight: number;
  bodyCapacity: number;
  statusTop: number;
  hintTop: number;
}

/**
 * Round 121 (correction): dedicated LINEAR dossier geometry — no row-list
 * band at all. The panel reserves its footer (hint, then status) from the
 * bottom edge first, spends one title line and one short mechanical
 * instruction line at the top, and hands EVERYTHING in between to the paged
 * body (complete identity/social lines and every faction block), so the
 * reader never collapses to 1–2 lines beside six unused list rows.
 */
export function buildDossierGeometry(input: {
  viewWidth: number;
  viewHeight: number;
  titleHeight: number;
  instructionHeight: number;
  bodyLineHeight: number;
  statusHeight: number;
  hintHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  padding?: number;
}): DossierGeometry {
  const padding = input.padding ?? 30;
  const width = Math.min(input.maxWidth ?? 820, Math.max(280, input.viewWidth - 56));
  const height = Math.min(input.maxHeight ?? 452, Math.max(240, input.viewHeight - 56));
  const left = Math.round((input.viewWidth - width) / 2);
  const top = Math.round((input.viewHeight - height) / 2);
  const hintTop = top + height - 10 - input.hintHeight;
  const statusTop = hintTop - 2 - input.statusHeight;
  const bodyTop = top + 18 + input.titleHeight + 6 + input.instructionHeight + 8;
  const bodyCapacity = Math.max(1, Math.floor((statusTop - 6 - bodyTop) / input.bodyLineHeight));
  return {
    left, top, width, height,
    contentWidth: width - padding * 2,
    bodyTop, bodyLineHeight: input.bodyLineHeight, bodyCapacity,
    statusTop, hintTop,
  };
}

const ATTRIBUTE_NAMES: Record<string, string> = {
  body: '体魄',
  force: '力道',
  agility: '身法',
  insight: '悟性',
  resolve: '定力',
};

const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;

/** Data-driven admission requirements; never hard-codes a faction or quest. */
export function factionAdmissionSummary(faction: FactionData, quests: ReadonlyMap<string, QuestData>): string {
  const admission = faction.admission;
  const requirements: string[] = [];
  if (admission.minimumLevel !== undefined) requirements.push(`等级≥${admission.minimumLevel}`);
  for (const [id, value] of Object.entries(admission.minimumAttributes)) {
    requirements.push(`${ATTRIBUTE_NAMES[id] ?? id}≥${value}`);
  }
  if (admission.minimumMorality !== undefined || admission.maximumMorality !== undefined) {
    requirements.push(`善恶 ${admission.minimumMorality ?? '无下限'}～${admission.maximumMorality ?? '无上限'}`);
  }
  if (admission.minimumRenown !== undefined) requirements.push(`声望≥${admission.minimumRenown}`);
  if (admission.minimumFactionRenown !== undefined) {
    requirements.push(`本门声望≥${admission.minimumFactionRenown}`);
  }
  if (admission.minimumTeacherRelationship !== undefined) {
    requirements.push(`师父关系≥${admission.minimumTeacherRelationship}`);
  }
  for (const questId of admission.requiredQuestIds) {
    requirements.push(`完成「${quests.get(questId)?.name ?? questId}」`);
  }
  return requirements.length > 0 ? requirements.join('、') : '无额外条件';
}

/** One faction's complete dossier block, lossless. */
export function buildFactionBlock(input: {
  faction: FactionData;
  isCurrent: boolean;
  mentorLabels: readonly string[];
  renown: number;
  quests: ReadonlyMap<string, QuestData>;
}): string {
  const { faction } = input;
  const mentors = input.mentorLabels.length > 0 ? input.mentorLabels.join('、') : '暂无登记师父';
  const departure = faction.departure.allowed
    ? `退门代价：善恶 ${signed(faction.departure.moralityDelta)}、江湖声望 ${signed(faction.departure.renownDelta)}、本门声望 ${signed(faction.departure.factionRenownDelta)}；${faction.departure.forgetFactionMartialArts ? '遗忘本门武学' : '保留已学武学'}`
    : '退门：门规不许';
  const heading = `${input.isCurrent ? '◆' : '◇'} ${faction.name} · 师父：${mentors}`;
  return `${heading}\n本门声望：${input.renown}/1000。入门：${factionAdmissionSummary(faction, input.quests)}。${departure}。`;
}

/**
 * Round 121 (correction): the identity and social lines join the paged body
 * VERBATIM — a long MOD name wraps and every master's name survives; the
 * header keeps only the fixed title and one short mechanical instruction.
 */
export function buildDossierIdentityBlocks(input: { identityText: string; socialLine: string }): string[] {
  return [input.identityText, input.socialLine];
}
