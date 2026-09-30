/**
 * Round 87: southwestern atlas expansion (448×320 → 512×384), the walkable
 * Southwest Isles (西南列岛·雾航湾), the two-way isles gates and the
 * cross-region fog-pilot quest.
 *
 * The generator idempotence check re-runs the deterministic generator inside
 * a sandboxed copy of its inputs, so byte-stability and shipped-data equality
 * are both proven without touching the live data tree. Raw matrix checks then
 * preserve every old atlas cell inside the original 448×320 rectangle.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
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
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { buildQuestObjectiveWaypoint } from '../src/engine/world-navigation';
import { findWorldTravelRoute } from '../src/engine/world-travel';

const ISLE_ID = 'map.round-87-southwest-isles';
const ISLES_ID = 'map.round-79-isles';
const PILOT_ID = 'char.r87-meng-haizhou';
const KEEPER_ID = 'char.r87-ao-wanqing';
const QUEST_ID = 'quest.r87-fog-pilot-ledger';
const ISLE_NODE = 'place.r87-southwest-isles';
const HARBOR_NODE = 'place.r87-fog-harbor';
const SIGNAL_NODE = 'place.r87-mist-signal';
const SPRING_NODE = 'place.r87-spring-hollow';
const ATLAS_COLUMNS = 512;
const ATLAS_ROWS = 384;
const OLD_COLUMNS = 448;
const OLD_ROWS = 320;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path: string): any {
  return JSON.parse(readFileSyncText(path));
}

function readFileSyncText(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

function parseMap(raw: unknown): GridMap {
  const parsed = parseGridMap(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

/** Region atlas percentages as of Round 86 (448×320 canvas), pinned as the
 * pre-expansion baseline so the rebased 512×384 values must project onto the
 * same absolute cell centers. */
const round86RegionAnchors: Record<string, { x: number; y: number }> = {
  'map.round-01-grid': { x: 9.26174475, y: 18.31347969 },
  'map.round-10-mist-ferry': { x: 29.63758401, y: 24.28526638 },
  'map.round-62-iron-ridge': { x: 29.63758401, y: 10.35109714 },
  'map.round-67-salt-road': { x: 9.26174475, y: 24.28526638 },
  'map.round-74-cloud-ridge': { x: 39.82550315, y: 20.3040751 },
  'map.round-79-isles': { x: 24.94407159, y: 39.89655172 },
  'map.round-82-east-coast': { x: 63.70246085, y: 30.75862069 },
  'map.round-84-windward-isle': { x: 79.41834452, y: 39.18495298 },
  'map.round-85-tide-isle': { x: 90.60402685, y: 87.77429467 },
};

/** SHA-256 of every pre-Round-87 layer cropped to the original 448×320
 * rectangle; the expansion must keep these cells byte-for-byte identical. */
