import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileNpcSchedules } from '../src/engine/npc-schedule';
import { parseGameCalendar, type CalendarPeriodData } from '../src/engine/game-calendar';
import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import { assembleShops, indexItems, parseItemSet, parseShopSet } from '../src/engine/item-system';
import { parseNpcSet, type PlacedNpc } from '../src/engine/npc-placement';
import { resolveQuestNavigationTarget } from '../src/engine/quest-navigation';
import { parseQuestSet, type QuestData, type QuestJournal } from '../src/engine/quest-system';
import { assembleWorldMap, parseWorldMap, type WorldMapAssembly } from '../src/engine/world-map';
import { deriveNpcRegionNames } from '../src/engine/world-navigation';

const MAP_PATHS = [
  '../data/base/maps/round-01-grid.json',
  '../data/base/maps/round-10-mist-ferry.json',
  '../data/base/maps/round-62-iron-ridge.json',
  '../data/base/maps/round-67-salt-road.json',
] as const;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

interface RealDataFixture {
  maps: ReadonlyMap<string, GridMap>;
  world: WorldMapAssembly;
  baseNpcs: PlacedNpc[];
  shops: ReturnType<typeof assembleShops>['shops'];
  quests: Map<string, QuestData>;
  questsById: Map<string, QuestData>;
  periods: string[];
  calendarPeriods: readonly CalendarPeriodData[];
}

function loadRealData(): RealDataFixture {
  const maps = new Map(MAP_PATHS.map((path) => {
    const map = loadMap(path);
    return [map.data.id, map];
  }));
  const worldParsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
  if (!worldParsed.ok) throw new Error(worldParsed.errors.join('\n'));
  const world = assembleWorldMap(worldParsed.data, maps);
  if ('ok' in world) throw new Error(world.errors.join('\n'));

  const npcParsed = parseNpcSet(readJson('../data/base/characters/round-03-npcs.json'));
  if (!npcParsed.ok) throw new Error(npcParsed.errors.join('\n'));
  const baseNpcs: PlacedNpc[] = npcParsed.set.npcs.map((record) => ({
    record,
    col: record.position.col,
    row: record.position.row,
  }));

  const itemParsed = parseItemSet(readJson('../data/base/items/round-06-items.json'));
  if (!itemParsed.ok) throw new Error(itemParsed.errors.join('\n'));
  const items = indexItems(itemParsed.set);
  const shopParsed = parseShopSet(readJson('../data/base/shops/round-06-shops.json'));
  if (!shopParsed.ok) throw new Error(shopParsed.errors.join('\n'));
  // The fixture intentionally loads R03 NPCs only; complete-world R112 coverage
  // still requires every shop to assemble with no warning.
  const placedNpcIds = new Set(baseNpcs.map((npc) => npc.record.id));
  const shopAssembly = assembleShops({
    shopSet: { ...shopParsed.set, shops: shopParsed.set.shops.filter(shop => placedNpcIds.has(shop.npcId)) },
    placedNpcIds,
    items: items.byId,
  });
  expect(shopAssembly.warnings).toEqual([]);

  const questParsed = parseQuestSet(readJson('../data/base/quests/round-07-quests.json'));
  if (!questParsed.ok) throw new Error(questParsed.errors.join('\n'));
  const calendarParsed = parseGameCalendar(readJson('../data/base/worldview/calendar.json'));
  if (!calendarParsed.ok) throw new Error(calendarParsed.errors.join('\n'));

  return {
    maps,
    world,
    baseNpcs,
    shops: shopAssembly.shops,
    quests: new Map(),
    questsById: new Map(questParsed.set.quests.map((quest) => [quest.id, quest])),
    periods: calendarParsed.calendar.periods.map((period) => period.id),
    calendarPeriods: calendarParsed.calendar.periods,
  };
}

function activeJournal(
  quests: RealDataFixture['questsById'],
  questId: string,
  counts: Record<string, number> = {},
): QuestJournal {
  return {
    trackedQuestId: questId,
    states: new Map([...quests.values()].map((quest) => [quest.id, {
      questId: quest.id,
      status: quest.id === questId ? 'active' as const : 'locked' as const,
      objectiveCounts: new Map(quest.objectives.map((objective) => [
        objective.id,
        counts[objective.id] ?? 0,
      ])),
    }])),
  };
}

