import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = resolve(repoRoot, 'data/base/world/world-map.json');
const manifestPath = resolve(repoRoot, 'data/base/manifest.json');
const atlas = { columns: 176, rows: 112, tileSize: 16 };

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const [world, manifest] = await Promise.all([readJson(worldPath), readJson(manifestPath)]);
if (!Array.isArray(world.regions) || world.regions.length < 2) throw new Error('世界地图必须至少声明两个区域。');
if (!Array.isArray(world.transitions)) throw new Error('世界地图缺少关口数据，拒绝生成无法导航的总图。');

const mapsById = new Map();
for (const resource of manifest.resources ?? []) {
  if (resource.schema !== 'grid-map') continue;
  mapsById.set(resource.id, await readJson(resolve(repoRoot, 'data/base', resource.path)));
}
for (const region of world.regions) {
  const map = mapsById.get(region.mapResourceId);
  if (map === undefined) throw new Error('区域引用了不存在的地图资源：' + region.mapResourceId);
  if (!map.art?.tilesets?.some((tileset) => tileset.id === 'kenney.roguelike-rpg')) {
    throw new Error('区域地图未声明 Kenney Roguelike 授权图集：' + region.mapResourceId);
  }
}

const sourceMap = mapsById.get(world.startingMapResourceId);
const baseTileset = sourceMap?.art?.tilesets?.find((tileset) => tileset.id === 'kenney.roguelike-rpg');
if (baseTileset === undefined) throw new Error('起始地图未声明 kenney.roguelike-rpg 图集。');

// The official Tiny Town packed PNG is 192x176: twelve columns and eleven
// rows of 16px tiles, with no spacing. Its original CC0 notice ships beside it.
const townTileset = {
  id: 'kenney.tiny-town',
  image: 'assets/kenney/tiny-town/tilemap_packed.png',
  tileSize: 16,
  columns: 12,
  rows: 11,
  spacing: 0,
  tileCount: 132,
};
const paletteTileset = {
  id: 'wuxia.world-palette',
  image: 'assets/generated/world-palette.png',
  tileSize: 16,
  columns: 8,
  rows: 1,
  spacing: 0,
  tileCount: 8,
};
const paletteFrames = { water: 1, grass: 2, wetland: 3, rock: 4, salt: 5, shore: 6, forest: 7 };
const paletteColors = [
  [76, 180, 192, 255], // water
  [126, 184, 78, 255], // lowland
  [111, 157, 103, 255], // wetland
  [138, 151, 164, 255], // ridge
  [211, 194, 147, 255], // salt flats
  [224, 192, 119, 255], // shore
  [70, 128, 84, 255], // forest canopy
  [43, 75, 91, 255],
];
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
};
async function writePalettePng(path) {
  const width = paletteTileset.columns * paletteTileset.tileSize;
  const height = paletteTileset.tileSize;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) row.set(paletteColors[Math.floor(x / paletteTileset.tileSize)], 1 + x * 4);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

const hash = (x, y, salt = 0) => {
  let value = Math.imul(x + 101, 0x45d9f3b) ^ Math.imul(y + 307, 0x119de1f3) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};
const pick = (items, x, y, salt) => items[hash(x, y, salt) % items.length];
const inside = (col, row) => col >= 0 && row >= 0 && col < atlas.columns && row < atlas.rows;
const blankLayer = () => Array.from({ length: atlas.rows }, () => Array(atlas.columns).fill(0));
const ocean = blankLayer();
const land = blankLayer();
const coast = blankLayer();
const forest = blankLayer();
const relief = blankLayer();
const roads = blankLayer();
const settlements = blankLayer();

const pointInPolygon = (x, y, points) => {
  let insidePolygon = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      insidePolygon = !insidePolygon;
    }
  }
  return insidePolygon;
};

// An authored, broad mainland gives the atlas a continental silhouette. The
// shape has two large bays and several capes; its outline is intentionally
// stable instead of being buried under per-cell random terrain noise.
const mainland = [
  [15, 8], [31, 5], [48, 8], [61, 6], [77, 12], [91, 10], [103, 7], [121, 9],
  [136, 12], [152, 14], [166, 22], [171, 34], [165, 44], [170, 54], [166, 64],
  [172, 76], [165, 87], [161, 99], [145, 105], [128, 101], [114, 107], [98, 101],
  [82, 105], [67, 98], [54, 102], [40, 94], [26, 98], [13, 88], [16, 77],
  [8, 68], [12, 55], [6, 44], [11, 31], [7, 21],
];
const islands = [
  { x: 23, y: 18, rx: 5, ry: 3 },
  { x: 157, y: 51, rx: 4, ry: 6 },
  { x: 84, y: 97, rx: 5, ry: 2 },
];
const onLandShape = (col, row) => {
  const x = col + 0.5;
  const y = row + 0.5;
  return pointInPolygon(x, y, mainland) || islands.some((island) => {
    const dx = (x - island.x) / island.rx;
    const dy = (y - island.y) / island.ry;
    return dx * dx + dy * dy <= 1;
  });
};

