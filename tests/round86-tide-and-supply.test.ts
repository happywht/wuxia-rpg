import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInventoryState, createShopStockRuntime, resolveStartingItems } from '../src/engine/item-system';
import { createCharacterState } from '../src/engine/character-progression';
import { createQuestJournal } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import { captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState } from '../src/engine/save-system';
import { encounterMatchesTide, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { loadWorldData } from '../src/game/world-loader';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapId = 'map.round-85-tide-isle';
const merchantId = 'char.r86-lu-yubai';
const shopId = 'shop.r86-tide-isle-supplies';
const encounterId = 'encounter.r86-reef-raiders';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as any;
}

function installRepositoryDataFetch(): () => void {
  const files = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const relative = prefix === '' ? name : `${prefix}/${name}`;
      if (statSync(absolute).isDirectory()) walk(absolute, relative);
      else if (name.endsWith('.json')) files.set(`/${relative.split(path.sep).join('/')}`, readFileSync(absolute, 'utf8'));
    }
  };
  walk(path.join(repoRoot, 'data'), '');
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = files.get(new URL(rawUrl, 'http://round-86.test').pathname);
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

afterEach(() => vi.restoreAllMocks());

describe('Round 86 Tide Isle provisions and tide-gated encounter', () => {
  it('keeps the reef fight active only at low tide and validates its phase ids', () => {
    const raw = readJson('data/base/battles/round-86-tide-isle-encounters.json');
    const parsed = parseBattleEncounterSet(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const encounter = parsed.set.encounters.find(({ id }) => id === encounterId);
    expect(encounter).toMatchObject({ repeatable: true, victoryExperience: 0, tideIds: ['tide.low'] });
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    expect(encounterMatchesTide(encounter, 'tide.low')).toBe(true);
    expect(encounterMatchesTide(encounter, 'tide.high')).toBe(false);
    expect(encounterMatchesTide(encounter, null)).toBe(false);
    expect(encounterMatchesTide({ tideIds: undefined }, 'tide.high')).toBe(true);

    for (const tideIds of [[], [''], ['tide.low', 'tide.low']]) {
      const malformed = structuredClone(raw);
      malformed.encounters[0].tideIds = tideIds;
      const invalid = parseBattleEncounterSet(malformed);
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) expect(invalid.errors.join(' ')).toContain('tideIds');
    }
  });

  it('assembles the island merchant, finite stock, graph references and low-tide foe', async () => {
    const restoreFetch = installRepositoryDataFetch();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const outcome = await loadWorldData();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const { world } = outcome;

      const island = world.maps.get(mapId);
      expect(island).toBeDefined();
      expect(island?.canEnter(18, 54)).toBe(true);
      expect(island?.canEnter(57, 51)).toBe(true);
      expect(world.assembly.npcs.some(({ record }) => record.id === merchantId)).toBe(true);

      const shop = world.assembly.shops.get(shopId);
      expect(shop?.record.npcId).toBe(merchantId);
      expect(shop?.stock.map(({ quantity }) => quantity)).toEqual([3, 3, 2, 2]);
      if (shop === undefined) return;
      const stock = createShopStockRuntime(shop);
      expect([...stock.values()]).toEqual([3, 3, 2, 2]);

      const encounter = world.assembly.encounters.find(({ record }) => record.id === encounterId);
      expect(encounter?.record.tideIds).toEqual(['tide.low']);
      expect(world.climate.tideCycle?.phases.map(({ id }) => id)).toContain('tide.low');
      expect(encounter).toBeDefined();
      if (encounter === undefined) return;
      expect(encounterMatchesTide(encounter.record, 'tide.low')).toBe(true);
      expect(encounterMatchesTide(encounter.record, 'tide.ebb')).toBe(false);

      expect(world.knowledgeGraph.nodes.has('place.r86-tide-isle-supply')).toBe(true);
      expect(world.knowledgeGraph.nodes.has('event.r86-reef-raiders')).toBe(true);
      expect(world.optionalWarnings).toEqual([]);
    } finally {
      restoreFetch();
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it('persists the island shop remaining stock through save parsing and restore', { timeout: 20_000 }, async () => {
    const restoreFetch = installRepositoryDataFetch();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const outcome = await loadWorldData();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const { world } = outcome;
      const profile = world.assembly.progression.profiles.get('char.scribe-apprentice');
      const shop = world.assembly.shops.get(shopId);
      expect(profile).toBeDefined();
      expect(shop).toBeDefined();
      if (profile === undefined || shop === undefined) return;

      const shops = new Map([[shopId, shop]]);
      const stocks = new Map([...shops].map(([id, record]) => [id, createShopStockRuntime(record)]));
      const remaining = stocks.get(shopId)!;
      remaining.set('item.huichun-gao', 2); // One of the three was bought before saving.
      const character = createCharacterState(profile);
      const inventory = createInventoryState(profile, resolveStartingItems(profile, world.assembly.items).stacks);
      const snapshot = captureSaveSnapshot({
        displayName: '潮生屿补给测试',
        mapResourceId: world.mapResourceId,
        playerCol: 43,
        playerRow: 37,
        character,
        inventory,
        shopStocks: stocks,
        journal: createQuestJournal(world.assembly.quests),
        social: createSocialState(),
        completedEncounters: new Set(),
        completedRegionalEvents: new Set(),
        knownKnowledgeNodeIds: new Set(),
        elapsedGameMinutes: 0,
        worldSeed: 86,
        factionMembership: null,
        now: () => new Date('2026-09-30T00:00:00.000Z'),
      });
      const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const questObjectiveIds = new Map([...world.assembly.quests].map(([id, quest]) => [
        id,
        new Set(quest.objectives.map(({ id: objectiveId }) => objectiveId)),
      ]));
      const refs = {
        profileIds: new Set([profile.id]),
        profileRecords: new Map([[profile.id, profile]]),
        mapResourceId: world.mapResourceId,
        isWalkableCell: (col: number, row: number) => world.map.canEnter(col, row),
        isCellOccupied: () => false,
        itemIds: new Set(world.assembly.items.keys()),
        itemRecords: world.assembly.items,
        martialArtIds: new Set(world.assembly.progression.martialArts.keys()),
        questIds: new Set(world.assembly.quests.keys()),
        questObjectiveIds,
        encounterIds: new Set(world.assembly.encounters.map(({ record }) => record.id)),
        shopIds: new Set(world.assembly.shops.keys()),
        shopRecords: world.assembly.shops,
        questRecords: world.assembly.quests,
        npcIds: new Set(world.assembly.npcs.map(({ record }) => record.id)),
        regionalEventIds: new Set(world.worldMap.events.map(({ id }) => id)),
        knowledgeNodeIds: new Set(world.knowledgeGraph.nodes.keys()),
        defaultKnowledgeNodeIds: new Set([...world.knowledgeGraph.nodes.values()]
          .filter(({ knownByDefault }) => knownByDefault).map(({ id }) => id)),
        factionIds: new Set(world.assembly.progression.factions.keys()),
        factionMentorNpcIds: new Map([...world.assembly.progression.factions]
          .map(([id, faction]) => [id, new Set(faction.mentorNpcIds)])),
      };
      const plan = planSnapshotRestore(parsed.snapshot, refs);
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.warnings).toEqual([]);

      const restored = restoreRunState({
        profile,
        items: world.assembly.items,
        quests: world.assembly.quests,
        shops: world.assembly.shops,
        snapshot: plan.snapshot,
      });
      expect([...restored.shopStocks.get(shopId)!.entries()]).toEqual([
        ['item.huichun-gao', 2],
        ['item.qingxin-wan', 3],
        ['item.r32.songzhen-xuesan', 2],
        ['item.r32.ouling-huqitang', 2],
      ]);
    } finally {
      restoreFetch();
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
