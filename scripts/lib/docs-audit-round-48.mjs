import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const GUIDES = ['PLAYER-GUIDE.md', 'MOD-GUIDE.md'];

async function readText(root, relative, problems) {
  try {
    return await readFile(path.join(root, relative), 'utf8');
  } catch (error) {
    problems.push(`缺少或无法读取 ${relative}：${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

/** Read-only consistency checks for the player/author documentation shipped in Round 48. */
export async function auditRound48Docs({ root }) {
  const problems = [];
  const [readme, architecture, dataGuide, release, references, roadmap, changelog, devlog,
    playerGuide, modGuide, packageRelease, releaseSmoke, packageText, manifestText] = await Promise.all([
    readText(root, 'README.md', problems),
    readText(root, 'docs/ARCHITECTURE.md', problems),
    readText(root, 'docs/DATA-GUIDE.md', problems),
    readText(root, 'docs/RELEASE.md', problems),
    readText(root, 'docs/REFERENCES.md', problems),
    readText(root, 'ROADMAP.md', problems),
    readText(root, 'CHANGELOG.md', problems),
    readText(root, 'DEVLOG.md', problems),
    readText(root, 'docs/PLAYER-GUIDE.md', problems),
    readText(root, 'docs/MOD-GUIDE.md', problems),
    readText(root, 'scripts/package-release.mjs', problems),
    readText(root, 'scripts/smoke-round-47.mjs', problems),
    readText(root, 'package.json', problems),
    readText(root, 'data/base/manifest.json', problems),
  ]);

  for (const guide of GUIDES) {
    if (!readme.includes(`docs/${guide}`)) problems.push(`README 文档索引未链接 docs/${guide}`);
    if (!release.includes(guide)) problems.push(`docs/RELEASE.md 未说明随包提供 ${guide}`);
    if (!packageRelease.includes(`'${guide}'`)) problems.push(`版本包 staging 白名单未复制 ${guide}`);
    if (!releaseSmoke.includes(`'${guide}'`)) problems.push(`版本包 smoke 未解包验证 ${guide}`);
  }

  const roadmapRounds = [...roadmap.matchAll(/^- \*\*R(\d{2,})\*\* — ([^\r\n]+)/gm)];
  const completedRounds = roadmapRounds
    .filter(([, , summary]) => summary.includes('已完成：'))
    .map(([, round]) => Number(round))
    .filter((round) => Number.isInteger(round));
  const activeRounds = roadmapRounds
    .filter(([, , summary]) => summary.startsWith('进行中：'))
    .map(([, round]) => Number(round))
    .filter((round) => Number.isInteger(round));
  const lastCompletedRound = completedRounds.length > 0 ? Math.max(...completedRounds) : null;
  const activeRound = activeRounds.length > 0 ? Math.max(...activeRounds) : null;
  const currentRound = activeRound !== null && (lastCompletedRound === null || activeRound > lastCompletedRound)
    ? activeRound
    : lastCompletedRound;
  // A maintained current matrix replaces repeated round headings in core manuals.
  // Legacy packages and fixtures retain the original roadmap-based contract.
  let currentMatrix = null;
  try {
    currentMatrix = await readFile(path.join(root, 'docs/CURRENT-ACCEPTANCE.md'), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') problems.push('无法读取 docs/CURRENT-ACCEPTANCE.md');
  }
  if (currentMatrix !== null) {
    for (const [name, text] of [['README.md', readme], ['ARCHITECTURE.md', architecture],
      ['DATA-GUIDE.md', dataGuide], ['PLAYER-GUIDE.md', playerGuide], ['ROADMAP.md', roadmap]]) {
      if (!text.includes('CURRENT-ACCEPTANCE.md')) problems.push(`${name} 未链接唯一当前验收矩阵`);
    }
    if (!/^更新：[^\r\n]+\/ Round\s*\d+/m.test(currentMatrix)) problems.push('当前验收矩阵缺少带轮次的更新依据');
    if (!currentMatrix.includes('五阶段门槛') || !currentMatrix.includes('代表旅程检查点')) {
      problems.push('当前验收矩阵缺少阶段门槛或真实旅程检查点');
    }
    const matrixRound = currentMatrix.match(/^更新：[^\r\n]+\/ Round\s*(\d+)/m)?.[1];
    const roundRecord = new RegExp(`Round\\s*${matrixRound}\\b`);
    if (matrixRound && (!roundRecord.test(changelog) || !roundRecord.test(devlog))) {
      problems.push('CHANGELOG.md 与 DEVLOG.md 未记录当前验收矩阵轮次');
    }
  } else if (currentRound === null) {
    problems.push('ROADMAP.md 没有任何带验收摘要的已完成轮次');
  } else {
    const currentLabel = `Round ${String(currentRound).padStart(2, '0')}`;
    const nextLabel = `Round ${String(currentRound + 1).padStart(2, '0')}`;
    const isActive = activeRound === currentRound;
    const expectedReadmeStatus = isActive
      ? `${currentLabel} 开发中`
      : `${currentLabel} 已完成；下一轮 ${nextLabel}`;
    if (!readme.includes(expectedReadmeStatus)) {
      problems.push(`README.md 当前进度应标记为“${expectedReadmeStatus}”`);
    }
    if (!roadmap.includes(`**R${String(currentRound).padStart(2, '0')}**`) ||
        !roadmap.includes(`**R${String(currentRound + 1).padStart(2, '0')}**`)) {
      problems.push(`ROADMAP.md 缺少 ${currentLabel}/${nextLabel} 当前及后续条目`);
    }
    if (!changelog.includes(currentLabel) || !devlog.includes(currentLabel)) {
      problems.push(`CHANGELOG.md 与 DEVLOG.md 都必须有 ${currentLabel} 记录`);
    }
    const expectedSummaryStatus = isActive ? `${currentLabel} 进行中` : `截至 ${currentLabel}`;
    if (!architecture.includes(expectedSummaryStatus)) {
      problems.push(`ARCHITECTURE.md 状态摘要未更新到 ${currentLabel}`);
    }
    if (!dataGuide.includes(expectedSummaryStatus)) {
      problems.push(`DATA-GUIDE.md 状态摘要未更新到 ${currentLabel}`);
    }
    if (!playerGuide.includes(`Round ${currentRound}`)) {
      problems.push(`PLAYER-GUIDE.md 应说明当前 ${currentLabel} 原型状态`);
    }
  }
  if (architecture.includes('/base/maps/round-01-grid.json')) {
    problems.push('ARCHITECTURE.md 仍声称请求根绝对路径，与 Round 47 子路径基址不符');
  }

  let packageInfo = null;
  try {
    packageInfo = JSON.parse(packageText);
  } catch (error) {
    problems.push(`package.json 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
  const scripts = packageInfo?.scripts;
  for (const [relative, guideText] of [
    ['README.md', readme],
    ['docs/PLAYER-GUIDE.md', playerGuide],
    ['docs/MOD-GUIDE.md', modGuide],
  ]) {
    for (const match of guideText.matchAll(/\bnpm run ([a-z0-9:_-]+)/g)) {
      const command = match[1];
      if (typeof scripts?.[command] !== 'string') {
        problems.push(`${relative} 引用了 package.json 未登记的命令 npm run ${command}`);
      }
    }
  }

  let manifest = null;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    problems.push(`data/base/manifest.json 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
  let schemaCount = 0;
  try {
    schemaCount = (await readdir(path.join(root, 'data/schema')))
      .filter((file) => file.endsWith('.schema.json')).length;
  } catch (error) {
    problems.push(`无法枚举 data/schema：${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest !== null && Array.isArray(manifest.resources)) {
    if (!architecture.includes(`${manifest.resources.length} 项资源`)) {
      problems.push(`ARCHITECTURE.md 资源计数应与 manifest 登记的 ${manifest.resources.length} 项资源一致`);
    }
    const schemaFamilyCount = new Set(manifest.resources.map((resource) => resource.schema).filter((schema) => typeof schema === 'string')).size;
    if (!architecture.includes(`${schemaFamilyCount} 个资源 Schema 家族`)) {
      problems.push(`ARCHITECTURE.md 资源 Schema 家族数应与 manifest 的 ${schemaFamilyCount} 种登记一致`);
    }
  } else if (manifest !== null) {
    problems.push('data/base/manifest.json 缺少 resources 数组');
  }
  if (!architecture.includes(`${schemaCount} 份 draft-07 JSON Schema`)) {
    problems.push(`ARCHITECTURE.md Schema 文件计数应与 data/schema/ 的 ${schemaCount} 份登记一致`);
  }

  if (manifest !== null && Array.isArray(manifest.resources)) {
    const countSpec = {
      'npc-set': ['npcs', 'NPC'],
      'faction-set': ['factions', '门派'],
      'quest-set': ['quests', '任务'],
      'items-set': ['items', '物品'],
      'martial-arts-set': ['martialArts', '武学'],
      'knowledge-nodes': ['nodes', '知识节点'],
      'knowledge-edges': ['edges', '知识关系'],
    };
    const counts = {};
    for (const [schema, [collection, label]] of Object.entries(countSpec)) {
      const resources = manifest.resources.filter((entry) => entry.schema === schema);
      if (resources.length === 0) {
        problems.push(`manifest 缺少用于计数的 ${schema} 资源`);
        continue;
      }
      const baseDirectory = path.resolve(root, 'data/base');
      let total = 0;
      let valid = true;
      for (const resource of resources) {
        if (typeof resource.path !== 'string') {
          problems.push(`${schema} 资源缺少 path`);
          valid = false;
          continue;
        }
        const resourceFile = path.resolve(baseDirectory, ...resource.path.split('/'));
        const resourceRelative = path.relative(baseDirectory, resourceFile);
        if (resourceRelative.startsWith('..') || path.isAbsolute(resourceRelative)) {
          problems.push(`${schema} 资源路径越出 data/base`);
          valid = false;
          continue;
        }
        try {
          const resourceData = JSON.parse(await readFile(resourceFile, 'utf8'));
          if (!Array.isArray(resourceData?.[collection])) {
            problems.push(`${resource.path} 缺少 ${collection} 数组`);
            valid = false;
            continue;
          }
          total += resourceData[collection].length;
        } catch (error) {
          problems.push(`${resource.path} 无法读取计数：${error instanceof Error ? error.message : String(error)}`);
          valid = false;
        }
      }
      if (valid) counts[schema] = { count: total, label };
    }
    const expectedPhrases = [
      ['npc-set', ' 名 NPC'],
      ['faction-set', ' 个门派'],
      ['quest-set', ' 项任务'],
      ['items-set', ' 件物品'],
      ['martial-arts-set', ' 种武学'],
      ['knowledge-nodes', ' 个图谱节点'],
      ['knowledge-edges', ' 条边'],
    ];
    const countSnippets = expectedPhrases.map(([schema, suffix]) => {
      const value = counts[schema]?.count;
      return value === undefined ? null : `${value}${suffix}`;
    }).filter((value) => value !== null);
    for (const snippet of countSnippets) {
      if (!dataGuide.includes(snippet)) problems.push(`DATA-GUIDE.md 缺少与基础资料一致的计数：${snippet}`);
    }
    const nodes = counts['knowledge-nodes']?.count;
    const edges = counts['knowledge-edges']?.count;
    if (nodes !== undefined && edges !== undefined && !dataGuide.includes(`${nodes} 个图谱节点/${edges} 条边`)) {
      problems.push(`DATA-GUIDE.md 图谱汇总应为 ${nodes} 个图谱节点/${edges} 条边`);
    }
  }

  if (!references.includes('没有单独的项目 `LICENSE`') || !references.includes('授权未经验证')) {
    problems.push('REFERENCES.md 必须明确项目无单独 LICENSE 且历史来源授权未经验证');
  }
  if (!release.includes('当前没有单独的项目 LICENSE') || !release.includes('这不自动覆盖项目自身代码/资料')) {
    problems.push('RELEASE.md 必须区分项目自身授权与第三方依赖 notices');
  }

  return { ok: problems.length === 0, problems };
}
