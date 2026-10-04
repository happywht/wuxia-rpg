/**
 * Round 271 — 巷口送药/茶棚凉汤的显式当面交付回归（真实资料+真实引擎）。
 *
 * 覆盖：只备料（含购买）不结案；真实对白选项原子扣料恰好 3/4 份、一次性
 * 原奖励结案、关系+3、交付见闻持久；不足时选项不可见且效果整体拒绝零改动；
 * 普通交谈信号与重复发现不能再交付；备齐后 Q 导航指回交付 NPC（talk 提示）；
 * 旧 v1 已完成档保持 completed 且不能补交付；旧 v1 进行中档加载后仍可补交，
 * 存档往返一致；R271 作者修复是记录在案的增量源（可从 pristine 重建、幂等、
 * 漂移拒绝），legacy 作者链（100/103/104/128）沙盒重放不撤回新交付规则，
 * 制作指导按B打开背包不再指I图鉴。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet, type DialogueData, type DialogueOptionData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import {
  acceptQuest, applyQuestSignal, assembleQuests, createQuestJournal,
  parseQuestSet, type QuestData, type QuestJournal,
} from '../src/engine/quest-system';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import type { PlacedNpc } from '../src/engine/npc-placement';
import {
  parseKnowledgeEdgeSet, parseKnowledgeNodeSet,
} from '../src/engine/knowledge-graph';
import { createCharacterState, parseCharacterProfileSet } from '../src/engine/character-progression';
import { countItem, createInventoryState, indexItems, parseItemSet } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import {
  captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState,
} from '../src/engine/save-system';
import {
  CRAFTING_HINT_FIXES, DELIVERY_DIALOGUES, DELIVERY_EDGES, DELIVERY_NODES,
  repairDialoguesRaw, repairKnowledgeGraph, repairQuestsRaw,
} from '../scripts/lib/round271-journey-delivery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const readRaw = (path: string): string => readFileSync(join(root, path), 'utf8');

const profileParse = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
if (!profileParse.ok) throw new Error(profileParse.errors.join());
const profile = profileParse.set.profiles[0]!;
const itemParse = parseItemSet(read('data/base/items/round-06-items.json'));
if (!itemParse.ok) throw new Error(itemParse.errors.join());
const items = indexItems(itemParse.set).byId;
const questParse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
if (!questParse.ok) throw new Error(questParse.errors.join());
const quests = new Map<string, QuestData>(questParse.set.quests.map((quest) => [quest.id, quest]));
const nodeParse = parseKnowledgeNodeSet(read('data/base/knowledge_graph/nodes.json'));
if (!nodeParse.ok) throw new Error(nodeParse.errors.join());
const edgeParse = parseKnowledgeEdgeSet(read('data/base/knowledge_graph/edges.json'));
if (!edgeParse.ok) throw new Error(edgeParse.errors.join());
const knowledgeNodes = new Map(nodeParse.data.nodes.map((node) => [node.id, node]));
const knowledgeEdges = edgeParse.data.edges;
const dialogues = new Map<string, DialogueData>();
for (const path of ['data/base/dialogues/round-03-conversations.json', 'data/base/dialogues/round-30-conversations.json']) {
  const parsed = parseDialogueSet(read(path));
  if (!parsed.ok) throw new Error(parsed.errors.join());
  for (const conversation of parsed.set.conversations) dialogues.set(conversation.id, conversation);
}
const npcIds = new Set((read('data/base/characters/round-03-npcs.json') as { npcs: { id: string }[] }).npcs.map((npc) => npc.id));
const assembly = assembleQuests({
  questSet: questParse.set, questGiverNpcIds: npcIds, npcIds, itemIds: new Set(items.keys()),
  encounterIds: new Set(), knowledgeNodeIds: new Set(knowledgeNodes.keys()),
});

const MEDICINE = 'quest.round-07-medicine-run';
const TEASTALL = 'quest.r31-teastall-herbal-water';
const MEDICINE_EVENT = 'event.r271-medicine-delivered';
const TEASTALL_EVENT = 'event.r271-teastall-delivered';

interface Run {
  ctx: DialogueRuntimeContext;
  dialogues: Map<string, DialogueData>;
}
/** Real interpreter context seeded like a fresh J0 profile plus chosen stock. */
function run(stock: { ointment?: number; hanzhu?: number }, speaker: string): Run {
  const stacks: { itemId: string; quantity: number }[] = [];
  if (stock.ointment !== undefined) stacks.push({ itemId: 'item.huichun-gao', quantity: stock.ointment });
  if (stock.hanzhu !== undefined) stacks.push({ itemId: 'item.hanzhu-cao', quantity: stock.hanzhu });
  const ctx: DialogueRuntimeContext = {
    quests, journal: createQuestJournal(quests), items,
    inventory: createInventoryState(profile, stacks),
    social: createSocialState(), speakerNpcId: speaker,
    knownKnowledgeNodeIds: new Set(), knowledgeNodes, knowledgeEdges,
    character: createCharacterState(profile), factions: new Map(), martialArts: new Map(),
    factionState: createFactionMembershipState(), timeOfDayPeriodId: 'period.midday',
  };
  return { ctx, dialogues };
}
const greetNode = (dialogueId: string) =>
  dialogues.get(dialogueId)!.nodes.find((node) => node.id === dialogues.get(dialogueId)!.startNodeId)!;
