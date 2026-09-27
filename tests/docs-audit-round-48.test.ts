import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { auditRound48Docs } from '../scripts/lib/docs-audit-round-48.mjs';

const roots: string[] = [];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'wuxia-round-48-docs-'));
  roots.push(root);
  for (const directory of ['docs', 'scripts', 'data/base', 'data/schema']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  const resourceEntries: [string, string, string][] = [
    ['npc-set', 'npcs', 'characters/npcs.json'],
    ['faction-set', 'factions', 'factions/factions.json'],
    ['quest-set', 'quests', 'quests/quests.json'],
    ['items-set', 'items', 'items/items.json'],
    ['martial-arts-set', 'martialArts', 'skills/arts.json'],
    ['knowledge-nodes', 'nodes', 'knowledge/nodes.json'],
    ['knowledge-edges', 'edges', 'knowledge/edges.json'],
  ];
  const resourceFiles: Record<string, unknown> = {};
  const resources = resourceEntries.map(([schema, collection, resourcePath]) => {
    resourceFiles[resourcePath] = { [collection]: [{}] };
    return { id: schema, path: resourcePath, schema };
  });
  await writeFile(path.join(root, 'data/base/manifest.json'), JSON.stringify({ resources }), 'utf8');
  for (const [resourcePath, content] of Object.entries(resourceFiles)) {
    const target = path.join(root, 'data/base', resourcePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(content), 'utf8');
  }
  for (const [schema] of resourceEntries) {
    await writeFile(path.join(root, 'data/schema', `${schema}.schema.json`), '{}', 'utf8');
  }
  const files: Record<string, string> = {
    'README.md': '[玩家](docs/PLAYER-GUIDE.md) [MOD](docs/MOD-GUIDE.md) Round 48',
    'docs/ARCHITECTURE.md': '截至 Round 48 使用 ./base/ 相对基址；7 项资源、7 个资源 Schema 家族、7 份 draft-07 JSON Schema。',
    'docs/DATA-GUIDE.md': '截至 Round 47 数据资料，1 名 NPC，1 个门派，1 项任务，1 件物品，1 种武学，1 个图谱节点/1 条边。',
    'docs/RELEASE.md': 'PLAYER-GUIDE.md MOD-GUIDE.md 当前没有单独的项目 LICENSE；这不自动覆盖项目自身代码/资料。',
    'docs/REFERENCES.md': '没有单独的项目 `LICENSE`；历史来源授权未经验证。',
    'docs/PLAYER-GUIDE.md': '玩家操作。 npm run dev npm run check',
    'docs/MOD-GUIDE.md': 'MOD 工作流。 npm run inspect:mods npm run content:export',
    'ROADMAP.md': '**R48** 手册 **R49** 反馈',
    'CHANGELOG.md': '## Round 48',
    'DEVLOG.md': '## Round 48',
    'package.json': JSON.stringify({ scripts: { dev: 'vite', check: 'npm test', 'inspect:mods': 'node', 'content:export': 'node' } }),
    'scripts/package-release.mjs': "['PLAYER-GUIDE.md', 'MOD-GUIDE.md']",
    'scripts/smoke-round-47.mjs': "['PLAYER-GUIDE.md', 'MOD-GUIDE.md']",
  };
  for (const [relative, content] of Object.entries(files)) {
    await writeFile(path.join(root, relative), content, 'utf8');
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Round 48 documentation audit', () => {
  it('accepts the current repository documentation', async () => {
    const report = await auditRound48Docs({ root: repositoryRoot });
    expect(report).toEqual({ ok: true, problems: [] });
  });

  it('accepts a consistent fixture', async () => {
    const report = await auditRound48Docs({ root: await makeFixture() });
    expect(report).toEqual({ ok: true, problems: [] });
  });

  it('reports a missing guide and missing README link', async () => {
    const root = await makeFixture();
    await rm(path.join(root, 'docs/MOD-GUIDE.md'));
    await writeFile(path.join(root, 'README.md'), 'Round 48 docs/PLAYER-GUIDE.md');
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('MOD-GUIDE.md'))).toBe(true);
    expect(report.problems.some((problem) => problem.includes('README 文档索引'))).toBe(true);
  });

  it('rejects guide commands absent from package.json', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'docs/PLAYER-GUIDE.md'), 'npm run missing:command');
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('npm run missing:command'))).toBe(true);
  });

  it('rejects README command examples absent from package.json', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'README.md'), 'Round 48 docs/PLAYER-GUIDE.md docs/MOD-GUIDE.md npm run typo:command');
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('npm run typo:command'))).toBe(true);
  });

  it('rejects stale absolute-root architecture paths', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'docs/ARCHITECTURE.md'), '截至 Round 47 /base/maps/round-01-grid.json');
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('根绝对路径'))).toBe(true);
  });

  it('rejects resource or schema counts that drift from manifest and files', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'data/base/manifest.json'), JSON.stringify({ resources: [] }));
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('0 项资源'))).toBe(true);
    expect(report.problems.some((problem) => problem.includes('缺少用于计数'))).toBe(true);
  });

  it('rejects manuals omitted from the package whitelist or archive smoke', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'scripts/package-release.mjs'), "['PLAYER-GUIDE.md']");
    await writeFile(path.join(root, 'scripts/smoke-round-47.mjs'), "['MOD-GUIDE.md']");
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('白名单未复制 MOD-GUIDE.md'))).toBe(true);
    expect(report.problems.some((problem) => problem.includes('smoke 未解包验证 PLAYER-GUIDE.md'))).toBe(true);
  });

  it('requires honest project and source license boundaries', async () => {
    const root = await makeFixture();
    await writeFile(path.join(root, 'docs/REFERENCES.md'), '许可已解决');
    await writeFile(path.join(root, 'docs/RELEASE.md'), '第三方 notices');
    const report = await auditRound48Docs({ root });
    expect(report.problems.some((problem) => problem.includes('项目无单独 LICENSE'))).toBe(true);
    expect(report.problems.some((problem) => problem.includes('区分项目自身授权'))).toBe(true);
  });
});
