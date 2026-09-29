import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');
const assetRoot = path.join(distRoot, 'assets');
const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const entryReference = html.match(/<script[^>]+src="([^"]+)"/u)?.[1];
assert.ok(entryReference?.startsWith('./assets/'), '生产 HTML 使用相对路径加载入口脚本');

function resolveAsset(reference, ownerFile) {
  assert.ok(reference.startsWith('.') || reference.startsWith('/'), `仅接受站内 JS 引用：${reference}`);
  const absolute = reference.startsWith('/')
    ? path.resolve(distRoot, reference.slice(1))
    : path.resolve(path.dirname(ownerFile), reference);
  assert.ok(absolute.startsWith(distRoot + path.sep), `JS 引用必须留在 dist 内：${reference}`);
  return absolute;
}

async function listJavaScript(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listJavaScript(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(absolute);
  }
  return result;
}

const entryFile = resolveAsset(entryReference.slice(1), path.join(distRoot, 'index.html'));
assert.ok((await stat(entryFile)).isFile(), '生产入口 JS 存在');
const chunks = await listJavaScript(assetRoot);
const phaserChunk = chunks.find((file) => /^phaser-runtime-[^/\\]+\.js$/u.test(path.basename(file)));
assert.ok(phaserChunk !== undefined, 'Phaser 被拆分为独立的 phaser-runtime chunk');
assert.notEqual(path.resolve(entryFile), path.resolve(phaserChunk), '应用入口与 Phaser chunk 分离');

for (const chunk of chunks) {
  const source = await readFile(chunk, 'utf8');
  const importPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/gu;
  for (const match of source.matchAll(importPattern)) {
    const reference = match[1];
    if (reference === undefined || !reference.endsWith('.js')) continue;
    const target = resolveAsset(reference, chunk);
    assert.ok((await stat(target).catch(() => null))?.isFile(), `${path.relative(distRoot, chunk)} 引用的 JS 存在：${reference}`);
  }
}

const sizes = await Promise.all(chunks.map(async (file) => {
  const source = await readFile(file);
  return {
    name: path.relative(assetRoot, file).split(path.sep).join('/'),
    bytes: source.byteLength,
    gzipBytes: gzipSync(source).byteLength,
  };
}));
const entrySize = sizes.find(({ name }) => path.resolve(assetRoot, name) === path.resolve(entryFile));
const phaserSize = sizes.find(({ name }) => path.resolve(assetRoot, name) === path.resolve(phaserChunk));
const totalBytes = sizes.reduce((total, chunk) => total + chunk.bytes, 0);
assert.ok(entrySize !== undefined && phaserSize !== undefined);
assert.ok(phaserSize.bytes > 500 * 1024, `Phaser chunk 有实质内容：${phaserSize.bytes} bytes`);
assert.ok(entrySize.bytes < totalBytes * 0.75, '应用入口小于全部 JS 字节的 75%');

console.log(`Round 72 生产 chunk 审计通过：${sizes.length} 个 JS chunk；入口 ${entrySize.bytes} B / gzip ${entrySize.gzipBytes} B；Phaser ${phaserSize.bytes} B / gzip ${phaserSize.gzipBytes} B；全体 JS ${totalBytes} B。`);
for (const chunk of sizes.sort((left, right) => right.bytes - left.bytes)) {
  console.log(`  ${chunk.name}: ${chunk.bytes} B / gzip ${chunk.gzipBytes} B`);
}
