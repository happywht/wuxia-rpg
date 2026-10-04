import { baseRecipeIds } from './support/base-recipe-ids';
import { baseMapCanEnter } from './support/base-map-walkability';
/**
 * Round 59: regional quest echoes in the seven NPCs' condition-gated
 * dialogue. Everything runs against the real base quest/dialogue data —
 * parse, cross-resource assembly, status-driven visibility and the true
 * npc-talk-then-evaluate call order the scene uses (see
 * `GridScene.openDialogueWith`: the talk signal settles first, the first
 * node's options are evaluated against the updated journal afterwards).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  indexFactions,
  indexMartialArts,
  parseFactionSet,
  parseMartialArtSet,
  type FactionData,
  type MartialArtData,
} from '../src/engine/character-progression';
import { DialogueSession, parseDialogueSet, validateConversation, type DialogueData } from '../src/engine/dialogue-graph';
import {
  assembleDialogueReferences,
  getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { parseKnowledgeNodeSet, assembleKnowledgeGraph, parseKnowledgeEdgeSet } from '../src/engine/knowledge-graph';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
  type QuestData,
  type QuestJournal,
  type QuestStatus,
} from '../src/engine/quest-system';
import { indexItems, parseItemSet, type ItemRecordData } from '../src/engine/item-system';
import { createSocialState } from '../src/engine/social-state';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function requireParsed<T extends { ok: boolean }>(result: T, label: string): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`${label} should parse successfully`);
}

// ---------------------------------------------------------------------------
// Real base data: quests, dialogues and every id universe assembly needs.
// ---------------------------------------------------------------------------

const questParse = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
requireParsed(questParse, 'Quest set');

const rawNpcs = readJson('../data/base/characters/round-03-npcs.json') as {
  npcs: Array<{ id: string; questGiver?: boolean }>;
};
const npcIds = new Set(rawNpcs.npcs.map((npc) => npc.id));
const questGiverNpcIds = new Set(rawNpcs.npcs.filter((npc) => npc.questGiver).map((npc) => npc.id));

const rawEncounters = [
  readJson('../data/base/battles/round-05-encounters.json') as { encounters: Array<{ id: string }> },
  // Round 103 routes the panzhou practice at the east-coast tide-wake looters.
  readJson('../data/base/battles/round-83-east-coast-encounters.json') as { encounters: Array<{ id: string }> },
].flatMap((source) => source.encounters);

const itemResult = parseItemSet(readJson('../data/base/items/round-06-items.json'));
requireParsed(itemResult, 'Item set');
const items = indexItems(itemResult.set).byId as Map<string, ItemRecordData>;

const factionResult = parseFactionSet(readJson('../data/base/factions/round-04-factions.json'));
requireParsed(factionResult, 'Faction set');
const factions = indexFactions(factionResult.set).byId as Map<string, FactionData>;

const martialResult = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
requireParsed(martialResult, 'Martial art set');
const martialArts = indexMartialArts({
  set: martialResult.set,
  factionIds: new Set(factions.keys()),
}).byId as Map<string, MartialArtData>;

const nodeParse = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
requireParsed(nodeParse, 'Knowledge nodes');
const edgeParse = parseKnowledgeEdgeSet(readJson('../data/base/knowledge_graph/edges.json'));
requireParsed(edgeParse, 'Knowledge edges');
const graph = assembleKnowledgeGraph(nodeParse.data, edgeParse.data);

const calendar = readJson('../data/base/worldview/calendar.json') as {
  periods: Array<{ id: string }>;
};
const companions = readJson('../data/base/companions/round-19-companions.json') as {
  companions: Array<{ id: string }>;
};

const questAssembly = assembleQuests({
    recipeIds: baseRecipeIds,
  questSet: questParse.set,
  questGiverNpcIds,
  npcIds,
  itemIds: new Set(items.keys()),
  encounterIds: new Set(rawEncounters.map((encounter) => encounter.id)),
  factionIds: new Set(factions.keys()),
  knowledgeNodeIds: new Set(graph.nodes.keys()),
});

const dialogueSources = [
  readJson('../data/base/dialogues/round-03-conversations.json'),
  readJson('../data/base/dialogues/round-30-conversations.json'),
  readJson('../data/base/dialogues/round-67-conversations.json'),
];
const rawConversations = new Map<string, DialogueData>();
for (const source of dialogueSources) {
  const parsed = parseDialogueSet(source);
  requireParsed(parsed, 'Dialogue set');
  for (const conversation of parsed.set.conversations) {
    if (!rawConversations.has(conversation.id)) rawConversations.set(conversation.id, conversation);
  }
}

const dialogueAssembly = assembleDialogueReferences({
  isTeleportDestinationWalkable: baseMapCanEnter,
  conversations: rawConversations,
  quests: questAssembly.quests,
  items,
  placedNpcIds: npcIds,
  knowledgeNodeIds: new Set(graph.nodes.keys()),
  factionIds: new Set(factions.keys()),
  martialArtIds: new Set(martialArts.keys()),
  timeOfDayPeriodIds: new Set(calendar.periods.map((period) => period.id)),
  companionIds: new Set(companions.companions.map((companion) => companion.id)),
});

// ---------------------------------------------------------------------------
// The seven regional echo pairs: (speaker, quest, active/done node ids).
// ---------------------------------------------------------------------------

interface EchoSpec {
  dialogueId: string;
  speakerNpcId: string;
  questId: string;
  activeNodeId: string;
  doneNodeId: string;
}

const ECHO_SPECS: EchoSpec[] = [
  {
    dialogueId: 'dlg.shi-bei-mentor',
    speakerNpcId: 'char.shi-bei',
    questId: 'quest.r58-market-discovery',
    activeNodeId: 'r58-market-discovery-active',
    doneNodeId: 'r58-market-discovery-done',
  },
  {
    dialogueId: 'dlg.shi-bei-mentor',
    speakerNpcId: 'char.shi-bei',
    questId: 'quest.r58-market-stall-pact',
    activeNodeId: 'r58-stall-pact-active',
    doneNodeId: 'r58-stall-pact-done',
  },
  {
    dialogueId: 'dlg.bai-luzhou-ferry-master',
    speakerNpcId: 'char.bai-luzhou',
    questId: 'quest.r58-market-stall-pact',
    activeNodeId: 'r58-stall-pact-charter',
    doneNodeId: 'r58-stall-pact-logged',
  },
  {
    dialogueId: 'dlg.zhu-jiuxian-mentor',
    speakerNpcId: 'char.zhu-jiuxian',
    questId: 'quest.r58-market-toll-squabble',
    activeNodeId: 'r58-toll-squabble-active',
    doneNodeId: 'r58-toll-squabble-done',
  },
  {
    dialogueId: 'dlg.ma-shangyi-notice-board',
    speakerNpcId: 'char.ma-shangyi',
    questId: 'quest.r58-south-hamlet-survey',
    activeNodeId: 'r58-hamlet-survey-active',
    doneNodeId: 'r58-hamlet-survey-done',
  },
  {
    dialogueId: 'dlg.lu-zhenniang-teastall',
    speakerNpcId: 'char.lu-zhenniang',
    questId: 'quest.r58-south-hamlet-supply',
    activeNodeId: 'r58-supply-active',
    doneNodeId: 'r58-supply-done',
  },
  {
    dialogueId: 'dlg.jiang-baiwei-peddler',
    speakerNpcId: 'char.jiang-baiwei',
    questId: 'quest.r58-south-hamlet-supply',
    activeNodeId: 'r58-peddler-supply-active',
    doneNodeId: 'r58-peddler-supply-done',
  },
  {
    dialogueId: 'dlg.gu-yechen-roadside',
    speakerNpcId: 'char.gu-yechen',
    questId: 'quest.r58-pond-bandit-camp',
    activeNodeId: 'r58-pond-active',
    doneNodeId: 'r58-pond-done',
  },
];

const PERIOD_ID = calendar.periods.find((period) => period.id === 'period.midday')?.id ??
  calendar.periods[0]!.id;

/** Builds a runtime context sharing `journal` so quest signals show up live. */
function contextFor(speakerNpcId: string, journal: QuestJournal): DialogueRuntimeContext {
  return {
    quests: questAssembly.quests,
    journal,
    items,
    inventory: null,
    social: createSocialState(),
    speakerNpcId,
    knownKnowledgeNodeIds: new Set<string>(),
    knowledgeNodes: graph.nodes,
    character: null,
    factions,
    martialArts,
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: PERIOD_ID,
  };
}

