#!/usr/bin/env node
/**
 * Round 35 read-only MOD inspector.
 *
 * Walks the real `data/base/manifest.json`, validates the manifest itself
 * plus the base document and every enabled-mod override of each resource
 * against the referenced `data/schema/<id>.schema.json` (draft-07 Ajv), and
 * reports the winning layer per resource in `enabledMods` order (later
 * declaration wins; a rejected override leaves the previous valid value in
 * use). Malformed or schema-invalid overrides are reported with the exact
 * file path and a repair hint, and any such problem exits nonzero.
 *
 * Scope: this is a static JSON/schema check only. Cross-resource semantic
 * validation (id references, coordinates, occupant overlaps, calendar
 * partitions, …) is performed by the runtime game loader at assembly time.
 * The script never writes, moves or enables anything.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Mirrors the segment rules shared by the loader, schemas and vite plugin. */
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_\-一-鿿][A-Za-z0-9._\-一-鿿]*$/;

function isSafeRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    value.split('/').every((segment) => SAFE_SEGMENT_PATTERN.test(segment))
  );
}

function isSafeModId(value) {
  return typeof value === 'string' && isSafeRelativePath(value) && !value.includes('/');
}

function formatSchemaErrors(errors) {
  return (errors ?? []).map((error) => {
    const location = error.instancePath === '' ? '（根对象）' : error.instancePath;
    return `${location}：${error.message ?? '不符合 schema 约束'}`;
  });
}

async function readJsonFile(file) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
      return { status: 'missing' };
    }
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'io-error', message: reason };
  }
  try {
    return { status: 'ok', data: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'json-error', message: reason };
  }
}

const STATUS_LABELS = {
  ok: '✓ 通过',
  missing: '— 文件不存在',
  none: '— 无覆盖',
  'io-error': '✗ 读取失败',
  'json-error': '✗ JSON 解析失败',
  'schema-error': '✗ 不符合 schema',
  'schema-missing': '✗ schema 不可用',
};

/**
 * Runs the inspection against a repository-shaped root. Returns a plain
 * report object (also consumed by scripts/smoke-round-35.mjs):
 * { ok, resources, problems, notes } where resources[] carries per-layer
 * outcomes and the final source, and problems[] carries { file, message,
 * hint, details } for every rejected layer or unusable base/schema file.
 */
