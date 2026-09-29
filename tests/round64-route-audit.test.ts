import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGameCalendar, type CalendarPeriodData } from '../src/engine/game-calendar';
import { parseGridMap, type CellPosition, type GridMap } from '../src/engine/grid-map';
import { assembleNpcPlacements, parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseQuestSet } from '../src/engine/quest-system';
import { parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

const MAP_PATHS = [
  '../data/base/maps/round-01-grid.json',
  '../data/base/maps/round-10-mist-ferry.json',
  '../data/base/maps/round-62-iron-ridge.json',
  '../data/base/maps/round-67-salt-road.json',
] as const;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

const cellKey = (col: number, row: number): string => `${col},${row}`;

/**
 * Same-map reachability oracle: one BFS from an entry over the map geometry
 * (plus optional live occupant cells) yields every cell a walking player
 * could reach. An interaction target is audited as reachable when one of its
 * four neighbours is walkable and inside the set — exactly the contract
 * `findGridPathToAdjacentCell` fulfils in the running game.
 */
function reachableCells(
  map: GridMap,
  entry: CellPosition,
  blockedCells: ReadonlySet<string>,
): Set<string> {
  if (!map.canEnter(entry.col, entry.row) || blockedCells.has(cellKey(entry.col, entry.row))) {
    return new Set();
  }
  const seen = new Set<string>([cellKey(entry.col, entry.row)]);
  const queue: CellPosition[] = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dCol, dRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const col = current.col + dCol;
      const row = current.row + dRow;
      const key = cellKey(col, row);
      if (seen.has(key) || !map.inBounds(col, row) || !map.canEnter(col, row)) continue;
      if (blockedCells.has(key)) continue;
      seen.add(key);
      queue.push({ col, row });
    }
  }
  return seen;
}

function hasAdjacentReachableCell(
  map: GridMap,
  reachable: ReadonlySet<string>,
  target: CellPosition,
): boolean {
  for (const [dCol, dRow] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const col = target.col + dCol;
    const row = target.row + dRow;
    if (map.inBounds(col, row) && map.canEnter(col, row) && reachable.has(cellKey(col, row))) {
      return true;
    }
  }
  return false;
}

interface AuditTarget {
  npcId: string;
  kind: 'mentor' | 'giver' | 'talk-objective';
}