const centers = world.regions.map((region) => ({
  id: region.mapResourceId,
  x: region.atlasPosition.x / 100 * (atlas.columns - 1),
  y: region.atlasPosition.y / 100 * (atlas.rows - 1),
}));
const biomes = [
  {
    frame: paletteFrames.rock,
    points: [[81, 10], [97, 10], [106, 7], [122, 10], [139, 12], [155, 16], [168, 25], [171, 36], [164, 46], [154, 51], [143, 47], [134, 43], [123, 48], [113, 42], [103, 45], [94, 36], [85, 29]],
  },
  {
    frame: paletteFrames.wetland,
    points: [[110, 54], [122, 49], [135, 53], [147, 54], [160, 62], [168, 72], [166, 83], [157, 92], [144, 96], [132, 91], [121, 95], [111, 86], [104, 75], [108, 65]],
  },
  {
    frame: paletteFrames.salt,
    points: [[9, 61], [18, 55], [29, 56], [38, 59], [47, 64], [53, 71], [52, 82], [45, 91], [35, 97], [23, 94], [13, 88], [9, 78], [12, 69]],
  },
];
const groundFrame = (col, row) => {
  for (const biome of biomes) {
    if (pointInPolygon(col + 0.5, row + 0.5, biome.points)) return biome.frame;
  }
  return paletteFrames.grass;
};

function projectRegionCell(region, map, point) {
  const centerX = region.atlasPosition.x / 100 * (atlas.columns - 1);
  const centerY = region.atlasPosition.y / 100 * (atlas.rows - 1);
  const u = (point.col + 0.5) / map.columns - 0.5;
  const v = (point.row + 0.5) / map.rows - 0.5;
  return {
    col: Math.round(centerX + u * atlas.columns * 0.16),
    row: Math.round(centerY + v * atlas.rows * 0.16),
  };
}

// Protect every visible region pin, gate endpoint, and landmark projection.
// Hidden discoveries still receive no name or explicit marker in baked art.
const protectedCells = new Set();
const protect = (col, row, radius = 1) => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (inside(col + dx, row + dy)) protectedCells.add((col + dx) + ',' + (row + dy));
    }
  }
};
for (const region of world.regions) {
  protect(
    Math.round(region.atlasPosition.x / 100 * (atlas.columns - 1)),
    Math.round(region.atlasPosition.y / 100 * (atlas.rows - 1)),
    2,
  );
}
const projectedEndpoints = [];
for (const transition of world.transitions) {
  for (const endpoint of [transition.from, transition.to]) {
    const region = world.regions.find((candidate) => candidate.mapResourceId === endpoint.mapResourceId);
    const map = mapsById.get(endpoint.mapResourceId);
    if (region === undefined || map === undefined) throw new Error('关口引用了未登记区域：' + transition.id);
    const cell = projectRegionCell(region, map, endpoint);
    projectedEndpoints.push(cell);
    protect(cell.col, cell.row, 1);
  }
}
for (const landmark of world.landmarks ?? []) {
  const region = world.regions.find((candidate) => candidate.mapResourceId === landmark.mapResourceId);
  const map = mapsById.get(landmark.mapResourceId);
  if (region === undefined || map === undefined) continue;
  const cell = projectRegionCell(region, map, landmark);
  protect(cell.col, cell.row, 1);
}

// Ocean first, then broad authored biome shapes. The generated palette tiles
// stay readable when 16px map cells shrink to a few pixels in the overview.
for (let row = 0; row < atlas.rows; row++) {
  for (let col = 0; col < atlas.columns; col++) {
    ocean[row][col] = paletteFrames.water;
    if (!onLandShape(col, row)) continue;
    land[row][col] = groundFrame(col, row);
  }
}

