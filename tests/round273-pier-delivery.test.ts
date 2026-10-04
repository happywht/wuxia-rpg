/**
 * Round 273 — 先修栈桥显式交料/两日工期与通用 advanceTime 对白效果回归
 * （真实资料 + 真实引擎；合成引擎信号烟测，非真实玩家 QA）。
 *
 * 覆盖：advanceTime 解析/预检/边界与无时钟拒绝；时间在效果事务内提交——
 * 任一效果（如扣料不足）拒绝则时钟零改动；备料（含乱序购买）不结案、
 * 前瞻填充不回退；按F确认动工原子扣熟铁砂×3、韧皮×2 并推进两日（2880分）
 * 一次性结案复用 r31-pier-reinforced；取消路径零变更；重复动工不可再扣/
 * 再奖/再耗时；普通交谈不代交付；导航备料→卖家、备齐→白鹭洲 talk；旧 v1
 * 已完成不追补、进行中可补交；存档往返保留 elapsed 与结案事实；作者修复
 * pristine 重建/幂等/漂移拒绝/沙盒重放；场景最小接线源码断言。
 */
import { execFileSync } from 'node:child_process';
import { repairDialoguesRaw as applyFerryChoice } from '../scripts/lib/round274-ferry-choice.mjs';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet, type DialogueData, type DialogueOptionData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import {
  formatDialogueAdvanceMinutes, MAX_DIALOGUE_ADVANCE_MINUTES,
  preflightDialogueTime, StagedDialogueClock, type DialogueClockPort,
} from '../src/engine/dialogue-time-request';
import {
  acceptQuest, applyQuestSignal, createQuestJournal, parseQuestSet,
  reconcileQuestFacts, type QuestData,
} from '../src/engine/quest-system';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { parseKnowledgeEdgeSet, parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { createCharacterState, parseCharacterProfileSet } from '../src/engine/character-progression';
import { countItem, createInventoryState, indexItems, parseItemSet } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { GameClock, type GameCalendarData } from '../src/engine/game-calendar';
import { captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState } from '../src/engine/save-system';
import {
  PIER_CONSTRUCTION_MINUTES, PIER_DELIVERY_DIALOGUE, PIER_DELIVERY_OBJECTIVE,
  PIER_QUEST_ID, PIER_REINFORCED_EVENT_ID, R273_PIER_DELIVERY_EXPECTATION,
  repairDialoguesRaw, repairDialogueSchemaRaw, repairKnowledgeGraph, repairQuestsRaw,
} from '../scripts/lib/round273-pier-delivery.mjs';

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
const dialogueParse = parseDialogueSet(read('data/base/dialogues/round-30-conversations.json'));
if (!dialogueParse.ok) throw new Error(dialogueParse.errors.join());
const dialogues = new Map<string, DialogueData>(
  dialogueParse.set.conversations.map((conversation) => [conversation.id, conversation]),
);
const npcIds = new Set((read('data/base/characters/round-03-npcs.json') as { npcs: { id: string }[] }).npcs.map((npc) => npc.id));

const PIER = PIER_QUEST_ID;
const GUARD = 'quest.r31-guard-the-caravan';
const TOLL = 'quest.r31-pier-toll-clearing';
const EVENT = PIER_REINFORCED_EVENT_ID;
const SPECS = PIER_DELIVERY_DIALOGUE;

/** Simple in-memory clock port (engine-generic; GameClock satisfies it too). */
function fakeClock(start = 0): DialogueClockPort & { minutes: number } {
  return {
    minutes: start,
    get elapsedMinutes() { return this.minutes; },
    advance(minutes: number) {
      if (!Number.isSafeInteger(minutes) || minutes <= 0) return false;
      this.minutes += minutes;
      return true;
    },
  };
}
const clockOf = (
  journal: ReturnType<typeof createQuestJournal>,
  minutes = 0,
  stock: { ironSand?: number; toughLeather?: number } = {},
) => {
  const clock = fakeClock(minutes);
  const context: DialogueRuntimeContext = {
    quests, journal, items,
    inventory: createInventoryState(profile, [
      { itemId: 'item.iron-sand', quantity: stock.ironSand ?? 4 },
      { itemId: 'item.tough-leather', quantity: stock.toughLeather ?? 3 },
    ]),
    social: createSocialState(), speakerNpcId: 'char.bai-luzhou',
    knownKnowledgeNodeIds: new Set(), knowledgeNodes, knowledgeEdges,
    character: createCharacterState(profile), factions: new Map(), martialArts: new Map(),
    factionState: createFactionMembershipState(), timeOfDayPeriodId: 'period.morning',
    clock,
  };
  return { context, clock };
};
/** 前置链完成到分支可选：provisioning 完结、修桥转为 offered。 */
const offerPier = (journal: ReturnType<typeof createQuestJournal>) => {
  const pier = quests.get(PIER)!;
  for (const prerequisiteId of pier.prerequisiteQuestIds) {
    journal.states.get(prerequisiteId)!.status = 'completed';
  }
  journal.states.get(PIER)!.status = 'offered';
  journal.states.get(GUARD)!.status = 'offered'; // 互斥兄弟同板可选，接取时确定性失败
};
const acceptPier = (journal: ReturnType<typeof createQuestJournal>) => {
  offerPier(journal);
  const result = acceptQuest(quests, journal, PIER, new Map(), {
    knownKnowledgeNodeIds: new Set<string>(),
  });
  expect(result.ok).toBe(true);
  expect(result.update.failedQuestIds).toEqual([GUARD]);
  return result;
};
const greetOf = (dialogueId: string) => {
  const conversation = dialogues.get(dialogueId)!;
  return conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
};
const optionBy = (context: DialogueRuntimeContext, nodeId: string, text: string): DialogueOptionData | undefined => {
  const conversation = dialogues.get(SPECS.conversationId)!;
  const node = conversation.nodes.find((entry) => entry.id === nodeId)!;
  return getVisibleOptions(node, context).find((option) => option.option.text === text)?.option;
};

describe('Round273 通用 advanceTime 效果协议（合成引擎烟测）', () => {
  const baseDialogue = {
    conversations: [{
      id: 'dlg.test-time', startNodeId: 'greet',
      nodes: [
        { id: 'greet', text: '测试', options: [{ text: '等待', nextNodeId: 'greet' }] },
      ],
    }],
  };
  const withEffect = (minutes: unknown, extra: Record<string, unknown> = {}): unknown => {
    const doc = structuredClone(baseDialogue) as { conversations: { nodes: { options: { effects?: unknown[] }[] }[] }[] };
    doc.conversations[0]!.nodes[0]!.options[0]!.effects = [{ kind: 'advanceTime', minutes, ...extra }];
    return doc;
  };
  it('解析接受正整数分钟；非法分钟/多余键隔离无效对白，不废整集', () => {
    const valid = parseDialogueSet(withEffect(2880));
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      const node = valid.set.conversations[0]!.nodes[0]!;
      expect(node.options?.[0]!.effects).toEqual([{ kind: 'advanceTime', minutes: 2880 }]);
    }
    for (const bad of [0, -5, 1.5, MAX_DIALOGUE_ADVANCE_MINUTES + 1, '60']) {
      const parsed = parseDialogueSet(withEffect(bad));
      expect(parsed.ok, String(bad)).toBe(true); // 防御解析隔离坏选项，不废整集
      if (parsed.ok) {
        expect(parsed.set.conversations, String(bad)).toEqual([]);
      }
    }
    const extra = parseDialogueSet(withEffect(60, { reason: 'x' }));
    if (extra.ok) {
      expect(extra.set.conversations).toEqual([]);
    }
  });
  it('预检拒绝无时钟与非法分钟；机械标签按整天折叠', () => {
    expect(preflightDialogueTime({ minutes: 60 }, undefined).ok).toBe(false);
    const refused = preflightDialogueTime({ minutes: 0 }, fakeClock());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain('正的整数');
    expect(formatDialogueAdvanceMinutes(2880)).toBe('世界时间 +2 日');
    expect(formatDialogueAdvanceMinutes(45)).toBe('世界时间 +45 分钟');
  });
  it('时间在事务内提交：拒绝任一效果则时钟零改动', () => {
    const journal = createQuestJournal(quests);
    const { context, clock } = clockOf(journal);
    // 第二个 takeItem 超出持有（韧皮只有 3，扣 9）→ 整笔拒绝，时钟不动。
    const refusal = applyDialogueEffects([
      { kind: 'advanceTime', minutes: PIER_CONSTRUCTION_MINUTES },
      { kind: 'takeItem', itemId: 'item.tough-leather', quantity: 9 },
    ], context);
    expect(refusal.ok).toBe(false);
    expect(clock.minutes).toBe(0);
    expect(countItem(context.inventory!, 'item.tough-leather')).toBe(3);
    // 无时钟的旧式上下文：advanceTime 拒绝且给出可读理由。
    const legacy = clockOf(journal);
    (legacy.context as { clock?: DialogueClockPort }).clock = undefined;
    const noClock = applyDialogueEffects([{ kind: 'advanceTime', minutes: 60 }], legacy.context);
    expect(noClock.ok).toBe(false);
    if (!noClock.ok) expect(noClock.reason).toContain('世界时钟');
    expect(legacy.clock.minutes).toBe(0);
  });
  it('成功事务推进时钟并在汇总中报告；同笔多次推进求和', () => {
    const journal = createQuestJournal(quests);
    const { context, clock } = clockOf(journal);
    const result = applyDialogueEffects([
      { kind: 'takeItem', itemId: 'item.iron-sand', quantity: 1 },
      { kind: 'advanceTime', minutes: 1440 },
      { kind: 'advanceTime', minutes: 1440 },
    ], context);
    expect(result.ok).toBe(true);
    expect(clock.minutes).toBe(PIER_CONSTRUCTION_MINUTES);
    expect(result.ok && result.summary.timeAdvancedMinutes).toBe(PIER_CONSTRUCTION_MINUTES);
    expect(result.ok && result.summary.lines).toContain('世界时间 +1 日');
  });
  it('StagedDialogueClock 只在提交时写回目标时钟', () => {
    const target = fakeClock(100);
    const staged = new StagedDialogueClock(target.elapsedMinutes);
    expect(staged.advance(50)).toBe(true);
    expect(target.minutes).toBe(100);
    expect(staged.commitTo(target)).toBe(true);
    expect(target.minutes).toBe(150);
    expect(new StagedDialogueClock(150).commitTo(target)).toBe(false); // 无增量
  });
  it('真实 GameClock 满足时钟端口：两日推进跨日且时刻可派生', () => {
    const calendar = read('data/base/worldview/calendar.json') as GameCalendarData;
    const clock = new GameClock(calendar, 0);
    const before = clock.snapshot();
    expect(clock.advance(PIER_CONSTRUCTION_MINUTES)).toBe(true);
    const after = clock.snapshot();
    expect(after.day - before.day + (after.monthIndex - before.monthIndex) * calendar.months.length)
      .toBeGreaterThanOrEqual(2);
    const port: DialogueClockPort = clock; // structural compatibility
    expect(port.elapsedMinutes).toBe(PIER_CONSTRUCTION_MINUTES);
  });
});