describe('Round 64 full interaction-route audit', () => {
  const maps = new Map(MAP_PATHS.map((path) => {
    const map = loadMap(path);
    return [map.data.id, map];
  }));

  const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
  if (!worldParsed.ok) throw new Error(worldParsed.errors.join('\n'));
  const world = assembleWorldMap(worldParsed.data, maps);
  if ('ok' in world) throw new Error(world.errors.join('\n'));

  const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
  if (!npcParsed.ok) throw new Error(npcParsed.errors.join('\n'));
  const placements = [...maps.keys()].map((currentMapResourceId) =>
    assembleNpcPlacements({
      npcSet: npcParsed.set,
      knownResourceIds: new Set(maps.keys()),
      maps,
      currentMapResourceId,
      dialogueIds: new Set(npcParsed.set.npcs.map((npc) => npc.dialogueId)),
    }),
  );
  expect(placements.flatMap((placement) => placement.warnings)).toEqual([]);
  const baseNpcs: PlacedNpc[] = [];
  const seenNpcIds = new Set<string>();
  for (const placement of placements) {
    for (const npc of placement.npcs) {
      if (!seenNpcIds.has(npc.record.id)) {
        seenNpcIds.add(npc.record.id);
        baseNpcs.push(npc);
      }
    }
  }

  const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
  if (!calendarParsed.ok) throw new Error(calendarParsed.errors.join('\n'));
  const periods: readonly CalendarPeriodData[] = calendarParsed.calendar.periods;

  const encounterParsed = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
  if (!encounterParsed.ok) throw new Error(encounterParsed.errors.join('\n'));

  const encounterCellsByMap = new Map<string, ReadonlySet<string>>();
  for (const mapId of maps.keys()) {
    encounterCellsByMap.set(mapId, new Set(encounterParsed.set.encounters
      .filter((record) => record.mapResourceId === mapId)
      .map((record) => cellKey(record.position.col, record.position.row))));
  }

  const schedule = compileNpcSchedules({
    npcs: baseNpcs,
    periods,
    maps,
    blockedCellsByMap: encounterCellsByMap,
  });
  expect(schedule.warnings).toEqual([]);

  const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!questParsed.ok) throw new Error(questParsed.errors.join('\n'));

  // Interaction-critical target registry: every registered faction mentor,
  // every quest giver and every talk-objective NPC, deduplicated by id.
  const factionsParsed = readJson('../data/base/factions/round-04-factions.json') as {
    factions: { mentorNpcIds: string[] }[];
  };
  const targetsByNpcId = new Map<string, AuditTarget>();
  for (const faction of factionsParsed.factions) {
    for (const npcId of faction.mentorNpcIds) {
      if (!targetsByNpcId.has(npcId)) targetsByNpcId.set(npcId, { npcId, kind: 'mentor' });
    }
  }
  for (const quest of questParsed.set.quests) {
    if (!targetsByNpcId.has(quest.giverNpcId)) {
      targetsByNpcId.set(quest.giverNpcId, { npcId: quest.giverNpcId, kind: 'giver' });
    }
    for (const objective of quest.objectives) {
      if (objective.kind === 'talkToNpc' && !targetsByNpcId.has(objective.targetId)) {
        targetsByNpcId.set(objective.targetId, { npcId: objective.targetId, kind: 'talk-objective' });
      }
    }
  }
  for (const [npcId] of targetsByNpcId) {
    expect(baseNpcs.some((npc) => npc.record.id === npcId), `audit target ${npcId} must be assembled`).toBe(true);
  }

  // Region entries: the starting spawn plus every directed crossing landing.
  const entriesByMap = new Map<string, CellPosition[]>();
  const addEntry = (mapResourceId: string, position: CellPosition): void => {
    const entries = entriesByMap.get(mapResourceId) ?? [];
    if (!entries.some((entry) => entry.col === position.col && entry.row === position.row)) {
      entries.push(position);
      entriesByMap.set(mapResourceId, entries);
    }
  };
  addEntry(
    world.data.startingMapResourceId,
    maps.get(world.data.startingMapResourceId)!.playerStart,
  );
  for (const transition of world.transitions) {
    addEntry(transition.to.mapResourceId, { col: transition.to.col, row: transition.to.row });
  }
  const entryCount = [...entriesByMap.values()].reduce((count, entries) => count + entries.length, 0);

  interface FailureRecord {
    mapResourceId: string;
    periodId: string;
    entry: CellPosition;
    npcId: string;
    kind: AuditTarget['kind'];
    cell: CellPosition;
    layer: 'static' | 'dynamic';
  }
  const failures: FailureRecord[] = [];
  let auditedChecks = 0;

  it('keeps every interaction target reachable from its region entry across all periods', () => {
    for (const period of periods) {
      const periodNpcs = schedule.placementsByPeriod.get(period.id) ?? baseNpcs;
      for (const [mapResourceId, map] of maps) {
        const mapTargets = baseNpcs.filter((npc) =>
          npc.record.mapResourceId === mapResourceId && targetsByNpcId.has(npc.record.id),
        );
        if (mapTargets.length === 0) continue;
        const entries = entriesByMap.get(mapResourceId) ?? [];
        expect(entries.length, `region entries for ${mapResourceId} must exist`).toBeGreaterThan(0);
        for (const entry of entries) {
          // Live occupancy for this period: NPCs on their compiled cells plus
          // fixed encounters. The entry cell itself is exempt — the runtime
          // resolver moves any NPC away from the cell the player occupies.
          const dynamicBlocked = new Set<string>(encounterCellsByMap.get(mapResourceId) ?? []);
          for (const npc of periodNpcs) {
            if (npc.record.mapResourceId !== mapResourceId) continue;
            const key = cellKey(npc.col, npc.row);
            if (key !== cellKey(entry.col, entry.row)) dynamicBlocked.add(key);
          }
          const staticReachable = reachableCells(map, entry, new Set());
          const dynamicReachable = reachableCells(map, entry, dynamicBlocked);

          // Crossing exits are interaction-critical too: the player must be
          // able to walk from every region entry to a neighbour of every outgoing gate.
          for (const transition of world.transitions) {
            if (transition.from.mapResourceId !== mapResourceId) continue;
            auditedChecks += 2; // Static geometry and live occupancy are separate checks.
            const reachable = hasAdjacentReachableCell(map, dynamicReachable, transition.from);
            if (!reachable) {
              failures.push({
                mapResourceId, periodId: period.id, entry, npcId: transition.id,
                kind: 'giver', cell: transition.from, layer: 'dynamic',
              });
            }
            if (!hasAdjacentReachableCell(map, staticReachable, transition.from)) {
              failures.push({
                mapResourceId, periodId: period.id, entry, npcId: transition.id,
                kind: 'giver', cell: transition.from, layer: 'static',
              });
            }
          }

          for (const npc of mapTargets) {
            const placed = periodNpcs.find((candidate) => candidate.record.id === npc.record.id) ?? npc;
            const cell = { col: placed.col, row: placed.row };
            auditedChecks += 2;
            if (!hasAdjacentReachableCell(map, staticReachable, cell)) {
              failures.push({
                mapResourceId, periodId: period.id, entry, npcId: npc.record.id,
                kind: targetsByNpcId.get(npc.record.id)!.kind, cell, layer: 'static',
              });
            }
            if (!hasAdjacentReachableCell(map, dynamicReachable, cell)) {
              failures.push({
                mapResourceId, periodId: period.id, entry, npcId: npc.record.id,
                kind: targetsByNpcId.get(npc.record.id)!.kind, cell, layer: 'dynamic',
              });
            }
          }
        }
      }
    }

    const staticFailures = failures.filter((failure) => failure.layer === 'static');
    const dynamicFailures = failures.filter((failure) => failure.layer === 'dynamic');
    console.info(
      `[round-64 audit] maps=${maps.size} periods=${periods.length} targets=${targetsByNpcId.size} ` +
      `entries=${entryCount} checks=${auditedChecks} ` +
      `static-disconnected=${staticFailures.length} dynamic-blocked=${dynamicFailures.length}`,
    );
    for (const failure of failures) {
      console.info(
        `[round-64 audit] ${failure.layer} failure: ${failure.kind} ${failure.npcId} at ` +
        `(${failure.cell.col},${failure.cell.row}) on ${failure.mapResourceId} ` +
        `${failure.periodId} from entry (${failure.entry.col},${failure.entry.row})`,
      );
    }
    expect(staticFailures, 'static disconnection is a map-data defect').toEqual([]);
    expect(dynamicFailures, 'live-occupancy must not seal any interaction target').toEqual([]);
  });
});
