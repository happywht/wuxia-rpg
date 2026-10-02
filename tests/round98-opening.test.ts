import { baseRecipeIds } from './support/base-recipe-ids';
import { baseMapCanEnter } from './support/base-map-walkability';
/**
 * Round 98: 开局对白串联（江南—渡口）与大雍/大梁设定统一的回归测试。
 *
 * 全部断言基于真实数据装配出的 dialogue runtime 与任务 journal：
 * 条件可见性、原子效果、任务三态（未接/进行/完成）与幂等性都以引擎
 * 行为验证，不依赖对白文本快照；文本断言只锁定“真实方向/人物/阶段性
 * 线索”这类验收内容与设定一致性（生成器源与 JSON 输出对表）。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  createCharacterState,
  grantExperience,
  indexFactions,
  indexMartialArts,
  indexProfiles,
  parseCharacterProfileSet,
  parseFactionSet,
  parseMartialArtSet,
  resolveStartingMartialArts,
  type CharacterProfileData,
  type CharacterState,
  type FactionData,
  type MartialArtData,
} from '../src/engine/character-progression';
import { parseBattleEncounterSet, type BattleEncounterData } from '../src/engine/turn-based-combat';
import { DialogueSession, parseDialogueSet, type DialogueData, type DialogueOptionData } from '../src/engine/dialogue-graph';
import {
  applyDialogueEffects,
  assembleDialogueReferences,
  getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
import {
  assembleQuests,
  acceptQuest,
  applyQuestSignal,
  createQuestJournal,
  parseQuestSet,
  type QuestData,
  type QuestJournal,
  type QuestUpdateResult,
} from '../src/engine/quest-system';
import {
  countItem,
  createInventoryState,
  indexItems,
  parseItemSet,
  removeItems,
  resolveStartingItems,
  type InventoryState,
  type ItemRecordData,
} from '../src/engine/item-system';
import { adjustFactionRenown, createSocialState, type SocialState } from '../src/engine/social-state';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

interface NpcRecord {
  id: string;
  questGiver?: boolean;
  dialogueId?: string;
}

interface RuntimeWorld {
  profile: CharacterProfileData;
  items: Map<string, ItemRecordData>;
  quests: ReadonlyMap<string, QuestData>;
  factions: Map<string, FactionData>;
  martialArts: Map<string, MartialArtData>;
  conversations: ReadonlyMap<string, DialogueData>;
  npcByDialogueId: Map<string, string>;
  knowledgeNodes: Map<string, KnowledgeNodeData>;
  knowledgeNodeIds: Set<string>;
  npcIds: Set<string>;
  periodId: string;
}

interface LiveRun {
  world: RuntimeWorld;
  character: CharacterState;
  inventory: InventoryState;
  journal: QuestJournal;
  social: SocialState;
  knownKnowledgeNodeIds: Set<string>;
  context: DialogueRuntimeContext;
}

function loadRuntimeWorld(): RuntimeWorld {
  const profileResult = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
  if (!profileResult.ok) throw new Error(profileResult.errors.join('\n'));
  const profile = indexProfiles(profileResult.set).byId.get('char.scribe-apprentice');
  if (profile === undefined) throw new Error('实际开局角色模板缺失');

  const factionResult = parseFactionSet(readJson('../data/base/factions/round-04-factions.json'));
  if (!factionResult.ok) throw new Error(factionResult.errors.join('\n'));
  const factions = indexFactions(factionResult.set).byId;

  const martialResult = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
  if (!martialResult.ok) throw new Error(martialResult.errors.join('\n'));
  const martialArts = indexMartialArts({
    set: martialResult.set,
    factionIds: new Set(factions.keys()),
  }).byId;

  const itemResult = parseItemSet(readJson('../data/base/items/round-06-items.json'));
  if (!itemResult.ok) throw new Error(itemResult.errors.join('\n'));
  const items = indexItems(itemResult.set).byId;

  const questResult = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!questResult.ok) throw new Error(questResult.errors.join('\n'));

  const npcSet = readJson<{ npcs: NpcRecord[] }>(
    '../data/base/characters/round-03-npcs.json',
  ).npcs;
  const npcIds = new Set(npcSet.map((npc) => npc.id));
  const npcByDialogueId = new Map(
    npcSet.flatMap((npc) => npc.dialogueId === undefined ? [] : [[npc.dialogueId, npc.id] as const]),
  );

  const battleSources = [
    parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json')),
    // Round 103 routes the panzhou practice at the east-coast tide-wake looters.
    parseBattleEncounterSet(readJson('../data/base/battles/round-83-east-coast-encounters.json')),
  ];
  const encounterEntries: Array<[string, BattleEncounterData]> = [];
  for (const result of battleSources) {
    if (!result.ok) throw new Error(result.errors.join('\n'));
    for (const entry of result.set.encounters) encounterEntries.push([entry.id, entry]);
  }
  const encounters = new Map(encounterEntries);

  const knowledgeNodes = new Map(
    readJson<{ nodes: KnowledgeNodeData[] }>(
      '../data/base/knowledge_graph/nodes.json',
    ).nodes.map((node) => [node.id, node]),
  );
  const knowledgeNodeIds = new Set(knowledgeNodes.keys());

  const questAssembly = assembleQuests({
    recipeIds: baseRecipeIds,
    questSet: questResult.set,
    questGiverNpcIds: new Set(npcSet.filter((npc) => npc.questGiver).map((npc) => npc.id)),
    npcIds,
    itemIds: new Set(items.keys()),
    encounterIds: new Set(encounters.keys()),
    factionIds: new Set(factions.keys()),
    knowledgeNodeIds,
  });
  if (questAssembly.warnings.length > 0) throw new Error(questAssembly.warnings.join('\n'));

  const conversations = new Map<string, DialogueData>();
  for (const source of [
    readJson('../data/base/dialogues/round-03-conversations.json'),
    readJson('../data/base/dialogues/round-30-conversations.json'),
  ]) {
    const parsed = parseDialogueSet(source);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    for (const conversation of parsed.set.conversations) {
      if (!conversations.has(conversation.id)) conversations.set(conversation.id, conversation);
    }
  }
  const calendar = readJson<{ periods: Array<{ id: string }> }>(
    '../data/base/worldview/calendar.json',
  );
  const companionIds = new Set(
    readJson<{ companions: Array<{ id: string }> }>(
      '../data/base/companions/round-19-companions.json',
    ).companions.map((companion) => companion.id),
  );
  const referenced = assembleDialogueReferences({
    isTeleportDestinationWalkable: baseMapCanEnter,
    conversations,
    quests: questAssembly.quests,
    items,
    placedNpcIds: npcIds,
    knowledgeNodeIds,
    factionIds: new Set(factions.keys()),
    martialArtIds: new Set(martialArts.keys()),
    timeOfDayPeriodIds: new Set(calendar.periods.map((period) => period.id)),
    companionIds,
  });
  if (referenced.warnings.length > 0) throw new Error(referenced.warnings.join('\n'));

  return {
    profile,
    items,
    quests: questAssembly.quests,
    factions,
    martialArts,
    conversations: referenced.conversations,
    npcByDialogueId,
    knowledgeNodes,
    knowledgeNodeIds,
    npcIds,
    periodId: calendar.periods.find((period) => period.id === 'period.midday')?.id ?? calendar.periods[0]!.id,
  };
}

function createRun(world = loadRuntimeWorld()): LiveRun {
  const startingArts = resolveStartingMartialArts(world.profile, world.martialArts);
  if (startingArts.warnings.length > 0) throw new Error(startingArts.warnings.join('\n'));
  const character = createCharacterState({ ...world.profile, startingMartialArtIds: startingArts.ids });
  const startingItems = resolveStartingItems(world.profile, world.items);
  if (startingItems.warnings.length > 0) throw new Error(startingItems.warnings.join('\n'));
  const inventory = createInventoryState(world.profile, startingItems.stacks);
  const journal = createQuestJournal(world.quests);
  const social = createSocialState();
  const knownKnowledgeNodeIds = new Set<string>();
  const context: DialogueRuntimeContext = {
    quests: world.quests,
    journal,
    items: world.items,
    inventory,
    social,
    speakerNpcId: 'char.shen-mohan',
    knownKnowledgeNodeIds,
    knowledgeNodes: world.knowledgeNodes,
    character,
    factions: world.factions,
    martialArts: world.martialArts,
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: world.periodId,
  };
  return { world, character, inventory, journal, social, knownKnowledgeNodeIds, context };
}

function conversation(run: LiveRun, id: string): DialogueData {
  const found = run.world.conversations.get(id);
  if (found === undefined) throw new Error(`实际对白缺失：${id}`);
  return found;
}

function nodeOf(dialogue: DialogueData, nodeId: string) {
  const found = dialogue.nodes.find((node) => node.id === nodeId);
  if (found === undefined) throw new Error(`对白 ${dialogue.id} 缺少节点 ${nodeId}`);
  return found;
}

function findChoicePath(
  run: LiveRun,
  dialogue: DialogueData,
  predicate: (option: DialogueOptionData) => boolean,
): DialogueOptionData[] | null {
  const nodes = new Map(dialogue.nodes.map((node) => [node.id, node]));
  const queue: Array<{ nodeId: string; path: DialogueOptionData[] }> = [
    { nodeId: dialogue.startNodeId, path: [] },
  ];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = nodes.get(current.nodeId);
    if (node === undefined) continue;
    const visible = getVisibleOptions(node, run.context);
    const target = visible.find(({ option }) => predicate(option));
    if (target !== undefined) return [...current.path, target.option];
    for (const { option } of visible) {
      if ((option.effects?.length ?? 0) > 0 || visited.has(option.nextNodeId)) continue;
      if (nodes.has(option.nextNodeId)) {
        queue.push({ nodeId: option.nextNodeId, path: [...current.path, option] });
      }
    }
  }
  return null;
}

function settleQuestUpdate(run: LiveRun, update: QuestUpdateResult): void {
  for (const reward of update.completed) {
    grantExperience(run.world.profile, run.character, reward.experience);
    run.inventory.currency += reward.currency;
    for (const standing of reward.factionRenown ?? []) {
      adjustFactionRenown(run.social, standing.factionId, standing.delta);
    }
    for (const nodeId of reward.discoverKnowledgeNodeIds ?? []) {
      run.knownKnowledgeNodeIds.add(nodeId);
    }
  }
}

/** Walks the real dialogue graph to an option, applying its effects atomically. */
function selectPathToOption(
  run: LiveRun,
  conversationId: string,
  npcId: string,
  predicate: (option: DialogueOptionData) => boolean,
): { session: DialogueSession; option: DialogueOptionData } {
  const dialogue = conversation(run, conversationId);
  run.context.speakerNpcId = npcId;
  const path = findChoicePath(run, dialogue, predicate);
  if (path === null) throw new Error(`实际对白图中找不到满足当前条件的选项：${dialogue.id}`);
  const session = new DialogueSession(dialogue);
  for (const option of path) {
    const selected = getVisibleOptions(session.currentNode, run.context)
      .find((entry) => entry.option === option);
    if (selected === undefined) throw new Error(`对白路径中的选项不再可见：${dialogue.id}/${option.nextNodeId}`);
    if ((option.effects?.length ?? 0) > 0) {
      const result = applyDialogueEffects(option.effects!, run.context);
      if (!result.ok) throw new Error(`对白效果被拒：${result.reason}`);
      settleQuestUpdate(run, result.summary.questUpdate);
    }
    session.choose(selected.index);
  }
  return { session, option: path[path.length - 1]! };
}

