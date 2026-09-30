import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { findGridPath } from '../src/engine/grid-path';
import {
  assembleKnowledgeGraph,
  parseKnowledgeEdgeSet,
  parseKnowledgeNodeSet,
} from '../src/engine/knowledge-graph';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function requireParsed<T extends { ok: boolean }>(result: T, label: string): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`${label} should parse successfully`);
}

describe('Round 58 regional quest chains', () => {
  const rawQuests = readJson('../data/base/quests/round-07-quests.json') as {
    quests: Array<Record<string, unknown>>;
  };
  const questParse = parseQuestSet(rawQuests);
  requireParsed(questParse, 'Quest set');
  const rawNpcs = readJson('../data/base/characters/round-03-npcs.json') as {
    npcs: Array<{
      id: string;
      mapResourceId: string;
      position: { col: number; row: number };
      schedule?: Array<{ position: { col: number; row: number } }>;
      questGiver?: boolean;
    }>;
  };
  const rawEncounters = readJson('../data/base/battles/round-05-encounters.json') as {
    encounters: Array<{
      id: string;
      mapResourceId: string;
      position: { col: number; row: number };
      repeatable: boolean;
    }>;
  };
  const rawItems = readJson('../data/base/items/round-06-items.json') as {
    items: Array<{ id: string }>;
  };
  const rawFactions = readJson('../data/base/factions/round-04-factions.json') as {
    factions: Array<{ id: string }>;
  };
  const rawGraphNodes = readJson('../data/base/knowledge_graph/nodes.json');
  const rawGraphEdges = readJson('../data/base/knowledge_graph/edges.json');
  const nodeParse = parseKnowledgeNodeSet(rawGraphNodes);
  requireParsed(nodeParse, 'Knowledge nodes');
  const edgeParse = parseKnowledgeEdgeSet(rawGraphEdges);
  requireParsed(edgeParse, 'Knowledge edges');
  const graph = assembleKnowledgeGraph(nodeParse.data, edgeParse.data);
  const worldParse = parseWorldMap(readJson('../data/base/world/world-map.json'));
  requireParsed(worldParse, 'World map');
  const jiangnanParse = parseGridMap(readJson('../data/base/maps/round-01-grid.json'));
  requireParsed(jiangnanParse, 'Jiangnan map');
  const ferryParse = parseGridMap(readJson('../data/base/maps/round-10-mist-ferry.json'));
  requireParsed(ferryParse, 'Mist ferry map');
  const shopSet = readJson('../data/base/shops/round-06-shops.json') as {
    shops: Array<{ stock: Array<{ itemId: string; quantity: number }> }>;
  };

  const assembly = assembleQuests({
    questSet: questParse.set,
    questGiverNpcIds: new Set(rawNpcs.npcs.filter((npc) => npc.questGiver).map((npc) => npc.id)),
    npcIds: new Set(rawNpcs.npcs.map((npc) => npc.id)),
    itemIds: new Set(rawItems.items.map((item) => item.id)),
    encounterIds: new Set(rawEncounters.encounters.map((encounter) => encounter.id)),
    factionIds: new Set(rawFactions.factions.map((faction) => faction.id)),
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  });

  it('keeps six new tasks, both event discoveries, and the graph closed in existing schemas', () => {
    expect(questParse.set.quests).toHaveLength(44);
    expect(assembly.warnings).toEqual([]);
    expect(assembly.quests.size).toBe(44);
    expect(graph.warnings).toEqual([]);
    expect(nodeParse.data.nodes).toHaveLength(286);
    expect(edgeParse.data.edges).toHaveLength(393);

    const newQuestIds = [
      'quest.r58-market-discovery',
      'quest.r58-market-stall-pact',
      'quest.r58-market-toll-squabble',
      'quest.r58-south-hamlet-survey',
      'quest.r58-south-hamlet-supply',
      'quest.r58-pond-bandit-camp',
    ];
    expect(newQuestIds.every((id) => assembly.quests.has(id))).toBe(true);
    expect(rawGraphNodes).toBeDefined();
  });

  it('places the two discovery events and new encounters on connected, unoccupied walkable cells', () => {
    const world = worldParse.data;
    const jiangnan = jiangnanParse.map;
    const ferry = ferryParse.map;
    const targetIds = ['event.r58-market-first-visit', 'event.r58-south-hamlet-arrival'];
    const events = targetIds.map((id) => world.events.find((event) => event.id === id));
    expect(events.every((event) => event !== undefined)).toBe(true);
    expect(events.map((event) => event!.discoverKnowledgeNodeId)).toEqual([
      'place.mist-willow-market',
      'place.south-hamlet',
    ]);

    const newEvents = events as NonNullable<(typeof events)[number]>[];
    for (const event of newEvents) {
      const map = event.mapResourceId === ferry.data.id ? ferry : jiangnan;
      const landmark = world.landmarks.find((point) =>
        point.mapResourceId === event.mapResourceId && point.col === event.col && point.row === event.row,
      );
      expect(landmark).toBeDefined();
      // Round 60 gates both landing landmarks behind the same knowledge node
      // their first-visit event teaches; accepted quests project the pin.
      expect(landmark?.discoveryNodeId).toBe(event.discoverKnowledgeNodeId);
      expect(map.canEnter(event.col, event.row)).toBe(true);
      expect(findGridPath(map, map.playerStart, event)).not.toBeNull();
    }

    const newEncounterIds = ['encounter.r58-market-toll-claimer', 'encounter.r58-pond-fake-escort'];
    const newEncounters = newEncounterIds.map((id) => rawEncounters.encounters.find((encounter) => encounter.id === id));
    expect(newEncounters.every((encounter) => encounter !== undefined)).toBe(true);
    for (const encounter of newEncounters) {
      if (encounter === undefined) continue;
      const map = encounter.mapResourceId === ferry.data.id ? ferry : jiangnan;
      expect(map.canEnter(encounter.position.col, encounter.position.row), encounter.id).toBe(true);
      expect(findGridPath(map, map.playerStart, encounter.position)).not.toBeNull();
      expect(encounter.repeatable).toBe(true);
      const key = `${encounter.mapResourceId}:${encounter.position.col},${encounter.position.row}`;
      expect(world.events.some((event) =>
        `${event.mapResourceId}:${event.col},${event.row}` === key,
      )).toBe(false);
      expect(rawNpcs.npcs.some((npc) => {
        const positions = [npc.position, ...(npc.schedule ?? []).map((entry) => entry.position)];
        return npc.mapResourceId === encounter.mapResourceId && positions.some((position) =>
          position.col === encounter.position.col && position.row === encounter.position.row,
        );
      })).toBe(false);
    }

    const ferryGate = world.transitions.find((transition) => transition.id === 'gate.ferry-to-trial');
    expect(ferryGate).toBeDefined();
    if (ferryGate !== undefined) {
      const lu = rawNpcs.npcs.find((npc) => npc.id === 'char.lu-zhenniang')!;
      expect(findGridPath(ferry, ferry.playerStart, ferryGate.from)).not.toBeNull();
      expect(findGridPath(jiangnan, ferryGate.to, lu.position)).not.toBeNull();
    }
  });

  it('runs both three-step chains through discovery, inventory/talk, and encounter signals', () => {
    const journal = createQuestJournal(assembly.quests);
    const known = new Set(['place.mist-sluice']);

    expect(acceptQuest(assembly.quests, journal, 'quest.r56-north-water-gauge', new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.mist-north-cap',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r56-north-water-gauge']);
    known.add('place.mist-north-cap');
    expect(acceptQuest(assembly.quests, journal, 'quest.r56-south-waterway-survey', new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.mist-south-pool',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r56-south-waterway-survey']);
    known.add('place.mist-south-pool');

    const marketId = 'quest.r58-market-discovery';
    expect(journal.states.get(marketId)?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, marketId, new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.mist-willow-market',
    }).completed.map((entry) => entry.questId)).toEqual([marketId]);
    known.add('place.mist-willow-market');
    expect(journal.states.get('quest.r58-market-stall-pact')?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, 'quest.r58-market-stall-pact', new Map(), {
      knownKnowledgeNodeIds: known,
    }).ok).toBe(true);
    applyQuestSignal(assembly.quests, journal, {
      type: 'item-count', itemId: 'item.tough-leather', quantity: 3,
    });
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'npc-talk', npcId: 'char.shi-bei',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r58-market-stall-pact']);
    expect(journal.states.get('quest.r58-market-toll-squabble')?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, 'quest.r58-market-toll-squabble').ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'encounter-victory', encounterId: 'encounter.r58-market-toll-claimer',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r58-market-toll-squabble']);

    expect(acceptQuest(assembly.quests, journal, 'quest.round-07-medicine-run', new Map([
      ['item.huichun-gao', 3],
    ])).update.completed.map((entry) => entry.questId)).toEqual(['quest.round-07-medicine-run']);
    expect(journal.states.get('quest.r58-south-hamlet-survey')?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, 'quest.r58-south-hamlet-survey').ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'knowledge-discovery', nodeId: 'place.south-hamlet',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r58-south-hamlet-survey']);
    expect(journal.states.get('quest.r58-south-hamlet-supply')?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, 'quest.r58-south-hamlet-supply').ok).toBe(true);
    applyQuestSignal(assembly.quests, journal, {
      type: 'item-count', itemId: 'item.cangya-gen', quantity: 2,
    });
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'npc-talk', npcId: 'char.jiang-baiwei',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r58-south-hamlet-supply']);
    expect(journal.states.get('quest.r58-pond-bandit-camp')?.status).toBe('offered');
    expect(acceptQuest(assembly.quests, journal, 'quest.r58-pond-bandit-camp').ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'encounter-victory', encounterId: 'encounter.r58-pond-fake-escort',
    }).completed.map((entry) => entry.questId)).toEqual(['quest.r58-pond-bandit-camp']);
  });

  it('keeps quest supplies replenishable and battle losses fail only their active matching task', () => {
    const stock = shopSet.shops.flatMap((shop) => shop.stock);
    expect(stock.find((entry) => entry.itemId === 'item.tough-leather')?.quantity).toBe(-1);
    expect(stock.find((entry) => entry.itemId === 'item.cangya-gen')?.quantity).toBe(-1);

    const failedQuestId = 'quest.r58-market-toll-squabble';
    const failedQuest = assembly.quests.get(failedQuestId)!;
    const journal = createQuestJournal(assembly.quests);
    for (const prerequisiteId of failedQuest.prerequisiteQuestIds) {
      journal.states.get(prerequisiteId)!.status = 'completed';
    }
    journal.states.get(failedQuestId)!.status = 'offered';
    expect(acceptQuest(assembly.quests, journal, failedQuestId).ok).toBe(true);
    expect(applyQuestSignal(assembly.quests, journal, {
      type: 'encounter-defeat', encounterId: 'encounter.r58-market-toll-claimer',
    }).failedQuestIds).toEqual([failedQuestId]);
  });
});
