import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeAtlasCells } from '../scripts/lib/atlas-rle.mjs';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell } from '../src/engine/grid-path';
import {
  acceptQuest, applyQuestSignal, assembleQuests, createQuestJournal, parseQuestSet,
} from '../src/engine/quest-system';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import { layoutWorldAtlasRegionLabels, projectAtlasPosition } from '../src/engine/world-atlas-view';
import { findWorldTravelRoute } from '../src/engine/world-travel';
import { parseNpcSet } from '../src/engine/npc-placement';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUNY_WORLD_ID = 'opengameart.puny-world';
const PUNY_CHARACTERS_ID = 'opengameart.puny-characters';
const SOUTHWEST_ID = 'map.round-87-southwest-isles';
const SOUTH_ID = 'map.round-94-returning-sails';
const STONE_ID = 'map.round-96-stone-reef';
const ATOLL_ID = 'map.round-96-halfmoon-atoll';
/** Declared intentional overlay: islands may rest on open ocean/shallows, the lane also crosses the R87 ring water. */
const LAND_BACKGROUND = new Set(['world-ocean', 'world-r94-south-shallows']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r87-expanse-water', 'world-r94-south-shallows']);

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
function denseLayer(layer: { cells?: number[][]; cellsRle?: string[] }, rows: number, columns: number): number[][] {
  return layer.cells ?? decodeAtlasCells(layer.cellsRle!, rows, columns);
}
function overlayViolations(cells: number[][], prior: Array<{ id: string; cells: number[][] }>, allowed: Set<string>): string[] {
  const violations: string[] = [];
  for (const [row, rowCells] of cells.entries()) {
    for (const [col, gid] of rowCells.entries()) {
      if (gid === 0) continue;
      for (const layer of prior) {
        if (allowed.has(layer.id)) continue;
        if (layer.cells[row]?.[col] !== 0) violations.push(`${layer.id}@${col},${row}`);
      }
    }
  }
  return violations;
}

describe('Round 96 south-sea reef islands and the 3-segment sea route', () => {
  const rawWorld = readJson('data/base/world/world-map.json');
  const parsedWorld = parseWorldMap(rawWorld);
  const manifest = readJson('data/base/manifest.json');
  const maps = loadedMaps();

  it('fills the south-central ocean while preserving every Round 95 layer and region anchor', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok || parsedWorld.data.atlasArt === undefined) return;
    const art = parsedWorld.data.atlasArt;
    const baseline = readJson('iterations/round-96/round95-atlas-baseline.json');
    expect([art.columns, art.rows, art.tileSize]).toEqual([768, 576, 8]);
    expect(art.layers).toHaveLength(65);
    expect(parsedWorld.data.regions).toHaveLength(22);
    expect(Object.keys(baseline.layers)).toHaveLength(57);
    expect(Object.keys(baseline.regions)).toHaveLength(18);
    const layers = new Map(art.layers.map((layer) => [layer.id, layer]));
    for (const [id, expected] of Object.entries(baseline.layers as Record<string, string>)) {
      expect(layers.has(id), id).toBe(true);
      expect(sha256(denseLayer(layers.get(id)!, art.rows, art.columns)), id).toBe(expected);
    }
    for (const [id, center] of Object.entries(baseline.regions as Record<string, { col: number; row: number }>)) {
      const region = parsedWorld.data.regions.find((entry) => entry.mapResourceId === id);
      expect(region, id).toBeDefined();
      const point = projectAtlasPosition(region!.atlasPosition, art);
      expect(point.x / art.tileSize, `${id} col`).toBeCloseTo(center.col, 4);
      expect(point.y / art.tileSize, `${id} row`).toBeCloseTo(center.row, 4);
    }
    for (const id of ['world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land', 'world-r96-reef-lane']) {
      expect(layers.get(id)?.tilesetId, id).toBe(PUNY_WORLD_ID);
      expect(denseLayer(layers.get(id)!, art.rows, art.columns).flat().some((gid) => gid > 0), id).toBe(true);
    }
    const stoneRegion = parsedWorld.data.regions.find(({ mapResourceId }) => mapResourceId === STONE_ID)!;
    const atollRegion = parsedWorld.data.regions.find(({ mapResourceId }) => mapResourceId === ATOLL_ID)!;
    const stonePoint = projectAtlasPosition(stoneRegion.atlasPosition, art);
    const atollPoint = projectAtlasPosition(atollRegion.atlasPosition, art);
    expect(stonePoint.x / art.tileSize).toBeCloseTo(190.5, 4);
    expect(stonePoint.y / art.tileSize).toBeCloseTo(430.5, 4);
    expect(atollPoint.x / art.tileSize).toBeCloseTo(295.5, 4);
    expect(atollPoint.y / art.tileSize).toBeCloseTo(505.5, 4);
  });

  it('keeps the intentional sea-lane overlay narrow and strictly over declared water', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok || parsedWorld.data.atlasArt === undefined) return;
    const art = parsedWorld.data.atlasArt;
    const newIds = new Set(['world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land', 'world-r96-reef-lane']);
    const prior = art.layers.filter(({ id }) => !newIds.has(id))
      .map((layer) => ({ id: layer.id, cells: denseLayer(layer, art.rows, art.columns) }));
    const lane = denseLayer(art.layers.find(({ id }) => id === 'world-r96-reef-lane')!, art.rows, art.columns);
    expect(overlayViolations(lane, prior, LANE_BACKGROUND)).toEqual([]);
    for (const id of ['world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land']) {
      const cells = denseLayer(art.layers.find(({ id: entry }) => entry === id)!, art.rows, art.columns);
      expect(overlayViolations(cells, prior, LAND_BACKGROUND), id).toEqual([]);
    }
    // The overlay is real and declared: the lane rides the R87 ring water and the southern shallows.
    let ringWater = 0; let shallows = 0;
    const ring = prior.find(({ id }) => id === 'world-r87-expanse-water')!.cells;
    const shallowCells = prior.find(({ id }) => id === 'world-r94-south-shallows')!.cells;
    for (const [row, rowCells] of lane.entries()) {
      for (const [col, gid] of rowCells.entries()) {
        if (gid === 0) continue;
        if (ring[row]?.[col] !== 0) ringWater += 1;
        if (shallowCells[row]?.[col] !== 0) shallows += 1;
      }
    }
    expect(ringWater).toBeGreaterThan(0);
    expect(shallows).toBeGreaterThan(0);
    // Old decorative layers themselves stay untouched (covered per-hash above); new layers never share cells with each other's forbidden sets either.
    const landCells = denseLayer(art.layers.find(({ id }) => id === 'world-r96-reef-land')!, art.rows, art.columns);
    let laneOverNewLand = 0;
    for (const [row, rowCells] of lane.entries()) {
      for (const [col, gid] of rowCells.entries()) {
        if (gid !== 0 && landCells[row]?.[col] !== 0) laneOverNewLand += 1;
      }
    }
    expect(laneOverNewLand).toBe(0);
  });

  it('connects three two-way sea routes with walkable endpoints and a 3-segment world route', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const assembled = assembleWorldMap(parsedWorld.data, maps);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(22);
    expect(assembled.transitions).toHaveLength(54);

    for (const id of [STONE_ID, ATOLL_ID]) {
      const map = maps.get(id);
      expect(map, id).toBeDefined();
      expect([map!.columns, map!.rows]).toEqual([100, 100]);
      expect(map!.data.art?.tilesets.map(({ id: tilesetId }) => tilesetId)).toEqual([PUNY_WORLD_ID, PUNY_CHARACTERS_ID]);
      expect(map!.data.art?.layers).toHaveLength(3);
      expect(map!.data.art?.layers.every(({ tilesetId }) => tilesetId === PUNY_WORLD_ID)).toBe(true);
    }

    const transitions = new Map(assembled.transitions.map((entry) => [entry.id, entry]));
    const pairs: Array<[string, string]> = [
      ['gate.r96-southwest-to-stone', 'gate.r96-stone-to-southwest'],
      ['gate.r96-stone-to-atoll', 'gate.r96-atoll-to-stone'],
      ['gate.r96-atoll-to-south', 'gate.r96-south-to-atoll'],
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
    expect(transitions.get('gate.r96-southwest-to-stone')?.from).toMatchObject({ mapResourceId: SOUTHWEST_ID, col: 93, row: 50 });
    expect(transitions.get('gate.r96-south-to-atoll')?.to).toMatchObject({ mapResourceId: ATOLL_ID, col: 95, row: 50 });

    expect(findWorldTravelRoute(assembled, SOUTHWEST_ID, SOUTH_ID)?.regionMapResourceIds)
      .toEqual([SOUTHWEST_ID, STONE_ID, ATOLL_ID, SOUTH_ID]);
    expect(findWorldTravelRoute(assembled, SOUTH_ID, SOUTHWEST_ID)?.regionMapResourceIds)
      .toEqual([SOUTH_ID, ATOLL_ID, STONE_ID, SOUTHWEST_ID]);

    const lantern = parsedWorld.data.landmarks.find(({ id }) => id === 'landmark.r96-lantern-stone');
    expect(lantern).toMatchObject({ mapResourceId: STONE_ID, col: 72, row: 33 });
    expect(readJson('data/base/maps/round-96-stone-reef.json').grid[33][72]).not.toBe('#');
    expect(findGridPath(maps.get(STONE_ID)!, maps.get(STONE_ID)!.playerStart, { col: 72, row: 33 })).not.toBeNull();
    const shrine = parsedWorld.data.landmarks.find(({ id }) => id === 'landmark.r96-tide-shrine');
    expect(shrine).toMatchObject({ mapResourceId: ATOLL_ID, col: 66, row: 62 });
    expect(readJson('data/base/maps/round-96-halfmoon-atoll.json').grid[62][66]).toBe('=');
    expect(findGridPath(maps.get(ATOLL_ID)!, maps.get(ATOLL_ID)!.playerStart, { col: 66, row: 62 })).not.toBeNull();

    for (const event of parsedWorld.data.events.filter(({ id }) => id.startsWith('event.r96-'))) {
      const map = maps.get(event.mapResourceId)!;
      expect(findGridPath(map, map.playerStart, { col: event.col, row: event.row }), event.id).not.toBeNull();
    }

    // All twenty region callouts stay readable next to the new south-sea labels.
    const labels = parsedWorld.data.regions.map((region) => {
      const point = projectAtlasPosition(region.atlasPosition, parsedWorld.data.atlasArt!);
      const scale = Math.min(616 / (768 * 8), 340 / (576 * 8));
      const imageWidth = 768 * 8 * scale; const imageHeight = 576 * 8 * scale;
      return {
        mapResourceId: region.mapResourceId,
        x: (616 - imageWidth) / 2 + point.x * scale,
        y: (340 - imageHeight) / 2 + point.y * scale,
        width: [...region.name].length * 11 + 8,
        height: 15,
      };
    });
    const placements = layoutWorldAtlasRegionLabels(labels, { width: 616, height: 340 }, 'map.round-85-tide-isle');
    expect(labels).toHaveLength(22);
    expect(placements.size).toBe(22);
  });

  it('validates the NPC schedules and the cross-region quest chain from lock to reward', () => {
    const npcParse = parseNpcSet(readJson('data/base/characters/round-96-south-reef-npcs.json'));
    const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-96-south-reef-conversations.json'));
    const questParse = parseQuestSet(readJson('data/base/quests/round-96-south-reef-quests.json'));
    expect(npcParse.ok && dialogueParse.ok && questParse.ok).toBe(true);
    if (!npcParse.ok || !dialogueParse.ok || !questParse.ok) return;

    for (const npc of npcParse.set.npcs) {
      const map = maps.get(npc.mapResourceId)!;
      expect(npc.schedule).toHaveLength(7);
      expect(npc.schedule.map(({ periodId }) => periodId)).toEqual([
        'period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night',
      ]);
      expect(findGridPathToAdjacentCell(map, map.playerStart, npc.position)).not.toBeNull();
      for (const entry of npc.schedule) expect(findGridPath(map, map.playerStart, entry.position), entry.periodId).not.toBeNull();
    }
    for (const conversation of dialogueParse.set.conversations) expect(validateConversation(conversation)).toEqual([]);
    expect(dialogueParse.set.conversations.map(({ id }) => id)).toEqual(['dlg.r96-cen-xi', 'dlg.r96-luo-yan']);

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
    expect(journal.states.get('quest.r96-atoll-reply')?.status).toBe('locked');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r96-reef-lantern').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r96-lantern-stone' });
    const firstReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r96-cen-xi' });
    expect(firstReport.completed.map(({ questId }) => questId)).toEqual(['quest.r96-reef-lantern']);
    expect(firstReport.completed[0]?.discoverKnowledgeNodeIds).toEqual(['place.r96-halfmoon-atoll']);
    expect(journal.states.get('quest.r96-atoll-reply')?.status).toBe('offered');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r96-atoll-reply').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r96-verse-terrace' });
    const secondReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r96-luo-yan' });
    expect(secondReport.completed.map(({ questId }) => questId)).toEqual(['quest.r96-atoll-reply']);
    expect(secondReport.completed[0]?.discoverKnowledgeNodeIds).toEqual(['place.r96-tide-shrine']);

    const edges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{ id: string; fromId: string; toId: string }>;
    const round96Edges = edges.filter(({ id }) => id.startsWith('kg.edge.r96-'));
    expect(round96Edges.length).toBeGreaterThanOrEqual(18);
    expect(round96Edges.every(({ fromId, toId }) => nodes.has(fromId) && nodes.has(toId))).toBe(true);
  });

  it('reuses only the registered local CC0 Puny World and Puny Characters sheets', () => {
    const worldImage = readFileSync(path.join(root, 'data/assets/opengameart/puny-world/tileset.png'));
    expect(worldImage.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const actorsImage = readFileSync(path.join(root, 'data/assets/opengameart/puny-characters/actors.png'));
    expect(actorsImage.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(readFileSync(path.join(root, 'data/assets/opengameart/puny-world/NOTICE.txt'), 'utf8')).toContain('CC0');
    expect(readFileSync(path.join(root, 'data/assets/opengameart/puny-characters/NOTICE.txt'), 'utf8')).toContain('CC0');
    expect(readFileSync(path.join(root, 'scripts/package-release.mjs'), 'utf8')).toContain('puny-world/tileset.png');
    for (const id of [STONE_ID, ATOLL_ID, 'npc.round-96-south-reef-set', 'dialogue.round-96-south-reef-set', 'quest.round-96-south-reef-set']) {
      expect(manifest.resources.some((resource: { id: string }) => resource.id === id), id).toBe(true);
    }
    for (const id of [STONE_ID, ATOLL_ID]) {
      const rawMap = readJson(`data/base/maps/${id.slice('map.'.length)}.json`);
      const images = rawMap.art.tilesets.map(({ image }: { image: string }) => image);
      expect(images.every((image: string) => image.startsWith('assets/opengameart/puny-'))).toBe(true);
      expect(rawMap.art.actors.tilesetId).toBe(PUNY_CHARACTERS_ID);
    }
  });
});
