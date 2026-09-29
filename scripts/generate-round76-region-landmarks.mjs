import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maps = [
  { file: 'round-01-grid.json', id: 'map.round-01-grid' },
  { file: 'round-10-mist-ferry.json', id: 'map.round-10-mist-ferry' },
  { file: 'round-62-iron-ridge.json', id: 'map.round-62-iron-ridge' },
  { file: 'round-67-salt-road.json', id: 'map.round-67-salt-road' },
  { file: 'round-74-cloud-ridge.json', id: 'map.round-74-cloud-ridge' },
];

export const ROUND76_TILESET = {
  id: 'opengameart.rpg-town',
  image: 'assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png',
  tileSize: 16,
  columns: 22,
  rows: 18,
  spacing: 0,
  tileCount: 396,
};

const layerSpecs = {
  'map.round-01-grid': {
    id: 'round76-jiangnan-orchard',
    placements: [
      { col: 65, row: 72, gid: 28, terrain: '#' },
      { col: 65, row: 78, gid: 30, terrain: '#' },
      { col: 75, row: 76, gid: 113, terrain: '.' },
      { col: 76, row: 78, gid: 183, terrain: '.' },
    ],
  },
  'map.round-10-mist-ferry': {
    id: 'round76-mist-river-market',
    placements: [
      { col: 63, row: 63, gid: 185, terrain: '#' },
      { col: 64, row: 63, gid: 186, terrain: '#' },
      { col: 61, row: 62, gid: 23, terrain: '#' },
      { col: 66, row: 62, gid: 24, terrain: '#' },
      { col: 62, row: 67, gid: 183, terrain: '.' },
    ],
  },
  'map.round-62-iron-ridge': {
    id: 'round76-iron-ridge-pass',
    placements: [
      { col: 54, row: 49, gid: 28, terrain: '#' },
      { col: 48, row: 52, gid: 29, terrain: '#' },
      { col: 32, row: 30, gid: 182, terrain: '.' },
      { col: 55, row: 52, gid: 184, terrain: '.' },
    ],
  },
  'map.round-67-salt-road': {
    id: 'round76-salt-well-and-post',
    placements: [
      { col: 27, row: 28, gid: 108, terrain: '.' },
      { col: 25, row: 31, gid: 183, terrain: '.' },
      { col: 50, row: 46, gid: 185, terrain: '#' },
      { col: 53, row: 48, gid: 186, terrain: '#' },
      { col: 28, row: 31, gid: 184, terrain: '.' },
    ],
  },
  'map.round-74-cloud-ridge': {
    id: 'round76-cloud-bridge-rails',
    placements: [
      { col: 71, row: 41, gid: 23, terrain: '.' },
      { col: 78, row: 41, gid: 24, terrain: '.' },
      { col: 71, row: 43, gid: 25, terrain: '.' },
      { col: 78, row: 43, gid: 26, terrain: '.' },
      { col: 71, row: 40, gid: 29, terrain: '#' },
      { col: 26, row: 29, gid: 182, terrain: '.' },
    ],
  },
};

const cellKey = (col, row) => `${col},${row}`;