export async function inspectMods(root = projectRoot) {
  const problems = [];
  const reportProblem = (file, message, hint, details = []) => {
    problems.push({ file, message, hint, details });
  };

  const manifestPath = path.resolve(root, 'data/base/manifest.json');
  const manifestFile = await readJsonFile(manifestPath);
  if (manifestFile.status !== 'ok') {
    reportProblem(
      manifestPath,
      manifestFile.status === 'missing' ? '清单文件缺失' : `清单${STATUS_LABELS[manifestFile.status] ?? '不可读'}`,
      manifestFile.status === 'json-error'
        ? '修复 data/base/manifest.json 的 JSON 语法（多余/缺失逗号、未闭合引号或括号等）。'
        : '确认 data/base/manifest.json 存在且可读。',
      manifestFile.status === 'json-error' ? [manifestFile.message] : [],
    );
    return { ok: false, manifest: null, resources: [], problems, notes: [] };
  }
  const manifest = manifestFile.data;

  const schemaDir = path.resolve(root, 'data/schema');
  const ajv = new Ajv({ allErrors: true });
  const validators = new Map();
  const compileSchema = async (schemaId) => {
    if (validators.has(schemaId)) return validators.get(schemaId);
    const file = path.resolve(schemaDir, `${schemaId}.schema.json`);
    const loaded = await readJsonFile(file);
    if (loaded.status !== 'ok') {
      validators.set(schemaId, { status: 'schema-missing', file });
      return validators.get(schemaId);
    }
    try {
      const validate = ajv.compile(loaded.data);
      validators.set(schemaId, { status: 'ok', validate, file });
      return validators.get(schemaId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      validators.set(schemaId, { status: 'schema-missing', file, reason });
      return validators.get(schemaId);
    }
  };

  // Manifest self-check first: the schema pins structure, the local audit
  // re-checks traversal-safe paths so a broken schema can never widen it.
  const manifestSchema = await compileSchema('manifest');
  let manifestValid = false;
  if (manifestSchema.status !== 'ok') {
    reportProblem(
      manifestSchema.file,
      'manifest schema 不可用，无法校验清单',
      '修复 data/schema/manifest.schema.json（存在、合法 JSON、合法 JSON Schema）后重试。',
      manifestSchema.reason === undefined ? [] : [manifestSchema.reason],
    );
  } else if (!manifestSchema.validate(manifest)) {
    reportProblem(
      manifestPath,
      '清单不符合 manifest schema',
      '按下列错误修正 data/base/manifest.json（resources[].id/path/schema、enabledMods）。',
      formatSchemaErrors(manifestSchema.validate.errors),
    );
  } else {
    manifestValid = true;
  }

  const manifestObject = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)
    ? manifest
    : {};
  const resources = Array.isArray(manifestObject.resources) ? manifestObject.resources : [];
  const enabledMods = Array.isArray(manifestObject.enabledMods) ? manifestObject.enabledMods : [];
  if (!manifestValid) {
    // Without a trustworthy manifest there is nothing safe to walk.
    return { ok: false, manifest, resources: [], problems, notes: [], enabledMods };
  }
  for (const modId of enabledMods) {
    if (!isSafeModId(modId)) {
      reportProblem(
        manifestPath,
        `enabledMods 条目 "${modId}" 不是安全的单一目录名`,
        'MOD id 只能是 mods/ 下的一级目录名（字母/数字/_/-/点/中文，禁止路径分隔符与穿越）。',
      );
    }
  }

  const inspected = [];
  for (const resource of resources) {
    const { id, path: resourcePath, schema: schemaId } = resource;
    if (typeof id !== 'string' || typeof resourcePath !== 'string' || typeof schemaId !== 'string') {
      reportProblem(manifestPath, `资源条目 ${JSON.stringify(resource)} 字段不完整`, '每项资源需要字符串 id、path 与 schema。');
      continue;
    }
    if (!isSafeRelativePath(resourcePath)) {
      reportProblem(
        manifestPath,
        `资源 "${id}" 的 path "${resourcePath}" 不安全`,
        'path 必须是 data/base/ 下的安全相对路径（禁止反斜杠、绝对路径与目录穿越）。',
      );
      continue;
    }

    const validator = await compileSchema(schemaId);
    const entry = {
      id,
      path: resourcePath,
      schema: schemaId,
      base: { status: 'missing' },
      layers: [],
      finalSource: null,
    };

    // Base layer: an unreadable base is always a problem — overrides
    // extend a base, they cannot rescue a missing one.
    const baseFile = path.resolve(root, 'data/base', resourcePath);
    const baseLoaded = await readJsonFile(baseFile);
    if (baseLoaded.status !== 'ok') {
      entry.base = { status: baseLoaded.status };
      reportProblem(
        baseFile,
        `基础资源 ${STATUS_LABELS[baseLoaded.status] ?? '不可读'}`,
        baseLoaded.status === 'json-error'
          ? `修复 ${baseFile} 的 JSON 语法后重试。`
          : baseLoaded.status === 'missing'
            ? `确认 ${baseFile} 存在且 manifest 的 path 拼写正确。`
            : `确认 ${baseFile} 可读（${baseLoaded.message ?? 'IO 错误'}）。`,
        baseLoaded.status === 'json-error' ? [baseLoaded.message] : [],
      );
    } else if (validator.status !== 'ok') {
      entry.base = { status: 'schema-missing' };
      reportProblem(
        validator.file,
        `资源 "${id}" 引用的 schema 不可用`,
        `修复 ${validator.file}（存在、合法 JSON、合法 JSON Schema）后重试。`,
        validator.reason === undefined ? [] : [validator.reason],
      );
    } else if (!validator.validate(baseLoaded.data)) {
      entry.base = { status: 'schema-error', errors: formatSchemaErrors(validator.validate.errors) };
      reportProblem(
        baseFile,
        '基础资源不符合 schema',
        `按下列错误修正 ${baseFile}（schema：${validator.file}）。`,
        entry.base.errors,
      );
    } else {
      entry.base = { status: 'ok' };
      entry.finalSource = 'base';
    }
    const baseIsValid = entry.base.status === 'ok';

    // Override layers in enabledMods order: later valid wins, a rejected
    // override keeps the previous valid layer — the runtime's exact rule.
    for (const modId of enabledMods) {
      if (!isSafeModId(modId)) continue; // already reported above
      const overrideFile = path.resolve(root, 'mods', modId, resourcePath);
      const loaded = await readJsonFile(overrideFile);
      if (loaded.status === 'missing') {
        entry.layers.push({ modId, status: 'none' });
        continue;
      }
      if (loaded.status !== 'ok') {
        entry.layers.push({ modId, status: loaded.status });
        reportProblem(
          overrideFile,
          `MOD 覆盖 ${STATUS_LABELS[loaded.status] ?? '不可读'}`,
          loaded.status === 'io-error'
            ? `确认 ${overrideFile} 可读（${loaded.message ?? 'IO 错误'}）。`
            : `修复 ${overrideFile} 的 JSON 语法后重试，或从 data/base/manifest.json 的 enabledMods 中移除 "${modId}"。`,
          loaded.status === 'json-error' ? [loaded.message] : [],
        );
        continue;
      }
      if (validator.status !== 'ok') {
        // Without a schema nothing can be validated; the base problem above
        // already explains it — do not double-report per mod layer.
        entry.layers.push({ modId, status: 'schema-missing' });
        continue;
      }
      if (!validator.validate(loaded.data)) {
        const errors = formatSchemaErrors(validator.validate.errors);
        entry.layers.push({ modId, status: 'schema-error', errors });
        reportProblem(
          overrideFile,
          'MOD 覆盖不符合 schema，运行时将保留上一有效版本',
          `按下列错误修正 ${overrideFile}（schema：${validator.file}），或从 enabledMods 中移除 "${modId}"。`,
          errors,
        );
        continue;
      }
      entry.layers.push({ modId, status: 'ok' });
      if (baseIsValid) {
        entry.finalSource = `mod:${modId}`;
      }
    }

    inspected.push(entry);
  }

  return {
    ok: problems.length === 0,
    manifest,
    resources: inspected,
    enabledMods,
    problems,
    notes: [
      '覆盖为整文件替换：后声明且校验通过的层获胜，被拒绝的覆盖不改变上一有效来源。',
      '跨资源语义校验（引用闭合、坐标/占格、历法分区等）由游戏运行时加载器在装配时执行，本命令仅静态校验 JSON 与 schema。',
    ],
  };
}

