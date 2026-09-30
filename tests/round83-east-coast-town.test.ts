/** Round 83: independent harbor content sets, live schedules, trade and the tide-linked quest chain. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buyItem, countItem, createShopStockRuntime, type InventoryState } from '../src/engine/item-system';
import { findGridPath } from '../src/engine/grid-path';
import { acceptQuest, applyQuestSignal, createQuestJournal } from '../src/engine/quest-system';
import { selectInteractableRegionEvent } from '../src/engine/world-map';
import { validateConversation } from '../src/engine/dialogue-graph';
import { loadWorldData } from '../src/game/world-loader';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coastId = 'map.round-82-east-coast';
const merchantId = 'char.r83-jin-yunfan';
const fishermanId = 'char.r83-gu-chaosheng';
const ointmentId = 'item.r83-sea-salt-ointment';
const shopId = 'shop.r83-blue-sail-provisions';
const encounterId = 'encounter.r83-tide-wake-looters';
const recoveryQuestId = 'quest.r83-net-recovery';
const channelQuestId = 'quest.r83-night-channel';
const netShoalsId = 'place.r83-net-shoals';
const nightChannelId = 'place.r83-night-channel';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as any;
}

function installRepositoryDataFetch(replacements: Readonly<Record<string, string>> = {}): () => void {
  const files = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const relative = prefix === '' ? name : `${prefix}/${name}`;
      if (statSync(absolute).isDirectory()) {
        walk(absolute, relative);
      } else if (name.endsWith('.json')) {
        files.set(`/${relative.split(path.sep).join('/')}`, readFileSync(absolute, 'utf8'));
      }
    }
  };
  walk(path.join(repoRoot, 'data'), '');
  for (const [relativePath, body] of Object.entries(replacements)) {
    files.set(`/${relativePath.replaceAll('\\', '/')}`, body);
  }

  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(rawUrl, 'http://round-83.test').pathname;
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

async function loadRepositoryWorld(replacements: Readonly<Record<string, string>> = {}) {
  const restoreFetch = installRepositoryDataFetch(replacements);
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    return await loadWorldData();
  } finally {
    restoreFetch();
    info.mockRestore();
    warn.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('Round 83 east coast harbor town', () => {
  it('loads independent harbor data and plays its schedule, shop, encounter and two-part quest chain', async () => {
    const outcome = await loadRepositoryWorld();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { world } = outcome;
    const { assembly } = world;
    const coast = world.maps.get(coastId);
    expect(coast).toBeDefined();
    if (coast === undefined) return;

    expect(assembly.items.has(ointmentId)).toBe(true);
    const shop = assembly.shops.get(shopId);
    const ointment = assembly.items.get(ointmentId);
    expect(shop?.record.npcId).toBe(merchantId);
    expect(shop?.stock.map(({ itemId }) => itemId)).toContain(ointmentId);
    expect(ointment?.name).toBe('海盐敷膏');
    if (shop === undefined || ointment === undefined) return;

    const stock = createShopStockRuntime(shop);
    const inventory: InventoryState = { currency: 100, capacity: 6, stacks: [], equipped: {} };
    expect(buyItem(inventory, stock, ointment).ok).toBe(true);
    expect(countItem(inventory, ointmentId)).toBe(1);
    expect(inventory.currency).toBe(74);
    expect(stock.get(ointmentId)).toBe(5);

    const newNpcIds = new Set([merchantId, fishermanId]);
    const expectedPeriods = new Set(world.calendar.periods.map(({ id }) => id));
    expect(expectedPeriods.size).toBe(7);
    for (const periodId of expectedPeriods) {
      const localNpcs = (assembly.npcsByPeriod.get(periodId) ?? assembly.npcs)
        .filter(({ record }) => record.mapResourceId === coastId);
      const harborNpcs = localNpcs.filter(({ record }) => newNpcIds.has(record.id));
      expect(harborNpcs.map(({ record }) => record.id).sort()).toEqual([...newNpcIds].sort());
      expect(new Set(localNpcs.map(({ col, row }) => `${col},${row}`)).size).toBe(localNpcs.length);
      for (const npc of harborNpcs) {
        expect(coast.canEnter(npc.col, npc.row)).toBe(true);
        expect(findGridPath(coast, coast.playerStart, { col: npc.col, row: npc.row })).not.toBeNull();
      }
    }

    const merchant = assembly.npcs.find(({ record }) => record.id === merchantId);
    const fisherman = assembly.npcs.find(({ record }) => record.id === fishermanId);
    expect(merchant?.record.spriteFrames).toMatchObject({ down: 32, right: 40, up: 48, left: 56 });
    expect(fisherman?.record.spriteFrames).toMatchObject({ down: 96, right: 104, up: 112, left: 120 });

    const encounter = assembly.encounters.find(({ record }) => record.id === encounterId);
    expect(encounter).toBeDefined();
    if (encounter === undefined) return;
    expect(encounter.record.repeatable).toBe(true);
    expect(findGridPath(coast, coast.playerStart, { col: encounter.col, row: encounter.row })).not.toBeNull();

    const returnGate = world.worldMap.transitions.find(({ id }) => id === 'gate.r82-east-coast-to-cloud-ridge');
    expect(returnGate).toBeDefined();
    if (returnGate === undefined) return;
    expect(findGridPath(coast, coast.playerStart, returnGate.from)).not.toBeNull();

    const newLandmark = world.worldMap.landmarks.find(({ discoveryNodeId }) => discoveryNodeId === nightChannelId);
    expect(newLandmark).toMatchObject({ mapResourceId: coastId, col: 63, row: 72 });
    const nightEvent = world.worldMap.events.find(({ id }) => id === 'event.r83-night-channel');
    expect(nightEvent).toBeDefined();
    if (nightEvent === undefined) return;
    expect(findGridPath(coast, coast.playerStart, { col: 64, row: 72 })).not.toBeNull();
    expect(selectInteractableRegionEvent(
      world.worldMap.events,
      { mapResourceId: coastId, col: 64, row: 72 },
      new Set(),
      { knownKnowledgeNodeIds: new Set(), periodId: 'period.dusk', weatherId: null },
      coast.canEnter.bind(coast),
    )).toBeNull();
    expect(selectInteractableRegionEvent(
      world.worldMap.events,
      { mapResourceId: coastId, col: 64, row: 72 },
      new Set(),
      { knownKnowledgeNodeIds: new Set([netShoalsId]), periodId: 'period.morning', weatherId: null },
      coast.canEnter.bind(coast),
    )).toBeNull();
    expect(selectInteractableRegionEvent(
      world.worldMap.events,
      { mapResourceId: coastId, col: 64, row: 72 },
      new Set(),
      { knownKnowledgeNodeIds: new Set([netShoalsId]), periodId: 'period.dusk', weatherId: null },
      coast.canEnter.bind(coast),
    )?.event.id).toBe(nightEvent.id);

    const conversation = assembly.dialogues.get('dlg.r83-gu-chaosheng-tide-line');
    expect(conversation).toBeDefined();
    if (conversation === undefined) return;
    expect(validateConversation(conversation)).toEqual([]);
    expect(conversation.nodes.find(({ id }) => id === 'greet')?.options?.some(({ conditions, effects }) =>
      conditions?.some((condition) => condition.kind === 'questStatus' && condition.questId === recoveryQuestId) &&
      effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === recoveryQuestId))).toBe(true);

    const quests = assembly.quests;
    expect(quests.has(recoveryQuestId)).toBe(true);
    expect(quests.has(channelQuestId)).toBe(true);
    const journal = createQuestJournal(quests);
    const oldTideQuest = journal.states.get('quest.r82-follow-the-tide');
    expect(oldTideQuest).toBeDefined();
    if (oldTideQuest === undefined) return;
    // Seed the already completed Round 82 hand-off; this test focuses on the new continuation.
    oldTideQuest.status = 'completed';
    applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: fishermanId });
    expect(journal.states.get(recoveryQuestId)?.status).toBe('offered');
    expect(acceptQuest(quests, journal, recoveryQuestId).ok).toBe(true);

    const recovery = applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId });
    expect(recovery.completed.map(({ questId }) => questId)).toEqual([recoveryQuestId]);
    expect(recovery.completed[0]?.discoverKnowledgeNodeIds).toContain(netShoalsId);
    expect(journal.states.get(channelQuestId)?.status).toBe('offered');
    expect(acceptQuest(quests, journal, channelQuestId).ok).toBe(true);
    const channel = applyQuestSignal(quests, journal, { type: 'knowledge-discovery', nodeId: nightChannelId });
    expect(channel.completed.map(({ questId }) => questId)).toEqual([channelQuestId]);
    expect(journal.states.get(channelQuestId)?.status).toBe('completed');

    const r83Edges = [...world.knowledgeGraph.edges.values()].filter(({ id }) => id.startsWith('kg.edge.r83-'));
    expect(r83Edges).toHaveLength(11);
    for (const edge of r83Edges) {
      expect(world.knowledgeGraph.nodes.has(edge.fromId), `${edge.id} fromId`).toBe(true);
      expect(world.knowledgeGraph.nodes.has(edge.toId), `${edge.id} toId`).toBe(true);
    }
    expect(world.optionalWarnings).toEqual([]);
  });

  it('isolates malformed item, shop and encounter sets while keeping the other rounds playable', { timeout: 20_000 }, async () => {
    const outcome = await loadRepositoryWorld({
      'base/items/round-83-east-coast-items.json': JSON.stringify({ items: 'malformed round 83 items' }),
      'base/shops/round-83-east-coast-shops.json': JSON.stringify({ shops: 'malformed round 83 shops' }),
      'base/battles/round-83-east-coast-encounters.json': JSON.stringify({ encounters: 'malformed round 83 encounters' }),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { world } = outcome;
    expect(world.assembly.items.has('item.huichun-gao')).toBe(true);
    expect(world.assembly.items.has(ointmentId)).toBe(false);
    expect(world.assembly.shops.has(shopId)).toBe(false);
    expect(world.assembly.shops.size).toBeGreaterThan(0);
    expect(world.assembly.encounters.length).toBeGreaterThan(0);
    expect(world.assembly.encounters.some(({ record }) => record.id === encounterId)).toBe(false);
    expect(world.assembly.npcs.some(({ record }) => record.id === fishermanId)).toBe(true);
    expect(world.assembly.quests.size).toBeGreaterThanOrEqual(20);
    const rejectedResources = new Set(world.optionalWarnings.map(({ resource }) => resource));
    expect(rejectedResources).toContain('item.round-83-east-coast-set');
    expect(rejectedResources).toContain('shop.round-83-east-coast-set');
    expect(rejectedResources).toContain('encounter.round-83-east-coast-set');
  });

  it('keeps the first item and shop declarations when later resources repeat their ids', async () => {
    const manifest = readJson('data/base/manifest.json');
    const item = readJson('data/base/items/round-83-east-coast-items.json').items[0];
    const shop = readJson('data/base/shops/round-83-east-coast-shops.json').shops[0];
    const resources = [
      { id: 'test.round-83-duplicate-items', path: 'test/round-83-duplicate-items.json', schema: 'items-set' },
      { id: 'test.round-83-duplicate-shops', path: 'test/round-83-duplicate-shops.json', schema: 'shops-set' },
    ];
    manifest.resources.push(...resources);

    const outcome = await loadRepositoryWorld({
      'base/manifest.json': JSON.stringify(manifest),
      'base/test/round-83-duplicate-items.json': JSON.stringify({ items: [{ ...item, name: '覆写用假药' }] }),
      'base/test/round-83-duplicate-shops.json': JSON.stringify({ shops: [{ ...shop, name: '覆写用假摊' }] }),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.world.assembly.items.get(ointmentId)?.name).toBe('海盐敷膏');
    expect(outcome.world.assembly.shops.get(shopId)?.record.name).toBe('青帆埠潮行补给摊');
    expect(outcome.world.optionalWarnings.some(({ message }) => message.includes(ointmentId) && message.includes('首条'))).toBe(true);
    expect(outcome.world.assembly.warnings.some(({ message }) => message.includes(shopId) && message.includes('保留先声明者'))).toBe(true);
  });
});
