import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const meridians = await server.ssrLoadModule('/src/engine/meridian-system.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const itemSystem = await server.ssrLoadModule('/src/engine/item-system.ts');
  const combat = await server.ssrLoadModule('/src/engine/turn-based-combat.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');

  const rawSet = await readJson('data/base/meridians/round-23-meridians.json');
  const parsed = meridians.parseMeridianSet(rawSet);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const set = parsed.set;
  assert.equal(set.nodes.length, 6);
  const cyclic = structuredClone(rawSet);
  cyclic.nodes[0].prerequisites = [cyclic.nodes[1].id];
  assert.equal(meridians.parseMeridianSet(cyclic).ok, false, '依赖循环必须拒绝');
  const duplicate = structuredClone(rawSet);
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  assert.equal(meridians.parseMeridianSet(duplicate).ok, false, '重复节点 id 必须拒绝');
  const missingItem = meridians.resolveMeridianItemReferences(set, new Set(['item.qingxin-wan', 'item.huichun-gao']));
  assert(missingItem.warnings.some((warning) => warning.includes('item.wuji-dan')));
  assert(!missingItem.set.nodes.some((node) => node.id === 'meridian.xuanji' || node.id === 'meridian.tianfu'));

  const profileParse = progression.parseCharacterProfileSet(await readJson('data/base/characters/round-04-profiles.json'));
  const artParse = progression.parseMartialArtSet(await readJson('data/base/skills/round-04-martial-arts.json'));
  const itemParse = itemSystem.parseItemSet(await readJson('data/base/items/round-06-items.json'));
  assert.equal(profileParse.ok, true);
  assert.equal(artParse.ok, true);
  assert.equal(itemParse.ok, true);
  const profile = profileParse.set.profiles[0];
  const items = new Map(itemParse.set.items.map((item) => [item.id, item]));
  const character = progression.createCharacterState(profile, set.resource.initialPoints);
  const inventory = itemSystem.createInventoryState(profile, []);

  const prerequisiteRefusal = meridians.unlockMeridianNode({ set, nodeId: 'meridian.shouyang', character, inventory, items });
  assert.equal(prerequisiteRefusal.ok, false);
  assert.equal(character.cultivationPoints, 2);
  assert.deepEqual(character.unlockedMeridianNodeIds, []);
  assert.equal(inventory.stacks.length, 0);

  const startingQiMax = character.qi.max;
  const qihai = meridians.unlockMeridianNode({ set, nodeId: 'meridian.qihai', character, inventory, items });
  assert.equal(qihai.ok, true);
  assert.equal(character.cultivationPoints, 1);
  meridians.applyMeridianEffects(profile, character, meridians.aggregateMeridianEffects(set, character.unlockedMeridianNodeIds));
  assert.equal(character.qi.max, startingQiMax + 8);

  character.level = 2;
  const noMaterial = meridians.unlockMeridianNode({ set, nodeId: 'meridian.shouyang', character, inventory, items });
  assert.equal(noMaterial.ok, false);
  assert.equal(character.cultivationPoints, 1, '缺材料时不能扣修为');
  assert.deepEqual(character.unlockedMeridianNodeIds, ['meridian.qihai']);
  assert.equal(inventory.stacks.length, 0, '缺材料拒绝不能改背包');
  itemSystem.grantItems(inventory, items.get('item.qingxin-wan'), 1);
  const shouyang = meridians.unlockMeridianNode({ set, nodeId: 'meridian.shouyang', character, inventory, items });
  assert.equal(shouyang.ok, true);
  assert.equal(character.cultivationPoints, 0);
  assert.equal(itemSystem.countItem(inventory, 'item.qingxin-wan'), 0);
  const expectedForce = character.baseAttributes.force + 1;
  const bonuses = meridians.aggregateMeridianEffects(set, character.unlockedMeridianNodeIds);
  meridians.applyMeridianEffects(profile, character, bonuses);
  const withEquipment = { attributes: { force: 2 }, health: 3, qi: 4 };
  progression.applyEquipmentBonuses(character, withEquipment);
  meridians.applyMeridianEffects(profile, character, bonuses);
  assert.equal(character.attributes.force, expectedForce + 2, '装备与经脉分别保留且不可重复叠加');
  const expectedQiMax = progression.computeVitalMaxima(profile, character.level, character.attributes).qiMax + 4 + 8;
  assert.equal(character.qi.max, expectedQiMax);

  const pointState = progression.createCharacterState(profile);
  pointState.cultivationPoints = 11;
  assert.equal(meridians.awardCultivationPoints(pointState, 1, set.resource), 1);
  assert.equal(pointState.cultivationPoints, 12);
  assert.equal(meridians.awardCultivationPoints(pointState, 3, set.resource), 0);
  assert.equal(pointState.cultivationPoints, 12, '升级修为奖励不得超过资料上限');

  const fighter = progression.createCharacterState(profile, 0);
  fighter.martialArtIds = [...profile.startingMartialArtIds];
  const encounter = {
    id: 'smoke.round-23', name: '修为结算', mapResourceId: 'map.smoke', position: { col: 1, row: 1 }, profileId: profile.id,
    enemy: { name: '木人', attributes: { body: 1, force: 1, agility: 1, insight: 1, resolve: 1 }, health: 1, qi: 0, martialArtIds: [] },
    victoryExperience: progression.cumulativeExperienceForLevel(profile, profile.startingLevel + 1),
    defeatRecovery: { healthRatio: 1, qiRatio: 1 }, repeatable: true,
    texts: { approach: 'approach', intro: 'intro', victory: 'victory', defeat: 'defeat', flee: 'flee' },
  };
  const session = new combat.CombatSession({ encounter, profile, player: fighter, martialArts: new Map(artParse.set.martialArts.map((art) => [art.id, art])), meridianResourceRules: set.resource });
  const attack = session.playerActions.find((action) => action.art.combat.kind === 'attack');
  assert(attack);
  assert.equal(session.playerUse(attack.art.id).ok, true);
  assert.equal(session.finalResult?.levelsGained, 1);
  assert.equal(fighter.cultivationPoints, set.resource.pointsPerLevel, '战斗升级应发放资料配置修为');

  character.cultivationPoints = 7;
  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 23', mapResourceId: 'map.smoke', playerCol: 1, playerRow: 1,
    character, inventory, shopStocks: new Map(), journal: quests.createQuestJournal(new Map()), social: social.createSocialState(),
    completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: new Set(),
    elapsedGameMinutes: 0, worldSeed: 23, now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const roundTrip = saves.parseSaveSnapshot(snapshot);
  assert.equal(roundTrip.ok, true);
  if (!roundTrip.ok) throw new Error(roundTrip.message);
  assert.equal(roundTrip.snapshot.player.cultivationPoints, 7);
  assert.deepEqual(roundTrip.snapshot.player.unlockedMeridianNodeIds, ['meridian.qihai', 'meridian.shouyang']);

  const legacyRaw = structuredClone(snapshot);
  delete legacyRaw.player.cultivationPoints;
  delete legacyRaw.player.unlockedMeridianNodeIds;
  const legacy = saves.parseSaveSnapshot(legacyRaw);
  assert.equal(legacy.ok, true);
  if (legacy.ok) {
    assert.equal(legacy.snapshot.player.cultivationPoints, 0);
    assert.deepEqual(legacy.snapshot.player.unlockedMeridianNodeIds, []);
  }
  const badPoints = structuredClone(snapshot);
  badPoints.player.cultivationPoints = 1000;
  assert.equal(saves.parseSaveSnapshot(badPoints).ok, false);
  const duplicateNodes = structuredClone(snapshot);
  duplicateNodes.player.unlockedMeridianNodeIds.push('meridian.qihai');
  assert.equal(saves.parseSaveSnapshot(duplicateNodes).ok, false);
  const tooManyNodes = structuredClone(snapshot);
  tooManyNodes.player.unlockedMeridianNodeIds = Array.from({ length: 65 }, (_, index) => `meridian.fake-${index}`);
  assert.equal(saves.parseSaveSnapshot(tooManyNodes).ok, false);

  const refs = {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
    mapResourceId: 'map.smoke', isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(artParse.set.martialArts.map((art) => art.id)),
    questIds: new Set(), questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
    meridianNodeIds: new Set(['meridian.qihai']),
  };
  const plan = saves.planSnapshotRestore(roundTrip.snapshot, refs);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error(plan.errors.join('\n'));
  assert.deepEqual(plan.snapshot.player.unlockedMeridianNodeIds, ['meridian.qihai']);
  assert(plan.warnings.some((warning) => warning.includes('meridian.shouyang')));
  const restored = saves.restoreRunState({ profile, items, quests: new Map(), shops: new Map(), snapshot: plan.snapshot });
  assert.equal(restored.character.cultivationPoints, 7);
  assert.deepEqual(restored.character.unlockedMeridianNodeIds, ['meridian.qihai']);
  assert.equal(restored.character.meridianBonuses.qi, 0, '存档层不还原派生加成');
  meridians.applyMeridianEffects(profile, restored.character, meridians.aggregateMeridianEffects(set, restored.character.unlockedMeridianNodeIds));
  assert.equal(restored.character.qi.max, progression.computeVitalMaxima(profile, restored.character.level, restored.character.attributes).qiMax + 8);

  console.log('通过：经脉依赖与材料隔离、修为上限、解锁事务拒绝不变性、属性/装备重算、战斗升级奖励、新旧 v1 存档及 MOD 节点过滤。');
} finally {
  await server.close();
}
