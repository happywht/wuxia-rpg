import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { parseClimate } from '../src/engine/climate-system';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath, findGridPathToAdjacentCell } from '../src/engine/grid-path';
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
import { projectAtlasPosition } from '../src/engine/world-atlas-view';
import { findWorldTravelRoute } from '../src/engine/world-travel';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_ID = 'map.round-92-north-pass';
const TERRACE_ID = 'map.round-91-cloud-north-terrace';
const NPC_ID = 'char.r92-gu-zhaoxue';
const QUEST_ID = 'quest.r92-snow-beacon';
const ARRIVAL_NODE_ID = 'place.r92-north-pass';
const BEACON_NODE_ID = 'place.r92-snow-beacon';
const CAIRN_NODE_ID = 'place.r92-north-cairn';
const EXTENSION_LAYER_IDS = [
  'world-r92-pass-snow', 'world-r92-pass-trees', 'world-r92-pass-walls',
  'world-r92-pass-detail', 'world-r92-pass-route',
];
// Reviewed 0-based sheet frames: frame 0 snow ground; 51/67 pond-center ice;
// 16/32/48/64/80/96 snow pines; 1/2/17/18 snow stones; 105-109 grey walls.
// Engine gids are 1-based; gray/white blank cells and sign/roof frames are out.
const REVIEWED_WINTER_FRAMES = new Set([
  ...[0, 51, 67, 16, 32, 48, 64, 80, 96, 1, 2, 17, 18, 105, 106, 107, 108, 109]
    .map((frame) => frame + 1),
]);
// Known sign/plank/lamp/roof-part frames (0-based): brown oval signposts,
// bridge planks, ochre lamp/wood blocks, snowy roof trims and the black
// fillers. None of these may ever appear in a Round 92 terrain layer.
const FORBIDDEN_SIGN_FRAMES = new Set([
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  39, 40, 41, 42, 43, 44, 45, 46, 47, 57, 58, 59, 60, 61, 62, 63,
  98, 99, 100, 101, 102, 103, 104, 112, 113, 114,
  116, 117, 118, 119, 120, 123, 124, 126, 127, 128, 129,
  130, 131, 132, 133, 134, 135, 136, 240,
].map((frame) => frame + 1));
for (const gid of REVIEWED_WINTER_FRAMES) {
  if (FORBIDDEN_SIGN_FRAMES.has(gid)) throw new Error('reviewed/forbidden frame overlap: ' + gid);
}

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as any;
}

