import { readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(repoRoot, 'scripts/sources/kenney-roguelike-sample-map.tmx');
const outputPath = resolve(repoRoot, 'data/base/maps/round-01-grid.json');
const tmx = await readFile(inputPath, 'utf8');

function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

const mapTag = tmx.match(/<map\b([^>]*)>/);
if (!mapTag) throw new Error('Tiled source has no <map> root element.');
const mapAttributes = attributes(mapTag[1]);
const columns = Number(mapAttributes.width);
const rows = Number(mapAttributes.height);
const tmxTileSize = Number(mapAttributes.tilewidth);
if (![columns, rows, tmxTileSize].every(Number.isInteger) || columns !== 100 || rows !== 100 || tmxTileSize !== 16) {
  throw new Error(`Expected the documented 100×100 / 16px Tiled sample, got ${columns}×${rows} / ${tmxTileSize}px.`);
}

const layers = [];
for (const match of tmx.matchAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/g)) {
  const layerAttributes = attributes(match[1]);
  const dataMatch = match[2].match(/<data\b([^>]*)>([\s\S]*?)<\/data>/);
  if (!dataMatch) continue;
  const dataAttributes = attributes(dataMatch[1]);
  if (dataAttributes.encoding !== 'base64' || dataAttributes.compression !== 'zlib') {
    throw new Error(`Unsupported encoding in Tiled layer "${layerAttributes.name ?? 'unnamed'}".`);
  }
  const decoded = inflateSync(Buffer.from(dataMatch[2].replace(/\s/g, ''), 'base64'));
  if (decoded.length !== columns * rows * 4) {
    throw new Error(`Tiled layer "${layerAttributes.name}" has ${decoded.length / 4} cells, expected ${columns * rows}.`);
  }
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, col) => decoded.readUInt32LE((row * columns + col) * 4)),
  );
  layers.push({ id: `layer-${layers.length + 1}`, name: layerAttributes.name ?? `Layer ${layers.length + 1}`, cells });
}

if (layers.length < 5) throw new Error(`Expected five art layers, got ${layers.length}.`);
const [groundLayer, groundOverlayLayer, objectLayer] = layers;
if (groundLayer === undefined || groundOverlayLayer === undefined || objectLayer === undefined) {
  throw new Error('Tiled source is missing its ground, overlay, or object layer.');
}

// The supplied map establishes a complete, high-quality village and lake in
// the north-west. Reuse its own roads/buildings to place a second hamlet, then
// connect both settlements through data-authored paths and CC0 forest/water
// sprites so the 100×100 field has distinct regions across its full extent.
const townSource = { left: 17, top: 14, width: 35, height: 30 };
const townDestination = { left: 63, top: 65 };
for (const layer of layers) {
  for (let y = 0; y < townSource.height; y++) {
    for (let x = 0; x < townSource.width; x++) {
      const gid = layer.cells[townSource.top + y]?.[townSource.left + x] ?? 0;
      if (gid === 0) continue;
      const destRow = townDestination.top + y;
      const destCol = townDestination.left + x;
      if (destRow < rows && destCol < columns) layer.cells[destRow][destCol] = gid;
    }
  }
}

const roadCells = new Set();
function addRoadSegment(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    const col = Math.round(from.col + (to.col - from.col) * t);
    const row = Math.round(from.row + (to.row - from.row) * t);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = col + dx;
      const y = row + dy;
      if (x >= 0 && y >= 0 && x < columns && y < rows) roadCells.add(`${x},${y}`);
    }
  }
}
function addRoad(points) {
  for (let index = 1; index < points.length; index++) addRoadSegment(points[index - 1], points[index]);
}
addRoad([{ col: 43, row: 37 }, { col: 59, row: 37 }, { col: 69, row: 44 }, { col: 83, row: 44 }, { col: 90, row: 50 }]);
addRoad([{ col: 43, row: 37 }, { col: 44, row: 51 }, { col: 52, row: 60 }, { col: 65, row: 69 }, { col: 79, row: 79 }]);
addRoad([{ col: 79, row: 79 }, { col: 89, row: 79 }, { col: 94, row: 84 }]);
for (const key of roadCells) {
  const [col, row] = key.split(',').map(Number);
  if ((objectLayer.cells[row][col] ?? 0) === 0) groundOverlayLayer.cells[row][col] = 579;
}

// A broad eastern pond provides a landmark away from the Tiled sample lake.
const pond = { col: 80, row: 25, radiusX: 7, radiusY: 5 };
for (let row = pond.row - pond.radiusY - 1; row <= pond.row + pond.radiusY + 1; row++) {
  for (let col = pond.col - pond.radiusX - 1; col <= pond.col + pond.radiusX + 1; col++) {
    if (col < 0 || row < 0 || col >= columns || row >= rows) continue;
    const edgeDistance = ((col - pond.col) ** 2) / (pond.radiusX ** 2) + ((row - pond.row) ** 2) / (pond.radiusY ** 2);
    if (edgeDistance <= 0.72) groundLayer.cells[row][col] = 61;
    else if (edgeDistance <= 1.18) groundLayer.cells[row][col] = (col + row) % 2 === 0 ? 62 : 60;
  }
}

