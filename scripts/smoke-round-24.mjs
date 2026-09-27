import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const forge = await server.ssrLoadModule('/src/engine/equipment-forge.ts');
  const mapEngine = await server.ssrLoadModule('/src/engine/grid-map.ts');
  const itemsEngine = await server.ssrLoadModule('/src/engine/item-system.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const combat = await server.ssrLoadModule('/src/engine/turn-based-combat.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');

  const rawForge = await readJson('data/base/forges/round-24-equipment-forges.json');
  const rawItems = await readJson('data/base/items/round-06-items.json');
  const rawMap = await readJson('data/base/maps/round-10-mist-ferry.json');
  const rawProfiles = await readJson('data/base/characters/round-04-profiles.json');
  const rawArts = await readJson('data/base/skills/round-04-martial-arts.json');
  const parsedForge = forge.parseEquipmentForgeSet(rawForge);
  const parsedItems = itemsEngine.parseItemSet(rawItems);
  const parsedMap = mapEngine.parseGridMap(rawMap);
  const parsedProfiles = progression.parseCharacterProfileSet(rawProfiles);
  const parsedArts = progression.parseMartialArtSet(rawArts);
  assert.equal(parsedForge.ok, true);
  assert.equal(parsedItems.ok, true);
  assert.equal(parsedMap.ok, true);
  assert.equal(parsedProfiles.ok, true);
  assert.equal(parsedArts.ok, true);
  if (!parsedForge.ok || !parsedItems.ok || !parsedMap.ok || !parsedProfiles.ok || !parsedArts.ok) {
    throw new Error('基础锻造 smoke 资料未能解析');
  }
  const items = new Map(parsedItems.set.items.map((item) => [item.id, item]));
  const mapId = rawMap.id;
  const maps = new Map([[mapId, parsedMap.map]]);
  const assembled = forge.assembleEquipmentForges({
    set: parsedForge.set,
    knownResourceIds: new Set([mapId]),
    maps,
    spawns: new Map([[mapId, rawMap.playerStart]]),
    blockedCells: new Map(),
    items,
  });
  assert.equal(assembled.stations.length, 1);
  assert.equal(assembled.stations[0].recipes.length, 3);
  assert.deepEqual(assembled.warnings, []);
  assert.equal(forge.selectEquipmentForgeStation(assembled.stations, mapId, { col: 9, row: 4 })?.record.id,
    'forge.station.mist-ferry-anvil');
  assert.equal(forge.selectEquipmentForgeStation(assembled.stations, mapId, { col: 10, row: 4 }), null,
    '必须站在工位四方向相邻格，不允许与工位重叠');
  assert.equal(forge.selectEquipmentForgeStation(assembled.stations, mapId, { col: 9, row: 3 }), null,
    '斜角不算相邻');

  const blockedStation = forge.assembleEquipmentForges({
    set: parsedForge.set, knownResourceIds: new Set([mapId]), maps,
    spawns: new Map([[mapId, rawMap.playerStart]]),
    blockedCells: new Map([[mapId, new Set(['10,4'])]]), items,
  });
  assert.equal(blockedStation.stations.length, 0, 'NPC/活动占位冲突应禁用工位');
  assert(blockedStation.warnings.some((line) => line.includes('NPC、遭遇或活动入口')));

  const missingResult = structuredClone(parsedForge.set);
  missingResult.recipes[0].resultItemId = 'item.missing-for-smoke';
  const isolatedRecipe = forge.assembleEquipmentForges({
    set: missingResult, knownResourceIds: new Set([mapId]), maps,
    spawns: new Map([[mapId, rawMap.playerStart]]), blockedCells: new Map(), items,
  });
  assert.equal(isolatedRecipe.stations.length, 1);
  assert.equal(isolatedRecipe.stations[0].recipes.length, 2, '悬空配方只应禁用自身');
  const downgrade = structuredClone(parsedForge.set);
  downgrade.recipes[0].resultItemId = 'item.qingtong-bijian';
  const invalidUpgrade = forge.assembleEquipmentForges({
    set: downgrade, knownResourceIds: new Set([mapId]), maps,
    spawns: new Map([[mapId, rawMap.playerStart]]), blockedCells: new Map(), items,
  });
  assert.equal(invalidUpgrade.stations[0].recipes.length, 2, '不得把同级或降级产物当强化');

  const profile = parsedProfiles.set.profiles[0];
  const weaponRecipe = assembled.stations[0].recipes.find((recipe) => recipe.id === 'forge.recipe.refine-bronze-pen-sword');
  const baseWeapon = items.get('item.qingtong-bijian');
  const refinedWeapon = items.get('item.qingtong-jian');
  const ironSand = items.get('item.iron-sand');
  assert(weaponRecipe && baseWeapon && refinedWeapon && ironSand);

  const startingStacks = itemsEngine.resolveStartingItems(profile, items).stacks;
  const inventory = itemsEngine.createInventoryState(profile, startingStacks);
  itemsEngine.grantItems(inventory, baseWeapon, 1);
  itemsEngine.grantItems(inventory, ironSand, 2);
  inventory.currency = 100;
  const beforeInsufficient = structuredClone(inventory);
  const poorInventory = { ...inventory, currency: 1, stacks: inventory.stacks.map((stack) => ({ ...stack })), equipped: { ...inventory.equipped } };
  const poorBefore = structuredClone(poorInventory);
  const poor = forge.craftEquipment({ station: assembled.stations[0], recipeId: weaponRecipe.id, inventory: poorInventory, items });
  assert.equal(poor.ok, false);
  assert.deepEqual(poorInventory, poorBefore, '银两不足拒绝必须不改任何状态');
  const missingInventory = { ...inventory, stacks: inventory.stacks.filter((stack) => stack.itemId !== ironSand.id).map((stack) => ({ ...stack })), equipped: { ...inventory.equipped } };
  const missingBefore = structuredClone(missingInventory);
  const missing = forge.craftEquipment({ station: assembled.stations[0], recipeId: weaponRecipe.id, inventory: missingInventory, items });
  assert.equal(missing.ok, false);
  assert.deepEqual(missingInventory, missingBefore, '材料不足拒绝必须不改任何状态');
  const wornInventory = { ...inventory, equipped: { weapon: baseWeapon.id } };
  const wornBefore = structuredClone(wornInventory);
  const worn = forge.craftEquipment({ station: assembled.stations[0], recipeId: weaponRecipe.id, inventory: wornInventory, items });
  assert.equal(worn.ok, false);
  assert.deepEqual(wornInventory, wornBefore, '装备中物品不得被消耗');

  const fullInventory = itemsEngine.createInventoryState(profile, startingStacks);
  fullInventory.capacity = 2;
  fullInventory.currency = weaponRecipe.currencyCost;
  fullInventory.stacks = [
    { itemId: baseWeapon.id, quantity: 1 },
    { itemId: ironSand.id, quantity: 2 },
  ];
  const made = forge.craftEquipment({ station: assembled.stations[0], recipeId: weaponRecipe.id, inventory: fullInventory, items });
  assert.equal(made.ok, true, '满包时扣除旧装备和材料后应成功利用释放的格子');
  assert.equal(itemsEngine.countItem(fullInventory, baseWeapon.id), 0);
  assert.equal(itemsEngine.countItem(fullInventory, ironSand.id), 0);
  assert.equal(itemsEngine.countItem(fullInventory, refinedWeapon.id), 1);
  assert.equal(fullInventory.currency, 0);
  assert.equal(fullInventory.stacks.length, 1);

  const character = progression.createCharacterState(profile);
  character.martialArtIds = [...profile.startingMartialArtIds];
  const runInventory = itemsEngine.createInventoryState(profile, startingStacks);
  itemsEngine.grantItems(runInventory, baseWeapon, 1);
  itemsEngine.grantItems(runInventory, ironSand, 2);
  runInventory.currency = 100;
  const runCraft = forge.craftEquipment({ station: assembled.stations[0], recipeId: weaponRecipe.id, inventory: runInventory, items });
  assert.equal(runCraft.ok, true);
  const equipped = itemsEngine.equipItem({ inventory: runInventory, character, profile, items }, refinedWeapon);
  assert.equal(equipped.ok, true);
  assert.equal(character.attributes.force, character.baseAttributes.force + refinedWeapon.equipment.attributeBonuses.force,
    '产物需走现有装备属性调和路径');

  const martialArts = new Map(parsedArts.set.martialArts.map((art) => [art.id, art]));
  const encounter = {
    id: 'smoke.round-24', name: '锻造回归木人', mapResourceId: mapId, position: { col: 12, row: 6 }, profileId: profile.id,
    enemy: { name: '木人', attributes: { body: 1, force: 1, agility: 1, insight: 1, resolve: 1 }, health: 1000, qi: 0, martialArtIds: [] },
    victoryExperience: 0, defeatRecovery: { healthRatio: 1, qiRatio: 1 }, repeatable: true,
    texts: { approach: 'approach', intro: 'intro', victory: 'victory', defeat: 'defeat', flee: 'flee' },
  };
  const art = profile.startingMartialArtIds.map((id) => martialArts.get(id)).find((entry) => entry?.combat.kind === 'attack');
  assert(art);
  const forgedCombat = new combat.CombatSession({ encounter, profile, player: character, martialArts });
  const forgedBefore = forgedCombat.enemyView.health.current;
  assert.equal(forgedCombat.playerUse(art.id).ok, true);
  const forgedDamage = forgedBefore - forgedCombat.enemyView.health.current;
  const baseline = progression.createCharacterState(profile);
  baseline.martialArtIds = [...profile.startingMartialArtIds];
  const baseCombat = new combat.CombatSession({ encounter, profile, player: baseline, martialArts });
  const baseBefore = baseCombat.enemyView.health.current;
  assert.equal(baseCombat.playerUse(art.id).ok, true);
  const baseDamage = baseBefore - baseCombat.enemyView.health.current;
  assert(forgedDamage > baseDamage, '锻造装备加成应参与实际战斗伤害');

  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 24 smoke', mapResourceId: mapId, playerCol: 1, playerRow: 1,
    character, inventory: runInventory, shopStocks: new Map(), journal: quests.createQuestJournal(new Map()), social: social.createSocialState(),
    completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: new Set(),
    elapsedGameMinutes: 0, worldSeed: 24, now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const parsedSnapshot = saves.parseSaveSnapshot(snapshot);
  assert.equal(parsedSnapshot.ok, true);
  if (!parsedSnapshot.ok) throw new Error(parsedSnapshot.message);
  assert.equal(parsedSnapshot.snapshot.inventory.stacks.some((stack) => stack.itemId === refinedWeapon.id), true);
  const references = {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]), mapResourceId: mapId,
    isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(martialArts.keys()),
    questIds: new Set(), questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
  };
  const restorePlan = saves.planSnapshotRestore(parsedSnapshot.snapshot, references);
  assert.equal(restorePlan.ok, true);
  if (!restorePlan.ok) throw new Error(restorePlan.errors.join('\n'));
  const restored = saves.restoreRunState({ profile, items, quests: new Map(), shops: new Map(), snapshot: restorePlan.snapshot });
  assert.equal(itemsEngine.countItem(restored.inventory, refinedWeapon.id), 1);
  assert.equal(restored.inventory.equipped.weapon, refinedWeapon.id);
  assert.equal(restored.character.attributes.force, character.attributes.force,
    'v1 存档只需保存装备 item id，读档应从当前资料重算加成');

  const missingMaterials = { ...parsedForge.set, recipes: [] };
  const disabled = forge.assembleEquipmentForges({
    set: missingMaterials, knownResourceIds: new Set([mapId]), maps,
    spawns: new Map([[mapId, rawMap.playerStart]]), blockedCells: new Map(), items,
  });
  assert.equal(disabled.stations.length, 0, '没有有效配方的工位不得暴露空交互入口');

  assert.deepEqual(inventory, beforeInsufficient, '拒绝尝试不应触碰调用方的原库存');
  console.log('通过：锻造资料/跨引用与占位隔离、四向邻接、降级配方过滤、拒绝原子性、满包转换、穿戴战斗加成及 v1 存档读档。');
} finally {
  await server.close();
}