function acceptQuestFromBoard(run: LiveRun, questId: string): void {
  const result = acceptQuest(run.world.quests, run.journal, questId, new Map(
    run.inventory.stacks.map((stack) => [stack.itemId, stack.quantity]),
  ), {
    factionId: run.context.factionState.membership?.factionId ?? null,
    knownKnowledgeNodeIds: run.knownKnowledgeNodeIds,
  });
  if (!result.ok) throw new Error(`任务板接取失败：${questId} (${result.reason})`);
  settleQuestUpdate(run, result.update);
}

function talkToQuestNpc(run: LiveRun, npcId: string): QuestUpdateResult {
  const dialogueId = [...run.world.npcByDialogueId].find(([, id]) => id === npcId)?.[0];
  if (dialogueId !== undefined) {
    const session = new DialogueSession(conversation(run, dialogueId));
    run.context.speakerNpcId = npcId;
    expect(session.currentNode.id).toBe(conversation(run, dialogueId).startNodeId);
  }
  const result = applyQuestSignal(run.world.quests, run.journal, { type: 'npc-talk', npcId });
  settleQuestUpdate(run, result);
  return result;
}

function questStatus(run: LiveRun, questId: string): string | undefined {
  return run.journal.states.get(questId)?.status;
}

const PEDDLER_ERRAND = 'quest.r31-peddler-errand';
const FERRY_LEDGER = 'quest.r31-ferry-ledger';

