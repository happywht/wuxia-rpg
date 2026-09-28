import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap, type GridMap } from '../src/engine/grid-map';
import type { CharacterProfileData } from '../src/engine/character-progression';
import type { PlacedNpc } from '../src/engine/npc-placement';
import {
  QUEST_NAVIGATION_ID_PREFIX,
  resolveQuestNavigationTarget,
  type QuestNavigationInput,
} from '../src/engine/quest-navigation';
import type {
  QuestData,
  QuestJournal,
  QuestObjectiveKind,
  QuestStatus,
} from '../src/engine/quest-system';
import type { BattleEncounterData, PlacedEncounter } from '../src/engine/turn-based-combat';
import { assembleWorldMap, parseWorldMap, type WorldMapAssembly } from '../src/engine/world-map';
import { buildQuestObjectiveWaypoint, buildWorldMapWaypoints } from '../src/engine/world-navigation';
import { resolveCellNavigationGuide } from '../src/engine/world-navigation-guidance';

const STARTING_MAP = 'map.round-01-grid';
const FERRY_MAP = 'map.round-10-mist-ferry';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadMap(path: string): GridMap {
  const parsed = parseGridMap(readJson(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

function makeWorldMap(): WorldMapAssembly {
  const parsed = parseWorldMap(readJson('../data/base/world/world-map.json'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const maps = new Map([
    [STARTING_MAP, loadMap('../data/base/maps/round-01-grid.json')],
    [FERRY_MAP, loadMap('../data/base/maps/round-10-mist-ferry.json')],
  ]);
  const assembled = assembleWorldMap(parsed.data, maps);
  if ('ok' in assembled) throw new Error(assembled.errors.join('\n'));
  return assembled;
}

interface ObjectiveSpec {
  id: string;
  kind: QuestObjectiveKind;
  targetId: string;
  requiredCount?: number;
}

function makeQuest(objectives: ObjectiveSpec[], id = 'quest.r60-test'): QuestData {
  return {
    id,
    name: `测试差事·${id}`,
    description: '测试夹具差事',
    giverNpcId: 'char.test-giver',
    prerequisiteQuestIds: [],
    objectives: objectives.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      targetId: spec.targetId,
      requiredCount: spec.requiredCount ?? 1,
      text: `目标 ${spec.id}`,
    })),
    failOnEncounterIds: [],
    rewards: { experience: 1, currency: 1 },
  };
}

function makeJournal(
  quests: readonly QuestData[],
  statuses: Record<string, QuestStatus> = {},
  counts: Record<string, Record<string, number>> = {},
): QuestJournal {
  return {
    states: new Map(quests.map((quest) => [quest.id, {
      questId: quest.id,
      status: statuses[quest.id] ?? 'active',
      objectiveCounts: new Map(quest.objectives.map((objective) => [
        objective.id,
        counts[quest.id]?.[objective.id] ?? 0,
      ])),
    }])),
    trackedQuestId: null,
  };
}

function makeNpc(
  id: string,
  name: string,
  mapResourceId: string,
  col: number,
  row: number,
): PlacedNpc {
  return {
    record: {
      id,
      name,
      mapResourceId,
      position: { col, row },
      dialogueId: 'dialogue.test',
      shopId: null,
      questGiver: false,
      schedule: [],
    },
    col,
    row,
  };
}

function makeEncounter(
  id: string,
  name: string,
  mapResourceId: string,
  col: number,
  row: number,
): PlacedEncounter {
  return {
    record: {
      id,
      name,
      mapResourceId,
      position: { col, row },
      profileId: 'profile.test',
      enemy: {} as BattleEncounterData['enemy'],
      victoryExperience: 0,
      defeatRecovery: { healthRatio: 1, qiRatio: 1 },
      repeatable: true,
      texts: { approach: '', intro: '', victory: '', defeat: '', flee: '' },
    },
    col,
    row,
    profile: {} as CharacterProfileData,
    enemyArts: [],
  };
}

function makeInput(overrides: Partial<QuestNavigationInput> = {}): QuestNavigationInput {
  return {
    quests: new Map(),
    journal: { states: new Map(), trackedQuestId: null },
    questId: 'quest.r60-test',
    worldMap: makeWorldMap(),
    baseNpcs: [],
    periodNpcs: [],
    encounters: [],
    knowledgeNodeTitles: new Map([
      ['place.mist-willow-market', '芦桥集'],
      ['place.south-hamlet', '南麓聚落'],
      ['place.reedbank', '芦苇河滩'],
    ]),
    ...overrides,
  };
}

describe('Round 60 quest objective navigation', () => {
  it('resolves nothing for unknown quests and every non-active journal state', () => {
    const quest = makeQuest([{ id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.test-ferryman' }]);
    for (const status of ['locked', 'offered', 'completed', 'failed'] as const) {
      const result = resolveQuestNavigationTarget(makeInput({
        quests: new Map([[quest.id, quest]]),
        journal: makeJournal([quest], { [quest.id]: status }),
        baseNpcs: [makeNpc('char.test-ferryman', '测试船夫', FERRY_MAP, 10, 10)],
      }));
      expect(result).toEqual({ status: 'no-target', reason: 'not-active' });
    }
    expect(resolveQuestNavigationTarget(makeInput({ questId: 'quest.missing' })))
      .toEqual({ status: 'no-target', reason: 'unknown-quest' });
  });

  it('picks the first unfinished spatial objective in declaration order and skips completed ones', () => {
    const quest = makeQuest([
      { id: 'obj-collect', kind: 'collectItem', targetId: 'item.test-herb', requiredCount: 3 },
      { id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.test-ferryman' },
      { id: 'obj-fight', kind: 'defeatEncounter', targetId: 'encounter.test-bandit' },
    ]);
    const input = makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest], {}, {
        [quest.id]: { 'obj-collect': 1, 'obj-talk': 1 },
      }),
      baseNpcs: [makeNpc('char.test-ferryman', '测试船夫', FERRY_MAP, 10, 10)],
      encounters: [makeEncounter('encounter.test-bandit', '测试匪人', FERRY_MAP, 12, 12)],
    });
    const result = resolveQuestNavigationTarget(input);
    expect(result.status).toBe('target');
    if (result.status !== 'target') throw new Error('expected a target');
    expect(result.target.objectiveId).toBe('obj-fight');
    expect(result.target.kind).toBe('defeatEncounter');
    expect(result.target.name).toBe('测试匪人');
    expect(result.target.mapResourceId).toBe(FERRY_MAP);
    expect(result.target).toMatchObject({ col: 12, row: 12 });
    expect(result.target.id).toBe('quest:quest.r60-test');
    expect(result.target.approachRadius).toBe(1);
  });

  it('reports collect-only quests as having no spatial target instead of inventing coordinates', () => {
    const quest = makeQuest([
      { id: 'obj-herbs', kind: 'collectItem', targetId: 'item.test-herb', requiredCount: 2 },
    ]);
    const result = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest], {}, { [quest.id]: { 'obj-herbs': 1 } }),
    }));
    expect(result).toEqual({ status: 'no-target', reason: 'no-spatial-objective' });
  });

  it('prefers live current-map placements, then compiled period placements, then base records', () => {
    const quest = makeQuest([{ id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.test-ferryman' }]);
    const base = [makeNpc('char.test-ferryman', '测试船夫', FERRY_MAP, 10, 10)];
    const period = [{ ...base[0]!, col: 20, row: 20 }];

    const fromPeriod = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
      baseNpcs: base,
      periodNpcs: period,
    }));
    expect(fromPeriod).toMatchObject({ status: 'target', target: { col: 20, row: 20 } });

    const live = [{ ...base[0]!, col: 30, row: 30 }];
    const fromLive = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
      baseNpcs: base,
      periodNpcs: period,
      currentMapNpcs: live,
    }));
    expect(fromLive).toMatchObject({ status: 'target', target: { col: 30, row: 30, name: '测试船夫' } });
    expect(fromLive).toMatchObject({ status: 'target', target: { approachRadius: 1 } });

    const fromBase = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
      baseNpcs: base,
      periodNpcs: [],
    }));
    expect(fromBase).toMatchObject({ status: 'target', target: { col: 10, row: 10 } });
  });

  it('resolves discovery objectives from the authored world-map event, preferring events over landmarks', () => {
    const quest = makeQuest([
      { id: 'obj-market', kind: 'discoverKnowledge', targetId: 'place.mist-willow-market' },
    ]);
    const result = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
    }));
    expect(result.status).toBe('target');
    if (result.status !== 'target') throw new Error('expected a target');
    // The first-visit event shares its cell with the market landmark.
    expect(result.target).toMatchObject({
      mapResourceId: FERRY_MAP,
      col: 59,
      row: 65,
      name: '芦桥集',
      landmarkId: 'landmark.mist-willow-market',
    });

    const reedQuest = makeQuest([
      { id: 'obj-reed', kind: 'discoverKnowledge', targetId: 'place.reedbank' },
    ]);
    const reedResult = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[reedQuest.id, reedQuest]]),
      journal: makeJournal([reedQuest]),
      questId: reedQuest.id,
    }));
    expect(reedResult.status).toBe('target');
    if (reedResult.status !== 'target') throw new Error('expected a target');
    // The teaching event sits apart from the landing landmark: events win.
    expect(reedResult.target).toMatchObject({ mapResourceId: FERRY_MAP, col: 5, row: 4 });
    expect(reedResult.target.approachRadius).toBe(0);
    expect(reedResult.target.landmarkId).toBeUndefined();
  });

  it('reports unresolved-target when the referenced spatial data is missing', () => {
    const quest = makeQuest([
      { id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.nobody' },
    ]);
    expect(resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
    }))).toEqual({ status: 'no-target', reason: 'unresolved-target' });

    const fightQuest = makeQuest([
      { id: 'obj-fight', kind: 'defeatEncounter', targetId: 'encounter.missing' },
    ]);
    expect(resolveQuestNavigationTarget(makeInput({
      quests: new Map([[fightQuest.id, fightQuest]]),
      journal: makeJournal([fightQuest]),
      questId: fightQuest.id,
    }))).toEqual({ status: 'no-target', reason: 'unresolved-target' });

    const loreQuest = makeQuest([
      { id: 'obj-lore', kind: 'discoverKnowledge', targetId: 'place.unknown' },
    ]);
    expect(resolveQuestNavigationTarget(makeInput({
      quests: new Map([[loreQuest.id, loreQuest]]),
      journal: makeJournal([loreQuest]),
      questId: loreQuest.id,
    }))).toEqual({ status: 'no-target', reason: 'unresolved-target' });
  });

  it('keeps the selected runtime target id stable while a quest advances between objectives', () => {
    const quest = makeQuest([
      { id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.test-ferryman' },
      { id: 'obj-fight', kind: 'defeatEncounter', targetId: 'encounter.test-bandit' },
    ], 'quest.a');
    const common = {
      quests: new Map([[quest.id, quest]]),
      worldMap: makeWorldMap(),
      baseNpcs: [makeNpc('char.test-ferryman', '测试船夫', FERRY_MAP, 10, 10)],
      periodNpcs: [],
      encounters: [makeEncounter('encounter.test-bandit', '测试匪人', FERRY_MAP, 12, 12)],
    };
    const first = resolveQuestNavigationTarget({
      ...common,
      questId: quest.id,
      journal: makeJournal([quest]),
    });
    const second = resolveQuestNavigationTarget({
      ...common,
      questId: quest.id,
      journal: makeJournal([quest], {}, { [quest.id]: { 'obj-talk': 1 } }),
    });
    expect(first.status).toBe('target');
    expect(second.status).toBe('target');
    if (first.status !== 'target' || second.status !== 'target') throw new Error('expected targets');
    expect(first.target.objectiveId).toBe('obj-talk');
    expect(second.target.objectiveId).toBe('obj-fight');
    expect(first.target.id).toBe(`${QUEST_NAVIGATION_ID_PREFIX}quest.a`);
    expect(second.target.id).toBe(first.target.id);
    expect(QUEST_NAVIGATION_ID_PREFIX).toBe('quest:');
  });
});

