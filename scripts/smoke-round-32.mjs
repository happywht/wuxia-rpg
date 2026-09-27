import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const pathname = new URL(url, 'http://round-32.local').pathname;
  let filePath = null;
  if (pathname.startsWith('/base/')) filePath = 'data/base/' + pathname.slice('/base/'.length);
  else if (pathname.startsWith('/schema/')) filePath = 'data/schema/' + pathname.slice('/schema/'.length);
  if (filePath === null) return new Response('', { status: 404 });
  try {
    const contents = await readFile(filePath, 'utf8');
    return new Response(contents, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch {
    return new Response('', { status: 404 });
  }
};

const TEACHERS = [
  { factionId: 'faction.tingyu-jiange', npcId: 'char.ye-tingzhou', dialogueId: 'dlg.ye-tingzhou-mentor' },
  { factionId: 'faction.tiezhang-pai', npcId: 'char.shi-bei', dialogueId: 'dlg.shi-bei-mentor' },
  { factionId: 'faction.yunyin-shanzhuang', npcId: 'char.wen-suxin', dialogueId: 'dlg.wen-suxin-mentor' },
  { factionId: 'faction.hanshan-shuyuan', npcId: 'char.liu-tinglan', dialogueId: 'dlg.liu-tinglan-mentor' },
  { factionId: 'faction.panzhou-daochang', npcId: 'char.zhu-jiuxian', dialogueId: 'dlg.zhu-jiuxian-mentor' },
];

try {
  const [loader, progression, dialogueRuntime, factionEngine, socialEngine, questEngine, itemEngine] = await Promise.all([
    server.ssrLoadModule('/src/game/world-loader.ts'),
    server.ssrLoadModule('/src/engine/character-progression.ts'),
    server.ssrLoadModule('/src/engine/dialogue-runtime.ts'),
    server.ssrLoadModule('/src/engine/faction-system.ts'),
    server.ssrLoadModule('/src/engine/social-state.ts'),
    server.ssrLoadModule('/src/engine/quest-system.ts'),
    server.ssrLoadModule('/src/engine/item-system.ts'),
  ]);
  const [rawItems, rawArts, rawShops, rawForges, rawFactions, rawProfiles, rawDialogue03, rawDialogue30] = await Promise.all([
    readJson('data/base/items/round-06-items.json'),
    readJson('data/base/skills/round-04-martial-arts.json'),
    readJson('data/base/shops/round-06-shops.json'),
    readJson('data/base/forges/round-24-equipment-forges.json'),
    readJson('data/base/factions/round-04-factions.json'),
    readJson('data/base/characters/round-04-profiles.json'),
    readJson('data/base/dialogues/round-03-conversations.json'),
    readJson('data/base/dialogues/round-30-conversations.json'),
  ]);

  const newItems = rawItems.items.filter((item) => item.id.startsWith('item.r32.'));
  const newArts = rawArts.martialArts.filter((art) => art.id.startsWith('skill.r32-'));
  assert.equal(rawItems.items.length, 50, 'the base item catalog reaches exactly 50 entries');
  assert.equal(newItems.length, 25, 'Round 32 adds exactly 25 items');
  assert.equal(rawArts.martialArts.length, 30, 'the base martial arts catalog reaches exactly 30 entries');
  assert.equal(newArts.length, 24, 'Round 32 adds exactly 24 martial arts');

  const assertUnique = (ids, label) => {
    assert.equal(new Set(ids).size, ids.length, `${label} ids are unique`);
  };
  assertUnique(rawItems.items.map((item) => item.id), 'item');
  assertUnique(rawArts.martialArts.map((art) => art.id), 'martial art');
  assertUnique(rawShops.shops.flatMap((shop) => shop.stock.map((entry) => entry.itemId)), 'shop stock');
  assertUnique(rawForges.recipes.map((recipe) => recipe.id), 'forge recipe');

  const itemIds = new Set(rawItems.items.map((item) => item.id));
  const stockedIds = new Set(rawShops.shops.flatMap((shop) => shop.stock.map((entry) => entry.itemId)));
  const forgedIds = new Set(rawForges.recipes.map((recipe) => recipe.resultItemId));
  const consumedIngredients = new Set(rawForges.recipes.flatMap((recipe) => recipe.ingredients.map((entry) => entry.itemId)));
  for (const item of newItems) {
    assert.ok(stockedIds.has(item.id) || forgedIds.has(item.id), `new item "${item.id}" has a shop or forge acquisition path`);
  }
  for (const item of newItems.filter((entry) => entry.category === 'consumable')) {
    assert.ok(stockedIds.has(item.id), `consumable "${item.id}" is sold by a shop`);
  }
  for (const item of newItems.filter((entry) => entry.category === 'misc')) {
    assert.ok(stockedIds.has(item.id), `material "${item.id}" can be purchased`);
    assert.ok(consumedIngredients.has(item.id), `material "${item.id}" is used by a forge recipe`);
  }
  for (const shop of rawShops.shops) {
    for (const stock of shop.stock) assert.ok(itemIds.has(stock.itemId), `shop stock "${stock.itemId}" resolves`);
  }
  for (const recipe of rawForges.recipes) {
    assert.ok(itemIds.has(recipe.resultItemId), `forge result "${recipe.resultItemId}" resolves`);
    assert.ok(recipe.ingredients.every((entry) => itemIds.has(entry.itemId)), `forge recipe "${recipe.id}" ingredients resolve`);
  }
  const newEquipment = newItems.filter((item) => item.category === 'equipment');
  assert.equal(newEquipment.length, 8, 'eight new equipment pieces span the three existing slots');
  assert.equal(newEquipment.filter((item) => forgedIds.has(item.id)).length, 6, 'six pieces are crafted through upgrade chains');

  const validFactionIds = new Set(rawFactions.factions.map((faction) => faction.id));
  assert.deepEqual(
    [...new Set(newArts.map((art) => art.category))].sort(),
    ['刀法', '内功', '外功', '拳脚', '身法', '剑法'].sort(),
    'the new martial arts use every existing combat category',
  );
  assert.ok(newArts.every((art) => art.factionIds.length === 1 && validFactionIds.has(art.factionIds[0])),
    'each new technique belongs to exactly one valid school');
  assert.ok(newArts.every((art) => art.combat.power >= 12 && art.combat.power <= 27 && art.combat.qiCost <= 13),
    'new combat values stay in the planned progression band');
  const artsPerFaction = Object.fromEntries(TEACHERS.map(({ factionId }) => [
    factionId,
    newArts.filter((art) => art.factionIds[0] === factionId).length,
  ]));
  assert.deepEqual(artsPerFaction, {
    'faction.tingyu-jiange': 5,
    'faction.tiezhang-pai': 5,
    'faction.yunyin-shanzhuang': 5,
    'faction.hanshan-shuyuan': 5,
    'faction.panzhou-daochang': 4,
  }, 'new techniques are spread across all five schools');

  const conversations = [...rawDialogue03.conversations, ...rawDialogue30.conversations];
  assertUnique(conversations.map((conversation) => conversation.id), 'dialogue');
  for (const teacher of TEACHERS) {
    const conversation = conversations.find((entry) => entry.id === teacher.dialogueId);
    assert.ok(conversation, `teacher dialogue "${teacher.dialogueId}" exists`);
    const root = conversation.nodes.find((node) => node.id === conversation.startNodeId);
    assert.ok(root.options.some((option) => option.nextNodeId === 'r32-lessons' &&
      option.conditions?.some((condition) => condition.kind === 'factionMembership' &&
        condition.factionId === teacher.factionId && condition.isMember === true)),
    `"${teacher.npcId}" gates the R32 lesson menu to their school`);
    const lessonNode = conversation.nodes.find((node) => node.id === 'r32-lessons');
    const taughtNode = conversation.nodes.find((node) => node.id === 'r32-taught');
    assert.ok(lessonNode && taughtNode, `"${teacher.dialogueId}" has a repeatable lesson path`);
    assert.ok(taughtNode.options.some((option) => option.nextNodeId === 'r32-lessons'),
      `"${teacher.dialogueId}" can return to its lesson list`);
    const schoolArts = newArts.filter((art) => art.factionIds[0] === teacher.factionId);
    for (const art of schoolArts) {
      const choices = lessonNode.options.filter((option) =>
        option.effects?.some((effect) => effect.kind === 'learnMartialArt' && effect.martialArtId === art.id));
      assert.equal(choices.length, 1, `"${art.id}" has one instructor choice`);
      assert.ok(choices[0].conditions?.some((condition) =>
        condition.kind === 'martialArtEligible' && condition.martialArtId === art.id),
      `"${art.id}" is hidden until the player meets its requirements`);
    }
  }

  const originalInfo = console.info;
  console.info = () => {};
  let loaded;
  try {
    loaded = await loader.loadWorldData();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(loaded.ok, true, 'the complete base world loads');
  assert.equal(loaded.world.assembly.items.size, 50, 'all 50 items survive runtime parsing and assembly');
  assert.equal(loaded.world.assembly.progression.martialArts.size, 30, 'all 30 martial arts survive runtime parsing and assembly');
  const authoredIds = [...newItems.map((item) => item.id), ...newArts.map((art) => art.id)];
  const round32Diagnostics = loaded.world.optionalWarnings.filter((diagnostic) => {
    const text = `${diagnostic.message} ${(diagnostic.details ?? []).join(' ')}`;
    return authoredIds.some((id) => text.includes(id));
  });
  assert.deepEqual(round32Diagnostics, [], 'no new item or martial art is dropped during full-world assembly');

  const parsedProfile = progression.parseCharacterProfileSet(rawProfiles);
  assert.equal(parsedProfile.ok, true, 'the playable profile parses');
  const profile = parsedProfile.set.profiles[0];
  for (const teacher of TEACHERS) {
    const conversation = conversations.find((entry) => entry.id === teacher.dialogueId);
    const lessonNode = conversation.nodes.find((node) => node.id === 'r32-lessons');
    const character = progression.createCharacterState(profile);
    character.level = 99;
    for (const key of Object.keys(character.attributes)) character.attributes[key] = 99;
    const factionState = factionEngine.createFactionMembershipState({
      factionId: teacher.factionId,
      masterNpcId: teacher.npcId,
    });
    const runtimeContext = {
      quests: loaded.world.assembly.quests,
      journal: questEngine.createQuestJournal(loaded.world.assembly.quests),
      items: loaded.world.assembly.items,
      inventory: itemEngine.createInventoryState(profile, []),
      social: socialEngine.createSocialState(),
      speakerNpcId: teacher.npcId,
      knownKnowledgeNodeIds: new Set(),
      knowledgeNodes: loaded.world.knowledgeGraph.nodes,
      character,
      factions: loaded.world.assembly.progression.factions,
      martialArts: loaded.world.assembly.progression.martialArts,
      factionState,
      timeOfDayPeriodId: 'period.morning',
    };
    const eligibleOptions = dialogueRuntime.getVisibleOptions(lessonNode, runtimeContext);
    const schoolArts = newArts.filter((art) => art.factionIds[0] === teacher.factionId);
    assert.ok(schoolArts.every((art) => eligibleOptions.some((visible) =>
      visible.option.effects?.some((effect) => effect.kind === 'learnMartialArt' && effect.martialArtId === art.id))),
    `eligible members can see every R32 lesson for "${teacher.factionId}"`);

    for (const art of schoolArts) {
      const learned = dialogueRuntime.applyDialogueEffects(
        [{ kind: 'learnMartialArt', martialArtId: art.id }], runtimeContext,
      );
      assert.equal(learned.ok, true, `the mentor can teach "${art.id}" (${learned.ok ? '' : learned.reason})`);
      assert.ok(character.martialArtIds.includes(art.id), `"${art.id}" is recorded on the player`);
      const hiddenAfterLearning = dialogueRuntime.getVisibleOptions(lessonNode, runtimeContext);
      assert.ok(!hiddenAfterLearning.some((visible) =>
        visible.option.effects?.some((effect) => effect.kind === 'learnMartialArt' && effect.martialArtId === art.id)),
      `already learned technique "${art.id}" disappears from the lesson menu`);
      const duplicate = dialogueRuntime.applyDialogueEffects(
        [{ kind: 'learnMartialArt', martialArtId: art.id }], runtimeContext,
      );
      assert.equal(duplicate.ok, false, `already learned technique "${art.id}" cannot be granted twice`);
    }
  }

  console.info('[round-32] 内容烟测通过：25 件新物品/50 件总量与取得路径、24 种新武学/30 种总量与数值阶梯、五派导师授艺门控、学习/重复学习行为、商店/锻造引用及完整世界装配。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