describe('Round 98 设定统一：生成器源与北境输出一致', () => {
  it('照雪关区域、界碑事件、指路与图谱词条在源与 JSON 中一致，当朝大雍、旧碑大梁', () => {
    const generatorSource = readFileSync(
      new URL('../scripts/generate-round92-north-pass.mjs', import.meta.url),
      'utf8',
    );
    const worldMap = readJson<{ regions: Array<{ mapResourceId: string; description: string }>; events: Array<{ id: string; text: string }> }>(
      '../data/base/world/world-map.json',
    );
    const region = worldMap.regions.find((entry) => entry.mapResourceId === 'map.round-92-north-pass');
    expect(region).toBeDefined();
    expect(generatorSource).toContain(region!.description);

    const cairnEvent = worldMap.events.find((entry) => entry.id === 'event.r92-north-cairn');
    expect(cairnEvent).toBeDefined();
    expect(generatorSource).toContain(cairnEvent!.text);

    const northPassDialogues = readJson<{ conversations: Array<{ nodes: Array<{ id: string; text: string }> }> }>(
      '../data/base/dialogues/round-92-north-pass-conversations.json',
    );
    const routeText = northPassDialogues.conversations[0]!.nodes.find((node) => node.id === 'route')!.text;
    expect(generatorSource).toContain(routeText);

    const nodes = readJson<{ nodes: Array<{ id: string; summary: string }> }>(
      '../data/base/knowledge_graph/nodes.json',
    ).nodes;
    for (const nodeId of ['place.r92-north-cairn', 'event.r92-north-cairn']) {
      const summary = nodes.find((node) => node.id === nodeId)?.summary;
      expect(summary).toBeDefined();
      expect(generatorSource).toContain(summary!);
    }

    // 当代口径是大雍，碑面刻字保留前朝大梁遗刻。
    expect(region!.description).toContain('大雍');
    expect(region!.description).toContain('前朝大梁');
    expect(cairnEvent!.text).toContain('大梁北界，至此为限');
    expect(cairnEvent!.text).toContain('前朝大梁');
    expect(routeText).toContain('大雍');

    // 世界设定文档记录了本轮设定决策。
    const worldSetting = readFileSync(
      new URL('../docs/WORLD-SETTING.md', import.meta.url),
      'utf8',
    );
    expect(worldSetting).toContain('当朝统一为大雍');
    expect(worldSetting).toContain('前朝大梁');
  });
});