describe('Round 60 quest waypoint projection', () => {
  const marketQuest = makeQuest([
    { id: 'obj-market', kind: 'discoverKnowledge', targetId: 'place.mist-willow-market' },
  ]);
  const marketTarget = resolveQuestNavigationTarget(makeInput({
    quests: new Map([[marketQuest.id, marketQuest]]),
    journal: makeJournal([marketQuest]),
  }));

  it('projects an accepted quest target past the knowledge gate as a supplemental pin', () => {
    expect(marketTarget.status).toBe('target');
    if (marketTarget.status !== 'target') throw new Error('expected a target');

    // The market landmark stays hidden from an empty knowledge set…
    const atlasOnly = buildWorldMapWaypoints(makeWorldMap(), STARTING_MAP, new Set());
    expect(JSON.stringify(atlasOnly)).not.toContain('芦桥集');
    // …but the accepted quest's objective projects as a runtime pin.
    const withQuest = buildWorldMapWaypoints(makeWorldMap(), STARTING_MAP, new Set(), [marketTarget.target]);
    const pin = withQuest.find((waypoint) => waypoint.id === marketTarget.target.id);
    expect(pin).toMatchObject({
      name: '芦桥集',
      kind: 'remote-landmark',
      category: 'route',
      destinationId: marketTarget.target.id,
      position: { col: 90, row: 50 },
      nextTransitionName: '石阶渡口',
    });
    // The supplement must not smuggle in other gated content.
    const questPinsJson = JSON.stringify(withQuest.filter((waypoint) =>
      waypoint.destinationId?.startsWith('quest:')));
    expect(questPinsJson).not.toContain('landmark.reedbank-landing');
    expect(questPinsJson).not.toContain('place.reedbank');
  });

  it('pins a same-map quest target at its own cell and drops unroutable ones', () => {
    const hamletQuest = makeQuest([
      { id: 'obj-hamlet', kind: 'discoverKnowledge', targetId: 'place.south-hamlet' },
    ]);
    const hamlet = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[hamletQuest.id, hamletQuest]]),
      journal: makeJournal([hamletQuest]),
      questId: hamletQuest.id,
    }));
    expect(hamlet.status).toBe('target');
    if (hamlet.status !== 'target') throw new Error('expected a target');

    const local = buildQuestObjectiveWaypoint(makeWorldMap(), STARTING_MAP, hamlet.target);
    expect(local).toMatchObject({
      kind: 'landmark',
      approachRadius: 0,
      position: { col: 70, row: 75 },
      destinationId: hamlet.target.id,
    });
    expect(local?.destinationLandmarkId).toBeUndefined();

    const remote = buildQuestObjectiveWaypoint(makeWorldMap(), FERRY_MAP, hamlet.target);
    expect(remote).toMatchObject({
      kind: 'remote-landmark',
      position: { col: 2, row: 4 },
      nextTransitionName: '回望石阶',
      regionRouteNames: ['雾雨渡口', '江南道·七镇行旅'],
    });

    const world = makeWorldMap();
    world.transitions = world.transitions.filter((edge) => edge.id !== 'gate.ferry-to-trial');
    expect(buildQuestObjectiveWaypoint(world, FERRY_MAP, hamlet.target)).toBeNull();
  });
});