/**
 * Drives one quest into `status` through the real journal: prerequisites
 * complete first, the quest itself settles to the requested status.
 */
function forceQuestStatus(quests: ReadonlyMap<string, QuestData>, journal: QuestJournal, questId: string, status: QuestStatus): void {
  const quest = quests.get(questId);
  if (quest === undefined) throw new Error(`unknown quest ${questId}`);
  for (const prerequisiteId of quest.prerequisiteQuestIds) {
    const state = journal.states.get(prerequisiteId);
    if (state === undefined) throw new Error(`unknown prerequisite ${prerequisiteId}`);
    state.status = 'completed';
    for (const objective of quests.get(prerequisiteId)!.objectives) {
      state.objectiveCounts.set(objective.id, objective.requiredCount);
    }
  }
  const state = journal.states.get(questId);
  if (state === undefined) throw new Error(`unknown quest state ${questId}`);
  if (status === 'offered') {
    state.status = 'offered';
    return;
  }
  state.status = 'active';
  for (const objective of quest.objectives) {
    state.objectiveCounts.set(objective.id, status === 'completed' ? objective.requiredCount : 0);
  }
  if (status === 'completed') {
    state.status = 'completed';
  } else if (status === 'failed') {
    state.status = 'failed';
  }
}

/** Visible first-node option target ids of one conversation under `context`. */
function visibleStartTargets(conversation: DialogueData, context: DialogueRuntimeContext): Set<string> {
  const session = new DialogueSession(conversation);
  return new Set(
    getVisibleOptions(session.currentNode, context).map(({ option }) => option.nextNodeId),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Round 59 regional dialogue echoes', () => {
  it('parses real base data and assembles quests and dialogue references without warnings', () => {
    expect(graph.warnings).toEqual([]);
    expect(graph.nodes.size).toBe(432); // R255 caravan-route outcomes + R271 two hand-delivery events + the R261 river-lantern appointment event + the R279 roadside keeper.
    expect(graph.nodes.has('event.r31-river-lantern-time-agreed')).toBe(true); // Stable id anchors the R261 addition.
    expect(questAssembly.warnings).toEqual([]);
    expect(questAssembly.quests.size).toBe(44);
    expect(dialogueAssembly.warnings).toEqual([]);

    // Both conversation files parse without disabled conversations.
    for (const source of dialogueSources) {
      const parsed = parseDialogueSet(source);
      requireParsed(parsed, 'Dialogue set');
      expect(parsed.warnings).toEqual([]);
    }

    // The seven touched conversations survive assembly (no dangling refs)
    // and their graphs stay valid.
    for (const spec of ECHO_SPECS) {
      const conversation = dialogueAssembly.conversations.get(spec.dialogueId);
      expect(conversation, spec.dialogueId).toBeDefined();
      expect(validateConversation(conversation!)).toEqual([]);
    }
  });

  it('adds exactly one active and one completed echo per pair, gated only by questStatus and free of effects', () => {
    // New r58 node ids must be globally unique across both dialogue files
    // (pre-existing node ids like "greet" are only unique per conversation).
    const newNodeOwners = new Map<string, string>();
    for (const [conversationId, conversation] of dialogueAssembly.conversations) {
      for (const node of conversation.nodes) {
        if (!node.id.startsWith('r58-')) continue;
        if (newNodeOwners.has(node.id)) {
          throw new Error(`node id "${node.id}" is not unique (also in ${newNodeOwners.get(node.id)})`);
        }
        newNodeOwners.set(node.id, conversationId);
      }
    }
    expect(newNodeOwners.size).toBe(16);

    for (const spec of ECHO_SPECS) {
      const conversation = dialogueAssembly.conversations.get(spec.dialogueId)!;
      const start = conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
      const echoOptions = (start.options ?? []).filter((option) =>
        [spec.activeNodeId, spec.doneNodeId].includes(option.nextNodeId),
      );
      expect(echoOptions, `${spec.dialogueId} → ${spec.questId}`).toHaveLength(2);
      for (const option of echoOptions) {
        expect(option.effects ?? [], `${spec.dialogueId} option → ${option.nextNodeId} must not carry effects`).toEqual([]);
        expect(option.conditions ?? [], `${spec.dialogueId} option → ${option.nextNodeId} must be gated by questStatus only`)
          .toEqual([{ kind: 'questStatus', questId: spec.questId, status: option.nextNodeId === spec.activeNodeId ? 'active' : 'completed' }]);
      }
      for (const nodeId of [spec.activeNodeId, spec.doneNodeId]) {
        const node = conversation.nodes.find((entry) => entry.id === nodeId);
        expect(node, `${spec.dialogueId} node ${nodeId}`).toBeDefined();
      }
    }
  });

  it('keeps every pre-existing option of the seven greet nodes intact', () => {
    // Anchored greet-node option counts: pre-existing options plus the
    // Round 59 echoes (shi-bei carries two quest pairs, hence four); Zhu
    // also has the Round 69 outsider lesson entry. Round 98 adds the
    // peddler-errand/ferry-ledger journey entries to Bai and Jiang. Round 103
    // adds five mentor practice entries and one field brief per verifier.
    const expectedBaseline: Record<string, number> = {
      'dlg.shi-bei-mentor': 19, // +1 R129 no-effect complete route brief;  9 pre-existing + 4 echoes + 5 Round 103 practice entries
      'dlg.bai-luzhou-ferry-master': 32, // Prior 28 + R274 two gated supply entries and one already-claimed receipt + one R278 shore-boat info; exact new nodes/options checked in R274/R278.
      'dlg.zhu-jiuxian-mentor': 24, // prior 20 + three Round104 crafting responses
      'dlg.ma-shangyi-notice-board': 8, // 3 pre-existing + 2 echoes + 3 R271 delivery entries (ready/progress/echo)
      'dlg.lu-zhenniang-teastall': 12, // 7 pre-existing + 2 echoes + 3 R271 delivery entries (ready/progress/echo)
      'dlg.jiang-baiwei-peddler': 7, // 2 pre-existing + 2 echoes + 3 Round 98 journey entries
      'dlg.gu-yechen-roadside': 26, // R131 adds an eligible reinvitation without repeating social rewards.
    };
    for (const [dialogueId, expectedCount] of Object.entries(expectedBaseline)) {
      const conversation = dialogueAssembly.conversations.get(dialogueId)!;
      const start = conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
      expect(start.options ?? [], dialogueId).toHaveLength(expectedCount);
    }

    // Signature pre-existing options survive verbatim.
    const signatures: Array<[string, string]> = [
      ['dlg.shi-bei-mentor', '这便去磨练筋骨。'],
      ['dlg.bai-luzhou-ferry-master', '都不是，随便看看。'],
      ['dlg.zhu-jiuxian-mentor', '随便看看，这就走。'],
      ['dlg.ma-shangyi-notice-board', '我看看告示。'],
      ['dlg.lu-zhenniang-teastall', '来一碗。顺便问问，镇上近来可有生面孔？'],
      ['dlg.jiang-baiwei-peddler', '你这担子里最值钱的是什么？'],
      ['dlg.gu-yechen-roadside', '在下无意冒犯，这就绕道。'],
    ];
    for (const [dialogueId, text] of signatures) {
      const conversation = dialogueAssembly.conversations.get(dialogueId)!;
      const start = conversation.nodes.find((node) => node.id === conversation.startNodeId)!;
      expect((start.options ?? []).some((option) => option.text === text), `${dialogueId}: ${text}`).toBe(true);
    }

    const zhu = dialogueAssembly.conversations.get('dlg.zhu-jiuxian-mentor')!;
    const zhuStart = zhu.nodes.find((node) => node.id === zhu.startNodeId)!;
    const outsiderLesson = zhuStart.options?.find((option) => option.nextNodeId === 'r32-open-lessons');
    expect(outsiderLesson?.conditions).toEqual([
      { kind: 'factionMembership', factionId: 'faction.panzhou-daochang', isMember: false },
    ]);
  });

  it.each(ECHO_SPECS)(
    'shows $dialogueId echoes only under their own quest status ($questId)',
    (spec) => {
      const conversation = dialogueAssembly.conversations.get(spec.dialogueId)!;

      // Fresh journal: everything locked → no echo visible.
      const lockedJournal = createQuestJournal(questAssembly.quests);
      const lockedContext = contextFor(spec.speakerNpcId, lockedJournal);
      expect(lockedJournal.states.get(spec.questId)?.status).toBe('locked');
      const lockedTargets = visibleStartTargets(conversation, lockedContext);
      expect(lockedTargets.has(spec.activeNodeId)).toBe(false);
      expect(lockedTargets.has(spec.doneNodeId)).toBe(false);

      // Offered (not accepted yet): both hidden — the echoes never re-offer.
      const offeredJournal = createQuestJournal(questAssembly.quests);
      forceQuestStatus(questAssembly.quests, offeredJournal, spec.questId, 'offered');
      const offeredTargets = visibleStartTargets(conversation, contextFor(spec.speakerNpcId, offeredJournal));
      expect(offeredTargets.has(spec.activeNodeId)).toBe(false);
      expect(offeredTargets.has(spec.doneNodeId)).toBe(false);

      // Active: only the active echo shows.
      const activeJournal = createQuestJournal(questAssembly.quests);
      forceQuestStatus(questAssembly.quests, activeJournal, spec.questId, 'active');
      const activeTargets = visibleStartTargets(conversation, contextFor(spec.speakerNpcId, activeJournal));
      expect(activeTargets.has(spec.activeNodeId)).toBe(true);
      expect(activeTargets.has(spec.doneNodeId)).toBe(false);

      // Completed: only the completed echo shows.
      const doneJournal = createQuestJournal(questAssembly.quests);
      forceQuestStatus(questAssembly.quests, doneJournal, spec.questId, 'completed');
      const doneTargets = visibleStartTargets(conversation, contextFor(spec.speakerNpcId, doneJournal));
      expect(doneTargets.has(spec.activeNodeId)).toBe(false);
      expect(doneTargets.has(spec.doneNodeId)).toBe(true);

      // Failed: silent again.
      const failedJournal = createQuestJournal(questAssembly.quests);
      forceQuestStatus(questAssembly.quests, failedJournal, spec.questId, 'failed');
      const failedTargets = visibleStartTargets(conversation, contextFor(spec.speakerNpcId, failedJournal));
      expect(failedTargets.has(spec.activeNodeId)).toBe(false);
      expect(failedTargets.has(spec.doneNodeId)).toBe(false);
    },
  );

  it('mirrors the scene call order: npc-talk settles the stall pact before the first node is evaluated (shi-bei)', () => {
    // Realistic chain walk: discovery completed (its target market known),
    // stall pact accepted, three tough-leather delivered.
    const journal = createQuestJournal(questAssembly.quests);
    forceQuestStatus(questAssembly.quests, journal, 'quest.r58-market-discovery', 'completed');
    const known = new Set(['place.mist-willow-market']);
    journal.states.get('quest.r58-market-stall-pact')!.status = 'offered';
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r58-market-stall-pact', new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, {
      type: 'item-count', itemId: 'item.tough-leather', quantity: 3,
    });
    expect(journal.states.get('quest.r58-market-stall-pact')?.status).toBe('active');

    // GridScene.openDialogueWith sends the npc-talk signal first…
    const talkUpdate = applyQuestSignal(questAssembly.quests, journal, {
      type: 'npc-talk', npcId: 'char.shi-bei',
    });
    expect(talkUpdate.completed.map((entry) => entry.questId)).toEqual(['quest.r58-market-stall-pact']);
    expect(talkUpdate.completed[0]).toMatchObject({ experience: 34, currency: 26 });

    // …then opens the panel whose visibleOptions callback reads the same
    // (now completed) journal for the start node.
    const conversation = dialogueAssembly.conversations.get('dlg.shi-bei-mentor')!;
    const context = contextFor('char.shi-bei', journal);
    const session = new DialogueSession(conversation);
    const targets = new Set(
      getVisibleOptions(session.currentNode, context).map(({ option }) => option.nextNodeId),
    );
    expect(targets.has('r58-stall-pact-active')).toBe(false);
    expect(targets.has('r58-stall-pact-done')).toBe(true);
    // The discovery echo stays visible alongside — different quest, still completed.
    expect(targets.has('r58-market-discovery-done')).toBe(true);
  });

  it('mirrors the scene call order: talking to jiang-baiwei completes the supply run before evaluation', () => {
    const journal = createQuestJournal(questAssembly.quests);
    forceQuestStatus(questAssembly.quests, journal, 'quest.r58-south-hamlet-survey', 'completed');
    journal.states.get('quest.r58-south-hamlet-supply')!.status = 'offered';
    expect(acceptQuest(questAssembly.quests, journal, 'quest.r58-south-hamlet-supply').ok).toBe(true);
    applyQuestSignal(questAssembly.quests, journal, {
      type: 'item-count', itemId: 'item.cangya-gen', quantity: 2,
    });

    const talkUpdate = applyQuestSignal(questAssembly.quests, journal, {
      type: 'npc-talk', npcId: 'char.jiang-baiwei',
    });
    expect(talkUpdate.completed.map((entry) => entry.questId)).toEqual(['quest.r58-south-hamlet-supply']);

    const conversation = dialogueAssembly.conversations.get('dlg.jiang-baiwei-peddler')!;
    const targets = visibleStartTargets(conversation, contextFor('char.jiang-baiwei', journal));
    expect(targets.has('r58-peddler-supply-active')).toBe(false);
    expect(targets.has('r58-peddler-supply-done')).toBe(true);

    // Lu-zhenniang (the giver, not a talk target) reflects the same fresh
    // completion from her own conversation.
    const luConversation = dialogueAssembly.conversations.get('dlg.lu-zhenniang-teastall')!;
    const luTargets = visibleStartTargets(luConversation, contextFor('char.lu-zhenniang', journal));
    expect(luTargets.has('r58-supply-done')).toBe(true);
  });

  it('keeps the active survey echo visible when talking to ma-shangyi (he is not a talk target)', () => {
    const journal = createQuestJournal(questAssembly.quests);
    forceQuestStatus(questAssembly.quests, journal, 'quest.r58-south-hamlet-survey', 'active');

    // Talking to the notice-board keeper settles no regional objective and
    // completes/fails nothing (refreshUnlocked may still flip unrelated
    // locked quests to offered — that is not a settlement).
    const talkUpdate = applyQuestSignal(questAssembly.quests, journal, {
      type: 'npc-talk', npcId: 'char.ma-shangyi',
    });
    expect(talkUpdate.completed).toEqual([]);
    expect(talkUpdate.failedQuestIds).toEqual([]);
    expect(journal.states.get('quest.r58-south-hamlet-survey')?.status).toBe('active');

    const conversation = dialogueAssembly.conversations.get('dlg.ma-shangyi-notice-board')!;
    const targets = visibleStartTargets(conversation, contextFor('char.ma-shangyi', journal));
    expect(targets.has('r58-hamlet-survey-active')).toBe(true);
    expect(targets.has('r58-hamlet-survey-done')).toBe(false);
  });
});
