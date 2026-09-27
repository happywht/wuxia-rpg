import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { inspectMods } from './inspect-mods.mjs';

/**
 * Round 35 smoke: MOD precedence, final-source reporting and atomic fallback.
 *
 * Drives the *real* engine loader (`loadGameData` from src/engine/data-loader.ts,
 * transpiled on the fly with the project's TypeScript) against an in-memory
 * fetch backed by temp fixtures, then re-checks the same fixture tree with the
 * read-only `inspect:mods` inspector. Asserts: a valid later override wins;
 * a malformed JSON override and a schema-invalid override are both rejected
 * while the previous valid layer survives, with diagnostics carrying the
 * exact override URL and a repair hint. Nothing is written into the real
 * manifest, data/ or mods/ directories.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/fixture';
const transpiledDir = await mkdtemp(path.join(root, 'node_modules/.tmp-r35-smoke-'));

// ---------------------------------------------------------------------------
// Fixture: two mods (modA → modB, later wins), four resources.
// alpha: both overrides valid → modB wins.
// beta:  modA valid, modB malformed JSON → modA survives.
// gamma: modB override violates the schema → base survives.
// delta: no mod ships an override → base (a missing override is normal).
// ---------------------------------------------------------------------------

const segment = '[A-Za-z0-9_\\-一-鿿][A-Za-z0-9._\\-一-鿿]*';
const manifestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['resources', 'enabledMods'],
  properties: {
    resources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'path', 'schema'],
        properties: {
          id: { type: 'string', minLength: 1 },
          path: { type: 'string', pattern: `^${segment}(/${segment})*\\.json$` },
          schema: { type: 'string', minLength: 1 },
        },
      },
    },
    enabledMods: { type: 'array', items: { type: 'string', pattern: `^${segment}$` } },
  },
};
const payloadSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'payload'],
  properties: { id: { type: 'string' }, payload: { type: 'string' } },
};
const manifest = {
  resources: [
    { id: 'res.alpha', path: 'alpha/alpha.json', schema: 'alpha-set' },
    { id: 'res.beta', path: 'beta/beta.json', schema: 'beta-set' },
    { id: 'res.gamma', path: 'gamma/gamma.json', schema: 'gamma-set' },
    { id: 'res.delta', path: 'delta/delta.json', schema: 'delta-set' },
  ],
  enabledMods: ['modA', 'modB'],
};

const files = new Map();
const put = (urlPath, body) => files.set(urlPath, body);
const putJson = (urlPath, value) => put(urlPath, JSON.stringify(value));

putJson(`${BASE}/base/manifest.json`, manifest);
putJson(`${BASE}/schema/manifest.schema.json`, manifestSchema);
putJson(`${BASE}/schema/alpha-set.schema.json`, payloadSchema);
putJson(`${BASE}/schema/beta-set.schema.json`, payloadSchema);
putJson(`${BASE}/schema/gamma-set.schema.json`, payloadSchema);
putJson(`${BASE}/schema/delta-set.schema.json`, payloadSchema);
putJson(`${BASE}/base/alpha/alpha.json`, { id: 'res.alpha', payload: 'base' });
putJson(`${BASE}/mods/modA/alpha/alpha.json`, { id: 'res.alpha', payload: 'modA' });
putJson(`${BASE}/mods/modB/alpha/alpha.json`, { id: 'res.alpha', payload: 'modB' });
putJson(`${BASE}/base/beta/beta.json`, { id: 'res.beta', payload: 'base' });
putJson(`${BASE}/mods/modA/beta/beta.json`, { id: 'res.beta', payload: 'modA' });
put(`${BASE}/mods/modB/beta/beta.json`, '{"id": "res.beta", '); // truncated JSON
putJson(`${BASE}/base/gamma/gamma.json`, { id: 'res.gamma', payload: 'base' });
putJson(`${BASE}/mods/modB/gamma/gamma.json`, { id: 'res.gamma', payload: 123 }); // payload not a string
putJson(`${BASE}/base/delta/delta.json`, { id: 'res.delta', payload: 'base' });

const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'wuxia-r35-'));
const realFile = async (relative, body) => {
  const target = path.join(fixtureRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, typeof body === 'string' ? body : JSON.stringify(body));
};
await realFile('data/base/manifest.json', manifest);
await realFile('data/schema/manifest.schema.json', manifestSchema);
for (const schemaId of ['alpha-set', 'beta-set', 'gamma-set', 'delta-set']) {
  await realFile(`data/schema/${schemaId}.schema.json`, payloadSchema);
}
await realFile('data/base/alpha/alpha.json', { id: 'res.alpha', payload: 'base' });
await realFile('mods/modA/alpha/alpha.json', { id: 'res.alpha', payload: 'modA' });
await realFile('mods/modB/alpha/alpha.json', { id: 'res.alpha', payload: 'modB' });
await realFile('data/base/beta/beta.json', { id: 'res.beta', payload: 'base' });
await realFile('mods/modA/beta/beta.json', { id: 'res.beta', payload: 'modA' });
await realFile('mods/modB/beta/beta.json', '{"id": "res.beta", ');
await realFile('data/base/gamma/gamma.json', { id: 'res.gamma', payload: 'base' });
await realFile('mods/modB/gamma/gamma.json', { id: 'res.gamma', payload: 123 });
await realFile('data/base/delta/delta.json', { id: 'res.delta', payload: 'base' });

// The real manifest must stay untouched: no test mod is ever enabled there.
{
  const shipped = JSON.parse(readFileSync(path.join(root, 'data/base/manifest.json'), 'utf8'));
  assert.deepEqual(
    shipped.enabledMods,
    [],
    'the shipped manifest must keep enabledMods empty after the smoke run',
  );
}

let loadGameData;
try {
  // Transpile the real engine loader with the project's TypeScript compiler.
  // Output lives under node_modules/ so the bare `ajv` import resolves
  // against the project's dependencies; everything is deleted afterwards.
  mkdirSync(transpiledDir, { recursive: true });
  for (const name of ['data-loader', 'event-bus', 'mod-diagnostics']) {
    const source = readFileSync(path.join(root, 'src/engine', `${name}.ts`), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const withExtensions = transpiled.replace(/from '\.\/([^']+)';/g, "from './$1.mjs';");
    writeFileSync(path.join(transpiledDir, `${name}.mjs`), withExtensions);
  }
  ({ loadGameData } = await import(pathToFileURL(path.join(transpiledDir, 'data-loader.mjs')).href));
  const { collectModDiagnostics } = await import(pathToFileURL(path.join(transpiledDir, 'mod-diagnostics.mjs')).href);

  // In-memory fetch: every URL outside the fixture map answers 404, exactly
  // like a dev server without that file.
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url, 'http://fixture.local').pathname;
    if (!files.has(pathname)) {
      return new Response(null, { status: 404 });
    }
    return new Response(files.get(pathname), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await loadGameData({ baseUrl: BASE });

    // 1. Enabled order is exposed verbatim; later declarations override.
    assert.deepEqual(result.enabledMods, ['modA', 'modB'], 'enabledMods order must be exposed');

    // 2. Valid later override replaces the earlier valid layer.
    const alpha = result.resources.get('res.alpha');
    assert.ok(alpha, 'res.alpha must load');
    assert.deepEqual(alpha.source, { kind: 'mod', modId: 'modB' }, 'modB (later, valid) must win alpha');
    assert.equal(alpha.value.payload, 'modB');
    assert.equal(alpha.path, 'alpha/alpha.json', 'LoadedResource carries its manifest path');

    // 3. Malformed JSON override is rejected; the previous valid layer wins.
    const beta = result.resources.get('res.beta');
    assert.ok(beta, 'res.beta must load');
    assert.deepEqual(beta.source, { kind: 'mod', modId: 'modA' }, 'malformed modB must not replace modA');
    assert.equal(beta.value.payload, 'modA');

    // 4. Schema-invalid override is rejected; the base survives.
    const gamma = result.resources.get('res.gamma');
    assert.ok(gamma, 'res.gamma must load');
    assert.deepEqual(gamma.source, { kind: 'base' }, 'schema-invalid modB must not replace the base');
    assert.equal(gamma.value.payload, 'base');

    // 5. A resource no enabled mod ships an override for stays on the base.
    const delta = result.resources.get('res.delta');
    assert.ok(delta, 'res.delta must load');
    assert.deepEqual(delta.source, { kind: 'base' }, 'missing overrides are normal, base survives');

    // 6. Resource map preserves manifest declaration order (source report order).
    assert.deepEqual(
      [...result.resources.keys()],
      ['res.alpha', 'res.beta', 'res.gamma', 'res.delta'],
      'resources must be reported in manifest order',
    );

    // 7. Diagnostics: exactly the two rejected modB overrides, each with the
    //    exact override URL, the failure reason and a repair hint.
    const modDiagnostics = result.diagnostics.filter((d) => d.origin.startsWith('mod:'));
    assert.equal(modDiagnostics.length, 2, 'exactly the two rejected overrides must be diagnosed');
    const betaDiagnostic = modDiagnostics.find((d) => d.resource === 'res.beta');
    const gammaDiagnostic = modDiagnostics.find((d) => d.resource === 'res.gamma');
    assert.ok(betaDiagnostic && gammaDiagnostic, 'each rejected override has its diagnostic');
    assert.equal(betaDiagnostic.severity, 'warning', 'mod rejections stay warnings');
    assert.equal(betaDiagnostic.message, 'JSON 解析失败');
    assert.equal(betaDiagnostic.path, `${BASE}/mods/modB/beta/beta.json`, 'diagnostic pins the override URL');
    assert.ok(betaDiagnostic.hint.includes('JSON 语法'), 'malformed JSON gets a syntax repair hint');
    assert.equal(gammaDiagnostic.message, 'MOD 覆盖不符合 schema，已保留上一有效版本');
    assert.equal(gammaDiagnostic.path, `${BASE}/mods/modB/gamma/gamma.json`);
    assert.ok(
      gammaDiagnostic.details.some((line) => line.includes('/payload')),
      'schema errors point at the offending field',
    );
  assert.ok(
    gammaDiagnostic.hint.includes('gamma-set.schema.json') && gammaDiagnostic.hint.includes('modB'),
    'hint names the schema file and how to disable the mod',
  );

  // Later assembly diagnostics must still be attributable to the effective
  // MOD resource after the generic loader hands off validated JSON.
  const runtimeModDiagnostic = collectModDiagnostics(result.resources, result.diagnostics, [
    {
      resource: 'res.alpha',
      origin: 'cross-resource-assembly',
      severity: 'warning',
      message: '引用的目标资源不可用',
      details: ['targetId: missing.target'],
    },
    {
      resource: 'res.delta',
      origin: 'cross-resource-assembly',
      severity: 'warning',
      message: '基础资料警告不应标记为 MOD 错误',
      details: [],
    },
  ]);
  const alphaAssemblyDiagnostic = runtimeModDiagnostic.find((d) =>
    d.origin.includes('cross-resource-assembly') && d.resource === 'res.alpha',
  );
  assert.ok(alphaAssemblyDiagnostic, 'runtime warning on a MOD-sourced resource is included');
  assert.ok(alphaAssemblyDiagnostic.origin.includes('modB'));
  assert.equal(alphaAssemblyDiagnostic.path, 'mods/modB/alpha/alpha.json');
  assert.ok(alphaAssemblyDiagnostic.hint.includes('inspect:mods'));
  assert.ok(
    !runtimeModDiagnostic.some((d) => d.message === '基础资料警告不应标记为 MOD 错误'),
    'base-sourced assembly warnings must not be mislabeled as mod diagnostics',
  );
  } finally {
    globalThis.fetch = previousFetch;
  }

  // 8. The read-only inspector agrees on order, layers, final sources and
  //    actionable problems for the very same fixture tree.
  const report = await inspectMods(fixtureRoot);
  assert.deepEqual(report.enabledMods, ['modA', 'modB']);
  assert.equal(report.resources.length, 4);
  const [alphaReport, betaReport, gammaReport, deltaReport] = report.resources;
  assert.equal(alphaReport.finalSource, 'mod:modB');
  assert.deepEqual(
    alphaReport.layers.map((layer) => layer.status),
    ['ok', 'ok'],
  );
  assert.equal(betaReport.finalSource, 'mod:modA');
  assert.equal(betaReport.layers[1].status, 'json-error');
  assert.equal(gammaReport.finalSource, 'base');
  assert.equal(gammaReport.layers[1].status, 'schema-error');
  assert.equal(deltaReport.finalSource, 'base');
  assert.deepEqual(
    deltaReport.layers.map((layer) => layer.status),
    ['none', 'none'],
    'missing overrides report as none, not as problems',
  );
  assert.equal(report.ok, false, 'rejected layers must exit nonzero in CLI mode');
  assert.equal(report.problems.length, 2);
  const betaProblem = report.problems.find((p) => p.file.endsWith(path.join('mods', 'modB', 'beta', 'beta.json')));
  const gammaProblem = report.problems.find((p) => p.file.endsWith(path.join('mods', 'modB', 'gamma', 'gamma.json')));
  assert.ok(betaProblem && gammaProblem, 'problems carry the exact file paths');
  assert.ok(betaProblem.hint.includes('JSON 语法'));
  assert.ok(gammaProblem.hint.includes('gamma-set.schema.json'));
  assert.ok(
    report.notes.some((note) => note.includes('运行时')),
    'the inspector must state that runtime semantics are checked by the game loader',
  );

  // A valid MOD cannot rescue an invalid required base document; the runtime
  // loader rejects the resource before reaching any override layer.
  await realFile('data/base/alpha/alpha.json', { id: 'res.alpha', payload: 123 });
  const invalidBaseReport = await inspectMods(fixtureRoot);
  assert.equal(invalidBaseReport.resources[0].base.status, 'schema-error');
  assert.equal(invalidBaseReport.resources[0].finalSource, null);
  assert.ok(invalidBaseReport.problems.some((problem) => problem.file.endsWith(path.join('data', 'base', 'alpha', 'alpha.json'))));

  // A syntactically valid but non-object manifest should yield a readable
  // inspection failure instead of a TypeError in the developer command.
  await realFile('data/base/manifest.json', 'null');
  const invalidManifestReport = await inspectMods(fixtureRoot);
  assert.equal(invalidManifestReport.ok, false);
  assert.deepEqual(invalidManifestReport.resources, []);

  console.log(
    '通过：双 MOD 先后覆盖（modB 有效层获胜）、坏 JSON/schema 无效覆盖原子回退（modA/base 存续）、'
    + '基础资源错误不可由 MOD 救援、损坏 manifest 可读失败、运行时跨资源警告归因到有效 MOD 来源、'
    + '来源按序报告且诊断含精确路径与修复提示；'
    + '真实 manifest 的 enabledMods 保持为空。',
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
  rmSync(transpiledDir, { recursive: true, force: true });
}