const readyOptionOf = (spec: (typeof DELIVERY_DIALOGUES)[number]) => spec.readyOption.text;
const optionBy = (run: Run, dialogueId: string, text: string): DialogueOptionData | undefined =>
  getVisibleOptions(greetNode(dialogueId), run.ctx).find((entry) => entry.option.text === text)?.option;
const accept = (run: Run, questId: string, itemCounts: Map<string, number>) => {
  const result = acceptQuest(quests, run.ctx.journal, questId, itemCounts, {
    knownKnowledgeNodeIds: run.ctx.knownKnowledgeNodeIds,
  });
  expect(result.ok).toBe(true);
  return result;
};

describe('Round271 数据与引用闭合', () => {
  it('两任务保持稳定ID、原奖励与收集文本，新增有序交付目标与F指引', () => {
    // 最小装配夹具未提供遭遇/配方目录，其他战斗类任务的告警是预期噪音；
    // 只要求两个交付任务引用闭合、未被禁用。
    const warningText = assembly.warnings.join('\n');
    expect(warningText).not.toContain(MEDICINE);
    expect(warningText).not.toContain(TEASTALL);
    expect(assembly.quests.has(MEDICINE)).toBe(true);
    expect(assembly.quests.has(TEASTALL)).toBe(true);
    for (const [questId, reward, eventNodeId, navNpc, deliveryText] of [
      [MEDICINE, { experience: 15, currency: 18 }, MEDICINE_EVENT, 'char.ma-shangyi', '按F交付回春膏×3'],
      [TEASTALL, { experience: 18, currency: 15 }, TEASTALL_EVENT, 'char.lu-zhenniang', '按F交付寒珠草×4'],
    ] as const) {
      const quest = quests.get(questId)!;
      expect(quest.orderedObjectives, questId).toBe(true);
      expect(quest.objectives.map((objective) => objective.kind)).toEqual(['collectItem', 'discoverKnowledge']);
      expect(quest.rewards).toEqual(reward);
      expect(quest.objectives[0]!.text).toBe(
        questId === MEDICINE
          ? '备齐三份回春膏（可在江南姜百味处采买）'
          : '备齐寒珠草×4（江南姜百味处按E采买）',
      );
      expect(quest.objectives[1]).toMatchObject({
        kind: 'discoverKnowledge', targetId: eventNodeId, requiredCount: 1, navigationNpcId: navNpc,
      });
      expect(quest.objectives[1]!.text).toContain(deliveryText);
      expect(quest.objectives[1]!.text).toContain('按E看差事名录');
    }
  });

  it('交付选项条件完备（active+实际库存+未知事件），效果为原子扣料+关系+见闻', () => {
    for (const spec of DELIVERY_DIALOGUES) {
      const conversation = dialogues.get(spec.conversationId)!;
      const greet = conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
      const ready = greet.options!.find((option) => option.text === spec.readyOption.text)!;
      expect(ready.conditions).toEqual(spec.readyOption.conditions);
      expect(ready.effects).toEqual(spec.readyOption.effects);
      expect(spec.readyOption.conditions.map((condition) => condition.kind)).toEqual(
        ['questStatus', 'itemCount', 'knowledgeKnown'],
      );
      expect(spec.readyOption.effects!.map((effect) => effect.kind)).toEqual(
        ['takeItem', 'adjustRelationship', 'discoverKnowledgeNode'],
      );
      // ready/notready/done are all reachable from the greet node.
      for (const wanted of [spec.readyOption, spec.progressOption, spec.echoOption]) {
        expect(greet.options!.some((option) => option.text === wanted.text), wanted.text).toBe(true);
      }
      for (const wanted of [spec.progressNode, spec.deliveredNode, spec.echoNode]) {
        expect(conversation.nodes.some((node) => node.id === wanted.id), wanted.id).toBe(true);
      }
      expect(spec.progressNode.text).toContain('按F');
      expect(spec.progressNode.text).toContain('差事名录');
    }
  });

  it('两个交付见闻节点与四条边在图谱中解析闭合', () => {
    for (const node of DELIVERY_NODES) {
      expect(knowledgeNodes.get(node.id)).toEqual(node);
    }
    for (const edge of DELIVERY_EDGES) {
      expect(knowledgeEdges.some((entry) => entry.id === edge.id && entry.fromId === edge.fromId && entry.toId === edge.toId)).toBe(true);
    }
  });

  it('制作指导不再指向I图鉴：全部按B打开背包', () => {
    const questRaw = readRaw('data/base/quests/round-07-quests.json');
    expect(questRaw).not.toContain('按I打开背包');
    for (const fix of CRAFTING_HINT_FIXES) {
      const objective = [...quests.values()]
        .flatMap((quest) => quest.objectives)
        .find((entry) => entry.id === fix.objectiveId)!;
      expect(objective.text).toBe(fix.newText);
    }
  });
});