function parseMap(raw: unknown): GridMap {
  const result = parseGridMap(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.map;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

const manifest = readJson('data/base/manifest.json') as {
  resources: Array<{ id: string; path: string; schema: string }>;
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parseMap(readJson(`data/base/${resource.path}`)));
}
const worldRaw = readJson('data/base/world/world-map.json');
const worldParse = parseWorldMap(worldRaw);
if (!worldParse.ok) throw new Error(worldParse.errors.join('\n'));
const knowledgeParse = parseKnowledgeNodeSet(readJson('data/base/knowledge_graph/nodes.json'));
if (!knowledgeParse.ok) throw new Error(knowledgeParse.errors.join('\n'));
const calendarParse = parseGameCalendar(readJson('data/base/worldview/calendar.json'));
if (!calendarParse.ok) throw new Error(calendarParse.errors.join('\n'));
const climateParse = parseClimate(
  readJson('data/base/worldview/climate.json'), calendarParse.calendar,
);
if (!climateParse.ok) throw new Error(climateParse.errors.join('\n'));
const knowledgeNodeIds = new Set(knowledgeParse.data.nodes.map(({ id }) => id));
const assembledWorld = assembleWorldMap(worldParse.data, maps, {
  knowledgeNodeIds,
  periodIds: new Set(calendarParse.calendar.periods.map(({ id }) => id)),
  weatherIds: new Set(climateParse.climate.weathers.map(({ id }) => id)),
  tideIds: new Set((climateParse.climate.tideCycle?.phases ?? []).map(({ id }) => id)),
});
if ('ok' in assembledWorld) throw new Error(assembledWorld.errors.join('\n'));

describe('Round 92 North Pass (Snowlit Pass)', () => {
  it('extends the atlas to 38 layers while preserving all 33 old layers and region centers', () => {
    const baseline = readJson('iterations/round-92/round91-atlas-baseline.json') as {
      columns: number;
      rows: number;
      tileSize: number;
      layers: Record<string, string>;
      regions: Record<string, { percent: { x: number; y: number } }>;
    };
    const parsed = parseWorldMap(worldRaw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const art = parsed.data.atlasArt!;
    expect([art.columns, art.rows, art.tileSize]).toEqual([768, 576, 8]);
    expect(art.layers).toHaveLength(65);
    const layers = new Map(art.layers.map((layer) => [layer.id, layer]));
    for (const [id, expectedHash] of Object.entries(baseline.layers)) {
      const layer = layers.get(id);
      expect(layer, id).toBeDefined();
      const prefix = layer!.cells.slice(0, baseline.rows).map((row) => row.slice(0, baseline.columns));
      expect(sha256(JSON.stringify(prefix)), id).toBe(expectedHash);
    }
    // The five new layers are appended after the preserved 33 baseline layers.
    expect(art.layers.slice(0, 33).map(({ id }) => id))
      .toEqual(Object.keys(baseline.layers));

    for (const [mapResourceId, oldAnchor] of Object.entries(baseline.regions)) {
      const current = parsed.data.regions.find((region) => region.mapResourceId === mapResourceId);
      expect(current, mapResourceId).toBeDefined();
      const before = projectAtlasPosition(oldAnchor.percent, { ...art, columns: baseline.columns, rows: baseline.rows });
      const after = projectAtlasPosition(current!.atlasPosition, art);
      expect(after.x / art.tileSize, `${mapResourceId} x`).toBeCloseTo(before.x / art.tileSize, 4);
      expect(after.y / art.tileSize, `${mapResourceId} y`).toBeCloseTo(before.y / art.tileSize, 4);
    }
    expect(parsed.data.regions).toHaveLength(22);

    const pass = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === MAP_ID)!;
    const point = projectAtlasPosition(pass.atlasPosition, art);
    expect(point.x).toBeCloseTo((576.5) * 8, 5);
    expect(point.y).toBeCloseTo((24.5) * 8, 5);
  });

  it('paints the new winter layers only inside the northern blank band', () => {
    const parsed = worldParse;
    const art = parsed.data.atlasArt!;
    const winterId = 'opengameart.winter-tileset-zaph';
    const tileset = art.tilesets.find((entry) => entry.id === winterId)!;
    expect([tileset.columns, tileset.rows, tileset.tileCount]).toEqual([16, 16, 256]);
    expect(tileset.image).toBe('assets/opengameart/winter-tileset-zaph/tileset.png');

    // Data-driven protection: no Round 92 pixel may share a cell with any of
    // the five Round 91 terrace layers, and painting stays in the northern
    // blank band (col >= 512, row < 384) beyond the old 512x384 rectangle.
    const terracePainted = new Set<string>();
    for (const terraceLayerId of ['world-r91-terrace-land', 'world-r91-terrace-cliffs',
      'world-r91-terrace-walls', 'world-r91-terrace-detail', 'world-r91-terrace-route']) {
      const layer = art.layers.find((candidate) => candidate.id === terraceLayerId)!;
      for (let row = 0; row < art.rows; row += 1) {
        for (let col = 0; col < art.columns; col += 1) {
          if (layer.cells[row]![col] !== 0) terracePainted.add(`${col},${row}`);
        }
      }
    }
    expect(terracePainted.size).toBeGreaterThan(1_000);
    let painted = 0;
    for (const id of EXTENSION_LAYER_IDS) {
      const layer = art.layers.find((candidate) => candidate.id === id);
      expect(layer, id).toBeDefined();
      expect(layer!.tilesetId).toBe(winterId);
      let layerCells = 0;
      for (let row = 0; row < art.rows; row += 1) {
        for (let col = 0; col < art.columns; col += 1) {
          if (layer!.cells[row]![col] === 0) continue;
          painted += 1;
          layerCells += 1;
          expect(col, `${id} at (${col}, ${row})`).toBeGreaterThanOrEqual(512);
          expect(row, `${id} at (${col}, ${row})`).toBeLessThan(384);
          expect(terracePainted.has(`${col},${row}`), `${id} overlaps terrace at (${col}, ${row})`).toBe(false);
        }
      }
      expect(layerCells, id).toBeGreaterThan(0);
    }
    expect(painted).toBeGreaterThan(1_500);

    // Frame regression lock: every painted gid is a reviewed winter frame,
    // and the sign/plank/lamp/roof frames can never enter the atlas route.
    for (const id of EXTENSION_LAYER_IDS) {
      const layer = art.layers.find((candidate) => candidate.id === id)!;
      for (const row of layer.cells) {
        for (const gid of row) {
          if (gid === 0) continue;
          expect(REVIEWED_WINTER_FRAMES.has(gid), `${id} unreviewed gid ${gid}`).toBe(true);
          expect(FORBIDDEN_SIGN_FRAMES.has(gid), `${id} sign gid ${gid}`).toBe(false);
        }
      }
    }
    const routeLayer = art.layers.find((candidate) => candidate.id === 'world-r92-pass-route')!;
    const routeGids = new Set<number>();
    for (const row of routeLayer.cells) for (const gid of row) if (gid !== 0) routeGids.add(gid);
    expect([...routeGids].sort((a, b) => a - b)).toEqual([1]);
  });

  it('keeps every playable snow-pass layer on reviewed frames and off sign frames', () => {
    const map = maps.get(MAP_ID)!;
    const winterId = 'opengameart.winter-tileset-zaph';
    const winterLayers = map.data.art!.layers.filter(({ tilesetId }) => tilesetId === winterId);
    expect(winterLayers.map(({ id }) => id)).toEqual([
      'r92-pass-ground', 'r92-pass-trail', 'r92-pass-flourish', 'r92-pass-pines',
      'r92-pass-cliffs', 'r92-pass-walls', 'r92-pass-accents',
    ]);
    for (const layer of winterLayers) {
      for (const row of layer.cells) {
        for (const gid of row) {
          if (gid === 0) continue;
          expect(REVIEWED_WINTER_FRAMES.has(gid), `${layer.id} unreviewed gid ${gid}`).toBe(true);
          expect(FORBIDDEN_SIGN_FRAMES.has(gid), `${layer.id} sign gid ${gid}`).toBe(false);
        }
      }
    }
    // The packed-snow trail uses only the small snow-stone frame.
    const trail = winterLayers.find(({ id }) => id === 'r92-pass-trail')!;
    const trailGids = new Set<number>();
    for (const row of trail.cells) for (const gid of row) if (gid !== 0) trailGids.add(gid);
    expect([...trailGids].sort((a, b) => a - b)).toEqual([2]);
    expect(trailGids.size).toBeGreaterThan(0);
  });

  it('connects the snow pass by walkable two-way gates and reachable landmarks', () => {
    const parsed = worldParse;
    const map = maps.get(MAP_ID)!;
    expect(map.data.columns).toBe(100);
    expect(map.data.rows).toBe(100);
    expect(map.data.art?.layers).toHaveLength(7);
    expect(assembledWorld.warnings).toEqual([]);

    const gates = assembledWorld.transitions.filter(({ id }) => id.startsWith('gate.r92-'));
    expect(gates.map(({ id }) => id)).toEqual([
      'gate.r92-terrace-to-north-pass',
      'gate.r92-north-pass-to-terrace',
    ]);
    const outbound = gates[0]!;
    const returning = gates[1]!;
    expect(outbound.from.mapResourceId).toBe(TERRACE_ID);
    expect(outbound.to).toMatchObject({ mapResourceId: MAP_ID, ...map.playerStart });
    expect(returning.from.mapResourceId).toBe(MAP_ID);
    expect(returning.to.mapResourceId).toBe(TERRACE_ID);
    const terrace = maps.get(TERRACE_ID)!;
    expect(terrace.canEnter(outbound.from.col, outbound.from.row)).toBe(true);
    expect(terrace.canEnter(returning.to.col, returning.to.row)).toBe(true);
    expect(map.canEnter(outbound.to.col, outbound.to.row)).toBe(true);
    expect(map.canEnter(returning.from.col, returning.from.row)).toBe(true);
    expect(findGridPath(map, map.playerStart, returning.from)).not.toBeNull();

    const routeOut = findWorldTravelRoute(assembledWorld, TERRACE_ID, MAP_ID)!;
    const routeBack = findWorldTravelRoute(assembledWorld, MAP_ID, TERRACE_ID)!;
    expect(routeOut.legs.map(({ transition }) => transition.id)).toEqual([outbound.id]);
    expect(routeBack.legs.map(({ transition }) => transition.id)).toEqual([returning.id]);

    const npcSet = readJson('data/base/characters/round-92-north-pass-npcs.json');
    const npc = npcSet.npcs.find(({ id }: { id: string }) => id === NPC_ID)!;
    const landmarks = parsed.data.landmarks.filter(({ mapResourceId }) => mapResourceId === MAP_ID);
    const events = parsed.data.events.filter(({ mapResourceId }) => mapResourceId === MAP_ID);
    const destinations = [
      ...landmarks.map(({ col, row }) => ({ col, row })),
      npc.position,
      ...npc.schedule.map(({ position }: { position: { col: number; row: number } }) => position),
      ...events.map(({ col, row }) => ({ col, row })),
    ];
    expect(landmarks).toHaveLength(4);
    expect(events).toHaveLength(4);
    for (const point of destinations) {
      expect(findGridPath(map, map.playerStart, point), `${point.col},${point.row}`).not.toBeNull();
    }

    const beaconEvent = events.find(({ id }) => id === 'event.r92-snow-beacon')!;
    const approaches = [
      { col: beaconEvent.col, row: beaconEvent.row - 1 },
      { col: beaconEvent.col + 1, row: beaconEvent.row },
      { col: beaconEvent.col, row: beaconEvent.row + 1 },
      { col: beaconEvent.col - 1, row: beaconEvent.row },
    ];
    expect(approaches.some((point) =>
      map.canEnter(point.col, point.row) && findGridPath(map, map.playerStart, point) !== null,
    )).toBe(true);
    expect(beaconEvent.interaction?.range).toBe(1);
    expect(beaconEvent.conditions?.periodIds).toEqual([
      'period.dusk', 'period.night', 'period.midnight',
    ]);
    expect(beaconEvent.conditions?.weatherIds).toEqual(['weather.snow']);
  });

  it('runs the keeper dialogue, beacon quest, schedule and knowledge graph links', () => {
    const npcParse = parseNpcSet(readJson('data/base/characters/round-92-north-pass-npcs.json'));
    const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-92-north-pass-conversations.json'));
    const questParse = parseQuestSet(readJson('data/base/quests/round-92-north-pass-quests.json'));
    expect(npcParse.ok && dialogueParse.ok && questParse.ok).toBe(true);
    if (!npcParse.ok || !dialogueParse.ok || !questParse.ok) return;
    const npc = npcParse.set.npcs.find(({ id }) => id === NPC_ID)!;
    const map = maps.get(MAP_ID)!;
    expect(npc.questGiver).toBe(true);
    expect(npc.spriteFrames).toMatchObject({ down: 64, right: 72, up: 80, left: 88 });
    expect(findGridPathToAdjacentCell(map, map.playerStart, npc.position)).not.toBeNull();
    for (const entry of npc.schedule) {
      expect(map.canEnter(entry.position.col, entry.position.row), entry.periodId).toBe(true);
      expect(findGridPath(map, map.playerStart, entry.position), entry.periodId).not.toBeNull();
    }
    for (const conversation of dialogueParse.set.conversations) {
      expect(validateConversation(conversation), conversation.id).toEqual([]);
    }
    const greeting = dialogueParse.set.conversations.find(({ id }) => id === npc.dialogueId)!
      .nodes.find(({ id }) => id === 'greet')!;
    expect(greeting.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID),
    )).toBe(true);

    const assembledQuests = assembleQuests({
      questSet: questParse.set,
      questGiverNpcIds: new Set([NPC_ID]),
      npcIds: new Set([NPC_ID]),
      itemIds: new Set(), encounterIds: new Set(['encounter.r101-beacon-raider']),
      knowledgeNodeIds,
    });
    expect(assembledQuests.warnings).toEqual([]);
    const quest = assembledQuests.quests.get(QUEST_ID)!;
    expect(quest.objectives.map(({ kind }) => kind)).toEqual([
      'discoverKnowledge', 'discoverKnowledge', 'defeatEncounter', 'talkToNpc',
    ]);
    const journal = createQuestJournal(assembledQuests.quests);
    expect(acceptQuest(assembledQuests.quests, journal, QUEST_ID).ok).toBe(true);
    expect(applyQuestSignal(assembledQuests.quests, journal, {
      type: 'knowledge-discovery', nodeId: ARRIVAL_NODE_ID,
    }).completed).toEqual([]);
    expect(applyQuestSignal(assembledQuests.quests, journal, {
      type: 'knowledge-discovery', nodeId: BEACON_NODE_ID,
    }).completed).toEqual([]);
    expect(applyQuestSignal(assembledQuests.quests, journal, {
      type: 'encounter-victory', encounterId: 'encounter.r101-beacon-raider',
    }).completed).toEqual([]);
    const report = applyQuestSignal(assembledQuests.quests, journal, {
      type: 'npc-talk', npcId: NPC_ID,
    });
    expect(report.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(report.completed[0]?.discoverKnowledgeNodeIds).toContain(CAIRN_NODE_ID);

    const graphEdges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{
      id: string; fromId: string; toId: string;
    }>;
    expect(graphEdges.filter(({ id }) => id.startsWith('kg.edge.r92-'))).toHaveLength(10);
    for (const nodeId of [MAP_ID, ARRIVAL_NODE_ID, BEACON_NODE_ID, CAIRN_NODE_ID, NPC_ID, QUEST_ID]) {
      expect(knowledgeNodeIds.has(nodeId), nodeId).toBe(true);
    }
  });

  it('ships the original OGA CC0 winter PNG, notice and release entries', () => {
    const sheetPath = path.join(repoRoot, 'data/assets/opengameart/winter-tileset-zaph/tileset.png');
    const sheet = readFileSync(sheetPath);
    const dimensions = (png: Buffer) => ({
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      colorType: png.readUInt8(25),
    });
    expect(dimensions(sheet)).toEqual({ width: 256, height: 256, colorType: 6 });
    expect(sha256(sheet)).toBe('cf8371e2a8418ea16d25e997affab5e9a6a3e954aacaf8e015c467b1004f4dd1');

    const notice = readFileSync(path.join(repoRoot, 'data/assets/opengameart/winter-tileset-zaph/NOTICE.txt'), 'utf8');
    const license = readFileSync(path.join(repoRoot, 'data/assets/opengameart/winter-tileset-zaph/CC0-1.0.txt'), 'utf8');
    const references = readFileSync(path.join(repoRoot, 'docs/REFERENCES.md'), 'utf8');
    const releaseScript = readFileSync(path.join(repoRoot, 'scripts/package-release.mjs'), 'utf8');
    expect(notice).toContain('https://opengameart.org/content/winter-tileset-16x16');
    expect(notice).toContain('zaphgames');
    expect(notice).toContain('https://opengameart.org/sites/default/files/snowy_tileset_zaph_0.png');
    expect(license).toContain('CC0 1.0 Universal');
    expect(license).toContain('waive');
    expect(references).toContain('zaphgames');
    expect(references).toContain('CC0');
    expect(references).toContain('https://opengameart.org/content/winter-tileset-16x16');
    for (const file of ['tileset.png', 'CC0-1.0.txt', 'NOTICE.txt']) {
      expect(releaseScript).toContain(`winter-tileset-zaph/${file}`);
    }
    expect(statSync(sheetPath).size).toBeGreaterThan(5_000);
  });

  it('re-runs the Round 92, 93, 91 and 87 generators safely without drifting shipped data', async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'round92-generators-'));
    const directories = ['scripts/lib', 'data/base/world', 'data/base/maps', 'data/base/characters',
      'data/base/dialogues', 'data/base/quests', 'data/base/knowledge_graph'];
    const files = [
      'scripts/generate-round87-southwest-isles.mjs',
      'scripts/generate-round91-cloud-north-terrace.mjs',
      'scripts/generate-round92-north-pass.mjs',
      'scripts/generate-round93-snow-pine-valley.mjs',
      'scripts/lib/atlas-rle.mjs',
      'scripts/lib/round101-north-content.mjs',
      'data/base/world/world-map.json',
      'data/base/manifest.json',
      'data/base/maps/round-79-isles.json',
      'data/base/maps/round-87-southwest-isles.json',
      'data/base/maps/round-74-cloud-ridge.json',
      'data/base/maps/round-91-cloud-north-terrace.json',
      'data/base/maps/round-92-north-pass.json',
      'data/base/maps/round-93-snow-pine-valley.json',
      'data/base/characters/round-87-southwest-isles-npcs.json',
      'data/base/characters/round-91-cloud-north-terrace-npcs.json',
      'data/base/characters/round-92-north-pass-npcs.json',
      'data/base/characters/round-93-snow-pine-valley-npcs.json',
      'data/base/dialogues/round-87-southwest-isle-conversations.json',
      'data/base/dialogues/round-91-cloud-north-terrace-conversations.json',
      'data/base/dialogues/round-92-north-pass-conversations.json',
      'data/base/dialogues/round-93-snow-pine-valley-conversations.json',
      'data/base/quests/round-87-southwest-isle-quests.json',
      'data/base/quests/round-91-cloud-north-terrace-quests.json',
      'data/base/quests/round-92-north-pass-quests.json',
      'data/base/quests/round-93-snow-pine-valley-quests.json',
      'data/base/knowledge_graph/nodes.json',
      'data/base/knowledge_graph/edges.json',
    ];
    try {
      for (const directory of directories) await mkdir(path.join(sandbox, directory), { recursive: true });
      for (const file of files) {
        await copyFile(path.join(repoRoot, file), path.join(sandbox, file));
      }
      const outputs = files.slice(5);
      const run = (script: string) => spawnSync(process.execPath,
        [path.join(sandbox, script)], { cwd: sandbox, encoding: 'utf8' });
      // Round 92 first: rebuilds its managed art layers from the protected
      // baseline while preserving the later Round 93 layers and resources.
      const r92 = run('scripts/generate-round92-north-pass.mjs');
      expect(r92.error).toBeUndefined();
      expect(r92.status, r92.stderr).toBe(0);
      expect(r92.stdout).toContain('Rebuilt the Round 92 extension');
      const r93 = run('scripts/generate-round93-snow-pine-valley.mjs');
      expect(r93.error).toBeUndefined();
      expect(r93.status, r93.stderr).toBe(0);
      expect(r93.stdout).toContain('Rebuilt the Round 93 extension');
      // Then the older generators on top of Round 92/93 state: they must keep it.
      const r91 = run('scripts/generate-round91-cloud-north-terrace.mjs');
      expect(r91.error).toBeUndefined();
      expect(r91.status, r91.stderr).toBe(0);
      expect(r91.stdout).toContain('deterministic generation is a no-op');
      const r87 = run('scripts/generate-round87-southwest-isles.mjs');
      expect(r87.error).toBeUndefined();
      expect(r87.status, r87.stderr).toBe(0);
      expect(r87.stdout).toContain('generation is a no-op');
      const r92again = run('scripts/generate-round92-north-pass.mjs');
      expect(r92again.status, r92again.stderr).toBe(0);
      for (const file of outputs) {
        const after = await readFile(path.join(sandbox, file));
        expect(after.equals(readFileSync(path.join(repoRoot, file))), `shipped ${file}`).toBe(true);
      }
      // A second full pass over the sandbox stays byte-stable as well.
      const firstContents = new Map(outputs.map((file) => [file, readFileSync(path.join(sandbox, file))]));
      for (const script of ['scripts/generate-round87-southwest-isles.mjs',
        'scripts/generate-round91-cloud-north-terrace.mjs',
        'scripts/generate-round92-north-pass.mjs',
        'scripts/generate-round93-snow-pine-valley.mjs']) {
        const again = run(script);
        expect(again.status, again.stderr).toBe(0);
      }
      for (const file of outputs) {
        const after = await readFile(path.join(sandbox, file));
        expect(after.equals(firstContents.get(file)!), `stable ${file}`).toBe(true);
      }
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }, 20_000);
});
