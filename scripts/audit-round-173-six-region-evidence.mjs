import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

const root = process.cwd();
const matrixPath = resolve(root, 'iterations/round-173/evidence-matrix.json');
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
const expected = ['江南道·七镇行旅', '雾雨渡口', '云岭古道·断云栈道', '东溟海岸·青帆埠', '北境·照雪关', '东溟·澜心洲'];
const errors = [];
if (matrix.regions.length !== expected.length) errors.push(`expected ${expected.length} regions`);
for (const [index, region] of matrix.regions.entries()) {
  if (region.region !== expected[index]) errors.push(`region order/name mismatch at ${index}: ${region.region}`);
  if (!Array.isArray(region.evidence) || region.evidence.length === 0) errors.push(`${region.region}: no cited evidence`);
  if (!Array.isArray(region.gaps) || region.gaps.length === 0) errors.push(`${region.region}: missing unresolved gaps`);
  if (!region.evidence?.some(item => item.kind === 'actual')) errors.push(`${region.region}: no actual-playtrace evidence`);
  for (const item of region.evidence ?? []) {
    if (!['actual', 'static', 'automated'].includes(item.kind)) errors.push(`${region.region}: invalid evidence kind ${item.kind}`);
    if (item.kind === 'actual' && !/iterations\/round-\d+\/(playtest|verification)\.md$/u.test(item.source)) errors.push(`${region.region}: actual evidence must point to a round playtest or verification log (${item.source})`);
    const path = resolve(root, item.source);
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..' + sep) || !existsSync(path)) errors.push(`${region.region}: missing/outside source ${item.source}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Six-region evidence index valid: ${matrix.regions.length} regions, ${matrix.regions.reduce((sum, region) => sum + region.evidence.length, 0)} traceable references; gaps remain explicit.`);
}