describe('Round271 持有不结案与显式交付', () => {
  it('只备齐（含接取时已持有与购买信号）不结案，任务保持进行中', () => {
    const medicine = run({ ointment: 3 }, 'char.ma-shangyi');
    accept(medicine, MEDICINE, new Map([['item.huichun-gao', 3]]));
    expect(medicine.ctx.journal.states.get(MEDICINE)!.status).toBe('active');
    expect([...medicine.ctx.journal.states.get(MEDICINE)!.objectiveCounts.values()]).toEqual([3, 0]);

    const teastall = run({ hanzhu: 4 }, 'char.lu-zhenniang');
    accept(teastall, TEASTALL, new Map());
    expect(applyQuestSignal(quests, teastall.ctx.journal, { type: 'item-count', itemId: 'item.hanzhu-cao', quantity: 4 }).completed).toEqual([]);
    expect(teastall.ctx.journal.states.get(TEASTALL)!.status).toBe('active');
    // Ordinary talk with the giver never settles the delivery objective.
    expect(applyQuestSignal(quests, teastall.ctx.journal, { type: 'npc-talk', npcId: 'char.lu-zhenniang' }).completed).toEqual([]);
    expect(teastall.ctx.journal.states.get(TEASTALL)!.status).toBe('active');
  });

  it.each([
    {
      name: '马尚义收三份回春膏', spec: DELIVERY_DIALOGUES[0]!, questId: MEDICINE, itemId: 'item.huichun-gao',
      held: 4, consume: 3, event: MEDICINE_EVENT, npc: 'char.ma-shangyi', speaker: 'char.ma-shangyi',
      reward: { questId: MEDICINE, experience: 15, currency: 18 },
    },
    {
      name: '陆贞娘收四株寒珠草', spec: DELIVERY_DIALOGUES[1]!, questId: TEASTALL, itemId: 'item.hanzhu-cao',
      held: 5, consume: 4, event: TEASTALL_EVENT, npc: 'char.lu-zhenniang', speaker: 'char.lu-zhenniang',
      reward: { questId: TEASTALL, experience: 18, currency: 15 },
    },
  ])('$name：真实交付恰好扣料、原奖励只发一次、关系+3、见闻持久', (caseSpec) => {
    const itemId = caseSpec.itemId as string;
    const held = caseSpec.held as number;
    const stockKey = itemId === 'item.huichun-gao' ? 'ointment' : 'hanzhu';
    const seeded = { [stockKey]: held } as { ointment?: number; hanzhu?: number };
    const journey = run(seeded, caseSpec.speaker as string);
    accept(journey, caseSpec.questId as string, new Map([[itemId, held]]));
    // 达到交付条件：备料完成、交付待办。
    expect(optionBy(journey, caseSpec.spec.conversationId, readyOptionOf(caseSpec.spec))).toBeDefined();
    const option = optionBy(journey, caseSpec.spec.conversationId, readyOptionOf(caseSpec.spec))!;
    const result = applyDialogueEffects(option.effects!, journey.ctx);
    expect(result.ok).toBe(true);
    // 扣料恰好 3/4，多余自留。
    expect(countItem(journey.ctx.inventory!, itemId)).toBe(held - (caseSpec.consume as number));
    // 一次性结案并按原奖励结算。
    const state = journey.ctx.journal.states.get(caseSpec.questId as string)!;
    expect(state.status).toBe('completed');
    expect(result.ok && result.summary.questUpdate.completed).toEqual([caseSpec.reward]);
    // 关系后果 +3 落在交付NPC身上。
    expect(getRelationship(journey.ctx.social, caseSpec.npc as string)).toBe(3);
    // 交付见闻持久化，事后回应按真实事件可见。
    expect(journey.ctx.knownKnowledgeNodeIds.has(caseSpec.event as string)).toBe(true);
    expect(optionBy(journey, caseSpec.spec.conversationId, caseSpec.spec.echoOption.text)).toBeDefined();
    // 交付后 ready 与 progress 不再可见，重复发现不重发奖励。
    expect(optionBy(journey, caseSpec.spec.conversationId, readyOptionOf(caseSpec.spec))).toBeUndefined();
    expect(optionBy(journey, caseSpec.spec.conversationId, caseSpec.spec.progressOption.text)).toBeUndefined();
    expect(applyQuestSignal(quests, journey.ctx.journal, {
      type: 'knowledge-discovery', nodeId: caseSpec.event as string,
    }).completed).toEqual([]);
    expect(state.status).toBe('completed');
  });

  it('库存不足：选项不可见，效果整体原子拒绝，状态零改动', () => {
    const short = run({ ointment: 2 }, 'char.ma-shangyi');
    accept(short, MEDICINE, new Map([['item.huichun-gao', 2]]));
    expect(optionBy(short, DELIVERY_DIALOGUES[0]!.conversationId, readyOptionOf(DELIVERY_DIALOGUES[0]!))).toBeUndefined();
    // 直接对引擎提交该效果序列（绕过可见性）也必须整体拒绝。
    const refusal = applyDialogueEffects(DELIVERY_DIALOGUES[0]!.readyOption.effects!, short.ctx);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) expect(refusal.reason).toContain('没有足够的');
    expect(countItem(short.ctx.inventory!, 'item.huichun-gao')).toBe(2);
    expect(short.ctx.journal.states.get(MEDICINE)!.status).toBe('active');
    expect(short.ctx.knownKnowledgeNodeIds.has(MEDICINE_EVENT)).toBe(false);
    expect(getRelationship(short.ctx.social, 'char.ma-shangyi')).toBe(0);
  });
});

