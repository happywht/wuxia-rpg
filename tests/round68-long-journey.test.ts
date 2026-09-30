/** Round 68: one real-data journey across all four regions, a remote save, and an ending. */

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ClimateRuntime, parseClimate } from '../src/engine/climate-system';
import {
  createCharacterState,
  grantExperience,
  indexFactions,
  indexMartialArts,
  indexProfiles,
  parseCharacterProfileSet,
  parseFactionSet,
  parseMartialArtSet,
  type CharacterProfileData,
} from '../src/engine/character-progression';
import { GameClock, parseGameCalendar, type GameCalendarData } from '../src/engine/game-calendar';
import {
  applyDialogueEffects,
  getVisibleOptions,
  type DialogueRuntimeContext,
} from '../src/engine/dialogue-runtime';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { parseGridMap, type CellPosition, type GridMap } from '../src/engine/grid-map';
import {
  assembleKnowledgeGraph,
  parseKnowledgeEdgeSet,
  parseKnowledgeNodeSet,
} from '../src/engine/knowledge-graph';
import { compileNpcSchedules, resolveNpcPlacementsForPlayer } from '../src/engine/npc-schedule';
import {
  parseNpcSet,
  selectInteractionTarget,
  type PlacedNpc,
} from '../src/engine/npc-placement';
import {
  applyQuestSignal,
  assembleQuests,
  createQuestJournal,
  parseQuestSet,
  type QuestUpdateResult,
} from '../src/engine/quest-system';
import {
  createInventoryState,
  indexItems,
  parseItemSet,
} from '../src/engine/item-system';
import {
  captureSaveSnapshot,
  parseSaveSnapshot,
  planSnapshotRestore,
  restoreRunState,
} from '../src/engine/save-system';
import { createSocialState } from '../src/engine/social-state';
import { parseBattleEncounterSet, type PlacedEncounter } from '../src/engine/turn-based-combat';
import {
  assembleEndingSet,
  evaluateEndings,
  parseEndingSet,
  selectAdjacentEndingGate,
  selectEnding,
  type EndingEvaluationContext,
} from '../src/engine/ending-system';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import {
  resolveCellNavigationGuide,
  resolveWorldNavigationGuide,
  type NavigationDestinationCell,
  type WorldNavigationGuide,
} from '../src/engine/world-navigation-guidance';
import {
  assembleWorldMap,
  parseWorldMap,
  selectAdjacentTransition,
  selectNewRegionEventKnowledgeIds,
  selectTriggeredRegionEvents,
  type WorldMapAssembly,
} from '../src/engine/world-map';
import { findWorldTravelRoute } from '../src/engine/world-travel';

const JIANGNAN_ID = 'map.round-01-grid';
const FERRY_ID = 'map.round-10-mist-ferry';
const IRON_RIDGE_ID = 'map.round-62-iron-ridge';
const SALT_ROAD_ID = 'map.round-67-salt-road';
const CLOUD_RIDGE_ID = 'map.round-74-cloud-ridge';
const SALT_POST_ID = 'landmark.r67-caravan-post';
const LUO_ID = 'char.luo-jinzi';
const SALT_QUEST_ID = 'quest.r67-well-waterline';
const WELL_NODE_ID = 'place.r67-brine-well';
const FOOTPRINTS_NODE_ID = 'event.old-footprints';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function requireParsed<T extends { ok: boolean }>(result: T, label: string): Extract<T, { ok: true }> {
  if (!result.ok) {
    const errors = (result as { errors?: string[] }).errors ?? [];
    throw new Error(`${label} 无法解析：\n${errors.join('\n')}`);
  }
  return result as Extract<T, { ok: true }>;
}

function distance(left: CellPosition, right: CellPosition): number {
  return Math.abs(left.col - right.col) + Math.abs(left.row - right.row);
}

function cellKey(position: CellPosition): string {
  return `${position.col},${position.row}`;
}

function hasEffect(option: { effects?: readonly { kind: string; questId?: string }[] }, questId: string): boolean {
  return option.effects?.some((effect) => effect.kind === 'acceptQuest' && effect.questId === questId) === true;
}

interface JourneyWorld {
  maps: Map<string, GridMap>;
  world: WorldMapAssembly;
  calendar: GameCalendarData;
  climate: ClimateRuntime;
  weatherSeed: number;
  baseNpcs: PlacedNpc[];
  scheduleByPeriod: ReadonlyMap<string, readonly PlacedNpc[]>;
  encounters: PlacedEncounter[];
  encounterCellsByMap: Map<string, ReadonlySet<string>>;
  events: WorldMapAssembly['events'];
  questGivers: ReadonlySet<string>;
  quests: ReturnType<typeof assembleQuests>['quests'];
  questObjectives: Map<string, Set<string>>;
  profile: CharacterProfileData;
  items: ReturnType<typeof indexItems>['byId'];
  factions: ReturnType<typeof indexFactions>['byId'];
  martialArts: ReturnType<typeof indexMartialArts>['byId'];
  knowledgeNodes: ReturnType<typeof assembleKnowledgeGraph>['nodes'];
  knowledgeEdges: ReturnType<typeof assembleKnowledgeGraph>['edges'];
  knowledgeTitles: Map<string, string>;
  defaultKnowledgeNodeIds: Set<string>;
  profileRecords: Map<string, CharacterProfileData>;
  factionIds: Set<string>;
  npcIds: Set<string>;
  encounterIds: Set<string>;
  itemIds: Set<string>;
  martialArtIds: Set<string>;
  regionalEventIds: Set<string>;
  endingSet: NonNullable<ReturnType<typeof assembleEndingSet>['endingSet']>;
  dialogueContext: DialogueRuntimeContext;
}