describe('Round 64 collect objectives against assembled real data', () => {
  const fixture = loadRealData();

  it('navigates an unlimited-stock collect objective to the assembled seller', () => {
    const resolution = resolveQuestNavigationTarget({
      quests: fixture.questsById as RealDataFixture['quests'],
      journal: activeJournal(fixture.questsById, 'quest.round-07-medicine-run'),
      questId: 'quest.round-07-medicine-run',
      worldMap: fixture.world,
      baseNpcs: fixture.baseNpcs,
      periodNpcs: fixture.baseNpcs,
      encounters: [],
      shops: fixture.shops,
    });
    expect(resolution.status).toBe('target');
    if (resolution.status !== 'target') throw new Error('expected a target');
    expect(resolution.target).toMatchObject({
      kind: 'collectItem',
      mapResourceId: 'map.round-01-grid',
      name: '姜百味百宝担',
      col: 45,
      row: 39,
      approachRadius: 1,
      arrivalAction: 'shop',
    });
    expect(resolution.target.objectiveText).toContain('姜百味处采买');
  });

  it('directs tea-stall stock to its real seller without a nonexistent harvest promise', () => {
    const quest = fixture.questsById.get('quest.r31-teastall-herbal-water');
    expect(quest).toBeDefined();
    const objective = quest!.objectives[0];
    expect(objective?.text).not.toContain('可采集');
    expect(objective?.text).toContain('姜百味处按E采买');

    const resolution = resolveQuestNavigationTarget({
      quests: fixture.questsById as RealDataFixture['quests'],
      journal: activeJournal(fixture.questsById, 'quest.r31-teastall-herbal-water'),
      questId: 'quest.r31-teastall-herbal-water',
      worldMap: fixture.world,
      baseNpcs: fixture.baseNpcs,
      periodNpcs: fixture.baseNpcs,
      encounters: [],
      shops: fixture.shops,
    });
    expect(resolution.status).toBe('target');
    if (resolution.status !== 'target') throw new Error('expected the herb seller target');
    expect(resolution.target).toMatchObject({
      kind: 'collectItem',
      name: '姜百味百宝担',
      objectiveText: '备齐寒珠草×4（江南姜百味处按E采买）',
      col: 45,
      row: 39,
      arrivalAction: 'shop',
    });
  });

  it('reports the unstocked seal-rubbing item precisely instead of a coordinate', () => {
    const resolution = resolveQuestNavigationTarget({
      quests: fixture.questsById as RealDataFixture['quests'],
      journal: activeJournal(fixture.questsById, 'quest.r42-seal-rubbing'),
      questId: 'quest.r42-seal-rubbing',
      worldMap: fixture.world,
      baseNpcs: fixture.baseNpcs,
      periodNpcs: fixture.baseNpcs,
      encounters: [],
      shops: fixture.shops,
    });
    expect(resolution).toEqual({ status: 'no-target', reason: 'collect-item-not-stocked' });
  });

  it('honours live runtime stock over the assembled shelf for finite items', () => {
    const common = {
      quests: fixture.questsById as RealDataFixture['quests'],
      journal: activeJournal(fixture.questsById, 'quest.r31-academy-nightclass'),
      questId: 'quest.r31-academy-nightclass',
      worldMap: fixture.world,
      baseNpcs: fixture.baseNpcs,
      periodNpcs: fixture.baseNpcs,
      encounters: [],
      shops: fixture.shops,
    };
    // The shelf declares five pills; the objective needs two.
    expect(resolveQuestNavigationTarget(common).status).toBe('target');

    // The run bought the shelf down to one: navigation must not promise it.
    const shopId = [...fixture.shops.keys()][0];
    if (shopId === undefined) throw new Error('expected at least one assembled shop');
    const depleted = new Map([[shopId, new Map([['item.qingxin-wan', 1]])]]);
    expect(resolveQuestNavigationTarget({ ...common, shopStocks: depleted }))
      .toEqual({ status: 'no-target', reason: 'collect-stock-insufficient' });
  });

  it('follows the seller across every calendar period placement', () => {
    const schedule = compileNpcSchedules({
      npcs: fixture.baseNpcs,
      periods: fixture.calendarPeriods,
      maps: new Map(fixture.maps),
    });
    expect(schedule.warnings).toEqual([]);

    const expectedCells: Record<string, { col: number; row: number }> = {
      'period.afternoon': { col: 43, row: 39 },
      'period.night': { col: 44, row: 39 },
    };
    for (const period of fixture.periods) {
      const periodNpcs = schedule.placementsByPeriod.get(period) ?? fixture.baseNpcs;
      const resolution = resolveQuestNavigationTarget({
        quests: fixture.questsById as RealDataFixture['quests'],
        journal: activeJournal(fixture.questsById, 'quest.round-07-medicine-run'),
        questId: 'quest.round-07-medicine-run',
        worldMap: fixture.world,
        baseNpcs: fixture.baseNpcs,
        periodNpcs,
        encounters: [],
        shops: fixture.shops,
      });
      expect(resolution.status, period).toBe('target');
      if (resolution.status !== 'target') continue;
      expect(resolution.target.mapResourceId, period).toBe('map.round-01-grid');
      expect(
        { col: resolution.target.col, row: resolution.target.row },
        period,
      ).toEqual(expectedCells[period] ?? { col: 45, row: 39 });
    }
  });
});

describe('Round 64 faction dossier region names from assembled data', () => {
  const fixture = loadRealData();

  it('derives each mentor NPC region name from the world atlas', () => {
    const regionNames = deriveNpcRegionNames(fixture.baseNpcs, fixture.world.regions);
    const factionsParsed = readJson('../data/base/factions/round-04-factions.json') as {
      factions: { id: string; mentorNpcIds: string[] }[];
    };
    const regionByMap = new Map(fixture.world.regions.map((region) => [region.mapResourceId, region.name]));
    for (const faction of factionsParsed.factions) {
      for (const mentorId of faction.mentorNpcIds) {
        const mentor = fixture.baseNpcs.find((npc) => npc.record.id === mentorId);
        expect(mentor, `${faction.id} mentor ${mentorId} must be assembled`).toBeDefined();
        if (mentor === undefined) continue;
        expect(regionNames.get(mentorId)).toBe(regionByMap.get(mentor.record.mapResourceId));
      }
    }
  });

  it('omits NPCs whose map has no registered region instead of guessing', () => {
    const regionNames = deriveNpcRegionNames(
      [{ ...fixture.baseNpcs[0]!, record: { ...fixture.baseNpcs[0]!.record, mapResourceId: 'map.unregistered' } }],
      fixture.world.regions,
    );
    expect(regionNames.size).toBe(0);
  });
});
