/**
 * Round 97 smoke: east-mid-sea lanes and the Lanxin Isle / Pilot Reef relay.
 *
 * Verifies from plain Node (no engine build): the committed Round 96 atlas
 * baseline (61 layer hashes + 20 region anchors), the eight directed gate
 * endpoints via grid BFS (three of them on the old Windward/Tide/East maps),
 * the 3-segment world route, the declared overlay policy plus the lane
 * shoreline audit, NPC schedules, and generator determinism across two runs —
 * backed by a full data/base + iterations/round-97 JSON snapshot proving the
 * generator touches nothing beyond its managed outputs.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeAtlasCells } from './lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = resolve(root, 'scripts/generate-round97-lanxin-isle.mjs');
const OUTPUT_FILES = [
  'data/base/world/world-map.json',
  'data/base/manifest.json',
  'data/base/knowledge_graph/nodes.json',
  'data/base/knowledge_graph/edges.json',
  'data/base/maps/round-97-lanxin-isle.json',
  'data/base/maps/round-97-pilot-reef.json',
  'data/base/characters/round-97-lanxin-reef-npcs.json',
  'data/base/dialogues/round-97-lanxin-reef-conversations.json',
  'data/base/quests/round-97-lanxin-reef-quests.json',
];
const WINDWARD_ID = 'map.round-84-windward-isle';
const TIDE_ID = 'map.round-85-tide-isle';
const EAST_ID = 'map.round-94-east-gate';
const LANXIN_ID = 'map.round-97-lanxin-isle';
const PILOT_ID = 'map.round-97-pilot-reef';
const LAND_BACKGROUND = new Set(['world-ocean']);
const LANE_BACKGROUND = new Set(['world-ocean', 'world-r84-expanse-water', 'world-r85-expanse-water']);
const SHORELINE_TESTS = [
  { label: '风回岛', point: [383, 132], layerIds: ['world-r84-expanse-sand', 'world-r84-expanse-land'] },
  { label: '澜心洲西岸', point: [433, 180], layerIds: ['world-r97-lanxin-land'] },
  { label: '潮生屿', point: [432, 280], layerIds: ['world-r85-expanse-sand', 'world-r85-expanse-land'] },
  { label: '澜心洲南岸', point: [451, 220], layerIds: ['world-r97-lanxin-land'] },
  { label: '澜心洲东北岸', point: [498, 154], layerIds: ['world-r97-lanxin-land'] },
  { label: '引航礁西岸', point: [510, 131], layerIds: ['world-r97-lanxin-land'] },
  { label: '引航礁南岸', point: [520, 133], layerIds: ['world-r97-lanxin-land'] },
  { label: '天门关海岸', point: [682, 134], layerIds: ['world-r94-east-snow', 'world-r95-eastland'] },
];

const readJson = async (relativePath) => JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
const sha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(`smoke:round-97 ${message}`);
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
  const newIds = new Set(['world-r97-lanxin-water', 'world-r97-lanxin-sand', 'world-r97-lanxin-land', 'world-r97-lanxin-lane']);
  const decoded = art.layers.map((layer) => ({ ...layer, cells: layer.cells ?? decodeAtlasCells(layer.cellsRle, art.rows, art.columns) }));
  const prior = decoded.filter(({ id }) => !newIds.has(id));
  for (const layer of decoded) {
    if (!newIds.has(layer.id)) continue;
    const allowed = layer.id === 'world-r97-lanxin-lane' ? LANE_BACKGROUND : LAND_BACKGROUND;
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
  const lane = decoded.find(({ id }) => id === 'world-r97-lanxin-lane').cells;
  const land = decoded.find(({ id }) => id === 'world-r97-lanxin-land').cells;
  let overlap = 0;
  for (let row = 0; row < lane.length; row += 1) for (let col = 0; col < lane[row].length; col += 1) {
    if (lane[row][col] !== 0 && land[row][col] !== 0) overlap += 1;
  }
  assert(overlap === 0, `海路穿过本轮岛陆 ${overlap} 格。`);

  const allLayers = [...prior, ...decoded.filter(({ id }) => newIds.has(id))];
  for (const { label, point, layerIds } of SHORELINE_TESTS) {
    const shoreLayers = allLayers.filter((layer) => layerIds.includes(layer.id));
    assert(shoreLayers.length > 0, `${label}岸线参考层缺失。`);
    let nearest = Infinity;
    for (const layer of shoreLayers) {
      for (let row = Math.max(0, point[1] - 6); row <= Math.min(art.rows - 1, point[1] + 6); row += 1) {
        for (let col = Math.max(0, point[0] - 6); col <= Math.min(art.columns - 1, point[0] + 6); col += 1) {
          if (layer.cells[row]?.[col] === 0) continue;
          nearest = Math.min(nearest, Math.hypot(col - point[0], row - point[1]));
        }
      }
    }
    assert(nearest <= 6, `海路端点未接近${label}岸线：最近距离 ${nearest} 格。`);
  }
}

async function verifyWorld() {
  const world = await readJson('data/base/world/world-map.json');
  const art = world.atlasArt;
  const baseline = await readJson('iterations/round-97/round96-atlas-baseline.json');
  assert(art.columns === 768 && art.rows === 576 && art.tileSize === 8, '舆图尺寸应为 768×576、8px/格。');
  assert(art.layers.length === 65, `舆图层数应为 65，实际 ${art.layers.length}。`);
  assert(world.regions.length === 22, `区域数应为 22，实际 ${world.regions.length}。`);
  assert(world.transitions.length === 50, `关口数应为 50，实际 ${world.transitions.length}。`);
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
  for (const [id, { col, row }] of [[LANXIN_ID, { col: 480.5, row: 190.5 }], [PILOT_ID, { col: 520.5, row: 110.5 }]]) {
    const region = world.regions.find((entry) => entry.mapResourceId === id);
    const projectedCol = region?.atlasPosition.x / 100 * (art.columns - 1) + 0.5;
    const projectedRow = region?.atlasPosition.y / 100 * (art.rows - 1) + 0.5;
    assert(region !== undefined && Math.abs(projectedCol - col) < 0.0001 && Math.abs(projectedRow - row) < 0.0001, `新区域锚点漂移：${id}。`);
  }
  checkOverlayPolicy(world);

  const maps = new Map();
  for (const id of [WINDWARD_ID, TIDE_ID, EAST_ID, LANXIN_ID, PILOT_ID]) {
    const map = await readJson(`data/base/maps/${id.slice('map.'.length)}.json`);
    assert(map.id === id, `地图 ${id} 的 id 不匹配。`);
    maps.set(id, map);
  }
  const reach = new Map([...maps].map(([id, map]) => [id, bfsReachable(map)]));
  const gates = world.transitions.filter(({ id }) => id.startsWith('gate.r97-'));
  assert(gates.length === 8, `Round 97 有向关口应为 8 个，实际 ${gates.length}。`);
  for (const gate of gates) {
    assert(reach.get(gate.from.mapResourceId)?.has(`${gate.from.col},${gate.from.row}`), `${gate.id} 出发点不可达。`);
    assert(reach.get(gate.to.mapResourceId)?.has(`${gate.to.col},${gate.to.row}`), `${gate.id} 落点不可达。`);
    assert(gate.from.col !== maps.get(gate.from.mapResourceId).playerStart.col || gate.from.row !== maps.get(gate.from.mapResourceId).playerStart.row, `${gate.id} 出发点与出生点重叠。`);
  }
  const outbound = routeSegments(world, EAST_ID, TIDE_ID);
  const returning = routeSegments(world, TIDE_ID, EAST_ID);
  assert(outbound === 3, `天门关→潮生屿应为 3 段，实际 ${outbound}。`);
  assert(returning === 3, `潮生屿→天门关应为 3 段，实际 ${returning}。`);
  assert(routeSegments(world, WINDWARD_ID, LANXIN_ID) === 1 && routeSegments(world, TIDE_ID, LANXIN_ID) === 1 && routeSegments(world, LANXIN_ID, PILOT_ID) === 1 && routeSegments(world, PILOT_ID, EAST_ID) === 1, '风回—澜心—引航—天门各段应为 1 段。');

  for (const npc of (await readJson('data/base/characters/round-97-lanxin-reef-npcs.json')).npcs) {
    assert(npc.schedule.length === 7, `NPC ${npc.id} 日程应为 7 时段。`);
    for (const entry of npc.schedule) {
      assert(reach.get(npc.mapResourceId)?.has(`${entry.position.col},${entry.position.row}`), `NPC ${npc.id} 在 ${entry.periodId} 的位置不可达。`);
    }
  }
  for (const event of world.events.filter(({ id }) => id.startsWith('event.r97-'))) {
    assert(reach.get(event.mapResourceId)?.has(`${event.col},${event.row}`), `事件 ${event.id} 位置不可达。`);
  }
  return world;
}

/** Hashes every JSON under the snapshot roots so any stray write outside the managed outputs is caught. */
async function snapshotJsonFiles() {
  const snapshotRoots = ['data/base', 'iterations/round-97'];
  const hashes = new Map();
  for (const snapshotRoot of snapshotRoots) {
    const entries = await readdir(resolve(root, snapshotRoot), { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => relative(resolve(root, snapshotRoot), join(entry.parentPath ?? entry.path, entry.name)))
      .sort();
    for (const file of files) {
      hashes.set(`${snapshotRoot}/${file.replaceAll('\\', '/')}`, createHash('sha256').update(await readFile(resolve(root, snapshotRoot, file))).digest('hex'));
    }
  }
  return hashes;
}

async function verifyDeterminism() {
  const before = await snapshotJsonFiles();
  for (const file of OUTPUT_FILES) assert(before.has(file), `快照缺少生成器管理输出：${file}。`);
  for (let run = 0; run < 2; run += 1) {
    const child = spawnSync(process.execPath, [GENERATOR], { encoding: 'utf8' });
    assert(child.status === 0, `生成器第 ${run + 1} 次运行失败：${child.stderr}`);
  }
  const after = await snapshotJsonFiles();
  assert(after.size === before.size, `快照文件数变化：${before.size} → ${after.size}。`);
  const drifted = [...before.entries()].filter(([file, hash]) => after.get(file) !== hash).map(([file]) => file);
  assert(drifted.length === 0, `两遍生成后文件漂移：${drifted.join('、')}。`);
  return after.size;
}

const world = await verifyWorld();
const snapshotCount = await verifyDeterminism();
console.log(`smoke:round-97 通过：65 层舆图（61 层 R96 基线逐格哈希不变）、22 区域、50 关口（含 8 个 R97 有向关口）、天门关⇄潮生屿双向 3 段海路、8 处岸线接驳、叠层政策与生成器两遍幂等校验全部通过；${snapshotCount} 个 JSON 快照证实仅管理输出被写入。`);
