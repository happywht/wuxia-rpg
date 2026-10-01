import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('patrol author preserves existing encounters, is idempotent and refuses changed practice', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r142-'));
  try {
    const target = join(workspace, 'data/base/battles/round-05-encounters.json');
    mkdirSync(join(workspace, 'data/base/battles'), { recursive: true });
    const original = JSON.parse(readFileSync('data/base/battles/round-05-encounters.json', 'utf8'));
    original.encounters = original.encounters.filter((e: {id: string}) => e.id !== 'encounter.r142-patrol-drill');
    writeFileSync(target, JSON.stringify(original));
    const run = () => spawnSync(process.execPath, [resolve('scripts/apply-round142-patrol-drill.mjs')], {cwd: workspace, encoding: 'utf8'});
    expect(run().status).toBe(0);
    const first = readFileSync(target, 'utf8');
    expect(JSON.parse(first).encounters.slice(0, -1)).toEqual(original.encounters);
    expect(run().status).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(first);
    const changed = JSON.parse(first);
    changed.encounters.at(-1).enemy.health = 161;
    writeFileSync(target, JSON.stringify(changed));
    const before = readFileSync(target, 'utf8');
    const refused = run();
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('拒绝覆盖');
    expect(readFileSync(target, 'utf8')).toBe(before);
  } finally {
    rmSync(workspace, {recursive: true, force: true});
  }
});
