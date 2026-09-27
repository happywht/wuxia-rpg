import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseDialogueSet, validateConversation, type DialogueOptionData } from '../src/engine/dialogue-graph';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { parseKnowledgeNodeSet, type KnowledgeNodeData } from '../src/engine/knowledge-graph';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  hasQuestAccess,
  parseQuestSet,
  type QuestData,
} from '../src/engine/quest-system';
import { applyQuestRewardConsequences } from '../src/engine/quest-consequences';
import { createSocialState, getFactionRenown } from '../src/engine/social-state';
import { parseWorldMap, selectTriggeredRandomRegionEvent, type RandomRegionEventData } from '../src/engine/world-map';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

const questIds = {
  post: 'quest.r44-post-first',
  ledger: 'quest.r44-ledger-first',
} as const;
const clueId = 'event.r44-dock-claim';

type ParsedResource =
  | { ok: true; set?: unknown; data?: unknown; calendar?: unknown; map?: unknown }
  | { ok: false; errors: string[] };

function requireData<T>(result: ParsedResource, key: 'set' | 'data' | 'calendar' | 'map'): T {
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result[key] as T;
}

function findConversation(file: string, id: string) {
  const parsed = parseDialogueSet(readJson(`../data/base/dialogues/${file}`));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const conversation = parsed.set.conversations.find((entry) => entry.id === id);
  if (conversation === undefined) throw new Error(`missing conversation ${id}`);
  return conversation;
}

function optionWithQuestEffect(options: readonly DialogueOptionData[] | undefined, questId: string) {
  return options?.find((option) => option.effects?.some(
    (effect) => effect.kind === 'acceptQuest' && effect.questId === questId,
  ));
}

