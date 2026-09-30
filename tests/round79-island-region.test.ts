/** Round 79: sixth playable coastal region, CC0 pixel atlas and expanded movable world map. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { projectAtlasPosition } from '../src/engine/world-atlas-view';
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

const ISLES_ID = 'map.round-79-isles';
const QUEST_ID = 'quest.r79-tide-chart';
const NPC_ID = 'char.r79-shao-tinglan';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
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

describe('Round 79 sixth coastal region and movable world atlas', () => {
  it('ships a walkable 100×100 island map using the licensed 16px Puny World spritesheet', () => {
    const map = maps.get(ISLES_ID)!;
    expect(map.columns).toBe(100);
    expect(map.rows).toBe(100);
    const walkableCount = map.data.grid.flatMap((line) => [...line]).filter((cell) => cell !== '#' && cell !== '~').length;
    expect(walkableCount).toBeGreaterThanOrEqual(5_500);

    const punyWorld = map.data.art?.tilesets.find(({ id }) => id === 'opengameart.puny-world');
    expect(punyWorld).toMatchObject({ tileSize: 16, columns: 27, rows: 65, tileCount: 1755, spacing: 0 });
    const usesPunyWorld = map.data.art?.layers.filter(({ tilesetId }) => tilesetId === 'opengameart.puny-world') ?? [];
    expect(usesPunyWorld.map(({ id }) => id)).toEqual(['r79-sea', 'r79-island-ground', 'r79-pine-groves']);
    for (const layer of usesPunyWorld) {
      expect(layer.cells).toHaveLength(100);
      expect(layer.cells.every((line) => line.length === 100)).toBe(true);
      expect(layer.cells.flat().every((gid) => gid <= 1755)).toBe(true);
    }

    const png = readFileSync(new URL('../data/assets/opengameart/puny-world/tileset.png', import.meta.url));
    expect(png.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(432);
    expect(png.readUInt32BE(20)).toBe(1040);
    const notice = readFileSync(new URL('../data/assets/opengameart/puny-world/NOTICE.txt', import.meta.url), 'utf8');
    expect(notice).toContain('https://opengameart.org/content/16x16-puny-world-tileset');
    expect(notice).toContain('CC0');
  });

  it('connects the ferry and island through real two-way, collision-valid walking gates', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const nodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] };
    const calendar = readJson('../data/base/worldview/calendar.json') as { periods: { id: string }[] };
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: { id: string }[] };
    const npcManifest = manifest.resources.filter(({ schema }) => schema === 'npc-set');
    const allNpcIds = npcManifest.flatMap(({ path }) => {
      const raw = readJson(`../data/base/${path}`) as { npcs: { id: string }[] };
      return raw.npcs.map(({ id }) => id);
    });
    const npcs = parseNpcSet(readJson('../data/base/characters/round-79-isles-npcs.json'));
    expect(npcs.ok).toBe(true);
    if (!npcs.ok) return;

    const assembled = assembleWorldMap(parsed.data, maps, {
      knowledgeNodeIds: new Set(nodes.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set(allNpcIds),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(9);
    expect(assembled.transitions).toHaveLength(16);
    expect(parsed.data.atlasArt).toMatchObject({ columns: 448, rows: 320, tileSize: 16 });

    const ferry = maps.get('map.round-10-mist-ferry')!;
    const isles = maps.get(ISLES_ID)!;
    const outbound = assembled.transitions.find(({ id }) => id === 'gate.r79-ferry-to-isles')!;
    const homebound = assembled.transitions.find(({ id }) => id === 'gate.r79-isles-to-ferry')!;
    expect(findGridPath(ferry, ferry.playerStart, outbound.from)).not.toBeNull();
    expect(outbound.to).toEqual({ mapResourceId: ISLES_ID, ...isles.playerStart });
    expect(findGridPath(isles, isles.playerStart, homebound.from)).not.toBeNull();
    expect(findGridPath(ferry, homebound.to, outbound.from)).not.toBeNull();

    const knownLandmarks = parsed.data.landmarks.filter(({ mapResourceId }) => mapResourceId === ISLES_ID);
    expect(knownLandmarks).toHaveLength(4);
    const localEvents = parsed.data.events.filter(({ mapResourceId }) => mapResourceId === ISLES_ID);
    expect(localEvents).toHaveLength(3);
    for (const anchor of [...knownLandmarks, ...localEvents]) {
      expect(findGridPath(isles, isles.playerStart, anchor)).not.toBeNull();
    }
  });

  it('keeps the expanded atlas pan-ready while preserving the five old region anchors', () => {
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.data.atlasArt === undefined) return;
    const oldPositions = new Map([
      ['map.round-01-grid', { x: 20, y: 46 }],
      ['map.round-10-mist-ferry', { x: 64, y: 61 }],
      ['map.round-62-iron-ridge', { x: 64, y: 26 }],
      ['map.round-67-salt-road', { x: 20, y: 61 }],
      ['map.round-74-cloud-ridge', { x: 86, y: 51 }],
    ]);
    const oldAtlas = { ...parsed.data.atlasArt, columns: 208, rows: 128 };
    for (const [mapId, oldPosition] of oldPositions) {
      const region = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === mapId)!;
      const before = projectAtlasPosition(oldPosition, oldAtlas);
      const after = projectAtlasPosition(region.atlasPosition, parsed.data.atlasArt);
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.001);
    }

    const islandTiles = parsed.data.atlasArt.tilesets.find(({ id }) => id === 'opengameart.puny-world');
    expect(islandTiles).toBeDefined();
    for (const id of ['world-r79-shoal-water', 'world-r79-shoal-sand', 'world-r79-shoal-land', 'world-r79-gate-routes']) {
      const layer = parsed.data.atlasArt.layers.find(({ id: layerId }) => layerId === id)!;
      expect(layer.cells.flat().some((gid) => gid > 0)).toBe(true);
      expect(layer.cells.flat().every((gid) => gid <= (layer.tilesetId === islandTiles?.id ? 1755 : 1767))).toBe(true);
    }
  });

  it('runs the data-driven tide-chart quest through dialogue and discovered map knowledge', () => {
    const quest = parseQuestSet(readJson('../data/base/quests/round-79-isles-quests.json'));
    const npc = parseNpcSet(readJson('../data/base/characters/round-79-isles-npcs.json'));
    const dialogue = parseDialogueSet(readJson('../data/base/dialogues/round-79-isles-conversations.json'));
    const knowledge = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(quest.ok && npc.ok && dialogue.ok && knowledge.ok).toBe(true);
    if (!quest.ok || !npc.ok || !dialogue.ok || !knowledge.ok) return;

    const giver = npc.set.npcs.find(({ id }) => id === NPC_ID)!;
    expect(giver.mapResourceId).toBe(ISLES_ID);
    const conversation = dialogue.set.conversations.find(({ id }) => id === giver.dialogueId)!;
    expect(validateConversation(conversation)).toEqual([]);
    const assembled = assembleQuests({
      questSet: quest.set,
      questGiverNpcIds: new Set(npc.set.npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id)),
      npcIds: new Set(npc.set.npcs.map(({ id }) => id)),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds: new Set(knowledge.data.nodes.map(({ id }) => id)),
    });
    expect(assembled.warnings).toEqual([]);
    expect(conversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID))).toBe(true);

    const journal = createQuestJournal(assembled.quests);
    expect(journal.states.get(QUEST_ID)?.status).toBe('offered');
    expect(acceptQuest(assembled.quests, journal, QUEST_ID).ok).toBe(true);
    const completion = applyQuestSignal(assembled.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.r79-white-beacon',
    });
    expect(completion.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(journal.states.get(QUEST_ID)?.status).toBe('completed');
    expect(completion.completed[0]?.discoverKnowledgeNodeIds).toContain('place.r79-west-reef');
  });
});