const oldLayerHashes: Record<string, string> = {
  'world-ocean': '50bfdc6911af48db614cde7966b10e4696545efb4b99b73bf8ea61f5412d8d0d',
  'world-land': '65fa6e7062893a085d56fe4148be0efbfa07dcf1c140c408eddd8f6d57c0c17d',
  'world-coast': 'ae7cd2a76761afb4ac1eab1299655fc73852ae00742b54e7adf730f8882b356d',
  'world-forest': 'a7fd7d68321b7999a18125b98c592a6f7ff6829f1d0930fe56d9f0b8352122fb',
  'world-relief': '9c41d0e74b0b629a5555115e8d49752ef01e2280344a33100b6d9a2bef1160a5',
  'world-roads': '11d8c4d201e468222622e211f59e352d27e89d9ace52ab7b1e535063ed844787',
  'world-settlements': '502beec5a176d92d79b6378970f87b812d4c609d93237ea009235183822ebdf6',
  'world-r79-shoal-water': 'e9dbe24ac3d949ddf069b5fb57aed2ad0de6dc80c2fda6fc64cd4f0e07f56807',
  'world-r79-shoal-sand': '656911c90692e34babb7b1881422c79bc7b8faf90a36a11d5266ecde70514929',
  'world-r79-shoal-land': '6a753cceb1fc56e7094d022165f17ccbfca144cee1d2300aae1bbae6b842960f',
  'world-r79-shoal-pines': '76c0189d5fb67e5a95e56545412168e55ad4c210d7bb8ed35227577169be6341',
  'world-r79-gate-routes': '5d7a22cd0bd4d1ab8eb409ee2fce317489b54837a1b4de15a3564deebf147895',
  'world-r81-expanse-water': 'ebb054b74dcd45921424dd67e3396efb07dcccb086c699582ad6469b43f6fc38',
  'world-r81-expanse-sand': 'd658903a255f09e98b6f66b45ba17b30a66549750e8ee1bba6a30a0d7d651561',
  'world-r81-expanse-land': '9db214ef22615426574a29656b152599d0fb5435a8ef431e1b917b91571b595e',
  'world-r81-expanse-pines': '7a6c073674a48a596a6a61ba5091faac2d8b009e885b58623049858d1665e5f0',
  'world-r84-expanse-water': 'dd860a46fb51b966fb74f3be3305a518389a75b17e8e2f0881a20a2fbebc5611',
  'world-r84-expanse-sand': 'e376268745915ecff33c43be264a89c56967f0c187f1c9a7ffe7335176726ef9',
  'world-r84-expanse-land': '46cce5be0156d823924d78a766e1897dcd52a0358ae8e4ab124f13d53c537ec6',
  'world-r84-expanse-pines': 'ed0462271ea851ecf09c465353ab896d5dbab30cdb87a53a3b08400e31a27304',
  'world-r85-expanse-water': 'c60a6cade97fded449625252ec76b4a87ff8df73baddead90fbc85a852e2e273',
  'world-r85-expanse-sand': '43531cdd706a081d882c9abe4ea5b80f21e6540ea2c0a5c1cd1707ec3469a4e4',
  'world-r85-expanse-land': '08e7ba27658d96ade9e7932aea3e4422bf797f6be39761731dc75d31992a1dea',
  'world-r85-expanse-pines': '4106554800b6ca653f3ba22ea88f8d3a9678afbe14cfc73c31a604de9e404ac1',
};

/** Everything the generator reads before it writes; copied verbatim into the
 * sandbox so the spawned runs cannot race the live data tree. */
const generatorInputs: Array<{ from: string; to: string }> = [
  { from: '../data/base/world/world-map.json', to: 'data/base/world/world-map.json' },
  { from: '../data/base/manifest.json', to: 'data/base/manifest.json' },
  { from: '../data/base/maps/round-79-isles.json', to: 'data/base/maps/round-79-isles.json' },
  { from: '../data/base/knowledge_graph/nodes.json', to: 'data/base/knowledge_graph/nodes.json' },
  { from: '../data/base/knowledge_graph/edges.json', to: 'data/base/knowledge_graph/edges.json' },
];

/** All files the generator writes on a fresh expansion run. */
const generatorOutputs: Array<{ from: string; to: string }> = [
  { from: '../data/base/world/world-map.json', to: 'data/base/world/world-map.json' },
  { from: '../data/base/manifest.json', to: 'data/base/manifest.json' },
  { from: '../data/base/maps/round-87-southwest-isles.json', to: 'data/base/maps/round-87-southwest-isles.json' },
  { from: '../data/base/characters/round-87-southwest-isles-npcs.json', to: 'data/base/characters/round-87-southwest-isles-npcs.json' },
  { from: '../data/base/dialogues/round-87-southwest-isle-conversations.json', to: 'data/base/dialogues/round-87-southwest-isle-conversations.json' },
  { from: '../data/base/quests/round-87-southwest-isle-quests.json', to: 'data/base/quests/round-87-southwest-isle-quests.json' },
  { from: '../data/base/knowledge_graph/nodes.json', to: 'data/base/knowledge_graph/nodes.json' },
  { from: '../data/base/knowledge_graph/edges.json', to: 'data/base/knowledge_graph/edges.json' },
];

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const manifest = readJson('../data/base/manifest.json') as {
  resources: { id: string; path: string; schema: string }[];
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parseMap(readJson(`../data/base/${resource.path}`)));
}

