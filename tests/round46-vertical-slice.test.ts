/** Round 46: real-data playthrough, save/restore, and both R42 outcomes. */

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
import { CombatSession, parseBattleEncounterSet, type BattleEncounterData } from '../src/engine/turn-based-combat';
import { DialogueSession, parseDialogueSet, type DialogueData, type DialogueOptionData } from '../src/engine/dialogue-graph';
import {
  applyDialogueEffects,
  assembleDialogueReferences,
  getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import {
  assembleEndingSet,
  evaluateEndings,
  parseEndingSet,
  selectEnding,
  type AssembledEndingSet,
} from '../src/engine/ending-system';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { type KnowledgeNodeData } from '../src/engine/knowledge-graph';
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
  assembleShops,
  createInventoryState,
  createShopStockRuntime,
  indexItems,
  parseItemSet,
  parseShopSet,
  resolveStartingItems,
  type AssembledShop,
  type InventoryState,
  type ItemRecordData,
  type ShopStockRuntime,
} from '../src/engine/item-system';
import {
  captureSaveSnapshot,
  parseSaveSnapshot,
  planSnapshotRestore,
  restoreRunState,
  type SaveSnapshotV1,
} from '../src/engine/save-system';
import { createSocialState, adjustFactionRenown, type SocialState } from '../src/engine/social-state';

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
  encounters: Map<string, BattleEncounterData>;
  conversations: ReadonlyMap<string, DialogueData>;
  npcByDialogueId: Map<string, string>;
  knowledgeNodes: Map<string, KnowledgeNodeData>;
  knowledgeNodeIds: Set<string>;
  npcIds: Set<string>;
  shops: Map<string, AssembledShop>;
  shopStocks: Map<string, ShopStockRuntime>;
  maps: Map<string, GridMap>;
  map: GridMap;
  endingSet: AssembledEndingSet;
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
  completedEncounters: Set<string>;
  position: { col: number; row: number };
}