const forests = [
  { left: 59, top: 5, width: 39, height: 14, density: 31 },
  { left: 59, top: 34, width: 40, height: 19, density: 34 },
  { left: 2, top: 54, width: 23, height: 43, density: 32 },
  { left: 37, top: 57, width: 22, height: 40, density: 28 },
];
for (const forest of forests) {
  for (let row = forest.top; row < Math.min(rows, forest.top + forest.height); row++) {
    for (let col = forest.left; col < Math.min(columns, forest.left + forest.width); col++) {
      const key = `${col},${row}`;
      if (roadCells.has(key) || objectLayer.cells[row][col] !== 0) continue;
      const pondDistance = ((col - pond.col) ** 2) / ((pond.radiusX + 1) ** 2) + ((row - pond.row) ** 2) / ((pond.radiusY + 1) ** 2);
      if (pondDistance <= 1.22) continue;
      const roll = (col * 37 + row * 23 + col * row * 11) % 100;
      if (roll >= forest.density) continue;
      objectLayer.cells[row][col] = roll < forest.density / 3 ? 587 : roll < forest.density * 0.67 ? 644 : 584;
    }
  }
}

// Sparse flowers texture open grass without masking routes, water, or roofs.
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns; col++) {
    const key = `${col},${row}`;
    if (roadCells.has(key) || objectLayer.cells[row][col] !== 0) continue;
    const groundGid = groundLayer.cells[row][col] & 0x0fffffff;
    if (groundGid === 61 || groundGid === 60 || groundGid === 62) continue;
    const roll = (col * 17 + row * 31 + col * row * 7) % 100;
    if (roll < 3) groundOverlayLayer.cells[row][col] = roll === 0 ? 343 : 543;
  }
}

const blockers = new Set(['Objects', 'Doors/windows/roof', 'Roof object']);
const blockingLayers = layers.filter((layer) => blockers.has(layer.name));
if (blockingLayers.length === 0) throw new Error('Tiled source is missing its object layers; refusing to make a walk-through world.');
// In this licensed Tiled pack, these ground GIDs are open water. Shores remain
// walkable; the visual layer is not otherwise used to infer collision.
const waterGids = new Set([1, 2, 58, 59, 61]);

const solidGrid = Array.from({ length: rows }, (_, row) =>
  Array.from({ length: columns }, (_, col) =>
    waterGids.has((layers[0].cells[row][col] ?? 0) & 0x0fffffff) ||
    blockingLayers.some((layer) => (layer.cells[row][col] ?? 0) !== 0),
  ),
);
const preferredStart = { col: 43, row: 37 };
let playerStart = null;
for (let radius = 0; radius < Math.max(columns, rows) && playerStart === null; radius++) {
  for (let row = Math.max(0, preferredStart.row - radius); row <= Math.min(rows - 1, preferredStart.row + radius); row++) {
    for (let col = Math.max(0, preferredStart.col - radius); col <= Math.min(columns - 1, preferredStart.col + radius); col++) {
      if (Math.abs(col - preferredStart.col) !== radius && Math.abs(row - preferredStart.row) !== radius) continue;
      if (!solidGrid[row][col] && (layers[0].cells[row][col] ?? 0) !== 0) {
        playerStart = { col, row };
        break;
      }
    }
    if (playerStart !== null) break;
  }
}
if (playerStart === null) throw new Error('No walkable cell found near the center of the Tiled world.');

const output = {
  id: 'map.round-01-grid',
  name: '江南道·七镇行旅',
  tileSize: 48,
  columns,
  rows,
  tileTypes: {
    '.': { color: '#6eae58', solid: false },
    '#': { color: '#293747', solid: true },
  },
  grid: solidGrid.map((line) => line.map((solid) => solid ? '#' : '.').join('')),
  playerStart,
  art: {
    tileSize: tmxTileSize,
    tilesets: [
      {
        id: 'kenney.roguelike-rpg',
        image: 'assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png',
        tileSize: 16,
        columns: 57,
        rows: 31,
        spacing: 1,
        tileCount: 1767,
      },
      {
        id: 'kenney.tiny-dungeon',
        image: 'assets/kenney/tiny-dungeon/tilemap_packed.png',
        tileSize: 16,
        columns: 12,
        rows: 11,
        spacing: 0,
        tileCount: 132,
      },
    ],
    layers: layers.map((layer, index) => ({
      id: layer.id,
      tilesetId: 'kenney.roguelike-rpg',
      // Round 121: only the object layers (index 2+) occlude actors. Layers
      // 0–1 are ground/ground-overlay (pavement frames included) and must
      // bake into the non-occluding ground channel — a y flag here would draw
      // the floor slice over anyone standing on a walkable pavement cell.
      ...(index >= 2 ? { depthSort: 'y' } : {}),
      cells: layer.cells,
    })),
    actors: {
      tilesetId: 'kenney.tiny-dungeon',
      playerFrame: 85,
      defaultNpcFrame: 86,
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
const openCells = solidGrid.flat().filter((solid) => !solid).length;
console.log(`Imported ${columns}×${rows} Tiled world (${layers.length} visual layers, ${openCells} walkable cells).`);
console.log(`Spawn: (${playerStart.col}, ${playerStart.row}); collision derived from open-water GIDs and ${blockingLayers.map((layer) => layer.name).join(', ')}.`);