describe('Round 98 沈墨涵开局：当场阶段性解释与真实指路', () => {
  it('不再承诺子时后巷之约，残篇问询给出纸墨线索与两名可寻人物', () => {
    const run = createRun();
    const dialogue = conversation(run, 'dlg.shen-mohan-bookshop');
    const allOptionTexts = dialogue.nodes.flatMap((node) => (node.options ?? []).map((option) => option.text));
    expect(allOptionTexts.some((text) => text.includes('子时'))).toBe(false);
    expect(dialogue.nodes.some((node) => node.id === 'agree')).toBe(false);

    const { session } = selectPathToOption(run, 'dlg.shen-mohan-bookshop', 'char.shen-mohan',
      (option) => option.text === '愿闻其详。');
    expect(session.currentNode.id).toBe('scroll-assessment');
    expect(nodeOf(dialogue, 'scroll-assessment').text).toContain('水纹纸');

    session.choose(getVisibleOptions(session.currentNode, run.context)
      .find(({ option }) => option.text === '这两条线，能找谁坐实？')!.index);
    expect(session.currentNode.id).toBe('scroll-leads');
    const leads = nodeOf(dialogue, 'scroll-leads').text;
    expect(leads).toContain('白鹭洲');
    expect(leads).toContain('柳听澜');
    expect(leads).toContain('石阶渡口');

    // 阶段性解释本身不发放任何奖励，重复查看幂等。
    expect(run.social.relationships.get('char.shen-mohan')).toBeUndefined();
    expect(run.knownKnowledgeNodeIds.size).toBe(0);
  });

  it('诚实交书结算真实且交出后不可重复', () => {
    const run = createRun();
    expect(countItem(run.inventory, 'item.xisui-canpian')).toBe(1);
    selectPathToOption(run, 'dlg.shen-mohan-bookshop', 'char.shen-mohan',
      (option) => option.text === '掌柜的，残篇就在我身上，现在交给你。');
    expect(countItem(run.inventory, 'item.xisui-canpian')).toBe(0);
    expect(run.social.relationships.get('char.shen-mohan')).toBe(15);
    expect(run.social.morality).toBe(5);
    // 残篇已交出，同一选项按物品条件隐藏，无法重复刷关系。
    const dialogue = conversation(run, 'dlg.shen-mohan-bookshop');
    expect(getVisibleOptions(nodeOf(dialogue, 'about-scroll'), run.context)
      .some(({ option }) => option.text === '掌柜的，残篇就在我身上，现在交给你。')).toBe(false);
  });

  it('威胁交书只有负面结算，没有虚构给银', () => {
    const run = createRun();
    run.social.morality = -6;
    // 声望下限为 0，先垫高再验证 -2 的惩罚真实生效。
    run.social.renown = 10;
    const currencyBefore = run.inventory.currency;
    selectPathToOption(run, 'dlg.shen-mohan-bookshop', 'char.shen-mohan',
      (option) => option.text.startsWith('（把残篇拍在柜上）'));
    expect(countItem(run.inventory, 'item.xisui-canpian')).toBe(0);
    expect(run.social.relationships.get('char.shen-mohan')).toBe(-10);
    expect(run.social.morality).toBe(-16);
    expect(run.social.renown).toBe(8);
    expect(run.inventory.currency).toBe(currencyBefore);
  });

  it('好感问候不再提供可重复的关系增益', () => {
    const run = createRun();
    run.social.morality = 5;
    for (let round = 1; round <= 3; round += 1) {
      selectPathToOption(run, 'dlg.shen-mohan-bookshop', 'char.shen-mohan',
        (option) => option.text === '镇上有人托我，向你问声好。');
      expect(run.social.relationships.get('char.shen-mohan') ?? 0).toBe(0);
    }
  });

  it('残篇已交出的旧存档仍能推进残篇问询', () => {
    const run = createRun();
    removeItems(run.inventory, 'item.xisui-canpian', countItem(run.inventory, 'item.xisui-canpian'));
    const { session } = selectPathToOption(run, 'dlg.shen-mohan-bookshop', 'char.shen-mohan',
      (option) => option.text === '愿闻其详。');
    expect(session.currentNode.id).toBe('scroll-assessment');

    const liuSession = selectPathToOption(run, 'dlg.liu-tinglan-mentor', 'char.liu-tinglan',
      (option) => option.text === '书铺的沈掌柜说，残篇的纸墨要请教先生。');
    expect(liuSession.session.currentNode.id).toBe('canpian-assessment');
    const assessment = nodeOf(conversation(run, 'dlg.liu-tinglan-mentor'), 'canpian-assessment').text;
    expect(assessment).toContain('水纹纸');
    expect(assessment).toContain('渡籍底册');
    // 不揭幕后：不冒称查明写书人或残篇下落。
    expect(assessment).toContain('不替纸猜');
    // 无残页在手只能按转述对照：五年前样纸仅作参照，不断言「同一批」与确切纸龄。
    expect(assessment).toContain('转述');
    expect(assessment).not.toContain('同一批');
    // 无残篇推进同样不发放奖励。
    expect(run.knownKnowledgeNodeIds.size).toBe(0);
    expect(run.social.relationships.get('char.liu-tinglan') ?? 0).toBe(0);
  });
});

