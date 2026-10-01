import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { createQuestJournal } from '../src/engine/quest-system';
import { isConditionMet, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { loadWorldData } from '../src/game/world-loader';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function installRepositoryDataFetch(): () => void {
  const files = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const relative = prefix === '' ? name : `${prefix}/${name}`;
      if (statSync(absolute).isDirectory()) {
        walk(absolute, relative);
      } else if (name.endsWith('.json')) {
        // vite.config.ts serves data/ as publicDir, so runtime URLs are
        // relative to the site root (./base/..., ./schema/...), not /data/.
        files.set(`/${relative.split(path.sep).join('/')}`, readFileSync(absolute, 'utf8'));
      }
    }
  };
  walk(path.join(repoRoot, 'data'), '');

  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(rawUrl, 'http://round-49.test').pathname;
    const body = files.get(pathname);
    return new Response(body ?? 'not found', {
      status: body === undefined ? 404 : 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  return () => {
    vi.stubGlobal('fetch', originalFetch);
    vi.unstubAllGlobals();
  };
}

describe('Round 49 default world integrity', () => {
  it('loads all shipped data and assembles playable optional content without warnings', async () => {
    const restoreFetch = installRepositoryDataFetch();
    try {
      const outcome = await loadWorldData();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const { assembly, optionalWarnings, resourceSources } = outcome.world;
      const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'data/base/manifest.json'), 'utf8')) as {
        resources: unknown[];
      };
      const relay = assembly.dialogues.get('dlg.r91-nie-qiyan-vigil')!.nodes.find(n => n.id === 'greet')!.options!.find(o => o.nextNodeId === 'r105-ledger-receive-0');
      expect(relay).toBeDefined();
      const journal = createQuestJournal(assembly.quests);
      journal.states.get('quest.r91-goose-vigil')!.status = 'completed';
      // This option reads exactly these two fields; actual UI evidence remains separate.
      const context = { journal, knownKnowledgeNodeIds: new Set(['event.r105-ledger-message', 'event.r100-record-open']) } as DialogueRuntimeContext;
      expect(relay!.conditions!.every(c => isConditionMet(c, context))).toBe(true);
      const weatherOptions = assembly.dialogues.get('dlg.r93-liu-xunjing-rounds')!.nodes.find(n => n.id === 'greet')!.options!.filter(o => o.nextNodeId.startsWith('r141-weather-'));
      expect(weatherOptions).toHaveLength(outcome.world.climate.weathers.length);
      expect(weatherOptions.every(o => o.conditions?.some(c => c.kind === 'weather') && !o.effects)).toBe(true);
      expect(resourceSources).toHaveLength(manifest.resources.length);
      expect(assembly.npcs.length).toBeGreaterThanOrEqual(10);
      expect(assembly.npcs.some(({ record }) => record.id === 'char.r74-shen-yuji')).toBe(true);
      expect(assembly.dialogues.size).toBeGreaterThan(0);
      expect(assembly.progression.factions.size).toBeGreaterThanOrEqual(5);
      expect(assembly.progression.martialArts.size).toBeGreaterThanOrEqual(30);
      expect(assembly.quests.size).toBeGreaterThanOrEqual(20);
      expect(assembly.quests.has('quest.r74-cloud-marks')).toBe(true);
      expect(assembly.quests.has('quest.r74-cloud-bridge')).toBe(true);
      expect(assembly.items.size).toBeGreaterThanOrEqual(50);
      expect(optionalWarnings.map(({ resource, origin, message, details }) => ({
        resource,
        origin,
        message,
        details,
      }))).toEqual([]);
    } finally {
      restoreFetch();
    }
  });
});