describe('Round273 修桥显式交料与两日工期（真实资料+真实引擎）', () => {
  it('数据形状：有序三段备料→交付，奖励/互斥/后续原样保留', () => {
    const quest = quests.get(PIER)!;
    expect(quest.orderedObjectives).toBe(true);
    expect(quest.objectives.map((objective) => objective.kind)).toEqual(['collectItem', 'collectItem', 'discoverKnowledge']);
    expect(quest.objectives[2]).toMatchObject({
      targetId: EVENT, navigationNpcId: 'char.bai-luzhou',
    });
    expect(quest.rewards).toEqual({ experience: 35, currency: 38, discoverKnowledgeNodeIds: [EVENT] });
    expect(quest.exclusiveGroupId).toBe(quests.get(GUARD)!.exclusiveGroupId);
    expect(quests.get(TOLL)!.prerequisiteQuestIds).toEqual([PIER]);
    expect(knowledgeNodes.get(EVENT)!.summary).toContain('两日工期');
  });

  it('只备料（含乱序购买）不结案；前瞻填充让两种顺序都计数', () => {
    const journal = createQuestJournal(quests);
    acceptPier(journal);
    // 先韧皮后铁砂：铁砂在前台阶段，韧皮前瞻填充。
    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.tough-leather', quantity: 2 });
    expect([...journal.states.get(PIER)!.objectiveCounts.values()]).toEqual([0, 2, 0]);
    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.iron-sand', quantity: 3 });
    expect(journal.states.get(PIER)!.status).toBe('active');
    expect([...journal.states.get(PIER)!.objectiveCounts.values()]).toEqual([3, 2, 0]);
    // 接取时已持有全套也只推进备料。
    const stocked = createQuestJournal(quests);
    offerPier(stocked);
    const stockedResult = acceptQuest(quests, stocked, PIER, new Map([
      ['item.iron-sand', 3], ['item.tough-leather', 2],
    ]), { knownKnowledgeNodeIds: new Set<string>() });
    expect(stockedResult.ok).toBe(true);
    expect(stockedResult.update.completed).toEqual([]);
    expect(stocked.states.get(PIER)!.status).toBe('active');
    // 普通交谈信号不代交付。
    expect(applyQuestSignal(quests, stocked, { type: 'npc-talk', npcId: 'char.bai-luzhou' }).completed).toEqual([]);
    expect(stocked.states.get(PIER)!.status).toBe('active');
  });

  it('按F确认动工：原子扣料恰好3/2、两日在事务内推进、一次性结案复用加固见闻', () => {
    const journal = createQuestJournal(quests);
    acceptPier(journal);
    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.iron-sand', quantity: 3 });
    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.tough-leather', quantity: 2 });
    const { context, clock } = clockOf(journal);
    // greet 可见“备齐动工”入口；确认节点开启二次确认并给出取消项。
    const ready = optionBy(context, greetOf(SPECS.conversationId).id, SPECS.readyOption.text);
    expect(ready).toBeDefined();
    expect(ready!.effects).toBeUndefined();
    const confirmNode = dialogues.get(SPECS.conversationId)!.nodes.find((node) => node.id === SPECS.confirmNode.id)!;
    expect(confirmNode.confirmEffects).toBe(true);
    const cancel = confirmNode.options!.find((option) => option.nextNodeId === 'greet')!;
    expect(cancel.effects).toBeUndefined();
    const commit = confirmNode.options!.find((option) => option.nextNodeId === SPECS.deliveredNode.id)!;
    const result = applyDialogueEffects(commit.effects!, context);
    expect(result.ok).toBe(true);
    // 恰好扣 3/2，多余自留。
    expect(countItem(context.inventory!, 'item.iron-sand')).toBe(1);
    expect(countItem(context.inventory!, 'item.tough-leather')).toBe(1);
    // 两日工期在事务内推进。
    expect(clock.minutes).toBe(PIER_CONSTRUCTION_MINUTES);
    expect(result.ok && result.summary.timeAdvancedMinutes).toBe(PIER_CONSTRUCTION_MINUTES);
    // 一次性结案、原奖励、加固见闻持久、备料计数不因扣料回退。
    const state = journal.states.get(PIER)!;
    expect(state.status).toBe('completed');
    expect(result.ok && result.summary.questUpdate.completed).toEqual([
      { questId: PIER, experience: 35, currency: 38, discoverKnowledgeNodeIds: [EVENT] },
    ]);
    expect(context.knownKnowledgeNodeIds.has(EVENT)).toBe(true);
    expect([...state.objectiveCounts.values()]).toEqual([3, 2, 1]);
    expect(journal.states.get(TOLL)!.status).toBe('offered');
    // 重复：入口与确认均不可再见；重复发现不重发；再扣料被拒。
    expect(optionBy(context, greetOf(SPECS.conversationId).id, SPECS.readyOption.text)).toBeUndefined();
    expect(optionBy(context, greetOf(SPECS.conversationId).id, SPECS.progressOption.text)).toBeUndefined();
    expect(optionBy(context, greetOf(SPECS.conversationId).id, '栈桥已加固，我来核对桥头是否通渡。')).toBeDefined();
    expect(applyQuestSignal(quests, journal, { type: 'knowledge-discovery', nodeId: EVENT }).completed).toEqual([]);
    const replay = applyDialogueEffects(commit.effects!, context);
    expect(replay.ok).toBe(false);
    expect(clock.minutes).toBe(PIER_CONSTRUCTION_MINUTES);
  });

  it('料不足：入口不可见，直接提交整笔拒绝（时钟/库存/任务零改动）', () => {
    const journal = createQuestJournal(quests);
    acceptPier(journal);
    const { context, clock } = clockOf(journal, 0, { ironSand: 2, toughLeather: 2 });
    expect(optionBy(context, greetOf(SPECS.conversationId).id, SPECS.readyOption.text)).toBeUndefined();
    const confirmNode = dialogues.get(SPECS.conversationId)!.nodes.find((node) => node.id === SPECS.confirmNode.id)!;
    const commit = confirmNode.options!.find((option) => option.nextNodeId === SPECS.deliveredNode.id)!;
    const refusal = applyDialogueEffects(commit.effects!, context);
    expect(refusal.ok).toBe(false);
    expect(clock.minutes).toBe(0);
    expect(countItem(context.inventory!, 'item.iron-sand')).toBe(2);
    expect(journal.states.get(PIER)!.status).toBe('active');
    expect(context.knownKnowledgeNodeIds.has(EVENT)).toBe(false);
  });

  it('导航：备料期指卖家，备齐后指回白鹭洲并给按F交谈提示', () => {
    const placed = [
      { record: { id: 'char.bai-luzhou', name: '白鹭洲', mapResourceId: 'map.round-10-mist-ferry' }, col: 18, row: 9 },
      { record: { id: 'char.jiang-baiwei', name: '姜百味', mapResourceId: 'map.round-10-mist-ferry' }, col: 45, row: 39 },
    ] as never;
    const journalWith = (counts: number[]) => ({
      trackedQuestId: PIER,
      states: new Map([...quests.values()].map((quest) => [quest.id, {
        questId: quest.id,
        status: quest.id === PIER ? 'active' as const : 'locked' as const,
        objectiveCounts: new Map(quest.objectives.map((objective, index) => [objective.id, counts[index] ?? 0])),
      }])),
    });
    const navigate = (counts: number[]) => resolveQuestNavigationTarget({
      quests, journal: journalWith(counts), questId: PIER,
      worldMap: { events: [], landmarks: [] } as never,
      baseNpcs: placed, periodNpcs: placed, encounters: [],
      shops: new Map([
        ['shop.jiang-stall', {
          record: { id: 'shop.jiang-stall', npcId: 'char.jiang-baiwei', name: '姜百味百宝担' },
          stock: [{ itemId: 'item.iron-sand', quantity: -1 }, { itemId: 'item.tough-leather', quantity: -1 }],
        } as never],
      ]),
    });
    const shopping = navigate([0, 0, 0]);
    expect(shopping.status).toBe('target');
    if (shopping.status === 'target') {
      expect(shopping.target.kind).toBe('collectItem');
      expect(shopping.target.name).toBe('姜百味百宝担');
    }
    const delivering = navigate([3, 2, 0]);
    expect(delivering.status).toBe('target');
    if (delivering.status === 'target') {
      expect(delivering.target.objectiveId).toBe(R273_PIER_DELIVERY_EXPECTATION.deliveryObjectiveId);
      expect(delivering.target.name).toBe('白鹭洲');
      expect(delivering.target.arrivalAction).toBe('talk');
    }
  });

  it('reconcile 修复乱序备料缺口，交付目标不被提前点亮', () => {
    const journal = createQuestJournal(quests);
    acceptPier(journal);
    const state = journal.states.get(PIER)!;
    state.objectiveCounts.set(questParse.set.quests.find((q) => q.id === PIER)!.objectives[0]!.id, 3);
    reconcileQuestFacts(quests, journal, {
      itemCounts: new Map([['item.iron-sand', 3], ['item.tough-leather', 2]]),
    });
    expect([...state.objectiveCounts.values()]).toEqual([3, 2, 0]);
    expect(state.status).toBe('active');
  });
});

