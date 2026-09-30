import { baseRecipeIds } from './support/base-recipe-ids';
/** Round 42: original main-story data, quest state progression and endings. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import {
  evaluateEndings,
  parseEndingSet,
  type AssembledEndingSet,
} from '../src/engine/ending-system';
import { createSocialState } from '../src/engine/social-state';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

const questIds = {
  audit: 'quest.r42-ledger-audit',
  witnesses: 'quest.r42-two-witnesses',
  rubbing: 'quest.r42-seal-rubbing',
  public: 'quest.r42-open-register',
  protect: 'quest.r42-protect-witness',
} as const;

const outcomeIds = {
  publicVow: 'event.r42-public-record-vow',
  protectVow: 'event.r42-protected-witness-vow',
  publicEnding: 'ending.r42-open-register',
  protectEnding: 'ending.r42-sheltered-witness',
} as const;

function loadWorldQuests() {
  const parsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const npcs = readJson<{ npcs: Array<{ id: string; questGiver?: boolean }> }>(
    '../data/base/characters/round-03-npcs.json',
  ).npcs;
  const items = readJson<{ items: Array<{ id: string }> }>('../data/base/items/round-06-items.json').items;
  const encounters = [
    readJson<{ encounters: Array<{ id: string }> }>(
      '../data/base/battles/round-05-encounters.json',
    ).encounters,
    // Round 103 routes the panzhou practice at the east-coast tide-wake looters.
    readJson<{ encounters: Array<{ id: string }> }>(
      '../data/base/battles/round-83-east-coast-encounters.json',
    ).encounters,
  ].flat();
  const assembly = assembleQuests({
    recipeIds: baseRecipeIds,
    questSet: parsed.set,
    questGiverNpcIds: new Set(npcs.filter((npc) => npc.questGiver).map((npc) => npc.id)),
    npcIds: new Set(npcs.map((npc) => npc.id)),
    itemIds: new Set(items.map((item) => item.id)),
    encounterIds: new Set(encounters.map((encounter) => encounter.id)),
  });
  return { source: parsed.set.quests, ...assembly };
}

function signalTalk(quests: ReturnType<typeof loadWorldQuests>['quests'], journal: ReturnType<typeof createQuestJournal>, npcId: string) {
  return applyQuestSignal(quests, journal, { type: 'npc-talk', npcId });
}

function accept(quests: ReturnType<typeof loadWorldQuests>['quests'], journal: ReturnType<typeof createQuestJournal>, id: string) {
  const result = acceptQuest(quests, journal, id);
  expect(result.ok, `quest should be offered: ${id}`).toBe(true);
  return result;
}

function completeSharedRoute(world: ReturnType<typeof loadWorldQuests>) {
  const journal = createQuestJournal(world.quests);
  accept(world.quests, journal, 'quest.r31-peddler-errand');
  signalTalk(world.quests, journal, 'char.bai-luzhou');
  accept(world.quests, journal, 'quest.r31-ferry-ledger');
  signalTalk(world.quests, journal, 'char.liu-tinglan');

  expect(journal.states.get(questIds.audit)?.status).toBe('offered');
  accept(world.quests, journal, questIds.audit);
  signalTalk(world.quests, journal, 'char.liu-tinglan');
  expect(journal.states.get(questIds.witnesses)?.status).toBe('offered');
  accept(world.quests, journal, questIds.witnesses);
  signalTalk(world.quests, journal, 'char.gu-yechen');
  signalTalk(world.quests, journal, 'char.zhu-jiuxian');
  expect(journal.states.get(questIds.rubbing)?.status).toBe('offered');
  accept(world.quests, journal, questIds.rubbing);
  applyQuestSignal(world.quests, journal, {
    type: 'item-count', itemId: 'item.r42-ferry-seal-rubbing', quantity: 1,
  });
  expect(journal.states.get(questIds.public)?.status).toBe('offered');
  expect(journal.states.get(questIds.protect)?.status).toBe('offered');
  return journal;
}

function endingSet() {
  const parsed = parseEndingSet(readJson('../data/base/endings/round-27-endings.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return {
    record: parsed.set,
    gate: parsed.set.gate,
    endings: parsed.set.endings,
  } satisfies AssembledEndingSet;
}

describe('Round 42 original main-story chapter', () => {
  it('assembles a complete linear chapter followed by exactly one same-prerequisite branch', () => {
    const world = loadWorldQuests();
    expect(world.warnings).toEqual([]);

    const byId = new Map(world.source.map((quest) => [quest.id, quest]));
    expect(byId.get(questIds.audit)?.prerequisiteQuestIds).toEqual(['quest.r31-ferry-ledger']);
    expect(byId.get(questIds.witnesses)?.prerequisiteQuestIds).toEqual([questIds.audit]);
    expect(byId.get(questIds.rubbing)?.prerequisiteQuestIds).toEqual([questIds.witnesses]);

    const publicBranch = byId.get(questIds.public)!;
    const protectedBranch = byId.get(questIds.protect)!;
    expect(publicBranch.exclusiveGroupId).toBe('branch.r42-ferry-record');
    expect(protectedBranch.exclusiveGroupId).toBe(publicBranch.exclusiveGroupId);
    expect(publicBranch.prerequisiteQuestIds).toEqual([questIds.rubbing]);
    expect(protectedBranch.prerequisiteQuestIds).toEqual(publicBranch.prerequisiteQuestIds);
    expect(publicBranch.objectives[0]?.kind).toBe('talkToNpc');
    expect(protectedBranch.objectives[0]?.kind).toBe('talkToNpc');
  });

  it('keeps all four NPC dialogue graphs valid and resolves chapter effects to real data', () => {
    const sources = [
      readJson('../data/base/dialogues/round-03-conversations.json'),
      readJson('../data/base/dialogues/round-30-conversations.json'),
    ];
    const parsedSets = sources.map((source) => parseDialogueSet(source));
    expect(parsedSets.every((result) => result.ok)).toBe(true);
    const conversations = parsedSets.flatMap((result) => result.ok ? result.set.conversations : []);
    const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    const chapterConversations = [
      'dlg.gu-yechen-roadside',
      'dlg.liu-tinglan-mentor',
      'dlg.zhu-jiuxian-mentor',
      'dlg.bai-luzhou-ferry-master',
    ].map((id) => byId.get(id));
    expect(chapterConversations.every((conversation) => conversation !== undefined)).toBe(true);
    for (const conversation of chapterConversations) {
      expect(validateConversation(conversation!)).toEqual([]);
    }

    const questSet = new Set(loadWorldQuests().source.map((quest) => quest.id));
    const itemSet = new Set(readJson<{ items: Array<{ id: string }> }>(
      '../data/base/items/round-06-items.json',
    ).items.map((item) => item.id));
    const graphNodeSet = new Set(readJson<{ nodes: Array<{ id: string }> }>(
      '../data/base/knowledge_graph/nodes.json',
    ).nodes.map((node) => node.id));
    const acceptedQuestRefs = new Set<string>();
    for (const conversation of chapterConversations) {
      for (const node of conversation!.nodes) {
        for (const option of node.options ?? []) {
          for (const condition of option.conditions ?? []) {
            if (condition.kind === 'questStatus') expect(questSet.has(condition.questId)).toBe(true);
          }
          for (const effect of option.effects ?? []) {
            if (effect.kind === 'acceptQuest') {
              expect(questSet.has(effect.questId)).toBe(true);
              acceptedQuestRefs.add(effect.questId);
            } else if (effect.kind === 'giveItem') {
              expect(itemSet.has(effect.itemId)).toBe(true);
            } else if (effect.kind === 'discoverKnowledgeNode') {
              expect(graphNodeSet.has(effect.nodeId)).toBe(true);
            }
          }
        }
      }
    }
    for (const questId of Object.values(questIds)) expect(acceptedQuestRefs.has(questId)).toBe(true);

    const terminalResponses = [
      ['dlg.liu-tinglan-mentor', questIds.public, outcomeIds.publicVow],
      ['dlg.zhu-jiuxian-mentor', questIds.protect, outcomeIds.protectVow],
    ] as const;
    for (const [conversationId, questId, nodeId] of terminalResponses) {
      const greet = byId.get(conversationId)?.nodes.find((node) => node.id === 'greet');
      const response = greet?.options?.find((option) =>
        option.conditions?.some((entry) => entry.kind === 'questStatus' && entry.questId === questId && entry.status === 'completed'),
      );
      expect(response, `completed route response: ${questId}`).toBeDefined();
      expect(response?.effects).toContainEqual({ kind: 'discoverKnowledgeNode', nodeId });
    }
  });

  it('completes either route, fails its sibling, and unlocks only the matching new ending', () => {
    const world = loadWorldQuests();
    const baseEndingSet = endingSet();

    const publicJournal = completeSharedRoute(world);
    const chosenPublic = accept(world.quests, publicJournal, questIds.public);
    expect(chosenPublic.ok && chosenPublic.update.failedQuestIds).toContain(questIds.protect);
    expect(signalTalk(world.quests, publicJournal, 'char.liu-tinglan').completed.map((row) => row.questId))
      .toContain(questIds.public);
    const publicContext = {
      questStatuses: new Map([...publicJournal.states].map(([id, state]) => [id, state.status])),
      social: createSocialState(),
      factionMembership: null,
      knownKnowledgeNodeIds: new Set([outcomeIds.publicVow]),
    };
    const publicEvaluated = evaluateEndings(baseEndingSet, publicContext);
    expect(publicEvaluated.find((row) => row.ending.id === outcomeIds.publicEnding)?.available).toBe(true);
    expect(publicEvaluated.find((row) => row.ending.id === outcomeIds.protectEnding)?.available).toBe(false);

    const protectedJournal = completeSharedRoute(world);
    const chosenProtect = accept(world.quests, protectedJournal, questIds.protect);
    expect(chosenProtect.ok && chosenProtect.update.failedQuestIds).toContain(questIds.public);
    expect(signalTalk(world.quests, protectedJournal, 'char.zhu-jiuxian').completed.map((row) => row.questId))
      .toContain(questIds.protect);
    const protectedContext = {
      questStatuses: new Map([...protectedJournal.states].map(([id, state]) => [id, state.status])),
      social: createSocialState(),
      factionMembership: null,
      knownKnowledgeNodeIds: new Set([outcomeIds.protectVow]),
    };
    const protectedEvaluated = evaluateEndings(baseEndingSet, protectedContext);
    expect(protectedEvaluated.find((row) => row.ending.id === outcomeIds.protectEnding)?.available).toBe(true);
    expect(protectedEvaluated.find((row) => row.ending.id === outcomeIds.publicEnding)?.available).toBe(false);
  });
});
