/** Round 84: eastward atlas expansion, walkable Windward Isle and its lamp-ledger quest. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { parseNpcSet } from '../src/engine/npc-placement';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

const ISLE_ID = 'map.round-84-windward-isle';
const COAST_ID = 'map.round-82-east-coast';
const NPC_ID = 'char.r84-ruan-huilan';
const QUEST_ID = 'quest.r84-lantern-ledger';
const BEACON_ID = 'place.r84-windward-beacon';
const SPRING_ID = 'place.r84-spring-hollow';

function readJson(path: string): any {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as any;
}

function parseMap(raw: unknown): GridMap {
  const parsed = parseGridMap(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

const manifest = readJson('../data/base/manifest.json') as {
  resources: { id: string; path: string; schema: string }[];
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parseMap(readJson(`../data/base/${resource.path}`)));
}

describe('Round 84 Windward Isle and expanded world atlas', () => {
  it('adds a 100×100 island using the registered CC0 pixel atlases', () => {
    const map = maps.get(ISLE_ID)!;
    expect(map.data).toMatchObject({ columns: 100, rows: 100, tileSize: 48 });
    const art = map.data.art!;
    expect(art.tilesets.map(({ id }) => id)).toEqual([
      'opengameart.puny-world', 'opengameart.rpg-town', 'opengameart.puny-characters',
    ]);
    expect(art.layers.map(({ id }) => id)).toEqual([
      'r84-sea', 'r84-island-ground', 'r84-stone-hamlet', 'r84-pine-groves',
    ]);
    const walkable = map.data.grid.flatMap((line) => [...line]).filter((cell) => cell !== '#' && cell !== '~').length;
    expect(walkable).toBeGreaterThan(5_000);

    const landmarks = [
      { col: 1, row: 50 }, { col: 50, row: 47 }, { col: 51, row: 49 },
      { col: 80, row: 38 }, { col: 40, row: 62 },
    ];
    for (const point of landmarks) expect(findGridPath(map, map.playerStart, point)).not.toBeNull();
    for (const layer of art.layers) {
      expect(layer.cells).toHaveLength(100);
      expect(layer.cells.every((line) => line.length === 100)).toBe(true);
      const tileset = art.tilesets.find(({ id }) => id === layer.tilesetId)!;
      expect(layer.cells.flat().every((gid) => gid <= tileset.tileCount)).toBe(true);
    }

    const worldNotice = readFileSync(new URL('../data/assets/opengameart/puny-world/NOTICE.txt', import.meta.url), 'utf8');
    expect(worldNotice).toContain('https://opengameart.org/content/16x16-puny-world-tileset');
    expect(worldNotice).toContain('CC0');
    const townLicense = readFileSync(new URL('../data/assets/opengameart/rpg-town-pixel-art-assets/License.txt', import.meta.url), 'utf8');
    expect(townLicense).toContain('CC0');
  });

  it('keeps the old atlas area intact and pins Windward Isle on the new eastern landmass', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.data.atlasArt === undefined) return;
    expect(parsed.data.atlasArt).toMatchObject({ columns: 640, rows: 448, tileSize: 16 });
    expect(parsed.data.regions).toHaveLength(12);
    expect(parsed.data.transitions).toHaveLength(22);

    const region = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === ISLE_ID)!;
    const col = Math.round(region.atlasPosition.x / 100 * (parsed.data.atlasArt.columns - 1));
    const row = Math.round(region.atlasPosition.y / 100 * (parsed.data.atlasArt.rows - 1));
    expect({ col, row }).toEqual({ col: 355, row: 125 });
    const land = parsed.data.atlasArt.layers.find(({ id }) => id === 'world-r84-expanse-land')!;
    expect(land.cells[row]?.[col]).toBeGreaterThan(0);
    expect(land.cells.flat().filter((gid) => gid > 0).length).toBeGreaterThan(2_000);

    const oldArea = parsed.data.atlasArt.layers.filter(({ id }) => !id.startsWith('world-r84-') && !id.startsWith('world-r85-') && !id.startsWith('world-r87-') &&
      !id.startsWith('world-r91-') && !id.startsWith('world-r92-'));
    expect(oldArea.map(({ id }) => id)).toEqual([
      'world-ocean', 'world-land', 'world-coast', 'world-forest', 'world-relief', 'world-roads', 'world-settlements',
      'world-r79-shoal-water', 'world-r79-shoal-sand', 'world-r79-shoal-land', 'world-r79-shoal-pines',
      'world-r79-gate-routes',
      'world-r81-expanse-water', 'world-r81-expanse-sand', 'world-r81-expanse-land', 'world-r81-expanse-pines',
    ]);
    expect(oldArea.every((layer) => layer.cells.length === 448 && layer.cells.every((line) => line.length === 640))).toBe(true);
  });

  it('connects both coasts through collision-valid reachable gates and anchors', () => {
    const rawWorld = readJson('../data/base/world/world-map.json');
    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const knowledge = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] };
    const calendar = readJson('../data/base/worldview/calendar.json') as { periods: { id: string }[] };
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: { id: string }[] };
    const npcIds = manifest.resources
      .filter(({ schema }) => schema === 'npc-set')
      .flatMap(({ path }) => (readJson(`../data/base/${path}`) as { npcs: { id: string }[] }).npcs.map(({ id }) => id));
    const assembled = assembleWorldMap(parsed.data, maps, {
      knowledgeNodeIds: new Set(knowledge.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set(npcIds),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);

    const coast = maps.get(COAST_ID)!;
    const isle = maps.get(ISLE_ID)!;
    const outbound = assembled.transitions.find(({ id }) => id === 'gate.r84-east-coast-to-windward-isle')!;
    const returnGate = assembled.transitions.find(({ id }) => id === 'gate.r84-windward-isle-to-east-coast')!;
    expect(outbound.to).toEqual({ mapResourceId: ISLE_ID, ...isle.playerStart });
    expect(findGridPath(coast, coast.playerStart, outbound.from)).not.toBeNull();
    expect(findGridPath(isle, isle.playerStart, returnGate.from)).not.toBeNull();
    expect(findGridPath(coast, returnGate.to, outbound.from)).not.toBeNull();

    for (const anchor of [
      ...assembled.landmarks.filter(({ mapResourceId }) => mapResourceId === ISLE_ID),
      ...assembled.events.filter(({ mapResourceId }) => mapResourceId === ISLE_ID),
    ]) {
      expect(findGridPath(isle, isle.playerStart, anchor), anchor.id).not.toBeNull();
    }
  });

  it('runs the lamp-ledger quest from NPC dialogue through discovery and graph rewards', () => {
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-84-windward-isle-npcs.json'));
    const dialogueSet = parseDialogueSet(readJson('../data/base/dialogues/round-84-windward-isle-conversations.json'));
    const questSet = parseQuestSet(readJson('../data/base/quests/round-84-windward-isle-quests.json'));
    const knowledgeSet = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(npcSet.ok && dialogueSet.ok && questSet.ok && knowledgeSet.ok).toBe(true);
    if (!npcSet.ok || !dialogueSet.ok || !questSet.ok || !knowledgeSet.ok) return;

    const giver = npcSet.set.npcs.find(({ id }) => id === NPC_ID)!;
    expect(giver.mapResourceId).toBe(ISLE_ID);
    const conversation = dialogueSet.set.conversations.find(({ id }) => id === giver.dialogueId)!;
    expect(validateConversation(conversation)).toEqual([]);
    const knowledgeNodeIds = new Set(knowledgeSet.data.nodes.map(({ id }) => id));
    const quests = assembleQuests({
      questSet: questSet.set,
      questGiverNpcIds: new Set([NPC_ID]),
      npcIds: new Set([NPC_ID]),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds,
    });
    expect(quests.warnings).toEqual([]);
    expect(conversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID))).toBe(true);

    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    const result = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: BEACON_ID });
    expect(result.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(result.completed[0]?.discoverKnowledgeNodeIds).toContain(SPRING_ID);

    const graph = readJson('../data/base/knowledge_graph/edges.json') as {
      edges: { id: string; fromId: string; toId: string }[];
    };
    const newEdges = graph.edges.filter(({ id }) => id.startsWith('kg.edge.r84-'));
    expect(newEdges).toHaveLength(8);
    for (const edge of newEdges) {
      expect(knowledgeNodeIds.has(edge.fromId), `${edge.id} from`).toBe(true);
      expect(knowledgeNodeIds.has(edge.toId), `${edge.id} to`).toBe(true);
    }
  });
});
