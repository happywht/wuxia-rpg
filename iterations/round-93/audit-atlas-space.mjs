// Round 93 候选区域占用审计：解码全部舆图图层，检查候选中心周围的
// 旧像素占用、旧区域投影与雁回崖/照雪关地貌的实际分布。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAtlasCells } from '../../scripts/lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const world = JSON.parse(readFileSync(resolve(root, 'data/base/world/world-map.json'), 'utf8'));
const atlas = world.atlasArt;
const cols = atlas.columns;
const rowsN = atlas.rows;
// Ignore this round's output when re-running the audit after generation. The
// purpose here is to ask whether the shipped Round 92 canvas had a vacant site.
const layers = atlas.layers.filter((layer) => !layer.id.startsWith('world-r93-')).map((layer) => ({
  id: layer.id,
  cells: layer.cellsRle !== undefined ? decodeAtlasCells(layer.cellsRle, rowsN, cols) : layer.cells,
}));
console.log('decoded', layers.length, 'layers of', cols + 'x' + rowsN);

function audit(label, centerCol, centerRow, radiusX, radiusY) {
  const c0 = Math.max(0, centerCol - radiusX - 4);
  const c1 = Math.min(cols - 1, centerCol + radiusX + 4);
  const r0 = Math.max(0, centerRow - radiusY - 4);
  const r1 = Math.min(rowsN - 1, centerRow + radiusY + 4);
  const occupied = [];
  for (const layer of layers) {
    let count = 0;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) if (layer.cells[row][col] !== 0) count += 1;
    }
    if (count > 0) occupied.push(layer.id + ':' + count);
  }
  console.log('=== ' + label + ' @(' + centerCol + ',' + centerRow + ') bbox [' + c0 + '-' + c1 + ']x[' + r0 + '-' + r1 + '] ===');
  console.log(occupied.length ? occupied.join('  ') : 'ALL ZERO in bbox');
}

audit('candidate r30x17', 432, 24, 30, 17);
audit('candidate margin r40x24', 432, 24, 40, 24);

console.log('=== per-layer occupancy in north strip (row 0-59, col 300-560) ===');
for (const layer of layers) {
  let count = 0;
  let minCol = Infinity;
  let maxCol = -1;
  let minRow = Infinity;
  let maxRow = -1;
  for (let row = 0; row < 60; row += 1) {
    for (let col = 300; col < 560; col += 1) {
      if (layer.cells[row][col] !== 0) {
        count += 1;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }
  }
  if (count > 0) console.log(layer.id, 'count', count, 'bbox', minCol + '-' + maxCol, 'x', minRow + '-' + maxRow);
}

// 旧区域中心投影 + regionFootprint 覆盖检查
console.log('=== region centers in cells and footprint overlap ===');
const fp = atlas.regionFootprint;
// world-atlas-view.ts consumes regionFootprint directly as atlas-cell units;
// it is not a percentage of the canvas.
const fpCols = fp.columns;
const fpRows = fp.rows;
console.log('regionFootprint (atlas cells):', fpCols.toFixed(2), 'x', fpRows.toFixed(2));
for (const region of world.regions.filter(({ mapResourceId }) => mapResourceId !== 'map.round-93-snow-pine-valley')) {
  const cx = (region.atlasPosition.x / 100) * (cols - 1) + 0.5;
  const cy = (region.atlasPosition.y / 100) * (rowsN - 1) + 0.5;
  const dx = Math.abs(cx - 432.5) / fpCols;
  const dy = Math.abs(cy - 24.5) / fpRows;
  console.log(region.mapResourceId.padEnd(34), 'cell(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')', 'ellipseOverlap=' + (dx * dx + dy * dy < 1));
}
