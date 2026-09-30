import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createFactionMembershipState } from '../src/engine/faction-system';
import { parseDialogueSet, validateConversation } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions } from '../src/engine/dialogue-runtime';
import { parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { parseKnowledgeNodeSet } from '../src/engine/knowledge-graph';
import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseNpcSet, type NpcRecordData, type PlacedNpc } from '../src/engine/npc-placement';
import {
  acceptQuest,
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { createSocialState } from '../src/engine/social-state';
import { findGridPath } from '../src/engine/grid-path';
import { buildQuestObjectiveWaypoint, buildWorldMapWaypoints } from '../src/engine/world-navigation';
import { findWorldTravelRoute } from '../src/engine/world-travel';
import {
  assembleWorldMap,
  parseWorldMap,
  regionEventConditionsMet,
  selectInteractableRegionEvent,
  selectVisibleWorldLandmarks,
} from '../src/engine/world-map';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ISLE_ID = 'map.round-87-southwest-isles';
const EAST_COAST_ID = 'map.round-82-east-coast';
const NPC_ID = 'char.r89-cheng-wenzhou';
const QUEST_ID = 'quest.r89-east-channel-echo';
const CLUE_ID = 'event.r89-chart-clue';
const MARK_ID = 'place.r89-east-channel-mark';
const EVENT_ID = 'event.r89-east-channel-mark';

function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function parsedMap(raw: unknown): GridMap {
  const result = parseGridMap(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.map;
}

const manifest = readJson('data/base/manifest.json') as {
  resources: Array<{ id: string; path: string; schema: string }>;
};
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources.filter(({ schema }) => schema === 'grid-map')) {
  maps.set(resource.id, parsedMap(readJson(`data/base/${resource.path}`)));
}
const worldRaw = readJson('data/base/world/world-map.json');
const calendarResult = parseGameCalendar(readJson('data/base/worldview/calendar.json'));
if (!calendarResult.ok) throw new Error(calendarResult.errors.join('\n'));
const calendar = calendarResult.calendar;
const climateRaw = readJson('data/base/worldview/climate.json');
const climateTides = new Set<string>(
  (climateRaw.tideCycle?.phases ?? []).map(({ id }: { id: string }) => id),
);
const nodeResult = parseKnowledgeNodeSet(readJson('data/base/knowledge_graph/nodes.json'));
if (!nodeResult.ok) throw new Error(nodeResult.errors.join('\n'));
const nodes = new Map(nodeResult.data.nodes.map((node) => [node.id, node]));
const worldParse = parseWorldMap(worldRaw);
if (!worldParse.ok) throw new Error(worldParse.errors.join('\n'));
const assembledWorld = assembleWorldMap(worldParse.data, maps, {
  knowledgeNodeIds: new Set(nodes.keys()),
  periodIds: new Set(calendar.periods.map(({ id }) => id)),
  weatherIds: new Set(climateRaw.weathers.map(({ id }: { id: string }) => id)),
  tideIds: climateTides,
});
if ('ok' in assembledWorld) throw new Error(assembledWorld.errors.join('\n'));

function makePlacedNpc(record: NpcRecordData): PlacedNpc {
  return { record, col: record.position.col, row: record.position.row };
}

function makeQuestAssembly() {
  const npcSet = parseNpcSet(readJson('data/base/characters/round-89-southwest-isles-npcs.json'));
  const questSet = parseQuestSet(readJson('data/base/quests/round-89-cross-region-quests.json'));
  if (!npcSet.ok || !questSet.ok) throw new Error('Round 89 NPC/quest data failed to parse');
  const questGiverNpcIds = new Set(npcSet.set.npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id));
  const quests = assembleQuests({
    questSet: questSet.set,
    questGiverNpcIds,
    npcIds: new Set(npcSet.set.npcs.map(({ id }) => id)),
    itemIds: new Set(),
    encounterIds: new Set(),
    knowledgeNodeIds: new Set(nodes.keys()),
  });
  return { npcSet: npcSet.set, quests };
}

function walkRoute(
  route: NonNullable<ReturnType<typeof findWorldTravelRoute>>,
  startMapId: string,
  start: { col: number; row: number },
): { mapResourceId: string; position: { col: number; row: number } } {
  let mapResourceId = startMapId;
  let position = start;
  for (const { transition } of route.legs) {
    expect(transition.from.mapResourceId).toBe(mapResourceId);
    const map = maps.get(mapResourceId)!;
    expect(findGridPath(map, position, transition.from), transition.id).not.toBeNull();
    const nextMap = maps.get(transition.to.mapResourceId)!;
    expect(nextMap.canEnter(transition.to.col, transition.to.row), transition.id).toBe(true);
    mapResourceId = transition.to.mapResourceId;
    position = { col: transition.to.col, row: transition.to.row };
  }
  return { mapResourceId, position };
}

