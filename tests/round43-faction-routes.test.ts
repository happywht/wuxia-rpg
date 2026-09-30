import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation, type DialogueData, type DialogueOptionData } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createSocialState } from '../src/engine/social-state';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  hasQuestAccess,
  parseQuestSet,
} from '../src/engine/quest-system';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

const letterId = 'event.r43-wayfarer-letter';

const routes = [
  {
    questId: 'quest.r43-tingyu-eave-rain',
    factionId: 'faction.tingyu-jiange',
    giverNpcId: 'char.ye-tingzhou',
    giverConversationId: 'dlg.ye-tingzhou-mentor',
    targetNpcId: 'char.liu-tinglan',
    targetConversationId: 'dlg.liu-tinglan-mentor',
    outcomeNodeId: 'event.r43-tingyu-eave-rain',
    practiceSignals: [{ type: 'knowledge-discovery', nodeId: 'place.r74-cloud-markers' }] as const,
  },
  {
    questId: 'quest.r43-tiezhang-stone-post',
    factionId: 'faction.tiezhang-pai',
    giverNpcId: 'char.shi-bei',
    giverConversationId: 'dlg.shi-bei-mentor',
    targetNpcId: 'char.gu-yechen',
    targetConversationId: 'dlg.gu-yechen-roadside',
    outcomeNodeId: 'event.r43-tiezhang-stone-post',
    practiceSignals: [{ type: 'encounter-victory', encounterId: 'encounter.r62-ridge-roadblock' }] as const,
  },
  {
    questId: 'quest.r43-yunyin-herb-road',
    factionId: 'faction.yunyin-shanzhuang',
    giverNpcId: 'char.wen-suxin',
    giverConversationId: 'dlg.wen-suxin-mentor',
    targetNpcId: 'char.rong-su-qing',
    targetConversationId: 'dlg.rong-su-qing-herbalist',
    outcomeNodeId: 'event.r43-yunyin-herb-road',
    practiceSignals: [
      { type: 'knowledge-discovery', nodeId: 'place.r67-brine-well' },
      { type: 'item-count', itemId: 'item.huichun-gao', quantity: 2 },
    ] as const,
  },
  {
    questId: 'quest.r43-hanshan-copybook',
    factionId: 'faction.hanshan-shuyuan',
    giverNpcId: 'char.liu-tinglan',
    giverConversationId: 'dlg.liu-tinglan-mentor',
    targetNpcId: 'char.shen-mohan',
    targetConversationId: 'dlg.shen-mohan-bookshop',
    outcomeNodeId: 'event.r43-hanshan-copybook',
    practiceSignals: [{ type: 'knowledge-discovery', nodeId: 'place.r93-old-mark' }] as const,
  },
  {
    questId: 'quest.r43-panzhou-return-tide',
    factionId: 'faction.panzhou-daochang',
    giverNpcId: 'char.zhu-jiuxian',
    giverConversationId: 'dlg.zhu-jiuxian-mentor',
    targetNpcId: 'char.bai-luzhou',
    targetConversationId: 'dlg.bai-luzhou-ferry-master',
    outcomeNodeId: 'event.r43-panzhou-return-tide',
    practiceSignals: [{ type: 'encounter-victory', encounterId: 'encounter.r83-tide-wake-looters' }] as const,
  },
] as const;

