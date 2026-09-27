import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  SUPPORTED_FORMAT_VERSION,
  MAX_PACKAGE_BYTES,
  canonicalJsonText,
  sha256OfJson,
  parseStrictVersion,
  compareVersionTriples,
  buildModPackage,
  serializePackage,
  inspectPackage,
  applyPackage,
} from './content-package.mjs';

/**
 * Round 37 smoke: single-file v1 content packages.
 *
 * Everything runs inside throwaway temp repos (a minimal manifest + copied
 * real schemas + legacy mod dirs), never against the real data/ or mods/:
 *
 * 1.  Unit-checks canonical JSON (recursive key sort, array order kept,
 *     formatting-independence) and strict three-segment version parsing.
 * 2.  Exports a legacy no-metadata mod dir: package shape, manifest-ordered
 *     resources, checksums, deterministic byte-identical serialization.
 * 3.  Round-trips export -> read-only preflight (id -> local manifest path
 *     mapping), and asserts preflight writes nothing.
 * 4.  Applies into a fresh target dir; manifest/base bytes unchanged, mod not
 *     enabled, no staging leftovers; re-apply onto the existing target is
 *     refused and still leaves no staging dir behind.
 * 5.  Fault injection: tampered data (checksum), schema-invalid data,
 *     duplicate resource ids, unregistered ids, package id traversal
 *     (`../evil`, `a/b`), resource-level smuggled `path` field, future
 *     formatVersion, incompatible/loose engine versions, package size cap.
 * 6.  Export-side diagnostics: unregistered file, broken JSON, schema-invalid
 *     override each produce a located, actionable problem.
 * 7.  Drives the real CLI (export / preflight / apply / re-apply / usage
 *     error) against the temp repo via process.execPath.
 * 8.  Snapshots the real mods/ tree and base manifest before and after:
 *     byte-identical.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const ENGINE_VERSION = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;

// ---------------------------------------------------------------------------
// 1. Canonical JSON and strict versions
// ---------------------------------------------------------------------------

{
  assert.equal(
    canonicalJsonText({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }),
    '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    'object keys are sorted recursively while array order is preserved',
  );
  assert.equal(
    canonicalJsonText({ a: 1, b: 2 }),
    canonicalJsonText({ b: 2, a: 1 }),
    'source key order never changes the canonical text',
  );
  assert.equal(canonicalJsonText({ 中文: 1, abc: 2, Z: 3 }), '{"Z":3,"abc":2,"中文":1}');
  assert.equal(canonicalJsonText(null), 'null');
  assert.equal(canonicalJsonText([{ x: undefined, y: null }]), '[{"y":null}]');
  assert.equal(
    canonicalJsonText(JSON.parse('{"__proto__":{"kept":true},"safe":1}')),
    '{"__proto__":{"kept":true},"safe":1}',
    'the legacy __proto__ key remains ordinary JSON data in canonical output',
  );
  assert.match(sha256OfJson({ b: 1, a: 2 }), /^[0-9a-f]{64}$/);
  assert.equal(sha256OfJson({ a: 1, b: 2 }), sha256OfJson({ b: 2, a: 1 }), 'checksums are formatting-independent');

  assert.deepEqual(parseStrictVersion('0.0.1'), [0, 0, 1]);
  assert.deepEqual(parseStrictVersion('12.34.56'), [12, 34, 56]);
  assert.equal(parseStrictVersion('1.2'), null);
  assert.equal(parseStrictVersion('1.2.3.4'), null);
  assert.equal(parseStrictVersion('v1.2.3'), null);
  assert.equal(parseStrictVersion('1.2.3-beta'), null);
  assert.equal(parseStrictVersion(''), null);
  assert.equal(parseStrictVersion(null), null);
  assert.equal(parseStrictVersion('9007199254740992.0.0'), null, 'unsafe integer segments are refused');
  assert.equal(compareVersionTriples([0, 0, 1], [0, 0, 1]), 0);
  assert.equal(compareVersionTriples([0, 0, 1], [0, 0, 2]), -1);
  assert.equal(compareVersionTriples([0, 1, 0], [0, 0, 9]), 1);
  assert.equal(compareVersionTriples([1, 0, 0], [0, 99, 99]), 1);
}

// ---------------------------------------------------------------------------
// Fixture: an isolated repo with a minimal manifest and a legacy mod
// ---------------------------------------------------------------------------

const makeMapData = (id, name) => ({
  id,
  name,
  tileSize: 48,
  columns: 4,
  rows: 3,
  tileTypes: { '.': { color: '#4d3a2e', solid: false }, '#': { color: '#a68a6a', solid: true } },
  grid: ['####', '#..#', '####'],
  playerStart: { col: 1, row: 1 },
});

const repo = await mkdtemp(path.join(tmpdir(), 'wuxia-r37-repo-'));
const writeRepoFile = async (relative, content) => {
  const target = path.join(repo, relative.split('/').join(path.sep));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};

const manifestFixture = {
  resources: [
    { id: 'map.smoke-a', path: 'maps/smoke-a.json', schema: 'grid-map' },
    { id: 'map.smoke-b', path: 'maps/nested/smoke-b.json', schema: 'grid-map' },
  ],
  enabledMods: [],
};
await writeRepoFile('package.json', { name: 'smoke-target', version: ENGINE_VERSION });
const baseA = makeMapData('map.smoke-a', '基础甲');
const baseB = makeMapData('map.smoke-b', '基础乙');
const modA = makeMapData('map.smoke-a', '魔改甲（legacy-mod）');
const modB = makeMapData('map.smoke-b', '魔改乙（legacy-mod）');

await writeRepoFile('data/base/manifest.json', manifestFixture);
await writeRepoFile('data/base/maps/smoke-a.json', baseA);
await writeRepoFile('data/base/maps/nested/smoke-b.json', baseB);
await writeRepoFile('mods/legacy-mod/maps/smoke-a.json', modA);
await writeRepoFile('mods/legacy-mod/maps/nested/smoke-b.json', modB);
for (const schema of ['manifest', 'grid-map', 'content-package']) {
  const schemaText = await readFile(path.join(root, 'data/schema', `${schema}.schema.json`), 'utf8');
  await writeRepoFile(`data/schema/${schema}.schema.json`, schemaText);
}

const snapshotFiles = async (dir) => {
  const map = new Map();
  const walk = async (directory, prefix) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return map; // missing dir == empty snapshot
    }
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else {
        const bytes = await readFile(path.join(directory, entry.name));
        map.set(relative, createHash('sha256').update(bytes).digest('hex'));
      }
    }
    return map;
  };
  return walk(dir, '');
};

const stagingLeftovers = async () =>
  (await readdir(path.join(repo, 'mods'), { withFileTypes: true }))
    .filter((entry) => entry.name.startsWith('.staging-'))
    .map((entry) => entry.name);

// The real repository must survive this smoke untouched.
const realModsBefore = await snapshotFiles(path.join(root, 'mods'));
const realManifestBefore = await readFile(path.join(root, 'data/base/manifest.json'), 'utf8');

try {
  // -------------------------------------------------------------------------
  // 2. Export a legacy mod: shape, ordering, checksums, determinism
  // -------------------------------------------------------------------------
  const build = async () => buildModPackage({ repo, modId: 'legacy-mod', packageId: 'smoke-pkg', name: '烟测包' });
  const first = await build();
  assert.ok(first.ok, `export must succeed: ${JSON.stringify(first.problems)}`);
  assert.equal(first.package.formatVersion, SUPPORTED_FORMAT_VERSION);
  assert.equal(first.package.package.id, 'smoke-pkg');
  assert.equal(first.package.package.name, '烟测包');
  assert.equal(first.package.package.version, '1.0.0');
  assert.equal(first.package.minimumEngineVersion, ENGINE_VERSION, 'export pins the current engine version');
  assert.deepEqual(
    first.package.resources.map((resource) => resource.id),
    ['map.smoke-a', 'map.smoke-b'],
    'resources follow manifest order regardless of directory scan order',
  );
  assert.equal(first.package.resources[0].sha256, sha256OfJson(modA));
  assert.equal(first.package.resources[1].sha256, sha256OfJson(modB));
  assert.ok(!('path' in first.package.resources[0]), 'package resources carry no file paths');

  const second = await build();
  assert.equal(serializePackage(second.package), serializePackage(first.package), 're-export is byte-identical');
  const oversizedExport = await buildModPackage({
    repo,
    modId: 'legacy-mod',
    description: 'x'.repeat(MAX_PACKAGE_BYTES),
  });
  assert.ok(!oversizedExport.ok, 'export must not create a package its importer rejects for size');
  assert.ok(oversizedExport.problems.some((problem) => problem.message.includes('超过导入上限')));
  const emptyNameExport = await buildModPackage({ repo, modId: 'legacy-mod', name: '' });
  assert.ok(!emptyNameExport.ok, 'export must validate its own package metadata');
  assert.ok(emptyNameExport.problems.some((problem) => problem.message.includes('导出内容包不符合 content-package schema')));

  const packageFile = path.join(repo, 'smoke-pkg.wuxia.json');
  await writeFile(packageFile, serializePackage(first.package), 'utf8');

  // -------------------------------------------------------------------------
  // 3. Round-trip preflight (read-only) + no writes without --apply
  // -------------------------------------------------------------------------
  const modsBeforeInspect = (await readdir(path.join(repo, 'mods'))).sort();
  const preflight = await inspectPackage({ repo, packageFile });
  assert.ok(preflight.ok, `preflight must pass: ${JSON.stringify(preflight.problems)}`);
  assert.deepEqual(
    preflight.report.resources.map((resource) => [resource.id, resource.path, resource.schema]),
    [
      ['map.smoke-a', 'maps/smoke-a.json', 'grid-map'],
      ['map.smoke-b', 'maps/nested/smoke-b.json', 'grid-map'],
    ],
    'preflight resolves install paths from the local manifest by resource id',
  );
  assert.deepEqual((await readdir(path.join(repo, 'mods'))).sort(), modsBeforeInspect, 'preflight writes nothing');
  assert.deepEqual(await stagingLeftovers(), [], 'preflight leaves no staging dirs');

  const fromObject = await inspectPackage({ repo, packageObject: JSON.parse(serializePackage(first.package)) });
  assert.ok(fromObject.ok, 'in-memory package objects preflight identically');

  // Compatibility follows the target repo named by --repo, not the tool
  // installation's package.json version.
  const targetPackageFile = path.join(repo, 'package.json');
  const targetPackageBytes = await readFile(targetPackageFile, 'utf8');
  await writeFile(targetPackageFile, JSON.stringify({ name: 'older-target', version: '0.0.0' }));
  const olderTarget = await inspectPackage({ repo, packageFile });
  assert.ok(!olderTarget.ok, 'a package requiring 0.0.1 must fail for a 0.0.0 target repo');
  assert.ok(olderTarget.problems.some((problem) => problem.message.includes('当前引擎为 0.0.0')));
  await writeFile(targetPackageFile, targetPackageBytes);

  // Two manifest ids must never resolve to one file, or the later package
  // entry would silently overwrite the earlier one during installation.
  const ambiguousManifest = {
    ...manifestFixture,
    resources: [
      ...manifestFixture.resources,
      { id: 'map.smoke-c', path: 'maps/smoke-a.json', schema: 'grid-map' },
    ],
  };
  await writeRepoFile('data/base/manifest.json', ambiguousManifest);
  const duplicatePath = await inspectPackage({ repo, packageFile });
  assert.ok(!duplicatePath.ok);
  assert.ok(duplicatePath.problems.some((problem) => problem.message.includes('被多个资源 id 重复登记')));
  await writeRepoFile('data/base/manifest.json', manifestFixture);

  // -------------------------------------------------------------------------
  // 4. Apply into a fresh target; refuse an existing target cleanly
  // -------------------------------------------------------------------------
  const manifestBytesBefore = await readFile(path.join(repo, 'data/base/manifest.json'));
  const baseBytesBefore = await readFile(path.join(repo, 'data/base/maps/smoke-a.json'));
  const applied = await applyPackage({ repo, packageFile });
  assert.ok(applied.ok, `apply must succeed: ${JSON.stringify(applied.problems)}`);
  assert.equal(applied.installedPath, path.join('mods', 'smoke-pkg'));

  const installedA = JSON.parse(await readFile(path.join(repo, 'mods/smoke-pkg/maps/smoke-a.json'), 'utf8'));
  assert.deepEqual(installedA, modA, 'installed resource is semantically the packaged data');
  const installedB = JSON.parse(await readFile(path.join(repo, 'mods/smoke-pkg/maps/nested/smoke-b.json'), 'utf8'));
  assert.deepEqual(installedB, modB);
  assert.equal(
    (await readFile(path.join(repo, 'data/base/manifest.json'))).compare(manifestBytesBefore),
    0,
    'the base manifest is never modified',
  );
  assert.equal(
    (await readFile(path.join(repo, 'data/base/maps/smoke-a.json'))).compare(baseBytesBefore),
    0,
    'base resources are never modified',
  );
  assert.equal(
    JSON.parse(await readFile(path.join(repo, 'data/base/manifest.json'), 'utf8')).enabledMods.length,
    0,
    'the installed mod is not enabled',
  );
  assert.deepEqual(await stagingLeftovers(), [], 'a successful apply leaves no staging dir');

  const conflict = await applyPackage({ repo, packageFile });
  assert.ok(!conflict.ok, 're-applying onto an existing target is refused');
  assert.ok(
    conflict.problems.some((problem) => problem.message.includes('已存在')),
    'the conflict message is readable',
  );
  assert.deepEqual(await stagingLeftovers(), [], 'a refused target cleans up its staging dir');

  // -------------------------------------------------------------------------
  // 5. Fault injection on preflight
  // -------------------------------------------------------------------------
  const clone = () => JSON.parse(serializePackage(first.package));
  const tamper = (mutate) => {
    const packageObject = clone();
    mutate(packageObject);
    return inspectPackage({ repo, packageObject });
  };

  const checksumFailure = await tamper((packageObject) => {
    packageObject.resources[0].data.name = '被篡改的甲';
  });
  assert.ok(!checksumFailure.ok);
  assert.ok(
    checksumFailure.problems.some((problem) => problem.message.includes('map.smoke-a') && problem.message.includes('校验和')),
    'tampered data is reported per resource id as a checksum failure',
  );

  const schemaFailure = await tamper((packageObject) => {
    delete packageObject.resources[0].data.grid; // grid-map requires grid
    packageObject.resources[0].sha256 = sha256OfJson(packageObject.resources[0].data);
  });
  assert.ok(!schemaFailure.ok);
  assert.ok(
    schemaFailure.problems.some((problem) => problem.message.includes('不符合当前 schema')),
    'a valid checksum does not excuse schema-invalid data',
  );

  const duplicate = await tamper((packageObject) => {
    packageObject.resources.push(JSON.parse(JSON.stringify(packageObject.resources[0])));
  });
  assert.ok(!duplicate.ok);
  assert.ok(duplicate.problems.some((problem) => problem.message.includes('重复')));

  const unknown = await tamper((packageObject) => {
    packageObject.resources[1].id = 'map.not-registered';
  });
  assert.ok(!unknown.ok);
  assert.ok(
    unknown.problems.some((problem) => problem.message.includes('未在当前仓库 manifest 登记')),
    'unregistered resource ids are rejected with the id in the message',
  );

  for (const evilId of ['../evil', 'a/b', '.hidden']) {
    const unsafe = await tamper((packageObject) => {
      packageObject.package.id = evilId;
    });
    assert.ok(!unsafe.ok, `package id "${evilId}" must be rejected`);
    assert.ok(
      unsafe.problems.some((problem) => problem.message.includes(evilId)),
      `the rejection names the unsafe id "${evilId}"`,
    );
  }

  const smuggledPath = await tamper((packageObject) => {
    packageObject.resources[0].path = 'evil/plant.json';
  });
  assert.ok(!smuggledPath.ok, 'a resource-level path field is rejected');
  assert.ok(
    smuggledPath.problems.some((problem) => problem.details.some((detail) => detail.includes('不得携带文件路径'))),
    'the error explains that install paths come from the local manifest only',
  );

  const futureFormat = await tamper((packageObject) => {
    packageObject.formatVersion = 99;
  });
  assert.ok(!futureFormat.ok);
  assert.ok(
    futureFormat.problems.some((problem) => problem.message.includes('formatVersion 99') && problem.hint.includes('升级')),
    'a future format version gets a readable upgrade hint',
  );

  const engineTooNew = await tamper((packageObject) => {
    packageObject.minimumEngineVersion = '99.0.0';
  });
  assert.ok(!engineTooNew.ok);
  assert.ok(
    engineTooNew.problems.some((problem) => problem.message.includes('99.0.0') && problem.message.includes(ENGINE_VERSION)),
    'an engine newer than ours is refused with both versions named',
  );

  const looseVersion = await tamper((packageObject) => {
    packageObject.minimumEngineVersion = '1.2';
  });
  assert.ok(!looseVersion.ok, 'loose version strings are rejected');

  const unsafePackageVersion = await tamper((packageObject) => {
    packageObject.package.version = '9007199254740992.0.0';
  });
  assert.ok(!unsafePackageVersion.ok, 'package version segments outside the safe integer range are rejected');
  assert.ok(unsafePackageVersion.problems.some((problem) => problem.message.includes('可比较的安全三段数字版本')));

  const oversized = await inspectPackage({ repo, packageFile, maxPackageBytes: 8 });
  assert.ok(!oversized.ok);
  assert.ok(oversized.problems.some((problem) => problem.message.includes('超过上限')), 'the size cap fires before reading');

  // -------------------------------------------------------------------------
  // 6. Export-side diagnostics on a broken legacy mod
  // -------------------------------------------------------------------------
  const badMod = 'bad-mod';
  const badFile = (relative, content) =>
    writeRepoFile(`mods/${badMod}/${relative}`, content);

  const missingDir = await buildModPackage({ repo, modId: badMod });
  assert.ok(!missingDir.ok, 'exporting a mod dir that does not exist fails');
  assert.ok(missingDir.problems.some((problem) => problem.message.includes('没有可导出的 JSON 文件')));

  await badFile('maps/orphan.json', makeMapData('map.orphan', '孤儿'));
  const orphanResult = await buildModPackage({ repo, modId: badMod });
  assert.ok(!orphanResult.ok);
  assert.ok(
    orphanResult.problems.some((problem) => problem.file.includes('orphan.json') && problem.message.includes('不对应清单已登记资源')),
    'an unregistered file is reported with its exact path',
  );

  await rm(path.join(repo, 'mods', badMod, 'maps', 'orphan.json'));
  await badFile('maps/smoke-a.json', '{ "broken": ');
  const jsonError = await buildModPackage({ repo, modId: badMod });
  assert.ok(!jsonError.ok);
  assert.ok(
    jsonError.problems.some((problem) => problem.message.includes('JSON 解析失败')),
    'broken JSON is reported as a parse failure',
  );

  await badFile('maps/smoke-a.json', { ...makeMapData('map.smoke-a', '坏甲'), tileSize: 3 }); // below minimum 8
  const schemaError = await buildModPackage({ repo, modId: badMod });
  assert.ok(!schemaError.ok);
  assert.ok(
    schemaError.problems.some((problem) => problem.message.includes('不符合 schema')),
    'schema-invalid overrides are refused at export time',
  );

  const unsafeMod = await buildModPackage({ repo, modId: '../escape' });
  assert.ok(!unsafeMod.ok);
  assert.ok(unsafeMod.problems.some((problem) => problem.message.includes('不是安全的单一目录名')));

  // -------------------------------------------------------------------------
  // 7. Real CLI end-to-end against the temp repo
  // -------------------------------------------------------------------------
  const cli = (...args) =>
    execFileAsync(process.execPath, [path.join(root, 'scripts/content-package.mjs'), ...args], {
      cwd: tmpdir(),
      windowsHide: true,
    });

  const cliPackage = path.join(repo, 'cli-pkg.wuxia.json');
  const exportRun = await cli(
    'export', '--mod', 'legacy-mod', '--id', 'cli-pkg', '--name', 'CLI 烟测', '--repo', repo, '--out', cliPackage,
  );
  assert.match(exportRun.stdout, /已导出/);
  const cliExported = JSON.parse(await readFile(cliPackage, 'utf8'));
  assert.equal(cliExported.package.id, 'cli-pkg');

  const exportCollision = await cli(
    'export', '--mod', 'legacy-mod', '--id', 'cli-pkg', '--repo', repo, '--out', cliPackage,
  ).then(
    () => assert.fail('export must not overwrite an existing package file'),
    (error) => error,
  );
  assert.ok(exportCollision.code !== 0);
  assert.match(String(exportCollision.stderr), /已存在/);

  const preflightRun = await cli('import', cliPackage, '--repo', repo);
  assert.match(preflightRun.stdout, /只读预检/);
  assert.match(preflightRun.stdout, /预检通过：未写入任何文件/);
  assert.ok(
    !(await readdir(path.join(repo, 'mods'))).includes('cli-pkg'),
    'CLI preflight installs nothing',
  );

  const applyRun = await cli('import', cliPackage, '--repo', repo, '--apply');
  assert.match(applyRun.stdout, /已安装：/);
  assert.match(applyRun.stdout, /未启用/);
  assert.ok(
    JSON.parse(await readFile(path.join(repo, 'mods/cli-pkg/maps/smoke-a.json'), 'utf8')).name === modA.name,
    'the CLI apply lands the packaged data',
  );

  const reapply = await cli('import', cliPackage, '--repo', repo, '--apply').then(
    () => assert.fail('re-apply must exit nonzero'),
    (error) => error,
  );
  assert.ok(reapply.code !== 0, `re-apply exits nonzero (got ${reapply.code})`);
  assert.match(String(reapply.stderr), /已存在/);

  const usageError = await cli('import').then(
    () => assert.fail('missing argument must exit nonzero'),
    (error) => error,
  );
  assert.ok(usageError.code !== 0);
  assert.match(String(usageError.stderr), /用法/);

  // -------------------------------------------------------------------------
  // 8. The real repository is untouched
  // -------------------------------------------------------------------------
  assert.deepEqual(
    await snapshotFiles(path.join(root, 'mods')),
    realModsBefore,
    'the real mods/ tree is byte-identical after the smoke',
  );
  assert.equal(await readFile(path.join(root, 'data/base/manifest.json'), 'utf8'), realManifestBefore);
} finally {
  await rm(repo, { recursive: true, force: true });
}

console.log(
  '通过：规范 JSON 递归键排序（含 __proto__ 键）与严格三段版本比较（拒绝不安全整数）、传统 MOD 导出（清单序资源/规范校验和/字节级确定性）、'
  + '只读预检（id→本地清单路径映射、默认零写入）、成功应用到全新目录（manifest/基础资料未动、未启用、无暂存残留）、'
  + '目标已存在拒绝且暂存清理、按目标仓库版本检查引擎兼容、重复 manifest 路径拒绝、篡改校验和/Schema 不符/重复与未知资源/穿越 id/夹带 path/未来 formatVersion/引擎过新/宽松与超范围版本/包大小上限逐项可读拒绝、'
  + '导出侧孤儿文件/坏 JSON/坏 Schema/超包体限额/同路径覆盖诊断、真实 CLI 导出-预检-应用-冲突-用法错误全链路，真实 mods/ 与 manifest 字节不变。',
);