// A single broad river descends from the northern ridge, bends through the
// middle country, and reaches the southern sea. A protected gate or pin wins.
const roadCells = new Set();
const riverCells = new Set();
function carveRiver(points, radius = 1) {
  for (let segment = 0; segment < points.length - 1; segment++) {
    const from = points[segment];
    const to = points[segment + 1];
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) * 2;
    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps;
      const col = Math.round(from[0] + (to[0] - from[0]) * t);
      const row = Math.round(from[1] + (to[1] - from[1]) * t);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = col + dx;
          const y = row + dy;
          const key = x + ',' + y;
          if (!inside(x, y) || land[y][x] === 0 || protectedCells.has(key)) continue;
          land[y][x] = paletteFrames.water;
          riverCells.add(key);
          relief[y][x] = 0;
        }
      }
    }
  }
}
carveRiver([[124, 13], [120, 28], [109, 40], [103, 53], [99, 65], [106, 78], [115, 91], [119, 106]]);

for (let row = 0; row < atlas.rows; row++) {
  for (let col = 0; col < atlas.columns; col++) {
    if (land[row][col] === 0 || land[row][col] === paletteFrames.water || riverCells.has(col + ',' + row)) continue;
    const touchesSea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      !inside(col + dx, row + dy) || land[row + dy]?.[col + dx] === 0,
    );
    if (touchesSea) coast[row][col] = paletteFrames.shore;
  }
}

const forestPatches = [
  { x: 25, y: 32, rx: 15, ry: 10, salt: 0x701 },
  { x: 57, y: 44, rx: 13, ry: 8, salt: 0x702 },
  { x: 61, y: 76, rx: 12, ry: 10, salt: 0x703 },
  { x: 146, y: 69, rx: 11, ry: 10, salt: 0x704 },
  { x: 120, y: 27, rx: 8, ry: 11, salt: 0x705 },
];
const groveFrames = [5, 6, 17, 20, 29, 31];
for (let row = 0; row < atlas.rows; row++) {
  for (let col = 0; col < atlas.columns; col++) {
    if (land[row][col] === 0 || land[row][col] === paletteFrames.water) continue;
    const key = col + ',' + row;
    if (protectedCells.has(key)) continue;
    const patch = forestPatches.find((candidate) => {
      const dx = (col - candidate.x) / candidate.rx;
      const dy = (row - candidate.y) / candidate.ry;
      return dx * dx + dy * dy <= 1;
    });
    if (patch === undefined || roadCells.has(key)) continue;
    forest[row][col] = paletteFrames.forest;
    const grove = hash(Math.floor(col / 4), Math.floor(row / 3), patch.salt) % 100 < 42;
    const tree = hash(col, row, patch.salt + 1) % 100 < 18;
    if (grove && tree) relief[row][col] = pick(groveFrames, col, row, patch.salt + 2);
  }
}

function addRoad(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * t);
    const row = Math.round(from.row + (to.row - from.row) * t);
    if (inside(col, row)) roadCells.add(col + ',' + row);
  }
}
const seenRoutes = new Set();
for (const transition of world.transitions) {
  const fromRegion = world.regions.find((region) => region.mapResourceId === transition.from.mapResourceId);
  const toRegion = world.regions.find((region) => region.mapResourceId === transition.to.mapResourceId);
  const fromMap = mapsById.get(transition.from.mapResourceId);
  const toMap = mapsById.get(transition.to.mapResourceId);
  if (fromRegion === undefined || toRegion === undefined || fromMap === undefined || toMap === undefined) {
    throw new Error('关口引用了未登记区域：' + transition.id);
  }
  const from = projectRegionCell(fromRegion, fromMap, transition.from);
  const to = projectRegionCell(toRegion, toMap, transition.to);
  const key = [from.col + ',' + from.row, to.col + ',' + to.row].sort().join('|');
  if (seenRoutes.has(key)) continue;
  seenRoutes.add(key);
  addRoad(from, to);
}
const trailFrames = [576, 577, 578, 579];
for (const key of roadCells) {
  const [col, row] = key.split(',').map(Number);
  if (land[row]?.[col] === undefined || land[row][col] === 0 || land[row][col] === paletteFrames.water) continue;
  roads[row][col] = pick(trailFrames, col, row, 0x706);
  relief[row][col] = 0;
}

