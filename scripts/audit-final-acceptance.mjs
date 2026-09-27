#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditFinalAcceptance } from './lib/final-acceptance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let commitSubjects;
try {
  commitSubjects = execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
} catch (error) {
  console.error(`无法读取 Git 提交历史：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
  process.exit();
}

const report = await auditFinalAcceptance({ root, commitSubjects });
if (report.ok) {
  const { evidence } = report;
  console.log(
    `通过：${evidence.roundPlans}/${evidence.roundsRequired} 份轮次计划（字段完整 ${evidence.completeRoundPlans}，` +
    `估时≥10分钟 ${evidence.plansWithTenMinuteEstimate}），` +
    `${evidence.roundCommits}/${evidence.roundsRequired} 个轮次提交，` +
    `${evidence.totalCommitCount} 个总提交；${evidence.manifestResources} 份资料、` +
    `${evidence.schemaFamilies} 个 Schema 家族；内容 ${JSON.stringify(evidence.counts)}；` +
    `${evidence.requiredDocuments} 份必需文档；引擎资料字面量命中 ${evidence.engineLoreHits}；` +
    `${evidence.engineSourceFiles} 个引擎源码文件；同名 MOD 覆盖 ${evidence.modOverrideResources} 项；` +
    `原创扩展 ${evidence.documentedOriginalSystems} 项。`,
  );
} else {
  for (const problem of report.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}