describe('Round271 导航指回交付NPC', () => {
  // 解析器只读 record.id/name/mapResourceId 与 col/row；最小放置字面量足够。
  const placed = [
    { record: { id: 'char.ma-shangyi', name: '马尚义', mapResourceId: 'map.round-01-grid' }, col: 39, row: 37 },
    { record: { id: 'char.lu-zhenniang', name: '陆贞娘', mapResourceId: 'map.round-01-grid' }, col: 46, row: 39 },
    { record: { id: 'char.jiang-baiwei', name: '姜百味', mapResourceId: 'map.round-01-grid' }, col: 45, row: 39 },
  ] as unknown as PlacedNpc[];
  const journalWith = (questId: string, counts: number[]): QuestJournal => ({
    trackedQuestId: questId,
    states: new Map([...quests.values()].map((quest) => [quest.id, {
      questId: quest.id,
      status: quest.id === questId ? 'active' as const : 'locked' as const,
      objectiveCounts: new Map(quest.objectives.map((objective, index) => [objective.id, counts[index] ?? 0])),
    }])),
  });
  const navigate = (questId: string, counts: number[]) => resolveQuestNavigationTarget({
    quests, journal: journalWith(questId, counts), questId,
    worldMap: { events: [], landmarks: [] } as never,
    baseNpcs: placed, periodNpcs: placed, encounters: [],
    knowledgeNodeTitles: new Map([...knowledgeNodes].map(([id, node]) => [id, node.title])),
    shops: new Map([
      ['shop.jiang-stall', {
        record: { id: 'shop.jiang-stall', npcId: 'char.jiang-baiwei', name: '姜百味百宝担' },
        stock: [
          { itemId: 'item.huichun-gao', quantity: -1 },
          { itemId: 'item.hanzhu-cao', quantity: -1 },
        ],
      } as never],
    ]),
  });

  it('备料未齐导航去卖家；备齐后指回交付NPC并给按F交谈提示', () => {
    for (const [questId, sellerName, deliveryName, deliveryObjective] of [
      [MEDICINE, '姜百味百宝担', '马尚义', 'objective.r271-medicine-delivery'],
      [TEASTALL, '姜百味百宝担', '陆贞娘', 'objective.r271-teastall-delivery'],
    ] as const) {
      const shopping = navigate(questId, [0, 0]);
      expect(shopping.status).toBe('target');
      if (shopping.status === 'target') {
        expect(shopping.target.kind).toBe('collectItem');
        expect(shopping.target.name).toBe(sellerName);
        expect(shopping.target.arrivalAction).toBe('shop');
      }
      const delivering = navigate(questId, [questId === MEDICINE ? 3 : 4, 0]);
      expect(delivering.status).toBe('target');
      if (delivering.status === 'target') {
        expect(delivering.target.objectiveId).toBe(deliveryObjective);
        expect(delivering.target.kind).toBe('discoverKnowledge');
        expect(delivering.target.name).toBe(deliveryName);
        expect(delivering.target.arrivalAction).toBe('talk');
      }
    }
  });
});

