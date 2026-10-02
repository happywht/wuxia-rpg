import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { auditFinalAcceptance } from '../scripts/lib/final-acceptance.mjs';
import { loadWorldData } from '../src/game/world-loader';

const roots: string[] = [];

async function makeValidFixture(): Promise<{ root: string; commitSubjects: string[] }> {
  const root = await mkdtemp(path.join(tmpdir(), 'wuxia-round-50-final-'));
  roots.push(root);
  const required = {
    'npc-set': ['npcs', 12],
    'faction-set': ['factions', 5],
    'quest-set': ['quests', 32],
    'items-set': ['items', 51],
    'martial-arts-set': ['martialArts', 30],
    'ending-set': ['endings', 7],
    'knowledge-nodes': ['nodes', 163],
  } as const;
  const resources = [];
  for (const [schema, [collection, count]] of Object.entries(required)) {
    const resourcePath = `${schema}/set.json`;
    const directory = path.join(root, 'data', 'base', schema);
    await mkdir(directory, { recursive: true });
    const primaryCount = schema === 'npc-set' ? count - 2 : count;
    const values = Array.from({ length: primaryCount }, (_, index) => ({ name: `资料条目${index}` }));
    await writeFile(path.join(directory, 'set.json'), JSON.stringify({ [collection]: values }), 'utf8');
    const schemaDirectory = path.join(root, 'data', 'schema');
    await mkdir(schemaDirectory, { recursive: true });
    await writeFile(path.join(schemaDirectory, `${schema}.schema.json`), '{}', 'utf8');
    resources.push({ id: schema, schema, path: resourcePath });
    if (schema === 'npc-set') {
      await writeFile(
        path.join(directory, 'additional.json'),
        JSON.stringify({ npcs: [{ name: '补充人物1' }, { name: '补充人物2' }] }),
        'utf8',
      );
      resources.push({ id: 'npc-set-additional', schema, path: `${schema}/additional.json` });
    }
  }
  const baseDirectory = path.join(root, 'data', 'base');
  await mkdir(baseDirectory, { recursive: true });
  await mkdir(path.join(baseDirectory, 'maps'), { recursive: true });
  const map = { id: 'map.round-01-grid', name: 'Fixture map' };
  await writeFile(path.join(baseDirectory, 'maps', 'round-01-grid.json'), JSON.stringify(map), 'utf8');
  await writeFile(path.join(root, 'data', 'schema', 'grid-map.schema.json'), '{}', 'utf8');
  resources.push({ id: map.id, schema: 'grid-map', path: 'maps/round-01-grid.json' });
  await writeFile(path.join(baseDirectory, 'manifest.json'), JSON.stringify({ resources }), 'utf8');
  const modMapDirectory = path.join(root, 'mods', 'example', 'maps');
  await mkdir(modMapDirectory, { recursive: true });
  await writeFile(path.join(modMapDirectory, 'round-01-grid.json'), JSON.stringify(map), 'utf8');

  const documents = [
    'README.md', 'CHANGELOG.md', 'DEVLOG.md', 'ROADMAP.md', 'docs/GDD.md', 'docs/ADR.md',
    'docs/WORLD-SETTING.md', 'docs/CHARACTERS.md', 'docs/FACTIONS.md', 'docs/MAP-ATLAS.md',
    'docs/QUESTS.md', 'docs/KNOWLEDGE-GRAPH.md', 'docs/DIALOGUE-GUIDE.md', 'docs/ARCHITECTURE.md',
    'docs/DATA-GUIDE.md', 'docs/REFERENCES.md', 'docs/ORIGINAL-FIDELITY.md', 'docs/PLAYER-GUIDE.md',
    'docs/MOD-GUIDE.md', 'docs/RELEASE.md', 'docs/TESTING.md', 'docs/ITEMS.md',
    'docs/MARTIAL-ARTS.md', 'docs/FINAL-ACCEPTANCE.md',
  ];
  for (const relative of documents) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const content = relative === 'docs/ORIGINAL-FIDELITY.md'
      ? '| C1 | A |\n| C2 | B |\n| C3 | C |'
      : 'Round 50 acceptance fixture';
    await writeFile(target, content, 'utf8');
  }
  await mkdir(path.join(root, 'src', 'engine'), { recursive: true });
  await writeFile(path.join(root, 'src', 'engine', 'runtime.ts'), 'export const engine = true;', 'utf8');
  await writeFile(path.join(root, 'src', 'engine', 'data-loader.ts'), 'export const loader = true;', 'utf8');
  await mkdir(path.join(root, 'src', 'game'), { recursive: true });
  await writeFile(path.join(root, 'src', 'game', 'world-loader.ts'), 'export const worldLoader = true;', 'utf8');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'scripts', 'smoke-round-35.mjs'), '', 'utf8');
  await mkdir(path.join(root, 'tests'), { recursive: true });
  await writeFile(path.join(root, 'tests', 'data-validation.test.ts'), '', 'utf8');

  for (let round = 0; round <= 50; round++) {
    const roundId = String(round).padStart(2, '0');
    const directory = path.join(root, 'iterations', `round-${roundId}`);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'plan.md'), [
      `# Round ${roundId} plan`,
      '## 本轮目标',
      '本轮目标：建立可验收的完整切片。',
      '## 用户故事',
      '- 作为玩家，我可以完整体验玩法。',
      '## 验收标准',
      '- 新功能可验证。',
      '## 涉及文件',
      '- src/engine/runtime.ts',
      '## 风险',
      '- 临时夹具不应逃出工作目录。',
      '## 预计人类工程师工时',
      '约 20 分钟。',
      '## 子任务',
      '1. 实现可验证功能。',
      '2. 验证成功及失败边界。',
      '',
    ].join('\n'), 'utf8');
  }
  const commitSubjects = Array.from({ length: 51 }, (_, round) =>
    `round-${String(round).padStart(2, '0')}: fixture`);
  return { root, commitSubjects };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllGlobals();
});

