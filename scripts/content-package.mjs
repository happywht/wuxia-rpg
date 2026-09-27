#!/usr/bin/env node
/**
 * Round 37 MOD content-package exporter/importer.
 *
 * Export (`export --mod <modId>`): migrates a legacy no-metadata mod layout
 * (`mods/<modId>/<data/base-relative path>`) into a deterministic single-file
 * v1 package (`.wuxia.json`). Only files whose relative path is registered in
 * the target repo's `data/base/manifest.json` are read; each document is
 * parsed, validated against its registered schema, and digested as SHA-256 of
 * the canonical JSON (recursively key-sorted, compact, UTF-8) so formatting
 * never changes the checksum. Resources are emitted in manifest order.
 *
 * Import (`import <file>`): read-only preflight by default — size cap, full
 * package-schema validation, formatVersion/engine compatibility, duplicate and
 * unregistered resource ids, per-resource checksum and current-schema checks.
 * `--apply` additionally installs: the whole package is validated first, then
 * written to a same-drive staging dir under `mods/` and renamed into a fresh
 * `mods/<package.id>/` directory (conflict check runs after staging, so a
 * refused target also proves the staging cleanup). The base manifest is never
 * touched, the mod is never enabled, and the package carries no file paths —
 * every install location is resolved from the local trusted manifest by
 * resource id.
 *
 * Scope: static JSON/schema/compatibility checking only. Cross-resource
 * semantic assembly (id references, coordinates, calendar partitions, …)
 * stays with the runtime game loader.
 */

