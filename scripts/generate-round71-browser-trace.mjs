import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const tracePath = path.join(root, 'iterations', 'round-71', 'browser-trace.json');

if (!existsSync(vitest)) {
  throw new Error('未找到本地 Vitest；请先安装项目依赖。');
}

const result = spawnSync(process.execPath, [
  vitest,
  'run',
  'tests/round68-long-journey.test.ts',
  '--reporter=verbose',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ROUND71_TRACE_FILE: tracePath },
  maxBuffer: 4 * 1024 * 1024,
});

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(tracePath)) throw new Error('长旅程回归通过，但没有写出浏览器轨迹。');

const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
assert.equal(trace.schemaVersion, 1);
assert.equal(trace.expected.regions.length, 4);
assert.equal(trace.expected.transitionIds.length, 5);
assert.equal(trace.expected.steps, 749);
assert.equal(trace.expected.endingId, 'ending.open-water');
assert.equal(trace.actions.filter((action) => action.kind === 'gate').length, 5);
assert.equal(trace.actions.filter((action) => action.kind === 'checkpoint').length, 3);
assert.equal(
  trace.actions.filter((action) => action.kind === 'walk')
    .reduce((sum, action) => sum + action.directions.length, 0),
  trace.expected.steps,
  'walk 键序列须覆盖回归中每一步实际移动',
);
for (const action of trace.actions) {
  if (action.kind === 'walk') assert.match(action.directions, /^[RLUD]+$/);
}

console.log(`已导出 ${trace.actions.filter((action) => action.kind === 'walk').length} 段引擎计算路线，` +
  `${trace.expected.steps} 次方向输入、${trace.expected.transitionIds.length} 次关口交互；` +
  `文件：${path.relative(root, tracePath).split(path.sep).join('/')}`);
