/**
 * Round 103: five-faction field practice — ordered objectives, mentor state
 * feedback, letter transcription, training advice, legacy-state compatibility,
 * whole-catalogue reference assembly and the two authored challenges.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseDialogueSet, validateConversation, type DialogueData } from '../src/engine/dialogue-graph';
import {
  applyDialogueEffects,
  getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import {
  checkMartialArtEligibility,
  createCharacterState,
  parseCharacterProfileSet,
  parseMartialArtSet,
} from '../src/engine/character-progression';
import { createFactionMembershipState } from '../src/engine/faction-system';
import {
  captureSaveSnapshot,
  parseSaveSnapshot,
  planSnapshotRestore,
  restoreRunState,
} from '../src/engine/save-system';
import { createInventoryState, indexItems, parseItemSet, type ItemRecordData } from '../src/engine/item-system';
import { createSocialState } from '../src/engine/social-state';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
  reconcileQuestFacts,
  type QuestSignal,
} from '../src/engine/quest-system';
import { CombatSession, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { factionPracticeConfigs } from '../scripts/lib/round103-faction-practice.mjs';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

const letterId = 'event.r43-wayfarer-letter';

// --- Whole-catalogue id sets (assembly must resolve every authored reference) --

const collect = (dir: string, key: string): string[] =>
  readdirSync(new URL(dir, import.meta.url))
    .filter(name => name.endsWith('.json'))
    .flatMap(name => (readJson<{ [k: string]: unknown[] }>(`${dir}/${name}`)[key] ?? []) as Array<{ id: string }>)
    .map(entry => entry.id);

const allNpcIds = collect('../data/base/characters', 'npcs');
const allItemIds = collect('../data/base/items', 'items');
const allEncounterIds = collect('../data/base/battles', 'encounters');
const allFactionIds = collect('../data/base/factions', 'factions');
const allNodeIds = collect('../data/base/knowledge_graph', 'nodes');

function loadWorld() {
  const parsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const assembly = assembleQuests({
    questSet: parsed.set,
    questGiverNpcIds: new Set(allNpcIds),
    npcIds: new Set(allNpcIds),
    itemIds: new Set(allItemIds),
    encounterIds: new Set(allEncounterIds),
    factionIds: new Set(allFactionIds),
    knowledgeNodeIds: new Set(allNodeIds),
  });
  const conversations = new Map<string, DialogueData>();
  for (const name of readdirSync(new URL('../data/base/dialogues', import.meta.url))) {
    if (!name.endsWith('.json')) continue;
    const result = parseDialogueSet(readJson(`../data/base/dialogues/${name}`));
    if (!result.ok) throw new Error(`${name}: ${result.errors.join('\n')}`);
    for (const conversation of result.set.conversations) conversations.set(conversation.id, conversation);
  }
  const knowledgeNodes = new Map(
    (readJson<{ nodes: Array<{ id: string; summary: string }> }>('../data/base/knowledge_graph/nodes.json').nodes)
      .map(node => [node.id, node]),
  );
  return {
    quests: assembly.quests,
    warnings: assembly.warnings,
    conversations,
    knowledgeNodes,
  };
}

const world = loadWorld();

function makeContext(overrides: Partial<DialogueRuntimeContext> = {}): DialogueRuntimeContext {
  return {
    quests: world.quests,
    journal: createQuestJournal(world.quests),
    items: new Map(),
    inventory: null,
    social: createSocialState(),
    speakerNpcId: 'char.ye-tingzhou',
    knownKnowledgeNodeIds: new Set<string>(),
    knowledgeNodes: world.knowledgeNodes as unknown as DialogueRuntimeContext['knowledgeNodes'],
    character: null,
    factions: new Map(),
    martialArts: new Map(),
    factionState: createFactionMembershipState({ factionId: 'faction.tingyu-jiange', masterNpcId: 'char.ye-tingzhou' }),
    timeOfDayPeriodId: 'period.dusk',
    ...overrides,
  };
}

const greetOf = (conversationId: string) => {
  const conversation = world.conversations.get(conversationId)!;
  return conversation.nodes.find(node => node.id === conversation.startNodeId)!;
};

const visibleTexts = (conversationId: string, context: DialogueRuntimeContext) =>
  new Set(getVisibleOptions(greetOf(conversationId), context).map(({ option }) => option.text));

// Signals driving each faction's field-practice middle objective.
const middleSignals: Record<string, QuestSignal[]> = {
  tingyu: [{ type: 'knowledge-discovery', nodeId: 'place.r74-cloud-markers' }],
  tiezhang: [{ type: 'encounter-victory', encounterId: 'encounter.r62-ridge-roadblock' }],
  yunyin: [
    { type: 'knowledge-discovery', nodeId: 'place.r67-brine-well' },
    { type: 'item-count', itemId: 'item.huichun-gao', quantity: 2 },
  ],
  hanshan: [{ type: 'knowledge-discovery', nodeId: 'place.r93-old-mark' }],
  panzhou: [{ type: 'encounter-victory', encounterId: 'encounter.r83-tide-wake-looters' }],
};

const startingRewards: Record<string, { experience: number; currency: number }> = {
  tingyu: { experience: 36, currency: 22 },
  tiezhang: { experience: 40, currency: 18 },
  yunyin: { experience: 34, currency: 20 },
  hanshan: { experience: 38, currency: 24 },
  panzhou: { experience: 42, currency: 26 },
};

const entryArts: Record<string, string> = {
  tingyu: 'skill.r32-tingyu-luoyu-jian',
  tiezhang: 'skill.r32-tiezhang-tiezhuang-quan',
  yunyin: 'skill.r32-yunyin-caomu-xinfa',
  hanshan: 'skill.r32-hanshan-zhumo-bi',
  panzhou: 'skill.r32-panzhou-fanjing-dao',
};

describe('Round 103 faction field practice', () => {
  it('keeps gates, first objective and original pay while ordering practice and report', () => {
    expect(world.warnings).toEqual([]);
    for (const config of factionPracticeConfigs) {
      const quest = world.quests.get(config.questId);
      expect(quest, config.questId).toBeDefined();
      expect(quest!.requiredFactionId).toBe(config.factionId);
      expect(quest!.requiredKnowledgeNodeId).toBe(letterId);
      expect(quest!.orderedObjectives).toBe(true);
      const [first, ...rest] = quest!.objectives;
      expect(first?.kind).toBe('talkToNpc');
      expect(first?.targetId).toBe(quest!.objectives[0]!.targetId); // untouched verifier talk
      expect(rest.at(-1)).toMatchObject({ kind: 'talkToNpc', targetId: config.mentorCharId });
      expect(quest!.rewards.experience).toBe(startingRewards[config.key]!.experience);
      expect(quest!.rewards.currency).toBe(startingRewards[config.key]!.currency);
      expect(quest!.rewards.factionRenown).toEqual([{ factionId: config.factionId, delta: 5 }]);
      expect(quest!.rewards.discoverKnowledgeNodeIds).toEqual([config.practiceNodeId, config.outcomeNodeId]);
    }
  });

  it('keeps acceptance gated and delivers the letter through one-shot mentor transcription', () => {
    for (const config of factionPracticeConfigs) {
      const journal = createQuestJournal(world.quests);
      const wrongFaction = acceptQuest(world.quests, journal, config.questId, new Map(), {
        factionId: 'faction.other', knownKnowledgeNodeIds: new Set([letterId]),
      });
      expect(wrongFaction).toMatchObject({ ok: false, reason: 'wrong-faction' });
      const missingLetter = acceptQuest(world.quests, journal, config.questId, new Map(), {
        factionId: config.factionId, knownKnowledgeNodeIds: new Set(),
      });
      expect(missingLetter).toMatchObject({ ok: false, reason: 'missing-knowledge' });

      const context = makeContext({
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      const letterOption = getVisibleOptions(greetOf(config.mentorDialogueId), context)
        .find(({ option }) => option.effects?.some(effect =>
          effect.kind === 'discoverKnowledgeNode' && effect.nodeId === letterId));
      expect(letterOption, `${config.key} 转抄选项应可见`).toBeDefined();

      const applied = applyDialogueEffects(letterOption!.option.effects!, context);
      expect(applied.ok).toBe(true);
      expect(context.knownKnowledgeNodeIds.has(letterId)).toBe(true);
      // Once known, the transcription option disappears for this mentor.
      expect(getVisibleOptions(greetOf(config.mentorDialogueId), context)
        .some(({ option }) => option === letterOption!.option)).toBe(false);

      // Outsiders never see the transcription offer.
      const outsider = makeContext({
        factionState: createFactionMembershipState({ factionId: 'faction.other', masterNpcId: 'char.someone' }),
        speakerNpcId: config.mentorCharId,
      });
      expect(getVisibleOptions(greetOf(config.mentorDialogueId), outsider)
        .some(({ option }) => option === letterOption!.option)).toBe(false);
    }
  });

  it('advances strictly in order: first inquiry never completes, early reports record nothing', () => {
    for (const config of factionPracticeConfigs) {
      const quest = world.quests.get(config.questId)!;
      const journal = createQuestJournal(world.quests);
      acceptQuest(world.quests, journal, config.questId, new Map(), {
        factionId: config.factionId, knownKnowledgeNodeIds: new Set([letterId]),
      });
      // 1) Only the verifier's talk counts toward the first objective.
      const verifier = quest.objectives[0]!.targetId;
      const afterVerifier = applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: verifier });
      expect(afterVerifier.completed).toEqual([]);
      expect(journal.states.get(config.questId)?.status).toBe('active');
      expect(journal.states.get(config.questId)?.objectiveCounts.get(quest.objectives[0]!.id)).toBe(1);

      // 2) Talking to the reporting mentor before the field work records nothing.
      const early = applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: config.mentorCharId });
      expect(early.completed).toEqual([]);
      for (const objective of quest.objectives.slice(1)) {
        expect(journal.states.get(config.questId)?.objectiveCounts.get(objective.id) ?? 0).toBe(0);
      }
      expect(journal.states.get(config.questId)?.status).toBe('active');
    }
  });

  it('completes each faction route exactly once with renown and both insights', () => {
    for (const config of factionPracticeConfigs) {
      const quest = world.quests.get(config.questId)!;
      const journal = createQuestJournal(world.quests);
      // Yūnyín disciples arrive with the two ointments already in the pack.
      const itemCounts = new Map(config.key === 'yunyin' ? [['item.huichun-gao', 2]] : []);
      acceptQuest(world.quests, journal, config.questId, itemCounts, {
        factionId: config.factionId, knownKnowledgeNodeIds: new Set([letterId]),
      });
      applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: quest.objectives[0]!.targetId });

      // Ordered gating: pre-bought stock records nothing while the well check
      // is still the pending objective.
      if (config.key === 'yunyin') {
        expect(journal.states.get(config.questId)?.objectiveCounts.get('objective.r103-yunyin-prepare-ointment') ?? 0).toBe(0);
        applyQuestSignal(world.quests, journal, { type: 'knowledge-discovery', nodeId: 'place.r67-brine-well' });
        // grid-scene reconciles live facts after every quest update: the held
        // stock settles the now-pending collect objective without a third buy.
        reconcileQuestFacts(world.quests, journal, {
          knownKnowledgeNodeIds: new Set(['place.r67-brine-well']),
          itemCounts,
        });
      } else {
        for (const signal of middleSignals[config.key] ?? []) applyQuestSignal(world.quests, journal, signal);
      }

      const finish = applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: config.mentorCharId });
      const grants = finish.completed.filter(grant => grant.questId === config.questId);
      expect(grants, config.key).toHaveLength(1);
      expect(grants[0]!.factionRenown).toEqual([{ factionId: config.factionId, delta: 5 }]);
      expect(grants[0]!.discoverKnowledgeNodeIds).toEqual([config.practiceNodeId, config.outcomeNodeId]);
      expect(journal.states.get(config.questId)?.status).toBe('completed');

      // Rewards are one-shot: replaying the final talk grants nothing more.
      const replay = applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: config.mentorCharId });
      expect(replay.completed).toEqual([]);
    }
  });

  it('teaches one real art per faction through the standing eligibility rule', () => {
    const profiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
    const martialArts = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
    if (!profiles.ok || !martialArts.ok) throw new Error('角色或武学资料未通过解析');
    const artsById = new Map(martialArts.set.martialArts.map(art => [art.id, art]));

    for (const config of factionPracticeConfigs) {
      const art = artsById.get(entryArts[config.key]!)!;
      // Wrong faction is rejected even with level and attributes met.
      expect(checkMartialArtEligibility(art, {
        level: 10, attributes: { body: 20, force: 20, agility: 20, insight: 20, resolve: 20 }, factionId: 'faction.other',
      }).eligible).toBe(false);

      const player = createCharacterState(profiles.set.profiles[0]!);
      player.level = 2;
      player.attributes.body = 11; player.attributes.force = 11;
      player.attributes.agility = 11; player.attributes.insight = 11; player.attributes.resolve = 11;

      const context = makeContext({
        character: player,
        martialArts: artsById,
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      // The original teaching entry lives on the r32-lessons node, not on greet.
      const lessons = world.conversations.get(config.mentorDialogueId)!.nodes
        .find(node => node.id === 'r32-lessons')!;
      const teach = lessons.options!.find(option =>
        option.effects?.some(effect => effect.kind === 'learnMartialArt' && effect.martialArtId === art.id));
      expect(teach, `${config.key} 授艺入口应保留`).toBeDefined();
      expect(getVisibleOptions(lessons, context)
        .some(({ option }) => option === teach)).toBe(true);
      const applied = applyDialogueEffects(teach!.effects!, context);
      expect(applied.ok).toBe(true);
      expect(player.martialArtIds).toContain(art.id);

      // Under-leveled attributes keep the same option hidden (eligibility unchanged).
      const novice = createCharacterState(profiles.set.profiles[0]!);
      novice.level = 1;
      const noviceContext = makeContext({
        character: novice,
        martialArts: artsById,
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      expect(getVisibleOptions(lessons, noviceContext)
        .some(({ option }) => option === teach)).toBe(false);
    }
  });

  it('legacy completions never fabricate the practice insight', () => {
    for (const config of factionPracticeConfigs) {
      // Old v1 save: quest completed back when only the verifier talk existed.
      const journal = createQuestJournal(world.quests);
      acceptQuest(world.quests, journal, config.questId, new Map(), {
        factionId: config.factionId, knownKnowledgeNodeIds: new Set([letterId]),
      });
      applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: world.quests.get(config.questId)!.objectives[0]!.targetId });
      // Simulate the old single-objective completion by force-finishing in order.
      for (const signal of middleSignals[config.key] ?? []) applyQuestSignal(world.quests, journal, signal);
      applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: config.mentorCharId });
      expect(journal.states.get(config.questId)?.status).toBe('completed');

      const legacyKnown = new Set([letterId]); // no r103 insight, no outcome insight
      const legacy = makeContext({
        journal,
        knownKnowledgeNodeIds: legacyKnown,
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      const legacyVisible = visibleTexts(config.mentorDialogueId, legacy);
      expect(legacyVisible.has(config.verifyEchoOption), `${config.key} 兼容反馈应可见`).toBe(true);
      expect(legacyVisible.has(config.practiceEchoOption), `${config.key} 实践反馈不应可见`).toBe(false);

      // The old verifier "resolved" option only re-delivers the outcome insight.
      const verifierConversation = factionPracticeConfigs
        .map(entry => world.conversations.get(entry.fieldDialogueId)!)
        .find(conversation => conversation.nodes.some(node =>
          node.options?.some(option => option.effects?.some(effect =>
            effect.kind === 'discoverKnowledgeNode' && effect.nodeId === config.outcomeNodeId))));
      expect(verifierConversation, `${config.key} 旧核询对白应保留`).toBeDefined();
      const resolved = verifierConversation!.nodes
        .flatMap(node => node.options ?? [])
        .find(option => option.effects?.some(effect =>
          effect.kind === 'discoverKnowledgeNode' && effect.nodeId === config.outcomeNodeId))!;
      expect(JSON.stringify(resolved.effects)).not.toContain(config.practiceNodeId);
      const applied = applyDialogueEffects(resolved.effects!, legacy);
      expect(applied.ok).toBe(true);
      expect(legacyKnown.has(config.outcomeNodeId)).toBe(true);
      expect(legacyKnown.has(config.practiceNodeId)).toBe(false);

      // Fresh full completion carries the practice insight: echo shows, verify hides.
      const freshKnown = new Set([letterId, config.practiceNodeId, config.outcomeNodeId]);
      const fresh = makeContext({
        journal,
        knownKnowledgeNodeIds: freshKnown,
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      const freshVisible = visibleTexts(config.mentorDialogueId, fresh);
      expect(freshVisible.has(config.practiceEchoOption)).toBe(true);
      expect(freshVisible.has(config.verifyEchoOption)).toBe(false);
    }
  });

  it('anchors report objectives and mentor hints to the mentors\' real locations', () => {
    const npcs = readJson<{ npcs: Array<{ id: string; mapResourceId: string }> }>(
      '../data/base/characters/round-03-npcs.json',
    ).npcs;
    const mapOf = new Map(npcs.map(npc => [npc.id, npc.mapResourceId]));
    // Jiangnan town vs the mist-ferry crossing are different maps; the report
    // wording must name the place the mentor actually stands on.
    expect(mapOf.get('char.ye-tingzhou')).toBe('map.round-01-grid');
    expect(mapOf.get('char.shi-bei')).toBe('map.round-10-mist-ferry');
    const expectedReportHint: Record<string, string> = {
      tingyu: '回镇里向叶庭舟复命',
      tiezhang: '回雾雨渡口向石北复命',
      yunyin: '回雾雨渡口向闻素心复命',
      hanshan: '回讲书堂向柳听澜复命',
      panzhou: '回栈桥向祝九弦复命',
    };
    for (const config of factionPracticeConfigs) {
      expect(mapOf.get(config.mentorCharId), config.key).toBeDefined();
      expect(world.quests.get(config.questId)!.objectives.at(-1)).toMatchObject({
        kind: 'talkToNpc', targetId: config.mentorCharId, text: expectedReportHint[config.key],
      });
    }
    // Liu Tinglan carries both roles inside one conversation: the tingyu
    // verifier brief and all five hanshan mentor entries coexist.
    const liu = world.conversations.get('dlg.liu-tinglan-mentor')!;
    for (const nodeId of ['r103-tingyu-field-brief', 'r103-hanshan-next', 'r103-hanshan-echo',
      'r103-hanshan-verify', 'r103-hanshan-letter', 'r103-hanshan-training']) {
      expect(liu.nodes.some(node => node.id === nodeId), nodeId).toBe(true);
    }
    // The tingyu practice observes old rope-holes and inscription habits; it
    // never promises a listening system nor proves the riverside clang.
    const tingyuQuest = world.quests.get('quest.r43-tingyu-eave-rain')!;
    const tingyuTexts = [
      tingyuQuest.description,
      ...tingyuQuest.objectives.map(objective => objective.text),
      liu.nodes.find(node => node.id === 'r103-tingyu-field-brief')!.text,
      world.conversations.get('dlg.ye-tingzhou-mentor')!.nodes.find(node => node.id === 'r103-tingyu-next')!.text,
      world.conversations.get('dlg.ye-tingzhou-mentor')!.nodes.find(node => node.id === 'r103-tingyu-echo')!.text,
      world.conversations.get('dlg.ye-tingzhou-mentor')!.nodes.find(node => node.id === 'r103-tingyu-verify')!.text,
      world.knowledgeNodes.get('event.r103-tingyu-practice')!.summary as string,
    ];
    for (const text of tingyuTexts) {
      expect(text).not.toMatch(/听山中|山中回声|山中刻痕.*证明|剑鸣之说到此为止/);
    }
    expect(tingyuTexts.join('\n')).toContain('旧索孔');
    expect(tingyuTexts.join('\n')).toContain('证不了江岸');
  });

  it('validates every conversation and resolves every authored reference', () => {
    for (const conversation of world.conversations.values()) {
      expect(validateConversation(conversation), conversation.id).toEqual([]);
    }
    // The three discovery objectives resolve against world events and landmarks.
    const worldMap = readJson<{
      events: Array<{ discoverKnowledgeNodeId?: string }>;
      landmarks: Array<{ discoveryNodeId?: string }>;
    }>('../data/base/world/world-map.json');
    for (const nodeId of ['place.r74-cloud-markers', 'place.r67-brine-well', 'place.r93-old-mark']) {
      expect(worldMap.events.some(event => event.discoverKnowledgeNodeId === nodeId), nodeId).toBe(true);
      expect(worldMap.landmarks.some(landmark => landmark.discoveryNodeId === nodeId), nodeId).toBe(true);
      expect(allNodeIds).toContain(nodeId);
    }
    for (const encounterId of ['encounter.r62-ridge-roadblock', 'encounter.r83-tide-wake-looters']) {
      expect(allEncounterIds).toContain(encounterId);
    }
    expect(allItemIds).toContain('item.huichun-gao');
    // Both practice insights and their static edges exist with the letter re-worded.
    const letter = world.knowledgeNodes.get(letterId)!;
    expect(letter.summary).toContain('师傅转抄');
    const edges = readJson<{ edges: Array<{ id: string; fromId: string; toId: string }> }>('../data/base/knowledge_graph/edges.json').edges;
    for (const config of factionPracticeConfigs) {
      expect(allNodeIds).toContain(config.practiceNodeId);
      expect(edges).toContainEqual(expect.objectContaining({
        id: `kg.edge.r103-${config.key}-practice`, fromId: config.mentorCharId, toId: config.practiceNodeId,
      }));
    }
    expect(parseGameCalendar(readJson('../data/base/worldview/calendar.json')).ok).toBe(true);
  });

  it('backs the training advice with real arts and both challenges are winnable', () => {
    const martialArts = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
    const r05 = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    const r83 = parseBattleEncounterSet(readJson('../data/base/battles/round-83-east-coast-encounters.json'));
    if (!martialArts.ok || !r05.ok || !r83.ok) throw new Error('武学或遭遇资料未通过解析');
    const encounters = [...r05.set.encounters, ...r83.set.encounters];
    const artsById = new Map(martialArts.set.martialArts.map(art => [art.id, art]));
    const factionArts = martialArts.set.martialArts.filter(art =>
      factionPracticeConfigs.some(config => art.factionIds.includes(config.factionId)));
    const kinds = new Set(factionArts.map(art => art.combat.kind));
    expect(kinds).toEqual(new Set(['attack', 'heal', 'guard']));

    // Advice text quotes each art's real numbers; guard promises only one hit.
    for (const config of factionPracticeConfigs) {
      const training = world.conversations.get(config.mentorDialogueId)!.nodes
        .find(node => node.id === `r103-${config.key}-training`)!;
      const body = training.text.slice(training.text.indexOf('「') + 1, training.text.lastIndexOf('」'));
      for (const line of body.split('；').map(part => part.trim()).filter(Boolean)) {
        const comma = line.indexOf('，');
        if (comma < 0 || !line.slice(0, comma + 4).includes('等级')) continue; // trailing advice sentence
        const name = line.slice(0, comma);
        const art = factionArts.find(entry => entry.name === name && entry.factionIds.includes(config.factionId));
        expect(art, `${config.key} 提示中的「${name}」应为本派真实武学`).toBeDefined();
        expect(line).toContain(`等级${art!.requirements.level}`);
        for (const [attribute, required] of Object.entries(art!.requirements.attributes)) {
          expect(line).toContain(`${attribute === 'body' ? '体魄' : attribute === 'force' ? '力道' : attribute === 'agility' ? '身法' : attribute === 'insight' ? '悟性' : '定力'}${required}`);
        }
        expect(line).toContain(art!.combat.kind === 'attack' ? `攻击${art!.combat.power}` : art!.combat.kind === 'heal' ? `恢复${art!.combat.power}` : `守御${art!.combat.power}`);
        expect(line).toContain(`耗气${art!.combat.qiCost}`);
      }
      expect(training.text).toContain('守只挡得住下一击');
      // heal restores health only: no qi-recovery or attribute-name drift.
      expect(training.text).toContain('养是疗伤回复生命');
      expect(training.text).not.toContain('回气养伤');
      expect(training.text).not.toContain('臂力');
      // No promised control/counter mechanics the combat protocol does not implement.
      expect(training.text).not.toMatch(/可封穴|能封穴|封穴制敌|自动反击|反震伤敌|定住对手/);
    }

    // A level-2 disciple with the entry art and met attributes wins both challenges.
    const profiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
    if (!profiles.ok) throw new Error('角色资料未通过解析');
    const fights: Array<{ encounterId: string; artId: string }> = [
      { encounterId: 'encounter.r62-ridge-roadblock', artId: 'skill.r32-tiezhang-tiezhuang-quan' },
      { encounterId: 'encounter.r83-tide-wake-looters', artId: 'skill.r32-panzhou-fanjing-dao' },
    ];
    for (const fight of fights) {
      const player = createCharacterState(profiles.set.profiles[0]!);
      player.level = 2;
      player.attributes.body = 11; player.attributes.force = 11;
      player.attributes.agility = 11; player.attributes.insight = 11; player.attributes.resolve = 11;
      player.martialArtIds = [fight.artId, 'skill.jianghu-sanshou'];
      const session = new CombatSession({
        encounter: encounters.find(encounter => encounter.id === fight.encounterId)!,
        profile: profiles.set.profiles[0]!,
        player,
        martialArts: artsById,
      });
      let guard = 0;
      while (!session.isOver && guard++ < 60) {
        const action = session.playerActions.find(candidate =>
          candidate.art.combat.kind === 'attack' && candidate.affordable);
        expect(action, `${fight.encounterId} 应有可用攻击`).toBeDefined();
        session.playerUse(action!.art.id);
      }
      expect(session.currentPhase, fight.encounterId).toBe('victory');
      expect(session.playerView.health.current).toBeGreaterThan(0);
    }
  });

  it('keeps the incremental runner idempotent across repeated runs', () => {
    const files = [
      'data/base/quests/round-07-quests.json',
      'data/base/dialogues/round-03-conversations.json',
      'data/base/dialogues/round-30-conversations.json',
      'data/base/knowledge_graph/nodes.json',
      'data/base/knowledge_graph/edges.json',
    ];
    const root = fileURLToPath(new URL('..', import.meta.url));
    const hash = () => files.map(file =>
      createHash('sha256').update(readFileSync(`${root}/${file}`)).digest('hex')).join();
    const before = hash();
    for (let run = 0; run < 2; run += 1) {
      execFileSync(process.execPath, ['scripts/deepen-round103-faction-practice.mjs'], { cwd: root });
    }
    expect(hash()).toBe(before);
  });
});

// --- True v1 save compatibility (capture → parse → plan → restore) -----------
// Old saves were written while the five R43 quests had exactly one objective;
// the fixture rebuilds that quest shape in memory, plays the v1 flow, captures
// a real snapshot and restores it against the deepened shipped definitions.

function buildV1Quests() {
  const parsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  for (const quest of parsed.set.quests) {
    const config = factionPracticeConfigs.find(entry => entry.questId === quest.id);
    if (!config) continue;
    delete quest.orderedObjectives;
    quest.objectives = quest.objectives.filter(objective => !objective.id.startsWith('objective.r103-'));
    delete quest.rewards.factionRenown;
    delete quest.rewards.discoverKnowledgeNodeIds;
  }
  const assembly = assembleQuests({
    questSet: parsed.set,
    questGiverNpcIds: new Set(allNpcIds),
    npcIds: new Set(allNpcIds),
    itemIds: new Set(allItemIds),
    encounterIds: new Set(allEncounterIds),
    factionIds: new Set(allFactionIds),
    knowledgeNodeIds: new Set(allNodeIds),
  });
  if (assembly.warnings.length > 0) throw new Error(assembly.warnings.join('\n'));
  return assembly.quests;
}

const v1Profiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
if (!v1Profiles.ok) throw new Error('角色资料未通过解析');
const v1Profile = v1Profiles.set.profiles[0]!;
const itemParse = parseItemSet(readJson('../data/base/items/round-06-items.json'));
if (!itemParse.ok) throw new Error('物品资料未通过解析');
const itemRecords = indexItems(itemParse.set).byId as Map<string, ItemRecordData>;

const captureFrom = (journal: ReturnType<typeof createQuestJournal>, known: ReadonlySet<string>) =>
  captureSaveSnapshot({
    displayName: 'round103-v1-compat',
    mapResourceId: 'map.round-10-mist-ferry',
    playerCol: 50,
    playerRow: 50,
    character: createCharacterState(v1Profile),
    inventory: createInventoryState(v1Profile, [{ itemId: 'item.huichun-gao', quantity: 2 }]),
    journal,
    social: createSocialState(),
    shopStocks: new Map(),
    completedEncounters: new Set(),
    completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: known,
    elapsedGameMinutes: 10,
    worldSeed: 123,
  });

const restoreRefs = () => ({
  profileIds: new Set([v1Profile.id]),
  profileRecords: new Map([[v1Profile.id, v1Profile]]),
  mapResourceId: 'map.round-10-mist-ferry',
  isWalkableCell: () => true,
  isCellOccupied: () => false,
  itemIds: new Set(itemRecords.keys()),
  itemRecords,
  martialArtIds: new Set(allArtIdsSnapshot),
  questIds: new Set(world.quests.keys()),
  questObjectiveIds: new Map(
    [...world.quests.values()].map(quest => [quest.id, new Set(quest.objectives.map(objective => objective.id))]),
  ),
  questRecords: world.quests,
  encounterIds: new Set(allEncounterIds),
  shopIds: new Set<string>(),
  npcIds: new Set(allNpcIds),
  knowledgeNodeIds: new Set(allNodeIds),
});

const allArtIdsSnapshot = collect('../data/base/skills', 'martialArts');

function restoreSnapshot(journal: ReturnType<typeof createQuestJournal>, known: ReadonlySet<string>) {
  const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(captureFrom(journal, known))));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('快照解析失败');
  const plan = planSnapshotRestore(parsed.snapshot, restoreRefs());
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error('快照恢复计划失败');
  return {
    plan,
    state: restoreRunState({
      snapshot: plan.snapshot,
      profile: v1Profile,
      items: itemRecords,
      quests: world.quests,
      shops: new Map(),
    }),
  };
}

describe('Round 103 v1 save compatibility', () => {
  it.each(factionPracticeConfigs.map(config => [config.key, config] as const))(
    '%s: a v1 completion restores completed, gains no practice insight and pays nothing again',
    (_key, config) => {
      // Play the v1 flow: single verifier talk completes the one-objective quest
      // with the original experience/currency pay only.
      const v1Quests = buildV1Quests();
      const journal = createQuestJournal(v1Quests);
      const accepted = acceptQuest(v1Quests, journal, config.questId, new Map(), {
        factionId: config.factionId,
        knownKnowledgeNodeIds: new Set([letterId]),
      });
      expect(accepted.ok).toBe(true);
      const v1Done = applyQuestSignal(v1Quests, journal, {
        type: 'npc-talk',
        npcId: v1Quests.get(config.questId)!.objectives[0]!.targetId,
      });
      const v1Grant = v1Done.completed.find(grant => grant.questId === config.questId);
      expect(v1Grant).toBeDefined();
      expect(v1Grant!.factionRenown ?? []).toHaveLength(0);
      expect(v1Grant!.discoverKnowledgeNodeIds ?? []).toHaveLength(0);

      // A v1 player plausibly took the old "resolved" talk for the outcome node.
      const restored = restoreSnapshot(journal, new Set([letterId, config.outcomeNodeId]));
      expect(restored.plan.warnings.filter(warning => warning.includes(config.questId))).toEqual([]);
      const state = restored.state.journal.states.get(config.questId)!;
      expect(state.status).toBe('completed');
      expect(state.objectiveCounts.get(world.quests.get(config.questId)!.objectives[0]!.id)).toBe(1);
      expect(new Set(restored.state.knownKnowledgeNodeIds).has(config.practiceNodeId)).toBe(false);

      // The legacy mentor feedback shows the verify echo, never the practice echo.
      const context = makeContext({
        journal: restored.state.journal,
        knownKnowledgeNodeIds: new Set(restored.state.knownKnowledgeNodeIds),
        factionState: createFactionMembershipState({
          factionId: config.factionId, masterNpcId: config.mentorCharId,
        }),
        speakerNpcId: config.mentorCharId,
      });
      const texts = visibleTexts(config.mentorDialogueId, context);
      expect(texts.has(config.verifyEchoOption)).toBe(true);
      expect(texts.has(config.practiceEchoOption)).toBe(false);

      // No reward ever repeats for the already-completed quest: reconciliation
      // with full facts (stock, insight, encounters) pays nothing again.
      const again = reconcileQuestFacts(world.quests, restored.state.journal, {
        knownKnowledgeNodeIds: new Set([...restored.state.knownKnowledgeNodeIds, 'place.r67-brine-well', 'place.r74-cloud-markers', 'place.r93-old-mark']),
        completedEncounterIds: new Set(['encounter.r62-ridge-roadblock', 'encounter.r83-tide-wake-looters']),
        itemCounts: new Map([['item.huichun-gao', 2]]),
      });
      expect(again.completed.map(grant => grant.questId)).not.toContain(config.questId);
      expect(restored.state.journal.states.get(config.questId)?.status).toBe('completed');
    },
  );

  it.each(factionPracticeConfigs.map(config => [config.key, config] as const))(
    '%s: a mid-practice active save keeps the finished inquiry and resets out-of-order progress',
    (_key, config) => {
      const quest = world.quests.get(config.questId)!;
      // Save taken after the verifier talk: the finished inquiry must survive.
      const journal = createQuestJournal(world.quests);
      acceptQuest(world.quests, journal, config.questId, new Map(), {
        factionId: config.factionId,
        knownKnowledgeNodeIds: new Set([letterId]),
      });
      applyQuestSignal(world.quests, journal, { type: 'npc-talk', npcId: quest.objectives[0]!.targetId });

      const restored = restoreSnapshot(journal, new Set([letterId]));
      expect(restored.plan.warnings.filter(warning => warning.includes(config.questId))).toEqual([]);
      let state = restored.state.journal.states.get(config.questId)!;
      expect(state.status).toBe('active');
      expect(state.objectiveCounts.get(quest.objectives[0]!.id)).toBe(1);
      for (const objective of quest.objectives.slice(1)) {
        expect(state.objectiveCounts.get(objective.id) ?? 0).toBe(0);
      }

      // A save that recorded field progress before the inquiry gets it reset.
      const jumped = createQuestJournal(world.quests);
      acceptQuest(world.quests, jumped, config.questId, new Map(), {
        factionId: config.factionId,
        knownKnowledgeNodeIds: new Set([letterId]),
      });
      jumped.states.get(config.questId)!.objectiveCounts.set(quest.objectives[1]!.id, 1);
      const jumpRestored = restoreSnapshot(jumped, new Set([letterId]));
      expect(jumpRestored.plan.warnings.join('\n')).toContain('重置提前记录的目标');
      state = jumpRestored.state.journal.states.get(config.questId)!;
      expect(state.status).toBe('active');
      expect(state.objectiveCounts.get(quest.objectives[0]!.id) ?? 0).toBe(0);
      expect(state.objectiveCounts.get(quest.objectives[1]!.id) ?? 0).toBe(0);

      // From the preserved inquiry the real practice path completes exactly once.
      for (const signal of middleSignals[config.key] ?? []) {
        applyQuestSignal(world.quests, restored.state.journal, signal);
      }
      if (config.key === 'yunyin') {
        reconcileQuestFacts(world.quests, restored.state.journal, {
          knownKnowledgeNodeIds: new Set(['place.r67-brine-well']),
          itemCounts: new Map([['item.huichun-gao', 2]]),
        });
      }
      const finish = applyQuestSignal(world.quests, restored.state.journal, {
        type: 'npc-talk', npcId: config.mentorCharId,
      });
      const grants = finish.completed.filter(grant => grant.questId === config.questId);
      expect(grants).toHaveLength(1);
      expect(grants[0]!.discoverKnowledgeNodeIds).toEqual([config.practiceNodeId, config.outcomeNodeId]);
    },
  );
});
