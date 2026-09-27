/**
 * Generic manifest-driven JSON data loader.
 *
 * Fetches `base/manifest.json`, validates it against the manifest schema,
 * loads the JSON Schema referenced by each resource and validates both the
 * base document under `base/<path>` and every enabled MOD override under
 * `mods/<modId>/<path>`. MODs are applied in `enabledMods` order; an invalid
 * override never replaces the previous valid value. Every failure (missing
 * manifest, non-JSON SPA fallback responses, HTTP errors, malformed JSON,
 * schema violations, unsafe paths) becomes a structured diagnostic instead of
 * an exception, and each resource outcome is announced on the event bus.
 *
 * Cross-field semantics (grid row/column lengths, spawn walkability, …) stay
 * with the format-specific parsers such as `parseGridMap` — schemas here only
 * pin down static structure, and no custom Ajv keywords are used.
 *
 * URL layout (Vite serves `data/` as publicDir and `mods/` via a plugin):
 * - manifest:  `<base>/base/manifest.json`
 * - schemas:   `<base>/schema/<schemaId>.schema.json`
 * - resources: `<base>/base/<resource.path>`
 * - overrides: `<base>/mods/<modId>/<resource.path>`
 */

import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv';

import { type EventBus } from './event-bus';

/** Shape of `data/base/manifest.json` (contract: `data/schema/manifest.schema.json`). */
export interface ManifestResource {
  id: string;
  path: string;
  schema: string;
}

export interface GameManifest {
  resources: ManifestResource[];
  enabledMods: string[];
}

export type SemanticValidator = (value: unknown) => readonly string[];

/** Which physical copy a loaded value came from. */
export type ResourceSource = { kind: 'base' } | { kind: 'mod'; modId: string };

export interface LoadedResource {
  id: string;
  /** Schema family from the manifest, used by generic multi-resource assemblers. */
  schema: string;
  /** Schema-valid raw JSON; format-specific parsing is up to the consumer. */
  value: unknown;
  source: ResourceSource;
}

/**
 * One recoverable load problem. `resource` is set when tied to a single
 * resource and absent for manifest/schema-level problems; `origin` names the
 * stage (`manifest`, `schema:<id>`, `base`, `mod:<modId>`).
 */
export interface Diagnostic {
  /** MOD-only failures are warnings because the previous valid value survives. */
  severity?: 'error' | 'warning';
  resource?: string;
  origin: string;
  message: string;
  details: string[];
}

export interface DataLoadResult {
  /** Only resources whose final value passed schema validation. */
  resources: ReadonlyMap<string, LoadedResource>;
  /** The parsed manifest behind `resources`; null when it failed to load. */
  manifest: GameManifest | null;
  diagnostics: Diagnostic[];
}

export interface ResourceLoadedEvent {
  id: string;
  source: ResourceSource;
}

export interface ResourceErrorEvent {
  /** null for manifest/schema-level problems that belong to no resource. */
  id: string | null;
  severity: 'error' | 'warning';
  origin: string;
  message: string;
  details: string[];
}

export interface DataLoaderEventMap {
  'data:resource-loaded': ResourceLoadedEvent;
  'data:resource-error': ResourceErrorEvent;
}

export interface DataLoaderOptions {
  /** Deployment base, defaults to the site root `'/'`. */
  baseUrl?: string;
  /** Optional bus receiving per-resource success/error events. */
  bus?: EventBus<DataLoaderEventMap>;
  /** Optional format-specific semantic checks, keyed by manifest schema id. */
  semanticValidators?: Readonly<Record<string, SemanticValidator>>;
}

const MANIFEST_URL_PATH = 'base/manifest.json';
const SCHEMA_URL_SEGMENT = 'schema';
const MODS_URL_SEGMENT = 'mods';

/**
 * Safe path segments may start with a letter, digit, `_`, `-` or CJK
 * character but never `.`, which rules out `..` traversal, dotfiles,
 * absolute paths, backslashes and empty segments in a single rule. Mirrors
 * the patterns in `data/schema/manifest.schema.json`.
 */
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_\-一-鿿][A-Za-z0-9._\-一-鿿]*$/;

/** Opaque identifiers (resource/schema ids) additionally carry no separator. */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_\-][A-Za-z0-9._\-]*$/;
const SAFE_MOD_ID_PATTERN = /^[A-Za-z0-9_\-一-鿿][A-Za-z0-9._\-一-鿿]*$/;

type FetchedJson =
  | { status: 'ok'; data: unknown }
  | { status: 'missing' }
  | { status: 'error'; message: string; details: string[] };