describe('Round 98 姜百味：货郎口信三态与帮扶幂等', () => {
  it('货郎口信提供未接/进行/完成提示与出镇方向', () => {
    const run = createRun();
    expect(questStatus(run, PEDDLER_ERRAND)).toBe('offered');
    const offer = selectPathToOption(run, 'dlg.jiang-baiwei-peddler', 'char.jiang-baiwei',
      (option) => option.text === '听说你有句口信要带给渡口的白鹭洲？');
    expect(offer.session.currentNode.id).toBe('r31-peddler-offer');
    expect(nodeOf(conversation(run, 'dlg.jiang-baiwei-peddler'), 'r31-peddler-offer').text)
      .toContain('石阶渡口');
    expect(questStatus(run, PEDDLER_ERRAND)).toBe('active');

    const active = selectPathToOption(run, 'dlg.jiang-baiwei-peddler', 'char.jiang-baiwei',
      (option) => option.text === '给白鹭洲的口信，我正带去渡口。');
    expect(active.session.currentNode.id).toBe('r31-peddler-active');

    talkToQuestNpc(run, 'char.bai-luzhou');
    expect(questStatus(run, PEDDLER_ERRAND)).toBe('completed');
    const done = selectPathToOption(run, 'dlg.jiang-baiwei-peddler', 'char.jiang-baiwei',
      (option) => option.text === '姜老板，白鹭洲那边的口信已经送到了。');
    expect(done.session.currentNode.id).toBe('r31-peddler-done');
    expect(nodeOf(conversation(run, 'dlg.jiang-baiwei-peddler'), 'r31-peddler-done').text)
      .toContain('柳教习');
  });

  it('帮扶货担按关系上界隐藏重复查看，关系跌回门槛内可再见（非一次性）', () => {
    const run = createRun();
    const dialogue = conversation(run, 'dlg.jiang-baiwei-peddler');
    const helpText = '我帮你把货担扶起来。';
    const pillsBefore = countItem(run.inventory, 'item.qingxin-wan');
    selectPathToOption(run, 'dlg.jiang-baiwei-peddler', 'char.jiang-baiwei',
      (option) => option.text === helpText);
    expect(countItem(run.inventory, 'item.qingxin-wan')).toBe(pillsBefore + 1);
    expect(run.social.relationships.get('char.jiang-baiwei')).toBe(5);
    // 重复查看的限制是 npcRelationship ≤ 4 门控，不是一次性标记：
    // 关系在门槛之上时隐藏，同一时点刷不了第二次。
    expect(getVisibleOptions(nodeOf(dialogue, 'wait'), run.context)
      .some(({ option }) => option.text === helpText)).toBe(false);
    // 关系跌回门槛内（≤ 4）时选项重新可见，允许再次帮扶——这是门控边界，非永久一次性。
    run.social.relationships.set('char.jiang-baiwei', 4);
    expect(getVisibleOptions(nodeOf(dialogue, 'wait'), run.context)
      .some(({ option }) => option.text === helpText)).toBe(true);
  });
});