describe('Round273 旧档兼容与存档往返', () => {
  const restore = (snapshot: unknown) => {
    const parsed = parseSaveSnapshot(snapshot);
    if (!parsed.ok) throw new Error(parsed.message);
    const plan = planSnapshotRestore(parsed.snapshot, {
      profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
      mapResourceId: 'map.round-10-mist-ferry', isWalkableCell: () => true, isCellOccupied: () => false,
      itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(),
      questIds: new Set(quests.keys()),
      questObjectiveIds: new Map([...quests].map(([id, quest]) => [id, new Set(quest.objectives.map((objective) => objective.id))])),
      questRecords: quests, encounterIds: new Set(), shopIds: new Set(), npcIds,
      knowledgeNodeIds: new Set(knowledgeNodes.keys()),
    });
    if (!plan.ok) throw new Error(plan.errors.join('\n'));
    return restoreRunState({ snapshot: plan.snapshot, profile, items, quests, shops: new Map() });
  };
  const v1Snapshot = (status: 'active' | 'completed') => {
    const { context } = clockOf(createQuestJournal(quests));
    acceptPier(context.journal);
    context.journal.states.get(PIER)!.status = status;
    const snapshot = captureSaveSnapshot({
      displayName: 'v1', mapResourceId: 'map.round-10-mist-ferry', playerCol: 18, playerRow: 10,
      character: context.character!, inventory: context.inventory!, journal: context.journal,
      social: context.social, shopStocks: new Map(), completedEncounters: new Set(),
      completedRegionalEvents: new Set(), knownKnowledgeNodeIds: context.knownKnowledgeNodeIds,
      elapsedGameMinutes: 30, worldSeed: 273,
    });
    const raw = JSON.parse(JSON.stringify(snapshot)) as {
      quests: { states: { questId: string; objectiveCounts: { id: string; value: number }[] }[] };
    };
    const state = raw.quests.states.find((entry) => entry.questId === PIER)!;
    state.objectiveCounts = state.objectiveCounts
      .filter((entry) => entry.id !== PIER_DELIVERY_OBJECTIVE.id)
      .map((entry) => ({ id: entry.id, value: entry.id === 'objective.r31-pier-ironsand' ? 3 : 2 }));
    return JSON.parse(JSON.stringify(raw));
  };
  const contextFrom = (restored: ReturnType<typeof restore>, minutes: number): DialogueRuntimeContext => ({
    quests, journal: restored.journal, items, inventory: restored.inventory,
    social: restored.social, speakerNpcId: 'char.bai-luzhou',
    knownKnowledgeNodeIds: new Set(restored.knownKnowledgeNodeIds ?? []),
    knowledgeNodes, knowledgeEdges, character: restored.character,
    factions: new Map(), martialArts: new Map(),
    factionState: createFactionMembershipState(restored.factionMembership),
    timeOfDayPeriodId: 'period.morning', clock: fakeClock(minutes),
  });

  it('v1 已完成档保持 completed：不追补见闻、不可再交付、不再耗时', () => {
    const restored = restore(v1Snapshot('completed'));
    expect(restored.journal.states.get(PIER)!.status).toBe('completed');
    const context = contextFrom(restored, 0);
    expect(context.knownKnowledgeNodeIds.has(EVENT)).toBe(false);
    expect(optionBy(context, greetOf(SPECS.conversationId).id, SPECS.readyOption.text)).toBeUndefined();
    expect(applyQuestSignal(quests, context.journal, { type: 'knowledge-discovery', nodeId: EVENT }).completed).toEqual([]);
    expect(context.clock!.elapsedMinutes).toBe(0);
    expect(countItem(restored.inventory, 'item.iron-sand')).toBe(4);
  });

  it('v1 进行中档加载后可补交；存档往返保留结案/见闻/时钟分钟', () => {
    const restored = restore(v1Snapshot('active'));
    expect(restored.journal.states.get(PIER)!.status).toBe('active');
    expect([...restored.journal.states.get(PIER)!.objectiveCounts.values()]).toEqual([3, 2, 0]);
    const context = contextFrom(restored, 45);
    const confirmNode = dialogues.get(SPECS.conversationId)!.nodes.find((node) => node.id === SPECS.confirmNode.id)!;
    const commit = confirmNode.options!.find((option) => option.nextNodeId === SPECS.deliveredNode.id)!;
    const result = applyDialogueEffects(commit.effects!, context);
    expect(result.ok).toBe(true);
    expect(context.clock!.elapsedMinutes).toBe(45 + PIER_CONSTRUCTION_MINUTES);
    expect(context.journal.states.get(PIER)!.status).toBe('completed');

    const saved = captureSaveSnapshot({
      displayName: '工期后', mapResourceId: 'map.round-10-mist-ferry', playerCol: 18, playerRow: 10,
      character: context.character!, inventory: context.inventory!, journal: context.journal,
      social: context.social, shopStocks: new Map(), completedEncounters: new Set(),
      completedRegionalEvents: new Set(), knownKnowledgeNodeIds: context.knownKnowledgeNodeIds,
      elapsedGameMinutes: context.clock!.elapsedMinutes, worldSeed: 273,
    });
    const raw = JSON.parse(JSON.stringify(saved)) as { elapsedGameMinutes: number };
    expect(raw.elapsedGameMinutes).toBe(45 + PIER_CONSTRUCTION_MINUTES);
    const roundtrip = restore(JSON.parse(JSON.stringify(saved)));
    expect(roundtrip.journal.states.get(PIER)!.status).toBe('completed');
    expect(roundtrip.journal.states.get(PIER)!.objectiveCounts.get(PIER_DELIVERY_OBJECTIVE.id)).toBe(1);
    expect(roundtrip.knownKnowledgeNodeIds).toContain(EVENT);
    expect(countItem(roundtrip.inventory, 'item.iron-sand')).toBe(1);
    expect(countItem(roundtrip.inventory, 'item.tough-leather')).toBe(1);
    expect(getRelationship(roundtrip.social, 'char.bai-luzhou')).toBe(0); // 交付不加关系（成本型差事）
  });
});

