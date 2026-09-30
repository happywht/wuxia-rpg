import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell } from '../src/engine/grid-path';
import {
  acceptQuest, applyQuestSignal, assembleQuests, createQuestJournal, parseQuestSet,
} from '../src/engine/quest-system';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { projectAtlasPosition } from '../src/engine/world-atlas-view';
import { findWorldTravelRoute } from '../src/engine/world-travel';
import { parseNpcSet } from '../src/engine/npc-placement';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOREST_ID = 'opengameart.forest-tileset-for-16x16';
const EAST_ID = 'map.round-94-east-gate';
const SOUTH_ID = 'map.round-94-returning-sails';
const PINE_ID = 'map.round-95-misty-pine-gate';
const VALLEY_ID = 'map.round-95-cedar-valley';
const HARBOR_ID = 'map.round-95-east-harbor';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8')) as any;
}
function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function loadedMaps(): Map<string, GridMap> {
  const manifest = readJson('data/base/manifest.json');
  const maps = new Map<string, GridMap>();
  for (const resource of manifest.resources.filter(({ schema }: { schema: string }) => schema === 'grid-map')) {
    const parsed = parseGridMap(readJson(`data/base/${resource.path}`));
    expect(parsed.ok, resource.id).toBe(true);
    if (parsed.ok) maps.set(resource.id, parsed.map);
  }
  return maps;
}