describe('Round 44 scheduled ferry event and consequences', () => {
  it('uses compiled dusk placements to require both nearby NPCs before rolling the encounter', () => {
    const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const npcSet = requireData<{ npcs: Array<{ id: string; mapResourceId: string; position: { col: number; row: number }; schedule: Array<{ periodId: string; position: { col: number; row: number } }> }> }>(npcParsed, 'set');
    const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
    const calendar = requireData<{ periods: Array<{ id: string; name: string; startMinute: number; lightLevel: number }> }>(calendarParsed, 'calendar');
    const mapParsed = parseGridMap(readJson('../data/base/maps/round-10-mist-ferry.json'));
    const map = requireData<GridMap>(mapParsed, 'map');
    const wanted = new Set(['char.shi-bei', 'char.bai-luzhou']);
    const npcs: PlacedNpc[] = npcSet.npcs
      .filter((npc) => wanted.has(npc.id))
      .map((record) => ({ record: record as PlacedNpc['record'], col: record.position.col, row: record.position.row }));
    expect(npcs).toHaveLength(2);
    const schedules = compileNpcSchedules({
      npcs,
      periods: calendar.periods,
      maps: new Map([[map.data.id, map]]),
    });
    expect(schedules.warnings).toEqual([]);
    const dusk = schedules.placementsByPeriod.get('period.dusk') ?? [];
    const shi = dusk.find((npc) => npc.record.id === 'char.shi-bei');
    const bai = dusk.find((npc) => npc.record.id === 'char.bai-luzhou');
    expect(shi).toMatchObject({ col: 3, row: 2 });
    expect(bai).toMatchObject({ col: 3, row: 4 });

    const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
    const world = requireData<{ randomEvents: Array<{ id: string; mapResourceId: string; conditions?: { nearbyNpcIds?: string[] } }> }>(worldParsed, 'data');
    const event = world.randomEvents.find((entry) => entry.id === 'event.r44-dock-claim');
    expect(event?.conditions?.nearbyNpcIds).toEqual(['char.shi-bei', 'char.bai-luzhou']);

    const nearPlayer = (placements: readonly PlacedNpc[]) => new Set(placements
      .filter((npc) => Math.abs(npc.col - 3) + Math.abs(npc.row - 3) === 1)
      .map((npc) => npc.record.id));
    const duskContext = {
      knownKnowledgeNodeIds: new Set(['event.r43-wayfarer-letter']),
      periodId: 'period.dusk',
      weatherId: 'weather.rain',
      nearbyNpcIds: nearPlayer(dusk),
    };
    expect([...duskContext.nearbyNpcIds].sort()).toEqual(['char.bai-luzhou', 'char.shi-bei']);
    expect(selectTriggeredRandomRegionEvent([event as RandomRegionEventData], map.data.id, new Set(), duskContext, () => 0)?.id)
      .toBe('event.r44-dock-claim');
    expect(selectTriggeredRandomRegionEvent([event as RandomRegionEventData], map.data.id, new Set(), {
      ...duskContext,
      nearbyNpcIds: new Set(['char.shi-bei']),
    }, () => { throw new Error('an NPC requirement failed; probability must not be rolled'); })).toBeNull();
    expect(selectTriggeredRandomRegionEvent([event as RandomRegionEventData], map.data.id, new Set(), {
      ...duskContext,
      periodId: 'period.midday',
    }, () => { throw new Error('the time condition failed; probability must not be rolled'); })).toBeNull();
    expect(selectTriggeredRandomRegionEvent([event as RandomRegionEventData], map.data.id, new Set(), {
      ...duskContext,
      knownKnowledgeNodeIds: new Set(),
    }, () => { throw new Error('the clue condition failed; probability must not be rolled'); })).toBeNull();
    expect(selectTriggeredRandomRegionEvent([event as RandomRegionEventData], map.data.id, new Set(), {
      ...duskContext,
      weatherId: 'weather.clear',
    }, () => { throw new Error('the weather condition failed; probability must not be rolled'); })).toBeNull();

    const midday = schedules.placementsByPeriod.get('period.midday') ?? [];
    expect(nearPlayer(midday)).toEqual(new Set());
  });

  it('exposes two data-driven exclusive choices and settles only the selected route once', () => {
    const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
    const questSet = requireData<{ quests: QuestData[] }>(questParsed, 'set');
    const npcsParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
    const npcSet = requireData<{ npcs: Array<{ id: string; questGiver: boolean }> }>(npcsParsed, 'set');
    const allNpcs = readJson<{ npcs: Array<{ id: string; questGiver?: boolean }> }>('../data/base/characters/round-03-npcs.json').npcs;
    const items = readJson<{ items: Array<{ id: string }> }>('../data/base/items/round-06-items.json').items;
    const encounters = readJson<{ encounters: Array<{ id: string }> }>('../data/base/battles/round-05-encounters.json').encounters;
    const factions = readJson<{ factions: Array<{ id: string }> }>('../data/base/factions/round-04-factions.json').factions;
    const nodesParsed = parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json'));
    const nodes = requireData<{ nodes: KnowledgeNodeData[] }>(nodesParsed, 'data');
    const assembly = assembleQuests({
      questSet,
      questGiverNpcIds: new Set(npcSet.npcs.filter((npc) => npc.questGiver).map((npc) => npc.id)),
      npcIds: new Set(allNpcs.map((npc) => npc.id)),
      itemIds: new Set(items.map((item) => item.id)),
      encounterIds: new Set(encounters.map((encounter) => encounter.id)),
      factionIds: new Set(factions.map((faction) => faction.id)),
      knowledgeNodeIds: new Set(nodes.nodes.map((node) => node.id)),
    });
    expect(assembly.warnings).toEqual([]);
    const post = assembly.quests.get(questIds.post);
    const ledger = assembly.quests.get(questIds.ledger);
    expect(post?.exclusiveGroupId).toBe('branch.r44-ferry-dispute');
    expect(ledger?.exclusiveGroupId).toBe(post?.exclusiveGroupId);
    expect(hasQuestAccess(post!, { knownKnowledgeNodeIds: new Set() })).toBe(false);
    expect(hasQuestAccess(post!, { knownKnowledgeNodeIds: new Set([clueId]) })).toBe(true);

    const bai = findConversation('round-30-conversations.json', 'dlg.bai-luzhou-ferry-master');
    const shi = findConversation('round-03-conversations.json', 'dlg.shi-bei-mentor');
    const liu = findConversation('round-30-conversations.json', 'dlg.liu-tinglan-mentor');
    expect(validateConversation(bai)).toEqual([]);
    expect(validateConversation(shi)).toEqual([]);
    expect(validateConversation(liu)).toEqual([]);
    const baiGreet = bai.nodes.find((node) => node.id === 'greet');
    for (const id of [questIds.post, questIds.ledger]) {
      const choice = optionWithQuestEffect(baiGreet?.options, id);
      expect(choice?.conditions).toContainEqual({ kind: 'knowledgeKnown', nodeId: clueId });
      expect(choice?.conditions).toContainEqual({ kind: 'questStatus', questId: id, status: 'offered' });
    }
    expect(shi.nodes.find((node) => node.id === 'greet')?.options).toContainEqual(expect.objectContaining({
      nextNodeId: 'r44-post-reinforced',
      conditions: [{ kind: 'questStatus', questId: questIds.post, status: 'completed' }],
    }));
    expect(liu.nodes.find((node) => node.id === 'greet')?.options).toContainEqual(expect.objectContaining({
      nextNodeId: 'r44-ledger-verified',
      conditions: [{ kind: 'questStatus', questId: questIds.ledger, status: 'completed' }],
    }));

    const routes = [
      { id: questIds.post, siblingId: questIds.ledger, targetNpcId: 'char.shi-bei', factionId: 'faction.tiezhang-pai', nodeId: 'event.r44-pier-reinforced' },
      { id: questIds.ledger, siblingId: questIds.post, targetNpcId: 'char.liu-tinglan', factionId: 'faction.hanshan-shuyuan', nodeId: 'event.r44-ledger-verified' },
    ];
    for (const route of routes) {
      const journal = createQuestJournal(assembly.quests);
      const accepted = acceptQuest(assembly.quests, journal, route.id, new Map(), {
        knownKnowledgeNodeIds: new Set([clueId]),
      });
      expect(accepted.ok).toBe(true);
      if (!accepted.ok) continue;
      expect(accepted.update.failedQuestIds).toContain(route.siblingId);
      expect(journal.states.get(route.siblingId)?.status).toBe('failed');
      const completion = applyQuestSignal(assembly.quests, journal, { type: 'npc-talk', npcId: route.targetNpcId });
      expect(completion.completed).toHaveLength(1);
      expect(completion.completed[0]?.questId).toBe(route.id);
      expect(completion.completed[0]?.factionRenown).toEqual([{ factionId: route.factionId, delta: 6 }]);
      expect(completion.completed[0]?.discoverKnowledgeNodeIds).toEqual([route.nodeId]);

      const social = createSocialState();
      social.factionRenown.set(route.factionId, 999);
      const known = new Set([clueId]);
      const consequences = applyQuestRewardConsequences(completion.completed[0]!, social, known);
      expect(getFactionRenown(social, route.factionId)).toBe(1000);
      expect(consequences.discoveredKnowledgeNodeIds).toEqual([route.nodeId]);
      expect(applyQuestSignal(assembly.quests, journal, { type: 'npc-talk', npcId: route.targetNpcId }).completed).toEqual([]);
    }
  });
});
