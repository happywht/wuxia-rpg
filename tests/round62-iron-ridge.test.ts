import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell, type GridPathSurface } from '../src/engine/grid-path';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { parseQuestSet, type QuestJournal } from '../src/engine/quest-system';
import { parseBattleEncounterSet, type PlacedEncounter } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap, type WorldMapAssembly } from '../src/engine/world-map';

const RIDGE_ID = 'map.round-62-iron-ridge';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

function blockedSurface(map: GridMap, occupied: ReadonlySet<string>): GridPathSurface {
  return {
    columns: map.columns,
    rows: map.rows,
    inBounds: (col, row) => map.inBounds(col, row),
    canEnter: (col, row) => map.canEnter(col, row) && !occupied.has(`${col},${row}`),
  };
}

describe('Round 62 iron-ridge playable region', () => {
  const maps = new Map([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    [RIDGE_ID, loadMap('../data/base/maps/round-62-iron-ridge.json')],
    ['map.round-67-salt-road', loadMap('../data/base/maps/round-67-salt-road.json')],
    ['map.round-74-cloud-ridge', loadMap('../data/base/maps/round-74-cloud-ridge.json')],
    ['map.round-79-isles', loadMap('../data/base/maps/round-79-isles.json')],
    ['map.round-82-east-coast', loadMap('../data/base/maps/round-82-east-coast.json')],
    ['map.round-84-windward-isle', loadMap('../data/base/maps/round-84-windward-isle.json')],
    ['map.round-85-tide-isle', loadMap('../data/base/maps/round-85-tide-isle.json')],
    ['map.round-87-southwest-isles', loadMap('../data/base/maps/round-87-southwest-isles.json')],
    ['map.round-91-cloud-north-terrace', loadMap('../data/base/maps/round-91-cloud-north-terrace.json')],
    ['map.round-92-north-pass', loadMap('../data/base/maps/round-92-north-pass.json')],
    ['map.round-93-snow-pine-valley', loadMap('../data/base/maps/round-93-snow-pine-valley.json')],
    ['map.round-94-east-gate', loadMap('../data/base/maps/round-94-east-gate.json')],
    ['map.round-94-returning-sails', loadMap('../data/base/maps/round-94-returning-sails.json')],
    ['map.round-95-misty-pine-gate', loadMap('../data/base/maps/round-95-misty-pine-gate.json')],
    ['map.round-95-cedar-valley', loadMap('../data/base/maps/round-95-cedar-valley.json')],
    ['map.round-95-east-harbor', loadMap('../data/base/maps/round-95-east-harbor.json')],
    ['map.round-96-stone-reef', loadMap('../data/base/maps/round-96-stone-reef.json')],
    ['map.round-96-halfmoon-atoll', loadMap('../data/base/maps/round-96-halfmoon-atoll.json')],
  ]);

  it('uses a complete, layered 100×100 CC0 map with bounded atlas gids and a clear route spine', () => {
    const ridge = maps.get(RIDGE_ID)!;
    expect(ridge.columns).toBe(100);
    expect(ridge.rows).toBe(100);
    expect(ridge.data.art?.layers).toHaveLength(11);
    expect(ridge.data.art?.layers.every((layer) =>
      layer.cells.length === ridge.rows && layer.cells.every((row) => row.length === ridge.columns),
    )).toBe(true);
    const tilesets = ridge.data.art?.tilesets ?? [];
    for (const layer of ridge.data.art?.layers ?? []) {
      const atlas = tilesets.find(({ id }) => id === layer.tilesetId);
      expect(atlas, `missing tileset ${layer.tilesetId} for ${layer.id}`).toBeDefined();
      for (const row of layer.cells) {
        for (const gid of row) expect(gid & 0x0fffffff).toBeLessThanOrEqual(atlas!.tileCount);
      }
    }
    const walkable = ridge.data.grid.flatMap((line) => [...line]).filter((tile) => tile !== '#');
    expect(walkable.length).toBeGreaterThanOrEqual(6_500);
    expect(readFileSync(new URL('../data/assets/kenney/roguelike-rpg/License.txt', import.meta.url), 'utf8'))
      .toContain('CC0');
  });

  it('assembles the six-region atlas and keeps the iron-ridge gate as a real two-way walking connection', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: Array<{ id: string }> };
    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: Array<{ id: string }> };
    const npcData = readJson('../data/base/characters/round-03-npcs.json') as { npcs: Array<{ id: string }> };
    const assembled = assembleWorldMap(parsed.data, maps, {
      knowledgeNodeIds: new Set(nodes.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set([...npcData.npcs.map(({ id }) => id), 'char.r87-ao-wanqing']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(20);
    expect(assembled.transitions).toHaveLength(42);

    const ferry = maps.get('map.round-10-mist-ferry')!;
    const ridge = maps.get(RIDGE_ID)!;
    const northbound = assembled.transitions.find(({ id }) => id === 'gate.ferry-north-to-iron-ridge')!;
    const southbound = assembled.transitions.find(({ id }) => id === 'gate.iron-ridge-to-ferry-north')!;
    expect(findGridPath(ferry, ferry.playerStart, northbound.from)).not.toBeNull();
    expect(northbound.to).toEqual({ mapResourceId: RIDGE_ID, col: 4, row: 7 });
    expect(findGridPath(ridge, northbound.to, southbound.from)).not.toBeNull();
    expect(southbound.to).toEqual({ mapResourceId: ferry.data.id, col: 89, row: 16 });
    expect(findGridPath(ferry, southbound.to, northbound.from)).not.toBeNull();
  });

  it('keeps all Ridge landmarks, events, NPC slots and encounters walkable and reachable from its arrival gate', () => {
    const ridge = maps.get(RIDGE_ID)!;
    const world = readJson('../data/base/world/world-map.json') as {
      transitions: Array<{ from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }>;
      landmarks: Array<{ id: string; mapResourceId: string; col: number; row: number }>;
      events: Array<{ id: string; mapResourceId: string; col: number; row: number }>;
    };
    const npcSet = readJson('../data/base/characters/round-03-npcs.json') as {
      npcs: Array<{ id: string; mapResourceId: string; position: { col: number; row: number }; schedule?: Array<{ position: { col: number; row: number } }> }>;
    };
    const encounters = readJson('../data/base/battles/round-05-encounters.json') as {
      encounters: Array<{ id: string; mapResourceId: string; position: { col: number; row: number } }>;
    };
    const incoming = world.transitions.find(({ to }) => to.mapResourceId === RIDGE_ID)!;
    const anchors: Array<{ id: string; col: number; row: number }> = [];
    for (const endpoint of world.transitions.flatMap(({ from, to }) => [from, to])) {
      if (endpoint.mapResourceId === RIDGE_ID) anchors.push({ id: 'gate', ...endpoint });
    }
    for (const point of [...world.landmarks, ...world.events]) {
      if (point.mapResourceId === RIDGE_ID) anchors.push({ ...point });
    }
    for (const npc of npcSet.npcs.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID)) {
      anchors.push({ id: `${npc.id}:base`, ...npc.position });
      for (const [index, entry] of (npc.schedule ?? []).entries()) {
        anchors.push({ id: `${npc.id}:schedule:${index}`, ...entry.position });
      }
    }
    for (const encounter of encounters.encounters.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID)) {
      anchors.push({ id: encounter.id, ...encounter.position });
    }

    for (const anchor of anchors) {
      expect(ridge.canEnter(anchor.col, anchor.row), `${anchor.id} is walkable`).toBe(true);
      expect(findGridPath(ridge, incoming.to, anchor), `${anchor.id} is reachable from the Ridge gate`).not.toBeNull();
    }
    expect(world.landmarks.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID)).toHaveLength(4);
    expect(world.events.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID).length).toBeGreaterThanOrEqual(3);
    expect(npcSet.npcs.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID)).toHaveLength(2);
    expect(encounters.encounters.filter(({ mapResourceId }) => mapResourceId === RIDGE_ID)).toHaveLength(2);
  });

  it('routes each of the three authored quest objectives from its giver during every time period', () => {
    const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
    const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const encounterParsed = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    expect(worldParsed.ok && questParsed.ok && npcParsed.ok && encounterParsed.ok && calendarParsed.ok).toBe(true);
    if (!worldParsed.ok || !questParsed.ok || !npcParsed.ok || !encounterParsed.ok || !calendarParsed.ok) return;

    const worldResult = assembleWorldMap(worldParsed.data, maps);
    expect('ok' in worldResult).toBe(false);
    if ('ok' in worldResult) return;
    const world: WorldMapAssembly = worldResult;
    const quests = new Map(questParsed.set.quests.map((quest) => [quest.id, quest]));
    const ridgeQuestIds = [
      'quest.r62-north-pass-marks',
      'quest.r62-post-ledger',
      'quest.r62-clear-ridge-road',
    ];
    const ridgeEntry = world.transitions.find(({ to }) => to.mapResourceId === RIDGE_ID)!.to;
    const baseNpcs: PlacedNpc[] = npcParsed.set.npcs.map((record) => ({
      record,
      col: record.position.col,
      row: record.position.row,
    }));
    const encounters: PlacedEncounter[] = encounterParsed.set.encounters.map((record) => ({
      record,
      col: record.position.col,
      row: record.position.row,
      profile: {} as PlacedEncounter['profile'],
      enemyArts: [],
    }));
    const encounterCells = new Map<string, ReadonlySet<string>>();
    for (const mapId of maps.keys()) {
      encounterCells.set(mapId, new Set(encounters
        .filter(({ record }) => record.mapResourceId === mapId)
        .map(({ col, row }) => `${col},${row}`)));
    }
    const schedule = compileNpcSchedules({
      npcs: baseNpcs,
      periods: calendarParsed.calendar.periods,
      maps,
      blockedCellsByMap: encounterCells,
    });
    expect(schedule.warnings).toEqual([]);

    let routeSegments = 0;
    for (const period of calendarParsed.calendar.periods) {
      const periodNpcs = schedule.placementsByPeriod.get(period.id) ?? baseNpcs;
      const occupied = new Set<string>([
        ...periodNpcs.filter(({ record }) => record.mapResourceId === RIDGE_ID)
          .map(({ col, row }) => `${col},${row}`),
        ...(encounterCells.get(RIDGE_ID) ?? []),
      ]);
      occupied.delete(`${ridgeEntry.col},${ridgeEntry.row}`);
      const surface = blockedSurface(maps.get(RIDGE_ID)!, occupied);

      for (const questId of ridgeQuestIds) {
        const quest = quests.get(questId);
        expect(quest, `missing ${questId}`).toBeDefined();
        if (quest === undefined) continue;
        const journal: QuestJournal = {
          trackedQuestId: questId,
          states: new Map(questParsed.set.quests.map((record) => [record.id, {
            questId: record.id,
            status: record.id === questId ? 'active' as const : 'locked' as const,
            objectiveCounts: new Map(record.objectives.map((objective) => [objective.id, 0])),
          }])),
        };
        const targetResult = resolveQuestNavigationTarget({
          quests,
          journal,
          questId,
          worldMap: world,
          baseNpcs,
          periodNpcs,
          encounters,
        });
        expect(targetResult.status, `${questId} target in ${period.id}`).toBe('target');
        if (targetResult.status !== 'target') continue;

        const giver = periodNpcs.find(({ record }) => record.id === quest.giverNpcId);
        expect(giver, `${questId} giver in ${period.id}`).toBeDefined();
        if (giver === undefined) continue;
        const giverPath = findGridPathToAdjacentCell(surface, ridgeEntry, { col: giver.col, row: giver.row });
        expect(giverPath, `${questId} giver route in ${period.id}`).not.toBeNull();
        if (giverPath === null) continue;

        const target = targetResult.target;
        expect(target.mapResourceId).toBe(RIDGE_ID);
        const from = giverPath.at(-1)!;
        const targetPath = target.approachRadius === 1
          ? findGridPathToAdjacentCell(surface, from, target)
          : findGridPath(surface, from, target, { approachRadius: 0 });
        expect(targetPath, `${questId} objective route in ${period.id}`).not.toBeNull();
        routeSegments += 1;
      }
    }
    expect(routeSegments).toBe(ridgeQuestIds.length * calendarParsed.calendar.periods.length);
  });
});
