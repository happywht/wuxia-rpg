/** Round 74: fifth playable region — cloud-ridge map schema, two-way gates, quest chain and atlas integration. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

const RIDGE_ID = 'map.round-62-iron-ridge';
const CLOUD_ID = 'map.round-74-cloud-ridge';
const SHEN_ID = 'char.r74-shen-yuji';
const MARKS_ID = 'quest.r74-cloud-marks';
const BRIDGE_ID = 'quest.r74-cloud-bridge';
const BRIDGE_ENCOUNTER_ID = 'encounter.r74-cloud-bridge-bandits';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('Round 74 cloud-ridge playable region', () => {
  const maps = new Map([
    ['map.round-01-grid', loadMap('../data/base/maps/round-01-grid.json')],
    ['map.round-10-mist-ferry', loadMap('../data/base/maps/round-10-mist-ferry.json')],
    [RIDGE_ID, loadMap('../data/base/maps/round-62-iron-ridge.json')],
    ['map.round-67-salt-road', loadMap('../data/base/maps/round-67-salt-road.json')],
    [CLOUD_ID, loadMap('../data/base/maps/round-74-cloud-ridge.json')],
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
      ['map.round-97-lanxin-isle', loadMap('../data/base/maps/round-97-lanxin-isle.json')],
      ['map.round-97-pilot-reef', loadMap('../data/base/maps/round-97-pilot-reef.json')],
  ]);

  it('ships a complete, layered 100×100 CC0 map with bounded atlas gids and walkable ridge trails', () => {
    const cloud = maps.get(CLOUD_ID)!;
    expect(cloud.columns).toBe(100);
    expect(cloud.rows).toBe(100);
    expect(cloud.data.art?.layers).toHaveLength(11);
    expect(cloud.data.art?.layers.every((layer) =>
      layer.cells.length === cloud.rows && layer.cells.every((row) => row.length === cloud.columns),
    )).toBe(true);
    const tilesets = cloud.data.art?.tilesets ?? [];
    for (const layer of cloud.data.art?.layers ?? []) {
      const atlas = tilesets.find(({ id }) => id === layer.tilesetId);
      expect(atlas, `missing tileset ${layer.tilesetId} for ${layer.id}`).toBeDefined();
      for (const row of layer.cells) {
        for (const gid of row) expect(gid & 0x0fffffff).toBeLessThanOrEqual(atlas!.tileCount);
      }
    }
    const walkable = cloud.data.grid.flatMap((line) => [...line]).filter((tile) => tile !== '#');
    expect(walkable.length).toBeGreaterThanOrEqual(6_500);
    expect(readFileSync(new URL('../data/assets/kenney/roguelike-rpg/License.txt', import.meta.url), 'utf8'))
      .toContain('CC0');
  });

  it('keeps the iron-ridge pass as a real two-way walking connection into the cloud ridge', () => {
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
    expect(assembled.regions).toHaveLength(22);
    expect(assembled.transitions).toHaveLength(50);

    const ridge = maps.get(RIDGE_ID)!;
    const cloud = maps.get(CLOUD_ID)!;
    const northbound = assembled.transitions.find(({ id }) => id === 'gate.iron-ridge-to-cloud-ridge')!;
    const southbound = assembled.transitions.find(({ id }) => id === 'gate.cloud-ridge-to-iron-ridge')!;
    expect(northbound.from).toEqual({ mapResourceId: RIDGE_ID, col: 50, row: 2 });
    expect(findGridPath(ridge, ridge.playerStart, northbound.from)).not.toBeNull();
    expect(northbound.to).toEqual({ mapResourceId: CLOUD_ID, col: 50, row: 97 });
    expect(cloud.playerStart).toEqual({ col: northbound.to.col, row: northbound.to.row });
    expect(southbound.from).toEqual({ mapResourceId: CLOUD_ID, col: 49, row: 97 });
    expect(findGridPath(cloud, northbound.to, southbound.from)).not.toBeNull();
    expect(southbound.to).toEqual({ mapResourceId: RIDGE_ID, col: 50, row: 3 });
    expect(findGridPath(ridge, southbound.to, { col: 4, row: 7 })).not.toBeNull();
  });

  it('keeps all Cloud Ridge landmarks, events, NPC slots and encounters walkable and reachable from its arrival gate', () => {
    const cloud = maps.get(CLOUD_ID)!;
    const world = readJson('../data/base/world/world-map.json') as {
      transitions: Array<{ from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }>;
      landmarks: Array<{ id: string; mapResourceId: string; col: number; row: number }>;
      events: Array<{ id: string; mapResourceId: string; col: number; row: number }>;
    };
    const nodes = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(nodes.ok).toBe(true);
    if (!nodes.ok) return;
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-74-cloud-ridge-npcs.json'));
    expect(npcSet.ok).toBe(true);
    if (!npcSet.ok) return;
    const encounterSet = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    expect(encounterSet.ok).toBe(true);
    if (!encounterSet.ok) return;
    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;

    const incoming = world.transitions.find(({ to }) => to.mapResourceId === CLOUD_ID)!.to;
    const anchors: Array<{ id: string; col: number; row: number }> = [];
    for (const endpoint of world.transitions.flatMap(({ from, to }) => [from, to])) {
      if (endpoint.mapResourceId === CLOUD_ID) anchors.push({ id: 'gate', ...endpoint });
    }
    for (const point of [...world.landmarks, ...world.events]) {
      if (point.mapResourceId === CLOUD_ID) anchors.push({ ...point });
    }
    const cloudNpcRecords = npcSet.set.npcs.filter(({ mapResourceId }) => mapResourceId === CLOUD_ID);
    for (const npc of cloudNpcRecords) {
      anchors.push({ id: `${npc.id}:base`, ...npc.position });
      for (const [index, entry] of (npc.schedule ?? []).entries()) {
        anchors.push({ id: `${npc.id}:schedule:${index}`, ...entry.position });
      }
    }
    const cloudEncounters = encounterSet.set.encounters.filter(({ mapResourceId }) => mapResourceId === CLOUD_ID);
    for (const encounter of cloudEncounters) {
      anchors.push({ id: encounter.id, ...encounter.position });
    }

    for (const anchor of anchors) {
      expect(cloud.canEnter(anchor.col, anchor.row), `${anchor.id} is walkable`).toBe(true);
      expect(findGridPath(cloud, incoming, anchor), `${anchor.id} is reachable from the Cloud Ridge gate`).not.toBeNull();
    }
    expect(world.landmarks.filter(({ mapResourceId }) => mapResourceId === CLOUD_ID)).toHaveLength(4);
    expect(world.events.filter(({ mapResourceId }) => mapResourceId === CLOUD_ID)).toHaveLength(3);
    expect(cloudNpcRecords).toHaveLength(1);
    expect(cloudEncounters).toHaveLength(1);

    const cloudNpcs: PlacedNpc[] = cloudNpcRecords.map((record) => ({
      record,
      col: record.position.col,
      row: record.position.row,
    }));
    const occupied = new Set(cloudEncounters.map(({ position }) => `${position.col},${position.row}`));
    const schedule = compileNpcSchedules({
      npcs: cloudNpcs,
      periods: calendar.calendar.periods,
      maps,
      blockedCellsByMap: new Map([[CLOUD_ID, occupied]]),
    });
    expect(schedule.warnings).toEqual([]);
  });

  it('runs the two-step marker-and-bridge quest chain from Shen Yuji through dialogue data', () => {
    const questParsed = parseQuestSet(readJson('../data/base/quests/round-74-cloud-ridge-quests.json'));
    const npcParsed = parseNpcSet(readJson('../data/base/characters/round-74-cloud-ridge-npcs.json'));
    const dialogueParsed = parseDialogueSet(readJson('../data/base/dialogues/round-74-cloud-ridge-conversations.json'));
    const encounterParsed = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const nodesParsed = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(questParsed.ok && npcParsed.ok && dialogueParsed.ok && encounterParsed.ok && nodesParsed.ok).toBe(true);
    if (!questParsed.ok || !npcParsed.ok || !dialogueParsed.ok || !encounterParsed.ok || !nodesParsed.ok) return;

    const shen = npcParsed.set.npcs.find(({ id }) => id === SHEN_ID)!;
    expect(shen.questGiver).toBe(true);
    expect(shen.mapResourceId).toBe(CLOUD_ID);
    const dialogue = dialogueParsed.set.conversations.find(({ id }) => id === shen.dialogueId)!;
    expect(validateConversation(dialogue)).toEqual([]);
    const greet = dialogue.nodes.find(({ id }) => id === dialogue.startNodeId)!;
    for (const questId of [MARKS_ID, BRIDGE_ID]) {
      expect(greet.options?.some(({ effects }) => effects?.some((effect) =>
        effect.kind === 'acceptQuest' && effect.questId === questId))).toBe(true);
    }

    const assembled = assembleQuests({
      questSet: questParsed.set,
      questGiverNpcIds: new Set(npcParsed.set.npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id)),
      npcIds: new Set(npcParsed.set.npcs.map(({ id }) => id)),
      itemIds: new Set(),
      encounterIds: new Set(encounterParsed.set.encounters.map(({ id }) => id)),
      factionIds: new Set(),
      knowledgeNodeIds: new Set(nodesParsed.data.nodes.map(({ id }) => id)),
    });
    expect(assembled.warnings).toEqual([]);

    const marks = assembled.quests.get(MARKS_ID)!;
    const bridge = assembled.quests.get(BRIDGE_ID)!;
    expect(marks.prerequisiteQuestIds).toEqual([]);
    expect(marks.objectives).toContainEqual({
      id: 'objective.r74-cloud-marks', kind: 'discoverKnowledge', targetId: 'place.r74-cloud-markers',
      requiredCount: 1, text: '到云纹石阶辨认第三道刻痕',
    });
    expect(bridge.prerequisiteQuestIds).toEqual([MARKS_ID]);
    expect(bridge.objectives).toContainEqual({
      id: 'objective.r74-cloud-bridge', kind: 'defeatEncounter', targetId: BRIDGE_ENCOUNTER_ID,
      requiredCount: 1, text: '击退断索悬桥附近的拦路客',
    });

    const journal = createQuestJournal(assembled.quests);
    expect(journal.states.get(MARKS_ID)?.status).toBe('offered');
    expect(journal.states.get(BRIDGE_ID)?.status).toBe('locked');
    expect(acceptQuest(assembled.quests, journal, MARKS_ID).ok).toBe(true);
    expect(applyQuestSignal(assembled.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.r74-cloud-markers',
    }).completed.map(({ questId }) => questId)).toEqual([MARKS_ID]);
    expect(journal.states.get(MARKS_ID)?.status).toBe('completed');
    expect(journal.states.get(BRIDGE_ID)?.status).toBe('offered');
    expect(acceptQuest(assembled.quests, journal, BRIDGE_ID).ok).toBe(true);
    expect(applyQuestSignal(assembled.quests, journal, {
      type: 'encounter-victory', encounterId: BRIDGE_ENCOUNTER_ID,
    }).completed.map(({ questId }) => questId)).toEqual([BRIDGE_ID]);
    expect(journal.states.get(BRIDGE_ID)?.status).toBe('completed');
  });

  it('integrates into the shipped six-region atlas without reference warnings and stays on land', () => {
    const manifest = readJson('../data/base/manifest.json') as {
      resources: { id: string; path: string; schema: string }[];
    };
    const shippedMaps = new Map([...manifest.resources]
      .filter((resource) => resource.schema === 'grid-map')
      .map((resource) => {
        const result = parseGridMap(readJson('../data/base/' + resource.path));
        if (!result.ok) throw new Error(result.errors.join('\n'));
        return [resource.id, result.map] as const;
      }));

    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: Array<{ id: string }> };
    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: Array<{ id: string }> };
    const npcData = readJson('../data/base/characters/round-03-npcs.json') as { npcs: Array<{ id: string }> };
    const assembled = assembleWorldMap(parsed.data, shippedMaps, {
      knowledgeNodeIds: new Set(nodes.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set([...npcData.npcs.map(({ id }) => id), 'char.r87-ao-wanqing']),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions.map(({ mapResourceId }) => mapResourceId)).toContain(CLOUD_ID);

    const art = parsed.data.atlasArt!;
    const land = art.layers.find(({ id }) => id === 'world-land')!.cells;
    const cloudRegion = assembled.regions.find(({ mapResourceId }) => mapResourceId === CLOUD_ID)!;
    const col = Math.round(cloudRegion.atlasPosition.x / 100 * (art.columns - 1));
    const row = Math.round(cloudRegion.atlasPosition.y / 100 * (art.rows - 1));
    expect(land[row]?.[col]).toBeGreaterThan(1);
  });
});
