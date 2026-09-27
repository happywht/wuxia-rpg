/**
 * Phaser-free companion protocol: validated NPC references, one active
 * follower slot, relationship remains in social-state, and walkable trail
 * placement. Combat applies the declared support through CombatSession.
 */

import type { CellPosition, GridMap } from './grid-map';

export type CompanionSupportKind = 'attack' | 'heal';

export interface CompanionSupportData {
  kind: CompanionSupportKind;
  /** Flat damage or healing applied by one automatic companion action. */
  power: number;
  /** Trigger after every N successful player actions in the current battle. */
  everyPlayerActions: number;
}

/** Stable data entry; display name and relationship are resolved from its NPC. */
export interface CompanionData {
  id: string;
  npcId: string;
  description: string;
  combatSupport: CompanionSupportData;
}

export interface CompanionSetData {
  companions: CompanionData[];
}

export type CompanionSetParseResult =
  | { ok: true; set: CompanionSetData }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requireInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/** Defensive parser paired with data/schema/companion-set.schema.json. */
export function parseCompanionSet(raw: unknown): CompanionSetParseResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.companions)) {
    return { ok: false, errors: ['companions：应为伙伴条目数组'] };
  }
  const companions: CompanionData[] = [];
  const errors: string[] = [];
  raw.companions.forEach((entry, index) => {
    const label = `companions[${index}]`;
    const source = isPlainObject(entry) ? entry : null;
    const id = source === null ? null : requireString(source.id);
    const npcId = source === null ? null : requireString(source.npcId);
    const description = source === null ? null : requireString(source.description);
    const support = source !== null && isPlainObject(source.combatSupport) ? source.combatSupport : null;
    const kind = support?.kind === 'attack' || support?.kind === 'heal' ? support.kind : null;
    const power = support === null ? null : requireInteger(support.power, 1, 999);
    const everyPlayerActions = support === null
      ? null
      : requireInteger(support.everyPlayerActions, 1, 20);
    const problems: string[] = [];
    if (id === null) problems.push(`${label}.id：应为非空字符串`);
    if (npcId === null) problems.push(`${label}.npcId：应为非空 NPC id`);
    if (description === null) problems.push(`${label}.description：应为非空说明`);
    if (kind === null || power === null || everyPlayerActions === null) {
      problems.push(`${label}.combatSupport：应含 attack/heal、1–999 power 与 1–20 everyPlayerActions`);
    }
    if (problems.length > 0) {
      errors.push(...problems);
      return;
    }
    companions.push({
      id: id!,
      npcId: npcId!,
      description: description!,
      combatSupport: { kind: kind!, power: power!, everyPlayerActions: everyPlayerActions! },
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, set: { companions } };
}

/** Resolves NPC links and duplicate ids while isolating only invalid entries. */
export function assembleCompanions(
  set: CompanionSetData | null,
  placedNpcIds: ReadonlySet<string>,
): { companions: ReadonlyMap<string, CompanionData>; warnings: string[] } {
  const companions = new Map<string, CompanionData>();
  const warnings: string[] = [];
  for (const companion of set?.companions ?? []) {
    if (companions.has(companion.id)) {
      warnings.push(`伙伴 "${companion.id}" 重复登记，保留先声明者`);
      continue;
    }
    if (!placedNpcIds.has(companion.npcId)) {
      warnings.push(`伙伴 "${companion.id}" 引用的 NPC "${companion.npcId}" 不存在或未通过地图校验，已禁用`);
      continue;
    }
    companions.set(companion.id, companion);
  }
  return { companions, warnings };
}

/** The prototype party has one active follower; any number of data entries can join in later rounds. */
export interface CompanionState {
  activeCompanionId: string | null;
}

export function createCompanionState(activeCompanionId: string | null = null): CompanionState {
  return { activeCompanionId };
}

export type CompanionStateChangeResult = { ok: true } | { ok: false; reason: string };

export function recruitCompanion(
  state: CompanionState,
  companionId: string,
  companions: ReadonlyMap<string, CompanionData>,
): CompanionStateChangeResult {
  if (!companions.has(companionId)) return { ok: false, reason: `伙伴资料 "${companionId}" 不存在或不可用` };
  if (state.activeCompanionId !== null) {
    return { ok: false, reason: state.activeCompanionId === companionId ? '这位伙伴已经与你同行' : '已有伙伴同行，请先让其暂离' };
  }
  state.activeCompanionId = companionId;
  return { ok: true };
}

export function dismissCompanion(state: CompanionState): string | null {
  const previous = state.activeCompanionId;
  state.activeCompanionId = null;
  return previous;
}

/**
 * Picks the previous player cell when safe; initial/blocked placement searches
 * the four adjacent walkable cells in a stable order. Followers never occupy
 * the player cell or another runtime blocker. Null means the tile is boxed in.
 */
export function resolveCompanionFollowCell(
  map: GridMap,
  player: CellPosition,
  preferred: CellPosition | null,
  blockedCells: ReadonlySet<string>,
): CellPosition | null {
  const candidates = [
    ...(preferred === null ? [] : [preferred]),
    { col: player.col, row: player.row + 1 },
    { col: player.col - 1, row: player.row },
    { col: player.col + 1, row: player.row },
    { col: player.col, row: player.row - 1 },
  ];
  const seen = new Set<string>();
  for (const cell of candidates) {
    if (Math.abs(cell.col - player.col) + Math.abs(cell.row - player.row) !== 1) continue;
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (map.canEnter(cell.col, cell.row) && !blockedCells.has(key)) return cell;
  }
  return null;
}
