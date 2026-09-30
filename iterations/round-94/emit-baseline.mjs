// Snapshot the committed Round 93 atlas prefix before expansion.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAtlasCells } from '../../scripts/lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const world = JSON.parse(readFileSync(resolve(root, 'data/base/world/world-map.json'), 'utf8'));
const atlas = world.atlasArt;
if (atlas.columns !== 640 || atlas.rows !== 448 || atlas.layers.length !== 43) {
  throw new Error(`Expected committed Round 93 atlas 640×448/43 layers, got ${atlas.columns}×${atlas.rows}/${atlas.layers.length}.`);
}
const baseline = {
  source: 'Round 93 committed baseline',
  columns: atlas.columns,
  rows: atlas.rows,
  tileSize: atlas.tileSize,
  regionFootprint: atlas.regionFootprint,
  layers: {},
  regions: {},
};
for (const layer of atlas.layers) {
  const cells = layer.cellsRle !== undefined
    ? decodeAtlasCells(layer.cellsRle, atlas.rows, atlas.columns)
    : layer.cells;
  baseline.layers[layer.id] = createHash('sha256').update(JSON.stringify(cells)).digest('hex');
}
for (const region of world.regions) {
  baseline.regions[region.mapResourceId] = {
    percent: { x: region.atlasPosition.x, y: region.atlasPosition.y },
    center: {
      col: region.atlasPosition.x / 100 * (atlas.columns - 1) + 0.5,
      row: region.atlasPosition.y / 100 * (atlas.rows - 1) + 0.5,
    },
  };
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), 'round93-atlas-baseline.json');
writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n');
console.log(`wrote ${out}: ${Object.keys(baseline.layers).length} layers, ${Object.keys(baseline.regions).length} regions`);
