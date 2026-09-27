/**
 * Generic NPC placement protocol: wire types, defensive parsing,
 * cross-resource validation, occupancy indexing and adjacency targeting.
 *
 * The engine knows the *shape* of NPC data only — names, coordinates and
 * dialogue references all come from the parsed data, so no world content may
 * live here (see docs/ARCHITECTURE.md).
 *
 * `data/schema/npc-set.schema.json` pins down static structure before these
 * functions run. The assembly step adds the cross-resource rules a
 * single-file schema cannot express (map/dialogue references resolve, the
 * cell is inside the map and walkable, no two NPCs share a cell, the spawn
 * cell stays free) and isolates failures per NPC: one bad record disables
 * exactly that NPC, never the whole cast.
 */

import { type CellPosition, type GridMap } from './grid-map';

/** Wire format of one NPC entry inside an npc-set JSON file. */
export interface NpcRecordData {
  id: string;
  name: string;
  mapResourceId: string;
  position: CellPosition;
  dialogueId: string;
  /** Optional shop this NPC keeps (Round 06); null = dialogue-only NPC.
   * Resolution against assembled shops happens at interaction time, so a
   * dangling reference simply falls back to `dialogueId` with a warning. */
  shopId: string | null;
  /** Whether this NPC publishes quests (Round 07); missing means false. */
  questGiver: boolean;
  /** Optional time-of-day destinations (Round 16), normalized to an empty array. */
  schedule: NpcScheduleEntryData[];
}

/** A same-map destination selected while the calendar occupies `periodId`. */
export interface NpcScheduleEntryData {
  periodId: string;
  position: CellPosition;
}

/** Wire format of an npc-set JSON file under `data/base/characters/`. */
export interface NpcSetData {
  npcs: NpcRecordData[];
}

export type NpcSetParseResult =
  | { ok: true; set: NpcSetData }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the value when non-empty, null otherwise (enables TS narrowing). */
function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Returns the value when it is a finite integer, null otherwise. */
function requireInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Defensive re-parse of an npc-set document. The Ajv schema already rejected
 * structural violations at load time; this guards the engine against being
 * fed unvalidated values (e.g. future code paths) and yields readable
 * per-entry errors instead of casting blindly.
 */