describe('Round 89 cross-region route quest', () => {
  it('gives the route NPC a reachable seven-period schedule with no island collision', () => {
    const oldSet = parseNpcSet(readJson('data/base/characters/round-87-southwest-isles-npcs.json'));
    const newSet = parseNpcSet(readJson('data/base/characters/round-89-southwest-isles-npcs.json'));
    expect(oldSet.ok && newSet.ok).toBe(true);
    if (!oldSet.ok || !newSet.ok) return;
    const npcs = [...oldSet.set.npcs, ...newSet.set.npcs].map(makePlacedNpc);
    const island = maps.get(ISLE_ID)!;
    const compiled = compileNpcSchedules({
      npcs,
      periods: calendar.periods,
      maps: new Map([[ISLE_ID, island]]),
    });
    expect(compiled.warnings).toEqual([]);
    expect(compiled.placementsByPeriod.size).toBe(calendar.periods.length);
    for (const period of calendar.periods) {
      const placed = compiled.placementsByPeriod.get(period.id)!.filter(({ record }) => record.mapResourceId === ISLE_ID);
      expect(new Set(placed.map(({ col, row }) => `${col},${row}`)).size).toBe(placed.length);
      for (const npc of placed) {
        expect(island.canEnter(npc.col, npc.row), `${period.id}/${npc.record.id}`).toBe(true);
        expect(findGridPath(island, island.playerStart, npc), `${period.id}/${npc.record.id}`).not.toBeNull();
      }
    }
    expect(npcs.find(({ record }) => record.id === NPC_ID)?.record.schedule).toHaveLength(7);
  });

  it('gates the East Coast marker behind the accepted clue and links it to a discovered atlas pin', () => {
    const dialogueSet = parseDialogueSet(readJson('data/base/dialogues/round-89-southwest-isle-conversations.json'));
    const { npcSet, quests } = makeQuestAssembly();
    expect(dialogueSet.ok).toBe(true);
    expect(quests.warnings).toEqual([]);
    if (!dialogueSet.ok) return;
    for (const conversation of dialogueSet.set.conversations) expect(validateConversation(conversation)).toEqual([]);
    expect(manifest.resources.filter(({ id }) => id.includes('round-89'))).toEqual([
      { id: 'npc.round-89-southwest-isles-set', path: 'characters/round-89-southwest-isles-npcs.json', schema: 'npc-set' },
      { id: 'dialogue.round-89-southwest-isle-set', path: 'dialogues/round-89-southwest-isle-conversations.json', schema: 'dialogue-set' },
      { id: 'quest.round-89-cross-region-set', path: 'quests/round-89-cross-region-quests.json', schema: 'quest-set' },
    ]);

    const marker = assembledWorld.events.find(({ id }) => id === EVENT_ID)!;
    const landmark = assembledWorld.landmarks.find(({ id }) => id === 'landmark.r89-east-channel-mark')!;
    expect(marker).toMatchObject({ mapResourceId: EAST_COAST_ID, col: 66, row: 35, once: true });
    expect(marker.discoverKnowledgeNodeId).toBe(MARK_ID);
    expect(marker.conditions?.knowledgeNodeIds).toEqual([CLUE_ID]);
    expect(marker.interaction?.prompt).toBe('核对旧水槽的三道潮刻');
    expect(landmark).toMatchObject({
      mapResourceId: EAST_COAST_ID, col: marker.col, row: marker.row, discoveryNodeId: MARK_ID,
    });
    expect(assembledWorld.warnings).toEqual([]);
    const coast = maps.get(EAST_COAST_ID)!;
    expect(coast.canEnter(67, 35)).toBe(true);
    expect(findGridPath(coast, coast.playerStart, { col: 67, row: 35 })).not.toBeNull();
    expect(regionEventConditionsMet(marker, {
      knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null,
    })).toBe(false);
    expect(selectVisibleWorldLandmarks(assembledWorld.landmarks, new Set()).some(({ id }) =>
      id === landmark.id)).toBe(false);

    const journal = createQuestJournal(quests.quests);
    const npc = npcSet.npcs.find(({ id }) => id === NPC_ID)!;
    const conversation = dialogueSet.set.conversations.find(({ id }) => id === npc.dialogueId)!;
    const greet = conversation.nodes.find(({ id }) => id === 'greet')!;
    const runtime = {
      quests: quests.quests,
      journal,
      items: new Map(),
      inventory: null,
      social: createSocialState(),
      speakerNpcId: NPC_ID,
      knownKnowledgeNodeIds: new Set<string>(),
      knowledgeNodes: nodes,
      character: null,
      factions: new Map(),
      martialArts: new Map(),
      factionState: createFactionMembershipState(),
      timeOfDayPeriodId: 'period.dawn',
    };
    const accept = getVisibleOptions(greet, runtime).find(({ option }) =>
      option.effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === QUEST_ID));
    expect(accept).toBeDefined();
    const effectResult = applyDialogueEffects(accept!.option.effects!, runtime);
    expect(effectResult.ok).toBe(true);
    expect(journal.states.get(QUEST_ID)?.status).toBe('active');
    expect(runtime.knownKnowledgeNodeIds.has(CLUE_ID)).toBe(true);
    expect(regionEventConditionsMet(marker, {
      knownKnowledgeNodeIds: runtime.knownKnowledgeNodeIds, periodId: null, weatherId: null,
    })).toBe(true);

    const selected = selectInteractableRegionEvent(
      [marker], { mapResourceId: EAST_COAST_ID, col: 67, row: 35 }, new Set(), {
        knownKnowledgeNodeIds: runtime.knownKnowledgeNodeIds,
        periodId: null,
        weatherId: null,
      },
      (col, row) => coast.canEnter(col, row),
    );
    expect(selected?.event.id).toBe(EVENT_ID);
    expect(selected?.approachDirection).toBe('left');
    const found = applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: MARK_ID });
    expect(found.completed).toEqual([]);
    expect(journal.states.get(QUEST_ID)?.objectiveCounts.get('objective.r89-check-channel-mark')).toBe(1);
    expect(selectVisibleWorldLandmarks(assembledWorld.landmarks, new Set([MARK_ID])).some(({ id }) =>
      id === landmark.id)).toBe(true);
  });

  it('navigates and walks existing gates from the Southwest Isles to East Coast and back to report', () => {
    const { npcSet, quests } = makeQuestAssembly();
    expect(quests.warnings).toEqual([]);
    const quest = quests.quests.get(QUEST_ID)!;
    const journal = createQuestJournal(quests.quests);
    expect(acceptQuest(quests.quests, journal, QUEST_ID).ok).toBe(true);
    const routeNpc = npcSet.npcs.find(({ id }) => id === NPC_ID)!;
    const placed: PlacedNpc = { record: routeNpc, col: routeNpc.position.col, row: routeNpc.position.row };
    const navInput = {
      quests: quests.quests,
      journal,
      questId: QUEST_ID,
      worldMap: assembledWorld,
      baseNpcs: [placed],
      periodNpcs: [placed],
      encounters: [],
      knowledgeNodeTitles: new Map(nodeResult.data.nodes.map(({ id, title }) => [id, title])),
    };
    const destination = resolveQuestNavigationTarget(navInput);
    expect(destination.status).toBe('target');
    if (destination.status !== 'target') return;
    expect(destination.target).toMatchObject({ mapResourceId: EAST_COAST_ID, col: 66, row: 35, landmarkId: 'landmark.r89-east-channel-mark' });
    const firstWaypoint = buildQuestObjectiveWaypoint(assembledWorld, ISLE_ID, destination.target)!;
    expect(firstWaypoint.kind).toBe('remote-landmark');
    const atlasQuestPin = buildWorldMapWaypoints(assembledWorld, ISLE_ID, new Set(), [destination.target])
      .find(({ destinationId }) => destinationId === destination.target.id);
    expect(atlasQuestPin?.position).toEqual(firstWaypoint.position);
    expect(atlasQuestPin?.nextTransitionName).toBe(firstWaypoint.nextTransitionName);

    const outbound = findWorldTravelRoute(assembledWorld, ISLE_ID, EAST_COAST_ID);
    expect(outbound).not.toBeNull();
    const arrived = walkRoute(outbound!, ISLE_ID, routeNpc.position);
    expect(arrived.mapResourceId).toBe(EAST_COAST_ID);
    expect(findGridPath(maps.get(EAST_COAST_ID)!, arrived.position, { col: 67, row: 35 })).not.toBeNull();

    applyQuestSignal(quests.quests, journal, { type: 'knowledge-discovery', nodeId: MARK_ID });
    const report = resolveQuestNavigationTarget({ ...navInput, currentMapResourceId: EAST_COAST_ID });
    expect(report.status).toBe('target');
    if (report.status !== 'target') return;
    expect(report.target.mapResourceId).toBe(ISLE_ID);
    const returnWaypoint = buildQuestObjectiveWaypoint(assembledWorld, EAST_COAST_ID, report.target)!;
    expect(returnWaypoint.kind).toBe('remote-landmark');
    const returning = findWorldTravelRoute(assembledWorld, EAST_COAST_ID, ISLE_ID);
    expect(returning).not.toBeNull();
    const returned = walkRoute(returning!, EAST_COAST_ID, { col: 66, row: 35 });
    expect(returned.mapResourceId).toBe(ISLE_ID);
    expect(findGridPath(maps.get(ISLE_ID)!, returned.position, report.target)).not.toBeNull();

    const finished = applyQuestSignal(quests.quests, journal, { type: 'npc-talk', npcId: NPC_ID });
    expect(finished.completed.map(({ questId: id }) => id)).toEqual([QUEST_ID]);
    expect(finished.completed[0]?.discoverKnowledgeNodeIds).toEqual(['place.r89-safe-return-current']);
    expect(journal.states.get(QUEST_ID)?.status).toBe('completed');
    expect(resolveQuestNavigationTarget({ ...navInput, currentMapResourceId: ISLE_ID })).toMatchObject({
      status: 'no-target', reason: 'not-active',
    });
    expect(quest.objectives.map(({ kind }) => kind)).toEqual(['discoverKnowledge', 'talkToNpc']);
  });
});
