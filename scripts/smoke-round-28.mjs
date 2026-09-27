import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const pathname = new URL(url, 'http://round-28.local').pathname;
  let filePath = null;
  if (pathname.startsWith('/base/')) filePath = 'data/base/' + pathname.slice('/base/'.length);
  else if (pathname.startsWith('/schema/')) filePath = 'data/schema/' + pathname.slice('/schema/'.length);
  if (filePath === null) return new Response('', { status: 404 });
  try {
    const contents = await readFile(filePath, 'utf8');
    return new Response(contents, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch {
    return new Response('', { status: 404 });
  }
};

const EMPTY_RUN_STATE = { unlockedIds: [], battleVictories: 0, equipmentCrafts: 0, alchemyCrafts: 0 };
const arenaRecordOf = (championships) => ({
  arenaId: 'arena.smoke', attempts: 0, bestWins: 0, championships, lastWins: 0,
});

try {
  const [achievements, saves, socialEngine, progression, itemsEngine, quests, graphEngine, loaderModule] =
    await Promise.all([
      server.ssrLoadModule('/src/engine/achievement-system.ts'),
      server.ssrLoadModule('/src/engine/save-system.ts'),
      server.ssrLoadModule('/src/engine/social-state.ts'),
      server.ssrLoadModule('/src/engine/character-progression.ts'),
      server.ssrLoadModule('/src/engine/item-system.ts'),
      server.ssrLoadModule('/src/engine/quest-system.ts'),
      server.ssrLoadModule('/src/engine/knowledge-graph.ts'),
      server.ssrLoadModule('/src/game/world-loader.ts'),
    ]);
  const [rawAchievements, achievementSchema, rawProfiles, rawNodes, rawEdges, rawMap] = await Promise.all([
    readJson('data/base/achievements/round-28-achievements.json'),
    readJson('data/schema/achievement-set.schema.json'),
    readJson('data/base/characters/round-04-profiles.json'),
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/maps/round-10-mist-ferry.json'),
  ]);

  const parsedProfiles = progression.parseCharacterProfileSet(rawProfiles);
  const parsedNodes = graphEngine.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = graphEngine.parseKnowledgeEdgeSet(rawEdges);
  assert.equal(parsedProfiles.ok && parsedNodes.ok && parsedEdges.ok, true, 'base profile and graph data should parse');
  const graph = graphEngine.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  const knowledgeNodeIds = new Set(graph.nodes.keys());

  // --- Protocol parsing: the base set is clean, bad entries quarantine alone ---
  const parsed = achievements.parseAchievementSet(rawAchievements);
  assert.equal(parsed.ok, true, 'the base achievement set should parse');
  assert.equal(parsed.warnings.length, 0, 'the base achievement set should parse without warnings');
  assert.equal(parsed.set.achievements.length, 14, 'all fourteen authored achievements should survive parsing');
  assert.deepEqual(
    parsed.set.achievements.map((entry) => entry.id),
    rawAchievements.achievements.map((entry) => entry.id),
    'strictly descending priorities keep the authored order stable',
  );
  assert.equal(achievements.parseAchievementSet({ id: 'achievement.set.bad', achievements: [] }).ok, false,
    'an empty achievement array must fail the whole set');
  assert.equal(achievements.parseAchievementSet({ id: 'bad-prefix', achievements: rawAchievements.achievements }).ok,
    false, 'a set id without the achievement.set. prefix must fail');

  const validEntry = (id, extra = {}) => ({
    id, title: '冒烟条目', description: '冒烟测试用占位成就。', priority: 1,
    conditions: [{ kind: 'playerLevel', minLevel: 1, hint: '角色达到 1 级' }],
    reward: { experience: 10 }, ...extra,
  });
  const quarantineInput = {
    id: 'achievement.set.smoke-quarantine',
    achievements: [
      validEntry('achievement.dup'),
      validEntry('achievement.dup'),
      validEntry('achievement.bad-reward', { reward: { experience: 0, currency: 0 } }),
      validEntry('achievement.no-conditions', { conditions: [] }),
      validEntry('achievement.bad-count', { conditions: [{ kind: 'battleVictories', minCount: 0, hint: '零场' }] }),
      validEntry('achievement.survivor'),
    ],
  };
  const validateAchievementSetSchema = new Ajv({ allErrors: true }).compile(achievementSchema);
  assert.equal(validateAchievementSetSchema(quarantineInput), true,
    'schema accepts structurally typed entries so semantic errors can be isolated per achievement');
  const quarantined = achievements.parseAchievementSet(quarantineInput);
  assert.equal(quarantined.ok, true, 'one bad entry must never fail the whole set');
  assert.deepEqual(
    quarantined.set.achievements.map((entry) => entry.id),
    ['achievement.dup', 'achievement.survivor'],
    'duplicate ids, zero rewards, empty conditions and out-of-range counts disable only their own entries',
  );
  assert.equal(quarantined.warnings.length, 4, 'each disabled entry reports exactly one warning');

  // --- Cross-reference assembly: dangling MOD references isolate one entry each ---
  const worldRefs = {
    npcIds: new Set(['char.lu-zhenniang']),
    factionIds: new Set(['faction.tingyu-jiange', 'faction.yunyin-shanzhuang']),
    knowledgeNodeIds,
  };
  const parsedMods = achievements.parseAchievementSet({
    id: 'achievement.set.smoke-mods',
    achievements: [
      { ...validEntry('achievement.mod-npc'), conditions: [{ kind: 'npcRelationship', npcId: 'char.mod-ghost', minValue: 5, hint: '幻影故人' }] },
      { ...validEntry('achievement.mod-faction'), conditions: [{ kind: 'factionMembership', factionId: 'faction.mod-ghost', isMember: true, hint: '幻门弟子' }] },
      { ...validEntry('achievement.mod-knowledge'), conditions: [{ kind: 'knowledgeKnown', nodeId: 'event.mod-ghost', hint: '幻闻一则' }] },
      { ...validEntry('achievement.mod-intact'), conditions: [{ kind: 'knowledgeKnown', nodeId: 'event.old-footprints', hint: '雨后旧踪' }] },
    ],
  });
  assert.equal(parsedMods.ok, true);
  const modAssembly = achievements.assembleAchievementSet({ set: parsedMods.set, ...worldRefs });
  assert.deepEqual(
    modAssembly.set.achievements.map((entry) => entry.id),
    ['achievement.mod-intact'],
    'dangling npc/faction/knowledge references disable only their own achievements',
  );
  assert.equal(modAssembly.warnings.length, 3, 'each dangling reference is reported once');
  assert.deepEqual(
    achievements.assembleAchievementSet({ set: null, ...worldRefs }),
    { set: null, warnings: [] },
    'a missing optional achievement resource must degrade to no set',
  );

  // --- Pure progress projection across every condition kind ---
  const makeContext = (overrides = {}) => {
    const social = socialEngine.createSocialState();
    social.morality = 0;
    social.renown = 0;
    return {
      character: { level: 1, unlockedMeridianNodeIds: [], martialArtIds: [] },
      customMartialArtCount: 0,
      questStatuses: new Map(),
      knownKnowledgeNodeIds: new Set(['event.old-footprints']),
      social,
      factionMembership: null,
      relationships: new Map(),
      arenaRecords: new Map(),
      state: { ...EMPTY_RUN_STATE },
      ...overrides,
    };
  };
  const socialFor = (morality, renown) => {
    const social = socialEngine.createSocialState();
    social.morality = morality;
    social.renown = renown;
    return social;
  };
  const runStateOf = (over = {}) => ({ ...EMPTY_RUN_STATE, ...over });

  const midContext = makeContext({
    customMartialArtCount: 1,
    social: socialFor(5, 9),
    relationships: new Map([['char.lu-zhenniang', 15]]),
    arenaRecords: new Map([['arena.smoke', arenaRecordOf(1)]]),
    state: runStateOf({ battleVictories: 2, equipmentCrafts: 1 }),
  });
  const rows = achievements.evaluateAchievements(parsed.set, midContext);
  assert.equal(rows.length, 14, 'every achievement projects a progress row');
  assert.equal(rows.every((row) => row.unlocked === false), true, 'an empty run state unlocks nothing');
  const progressOf = (id) => rows.find((row) => row.achievement.id === id);
  assert.deepEqual(
    rows.filter((row) => row.met).map((row) => row.achievement.id),
    ['achievement.footprints-known', 'achievement.kind-deed', 'achievement.trust-at-the-tea-house',
      'achievement.arena-champion', 'achievement.self-made-art', 'achievement.forged-gear'],
    'count, threshold, membership and knowledge kinds project partial progress precisely',
  );
  assert.deepEqual(
    [progressOf('achievement.first-breath').conditions[0].currentText, progressOf('achievement.first-breath').conditions[0].targetText],
    ['1', '2'], 'count-style progress shows current/target numbers');
  assert.deepEqual(
    [progressOf('achievement.kind-deed').conditions[0].met, progressOf('achievement.kind-deed').conditions[0].targetText],
    [true, '≥ 5'], 'inclusive minimum thresholds and their display both hold');
  assert.equal(progressOf('achievement.find-a-home').conditions[0].currentText, '否',
    'boolean membership progress shows the authored yes/no wording');
  assert.equal(progressOf('achievement.footprints-known').conditions[0].currentText, '已发现',
    'knowledge discovery progress shows its authored wording');
  assert.equal(progressOf('achievement.first-promise').metConditionCount, 0,
    'an empty journal counts zero completed quests');

  // --- Range/membership branches the base set does not exercise ---
  const parsedBranches = achievements.parseAchievementSet({
    id: 'achievement.set.smoke-branches',
    achievements: [
      {
        id: 'achievement.smoke-combo', title: '组合冒烟', description: '区间、门派与关系一并成立。', priority: 30,
        conditions: [
          { kind: 'morality', minValue: -20, maxValue: 20, hint: '善恶 -20–20' },
          { kind: 'renown', maxValue: 5, hint: '声望不过 5' },
          { kind: 'factionMembership', factionId: 'faction.tingyu-jiange', isMember: true, hint: '听雨阁中人' },
          { kind: 'npcRelationship', npcId: 'char.lu-zhenniang', minValue: 10, hint: '茶棚关系 ≥ 10' },
        ],
        reward: { experience: 12 },
      },
      {
        id: 'achievement.smoke-unaffiliated', title: '自在散人', description: '未曾拜入任何门派。', priority: 20,
        conditions: [{ kind: 'factionMembership', isMember: false, hint: '保持无门派' }],
        reward: { currency: 8 },
      },
      {
        id: 'achievement.smoke-renown-band', title: '不温不火', description: '声望落在一个区间。', priority: 10,
        conditions: [{ kind: 'renown', minValue: 5, maxValue: 10, hint: '声望 5–10' }],
        reward: { experience: 6 },
      },
    ],
  });
  assert.equal(parsedBranches.ok, true, 'the branch fixture should parse');
  const branchAssembly = achievements.assembleAchievementSet({ set: parsedBranches.set, ...worldRefs });
  assert.equal(branchAssembly.warnings.length, 0, 'real world references assemble the branch fixture cleanly');
  const branchSet = branchAssembly.set;
  const membership = { factionId: 'faction.tingyu-jiange', masterNpcId: 'char.ye-tingzhou' };
  const comboContext = (renown, factionMembership = membership) => makeContext({
    social: socialFor(0, renown),
    factionMembership,
    relationships: new Map([['char.lu-zhenniang', 12]]),
  });
  const comboRow = achievements.evaluateAchievements(branchSet, comboContext(3))[0];
  assert.equal(comboRow.achievement.id, 'achievement.smoke-combo', 'highest priority sorts first');
  assert.equal(comboRow.metConditionCount, 4, 'an AND group counts every met condition');
  assert.equal(comboRow.met, true);
  assert.equal(comboRow.conditions[0].targetText, '-20–20', 'two-sided ranges display as a–b');
  assert.equal(comboRow.conditions[1].targetText, '≤ 5', 'upper-bound-only ranges display as ≤ b');
  assert.equal(achievements.evaluateAchievements(branchSet, comboContext(6))[0].met, false,
    'one unmet condition keeps the whole group locked');
  assert.equal(
    achievements.evaluateAchievements(branchSet, comboContext(3, { factionId: 'faction.yunyin-shanzhuang', masterNpcId: 'char.wen-suxin' }))[0].metConditionCount,
    3, 'a named faction condition ignores membership in a different faction',
  );
  const unaffiliatedRow = (context) =>
    achievements.evaluateAchievements(branchSet, context).find((row) => row.achievement.id === 'achievement.smoke-unaffiliated');
  const freeRow = unaffiliatedRow(makeContext());
  assert.deepEqual([freeRow.met, freeRow.conditions[0].currentText, freeRow.conditions[0].targetText], [true, '否', '否'],
    'isMember:false is satisfied while unaffiliated');
  assert.equal(unaffiliatedRow(makeContext({ factionMembership: membership })).met, false,
    'joining any faction breaks the isMember:false condition');
  const bandRow = (renown) =>
    achievements.evaluateAchievements(branchSet, makeContext({ social: socialFor(0, renown) }))
      .find((row) => row.achievement.id === 'achievement.smoke-renown-band');
  assert.equal(bandRow(7).met && bandRow(7).conditions[0].targetText === '5–10', true,
    'inside-the-band renown meets the condition');
  assert.equal(bandRow(3).met || bandRow(11).met, false, 'both band edges reject outside values');

  // --- Purity: evaluation never mutates the live journey ---
  const purityBefore = JSON.stringify({
    social: midContext.social, relationships: [...midContext.relationships],
    quests: [...midContext.questStatuses], arena: [...midContext.arenaRecords],
    known: [...midContext.knownKnowledgeNodeIds], state: midContext.state,
  });
  achievements.evaluateAchievements(parsed.set, midContext);
  assert.equal(JSON.stringify({
    social: midContext.social, relationships: [...midContext.relationships],
    quests: [...midContext.questStatuses], arena: [...midContext.arenaRecords],
    known: [...midContext.knownKnowledgeNodeIds], state: midContext.state,
  }), purityBefore, 'evaluation must never mutate the journey or the run state');

  // --- One-shot unlock idempotency and the historical latch ---
  const fullContext = makeContext({
    character: { level: 2, unlockedMeridianNodeIds: ['meridian.smoke'], martialArtIds: [] },
    questStatuses: new Map([['quest.round-07-medicine-run', 'completed']]),
    knownKnowledgeNodeIds: new Set(['event.old-footprints', ...Array.from({ length: 15 }, (_, i) => 'knowledge.smoke-' + i)]),
    social: socialFor(5, 10),
    factionMembership: membership,
    relationships: new Map([['char.lu-zhenniang', 15]]),
    arenaRecords: new Map([['arena.smoke', arenaRecordOf(1)]]),
    customMartialArtCount: 1,
    state: runStateOf({ battleVictories: 3, equipmentCrafts: 1, alchemyCrafts: 1 }),
  });
  const firstPass = achievements.unlockReadyAchievements(parsed.set, fullContext.state, fullContext);
  assert.equal(firstPass.newlyUnlocked.length, 14, 'a fully eligible journey unlocks every achievement at once');
  assert.deepEqual(
    firstPass.newlyUnlocked.map((entry) => entry.id),
    rawAchievements.achievements.map((entry) => entry.id),
    'newly unlocked rewards arrive in priority order',
  );
  const secondPass = achievements.unlockReadyAchievements(parsed.set, firstPass.state, fullContext);
  assert.equal(secondPass.newlyUnlocked.length, 0, 'a repeated check pays nothing again');
  assert.equal(secondPass.state, firstPass.state, 'an empty unlock pass returns the same state object');
  const regressed = achievements.evaluateAchievements(parsed.set, makeContext({
    character: { level: 1, unlockedMeridianNodeIds: [], martialArtIds: [] },
    state: firstPass.state,
  })).find((row) => row.achievement.id === 'achievement.first-breath');
  assert.equal(regressed.unlocked, true, 'a latched unlock survives conditions regressing');
  assert.equal(regressed.met, false, 'the latch does not fake current progress');

  // --- A removed-then-restored MOD achievement must never pay twice ---
  const parsedReturning = achievements.parseAchievementSet({
    id: 'achievement.set.smoke-returning',
    achievements: [
      { ...validEntry('achievement.mod-returning'), conditions: [{ kind: 'playerLevel', minLevel: 1, hint: '老玩家回归' }], reward: { currency: 66 } },
    ],
  });
  assert.equal(parsedReturning.ok, true);
  const historicalState = runStateOf({ unlockedIds: ['achievement.mod-returning'] });
  const returningRow = achievements.evaluateAchievements(parsedReturning.set, makeContext({ state: historicalState }))[0];
  assert.deepEqual([returningRow.unlocked, returningRow.met], [true, true],
    'a historical unknown id stays marked unlocked once its conditions are met again');
  const returningPass = achievements.unlockReadyAchievements(parsedReturning.set, historicalState, makeContext({ state: historicalState }));
  assert.equal(returningPass.newlyUnlocked.length, 0, 're-enabling a MOD achievement never re-awards it');
  assert.equal(returningPass.state, historicalState, 'the no-op unlock keeps the very same state object');

  // --- Monotonic saturating counters keep the input untouched ---
  assert.deepEqual(achievements.createAchievementRunState(), EMPTY_RUN_STATE, 'a fresh run state is the empty baseline');
  const counterBase = runStateOf();
  const counted = achievements.recordAchievementCounter(counterBase, 'battleVictories', 2);
  assert.equal(counted.battleVictories, 2, 'counters accumulate the requested amount');
  assert.equal(counterBase.battleVictories, 0, 'counter updates never mutate the input state');
  assert.equal(achievements.recordAchievementCounter(counterBase, 'equipmentCrafts', 0), counterBase,
    'zero amounts are rejected without any allocation');
  assert.equal(achievements.recordAchievementCounter(counterBase, 'equipmentCrafts', -3), counterBase,
    'negative amounts are rejected');
  assert.equal(achievements.recordAchievementCounter(counterBase, 'alchemyCrafts', 1.5), counterBase,
    'non-integer amounts are rejected');
  assert.equal(counted.equipmentCrafts, 0, 'only the addressed counter changes');
  assert.equal(
    achievements.recordAchievementCounter(runStateOf({ battleVictories: 999_999_999 }), 'battleVictories').battleVictories,
    999_999_999, 'counters saturate at the protocol ceiling',
  );

  // --- The full base world loads with achievements wired into the assembly ---
  const originalInfo = console.info;
  console.info = () => {};
  let loaded;
  try {
    loaded = await loaderModule.loadWorldData();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(loaded.ok, true, 'the shared manifest loader should start the full base world');
  assert(loaded.ok);
  assert.equal(loaded.world.assembly.achievements?.achievements.length, 14,
    'the achievement set should reach the playable world assembly');
  assert.equal(
    loaded.world.optionalWarnings.some((warning) => warning.resource === 'achievement.round-28-set'),
    false, 'base achievement data should produce no assembly warnings',
  );

  // --- v1 save roundtrips: new fields lossless, legacy snapshots compatible ---
  const profile = parsedProfiles.set.profiles[0];
  const character = progression.createCharacterState(profile);
  const inventory = itemsEngine.createInventoryState(profile, []);
  inventory.stacks = [];
  const carriedState = runStateOf({
    unlockedIds: ['achievement.first-breath', 'achievement.mod-removed-gone'],
    battleVictories: 12, equipmentCrafts: 4, alchemyCrafts: 5,
  });
  const snapshot = saves.captureSaveSnapshot({
    displayName: 'Round 28 smoke', mapResourceId: rawMap.id, playerCol: 1, playerRow: 1,
    character, inventory, shopStocks: new Map(), journal: quests.createQuestJournal(new Map()),
    social: socialEngine.createSocialState(), completedEncounters: new Set(), completedRegionalEvents: new Set(),
    knownKnowledgeNodeIds: new Set(['event.old-footprints']), elapsedGameMinutes: 30, worldSeed: 28,
    arenaRecords: new Map([['arena.round-20-smoke', { ...arenaRecordOf(1), arenaId: 'arena.round-20-smoke', attempts: 2, lastWins: 1 }]]),
    achievementState: carriedState,
    now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  assert.deepEqual(snapshot.achievementState, carriedState, 'capture keeps the achievement state verbatim');
  const parsedSnapshot = saves.parseSaveSnapshot(snapshot);
  assert.equal(parsedSnapshot.ok, true);
  if (!parsedSnapshot.ok) throw new Error(parsedSnapshot.errors.join('\n'));
  assert.deepEqual(parsedSnapshot.snapshot.achievementState, carriedState, 'protocol parsing preserves counters and unlocks');
  const restorePlan = saves.planSnapshotRestore(parsedSnapshot.snapshot, {
    profileIds: new Set([profile.id]), profileRecords: new Map([[profile.id, profile]]), mapResourceId: rawMap.id,
    isWalkableCell: () => true, isCellOccupied: () => false,
    itemIds: new Set(), martialArtIds: new Set(profile.startingMartialArtIds),
    questIds: new Set(), questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set(),
    knowledgeNodeIds, companionIds: new Set(), factionWarIds: new Set(),
  });
  assert.equal(restorePlan.ok, true);
  if (!restorePlan.ok) throw new Error(restorePlan.errors.join('\n'));
  assert.deepEqual(restorePlan.snapshot.achievementState, carriedState,
    'historical unknown unlocked ids survive the restore preflight untouched');
  const restored = saves.restoreRunState({ profile, items: new Map(), quests: new Map(), shops: new Map(), snapshot: restorePlan.snapshot });
  assert.deepEqual(restored.achievementState, carriedState, 'a full restore returns the identical achievement state');
  assert.equal(restored.arenaRecords[0].championships, 1, 'arena championship counters ride along in the same snapshot');

  const legacy = structuredClone(snapshot);
  delete legacy.achievementState;
  const legacyParsed = saves.parseSaveSnapshot(legacy);
  assert.equal(legacyParsed.ok, true, 'a pre-R28 v1 save without achievementState still loads');
  if (legacyParsed.ok) {
    assert.deepEqual(legacyParsed.snapshot.achievementState, EMPTY_RUN_STATE,
      'missing achievement fields default to the empty baseline');
  }
  const duplicated = structuredClone(snapshot);
  duplicated.achievementState = runStateOf({ unlockedIds: ['achievement.first-breath', 'achievement.first-breath'] });
  const duplicatedParsed = saves.parseSaveSnapshot(duplicated);
  assert.equal(duplicatedParsed.ok, false, 'duplicate unlocked ids refuse the whole snapshot');
  assert(duplicatedParsed.ok === false && duplicatedParsed.errors.some((error) => error.startsWith('achievementState')),
    'the refusal names the achievementState field');
  const overflow = structuredClone(snapshot);
  overflow.achievementState = runStateOf({ battleVictories: -1 });
  assert.equal(saves.parseSaveSnapshot(overflow).ok, false, 'out-of-range counters refuse the whole snapshot');

  console.log('通过：成就协议解析与逐条隔离、悬空 MOD 引用隔离、14 类条件进度与区间/布尔分支、评估纯度、饱和计数、一次性解锁幂等与历史锁存、移除 MOD 成就回归不重复发奖、完整世界加载及 v1 新旧存档往返（含历史未知解锁 id）。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