interface JourneyRun {
  mapResourceId: string;
  position: CellPosition;
  clock: GameClock;
  character: ReturnType<typeof createCharacterState>;
  inventory: ReturnType<typeof createInventoryState>;
  journal: ReturnType<typeof createQuestJournal>;
  social: ReturnType<typeof createSocialState>;
  factionState: ReturnType<typeof createFactionMembershipState>;
  knownKnowledgeNodeIds: Set<string>;
  completedRegionalEvents: Set<string>;
  completedEncounters: Set<string>;
  periodIdsSeen: Set<string>;
  mapIdsVisited: Set<string>;
  transitionIds: string[];
  regionSegments: Array<{
    from: string;
    to: string;
    gateId: string;
    steps: number;
    gateApproach: CellPosition;
    gateCell: CellPosition;
    directions: string;
  }>;
  directionsSinceGate: string[];
  walkedSteps: number;
  waitedMinutes: number;
  eventDiscoveryIds: string[];
  browserTrace: BrowserTraceAction[];
}

type BrowserTraceAction =
  | {
    kind: 'walk';
    stage: string;
    mapResourceId: string;
    start: CellPosition;
    end: CellPosition;
    targetName: string;
    stop: 'gate' | 'arrived';
    directions: string;
  }
  | {
    kind: 'gate';
    key: 'E';
    gateId: string;
    fromMapResourceId: string;
    toMapResourceId: string;
    landing: CellPosition;
  }
  | {
    kind: 'wait';
    key: 'V';
    mapResourceId: string;
    minutes: number;
    reason: 'route-blocked' | 'gate-landing-blocked';
  }
  | {
    kind: 'checkpoint';
    id: 'save-and-refresh-in-salt-road' | 'salt-quest-completed' | 'ending-gate';
    mapResourceId: string;
    position: CellPosition;
    saveKeys?: string[];
    continueKeys?: string[];
    endingKey?: 'E';
    endingId?: string;
  };