export function buildRound76Layer(map, protectedCells = new Set()) {
  const spec = layerSpecs[map.id];
  if (spec === undefined) throw new Error(`Round 76 未登记地图 ${map.id}`);
  const cells = Array.from({ length: map.rows }, () => Array(map.columns).fill(0));
  for (const placement of spec.placements) {
    const { col, row, gid, terrain } = placement;
    if (col < 0 || row < 0 || col >= map.columns || row >= map.rows) {
      throw new Error(`${map.id} 图素坐标越界：${cellKey(col, row)}`);
    }
    if (map.grid[row]?.[col] !== terrain) {
      throw new Error(`${map.id} 图素 ${gid} 的地形锚点意外变化：${cellKey(col, row)}`);
    }
    if (protectedCells.has(cellKey(col, row))) {
      throw new Error(`${map.id} 图素 ${gid} 会覆盖玩法锚点：${cellKey(col, row)}`);
    }
    if (gid < 1 || gid > ROUND76_TILESET.tileCount || gid >= 345) {
      throw new Error(`${map.id} 图素帧超出可用环境图素：${gid}`);
    }
    if (cells[row][col] !== 0) throw new Error(`${map.id} 存在重叠图素：${cellKey(col, row)}`);
    cells[row][col] = gid;
  }
  return { id: spec.id, tilesetId: ROUND76_TILESET.id, cells };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function collectProtectedCells() {
  const protectedByMap = new Map(maps.map(({ id }) => [id, new Set()]));
  const add = (mapId, point) => {
    if (mapId === undefined || point === undefined || !protectedByMap.has(mapId)) return;
    if (Number.isInteger(point.col) && Number.isInteger(point.row)) {
      protectedByMap.get(mapId).add(cellKey(point.col, point.row));
    }
  };

  const [world, manifest] = await Promise.all([
    readJson(resolve(repoRoot, 'data/base/world/world-map.json')),
    readJson(resolve(repoRoot, 'data/base/manifest.json')),
  ]);
  for (const item of [...(world.landmarks ?? []), ...(world.events ?? [])]) {
    add(item.mapResourceId, item);
  }
  for (const transition of world.transitions ?? []) {
    add(transition.from?.mapResourceId, transition.from);
    add(transition.to?.mapResourceId, transition.to);
  }
  for (const { id, file } of maps) {
    const map = await readJson(resolve(repoRoot, 'data/base/maps', file));
    add(id, map.playerStart);
  }

  for (const resource of manifest.resources ?? []) {
    if (resource.schema !== 'npc-set' && resource.schema !== 'battle-encounters') continue;
    const data = await readJson(resolve(repoRoot, 'data/base', resource.path));
    for (const npc of data.npcs ?? []) {
      add(npc.mapResourceId, npc.position);
      for (const entry of npc.schedule ?? []) add(npc.mapResourceId, entry.position);
    }
    for (const encounter of data.encounters ?? []) add(encounter.mapResourceId, encounter.position);
  }
  return protectedByMap;
}

async function run() {
  const protectedByMap = await collectProtectedCells();
  let placed = 0;
  for (const { id, file } of maps) {
    const filePath = resolve(repoRoot, 'data/base/maps', file);
    const map = await readJson(filePath);
    if (map.id !== id || map.columns !== 100 || map.rows !== 100 || map.grid?.length !== 100) {
      throw new Error(`${file} 不再是计划中的 100×100 区域地图`);
    }
    if (map.art?.tileSize !== ROUND76_TILESET.tileSize || !Array.isArray(map.art.layers)) {
      throw new Error(`${file} 缺少 Round 76 预期的地图图层协议`);
    }

    const frozen = JSON.stringify({
      id: map.id,
      name: map.name,
      columns: map.columns,
      rows: map.rows,
      tileSize: map.tileSize,
      tileTypes: map.tileTypes,
      grid: map.grid,
      playerStart: map.playerStart,
      originalLayers: map.art.layers.filter((layer) => !layer.id.startsWith('round76-')),
    });
    const declared = map.art.tilesets.filter((tileset) => tileset.id === ROUND76_TILESET.id);
    if (declared.length > 1) throw new Error(`${file} 重复声明 Round 76 图集`);
    if (declared.length === 1 && JSON.stringify(declared[0]) !== JSON.stringify(ROUND76_TILESET)) {
      throw new Error(`${file} 的 Round 76 图集规格与实际 PNG 不符`);
    }
    if (declared.length === 0) map.art.tilesets.push({ ...ROUND76_TILESET });
    map.art.layers = map.art.layers.filter((layer) => !layer.id.startsWith('round76-'));
    const layer = buildRound76Layer(map, protectedByMap.get(id));
    map.art.layers.push(layer);
    if (JSON.stringify({
      id: map.id,
      name: map.name,
      columns: map.columns,
      rows: map.rows,
      tileSize: map.tileSize,
      tileTypes: map.tileTypes,
      grid: map.grid,
      playerStart: map.playerStart,
      originalLayers: map.art.layers.filter((entry) => entry.id !== layer.id),
    }) !== frozen) {
      throw new Error(`${file} 的碰撞、出生点或旧图层被意外修改`);
    }
    placed += layer.cells.flat().filter((gid) => gid !== 0).length;
    await writeFile(filePath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  }
  console.log(`Round 76 已更新 ${maps.length} 张 100×100 地图，写入 ${placed} 个可重复生成的环境图素。`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
