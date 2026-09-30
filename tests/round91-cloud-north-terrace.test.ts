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
const MAP_ID = 'map.round-91-cloud-north-terrace';
const RIDGE_ID = 'map.round-74-cloud-ridge';
const NPC_ID = 'char.r91-nie-qiyan';
const QUEST_ID = 'quest.r91-goose-vigil';
const ARRIVAL_NODE_ID = 'place.r91-cloud-north-terrace';
const PLATFORM_NODE_ID = 'place.r91-goose-terrace';
const STONE_NODE_ID = 'place.r91-goose-stone';

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

describe('Round 91 Cloud Ridge North Terrace', () => {
  it('expands the movable atlas while preserving every old pixel layer and region center', () => {
    const baseline = readJson('iterations/round-91/round90-atlas-baseline.json') as {
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
    expect(art.layers).toHaveLength(53);
    const layers = new Map(art.layers.map((layer) => [layer.id, layer]));
    for (const [id, expectedHash] of Object.entries(baseline.layers)) {
      const layer = layers.get(id);
      expect(layer, id).toBeDefined();
      const oldRectangle = layer!.cells.slice(0, baseline.rows)
        .map((row) => row.slice(0, baseline.columns));
      expect(sha256(JSON.stringify(oldRectangle)), id).toBe(expectedHash);
    }

    const oldArt = { ...art, columns: baseline.columns, rows: baseline.rows };
    for (const [mapResourceId, oldAnchor] of Object.entries(baseline.regions)) {
      const current = parsed.data.regions.find((region) => region.mapResourceId === mapResourceId);
      expect(current, mapResourceId).toBeDefined();
      const before = projectAtlasPosition(oldAnchor.percent, oldArt);
      const after = projectAtlasPosition(current!.atlasPosition, art);
      expect(Math.abs(after.x - before.x), `${mapResourceId} x`).toBeLessThanOrEqual(0.001);
      expect(Math.abs(after.y - before.y), `${mapResourceId} y`).toBeLessThanOrEqual(0.001);
    }

    const terrace = parsed.data.regions.find(({ mapResourceId }) => mapResourceId === MAP_ID)!;
    const point = projectAtlasPosition(terrace.atlasPosition, art);
    expect(point.x).toBeCloseTo((576.5) * 8, 5);
    expect(point.y).toBeCloseTo((96.5) * 8, 5);
  });

  it('connects the new 100×100 district by walkable gates and reachable landmarks', () => {
    const parsed = worldParse;
    const map = maps.get(MAP_ID)!;
    expect(map.data.columns).toBe(100);
    expect(map.data.rows).toBe(100);
    expect(map.data.art?.layers).toHaveLength(8);
    expect(assembledWorld.warnings).toEqual([]);

    const gates = assembledWorld.transitions.filter(({ id }) => id.startsWith('gate.r91-'));
    expect(gates.map(({ id }) => id)).toEqual([
      'gate.r91-cloud-ridge-to-terrace',
      'gate.r91-terrace-to-cloud-ridge',
    ]);
    const outbound = gates[0]!;
    const returning = gates[1]!;
    expect(outbound.from.mapResourceId).toBe(RIDGE_ID);
    expect(outbound.to).toMatchObject({ mapResourceId: MAP_ID, ...map.playerStart });
    expect(returning.from.mapResourceId).toBe(MAP_ID);
    expect(returning.to.mapResourceId).toBe(RIDGE_ID);
    expect(maps.get(RIDGE_ID)!.canEnter(outbound.from.col, outbound.from.row)).toBe(true);
    expect(maps.get(RIDGE_ID)!.canEnter(returning.to.col, returning.to.row)).toBe(true);
    expect(map.canEnter(outbound.to.col, outbound.to.row)).toBe(true);
    expect(map.canEnter(returning.from.col, returning.from.row)).toBe(true);
    expect(findGridPath(map, map.playerStart, returning.from)).not.toBeNull();

    const routeOut = findWorldTravelRoute(assembledWorld, RIDGE_ID, MAP_ID)!;
    const routeBack = findWorldTravelRoute(assembledWorld, MAP_ID, RIDGE_ID)!;
    expect(routeOut.legs.map(({ transition }) => transition.id)).toEqual([outbound.id]);
    expect(routeBack.legs.map(({ transition }) => transition.id)).toEqual([returning.id]);

    const npcSet = readJson('data/base/characters/round-91-cloud-north-terrace-npcs.json');
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

    const platformEvent = events.find(({ id }) => id === 'event.r91-goose-terrace')!;
    const approaches = [
      { col: platformEvent.col, row: platformEvent.row - 1 },
      { col: platformEvent.col + 1, row: platformEvent.row },
      { col: platformEvent.col, row: platformEvent.row + 1 },
      { col: platformEvent.col - 1, row: platformEvent.row },
    ];
    expect(approaches.some((point) =>
      map.canEnter(point.col, point.row) && findGridPath(map, map.playerStart, point) !== null,
    )).toBe(true);
    expect(platformEvent.interaction?.range).toBe(1);
    expect(platformEvent.conditions?.periodIds).toEqual([
      'period.morning', 'period.midday', 'period.afternoon',
    ]);
  });

  it('runs the keeper dialogue, discovery quest, schedules and knowledge graph links', () => {
    const npcParse = parseNpcSet(readJson('data/base/characters/round-91-cloud-north-terrace-npcs.json'));
    const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-91-cloud-north-terrace-conversations.json'));
    const questParse = parseQuestSet(readJson('data/base/quests/round-91-cloud-north-terrace-quests.json'));
    expect(npcParse.ok && dialogueParse.ok && questParse.ok).toBe(true);
    if (!npcParse.ok || !dialogueParse.ok || !questParse.ok) return;
    const npc = npcParse.set.npcs.find(({ id }) => id === NPC_ID)!;
    const map = maps.get(MAP_ID)!;
    expect(npc.questGiver).toBe(true);
    expect(npc.spriteFrames).toMatchObject({ down: 224, right: 232, up: 240, left: 248 });
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
      itemIds: new Set(), encounterIds: new Set(),
      knowledgeNodeIds,
    });
    expect(assembledQuests.warnings).toEqual([]);
    const quest = assembledQuests.quests.get(QUEST_ID)!;
    expect(quest.objectives.map(({ kind }) => kind)).toEqual([
      'discoverKnowledge', 'discoverKnowledge', 'talkToNpc',
    ]);
    const journal = createQuestJournal(assembledQuests.quests);
    expect(acceptQuest(assembledQuests.quests, journal, QUEST_ID).ok).toBe(true);
    expect(applyQuestSignal(assembledQuests.quests, journal, {
      type: 'knowledge-discovery', nodeId: ARRIVAL_NODE_ID,
    }).completed).toEqual([]);
    expect(applyQuestSignal(assembledQuests.quests, journal, {
      type: 'knowledge-discovery', nodeId: PLATFORM_NODE_ID,
    }).completed).toEqual([]);
    const report = applyQuestSignal(assembledQuests.quests, journal, {
      type: 'npc-talk', npcId: NPC_ID,
    });
    expect(report.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(report.completed[0]?.discoverKnowledgeNodeIds).toContain(STONE_NODE_ID);

    const graphEdges = readJson('data/base/knowledge_graph/edges.json').edges as Array<{
      id: string; fromId: string; toId: string;
    }>;
    expect(graphEdges.filter(({ id }) => id.startsWith('kg.edge.r91-'))).toHaveLength(10);
    for (const nodeId of [MAP_ID, ARRIVAL_NODE_ID, PLATFORM_NODE_ID, STONE_NODE_ID, NPC_ID, QUEST_ID]) {
      expect(knowledgeNodeIds.has(nodeId), nodeId).toBe(true);
    }
  });

  it('ships the original OGA CC0 16px PNGs, notice and release entries', () => {
    const mountainPath = path.join(repoRoot, 'data/assets/opengameart/tiny-rpg-mountain/tileset.png');
    const bridgePath = path.join(repoRoot, 'data/assets/opengameart/tiny-rpg-mountain/bridge.png');
    const mountain = readFileSync(mountainPath);
    const bridge = readFileSync(bridgePath);
    const dimensions = (png: Buffer) => ({
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      colorType: png.readUInt8(25),
    });
    expect(dimensions(mountain)).toEqual({ width: 368, height: 128, colorType: 6 });
    expect(dimensions(bridge)).toEqual({ width: 160, height: 80, colorType: 6 });
    expect(sha256(mountain)).toBe('9af4ec6cd7c189fc85cd732cfeF899f0c2c8a1397c1cdb36595c4013131563d5'.toLowerCase());
    expect(sha256(bridge)).toBe('21c850dc204496d900602c34297e3c79f33d914dce07efda270e7f2988cbed63');

    const notice = readFileSync(path.join(repoRoot, 'data/assets/opengameart/tiny-rpg-mountain/NOTICE.txt'), 'utf8');
    const license = readFileSync(path.join(repoRoot, 'data/assets/opengameart/tiny-rpg-mountain/public-license.txt'), 'utf8');
    const references = readFileSync(path.join(repoRoot, 'docs/REFERENCES.md'), 'utf8');
    const releaseScript = readFileSync(path.join(repoRoot, 'scripts/package-release.mjs'), 'utf8');
    expect(notice).toContain('https://opengameart.org/content/tiny-rpg-mountain-tileset');
    expect(license).toContain('personal or commercial projects');
    expect(license).toContain('re-distribute');
    expect(references).toContain('Ansimuz');
    expect(references).toContain('CC0');
    expect(references).toContain('https://opengameart.org/content/tiny-rpg-mountain-tileset');
    for (const file of ['tileset.png', 'bridge.png', 'public-license.txt', 'NOTICE.txt']) {
      expect(releaseScript).toContain(`tiny-rpg-mountain/${file}`);
    }
    expect(statSync(mountainPath).size).toBeGreaterThan(5_000);
  });

  it('re-runs the generator twice in an isolated copy without drifting shipped data', async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'round91-generator-'));
    const directories = ['scripts/lib', 'data/base/world', 'data/base/maps', 'data/base/characters',
      'data/base/dialogues', 'data/base/quests', 'data/base/knowledge_graph'];
    const files = [
      'scripts/generate-round91-cloud-north-terrace.mjs',
      'scripts/lib/atlas-rle.mjs',
      'data/base/world/world-map.json',
      'data/base/manifest.json',
      'data/base/maps/round-74-cloud-ridge.json',
      'data/base/maps/round-91-cloud-north-terrace.json',
      'data/base/characters/round-91-cloud-north-terrace-npcs.json',
      'data/base/dialogues/round-91-cloud-north-terrace-conversations.json',
      'data/base/quests/round-91-cloud-north-terrace-quests.json',
      'data/base/knowledge_graph/nodes.json',
      'data/base/knowledge_graph/edges.json',
    ];
    try {
      for (const directory of directories) await mkdir(path.join(sandbox, directory), { recursive: true });
      for (const file of files) {
        await copyFile(path.join(repoRoot, file), path.join(sandbox, file));
      }
      const script = path.join(sandbox, 'scripts/generate-round91-cloud-north-terrace.mjs');
      const run = () => spawnSync(process.execPath, [script], { cwd: sandbox, encoding: 'utf8' });
      const first = run();
      expect(first.error).toBeUndefined();
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toContain('deterministic generation is a no-op');
      const outputs = files.slice(2);
      const firstContents = new Map(outputs.map((file) => [file, readFileSync(path.join(sandbox, file))]));
      const second = run();
      expect(second.error).toBeUndefined();
      expect(second.status, second.stderr).toBe(0);
      for (const file of outputs) {
        const after = await readFile(path.join(sandbox, file));
        expect(after.equals(firstContents.get(file)!), file).toBe(true);
        expect(after.equals(readFileSync(path.join(repoRoot, file))), `shipped ${file}`).toBe(true);
      }
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