function loadWorld() {
  const parsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const npcSet = readJson<{ npcs: Array<{ id: string; questGiver?: boolean }> }>(
    '../data/base/characters/round-03-npcs.json',
  ).npcs;
  const itemSet = readJson<{ items: Array<{ id: string }> }>(
    '../data/base/items/round-06-items.json',
  ).items;
  const encounterSet = [
    ...readJson<{ encounters: Array<{ id: string }> }>(
      '../data/base/battles/round-05-encounters.json',
    ).encounters,
    ...readJson<{ encounters: Array<{ id: string }> }>(
      '../data/base/battles/round-83-east-coast-encounters.json',
    ).encounters,
  ];
  const factionSet = readJson<{ factions: Array<{ id: string }> }>(
    '../data/base/factions/round-04-factions.json',
  ).factions;
  const graphNodes = readJson<{ nodes: KnowledgeNodeData[] }>(
    '../data/base/knowledge_graph/nodes.json',
  ).nodes;
  const assembly = assembleQuests({
    questSet: parsed.set,
    questGiverNpcIds: new Set(npcSet.filter((npc) => npc.questGiver).map((npc) => npc.id)),
    npcIds: new Set(npcSet.map((npc) => npc.id)),
    itemIds: new Set(itemSet.map((item) => item.id)),
    encounterIds: new Set(encounterSet.map((encounter) => encounter.id)),
    factionIds: new Set(factionSet.map((faction) => faction.id)),
    knowledgeNodeIds: new Set(graphNodes.map((node) => node.id)),
  });
  const dialogues = [
    '../data/base/dialogues/round-03-conversations.json',
    '../data/base/dialogues/round-30-conversations.json',
  ].map((path) => parseDialogueSet(readJson(path)));
  if (dialogues.some((result) => !result.ok)) throw new Error('one or more dialogue sets did not parse');
  const conversations = new Map(
    dialogues.flatMap((result) => result.ok ? result.set.conversations : [])
      .map((conversation) => [conversation.id, conversation]),
  );
  const knowledgeNodes = new Map(graphNodes.map((node) => [node.id, node]));
  return { parsed: parsed.set, quests: assembly.quests, warnings: assembly.warnings, conversations, knowledgeNodes };
}

function optionWithEffect(conversation: DialogueData, effectKind: string, ref: string): DialogueOptionData | undefined {
  const greet = conversation.nodes.find((node) => node.id === conversation.startNodeId);
  return greet?.options?.find((option) =>
    option.effects?.some((effect) =>
      (effect.kind === 'acceptQuest' && effectKind === 'acceptQuest' && effect.questId === ref) ||
      (effect.kind === 'discoverKnowledgeNode' && effectKind === 'discoverKnowledgeNode' && effect.nodeId === ref),
    ),
  );
}

