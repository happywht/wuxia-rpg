import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acceptQuest, applyQuestSignal, assembleQuests, createQuestJournal, parseQuestSet, reconcileQuestFacts, type QuestSignal } from '../src/engine/quest-system';
import { createCharacterState, parseCharacterProfileSet, parseMartialArtSet } from '../src/engine/character-progression';
import { buyItem, countItem, createInventoryState, equipItem, indexItems, parseItemSet, unequipItem, useConsumable } from '../src/engine/item-system';
import { craftAlchemy, parseAlchemySet } from '../src/engine/alchemy-system';
import { craftEquipment, parseEquipmentForgeSet } from '../src/engine/equipment-forge';
import { CombatSession, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState } from '../src/engine/save-system';
import { createSocialState } from '../src/engine/social-state';
import type { WorldMapAssembly } from '../src/engine/world-map';
const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const profileParse = parseCharacterProfileSet(json('data/base/characters/round-04-profiles.json'));
const itemParse = parseItemSet(json('data/base/items/round-06-items.json'));
const alchemyParse = parseAlchemySet(json('data/base/alchemy/round-25-alchemy.json'));
const forgeParse = parseEquipmentForgeSet(json('data/base/forges/round-24-equipment-forges.json'));
const questParse = parseQuestSet(json('data/base/quests/round-07-quests.json'));
if (!profileParse.ok || !itemParse.ok || !alchemyParse.ok || !forgeParse.ok || !questParse.ok) throw new Error('资料解析失败');
const profile = profileParse.set.profiles[0]!;
const items = indexItems(itemParse.set).byId;
const alchemy = { record: alchemyParse.set.stations[0]!, recipes: alchemyParse.set.recipes };
const forge = { record: forgeParse.set.stations[0]!, recipes: forgeParse.set.recipes };
const recipeIds = new Set([...alchemy.recipes, ...forge.recipes].map(r => r.id));
const nodes = json('data/base/knowledge_graph/nodes.json').nodes as { id: string }[];
const npcs = json('data/base/characters/round-03-npcs.json').npcs as { id: string }[];
const battles = parseBattleEncounterSet(json('data/base/battles/round-05-encounters.json'));
if (!battles.ok) throw new Error('遭遇解析失败');
const assemblyInput = {
  questSet: questParse.set, recipeIds,
  questGiverNpcIds: new Set(npcs.map(n => n.id)), npcIds: new Set(npcs.map(n => n.id)),
  itemIds: new Set(items.keys()), encounterIds: new Set(battles.set.encounters.map(e => e.id)),
  itemCategories: new Map([...items].map(([id, item]) => [id, item.category])),
  knowledgeNodeIds: new Set(nodes.map(n => n.id)),
};
const quests = new Map(questParse.set.quests.map(q => [q.id, q]));
const medicineId = 'quest.r31-herbal-stocktaking', forgeId = 'quest.r31-blade-quench-stock';
const formula = 'event.formula-shengji-san';
const shop = json('data/base/shops/round-06-shops.json').shops[0];
const stock = () => new Map<string, number>(shop.stock.map((s: { itemId: string; quantity: number }) => [s.itemId, s.quantity]));
function run(questId: string) {
  const journal = createQuestJournal(quests);
  for (const state of journal.states.values()) state.status = 'completed';
  journal.states.get(questId)!.status = 'offered';
  expect(acceptQuest(quests, journal, questId, new Map()).ok).toBe(true);
  const character = createCharacterState(profile);
  const inventory = createInventoryState(profile, []);
  inventory.currency = 300;
  const known = new Set<string>();
  return { journal, character, inventory, known, signal: (signal: QuestSignal) => applyQuestSignal(quests, journal, signal) };
}
function buy(context: ReturnType<typeof run>, id: string, quantity: number) {
  expect(buyItem(context.inventory, stock(), items.get(id)!, quantity).ok).toBe(true);
  context.signal({ type: 'item-count', itemId: id, quantity: countItem(context.inventory, id) });
}
function restore(context: ReturnType<typeof run>) {
  const snapshot = captureSaveSnapshot({ displayName: '制作旅程', mapResourceId: 'map.round-10-mist-ferry', playerCol: 12, playerRow: 4,
    character: context.character, inventory: context.inventory, journal: context.journal, social: createSocialState(),
    shopStocks: new Map(), completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: context.known,
    elapsedGameMinutes: 0, worldSeed: 104 });
  const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if (!parsed.ok) throw new Error(parsed.message);
  const plan = planSnapshotRestore(parsed.snapshot, {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
    mapResourceId: 'map.round-10-mist-ferry', isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(context.character.martialArtIds),
    questIds: new Set(quests.keys()), questObjectiveIds: new Map([...quests].map(([id, q]) => [id, new Set(q.objectives.map(o => o.id))])),
    questRecords: quests, encounterIds: assemblyInput.encounterIds, shopIds: new Set(), npcIds: assemblyInput.npcIds,
    knowledgeNodeIds: assemblyInput.knowledgeNodeIds,
  });
  if (!plan.ok) throw new Error(plan.errors.join('\n'));
  return restoreRunState({ snapshot: plan.snapshot, profile, items, quests, shops: new Map() });
}

