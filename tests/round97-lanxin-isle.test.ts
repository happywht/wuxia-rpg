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
const WINDWARD_ID = 'map.round-84-windward-isle';
const TIDE_ID = 'map.round-85-tide-isle';
const EAST_ID = 'map.round-94-east-gate';
const LANXIN_ID = 'map.round-97-lanxin-isle';
const PILOT_ID = 'map.round-97-pilot-reef';
/** Declared intentional overlay: the islands may rest on open ocean only, the lanes also cross the R84/R85 ring water. */
const LAND_BACKGROUND = new Set(['world-ocean']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r84-expanse-water', 'world-r85-expanse-water']);
/** Lane endpoints that must hug a named shoreline within 6 atlas cells (mirrors the generator's audit). */
const SHORELINE_TESTS: Array<{ label: string; point: [number, number]; layerIds: string[] }> = [
  { label: '风回岛', point: [383, 132], layerIds: ['world-r84-expanse-sand', 'world-r84-expanse-land'] },
  { label: '澜心洲西岸', point: [433, 180], layerIds: ['world-r97-lanxin-land'] },
  { label: '潮生屿', point: [432, 280], layerIds: ['world-r85-expanse-sand', 'world-r85-expanse-land'] },
  { label: '澜心洲南岸', point: [451, 220], layerIds: ['world-r97-lanxin-land'] },
  { label: '澜心洲东北岸', point: [498, 154], layerIds: ['world-r97-lanxin-land'] },
  { label: '引航礁西岸', point: [510, 131], layerIds: ['world-r97-lanxin-land'] },
  { label: '引航礁南岸', point: [520, 133], layerIds: ['world-r97-lanxin-land'] },
  { label: '天门关海岸', point: [682, 134], layerIds: ['world-r94-east-snow', 'world-r95-eastland'] },
];

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

describe('Round 97 east-mid-sea lanes and the Lanxin Isle / Pilot Reef relay', () => {
  const rawWorld = readJson('data/base/world/world-map.json');
  const parsedWorld = parseWorldMap(rawWorld);
  const manifest = readJson('data/base/manifest.json');
  const maps = loadedMaps();

  it('fills the east-mid ocean while preserving every Round 96 layer and region anchor', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok || parsedWorld.data.atlasArt === undefined) return;
    const art = parsedWorld.data.atlasArt;
    const baseline = readJson('iterations/round-97/round96-atlas-baseline.json');
    expect([art.columns, art.rows, art.tileSize]).toEqual([768, 576, 8]);
    expect(art.layers).toHaveLength(65);
    expect(parsedWorld.data.regions).toHaveLength(22);
    expect(Object.keys(baseline.layers)).toHaveLength(61);
    expect(Object.keys(baseline.regions)).toHaveLength(20);
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
    for (const id of ['world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land', 'world-r97-lanxin-lane']) {
      expect(layers.get(id)?.tilesetId, id).toBe(PUNY_WORLD_ID);
      expect(denseLayer(layers.get(id)!, art.rows, art.columns).flat().some((gid) => gid > 0), id).toBe(true);
    }
    const lanxinRegion = parsedWorld.data.regions.find(({ mapResourceId }) => mapResourceId === LANXIN_ID)!;
    const pilotRegion = parsedWorld.data.regions.find(({ mapResourceId }) => mapResourceId === PILOT_ID)!;
    const lanxinPoint = projectAtlasPosition(lanxinRegion.atlasPosition, art);
    const pilotPoint = projectAtlasPosition(pilotRegion.atlasPosition, art);
    expect(lanxinPoint.x / art.tileSize).toBeCloseTo(480.5, 4);
    expect(lanxinPoint.y / art.tileSize).toBeCloseTo(190.5, 4);
    expect(pilotPoint.x / art.tileSize).toBeCloseTo(520.5, 4);
    expect(pilotPoint.y / art.tileSize).toBeCloseTo(110.5, 4);
  });

  it('keeps the sea lanes over declared water, off the new islands and hugging each shoreline', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok || parsedWorld.data.atlasArt === undefined) return;
    const art = parsedWorld.data.atlasArt;
    const newIds = new Set(['world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land', 'world-r97-lanxin-lane']);
    const prior = art.layers.filter(({ id }) => !newIds.has(id))
      .map((layer) => ({ id: layer.id, cells: denseLayer(layer, art.rows, art.columns) }));
    const lane = denseLayer(art.layers.find(({ id }) => id === 'world-r97-lanxin-lane')!, art.rows, art.columns);
    expect(overlayViolations(lane, prior, LANE_BACKGROUND)).toEqual([]);
    for (const id of ['world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land']) {
      const cells = denseLayer(art.layers.find(({ id: entry }) => entry === id)!, art.rows, art.columns);
      expect(overlayViolations(cells, prior, LAND_BACKGROUND), id).toEqual([]);
    }
    // The overlay is real and declared: the lane rides the Windward/Tide ring water on its way out.
    let ring84Water = 0; let ring85Water = 0;
    const ring84 = prior.find(({ id }) => id === 'world-r84-expanse-water')!.cells;
    const ring85 = prior.find(({ id }) => id === 'world-r85-expanse-water')!.cells;
    for (const [row, rowCells] of lane.entries()) {
      for (const [col, gid] of rowCells.entries()) {
        if (gid === 0) continue;
        if (ring84[row]?.[col] !== 0) ring84Water += 1;
        if (ring85[row]?.[col] !== 0) ring85Water += 1;
      }
    }
    expect(ring84Water).toBeGreaterThan(0);
    expect(ring85Water).toBeGreaterThan(0);
    // A lane cell may never sit on this round's island land: no sailing through the isles.
    const landCells = denseLayer(art.layers.find(({ id }) => id === 'world-r97-lanxin-land')!, art.rows, art.columns);
    let laneOverNewLand = 0;
    for (const [row, rowCells] of lane.entries()) {
      for (const [col, gid] of rowCells.entries()) {
        if (gid !== 0 && landCells[row]?.[col] !== 0) laneOverNewLand += 1;
      }
    }
    expect(laneOverNewLand).toBe(0);
    // Every drawn lane endpoint stays within 6 cells of its named shore, not floating inside or offshore.
    const allLayers = [...prior, ...[...newIds].map((id) => ({
      id, cells: denseLayer(art.layers.find((layer) => layer.id === id)!, art.rows, art.columns),
    }))];
    for (const { label, point, layerIds } of SHORELINE_TESTS) {
      const shoreLayers = allLayers.filter((layer) => layerIds.includes(layer.id));
      expect(shoreLayers.length, label).toBeGreaterThan(0);
      let nearest = Infinity;
      for (const layer of shoreLayers) {
        for (let row = Math.max(0, point[1] - 6); row <= Math.min(art.rows - 1, point[1] + 6); row += 1) {
          for (let col = Math.max(0, point[0] - 6); col <= Math.min(art.columns - 1, point[0] + 6); col += 1) {
            if (layer.cells[row]?.[col] === 0) continue;
            nearest = Math.min(nearest, Math.hypot(col - point[0], row - point[1]));
          }
        }
      }
      expect(nearest, label).toBeLessThanOrEqual(6);
    }
  });

  it('connects four two-way sea routes with walkable endpoints and a 3-segment world route', () => {
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const assembled = assembleWorldMap(parsedWorld.data, maps);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.regions).toHaveLength(22);
    expect(assembled.transitions).toHaveLength(50);

    for (const id of [LANXIN_ID, PILOT_ID]) {
      const map = maps.get(id);
      expect(map, id).toBeDefined();
      expect([map!.columns, map!.rows]).toEqual([100, 100]);
      expect(map!.data.art?.tilesets.map(({ id: tilesetId }) => tilesetId)).toEqual([PUNY_WORLD_ID, PUNY_CHARACTERS_ID]);
      expect(map!.data.art?.layers).toHaveLength(3);
      expect(map!.data.art?.layers.every(({ tilesetId }) => tilesetId === PUNY_WORLD_ID)).toBe(true);
    }
    expect(maps.get(LANXIN_ID)!.playerStart).toMatchObject({ col: 3, row: 40 });
    expect(maps.get(PILOT_ID)!.playerStart).toMatchObject({ col: 50, row: 96 });

    const transitions = new Map(assembled.transitions.map((entry) => [entry.id, entry]));
    const pairs: Array<[string, string]> = [
      ['gate.r97-windward-to-lanxin', 'gate.r97-lanxin-to-windward'],
      ['gate.r97-tide-to-lanxin', 'gate.r97-lanxin-to-tide'],
      ['gate.r97-lanxin-to-pilot', 'gate.r97-pilot-to-lanxin'],
      ['gate.r97-pilot-to-east', 'gate.r97-east-to-pilot'],
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
    expect(transitions.get('gate.r97-windward-to-lanxin')?.from).toMatchObject({ mapResourceId: WINDWARD_ID, col: 93, row: 55 });
    expect(transitions.get('gate.r97-tide-to-lanxin')?.to).toMatchObject({ mapResourceId: LANXIN_ID, col: 48, row: 96 });
    expect(transitions.get('gate.r97-pilot-to-east')?.to).toMatchObject({ mapResourceId: EAST_ID, col: 50, row: 94 });
    // The old-map port tiles the sea routes land on stay reachable from those maps' player starts.
    for (const [mapId, col, row] of [
      [WINDWARD_ID, 92, 55], [WINDWARD_ID, 93, 55],
      [TIDE_ID, 85, 54], [TIDE_ID, 86, 54],
      [EAST_ID, 50, 93], [EAST_ID, 50, 94],
    ] as const) {
      const map = maps.get(mapId)!;
      expect(findGridPath(map, map.playerStart, { col, row }), `${mapId}@${col},${row}`).not.toBeNull();
    }

    expect(findWorldTravelRoute(assembled, EAST_ID, TIDE_ID)?.regionMapResourceIds)
      .toEqual([EAST_ID, PILOT_ID, LANXIN_ID, TIDE_ID]);
    expect(findWorldTravelRoute(assembled, TIDE_ID, EAST_ID)?.regionMapResourceIds)
      .toEqual([TIDE_ID, LANXIN_ID, PILOT_ID, EAST_ID]);
    for (const [fromId, toId] of [
      [EAST_ID, PILOT_ID], [PILOT_ID, LANXIN_ID], [LANXIN_ID, TIDE_ID], [WINDWARD_ID, LANXIN_ID],
    ] as const) {
      expect(findWorldTravelRoute(assembled, fromId, toId)?.regionMapResourceIds, `${fromId}→${toId}`)
        .toEqual([fromId, toId]);
    }

    const landmarks = parsedWorld.data.landmarks.filter(({ id }) => id.startsWith('landmark.r97-'));
    expect(landmarks).toHaveLength(6);
    for (const landmark of landmarks) {
      const rawMap = readJson(`data/base/maps/${landmark.mapResourceId.slice('map.'.length)}.json`);
      expect(rawMap.grid[landmark.row][landmark.col], landmark.id).not.toBe('#');
      expect(findGridPath(maps.get(landmark.mapResourceId)!, maps.get(landmark.mapResourceId)!.playerStart, { col: landmark.col, row: landmark.row }), landmark.id).not.toBeNull();
    }
    expect(landmarks.find(({ id }) => id === 'landmark.r97-tide-mark-stone')).toMatchObject({ mapResourceId: LANXIN_ID, col: 58, row: 22 });
    expect(landmarks.find(({ id }) => id === 'landmark.r97-beacon-tower')).toMatchObject({ mapResourceId: PILOT_ID, col: 72, row: 68 });
    for (const event of parsedWorld.data.events.filter(({ id }) => id.startsWith('event.r97-'))) {
      const map = maps.get(event.mapResourceId)!;
      expect(findGridPath(map, map.playerStart, { col: event.col, row: event.row }), event.id).not.toBeNull();
    }

    // All twenty-two region callouts stay readable next to the new east-mid-sea labels.
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

  it('validates the NPC schedules and the two-stage quest chain from tide ledger to beacon relight', () => {
    const npcParse = parseNpcSet(readJson('data/base/characters/round-97-lanxin-reef-npcs.json'));
    const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-97-lanxin-reef-conversations.json'));
    const questParse = parseQuestSet(readJson('data/base/quests/round-97-lanxin-reef-quests.json'));
    expect(npcParse.ok && dialogueParse.ok && questParse.ok).toBe(true);
    if (!npcParse.ok || !dialogueParse.ok || !questParse.ok) return;

    const npcs = npcParse.set.npcs;
    expect(npcs.map(({ id }) => id)).toEqual(['char.r97-ji-wuchao', 'char.r97-yu-xingcha']);
    for (const npc of npcs) {
      const map = maps.get(npc.mapResourceId)!;
      expect(npc.schedule).toHaveLength(7);
      expect(npc.schedule.map(({ periodId }) => periodId)).toEqual([
        'period.midnight', 'period.dawn', 'period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night',
      ]);
      expect(findGridPathToAdjacentCell(map, map.playerStart, npc.position)).not.toBeNull();
      for (const entry of npc.schedule) expect(findGridPath(map, map.playerStart, entry.position), entry.periodId).not.toBeNull();
    }
    for (const conversation of dialogueParse.set.conversations) expect(validateConversation(conversation)).toEqual([]);
    expect(dialogueParse.set.conversations.map(({ id }) => id)).toEqual(['dlg.r97-ji-wuchao', 'dlg.r97-yu-xingcha']);
    // Each greeting gates its quest stages through questStatus conditions and grants acceptance via an acceptQuest effect.
    for (const [dialogueId, questId] of [
      ['dlg.r97-ji-wuchao', 'quest.r97-tide-ledger'],
      ['dlg.r97-yu-xingcha', 'quest.r97-beacon-relight'],
    ] as const) {
      const conversation = dialogueParse.set.conversations.find(({ id }) => id === dialogueId)!;
      const greet = conversation.nodes.find(({ id }) => id === 'greet')!;
      const conditioned = greet.options!.filter((option) => option.conditions?.length === 1 && option.conditions[0]?.kind === 'questStatus');
      expect(conditioned.map((option) => option.conditions![0]), dialogueId).toEqual([
        { kind: 'questStatus', questId, status: 'offered' },
        { kind: 'questStatus', questId, status: 'completed' },
        { kind: 'questStatus', questId, status: 'active' },
      ]);
      expect(greet.options!.flatMap((option) => option.effects ?? []).filter(effect => effect.kind === 'acceptQuest'), dialogueId).toEqual([{ kind: 'acceptQuest', questId }]);
    }

    const nodes = new Set((readJson('data/base/knowledge_graph/nodes.json').nodes as Array<{ id: string }>).map(({ id }) => id));
    const questAssembly = assembleQuests({
      questSet: questParse.set,
      questGiverNpcIds: new Set(npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id)),
      npcIds: new Set(npcs.map(({ id }) => id)),
      itemIds: new Set(), encounterIds: new Set(), knowledgeNodeIds: nodes,
    });
    expect(questAssembly.warnings).toEqual([]);
    const journal = createQuestJournal(questAssembly.quests);
    expect(journal.states.get('quest.r97-tide-ledger')?.status).toBe('offered');
    expect(journal.states.get('quest.r97-beacon-relight')?.status).toBe('locked');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r97-tide-ledger').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r97-tide-mark-stone' });
    const firstReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r97-ji-wuchao' });
    expect(firstReport.completed.map(({ questId }) => questId)).toEqual(['quest.r97-tide-ledger']);
    expect(firstReport.completed[0]?.discoverKnowledgeNodeIds).toEqual(['place.r97-pilot-reef']);
    expect(journal.states.get('quest.r97-beacon-relight')?.status).toBe('offered');
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r97-beacon-relight').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r97-lantern-terrace' });
    const secondReport = applyQuestSignal(questAssembly.quests, journal, { type: 'npc-talk', npcId: 'char.r97-yu-xingcha' });
    expect(secondReport.completed.map(({ questId }) => questId)).toEqual(['quest.r97-beacon-relight']);
    expect(secondReport.completed[0]?.discoverKnowledgeNodeIds).toEqual(['place.r97-beacon-tower']);
    expect(journal.states.get('quest.r97-beacon-relight')?.status).toBe('completed');

    const edges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{ id: string; fromId: string; toId: string }>;
    const round97Edges = edges.filter(({ id }) => id.startsWith('kg.edge.r97-'));
    expect(round97Edges.length).toBeGreaterThanOrEqual(21);
    expect(round97Edges.every(({ fromId, toId }) => nodes.has(fromId) && nodes.has(toId))).toBe(true);
    const referenced = new Set(round97Edges.flatMap(({ fromId, toId }) => [fromId, toId]));
    for (const node of readJson('data/base/knowledge_graph/nodes.json').nodes as Array<{ id: string }>) {
      if (node.id.startsWith('event.r97-') || node.id.startsWith('place.r97-') || node.id.startsWith('char.r97-')
        || node.id.startsWith('quest.r97-') || node.id.startsWith('map.round-97-')) {
        expect(referenced.has(node.id), node.id).toBe(true);
      }
    }
  });

  it('reuses only the registered local CC0 Puny World and Puny Characters sheets', () => {
    const worldImage = readFileSync(path.join(root, 'data/assets/opengameart/puny-world/tileset.png'));
    expect(worldImage.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const actorsImage = readFileSync(path.join(root, 'data/assets/opengameart/puny-characters/actors.png'));
    expect(actorsImage.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(readFileSync(path.join(root, 'data/assets/opengameart/puny-world/NOTICE.txt'), 'utf8')).toContain('CC0');
    expect(readFileSync(path.join(root, 'data/assets/opengameart/puny-characters/NOTICE.txt'), 'utf8')).toContain('CC0');
    expect(readFileSync(path.join(root, 'scripts/package-release.mjs'), 'utf8')).toContain('puny-world/tileset.png');
    for (const id of [LANXIN_ID, PILOT_ID, 'npc.round-97-lanxin-reef-set', 'dialogue.round-97-lanxin-reef-set', 'quest.round-97-lanxin-reef-set']) {
      expect(manifest.resources.some((resource: { id: string }) => resource.id === id), id).toBe(true);
    }
    for (const id of [LANXIN_ID, PILOT_ID]) {
      const rawMap = readJson(`data/base/maps/${id.slice('map.'.length)}.json`);
      const images = rawMap.art.tilesets.map(({ image }: { image: string }) => image);
      expect(images.every((image: string) => image.startsWith('assets/opengameart/puny-'))).toBe(true);
      expect(rawMap.art.actors.tilesetId).toBe(PUNY_CHARACTERS_ID);
    }
  });
});
