import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const arenas = await server.ssrLoadModule('/src/engine/arena-challenge.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const items = await server.ssrLoadModule('/src/engine/item-system.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');
  const combat = await server.ssrLoadModule('/src/engine/turn-based-combat.ts');
  const maps = await server.ssrLoadModule('/src/engine/grid-map.ts');
  const content = JSON.parse(await readFile('data/base/arenas/round-20-arenas.json', 'utf8'));
  const parsedArena = arenas.parseArenaSet(content);
  assert.equal(parsedArena.ok, true);
  assert.deepEqual(parsedArena.errors, []);
  assert.equal(parsedArena.set.arenas.length, 1);
  const arena = parsedArena.set.arenas[0];
  assert.equal(arena.opponents.length, 2);
  const mapRaw = JSON.parse(await readFile('data/base/maps/round-01-grid.json', 'utf8'));
  const parsedMap = maps.parseGridMap(mapRaw);
  assert.equal(parsedMap.ok, true);
  const artsRaw = JSON.parse(await readFile('data/base/skills/round-04-martial-arts.json', 'utf8'));
  const artsSet = progression.parseMartialArtSet(artsRaw);
  assert.equal(artsSet.ok, true);
  const artsById = new Map(artsSet.set.martialArts.map((art) => [art.id, art]));
  const itemsRaw = JSON.parse(await readFile('data/base/items/round-06-items.json', 'utf8'));
  const itemSet = items.parseItemSet(itemsRaw);
  assert.equal(itemSet.ok, true);
  const itemsById = new Map(itemSet.set.items.map((item) => [item.id, item]));
  const itemIds = new Set(itemsById.keys());
  const profileRaw = JSON.parse(await readFile('data/base/characters/round-04-profiles.json', 'utf8'));
  const profileSet = progression.parseCharacterProfileSet(profileRaw);
  assert.equal(profileSet.ok, true);
  const loadedArena = arenas.assembleArenas({
    set: parsedArena.set,
    knownResourceIds: new Set([mapRaw.id]),
    maps: new Map([[mapRaw.id, parsedMap.map]]),
    spawns: new Map([[mapRaw.id, parsedMap.map.data.playerStart]]),
    npcCells: new Map([[mapRaw.id, new Set()]]),
    encounterCells: new Map([[mapRaw.id, new Set(['1,7'])]]),
    profileIds: new Set([arena.profileId]),
    martialArts: artsById,
    itemIds,
  });
  assert.equal(loadedArena.arenas.length, 1);
  assert.equal(loadedArena.warnings.length, 0);
  assert.equal(arenas.selectArenaTarget(loadedArena.arenas, mapRaw.id, { col: 7, row: 7 })?.record.id, arena.id);
  assert.equal(arenas.selectArenaTarget(loadedArena.arenas, mapRaw.id, { col: 8, row: 7 })?.record.id, arena.id);
  assert.equal(arenas.selectArenaTarget(loadedArena.arenas, mapRaw.id, { col: 5, row: 7 }), null);
  const blockedArena = arenas.assembleArenas({
    set: parsedArena.set,
    knownResourceIds: new Set([mapRaw.id]),
    maps: new Map([[mapRaw.id, parsedMap.map]]),
    spawns: new Map([[mapRaw.id, parsedMap.map.data.playerStart]]),
    npcCells: new Map([[mapRaw.id, new Set(['8,7'])]]),
    encounterCells: new Map([[mapRaw.id, new Set(['1,7'])]]),
    profileIds: new Set([arena.profileId]),
    martialArts: artsById,
    itemIds,
  });
  assert.equal(blockedArena.arenas.length, 0);
  assert.equal(blockedArena.warnings.length, 1);
  const prize = arena.reward.items[0];
  const prizeItem = itemsById.get(prize.itemId);
  assert(prizeItem);
  const prizeInventory = items.createInventoryState(profileSet.set.profiles[0], []);
  assert(items.additionalCapacityFor(prizeInventory, prizeItem) >= prize.quantity);
  items.grantItems(prizeInventory, prizeItem, prize.quantity);
  assert.equal(items.countItem(prizeInventory, prize.itemId), prize.quantity);
  const noCapacity = { ...prizeInventory, capacity: 0, stacks: [], equipped: {} };
  assert(items.additionalCapacityFor(noCapacity, prizeItem) < prize.quantity);
  const encounter = arenas.arenaOpponentAsEncounter(arena, arena.opponents[1], arena.profileId);
  assert.equal(encounter.id, arena.id + '.' + arena.opponents[1].id);
  assert.equal(encounter.repeatable, true);
  assert.equal(encounter.victoryExperience, arena.opponents[1].victoryExperience, 'real round wins keep their training XP');
  assert.deepEqual(arenas.resolveArenaAttemptPayout(arena, 0, true), {
    firstChampionship: true,
    currency: 45,
    items: [{ itemId: 'item.qingxin-wan', quantity: 1 }],
  });
  assert.deepEqual(arenas.resolveArenaAttemptPayout(arena, 1, true), {
    firstChampionship: false,
    currency: 0,
    items: [],
  });
  const record = arenas.createArenaRecord(arena.id);
  assert.deepEqual(arenas.parseArenaRecords(undefined), []);
  assert.deepEqual(arenas.parseArenaRecords([record]), [record]);
  assert.equal(arenas.parseArenaRecords([{ ...record, bestWins: -1 }]), null);

  const profile = profileSet.set.profiles[0];
  const character = progression.createCharacterState(profile);
  character.martialArtIds = ['skill.jianghu-sanshou'];
  for (const opponent of arena.opponents) {
    const round = arenas.arenaOpponentAsEncounter(arena, opponent, profile.id);
    const session = new combat.CombatSession({
      encounter: round,
      profile,
      player: character,
      martialArts: artsById,
    });
    let turns = 0;
    while (!session.isOver && turns < 30) {
      const action = session.playerActions.find((choice) => choice.affordable && choice.art.combat.kind === 'attack');
      assert(action, '测试角色应保有可用攻击');
      session.playerUse(action.art.id);
      turns += 1;
    }
    assert.equal(session.finalResult?.outcome, 'victory');
    assert.equal(session.finalResult?.experienceGained, opponent.victoryExperience);
  }
  const inventory = items.createInventoryState(profile, []);
  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 20',
    mapResourceId: 'map.round-01-grid',
    playerCol: 7,
    playerRow: 7,
    character,
    inventory,
    shopStocks: new Map(),
    journal: quests.createQuestJournal(new Map()),
    social: social.createSocialState(),
    completedEncounters: new Set(),
    completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: new Set(),
    elapsedGameMinutes: 0,
    worldSeed: 7,
    now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const oldV1 = { ...snapshot };
  delete oldV1.arenaRecords;
  const legacyParsed = saves.parseSaveSnapshot(oldV1);
  assert.equal(legacyParsed.ok, true, legacyParsed.ok ? '' : legacyParsed.message);
  if (legacyParsed.ok) assert.deepEqual(legacyParsed.snapshot.arenaRecords, []);
  snapshot.arenaRecords = [record];
  const roundTrip = saves.parseSaveSnapshot(snapshot);
  assert.equal(roundTrip.ok, true, roundTrip.ok ? '' : roundTrip.message);
  if (roundTrip.ok) {
    assert.deepEqual(roundTrip.snapshot.arenaRecords, [record]);
    const restored = saves.restoreRunState({
      profile,
      items: itemsById,
      quests: new Map(),
      shops: new Map(),
      snapshot: roundTrip.snapshot,
    });
    assert.deepEqual(restored.arenaRecords, [record]);
  }
  console.log('通过：擂台/跨资源装配与占格隔离、邻接选择、首夺货币/物品彩头、各轮战斗经验及旧/新 v1 存档解析/恢复。');
} finally {
  await server.close();
}
