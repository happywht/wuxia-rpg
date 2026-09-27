import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  assertPackContents,
  createReleaseManifest,
  type ReleaseFileInput,
} from '../scripts/lib/release-package.mjs';

const requiredFiles: ReleaseFileInput[] = [
  { path: 'index.html', content: Buffer.from('<html></html>') },
  { path: 'base/manifest.json', content: Buffer.from('{}') },
  { path: 'schema/manifest.schema.json', content: Buffer.from('{}') },
  { path: 'mods/example/maps/round-01-grid.json', content: Buffer.from('{}') },
  { path: 'README.md', content: Buffer.from('# Game') },
  { path: 'docs/RELEASE.md', content: Buffer.from('# Release') },
  { path: 'THIRD-PARTY-NOTICES.md', content: Buffer.from('# Third-party notices') },
  { path: 'package.json', content: Buffer.from('{"name":"wuxia-rpg-web"}') },
];

describe('release package protocol', () => {
  it('creates a sorted SHA-256 manifest bound to the requested version and source commit', () => {
    const manifest = createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      sourceCommit: 'a'.repeat(40),
      files: [...requiredFiles].reverse(),
    });

    expect(manifest.formatVersion).toBe(1);
    expect(manifest.packageName).toBe('wuxia-rpg-web');
    expect(manifest.version).toBe('0.0.1');
    expect(manifest.sourceCommit).toBe('a'.repeat(40));
    expect(manifest.files.map(({ path }) => path)).toEqual(
      [...requiredFiles].map(({ path }) => path).sort((left, right) => left.localeCompare(right)),
    );
    const readme = manifest.files.find(({ path }) => path === 'README.md');
    expect(readme).toMatchObject({
      bytes: Buffer.byteLength('# Game'),
      sha256: createHash('sha256').update('# Game').digest('hex'),
    });
  });

  it('rejects missing runtime payload, unsafe paths, duplicates and recursive manifests', () => {
    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      files: requiredFiles.filter(({ path }) => path !== 'base/manifest.json'),
    })).toThrow('base/manifest.json');

    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      files: [...requiredFiles, { path: '../.serena/project.yml', content: Buffer.from('private') }],
    })).toThrow('不安全');

    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      files: [...requiredFiles, { path: 'C:/private.env', content: Buffer.from('private') }],
    })).toThrow('不安全');

    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      files: [...requiredFiles, requiredFiles[0]!],
    })).toThrow('重复路径');

    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      files: [...requiredFiles, { path: 'release-manifest.json', content: Buffer.from('{}') }],
    })).toThrow('递归清单');
  });

  it('requires a strict version and a full Git SHA when provided', () => {
    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: 'v0.0.1',
      files: requiredFiles,
    })).toThrow('三段数字');

    expect(() => createReleaseManifest({
      packageName: 'wuxia-rpg-web',
      version: '0.0.1',
      sourceCommit: 'deadbeef',
      files: requiredFiles,
    })).toThrow('40 位');
  });

  it('compares npm pack output against the complete staging allowlist', () => {
    const expected = requiredFiles.map(({ path }) => path);
    expect(assertPackContents(expected.map((path) => `package/${path}`), expected)).toBe(true);
    expect(() => assertPackContents([...expected, '.serena/project.yml'], expected)).toThrow('不安全');
    expect(() => assertPackContents([...expected, 'C:/private.env'], expected)).toThrow('不安全');
    expect(() => assertPackContents(expected.slice(1), expected)).toThrow('缺少文件');
    expect(() => assertPackContents([...expected, 'src/main.ts'], expected)).toThrow('白名单外');
  });
});