describe('Round 98 白鹭洲：渡口秩序回声与渡籍补录串联', () => {
  it('会盟报备只分享见闻，不再提供重复关系增益', () => {
    const run = createRun();
    run.knownKnowledgeNodeIds.add('event.mist-pact-stalemate');
    const optionText = '药道按轮值成了约，我来报备。';
    for (let round = 1; round <= 2; round += 1) {
      selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
        (option) => option.text === optionText);
      expect(run.social.relationships.get('char.bai-luzhou') ?? 0).toBe(0);
    }
    expect(run.social.npcKnowledge.get('char.bai-luzhou')?.has('event.mist-pact-stalemate')).toBe(true);
  });

  it('货郎口信送达后在渡口得到幂等复述回声（npc-talk 先于面板求值）', () => {
    const run = createRun();
    acceptQuestFromBoard(run, PEDDLER_ERRAND);
    // 实机时序（GridScene.openDialogueWith）：谈话信号先发、面板后求值。
    // 口信送达即完成，白鹭洲的送达回声按 completed 门控呈现（幂等复述文本）。
    talkToQuestNpc(run, 'char.bai-luzhou');
    expect(questStatus(run, PEDDLER_ERRAND)).toBe('completed');
    const received = selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
      (option) => option.text === '姜百味托我带的口信已经带到了：下一批针线茶叶改走水路。');
    expect(received.session.currentNode.id).toBe('r31-peddler-received');
    // 复述不产生任何效果，重复查看幂等。
    expect((received.option.effects ?? []).length).toBe(0);
  });

  it('渡籍补录：解锁、接取、誊正（谈话即完成）、可选复核全链路并引出书院夜课', () => {
    const run = createRun();
    expect(questStatus(run, FERRY_LEDGER)).toBe('locked');
    acceptQuestFromBoard(run, PEDDLER_ERRAND);
    talkToQuestNpc(run, 'char.bai-luzhou');
    expect(questStatus(run, FERRY_LEDGER)).toBe('offered');

    const offer = selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
      (option) => option.text === '渡董，听说渡籍要补录誊正？');
    expect(offer.session.currentNode.id).toBe('r31-ledger-offer');
    const accepted = selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
      (option) => option.text === '誊正的事，交给我。');
    expect(accepted.session.currentNode.id).toBe('r31-ledger-accepted');
    expect(questStatus(run, FERRY_LEDGER)).toBe('active');

    const active = selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
      (option) => option.text === '柳教习誊正的事，我正要回镇里去办。');
    expect(active.session.currentNode.id).toBe('r31-ledger-active');
    expect(nodeOf(conversation(run, 'dlg.bai-luzhou-ferry-master'), 'r31-ledger-active').text)
      .toContain('石阶渡口');

    // 实机时序（GridScene.openDialogueWith）：与柳听澜的对话以 npc-talk 信号开场，
    // 誊正谈话即完成目标；面板求值时差事已是 completed，由 r31-filed（刚誊好）承接。
    // active 门控的 r31-transcribe 数据保留，但完成后的实机首节点不可见。
    talkToQuestNpc(run, 'char.liu-tinglan');
    expect(questStatus(run, FERRY_LEDGER)).toBe('completed');
    const liuDialogue = conversation(run, 'dlg.liu-tinglan-mentor');
    expect(getVisibleOptions(nodeOf(liuDialogue, 'greet'), run.context)
      .some(({ option }) => option.text === '白鹭洲托我请先生誊正渡籍。')).toBe(false);

    const filed = selectPathToOption(run, 'dlg.liu-tinglan-mentor', 'char.liu-tinglan',
      (option) => option.text === '先生，渡籍已经誊好了么？');
    expect(filed.session.currentNode.id).toBe('r31-filed');
    const filedText = nodeOf(liuDialogue, 'r31-filed').text;
    expect(filedText).toContain('刚誊好');
    expect(filedText).not.toContain('归档便好');
    // 完成回应不发放字据类物品，也不要求玩家领取——誊好即自动办妥。
    expect((filed.option.effects ?? []).length).toBe(0);

    const done = selectPathToOption(run, 'dlg.bai-luzhou-ferry-master', 'char.bai-luzhou',
      (option) => option.text === '渡董，柳教习那边渡籍誊好了、用了印。');
    expect(done.session.currentNode.id).toBe('r31-ledger-done');

    // 串联证据：书院夜课（渡籍补录的后续差事）已解锁为可接取。
    expect(questStatus(run, 'quest.r31-academy-nightclass')).toBe('offered');
  });
});
