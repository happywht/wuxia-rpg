/**
 * Round 85: southern atlas expansion (384×256 → 448×320), walkable Tide Isle,
 * the cross-isle low-tide channel quest and the data-authored tide condition.
 *
 * Raw matrix checks preserve every old atlas cell; the expanded world-map is
 * also parsed and assembled by the live engine with climate tide references.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { parseNpcSet } from '../src/engine/npc-placement';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseClimate } from '../src/engine/climate-system';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';

const ISLE_ID = 'map.round-85-tide-isle';
const WINDWARD_ID = 'map.round-84-windward-isle';
const SURVEYOR_ID = 'char.r85-xie-zhaoting';
const KEEPER_ID = 'char.r85-cen-yinjiao';
const QUEST_ID = 'quest.r85-low-tide-channel';
const ISLE_NODE = 'place.r85-tide-isle';
const REEF_NODE = 'place.r85-reef-channel';
const POOL_NODE = 'place.r85-tide-pool';
const REEF_EVENT = 'event.r85-reef-channel';
const LOW_TIDE_ID = 'tide.low';
const ATLAS_COLUMNS = 768;
const ATLAS_ROWS = 576;
const OLD_COLUMNS = 384;
const OLD_ROWS = 256;

function readJson(path: string): any {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as any;
}

function parseMap(raw: unknown): GridMap {
  const parsed = parseGridMap(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

/** Region atlas percentages as of Round 84 (384×256 canvas), pinned as the
 * pre-expansion baseline so the rebased 448×320 values must project onto the
 * same absolute cell centers. */
const round84RegionAnchors: Record<string, { x: number; y: number }> = {
  'map.round-01-grid': { x: 10.80939923, y: 22.909804 },
  'map.round-10-mist-ferry': { x: 34.59007847, y: 30.38039206 },
  'map.round-62-iron-ridge': { x: 34.59007847, y: 12.94901956 },
  'map.round-67-salt-road': { x: 10.80939923, y: 30.38039206 },
  'map.round-74-cloud-ridge': { x: 46.48041751, y: 25.39999983 },
  'map.round-79-isles': { x: 29.11227154, y: 49.90980392 },
  'map.round-82-east-coast': { x: 74.34725849, y: 38.47843137 },
  [WINDWARD_ID]: { x: 92.68929504, y: 49.01960784 },
};

/** SHA-256 of every pre-Round-85 layer cropped to the original 384×256
 * rectangle; the expansion must keep these cells byte-for-byte identical. */
const oldLayerHashes: Record<string, string> = {
  'world-ocean': 'd2c857c7b34b0ad71b236484ab5e4f902102e46a63720fe344a8b3400baedd99',
  'world-land': '4f6fe537ff5543e309f56bfd3fdef156380759c57b70742d0f0a8cd5520c4c72',
  'world-coast': '46098848f319c5020ec58f7ebef88eb587f332344097a8c690e7f01e0e8e87d7',
  'world-forest': 'b6af73546560f7f7f1e81070ea1fedd0bfdf4b602d045207517a4aab8f8cdac8',
  'world-relief': '8749d7179422ad1c05b8b6630b4e7115194744cea30f0692dab144f480f71275',
  'world-roads': '17829f8e15fa72e318eec823b1bf0aa7aafc677b3d849d7831fd8843ac376a42',
  'world-settlements': 'ab2f4bc6a447fead97e30ff4993a896a8ba8d64fc98d301e707e9f1b80a71c77',
  'world-r79-shoal-water': 'a8714678d862c51cff1204c5a4f1f8238216e952dabd67821932a4db79d5e40f',
  'world-r79-shoal-sand': 'f58ab01f4fbfaa0d1adabeaa1c8aeae56bf6116f1de22fd21be227904c8c977b',
  'world-r79-shoal-land': 'd3b0616a040c79aab7066ac3e1087608f67565a387dcc00c6633be76361f9370',
  'world-r79-shoal-pines': '75c48cd6f613d7b92b2e1134e96759930156c0645861df0a06c28b7400dcf820',
  'world-r79-gate-routes': '59c5f06b452b96790fad4b66827c2c4f4da2221e341d67bdcd1e1ec9ff6c1fa0',
  'world-r81-expanse-water': '359df86abe7044de26678f03f184f6c6f95fff4a10522f46f33272742286488f',
  'world-r81-expanse-sand': '28f5d6b7e6c53fd2a5d3efc326259f5a513ffbd4d713e5135b4b17f20453829c',
  'world-r81-expanse-land': 'cda967be1e245c953d26947161bb4d16e3d6149dea08d554d35aa44454044c77',
  'world-r81-expanse-pines': 'd19c51f436673eddeb1306464ff0ba7409948310566b777d96c69cd11c8fc6c2',
  'world-r84-expanse-water': 'e6e7e873a44d9c27c644de7355ccd56f1f8d33948e1cbe8a6fd09604ce20d5ca',
  'world-r84-expanse-sand': 'b94edbe15596bb51feab3b00c639b438e5af46a015311e1962c1106ceb1c9a35',
  'world-r84-expanse-land': '72e5e03fd4c71adee48c887824b23472b8cb55f91b6343c4d449b168895371aa',
  'world-r84-expanse-pines': 'f688b955928599b13160d4026cb2aeb81f651863f7296cfe234282bab1b4968e',
};