/**
 * Joins a deployment base with URL segments, tolerating '' , '/' , './' and
 * '/foo/' bases without ever producing a protocol-relative '//host/...' URL
 * (which `fetch` would resolve against a bogus host).
 */
function joinUrl(baseUrl: string, ...segments: string[]): string {
  const base = baseUrl.replace(/\/+$/, '');
  const parts = segments
    .map((segment) => segment.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter((segment) => segment.length > 0);
  return `${base}/${parts.join('/')}`;
}

/** Human-readable reasons why a manifest/mod relative path is not acceptable. */
function describeRelativePathProblems(value: string): string[] {
  const problems: string[] = [];
  if (value.length === 0) {
    problems.push('路径为空');
    return problems;
  }
  if (value.includes('\\')) {
    problems.push('包含反斜杠（请使用 / 作为分隔符）');
  }
  if (value.startsWith('/')) {
    problems.push('是绝对路径');
  }
  value.split('/').forEach((segment, index) => {
    if (segment === '') {
      problems.push(`第 ${index + 1} 段为空`);
    } else if (segment === '.' || segment === '..') {
      problems.push(`第 ${index + 1} 段 "${segment}" 构成目录穿越`);
    } else if (!SAFE_SEGMENT_PATTERN.test(segment)) {
      problems.push(`第 ${index + 1} 段 "${segment}" 含不允许的字符`);
    }
  });
  return problems;
}

/** Human-readable reasons why a resource/schema id is not acceptable. */
function describeIdentifierProblems(value: string): string[] {
  const problems: string[] = [];
  if (value.length === 0) {
    problems.push('标识符为空');
  } else if (value.includes('/')) {
    problems.push('包含路径分隔符 /');
  } else if (value.includes('\\')) {
    problems.push('包含反斜杠');
  } else if (value === '.' || value === '..') {
    problems.push('构成目录穿越');
  } else if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    problems.push('含不允许的字符');
  }
  return problems;
}

function describeModIdProblems(value: string): string[] {
  if (value.length === 0) {
    return ['MOD id 为空'];
  }
  if (value.includes('/') || value.includes('\\')) {
    return ['MOD id 必须是单一路径段'];
  }
  if (!SAFE_MOD_ID_PATTERN.test(value)) {
    return ['MOD id 含不允许的字符'];
  }
  return [];
}

/**
 * Defensive re-check of every manifest path and id. The schema patterns
 * already enforce these rules; the loader stays safe even when a schema
 * document fails to load or is weakened, and reports duplicate resource ids
 * which schemas cannot express.
 */
function auditManifest(manifest: GameManifest): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  manifest.resources.forEach((resource, index) => {
    if (seenIds.has(resource.id)) {
      problems.push(`resources[${index}].id "${resource.id}" 与前面的条目重复`);
    }
    seenIds.add(resource.id);
    for (const problem of describeRelativePathProblems(resource.path)) {
      problems.push(`resources[${index}].path "${resource.path}" ${problem}`);
    }
    for (const problem of describeIdentifierProblems(resource.schema)) {
      problems.push(`resources[${index}].schema "${resource.schema}" ${problem}`);
    }
  });

  manifest.enabledMods.forEach((modId, index) => {
    for (const problem of describeModIdProblems(modId)) {
      problems.push(`enabledMods[${index}] "${modId}" ${problem}`);
    }
  });

  return problems;
}

/**
 * Fetches one URL and turns every transport problem into a result value:
 * `missing` for 404/410, `error` for network failures, non-JSON content
 * types (SPA fallbacks serve HTML with status 200) and malformed JSON.
 */
async function fetchJson(url: string): Promise<FetchedJson> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: '网络请求失败', details: [url, reason] };
  }

  if (response.status === 404 || response.status === 410) {
    return { status: 'missing' };
  }
  if (!response.ok) {
    return { status: 'error', message: `请求失败（HTTP ${response.status}）`, details: [url] };
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (contentType !== '' && !contentType.includes('json')) {
    return {
      status: 'error',
      message: `响应不是 JSON（${contentType}）`,
      details: [url, '服务器可能把请求回退到了 HTML 页面（SPA fallback）。'],
    };
  }

  try {
    return { status: 'ok', data: await response.json() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: 'JSON 解析失败', details: [url, reason] };
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const location = error.instancePath === '' ? '（根对象）' : error.instancePath;
    return `${location}：${error.message ?? '不符合 schema 约束'}`;
  });
}

type SchemaResult =
  | { ok: true; validate: ValidateFunction<unknown> }
  | { ok: false; diagnostic: Diagnostic };

