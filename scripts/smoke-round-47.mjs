import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createServer as createViteServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'release');
const appPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archiveName = `wuxia-rpg-web-${appPackage.version}.tgz`;
const archivePath = path.join(releaseRoot, archiveName);
const checksumPath = `${archivePath}.sha256`;
const execFileAsync = promisify(execFile);
const tempRoot = await mkdtemp(path.join(tmpdir(), 'wuxia-round-47-'));

const forbiddenRoots = new Set(['.git', '.serena', 'node_modules', 'src', 'tests', 'scripts', 'iterations']);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

async function listFiles(directory, parent = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = parent.length === 0 ? entry.name : `${parent}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`归档解包出现符号链接：${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`归档解包出现未知文件类型：${relative}`);
  }
  return files;
}

function contentTypeFor(filePath) {
  return contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream';
}

try {
  const archiveStat = await stat(archivePath).catch(() => null);
  assert.ok(archiveStat?.isFile(), `缺少 ${path.relative(root, archivePath)}；请运行 npm run package:release`);
  const archive = await readFile(archivePath);
  const checksumText = await readFile(checksumPath, 'utf8');
  const checksum = createHash('sha256').update(archive).digest('hex');
  assert.equal(checksumText, `${checksum}  ${archiveName}\n`, '外置 SHA-256 sidecar 与归档字节一致');

  const listing = await execFileAsync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
  const tarPaths = listing.stdout.trim().split(/\r?\n/).filter((member) => member.length > 0 && !member.endsWith('/'));
  assert.ok(tarPaths.length > 0, 'tar.gz 至少包含一个文件');
  for (const tarPath of tarPaths) {
    assert.ok(tarPath.startsWith('package/'), `归档成员位于 package/ 根：${tarPath}`);
    const relative = tarPath.slice('package/'.length).replace(/\/$/, '');
    assert.ok(relative.length > 0, `拒绝归档根成员：${tarPath}`);
    assert.ok(!forbiddenRoots.has(relative.split('/')[0]), `归档不得携带开发文件：${relative}`);
    assert.ok(!relative.split('/').some((segment) => segment.startsWith('.')), `归档不得携带隐藏文件：${relative}`);
  }

  const unpackRoot = path.join(tempRoot, 'unpacked');
  await mkdir(unpackRoot, { recursive: true });
  await execFileAsync('tar', ['-xzf', archivePath, '-C', unpackRoot]);
  const packageRoot = path.join(unpackRoot, 'package');
  const packageFiles = await listFiles(packageRoot);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.version, appPackage.version);
  assert.equal(manifest.packageName, 'wuxia-rpg-web');
  const notices = await readFile(path.join(packageRoot, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.match(notices, /phaser@4\.2\.1 — MIT/);
  assert.match(notices, /fast-uri@3\.1\.8 — BSD-3-Clause/);
  for (const guide of ['PLAYER-GUIDE.md', 'MOD-GUIDE.md']) {
    const guideText = await readFile(path.join(packageRoot, 'docs', guide), 'utf8');
    assert.ok(guideText.length > 500, `${guide} 是完整随包指南`);
  }
  assert.deepEqual(
    manifest.files.map(({ path: filePath }) => filePath).sort(),
    packageFiles.filter((filePath) => filePath !== 'release-manifest.json').sort(),
    '包内清单准确列出 staging 的所有其他文件',
  );
  for (const record of manifest.files) {
    const bytes = await readFile(path.join(packageRoot, ...record.path.split('/')));
    assert.equal(bytes.byteLength, record.bytes, `字节数一致：${record.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `文件 SHA-256 一致：${record.path}`);
  }

  const mountPath = '/preview/wuxia-rpg/';
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(mountPath)) {
      response.writeHead(404).end();
      return;
    }
    let relative;
    try {
      relative = decodeURIComponent(url.pathname.slice(mountPath.length));
    } catch {
      response.writeHead(400).end();
      return;
    }
    const requestedPath = relative.length === 0 ? 'index.html' : relative;
    const target = path.resolve(packageRoot, ...requestedPath.split('/'));
    if (target !== packageRoot && !target.startsWith(packageRoot + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': contentTypeFor(target) }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('静态 smoke server 未取得 TCP 地址');

  const vite = await createViteServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { loadGameData } = await vite.ssrLoadModule('/src/engine/data-loader.ts');
    const siteBase = `http://127.0.0.1:${address.port}${mountPath}`;
    const pageResponse = await fetch(siteBase);
    assert.equal(pageResponse.status, 200, '项目子路径下的 index.html 可访问');
    const page = await pageResponse.text();
    const entryUrl = page.match(/<script[^>]+src="([^"]+)"/)?.[1];
    assert.ok(entryUrl?.startsWith('./assets/'), `入口脚本使用相对基址：${String(entryUrl)}`);
    for (const assetPath of [entryUrl, ...[...page.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1])]) {
      if (assetPath === undefined) continue;
      assert.ok(assetPath.startsWith('./'), `HTML 资源使用相对基址：${assetPath}`);
      assert.equal((await fetch(new URL(assetPath, siteBase))).status, 200, `静态资源可访问：${assetPath}`);
    }
    const javascriptFiles = packageFiles.filter((filePath) => filePath.startsWith('assets/') && filePath.endsWith('.js'));
    assert.ok(javascriptFiles.some((filePath) => /\/phaser-runtime-[^/]+\.js$/u.test(filePath)), '发行包含独立 Phaser chunk');
    for (const filePath of javascriptFiles) {
      const scriptUrl = new URL(filePath, siteBase);
      const scriptResponse = await fetch(scriptUrl);
      assert.equal(scriptResponse.status, 200, `发行包 JS chunk 可访问：${filePath}`);
      const source = await scriptResponse.text();
      const imports = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu;
      for (const match of source.matchAll(imports)) {
        const reference = match[1];
        if (reference === undefined || !reference.endsWith('.js')) continue;
        const target = new URL(reference, scriptUrl);
        assert.equal(target.origin, scriptUrl.origin, `JS import stays on the package origin: ${reference}`);
        assert.equal((await fetch(target)).status, 200, `JS import resolves below the package subpath: ${reference}`);
      }
    }

    const modResponse = await fetch(`${siteBase}mods/example/maps/round-01-grid.json`);
    assert.equal(modResponse.status, 200, '示例 MOD JSON 与站点一同被发布');
    const noticeResponse = await fetch(`${siteBase}THIRD-PARTY-NOTICES.md`);
    assert.equal(noticeResponse.status, 200, '第三方运行时依赖许可随静态站点发布');
    for (const assetPath of [
      'assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png',
      'assets/kenney/tiny-dungeon/tilemap_packed.png',
      'assets/kenney/rpg-urban-pack/tilemap_packed.png',
      'assets/kenney/tiny-town/tilemap_packed.png',
      'assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png',
      'assets/opengameart/puny-characters/actors.png',
      'assets/opengameart/puny-world/tileset.png',
      'assets/opengameart/forest-tileset-for-16x16/forest-level-4-sheet.png',
      'assets/generated/world-palette.png',
    ]) {
      const response = await fetch(`${siteBase}${assetPath}`);
      assert.equal(response.status, 200, `像素图集在非根部署路径可访问：${assetPath}`);
      assert.match(response.headers.get('content-type') ?? '', /^image\/png/u, `PNG MIME 正确：${assetPath}`);
    }
    for (const licensePath of [
      'assets/kenney/roguelike-rpg/License.txt',
      'assets/kenney/tiny-dungeon/License.txt',
      'assets/kenney/rpg-urban-pack/License.txt',
      'assets/kenney/tiny-town/License.txt',
      'assets/opengameart/rpg-town-pixel-art-assets/License.txt',
      'assets/opengameart/puny-characters/NOTICE.txt',
      'assets/opengameart/puny-world/NOTICE.txt',
      'assets/opengameart/forest-tileset-for-16x16/NOTICE.txt',
    ]) {
      const response = await fetch(`${siteBase}${licensePath}`);
      assert.equal(response.status, 200, `素材许可或来源声明随包并可读取：${licensePath}`);
      assert.match(await response.text(), /CC0/iu, `许可或来源声明包含 CC0：${licensePath}`);
    }
    const data = await loadGameData({ baseUrl: siteBase });
    assert.equal(data.diagnostics.length, 0, JSON.stringify(data.diagnostics, null, 2));
    const publishedManifestResponse = await fetch(`${siteBase}base/manifest.json`);
    assert.equal(publishedManifestResponse.status, 200, '非根路径下发布的基础 manifest 可读取');
    const publishedManifest = await publishedManifestResponse.json();
    assert.equal(data.resources.size, publishedManifest.resources.length,
      `非根路径下 manifest 的 ${publishedManifest.resources.length} 项资源和 Schema 全部加载`);
    assert.equal(data.enabledMods.length, 0, '基础资料未启用示例覆盖层');
  } finally {
    await vite.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log(`通过：${archiveName} 可解包，${manifest.files.length} 个文件的大小/哈希与清单一致；静态包可挂载到 ${mountPath} 并加载 HTML/JS/CSS、示例 MOD、manifest 中全部基础资料/Schema、四张 Kenney 与三张 OpenGameArt PNG 图集、生成的世界调色板及随包许可/来源声明。`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