describe('Round273 场景最小接线与作者源', () => {
  const safeRemove = (workspace: string) => {
    if (!workspace.startsWith(resolve(tmpdir()) + sep)) throw new Error('bad temp');
    rmSync(workspace, { recursive: true, force: true });
  };
  it('grid-scene 以真实时钟参与事务并复用统一刷新例程（源码断言）', () => {
    const source = readRaw('src/game/grid-scene.ts');
    expect(source).toContain('clock: this.clock ?? undefined');
    expect(source).toContain('private refreshAfterClockChange()');
    expect(source).toContain('result.summary.timeAdvancedMinutes');
    // 传送耗时仍是既有延迟路径；advanceTime 不复用传送（无传送同地变通）。
    expect(readRaw('src/engine/dialogue-runtime.ts')).not.toContain('teleportRequest.mapResourceId === \'\'');
  });

  it('作者修复可从 pristine 重建当前字节并幂等，漂移拒绝', () => {
    // 任务：反向构造 pristine。
    const questDoc = JSON.parse(readRaw('data/base/quests/round-07-quests.json'));
    const pier = questDoc.quests.find((quest: { id: string }) => quest.id === PIER);
    pier.objectives.pop();
    delete pier.orderedObjectives;
    pier.description = '白鹭洲不赞成硬闯：旧栈桥的桩脚早就酥了，重载药队一上去便是塌。他要用熟铁砂补桩、韧皮捆扎，先把桥修牢，药队宁可等两日走旱桥。备齐三份熟铁砂与两捆韧皮料，工钱他出。';
    const pristineQuests = JSON.stringify(questDoc, null, 2).replace(/\n/g, '\r\n');
    expect(JSON.parse(repairQuestsRaw(pristineQuests))).toEqual(JSON.parse(readRaw('data/base/quests/round-07-quests.json')));
    expect(repairQuestsRaw(readRaw('data/base/quests/round-07-quests.json'))).toBe(readRaw('data/base/quests/round-07-quests.json'));
    const drifted = JSON.parse(readRaw('data/base/quests/round-07-quests.json'));
    drifted.quests.find((quest: { id: string }) => quest.id === PIER).objectives[2].text = '被篡改';
    expect(() => repairQuestsRaw(JSON.stringify(drifted, null, 2).replace(/\n/g, '\r\n'))).toThrow('请人工复核');
    // 对白：反向构造 pristine（去 R273 选项/节点）。
    const dialogueDoc = JSON.parse(execFileSync('git', ['show', 'baa5ebe:data/base/dialogues/round-30-conversations.json'], { encoding: 'utf8' }));
    const conversation = dialogueDoc.conversations.find((entry: { id: string }) => entry.id === SPECS.conversationId);
    const greet = conversation.nodes.find((node: { id: string }) => node.id === conversation.startNodeId);
    greet.options = greet.options.filter((option: { text: string }) =>
      ![SPECS.readyOption.text, SPECS.progressOption.text].includes(option.text));
    conversation.nodes = conversation.nodes.filter((node: { id: string }) =>
      ![SPECS.confirmNode.id, SPECS.progressNode.id, SPECS.deliveredNode.id].includes(node.id));
    const pristineDialogues = JSON.stringify(dialogueDoc, null, 2);
    expect(JSON.parse(applyFerryChoice(repairDialoguesRaw(pristineDialogues)))).toEqual(JSON.parse(readRaw('data/base/dialogues/round-30-conversations.json')));
    expect(repairDialoguesRaw(readRaw('data/base/dialogues/round-30-conversations.json'))).toBe(readRaw('data/base/dialogues/round-30-conversations.json'));
    // Schema：幂等 + 锚点漂移拒绝。
    const schemaRaw = readRaw('data/schema/dialogue-set.schema.json');
    expect(repairDialogueSchemaRaw(schemaRaw)).toBe(schemaRaw);
    const schemaDrift = schemaRaw.replace('"const":"teleport"', '"const":"teleported"');
    expect(() => repairDialogueSchemaRaw(schemaDrift)).toThrow('请人工复核');
    // 图谱：幂等 + 摘要漂移拒绝。
    const nodesDoc = JSON.parse(readRaw('data/base/knowledge_graph/nodes.json'));
    const edgesDoc = JSON.parse(readRaw('data/base/knowledge_graph/edges.json'));
    expect(repairKnowledgeGraph(nodesDoc, edgesDoc).changed).toBe(false);
    nodesDoc.nodes.find((node: { id: string }) => node.id === EVENT).summary = '被篡改的摘要';
    expect(() => repairKnowledgeGraph(nodesDoc, edgesDoc)).toThrow('请人工复核');
  });

  it('apply-round273 CLI 沙盒：预检通过才写、二次运行零差异、篡改拒绝不落盘；legacy 作者重放不撤回', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r273-cli-'));
    try {
      mkdirSync(join(workspace, 'scripts/lib'), { recursive: true });
      for (const dir of ['data/base/quests', 'data/base/dialogues', 'data/base/knowledge_graph', 'data/schema']) {
        mkdirSync(join(workspace, dir), { recursive: true });
      }
      for (const file of [
        'apply-round273.mjs', 'lib/round273-pier-delivery.mjs',
        'apply-round271.mjs', 'lib/round271-journey-delivery.mjs',
      ]) cpSync(resolve(root, 'scripts', file), join(workspace, 'scripts', file));
      // R271 作者在 round-03 对白与 quests 上幂等，直接带入当前文件供重放。
      cpSync(resolve(root, 'data/base/dialogues/round-03-conversations.json'), join(workspace, 'data/base/dialogues/round-03-conversations.json'));
      // pristine：反向去掉 R273 交付（保留 R271）。
      const questDoc = JSON.parse(readRaw('data/base/quests/round-07-quests.json'));
      const pier = questDoc.quests.find((quest: { id: string }) => quest.id === PIER);
      pier.objectives.pop();
      delete pier.orderedObjectives;
      pier.description = '白鹭洲不赞成硬闯：旧栈桥的桩脚早就酥了，重载药队一上去便是塌。他要用熟铁砂补桩、韧皮捆扎，先把桥修牢，药队宁可等两日走旱桥。备齐三份熟铁砂与两捆韧皮料，工钱他出。';
      writeFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), JSON.stringify(questDoc, null, 2).replace(/\n/g, '\r\n'));
      const dialogueDoc = JSON.parse(execFileSync('git', ['show', 'baa5ebe:data/base/dialogues/round-30-conversations.json'], { encoding: 'utf8' }));
      const conversation = dialogueDoc.conversations.find((entry: { id: string }) => entry.id === SPECS.conversationId);
      const greet = conversation.nodes.find((node: { id: string }) => node.id === conversation.startNodeId);
      greet.options = greet.options.filter((option: { text: string }) =>
        ![SPECS.readyOption.text, SPECS.progressOption.text].includes(option.text));
      conversation.nodes = conversation.nodes.filter((node: { id: string }) =>
        ![SPECS.confirmNode.id, SPECS.progressNode.id, SPECS.deliveredNode.id].includes(node.id));
      writeFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), JSON.stringify(dialogueDoc, null, 2));
      const schemaRaw = readRaw('data/schema/dialogue-set.schema.json');
      // pristine：去掉 advanceTime 那一行（作者库插入的紧凑条目）。
      const pristineSchema = schemaRaw
        .split('\n')
        .filter((line) => !line.includes('"const":"advanceTime"'))
        .join('\n');
      writeFileSync(join(workspace, 'data/schema/dialogue-set.schema.json'), pristineSchema);
      cpSync(resolve(root, 'data/base/knowledge_graph/nodes.json'), join(workspace, 'data/base/knowledge_graph/nodes.json'));
      cpSync(resolve(root, 'data/base/knowledge_graph/edges.json'), join(workspace, 'data/base/knowledge_graph/edges.json'));
      const run = (script: string) => execFileSync(process.execPath, [join(workspace, 'scripts', script)], { cwd: tmpdir(), encoding: 'utf8' });
      expect(() => run('apply-round273.mjs')).not.toThrow();
      cpSync(resolve(root, 'scripts/apply-round274.mjs'), join(workspace, 'scripts/apply-round274.mjs'));
      cpSync(resolve(root, 'scripts/lib/round274-ferry-choice.mjs'), join(workspace, 'scripts/lib/round274-ferry-choice.mjs'));
      mkdirSync(join(workspace, 'data/base/battles'), { recursive: true });
      cpSync(resolve(root, 'data/base/battles/round-05-encounters.json'), join(workspace, 'data/base/battles/round-05-encounters.json'));
      expect(() => run('apply-round274.mjs')).not.toThrow();
      for (const name of ['round-07-quests.json']) {
        expect(JSON.parse(readFileSync(join(workspace, 'data/base/quests', name), 'utf8')))
          .toEqual(JSON.parse(readRaw('data/base/quests/' + name)));
      }
      expect(JSON.parse(readFileSync(join(workspace, 'data/base/dialogues/round-30-conversations.json'), 'utf8')))
        .toEqual(JSON.parse(readRaw('data/base/dialogues/round-30-conversations.json')));
      const saved = [
        readFileSync(join(workspace, 'data/schema/dialogue-set.schema.json'), 'utf8'),
        readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8'),
      ];
      run('apply-round273.mjs');
      expect([
        readFileSync(join(workspace, 'data/schema/dialogue-set.schema.json'), 'utf8'),
        readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8'),
      ]).toEqual(saved);
      // 篡改受管节点后拒绝且不落盘。
      const tamperedPath = join(workspace, 'data/base/dialogues/round-30-conversations.json');
      const before = readFileSync(tamperedPath, 'utf8');
      const doc = JSON.parse(before);
      doc.conversations.find((entry: { id: string }) => entry.id === SPECS.conversationId)
        .nodes = doc.conversations.find((entry: { id: string }) => entry.id === SPECS.conversationId)
        .nodes.filter((node: { id: string }) => node.id !== SPECS.deliveredNode.id);
      writeFileSync(tamperedPath, JSON.stringify(doc));
      expect(() => run('apply-round273.mjs')).toThrow();
      expect(readFileSync(tamperedPath, 'utf8')).toBe(JSON.stringify(doc));
      // legacy R271 作者在含 R273 的数据上重放：幂等且不撤回修桥交付。
      expect(() => run('apply-round271.mjs')).not.toThrow();
      const questCheck = JSON.parse(readFileSync(join(workspace, 'data/base/quests/round-07-quests.json'), 'utf8'));
      const pierCheck = questCheck.quests.find((quest: { id: string }) => quest.id === PIER);
      expect(pierCheck.orderedObjectives).toBe(true);
      expect(pierCheck.objectives.at(-1).id).toBe(PIER_DELIVERY_OBJECTIVE.id);
    } finally {
      safeRemove(workspace);
    }
  });
});
