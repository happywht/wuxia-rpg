import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const alchemy = await server.ssrLoadModule('/src/engine/alchemy-system.ts');
  const mapsEngine = await server.ssrLoadModule('/src/engine/grid-map.ts');
  const itemsEngine = await server.ssrLoadModule('/src/engine/item-system.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const knowledge = await server.ssrLoadModule('/src/engine/knowledge-graph.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');

  const [rawAlchemy, rawItems, rawMap, rawProfiles, rawNodes, rawEdges] = await Promise.all([
    readJson('data/base/alchemy/round-25-alchemy.json'),
    readJson('data/base/items/round-06-items.json'),
    readJson('data/base/maps/round-10-mist-ferry.json'),
    readJson('data/base/characters/round-04-profiles.json'),
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
  ]);
  const parsedAlchemy = alchemy.parseAlchemySet(rawAlchemy);
  const parsedItems = itemsEngine.parseItemSet(rawItems);
  const parsedMap = mapsEngine.parseGridMap(rawMap);
  const parsedProfiles = progression.parseCharacterProfileSet(rawProfiles);
  const parsedNodes = knowledge.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = knowledge.parseKnowledgeEdgeSet(rawEdges);
  for (const [name, result] of Object.entries({ parsedAlchemy, parsedItems, parsedMap, parsedProfiles, parsedNodes, parsedEdges })) {
    assert.equal(result.ok, true, `${name} should parse`);
  }
  if (!parsedAlchemy.ok || !parsedItems.ok || !parsedMap.ok || !parsedProfiles.ok || !parsedNodes.ok || !parsedEdges.ok) {
    throw new Error('Round 25 smoke data failed its runtime parser');
  }

  const items = new Map(parsedItems.set.items.map((item) => [item.id, item]));
  const graph = knowledge.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  const mapId = rawMap.id;
  const assembled = alchemy.assembleAlchemyStations({
    set: parsedAlchemy.set,
    knownResourceIds: new Set([mapId]),
    maps: new Map([[mapId, parsedMap.map]]),
    spawns: new Map([[mapId, rawMap.playerStart]]),
    blockedCells: new Map(),
    items,
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  });
  assert.equal(assembled.stations.length, 1, 'valid alchemy station should assemble');
  assert.equal(assembled.stations[0].recipes.length, 3, 'all three authored formulas should be usable');
  assert.deepEqual(assembled.warnings, []);
  const station = assembled.stations[0];
  const stationPos = station.record.position;
  const neighbor = stationPos.col + 1 < rawMap.columns
    ? { col: stationPos.col + 1, row: stationPos.row }
    : { col: stationPos.col - 1, row: stationPos.row };
  assert.equal(alchemy.selectAlchemyStation(assembled.stations, mapId, neighbor)?.record.id, station.record.id);
  assert.equal(alchemy.selectAlchemyStation(assembled.stations, mapId, stationPos), null, '站在药炉格上不算邻接');
  assert.equal(alchemy.selectAlchemyStation(assembled.stations, mapId, { col: stationPos.col + 1, row: stationPos.row + 1 }), null,
    '斜角不算四方向邻接');

  const profile = parsedProfiles.set.profiles[0];
  const recipe = station.recipes[0];
  const known = new Set([...graph.nodes.values()].filter((node) => node.knownByDefault).map((node) => node.id));
  const inventoryFor = (currency = recipe.currencyCost) => {
    const inventory = itemsEngine.createInventoryState(profile, []);
    inventory.stacks = [];
    inventory.currency = currency;
    for (const ingredient of recipe.ingredients) {
      const item = items.get(ingredient.itemId);
      assert(item && item.category === 'misc', 'recipe ingredients must be ordinary misc items');
      itemsEngine.grantItems(inventory, item, ingredient.quantity);
    }
    return inventory;
  };
  const unlearned = alchemy.checkAlchemyRecipe({
    recipe, insight: 999, knownKnowledgeNodeIds: new Set(), inventory: inventoryFor(), items,
  });
  assert.equal(unlearned.available, false, 'undiscovered formula must be gated');
  assert.equal(unlearned.outcome, null);
  assert(unlearned.reason.includes(recipe.discoveryHint));
  known.add(recipe.discoveryNodeId);

  const thresholds = recipe.outcomes.map((outcome) => outcome.minimumInsight);
  assert.equal(thresholds[0], 0);
  for (let index = 1; index < thresholds.length; index += 1) assert(thresholds[index] > thresholds[index - 1]);
  for (let index = 0; index < recipe.outcomes.length; index += 1) {
    const tier = recipe.outcomes[index];
    assert.equal(alchemy.selectAlchemyOutcome(recipe, tier.minimumInsight)?.resultItemId, tier.resultItemId,
      `threshold ${tier.minimumInsight} should select its own tier`);
    if (recipe.outcomes[index + 1]) {
      assert.equal(alchemy.selectAlchemyOutcome(recipe, recipe.outcomes[index + 1].minimumInsight - 1)?.resultItemId, tier.resultItemId,
        'the prior tier remains active until the next threshold');
    }
  }
  const resultItems = recipe.outcomes.map((outcome) => items.get(outcome.resultItemId));
  assert(resultItems.every((item) => item?.category === 'consumable' && item.consumable !== null));
  for (let index = 1; index < resultItems.length; index += 1) {
    const prior = resultItems[index - 1].consumable;
    const current = resultItems[index].consumable;
    assert(current.healthRestore >= prior.healthRestore && current.qiRestore >= prior.qiRestore);
    assert(current.healthRestore > prior.healthRestore || current.qiRestore > prior.qiRestore);
  }

  const character = progression.createCharacterState(profile);
  const poorInventory = inventoryFor(0);
  const poorBefore = structuredClone(poorInventory);
  const poor = alchemy.craftAlchemy({ station, recipeId: recipe.id, character, knownKnowledgeNodeIds: known, inventory: poorInventory, items });
  assert.equal(poor.ok, false);
  assert.deepEqual(poorInventory, poorBefore, 'money refusal must leave all inventory state unchanged');

  const missingInventory = inventoryFor();
  const missingId = recipe.ingredients[0].itemId;
  missingInventory.stacks = missingInventory.stacks.filter((stack) => stack.itemId !== missingId);
  const missingBefore = structuredClone(missingInventory);
  const missing = alchemy.craftAlchemy({ station, recipeId: recipe.id, character, knownKnowledgeNodeIds: known, inventory: missingInventory, items });
  assert.equal(missing.ok, false);
  assert.deepEqual(missingInventory, missingBefore, 'material refusal must leave state unchanged');

  const crowded = itemsEngine.createInventoryState(profile, []);
  crowded.capacity = recipe.ingredients.length;
  crowded.currency = recipe.currencyCost;
  crowded.stacks = recipe.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: ingredient.quantity + 1 }));
  const crowdedBefore = structuredClone(crowded);
  const noRoom = alchemy.craftAlchemy({ station, recipeId: recipe.id, character, knownKnowledgeNodeIds: known, inventory: crowded, items });
  assert.equal(noRoom.ok, false, 'partially retained ingredient stacks cannot conceal a full bag');
  assert.deepEqual(crowded, crowdedBefore, 'capacity refusal must leave state unchanged');

  const madeInventory = itemsEngine.createInventoryState(profile, []);
  madeInventory.capacity = recipe.ingredients.length;
  madeInventory.currency = recipe.currencyCost;
  madeInventory.stacks = recipe.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: ingredient.quantity }));
  character.attributes.insight = recipe.outcomes.at(-1).minimumInsight;
  const made = alchemy.craftAlchemy({ station, recipeId: recipe.id, character, knownKnowledgeNodeIds: known, inventory: madeInventory, items });
  assert.equal(made.ok, true, 'using slots released by consumed ingredients should permit the result');
  if (!made.ok) throw new Error(made.reason);
  assert.equal(made.result.id, recipe.outcomes.at(-1).resultItemId);
  assert.equal(madeInventory.currency, 0);
  assert.equal(itemsEngine.countItem(madeInventory, made.result.id), 1);
  assert(recipe.ingredients.every((ingredient) => itemsEngine.countItem(madeInventory, ingredient.itemId) === 0));

  const collectQuest = {
    id: 'quest.smoke-round-25', name: '炼药验收', description: '收下一份成药。', giverNpcId: 'char.smoke',
    prerequisiteQuestIds: [], failOnEncounterIds: [],
    objectives: [{ id: 'objective.smoke-round-25', kind: 'collectItem', targetId: made.result.id, requiredCount: 1, text: '炼出成药' }],
    rewards: { experience: 0, currency: 0 },
  };
  const collectQuests = new Map([[collectQuest.id, collectQuest]]);
  const journal = quests.createQuestJournal(collectQuests);
  assert.equal(quests.acceptQuest(collectQuests, journal, collectQuest.id).ok, true);
  const collected = quests.applyQuestSignal(collectQuests, journal, {
    type: 'item-count', itemId: made.result.id, quantity: itemsEngine.countItem(madeInventory, made.result.id),
  });
  assert.equal(collected.completed[0]?.questId, collectQuest.id, 'crafted item-count refresh should complete collection goals');

  const useCharacter = progression.createCharacterState(profile);
  useCharacter.health.current = Math.max(0, useCharacter.health.max - made.result.consumable.healthRestore);
  useCharacter.qi.current = Math.max(0, useCharacter.qi.max - made.result.consumable.qiRestore);
  const useInventory = itemsEngine.createInventoryState(profile, []);
  itemsEngine.grantItems(useInventory, made.result, 1);
  const used = itemsEngine.useConsumable(useInventory, useCharacter, made.result);
  assert.equal(used.ok, true, 'alchemy output must use the existing consumable path');
  assert.equal(itemsEngine.countItem(useInventory, made.result.id), 0);

  const brokenSet = structuredClone(parsedAlchemy.set);
  brokenSet.recipes[0].outcomes[0].resultItemId = 'item.missing-round-25';
  const isolated = alchemy.assembleAlchemyStations({
    set: brokenSet, knownResourceIds: new Set([mapId]), maps: new Map([[mapId, parsedMap.map]]),
    spawns: new Map([[mapId, rawMap.playerStart]]), blockedCells: new Map(), items,
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  });
  assert.equal(isolated.stations[0].recipes.length, 2, 'a broken formula reference only disables that formula');

  const blocked = alchemy.assembleAlchemyStations({
    set: parsedAlchemy.set, knownResourceIds: new Set([mapId]), maps: new Map([[mapId, parsedMap.map]]),
    spawns: new Map([[mapId, rawMap.playerStart]]),
    blockedCells: new Map([[mapId, new Set([`${stationPos.col},${stationPos.row}`])]]), items,
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  });
  assert.equal(blocked.stations.length, 0, 'an NPC/activity/workstation occupied cell disables the station');

  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 25 smoke', mapResourceId: mapId, playerCol: 1, playerRow: 1,
    character, inventory: madeInventory, shopStocks: new Map(), journal: quests.createQuestJournal(new Map()),
    social: social.createSocialState(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: known, elapsedGameMinutes: 0, worldSeed: 25,
    now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const parsedSnapshot = saves.parseSaveSnapshot(snapshot);
  assert.equal(parsedSnapshot.ok, true);
  if (!parsedSnapshot.ok) throw new Error(parsedSnapshot.message);
  const restorePlan = saves.planSnapshotRestore(parsedSnapshot.snapshot, {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]), mapResourceId: mapId,
    isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(profile.startingMartialArtIds),
    questIds: new Set(), questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
    knowledgeNodeIds: new Set(graph.nodes.keys()), companionIds: new Set(), arenaIds: new Set(), factionWarIds: new Set(),
  });
  assert.equal(restorePlan.ok, true);
  if (!restorePlan.ok) throw new Error(restorePlan.errors.join('\n'));
  const restored = saves.restoreRunState({ profile, items, quests: new Map(), shops: new Map(), snapshot: restorePlan.snapshot });
  assert.equal(itemsEngine.countItem(restored.inventory, made.result.id), 1, 'v1 should restore normal medicine stacks');
  assert(restored.knownKnowledgeNodeIds.includes(recipe.discoveryNodeId), 'v1 should restore the learned formula node');

  assert.equal(alchemy.assembleAlchemyStations({
    set: null, knownResourceIds: new Set(), maps: new Map(), spawns: new Map(), blockedCells: new Map(), items,
    knowledgeNodeIds: new Set(),
  }).stations.length, 0, 'missing optional alchemy content must degrade to no stations');
  console.log('通过：药方/图谱解析、工位占位与邻接、发现门控、悟性品质、失败原子性、满包转换、消耗品使用、单配方隔离、v1 存档及缺资源降级。');
} finally {
  await server.close();
}