describe('Round104真实制作与用途协议', () => {
  it('新增三类行动通过解析，未知/重复替代目标拒绝', () => {
    const q = structuredClone(quests.get(medicineId)!);
    expect(parseQuestSet({ quests: [q] }).ok).toBe(true);
    q.objectives[2]!.alternativeTargetIds = ['x'];
    expect(parseQuestSet({ quests: [q] }).ok).toBe(false);
    const use = q.objectives.find(o => o.kind === 'useItem')!;
    delete q.objectives[2]!.alternativeTargetIds;
    use.alternativeTargetIds = [use.targetId];
    expect(parseQuestSet({ quests: [q] }).ok).toBe(false);
  });
  it('失效配方/MOD去料目标隔离，不关闭其他任务', () => {
    const input = assemblyInput;
    expect(assembleQuests(input).quests.has(medicineId)).toBe(true);
    expect(assembleQuests(input).quests.has(forgeId)).toBe(true);
    const invalid = assembleQuests({ ...input, recipeIds: new Set([forge.recipes[0]!.id]) });
    expect(invalid.quests.has(medicineId)).toBe(false);
    expect(invalid.quests.has(forgeId)).toBe(true);
    expect(assembleQuests({ ...input, itemIds: new Set([...items.keys()].filter(id => id !== 'item.shengji-san-shang')) }).quests.has(medicineId)).toBe(false);
    expect(assembleQuests({ ...input, questSet: null }).quests.size).toBe(0);
    const categories = new Map(input.itemCategories); categories.set('item.shengji-san-shang', 'misc');
    expect(assembleQuests({ ...input, itemCategories: categories }).quests.has(medicineId)).toBe(false);
  });
  it('默认开局的两条循环预算可由既有前置差事支付，无需注资或成就', () => {
    expect(profile.startingCurrency).toBe(120);
    expect(profile.startingItems.find(s => s.itemId === 'item.huichun-gao')?.quantity).toBe(2);
    let money = profile.startingCurrency - items.get('item.huichun-gao')!.buyPrice;
    for (const id of ['quest.round-07-medicine-run', 'quest.round-07-clear-alley', 'quest.r31-herbal-inquiry', 'quest.r31-roadside-note']) money += quests.get(id)!.rewards.currency;
    expect(money).toBe(170);
    money -= 64; money += quests.get(medicineId)!.rewards.currency;
    expect(money).toBe(122);
    money -= 108; money += quests.get(forgeId)!.rewards.currency;
    expect(money).toBe(40);
  });
  it('未知药方/少料/少银/容量不足均拒绝且不扣投入', () => {
    const c = run(medicineId);
    buy(c, 'item.cangya-gen', 3); buy(c, 'item.hanzhu-cao', 2);
    const input = { station: alchemy, recipeId: alchemy.recipes[0]!.id, character: c.character,
      knownKnowledgeNodeIds: c.known, inventory: c.inventory, items };
    const unchanged = () => {
      const before = JSON.stringify(c.inventory);
      expect(craftAlchemy(input).ok).toBe(false);
      expect(JSON.stringify(c.inventory)).toBe(before);
    };
    unchanged(); c.known.add(formula);
    c.inventory.currency = 17; unchanged(); c.inventory.currency = 300;
    c.inventory.capacity = 1; unchanged(); c.inventory.capacity = 12;
    c.inventory.stacks = c.inventory.stacks.filter(s => s.itemId !== 'item.hanzhu-cao'); unchanged();
  });
  it('旧v1耗尽的有限兵刃库存不能覆盖当前无限供货，有限药品仍保留耗尽', () => {
    const c = run(forgeId);
    const snapshot = captureSaveSnapshot({ displayName: '旧库存', mapResourceId: 'map.round-10-mist-ferry', playerCol: 12, playerRow: 4,
      character: c.character, inventory: c.inventory, journal: c.journal, social: createSocialState(),
      shopStocks: new Map([[shop.id, new Map([['item.qingtong-bijian', 0], ['item.qingxin-wan', 0]])]]),
      completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: new Set(), elapsedGameMinutes: 0, worldSeed: 104 });
    const currentShop = { record: shop, stock: shop.stock };
    const restored = restoreRunState({ snapshot, profile, items, quests, shops: new Map([[shop.id, currentShop]]) });
    expect(restored.shopStocks.get(shop.id)?.get('item.qingtong-bijian')).toBe(-1);
    expect(restored.shopStocks.get(shop.id)?.get('item.qingxin-wan')).toBe(0);
    const limited = { record: shop, stock: [{ itemId: 'item.qingtong-bijian', quantity: 1 }] };
    snapshot.shopStocks[0]!.stock[0]!.quantity = -1;
    expect(restoreRunState({ snapshot, profile, items, quests, shops: new Map([[shop.id, limited]]) }).shopStocks.get(shop.id)?.get('item.qingtong-bijian')).toBe(1);
  });
  it.each([8, 12, 24])('悟性%s：交易→炼药→实际疗伤→复核，任意品质都结案', insight => {
    const c = run(medicineId);
    c.character.attributes.insight = insight;
    buy(c, 'item.cangya-gen', 3); buy(c, 'item.hanzhu-cao', 2);
    c.known.add(formula); c.signal({ type: 'knowledge-discovery', nodeId: formula });
    const outcome = craftAlchemy({ station: alchemy, recipeId: alchemy.recipes[0]!.id, character: c.character,
      knownKnowledgeNodeIds: c.known, inventory: c.inventory, items });
    expect(outcome.ok).toBe(true); if (!outcome.ok) throw new Error(outcome.reason);
    c.signal({ type: 'recipe-crafted', recipeId: outcome.recipe.id });
    expect(c.inventory.currency).toBe(236); // 30 roots + 16 grass + 18 fee
    expect(countItem(c.inventory, 'item.cangya-gen')).toBe(2);
    const before = JSON.stringify(c.inventory);
    expect(useConsumable(c.inventory, c.character, outcome.result)).toMatchObject({ ok: false, reason: 'no-effect' });
    expect(JSON.stringify(c.inventory)).toBe(before);
    const loaded = restore(c);
    expect(loaded.journal.states.get(medicineId)?.objectiveCounts.get('objective.r104-brew')).toBe(1);
    c.character.health.current -= 30;
    const usage = useConsumable(c.inventory, c.character, outcome.result);
    expect(usage.ok).toBe(true);
    if (usage.ok) expect(usage.outcome.healthHealed).toBe(Math.min(30, outcome.result.consumable!.healthRestore));
    c.signal({ type: 'item-used', itemId: outcome.result.id });
    expect(countItem(c.inventory, outcome.result.id)).toBe(0);
    const done = c.signal({ type: 'npc-talk', npcId: 'char.rong-su-qing' });
    expect(done.completed.filter(r => r.questId === medicineId)).toHaveLength(1);
    expect(done.completed[0]!.discoverKnowledgeNodeIds).toEqual(['event.r104-medicine-practice']);
    c.known.add(done.completed[0]!.discoverKnowledgeNodeIds![0]!);
    expect(restore(c).knownKnowledgeNodeIds).toContain('event.r104-medicine-practice');
    expect(c.signal({ type: 'npc-talk', npcId: 'char.rong-su-qing' }).completed).toHaveLength(0);
  });
  it('购买/持有/先使用/早报告均不冒充制作，满药不算用途', () => {
    const c = run(medicineId);
    c.signal({ type: 'item-used', itemId: 'item.shengji-san-shang' });
    c.signal({ type: 'recipe-crafted', recipeId: alchemy.recipes[0]!.id });
    buy(c, 'item.cangya-gen', 3);
    reconcileQuestFacts(quests, c.journal, { itemCounts: new Map([['item.shengji-san-shang', 3]]), knownKnowledgeNodeIds: new Set([formula]) });
    c.signal({ type: 'npc-talk', npcId: 'char.rong-su-qing' });
    expect(c.journal.states.get(medicineId)?.status).toBe('active');
    expect(c.journal.states.get(medicineId)?.objectiveCounts.get('objective.r104-brew') ?? 0).toBe(0);
  });
  it('交易→锻造→装备→实际挑战→复命；卸下投入和失败均不记制作', () => {
    const c = run(forgeId);
    buy(c, 'item.iron-sand', 2); buy(c, 'item.qingtong-bijian', 1);
    const equipmentContext = { inventory: c.inventory, character: c.character, profile, items };
    expect(equipItem(equipmentContext, items.get('item.qingtong-bijian')!).ok).toBe(true);
    const before = JSON.stringify(c.inventory);
    const input = { station: forge, recipeId: forge.recipes[0]!.id, inventory: c.inventory, items };
    expect(craftEquipment(input).ok).toBe(false);
    expect(JSON.stringify(c.inventory)).toBe(before);
    expect(unequipItem(equipmentContext, 'weapon').ok).toBe(true);
    const made = craftEquipment(input); expect(made.ok).toBe(true); if (!made.ok) throw new Error(made.reason);
    c.signal({ type: 'recipe-crafted', recipeId: made.recipe.id });
    expect(c.inventory.currency).toBe(192); // 24 sand + 60 old weapon + 24 fee
    const force = c.character.attributes.force;
    expect(equipItem(equipmentContext, made.result).ok).toBe(true);
    expect(c.character.attributes.force).toBe(force + 4);
    c.signal({ type: 'item-equipped', itemId: made.result.id });
    const loaded = restore(c);
    expect(loaded.inventory.equipped.weapon).toBe(made.result.id);
    expect(loaded.journal.states.get(forgeId)?.objectiveCounts.get('objective.r104-equip')).toBe(1);
    const arts = parseMartialArtSet(json('data/base/skills/round-04-martial-arts.json'));
    if (!arts.ok) throw new Error('武学解析失败');
    const encounter = battles.set.encounters.find(e => e.id === 'encounter.r58-market-toll-claimer')!;
    const combat = new CombatSession({ encounter, profile, player: c.character, martialArts: new Map(arts.set.martialArts.map(a => [a.id, a])) });
    for (let turn = 0; turn < 50 && !combat.isOver; turn++) combat.playerUse('skill.jianghu-sanshou');
    expect(combat.currentPhase).toBe('victory');
    expect(c.signal({ type: 'encounter-victory', encounterId: encounter.id }).changed).toBe(false);
    c.signal({ type: 'encounter-victory', encounterId: encounter.id, equippedItemIds: [made.result.id] });
    const done = c.signal({ type: 'npc-talk', npcId: 'char.zhu-jiuxian' });
    expect(done.completed.map(r => r.questId)).toEqual([forgeId]);
    c.known.add(done.completed[0]!.discoverKnowledgeNodeIds![0]!);
    expect(restore(c).knownKnowledgeNodeIds).toContain('event.r104-forge-practice');
  });
  it.each([medicineId, forgeId])('旧completed %s 不追补新证明，oldactive第一目标保留', id => {
    const c = run(id), q = quests.get(id)!;
    c.journal.states.get(id)!.objectiveCounts.set(q.objectives[0]!.id, q.objectives[0]!.requiredCount);
    expect(restore(c).journal.states.get(id)?.objectiveCounts.get(q.objectives[0]!.id)).toBe(q.objectives[0]!.requiredCount);
    c.journal.states.get(id)!.status = 'completed';
    const loaded = restore(c);
    expect(loaded.journal.states.get(id)?.status).toBe('completed');
    expect(loaded.knownKnowledgeNodeIds).not.toContain(q.rewards.discoverKnowledgeNodeIds![0]);
    expect(reconcileQuestFacts(quests, loaded.journal, { itemCounts: new Map() }).completed).toHaveLength(0);
  });
  it('制作导航到真实工位，背包阶段不虚构地标', () => {
    const c = run(forgeId), q = quests.get(forgeId)!;
    c.journal.states.get(forgeId)!.objectiveCounts.set(q.objectives[0]!.id, 2);
    const input = { quests, journal: c.journal, questId: forgeId, worldMap: {} as WorldMapAssembly,
      baseNpcs: [], periodNpcs: [], encounters: [], craftingStations: [forge, alchemy] };
    expect(resolveQuestNavigationTarget(input)).toMatchObject({ status: 'target', target: {
      kind: 'craftRecipe', col: 10, row: 4, mapResourceId: 'map.round-10-mist-ferry', arrivalAction: 'craft' } });
    c.signal({ type: 'recipe-crafted', recipeId: forge.recipes[0]!.id });
    expect(resolveQuestNavigationTarget(input)).toEqual({ status: 'no-target', reason: 'no-spatial-objective' });
  });
  it('脚本重跑稳定，基础兵刃可补买，其他库存有限额保持', () => {
    expect(stock().get('item.qingtong-bijian')).toBe(-1);
    expect(stock().get('item.qingxin-wan')).toBe(5);
    const files = ['quests/round-07-quests.json', 'dialogues/round-03-conversations.json', 'dialogues/round-30-conversations.json', 'knowledge_graph/nodes.json', 'knowledge_graph/edges.json', 'shops/round-06-shops.json'];
    const sandbox = mkdtempSync(join(tmpdir(), 'wuxia-r104-'));
    try {
      for (const p of [...files.map(f => `data/base/${f}`), 'data/schema/quest-set.schema.json', 'scripts/deepen-round104-crafting.mjs']) {
        const destination = join(sandbox, p);
        mkdirSync(join(destination, '..'), { recursive: true });
        cpSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), destination);
      }
      const hash = () => files.map(p => createHash('sha256').update(readFileSync(join(sandbox, 'data/base', p))).digest('hex')).join();
      const before = hash();
      for (let round = 0; round < 2; round++) execFileSync(process.execPath, ['scripts/deepen-round104-crafting.mjs'], { cwd: sandbox });
      expect(hash()).toBe(before);
    } finally {
      if (!resolve(sandbox).startsWith(resolve(tmpdir()) + sep) || !sandbox.includes('wuxia-r104-')) throw new Error('拒绝清理不在临时沙盒内的路径');
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