function printReport(report) {
  const lines = [];
  if (report.manifest === null) {
    lines.push('清单不可读，无法继续检查。');
  } else {
    const order = report.enabledMods.length > 0
      ? report.enabledMods.join(' → ') + '（后声明者优先）'
      : '未启用任何 MOD';
    lines.push(`启用 MOD：${order}`);
    lines.push(`资源 ${report.resources.length} 项 · 问题 ${report.problems.length} 条`);
    lines.push('');
    report.resources.forEach((entry, index) => {
      lines.push(`[${index + 1}/${report.resources.length}] ${entry.id}（${entry.path}，schema：${entry.schema}）`);
      lines.push(`  基础层 ${STATUS_LABELS[entry.base.status] ?? entry.base.status}`);
      for (const layer of entry.layers) {
        lines.push(`  ${layer.modId} ${STATUS_LABELS[layer.status] ?? layer.status}`);
      }
      lines.push(
        entry.finalSource === null
          ? '  最终来源：无有效层（运行时将按缺失/降级处理）'
          : `  最终来源：${entry.finalSource}`,
      );
    });
  }
  if (report.problems.length > 0) {
    lines.push('');
    lines.push(`问题（${report.problems.length}）：`);
    report.problems.forEach((problem, index) => {
      lines.push(`  ${index + 1}. ${problem.file}`);
      lines.push(`     ${problem.message}`);
      for (const detail of problem.details.slice(0, 4)) lines.push(`     · ${detail}`);
      if (problem.details.length > 4) lines.push(`     · …共 ${problem.details.length} 条`);
      lines.push(`     修复：${problem.hint}`);
    });
  }
  lines.push('');
  for (const note of report.notes) lines.push(`说明：${note}`);
  console.log(lines.join('\n'));
}

const invokedDirectly = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const report = await inspectMods(projectRoot);
  printReport(report);
  if (!report.ok) {
    process.exitCode = 1;
  }
}