// Tiny Town's standalone trees, cart, and signpost make each regional hub
// recognizable without composing cropped building-wall tiles into fake houses.
const townFeatures = {
  trees: [5, 6, 17, 20, 29, 31],
  cart: 58,
  signpost: 84,
};
const settlementOffsets = [
  [-5, -4, townFeatures.trees[0]], [-4, -5, townFeatures.trees[1]],
  [4, -4, townFeatures.cart], [5, -3, townFeatures.signpost],
  [-5, 4, townFeatures.trees[2]], [4, 5, townFeatures.trees[3]],
];
for (const center of centers) {
  const col = Math.round(center.x);
  const row = Math.round(center.y);
  for (const [dx, dy, gid] of settlementOffsets) {
    const x = col + dx;
    const y = row + dy;
    const key = x + ',' + y;
    if (!inside(x, y) || land[y][x] === 0 || land[y][x] === paletteFrames.water) continue;
    if (protectedCells.has(key) || roads[y][x] !== 0) continue;
    settlements[y][x] = gid;
  }
}

const atlasArt = {
  ...atlas,
  tilesets: [baseTileset, townTileset, paletteTileset],
  layers: [
    { id: 'world-ocean', tilesetId: paletteTileset.id, cells: ocean },
    { id: 'world-land', tilesetId: paletteTileset.id, cells: land },
    { id: 'world-coast', tilesetId: paletteTileset.id, cells: coast },
    { id: 'world-forest', tilesetId: paletteTileset.id, cells: forest },
    { id: 'world-relief', tilesetId: townTileset.id, cells: relief },
    { id: 'world-roads', tilesetId: baseTileset.id, cells: roads },
    { id: 'world-settlements', tilesetId: townTileset.id, cells: settlements },
  ],
};

for (const region of world.regions) {
  const col = Math.round(region.atlasPosition.x / 100 * (atlas.columns - 1));
  const row = Math.round(region.atlasPosition.y / 100 * (atlas.rows - 1));
  if (!inside(col, row) || land[row]?.[col] === 0 || land[row]?.[col] === paletteFrames.water) {
    throw new Error('区域锚点不在陆地内：' + region.mapResourceId + ' (' + col + ', ' + row + ')');
  }
}
for (const cell of projectedEndpoints) {
  if (land[cell.row]?.[cell.col] === 0 || land[cell.row]?.[cell.col] === paletteFrames.water) {
    throw new Error('关口端点投影落在水面或图外：(' + cell.col + ', ' + cell.row + ')');
  }
}
for (const key of protectedCells) {
  const [col, row] = key.split(',').map(Number);
  if (settlements[row]?.[col] > 0) throw new Error('聚落图素覆盖受保护锚点/地标格：' + key);
}

const tilesetsById = new Map(atlasArt.tilesets.map((tileset) => [tileset.id, tileset]));
let landCells = 0;
let treeCells = 0;
let roadCount = 0;
let settlementCells = 0;
for (const layer of atlasArt.layers) {
  if (layer.cells.length !== atlas.rows || layer.cells.some((line) => line.length !== atlas.columns)) {
    throw new Error('图层网格尺寸错误：' + layer.id);
  }
  const tileset = tilesetsById.get(layer.tilesetId);
  if (tileset === undefined) throw new Error('图层缺少图集声明：' + layer.id);
  if (layer.cells.some((line) => line.some((gid) => (gid & 0x0fffffff) > tileset.tileCount))) {
    throw new Error('图层含超出图集范围的帧：' + layer.id);
  }
  if (layer.id === 'world-land') landCells = layer.cells.flat().filter((gid) => gid > 0 && gid !== paletteFrames.water).length;
  if (layer.id === 'world-relief') treeCells = layer.cells.flat().filter((gid) => gid > 0).length;
  if (layer.id === 'world-roads') roadCount = layer.cells.flat().filter((gid) => gid > 0).length;
  if (layer.id === 'world-settlements') settlementCells = layer.cells.flat().filter((gid) => gid > 0).length;
}
if (landCells < 7_500) throw new Error('大陆覆盖不足：' + landCells + ' 格');
if (treeCells < 80) throw new Error('自然地貌图层不足：' + treeCells + ' 格');
if (roadCount < 100) throw new Error('关口路线未充分投影：' + roadCount + ' 格');
if (settlementCells < centers.length * 3) throw new Error('Tiny Town 聚落标记不足：' + settlementCells + ' 格');

world.atlasArt = atlasArt;
await writePalettePng(resolve(repoRoot, 'data/' + paletteTileset.image));
await writeFile(worldPath, JSON.stringify(world, null, 2) + '\n');
console.log('Generated ' + atlas.columns + 'x' + atlas.rows + ' continental atlas (' + landCells + ' land, ' + treeCells + ' grove, ' + roadCount + ' route and ' + settlementCells + ' Tiny Town cells).');