function loadRuntimeWorld(): RuntimeWorld {
  const profileResult = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
  if (!profileResult.ok) throw new Error(profileResult.errors.join('\n'));
  const profiles = indexProfiles(profileResult.set);
  const profile = profiles.byId.get('char.scribe-apprentice');
  if (profile === undefined) throw new Error('实际开局角色模板缺失');

  const factionResult = parseFactionSet(readJson('../data/base/factions/round-04-factions.json'));
  if (!factionResult.ok) throw new Error(factionResult.errors.join('\n'));
  const factions = indexFactions(factionResult.set).byId;

  const martialResult = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
  if (!martialResult.ok) throw new Error(martialResult.errors.join('\n'));
  const martialArts = indexMartialArts({ set: martialResult.set, factionIds: new Set(factions.keys()) }).byId;

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

  const battleResult = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
  if (!battleResult.ok) throw new Error(battleResult.errors.join('\n'));
  const encounters = new Map(battleResult.set.encounters.map((encounter) => [encounter.id, encounter]));

  const knowledgeNodes = new Map(
    readJson<{ nodes: KnowledgeNodeData[] }>(
      '../data/base/knowledge_graph/nodes.json',
    ).nodes.map((node) => [node.id, node]),
  );
  const knowledgeNodeIds = new Set(knowledgeNodes.keys());

  const questAssembly = assembleQuests({
    questSet: questResult.set,
    questGiverNpcIds: new Set(npcSet.filter((npc) => npc.questGiver).map((npc) => npc.id)),
    npcIds,
    itemIds: new Set(items.keys()),
    encounterIds: new Set(encounters.keys()),
    factionIds: new Set(factions.keys()),
    knowledgeNodeIds,
  });

  const dialogueSources = [
    readJson('../data/base/dialogues/round-03-conversations.json'),
    readJson('../data/base/dialogues/round-30-conversations.json'),
  ];
  const conversations = new Map<string, DialogueData>();
  for (const source of dialogueSources) {
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
  const referencedDialogues = assembleDialogueReferences({
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

  const shopResult = parseShopSet(readJson('../data/base/shops/round-06-shops.json'));
  if (!shopResult.ok) throw new Error(shopResult.errors.join('\n'));
  const shopAssembly = assembleShops({
    shopSet: shopResult.set,
    placedNpcIds: npcIds,
    items,
  });
  const shopStocks = new Map(
    [...shopAssembly.shops].map(([shopId, shop]) => [shopId, createShopStockRuntime(shop)]),
  );

  const mapSources = [
    readJson('../data/base/maps/round-01-grid.json'),
    readJson('../data/base/maps/round-10-mist-ferry.json'),
  ];
  const maps = new Map<string, GridMap>();
  for (const source of mapSources) {
    const parsed = parseGridMap(source);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    maps.set(parsed.map.data.id, parsed.map);
  }
  const map = maps.get('map.round-01-grid');
  if (map === undefined) throw new Error('实际开局地图缺失');

  const endingResult = parseEndingSet(readJson('../data/base/endings/round-27-endings.json'));
  if (!endingResult.ok) throw new Error(endingResult.errors.join('\n'));
  const endingAssembly = assembleEndingSet({
    set: endingResult.set,
    maps,
    blockedCells: new Map([...maps.keys()].map((mapId) => [mapId, new Set<string>()])),
    knowledgeNodes,
    questIds: new Set(questAssembly.quests.keys()),
    npcIds,
    factionIds: new Set(factions.keys()),
  });
  if (endingAssembly.endingSet === null) throw new Error(endingAssembly.warnings.join('\n'));

  return {
    profile,
    items,
    quests: questAssembly.quests,
    factions,
    martialArts,
    encounters,
    conversations: referencedDialogues.conversations,
    npcByDialogueId,
    knowledgeNodes,
    knowledgeNodeIds,
    npcIds,
    shops: shopAssembly.shops,
    shopStocks,
    maps,
    map,
    endingSet: endingAssembly.endingSet,
    periodId: calendar.periods.find((period) => period.id === 'period.midday')?.id ?? calendar.periods[0]!.id,
  };
}

function createRun(world = loadRuntimeWorld()): LiveRun {
  const startingArts = resolveStartingMartialArts(world.profile, world.martialArts);
  if (startingArts.warnings.length > 0) throw new Error(startingArts.warnings.join('\n'));
  const character = createCharacterState({
    ...world.profile,
    startingMartialArtIds: startingArts.ids,
  });
  const startingItems = resolveStartingItems(world.profile, world.items);
  if (startingItems.warnings.length > 0) throw new Error(startingItems.warnings.join('\n'));
  const inventory = createInventoryState(world.profile, startingItems.stacks);
  const journal = createQuestJournal(world.quests);
  const social = createSocialState();
  const knownKnowledgeNodeIds = new Set<string>();
  const factionState = createFactionMembershipState();
  const context: DialogueRuntimeContext = {
    quests: world.quests,
    journal,
    items: world.items,
    inventory,
    social,
    speakerNpcId: 'char.bai-luzhou',
    knownKnowledgeNodeIds,
    knowledgeNodes: world.knowledgeNodes,
    character,
    factions: world.factions,
    martialArts: world.martialArts,
    factionState,
    timeOfDayPeriodId: world.periodId,
  };
  return {
    world,
    character,
    inventory,
    journal,
    social,
    knownKnowledgeNodeIds,
    context,
    completedEncounters: new Set(),
    position: { ...world.map.playerStart },
  };
}

function conversation(run: LiveRun, id: string): DialogueData {
  const found = run.world.conversations.get(id);
  if (found === undefined) throw new Error(`实际对白缺失：${id}`);
  return found;
}

function optionHasEffect(option: DialogueOptionData, kind: string, key?: string, value?: string): boolean {
  return (option.effects ?? []).some((effect) => {
    if (effect.kind !== kind) return false;
    if (key === undefined) return true;
    return (effect as unknown as Record<string, unknown>)[key] === value;
  });
}

interface DialogueChoice {
  conversationId: string;
  npcId: string;
  option: DialogueOptionData;
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

function selectCurrentOption(
  run: LiveRun,
  session: DialogueSession,
  predicate: (option: DialogueOptionData) => boolean,
): { option: DialogueOptionData; effectResult: ReturnType<typeof applyDialogueEffects> | null } {
  const visible = getVisibleOptions(session.currentNode, run.context);
  const selected = visible.find(({ option }) => predicate(option));
  if (selected === undefined) {
    throw new Error(`当前对白节点「${session.currentNode.id}」没有符合条件的可见选项`);
  }
  let effectResult: ReturnType<typeof applyDialogueEffects> | null = null;
  if ((selected.option.effects?.length ?? 0) > 0) {
    effectResult = applyDialogueEffects(selected.option.effects!, run.context);
    if (!effectResult.ok) throw new Error(`对白效果被拒：${effectResult.reason}`);
    settleQuestUpdate(run, effectResult.summary.questUpdate);
  }
  session.choose(selected.index);
  return { option: selected.option, effectResult };
}

function selectDialogueOption(
  run: LiveRun,
  choice: DialogueChoice,
): { session: DialogueSession; effectResult: ReturnType<typeof applyDialogueEffects> | null } {
  const dialogue = conversation(run, choice.conversationId);
  run.context.speakerNpcId = choice.npcId;
  const session = new DialogueSession(dialogue);
  const path = findChoicePath(run, dialogue, (option) => option === choice.option);
  if (path === null) throw new Error(`无法从起始节点到达对白选项：${dialogue.id}`);
  let effectResult: ReturnType<typeof applyDialogueEffects> | null = null;
  for (const option of path) {
    const selected = getVisibleOptions(session.currentNode, run.context)
      .find((entry) => entry.option === option);
    if (selected === undefined) throw new Error(`对白路径中的选项不再可见：${dialogue.id}/${option.nextNodeId}`);
    if ((option.effects?.length ?? 0) > 0) {
      effectResult = applyDialogueEffects(option.effects!, run.context);
      if (!effectResult.ok) throw new Error(`对白效果被拒：${effectResult.reason}`);
      settleQuestUpdate(run, effectResult.summary.questUpdate);
    }
    session.choose(selected.index);
  }
  return { session, effectResult };
}

function selectPathToOption(
  run: LiveRun,
  conversationId: string,
  npcId: string,
  predicate: (option: DialogueOptionData) => boolean,
): { session: DialogueSession; option: DialogueOptionData; effectResult: ReturnType<typeof applyDialogueEffects> | null } {
  const dialogue = conversation(run, conversationId);
  run.context.speakerNpcId = npcId;
  const path = findChoicePath(run, dialogue, predicate);
  if (path === null) throw new Error(`实际对白图中找不到满足当前条件的选项：${dialogue.id}`);
  const selected = path[path.length - 1]!;
  const result = selectDialogueOption(run, { conversationId, npcId, option: selected });
  return { ...result, option: selected };
}

function findDialogueChoice(
  run: LiveRun,
  predicate: (option: DialogueOptionData) => boolean,
): DialogueChoice {
  for (const dialogue of run.world.conversations.values()) {
    const npcId = run.world.npcByDialogueId.get(dialogue.id);
    if (npcId === undefined) continue;
    const path = findChoicePath(run, dialogue, predicate);
    const option = path?.at(-1);
    if (option !== undefined) return { conversationId: dialogue.id, npcId, option };
  }
  throw new Error('当前真实资料中找不到符合条件的对白选项');
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
  const dialogueId = [...run.world.npcByDialogueId]
    .find(([, id]) => id === npcId)?.[0];
  if (dialogueId !== undefined) {
    // Enter the actual conversation before the same NPC-talk signal the scene emits on interaction.
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

function createSaveReferences(run: LiveRun) {
  const questObjectiveIds = new Map(
    [...run.world.quests].map(([questId, quest]) => [
      questId,
      new Set(quest.objectives.map((objective) => objective.id)),
    ]),
  );
  const factionMentorNpcIds = new Map(
    [...run.world.factions].map(([factionId, faction]) => [factionId, new Set(faction.mentorNpcIds)]),
  );
  return {
    profileIds: new Set([run.world.profile.id]),
    profileRecords: new Map([[run.world.profile.id, run.world.profile]]),
    mapResourceId: run.world.map.data.id,
    isWalkableCell: (col: number, row: number) => run.world.map.canEnter(col, row),
    isCellOccupied: (_col: number, _row: number) => false,
    itemIds: new Set(run.world.items.keys()),
    itemRecords: run.world.items,
    martialArtIds: new Set(run.world.martialArts.keys()),
    questIds: new Set(run.world.quests.keys()),
    questObjectiveIds,
    encounterIds: new Set(run.world.encounters.keys()),
    shopIds: new Set(run.world.shops.keys()),
    shopRecords: run.world.shops,
    questRecords: run.world.quests,
    npcIds: run.world.npcIds,
    regionalEventIds: new Set<string>(),
    knowledgeNodeIds: run.world.knowledgeNodeIds,
    defaultKnowledgeNodeIds: new Set<string>(),
    factionIds: new Set(run.world.factions.keys()),
    factionMentorNpcIds,
  };
}

function captureRun(run: LiveRun): SaveSnapshotV1 {
  const snapshot = captureSaveSnapshot({
    displayName: '纵向验收学徒',
    mapResourceId: run.world.map.data.id,
    playerCol: run.position.col,
    playerRow: run.position.row,
    character: run.character,
    inventory: run.inventory,
    shopStocks: run.world.shopStocks,
    journal: run.journal,
    social: run.social,
    completedEncounters: run.completedEncounters,
    completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: run.knownKnowledgeNodeIds,
    elapsedGameMinutes: 4,
    worldSeed: 46,
    factionMembership: run.context.factionState.membership,
    now: () => new Date('2026-09-28T04:00:00.000Z'),
  });
  const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const plan = planSnapshotRestore(parsed.snapshot, createSaveReferences(run));
  if (!plan.ok) throw new Error(plan.errors.join('\n'));
  expect(plan.warnings).toEqual([]);
  expect(plan.snapshot.quests.trackedQuestId).toBeNull();
  return plan.snapshot;
}

function restoreRun(world: RuntimeWorld, snapshot: SaveSnapshotV1): LiveRun {
  const restored = restoreRunState({
    profile: world.profile,
    items: world.items,
    quests: world.quests,
    shops: world.shops,
    snapshot,
  });
  const factionState = createFactionMembershipState(restored.factionMembership);
  const knownKnowledgeNodeIds = new Set(restored.knownKnowledgeNodeIds);
  const context: DialogueRuntimeContext = {
    quests: world.quests,
    journal: restored.journal,
    items: world.items,
    inventory: restored.inventory,
    social: restored.social,
    speakerNpcId: 'char.bai-luzhou',
    knownKnowledgeNodeIds,
    knowledgeNodes: world.knowledgeNodes,
    character: restored.character,
    factions: world.factions,
    martialArts: world.martialArts,
    factionState,
    timeOfDayPeriodId: world.periodId,
  };
  return {
    world,
    character: restored.character,
    inventory: restored.inventory,
    journal: restored.journal,
    social: restored.social,
    knownKnowledgeNodeIds,
    context,
    completedEncounters: new Set(restored.completedEncounters),
    position: { ...snapshot.playerPosition },
  };
}

function completeR31Prerequisites(run: LiveRun): void {
  acceptQuestFromBoard(run, 'quest.r31-peddler-errand');
  talkToQuestNpc(run, 'char.bai-luzhou');
  expect(questStatus(run, 'quest.r31-peddler-errand')).toBe('completed');
  acceptQuestFromBoard(run, 'quest.r31-ferry-ledger');
  talkToQuestNpc(run, 'char.liu-tinglan');
  expect(questStatus(run, 'quest.r31-ferry-ledger')).toBe('completed');
}

function prepareR42CommonRoute(run: LiveRun): void {
  completeR31Prerequisites(run);

  selectPathToOption(
    run,
    'dlg.bai-luzhou-ferry-master',
    'char.bai-luzhou',
    (option) => option.conditions?.some((condition) =>
      condition.kind === 'questStatus' &&
      condition.questId === 'quest.r42-ledger-audit' &&
      condition.status === 'offered',
    ) === true,
  );
  selectPathToOption(
    run,
    'dlg.bai-luzhou-ferry-master',
    'char.bai-luzhou',
    (option) => optionHasEffect(option, 'acceptQuest', 'questId', 'quest.r42-ledger-audit'),
  );
  expect(questStatus(run, 'quest.r42-ledger-audit')).toBe('active');
  talkToQuestNpc(run, 'char.liu-tinglan');
  expect(questStatus(run, 'quest.r42-ledger-audit')).toBe('completed');

  selectPathToOption(
    run,
    'dlg.liu-tinglan-mentor',
    'char.liu-tinglan',
    (option) => optionHasEffect(option, 'discoverKnowledgeNode', 'nodeId', 'event.r42-faded-register'),
  );
  selectPathToOption(
    run,
    'dlg.liu-tinglan-mentor',
    'char.liu-tinglan',
    (option) => optionHasEffect(option, 'acceptQuest', 'questId', 'quest.r42-two-witnesses'),
  );
  expect(questStatus(run, 'quest.r42-two-witnesses')).toBe('active');

  selectPathToOption(
    run,
    'dlg.gu-yechen-roadside',
    'char.gu-yechen',
    (option) => optionHasEffect(option, 'discoverKnowledgeNode', 'nodeId', 'event.r42-gu-tide-account'),
  );
  talkToQuestNpc(run, 'char.gu-yechen');
  selectPathToOption(
    run,
    'dlg.zhu-jiuxian-mentor',
    'char.zhu-jiuxian',
    (option) => optionHasEffect(option, 'discoverKnowledgeNode', 'nodeId', 'event.r42-zhu-ferry-seal'),
  );
  const witnesses = talkToQuestNpc(run, 'char.zhu-jiuxian');
  expect(witnesses.completed.map((reward) => reward.questId)).toContain('quest.r42-two-witnesses');
  expect(questStatus(run, 'quest.r42-seal-rubbing')).toBe('offered');

  const rubbingOffer = selectPathToOption(
    run,
    'dlg.gu-yechen-roadside',
    'char.gu-yechen',
    (option) => optionHasEffect(option, 'acceptQuest', 'questId', 'quest.r42-seal-rubbing'),
  );
  expect(rubbingOffer.session.currentNode.id).toBe('r42-rubbing-offer');
  selectCurrentOption(
    run,
    rubbingOffer.session,
    (option) => optionHasEffect(option, 'giveItem', 'itemId', 'item.r42-ferry-seal-rubbing'),
  );
  expect(run.inventory.stacks.some((stack) =>
    stack.itemId === 'item.r42-ferry-seal-rubbing' && stack.quantity === 1,
  )).toBe(true);
  expect(questStatus(run, 'quest.r42-seal-rubbing')).toBe('completed');
  expect(questStatus(run, 'quest.r42-open-register')).toBe('offered');
  expect(questStatus(run, 'quest.r42-protect-witness')).toBe('offered');
}

function endingContext(run: LiveRun) {
  return {
    questStatuses: new Map([...run.journal.states].map(([id, state]) => [id, state.status])),
    social: run.social,
    factionMembership: run.context.factionState.membership,
    knownKnowledgeNodeIds: run.knownKnowledgeNodeIds,
  };
}

function finishEndingRoute(run: LiveRun, route: 'public' | 'protect'): string {
  const questId = route === 'public' ? 'quest.r42-open-register' : 'quest.r42-protect-witness';
  const otherQuestId = route === 'public' ? 'quest.r42-protect-witness' : 'quest.r42-open-register';
  const targetNpcId = route === 'public' ? 'char.liu-tinglan' : 'char.zhu-jiuxian';
  const dialogueId = route === 'public' ? 'dlg.liu-tinglan-mentor' : 'dlg.zhu-jiuxian-mentor';
  const vowNodeId = route === 'public'
    ? 'event.r42-public-record-vow'
    : 'event.r42-protected-witness-vow';
  const endingId = route === 'public'
    ? 'ending.r42-open-register'
    : 'ending.r42-sheltered-witness';
  const otherEndingId = route === 'public'
    ? 'ending.r42-sheltered-witness'
    : 'ending.r42-open-register';

  selectPathToOption(
    run,
    'dlg.bai-luzhou-ferry-master',
    'char.bai-luzhou',
    (option) => optionHasEffect(option, 'acceptQuest', 'questId', questId),
  );
  expect(questStatus(run, questId)).toBe('active');
  expect(questStatus(run, otherQuestId)).toBe('failed');
  const completed = talkToQuestNpc(run, targetNpcId);
  expect(completed.completed.map((reward) => reward.questId)).toContain(questId);
  selectPathToOption(
    run,
    dialogueId,
    targetNpcId,
    (option) => optionHasEffect(option, 'discoverKnowledgeNode', 'nodeId', vowNodeId),
  );

  const endings = evaluateEndings(run.world.endingSet, endingContext(run));
  const r42Availability = endings
    .filter(({ ending }) => ending.id === 'ending.r42-open-register' || ending.id === 'ending.r42-sheltered-witness')
    .filter((ending) => ending.available)
    .map((ending) => ending.ending.id);
  expect(r42Availability).toEqual([endingId]);
  expect(selectEnding(run.world.endingSet, endingId, endingContext(run))).toMatchObject({
    ok: true,
    ending: { id: endingId },
  });
  expect(selectEnding(run.world.endingSet, otherEndingId, endingContext(run)).ok).toBe(false);
  return endingId;
}

describe('Round 46 real-data vertical slice', () => {
  it('loads the actual starting profile and rejects solid and out-of-bounds map steps', () => {
    const world = loadRuntimeWorld();
    const run = createRun(world);
    const start = world.map.playerStart;
    expect(run.character.profileId).toBe('char.scribe-apprentice');
    expect(world.quests.size).toBeGreaterThanOrEqual(20);
    expect(world.conversations.size).toBeGreaterThan(10);
    expect(world.map.canEnter(start.col, start.row)).toBe(true);
    expect(world.map.canEnter(start.col + 1, start.row)).toBe(true);
    expect(world.map.canEnter(start.col, start.row + 1)).toBe(false);
    expect(world.map.canEnter(-1, start.row)).toBe(false);
  });

  it('starts, moves, talks, fights, learns, acquires an item, saves, restores and continues to both endings', () => {
    const world = loadRuntimeWorld();
    const run = createRun(world);
    const start = world.map.playerStart;
    expect(world.map.canEnter(start.col, start.row)).toBe(true);
    const openStep = { col: start.col + 1, row: start.row };
    const blockedStep = { col: start.col, row: start.row + 1 };
    expect(world.map.canEnter(openStep.col, openStep.row)).toBe(true);
    expect(world.map.canEnter(blockedStep.col, blockedStep.row)).toBe(false);
    run.position = openStep;
    run.position = start;

    const clearAlleyChoice = findDialogueChoice(
      run,
      (option) => optionHasEffect(option, 'acceptQuest', 'questId', 'quest.round-07-clear-alley'),
    );
    selectDialogueOption(run, clearAlleyChoice);
    expect(questStatus(run, 'quest.round-07-clear-alley')).toBe('active');

    const encounter = world.encounters.get('encounter.alley-blade-bully');
    expect(encounter).toBeDefined();
    const battle = new CombatSession({
      encounter: encounter!,
      profile: world.profile,
      player: run.character,
      martialArts: world.martialArts,
    });
    for (let turn = 0; !battle.isOver && turn < 20; turn += 1) {
      const art = battle.playerActions.find((action) => action.affordable && action.art.combat.kind === 'attack')?.art;
      expect(art, '开局角色应有可用攻击招式').toBeDefined();
      expect(battle.playerUse(art!.id).ok).toBe(true);
    }
    expect(battle.finalResult?.outcome).toBe('victory');
    expect(battle.finalResult!.experienceGained).toBe(encounter!.victoryExperience);
    run.completedEncounters.add(encounter!.id);
    const alleyResult = applyQuestSignal(world.quests, run.journal, {
      type: 'encounter-victory',
      encounterId: encounter!.id,
    });
    settleQuestUpdate(run, alleyResult);
    expect(alleyResult.completed.map((reward) => reward.questId)).toContain('quest.round-07-clear-alley');
    expect(questStatus(run, 'quest.round-07-clear-alley')).toBe('completed');

    prepareR42CommonRoute(run);
    expect(run.inventory.stacks.some((stack) => stack.itemId === 'item.r42-ferry-seal-rubbing')).toBe(true);

    // Reach an actual mentor teaching branch using the current character's earned attributes and faction admission.
    const factionJoin = findDialogueChoice(
      run,
      (option) => optionHasEffect(option, 'joinFaction', 'factionId', 'faction.yunyin-shanzhuang'),
    );
    selectDialogueOption(run, factionJoin);
    expect(run.context.factionState.membership?.factionId).toBe('faction.yunyin-shanzhuang');
    const mentorId = factionJoin.npcId;
    const lessonEntry = selectPathToOption(
      run,
      factionJoin.conversationId,
      mentorId,
      (option) => option.nextNodeId === 'r32-lessons',
    );
    const learned = selectCurrentOption(
      run,
      lessonEntry.session,
      (option) => optionHasEffect(option, 'learnMartialArt') &&
        option.effects?.some((effect) => effect.kind === 'learnMartialArt' &&
          !run.character.martialArtIds.includes(effect.martialArtId)) === true,
    );
    expect(learned.effectResult?.ok).toBe(true);
    const learnedArtId = learned.option.effects?.find((effect) => effect.kind === 'learnMartialArt')?.martialArtId;
    expect(learnedArtId).toBeDefined();
    expect(run.character.martialArtIds).toContain(learnedArtId);

    const snapshot = captureRun(run);
    expect(snapshot.inventory.stacks.some((stack) => stack.itemId === 'item.r42-ferry-seal-rubbing')).toBe(true);
    expect(snapshot.player.martialArtIds).toContain(learnedArtId);
    expect(snapshot.quests.states.find((state) => state.questId === 'quest.r42-seal-rubbing')?.status)
      .toBe('completed');

    const publicRun = restoreRun(world, snapshot);
    const protectedRun = restoreRun(world, snapshot);
    for (const restored of [publicRun, protectedRun]) {
      expect(restored.character.profileId).toBe(world.profile.id);
      expect(restored.character.martialArtIds).toContain(learnedArtId);
      expect(restored.inventory.stacks.some((stack) => stack.itemId === 'item.r42-ferry-seal-rubbing')).toBe(true);
      expect(questStatus(restored, 'quest.r42-seal-rubbing')).toBe('completed');
      expect(restored.context.factionState.membership?.factionId).toBe('faction.yunyin-shanzhuang');
    }

    expect(finishEndingRoute(publicRun, 'public')).toBe('ending.r42-open-register');
    expect(finishEndingRoute(protectedRun, 'protect')).toBe('ending.r42-sheltered-witness');
  });
});
