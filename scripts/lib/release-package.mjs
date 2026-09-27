import { createHash } from 'node:crypto';

const REQUIRED_RELEASE_PATHS = [
  'index.html',
  'base/manifest.json',
  'schema/manifest.schema.json',
  'mods/example/maps/round-01-grid.json',
  'README.md',
  'docs/RELEASE.md',
  'THIRD-PARTY-NOTICES.md',
];
const SAFE_RELEASE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function isSafeReleasePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    value.split('/').every((segment) => SAFE_RELEASE_SEGMENT.test(segment))
  );
}

function normalizePackPath(value) {
  if (typeof value !== 'string') {
    throw new Error('归档路径必须是字符串');
  }
  const withoutRoot = value.startsWith('package/') ? value.slice('package/'.length) : value;
  if (!isSafeReleasePath(withoutRoot)) {
    throw new Error(`归档含不安全路径：${value}`);
  }
  return withoutRoot;
}

export function createReleaseManifest({ packageName, version, sourceCommit = null, files }) {
  if (typeof packageName !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(packageName)) {
    throw new Error('版本包名称无效');
  }
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('项目版本必须是三段数字语义版本');
  }
  if (sourceCommit !== null && (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceCommit))) {
    throw new Error('源码提交必须是 40 位 Git SHA 或 null');
  }
  if (!Array.isArray(files)) {
    throw new Error('版本包文件必须是数组');
  }

  const seen = new Set();
  const records = files.map(({ path, content }) => {
    if (!isSafeReleasePath(path) || path === 'release-manifest.json') {
      throw new Error(`版本包含不安全或递归清单路径：${String(path)}`);
    }
    if (seen.has(path)) {
      throw new Error(`版本包重复路径：${path}`);
    }
    seen.add(path);
    if (!(content instanceof Uint8Array)) {
      throw new Error(`版本包内容必须是字节：${path}`);
    }
    return {
      path,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));

  const missing = REQUIRED_RELEASE_PATHS.filter((required) => !seen.has(required));
  if (missing.length > 0) {
    throw new Error(`静态版本包缺少必需文件：${missing.join(', ')}`);
  }

  return {
    formatVersion: 1,
    packageName,
    version,
    sourceCommit,
    files: records,
  };
}

export function assertPackContents(packedPaths, expectedPaths) {
  if (!Array.isArray(packedPaths) || !Array.isArray(expectedPaths)) {
    throw new Error('归档路径清单必须是数组');
  }
  const actual = packedPaths.map(normalizePackPath);
  const expected = expectedPaths.map((file) => normalizePackPath(file));
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length) {
    throw new Error('npm 归档含重复路径');
  }
  if (expectedSet.size !== expected.length) {
    throw new Error('版本 staging 目录含重复路径');
  }
  const missing = [...expectedSet].filter((file) => !actualSet.has(file)).sort();
  const extra = [...actualSet].filter((file) => !expectedSet.has(file)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error([
      ...(missing.length > 0 ? [`归档缺少文件：${missing.join(', ')}`] : []),
      ...(extra.length > 0 ? [`归档出现白名单外文件：${extra.join(', ')}`] : []),
    ].join('\n'));
  }
  return true;
}