describe('Round 43 faction routes', () => {
  it('assembles five data-driven routes gated by the matching faction and discovered letter', () => {
    const world = loadWorld();
    expect(world.warnings).toEqual([]);
    expect(world.parsed.quests.filter(({ id }) => routes.some((route) => route.questId === id)))
      .toHaveLength(routes.length);
    expect(routes.map((route) => world.quests.get(route.questId)?.requiredFactionId))
      .toEqual(routes.map((route) => route.factionId));

    for (const route of routes) {
      const quest = world.quests.get(route.questId);
      const giver = world.conversations.get(route.giverConversationId);
      const target = world.conversations.get(route.targetConversationId);
      expect(quest?.requiredKnowledgeNodeId).toBe(letterId);
      expect(hasQuestAccess(quest!, { factionId: route.factionId })).toBe(false);
      expect(hasQuestAccess(quest!, { factionId: route.factionId, knownKnowledgeNodeIds: new Set([letterId]) })).toBe(true);
      expect(giver).toBeDefined();
      expect(target).toBeDefined();
      expect(validateConversation(giver!)).toEqual([]);
      expect(validateConversation(target!)).toEqual([]);

      const offer = optionWithEffect(giver!, 'acceptQuest', route.questId);
      expect(offer?.conditions).toContainEqual({ kind: 'factionMembership', factionId: route.factionId, isMember: true });
      expect(offer?.conditions).toContainEqual({ kind: 'knowledgeKnown', nodeId: letterId });
      expect(offer?.conditions).toContainEqual({ kind: 'questStatus', questId: route.questId, status: 'offered' });
      const report = optionWithEffect(target!, 'discoverKnowledgeNode', route.outcomeNodeId);
      expect(report?.conditions).toContainEqual({ kind: 'questStatus', questId: route.questId, status: 'completed' });
      expect(world.knowledgeNodes.has(route.outcomeNodeId)).toBe(true);
    }
  });

  it('enforces the same faction and clue gates through acceptance, then completes and records each route', () => {
    const world = loadWorld();
    const letter = new Set([letterId]);
    for (const route of routes) {
      const quest = world.quests.get(route.questId);
      expect(quest).toBeDefined();
      const journal = createQuestJournal(world.quests);
      const wrongFaction = acceptQuest(world.quests, journal, route.questId, new Map(), {
        factionId: 'faction.other',
        knownKnowledgeNodeIds: letter,
      });
      expect(wrongFaction).toMatchObject({ ok: false, reason: 'wrong-faction' });
      const missingLetter = acceptQuest(world.quests, journal, route.questId, new Map(), {
        factionId: route.factionId,
        knownKnowledgeNodeIds: new Set(),
      });
      expect(missingLetter).toMatchObject({ ok: false, reason: 'missing-knowledge' });
      expect(journal.states.get(route.questId)?.status).toBe('offered');

      const accepted = acceptQuest(world.quests, journal, route.questId, new Map(), {
        factionId: route.factionId,
        knownKnowledgeNodeIds: letter,
      });
      expect(accepted.ok).toBe(true);

      // Round 103 turned each route into an ordered field practice: the first
      // verifier talk alone no longer completes the quest.
      const lastObjective = quest?.objectives[quest!.objectives.length - 1];
      expect(lastObjective?.kind).toBe('talkToNpc');
      const firstTalk = applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: route.targetNpcId });
      expect(firstTalk.completed).toEqual([]);
      expect(journal.states.get(route.questId)?.status).toBe('active');
      for (const signal of route.practiceSignals) {
        applyQuestSignal(world.quests, journal, signal);
      }
      const completed = applyQuestSignal(world.quests, journal, {
        type: 'npc-talk',
        npcId: lastObjective!.targetId,
      });
      expect(completed.completed.map((entry) => entry.questId)).toContain(route.questId);
      const grant = completed.completed.find((entry) => entry.questId === route.questId)!;
      expect(grant.factionRenown).toEqual([{ factionId: route.factionId, delta: 5 }]);
      expect(grant.discoverKnowledgeNodeIds).toContain(route.outcomeNodeId);

      const report = optionWithEffect(
        world.conversations.get(route.targetConversationId)!,
        'discoverKnowledgeNode',
        route.outcomeNodeId,
      );
      const known = new Set([letterId]);
      const context: DialogueRuntimeContext = {
        quests: world.quests,
        journal,
        items: new Map(),
        inventory: null,
        social: createSocialState(),
        speakerNpcId: route.targetNpcId,
        knownKnowledgeNodeIds: known,
        knowledgeNodes: world.knowledgeNodes,
        character: null,
        factions: new Map(),
        martialArts: new Map(),
        factionState: createFactionMembershipState({
          factionId: route.factionId,
          masterNpcId: route.giverNpcId,
        }),
        timeOfDayPeriodId: 'period.dusk',
      };
      expect(report?.effects).toBeDefined();
      const applied = applyDialogueEffects(report!.effects!, context);
      expect(applied.ok).toBe(true);
      expect(context.knownKnowledgeNodeIds.has(route.outcomeNodeId)).toBe(true);
    }
  });

  it('disables a quest with an unregistered faction or knowledge requirement during assembly', () => {
    const raw = readJson<Record<string, unknown>>('../data/base/quests/round-07-quests.json');
    const questSet = raw as { quests: Array<Record<string, unknown>> };
    questSet.quests.push({
      ...questSet.quests.find((quest) => quest.id === routes[0].questId),
      id: 'quest.r43-invalid-mod-example',
      requiredFactionId: 'faction.deleted-by-mod',
    });
    const parsed = parseQuestSet(questSet);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const npcIds = readJson<{ npcs: Array<{ id: string; questGiver?: boolean }> }>(
      '../data/base/characters/round-03-npcs.json',
    ).npcs;
    const itemIds = readJson<{ items: Array<{ id: string }> }>(
      '../data/base/items/round-06-items.json',
    ).items;
    const factions = readJson<{ factions: Array<{ id: string }> }>(
      '../data/base/factions/round-04-factions.json',
    ).factions;
    const nodes = readJson<{ nodes: KnowledgeNodeData[] }>(
      '../data/base/knowledge_graph/nodes.json',
    ).nodes;
    const assembly = assembleQuests({
      questSet: parsed.set,
      questGiverNpcIds: new Set(npcIds.filter((npc) => npc.questGiver).map((npc) => npc.id)),
      npcIds: new Set(npcIds.map((npc) => npc.id)),
      itemIds: new Set(itemIds.map((item) => item.id)),
      encounterIds: new Set(),
      factionIds: new Set(factions.map((faction) => faction.id)),
      knowledgeNodeIds: new Set(nodes.map((node) => node.id)),
    });
    expect(assembly.quests.has('quest.r43-invalid-mod-example')).toBe(false);
    expect(assembly.warnings.join('\n')).toContain('faction.deleted-by-mod');
  });
});
