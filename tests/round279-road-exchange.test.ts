/**
 * Round 279 — 上山中途资源取舍与云岭岔路回归。
 *
 * 真实铁嶂/云岭地图、世界图、对白资料 + 真实引擎：通用对话条件/效果事务
 * （takeItem+giveItem+advanceTime+setVariable 原子、确认页默认取消）、两种
 * 支付互斥一次、不足/满包/时间异常/变量失败零变动、存读持久无重奖；实际
 * 路线邻接与岔口 E 协议逐一实证；作者源幂等/漂移拒绝/CLI 沙盒整批预检/
 * EOL 保真；原 38 人物、56 关口与旧事件/地标/指南全值保护（HEAD 51f3355
 * 基线）。合成引擎测试，非真实玩家 QA。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGridMap } from '../src/engine/grid-map';
import { parseWorldMap, selectInteractableRegionEvent, type RegionEventContext } from '../src/engine/world-map';
import { parseNpcSet, assembleNpcPlacements, type NpcSetData } from '../src/engine/npc-placement';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import {
  applyDialogueEffects, assembleDialogueReferences, getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import { requestDialogueEffectConfirmation, resolveDialogueEffectConfirmation, DIALOGUE_CONFIRMATION_OPTIONS } from '../src/game/dialogue-effect-confirmation';
import { parseQuestSet, createQuestJournal } from '../src/engine/quest-system';
import { createInventoryState, indexItems, parseItemSet, countItem } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { parseCharacterProfileSet, createCharacterState, parseMartialArtSet } from '../src/engine/character-progression';
import { GameClock, parseGameCalendar } from '../src/engine/game-calendar';
import { DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES } from '../src/engine/dialogue-variables';
import { captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState } from '../src/engine/save-system';
import { parseKnowledgeNodeSet, parseKnowledgeEdgeSet, assembleKnowledgeGraph } from '../src/engine/knowledge-graph';
import {
  CLOUD_ADVICE_AFTER, CLOUD_ADVICE_BEFORE, EXCHANGE_MINUTES, EXCHANGE_VARIABLE_KEY, FORK_SIGN_EVENT,
  FORK_SIGN_LANDMARK, GRAPH_EDGES, GRAPH_NODE, MANIFEST_ENTRIES, R279_ROAD_EXCHANGE_EXPECTATION,
  ROAD_KEEPER_DIALOGUE_FILE, ROAD_KEEPER_NPC, ROAD_KEEPER_NPC_FILE,
  repairGraphEdgesRaw, repairGraphNodesRaw, repairManifestRaw, repairRegionGuideSourceRaw,
  repairWorldMapRaw, staticResourceState,
} from '../scripts/lib/round279-road-exchange.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const raw = (path: string): string => readFileSync(join(root, path), 'utf8');
const readJson = (path: string) => JSON.parse(raw(path));
const baseline = (path: string): string =>
  execFileSync('git', ['show', `51f3355:${path}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const worldDoc = readJson('data/base/world/world-map.json');
const ironParse = parseGridMap(readJson('data/base/maps/round-62-iron-ridge.json'));
if (!ironParse.ok) throw new Error('iron map rejected');
const ironMap = ironParse.map;
const cloudParse = parseGridMap(readJson('data/base/maps/round-74-cloud-ridge.json'));
if (!cloudParse.ok) throw new Error('cloud map rejected');
const cloudMap = cloudParse.map;

const profiles = parseCharacterProfileSet(readJson('data/base/characters/round-04-profiles.json'));
if (!profiles.ok) throw new Error('profiles fixture rejected');
const profile = profiles.set.profiles[0]!;
const itemSet = parseItemSet(readJson('data/base/items/round-06-items.json'));
if (!itemSet.ok) throw new Error('items fixture rejected');
const items = indexItems(itemSet.set).byId;
const questSet = parseQuestSet(readJson('data/base/quests/round-07-quests.json'));
if (!questSet.ok) throw new Error('quests fixture rejected');
const quests = new Map(questSet.set.quests.map((q) => [q.id, q] as const));
const skills = parseMartialArtSet(readJson('data/base/skills/round-04-martial-arts.json'));
if (!skills.ok) throw new Error('skills fixture rejected');
const arts = new Map(skills.set.martialArts.map((a) => [a.id, a] as const));
const calendar = parseGameCalendar(readJson('data/base/worldview/calendar.json'));
if (!calendar.ok) throw new Error('calendar fixture rejected');

const dialogueParse = parseDialogueSet(readJson('data/base/dialogues/round-279-road-keeper-conversations.json'));
if (!dialogueParse.ok) throw new Error('road keeper dialogue rejected: ' + dialogueParse.errors.join());
const conversation = dialogueParse.set.conversations[0]!;
const greet = conversation.nodes.find((n) => n.id === conversation.startNodeId)!;
const detailNode = (id: string) => conversation.nodes.find((n) => n.id === id)!;
const npcParse = parseNpcSet(readJson('data/base/characters/round-279-iron-ridge-npcs.json'));
if (!npcParse.ok) throw new Error('road keeper npc rejected: ' + npcParse.errors.join());

interface Ctor {
  pay?: [string, number][];
  clock?: GameClock;
  inventory?: ReturnType<typeof createInventoryState>;
}
function context(ctor: Ctor = {}): DialogueRuntimeContext {
  return {
    quests, journal: createQuestJournal(quests), items,
    inventory: ctor.inventory ?? createInventoryState(profile, (ctor.pay ?? []).map(([itemId, quantity]) => ({ itemId, quantity }))),
    social: createSocialState(),
    speakerNpcId: ROAD_KEEPER_NPC.id,
    knownKnowledgeNodeIds: new Set(), knowledgeNodes: new Map(),
    character: createCharacterState(profile),
    factions: new Map(), martialArts: arts,
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: 'period.afternoon',
    dialogueVariables: new Map(),
    ...(ctor.clock === undefined ? {} : { clock: ctor.clock }),
  };
}
const visibleTexts = (c: DialogueRuntimeContext) => getVisibleOptions(greet, c).map((o) => o.option.text);
const exchangeOption = (c: DialogueRuntimeContext, nodeId: string) =>
  getVisibleOptions(greet, c).map((o) => o.option).find((o) => o.nextNodeId === nodeId)!;
const confirmEffects = (nodeId: string) =>
  detailNode(nodeId).options!.find((o) => o.nextNodeId === 'r279-exchange-receipt')!.effects!;

describe('Round279 数据形状：留守人、岔口牌与图谱', () => {
  it('NPC 解析并在真实铁嶂图上放置于(26,4)，复用已授权石北帧组且不担任差事', () => {
    expect(npcParse.set.npcs).toHaveLength(1);
    const keeper = npcParse.set.npcs[0]!;
    expect(keeper).toMatchObject(ROAD_KEEPER_NPC);
    expect(keeper.questGiver).toBe(false); // 非差事发放人。
    expect(keeper.schedule).toEqual([]); // 全天原地留守，无日程位。
    const assembly = assembleNpcPlacements({
      npcSet: npcParse.set,
      knownResourceIds: new Set(['map.round-62-iron-ridge']),
      maps: new Map([['map.round-62-iron-ridge', ironMap]]),
      currentMapResourceId: 'map.round-62-iron-ridge',
      dialogueIds: new Set([ROAD_KEEPER_NPC.dialogueId]),
    });
    expect(assembly.warnings).toEqual([]);
    expect(assembly.npcs.map((n) => `${n.col},${n.row}`)).toEqual(['26,4']);
  });

  it('全部 39 人物在铁嶂无占位/出生点冲突，旧 38 人物字节不变', () => {
    const oldFiles = ['round-03-npcs', 'round-04-profiles', 'round-74-cloud-ridge-npcs', 'round-79-isles-npcs', 'round-82-east-coast-npcs', 'round-83-east-coast-npcs', 'round-84-windward-isle-npcs', 'round-85-tide-isle-npcs', 'round-86-tide-isle-npcs', 'round-87-southwest-isles-npcs', 'round-89-southwest-isles-npcs', 'round-91-cloud-north-terrace-npcs', 'round-92-north-pass-npcs', 'round-93-snow-pine-valley-npcs', 'round-94-frontiers-npcs', 'round-95-east-woodland-npcs', 'round-96-south-reef-npcs', 'round-97-lanxin-reef-npcs'];
    const allNpcs = [...npcParse.set.npcs];
    let oldCount = 0;
    for (const file of oldFiles) {
      expect(raw(`data/base/characters/${file}.json`)).toBe(baseline(`data/base/characters/${file}.json`));
      const doc = JSON.parse(raw(`data/base/characters/${file}.json`)) as { npcs?: unknown[] };
      if (!('npcs' in doc)) continue;
      oldCount += (doc.npcs as typeof allNpcs).length;
      allNpcs.push(...(doc.npcs as typeof allNpcs));
    }
    expect(oldCount).toBe(38);
    expect(allNpcs).toHaveLength(39);
    const ironNpcs = allNpcs.filter((n) => n.mapResourceId === 'map.round-62-iron-ridge');
    expect(ironNpcs.map((n) => n.id).sort()).toEqual(['char.qin-suyan', 'char.r279-xin-danggui', 'char.shao-changgeng'].sort());
    const keeperAssembly = assembleNpcPlacements({
      npcSet: { npcs: ironNpcs } as NpcSetData,
      knownResourceIds: new Set(['map.round-62-iron-ridge']),
      maps: new Map([['map.round-62-iron-ridge', ironMap]]),
      currentMapResourceId: 'map.round-62-iron-ridge',
      dialogueIds: new Set(ironNpcs.map((n) => n.dialogueId)),
    });
    expect(keeperAssembly.warnings).toEqual([]);
    expect(keeperAssembly.npcs).toHaveLength(3);
    // 基础位与全部日程位互不占格（新留守人无日程；老二人日程位同样不撞）。
    const cells = new Set<string>();
    for (const npc of ironNpcs) {
      const base = `${npc.position.col},${npc.position.row}`;
      expect(cells.has(base), `NPC ${npc.id} 占格 ${base} 冲突`).toBe(false);
      cells.add(base);
      for (const entry of npc.schedule ?? []) {
        const cell = `${entry.position.col},${entry.position.row}`;
        expect(cells.has(cell), `NPC ${npc.id} 日程格 ${cell} 冲突`).toBe(false);
        cells.add(cell);
      }
    }
  });

  it('对白引用装配零警告：两支付物品、回春膏与变量均落在真实资源上', () => {
    const assembled = assembleDialogueReferences({
      conversations: new Map([[conversation.id, conversation]]),
      quests, items,
      placedNpcIds: new Set([ROAD_KEEPER_NPC.id]),
      knowledgeNodeIds: new Set((readJson('data/base/knowledge_graph/nodes.json') as { nodes: { id: string }[] }).nodes.map((n) => n.id)),
      factionIds: new Set(), martialArtIds: new Set(arts.keys()),
      timeOfDayPeriodIds: new Set(['period.morning', 'period.midday', 'period.afternoon', 'period.dusk', 'period.night']),
    });
    expect(assembled.warnings).toEqual([]);
    expect(assembled.conversations.get(conversation.id)!.nodes).toHaveLength(conversation.nodes.length);
  });

  it('图谱新增人物节点与两条关系闭合，旧 431 节点/548 边全值保留', () => {
    const nodeParse = parseKnowledgeNodeSet(readJson('data/base/knowledge_graph/nodes.json'));
    if (!nodeParse.ok) throw new Error('knowledge nodes rejected');
    const edgeParse = parseKnowledgeEdgeSet(readJson('data/base/knowledge_graph/edges.json'));
    if (!edgeParse.ok) throw new Error('knowledge edges rejected');
    const graph = assembleKnowledgeGraph(nodeParse.data, edgeParse.data);
    expect(graph.warnings).toEqual([]);
    expect(nodeParse.data.nodes).toHaveLength(432);
    expect(edgeParse.data.edges).toHaveLength(550);
    const currentNodes = structuredClone(nodeParse.data);
    (currentNodes.nodes as unknown[]).pop();
    const currentEdges = structuredClone(edgeParse.data);
    for (let i = 0; i < GRAPH_EDGES.length; i += 1) (currentEdges.edges as unknown[]).pop();
    expect(currentNodes).toEqual(JSON.parse(baseline('data/base/knowledge_graph/nodes.json')));
    expect(currentEdges).toEqual(JSON.parse(baseline('data/base/knowledge_graph/edges.json')));
  });

  it('manifest 登记两条新资源且其余 100 条全值保留', () => {
    const manifest = readJson('data/base/manifest.json');
    expect(manifest.resources).toHaveLength(102);
    for (const entry of MANIFEST_ENTRIES) {
      expect(manifest.resources.filter((r: { id: string }) => r.id === entry.id)).toHaveLength(1);
      expect(existsSync(join(root, 'data/base', entry.path))).toBe(true);
    }
    const without = structuredClone(manifest);
    without.resources = without.resources.filter((r: { id: string }) => !MANIFEST_ENTRIES.some((e) => e.id === r.id));
    expect(without).toEqual(JSON.parse(baseline('data/base/manifest.json')));
  });
});

describe('Round279 实际路线邻接与岔口 E 协议', () => {
  it('铁嶂实际北行路逐格可走：(4,7)→(4,3)→E46→(50,3)，北关(50,2)仍在，留守人站旁格不阻路', () => {
    for (let row = 3; row <= 7; row += 1) expect(ironMap.canEnter(4, row), `4,${row}`).toBe(true);
    for (let col = 4; col <= 50; col += 1) expect(ironMap.canEnter(col, 3), `${col},3`).toBe(true);
    const northGate = worldDoc.transitions.find((t: { id: string }) => t.id === 'gate.iron-ridge-to-cloud-ridge')!;
    expect(northGate.from).toMatchObject({ mapResourceId: 'map.round-62-iron-ridge', col: 50, row: 2 });
    // 中点(26,3)在真实走廊上；留守人(26,4)是路南一格的旁格而非路径格。
    expect(ironMap.canEnter(26, 3)).toBe(true);
    expect(ironMap.canEnter(26, 4)).toBe(true);
    expect(Math.abs(26 - (4 + 50) / 2)).toBeLessThanOrEqual(2); // 46 格走廊的中段。
    expect(Math.abs(26 - 26) + Math.abs(4 - 3)).toBe(1);
    // 留守人格与旧事件/关口/挑战/地标零冲突。
    const clashes: string[] = [];
    for (const event of worldDoc.events) if (event.mapResourceId === 'map.round-62-iron-ridge' && event.col === 26 && (event.row === 3 || event.row === 4)) clashes.push('event:' + event.id);
    for (const landmark of worldDoc.landmarks) if (landmark.mapResourceId === 'map.round-62-iron-ridge' && landmark.col === 26 && (landmark.row === 3 || landmark.row === 4)) clashes.push('landmark:' + landmark.id);
    for (const gate of worldDoc.transitions) for (const point of [gate.from, gate.to]) if (point.mapResourceId === 'map.round-62-iron-ridge' && point.col === 26 && (point.row === 3 || point.row === 4)) clashes.push('gate:' + gate.id);
    const encounters = readJson('data/base/battles/round-05-encounters.json').encounters as { id: string; position?: { col: number; row: number } }[];
    for (const encounter of encounters) if (encounter.position && encounter.position.col === 26 && (encounter.position.row === 3 || encounter.position.row === 4)) clashes.push('encounter:' + encounter.id);
    expect(clashes).toEqual([]);
  });

  it('云岭安全进城路逐格可走：(50,97)→(50,56)→(40,56)→(40,43)，坡屋墙(50,55)仍是实体', () => {
    for (let row = 56; row <= 97; row += 1) expect(cloudMap.canEnter(50, row), `50,${row}`).toBe(true);
    for (let col = 40; col <= 50; col += 1) expect(cloudMap.canEnter(col, 56), `${col},56`).toBe(true);
    for (let row = 43; row <= 56; row += 1) expect(cloudMap.canEnter(40, row), `40,${row}`).toBe(true);
    expect(cloudMap.isSolid(50, 55)).toBe(true); // 13 格被挡的建筑墙不删缩。
    expect(cloudMap.canEnter(39, 43)).toBe(true); // 沈雨霁(39,43)邻格即真实接近点(40,43)。
    expect(cloudMap.canEnter(50, 59)).toBe(true);
  });

  it('岔口牌数据落在(50,59)，无奖励可重复E阅读：南北及东西邻格均可读', () => {
    const landmark = worldDoc.landmarks.find((l: { id: string }) => l.id === FORK_SIGN_LANDMARK.id)!;
    expect(landmark).toMatchObject({ mapResourceId: 'map.round-74-cloud-ridge', col: 50, row: 59, category: 'route' });
    const event = worldDoc.events.find((e: { id: string }) => e.id === FORK_SIGN_EVENT.id)!;
    expect(event.once).toBe(false);
    expect(event.discoverKnowledgeNodeId).toBeUndefined(); // 纯路线指示，不派发新发现奖励。
    expect(event.text).toContain('四十列');
    expect(event.text).toContain('沈雨霁');
    expect(event.text).toContain('屋墙挡道');
    expect(event.text).toContain('R人物');
    expect(event.text).not.toContain('蹭破');
    const emptyContext: RegionEventContext = { knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null };
    const hit = (col: number, row: number) => selectInteractableRegionEvent(
      [event], { mapResourceId: 'map.round-74-cloud-ridge', col, row }, new Set(), emptyContext,
      (c, r) => cloudMap.canEnter(c, r));
    expect(hit(50, 60)?.event.id).toBe(FORK_SIGN_EVENT.id);
    expect(hit(50, 60)?.approachDirection).toBe('up');
    expect(hit(49, 59)?.approachDirection).toBe('right');
    expect(hit(51, 59)?.approachDirection).toBe('left');
    expect(hit(50, 58)?.approachDirection).toBe('down'); // 回程仍可主动E复读，路过不自动触发。
    const done = selectInteractableRegionEvent(
      [event], { mapResourceId: 'map.round-74-cloud-ridge', col: 50, row: 60 }, new Set([event.id]), emptyContext,
      (c, r) => cloudMap.canEnter(c, r));
    expect(done?.event.id).toBe(FORK_SIGN_EVENT.id); // 普通岔牌可重读，无discoverKnowledge奖励。
    // 岔口牌格与既有云岭事件/地标/NPC/遭遇零冲突。
    for (const other of worldDoc.events) {
      if (other.id !== FORK_SIGN_EVENT.id && other.mapResourceId === 'map.round-74-cloud-ridge' && other.col === 50 && other.row === 59) throw new Error('event clash ' + other.id);
    }
    for (const other of worldDoc.landmarks) {
      if (other.id !== FORK_SIGN_LANDMARK.id && other.mapResourceId === 'map.round-74-cloud-ridge' && other.col === 50 && other.row === 59) throw new Error('landmark clash ' + other.id);
    }
  });

  it('云岭行旅指南240字内改写并保留全部既有锚定片段，与 round106 源逐字同步', () => {
    const advice = (worldDoc.regionGuides as { mapResourceId: string; advice: string }[])
      .find((g) => g.mapResourceId === 'map.round-74-cloud-ridge')!.advice;
    expect(advice).toBe(CLOUD_ADVICE_AFTER);
    expect([...advice].length).toBeLessThanOrEqual(240);
    expect([...CLOUD_ADVICE_BEFORE].length).toBeLessThanOrEqual([...advice].length);
    for (const fragment of ['售完本程不补货', '缺货可东去青帆埠', '初到客舍先核渡口来路', '刻痕确认后才接断索清桥', '清桥只是清退拦路客']) {
      expect(advice).toContain(fragment);
    }
    expect(advice).toContain(R279_ROAD_EXCHANGE_EXPECTATION.adviceFragment);
    expect(raw('scripts/lib/round106-region-content.mjs')).toContain(advice);
  });

  it('世界图解析通过：56 关口不变，剥除 r279 增量后与 51f3355 基线全等', () => {
    const parsed = parseWorldMap(worldDoc);
    expect(parsed.ok).toBe(true);
    expect(worldDoc.transitions).toHaveLength(56);
    const stripped = structuredClone(worldDoc);
    stripped.landmarks = stripped.landmarks.filter((l: { id: string }) => l.id !== FORK_SIGN_LANDMARK.id);
    stripped.events = stripped.events.filter((e: { id: string }) => e.id !== FORK_SIGN_EVENT.id);
    stripped.regionGuides.find((g: { mapResourceId: string }) => g.mapResourceId === 'map.round-74-cloud-ridge').advice = CLOUD_ADVICE_BEFORE;
    expect(stripped).toEqual(JSON.parse(baseline('data/base/world/world-map.json')));
  });
});

describe('Round279 交换事务（真实引擎条件/效果/存读）', () => {
  const QINGXIN_DETAIL = 'r279-qingxin-detail';
  const IRON_DETAIL = 'r279-iron-detail';

  it('两个明细节点均声明 confirmEffects，取消选项与离开选项无效果', () => {
    for (const id of [QINGXIN_DETAIL, IRON_DETAIL]) {
      expect(detailNode(id).confirmEffects).toBe(true);
      const cancel = detailNode(id).options!.find((o) => o.nextNodeId === 'greet')!;
      expect(cancel.effects).toBeUndefined();
      expect(cancel.conditions).toBeUndefined();
    }
    expect(greet.options!.find((o) => o.nextNodeId === 'r279-farewell')!.effects).toBeUndefined();
    expect(detailNode('r279-farewell').options).toBeUndefined();
  });

  it('确认页默认第一项即返回（取消），选择结算选项时引擎会先拦下请求确认', () => {
    expect(DIALOGUE_CONFIRMATION_OPTIONS[0]!.text).toContain('先不作决定');
    const c = context({ pay: [['item.qingxin-wan', 1]] });
    const visible = getVisibleOptions(detailNode(QINGXIN_DETAIL), c);
    const settle = visible.find((o) => o.option.nextNodeId === 'r279-exchange-receipt')!;
    const request = requestDialogueEffectConfirmation(detailNode(QINGXIN_DETAIL), settle);
    expect(request).not.toBeNull();
    expect(request!.label).toBe('就按这个换。');
    // 取消项无效果，不触发确认页。
    const leave = visible.find((o) => o.option.nextNodeId === 'greet')!;
    expect(requestDialogueEffectConfirmation(detailNode(QINGXIN_DETAIL), leave)).toBeNull();
  });

  for (const [detailId, payItem, variableValue] of [
    [QINGXIN_DETAIL, 'item.qingxin-wan', 'qingxin-wan'],
    [IRON_DETAIL, 'item.iron-sand', 'iron-sand'],
  ] as const) it(`${variableValue}：整笔换药事务扣料得膏推进8分钟记账，另一支随即锁定`, () => {
    const clock = new GameClock(calendar.calendar, 600);
    const c = context({ pay: [[payItem, 2]], clock });
    expect(visibleTexts(c)).not.toContain('核对换药的存根。'); // 未换前没有存根选项。
    expect(exchangeOption(c, detailId)).toBeDefined();
    const silverBefore = c.inventory!.currency;
    expect(applyDialogueEffects(confirmEffects(detailId), c).ok).toBe(true);
    expect(countItem(c.inventory!, payItem)).toBe(1);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(1);
    expect(clock.elapsedMinutes).toBe(600 + EXCHANGE_MINUTES);
    expect(c.dialogueVariables!.get(EXCHANGE_VARIABLE_KEY)).toBe(variableValue);
    expect(c.inventory!.currency).toBe(silverBefore); // 无银费参与。
    // 两种支付选项同时消失，只剩存根与离开。
    expect(exchangeOption(c, QINGXIN_DETAIL)).toBeUndefined();
    expect(exchangeOption(c, IRON_DETAIL)).toBeUndefined();
    expect(visibleTexts(c)).toContain('核对换药的存根。');
    expect(getRelationship(c.social, ROAD_KEEPER_NPC.id)).toBe(0); // 不夹带关系/善恶奖励。
    // 入口双重封锁：greet 选项与 detail 确认选项都带 variable missing 条件。
    const detailVisible = getVisibleOptions(detailNode(detailId), c).map((o) => o.option);
    expect(detailVisible.some((o) => o.effects)).toBe(false);
  });

  it('兑换后旧明细确认与另一支付的确认都因当前条件拒绝，保留银料时钟', () => {
    const clock = new GameClock(calendar.calendar, 600);
    const c = context({ pay: [['item.qingxin-wan', 2], ['item.iron-sand', 2]], clock });
    const pending = [QINGXIN_DETAIL, IRON_DETAIL].map(id => requestDialogueEffectConfirmation(detailNode(id), getVisibleOptions(detailNode(id), c)[0]));
    expect(applyDialogueEffects(confirmEffects(QINGXIN_DETAIL), c).ok).toBe(true);
    for (const [i, id] of [QINGXIN_DETAIL, IRON_DETAIL].entries()) {
      expect(resolveDialogueEffectConfirmation(pending[i]!, detailNode(id), getVisibleOptions(detailNode(id), c))).toBeNull();
    }
    expect(countItem(c.inventory!, 'item.iron-sand')).toBe(2);
    expect(countItem(c.inventory!, 'item.qingxin-wan')).toBe(1);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(1);
    expect(clock.elapsedMinutes).toBe(608);
  });

  it('确认打开后支付物消失，旧确认请求无效，不给膏或推进时钟', () => {
    const clock = new GameClock(calendar.calendar, 600);
    const c = context({ pay: [['item.iron-sand', 1]], clock });
    const node = detailNode(IRON_DETAIL);
    const pending = requestDialogueEffectConfirmation(node, getVisibleOptions(node, c)[0])!;
    expect(applyDialogueEffects([{ kind: 'takeItem', itemId: 'item.iron-sand', quantity: 1 }], c).ok).toBe(true);
    expect(resolveDialogueEffectConfirmation(pending, node, getVisibleOptions(node, c))).toBeNull();
    expect(clock.elapsedMinutes).toBe(600);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(0);
    expect(c.dialogueVariables!.has(EXCHANGE_VARIABLE_KEY)).toBe(false);
  });

  it('剧情不假定药队已过两日，离开是终止节点，图谱说明总计一次', () => {
    expect(greet.text).not.toContain('前日');
    expect(greet.options!.find(o => o.nextNodeId === 'r279-farewell')).toBeDefined();
    expect(detailNode('r279-farewell').options).toBeUndefined();
    expect(GRAPH_NODE.summary).toContain('总计一次');
    expect(GRAPH_NODE.summary).not.toContain('各限一次');
  });

  it('未换过且两样都有时可自由选择任一支', () => {
    const c = context({ pay: [['item.qingxin-wan', 1], ['item.iron-sand', 1]] });
    expect(exchangeOption(c, QINGXIN_DETAIL)).toBeDefined();
    expect(exchangeOption(c, IRON_DETAIL)).toBeDefined();
    expect(visibleTexts(c)).not.toContain('核对换药的存根。');
  });

  it('物品不足时对应选项不可见（条件层先于效果层）', () => {
    const none = context();
    expect(exchangeOption(none, QINGXIN_DETAIL)).toBeUndefined();
    expect(exchangeOption(none, IRON_DETAIL)).toBeUndefined();
    const onlyWan = context({ pay: [['item.qingxin-wan', 1]] });
    expect(exchangeOption(onlyWan, QINGXIN_DETAIL)).toBeDefined();
    expect(exchangeOption(onlyWan, IRON_DETAIL)).toBeUndefined();
    const onlySand = context({ pay: [['item.iron-sand', 1]] });
    expect(exchangeOption(onlySand, QINGXIN_DETAIL)).toBeUndefined();
    expect(exchangeOption(onlySand, IRON_DETAIL)).toBeDefined();
  });

  it('满包先扣后失败整笔回滚：堆叠扣1不释放格、膏放不下、料与时钟一并复原', () => {
    const clock = new GameClock(calendar.calendar, 300);
    // 12 格塞满不同物品；清心丸给 2 丸占同一堆叠，扣 1 后格数不减，回春膏仍无处可放。
    const full = createInventoryState(profile, [...items.keys()].filter((id) => id !== 'item.huichun-gao').slice(0, 12).map((itemId) => ({ itemId, quantity: itemId === 'item.qingxin-wan' ? 2 : 1 })));
    const before = structuredClone(full);
    const c = context({ inventory: full, clock });
    c.dialogueVariables!.set('probe', 'untouched');
    expect(applyDialogueEffects(confirmEffects(QINGXIN_DETAIL), c).ok).toBe(false);
    expect(c.inventory).toEqual(before);
    expect(countItem(c.inventory!, 'item.qingxin-wan')).toBe(2);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(0);
    expect(clock.elapsedMinutes).toBe(300);
    expect(c.dialogueVariables!.has(EXCHANGE_VARIABLE_KEY)).toBe(false);
    expect(c.dialogueVariables!.get('probe')).toBe('untouched');
    // 相反情形：清心丸只持 1 丸（扣尽释放格）时满包也能成交——这正是先扣后给的交易语义。
    const singleSlot = createInventoryState(profile, [...items.keys()].filter((id) => id !== 'item.huichun-gao').slice(0, 12).map((itemId) => ({ itemId, quantity: 1 })));
    const okay = context({ inventory: singleSlot, clock: new GameClock(calendar.calendar, 300) });
    expect(applyDialogueEffects(confirmEffects(QINGXIN_DETAIL), okay).ok).toBe(true);
    expect(countItem(okay.inventory!, 'item.qingxin-wan')).toBe(0);
    expect(countItem(okay.inventory!, 'item.huichun-gao')).toBe(1);
  });

  it('世界时钟不可用（旧上下文无 clock）时时间效果整笔拒绝', () => {
    const c = context({ pay: [['item.qingxin-wan', 1]] }); // clock 缺省不带。
    expect(applyDialogueEffects(confirmEffects(QINGXIN_DETAIL), c).ok).toBe(false);
    expect(countItem(c.inventory!, 'item.qingxin-wan')).toBe(1);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(0);
    expect(c.dialogueVariables!.has(EXCHANGE_VARIABLE_KEY)).toBe(false);
  });

  it('变量簿写满时整笔拒绝：先扣的料与时钟一并回滚', () => {
    const clock = new GameClock(calendar.calendar, 0);
    const c = context({ pay: [['item.iron-sand', 1]], clock });
    for (let i = 0; i < DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES; i += 1) c.dialogueVariables!.set('test.fill-' + i, true);
    expect(applyDialogueEffects(confirmEffects(IRON_DETAIL), c).ok).toBe(false);
    expect(countItem(c.inventory!, 'item.iron-sand')).toBe(1);
    expect(countItem(c.inventory!, 'item.huichun-gao')).toBe(0);
    expect(clock.elapsedMinutes).toBe(0);
    expect(c.dialogueVariables!.has(EXCHANGE_VARIABLE_KEY)).toBe(false);
  });

  it('存读往返保留药膏/变量并维持一次限制，不给重奖', () => {
    const clock = new GameClock(calendar.calendar, 1000);
    const c = context({ pay: [['item.qingxin-wan', 1]], clock });
    applyDialogueEffects(confirmEffects(QINGXIN_DETAIL), c);
    const snapshot = captureSaveSnapshot({
      displayName: '合成存读', mapResourceId: 'map.round-62-iron-ridge', playerCol: 26, playerRow: 3,
      character: c.character!, inventory: c.inventory!, journal: c.journal, social: c.social,
      shopStocks: new Map(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
      knownKnowledgeNodeIds: new Set(), elapsedGameMinutes: clock.elapsedMinutes, worldSeed: 279,
      dialogueVariables: c.dialogueVariables,
    });
    const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    if (!parsed.ok) throw new Error(parsed.message);
    const plan = planSnapshotRestore(parsed.snapshot, {
      profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]),
      mapResourceId: snapshot.mapResourceId, isWalkableCell: () => true, isCellOccupied: () => false,
      itemIds: new Set(items.keys()), itemRecords: items, martialArtIds: new Set(arts.keys()),
      questIds: new Set(quests.keys()),
      questObjectiveIds: new Map([...quests].map(([id, q]) => [id, new Set(q.objectives.map((o) => o.id))])),
      questRecords: quests, encounterIds: new Set(), shopIds: new Set(), npcIds: new Set([ROAD_KEEPER_NPC.id]),
    });
    if (!plan.ok) throw new Error(plan.errors.join());
    const restored = restoreRunState({ snapshot: plan.snapshot, profile, items, quests, shops: new Map() });
    expect(snapshot.elapsedGameMinutes).toBe(1000 + EXCHANGE_MINUTES);
    const after: DialogueRuntimeContext = { ...c, ...restored, clock: new GameClock(calendar.calendar, snapshot.elapsedGameMinutes), knownKnowledgeNodeIds: new Set(restored.knownKnowledgeNodeIds) };
    expect(countItem(after.inventory!, 'item.qingxin-wan')).toBe(0);
    expect(countItem(after.inventory!, 'item.huichun-gao')).toBe(1);
    expect(after.dialogueVariables!.get(EXCHANGE_VARIABLE_KEY)).toBe('qingxin-wan');
    expect(after.clock!.elapsedMinutes).toBe(1000 + EXCHANGE_MINUTES);
    expect(exchangeOption(after, QINGXIN_DETAIL)).toBeUndefined();
    expect(exchangeOption(after, IRON_DETAIL)).toBeUndefined();
    expect(visibleTexts(after)).toContain('核对换药的存根。');
    expect(after.social.morality).toBe(0); // 无善恶/声望夹带。
  });
});

describe('Round279 作者源：幂等/漂移拒绝/EOL/静态文件/CLI 沙盒', () => {
  it('对当前数据二次修复零差异；各资源漂移与重复一律拒绝', () => {
    const worldCurrent = raw('data/base/world/world-map.json');
    expect(repairWorldMapRaw(worldCurrent)).toBe(worldCurrent);
    const nodesCurrent = raw('data/base/knowledge_graph/nodes.json');
    expect(repairGraphNodesRaw(nodesCurrent)).toBe(nodesCurrent);
    const edgesCurrent = raw('data/base/knowledge_graph/edges.json');
    expect(repairGraphEdgesRaw(edgesCurrent)).toBe(edgesCurrent);
    const guideCurrent = raw('scripts/lib/round106-region-content.mjs');
    expect(repairRegionGuideSourceRaw(guideCurrent)).toBe(guideCurrent);
    const manifestCurrent = raw('data/base/manifest.json');
    expect(repairManifestRaw(manifestCurrent)).toBe(manifestCurrent);

    const driftedLandmark = JSON.parse(worldCurrent);
    driftedLandmark.landmarks.find((l: { id: string }) => l.id === FORK_SIGN_LANDMARK.id).name = '被篡改';
    expect(() => repairWorldMapRaw(JSON.stringify(driftedLandmark, null, 2) + '\n')).toThrow('请人工复核');
    const driftedGuide = JSON.parse(worldCurrent);
    driftedGuide.regionGuides.find((g: { mapResourceId: string }) => g.mapResourceId === 'map.round-74-cloud-ridge').advice = '被篡改的指南';
    expect(() => repairWorldMapRaw(JSON.stringify(driftedGuide, null, 2) + '\n')).toThrow('请人工复核');
    const driftedNode = JSON.parse(nodesCurrent);
    driftedNode.nodes.find((n: { id: string }) => n.id === GRAPH_NODE.id).title = '漂移';
    expect(() => repairGraphNodesRaw(JSON.stringify(driftedNode))).toThrow('请人工复核');
    const duplicateNode = JSON.parse(nodesCurrent);
    duplicateNode.nodes.push({ ...GRAPH_NODE });
    expect(() => repairGraphNodesRaw(JSON.stringify(duplicateNode))).toThrow('请人工复核');
    const driftedEdge = JSON.parse(edgesCurrent);
    driftedEdge.edges.find((e: { id: string }) => e.id === GRAPH_EDGES[0]!.id).summary = '漂移';
    expect(() => repairGraphEdgesRaw(JSON.stringify(driftedEdge))).toThrow('请人工复核');
    const duplicateManifest = JSON.parse(manifestCurrent);
    duplicateManifest.resources.push({ ...MANIFEST_ENTRIES[0]! });
    expect(() => repairManifestRaw(JSON.stringify(duplicateManifest))).toThrow('请人工复核');
    expect(() => repairRegionGuideSourceRaw(guideCurrent.replace(CLOUD_ADVICE_AFTER, '漂移'))).toThrow('请人工复核');
    expect(() => staticResourceState('{}' + '\n', ROAD_KEEPER_NPC_FILE, '新人物文件')).toThrow('请人工复核');
    expect(() => staticResourceState('{}' + '\n', ROAD_KEEPER_DIALOGUE_FILE, '新对白文件')).toThrow('请人工复核');
    expect(staticResourceState(undefined, ROAD_KEEPER_NPC_FILE, '新人物文件')).toEqual({ present: false, ok: true });
  });

  it('pristine 重建：剥除 r279 增量后恰得当前字节（含 CRLF 图谱）', () => {
    const pristine = structuredClone(worldDoc);
    pristine.landmarks = pristine.landmarks.filter((l: { id: string }) => l.id !== FORK_SIGN_LANDMARK.id);
    pristine.events = pristine.events.filter((e: { id: string }) => e.id !== FORK_SIGN_EVENT.id);
    pristine.regionGuides.find((g: { mapResourceId: string }) => g.mapResourceId === 'map.round-74-cloud-ridge').advice = CLOUD_ADVICE_BEFORE;
    const rebuilt = repairWorldMapRaw(JSON.stringify(pristine, null, 2) + '\n');
    expect(JSON.parse(rebuilt)).toEqual(worldDoc);
    const pristineNodes = JSON.parse(baseline('data/base/knowledge_graph/nodes.json'));
    const rebuiltNodes = repairGraphNodesRaw(JSON.stringify(pristineNodes, null, 2) + '\n');
    expect(JSON.parse(rebuiltNodes)).toEqual(readJson('data/base/knowledge_graph/nodes.json'));
    const pristineEdges = JSON.parse(baseline('data/base/knowledge_graph/edges.json'));
    const rebuiltEdges = repairGraphEdgesRaw(JSON.stringify(pristineEdges, null, 2) + '\n');
    expect(JSON.parse(rebuiltEdges)).toEqual(readJson('data/base/knowledge_graph/edges.json'));
  });

  it('CRLF 输入保真：图谱与世界以各自行尾约定输出且二次幂等', () => {
    const nodesCrlf = (JSON.stringify(JSON.parse(baseline('data/base/knowledge_graph/nodes.json')), null, 2) + '\n').replace(/\n/g, '\r\n');
    const applied = repairGraphNodesRaw(nodesCrlf);
    expect(applied.includes('\r\n')).toBe(true);
    expect(applied.replace(/\r\n/g, '')).not.toContain('\n');
    expect(repairGraphNodesRaw(applied)).toBe(applied);
    const worldCrlf = (JSON.stringify(((() => { const doc = structuredClone(worldDoc); doc.landmarks = doc.landmarks.filter((l: { id: string }) => l.id !== FORK_SIGN_LANDMARK.id); doc.events = doc.events.filter((e: { id: string }) => e.id !== FORK_SIGN_EVENT.id); doc.regionGuides.find((g: { mapResourceId: string }) => g.mapResourceId === 'map.round-74-cloud-ridge').advice = CLOUD_ADVICE_BEFORE; return doc; })()), null, 2) + '\n').replace(/\n/g, '\r\n');
    const worldApplied = repairWorldMapRaw(worldCrlf);
    expect(worldApplied.replace(/\r\n/g, '')).not.toContain('\n');
    expect(repairWorldMapRaw(worldApplied)).toBe(worldApplied);
  });

  it('Windows CRLF静态人物/对白视为同稿，空格或内容漂移仍拒绝', () => {
    for (const [text, label] of [[ROAD_KEEPER_NPC_FILE, '人物'], [ROAD_KEEPER_DIALOGUE_FILE, '对白']]) {
      expect(staticResourceState(text!.replace(/\n/g, '\r\n'), text!, label!)).toEqual({ present: true, ok: true });
      expect(() => staticResourceState(text!.replace('  ', '   '), text!, label!)).toThrow();
    }
  });

  it('纯岔牌放在屋墙时地形作者拒绝且不改写现有地图', () => {
    const sandbox = resolve(mkdtempSync(join(tmpdir(), 'wuxia-r279-scenery-')));
    try {
      cpSync(join(root, 'data/base'), join(sandbox, 'data/base'), { recursive: true });
      cpSync(join(root, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
      const file = join(sandbox, 'data/base/maps/round-74-cloud-ridge.json');
      const before = readFileSync(file);
      const worldFile = join(sandbox, 'data/base/world/world-map.json');
      const doc = JSON.parse(readFileSync(worldFile, 'utf8'));
      doc.landmarks.find((l: { id: string }) => l.id === FORK_SIGN_LANDMARK.id).row = 55;
      doc.events.find((e: { id: string }) => e.id === FORK_SIGN_EVENT.id).row = 55;
      writeFileSync(worldFile, JSON.stringify(doc));
      expect(() => execFileSync(process.execPath, [join(sandbox, 'scripts/generate-round74-cloud-ridge.mjs')], { cwd: sandbox, stdio: 'pipe' })).toThrow();
      expect(readFileSync(file)).toEqual(before);
    } finally {
      if (!sandbox.startsWith(resolve(tmpdir()) + sep + 'wuxia-r279-scenery-')) throw new Error('unsafe sandbox');
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 20000);

  it('apply-round279 CLI 沙盒：整批预检失败零落盘、正常重建至当前字节、二次零差异、cwd 无关', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'wuxia-r279-cli-'));
    try {
      for (const dir of ['scripts/lib', 'data/base/world', 'data/base/knowledge_graph', 'data/base/characters', 'data/base/dialogues', 'data/base/maps']) {
        mkdirSync(join(workspace, dir), { recursive: true });
      }
      for (const file of ['scripts/apply-round279.mjs', 'scripts/lib/round279-road-exchange.mjs', 'scripts/lib/round279-sign-art.mjs']) {
        cpSync(resolve(root, file), join(workspace, file));
      }
      cpSync(resolve(root, 'data/base/knowledge_graph/nodes.json'), join(workspace, 'data/base/knowledge_graph/nodes.json'));
      cpSync(resolve(root, 'data/base/knowledge_graph/edges.json'), join(workspace, 'data/base/knowledge_graph/edges.json'));
      writeFileSync(join(workspace, 'data/base/maps/round-74-cloud-ridge.json'), baseline('data/base/maps/round-74-cloud-ridge.json'));
      // pristine：世界/指南源/图谱/manifest 回到 51f3355，静态新文件缺席。
      writeFileSync(join(workspace, 'data/base/world/world-map.json'), baseline('data/base/world/world-map.json'));
      writeFileSync(join(workspace, 'scripts/lib/round106-region-content.mjs'), baseline('scripts/lib/round106-region-content.mjs'));
      writeFileSync(join(workspace, 'data/base/manifest.json'), baseline('data/base/manifest.json'));
      // 基线指南源尚是 R275 云岭串——先挂 R278 渡口改写，避免与 51f3355 的渡口串不符。
      const { repairRegionGuideSourceRaw: r278Guide, FERRY_ADVICE_AFTER } = await import('../scripts/lib/round278-shore-boat.mjs');
      // git 基线是 LF、工作区该源为 CRLF——先按工作区行尾归一再挂 R278/R279 替换。
      const guideWithBoat = r278Guide(baseline('scripts/lib/round106-region-content.mjs').replace(/\r?\n/g, '\r\n'));
      expect(guideWithBoat.includes(FERRY_ADVICE_AFTER)).toBe(true);
      writeFileSync(join(workspace, 'scripts/lib/round106-region-content.mjs'), guideWithBoat);
      // 世界也需含 r278 门与渡口指南（R278 层先于 R279）。
      const { repairWorldMapRaw: r278World } = await import('../scripts/lib/round278-shore-boat.mjs');
      const worldWithBoat = r278World(baseline('data/base/world/world-map.json'));
      writeFileSync(join(workspace, 'data/base/world/world-map.json'), worldWithBoat);

      const run = () => execFileSync(process.execPath, [join(workspace, 'scripts/apply-round279.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      // 预检失败：图谱节点漂移时，任何文件都不得被写。
      const worldBefore = readFileSync(join(workspace, 'data/base/world/world-map.json'));
      const nodesDrifted = JSON.parse(nodesCurrentOf(root));
      nodesDrifted.nodes.find((n: { id: string }) => n.id === GRAPH_NODE.id).summary = '漂移';
      writeFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), JSON.stringify(nodesDrifted, null, 2) + '\n');
      expect(() => run()).toThrow();
      expect(readFileSync(join(workspace, 'data/base/world/world-map.json'))).toEqual(worldBefore);
      expect(existsSync(join(workspace, 'data/base/characters/round-279-iron-ridge-npcs.json'))).toBe(false);
      // 恢复合法图谱后整批通过：世界/图谱/manifest 与仓库当前字节一致，静态文件被创建。
      writeFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), nodesCurrentOf(root));
      run();
      expect(readFileSync(join(workspace, 'data/base/world/world-map.json'), 'utf8')).toBe(raw('data/base/world/world-map.json'));
      expect(readFileSync(join(workspace, 'data/base/knowledge_graph/nodes.json'), 'utf8')).toBe(raw('data/base/knowledge_graph/nodes.json'));
      expect(readFileSync(join(workspace, 'data/base/knowledge_graph/edges.json'), 'utf8')).toBe(raw('data/base/knowledge_graph/edges.json'));
      expect(readFileSync(join(workspace, 'data/base/manifest.json'), 'utf8')).toBe(raw('data/base/manifest.json'));
      expect(readFileSync(join(workspace, 'scripts/lib/round106-region-content.mjs'), 'utf8')).toBe(raw('scripts/lib/round106-region-content.mjs'));
      expect(readFileSync(join(workspace, 'data/base/characters/round-279-iron-ridge-npcs.json'), 'utf8')).toBe(ROAD_KEEPER_NPC_FILE);
      expect(readFileSync(join(workspace, 'data/base/dialogues/round-279-road-keeper-conversations.json'), 'utf8')).toBe(ROAD_KEEPER_DIALOGUE_FILE);
      // 静态文件被篡改时 CLI 拒绝且不改动其他文件。
      writeFileSync(join(workspace, 'data/base/characters/round-279-iron-ridge-npcs.json'), '{}\n');
      expect(() => run()).toThrow();
      expect(readFileSync(join(workspace, 'data/base/world/world-map.json'), 'utf8')).toBe(raw('data/base/world/world-map.json'));
      writeFileSync(join(workspace, 'data/base/characters/round-279-iron-ridge-npcs.json'), ROAD_KEEPER_NPC_FILE);
      // 二次运行零差异（幂等）。
      run();
      expect(readFileSync(join(workspace, 'data/base/world/world-map.json'), 'utf8')).toBe(raw('data/base/world/world-map.json'));
      expect(readFileSync(join(workspace, 'data/base/dialogues/round-279-road-keeper-conversations.json'), 'utf8')).toBe(ROAD_KEEPER_DIALOGUE_FILE);
    } finally {
      if (!resolve(workspace).startsWith(resolve(tmpdir()) + sep + 'wuxia-r279-cli-')) throw new Error('unsafe sandbox');
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 20000);
});

function nodesCurrentOf(repoRoot: string): string {
  return readFileSync(join(repoRoot, 'data/base/knowledge_graph/nodes.json'), 'utf8');
}
