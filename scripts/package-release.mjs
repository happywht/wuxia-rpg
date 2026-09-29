import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPackContents, createReleaseManifest } from './lib/release-package.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const webPackageName = 'wuxia-rpg-web';
const releaseDir = path.join(root, 'release');
const distDir = path.join(root, 'dist');
const npmCli = process.env.npm_execpath;

if (typeof npmCli !== 'string' || npmCli.length === 0) {
  throw new Error('请通过 `npm run package:release` 运行版本打包，确保调用锁定的 npm CLI。');
}
if (!/^\d+\.\d+\.\d+$/.test(packageInfo.version)) {
  throw new Error(`package.json version 必须是三段数字语义版本：${String(packageInfo.version)}`);
}

async function listFiles(directory, parent = '') {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = parent.length === 0 ? entry.name : `${parent}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`版本包不接受符号链接：${relative}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push({ path: relative, content: await readFile(absolute) });
    } else {
      throw new Error(`版本包含不支持的文件类型：${relative}`);
    }
  }
  return files;
}

async function ensureBuildIsPresent() {
  const required = [
    'index.html',
    'base/manifest.json',
    'schema/manifest.schema.json',
    'mods/example/maps/round-01-grid.json',
    'assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png',
    'assets/kenney/roguelike-rpg/License.txt',
    'assets/kenney/tiny-dungeon/tilemap_packed.png',
    'assets/kenney/tiny-dungeon/License.txt',
    'assets/kenney/rpg-urban-pack/tilemap_packed.png',
    'assets/kenney/rpg-urban-pack/License.txt',
    'assets/kenney/tiny-town/tilemap_packed.png',
    'assets/kenney/tiny-town/License.txt',
    'assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png',
    'assets/opengameart/rpg-town-pixel-art-assets/License.txt',
    'assets/opengameart/puny-characters/actors.png',
    'assets/opengameart/puny-characters/NOTICE.txt',
    'assets/opengameart/puny-world/tileset.png',
    'assets/opengameart/puny-world/NOTICE.txt',
    'assets/generated/world-palette.png',
  ];
  for (const relative of required) {
    try {
      await readFile(path.join(distDir, ...relative.split('/')));
    } catch {
      throw new Error(`缺少生产构建文件 dist/${relative}；请先通过 npm run build。`);
    }
  }
}

async function removeBuildPlaceholders(directory, parent = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = parent.length === 0 ? entry.name : `${parent}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`生产构建含符号链接：${relative}`);
    }
    if (entry.name === '.gitkeep') {
      await rm(absolute, { force: true });
    } else if (entry.name.startsWith('.')) {
      throw new Error(`生产构建含不允许发布的隐藏文件：${relative}`);
    } else if (entry.isDirectory()) {
      await removeBuildPlaceholders(absolute, relative);
    }
  }
}

function npmJson(args) {
  const command = spawnSync(process.execPath, [npmCli, ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (command.error !== undefined) throw command.error;
  if (command.status !== 0) {
    throw new Error(`npm ${args.join(' ')} 失败：${command.stderr || command.stdout || `exit ${command.status}`}`);
  }
  return JSON.parse(command.stdout);
}

async function findRuntimePackageDirectory(name, version, parentDirectory) {
  const requiringFile = path.join(parentDirectory, '.release-package-lookup.cjs');
  const resolvedEntry = createRequire(requiringFile).resolve(name);
  let candidate = path.dirname(resolvedEntry);
  const modulesRoot = path.join(root, 'node_modules');
  while (candidate.startsWith(modulesRoot)) {
    try {
      const pkg = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8'));
      if (pkg.name === name && pkg.version === version) return candidate;
    } catch {
      // The resolved entry can be below its package root; keep walking up.
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`无法从锁定依赖中定位运行时包 ${name}@${version}`);
}

async function createThirdPartyNotices() {
  const installedTree = npmJson(['ls', '--omit=dev', '--all']);
  const packages = new Map();
  const visit = async (dependencies, parentDirectory) => {
    for (const [name, dependency] of Object.entries(dependencies ?? {})) {
      if (typeof dependency.version !== 'string') {
        throw new Error(`无法读取运行时依赖版本：${name}`);
      }
      const directory = await findRuntimePackageDirectory(name, dependency.version, parentDirectory);
      const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      const packageId = `${pkg.name}@${pkg.version}`;
      if (!packages.has(packageId)) {
        if (typeof pkg.license !== 'string' || pkg.license.length === 0) {
          throw new Error(`运行时依赖缺少明确的 package.json license 字段：${packageId}`);
        }
        const licenseFiles = (await readdir(directory, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && /^(license|licence|copying|notice)(\.|$)/i.test(entry.name))
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right));
        if (licenseFiles.length === 0) {
          throw new Error(`运行时依赖未随包提供 LICENSE/NOTICE 文件：${packageId}`);
        }
        const licenseContents = [];
        for (const file of licenseFiles) {
          licenseContents.push({
            file,
            text: await readFile(path.join(directory, file), 'utf8'),
          });
        }
        packages.set(packageId, { name: pkg.name, version: pkg.version, license: pkg.license, licenseContents });
      }
      await visit(dependency.dependencies, directory);
    }
  };
  await visit(installedTree.dependencies, root);

  const sections = [
    '# Third-party software notices',
    '',
    'This web bundle includes the following production runtime dependencies. The applicable license text distributed with each installed package is reproduced below.',
    '',
  ];
  for (const pkg of [...packages.values()].sort((left, right) => left.name.localeCompare(right.name))) {
    sections.push(`## ${pkg.name}@${pkg.version} — ${pkg.license}`, '');
    for (const licenseFile of pkg.licenseContents) {
      sections.push(`### ${licenseFile.file}`, '', '```text', licenseFile.text.trimEnd(), '```', '');
    }
  }
  return `${sections.join('\n')}\n`;
}