import { readFile, writeFile, stat, mkdir, rm, rename, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SUPPORTED_FORMAT_VERSION = 1;
/** Hard cap on package files before they are even read into memory. */
export const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
export const PACKAGE_EXTENSION = '.wuxia.json';

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

function isSafePackageId(value) {
  return typeof value === 'string' && isSafeRelativePath(value) && !value.includes('/');
}

function formatSchemaErrors(errors) {
  return (errors ?? []).map((error) => {
    if (error.keyword === 'additionalProperties') {
      const extra = error.params?.additionalProperty;
      if (extra === 'path' || extra === 'targetPath' || extra === 'file') {
        return `（资源条目）：包内不得携带文件路径字段 "${extra}"——安装路径由本地 manifest 的资源登记决定`;
      }
      return `（资源条目）：不允许的附加属性 "${extra}"`;
    }
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

// ---------------------------------------------------------------------------
// Canonical JSON + digest
// ---------------------------------------------------------------------------

/**
 * Canonical JSON text: object keys sorted recursively (UTF-16 code-unit
 * order), no whitespace, UTF-8 encoding. Semantically equal documents always
 * produce equal bytes regardless of source formatting.
 */
export function canonicalJsonText(value) {
  const canonicalize = (node) => {
    if (Array.isArray(node)) return node.map(canonicalize);
    if (node !== null && typeof node === 'object') {
      // A null-prototype object preserves the JSON key "__proto__" as data
      // instead of invoking Object.prototype's legacy setter.
      const sorted = Object.create(null);
      for (const key of Object.keys(node).sort()) sorted[key] = canonicalize(node[key]);
      return sorted;
    }
    return node;
  };
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 (lowercase hex) of the canonical JSON encoding of `value`. */
export function sha256OfJson(value) {
  return createHash('sha256').update(Buffer.from(canonicalJsonText(value), 'utf8')).digest('hex');
}

// ---------------------------------------------------------------------------
// Strict three-segment versions
// ---------------------------------------------------------------------------

/** Parses `X.Y.Z` (non-negative integers, nothing else) or returns null. */
export function parseStrictVersion(text) {
  if (typeof text !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (match === null) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** Compares two parsed triples: negative / 0 / positive. */
export function compareVersionTriples(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Shared repo loading (manifest + schema compilation)
// ---------------------------------------------------------------------------

async function loadRegistry(repo, problems) {
  const reportProblem = problems.push.bind(problems);
  const projectPackagePath = path.resolve(repo, 'package.json');
  const projectPackage = await readJsonFile(projectPackagePath);
  const engineVersion = projectPackage.status === 'ok'
    ? projectPackage.data?.version
    : null;
  if (parseStrictVersion(engineVersion) === null) {
    reportProblem({
      file: projectPackagePath,
      message: '目标仓库 package.json 缺少合法的三段数字 version',
      hint: '导入/导出需要目标游戏 package.json 中的 version 来判断内容包兼容性。',
      details: projectPackage.message === undefined ? [] : [projectPackage.message],
    });
    return null;
  }
  const manifestPath = path.resolve(repo, 'data/base/manifest.json');
  const manifestFile = await readJsonFile(manifestPath);
  if (manifestFile.status !== 'ok') {
    reportProblem({
      file: manifestPath,
      message: manifestFile.status === 'missing' ? '清单文件缺失' : `清单不可读（${manifestFile.status}）`,
      hint: '确认 data/base/manifest.json 存在、为合法 JSON 且可读。',
      details: manifestFile.message === undefined ? [] : [manifestFile.message],
    });
    return null;
  }
  const manifest = manifestFile.data;
  const schemaDir = path.resolve(repo, 'data/schema');
  const ajv = new Ajv({ allErrors: true });
  const validators = new Map();
  const compileSchema = async (schemaId) => {
    if (validators.has(schemaId)) return validators.get(schemaId);
    const file = path.resolve(schemaDir, `${schemaId}.schema.json`);
    const loaded = await readJsonFile(file);
    let entry = { status: 'schema-missing', file, reason: undefined };
    if (loaded.status === 'ok') {
      try {
        entry = { status: 'ok', validate: ajv.compile(loaded.data), file };
      } catch (error) {
        entry = { status: 'schema-missing', file, reason: error instanceof Error ? error.message : String(error) };
      }
    } else {
      entry = { status: 'schema-missing', file, reason: loaded.message };
    }
    validators.set(schemaId, entry);
    return entry;
  };

  // Trust but verify: the manifest decides every install path, so it must
  // itself pass its own schema before anything is resolved from it.
  const manifestSchema = await compileSchema('manifest');
  if (manifestSchema.status !== 'ok') {
    reportProblem({
      file: manifestSchema.file,
      message: 'manifest schema 不可用，无法信任清单',
      hint: '修复 data/schema/manifest.schema.json（存在、合法 JSON、合法 JSON Schema）后重试。',
      details: manifestSchema.reason === undefined ? [] : [manifestSchema.reason],
    });
    return null;
  }
  if (!manifestSchema.validate(manifest)) {
    reportProblem({
      file: manifestPath,
      message: '清单不符合 manifest schema',
      hint: '按下列错误修正 data/base/manifest.json 后重试。',
      details: formatSchemaErrors(manifestSchema.validate.errors),
    });
    return null;
  }

  const byId = new Map();
  const byPath = new Map();
  for (const resource of manifest.resources) {
    if (byId.has(resource.id)) {
      reportProblem({
        file: manifestPath,
        message: `清单资源 id "${resource.id}" 重复登记`,
        hint: '资源 id 必须唯一；请修正 data/base/manifest.json。',
      });
      continue;
    }
    if (!isSafeRelativePath(resource.path) || !resource.path.endsWith('.json')) {
      reportProblem({
        file: manifestPath,
        message: `清单资源 "${resource.id}" 的 path "${resource.path}" 不是安全的 JSON 相对路径`,
        hint: 'path 必须是无穿越段的 data/base/ 相对路径并以 .json 结尾。',
      });
      continue;
    }
    byId.set(resource.id, resource);
    if (byPath.has(resource.path)) {
      reportProblem({
        file: manifestPath,
        message: `清单路径 "${resource.path}" 被多个资源 id 重复登记`,
        hint: '每个资源路径只能对应一个资源 id，避免导入时不同条目互相覆盖。',
      });
      continue;
    }
    byPath.set(resource.path, resource);
  }
  return { manifest, manifestPath, byId, byPath, compileSchema, schemaDir, engineVersion };
}

// ---------------------------------------------------------------------------
// Export: legacy mod directory -> v1 package object
// ---------------------------------------------------------------------------

async function collectJsonFiles(directory, prefix = '') {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return found;
    throw error;
  }
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await collectJsonFiles(path.join(directory, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      found.push(relative);
    }
  }
  return found.sort();
}

/**
 * Builds a v1 package object from a legacy `mods/<modId>/` directory.
 * Returns { ok, problems, package }. Read-only: nothing is written.
 */
export async function buildModPackage(options) {
  const {
    repo = projectRoot,
    modId,
    packageId,
    name,
    version = '1.0.0',
    description,
    author,
  } = options;
  const problems = [];
  const fail = (message, hint, details = []) => problems.push({ file: null, message, hint, details });

  if (!isSafePackageId(modId)) {
    fail(
      `MOD id "${modId}" 不是安全的单一目录名`,
      'MOD id 只能是 mods/ 下的一级目录名（字母/数字/_/-/点/中文，禁止路径分隔符与穿越）。',
    );
    return { ok: false, problems, package: null };
  }
  const id = packageId ?? modId;
  if (!isSafePackageId(id)) {
    fail(
      `包 id "${id}" 不是安全的单一目录名`,
      '包 id 将成为安装目录名，只能使用字母/数字/_/-/点/中文，禁止路径分隔符与穿越。',
    );
    return { ok: false, problems, package: null };
  }
  if (parseStrictVersion(version) === null) {
    fail(`包版本 "${version}" 不是严格三段数字（X.Y.Z）`, '例如 1.0.0、0.2.13；不支持前缀、后缀或两段版本。');
    return { ok: false, problems, package: null };
  }

  const registry = await loadRegistry(repo, problems);
  if (registry === null) return { ok: false, problems, package: null };

  const modDir = path.resolve(repo, 'mods', modId);
  const files = await collectJsonFiles(modDir);
  if (files.length === 0) {
    fail(`MOD 目录 ${modDir} 中没有可导出的 JSON 文件`, '确认目录存在且包含按 data/base 相对路径存放的 JSON 覆盖。');
    return { ok: false, problems, package: null };
  }

  const exported = [];
  for (const resource of registry.manifest.resources) {
    if (!files.includes(resource.path)) continue;
    const file = path.resolve(modDir, resource.path.split('/').join(path.sep));
    const loaded = await readJsonFile(file);
    if (loaded.status !== 'ok') {
      problems.push({
        file,
        message: loaded.status === 'json-error' ? 'JSON 解析失败' : `文件不可读（${loaded.status}）`,
        hint: loaded.status === 'json-error' ? `修复 ${file} 的 JSON 语法后重试。` : `确认 ${file} 存在且可读。`,
        details: loaded.message === undefined ? [] : [loaded.message],
      });
      continue;
    }
    const validator = await registry.compileSchema(resource.schema);
    if (validator.status !== 'ok') {
      problems.push({
        file: validator.file,
        message: `资源 "${resource.id}" 引用的 schema 不可用`,
        hint: `修复 ${validator.file}（存在、合法 JSON、合法 JSON Schema）后重试。`,
        details: validator.reason === undefined ? [] : [validator.reason],
      });
      continue;
    }
    if (!validator.validate(loaded.data)) {
      problems.push({
        file,
        message: 'MOD 覆盖不符合 schema',
        hint: `按下列错误修正 ${file}（schema：${validator.file}）。`,
        details: formatSchemaErrors(validator.validate.errors),
      });
      continue;
    }
    exported.push({ id: resource.id, sha256: sha256OfJson(loaded.data), data: loaded.data });
  }

  // Every JSON file in the mod dir must map to a registered manifest path —
  // an unregistered file means the package would silently drop content.
  const unregistered = files.filter((relative) => !registry.byPath.has(relative));
  for (const relative of unregistered) {
    problems.push({
      file: path.resolve(modDir, relative.split('/').join(path.sep)),
      message: `文件 "${relative}" 不对应清单已登记资源`,
      hint: '导出只迁移 manifest 已登记路径的覆盖；请把文件移到登记路径，或在 data/base/manifest.json 登记该资源。',
    });
  }
  if (exported.length === 0) {
    problems.push({
      file: modDir,
      message: '没有可导出的已登记资源',
      hint: 'MOD 目录中的 JSON 必须与 manifest 登记路径一致才能导出。',
    });
    return { ok: false, problems, package: null };
  }

  const packageObject = {
    formatVersion: SUPPORTED_FORMAT_VERSION,
    package: {
      id,
      name: name ?? modId,
      version,
      ...(description === undefined ? {} : { description }),
      ...(author === undefined ? {} : { author }),
    },
    minimumEngineVersion: registry.engineVersion,
    resources: exported,
  };
  const packageBytes = Buffer.byteLength(serializePackage(packageObject), 'utf8');
  if (packageBytes > MAX_PACKAGE_BYTES) {
    fail(
      `导出包为 ${packageBytes} 字节，超过导入上限 ${MAX_PACKAGE_BYTES} 字节`,
      '内容包单文件上限为 10 MiB；请拆分 MOD 资源后分别导出。',
    );
    return { ok: false, problems, package: null };
  }
  const packageSchema = await registry.compileSchema('content-package');
  if (packageSchema.status !== 'ok') {
    fail(
      '内容包 schema 不可用，无法验证导出结果',
      `修复 ${packageSchema.file}（存在、合法 JSON、合法 JSON Schema）后重试。`,
      packageSchema.reason === undefined ? [] : [packageSchema.reason],
    );
    return { ok: false, problems, package: null };
  }
  if (!packageSchema.validate(packageObject)) {
    fail(
      '导出内容包不符合 content-package schema',
      '修正包 id/名称/作者/说明等元数据以符合 data/schema/content-package.schema.json。',
      formatSchemaErrors(packageSchema.validate.errors),
    );
    return { ok: false, problems, package: null };
  }
  return { ok: problems.length === 0, problems, package: packageObject };
}

/** Deterministic on-disk serialization of a package object. */
export function serializePackage(packageObject) {
  return `${JSON.stringify(packageObject, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Import: read-only preflight (inspect) + explicit staged apply
// ---------------------------------------------------------------------------

async function loadPackageBytes(options, problems) {
  const { packageFile, maxPackageBytes = MAX_PACKAGE_BYTES } = options;
  if (typeof packageFile !== 'string') {
    problems.push({ file: null, message: '未提供包文件路径', hint: '用法：content:import -- <file.wuxia.json> [--apply]。' });
    return { bytes: null, text: null };
  }
  let size;
  try {
    size = (await stat(packageFile)).size;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    problems.push({ file: packageFile, message: '包文件不可读', hint: `确认 ${packageFile} 存在且可读。`, details: [reason] });
    return { bytes: null, text: null };
  }
  if (size > maxPackageBytes) {
    problems.push({
      file: packageFile,
      message: `包文件 ${size} 字节，超过上限 ${maxPackageBytes} 字节`,
      hint: '内容包是单个 JSON 文件，不应携带超大内容；请拆分或减小包体。',
    });
    return { bytes: null, text: null };
  }
  try {
    const text = await readFile(packageFile, 'utf8');
    return { bytes: size, text };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    problems.push({ file: packageFile, message: '包文件读取失败', hint: `确认 ${packageFile} 可读。`, details: [reason] });
    return { bytes: null, text: null };
  }
}

/**
 * Read-only preflight of a package against a repo. Accepts a package file or
 * an in-memory package object (bytes then report the caller-supplied source).
 * Returns { ok, problems, package, report } — nothing is written.
 */
export async function inspectPackage(options) {
  const { repo = projectRoot, packageObject: providedObject, maxPackageBytes } = options;
  const problems = [];
  let packageObject = providedObject;
  let sourceLabel = options.packageFile ?? '内存包对象';

  if (packageObject === undefined) {
    const { text } = await loadPackageBytes(options, problems);
    if (text === null) return { ok: false, problems, package: null, report: null };
    try {
      packageObject = JSON.parse(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push({
        file: sourceLabel,
        message: '包不是合法 JSON',
        hint: `修复 ${sourceLabel} 的 JSON 语法（多余/缺失逗号、未闭合引号或括号等）。`,
        details: [reason],
      });
      return { ok: false, problems, package: null, report: null };
    }
  }

  const registry = await loadRegistry(repo, problems);
  if (registry === null) return { ok: false, problems, package: null, report: null };

  const packageSchemaFile = path.resolve(registry.schemaDir, 'content-package.schema.json');
  const packageSchema = await registry.compileSchema('content-package');
  if (packageSchema.status !== 'ok') {
    problems.push({
      file: packageSchemaFile,
      message: '内容包 schema 不可用，无法校验包结构',
      hint: `修复 ${packageSchemaFile}（存在、合法 JSON、合法 JSON Schema）后重试。`,
      details: packageSchema.reason === undefined ? [] : [packageSchema.reason],
    });
    return { ok: false, problems, package: null, report: null };
  }
  if (!packageSchema.validate(packageObject)) {
    problems.push({
      file: sourceLabel,
      message: '包不符合 content-package schema',
      hint: '按下列错误修正包结构（formatVersion/package/minimumEngineVersion/resources[].id+sha256+data，禁止附加字段）。',
      details: formatSchemaErrors(packageSchema.validate.errors),
    });
  }

  const report = {
    source: sourceLabel,
    formatVersion: null,
    packageId: null,
    packageName: null,
    packageVersion: null,
    minimumEngineVersion: null,
    engineVersion: registry.engineVersion,
    resources: [],
    notes: [
      '包内不携带文件路径：安装路径由当前仓库 manifest 的资源登记按 id 解析。',
      '本命令只做静态 JSON/schema/兼容性校验；跨资源语义装配仍由游戏运行时加载器执行。',
    ],
  };

  // Version gates: reject unknown/future formats and incompatible engines
  // with readable messages before touching any resource payload.
  const declaredFormat = packageObject?.formatVersion;
  if (
    typeof packageObject === 'object' && packageObject !== null &&
    (typeof declaredFormat === 'number' || typeof declaredFormat === 'string')
  ) {
    if (declaredFormat !== SUPPORTED_FORMAT_VERSION) {
      problems.push({
        file: sourceLabel,
        message: `包声明 formatVersion ${typeof declaredFormat === 'number' ? declaredFormat : JSON.stringify(declaredFormat)}，本工具只支持 ${SUPPORTED_FORMAT_VERSION}`,
        hint: declaredFormat > SUPPORTED_FORMAT_VERSION
          ? '该包可能由更新版本的工具导出；请升级引擎/工具后重试，或向包作者索取 v1 包。'
          : '包格式版本非法（合法最小值为 1）；请用官方工具重新导出。',
      });
    }
  }
  const meta = packageObject?.package;
  if (typeof meta === 'object' && meta !== null) {
    report.packageId = typeof meta.id === 'string' ? meta.id : null;
    report.packageName = typeof meta.name === 'string' ? meta.name : null;
    report.packageVersion = typeof meta.version === 'string' ? meta.version : null;
    if (typeof meta.id === 'string' && !isSafePackageId(meta.id)) {
      problems.push({
        file: sourceLabel,
        message: `包 id "${meta.id}" 不是安全的单一目录名`,
        hint: '包 id 将成为 mods/ 下的一级安装目录，禁止路径分隔符、穿越与以点开头的段。',
      });
    }
    if (typeof meta.version === 'string' && parseStrictVersion(meta.version) === null) {
      problems.push({
        file: sourceLabel,
        message: `包版本 "${meta.version}" 不是可比较的安全三段数字版本`,
        hint: '包版本各段必须是可精确表示的非负整数；请重新导出并使用较小的 X.Y.Z 版本号。',
      });
    }
  }
  report.formatVersion = typeof declaredFormat === 'number' ? declaredFormat : null;
  const declaredEngine = packageObject?.minimumEngineVersion;
  report.minimumEngineVersion = typeof declaredEngine === 'string' ? declaredEngine : null;
  if (typeof declaredEngine === 'string') {
    const required = parseStrictVersion(declaredEngine);
    const current = parseStrictVersion(registry.engineVersion);
    if (required === null) {
      problems.push({
        file: sourceLabel,
        message: `最低引擎版本 "${declaredEngine}" 不是严格三段数字（X.Y.Z）`,
        hint: '引擎只接受严格三段数字版本；宽松或带前缀的版本串一律拒绝。',
      });
    } else if (current !== null && compareVersionTriples(required, current) > 0) {
      problems.push({
        file: sourceLabel,
        message: `包要求引擎 ≥ ${declaredEngine}，当前引擎为 ${registry.engineVersion}`,
        hint: '请升级引擎后重试，或向包作者索取兼容当前引擎的版本。',
      });
    }
  }

  const resourceList = Array.isArray(packageObject?.resources) ? packageObject.resources : [];
  const seenIds = new Set();
  for (const entry of resourceList) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
    if (seenIds.has(entry.id)) {
      problems.push({
        file: sourceLabel,
        message: `资源 id "${entry.id}" 在包内重复出现`,
        hint: '每个资源 id 在包内只能出现一次；请移除重复条目。',
      });
      continue;
    }
    seenIds.add(entry.id);
    const registered = registry.byId.get(entry.id);
    if (registered === undefined) {
      problems.push({
        file: sourceLabel,
        message: `资源 id "${entry.id}" 未在当前仓库 manifest 登记`,
        hint: '包只能覆盖目标仓库已登记的资源；请确认 manifest 中存在该 id，或联系包作者适配。',
      });
      report.resources.push({ id: entry.id, path: null, schema: null, checksum: 'unknown', schemaCheck: 'unknown' });
      continue;
    }
    if (!isSafeRelativePath(registered.path)) {
      // Defensive: loadRegistry already schema-checked the manifest; a path
      // here would mean a hand-crafted manifest bypassing the schema.
      problems.push({
        file: registry.manifestPath,
        message: `清单资源 "${registered.id}" 的 path "${registered.path}" 不安全`,
        hint: 'path 必须是 data/base/ 下的安全相对路径（禁止反斜杠、绝对路径与目录穿越）。',
      });
      continue;
    }
    const outcome = { id: entry.id, path: registered.path, schema: registered.schema, checksum: 'ok', schemaCheck: 'ok' };
    if (sha256OfJson(entry.data) !== entry.sha256) {
      outcome.checksum = 'mismatch';
      problems.push({
        file: sourceLabel,
        message: `资源 "${entry.id}" 校验和不匹配`,
        hint: '数据与导出时不一致（被篡改或损坏）；请向包作者重新获取该包。',
      });
    }
    const validator = await registry.compileSchema(registered.schema);
    if (validator.status !== 'ok') {
      outcome.schemaCheck = 'schema-missing';
      problems.push({
        file: validator.file,
        message: `资源 "${entry.id}" 引用的 schema 不可用`,
        hint: `修复 ${validator.file}（存在、合法 JSON、合法 JSON Schema）后重试。`,
        details: validator.reason === undefined ? [] : [validator.reason],
      });
    } else if (!validator.validate(entry.data)) {
      outcome.schemaCheck = 'mismatch';
      problems.push({
        file: sourceLabel,
        message: `资源 "${entry.id}" 的数据不符合当前 schema（${registered.schema}）`,
        hint: `按下列错误修正包内数据（schema：${validator.file}）；目标仓库可能已升级资料协议。`,
        details: formatSchemaErrors(validator.validate.errors),
      });
    }
    report.resources.push(outcome);
  }

  return { ok: problems.length === 0, problems, package: packageObject, report };
}

/**
 * Installs a package after full preflight. Validation happens for the whole
 * package before any byte is written; files then land in a same-drive staging
 * directory under `mods/` and are renamed into `mods/<package.id>/` only when
 * that target does not exist (checked after staging, which also exercises the
 * cleanup path on conflict). The base manifest is never modified and the mod
 * is never enabled. Returns { ok, problems, installedPath }.
 */
export async function applyPackage(options) {
  const { repo = projectRoot } = options;
  const inspected = await inspectPackage(options);
  if (!inspected.ok || inspected.package === null) {
    return { ok: false, problems: inspected.problems, installedPath: null, report: inspected.report };
  }
  const meta = inspected.package.package;
  const targetDir = path.resolve(repo, 'mods', meta.id);
  const modsDir = path.resolve(repo, 'mods');
  const stagingDir = path.resolve(modsDir, `.staging-${process.pid}-${randomBytes(8).toString('hex')}`);
  const fail = (message, hint, details = []) => ({
    ok: false,
    problems: [...inspected.problems, { file: targetDir, message, hint, details }],
    installedPath: null,
    report: inspected.report,
  });
  let stagingCreated = false;

  try {
    await mkdir(modsDir, { recursive: true });
    await mkdir(stagingDir); // exclusive: never reuse or clean another import's staging dir
    stagingCreated = true;
    for (const entry of inspected.package.resources) {
      const registered = inspected.report.resources.find((resource) => resource.id === entry.id);
      const relativePath = registered.path.split('/').join(path.sep);
      const target = path.resolve(stagingDir, relativePath);
      // Belt and braces: never write outside the staging dir even if the
      // manifest were hand-crafted with traversal segments.
      if (!target.startsWith(stagingDir + path.sep)) {
        throw new Error(`资源 "${entry.id}" 的登记路径 "${registered.path}" 越出安装目录`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(entry.data, null, 2)}\n`, 'utf8');
    }
    // Conflict check after staging: a refused target proves staging cleanup,
    // and sitting right before rename minimizes the race window.
    if (existsSync(targetDir)) {
      await rm(stagingDir, { recursive: true, force: true });
      stagingCreated = false;
      return fail(
        `安装目标 ${targetDir} 已存在`,
        '导入不会覆盖已有目录；如需重装请先手动移除或重命名该目录（并自行确认其内容）。',
      );
    }
    try {
      await rename(stagingDir, targetDir);
      stagingCreated = false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await rm(stagingDir, { recursive: true, force: true });
      stagingCreated = false;
      return fail('安装收尾失败（移动暂存目录出错）', '目标目录可能刚被创建；请检查后重试。', [reason]);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (stagingCreated) {
      await rm(stagingDir, { recursive: true, force: true });
    }
    return fail('安装失败（已清理暂存目录）', '请根据下列原因修正后重试。', [reason]);
  }

  return {
    ok: true,
    problems: inspected.problems,
    installedPath: path.join('mods', meta.id),
    report: inspected.report,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printProblems(problems) {
  if (problems.length === 0) return;
  console.error(`问题（${problems.length}）：`);
  problems.forEach((problem, index) => {
    console.error(`  ${index + 1}. ${problem.file ?? '（包/参数）'}`);
    console.error(`     ${problem.message}`);
    for (const detail of problem.details.slice(0, 4)) console.error(`     · ${detail}`);
    if (problem.details.length > 4) console.error(`     · …共 ${problem.details.length} 条`);
    console.error(`     修复：${problem.hint}`);
  });
}

function printReport(report) {
  if (report === null) return;
  const idPart = report.packageId ?? '（未知）';
  const namePart = report.packageName ?? '';
  const versionPart = report.packageVersion ?? '';
  console.log(`包：${idPart} ${versionPart}${namePart === '' ? '' : `（${namePart}）`}`);
  console.log(
    `formatVersion ${report.formatVersion ?? '？'}（本工具支持 ${SUPPORTED_FORMAT_VERSION}）· ` +
    `最低引擎 ${report.minimumEngineVersion ?? '？'} / 当前 ${report.engineVersion}`,
  );
  if (report.resources.length > 0) {
    console.log(`资源 ${report.resources.length} 项：`);
    report.resources.forEach((resource, index) => {
      const checksum = resource.checksum === 'ok' ? '校验和 ✓' : resource.checksum === 'mismatch' ? '校验和 ✗' : '校验和 —';
      const schema = resource.schemaCheck === 'ok' ? 'schema ✓' : resource.schemaCheck === 'mismatch' ? 'schema ✗' : 'schema —';
      const target = resource.path === null ? '（未登记）' : `→ ${resource.path}（schema：${resource.schema}）`;
      console.log(`  [${index + 1}/${report.resources.length}] ${resource.id} ${target} ${checksum} ${schema}`);
    });
  }
  for (const note of report.notes) console.log(`说明：${note}`);
}

const USAGE = `用法：
  content-package.mjs export --mod <modId> [--id <包id>] [--name <名称>] [--version X.Y.Z]
                             [--description <说明>] [--author <作者>] [--out <文件>] [--repo <根目录>]
  content-package.mjs import <file.wuxia.json> [--repo <根目录>] [--apply]

export：把 mods/<modId>/ 下按 data/base 相对路径存放的传统 MOD 导出为 v1 单文件包（默认 <包id>.wuxia.json）。
import：默认只读预检；--apply 才安装到 mods/<包id>/ 新目录（不改 manifest、不自动启用、不覆盖已有目录）。`;

async function runCliExport(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key.startsWith('--') || index + 1 >= args.length) {
      console.error(`export 参数错误："${key}"。${USAGE}`);
      process.exitCode = 1;
      return;
    }
    options[key.slice(2)] = args[index + 1];
  }
  if (options.mod === undefined) {
    console.error(`缺少 --mod。\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const result = await buildModPackage({
    repo: options.repo === undefined ? projectRoot : path.resolve(options.repo),
    modId: options.mod,
    packageId: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    author: options.author,
  });
  if (!result.ok) {
    printProblems(result.problems);
    process.exitCode = 1;
    return;
  }
  const packageId = result.package.package.id;
  const outFile = options.out === undefined
    ? path.resolve(process.cwd(), `${packageId}${PACKAGE_EXTENSION}`)
    : path.resolve(options.out);
  await mkdir(path.dirname(outFile), { recursive: true });
  try {
    await writeFile(outFile, serializePackage(result.package), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'EEXIST') {
      console.error(`导出目标 ${outFile} 已存在；为避免覆盖，请选择新的 --out 路径。`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  console.log(`已导出：${outFile}`);
  console.log(`包：${packageId} ${result.package.package.version}（${result.package.package.name}）`);
  console.log(`资源 ${result.package.resources.length} 项：`);
  result.package.resources.forEach((resource, index) => {
    console.log(`  [${index + 1}/${result.package.resources.length}] ${resource.id}（sha256 ${resource.sha256.slice(0, 12)}…）`);
  });
  console.log(`说明：最低引擎版本 ${result.package.minimumEngineVersion}（目标仓库引擎 ${result.package.minimumEngineVersion}）；资源按清单顺序排列，校验和基于递归键排序的规范 JSON。`);
}

async function runCliImport(args) {
  const positional = [];
  const flags = new Set();
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      flags.add('apply');
    } else if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
    } else if (arg.startsWith('--')) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('--')) {
        console.error(`import 参数错误："${arg}"。${USAGE}`);
        process.exitCode = 1;
        return;
      }
      options[arg.slice(2)] = next;
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    console.error(`需要恰好一个包文件参数。${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const packageFile = path.resolve(positional[0]);
  const repo = options.repo === undefined ? projectRoot : path.resolve(options.repo);
  const run = flags.has('apply')
    ? await applyPackage({ repo, packageFile })
    : await inspectPackage({ repo, packageFile });
  console.log(flags.has('apply') ? `安装预检并应用：${packageFile}` : `只读预检：${packageFile}`);
  printReport(run.report);
  if (!run.ok) {
    printProblems(run.problems);
    process.exitCode = 1;
    return;
  }
  if (flags.has('apply')) {
    console.log(`已安装：${run.installedPath}（${run.report.resources.length} 个资源）`);
    console.log('未启用：如需启用，请手动将包 id 加入 data/base/manifest.json 的 enabledMods（见 docs/DATA-GUIDE.md §5）。');
  } else {
    console.log('预检通过：未写入任何文件。加 --apply 安装到 mods/ 下的新目录（不启用、不改 manifest）。');
  }
}

const invokedDirectly = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'export') {
    await runCliExport(args);
  } else if (command === 'import') {
    await runCliImport(args);
  } else {
    console.error(command === undefined ? '缺少子命令。' : `未知子命令 "${command}"。`);
    console.error(USAGE);
    process.exitCode = 1;
  }
}