describe('Round 95 eastern woodland and movable world route', () => {
  const rawWorld = readJson('data/base/world/world-map.json');
  const parsedWorld = parseWorldMap(rawWorld);
  const manifest = readJson('data/base/manifest.json');
  const maps = loadedMaps();

  it('adds a forest-coast corridor while preserving every Round 94 layer and region anchor', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok || parsedWorld.data.atlasArt === undefined) return;
    const art = parsedWorld.data.atlasArt;
    const baseline = readJson('iterations/round-95/round94-atlas-baseline.json');
    expect([art.columns, art.rows, art.tileSize]).toEqual([768, 576, 8]);
    expect(art.layers).toHaveLength(57);
    expect(parsedWorld.data.regions).toHaveLength(18);
    expect(Object.keys(baseline.layers)).toHaveLength(53);
    const layers = new Map(art.layers.map((layer) => [layer.id, layer]));
    for (const [id, expected] of Object.entries(baseline.layers as Record<string, string>)) {
      expect(layers.has(id), id).toBe(true);
      expect(sha256(layers.get(id)!.cells), id).toBe(expected);
    }
    for (const [id, center] of Object.entries(baseline.regions as Record<string, { col: number; row: number }>)) {
      const region = parsedWorld.data.regions.find((entry) => entry.mapResourceId === id);
      expect(region, id).toBeDefined();
      const point = projectAtlasPosition(region!.atlasPosition, art);
      expect(point.x / art.tileSize, `${id} col`).toBeCloseTo(center.col, 4);
      expect(point.y / art.tileSize, `${id} row`).toBeCloseTo(center.row, 4);
    }
    for (const id of ['world-r95-eastland', 'world-r95-east-coast', 'world-r95-east-trails', 'world-r95-east-forest']) {
      expect(layers.get(id)?.cells.flat().some((gid) => gid > 0), id).toBe(true);
    }
    expect(art.tilesets.find(({ id }) => id === FOREST_ID)).toMatchObject({
      image: 'assets/opengameart/forest-tileset-for-16x16/forest-level-4-sheet.png',
      tileSize: 16, columns: 7, rows: 4, tileCount: 28,
    });
  });

  it('connects four two-way routes through three walkable woodland maps to Returning Sails', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const assembled = assembleWorldMap(parsedWorld.data, maps);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(18);
    expect(assembled.transitions).toHaveLength(36);

    for (const id of [PINE_ID, VALLEY_ID, HARBOR_ID]) {
      const map = maps.get(id);
      expect(map, id).toBeDefined();
      expect([map!.columns, map!.rows]).toEqual([100, 100]);
      expect(map!.data.art?.layers).toHaveLength(3);
      expect(map!.data.art?.tilesets.some(({ id: tilesetId }) => tilesetId === FOREST_ID)).toBe(true);
      for (const layer of map!.data.art!.layers.filter(({ tilesetId }) => tilesetId === FOREST_ID)) {
        expect(layer.cells.flat().some((gid) => gid >= 1 && gid <= 28), layer.id).toBe(true);
      }
    }

    const transitions = new Map(assembled.transitions.map((entry) => [entry.id, entry]));
    const pairs: Array<[string, string]> = [
      ['gate.r95-east-to-pine', 'gate.r95-pine-to-east'],
      ['gate.r95-pine-to-valley', 'gate.r95-valley-to-pine'],
      ['gate.r95-valley-to-harbor', 'gate.r95-harbor-to-valley'],
      ['gate.r95-harbor-to-south', 'gate.r95-south-to-harbor'],
    ];
    for (const [outboundId, returnId] of pairs) {
      const outbound = transitions.get(outboundId)!;
      const returning = transitions.get(returnId)!;
      const from = maps.get(outbound.from.mapResourceId)!;
      const destination = maps.get(outbound.to.mapResourceId)!;
      const returnSource = maps.get(returning.from.mapResourceId)!;
      const returnDestination = maps.get(returning.to.mapResourceId)!;
      expect(from, outboundId).toBeDefined();
      expect(destination, outboundId).toBeDefined();
      expect(findGridPath(from, from.playerStart, outbound.from), outboundId).not.toBeNull();
      expect(findGridPath(destination, destination.playerStart, returning.from), returnId).not.toBeNull();
      expect(findGridPath(returnSource, outbound.to, returning.from), returnId).not.toBeNull();
      expect(findGridPath(returnDestination, returning.to, outbound.from), outboundId).not.toBeNull();
    }
    expect(findWorldTravelRoute(assembled, EAST_ID, SOUTH_ID)?.regionMapResourceIds)
      .toEqual([EAST_ID, PINE_ID, VALLEY_ID, HARBOR_ID, SOUTH_ID]);
    expect(transitions.get('gate.r95-valley-to-harbor')?.name).toBe('沿海路赴照叶港');
    expect(transitions.get('gate.r95-harbor-to-valley')?.name).toBe('循溪路返听杉谷');
    expect(transitions.get('gate.r95-harbor-to-south')?.name).toBe('西渡归帆洲');
    expect(transitions.get('gate.r95-south-to-harbor')?.name).toBe('东返照叶港');

    const bridge = parsedWorld.data.landmarks.find(({ id }) => id === 'landmark.r95-cedar-bridge');
    expect(bridge).toMatchObject({ mapResourceId: VALLEY_ID, col: 41, row: 55 });
    expect(readJson('data/base/maps/round-95-cedar-valley.json').grid[55][41]).toBe('=');
    expect(findGridPath(maps.get(VALLEY_ID)!, maps.get(VALLEY_ID)!.playerStart, { col: 41, row: 55 })).not.toBeNull();
  });

  it('validates the NPC schedules and quest chain from acceptance through unlock and reward', () => {
    const npcParse = parseNpcSet(readJson('data/base/characters/round-95-east-woodland-npcs.json'));
    const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-95-east-woodland-conversations.json'));
    const questParse = parseQuestSet(readJson('data/base/quests/round-95-east-woodland-quests.json'));
    expect(npcParse.ok && dialogueParse.ok && questParse.ok).toBe(true);
    if (!npcParse.ok || !dialogueParse.ok || !questParse.ok) return;

    for (const npc of npcParse.set.npcs) {
      const map = maps.get(npc.mapResourceId)!;
      expect(npc.schedule).toHaveLength(7);
      expect(findGridPathToAdjacentCell(map, map.playerStart, npc.position)).not.toBeNull();
      for (const entry of npc.schedule) expect(findGridPath(map, map.playerStart, entry.position), entry.periodId).not.toBeNull();
    }
    for (const conversation of dialogueParse.set.conversations) expect(validateConversation(conversation)).toEqual([]);
    expect(dialogueParse.set.conversations.map(({ id }) => id)).toEqual(['dlg.r95-lin-yue', 'dlg.r95-pei-hang']);

    const nodes = new Set((readJson('data/base/knowledge_graph/nodes.json').nodes as Array<{ id: string }>).map(({ id }) => id));
    const npcs = npcParse.set.npcs;
    const questAssembly = assembleQuests({
      questSet: questParse.set,
      questGiverNpcIds: new Set(npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id)),
      npcIds: new Set(npcs.map(({ id }) => id)),
      itemIds: new Set(), encounterIds: new Set(), knowledgeNodeIds: nodes,
    });
    expect(questAssembly.warnings).toEqual([]);
    const journal = createQuestJournal(questAssembly.quests);
    expect(journal.states.get('quest.r95-east-tide-course')?.status).toBe('locked');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r95-windbell-route').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r95-windbell-stone' });
    const firstReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r95-lin-yue' });
    expect(firstReport.completed.map(({ questId }) => questId)).toEqual(['quest.r95-windbell-route']);
    expect(journal.states.get('quest.r95-east-tide-course')?.status).toBe('offered');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r95-east-tide-course').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r95-old-tide-gauge' });
    const secondReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r95-pei-hang' });
    expect(secondReport.completed.map(({ questId }) => questId)).toEqual(['quest.r95-east-tide-course']);

    const edges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{ id: string; fromId: string; toId: string }>;
    const round95Edges = edges.filter(({ id }) => id.startsWith('kg.edge.r95-'));
    expect(round95Edges.length).toBeGreaterThanOrEqual(18);
    expect(round95Edges.every(({ fromId, toId }) => nodes.has(fromId) && nodes.has(toId))).toBe(true);
  });

  it('ships the original transparent CC0 forest sheet and its source notice', () => {
    const imagePath = path.join(root, 'data/assets/opengameart/forest-tileset-for-16x16/forest-level-4-sheet.png');
    const image = readFileSync(imagePath);
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(image.readUInt32BE(16)).toBe(112);
    expect(image.readUInt32BE(20)).toBe(64);
    expect(image[25]).toBe(6);
    const notice = readFileSync(path.join(path.dirname(imagePath), 'NOTICE.txt'), 'utf8');
    expect(notice).toContain('CC0 1.0 Universal');
    expect(notice).toContain('https://opengameart.org/content/forest-tileset-for-16-x-16');
    expect(readFileSync(path.join(root, 'docs/REFERENCES.md'), 'utf8')).toContain('Forest Tileset for 16 x 16');
    expect(readFileSync(path.join(root, 'scripts/package-release.mjs'), 'utf8'))
      .toContain('forest-tileset-for-16x16/forest-level-4-sheet.png');
    expect(manifest.resources.some(({ id }: { id: string }) => id === 'map.round-95-east-harbor')).toBe(true);
  });
});
