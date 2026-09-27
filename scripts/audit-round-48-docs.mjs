#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditRound48Docs } from './lib/docs-audit-round-48.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = await auditRound48Docs({ root });
if (report.ok) {
  console.log('通过：Round 48 玩家/MOD 指南、README/发布包索引、命令、当前轮次与授权边界一致。');
} else {
  for (const problem of report.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}