await ensureBuildIsPresent();
await mkdir(releaseDir, { recursive: true });
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'wuxia-rpg-release-'));
const archiveName = `${webPackageName}-${packageInfo.version}.tgz`;
const archivePath = path.join(releaseDir, archiveName);
const checksumPath = `${archivePath}.sha256`;

try {
  await cp(distDir, stagingRoot, { recursive: true, dereference: false });
  await removeBuildPlaceholders(stagingRoot);
  await mkdir(path.join(stagingRoot, 'docs'), { recursive: true });
  await cp(path.join(root, 'README.md'), path.join(stagingRoot, 'README.md'));
  for (const relative of [
    'RELEASE.md',
    'REFERENCES.md',
    'ORIGINAL-FIDELITY.md',
    'PLAYER-GUIDE.md',
    'MOD-GUIDE.md',
  ]) {
    await cp(path.join(root, 'docs', relative), path.join(stagingRoot, 'docs', relative));
  }
  const thirdPartyNotices = await createThirdPartyNotices();
  await writeFile(path.join(distDir, 'THIRD-PARTY-NOTICES.md'), thirdPartyNotices);
  await writeFile(path.join(stagingRoot, 'THIRD-PARTY-NOTICES.md'), thirdPartyNotices);

  const stagedPackage = {
    name: webPackageName,
    version: packageInfo.version,
    private: true,
    description: 'Static web release bundle for the original wuxia RPG prototype',
    files: [
      'index.html',
      'assets/',
      'base/',
      'schema/',
      'mods/',
      'docs/',
      'README.md',
      'release-manifest.json',
      'THIRD-PARTY-NOTICES.md',
    ],
  };
  await writeFile(path.join(stagingRoot, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);

  const manifestFiles = await listFiles(stagingRoot);
  const releaseManifest = createReleaseManifest({
    packageName: webPackageName,
    version: packageInfo.version,
    sourceCommit: process.env.GITHUB_SHA ?? null,
    files: manifestFiles,
  });
  await writeFile(
    path.join(stagingRoot, 'release-manifest.json'),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );

  // Replacing only this exact version's two generated outputs is intentional;
  // the workspace, source files, `dist/`, MODs and `.serena/` are never moved.
  await rm(archivePath, { force: true });
  await rm(checksumPath, { force: true });
  const packed = spawnSync(process.execPath, [
    npmCli,
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    releaseDir,
  ], { cwd: stagingRoot, encoding: 'utf8', windowsHide: true });
  if (packed.error !== undefined) throw packed.error;
  if (packed.status !== 0) {
    throw new Error(`npm pack 失败：${packed.stderr || packed.stdout || `exit ${packed.status}`}`);
  }

  const packResult = JSON.parse(packed.stdout)[0];
  if (packResult?.filename !== archiveName || !Array.isArray(packResult.files)) {
    throw new Error(`npm pack 返回意外文件名或文件清单：${packed.stdout}`);
  }
  assertPackContents(
    packResult.files.map((file) => file.path),
    [...manifestFiles.map((file) => file.path), 'release-manifest.json'],
  );

  const archive = await readFile(archivePath);
  const checksum = createHash('sha256').update(archive).digest('hex');
  await writeFile(checksumPath, `${checksum}  ${archiveName}\n`);
  console.log(`版本包：${path.relative(root, archivePath).split(path.sep).join('/')}`);
  console.log(`大小：${archive.byteLength} bytes · SHA-256 ${checksum}`);
  console.log(`归档文件：${packResult.entryCount} · 内容文件清单：${releaseManifest.files.length}`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
