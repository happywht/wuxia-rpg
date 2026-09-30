/**
 * Round 38 unit tests for the shared base-data validator — the exact code
 * path behind `npm run validate:data` (scripts/lib/data-validation.mjs).
 *
 * The positive case runs against the real repository data. Failure cases are
 * exercised inside throwaway temp roots (schemas copied from the repo, tiny
 * hand-broken data), so tracked data is never modified and each failure mode
 * is observable in isolation.
 */

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { validateBaseData } from '../scripts/lib/data-validation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

/** Copies a repository schema and writes fixture files under a temp root. */
async function writeFixture(files: Record<string, string>, temporaryBase = tmpdir()): Promise<string> {
  const root = await mkdtemp(join(temporaryBase, '.wuxia-rpg-validation-'));
  tempRoots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

async function readRepoSchema(id: string): Promise<string> {
  return readFile(join(repoRoot, 'data/schema', `${id}.schema.json`), 'utf8');
}

describe('validateBaseData against the real repository', () => {
  it('accepts the manifest and every listed resource', async () => {
    const manifestText = await readFile(join(repoRoot, 'data/base/manifest.json'), 'utf8');
    const expectedCount = (JSON.parse(manifestText) as { resources: unknown[] }).resources.length;

    const result = await validateBaseData(repoRoot);
    expect(result).toEqual({ ok: true, validated: expectedCount });
  }, 15000);
});

describe('validateBaseData failure paths (temp fixtures)', () => {
  it('reports the resource id when a resource violates its schema', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      'data/schema/quest-set.schema.json': await readRepoSchema('quest-set'),
      'data/base/manifest.json': JSON.stringify({
        resources: [{ id: 'fixture.bad-quest', path: 'quests/bad.json', schema: 'quest-set' }],
        enabledMods: [],
      }),
      // Missing the schema-required `quests` array.
      'data/base/quests/bad.json': JSON.stringify({ description: '缺少 quests 字段' }),
    });

    const result = await validateBaseData(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('fixture.bad-quest');
    expect(result.problems[0]).toContain('quests');
  });

  it('fails on the manifest itself when it violates the manifest schema', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      // resources requires minItems 1.
      'data/base/manifest.json': JSON.stringify({ resources: [], enabledMods: [] }),
    });

    const result = await validateBaseData(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('manifest.json');
  });

  it('reports a missing resource file without throwing', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      'data/schema/quest-set.schema.json': await readRepoSchema('quest-set'),
      'data/base/manifest.json': JSON.stringify({
        resources: [{ id: 'fixture.missing', path: 'quests/absent.json', schema: 'quest-set' }],
        enabledMods: [],
      }),
    });

    const result = await validateBaseData(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('fixture.missing');
  });

  it('reports a resource schema that is valid JSON but invalid for Ajv', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      'data/schema/quest-set.schema.json': JSON.stringify({ type: 'not-a-json-schema-type' }),
      'data/base/manifest.json': JSON.stringify({
        resources: [{ id: 'fixture.bad-schema', path: 'quests/unused.json', schema: 'quest-set' }],
        enabledMods: [],
      }),
    });

    const result = await validateBaseData(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('quest-set.schema.json');
    expect(result.problems[0]).toContain('Schema 编译失败');
  });

  it('validates JSON null as data instead of confusing it with a read failure', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      'data/schema/quest-set.schema.json': await readRepoSchema('quest-set'),
      'data/base/manifest.json': JSON.stringify({
        resources: [{ id: 'fixture.null-data', path: 'quests/null.json', schema: 'quest-set' }],
        enabledMods: [],
      }),
      'data/base/quests/null.json': 'null',
    });

    const result = await validateBaseData(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('fixture.null-data');
    expect(result.problems[0]).toContain('must be object');
  });

  it('prints a readable validation error and exits non-zero through the CLI', async () => {
    const root = await writeFixture({
      'data/schema/manifest.schema.json': await readRepoSchema('manifest'),
      'data/schema/quest-set.schema.json': await readRepoSchema('quest-set'),
      'data/base/manifest.json': JSON.stringify({
        resources: [{ id: 'fixture.cli-invalid', path: 'quests/bad.json', schema: 'quest-set' }],
        enabledMods: [],
      }),
      'data/base/quests/bad.json': JSON.stringify({ description: '缺少 quests 字段' }),
    }, repoRoot);
    const cliPath = join(root, 'scripts', 'validate-data.mjs');
    const validatorPath = join(root, 'scripts', 'lib', 'data-validation.mjs');
    await mkdir(dirname(validatorPath), { recursive: true });
    await copyFile(join(repoRoot, 'scripts', 'validate-data.mjs'), cliPath);
    await copyFile(join(repoRoot, 'scripts', 'lib', 'data-validation.mjs'), validatorPath);

    const child = spawnSync(process.execPath, [cliPath], { encoding: 'utf8' });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('校验失败：fixture.cli-invalid');
    expect(child.stderr).toContain('quests');
  });
});