export function parseNpcSet(raw: unknown): NpcSetParseResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.npcs)) {
    return { ok: false, errors: ['npcs：应为 NPC 条目数组'] };
  }

  const npcs: NpcRecordData[] = [];
  const errors: string[] = [];
  raw.npcs.forEach((entry, index) => {
    const label = `npcs[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const mapResourceId = requireNonEmptyString(entry.mapResourceId);
    const dialogueId = requireNonEmptyString(entry.dialogueId);
    // Round 06: optional shop reference; anything but a non-empty string is
    // treated as "no shop" rather than a per-NPC failure.
    const shopId = requireNonEmptyString(entry.shopId);
    const questGiver = entry.questGiver === undefined ? false : entry.questGiver === true;
    const position = isPlainObject(entry.position) ? entry.position : null;
    const col = position === null ? null : requireInteger(position.col);
    const row = position === null ? null : requireInteger(position.row);
    const problems: string[] = [];
    const schedule: NpcScheduleEntryData[] = [];
    if (entry.schedule !== undefined && !Array.isArray(entry.schedule)) {
      problems.push(`${label}.schedule：应为时段日程数组`);
    } else if (Array.isArray(entry.schedule)) {
      entry.schedule.forEach((scheduleEntry, scheduleIndex) => {
        const scheduleLabel = `${label}.schedule[${scheduleIndex}]`;
        if (!isPlainObject(scheduleEntry)) {
          problems.push(`${scheduleLabel}：应为对象`);
          return;
        }
        const periodId = requireNonEmptyString(scheduleEntry.periodId);
        const schedulePosition = isPlainObject(scheduleEntry.position)
          ? scheduleEntry.position
          : null;
        const scheduleCol = schedulePosition === null ? null : requireInteger(schedulePosition.col);
        const scheduleRow = schedulePosition === null ? null : requireInteger(schedulePosition.row);
        if (periodId === null || scheduleCol === null || scheduleRow === null) {
          problems.push(`${scheduleLabel}：应含非空 periodId 与整数 position.col/row`);
          return;
        }
        schedule.push({ periodId, position: { col: scheduleCol, row: scheduleRow } });
      });
    }
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (mapResourceId === null) {
      problems.push(`${label}.mapResourceId：应为非空字符串`);
    }
    if (dialogueId === null) {
      problems.push(`${label}.dialogueId：应为非空字符串`);
    }
    if (entry.questGiver !== undefined && typeof entry.questGiver !== 'boolean') {
      problems.push(`${label}.questGiver：应为布尔值`);
    }
    if (position === null || col === null || row === null) {
      problems.push(`${label}.position：应含整数 col 与 row`);
    }
    if (
      id === null ||
      name === null ||
      mapResourceId === null ||
      dialogueId === null ||
      col === null ||
      row === null
    ) {
      errors.push(...problems);
      return;
    }
    if (problems.length > 0) {
      errors.push(...problems);
      return;
    }

    npcs.push({
      id,
      name,
      mapResourceId,
      dialogueId,
      shopId,
      questGiver,
      schedule,
      position: { col, row },
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { npcs } };
}

/** An NPC that passed every cross-resource check and stands on a map cell. */
export interface PlacedNpc {
  record: NpcRecordData;
  col: number;
  row: number;
}

export interface NpcAssemblyInput {
  /** Parsed NPC set; null when the resource is missing or structurally invalid. */
  npcSet: NpcSetData | null;
  /** Manifest resource ids present in the loaded data set (any schema). */
  knownResourceIds: ReadonlySet<string>;
  /** Validated maps by manifest resource id. */
  maps: ReadonlyMap<string, GridMap>;
  /** The map the current scene runs; NPCs targeting another map are skipped. */
  currentMapResourceId: string;
  /** Conversation ids available for interaction (already graph-validated). */
  dialogueIds: ReadonlySet<string>;
}

export interface NpcAssemblyResult {
  /** NPCs that passed all checks and are standing on the current map. */
  npcs: PlacedNpc[];
  /** Readable per-NPC problems; each disables exactly the NPC it names. */
  warnings: string[];
  /** NPCs skipped because they target another (valid) map — not an error. */
  skippedOtherMap: number;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Runs every cross-resource rule for each NPC in declaration order and keeps
 * only the ones that pass. Each failure produces one readable warning naming
 * the NPC, so a single broken record never disables the rest of the cast:
 *
 * - id must be unique (first declaration wins);
 * - `mapResourceId` must exist among the loaded resources;
 * - the referenced map must contain the cell and the cell must be walkable;
 * - the cell must not collide with the player spawn or an already placed NPC;
 * - `dialogueId` must resolve to an available conversation.
 *
 * NPCs whose `mapResourceId` points at another valid map are skipped
 * silently — that is normal multi-map data, not an error.
 */
export function assembleNpcPlacements(input: NpcAssemblyInput): NpcAssemblyResult {
  const npcs: PlacedNpc[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const occupiedCells = new Map<string, string>(); // cellKey -> npc id
  let skippedOtherMap = 0;

  if (input.npcSet === null) {
    return { npcs, warnings, skippedOtherMap };
  }

  for (const record of input.npcSet.npcs) {
    const problems: string[] = [];
    const npcMap = input.maps.get(record.mapResourceId);

    if (!input.knownResourceIds.has(record.mapResourceId)) {
      problems.push(`引用的地图资源 "${record.mapResourceId}" 未登记或加载失败`);
    } else if (npcMap === undefined) {
      problems.push(
        record.mapResourceId === input.currentMapResourceId
          ? '所在地图不可用'
          : `引用的地图资源 "${record.mapResourceId}" 未加载为有效地图`,
      );
    } else if (record.mapResourceId !== input.currentMapResourceId) {
      // A separately validated map is legitimate multi-map content; this
      // scene simply does not place its NPCs yet. A non-map resource with a
      // matching id is caught above because it has no validated GridMap.
      seenIds.add(record.id);
      skippedOtherMap += 1;
      continue;
    } else {
      const { col, row } = record.position;
      if (!npcMap.inBounds(col, row)) {
        problems.push(
          `坐标 (${col}, ${row}) 超出地图边界（${npcMap.columns}×${npcMap.rows}）`,
        );
      } else if (npcMap.isSolid(col, row)) {
        problems.push(`坐标 (${col}, ${row}) 落在阻挡格上`);
      } else if (col === npcMap.playerStart.col && row === npcMap.playerStart.row) {
        problems.push(`坐标 (${col}, ${row}) 与玩家出生点重叠`);
      } else {
        const clashId = occupiedCells.get(cellKey(col, row));
        if (clashId !== undefined) {
          problems.push(`坐标 (${col}, ${row}) 与 NPC "${clashId}" 占用同一格`);
        }
      }
    }

    if (seenIds.has(record.id)) {
      problems.push('id 与前面的条目重复，保留先声明者');
    }
    if (!input.dialogueIds.has(record.dialogueId)) {
      problems.push(`引用的对话 "${record.dialogueId}" 不存在或已因校验失败被禁用`);
    }

    seenIds.add(record.id);
    if (problems.length > 0) {
      warnings.push(`NPC "${record.id}"（${record.name}）已禁用：${problems.join('；')}`);
      continue;
    }

    occupiedCells.set(cellKey(record.position.col, record.position.row), record.id);
    npcs.push({ record, col: record.position.col, row: record.position.row });
  }

  return { npcs, warnings, skippedOtherMap };
}

/** Occupancy index over placed NPCs: blocks player movement into cells. */
export class NpcOccupancyIndex {
  private readonly byCell = new Map<string, PlacedNpc>();

  constructor(npcs: readonly PlacedNpc[] = []) {
    for (const npc of npcs) {
      this.byCell.set(cellKey(npc.col, npc.row), npc);
    }
  }

  isOccupied(col: number, row: number): boolean {
    return this.byCell.has(cellKey(col, row));
  }

  npcAt(col: number, row: number): PlacedNpc | undefined {
    return this.byCell.get(cellKey(col, row));
  }

  get size(): number {
    return this.byCell.size;
  }
}

/** Manhattan distance between two cells. */
export function manhattanDistance(a: CellPosition, b: CellPosition): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** Four-directional adjacency: Manhattan distance of exactly 1. */
export function isFourWayAdjacent(a: CellPosition, b: CellPosition): boolean {
  return manhattanDistance(a, b) === 1;
}

/**
 * Picks the interaction-key target among placed NPCs: only four-way adjacent
 * NPCs qualify. When several are adjacent (e.g. one above and one to the
 * right), the nearest wins and equal distances are broken by ascending npc
 * id, so the outcome is deterministic for every data set.
 */
export function selectInteractionTarget(
  npcs: readonly PlacedNpc[],
  from: CellPosition,
): PlacedNpc | null {
  let best: PlacedNpc | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const npc of npcs) {
    const distance = manhattanDistance(from, { col: npc.col, row: npc.row });
    if (distance !== 1) {
      continue; // Only four-way adjacency counts as interactable.
    }
    if (
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && npc.record.id < best.record.id)
    ) {
      best = npc;
      bestDistance = distance;
    }
  }
  return best;
}
