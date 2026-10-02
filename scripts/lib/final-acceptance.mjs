import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROUND_LAST = 50;
const REQUIRED_DOCUMENTS = [
  'README.md',
  'CHANGELOG.md',
  'DEVLOG.md',
  'ROADMAP.md',
  'docs/GDD.md',
  'docs/ADR.md',
  'docs/WORLD-SETTING.md',
  'docs/CHARACTERS.md',
  'docs/FACTIONS.md',
  'docs/MAP-ATLAS.md',
  'docs/QUESTS.md',
  'docs/KNOWLEDGE-GRAPH.md',
  'docs/DIALOGUE-GUIDE.md',
  'docs/ARCHITECTURE.md',
  'docs/DATA-GUIDE.md',
  'docs/REFERENCES.md',
  'docs/ORIGINAL-FIDELITY.md',
  'docs/PLAYER-GUIDE.md',
  'docs/MOD-GUIDE.md',
  'docs/RELEASE.md',
  'docs/TESTING.md',
  'docs/ITEMS.md',
  'docs/MARTIAL-ARTS.md',
  'docs/FINAL-ACCEPTANCE.md',
];

const REQUIRED_PLAN_SECTIONS = [
  ['本轮目标', /本轮目标|目标/u],
  ['用户故事', /用户故事/u],
  ['验收标准', /验收标准/u],
  ['涉及文件', /涉及文件/u],
  ['风险', /风险/u],
  ['预计人类工程师工时', /预计[^\n]*工时/u],
  ['子任务', /子任务/u],
];

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;

function parseHeadings(markdown) {
  return markdown.split(/\r?\n/u).map((line, index) => {
    const match = MARKDOWN_HEADING.exec(line);
    return match === null ? null : {
      index,
      level: match[1].length,
      title: match[2].trim(),
    };
  }).filter((heading) => heading !== null);
}

function countSubtaskListItems(markdown, headings) {
  const lines = markdown.split(/\r?\n/u);
  let count = 0;
  for (const section of headings.filter((heading) => /子任务/u.test(heading.title))) {
    const nextSection = headings.find((heading) =>
      heading.index > section.index && heading.level <= section.level);
    const end = nextSection?.index ?? lines.length;
    for (let index = section.index + 1; index < end; index++) {
      if (/^(?:\s*[-*+]\s+|\s*\d+[.)、]\s+)/u.test(lines[index])) count++;
    }
  }
  return count;
}

function estimateSectionMinimumMinutes(lines, section, nextSection) {
  const end = nextSection?.index ?? lines.length;
  const estimateText = lines.slice(section.index + 1, end).join('\n');
  const duration = /(\d+(?:\.\d+)?)\s*(?:[–—-]\s*(\d+(?:\.\d+)?)\s*)?(分钟|min(?:ute)?s?|分|小时|小時|h)/iu.exec(estimateText);
  if (duration === null) return null;
  const value = Number(duration[1]);
  const unit = duration[3].toLowerCase();
  return unit === '小时' || unit === '小時' || unit === 'h' ? value * 60 : value;
}

function minimumPlannedMinutes(markdown, headings) {
  const lines = markdown.split(/\r?\n/u);
  const estimateSections = headings.filter((heading) => /预计.*工时/u.test(heading.title));
  if (estimateSections.length === 0) return null;
  const minima = estimateSections.map((section) => estimateSectionMinimumMinutes(
    lines,
    section,
    headings.find((heading) => heading.index > section.index && heading.level <= section.level),
  ));
  if (minima.some((minutes) => minutes === null)) return null;
  return Math.min(...minima);
}

const REQUIRED_COUNTS = {
  'npc-set': ['npcs', 10, 'NPC'],
  'faction-set': ['factions', 5, '门派'],
  'quest-set': ['quests', 20, '任务'],
  'items-set': ['items', 50, '物品'],
  'martial-arts-set': ['martialArts', 30, '武学'],
  'ending-set': ['endings', 3, '结局'],
  'knowledge-nodes': ['nodes', 100, '知识图谱节点'],
};

const LORE_FIELDS = new Set(['name', 'title', 'text', 'description', 'summary']);
// A short generic verb can collide with an authored name inside unrelated
// engine prose. Exempt only this exact presentation fragment; an explicit
// skill-name literal or any other occurrence still fails the audit.
const GENERIC_LORE_OVERLAPS = new Map([
  ['调息', ['收势调息，恢复 ${gained} 点内力']],
]);

function addFileStrings(value, candidates) {
  if (Array.isArray(value)) {
    for (const entry of value) addFileStrings(entry, candidates);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (LORE_FIELDS.has(key) && typeof entry === 'string' && entry.trim().length >= 2) {
      candidates.add(entry.trim());
    }
    if (entry !== null && typeof entry === 'object') addFileStrings(entry, candidates);
  }
}

async function walkTypeScript(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkTypeScript(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath);
  }
  return files;
}

async function existsAsFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