function makeNpc(record: {
  id: string;
  name: string;
  mapResourceId: string;
  position: { col: number; row: number };
  dialogueId: string;
  questGiver: boolean;
}): PlacedNpc {
  return {
    record: { ...record, shopId: null, schedule: [] },
    col: record.position.col,
    row: record.position.row,
  };
}

describe('Round 87 Southwest Isles and the 512×384 atlas', () => {
  it('re-runs the generator deterministically with byte-stable, shipped-identical output', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'round87-generator-'));
    try {
      await mkdir(join(sandbox, 'scripts', 'lib'), { recursive: true });
      for (const dir of ['world', 'maps', 'knowledge_graph', 'characters', 'dialogues', 'quests']) {
        await mkdir(join(sandbox, 'data', 'base', dir), { recursive: true });
      }
      await copyFile(join(repoRoot, 'scripts', 'generate-round87-southwest-isles.mjs'), join(sandbox, 'scripts', 'generate-round87-southwest-isles.mjs'));
      await copyFile(join(repoRoot, 'scripts', 'lib', 'atlas-rle.mjs'), join(sandbox, 'scripts', 'lib', 'atlas-rle.mjs'));
      for (const input of generatorInputs) {
        await copyFile(new URL(input.from, import.meta.url), join(sandbox, input.to));
      }

      const script = join(sandbox, 'scripts', 'generate-round87-southwest-isles.mjs');
      const run = () => spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: sandbox });
      const first = run();
      expect(first.error).toBeUndefined();
      expect(first.status, first.stderr).toBe(0);
      const afterFirst = new Map<string, string>();
      for (const output of generatorOutputs) afterFirst.set(output.to, await sha256(join(sandbox, output.to)));

      const second = run();
      expect(second.error).toBeUndefined();
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('deterministic generation is a no-op');
      for (const output of generatorOutputs) {
        const hash = await sha256(join(sandbox, output.to));
        expect(hash, output.to).toBe(afterFirst.get(output.to));
        // The sandbox reproduction must equal the shipped data byte for byte.
        expect(hash, output.to).toBe(await sha256(fileURLToPath(new URL(output.from, import.meta.url))));
      }

      // The sandbox atlas JSON also round-trips the RLE wire format losslessly.
      const sandboxWorld = JSON.parse(await readFile(join(sandbox, 'data/base/world/world-map.json'), 'utf8'));
      const parsedSandbox = parseWorldMap(sandboxWorld);
      expect(parsedSandbox.ok).toBe(true);
      expect((sandboxWorld.atlasArt.layers as { cellsRle: string[] }[]).every((layer) => layer.cellsRle.length === ATLAS_ROWS)).toBe(true);
      // No stray files beyond the eight declared outputs.
      const sandboxBase = join(sandbox, 'data', 'base');
      const top = await readdir(sandboxBase);
      expect(top.sort()).toEqual(['characters', 'dialogues', 'knowledge_graph', 'manifest.json', 'maps', 'quests', 'world']);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }, 120_000);

  it('expands the atlas to 512×384 with 28 layers while every old cell stays identical', () => {
    const world = readJson('../data/base/world/world-map.json');
    const art = world.atlasArt;
    expect(art).toMatchObject({
      columns: ATLAS_COLUMNS, rows: ATLAS_ROWS, tileSize: 16,
      regionFootprint: { columns: 35.84, rows: 23.04 },
    });
    expect(art.layers).toHaveLength(28);
    expect(art.layers.slice(-4).map(({ id }: { id: string }) => id)).toEqual([
      'world-r87-expanse-water', 'world-r87-expanse-sand',
      'world-r87-expanse-land', 'world-r87-expanse-pines',
    ]);
    expect(art.layers.every((layer: any) =>
      layer.cells === undefined && Array.isArray(layer.cellsRle) &&
      layer.cellsRle.length === ATLAS_ROWS)).toBe(true);

    // All per-cell guarantees below read the dense matrix decoded by the live
    // parser, so they keep proving pixel-level equality with pre-Round-87 data.
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
    // ocean base fills it so the southwestern sea never shows holes.
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
    // The Round 87 art layers paint only inside the new L-shaped area.
    for (const id of ['world-r87-expanse-water', 'world-r87-expanse-sand', 'world-r87-expanse-land', 'world-r87-expanse-pines']) {
      const layer = layers.get(id)!;
      const dense = layer.cells as number[][];
      for (let row = 0; row < OLD_ROWS; row += 1) {
        expect(dense[row]!.slice(0, OLD_COLUMNS).every((gid) => gid === 0), `${id} old rectangle`).toBe(true);
      }
    }

    // The archipelago paints the new southwestern landmass with registered CC0 frames only.
    const puny = art.tilesets.find(({ id }: { id: string }) => id === 'opengameart.puny-world');
    expect(puny?.tileCount).toBeGreaterThan(0);
    for (const id of ['world-r87-expanse-water', 'world-r87-expanse-sand', 'world-r87-expanse-land', 'world-r87-expanse-pines']) {
      const layer = layers.get(id)!;
      expect(layer.tilesetId).toBe('opengameart.puny-world');
      expect(layer.cells.flat().every((gid: number) => gid <= puny.tileCount)).toBe(true);
      expect(layer.cells.flat().filter((gid: number) => gid > 0).length, id).toBeGreaterThan(0);
    }
    const land = layers.get('world-r87-expanse-land')!;
    expect(land.cells.flat().filter((gid: number) => gid > 0).length).toBeGreaterThan(1_800);

    const notice = readFileSyncText('../data/assets/opengameart/puny-world/NOTICE.txt');
    expect(notice).toContain('https://opengameart.org/content/16x16-puny-world-tileset');
    expect(notice).toContain('CC0');
  }, 20_000);

  it('keeps all nine old region centers in the same atlas pixels after rebasing', () => {
    const world = readJson('../data/base/world/world-map.json');
    expect(world.regions).toHaveLength(10);
    expect(world.transitions).toHaveLength(18);
    for (const [mapResourceId, anchor] of Object.entries(round86RegionAnchors)) {
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
    expect(region.name).toBe('西南列岛·雾航湾');
    const col = Math.round(region.atlasPosition.x / 100 * (ATLAS_COLUMNS - 1));
    const row = Math.round(region.atlasPosition.y / 100 * (ATLAS_ROWS - 1));
    expect({ col, row }).toEqual({ col: 70, row: 345 });
    const parsedWorld = parseWorldMap(world);
    expect(parsedWorld.ok).toBe(true);
    if (!parsedWorld.ok) return;
    const land = parsedWorld.data.atlasArt!.layers.find(({ id }) => id === 'world-r87-expanse-land');
    expect(land!.cells[row]![col]).toBeGreaterThan(0);
  });

  it('adds a 100×100 Southwest Isles map using the registered CC0 atlases and walkable anchors', () => {
    const map = maps.get(ISLE_ID)!;
    expect(map.data).toMatchObject({ columns: 100, rows: 100, tileSize: 48 });
    expect(map.playerStart).toEqual({ col: 2, row: 50 });
    const art = map.data.art!;
    expect(art.tilesets.map(({ id }) => id)).toEqual([
      'opengameart.puny-world', 'opengameart.rpg-town', 'opengameart.puny-characters',
    ]);
    expect(art.layers.map(({ id }) => id)).toEqual([
      'r87-sea', 'r87-island-ground', 'r87-fog-harbor', 'r87-pine-groves',
    ]);
    const walkable = map.data.grid.flatMap((line) => [...line]).filter((cell) => cell !== '#' && cell !== '~').length;
    expect(walkable).toBeGreaterThan(4_000);

    const anchors = [
      { col: 1, row: 50 }, { col: 48, row: 46 }, { col: 49, row: 48 },
      { col: 78, row: 36 }, { col: 38, row: 62 },
    ];
    for (const point of anchors) expect(findGridPath(map, map.playerStart, point), `${point.col},${point.row}`).not.toBeNull();

    for (const layer of art.layers) {
      expect(layer.cells).toHaveLength(100);
      expect(layer.cells.every((line) => line.length === 100)).toBe(true);
      const tileset = art.tilesets.find(({ id }) => id === layer.tilesetId)!;
      expect(layer.cells.flat().every((gid) => gid <= tileset.tileCount)).toBe(true);
    }
    // The fog-harbor camp keeps its RPG Town props off anchors, roads and pines.
    const harbor = art.layers.find(({ id }) => id === 'r87-fog-harbor')!;
    expect(harbor.cells.flat().filter((gid) => gid > 0).length).toBe(6);

    const townLicense = readFileSyncText('../data/assets/opengameart/rpg-town-pixel-art-assets/License.txt');
    expect(townLicense).toContain('CC0');
  });

  it('links the isles and the Southwest Isles with collision-valid two-way gates', () => {
    const isles = maps.get(ISLES_ID)!;
    const isle = maps.get(ISLE_ID)!;
    const world = readJson('../data/base/world/world-map.json');
    const outbound = world.transitions.find(({ id }: { id: string }) => id === 'gate.r87-isles-to-southwest');
    const returnGate = world.transitions.find(({ id }: { id: string }) => id === 'gate.r87-southwest-to-isles');
    expect(outbound).toEqual({
      id: 'gate.r87-isles-to-southwest', name: '西南雾航',
      from: { mapResourceId: ISLES_ID, col: 5, row: 31 },
      to: { mapResourceId: ISLE_ID, col: 2, row: 50 },
    });
    expect(returnGate).toEqual({
      id: 'gate.r87-southwest-to-isles', name: '东北归帆',
      from: { mapResourceId: ISLE_ID, col: 1, row: 50 },
      to: { mapResourceId: ISLES_ID, col: 6, row: 31 },
    });

    // Both endpoints stay walkable and reachable from their own player starts,
    // and the round trip isles → Southwest Isles → isles closes on itself.
    expect(isles.canEnter(5, 31)).toBe(true);
    expect(isles.canEnter(6, 31)).toBe(true);
    expect(findGridPath(isles, isles.playerStart, outbound.from)).not.toBeNull();
    expect(findGridPath(isles, isles.playerStart, returnGate.to)).not.toBeNull();
    expect(isle.canEnter(2, 50)).toBe(true);
    expect(isle.canEnter(1, 50)).toBe(true);
    expect(outbound.to).toEqual({ mapResourceId: ISLE_ID, ...isle.playerStart });
    expect(findGridPath(isle, isle.playerStart, returnGate.from)).not.toBeNull();

    // Every Southwest Isles landmark and step event is reachable from the entrance.
    for (const anchor of [
      ...world.landmarks.filter(({ mapResourceId }: any) => mapResourceId === ISLE_ID),
      ...world.events.filter((event: any) => event.mapResourceId === ISLE_ID && event.interaction === undefined),
    ]) {
      expect(findGridPath(isle, isle.playerStart, anchor), anchor.id).not.toBeNull();
    }
  });

  it('declares the mist-signal survey as an E-key inspection with a reachable approach', () => {
    const world = readJson('../data/base/world/world-map.json');
    const isle = maps.get(ISLE_ID)!;
    const events = world.events.filter(({ id }: { id: string }) => id.startsWith('event.r87-'));
    expect(events.map(({ id }: { id: string }) => id)).toEqual([
      'event.r87-arrival', 'event.r87-fog-harbor', 'event.r87-mist-signal', 'event.r87-spring-hollow',
    ]);

    const signal = events.find(({ id }: { id: string }) => id === 'event.r87-mist-signal');
    expect(signal.once).toBe(true);
    expect(signal.interaction).toEqual({ prompt: '勘明雾哨崖的引水烽信', range: 1, approachDirections: ['left', 'down'] });
    expect(signal.discoverKnowledgeNodeId).toBe(SIGNAL_NODE);

    // The inspection target keeps at least one reachable orthogonal approach cell.
    const approaches = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ col: signal.col + dx, row: signal.row + dy }))
      .filter((point) => isle.canEnter(point.col, point.row));
    expect(approaches.length).toBeGreaterThan(0);
    expect(approaches.some((point) => findGridPath(isle, isle.playerStart, point) !== null)).toBe(true);

    for (const event of events) {
      if (event.id === 'event.r87-mist-signal') continue;
      expect(event.conditions, event.id).toBeUndefined();
      expect(event.once).toBe(true);
      expect(isle.canEnter(event.col, event.row), event.id).toBe(true);
    }
    expect(events.find(({ id }: { id: string }) => id === 'event.r87-arrival').discoverKnowledgeNodeId).toBe(ISLE_NODE);
  });

  it('runs the fog-pilot quest from the isles dialogue through both discoveries', () => {
    const npcSet = parseNpcSet(readJson('../data/base/characters/round-87-southwest-isles-npcs.json'));
    const dialogueSet = parseDialogueSet(readJson('../data/base/dialogues/round-87-southwest-isle-conversations.json'));
    const questSet = parseQuestSet(readJson('../data/base/quests/round-87-southwest-isle-quests.json'));
    const knowledgeSet = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    expect(npcSet.ok && dialogueSet.ok && questSet.ok && knowledgeSet.ok).toBe(true);
    if (!npcSet.ok || !dialogueSet.ok || !questSet.ok || !knowledgeSet.ok) return;

    const pilot = npcSet.set.npcs.find(({ id }) => id === PILOT_ID)!;
    const keeper = npcSet.set.npcs.find(({ id }) => id === KEEPER_ID)!;
    expect(pilot.mapResourceId).toBe(ISLES_ID);
    expect(pilot.questGiver).toBe(true);
    expect(keeper.mapResourceId).toBe(ISLE_ID);
    expect(keeper.questGiver).toBe(false);
    const isles = maps.get(ISLES_ID)!;
    const isle = maps.get(ISLE_ID)!;
    expect(isles.canEnter(pilot.position.col, pilot.position.row)).toBe(true);
    expect(findGridPath(isles, isles.playerStart, pilot.position)).not.toBeNull();
    expect(isle.canEnter(keeper.position.col, keeper.position.row)).toBe(true);
    expect(findGridPath(isle, isle.playerStart, keeper.position)).not.toBeNull();
    const actorTileset = isle.data.art!.tilesets.find(({ id }) => id === 'opengameart.puny-characters')!;
    for (const npc of [pilot, keeper]) {
      expect(Math.max(npc.spriteFrame ?? 0, ...Object.values(npc.spriteFrames ?? {}))).toBeLessThanOrEqual(actorTileset.tileCount);
    }

    for (const conversation of dialogueSet.set.conversations) {
      expect(validateConversation(conversation), conversation.id).toEqual([]);
    }
    const giverConversation = dialogueSet.set.conversations.find(({ id }) => id === pilot.dialogueId)!;
    expect(giverConversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ effects }) =>
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID))).toBe(true);
    expect(giverConversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ conditions }) =>
      conditions?.some((condition) => condition.kind === 'questStatus' && condition.questId === QUEST_ID && condition.status === 'active'))).toBe(true);
    expect(dialogueSet.set.conversations.some(({ id }) => id === keeper.dialogueId)).toBe(true);

    const knowledgeNodeIds = new Set(knowledgeSet.data.nodes.map(({ id }) => id));
    const quests = assembleQuests({
      questSet: questSet.set,
      questGiverNpcIds: new Set([PILOT_ID]),
      npcIds: new Set([PILOT_ID, KEEPER_ID]),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds,
    });
    expect(quests.warnings).toEqual([]);

    const quest = quests.quests.get(QUEST_ID)!;
    expect(quest.objectives.map(({ kind }) => kind)).toEqual(['discoverKnowledge', 'discoverKnowledge', 'talkToNpc']);

    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    const landing = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: ISLE_NODE });
    expect(landing.completed).toEqual([]);
    const survey = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: SIGNAL_NODE });
    expect(survey.completed).toEqual([]);
    const report = applyQuestSignal(quests.quests, journal, { type: 'npc-talk', npcId: PILOT_ID });
    expect(report.completed.map(({ questId }) => questId)).toEqual([QUEST_ID]);
    expect(report.completed[0]?.discoverKnowledgeNodeIds).toContain(SPRING_NODE);
  });

  it('closes the world travel graph across all ten regions and routes Q/N navigation both ways', () => {
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
    const npcRaw = readJson('../data/base/characters/round-87-southwest-isles-npcs.json') as {
      npcs: Array<{ id: string; name: string; mapResourceId: string; position: { col: number; row: number }; dialogueId: string; questGiver: boolean }>;
    };
    expect(calendar.ok && climate.ok && knowledge.ok).toBe(true);
    if (!calendar.ok || !climate.ok || !knowledge.ok) return;

    const references = {
      knowledgeNodeIds: new Set(knowledge.data.nodes.map(({ id }) => id)),
      periodIds: new Set(calendar.calendar.periods.map(({ id }) => id)),
      weatherIds: new Set(climate.climate.weathers.map(({ id }) => id)),
    };
    const assembled = assembleWorldMap(parsedWorld.data, maps, references);
    expect('ok' in assembled).toBe(false);
    if ('ok' in assembled) return;
    expect(assembled.warnings).toEqual([]);

    // Every declared region joins the directed travel graph from the start map,
    // and the new isles pair is exactly one hop in both directions.
    expect(assembled.regions).toHaveLength(10);
    for (const region of assembled.regions) {
      const route = findWorldTravelRoute(assembled, parsedWorld.data.startingMapResourceId, region.mapResourceId);
      expect(route, `${region.mapResourceId} reachable from start`).not.toBeNull();
    }
    const outboundRoute = findWorldTravelRoute(assembled, ISLES_ID, ISLE_ID)!;
    expect(outboundRoute.legs.map(({ transition }) => transition.id)).toEqual(['gate.r87-isles-to-southwest']);
    const returnRoute = findWorldTravelRoute(assembled, ISLE_ID, ISLES_ID)!;
    expect(returnRoute.legs.map(({ transition }) => transition.id)).toEqual(['gate.r87-southwest-to-isles']);
    const fromStart = findWorldTravelRoute(assembled, parsedWorld.data.startingMapResourceId, ISLE_ID)!;
    expect(fromStart.regionMapResourceIds).toContain(ISLES_ID);

    // Q/N navigation: the active objective projects onto the first gate of the
    // routed itinerary from the isles, then the report objective flips it back.
    const questSet = parseQuestSet(readJson('../data/base/quests/round-87-southwest-isle-quests.json'));
    expect(questSet.ok).toBe(true);
    if (!questSet.ok) return;
    const quests = assembleQuests({
      questSet: questSet.set,
      questGiverNpcIds: new Set([PILOT_ID]),
      npcIds: new Set([PILOT_ID, KEEPER_ID]),
      itemIds: new Set(), encounterIds: new Set(), factionIds: new Set(),
      knowledgeNodeIds: references.knowledgeNodeIds,
    });
    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    const placedNpcs = npcRaw.npcs.map(makeNpc);
    const knowledgeTitles = new Map(
      (readJson('../data/base/knowledge_graph/nodes.json') as { nodes: Array<{ id: string; title: string }> }).nodes
        .map(({ id, title }) => [id, title]),
    );
    const navigationInput = {
      quests: quests.quests,
      journal,
      questId: QUEST_ID,
      worldMap: assembled,
      baseNpcs: placedNpcs,
      periodNpcs: placedNpcs,
      encounters: [],
      knowledgeNodeTitles: knowledgeTitles,
    };

    const departure = resolveQuestNavigationTarget(navigationInput);
    expect(departure.status).toBe('target');
    if (departure.status !== 'target') return;
    expect(departure.target.mapResourceId).toBe(ISLE_ID);
    const departureWaypoint = buildQuestObjectiveWaypoint(assembled, ISLES_ID, departure.target)!;
    expect(departureWaypoint.kind).toBe('remote-landmark');
    expect(departureWaypoint.position).toEqual({ col: 5, row: 31 });
    expect(departureWaypoint.nextTransitionName).toBe('西南雾航');
    expect(departureWaypoint.destinationRegionName).toBe('西南列岛·雾航湾');

    applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: ISLE_NODE });
    applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: SIGNAL_NODE });
    const report = resolveQuestNavigationTarget({ ...navigationInput, currentMapResourceId: ISLE_ID });
    expect(report.status).toBe('target');
    if (report.status !== 'target') return;
    expect(report.target.mapResourceId).toBe(ISLES_ID);
    const reportWaypoint = buildQuestObjectiveWaypoint(assembled, ISLE_ID, report.target)!;
    expect(reportWaypoint.kind).toBe('remote-landmark');
    expect(reportWaypoint.position).toEqual({ col: 1, row: 50 });
    expect(reportWaypoint.nextTransitionName).toBe('东北归帆');

    applyQuestSignal(quests.quests, journal, { type: 'npc-talk', npcId: PILOT_ID });
    const settled = resolveQuestNavigationTarget({ ...navigationInput, currentMapResourceId: ISLE_ID });
    expect(settled.status).toBe('no-target');
  });

  it('registers the round resources and closes the knowledge graph references', () => {
    const entries = manifest.resources.filter(({ id }) => id.includes('round-87'));
    expect(entries).toEqual([
      { id: 'map.round-87-southwest-isles', path: 'maps/round-87-southwest-isles.json', schema: 'grid-map' },
      { id: 'npc.round-87-southwest-isles-set', path: 'characters/round-87-southwest-isles-npcs.json', schema: 'npc-set' },
      { id: 'dialogue.round-87-southwest-isle-set', path: 'dialogues/round-87-southwest-isle-conversations.json', schema: 'dialogue-set' },
      { id: 'quest.round-87-southwest-isle-set', path: 'quests/round-87-southwest-isle-quests.json', schema: 'quest-set' },
    ]);
    expect(manifest.resources.some(({ id }) => id === 'world.atlas')).toBe(true);

    const knowledgeNodeIds = new Set(
      (readJson('../data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] }).nodes.map(({ id }) => id),
    );
    const graph = readJson('../data/base/knowledge_graph/edges.json') as {
      edges: { id: string; fromId: string; toId: string }[];
    };
    const newEdges = graph.edges.filter(({ id }) => id.startsWith('kg.edge.r87-'));
    expect(newEdges).toHaveLength(10);
    for (const edge of newEdges) {
      expect(knowledgeNodeIds.has(edge.fromId), `${edge.id} from`).toBe(true);
      expect(knowledgeNodeIds.has(edge.toId), `${edge.id} to`).toBe(true);
    }
    for (const nodeId of [
      ISLE_ID, ISLE_NODE, HARBOR_NODE, SIGNAL_NODE, SPRING_NODE,
      PILOT_ID, KEEPER_ID, QUEST_ID, 'event.r87-arrival', 'event.r87-fog-harbor',
      'event.r87-mist-signal', 'event.r87-spring-hollow',
    ]) {
      expect(knowledgeNodeIds.has(nodeId), nodeId).toBe(true);
    }
  });
});
