/**
 * Phaser-free compilation of optional NPC per-period destinations. NPC
 * records keep a stable base position; the game clock selects one compiled
 * placement set, so saves need only persist elapsed minutes.
 */

import type { CalendarPeriodData } from './game-calendar';
import type { GridMap } from './grid-map';
import type { PlacedNpc } from './npc-placement';

export interface NpcScheduleCompilationInput {
  /** NPCs which already passed base placement/dialogue validation. */
  npcs: readonly PlacedNpc[];
  periods: readonly CalendarPeriodData[];
  maps: ReadonlyMap<string, GridMap>;
  /** Fixed encounter cells, keyed by map resource id. */
  blockedCellsByMap?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface NpcScheduleCompilation {
  /** Complete, collision-free NPC placements indexed by calendar period id. */
  placementsByPeriod: ReadonlyMap<string, readonly PlacedNpc[]>;
  /** Readable problems isolated to an NPC/period schedule slot. */
  warnings: readonly string[];
}

export interface NpcPlacementResolutionInput {
  /** Stable base set, already validated for walkability and unique cells. */
  baseNpcs: readonly PlacedNpc[];
  /** Compiled placements for one period; omitted NPCs use their base record. */
  periodNpcs: readonly PlacedNpc[];
  mapResourceId: string;
  map: GridMap;
  /** A live player cell is omitted from NPC placement; null means no player. */
  playerPosition: { col: number; row: number } | null;
  /** Currently blocking encounter cells for this map. */
  blockedCells?: ReadonlySet<string>;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Resolves one compiled period against live blockers. It is shared by scene
 * placement and save preflight so a player may safely occupy an NPC's former
 * base/scheduled cell when that NPC is elsewhere or falls back to its base.
 */
export function resolveNpcPlacementsForPlayer(
  input: NpcPlacementResolutionInput,
): PlacedNpc[] {
  const base = input.baseNpcs.filter(
    (npc) => npc.record.mapResourceId === input.mapResourceId,
  );
  const compiledById = new Map(
    input.periodNpcs
      .filter((npc) => npc.record.mapResourceId === input.mapResourceId)
      .map((npc) => [npc.record.id, npc]),
  );
  const candidates = base.map((npc) => compiledById.get(npc.record.id) ?? npc);
  const stationary = candidates.filter((npc) =>
    npc.col === npc.record.position.col && npc.row === npc.record.position.row,
  );
  const scheduled = candidates.filter((npc) =>
    npc.col !== npc.record.position.col || npc.row !== npc.record.position.row,
  );
  const accepted = new Map<string, PlacedNpc>();
  const occupied = new Set<string>();
  const playerCell = input.playerPosition === null
    ? null
    : cellKey(input.playerPosition.col, input.playerPosition.row);

  const tryPlace = (npc: PlacedNpc, col: number, row: number): boolean => {
    if (!input.map.canEnter(col, row)) return false;
    const key = cellKey(col, row);
    if (key === playerCell || input.blockedCells?.has(key) || occupied.has(key)) return false;
    occupied.add(key);
    accepted.set(npc.record.id, { ...npc, col, row });
    return true;
  };

  // Stable/base placements retain priority, then mobile characters try their
  // period slot and fall back to their own base position if a live blocker
  // makes that slot unavailable.
  for (const npc of stationary) tryPlace(npc, npc.col, npc.row);
  for (const npc of scheduled) {
    if (!tryPlace(npc, npc.col, npc.row)) {
      tryPlace(npc, npc.record.position.col, npc.record.position.row);
    }
  }
  return base.flatMap((npc) => {
    const placed = accepted.get(npc.record.id);
    return placed === undefined ? [] : [placed];
  });
}

/**
 * Resolves each optional NPC schedule against the current calendar and maps.
 * Invalid slots fall back to the NPC's base location; base placements have
 * already been checked for walkability, spawn conflicts and unique cells.
 * A scheduled move is accepted in declaration order only when its target is
 * free of another placed NPC and a fixed encounter.
 */
export function compileNpcSchedules(
  input: NpcScheduleCompilationInput,
): NpcScheduleCompilation {
  const warnings: string[] = [];
  const validSlots = new Map<string, Map<string, { col: number; row: number }>>();
  const knownPeriods = new Map(input.periods.map((period) => [period.id, period]));

  for (const npc of input.npcs) {
    const record = npc.record;
    const slots = new Map<string, { col: number; row: number }>();
    const map = input.maps.get(record.mapResourceId);
    for (const entry of record.schedule) {
      const period = knownPeriods.get(entry.periodId);
      if (period === undefined) {
        warnings.push(
          `NPC "${record.id}" 的日程引用了不存在的历法时段 "${entry.periodId}"，该项已忽略`,
        );
        continue;
      }
      if (slots.has(entry.periodId)) {
        warnings.push(
          `NPC "${record.id}" 在时段 "${entry.periodId}" 重复登记日程，保留首条`,
        );
        continue;
      }
      const { col, row } = entry.position;
      if (map === undefined || !map.inBounds(col, row) || map.isSolid(col, row)) {
        warnings.push(
          `NPC "${record.id}" 的 ${period.name} 日程坐标 (${col}, ${row}) 不可通行，该时段回到基础位置`,
        );
        continue;
      }
      if (col === map.playerStart.col && row === map.playerStart.row) {
        warnings.push(
          `NPC "${record.id}" 的 ${period.name} 日程占用玩家出生点，该时段回到基础位置`,
        );
        continue;
      }
      slots.set(entry.periodId, { col, row });
    }
    validSlots.set(record.id, slots);
  }

  const placementsByPeriod = new Map<string, readonly PlacedNpc[]>();
  for (const period of input.periods) {
    const placements = input.npcs.map((npc) => ({ ...npc }));
    const blockedCellsByMap = input.blockedCellsByMap;

    for (let index = 0; index < input.npcs.length; index += 1) {
      const baseNpc = input.npcs[index]!;
      const scheduledPosition = validSlots.get(baseNpc.record.id)?.get(period.id);
      if (scheduledPosition === undefined) continue;

      const { col, row } = scheduledPosition;
      if (col === baseNpc.record.position.col && row === baseNpc.record.position.row) {
        continue;
      }
      const blocked = blockedCellsByMap?.get(baseNpc.record.mapResourceId);
      if (blocked?.has(cellKey(col, row))) {
        warnings.push(
          `NPC "${baseNpc.record.id}" 的 ${period.name} 日程与固定互动格 (${col}, ${row}) 重叠，该时段回到基础位置`,
        );
        continue;
      }

      const conflict = placements.find((other, otherIndex) =>
        otherIndex !== index &&
        other.record.mapResourceId === baseNpc.record.mapResourceId &&
        other.col === col && other.row === row,
      );
      if (conflict !== undefined) {
        warnings.push(
          `NPC "${baseNpc.record.id}" 的 ${period.name} 日程与 NPC "${conflict.record.id}" 重叠，该时段回到基础位置`,
        );
        continue;
      }
      placements[index] = { ...baseNpc, col, row };
    }
    placementsByPeriod.set(period.id, placements);
  }

  return { placementsByPeriod, warnings: [...new Set(warnings)] };
}