const manifest = readJson('../data/base/manifest.json') as {
  resources: { id: string; path: string; schema: string }[];
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parseMap(readJson(`../data/base/${resource.path}`)));
}

describe('Round 85 Tide Isle and the expanded 768×576 atlas', () => {
  it('keeps the atlas expansion lossless with every old cell identical', () => {
    const world = readJson('../data/base/world/world-map.json');
    const art = world.atlasArt;
    expect(art).toMatchObject({
      columns: ATLAS_COLUMNS, rows: ATLAS_ROWS, tileSize: 8,
      regionFootprint: { columns: 35.84, rows: 23.04 },
    });
    expect(art.layers.map(({ id }: { id: string }) => id)).toEqual(expect.arrayContaining([
      'world-r85-expanse-water', 'world-r85-expanse-sand',
      'world-r85-expanse-land', 'world-r85-expanse-pines',
    ]));
    // Round 86 wire format: every atlas layer ships as compact row-RLE strings.
    expect(art.layers.every((layer: any) =>
      layer.cells === undefined && Array.isArray(layer.cellsRle) &&
      layer.cellsRle.length === ATLAS_ROWS)).toBe(true);

    // All per-cell guarantees below read the dense matrix decoded by the live
    // parser, so they keep proving pixel-level equality with pre-Round-85 data.
    const parsedWorld = parseWorldMap(world);
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const decodedArt = parsedWorld.data.atlasArt!;
    const layers = new Map<string, any>(decodedArt.layers.map((layer: any) => [layer.id, layer]));
    for (const [id, expected] of Object.entries(oldLayerHashes)) {
      const layer = layers.get(id);
      expect(layer, id).toBeDefined();
      const oldArea = layer.cells.slice(0, OLD_ROWS).map((row: number[]) => row.slice(0, OLD_COLUMNS));
      const hash = createHash('sha256').update(JSON.stringify(oldArea)).digest('hex');
      expect(hash, id).toBe(expected);
    }
    for (const layer of decodedArt.layers) {
      expect(layer.cells).toHaveLength(ATLAS_ROWS);
      expect(layer.cells.every((row: number[]) => row.length === ATLAS_COLUMNS)).toBe(true);
    }

    // Old layers stay out of the new L-shaped area; only the programmatic
    // ocean base fills it so the southern sea never shows holes.
    const ocean = layers.get('world-ocean')!;
    for (let row = OLD_ROWS; row < ATLAS_ROWS; row += 1) {
      for (let col = 0; col < ATLAS_COLUMNS; col += 1) expect(ocean.cells[row][col]).toBe(1);
    }
    for (let row = 0; row < ATLAS_ROWS; row += 1) {
      for (let col = OLD_COLUMNS; col < ATLAS_COLUMNS; col += 1) expect(ocean.cells[row][col]).toBe(1);
    }
    for (const id of Object.keys(oldLayerHashes)) {
      if (id === 'world-ocean') continue;
      const layer = layers.get(id)!;
      for (let row = OLD_ROWS; row < ATLAS_ROWS; row += 1) {
        for (let col = 0; col < ATLAS_COLUMNS; col += 1) expect(layer.cells[row][col], `${id}@${col},${row}`).toBe(0);
      }
      for (let row = 0; row < ATLAS_ROWS; row += 1) {
        for (let col = OLD_COLUMNS; col < ATLAS_COLUMNS; col += 1) expect(layer.cells[row][col], `${id}@${col},${row}`).toBe(0);
      }
    }

    // Tide Isle paints the new southern landmass with registered CC0 frames only.
    const puny = art.tilesets.find(({ id }: { id: string }) => id === 'opengameart.puny-world');
    expect(puny?.tileCount).toBeGreaterThan(0);
    for (const id of ['world-r85-expanse-water', 'world-r85-expanse-sand', 'world-r85-expanse-land', 'world-r85-expanse-pines']) {
      const layer = layers.get(id)!;
      expect(layer.tilesetId).toBe('opengameart.puny-world');
      expect(layer.cells.flat().every((gid: number) => gid <= puny.tileCount)).toBe(true);
      expect(layer.cells.flat().filter((gid: number) => gid > 0).length, id).toBeGreaterThan(0);
    }
    const land = layers.get('world-r85-expanse-land')!;
    expect(land.cells.flat().filter((gid: number) => gid > 0).length).toBeGreaterThan(1_800);

    const notice = readFileSync(new URL('../data/assets/opengameart/puny-world/NOTICE.txt', import.meta.url), 'utf8');
    expect(notice).toContain('https://opengameart.org/content/16x16-puny-world-tileset');
    expect(notice).toContain('CC0');
  }, 120_000);

  it('keeps all eight old region centers in the same atlas pixels after rebasing', () => {
    const world = readJson('../data/base/world/world-map.json');
    expect(world.regions).toHaveLength(22);
    expect(world.transitions).toHaveLength(52);
    for (const [mapResourceId, anchor] of Object.entries(round84RegionAnchors)) {
      const region = world.regions.find((entry: any) => entry.mapResourceId === mapResourceId);
      expect(region, mapResourceId).toBeDefined();
      const oldCol = (anchor.x / 100) * (OLD_COLUMNS - 1) + 0.5;
      const oldRow = (anchor.y / 100) * (OLD_ROWS - 1) + 0.5;
      const newCol = (region.atlasPosition.x / 100) * (ATLAS_COLUMNS - 1) + 0.5;
      const newRow = (region.atlasPosition.y / 100) * (ATLAS_ROWS - 1) + 0.5;
      expect(Math.abs(newCol - oldCol), `${mapResourceId} col`).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(newRow - oldRow), `${mapResourceId} row`).toBeLessThanOrEqual(1e-6);
    }

    const region = world.regions.find((entry: any) => entry.mapResourceId === ISLE_ID);
    expect(region.name).toBe('南溟·潮生屿');
    const col = Math.round(region.atlasPosition.x / 100 * (ATLAS_COLUMNS - 1));
    const row = Math.round(region.atlasPosition.y / 100 * (ATLAS_ROWS - 1));
    expect({ col, row }).toEqual({ col: 405, row: 280 });
    const parsedWorld = parseWorldMap(world);
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const land = parsedWorld.data.atlasArt!.layers.find(({ id }) => id === 'world-r85-expanse-land');
    expect(land!.cells[row]![col]).toBeGreaterThan(0);
  });

  it('parses the expanded atlas and resolves the tide-gated event against climate data', () => {
    const world = readJson('../data/base/world/world-map.json');
    const parsedWorld = parseWorldMap(world);
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;

    const calendar = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    const climate = parseClimate(
      readJson('../data/base/worldview/climate.json'),
      calendar.ok ? calendar.calendar : undefined,
    );
    const knowledge = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(calendar.ok && climate.ok && knowledge.ok).toBe(true);
    if (!calendar.ok || !climate.ok || !knowledge.ok) return;

    const references = {
      knowledgeNodeIds: new Set(knowledge.data.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.climate.weathers.map(({ id }) => id)),
      tideIds: new Set(climate.climate.tideCycle?.phases.map(({ id }) => id) ?? []),
    };
    const assembled = assembleWorldMap(parsedWorld.data, maps, references);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);
    expect(assembled.events.find(({ id }) => id === REEF_EVENT)?.conditions?.tideIds).toEqual([LOW_TIDE_ID]);

    const invalidWorld = structuredClone(world);
    const invalidEvent = invalidWorld.events.find(({ id }: { id: string }) => id === REEF_EVENT)!;
    invalidEvent.conditions.tideIds = ['tide.not-declared'];
    const invalidParsed = parseWorldMap(invalidWorld);
    expect(invalidParsed.ok).toBe(true);
    if (!invalidParsed.ok) return;
    const invalidAssembly = assembleWorldMap(invalidParsed.data, maps, references);
    expect('ok' in invalidAssembly).toBe(false);
    if ('ok' in invalidAssembly) return;
    expect(invalidAssembly.events.some(({ id }) => id === REEF_EVENT)).toBe(false);
    expect(invalidAssembly.warnings.some((warning) => warning.includes('引用无效潮位：tide.not-declared'))).toBe(true);
  });

  it('adds a 100×100 Tide Isle using the registered CC0 atlases and walkable anchors', () => {
    const map = maps.get(ISLE_ID)!;
    expect(map.data).toMatchObject({ columns: 100, rows: 100, tileSize: 48 });
    expect(map.playerStart).toEqual({ col: 2, row: 50 });
    const art = map.data.art!;
    expect(art.tilesets.map(({ id }) => id)).toEqual([
      'opengameart.puny-world', 'opengameart.rpg-town', 'opengameart.puny-characters',
    ]);
    expect(art.layers.map(({ id }) => id)).toEqual([
      'r85-sea', 'r85-island-ground', 'r85-reef-keeper-camp', 'r85-pine-groves',
    ]);
    const walkable = map.data.grid.flatMap((line) => [...line]).filter((cell) => cell !== '#' && cell !== '~').length;
    expect(walkable).toBeGreaterThan(4_000);

    const anchors = [
      { col: 1, row: 50 }, { col: 37, row: 55 }, { col: 26, row: 56 },
      { col: 36, row: 54 }, { col: 46, row: 66 },
    ];
    for (const point of anchors) expect(findGridPath(map, map.playerStart, point), `${point.col},${point.row}`).not.toBeNull();

    for (const layer of art.layers) {
      expect(layer.cells).toHaveLength(100);
      expect(layer.cells.every((line) => line.length === 100)).toBe(true);
      const tileset = art.tilesets.find(({ id }) => id === layer.tilesetId)!;
      expect(layer.cells.flat().every((gid) => gid <= tileset.tileCount)).toBe(true);
    }
    // The keeper camp keeps its RPG Town props off anchors, roads and pines.
    const camp = art.layers.find(({ id }) => id === 'r85-reef-keeper-camp')!;
    expect(camp.cells.flat().filter((gid) => gid > 0).length).toBe(5);

    const townLicense = readFileSync(new URL('../data/assets/opengameart/rpg-town-pixel-art-assets/License.txt', import.meta.url), 'utf8');
    expect(townLicense).toContain('CC0');
  });

  it('links Windward Isle and Tide Isle with collision-valid two-way gates', () => {
    const windward = maps.get(WINDWARD_ID)!;
    const isle = maps.get(ISLE_ID)!;
    const world = readJson('../data/base/world/world-map.json');
    const outbound = world.transitions.find(({ id }: { id: string }) => id === 'gate.r85-windward-isle-to-tide-isle');
    const returnGate = world.transitions.find(({ id }: { id: string }) => id === 'gate.r85-tide-isle-to-windward-isle');
    expect(outbound).toEqual({
      id: 'gate.r85-windward-isle-to-tide-isle', name: '南渡潮生',
      from: { mapResourceId: WINDWARD_ID, col: 97, row: 50 },
      to: { mapResourceId: ISLE_ID, col: 2, row: 50 },
    });
    expect(returnGate).toEqual({
      id: 'gate.r85-tide-isle-to-windward-isle', name: '北望归潮',
      from: { mapResourceId: ISLE_ID, col: 1, row: 50 },
      to: { mapResourceId: WINDWARD_ID, col: 96, row: 50 },
    });

    // Both endpoints stay walkable and reachable from their own player starts,
    // and the round trip Windward → Tide Isle → Windward closes on itself.
    expect(windward.canEnter(97, 50)).toBe(true);
    expect(windward.canEnter(96, 50)).toBe(true);
    expect(findGridPath(windward, windward.playerStart, outbound.from)).not.toBeNull();
    expect(findGridPath(windward, windward.playerStart, returnGate.to)).not.toBeNull();
    expect(isle.canEnter(2, 50)).toBe(true);
    expect(isle.canEnter(1, 50)).toBe(true);
    expect(outbound.to).toEqual({ mapResourceId: ISLE_ID, ...isle.playerStart });
    expect(findGridPath(isle, isle.playerStart, returnGate.from)).not.toBeNull();

    // Every Tide Isle landmark and step event is reachable from the entrance.
    for (const anchor of [
      ...world.landmarks.filter(({ mapResourceId }: any) => mapResourceId === ISLE_ID),
      ...world.events.filter((event: any) => event.mapResourceId === ISLE_ID && event.interaction === undefined),
    ]) {
      expect(findGridPath(isle, isle.playerStart, anchor), anchor.id).not.toBeNull();
    }
  });

  it('declares the low-tide reef survey as a tide-gated E-key inspection', () => {
    const world = readJson('../data/base/world/world-map.json');
    const isle = maps.get(ISLE_ID)!;
    const events = world.events.filter(({ id }: { id: string }) => id.startsWith('event.r85-'));
    expect(events.map(({ id }: { id: string }) => id)).toEqual([
      'event.r85-arrival', 'event.r85-reef-channel', 'event.r85-camp-hearth', 'event.r85-tide-pool',
    ]);

    const reef = events.find(({ id }: { id: string }) => id === REEF_EVENT);
    // The `tideIds` condition is the Round 85 tide contract surface: authored
    // in data now, resolved by the climate runtime once the protocol lands.
    expect(reef.conditions).toEqual({ tideIds: [LOW_TIDE_ID] });
    expect(reef.once).toBe(true);
    expect(reef.interaction).toEqual({ prompt: '趁低潮勘测礁道水则', range: 1 });
    expect(reef.discoverKnowledgeNodeId).toBe(REEF_NODE);

    // The inspection target keeps at least one reachable orthogonal approach cell.
    const approaches = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ col: reef.col + dx, row: reef.row + dy }))
      .filter((point) => isle.canEnter(point.col, point.row));
    expect(approaches.length).toBeGreaterThan(0);
    expect(approaches.some((point) => findGridPath(isle, isle.playerStart, point) !== null)).toBe(true);

    for (const event of events) {
      if (event.id === REEF_EVENT) continue;
      expect(event.conditions, event.id).toBeUndefined();
      expect(event.once).toBe(true);
      expect(isle.canEnter(event.col, event.row), event.id).toBe(true);
    }
    expect(events.find(({ id }: { id: string }) => id === 'event.r85-arrival').discoverKnowledgeNodeId).toBe(ISLE_NODE);
  });

  it('runs the cross-isle quest from Windward dialogue through both discoveries', () => {
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-85-tide-isle-npcs.json'));
    const dialogueSet = parseDialogueSet(readJson('../data/base/dialogues/round-85-tide-isle-conversations.json'));
    const questSet = parseQuestSet(readJson('../data/base/quests/round-85-tide-isle-quests.json'));
    const knowledgeSet = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(npcSet.ok && dialogueSet.ok && questSet.ok && knowledgeSet.ok).toBe(true);
    if (!npcSet.ok || !dialogueSet.ok || !questSet.ok || !knowledgeSet.ok) return;

    const surveyor = npcSet.set.npcs.find(({ id }) => id === SURVEYOR_ID)!;
    const keeper = npcSet.set.npcs.find(({ id }) => id === KEEPER_ID)!;
    expect(surveyor.mapResourceId).toBe(WINDWARD_ID);
    expect(surveyor.questGiver).toBe(true);
    expect(keeper.mapResourceId).toBe(ISLE_ID);
    expect(keeper.questGiver).toBe(false);
    const windward = maps.get(WINDWARD_ID)!;
    const isle = maps.get(ISLE_ID)!;
    expect(windward.canEnter(surveyor.position.col, surveyor.position.row)).toBe(true);
    expect(findGridPath(windward, windward.playerStart, surveyor.position)).not.toBeNull();
    expect(isle.canEnter(keeper.position.col, keeper.position.row)).toBe(true);
    expect(findGridPath(isle, isle.playerStart, keeper.position)).not.toBeNull();
    const actorTileset = isle.data.art!.tilesets.find(({ id }) => id === 'opengameart.puny-characters')!;
    for (const npc of [surveyor, keeper]) {
      expect(Math.max(npc.spriteFrame ?? 0, ...Object.values(npc.spriteFrames ?? {}))).toBeLessThanOrEqual(actorTileset.tileCount);
    }

    for (const conversation of dialogueSet.set.conversations) {
      expect(validateConversation(conversation), conversation.id).toEqual([]);
    }
    const giverConversation = dialogueSet.set.conversations.find(({ id }) => id === surveyor.dialogueId)!;
    expect(giverConversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID))).toBe(true);
    expect(giverConversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ conditions }) =>
      conditions?.some((condition) => condition.kind === 'questStatus' && condition.questId === QUEST_ID && condition.status === 'active'))).toBe(true);
    expect(dialogueSet.set.conversations.some(({ id }) => id === keeper.dialogueId)).toBe(true);

    const knowledgeNodeIds = new Set(knowledgeSet.data.nodes.map(({ id }) => id));
    const quests = assembleQuests({
      questSet: questSet.set,
      questGiverNpcIds: new Set([SURVEYOR_ID]),
      npcIds: new Set([SURVEYOR_ID, KEEPER_ID]),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds,
    });
    expect(quests.warnings).toEqual([]);

    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    const landing = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: ISLE_NODE });
    expect(landing.completed).toEqual([]);
    const survey = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: REEF_NODE });
    expect(survey.completed).toEqual([]);
    const returnToSurveyor = applyQuestSignal(quests.quests, journal, { type: 'npc-talk', npcId: SURVEYOR_ID });
    expect(returnToSurveyor.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(returnToSurveyor.completed[0]?.discoverKnowledgeNodeIds).toContain(POOL_NODE);
  });

  it('registers the round resources and closes the knowledge graph references', () => {
    const entries = manifest.resources.filter(({ id }) => id.includes('round-85'));
    expect(entries).toEqual([
      { id: 'map.round-85-tide-isle', path: 'maps/round-85-tide-isle.json', schema: 'grid-map' },
      { id: 'npc.round-85-tide-isle-set', path: 'characters/round-85-tide-isle-npcs.json', schema: 'npc-set' },
      { id: 'dialogue.round-85-tide-isle-set', path: 'dialogues/round-85-tide-isle-conversations.json', schema: 'dialogue-set' },
      { id: 'quest.round-85-tide-isle-set', path: 'quests/round-85-tide-isle-quests.json', schema: 'quest-set' },
    ]);
    expect(manifest.resources.some(({ id }) => id === 'world.atlas')).toBe(true);

    const knowledgeNodeIds = new Set(
      (readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] }).nodes.map(({ id }) => id),
    );
    const graph = readJson('../data/base/knowledge_graph/edges.json') as {
      edges: { id: string; fromId: string; toId: string }[];
    };
    const newEdges = graph.edges.filter(({ id }) => id.startsWith('kg.edge.r85-'));
    expect(newEdges).toHaveLength(10);
    for (const edge of newEdges) {
      expect(knowledgeNodeIds.has(edge.fromId), `${edge.id} from`).toBe(true);
      expect(knowledgeNodeIds.has(edge.toId), `${edge.id} to`).toBe(true);
    }
    for (const nodeId of [
      ISLE_ID, ISLE_NODE, REEF_NODE, 'place.r85-camp', POOL_NODE,
      SURVEYOR_ID, KEEPER_ID, QUEST_ID, REEF_EVENT,
      'event.r85-arrival', 'event.r85-camp-hearth', 'event.r85-tide-pool',
    ]) {
      expect(knowledgeNodeIds.has(nodeId), nodeId).toBe(true);
    }
  });
});