describe('Round 50 final acceptance audit', () => {
  it('accepts complete round, data-count, schema-family, lore-boundary, and documentation evidence', { timeout: 20_000 }, async () => {
    const fixture = await makeValidFixture();
    const report = await auditFinalAcceptance(fixture);
    expect(report).toMatchObject({ ok: true, problems: [] });
    expect(report.evidence).toMatchObject({
      roundsRequired: 51,
      roundPlans: 51,
      completeRoundPlans: 51,
      roundCommits: 51,
      totalCommitCount: 51,
      plansWithTenMinuteEstimate: 51,
      counts: { npcs: 12, factions: 5, quests: 32, items: 51, martialArts: 30, endings: 7, nodes: 163 },
      requiredDocuments: 24,
      engineLoreHits: 0,
      modOverrideResources: 1,
      documentedOriginalSystems: 3,
    });
  });

  it('reports missing round artifacts and content shortfalls with actionable details', async () => {
    const fixture = await makeValidFixture();
    await rm(path.join(fixture.root, 'iterations', 'round-43', 'plan.md'));
    const itemsPath = path.join(fixture.root, 'data', 'base', 'items-set', 'set.json');
    await writeFile(itemsPath, JSON.stringify({ items: Array.from({ length: 49 }, () => ({ name: 'item' })) }), 'utf8');
    fixture.commitSubjects = fixture.commitSubjects.filter((subject) => !subject.startsWith('round-43:'));

    const report = await auditFinalAcceptance(fixture);
    expect(report.ok).toBe(false);
    expect(report.problems).toContain('缺少 Round 43 计划：iterations/round-43/plan.md');
    expect(report.problems).toContain('Git 历史缺少 Round 43 commit（前缀应为 round-43:）');
    expect(report.problems.some((problem) => problem.includes('物品数量不足：49/50'))).toBe(true);
  }, 15000);

  it('rejects incomplete plans and a MOD resource that does not match a base resource', async () => {
    const fixture = await makeValidFixture();
    await writeFile(path.join(fixture.root, 'iterations', 'round-12', 'plan.md'), [
      '# Round 12',
      '## 本轮目标',
      '提升易用性。',
      '## 用户故事',
      '- 故事。',
      '## 验收标准',
      '- 可验收。',
      '## 涉及文件',
      '- README.md',
      '## 风险',
      '- 两个列表项在子任务节之外。',
      '- 不能将其误计入子任务。',
      '## 预计人类工程师工时',
      '约 5 分钟。',
      '## 子任务',
      '无。',
    ].join('\n'), 'utf8');
    await writeFile(
      path.join(fixture.root, 'mods', 'example', 'maps', 'round-01-grid.json'),
      JSON.stringify({ id: 'map.unregistered' }),
      'utf8',
    );

    const report = await auditFinalAcceptance(fixture);
    expect(report.problems.some((problem) =>
      problem.includes('Round 12 计划字段不完整') &&
      problem.includes('子任务小节含 0 项') &&
      problem.includes('最低工时估算 5 分钟'))).toBe(true);
    expect(report.problems).toContain('示例 MOD 覆盖的资源未登记在基础 manifest：map.unregistered');
  }, 15000);

  it('flags exact world-data names found in engine source', async () => {
    const fixture = await makeValidFixture();
    const enginePath = path.join(fixture.root, 'src', 'engine', 'runtime.ts');
    await writeFile(enginePath, "export const lore = '资料条目0';", 'utf8');
    const report = await auditFinalAcceptance(fixture);
    expect(
      report.problems.some((problem) => problem.includes('资料条目0') && problem.includes('runtime.ts')),
      JSON.stringify(report.problems),
    ).toBe(true);
  });

  it('allows only the generic recovery-word collision, not an explicit authored skill literal', async () => {
    const fixture = await makeValidFixture();
    const martialArtsPath = path.join(fixture.root, 'data', 'base', 'martial-arts-set', 'set.json');
    await writeFile(martialArtsPath, JSON.stringify({ martialArts: [{ name: '调息' }] }), 'utf8');
    const enginePath = path.join(fixture.root, 'src', 'engine', 'runtime.ts');
    await writeFile(enginePath, '`${enemy}收势调息，恢复 ${gained} 点内力`', 'utf8');

    const genericReport = await auditFinalAcceptance(fixture);
    expect(genericReport.problems).not.toContain(expect.stringContaining('调息'));

    await writeFile(enginePath, "const skillName = '调息';", 'utf8');
    const explicitNameReport = await auditFinalAcceptance(fixture);
    expect(explicitNameReport.problems.some((problem) => problem.includes('调息') && problem.includes('runtime.ts')))
      .toBe(true);
  });

  it('returns a readable failure when the world manifest is unavailable', async () => {
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }));
    const outcome = await loadWorldData();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.title).toContain('资料加载');
    expect(outcome.lines.length).toBeGreaterThan(0);
    expect(outcome.lines.join('\n')).toContain('清单文件缺失');
  });
});
