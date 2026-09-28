import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ClimateRuntime, parseClimate } from '../src/engine/climate-system';
import { GameClock, parseGameCalendar } from '../src/engine/game-calendar';
import { parseGridMap, type CellPosition, type GridMap } from '../src/engine/grid-map';
import {
  compileNpcSchedules,
  resolveNpcPlacementsForPlayer,
} from '../src/engine/npc-schedule';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import {
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';
import { parseBattleEncounterSet, type PlacedEncounter } from '../src/engine/turn-based-combat';
import {
  arrivalActionHint,
  resolveCellNavigationGuide,
  type NavigationArrivalAction,
} from '../src/engine/world-navigation-guidance';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';
import type { WorldMapAssembly } from '../src/engine/world-map';

const JIANGNAN_ID = 'map.round-01-grid';
const FERRY_ID = 'map.round-10-mist-ferry';
const IRON_RIDGE_ID = 'map.round-62-iron-ridge';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function mustParse<T extends { ok: boolean }>(result: T, errors: string[]): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(errors.join('\n'));
  return result as Extract<T, { ok: true }>;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

interface WalkScenario {
  id: string;
  questId: string;
  mapResourceId: string;
  start: CellPosition;
  /** In-game minute-of-day; chosen to exercise a real NPC period boundary. */
  startMinute: number;
  expectedPeriods: string[];
  movingNpcId?: string;
  expectedTargetCells?: CellPosition[];
}

interface WalkReport {
  id: string;
  questId: string;
  weatherId: string;
  weatherStepMinutes: number;
  moves: number;
  elapsedMinutes: number;
  periodsSeen: string[];
  destinationCells: CellPosition[];
  stop: CellPosition;
  target: CellPosition;
  approachRadius: number;
  arrivalAction: NavigationArrivalAction | undefined;
  arrivalHint: string | undefined;
}

function sameCell(a: CellPosition, b: CellPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

function distance(a: CellPosition, b: CellPosition): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function cellKey({ col, row }: CellPosition): string {
  return `${col},${row}`;
}

function reportIfRequested(reports: readonly WalkReport[]): void {
  if (process.env.ROUND63_REPORT === '1') {
    process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
  }
}

describe('Round 63 live-clock navigation', () => {
  const maps = new Map<string, GridMap>([
    [JIANGNAN_ID, loadMap('../data/base/maps/round-01-grid.json')],
    [FERRY_ID, loadMap('../data/base/maps/round-10-mist-ferry.json')],
    [IRON_RIDGE_ID, loadMap('../data/base/maps/round-62-iron-ridge.json')],
  ]);
  const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
  const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
  const encounterParsed = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
  const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
  const calendar = mustParse(calendarParsed, calendarParsed.ok ? [] : calendarParsed.errors).calendar;
  const climateParsed = parseClimate(readJson('../data/base/worldview/climate.json'), calendar);
  const climateData = mustParse(climateParsed, climateParsed.ok ? [] : climateParsed.errors).climate;
  const worldData = mustParse(worldParsed, worldParsed.ok ? [] : worldParsed.errors).data;
  const questsData = mustParse(questParsed, questParsed.ok ? [] : questParsed.errors).set;
  const npcData = mustParse(npcParsed, npcParsed.ok ? [] : npcParsed.errors).set;
  const encounterData = mustParse(encounterParsed, encounterParsed.ok ? [] : encounterParsed.errors).set;

  const mapsById = new Map(maps);
  const knowledgeNodes = readJson('../data/base/knowledge_graph/nodes.json') as { nodes: Array<{ id: string }> };
  const worldResult = assembleWorldMap(worldData, maps, {
    knowledgeNodeIds: new Set(knowledgeNodes.nodes.map(({ id }) => id)),
    periodIds: new Set(calendar.periods.map(({ id }) => id)),
    weatherIds: new Set(climateData.weathers.map(({ id }) => id)),
    npcIds: new Set(npcData.npcs.map(({ id }) => id)),
  });
  if ('ok' in worldResult) throw new Error(worldResult.errors.join('\n'));
  const world: WorldMapAssembly = worldResult;
  const quests = new Map(questsData.quests.map((quest) => [quest.id, quest]));
  const baseNpcs: PlacedNpc[] = npcData.npcs.map((record) => ({
    record,
    col: record.position.col,
    row: record.position.row,
  }));
  const encounters: PlacedEncounter[] = encounterData.encounters.map((record) => ({
    record,
    col: record.position.col,
    row: record.position.row,
    profile: {} as PlacedEncounter['profile'],
    enemyArts: [],
  }));
  const blockedEncountersByMap = new Map<string, ReadonlySet<string>>();
  for (const mapId of maps.keys()) {
    blockedEncountersByMap.set(mapId, new Set(encounters
      .filter(({ record }) => record.mapResourceId === mapId)
      .map(({ col, row }) => `${col},${row}`)));
  }
  const schedule = compileNpcSchedules({
    npcs: baseNpcs,
    periods: calendar.periods,
    maps: mapsById,
    blockedCellsByMap: blockedEncountersByMap,
  });
  if (schedule.warnings.length > 0) throw new Error(schedule.warnings.join('\n'));
  const climate = new ClimateRuntime(climateData, calendar);
  const startingStamp = new GameClock(calendar).snapshot();
  const openingSeason = climate.seasonForStamp(startingStamp);
  const openingWeatherIds = new Set(openingSeason.weatherWeights
    .filter(({ weight }) => weight > 0)
    .map(({ weatherId }) => weatherId));
  const openingWeatherCosts = climateData.weathers
    .filter(({ id }) => openingWeatherIds.has(id))
    .map(({ stepMinutes }) => stepMinutes);
  if (openingWeatherCosts.length === 0) throw new Error('Opening season has no weather entries');
  const maxOpeningWeatherStepMinutes = Math.max(...openingWeatherCosts);
  const highCostSeed = Array.from({ length: 65_536 }, (_, seed) => seed)
    .find((seed) => climate.weatherForDay(seed, startingStamp).stepMinutes === maxOpeningWeatherStepMinutes);
  if (highCostSeed === undefined) throw new Error('Could not find a deterministic seed for the maximum opening-season weather cost');
  const weather = climate.weatherForDay(highCostSeed, startingStamp);
  const activeQuestJournal = (questId: string) => {
    const journal = createQuestJournal(quests);
    const state = journal.states.get(questId);
    if (state === undefined) throw new Error(`Missing quest state ${questId}`);
    state.status = 'active';
    journal.trackedQuestId = questId;
    return journal;
  };

  function simulateWalk(scenario: WalkScenario): WalkReport {
    const map = maps.get(scenario.mapResourceId);
    const quest = quests.get(scenario.questId);
    if (map === undefined || quest === undefined) throw new Error(`Invalid scenario ${scenario.id}`);
    const state = activeQuestJournal(scenario.questId);
    const startElapsed = (scenario.startMinute - calendar.start.minuteOfDay + 1440) % 1440;
    const clock = new GameClock(calendar, startElapsed);
    let player = { ...scenario.start };
    let moves = 0;
    const periodsSeen = new Set<string>();
    const destinationCells = new Map<string, CellPosition>();
    let finalTarget: CellPosition | null = null;
    let finalStop: CellPosition | null = null;
    let finalApproachRadius = 0;
    let arrivalAction: NavigationArrivalAction | undefined;

    for (let tick = 0; tick < 800; tick += 1) {
      const period = clock.currentPeriod();
      periodsSeen.add(period.id);
      const periodNpcs = schedule.placementsByPeriod.get(period.id) ?? baseNpcs;
      const liveNpcs = resolveNpcPlacementsForPlayer({
        baseNpcs,
        periodNpcs,
        mapResourceId: scenario.mapResourceId,
        map,
        playerPosition: player,
        blockedCells: blockedEncountersByMap.get(scenario.mapResourceId),
      });
      expect(liveNpcs.some((npc) => npc.col === player.col && npc.row === player.row),
        `${scenario.id}: scheduled placement may not cover the live player cell`).toBe(false);

      const resolution = resolveQuestNavigationTarget({
        quests,
        journal: state,
        questId: scenario.questId,
        worldMap: world,
        baseNpcs,
        periodNpcs,
        currentMapNpcs: liveNpcs,
        encounters,
        knowledgeNodeTitles: new Map(knowledgeNodes.nodes.map((node) => [node.id, node.id])),
      });
      expect(resolution.status, `${scenario.id}: the spatial quest target must remain resolvable`).toBe('target');
      if (resolution.status !== 'target') throw new Error(`${scenario.id}: target disappeared`);
      const target = resolution.target;
      expect(target.mapResourceId, `${scenario.id}: target stays in the simulated region`).toBe(scenario.mapResourceId);
      if (scenario.movingNpcId !== undefined) {
        const objective = quest.objectives.find(({ id }) => id === target.objectiveId);
        expect(objective?.kind, `${scenario.id}: moving target is the authored talk objective`).toBe('talkToNpc');
        if (objective?.kind === 'talkToNpc') {
          expect(objective.targetId, `${scenario.id}: quest target matches the watched NPC`).toBe(scenario.movingNpcId);
        }
      }
      finalTarget = { col: target.col, row: target.row };
      const destinationCell = { col: target.col, row: target.row };
      destinationCells.set(cellKey(destinationCell), destinationCell);

      const blocked = new Set<string>([
        ...liveNpcs.map(({ col, row }) => `${col},${row}`),
        ...(blockedEncountersByMap.get(scenario.mapResourceId) ?? []),
      ]);
      const guide = resolveCellNavigationGuide(
        world,
        scenario.mapResourceId,
        target,
        map,
        player,
        blocked,
      );
      expect(['en-route', 'arrived'], `${scenario.id}: no route blocker or broken route in ${period.id}`)
        .toContain(guide.status);
      if (guide.status === 'route-blocked' || guide.status === 'route-broken' || guide.status === 'target-lost') {
        throw new Error(`${scenario.id}: guide became ${guide.status}`);
      }
      if (guide.status === 'arrived') {
        expect(guide.arrivalAction).toBe(target.arrivalAction);
        expect(guide.arrivalAction, `${scenario.id}: arrival guide includes a HUD action hint`).toBeDefined();
        finalStop = { ...player };
        finalApproachRadius = target.approachRadius;
        arrivalAction = guide.arrivalAction;
        if (guide.arrivalAction !== undefined) {
          const hint = arrivalActionHint(guide.arrivalAction);
          expect(hint.length, `${scenario.id}: HUD arrival hint is readable`).toBeGreaterThan(0);
          if (guide.arrivalAction === 'talk') expect(hint).toContain('按 F');
          if (guide.arrivalAction === 'discover') {
            expect(hint).toContain('满足事件条件');
            expect(hint).toContain('按 V');
          }
        }
        break;
      }

      expect(guide.path[0], `${scenario.id}: each live route starts at the player`).toEqual(player);
      const next = guide.path[1];
      expect(next, `${scenario.id}: en-route always has a next cell`).toBeDefined();
      if (next === undefined) throw new Error(`${scenario.id}: en-route without a next cell`);
      expect(distance(player, next), `${scenario.id}: movement uses a cardinal single-cell step`).toBe(1);
      expect(map.canEnter(next.col, next.row), `${scenario.id}: movement target is walkable`).toBe(true);
      expect(blocked.has(cellKey(next)), `${scenario.id}: route never enters a live NPC/encounter cell`).toBe(false);

      player = { ...next };
      moves += 1;
      const stepWeather = climate.weatherForDay(highCostSeed!, clock.snapshot());
      const stepMinutes = calendar.actionCosts.stepMinutes + stepWeather.stepMinutes;
      expect(stepMinutes, `${scenario.id}: weather and base step cost advance time`).toBeGreaterThan(0);
      expect(clock.advance(stepMinutes), `${scenario.id}: each completed move advances the clock`).toBe(true);
    }

    if (finalStop === null || finalTarget === null) {
      throw new Error(`${scenario.id}: route failed to arrive after ${moves} moves`);
    }
    for (const periodId of scenario.expectedPeriods) {
      expect(periodsSeen.has(periodId), `${scenario.id}: crossed ${periodId}`).toBe(true);
    }
    if (scenario.expectedTargetCells !== undefined) {
      for (const expected of scenario.expectedTargetCells) {
        expect([...destinationCells.values()].some((candidate) => sameCell(candidate, expected)),
          `${scenario.id}: live target occupied ${cellKey(expected)}`).toBe(true);
      }
    }
    const stopDistance = distance(finalStop, finalTarget);
    expect(stopDistance, `${scenario.id}: stop cell respects the target's approach radius`)
      .toBeLessThanOrEqual(finalApproachRadius);
    expect(moves).toBeGreaterThan(40);
    return {
      id: scenario.id,
      questId: scenario.questId,
      weatherId: weather.id,
      weatherStepMinutes: weather.stepMinutes,
      moves,
      elapsedMinutes: clock.elapsedMinutes - startElapsed,
      periodsSeen: [...periodsSeen],
      destinationCells: [...destinationCells.values()],
      stop: finalStop,
      target: finalTarget,
      approachRadius: finalApproachRadius,
      arrivalAction,
      arrivalHint: arrivalAction === undefined ? undefined : arrivalActionHint(arrivalAction),
    };
  }

  it('walks the Jiangnan long route through the morning-to-midday NPC shift', () => {
    const report = simulateWalk({
      id: '江南道 → 南麓聚落',
      questId: 'quest.r58-south-hamlet-survey',
      mapResourceId: JIANGNAN_ID,
      start: maps.get(JIANGNAN_ID)!.playerStart,
      startMinute: 570,
      expectedPeriods: ['period.morning', 'period.midday'],
    });
    expect(report.weatherStepMinutes).toBe(maxOpeningWeatherStepMinutes);
    expect(report.arrivalAction).toBe('discover');
    reportIfRequested([report]);
  });

  it('walks the ferry cross-map-length route through afternoon, dusk and night', () => {
    const arrival = world.transitions.find(({ id }) => id === 'gate.trial-to-ferry')!.to;
    const report = simulateWalk({
      id: '雾雨渡口入区口 → 芦桥集',
      questId: 'quest.r58-market-discovery',
      mapResourceId: FERRY_ID,
      start: { col: arrival.col, row: arrival.row },
      startMinute: 840,
      expectedPeriods: ['period.afternoon', 'period.dusk', 'period.night'],
    });
    expect(report.weatherStepMinutes).toBe(maxOpeningWeatherStepMinutes);
    expect(report.arrivalAction).toBe('discover');
    reportIfRequested([report]);
  });

  it('follows a moving Iron Ridge quest NPC to its night-shift cell', () => {
    const arrival = world.transitions.find(({ id }) => id === 'gate.ferry-north-to-iron-ridge')!.to;
    const report = simulateWalk({
      id: '铁嶂北道北口 → 秦素砚夜岗',
      questId: 'quest.r62-post-ledger',
      mapResourceId: IRON_RIDGE_ID,
      start: { col: arrival.col, row: arrival.row },
      startMinute: 1080,
      expectedPeriods: ['period.dusk', 'period.night'],
      movingNpcId: 'char.qin-suyan',
      expectedTargetCells: [
        { col: 57, row: 49 },
        { col: 56, row: 50 },
      ],
    });
    expect(report.weatherStepMinutes).toBe(maxOpeningWeatherStepMinutes);
    expect(report.arrivalAction).toBe('talk');
    expect(distance(report.stop, report.target)).toBe(1);
    reportIfRequested([report]);
  });
});