describe('Round271 旧档兼容与存档往返', () => {
  /** 手工构造 v1 语义存档：交付目标尚未存在（无其计数）、无新见闻。 */
  const v1Snapshot = (questId: string, status: 'active' | 'completed', collectCount: number) => {
    const baseline = run({ ointment: 3 }, 'char.ma-shangyi');
    accept(baseline, MEDICINE, new Map([['item.huichun-gao', 3]]));
    baseline.ctx.journal.states.get(MEDICINE)!.status = status;
    const snapshot = captureSaveSnapshot({
      displayName: 'v1旧档', mapResourceId: 'map.round-01-grid', playerCol: 40, playerRow: 37,
      character: baseline.ctx.character!, inventory: baseline.ctx.inventory!,
      journal: baseline.ctx.journal, social: baseline.ctx.social,
      shopStocks: new Map(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
      knownKnowledgeNodeIds: baseline.ctx.knownKnowledgeNodeIds,
      elapsedGameMinutes: 0, worldSeed: 271,
    });
    const raw = JSON.parse(JSON.stringify(snapshot)) as {
      quests: { states: { questId: string; objectiveCounts: { id: string; value: number }[] }[] };
    };
    const state = raw.quests.states.find((entry) => entry.questId === questId)!;
    state.objectiveCounts = state.objectiveCounts.filter((entry) => entry.id !== 'objective.r271-medicine-delivery');
    state.objectiveCounts[0]!.value = collectCount;
    return JSON.parse(JSON.stringify(raw));
  };
  const restore = (snapshot: unknown) => {
    const parsed = parseSaveSnapshot(snapshot);
    if (!parsed.ok) throw new Error(parsed.message);
    const plan = planSnapshotRestore(parsed.snapshot, {
      profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
      mapResourceId: 'map.round-01-grid', isWalkableCell: () => true, isCellOccupied: () => false,
      itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(),
      questIds: new Set(quests.keys()),
      questObjectiveIds: new Map([...quests].map(([id, quest]) => [id, new Set(quest.objectives.map((objective) => objective.id))])),
      questRecords: quests, encounterIds: new Set(), shopIds: new Set(), npcIds,
      knowledgeNodeIds: new Set(knowledgeNodes.keys()),
    });
    if (!plan.ok) throw new Error(plan.errors.join('\n'));
    return restoreRunState({ snapshot: plan.snapshot, profile, items, quests, shops: new Map() });
  };
  const contextFrom = (restored: ReturnType<typeof restore>): DialogueRuntimeContext => ({
    quests, journal: restored.journal, items, inventory: restored.inventory,
    social: restored.social, speakerNpcId: 'char.ma-shangyi',
    knownKnowledgeNodeIds: new Set(restored.knownKnowledgeNodeIds),
    knowledgeNodes, knowledgeEdges, character: restored.character,
    factions: new Map(), martialArts: new Map(),
    factionState: createFactionMembershipState(restored.factionMembership),
    timeOfDayPeriodId: 'period.midday',
  });

  it('v1 已完成档保持 completed：不补扣料、不补发奖励、不假称有交付见闻', () => {
    const restored = restore(v1Snapshot(MEDICINE, 'completed', 3));
    expect(restored.journal.states.get(MEDICINE)!.status).toBe('completed');
    const ctx = contextFrom(restored);
    expect(ctx.knownKnowledgeNodeIds.has(MEDICINE_EVENT)).toBe(false);
    // 交付选项要求进行中，旧完成档不可再交付；重复发现信号对已完成任务无效。
    expect(getVisibleOptions(greetNode(DELIVERY_DIALOGUES[0]!.conversationId), ctx)
      .some((entry) => entry.option.text === readyOptionOf(DELIVERY_DIALOGUES[0]!))).toBe(false);
    expect(applyQuestSignal(quests, ctx.journal, { type: 'knowledge-discovery', nodeId: MEDICINE_EVENT }).completed).toEqual([]);
    expect(restored.journal.states.get(MEDICINE)!.status).toBe('completed');
    expect(countItem(restored.inventory, 'item.huichun-gao')).toBe(3);
  });

  it('v1 进行中档加载后交付待办，可正常当面补交并存档往返一致', () => {
    const restored = restore(v1Snapshot(MEDICINE, 'active', 3));
    expect(restored.journal.states.get(MEDICINE)!.status).toBe('active');
    expect([...restored.journal.states.get(MEDICINE)!.objectiveCounts.values()]).toEqual([3, 0]);
    const ctx = contextFrom(restored);
    const ready = getVisibleOptions(greetNode(DELIVERY_DIALOGUES[0]!.conversationId), ctx)
      .find((entry) => entry.option.text === readyOptionOf(DELIVERY_DIALOGUES[0]!))?.option;
    expect(ready).toBeDefined();
    const result = applyDialogueEffects(ready!.effects!, ctx);
    expect(result.ok).toBe(true);
    expect(result.ok && result.summary.questUpdate.completed).toEqual([
      { questId: MEDICINE, experience: 15, currency: 18 },
    ]);
    expect(countItem(ctx.inventory!, 'item.huichun-gao')).toBe(0);
    expect(ctx.knownKnowledgeNodeIds.has(MEDICINE_EVENT)).toBe(true);

    // 存档往返：结案、见闻、关系与库存一致读回。
    const saved = captureSaveSnapshot({
      displayName: '交付后', mapResourceId: 'map.round-01-grid', playerCol: 40, playerRow: 37,
      character: ctx.character!, inventory: ctx.inventory!, journal: ctx.journal, social: ctx.social,
      shopStocks: new Map(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
      knownKnowledgeNodeIds: ctx.knownKnowledgeNodeIds, elapsedGameMinutes: 5, worldSeed: 271,
    });
    const roundtrip = restore(JSON.parse(JSON.stringify(saved)));
    expect(roundtrip.journal.states.get(MEDICINE)!.status).toBe('completed');
    expect(roundtrip.journal.states.get(MEDICINE)!.objectiveCounts.get('objective.r271-medicine-delivery')).toBe(1);
    expect(roundtrip.knownKnowledgeNodeIds).toContain(MEDICINE_EVENT);
    expect(getRelationship(roundtrip.social, 'char.ma-shangyi')).toBe(3);
    expect(countItem(roundtrip.inventory, 'item.huichun-gao')).toBe(0);
  });
});

describe('Round271 作者源与legacy链沙盒重放', () => {
  const safeRemove = (workspace: string) => {
    if (!workspace.startsWith(resolve(tmpdir()) + sep)) throw new Error('bad temp');
    rmSync(workspace, { recursive: true, force: true });
  };
  /** 从当前资料反向构造 R271 之前的 pristine 输入（JSON 层面）。 */
  const pristineQuests = () => {
    const doc = JSON.parse(readRaw('data/base/quests/round-07-quests.json'));
    for (const quest of doc.quests) {
      const spec = DELIVERY_DIALOGUES.find((entry) =>
        entry.readyOption.conditions.some((condition) => condition.kind === 'questStatus' && condition.questId === quest.id));
      if (spec) {
        const objective = quest.objectives.pop();
        delete quest.orderedObjectives;
        quest.description = quest.id === MEDICINE
          ? '镇西几户人家被巷口的刀客惊扰，伤者缺药。替马尚义备齐回春膏，他会把药送去安置伤者。'
          : '入夏后茶棚的凉汤走俏，陆贞娘惯用寒珠草提味败火，岸边湿地的草却被夜雨打烂了一片。替她备来四株，回头给赶路的药队也留一桶。';
        expect(objective.id).toMatch(/^objective\.r271-/);
      }
      for (const fix of CRAFTING_HINT_FIXES) {
        const target = quest.objectives.find((entry: { id: string }) => entry.id === fix.objectiveId);
        if (target) target.text = fix.oldText;
      }
    }
    // splice repairs need the file-shaped 2-space/CRLF serialization.
    return JSON.stringify(doc, null, 2).replace(/\n/g, '\r\n');
  };
  const pristineDialogues = () => {
    const doc = JSON.parse(readRaw('data/base/dialogues/round-03-conversations.json'));
    for (const conversation of doc.conversations) {
      const spec = DELIVERY_DIALOGUES.find((entry) => entry.conversationId === conversation.id);
      if (!spec) continue;
      const greet = conversation.nodes.find((node: { id: string }) => node.id === conversation.startNodeId);
      greet.options = greet.options.filter((option: { text: string }) =>
        ![spec.readyOption.text, spec.progressOption.text, spec.echoOption.text].includes(option.text));
      conversation.nodes = conversation.nodes.filter((node: { id: string }) =>
        ![spec.progressNode.id, spec.deliveredNode.id, spec.echoNode.id].includes(node.id));
    }
    return JSON.stringify(doc, null, 2);
  };

  it('纯修复可从 pristine 重建当前字节并幂等，漂移拒绝', () => {
    // pristine（无 R271 字节格式）→ 修复 → 与当前数据 JSON 等值。
    expect(JSON.parse(repairQuestsRaw(pristineQuests()))).toEqual(JSON.parse(readRaw('data/base/quests/round-07-quests.json')));
    expect(JSON.parse(repairDialoguesRaw(pristineDialogues()))).toEqual(JSON.parse(readRaw('data/base/dialogues/round-03-conversations.json')));
    const pristineNodes = JSON.parse(readRaw('data/base/knowledge_graph/nodes.json'));
    const pristineEdges = JSON.parse(readRaw('data/base/knowledge_graph/edges.json'));
    pristineNodes.nodes = pristineNodes.nodes.filter((node: { id: string }) => !DELIVERY_NODES.some((wanted) => wanted.id === node.id));
    pristineEdges.edges = pristineEdges.edges.filter((edge: { id: string }) => !DELIVERY_EDGES.some((wanted) => wanted.id === edge.id));
    repairKnowledgeGraph(pristineNodes, pristineEdges);
    expect(pristineNodes).toEqual(JSON.parse(readRaw('data/base/knowledge_graph/nodes.json')));
    expect(pristineEdges).toEqual(JSON.parse(readRaw('data/base/knowledge_graph/edges.json')));
    // 幂等：对当前数据二次修复是字节级无操作。
    expect(repairQuestsRaw(readRaw('data/base/quests/round-07-quests.json'))).toBe(readRaw('data/base/quests/round-07-quests.json'));
    expect(repairDialoguesRaw(readRaw('data/base/dialogues/round-03-conversations.json'))).toBe(readRaw('data/base/dialogues/round-03-conversations.json'));
    // 漂移拒绝：受管交付目标被改后必须拒绝而不是覆盖。
    const drifted = JSON.parse(readRaw('data/base/quests/round-07-quests.json'));
    const medicine = drifted.quests.find((quest: { id: string }) => quest.id === MEDICINE);
    medicine.objectives[1].text = '被篡改的交付目标';
    expect(() => repairQuestsRaw(JSON.stringify(drifted))).toThrow('请人工复核');
    const driftedDialogue = JSON.parse(readRaw('data/base/dialogues/round-03-conversations.json'));
    const luConversation = driftedDialogue.conversations.find((conversation: { id: string }) => conversation.id === 'dlg.lu-zhenniang-teastall');
    const luGreet = luConversation.nodes.find((node: { id: string }) => node.id === 'greet');
    luGreet.options.find((option: { text: string }) => option.text === DELIVERY_DIALOGUES[1]!.readyOption.text).text = '被篡改的选项';
    expect(() => repairDialoguesRaw(JSON.stringify(driftedDialogue))).toThrow('请人工复核');
  });

  it('apply-round271 CLI 沙盒：预检通过才写、二次运行零差异、拒绝时不落盘', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r271-cli-'));
    try {
      mkdirSync(join(workspace, 'scripts/lib'), { recursive: true });
      for (const dir of ['quests', 'dialogues', 'knowledge_graph']) {
        mkdirSync(join(workspace, 'data/base', dir), { recursive: true });
      }
      for (const file of ['apply-round271.mjs', 'lib/round271-journey-delivery.mjs']) {
        cpSync(resolve(root, 'scripts', file), join(workspace, 'scripts', file));
      }
      writeFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), pristineQuests());
      writeFileSync(join(workspace, 'data/base/dialogues/round-03-conversations.json'), pristineDialogues());
      for (const name of ['nodes.json', 'edges.json']) {
        const doc = JSON.parse(readRaw(`data/base/knowledge_graph/${name}`));
        if (name === 'nodes.json') {
          doc.nodes = doc.nodes.filter((node: { id: string }) => !DELIVERY_NODES.some((wanted) => wanted.id === node.id));
        } else {
          doc.edges = doc.edges.filter((edge: { id: string }) => !DELIVERY_EDGES.some((wanted) => wanted.id === edge.id));
        }
        writeFileSync(join(workspace, 'data/base/knowledge_graph', name), JSON.stringify(doc));
      }
      const run = () => execFileSync(process.execPath, [join(workspace, 'scripts/apply-round271.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      expect(() => run()).not.toThrow();
      // pristine 由反向构造而来，无法复刻历史混合缩进；断言 JSON 等值
      // （受管记录字节形状由“对真实文件二次修复零差异”单独证明）。
      expect(JSON.parse(readFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), 'utf8')))
        .toEqual(JSON.parse(readRaw('data/base/quests/round-07-quests.json')));
      expect(JSON.parse(readFileSync(join(workspace, 'data/base/dialogues/round-03-conversations.json'), 'utf8')))
        .toEqual(JSON.parse(readRaw('data/base/dialogues/round-03-conversations.json')));
      const saved = [
        readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8'),
        readFileSync(join(workspace, 'data/base/knowledge_graph/edges.json'), 'utf8'),
      ];
      run();
      expect([
        readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8'),
        readFileSync(join(workspace, 'data/base/knowledge_graph/edges.json'), 'utf8'),
      ]).toEqual(saved);
      // 受管条目被改后拒绝且不落盘。
      const tampered = join(workspace, 'data/base/dialogues/round-03-conversations.json');
      const before = readFileSync(tampered, 'utf8');
      const doc = JSON.parse(before);
      const conversation = doc.conversations.find((entry: { id: string }) => entry.id === 'dlg.ma-shangyi-notice-board');
      conversation.nodes = conversation.nodes.filter((node: { id: string }) => node.id !== 'r271-medicine-echo');
      writeFileSync(tampered, JSON.stringify(doc));
      expect(() => run()).toThrow();
      expect(readFileSync(tampered, 'utf8')).toBe(JSON.stringify(doc));
    } finally {
      safeRemove(workspace);
    }
  });

  it('legacy 作者链（100/103/104/128）沙盒重放不撤回R271交付与按B指导', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r271-chain-'));
    try {
      mkdirSync(join(workspace, 'scripts/lib'), { recursive: true });
      for (const dir of ['quests', 'dialogues', 'knowledge_graph', 'shops', 'maps']) {
        mkdirSync(join(workspace, 'data/base', dir), { recursive: true });
      }
      mkdirSync(join(workspace, 'data/schema'), { recursive: true });
      const scriptCopies: Record<string, string[]> = {
        'deepen-round100-mainland.mjs': [],
        'deepen-round103-faction-practice.mjs': ['lib/round103-faction-practice.mjs'],
        'deepen-round104-crafting.mjs': [],
        'apply-round128.mjs': ['lib/round128-town-wicket.mjs', 'lib/round128-aid-donation.mjs'],
      };
      for (const [script, libs] of Object.entries(scriptCopies)) {
        cpSync(resolve(root, 'scripts', script), join(workspace, 'scripts', script));
        for (const lib of libs) cpSync(resolve(root, 'scripts', lib), join(workspace, 'scripts', lib));
      }
      for (const name of [
        'data/base/quests/round-07-quests.json',
        'data/base/quests/round-74-cloud-ridge-quests.json',
        'data/base/dialogues/round-03-conversations.json',
        'data/base/dialogues/round-30-conversations.json',
        'data/base/dialogues/round-62-conversations.json',
        'data/base/dialogues/round-67-conversations.json',
        'data/base/dialogues/round-74-cloud-ridge-conversations.json',
        'data/base/knowledge_graph/nodes.json',
        'data/base/knowledge_graph/edges.json',
        'data/base/shops/round-06-shops.json',
        'data/base/maps/round-01-grid.json',
        'data/schema/quest-set.schema.json',
      ]) {
        cpSync(resolve(root, name), join(workspace, name));
      }
      const assertTargetsSurvive = (label: string) => {
        const questDoc = JSON.parse(readFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), 'utf8'));
        for (const questId of [MEDICINE, TEASTALL]) {
          const quest = questDoc.quests.find((entry: { id: string }) => entry.id === questId);
          expect(quest?.orderedObjectives, `${label} ${questId}`).toBe(true);
          expect(quest.objectives.at(-1).kind, `${label} ${questId}`).toBe('discoverKnowledge');
        }
        expect(readFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), 'utf8')).not.toContain('按I打开背包');
        const dialogueDoc = JSON.parse(readFileSync(join(workspace, 'data/base/dialogues/round-03-conversations.json'), 'utf8'));
        for (const spec of DELIVERY_DIALOGUES) {
          const conversation = dialogueDoc.conversations.find((entry: { id: string }) => entry.id === spec.conversationId);
          const greet = conversation.nodes.find((node: { id: string }) => node.id === conversation.startNodeId);
          expect(greet.options.some((option: { text: string }) => option.text === spec.readyOption.text), `${label} ${spec.conversationId}`).toBe(true);
          expect(conversation.nodes.some((node: { id: string }) => node.id === spec.deliveredNode.id), `${label} ${spec.conversationId}`).toBe(true);
        }
        const nodesDoc = JSON.parse(readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8'));
        for (const node of DELIVERY_NODES) {
          expect(nodesDoc.nodes.some((entry: { id: string }) => entry.id === node.id), `${label} ${node.id}`).toBe(true);
        }
      };
      for (const script of Object.keys(scriptCopies)) {
        expect(() => execFileSync(process.execPath, [join(workspace, 'scripts', script)], { cwd: tmpdir(), encoding: 'utf8' }), script).not.toThrow();
        assertTargetsSurvive(script);
      }
    } finally {
      safeRemove(workspace);
    }
  });
});
