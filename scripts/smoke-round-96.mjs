/**
 * Round 96 smoke: south-sea reef islands and the 3-segment sea route.
 *
 * Verifies from plain Node (no engine build): the committed Round 95 atlas
 * baseline (57 layer hashes + 18 region anchors), the six directed gate
 * endpoints via grid BFS, the 3-segment world route, the declared overlay
 * policy of the new layers, and generator determinism across two runs.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = resolve(root, 'scripts/generate-round96-south-reef.mjs');
const OUTPUT_FILES = [
  'data/base/world/world-map.json',
  'data/base/manifest.json',
  'data/base/knowledge_graph/nodes.json',
  'data/base/knowledge_graph/edges.json',
  'data/base/maps/round-96-stone-reef.json',
  'data/base/maps/round-96-halfmoon-atoll.json',
  'data/base/characters/round-96-south-reef-npcs.json',
  'data/base/dialogues/round-96-south-reef-conversations.json',
  'data/base/quests/round-96-south-reef-quests.json',
];
const SOUTHWEST_ID = 'map.round-87-southwest-isles';
const SOUTH_ID = 'map.round-94-returning-sails';
const STONE_ID = 'map.round-96-stone-reef';
const ATOLL_ID = 'map.round-96-halfmoon-atoll';
const LAND_BACKGROUND = new Set(['world-ocean', 'world-r94-south-shallows']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r87-expanse-water', 'world-r94-south-shallows']);

const readJson = async (relativePath) => JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(`smoke:round-96 ${message}`);
}

function bfsReachable(map) {
  const solids = new Set(['#', '^', '~']);
  const start = map.playerStart;
  const seen = new Set([`${start.col},${start.row}`]);
  const queue = [[start.col, start.row]];
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nextCol = col + dc; const nextRow = row + dr;
      if (nextRow < 0 || nextCol < 0 || nextRow >= map.grid.length || nextCol >= map.grid[0].length) continue;
      if (solids.has(map.grid[nextRow][nextCol])) continue;
      const key = `${nextCol},${nextRow}`;
      if (seen.has(key)) continue;
      seen.add(key); queue.push([nextCol, nextRow]);
    }
  }
  return seen;
}

function routeSegments(world, fromId, toId) {
  const adjacency = new Map();
  for (const transition of world.transitions) {
    if (!adjacency.has(transition.from.mapResourceId)) adjacency.set(transition.from.mapResourceId, []);
    adjacency.get(transition.from.mapResourceId).push(transition.to.mapResourceId);
  }
  const previous = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === toId) break;
    for (const next of adjacency.get(current) ?? []) {
      if (!previous.has(next)) { previous.set(next, current); queue.push(next); }
    }
  }
  if (!previous.has(toId)) return null;
  const path = [];
  for (let node = toId; node !== null; node = previous.get(node)) path.unshift(node);
  return path.length - 1;
}

function checkOverlayPolicy(world) {
  const art = world.atlasArt;
  const newIds = new Set(['world-r96-reef-water', 'world-r96-reef-sand', 'world-r96-reef-land', 'world-r96-reef-lane']);
  const decoded = art.layers.map((layer) => ({ ...layer, cells: layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns) }));
  const prior = decoded.filter(({ id }) => !newIds.has(id));
  for (const layer of decoded) {
    if (!newIds.has(layer.id)) continue;
    const allowed = layer.id === 'world-r96-reef-lane' ? LANE_BACKGROUND : LAND_BACKGROUND;
    for (let row = 0; row < layer.cells.length; row += 1) {
      for (let col = 0; col < layer.cells[row].length; col += 1) {
        if (layer.cells[row][col] === 0) continue;
        for (const old of prior) {
          if (allowed.has(old.id)) continue;
          assert(old.cells[row]?.[col] === 0, `${layer.id} 与 ${old.id} 在 ${col},${row} 交叠（超出公示叠层范围）。`);
        }
      }
    }
  }
  const lane = decoded.find(({ id }) => id === 'world-r96-reef-lane').cells;
  const land = decoded.find(({ id }) => id === 'world-r96-reef-land').cells;
  let overlap = 0;
  for (let row = 0; row < lane.length; row += 1) for (let col = 0; col < lane[row].length; col += 1) {
    if (lane[row][col] !== 0 && land[row][col] !== 0) overlap += 1;
  }
  assert(overlap === 0, `航道层与本期岛陆交叠 ${overlap} 格。`);
}

async function verifyWorld() {
  const world = await readJson('data/base/world/world-map.json');
  const art = world.atlasArt;
  const baseline = await readJson('iterations/round-96/round95-atlas-baseline.json');
  assert(art.columns === 768 && art.rows === 576 && art.tileSize === 8, '舆图尺寸应为 768×576、8px/格。');
  assert(art.layers.length === 61, `舆图层数应为 61，实际 ${art.layers.length}。`);
  assert(world.regions.length === 20, `区域数应为 20，实际 ${world.regions.length}。`);
  assert(world.transitions.length === 42, `关口数应为 42，实际 ${world.transitions.length}。`);
  const layers = new Map(art.layers.map((layer) => [
    layer.id, layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns),
  ]));
  for (const [id, expected] of Object.entries(baseline.layers)) {
    assert(layers.has(id) && sha256(layers.get(id)) === expected, `旧图层 ${id} 哈希漂移。`);
  }
  for (const [id, anchor] of Object.entries(baseline.regions)) {
    const region = world.regions.find((entry) => entry.mapResourceId === id);
    const col = region?.atlasPosition.x / 100 * (art.columns - 1) + 0.5;
    const row = region?.atlasPosition.y / 100 * (art.rows - 1) + 0.5;
    assert(region !== undefined && Math.abs(col - anchor.col) < 0.0001 && Math.abs(row - anchor.row) < 0.0001, `旧区域锚点漂移：${id}。`);
  }
  checkOverlayPolicy(world);

  const maps = new Map();
  for (const id of [SOUTHWEST_ID, SOUTH_ID, STONE_ID, ATOLL_ID]) {
    const map = await readJson(`data/base/maps/${id.slice('map.'.length)}.json`);
    assert(map.id === id, `地图 ${id} 的 id 不匹配。`);
    maps.set(id, map);
  }
  const reach = new Map([...maps].map(([id, map]) => [id, bfsReachable(map)]));
  const gates = world.transitions.filter(({ id }) => id.startsWith('gate.r96-'));
  assert(gates.length === 6, `Round 96 有向关口应为 6 个，实际 ${gates.length}。`);
  for (const gate of gates) {
    assert(reach.get(gate.from.mapResourceId)?.has(`${gate.from.col},${gate.from.row}`), `${gate.id} 出发点不可达。`);
    assert(reach.get(gate.to.mapResourceId)?.has(`${gate.to.col},${gate.to.row}`), `${gate.id} 落点不可达。`);
    assert(gate.from.col !== maps.get(gate.from.mapResourceId).playerStart.col || gate.from.row !== maps.get(gate.from.mapResourceId).playerStart.row, `${gate.id} 出发点与出生点重叠。`);
  }
  const outbound = routeSegments(world, SOUTHWEST_ID, SOUTH_ID);
  const returning = routeSegments(world, SOUTH_ID, SOUTHWEST_ID);
  assert(outbound === 3, `雾航湾→归帆洲应为 3 段，实际 ${outbound}。`);
  assert(returning === 3, `归帆洲→雾航湾应为 3 段，实际 ${returning}。`);
  assert(routeSegments(world, SOUTHWEST_ID, STONE_ID) === 1 && routeSegments(world, STONE_ID, ATOLL_ID) === 1 && routeSegments(world, ATOLL_ID, SOUTH_ID) === 1, '礁岛链各段应为 1 段。');

  for (const npc of (await readJson('data/base/characters/round-96-south-reef-npcs.json')).npcs) {
    assert(npc.schedule.length === 7, `NPC ${npc.id} 日程应为 7 时段。`);
    for (const entry of npc.schedule) {
      assert(reach.get(npc.mapResourceId)?.has(`${entry.position.col},${entry.position.row}`), `NPC ${npc.id} 在 ${entry.periodId} 的位置不可达。`);
    }
  }
  for (const event of world.events.filter(({ id }) => id.startsWith('event.r96-'))) {
    assert(reach.get(event.mapResourceId)?.has(`${event.col},${event.row}`), `事件 ${event.id} 位置不可达。`);
  }
  return world;
}

async function verifyDeterminism() {
  const hashOf = async (relativePath) => createHash('sha256').update(await readFile(resolve(root, relativePath))).digest('hex');
  const before = {};
  for (const file of OUTPUT_FILES) before[file] = await hashOf(file);
  for (let run = 0; run < 2; run += 1) {
    const child = spawnSync(process.execPath, [GENERATOR], { encoding: 'utf8' });
    assert(child.status === 0, `生成器第 ${run + 1} 次运行失败：${child.stderr}`);
  }
  for (const file of OUTPUT_FILES) {
    assert(await hashOf(file) === before[file], `生成器非确定性输出：${file}。`);
  }
}

const world = await verifyWorld();
await verifyDeterminism();
console.log(`smoke:round-96 通过：61 层舆图、20 区域、42 关口（含 6 个 R96 有向关口）、雾航湾⇄归帆洲双向 3 段海路、叠层政策与生成器两遍幂等校验全部通过。`);
