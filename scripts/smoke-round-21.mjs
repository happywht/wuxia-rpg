import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const wars = await server.ssrLoadModule('/src/engine/faction-war.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const combat = await server.ssrLoadModule('/src/engine/turn-based-combat.ts');
  const maps = await server.ssrLoadModule('/src/engine/grid-map.ts');
  const items = await server.ssrLoadModule('/src/engine/item-system.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');

  const warSetRaw = await readJson('data/base/faction_wars/round-21-wars.json');
  const parsedWars = wars.parseFactionWarSet(warSetRaw);
  assert.equal(parsedWars.ok, true);
  assert.deepEqual(parsedWars.errors, []);
  assert.equal(parsedWars.set.wars.length, 1);
  const rawMap = await readJson('data/base/maps/round-10-mist-ferry.json');
  const parsedMap = maps.parseGridMap(rawMap);
  assert.equal(parsedMap.ok, true);
  const factionSet = progression.parseFactionSet(await readJson('data/base/factions/round-04-factions.json'));
  const artSet = progression.parseMartialArtSet(await readJson('data/base/skills/round-04-martial-arts.json'));
  const profileSet = progression.parseCharacterProfileSet(await readJson('data/base/characters/round-04-profiles.json'));
  assert.equal(factionSet.ok, true);
  assert.equal(artSet.ok, true);
  assert.equal(profileSet.ok, true);
  const artsById = new Map(artSet.set.martialArts.map((art) => [art.id, art]));
  const knownNodes = new Set((await readJson('data/base/knowledge_graph/nodes.json')).nodes.map((node) => node.id));
  const mapId = rawMap.id;
  const assembled = wars.assembleFactionWars({
    set: parsedWars.set,
    knownResourceIds: new Set([mapId]),
    maps: new Map([[mapId, parsedMap.map]]),
    blockedCells: new Map([[mapId, new Set()]]),
    factions: new Set(factionSet.set.factions.map((faction) => faction.id)),
    martialArts: artsById,
    knowledgeNodeIds: knownNodes,
  });
  assert.equal(assembled.wars.length, 1);
  assert.deepEqual(assembled.warnings, []);
  const war = assembled.wars[0];
  const maxStageSet = JSON.parse(JSON.stringify(warSetRaw));
  maxStageSet.wars[0].stages = Array.from({ length: 12 }, (_, index) => ({
    ...maxStageSet.wars[0].stages[0], id: 'stage.pagination-' + index,
  }));
  assert.equal(wars.parseFactionWarSet(maxStageSet).set.wars[0].stages.length, 12);
  const stagePages = [0, 1, 2].map((pageIndex) => wars.paginateFactionWarStages(
    maxStageSet.wars[0].stages, pageIndex, 5,
  ));
  assert.deepEqual(stagePages.map((page) => page.stages.length), [5, 5, 2]);
  assert.equal(stagePages[0].pageCount, 3);
  assert.equal(wars.paginateFactionWarStages(maxStageSet.wars[0].stages, 99, 5).pageIndex, 2);
  assert.throws(() => wars.paginateFactionWarStages(maxStageSet.wars[0].stages, 0, 0), RangeError);
  assert.equal(wars.selectFactionWarTarget(assembled.wars, mapId, { col: 7, row: 3 })?.record.id, war.record.id);
  assert.equal(wars.selectFactionWarTarget(assembled.wars, mapId, { col: 4, row: 4 }), null);
  const blocked = wars.assembleFactionWars({
    set: parsedWars.set,
    knownResourceIds: new Set([mapId]),
    maps: new Map([[mapId, parsedMap.map]]),
    blockedCells: new Map([[mapId, new Set(['7,4'])]]),
    factions: new Set(factionSet.set.factions.map((faction) => faction.id)),
    martialArts: artsById,
    knowledgeNodeIds: knownNodes,
  });
  assert.equal(blocked.wars.length, 0);
  assert.equal(blocked.warnings.length, 1);
  const brokenRefSet = { wars: [{ ...war.record, secondFactionId: 'faction.missing' }] };
  const brokenRef = wars.assembleFactionWars({
    set: brokenRefSet,
    knownResourceIds: new Set([mapId]),
    maps: new Map([[mapId, parsedMap.map]]),
    blockedCells: new Map([[mapId, new Set()]]),
    factions: new Set(factionSet.set.factions.map((faction) => faction.id)),
    martialArts: artsById,
    knowledgeNodeIds: knownNodes,
  });
  assert.equal(brokenRef.wars.length, 0);
  assert.match(brokenRef.warnings[0], /参战门派引用无效/);

  const profile = profileSet.set.profiles[0];
  const character = progression.createCharacterState(profile);
  character.martialArtIds = [...profile.startingMartialArtIds];
  for (const stage of war.record.stages) {
    for (const enemyFactionId of [war.record.firstFactionId, war.record.secondFactionId]) {
      const expected = enemyFactionId === war.record.firstFactionId
        ? stage.firstFactionOpponent : stage.secondFactionOpponent;
      const encounter = wars.factionWarStageAsEncounter(war.record, stage, profile.id, enemyFactionId);
      assert.equal(encounter.repeatable, true);
      assert.equal(encounter.id, war.record.id + '.' + stage.id);
      assert.equal(encounter.enemy.name, expected.enemy.name);
      assert(assembled.wars[0].enemyArts.has(stage.id + ':' + enemyFactionId));
      const session = new combat.CombatSession({
        encounter,
        profile,
        player: character,
        martialArts: artsById,
      });
      let turns = 0;
      while (!session.isOver && turns < 80) {
        const attack = session.playerActions.find((choice) => choice.affordable && choice.art.combat.kind === 'attack');
        if (attack === undefined) break;
        session.playerUse(attack.art.id);
        turns += 1;
      }
      assert(session.finalResult, '每个门派阵营的阶段都必须产出通用战斗结算');
      if (session.finalResult.outcome === 'victory') assert.equal(session.finalResult.experienceGained, stage.victoryExperience);
    }
  }
  assert.equal(wars.resolveFactionWarOutcome(5, 5), 'victory');
  assert.equal(wars.resolveFactionWarOutcome(2, 5), 'stalemate');
  assert.equal(wars.resolveFactionWarOutcome(0, 5), 'defeat');

  const warRecord = { ...wars.createFactionWarRecord(war.record.id), attempts: 1, stalemates: 1,
    bestContribution: 3, lastContribution: 3, lastOutcome: 'stalemate' };
  assert.deepEqual(wars.parseFactionWarRecords(undefined), []);
  assert.deepEqual(wars.parseFactionWarRecords([warRecord]), [warRecord]);
  assert.equal(wars.parseFactionWarRecords([warRecord, warRecord]), null);
  const parsedItems = items.parseItemSet(await readJson('data/base/items/round-06-items.json'));
  assert.equal(parsedItems.ok, true);
  const inventory = items.createInventoryState(profile, []);
  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 21', mapResourceId: mapId, playerCol: 7, playerRow: 7,
    character, inventory, shopStocks: new Map(), journal: quests.createQuestJournal(new Map()),
    social: social.createSocialState(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: new Set(), elapsedGameMinutes: 0, worldSeed: 21,
    now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const legacy = { ...snapshot };
  delete legacy.factionWarRecords;
  const legacyParsed = saves.parseSaveSnapshot(legacy);
  assert.equal(legacyParsed.ok, true, legacyParsed.ok ? '' : legacyParsed.message);
  if (legacyParsed.ok) assert.deepEqual(legacyParsed.snapshot.factionWarRecords, []);
  snapshot.factionWarRecords = [warRecord];
  const roundTrip = saves.parseSaveSnapshot(snapshot);
  assert.equal(roundTrip.ok, true, roundTrip.ok ? '' : roundTrip.message);
  if (roundTrip.ok) {
    const restorePlan = saves.planSnapshotRestore(roundTrip.snapshot, {
      profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
      mapResourceId: mapId, isWalkableCell: () => true, isCellOccupied: () => false,
      itemIds: new Set(parsedItems.set.items.map((item) => item.id)),
      martialArtIds: new Set(artsById.keys()), questIds: new Set(), questObjectiveIds: new Map(),
      encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
      factionIds: new Set(factionSet.set.factions.map((faction) => faction.id)),
      factionWarIds: new Set(), companionIds: new Set(), regionalEventIds: new Set(),
      knowledgeNodeIds: knownNodes, defaultKnowledgeNodeIds: new Set(),
    });
    assert.equal(restorePlan.ok, true);
    if (restorePlan.ok) {
      assert.deepEqual(restorePlan.snapshot.factionWarRecords, []);
      assert.match(restorePlan.warnings.join('\n'), /门派战.*当前资料中不存在/);
      const filteredRestored = saves.restoreRunState({
        profile, items: new Map(parsedItems.set.items.map((item) => [item.id, item])),
        quests: new Map(), shops: new Map(), snapshot: restorePlan.snapshot,
      });
      assert.deepEqual(filteredRestored.factionWarRecords, []);
    }
    const currentWarPlan = saves.planSnapshotRestore(roundTrip.snapshot, {
      profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
      mapResourceId: mapId, isWalkableCell: () => true, isCellOccupied: () => false,
      itemIds: new Set(parsedItems.set.items.map((item) => item.id)),
      martialArtIds: new Set(artsById.keys()), questIds: new Set(), questObjectiveIds: new Map(),
      encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
      factionIds: new Set(factionSet.set.factions.map((faction) => faction.id)),
      factionWarIds: new Set([war.record.id]), companionIds: new Set(), regionalEventIds: new Set(),
      knowledgeNodeIds: knownNodes, defaultKnowledgeNodeIds: new Set(),
    });
    assert.equal(currentWarPlan.ok, true);
    if (currentWarPlan.ok) assert.deepEqual(currentWarPlan.snapshot.factionWarRecords, [warRecord]);
    const restored = saves.restoreRunState({
      profile, items: new Map(parsedItems.set.items.map((item) => [item.id, item])),
      quests: new Map(), shops: new Map(), snapshot: currentWarPlan.ok ? currentWarPlan.snapshot : roundTrip.snapshot,
    });
    assert.deepEqual(restored.factionWarRecords, [warRecord]);
  }
  console.log('通过：门派战资料解析/跨资源引用隔离/12 阶段分页、邻接入口、三阶段通用战斗、贡献胜平负规则与预检后新旧 v1 战绩存档恢复。');
} finally {
  await server.close();
}