/**
 * Read-only structural acceptance audit for the Round 00–50 project contract.
 * `commitSubjects` comes from `git log` in the CLI and is injectable in tests.
 * Runtime playability, MOD precedence, data-removal fallback and external
 * publishing remain separate checks; this audit does not overclaim them.
 */
export async function auditFinalAcceptance({ root, commitSubjects }) {
  const problems = [];
  const rootPath = path.resolve(root);
  const roundIds = Array.from({ length: ROUND_LAST + 1 }, (_, index) =>
    String(index).padStart(2, '0'));

  let roundPlans = 0;
  let completeRoundPlans = 0;
  let plansWithTenMinuteEstimate = 0;
  for (const roundId of roundIds) {
    const planPath = path.join(rootPath, 'iterations', `round-${roundId}`, 'plan.md');
    if (!(await existsAsFile(planPath))) {
      problems.push(`缺少 Round ${roundId} 计划：iterations/round-${roundId}/plan.md`);
      continue;
    }
    roundPlans++;
    const plan = await readFile(planPath, 'utf8');
    const headings = parseHeadings(plan);
    const missingSections = REQUIRED_PLAN_SECTIONS
      .filter(([, pattern]) => !headings.some((heading) => pattern.test(heading.title)))
      .map(([label]) => label);
    const subtaskCount = countSubtaskListItems(plan, headings);
    const estimateMinutes = minimumPlannedMinutes(plan, headings);
    if (estimateMinutes !== null && estimateMinutes >= 10) plansWithTenMinuteEstimate++;
    if (missingSections.length > 0 || subtaskCount < 2 || estimateMinutes === null || estimateMinutes < 10) {
      problems.push(
        `Round ${roundId} 计划字段不完整（缺少 ${missingSections.join('、') || '无'}；` +
        `子任务小节含 ${subtaskCount} 项，至少需要 2 项；最低工时估算 ${estimateMinutes ?? '不可解析'} 分钟，至少需要 10 分钟）：` +
        `iterations/round-${roundId}/plan.md`,
      );
    } else {
      completeRoundPlans++;
    }
  }

  const subjects = Array.isArray(commitSubjects) ? commitSubjects : [];
  if (subjects.length < 50) {
    problems.push(`Git 历史只有 ${subjects.length} 个 commit，至少需要 50 个`);
  }
  let roundCommits = 0;
  for (const roundId of roundIds) {
    const prefix = `round-${roundId}:`;
    if (subjects.some((subject) => subject.toLowerCase().startsWith(prefix))) roundCommits++;
    else problems.push(`Git 历史缺少 Round ${roundId} commit（前缀应为 ${prefix}）`);
  }

  const docsMissing = [];
  for (const relative of REQUIRED_DOCUMENTS) {
    if (!(await existsAsFile(path.join(rootPath, relative)))) docsMissing.push(relative);
  }
  for (const relative of docsMissing) problems.push(`缺少最终交付文档：${relative}`);

  const manifestPath = path.join(rootPath, 'data', 'base', 'manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`manifest 缺失或 JSON 无效：${error instanceof Error ? error.message : String(error)}`);
  }

  const loadedResources = new Map();
  const baseResourcesById = new Map();
  const loreCandidates = new Set();
  if (manifest !== null) {
    if (!Array.isArray(manifest.resources)) {
      problems.push('data/base/manifest.json 缺少 resources 数组');
    } else {
      const baseDirectory = path.resolve(rootPath, 'data', 'base');
      const schemas = new Set();
      for (const resource of manifest.resources) {
        if (typeof resource?.id !== 'string' || typeof resource?.schema !== 'string' ||
            typeof resource?.path !== 'string') {
          problems.push('manifest 含缺少 id/schema/path 的资源记录');
          continue;
        }
        schemas.add(resource.schema);
        const resourcePath = path.resolve(baseDirectory, ...resource.path.split('/'));
        const resourceRelative = path.relative(baseDirectory, resourcePath);
        if (resourceRelative === '..' || resourceRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resourceRelative)) {
          problems.push(`manifest 资源路径越出 data/base：${resource.id} → ${resource.path}`);
          continue;
        }
        try {
          const value = JSON.parse(await readFile(resourcePath, 'utf8'));
          const resourcesForSchema = loadedResources.get(resource.schema) ?? [];
          resourcesForSchema.push({ id: resource.id, value });
          loadedResources.set(resource.schema, resourcesForSchema);
          baseResourcesById.set(resource.id, { path: resource.path, value });
          addFileStrings(value, loreCandidates);
        } catch (error) {
          problems.push(`manifest 资源无法读取：${resource.id} (${resource.path}) — ${error instanceof Error ? error.message : String(error)}`);
        }
        const schemaPath = path.join(rootPath, 'data', 'schema', `${resource.schema}.schema.json`);
        if (!(await existsAsFile(schemaPath))) problems.push(`资源 ${resource.id} 缺少 Schema：data/schema/${resource.schema}.schema.json`);
      }

      for (const [schema, [collection, minimum, label]] of Object.entries(REQUIRED_COUNTS)) {
        const resources = loadedResources.get(schema);
        const count = (resources ?? []).reduce((total, resource) =>
          total + (Array.isArray(resource.value?.[collection]) ? resource.value[collection].length : 0), 0);
        if (resources === undefined) {
          problems.push(`manifest 缺少 ${schema} 资源，无法核验 ${label} 数量`);
        } else if (count < minimum) {
          problems.push(`${label}数量不足：${count}/${minimum}（资源 ${resources.map((resource) => resource.id).join('、')}，字段 ${collection}）`);
        }
      }

      const schemaFiles = await readdir(path.join(rootPath, 'data', 'schema')).catch(() => []);
      const declaredSchemaCount = schemaFiles.filter((name) => name.endsWith('.schema.json')).length;
      if (declaredSchemaCount < schemas.size) {
        problems.push(`Schema 文件少于 manifest 家族数：${declaredSchemaCount}/${schemas.size}`);
      }
    }
  }

  const modDirectory = path.join(rootPath, 'mods', 'example');
  const modMapPath = path.join(modDirectory, 'maps', 'round-01-grid.json');
  try {
    const modMap = JSON.parse(await readFile(modMapPath, 'utf8'));
    const relativeModPath = path.relative(modDirectory, modMapPath).split(path.sep).join('/');
    const baseMap = baseResourcesById.get(modMap.id);
    if (baseMap === undefined) {
      problems.push(`示例 MOD 覆盖的资源未登记在基础 manifest：${modMap.id}`);
    } else if (baseMap.path !== relativeModPath) {
      problems.push(
        `示例 MOD 未使用同名资源路径覆盖：${relativeModPath} ≠ ${baseMap.path}`,
      );
    }
  } catch (error) {
    problems.push(
      `示例 MOD 的地图覆盖文件缺失或 JSON 无效：mods/example/maps/round-01-grid.json — ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const evidencePath of [
    'src/engine/data-loader.ts',
    'src/game/world-loader.ts',
    'scripts/smoke-round-35.mjs',
    'tests/data-validation.test.ts',
  ]) {
    if (!(await existsAsFile(path.join(rootPath, evidencePath)))) {
      problems.push(`缺少资料解耦/MOD/删除回退验证证据文件：${evidencePath}`);
    }
  }

  const engineFiles = await walkTypeScript(path.join(rootPath, 'src', 'engine'));
  if (engineFiles.length === 0) problems.push('引擎目录缺少 TypeScript 源码：src/engine/');
  const engineText = await Promise.all(engineFiles.map((file) => readFile(file, 'utf8')));
  const loreHits = [];
  for (const candidate of loreCandidates) {
    const fileIndex = engineText.findIndex((source) => {
      const allowedFragments = GENERIC_LORE_OVERLAPS.get(candidate) ?? [];
      const withoutGenericOverlap = allowedFragments.reduce(
        (text, fragment) => text.replaceAll(fragment, ''),
        source,
      );
      return withoutGenericOverlap.includes(candidate);
    });
    if (fileIndex >= 0) loreHits.push({ value: candidate, file: path.relative(rootPath, engineFiles[fileIndex]) });
  }
  for (const hit of loreHits) {
    problems.push(`引擎源码疑似包含世界资料字面量“${hit.value}”：${hit.file}（需人工判断是否为人名/地名/剧情/任务文本）`);
  }

  let fidelityText = '';
  try {
    fidelityText = await readFile(path.join(rootPath, 'docs', 'ORIGINAL-FIDELITY.md'), 'utf8');
  } catch {
    // The missing-document diagnostic above is more useful than a second error.
  }
  const documentedOriginalSystems = new Set(
    [...fidelityText.matchAll(/^\| C(\d+) \|/gm)].map(([, id]) => id),
  );
  if (documentedOriginalSystems.size < 3) {
    problems.push(`原作对照文档记录的新增系统少于 3 项：${documentedOriginalSystems.size}`);
  }

  const counts = {};
  for (const [schema, [collection]] of Object.entries(REQUIRED_COUNTS)) {
    counts[collection] = (loadedResources.get(schema) ?? []).reduce((total, resource) =>
      total + (Array.isArray(resource.value?.[collection]) ? resource.value[collection].length : 0), 0);
  }
  return {
    ok: problems.length === 0,
    problems,
    evidence: {
      roundsRequired: ROUND_LAST + 1,
      roundPlans,
      completeRoundPlans,
      plansWithTenMinuteEstimate,
      roundCommits,
      totalCommitCount: subjects.length,
      manifestResources: Array.isArray(manifest?.resources) ? manifest.resources.length : 0,
      schemaFamilies: Array.isArray(manifest?.resources)
        ? new Set(manifest.resources.map((resource) => resource.schema).filter(Boolean)).size
        : 0,
      counts,
      requiredDocuments: REQUIRED_DOCUMENTS.length - docsMissing.length,
      loreCandidateCount: loreCandidates.size,
      engineLoreHits: loreHits.length,
      engineSourceFiles: engineFiles.length,
      modOverrideResources: baseResourcesById.has('map.round-01-grid') ? 1 : 0,
      documentedOriginalSystems: documentedOriginalSystems.size,
    },
  };
}