describe('Round 60 quest navigation guide integration', () => {
  const ferryMap = loadMap('../data/base/maps/round-10-mist-ferry.json');

  it('guides a same-map quest target with the collision-aware local path', () => {
    const quest = makeQuest([{ id: 'obj-talk', kind: 'talkToNpc', targetId: 'char.test-ferryman' }]);
    const npc = makeNpc('char.test-ferryman', '测试船夫', FERRY_MAP, 3, 1);
    const result = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
      currentMapNpcs: [npc],
    }));
    expect(result.status).toBe('target');
    if (result.status !== 'target') throw new Error('expected a target');

    const guide = resolveCellNavigationGuide(
      makeWorldMap(),
      FERRY_MAP,
      result.target,
      ferryMap,
      ferryMap.playerStart,
    );
    expect(guide.status).toBe('en-route');
    if (guide.status !== 'en-route') throw new Error('expected an en-route guide');
    expect(guide.destinationName).toBe('测试船夫');
    expect(guide.destinationRegionName).toBe('雾雨渡口');
    expect(guide.nextTransitionName).toBeNull();
    expect(guide.destinationLandmarkId).toBeUndefined();
    const last = guide.path.at(-1)!;
    expect(Math.abs(last.col - 3) + Math.abs(last.row - 1)).toBe(1);
  });

  it('routes a cross-region quest target to the first directed gate', () => {
    const quest = makeQuest([{ id: 'obj-fight', kind: 'defeatEncounter', targetId: 'encounter.test-bandit' }]);
    const encounter = makeEncounter('encounter.test-bandit', '测试匪人', STARTING_MAP, 70, 75);
    const result = resolveQuestNavigationTarget(makeInput({
      quests: new Map([[quest.id, quest]]),
      journal: makeJournal([quest]),
      encounters: [encounter],
    }));
    expect(result.status).toBe('target');
    if (result.status !== 'target') throw new Error('expected a target');
    expect(result.target.mapResourceId).toBe(STARTING_MAP);

    const guide = resolveCellNavigationGuide(
      makeWorldMap(),
      FERRY_MAP,
      result.target,
      ferryMap,
      ferryMap.playerStart,
    );
    expect(guide.status).toBe('en-route');
    if (guide.status !== 'en-route') throw new Error('expected an en-route guide');
    expect(guide.nextTransitionName).toBe('回望石阶');
    expect(guide.regionRouteNames).toEqual(['雾雨渡口', '江南道·七镇行旅']);
    const last = guide.path.at(-1)!;
    expect(Math.abs(last.col - 2) + Math.abs(last.row - 4)).toBe(1);
    expect(guide.path.at(-1)).not.toEqual({ col: 70, row: 75 });

    const broken = resolveCellNavigationGuide(
      makeWorldMap(),
      FERRY_MAP,
      { ...result.target, mapResourceId: 'map.unknown' },
      ferryMap,
      { col: 1, row: 4 },
    );
    expect(broken).toEqual({ status: 'route-broken', destinationName: '测试匪人' });
  });
});