function loadJourneyWorld(): JourneyWorld {
  const maps = new Map<string, GridMap>();
  for (const [id, file] of [
    [JIANGNAN_ID, 'round-01-grid.json'],
    [FERRY_ID, 'round-10-mist-ferry.json'],
    [IRON_RIDGE_ID, 'round-62-iron-ridge.json'],
    [SALT_ROAD_ID, 'round-67-salt-road.json'],
    [CLOUD_RIDGE_ID, 'round-74-cloud-ridge.json'],
    ['map.round-79-isles', 'round-79-isles.json'],
    ['map.round-82-east-coast', 'round-82-east-coast.json'],
    ['map.round-84-windward-isle', 'round-84-windward-isle.json'],
    ['map.round-85-tide-isle', 'round-85-tide-isle.json'],
    ['map.round-87-southwest-isles', 'round-87-southwest-isles.json'],
    ['map.round-91-cloud-north-terrace', 'round-91-cloud-north-terrace.json'],
    ['map.round-92-north-pass', 'round-92-north-pass.json'],
    ['map.round-93-snow-pine-valley', 'round-93-snow-pine-valley.json'],
    ['map.round-94-east-gate', 'round-94-east-gate.json'],
    ['map.round-94-returning-sails', 'round-94-returning-sails.json'],
    ['map.round-95-misty-pine-gate', 'round-95-misty-pine-gate.json'],
    ['map.round-95-cedar-valley', 'round-95-cedar-valley.json'],
    ['map.round-95-east-harbor', 'round-95-east-harbor.json'],
    ['map.round-96-stone-reef', 'round-96-stone-reef.json'],
    ['map.round-96-halfmoon-atoll', 'round-96-halfmoon-atoll.json'],
  ] as const) {
    const parsed = requireParsed(parseGridMap(readJson(`../data/base/maps/${file}`)), file);
    expect(parsed.map.data.id, `${file} stable id`).toBe(id);
    maps.set(id, parsed.map);
  }

  const calendar = requireParsed(parseGameCalendar(readJson('../data/base/worldview/calendar.json')), '历法').calendar;
  const climateData = requireParsed(parseClimate(readJson('../data/base/worldview/climate.json'), calendar), '气候').climate;
  const climate = new ClimateRuntime(climateData, calendar);
  const questSet = requireParsed(parseQuestSet(readJson('../data/base/quests/round-07-quests.json')), '任务').set;
  const npcSet = requireParsed(parseNpcSet(readJson('../data/base/characters/round-03-npcs.json')), '人物').set;
  const encounterSet = requireParsed(parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json')), '遭遇').set;
  const itemSet = requireParsed(parseItemSet(readJson('../data/base/items/round-06-items.json')), '物品').set;
  const factionSet = requireParsed(parseFactionSet(readJson('../data/base/factions/round-04-factions.json')), '门派').set;
  const profileSet = requireParsed(parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json')), '角色模板').set;
  const martialSet = requireParsed(parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json')), '武学').set;
  const nodeSet = requireParsed(parseKnowledgeNodeSet(readJson('../data/base/knowledge_graph/nodes.json')), '知识节点').data;
  const edgeSet = requireParsed(parseKnowledgeEdgeSet(readJson('../data/base/knowledge_graph/edges.json')), '知识关系').data;
  const graph = assembleKnowledgeGraph(nodeSet, edgeSet);
  expect(graph.warnings, '知识图谱装配').toEqual([]);
  const worldData = requireParsed(parseWorldMap(readJson('../data/base/world/world-map.json')), '全域地图').data;
  const worldResult = assembleWorldMap(worldData, maps, {
    knowledgeNodeIds: new Set(graph.nodes.keys()),
    periodIds: new Set(calendar.periods.map(({ id }) => id)),
    weatherIds: new Set(climateData.weathers.map(({ id }) => id)),
    npcIds: new Set([...npcSet.npcs.map(({ id }) => id), 'char.r87-ao-wanqing']),
  });
  if ('ok' in worldResult) throw new Error(worldResult.errors.join('\n'));
  expect(worldResult.warnings, '全域/关口/事件装配').toEqual([]);
  expect(worldResult.regions.map(({ mapResourceId }) => mapResourceId).sort())
    .toEqual([JIANGNAN_ID, FERRY_ID, IRON_RIDGE_ID, SALT_ROAD_ID, CLOUD_RIDGE_ID, 'map.round-79-isles', 'map.round-82-east-coast', 'map.round-84-windward-isle', 'map.round-85-tide-isle', 'map.round-87-southwest-isles', 'map.round-91-cloud-north-terrace', 'map.round-92-north-pass', 'map.round-93-snow-pine-valley', 'map.round-94-east-gate', 'map.round-94-returning-sails', 'map.round-95-misty-pine-gate', 'map.round-95-cedar-valley', 'map.round-95-east-harbor', 'map.round-96-stone-reef', 'map.round-96-halfmoon-atoll'].sort());

  const npcIds = new Set(npcSet.npcs.map(({ id }) => id));
  const itemIndex = indexItems(itemSet);
  const factionIndex = indexFactions(factionSet);
  const factionIds = new Set(factionIndex.byId.keys());
  const martialIndex = indexMartialArts({ set: martialSet, factionIds });
  const encounterIds = new Set(encounterSet.encounters.map(({ id }) => id));
  const questGivers = new Set(npcSet.npcs.filter(({ questGiver }) => questGiver).map(({ id }) => id));
  const questsAssembly = assembleQuests({
    questSet,
    questGiverNpcIds: questGivers,
    npcIds,
    itemIds: new Set(itemIndex.byId.keys()),
    encounterIds,
    factionIds,
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  });
  expect(questsAssembly.warnings, '任务跨资源装配').toEqual([]);

  const baseNpcs: PlacedNpc[] = npcSet.npcs.map((record) => ({ record, col: record.position.col, row: record.position.row }));
  const encounters: PlacedEncounter[] = encounterSet.encounters.map((record) => ({
    record,
    col: record.position.col,
    row: record.position.row,
    profile: {} as PlacedEncounter['profile'],
    enemyArts: [],
  }));
  const encounterCellsByMap = new Map<string, ReadonlySet<string>>();
  for (const mapId of maps.keys()) {
    encounterCellsByMap.set(mapId, new Set(encounters
      .filter(({ record }) => record.mapResourceId === mapId)
      .map(({ col, row }) => `${col},${row}`)));
  }
  const schedules = compileNpcSchedules({
    npcs: baseNpcs,
    periods: calendar.periods,
    maps,
    blockedCellsByMap: encounterCellsByMap,
  });
  expect(schedules.warnings, '四区所有 NPC 日程/遭遇占格').toEqual([]);

  const profileIndex = indexProfiles(profileSet);
  const profile = profileIndex.byId.get('char.scribe-apprentice');
  if (profile === undefined) throw new Error('实际开局角色模板缺失');
  const profileRecords = new Map([[profile.id, profile]]);
  const dialogues = requireParsed(parseDialogueSet(readJson('../data/base/dialogues/round-67-conversations.json')), '盐道对话').set;
  const saltDialogue = dialogues.conversations.find(({ id }) => id === 'dlg.luo-jinzi-salt-road');
  if (saltDialogue === undefined) throw new Error('罗金子的资料对白缺失');
  const endingData = requireParsed(parseEndingSet(readJson('../data/base/endings/round-27-endings.json')), '结局').set;
  const occupiedCells = new Map<string, ReadonlySet<string>>();
  for (const mapId of maps.keys()) {
    occupiedCells.set(mapId, new Set([
      ...baseNpcs.filter(({ record }) => record.mapResourceId === mapId).map(({ col, row }) => `${col},${row}`),
      ...encounters.filter(({ record }) => record.mapResourceId === mapId).map(({ col, row }) => `${col},${row}`),
    ]));
  }
  const endingAssembly = assembleEndingSet({
    set: endingData,
    maps,
    blockedCells: occupiedCells,
    knowledgeNodes: graph.nodes,
    questIds: new Set(questsAssembly.quests.keys()),
    npcIds,
    factionIds,
  });
  expect(endingAssembly.warnings, '结局门和全部条件引用').toEqual([]);
  if (endingAssembly.endingSet === null) throw new Error('结局组被关闭');

  const questObjectives = new Map([...questsAssembly.quests].map(([id, quest]) => [
    id,
    new Set(quest.objectives.map(({ id: objectiveId }) => objectiveId)),
  ]));
  const regionalEventIds = new Set([...worldResult.events, ...worldResult.randomEvents].map(({ id }) => id));
  const nodes = new Map(graph.nodes);
  const knownKnowledgeNodeIds = new Set(nodeSet.nodes.filter(({ knownByDefault }) => knownByDefault).map(({ id }) => id));
  const character = createCharacterState(profile);
  const inventory = createInventoryState(profile, []);
  const journal = createQuestJournal(questsAssembly.quests);
  const social = createSocialState();
  const factionState = createFactionMembershipState();
  const dialogueContext: DialogueRuntimeContext = {
    quests: questsAssembly.quests,
    journal,
    items: itemIndex.byId,
    inventory,
    social,
    speakerNpcId: LUO_ID,
    knownKnowledgeNodeIds,
    knowledgeNodes: nodes,
    knowledgeEdges: graph.edges,
    npcNames: new Map(baseNpcs.map(({ record }) => [record.id, record.name])),
    character,
    factions: factionIndex.byId,
    martialArts: martialIndex.byId,
    factionState,
    timeOfDayPeriodId: calendar.periods[0]?.id ?? '',
  };
  return {
    maps,
    world: worldResult,
    calendar,
    climate,
    weatherSeed: 6801,
    baseNpcs,
    scheduleByPeriod: schedules.placementsByPeriod,
    encounters,
    encounterCellsByMap,
    events: worldResult.events,
    questGivers,
    quests: questsAssembly.quests,
    questObjectives,
    profile,
    items: itemIndex.byId,
    factions: factionIndex.byId,
    martialArts: martialIndex.byId,
    knowledgeNodes: nodes,
    knowledgeEdges: graph.edges,
    knowledgeTitles: new Map([...nodes].map(([id, node]) => [id, node.title])),
    defaultKnowledgeNodeIds: knownKnowledgeNodeIds,
    profileRecords,
    factionIds,
    npcIds,
    encounterIds,
    itemIds: new Set(itemIndex.byId.keys()),
    martialArtIds: new Set(martialIndex.byId.keys()),
    regionalEventIds,
    endingSet: endingAssembly.endingSet,
    dialogueContext,
  };
}

function createJourney(world: JourneyWorld): JourneyRun {
  const startingMap = world.maps.get(JIANGNAN_ID)!;
  return {
    mapResourceId: JIANGNAN_ID,
    position: { ...startingMap.playerStart },
    clock: new GameClock(world.calendar),
    character: world.dialogueContext.character!,
    inventory: world.dialogueContext.inventory!,
    journal: world.dialogueContext.journal,
    social: world.dialogueContext.social,
    factionState: world.dialogueContext.factionState,
    knownKnowledgeNodeIds: world.dialogueContext.knownKnowledgeNodeIds,
    completedRegionalEvents: new Set(),
    completedEncounters: new Set(),
    periodIdsSeen: new Set(),
    mapIdsVisited: new Set([JIANGNAN_ID]),
    transitionIds: [],
    regionSegments: [],
    directionsSinceGate: [],
    walkedSteps: 0,
    waitedMinutes: 0,
    eventDiscoveryIds: [],
    browserTrace: [],
  };
}

function liveNpcs(world: JourneyWorld, run: JourneyRun, mapId = run.mapResourceId, player = run.position): PlacedNpc[] {
  const map = world.maps.get(mapId)!;
  return resolveNpcPlacementsForPlayer({
    baseNpcs: world.baseNpcs,
    periodNpcs: world.scheduleByPeriod.get(run.clock.currentPeriod().id) ?? world.baseNpcs,
    mapResourceId: mapId,
    map,
    playerPosition: mapId === run.mapResourceId ? player : null,
    blockedCells: world.encounterCellsByMap.get(mapId),
  });
}

function recordLocation(world: JourneyWorld, run: JourneyRun): void {
  const map = world.maps.get(run.mapResourceId)!;
  const npcs = liveNpcs(world, run);
  const nearbyNpcIds = new Set(npcs.filter(({ col, row }) => distance(run.position, { col, row }) === 1)
    .map(({ record }) => record.id));
  const period = run.clock.currentPeriod();
  run.periodIdsSeen.add(period.id);
  const weather = world.climate.weatherForDay(world.weatherSeed, run.clock.snapshot());
  const triggered = selectTriggeredRegionEvents(
    world.events,
    { mapResourceId: run.mapResourceId, ...run.position },
    run.completedRegionalEvents,
    { knownKnowledgeNodeIds: run.knownKnowledgeNodeIds, periodId: period.id, weatherId: weather.id, nearbyNpcIds },
  );
  for (const event of triggered) if (event.once) run.completedRegionalEvents.add(event.id);
  const discoveries = selectNewRegionEventKnowledgeIds(triggered, run.knownKnowledgeNodeIds);
  for (const nodeId of discoveries) {
    run.knownKnowledgeNodeIds.add(nodeId);
    run.eventDiscoveryIds.push(nodeId);
    const progress = applyQuestSignal(world.quests, run.journal, { type: 'knowledge-discovery', nodeId });
    settleQuestRewards(world, run, progress);
  }
  // Keep clock/date work observable in the trace and ensure every tested cell is a live-map cell.
  expect(map.canEnter(run.position.col, run.position.row), `live position ${run.mapResourceId}/${cellKey(run.position)}`).toBe(true);
}

function settleQuestRewards(world: JourneyWorld, run: JourneyRun, update: QuestUpdateResult): void {
  for (const reward of update.completed) {
    grantExperience(world.profile, run.character, reward.experience);
    run.inventory.currency += reward.currency;
    for (const nodeId of reward.discoverKnowledgeNodeIds ?? []) run.knownKnowledgeNodeIds.add(nodeId);
  }
}

type TargetResolver = (npcs: readonly PlacedNpc[]) => NavigationDestinationCell | null;

interface JourneyReport {
  endMapResourceId: string;
  steps: number;
  periods: string[];
  transitions: string[];
}

function walkTo(
  world: JourneyWorld,
  run: JourneyRun,
  targetForPeriod: TargetResolver,
  atlasLandmarkId?: string,
  traceStage = 'journey',
): JourneyReport {
  const periodsAtStart = new Set(run.periodIdsSeen);
  const transitionCountAtStart = run.transitionIds.length;
  const stepsAtStart = run.walkedSteps;
  let traceMapResourceId = run.mapResourceId;
  let traceStart: CellPosition = { ...run.position };
  let traceDirections = '';
  let traceTargetName = '';
  const flushTraceWalk = (stop: 'gate' | 'arrived'): void => {
    if (traceDirections.length === 0) return;
    run.browserTrace.push({
      kind: 'walk', stage: traceStage, mapResourceId: traceMapResourceId,
      start: traceStart, end: { ...run.position }, targetName: traceTargetName, stop,
      directions: traceDirections,
    });
    traceDirections = '';
  };
  for (let tick = 0; tick < 5000; tick += 1) {
    const map = world.maps.get(run.mapResourceId)!;
    const period = run.clock.currentPeriod();
    run.periodIdsSeen.add(period.id);
    const npcs = liveNpcs(world, run);
    const target = targetForPeriod(npcs);
    if (target === null) throw new Error(`旅程目标暂时无法从真实资料解析（${run.mapResourceId} / ${period.id}）`);
    traceTargetName = target.name;
    const occupied = new Set<string>([
      ...npcs.map(({ col, row }) => `${col},${row}`),
      ...(world.encounterCellsByMap.get(run.mapResourceId) ?? []),
    ]);
    const guide: WorldNavigationGuide = atlasLandmarkId === undefined
      ? resolveCellNavigationGuide(world.world, run.mapResourceId, target, map, run.position, occupied)
      : resolveWorldNavigationGuide(
        world.world,
        run.mapResourceId,
        atlasLandmarkId,
        run.knownKnowledgeNodeIds,
        map,
        run.position,
        occupied,
      );

    if (guide.status === 'target-lost' || guide.status === 'route-broken') {
      throw new Error(`长途路线失效：${guide.status} / ${target.name} / ${run.mapResourceId} / ${period.id}`);
    }
    if (guide.status === 'route-blocked') {
      const beforePeriod = period.id;
      const waitMinutes = world.calendar.actionCosts.waitMinutes;
      run.browserTrace.push({
        kind: 'wait', key: 'V', mapResourceId: run.mapResourceId,
        minutes: waitMinutes, reason: 'route-blocked',
      });
      const advanced = run.clock.advance(waitMinutes);
      expect(advanced, 'V 等候需要推进游戏时间').toBe(true);
      run.waitedMinutes += waitMinutes;
      run.periodIdsSeen.add(run.clock.currentPeriod().id);
      if (run.clock.currentPeriod().id === beforePeriod && run.waitedMinutes > 2880) {
        throw new Error(`动态障碍等待两日后仍不消退：${target.name}`);
      }
      continue;
    }
    if (guide.status === 'arrived') {
      flushTraceWalk('arrived');
      return {
        endMapResourceId: run.mapResourceId,
        steps: run.walkedSteps - stepsAtStart,
        periods: [...new Set([...periodsAtStart, ...run.periodIdsSeen])],
        transitions: run.transitionIds.slice(transitionCountAtStart),
      };
    }
    if (guide.status === 'at-gate') {
      const route = findWorldTravelRoute(world.world, run.mapResourceId, target.mapResourceId);
      const expectedLeg = route?.legs[0];
      const transition = selectAdjacentTransition(world.world.transitions, run.mapResourceId, run.position);
      if (expectedLeg === undefined || transition === null || transition.id !== expectedLeg.transition.id) {
        throw new Error(`导航到达了非预期关口：${guide.nextTransitionName ?? '(无)'} / ${transition?.id ?? '(无)'}`);
      }
      expect(distance(run.position, transition.from), `${transition.name} 停在关口四向相邻格`).toBe(1);
      const arrivalClock = new GameClock(world.calendar, run.clock.elapsedMinutes);
      arrivalClock.advance(world.calendar.actionCosts.travelMinutes);
      const arrivalPeriod = arrivalClock.currentPeriod().id;
      const arrivalNpcs = world.scheduleByPeriod.get(arrivalPeriod) ?? world.baseNpcs;
      const blockedAtLanding = arrivalNpcs.some((npc) =>
        npc.record.mapResourceId === transition.to.mapResourceId &&
        npc.col === transition.to.col && npc.row === transition.to.row,
      ) || world.encounters.some((encounter) =>
        encounter.record.mapResourceId === transition.to.mapResourceId &&
        encounter.col === transition.to.col && encounter.row === transition.to.row &&
        (encounter.record.repeatable || !run.completedEncounters.has(encounter.record.id)),
      );
      if (blockedAtLanding) {
        // A refused E interaction is free; V advances to the next NPC schedule before retrying.
        run.browserTrace.push({
          kind: 'gate', key: 'E', gateId: transition.id,
          fromMapResourceId: transition.from.mapResourceId,
          toMapResourceId: transition.to.mapResourceId,
          landing: { col: transition.to.col, row: transition.to.row },
        });
        const waitMinutes = world.calendar.actionCosts.waitMinutes;
        run.browserTrace.push({
          kind: 'wait', key: 'V', mapResourceId: run.mapResourceId,
          minutes: waitMinutes, reason: 'gate-landing-blocked',
        });
        expect(run.clock.advance(waitMinutes)).toBe(true);
        run.waitedMinutes += waitMinutes;
        run.periodIdsSeen.add(run.clock.currentPeriod().id);
        continue;
      }
      flushTraceWalk('gate');
      run.browserTrace.push({
        kind: 'gate', key: 'E', gateId: transition.id,
        fromMapResourceId: transition.from.mapResourceId,
        toMapResourceId: transition.to.mapResourceId,
        landing: { col: transition.to.col, row: transition.to.row },
      });
      expect(run.clock.advance(world.calendar.actionCosts.travelMinutes), `${transition.name} 花费 45 分钟`).toBe(true);
      run.regionSegments.push({
        from: run.mapResourceId,
        to: transition.to.mapResourceId,
        gateId: transition.id,
        steps: run.directionsSinceGate.length,
        gateApproach: { ...run.position },
        gateCell: { col: transition.from.col, row: transition.from.row },
        directions: run.directionsSinceGate.join(''),
      });
      run.directionsSinceGate = [];
      run.mapResourceId = transition.to.mapResourceId;
      run.position = { col: transition.to.col, row: transition.to.row };
      traceMapResourceId = run.mapResourceId;
      traceStart = { ...run.position };
      run.mapIdsVisited.add(run.mapResourceId);
      run.transitionIds.push(transition.id);
      run.periodIdsSeen.add(run.clock.currentPeriod().id);
      recordLocation(world, run);
      continue;
    }

    expect(guide.status, '当前格路线应继续行走').toBe('en-route');
    if (guide.status !== 'en-route') continue;
    expect(guide.path[0]).toEqual(run.position);
    const next = guide.path[1];
    if (next === undefined) throw new Error('en-route 路线缺少下一格');
    expect(distance(run.position, next), '按四方向逐格移动').toBe(1);
    expect(map.canEnter(next.col, next.row), '移动格通过碰撞图').toBe(true);
    expect(occupied.has(cellKey(next)), '导航绕开当前 NPC/遭遇占位').toBe(false);
    const weather = world.climate.weatherForDay(world.weatherSeed, run.clock.snapshot());
    const stepCost = world.calendar.actionCosts.stepMinutes + weather.stepMinutes;
    const direction = next.col > run.position.col ? 'R'
      : next.col < run.position.col ? 'L'
        : next.row > run.position.row ? 'D' : 'U';
    run.directionsSinceGate.push(direction);
    traceDirections += direction;
    run.position = { ...next };
    run.walkedSteps += 1;
    expect(run.clock.advance(stepCost), '成功步行推进真实时钟').toBe(true);
    recordLocation(world, run);
  }
  throw new Error(`长途路线超过 5,000 次导航刷新仍未抵达：${run.mapResourceId} → ${targetForPeriod(liveNpcs(world, run))?.name ?? '?'}`);
}

function saveReferences(world: JourneyWorld, run: JourneyRun) {
  const currentPeriod = run.clock.currentPeriod().id;
  const maps = new Map([...world.maps].map(([mapId, map]) => [mapId, {
    isWalkableCell: (col: number, row: number) => map.canEnter(col, row),
    isCellOccupied: (col: number, row: number) => {
      const occupiedNpcs = resolveNpcPlacementsForPlayer({
        baseNpcs: world.baseNpcs,
        periodNpcs: world.scheduleByPeriod.get(currentPeriod) ?? world.baseNpcs,
        mapResourceId: mapId,
        map,
        playerPosition: mapId === run.mapResourceId ? run.position : null,
        blockedCells: world.encounterCellsByMap.get(mapId),
      });
      return occupiedNpcs.some((npc) => npc.col === col && npc.row === row) ||
        world.encounters.some((encounter) => encounter.record.mapResourceId === mapId &&
          encounter.col === col && encounter.row === row &&
          (encounter.record.repeatable || !run.completedEncounters.has(encounter.record.id)));
    },
  }]));
  const mentorNpcIds = new Map([...world.factions].map(([id, faction]) => [id, new Set(faction.mentorNpcIds)]));
  return {
    profileIds: new Set([world.profile.id]),
    profileRecords: world.profileRecords,
    mapResourceId: run.mapResourceId,
    isWalkableCell: (col: number, row: number) => world.maps.get(run.mapResourceId)!.canEnter(col, row),
    isCellOccupied: maps.get(run.mapResourceId)!.isCellOccupied,
    maps,
    itemIds: world.itemIds,
    itemRecords: world.items,
    martialArtIds: world.martialArtIds,
    questIds: new Set(world.quests.keys()),
    questObjectiveIds: world.questObjectives,
    encounterIds: world.encounterIds,
    shopIds: new Set<string>(),
    questRecords: world.quests,
    npcIds: world.npcIds,
    regionalEventIds: world.regionalEventIds,
    knowledgeNodeIds: new Set(world.knowledgeNodes.keys()),
    defaultKnowledgeNodeIds: world.defaultKnowledgeNodeIds,
    factionIds: world.factionIds,
    factionMentorNpcIds: mentorNpcIds,
  };
}

function endingContext(run: JourneyRun): EndingEvaluationContext {
  return {
    questStatuses: new Map([...run.journal.states].map(([id, state]) => [id, state.status])),
    social: run.social,
    factionMembership: run.factionState.membership,
    knownKnowledgeNodeIds: run.knownKnowledgeNodeIds,
  };
}

describe('Round 68 四区长线旅程、跨时段存档与结局闭环', () => {
  it('从江南逐格走到盐道、接差事、跨区保存恢复、完成见闻并走回可选结局', () => {
    const world = loadJourneyWorld();
    const run = createJourney(world);
    const post = world.world.landmarks.find(({ id }) => id === SALT_POST_ID);
    if (post === undefined) throw new Error('全域舆图缺少无门槛青岩驿地标');
    const outbound = walkTo(world, run, () => ({
      mapResourceId: post.mapResourceId,
      col: post.col,
      row: post.row,
      name: post.name,
      approachRadius: 2,
    }), SALT_POST_ID, 'outbound');
    expect(outbound.endMapResourceId).toBe(SALT_ROAD_ID);
    expect(outbound.transitions).toEqual([
      'gate.trial-to-ferry',
      'gate.ferry-north-to-iron-ridge',
      'gate.iron-ridge-to-salt-road',
    ]);
    expect([...run.mapIdsVisited].sort()).toEqual([JIANGNAN_ID, FERRY_ID, IRON_RIDGE_ID, SALT_ROAD_ID].sort());
    expect(run.knownKnowledgeNodeIds.has(FOOTPRINTS_NODE_ID), '首次过渡口实际发现雨后脚印').toBe(true);
    expect(run.completedRegionalEvents.has('event.ferry-first-arrival')).toBe(true);

    const npcGuide = walkTo(world, run, (currentNpcs) => {
      const npc = currentNpcs.find(({ record }) => record.id === LUO_ID);
      if (npc === undefined) return null;
      return {
        mapResourceId: npc.record.mapResourceId,
        col: npc.col,
        row: npc.row,
        name: npc.record.name,
        approachRadius: 1,
        arrivalAction: 'talk',
      };
    }, undefined, 'find-luo-jinzi');
    expect(npcGuide.endMapResourceId).toBe(SALT_ROAD_ID);
    const speaker = selectInteractionTarget(liveNpcs(world, run), run.position);
    expect(speaker?.record.id, '抵达日程中的驿站 NPC 后才可交谈').toBe(LUO_ID);

    const questState = run.journal.states.get(SALT_QUEST_ID);
    expect(questState?.status).toBe('offered');
    world.dialogueContext.timeOfDayPeriodId = run.clock.currentPeriod().id;
    world.dialogueContext.speakerNpcId = LUO_ID;
    const conversation = requireParsed(parseDialogueSet(readJson('../data/base/dialogues/round-67-conversations.json')), '罗金子对白')
      .set.conversations.find(({ id }) => id === 'dlg.luo-jinzi-salt-road')!;
    const greet = conversation.nodes.find(({ id }) => id === conversation.startNodeId)!;
    const npcTalk = applyQuestSignal(world.quests, run.journal, { type: 'npc-talk', npcId: LUO_ID });
    settleQuestRewards(world, run, npcTalk);
    const visibleOffer = getVisibleOptions(greet, world.dialogueContext)
      .find(({ option }) => hasEffect(option, SALT_QUEST_ID));
    expect(visibleOffer?.option.nextNodeId).toBe('accepted');
    const accepted = applyDialogueEffects(visibleOffer!.option.effects!, world.dialogueContext);
    expect(accepted.ok, accepted.ok ? '' : accepted.reason).toBe(true);
    if (!accepted.ok) throw new Error(accepted.reason);
    settleQuestRewards(world, run, accepted.summary.questUpdate);
    expect(run.journal.states.get(SALT_QUEST_ID)?.status).toBe('active');
    run.browserTrace.push({
      kind: 'checkpoint', id: 'save-and-refresh-in-salt-road',
      mapResourceId: run.mapResourceId, position: { ...run.position },
      saveKeys: ['Escape', 'ArrowDown', 'Enter', 'Enter'],
      continueKeys: ['ArrowDown', 'Enter', 'Enter'],
    });


    const savedPosition = { ...run.position };
    const snapshot = captureSaveSnapshot({
      displayName: '长途行旅者',
      mapResourceId: run.mapResourceId,
      playerCol: run.position.col,
      playerRow: run.position.row,
      character: run.character,
      inventory: run.inventory,
      shopStocks: new Map(),
      journal: run.journal,
      social: run.social,
      completedEncounters: run.completedEncounters,
      completedRegionalEvents: run.completedRegionalEvents,
      knownKnowledgeNodeIds: run.knownKnowledgeNodeIds,
      elapsedGameMinutes: run.clock.elapsedMinutes,
      worldSeed: world.weatherSeed,
      factionMembership: run.factionState.membership,
      now: () => new Date('2026-09-29T00:00:00.000Z'),
    });
    const serialized = JSON.stringify(snapshot);
    const parsedSnapshot = requireParsed(parseSaveSnapshot(JSON.parse(serialized) as unknown), '盐道旅途中存档');
    const restorePlan = planSnapshotRestore(parsedSnapshot.snapshot, saveReferences(world, run));
    expect(restorePlan.ok, restorePlan.ok ? '' : restorePlan.errors.join('\n')).toBe(true);
    if (!restorePlan.ok) throw new Error(restorePlan.errors.join('\n'));
    expect(restorePlan.warnings).toEqual([]);
    const restored = restoreRunState({
      profile: world.profile,
      items: world.items,
      quests: world.quests,
      shops: new Map(),
      snapshot: restorePlan.snapshot,
    });
    expect(restorePlan.snapshot.mapResourceId).toBe(SALT_ROAD_ID);
    expect(restorePlan.snapshot.playerPosition).toEqual(savedPosition);
    expect(restorePlan.snapshot.elapsedGameMinutes).toBe(run.clock.elapsedMinutes);
    expect(restored.knownKnowledgeNodeIds).toContain(FOOTPRINTS_NODE_ID);
    expect(restored.completedRegionalEvents).toContain('event.ferry-first-arrival');
    expect(restored.journal.states.get(SALT_QUEST_ID)?.status).toBe('active');

    run.character = restored.character;
    run.inventory = restored.inventory;
    run.journal = restored.journal;
    run.social = restored.social;
    run.factionState = createFactionMembershipState(restored.factionMembership);
    run.knownKnowledgeNodeIds = new Set(restored.knownKnowledgeNodeIds);
    run.completedEncounters = new Set(restored.completedEncounters);
    run.completedRegionalEvents = new Set(restored.completedRegionalEvents);
    run.clock = new GameClock(world.calendar, restorePlan.snapshot.elapsedGameMinutes);
    run.mapResourceId = restorePlan.snapshot.mapResourceId;
    run.position = { ...restorePlan.snapshot.playerPosition };
    world.dialogueContext.character = run.character;
    world.dialogueContext.inventory = run.inventory;
    world.dialogueContext.journal = run.journal;
    world.dialogueContext.social = run.social;
    world.dialogueContext.factionState = run.factionState;
    world.dialogueContext.knownKnowledgeNodeIds = run.knownKnowledgeNodeIds;

    let lastWellTarget: NavigationDestinationCell | null = null;
    const wellTarget = (): NavigationDestinationCell | null => {
      const npcs = liveNpcs(world, run);
      const result = resolveQuestNavigationTarget({
        quests: world.quests,
        journal: run.journal,
        questId: SALT_QUEST_ID,
        worldMap: world.world,
        baseNpcs: world.baseNpcs,
        periodNpcs: world.scheduleByPeriod.get(run.clock.currentPeriod().id) ?? world.baseNpcs,
        currentMapNpcs: npcs,
        encounters: world.encounters,
        knowledgeNodeTitles: world.knowledgeTitles,
      });
      if (result.status === 'target') {
        lastWellTarget = result.target;
        return lastWellTarget;
      }
      // The real event completes the active objective as the player steps
      // onto its tile; retain that final target for the next arrival check.
      return run.journal.states.get(SALT_QUEST_ID)?.status === 'completed' ? lastWellTarget : null;
    };
    const wellTrip = walkTo(world, run, wellTarget, undefined, 'complete-salt-quest');
    expect(wellTrip.endMapResourceId).toBe(SALT_ROAD_ID);
    expect(run.position).toEqual({ col: 26, row: 28 });
    expect(run.knownKnowledgeNodeIds.has(WELL_NODE_ID)).toBe(true);
    expect(run.completedRegionalEvents.has('event.r67-well-reading')).toBe(true);
    expect(run.journal.states.get(SALT_QUEST_ID)?.status).toBe('completed');
    expect(run.inventory.currency).toBeGreaterThan(120);
    run.browserTrace.push({
      kind: 'checkpoint', id: 'salt-quest-completed',
      mapResourceId: run.mapResourceId, position: { ...run.position },
    });

    const endingGate = world.endingSet.gate;
    const returnTrip = walkTo(world, run, () => ({
      mapResourceId: endingGate.mapResourceId,
      col: endingGate.position.col,
      row: endingGate.position.row,
      name: endingGate.name,
      approachRadius: 1,
    }), undefined, 'return-to-ending');
    expect(returnTrip.endMapResourceId).toBe(FERRY_ID);
    expect(returnTrip.transitions).toEqual([
      'gate.salt-road-to-iron-ridge',
      'gate.iron-ridge-to-ferry-north',
    ]);
    expect(selectAdjacentEndingGate(world.endingSet, run.mapResourceId, run.position)?.gate.id)
      .toBe(endingGate.id);
    run.browserTrace.push({
      kind: 'checkpoint', id: 'ending-gate',
      mapResourceId: run.mapResourceId, position: { ...run.position },
      endingKey: 'E', endingId: 'ending.open-water',
    });

    const context = endingContext(run);
    const endings = evaluateEndings(world.endingSet, context);
    expect(endings.find(({ ending }) => ending.id === 'ending.open-water')?.available).toBe(true);
    const selected = selectEnding(world.endingSet, 'ending.open-water', context);
    expect(selected.ok, selected.ok ? '' : selected.reason).toBe(true);
    if (!selected.ok) throw new Error(selected.reason);
    expect(selected.ending.title).toBe('行舟万里');

    const firstDay = new GameClock(world.calendar).snapshot().day;
    expect(run.periodIdsSeen.size).toBeGreaterThanOrEqual(5);
    expect(run.clock.snapshot().day).not.toBe(firstDay);
    expect(run.walkedSteps).toBeGreaterThan(300);
    expect(run.mapIdsVisited).toHaveProperty('size', 4);
    expect(run.transitionIds).toHaveLength(5);
    expect(run.transitionIds).toEqual([
      'gate.trial-to-ferry',
      'gate.ferry-north-to-iron-ridge',
      'gate.iron-ridge-to-salt-road',
      'gate.salt-road-to-iron-ridge',
      'gate.iron-ridge-to-ferry-north',
    ]);
    expect(run.eventDiscoveryIds).toContain(FOOTPRINTS_NODE_ID);
    expect(run.eventDiscoveryIds).toContain(WELL_NODE_ID);
    if (process.env.ROUND68_REPORT === '1') {
      process.stdout.write(`${JSON.stringify({
        regions: [...run.mapIdsVisited],
        transitions: run.transitionIds,
        regionSegments: run.regionSegments,
        steps: run.walkedSteps,
        elapsedGameMinutes: run.clock.elapsedMinutes,
        date: run.clock.snapshot(),
        periodsSeen: [...run.periodIdsSeen],
        waitedMinutes: run.waitedMinutes,
        discoveries: run.eventDiscoveryIds,
        quest: run.journal.states.get(SALT_QUEST_ID)?.status,
        ending: selected.ending.id,
      }, null, 2)}\n`);
    }
    if (process.env.ROUND71_TRACE_FILE !== undefined && process.env.ROUND71_TRACE_FILE.length > 0) {
      const trace = {
        schemaVersion: 1,
        sourceTest: 'tests/round68-long-journey.test.ts',
        start: {
          mapResourceId: JIANGNAN_ID,
          position: world.maps.get(JIANGNAN_ID)!.data.playerStart,
          firstDay: new GameClock(world.calendar).snapshot(),
        },
        actions: run.browserTrace,
        expected: {
          regions: [...run.mapIdsVisited],
          transitionIds: run.transitionIds,
          steps: run.walkedSteps,
          elapsedGameMinutes: run.clock.elapsedMinutes,
          periodsSeen: [...run.periodIdsSeen],
          completedQuestId: SALT_QUEST_ID,
          endingId: selected.ending.id,
        },
      };
      writeFileSync(process.env.ROUND71_TRACE_FILE, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
    }
  }, 30_000);
});
