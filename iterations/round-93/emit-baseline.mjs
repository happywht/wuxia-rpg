// 从 Round 92 提交（ba149c2）时的 world-map.json 生成本轮回归基线：
// 38 层逐层 SHA-256 哈希 + 十二个旧区域百分比锚点。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAtlasCells } from '../../scripts/lib/atlas-rle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = execFileSync('git', ['show', 'ba149c2:data/base/world/world-map.json'], { cwd: root, encoding: 'utf8' });
const world = JSON.parse(raw);
const atlas = world.atlasArt;
const baseline = {
  columns: atlas.columns,
  rows: atlas.rows,
  tileSize: atlas.tileSize,
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
  };
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), 'round92-atlas-baseline.json');
writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n');
console.log('wrote', out, 'with', Object.keys(baseline.layers).length, 'layer hashes and',
  Object.keys(baseline.regions).length, 'region anchors');