/** Loads and compiles `schema/<schemaId>.schema.json` with draft-07 Ajv. */
async function compileSchema(
  ajv: Ajv,
  baseUrl: string,
  schemaId: string,
): Promise<SchemaResult> {
  const idProblems = describeIdentifierProblems(schemaId);
  if (idProblems.length > 0) {
    return {
      ok: false,
      diagnostic: {
        origin: `schema:${schemaId}`,
        message: 'schema 标识符不安全，已拒绝加载',
        details: idProblems,
      },
    };
  }

  const url = joinUrl(baseUrl, SCHEMA_URL_SEGMENT, `${schemaId}.schema.json`);
  const fetched = await fetchJson(url);
  if (fetched.status === 'missing') {
    return {
      ok: false,
      diagnostic: { origin: `schema:${schemaId}`, message: 'schema 文件缺失', details: [url] },
    };
  }
  if (fetched.status === 'error') {
    return {
      ok: false,
      diagnostic: { origin: `schema:${schemaId}`, message: fetched.message, details: fetched.details },
    };
  }

  try {
    const validate = ajv.compile(fetched.data as AnySchema) as ValidateFunction<unknown>;
    return { ok: true, validate };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      diagnostic: {
        origin: `schema:${schemaId}`,
        message: 'schema 编译失败（不是合法的 JSON Schema）',
        details: [url, reason],
      },
    };
  }
}

/** Per-resource context threaded through {@link resolveResource}. */
interface ResolveContext {
  baseUrl: string;
  enabledMods: readonly string[];
  validators: ReadonlyMap<string, ValidateFunction<unknown>>;
  semanticValidators: Readonly<Record<string, SemanticValidator>>;
  report: (diagnostic: Diagnostic) => void;
}

/**
 * Loads one resource: valid base document first, then `enabledMods`
 * overrides in declared order. A MOD entry that is missing simply provides
 * no override (normal for mods that only touch some resources); any invalid
 * override is reported and the previous valid value survives. A resource
 * without a valid base fails outright — overrides extend a base, they
 * cannot rescue a missing one.
 */
async function resolveResource(
  resource: ManifestResource,
  ctx: ResolveContext,
): Promise<LoadedResource | null> {
  const validate = ctx.validators.get(resource.schema);
  const semanticValidator = ctx.semanticValidators[resource.schema];
  if (validate === undefined) {
    ctx.report({
      resource: resource.id,
      origin: `schema:${resource.schema}`,
      message: '资源引用的 schema 不可用，已跳过该资源',
      details: [],
    });
    return null;
  }

  const baseValue = await fetchDocument(
    joinUrl(ctx.baseUrl, 'base', resource.path),
    resource.id,
    'base',
    ctx,
  );
  if (baseValue === null) {
    return null;
  }
  if (!validate(baseValue)) {
    ctx.report({
      resource: resource.id,
      origin: 'base',
      message: '基础资源不符合 schema',
      details: formatSchemaErrors(validate.errors),
    });
    return null;
  }
  const baseSemanticErrors = runSemanticValidator(semanticValidator, baseValue);
  if (baseSemanticErrors.length > 0) {
    ctx.report({
      resource: resource.id,
      origin: 'base',
      message: '基础资源未通过语义校验',
      details: baseSemanticErrors,
    });
    return null;
  }

  let current: LoadedResource = {
    id: resource.id,
    schema: resource.schema,
    value: baseValue,
    source: { kind: 'base' },
  };

  for (const modId of ctx.enabledMods) {
    const overrideUrl = joinUrl(ctx.baseUrl, MODS_URL_SEGMENT, modId, resource.path);
    const overrideValue = await fetchDocument(overrideUrl, resource.id, `mod:${modId}`, ctx);
    if (overrideValue === null) {
      continue; // Missing or unusable: keep the previous valid value.
    }
    if (!validate(overrideValue)) {
      ctx.report({
        resource: resource.id,
        origin: `mod:${modId}`,
        severity: 'warning',
        message: 'MOD 覆盖不符合 schema，已保留上一有效版本',
        details: formatSchemaErrors(validate.errors),
      });
      continue;
    }
    const semanticErrors = runSemanticValidator(semanticValidator, overrideValue);
    if (semanticErrors.length > 0) {
      ctx.report({
        resource: resource.id,
        origin: `mod:${modId}`,
        severity: 'warning',
        message: 'MOD 覆盖未通过语义校验，已保留上一有效版本',
        details: semanticErrors,
      });
      continue;
    }
    current = {
      id: resource.id,
      schema: resource.schema,
      value: overrideValue,
      source: { kind: 'mod', modId },
    };
  }

  return current;
}

