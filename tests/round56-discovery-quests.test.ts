import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv, { type AnySchema } from 'ajv';

import { findGridPath } from '../src/engine/grid-path';
import { parseGridMap } from '../src/engine/grid-map';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { applyQuestRewardConsequences } from '../src/engine/quest-consequences';
import {
  assembleKnowledgeGraph,
  parseKnowledgeEdgeSet,
  parseKnowledgeNodeSet,
} from '../src/engine/knowledge-graph';
import { createSocialState } from '../src/engine/social-state';
import { parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function requireParsed<T extends { ok: boolean }>(result: T, label: string): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`${label} should parse successfully`);
}

describe('Round 56 knowledge discovery objectives and ferry survey chain', () => {
  const rawQuests = readJson('../data/base/quests/round-07-quests.json') as {
    quests: Array<Record<string, unknown>>;
  };
  const taskRecords = rawQuests.quests.filter((quest) =>
    quest.id === 'quest.r56-north-water-gauge' || quest.id === 'quest.r56-south-waterway-survey',
  );
  const questParse = parseQuestSet({ quests: taskRecords });
  requireParsed(questParse, 'Round 56 tasks');
  const validateQuestSet = new Ajv({ allErrors: true })
    .compile(readJson('../data/schema/quest-set.schema.json') as AnySchema);

  const nodeParse = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
  requireParsed(nodeParse, 'Knowledge nodes');
  const edgeParse = parseKnowledgeEdgeSet(readJson('../data/base/knowledge_graph/edges.json'));
  requireParsed(edgeParse, 'Knowledge edges');
  const graph = assembleKnowledgeGraph(nodeParse.data, edgeParse.data);

  const worldParse = parseWorldMap(readJson('../data/base/world/world-map.json'));
  requireParsed(worldParse, 'World map');
  const mapParse = parseGridMap(readJson('../data/base/maps/round-10-mist-ferry.json'));
  requireParsed(mapParse, 'Mist ferry map');

  it('accepts a discovery objective in the real quest schema and rejects counts above one', () => {
    const quest = taskRecords[0]!;
    expect(validateQuestSet({ quests: [quest] })).toBe(true);
    expect(validateQuestSet({ quests: [{
      ...quest,
      objectives: [{
        ...(quest.objectives as Array<Record<string, unknown>>)[0],
        requiredCount: 2,
      }],
    }] })).toBe(false);
  });

  it('registers every event, place, quest, and graph edge used by the survey chain', () => {
    expect(graph.warnings).toEqual([]);
    expect(questParse.set.quests.map((quest) => quest.id)).toEqual([
      'quest.r56-north-water-gauge',
      'quest.r56-south-waterway-survey',
    ]);

    const assembly = assembleQuests({
      questSet: questParse.set,
      questGiverNpcIds: new Set(['char.shi-bei']),
      npcIds: new Set(['char.shi-bei']),
      itemIds: new Set(),
      encounterIds: new Set(),
      factionIds: new Set(),
      knowledgeNodeIds: new Set(graph.nodes.keys()),
    });
    expect(assembly.warnings).toEqual([]);
    expect(assembly.quests.size).toBe(2);
  });

  it('turns the two reachable one-shot ferry findings into the ordered quest chain', () => {
    const discoveries = worldParse.data.events.filter((event) =>
      event.id === 'event.r56-north-water-gauge' || event.id === 'event.r56-south-waterway-mark',
    );
    expect(discoveries).toHaveLength(2);
    for (const event of discoveries) {
      const landmark = worldParse.data.landmarks.find((point) =>
        point.mapResourceId === event.mapResourceId && point.col === event.col && point.row === event.row,
      );
      expect(landmark?.discoveryNodeId).toBe(event.discoverKnowledgeNodeId);
      expect(mapParse.map.canEnter(event.col, event.row)).toBe(true);
      expect(findGridPath(mapParse.map, mapParse.map.playerStart, event)).not.toBeNull();
      expect(graph.nodes.has(event.discoverKnowledgeNodeId!)).toBe(true);
    }

    const assembly = assembleQuests({
      questSet: questParse.set,
      questGiverNpcIds: new Set(['char.shi-bei']),
      npcIds: new Set(['char.shi-bei']),
      itemIds: new Set(),
      encounterIds: new Set(),
      knowledgeNodeIds: new Set(graph.nodes.keys()),
    });
    const journal = createQuestJournal(assembly.quests);
    const known = new Set(['place.mist-sluice']);
    const firstId = 'quest.r56-north-water-gauge';
    const secondId = 'quest.r56-south-waterway-survey';

    expect(acceptQuest(assembly.quests, journal, firstId, new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    const northEvent = discoveries.find((event) => event.id === 'event.r56-north-water-gauge')!;
    const north = applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: northEvent.discoverKnowledgeNodeId!,
    });
    known.add(northEvent.discoverKnowledgeNodeId!);
    expect(north.completed.map((entry) => entry.questId)).toEqual([firstId]);
    expect(journal.states.get(secondId)?.status).toBe('offered');

    expect(acceptQuest(assembly.quests, journal, secondId, new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    const southEvent = discoveries.find((event) => event.id === 'event.r56-south-waterway-mark')!;
    const south = applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: southEvent.discoverKnowledgeNodeId!,
    });
    expect(south.completed.map((entry) => entry.questId)).toEqual([secondId]);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: southEvent.discoverKnowledgeNodeId!,
    }).changed).toBe(false);
  });

  it('gates both atlas landmarks until their matching place knowledge is known', () => {
    expect(worldParse.data.landmarks.find((point) => point.id === 'landmark.mist-north-cap'))
      .toMatchObject({ discoveryNodeId: 'place.mist-north-cap' });
    expect(worldParse.data.landmarks.find((point) => point.id === 'landmark.mist-south-pool'))
      .toMatchObject({ discoveryNodeId: 'place.mist-south-pool' });
  });

  it('cascades a task reward discovery into another active discovery objective', () => {
    const parsed = parseQuestSet({ quests: [
      {
        id: 'quest.r56-cascade-source',
        name: '拓录潮线',
        description: '交验拓片。',
        giverNpcId: 'char.shi-bei',
        objectives: [{
          id: 'objective.r56-cascade-source',
          kind: 'talkToNpc',
          targetId: 'char.shi-bei',
          requiredCount: 1,
          text: '向石北交验拓片',
        }],
        rewards: {
          experience: 1,
          currency: 1,
          discoverKnowledgeNodeIds: ['place.mist-north-cap'],
        },
      },
      {
        id: 'quest.r56-cascade-follow-up',
        name: '循线复查',
        description: '循新线索复查。',
        giverNpcId: 'char.shi-bei',
        objectives: [{
          id: 'objective.r56-cascade-follow-up',
          kind: 'discoverKnowledge',
          targetId: 'place.mist-north-cap',
          requiredCount: 1,
          text: '确认北岬水尺',
        }],
        rewards: { experience: 1, currency: 1 },
      },
    ] });
    requireParsed(parsed, 'Reward cascade tasks');
    const assembled = assembleQuests({
      questSet: parsed.set,
      questGiverNpcIds: new Set(['char.shi-bei']),
      npcIds: new Set(['char.shi-bei']),
      itemIds: new Set(),
      encounterIds: new Set(),
      factionIds: new Set(),
      knowledgeNodeIds: new Set(graph.nodes.keys()),
    });
    expect(assembled.warnings).toEqual([]);
    const journal = createQuestJournal(assembled.quests);
    expect(acceptQuest(assembled.quests, journal, 'quest.r56-cascade-source').ok).toBe(true);
    expect(acceptQuest(assembled.quests, journal, 'quest.r56-cascade-follow-up').ok).toBe(true);

    const source = applyQuestSignal(assembled.quests, journal, {
      type: 'npc-talk',
      npcId: 'char.shi-bei',
    });
    expect(source.completed.map(({ questId }) => questId)).toEqual(['quest.r56-cascade-source']);
    const knownNodes = new Set<string>();
    const reward = applyQuestRewardConsequences(source.completed[0]!, createSocialState(), knownNodes);
    const followUp = reward.discoveredKnowledgeNodeIds.flatMap((nodeId) => applyQuestSignal(
      assembled.quests,
      journal,
      { type: 'knowledge-discovery', nodeId },
    ).completed);

    expect(knownNodes.has('place.mist-north-cap')).toBe(true);
    expect(followUp.map(({ questId }) => questId)).toEqual(['quest.r56-cascade-follow-up']);
    expect(journal.states.get('quest.r56-cascade-follow-up')?.status).toBe('completed');
  });
});
