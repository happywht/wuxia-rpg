import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, type GridPathSurface } from '../src/engine/grid-path';
import { assembleKnowledgeGraph, parseKnowledgeEdgeSet, parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { applyQuestSignal, assembleQuests, createQuestJournal, acceptQuest, parseQuestSet } from '../src/engine/quest-system';
import { parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { indexFactions, indexMartialArts, parseFactionSet, parseMartialArtSet } from '../src/engine/character-progression';
import { indexItems, parseItemSet } from '../src/engine/item-system';

const SALT_ID = 'map.round-67-salt-road';
const QUEST_ID = 'quest.r67-well-waterline';
const WELL_ID = 'place.r67-brine-well';

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

describe('Round 67 fourth playable region and expanded atlas', () => {
  const maps = new Map<string, GridMap>([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    ['map.round-62-iron-ridge', loadMap('../data/base/maps/round-62-iron-ridge.json')],
    [SALT_ID, loadMap('../data/base/maps/round-67-salt-road.json')],
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

  it('generates a layered 100×100 Kenney CC0 map with a distinct salt-pan overlay', () => {
    const map = maps.get(SALT_ID)!;
    expect(map.columns).toBe(100);
    expect(map.rows).toBe(100);
    expect(map.data.art?.tilesets.some(({ id }) => id === 'kenney.roguelike-rpg')).toBe(true);
    expect(map.data.art?.layers).toHaveLength(11);
    expect(map.data.art?.layers.every((layer) =>
      layer.cells.length === map.rows && layer.cells.every((row) => row.length === map.columns),
    )).toBe(true);
    const panCells = map.data.art?.layers.find(({ id }) => id === 'salt-road-brine-pans')?.cells.flat() ?? [];
    expect(new Set(panCells.filter((gid) => gid !== 0))).toEqual(new Set([143, 144, 148, 149]));
    expect(panCells.filter((gid) => gid !== 0).length).toBeGreaterThan(700);
    expect(map.data.grid.flatMap((line) => [...line]).filter((tile) => tile !== '#').length).toBeGreaterThan(8000);
    expect(readFileSync(new URL('../data/assets/kenney/roguelike-rpg/License.txt', import.meta.url), 'utf8'))
      .toContain('CC0');
  });

  it('keeps the original salt-road routes valid in the enlarged six-region atlas', () => {
    const worldParse = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(worldParse.ok).toBe(true);
    if (!worldParse.ok) return;
    const graph = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    const climateRaw = readJson('../data/base/worldview/climate.json') as { weathers: { id: string }[] };
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    expect(graph.ok && calendar.ok && npcSet.ok).toBe(true);
    if (!graph.ok || !calendar.ok || !npcSet.ok) return;
    const assembled = assembleWorldMap(worldParse.data, maps, {
      knowledgeNodeIds: new Set(graph.data.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climateRaw.weathers.map(({ id }) => id)),
      npcIds: new Set([...npcSet.set.npcs.map(({ id }) => id), 'char.r87-ao-wanqing']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(20);
    expect(assembled.transitions).toHaveLength(42);
    expect(worldParse.data.atlasArt).toMatchObject({ columns: 768, rows: 576, tileSize: 8 });
    const salt = maps.get(SALT_ID)!;
    const saltIncoming = assembled.transitions.find(({ id }) => id === 'gate.iron-ridge-to-salt-road')!;
    const saltOutgoing = assembled.transitions.find(({ id }) => id === 'gate.salt-road-to-iron-ridge')!;
    const ridge = maps.get('map.round-62-iron-ridge')!;
    const ridgeIncoming = assembled.transitions.find(({ id }) => id === 'gate.iron-ridge-to-salt-road')!;
    expect(salt.playerStart).toEqual({ col: saltIncoming.to.col, row: saltIncoming.to.row });
    expect(findGridPath(ridge, ridge.playerStart, ridgeIncoming.from)).not.toBeNull();
    expect(findGridPath(salt, salt.playerStart, saltOutgoing.from)).not.toBeNull();
    expect(saltIncoming.from).toEqual({ mapResourceId: ridge.data.id, col: 52, row: 90 });
    expect(saltOutgoing.to).toEqual({ mapResourceId: ridge.data.id, col: 53, row: 90 });
  });

  it('keeps all salt-road gates, landmarks, events, NPC schedule slots and encounters reachable', () => {
    const map = maps.get(SALT_ID)!;
    const world = JSON.parse(readFileSync(new URL('../data/base/world/world-map.json', import.meta.url), 'utf8')) as {
      transitions: { from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }[];
      landmarks: { id: string; mapResourceId: string; col: number; row: number }[];
      events: { id: string; mapResourceId: string; col: number; row: number }[];
    };
    const npcs = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const encounters = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    expect(npcs.ok && encounters.ok && calendar.ok).toBe(true);
    if (!npcs.ok || !encounters.ok || !calendar.ok) return;

    const saltNpcRecords = npcs.set.npcs.filter(({ mapResourceId }) => mapResourceId === SALT_ID);
    const saltNpcs: PlacedNpc[] = saltNpcRecords.map((record) => ({
      record, col: record.position.col, row: record.position.row,
    }));
    const occupied = new Set(encounters.set.encounters
      .filter(({ mapResourceId }) => mapResourceId === SALT_ID)
      .map(({ position }) => `${position.col},${position.row}`));
    const schedule = compileNpcSchedules({
      npcs: saltNpcs,
      periods: calendar.calendar.periods,
      maps,
      blockedCellsByMap: new Map([[SALT_ID, occupied]]),
    });
    expect(schedule.warnings).toEqual([]);
    const incoming = world.transitions.find(({ to }) => to.mapResourceId === SALT_ID)!.to;
    const anchors: Array<{ id: string; col: number; row: number }> = [];
    for (const transition of world.transitions) {
      for (const endpoint of [transition.from, transition.to]) {
        if (endpoint.mapResourceId === SALT_ID) anchors.push({ id: 'gate', ...endpoint });
      }
    }
    for (const point of [...world.landmarks, ...world.events]) {
      if (point.mapResourceId === SALT_ID) anchors.push(point);
    }
    for (const npc of saltNpcRecords) {
      anchors.push({ id: npc.id, ...npc.position });
      for (const [index, slot] of (npc.schedule ?? []).entries()) anchors.push({ id: `${npc.id}:${index}`, ...slot.position });
    }
    for (const encounter of encounters.set.encounters.filter(({ mapResourceId }) => mapResourceId === SALT_ID)) {
      anchors.push({ id: encounter.id, ...encounter.position });
    }
    for (const anchor of anchors) {
      expect(map.canEnter(anchor.col, anchor.row), `${anchor.id} walkable`).toBe(true);
      expect(findGridPath(map, incoming, anchor), `${anchor.id} reachable from entry`).not.toBeNull();
    }
    expect(findGridPath(map, incoming, { col: 26, row: 28 })).not.toBeNull();
    const journalSurface = blockedSurface(map, occupied);
    expect(journalSurface.canEnter(72, 59)).toBe(false);
  });

  it('connects the gated well discovery to Luo Jinzi’s quest dialogue and completion reward', () => {
    const quests = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const dialogues = parseDialogueSet(readJson('../data/base/dialogues/round-67-conversations.json'));
    const nodes = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    const edges = parseKnowledgeEdgeSet(readJson('../data/base/knowledge_graph/edges.json'));
    const encounterSet = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const itemSet = parseItemSet(readJson('../data/base/items/round-06-items.json'));
    const factionSet = parseFactionSet(readJson('../data/base/factions/round-04-factions.json'));
    const martialSet = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
    expect(quests.ok && npcSet.ok && dialogues.ok && nodes.ok && edges.ok && encounterSet.ok && itemSet.ok && factionSet.ok && martialSet.ok)
      .toBe(true);
    if (!quests.ok || !npcSet.ok || !dialogues.ok || !nodes.ok || !edges.ok || !encounterSet.ok || !itemSet.ok || !factionSet.ok || !martialSet.ok) return;

    const graph = assembleKnowledgeGraph(nodes.data, edges.data);
    expect(graph.warnings).toEqual([]);
    const quest = quests.set.quests.find(({ id }) => id === QUEST_ID)!;
    const dialogue = dialogues.set.conversations.find(({ id }) => id === 'dlg.luo-jinzi-salt-road')!;
    expect(validateConversation(dialogue)).toEqual([]);
    const greet = dialogue.nodes.find(({ id }) => id === dialogue.startNodeId)!;
    const offer = greet.options?.find(({ effects }) => effects?.some((effect) =>
      effect.kind === 'acceptQuest' && effect.questId === QUEST_ID));
    expect(offer?.conditions).toContainEqual({ kind: 'questStatus', questId: QUEST_ID, status: 'offered' });
    expect(offer?.nextNodeId).toBe('accepted');
    expect(quest.objectives).toContainEqual({
      id: 'objective.r67-well-waterline', kind: 'discoverKnowledge', targetId: WELL_ID,
      requiredCount: 1, text: '查看回声苦井的水线与井壁刻痕',
    });

    const factionIds = indexFactions(factionSet.set).byId as Map<string, unknown>;
    const martialArts = indexMartialArts({ set: martialSet.set, factionIds: new Set(factionIds.keys()) }).byId as Map<string, unknown>;
    const items = indexItems(itemSet.set).byId as Map<string, unknown>;
    const knowledge = new Set(graph.nodes.keys());
    const assembledQuests = assembleQuests({
      questSet: quests.set,
      questGiverNpcIds: new Set(npcSet.set.npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id)),
      npcIds: new Set(npcSet.set.npcs.map(({ id }) => id)),
      itemIds: new Set(items.keys()),
      encounterIds: new Set(encounterSet.set.encounters.map(({ id }) => id)),
      factionIds: new Set(factionIds.keys()),
      knowledgeNodeIds: knowledge,
    });
    expect(assembledQuests.warnings).toEqual([]);
    const journal = createQuestJournal(assembledQuests.quests);
    expect(journal.states.get(QUEST_ID)?.status).toBe('offered');
    expect(acceptQuest(assembledQuests.quests, journal, QUEST_ID).ok).toBe(true);
    const update = applyQuestSignal(assembledQuests.quests, journal, { type: 'knowledge-discovery', nodeId: WELL_ID });
    expect(update.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(journal.states.get(QUEST_ID)?.status).toBe('completed');
    expect(martialArts.size).toBeGreaterThan(0);
  });
});