function runSemanticValidator(
  validator: SemanticValidator | undefined,
  value: unknown,
): string[] {
  if (validator === undefined) {
    return [];
  }
  try {
    return [...validator(value)];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [`语义校验器执行失败：${reason}`];
  }
}

/**
 * Fetches one JSON document, mapping `missing` to `null` without a
 * diagnostic (callers decide whether that is normal) and every transport
 * failure to `null` plus an error diagnostic.
 */
async function fetchDocument(
  url: string,
  resourceId: string,
  origin: string,
  ctx: ResolveContext,
): Promise<unknown | null> {
  const fetched = await fetchJson(url);
  if (fetched.status === 'ok') {
    return fetched.data;
  }
  if (fetched.status === 'missing') {
    if (!origin.startsWith('mod:')) {
      ctx.report({ resource: resourceId, origin, message: '资源文件缺失', details: [url] });
    }
    return null;
  }
  ctx.report({
    resource: resourceId,
    origin,
    severity: origin.startsWith('mod:') ? 'warning' : 'error',
    message: fetched.message,
    details: fetched.details,
  });
  return null;
}

/**
 * Loads every manifest resource with its MOD overrides applied. Never
 * throws; every problem is collected in `diagnostics` and mirrored as
 * `data:resource-error` events when a bus is provided.
 */
export async function loadGameData(options: DataLoaderOptions = {}): Promise<DataLoadResult> {
  const baseUrl = options.baseUrl ?? '/';
  const bus = options.bus;
  const resources = new Map<string, LoadedResource>();
  const diagnostics: Diagnostic[] = [];
  const ajv = new Ajv({ allErrors: true });

  const report = (diagnostic: Diagnostic): void => {
    diagnostics.push(diagnostic);
    bus?.emit('data:resource-error', {
      id: diagnostic.resource ?? null,
      severity: diagnostic.severity ?? 'error',
      origin: diagnostic.origin,
      message: diagnostic.message,
      details: diagnostic.details,
    });
  };

  const fetchedManifest = await fetchJson(joinUrl(baseUrl, MANIFEST_URL_PATH));
  if (fetchedManifest.status !== 'ok') {
    report(
      fetchedManifest.status === 'missing'
        ? {
            origin: 'manifest',
            message: '清单文件缺失',
            details: [joinUrl(baseUrl, MANIFEST_URL_PATH), '请确认 data/base/manifest.json 已随应用发布。'],
          }
        : { origin: 'manifest', message: fetchedManifest.message, details: fetchedManifest.details },
    );
    return { resources, manifest: null, diagnostics };
  }

  const manifestSchema = await compileSchema(ajv, baseUrl, 'manifest');
  if (!manifestSchema.ok) {
    report(manifestSchema.diagnostic);
    return { resources, manifest: null, diagnostics };
  }
  if (!manifestSchema.validate(fetchedManifest.data)) {
    report({
      origin: 'manifest',
      message: '清单不符合 manifest schema',
      details: formatSchemaErrors(manifestSchema.validate.errors),
    });
    return { resources, manifest: null, diagnostics };
  }
  const manifest = fetchedManifest.data as GameManifest;

  const manifestProblems = auditManifest(manifest);
  if (manifestProblems.length > 0) {
    report({
      origin: 'manifest',
      message: '清单包含不安全的路径或标识符，已拒绝加载',
      details: manifestProblems,
    });
    return { resources, manifest: null, diagnostics };
  }

  const validators = new Map<string, ValidateFunction<unknown>>();
  for (const resource of manifest.resources) {
    if (validators.has(resource.schema)) {
      continue;
    }
    const compiled = await compileSchema(ajv, baseUrl, resource.schema);
    if (!compiled.ok) {
      report(compiled.diagnostic);
      continue;
    }
    validators.set(resource.schema, compiled.validate);
  }

  const ctx: ResolveContext = {
    baseUrl,
    enabledMods: manifest.enabledMods,
    validators,
    semanticValidators: options.semanticValidators ?? {},
    report,
  };
  for (const resource of manifest.resources) {
    const loaded = await resolveResource(resource, ctx);
    if (loaded === null) {
      continue; // Failure already reported as a diagnostic.
    }
    resources.set(loaded.id, loaded);
    bus?.emit('data:resource-loaded', { id: loaded.id, source: loaded.source });
  }

  return { resources, manifest, diagnostics };
}
