import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const forge = await server.ssrLoadModule('/src/engine/martial-art-forge.ts');
  const progression = await server.ssrLoadModule('/src/engine/character-progression.ts');
  const combat = await server.ssrLoadModule('/src/engine/turn-based-combat.ts');
  const itemSystem = await server.ssrLoadModule('/src/engine/item-system.ts');
  const quests = await server.ssrLoadModule('/src/engine/quest-system.ts');
  const social = await server.ssrLoadModule('/src/engine/social-state.ts');
  const saves = await server.ssrLoadModule('/src/engine/save-system.ts');

  const parsedComponents = forge.parseMartialArtForgeComponents(await readJson('data/base/skills/round-22-components.json'));
  assert.equal(parsedComponents.ok, true);
  if (!parsedComponents.ok) throw new Error(parsedComponents.errors.join('\n'));
  assert.equal(parsedComponents.set.components.length, 8);
  const recipe = { intentId: 'forge.intent.strike', formId: 'forge.form.balanced', breathId: 'forge.breath.steady' };
  const profileSet = progression.parseCharacterProfileSet(await readJson('data/base/characters/round-04-profiles.json'));
  const martialArtSet = progression.parseMartialArtSet(await readJson('data/base/skills/round-04-martial-arts.json'));
  const itemSet = itemSystem.parseItemSet(await readJson('data/base/items/round-06-items.json'));
  assert.equal(profileSet.ok, true);
  assert.equal(martialArtSet.ok, true);
  assert.equal(itemSet.ok, true);
  const profile = profileSet.set.profiles[0];
  const baseArts = new Map(martialArtSet.set.martialArts.map((art) => [art.id, art]));

  const lowFunds = { currency: 0 };
  const unlearned = [];
  const noneCreated = new Map();
  const refused = forge.craftAndRegisterCustomMartialArt({
    components: parsedComponents.set, recipe, name: '听雨回环', existingArts: [],
    occupiedIds: new Set(baseArts.keys()), inventory: lowFunds, learnedArtIds: unlearned, customArts: noneCreated,
  });
  assert.equal(refused.ok, false);
  assert.equal(lowFunds.currency, 0);
  assert.deepEqual(unlearned, []);
  assert.equal(noneCreated.size, 0);

  const created = new Map();
  const learnedArtIds = [...profile.startingMartialArtIds];
  const inventory = { currency: 120 };
  const crafted = forge.craftAndRegisterCustomMartialArt({
    components: parsedComponents.set, recipe, name: '听雨回环', existingArts: [],
    occupiedIds: new Set(baseArts.keys()), inventory, learnedArtIds, customArts: created,
  });
  assert.equal(crafted.ok, true);
  if (!crafted.ok) throw new Error(crafted.reason);
  assert.equal(crafted.art.id, 'custom-art.1');
  assert.equal(crafted.art.combat.kind, 'attack');
  assert.equal(crafted.art.combat.power, 11);
  assert.equal(crafted.art.combat.qiCost, 4);
  assert.equal(crafted.budget, 19);
  assert.equal(inventory.currency, 72);
  assert(learnedArtIds.includes(crafted.art.id));
  assert.equal(created.get(crafted.art.id).name, '听雨回环');

  const duplicateName = forge.craftCustomMartialArt({
    components: parsedComponents.set,
    recipe: { ...recipe, formId: 'forge.form.swift' }, name: '听雨回环',
    existingArts: [...created.values()], occupiedIds: new Set(baseArts.keys()),
  });
  assert.equal(duplicateName.ok, false);
  assert.match(duplicateName.reason, /名号不可重复/);
  const invalidName = forge.craftCustomMartialArt({
    components: parsedComponents.set, recipe, name: 'A', existingArts: [],
  });
  assert.equal(invalidName.ok, false);
  const invalidBudgetSet = {
    components: parsedComponents.set.components.map((part) => part.id === 'forge.form.heavy' ? { ...part, power: 18 } : part),
  };
  const overBudget = forge.craftCustomMartialArt({
    components: invalidBudgetSet, recipe: { ...recipe, formId: 'forge.form.heavy', breathId: 'forge.breath.deep' },
    name: '万钧归海', existingArts: [],
  });
  assert.equal(overBudget.ok, false);
  assert.match(overBudget.reason, /超出功力约束/);
  const collision = forge.craftCustomMartialArt({
    components: parsedComponents.set, recipe, name: '落叶回风', existingArts: [],
    occupiedIds: new Set([...baseArts.keys(), 'custom-art.1']),
  });
  assert.equal(collision.ok, true);
  if (collision.ok) assert.equal(collision.art.id, 'custom-art.2');
  assert.equal(Array.from(forge.normalizeCustomMartialArtName('汉'.repeat(17))).length, 16);

  // Supplemental-plane characters count as Unicode code points throughout crafting and save revalidation.
  const wide = '𠀀';
  const astralComponents = {
    components: parsedComponents.set.components.map((part) => ({
      ...part,
      category: part.slot === 'intent' ? wide.repeat(24) : part.category,
      style: part.slot === 'intent' ? part.style : wide.repeat(80),
      description: wide.repeat(120),
    })),
  };
  const astralCraft = forge.craftCustomMartialArt({
    components: astralComponents, recipe, name: '云外奇锋', existingArts: [],
    occupiedIds: new Set([crafted.art.id]),
  });
  assert.equal(astralCraft.ok, true);
  if (!astralCraft.ok) throw new Error(astralCraft.reason);
  assert.equal(Array.from(astralCraft.art.category).length, 24);
  assert.equal(Array.from(astralCraft.art.style).length, 160);
  assert.equal(Array.from(astralCraft.art.description).length, 362);
  assert.deepEqual(forge.parseSavedCustomMartialArts([astralCraft.art]), [astralCraft.art]);

  const character = progression.createCharacterState(profile);
  character.martialArtIds = [...learnedArtIds];
  const runtimeArts = new Map([...baseArts, ...created]);
  const mapRaw = await readJson('data/base/maps/round-01-grid.json');
  const encounter = {
    id: 'smoke.custom-art', name: '回合验证', mapResourceId: mapRaw.id, position: { col: 1, row: 1 },
    profileId: profile.id,
    enemy: { name: '木人', attributes: { body: 1, force: 1, agility: 1, insight: 1, resolve: 1 }, health: 100, qi: 0, martialArtIds: ['skill.jianghu-sanshou'] },
    victoryExperience: 0, defeatRecovery: { healthRatio: 1, qiRatio: 1 }, repeatable: true,
    texts: { approach: 'approach', intro: 'intro', victory: 'victory', defeat: 'defeat', flee: 'flee' },
  };
  const session = new combat.CombatSession({ encounter, profile, player: character, martialArts: runtimeArts });
  assert(session.playerActions.some((action) => action.art.id === crafted.art.id));
  assert.equal(session.playerUse(crafted.art.id).ok, true);

  const items = new Map(itemSet.set.items.map((item) => [item.id, item]));
  const state = { ...inventory, currency: 72 };
  const save = saves.captureSaveSnapshot({
    displayName: 'Round 22', mapResourceId: mapRaw.id, playerCol: 1, playerRow: 1,
    character, inventory: itemSystem.createInventoryState(profile, []), shopStocks: new Map(),
    journal: quests.createQuestJournal(new Map()), social: social.createSocialState(),
    completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: new Set(),
    elapsedGameMinutes: 0, worldSeed: 22, now: () => new Date('2026-09-27T00:00:00.000Z'),
    customMartialArts: created,
  });
  save.inventory.currency = state.currency;
  const parsedSave = saves.parseSaveSnapshot(save);
  assert.equal(parsedSave.ok, true, parsedSave.ok ? '' : parsedSave.message);
  if (!parsedSave.ok) throw new Error(parsedSave.message);
  const refs = {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
    mapResourceId: mapRaw.id, isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(baseArts.keys()),
    questIds: new Set(), questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
  };
  const plan = saves.planSnapshotRestore(parsedSave.snapshot, refs);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error(plan.errors.join('\n'));
  assert(plan.snapshot.player.martialArtIds.includes(crafted.art.id));
  assert.equal(plan.snapshot.customMartialArts[0].id, crafted.art.id);
  const restored = saves.restoreRunState({
    profile, items, quests: new Map(), shops: new Map(), snapshot: plan.snapshot,
  });
  assert.equal(restored.customMartialArts[0].id, crafted.art.id);
  assert(restored.character.martialArtIds.includes(crafted.art.id));

  const legacyRaw = { ...save };
  delete legacyRaw.customMartialArts;
  const legacy = saves.parseSaveSnapshot(legacyRaw);
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.deepEqual(legacy.snapshot.customMartialArts, []);
  const astralSave = JSON.parse(JSON.stringify(save));
  astralSave.customMartialArts.push(astralCraft.art);
  astralSave.player.martialArtIds.push(astralCraft.art.id);
  const parsedAstralSave = saves.parseSaveSnapshot(astralSave);
  assert.equal(parsedAstralSave.ok, true, parsedAstralSave.ok ? '' : `扩展平面文本应可写档、读档：${parsedAstralSave.message}`);
  const tampered = JSON.parse(JSON.stringify(save));
  tampered.customMartialArts[0].combat.power = 19;
  assert.equal(saves.parseSaveSnapshot(tampered).ok, false);
  const badName = JSON.parse(JSON.stringify(save));
  badName.customMartialArts[0].name = '坏\n名';
  assert.equal(saves.parseSaveSnapshot(badName).ok, false, '自创名称控制字符必须被拒绝');
  console.log('通过：组件Schema语义、名称/预算/费用原子拒绝、Unicode扩展平面往返、创制交易、普通战斗可用、自创武学v1新旧存档与防篡改范围。');
} finally {
  await server.close();
}
