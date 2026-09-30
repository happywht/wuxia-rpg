/** Round 82: a walkable eastern coastline, two-way land route and data-authored tide quest. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import { projectAtlasPosition } from '../src/engine/world-atlas-view';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { parseNpcSet } from '../src/engine/npc-placement';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { assembleWorldMap, parseWorldMap, selectInteractableRegionEvent } from '../src/engine/world-map';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';

const COAST_ID = 'map.round-82-east-coast';
const CLOUD_ID = 'map.round-74-cloud-ridge';
const NPC_ID = 'char.r82-wen-chaozhi';
const QUEST_ID = 'quest.r82-follow-the-tide';
const BEACON_ID = 'place.r82-east-tide-gauge';
const COVE_ID = 'place.r82-fog-cove';

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
  maps.set(resource.id, parseMap(readJson('../data/base/' + resource.path)));
}

describe('Round 82 eastern coastline and walkable world expansion', () => {
  it('preserves earlier region pins while keeping the coast reachable from the expanded atlas', () => {
    const rawWorld = readJson('../data/base/world/world-map.json');
    const parsed = parseWorldMap(rawWorld);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.regions).toHaveLength(20);
    expect(parsed.data.transitions).toHaveLength(42);
    expect(maps.size).toBe(20);
    expect(maps.has(COAST_ID)).toBe(true);

    const oldPositions = new Map([
      ['map.round-01-grid', { x: 6.47887309, y: 13.06935128 }],
      ['map.round-10-mist-ferry', { x: 20.73239445, y: 17.33109614 }],
      ['map.round-62-iron-ridge', { x: 20.73239445, y: 7.38702458 }],
      ['map.round-67-salt-road', { x: 6.47887309, y: 17.33109614 }],
      ['map.round-74-cloud-ridge', { x: 27.85915479, y: 14.48993279 }],
      ['map.round-79-isles', { x: 17.44913928, y: 28.47203579 }],
    ]);
    const priorArt = { ...parsed.data.atlasArt!, columns: 640, rows: 448 };
    for (const [id, position] of oldPositions) {
      const region = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === id);
      const current = projectAtlasPosition(region!.atlasPosition, parsed.data.atlasArt!);
      const previous = projectAtlasPosition(position, priorArt);
      expect(current.x, `${id} atlas x`).toBeCloseTo(previous.x, 3);
      expect(current.y, `${id} atlas y`).toBeCloseTo(previous.y, 3);
    }
    expect(parsed.data.atlasArt).toMatchObject({ columns: 768, rows: 576, tileSize: 8 });
    const newRegion = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === COAST_ID)!;
    expect(newRegion.name).toBe('东溟海岸·青帆埠');
    const coastCenter = projectAtlasPosition(newRegion.atlasPosition, parsed.data.atlasArt!);
    expect(coastCenter.x / parsed.data.atlasArt!.tileSize).toBeCloseTo(285.25, 3);
    expect(coastCenter.y / parsed.data.atlasArt!.tileSize).toBeCloseTo(98.62, 3);
    const atlasColumn = Math.round(newRegion.atlasPosition.x / 100 * (parsed.data.atlasArt!.columns - 1));
    const atlasRow = Math.round(newRegion.atlasPosition.y / 100 * (parsed.data.atlasArt!.rows - 1));
    const eastLand = parsed.data.atlasArt!.layers.find(({ id }) => id === 'world-r81-expanse-land')!;
    expect(eastLand.cells[atlasRow]?.[atlasColumn]).toBeGreaterThan(0);
  });

  it('connects the coast to Cloud Ridge through passable, reachable endpoints', () => {
    const coast = maps.get(COAST_ID)!;
    const cloud = maps.get(CLOUD_ID)!;
    const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const knownNodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] };
    const calendar = readJson('../data/base/worldview/calendar.json') as { periods: { id: string }[] };
    const climate = readJson('../data/base/worldview/climate.json') as { weathers: { id: string }[] };
    const npcIds = manifest.resources
      .filter(({ schema }) => schema === 'npc-set')
      .flatMap(({ path }) => (readJson('../data/base/' + path) as { npcs: { id: string }[] }).npcs.map(({ id }) => id));
    const assembled = assembleWorldMap(parsed.data, maps, {
      knowledgeNodeIds: new Set(knownNodes.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.weathers.map(({ id }) => id)),
      npcIds: new Set(npcIds),
    });
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);

    const outbound = assembled.transitions.find(({ id }) => id === 'gate.r82-cloud-ridge-to-east-coast')!;
    const returnGate = assembled.transitions.find(({ id }) => id === 'gate.r82-east-coast-to-cloud-ridge')!;
    expect(outbound.to).toEqual({ mapResourceId: COAST_ID, ...coast.playerStart });
    expect(findGridPath(cloud, cloud.playerStart, outbound.from)).not.toBeNull();
    expect(findGridPath(coast, coast.playerStart, returnGate.from)).not.toBeNull();
    expect(findGridPath(cloud, returnGate.to, outbound.from)).not.toBeNull();

    const coastLandmarks = assembled.landmarks.filter(({ id, mapResourceId }) =>
      mapResourceId === COAST_ID && id !== 'landmark.r89-east-channel-mark');
    expect(coastLandmarks).toHaveLength(5);
    for (const landmark of coastLandmarks) {
      expect(findGridPath(coast, coast.playerStart, landmark)).not.toBeNull();
    }
    const coastEvents = assembled.events.filter(({ id }) =>
      id.startsWith('event.r82-') || id === 'event.r83-night-channel');
    expect(coastEvents).toHaveLength(4);
    for (const event of coastEvents) {
      if (event.interaction === undefined) {
        expect(findGridPath(coast, coast.playerStart, event)).not.toBeNull();
      }
    }
    const tideGauge = coastEvents.find(({ id }) => id === 'event.r82-tide-gauge')!;
    expect(tideGauge.interaction?.prompt).toBe('抄录东汊石潮尺的刻痕');
    const selection = selectInteractableRegionEvent(
      coastEvents,
      { mapResourceId: COAST_ID, col: tideGauge.col + 1, row: tideGauge.row },
      new Set(),
      { knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null },
      coast.canEnter.bind(coast),
    );
    expect(selection).toMatchObject({ event: { id: tideGauge.id }, approachDirection: 'left' });
  });

  it('uses licensed pixel atlases for shoreline, market details and the local character', () => {
    const coast = maps.get(COAST_ID)!;
    const layers = coast.data.art?.layers ?? [];
    expect(layers.map(({ id }) => id)).toEqual([
      'r82-sea', 'r82-coastal-ground', 'r82-blue-sail-market', 'r82-pine-groves',
    ]);
    const punyWorld = coast.data.art?.tilesets.find(({ id }) => id === 'opengameart.puny-world');
    const town = coast.data.art?.tilesets.find(({ id }) => id === 'opengameart.rpg-town');
    const actors = coast.data.art?.tilesets.find(({ id }) => id === 'opengameart.puny-characters');
    expect(punyWorld).toMatchObject({ tileSize: 16, columns: 27, rows: 65, tileCount: 1755, spacing: 0 });
    expect(town).toMatchObject({ tileSize: 16, columns: 22, rows: 18, tileCount: 396, spacing: 0 });
    expect(actors).toMatchObject({ tileSize: 16, columns: 20, rows: 16, tileCount: 320, spacing: 0 });
    for (const layer of layers) {
      expect(layer.cells).toHaveLength(100);
      expect(layer.cells.every((line) => line.length === 100)).toBe(true);
    }
    expect(layers.find(({ id }) => id === 'r82-blue-sail-market')!.cells.flat().filter((gid) => gid > 0).length)
      .toBeGreaterThanOrEqual(7);

    const punyImage = readFileSync(new URL('../data/assets/opengameart/puny-world/tileset.png', import.meta.url));
    expect(punyImage.toString('hex', 0, 8)).toBe('89504e470d0a1a0a');
    expect([punyImage.readUInt32BE(16), punyImage.readUInt32BE(20)]).toEqual([432, 1040]);
    const punyNotice = readFileSync(new URL('../data/assets/opengameart/puny-world/NOTICE.txt', import.meta.url), 'utf8');
    expect(punyNotice).toContain('CC0');
    const townLicense = readFileSync(new URL('../data/assets/opengameart/rpg-town-pixel-art-assets/License.txt', import.meta.url), 'utf8');
    expect(townLicense).toContain('CC0');
  });

  it('accepts the tide task from dialogue and completes it through knowledge discovery', () => {
    const quest = parseQuestSet(readJson('../data/base/quests/round-82-east-coast-quests.json'));
    const npcs = parseNpcSet(readJson('../data/base/characters/round-82-east-coast-npcs.json'));
    const dialogues = parseDialogueSet(readJson('../data/base/dialogues/round-82-east-coast-conversations.json'));
    const knowledge = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(quest.ok && npcs.ok && dialogues.ok && knowledge.ok).toBe(true);
    if (!quest.ok || !npcs.ok || !dialogues.ok || !knowledge.ok) return;

    const giver = npcs.set.npcs.find(({ id }) => id === NPC_ID)!;
    expect(giver.mapResourceId).toBe(COAST_ID);
    const conversation = dialogues.set.conversations.find(({ id }) => id === giver.dialogueId)!;
    expect(validateConversation(conversation)).toEqual([]);
    const nodes = new Set(knowledge.data.nodes.map(({ id }) => id));
    const assembled = assembleQuests({
      questSet: quest.set,
      questGiverNpcIds: new Set([NPC_ID]),
      npcIds: new Set([NPC_ID]),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds: nodes,
    });
    expect(assembled.warnings).toEqual([]);
    expect(conversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID))).toBe(true);

    const journal = createQuestJournal(assembled.quests);
    expect(acceptQuest(assembled.quests, journal, QUEST_ID).ok).toBe(true);
    const completion = applyQuestSignal(assembled.quests, journal, { type: 'knowledge-discovery', nodeId: BEACON_ID });
    expect(completion.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(completion.completed[0]?.discoverKnowledgeNodeIds).toContain(COVE_ID);

    const graph = readJson('../data/base/knowledge_graph/edges.json') as { edges: { id: string; fromId: string; toId: string }[] };
    const round82Edges = graph.edges.filter(({ id }) => id.startsWith('kg.edge.r82-'));
    expect(round82Edges.length).toBeGreaterThanOrEqual(8);
    for (const edge of round82Edges) {
      expect(nodes.has(edge.fromId), edge.id + ' from endpoint').toBe(true);
      expect(nodes.has(edge.toId), edge.id + ' to endpoint').toBe(true);
    }
  });
});
