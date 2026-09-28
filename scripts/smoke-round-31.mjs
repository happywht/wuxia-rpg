import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const pathname = new URL(url, 'http://round-31.local').pathname;
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

const LEGACY_QUEST_IDS = ['quest.round-07-medicine-run', 'quest.round-07-clear-alley'];
const NEW_ENCOUNTER_IDS = [
  'encounter.mist-shore-prowler',
  'encounter.ferry-reed-ambush',
  'encounter.pier-toll-robber',
];
const BRANCH_GROUP = 'branch.ferry-priority';

try {
  const [questEngine, saveEngine, socialEngine, progressionEngine, itemEngine, loaderModule, gridMapEngine] = await Promise.all([
    server.ssrLoadModule('/src/engine/quest-system.ts'),
    server.ssrLoadModule('/src/engine/save-system.ts'),
    server.ssrLoadModule('/src/engine/social-state.ts'),
    server.ssrLoadModule('/src/engine/character-progression.ts'),
    server.ssrLoadModule('/src/engine/item-system.ts'),
    server.ssrLoadModule('/src/game/world-loader.ts'),
    server.ssrLoadModule('/src/engine/grid-map.ts'),
  ]);
  const [rawQuests, rawNpcs, rawEncounters, rawManifest, rawWorldMap, rawArenas, rawWars, rawForges, rawAlchemy, rawEndings] = await Promise.all([
    readJson('data/base/quests/round-07-quests.json'),
    readJson('data/base/characters/round-03-npcs.json'),
    readJson('data/base/battles/round-05-encounters.json'),
    readJson('data/base/manifest.json'),
    readJson('data/base/world/world-map.json'),
    readJson('data/base/arenas/round-20-arenas.json'),
    readJson('data/base/faction_wars/round-21-wars.json'),
    readJson('data/base/forges/round-24-equipment-forges.json'),
    readJson('data/base/alchemy/round-25-alchemy.json'),
    readJson('data/base/endings/round-27-endings.json'),
  ]);

  // ── 1. 数量与唯一性：2 项原始任务，R31 新增 18，R42 +5，R43 +5，R44 +2，R56 +2；任务/目标 id 全局唯一。
  assert.equal(rawQuests.quests.length, 34, 'the base quest set holds 34 quests through Round 56');
  assert.deepEqual(
    rawQuests.quests.map((quest) => quest.id).filter((id) => id.startsWith('quest.r31-')).length,
    18,
    'Round 31 adds exactly 18 new quests',
  );
  assert.equal(rawQuests.quests.filter((quest) => quest.id.startsWith('quest.r42-')).length, 5,
    'Round 42 adds exactly five main-story quests');
  assert.equal(rawQuests.quests.filter((quest) => quest.id.startsWith('quest.r43-')).length, 5,
    'Round 43 adds exactly five faction quests');
  const questIds = rawQuests.quests.map((quest) => quest.id);
  assert.equal(new Set(questIds).size, questIds.length, 'quest ids stay globally unique');
  const objectiveIds = rawQuests.quests.flatMap((quest) => quest.objectives.map((objective) => objective.id));
  assert.equal(new Set(objectiveIds).size, objectiveIds.length, 'objective ids stay globally unique');
  const kinds = new Set(rawQuests.quests.flatMap((quest) => quest.objectives.map((objective) => objective.kind)));
  assert.deepEqual([...kinds].sort(), ['collectItem', 'defeatEncounter', 'discoverKnowledge', 'talkToNpc'], 'all four objective kinds are in use');
  const failQuests = rawQuests.quests.filter((quest) => (quest.failOnEncounterIds ?? []).length > 0);
  assert.equal(failQuests.filter((quest) => !LEGACY_QUEST_IDS.includes(quest.id)).length, 3,
    'Round 31 adds at least three quests with explicit fail encounters');
  const branchMembers = rawQuests.quests.filter((quest) => quest.exclusiveGroupId === BRANCH_GROUP);
  assert.equal(branchMembers.length, 2, 'the exclusive group holds exactly two branch choices');
  const prerequisiteKey = (quest) => [...(quest.prerequisiteQuestIds ?? [])].sort().join('|');
  assert.equal(prerequisiteKey(branchMembers[0]), prerequisiteKey(branchMembers[1]),
    'the exclusive branch members share identical prerequisites');
  assert.equal(branchMembers[0].giverNpcId, branchMembers[1].giverNpcId,
    'both exclusive choices appear together on the same NPC quest board');
  assert.equal(branchMembers[0].giverNpcId, 'char.bai-luzhou',
    'the shared branch board belongs to Bai Luzhou');
  const gratitude = rawQuests.quests.find((quest) => quest.id === 'quest.r31-caravan-gratitude');
  const toll = rawQuests.quests.find((quest) => quest.id === 'quest.r31-pier-toll-clearing');
  assert.deepEqual(gratitude.prerequisiteQuestIds, ['quest.r31-guard-the-caravan'], 'the guard branch unlocks its own follow-up');
  assert.deepEqual(toll.prerequisiteQuestIds, ['quest.r31-mend-the-pier'], 'the pier branch unlocks its own follow-up');
  assert.notDeepEqual(gratitude.rewards, toll.rewards, 'the two branch follow-ups pay different rewards');

  // ── 2. 解析：扩展协议（talkToNpc、exclusiveGroupId）通过防御解析。
  const parsedQuests = questEngine.parseQuestSet(rawQuests);
  assert.equal(parsedQuests.ok, true, `the extended quest set parses (${parsedQuests.ok ? '' : parsedQuests.errors.join('；')})`);
  assert.equal(parsedQuests.set.quests.length, 34, 'all 34 quests parse');
  const guardData = parsedQuests.set.quests.find((quest) => quest.id === 'quest.r31-guard-the-caravan');
  const mendData = parsedQuests.set.quests.find((quest) => quest.id === 'quest.r31-mend-the-pier');
  assert.equal(guardData.exclusiveGroupId, BRANCH_GROUP);
  assert.equal(mendData.exclusiveGroupId, BRANCH_GROUP);
  assert.equal(parsedQuests.set.quests.every((quest) => quest.exclusiveGroupId === undefined || typeof quest.exclusiveGroupId === 'string'), true,
    'exclusiveGroupId parses as an optional non-empty string');

  // ── 3. 引用隔离：坏引用只禁用对应任务；互斥组整组校验，坏成员绝不留下假单选。
  const miniNpcs = new Set(['npc.a', 'npc.b']);
  const miniQuestSet = {
    quests: [
      {
        id: 'q.ok-collect', name: '甲', description: '甲', giverNpcId: 'npc.a',
        objectives: [{ id: 'o1', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '甲' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.ok-talk', name: '乙', description: '乙', giverNpcId: 'npc.a',
        objectives: [{ id: 'o2', kind: 'talkToNpc', targetId: 'npc.b', requiredCount: 1, text: '乙' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.bad-giver', name: '丙', description: '丙', giverNpcId: 'npc.ghost',
        objectives: [{ id: 'o3', kind: 'talkToNpc', targetId: 'npc.a', requiredCount: 1, text: '丙' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.bad-item', name: '丁', description: '丁', giverNpcId: 'npc.a',
        objectives: [{ id: 'o4', kind: 'collectItem', targetId: 'item.ghost', requiredCount: 1, text: '丁' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.bad-encounter', name: '戊', description: '戊', giverNpcId: 'npc.a',
        objectives: [{ id: 'o5', kind: 'defeatEncounter', targetId: 'enc.ghost', requiredCount: 1, text: '戊' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.bad-talk-npc', name: '己', description: '己', giverNpcId: 'npc.a',
        objectives: [{ id: 'o6', kind: 'talkToNpc', targetId: 'npc.ghost', requiredCount: 1, text: '己' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-a', name: '庚', description: '庚', giverNpcId: 'npc.a', exclusiveGroupId: 'g.ok',
        objectives: [{ id: 'o7', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '庚' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-b', name: '辛', description: '辛', giverNpcId: 'npc.a', exclusiveGroupId: 'g.ok',
        objectives: [{ id: 'o8', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '辛' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-broken-a', name: '壬', description: '壬', giverNpcId: 'npc.ghost', exclusiveGroupId: 'g.broken',
        objectives: [{ id: 'o9', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '壬' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-broken-b', name: '癸', description: '癸', giverNpcId: 'npc.a', exclusiveGroupId: 'g.broken',
        objectives: [{ id: 'o10', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '癸' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-mismatch-a', name: '子', description: '子', giverNpcId: 'npc.a', exclusiveGroupId: 'g.mismatch',
        objectives: [{ id: 'o11', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '子' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-mismatch-b', name: '丑', description: '丑', giverNpcId: 'npc.a', exclusiveGroupId: 'g.mismatch',
        prerequisiteQuestIds: ['q.ok-collect'],
        objectives: [{ id: 'o12', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '丑' }],
        rewards: { experience: 1, currency: 1 },
      },
      {
        id: 'q.group-solo', name: '寅', description: '寅', giverNpcId: 'npc.a', exclusiveGroupId: 'g.solo',
        objectives: [{ id: 'o13', kind: 'collectItem', targetId: 'item.x', requiredCount: 1, text: '寅' }],
        rewards: { experience: 1, currency: 1 },
      },
    ],
  };
  const miniAssembly = questEngine.assembleQuests({
    questSet: questEngine.parseQuestSet(miniQuestSet).set,
    questGiverNpcIds: new Set(['npc.a']),
    npcIds: miniNpcs,
    itemIds: new Set(['item.x']),
    encounterIds: new Set(['enc.e']),
  });
  const surviving = [...miniAssembly.quests.keys()].sort();
  assert.deepEqual(surviving, ['q.group-a', 'q.group-b', 'q.ok-collect', 'q.ok-talk'],
    'broken references disable only their own quest; the valid group and quests survive');
  for (const disabled of ['q.bad-giver', 'q.bad-item', 'q.bad-encounter', 'q.bad-talk-npc', 'q.group-broken-b', 'q.group-mismatch-a', 'q.group-mismatch-b', 'q.group-solo']) {
    assert.ok(miniAssembly.warnings.some((warning) => warning.includes(disabled)),
      `assembly reports why "${disabled}" was disabled`);
  }
  assert.ok(!miniAssembly.quests.has('q.group-broken-b'),
    'a broken group member disables its whole group instead of leaving a single-choice branch');
  assert.ok(!miniAssembly.quests.has('q.group-mismatch-a') && !miniAssembly.quests.has('q.group-mismatch-b'),
    'a group with mismatched prerequisites is disabled as a whole');
  assert.ok(!miniAssembly.quests.has('q.group-solo'),
    'a lone group member cannot pose as a real choice');
  assert.ok(miniAssembly.quests.has('q.ok-talk'),
    'talk objectives validate against placed NPCs, not just quest givers');

  // ── 4. 完整世界装配：34 项任务全部入库，无任务装配警告，遭遇与发布人齐备。
  const originalInfo = console.info;
  console.info = () => {};
  let loaded;
  try {
    loaded = await loaderModule.loadWorldData();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(loaded.ok, true, 'the full base world loads');
  const quests = loaded.world.assembly.quests;
  assert.equal(quests.size, 34, 'every quest survives assembly');
  assert.deepEqual(
    loaded.world.optionalWarnings.filter((diagnostic) => diagnostic.origin === 'quest-assembly'),
    [],
    'no quest was disabled during assembly',
  );
  const assembledEncounters = loaded.world.assembly.encounters;
  assert.equal(assembledEncounters.length, 4, 'the world places the legacy plus three new encounters');
  for (const encounterId of NEW_ENCOUNTER_IDS) {
    assert.ok(assembledEncounters.some((encounter) => encounter.record.id === encounterId),
      `encounter "${encounterId}" survives assembly`);
  }
  const giverIds = rawNpcs.npcs.filter((npc) => npc.questGiver === true).map((npc) => npc.id);
  assert.equal(giverIds.length, 12, 'twelve NPCs publish tasks');
  for (const quest of quests.values()) {
    assert.ok(giverIds.includes(quest.giverNpcId), `quest "${quest.id}" has a declared quest giver`);
  }
  for (const giverId of giverIds) {
    assert.ok([...quests.values()].some((quest) => quest.giverNpcId === giverId),
      `giver "${giverId}" actually publishes at least one quest`);
  }

  // ── 5. 地图槽位：三个新遭遇格避开全部固定互动格与人物格，且从出生点可达。
  const maps = new Map();
  for (const resource of rawManifest.resources) {
    if (resource.schema !== 'grid-map') continue;
    const parsed = gridMapEngine.parseGridMap(await readJson('data/base/' + resource.path));
    assert.equal(parsed.ok, true, `map ${resource.id} should parse`);
    maps.set(resource.id, parsed.map);
  }
  const fixedCells = new Map([...maps.keys()].map((id) => [id, new Set()]));
  const markFixed = (mapResourceId, col, row) => {
    const cells = fixedCells.get(mapResourceId);
    assert.ok(cells !== undefined, `fixed cell references a registered map (${mapResourceId})`);
    cells.add(`${col},${row}`);
  };
  for (const arena of rawArenas.arenas) markFixed(arena.mapResourceId, arena.position.col, arena.position.row);
  for (const station of rawForges.stations) markFixed(station.mapResourceId, station.position.col, station.position.row);
  for (const station of rawAlchemy.stations) markFixed(station.mapResourceId, station.position.col, station.position.row);
  for (const war of rawWars.wars) markFixed(war.mapResourceId, war.position.col, war.position.row);
  markFixed(rawEndings.gate.mapResourceId, rawEndings.gate.position.col, rawEndings.gate.position.row);
  for (const transition of rawWorldMap.transitions) {
    for (const endpoint of [transition.from, transition.to]) markFixed(endpoint.mapResourceId, endpoint.col, endpoint.row);
  }
  for (const event of rawWorldMap.events) markFixed(event.mapResourceId, event.col, event.row);
  const npcCellsByMap = new Map();
  for (const npc of rawNpcs.npcs) {
    const cells = npcCellsByMap.get(npc.mapResourceId) ?? new Set();
    for (const position of [npc.position, ...(npc.schedule ?? []).map((entry) => entry.position)]) {
      cells.add(`${position.col},${position.row}`);
    }
    npcCellsByMap.set(npc.mapResourceId, cells);
  }
  for (const encounterId of NEW_ENCOUNTER_IDS) {
    const record = rawEncounters.encounters.find((entry) => entry.id === encounterId);
    const map = maps.get(record.mapResourceId);
    const { col, row } = record.position;
    assert.ok(map.inBounds(col, row) && !map.isSolid(col, row), `${encounterId} sits on a walkable tile`);
    assert.notDeepEqual({ col, row }, map.data.playerStart, `${encounterId} never covers the player spawn`);
    assert.ok(!fixedCells.get(record.mapResourceId).has(`${col},${row}`),
      `${encounterId} keeps every non-encounter fixed interaction tile free`);
    for (const other of rawEncounters.encounters) {
      if (other.id === encounterId) continue;
      assert.ok(other.mapResourceId !== record.mapResourceId ||
        other.position.col !== col || other.position.row !== row,
        `${encounterId} never overlaps the trigger cell of "${other.id}"`);
    }
    assert.ok(!npcCellsByMap.get(record.mapResourceId)?.has(`${col},${row}`),
      `${encounterId} never covers an NPC tile (base or scheduled)`);
    const reachable = new Set([`${map.data.playerStart.col},${map.data.playerStart.row}`]);
    const queue = [[map.data.playerStart.col, map.data.playerStart.row]];
    for (let index = 0; index < queue.length; index += 1) {
      const [currentCol, currentRow] = queue[index];
      for (const [nextCol, nextRow] of [
        [currentCol + 1, currentRow], [currentCol - 1, currentRow],
        [currentCol, currentRow + 1], [currentCol, currentRow - 1],
      ]) {
        const key = `${nextCol},${nextRow}`;
        if (reachable.has(key) || !map.inBounds(nextCol, nextRow) || map.isSolid(nextCol, nextRow)) continue;
        reachable.add(key);
        queue.push([nextCol, nextRow]);
      }
    }
    assert.ok(reachable.has(`${col},${row}`), `${encounterId} is reachable from the spawn`);
  }

  // ── 6. 任务链推进与谈话信号：接取不自动完成谈话，只有实际 npc-talk 推进目标。
  const freshJournal = () => questEngine.createQuestJournal(quests);
  {
    const journal = freshJournal();
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    const accepted = questEngine.acceptQuest(quests, journal, 'quest.r31-peddler-errand');
    assert.equal(accepted.ok, true, 'the errand quest is offered and acceptable');
    assert.equal(journal.states.get('quest.r31-peddler-errand').objectiveCounts.get('objective.r31-peddler-message'), 0,
      'accepting the quest does not auto-complete its talk objective');
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.ma-shangyi' });
    assert.equal(journal.states.get('quest.r31-peddler-errand').objectiveCounts.get('objective.r31-peddler-message'), 0,
      'talking to the wrong NPC never advances the objective');
    const done = questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    assert.equal(journal.states.get('quest.r31-peddler-errand').status, 'completed');
    assert.equal(done.completed.length, 1);
    assert.deepEqual(
      { experience: done.completed[0].experience, currency: done.completed[0].currency },
      { experience: 12, currency: 20 },
      'the quest pays its data-driven reward exactly once',
    );
    const again = questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    assert.equal(again.completed.length, 0, 'a completed quest never pays twice');
  }

  // ── 7. 物品目标：接取快照初始化 + item-count 推进 + 单次奖励。
  {
    const journal = freshJournal();
    questEngine.acceptQuest(quests, journal, 'quest.r31-teastall-herbal-water', new Map([['item.hanzhu-cao', 2]]));
    const state = journal.states.get('quest.r31-teastall-herbal-water');
    assert.equal(state.objectiveCounts.get('objective.r31-teastall-herbs'), 2,
      'acceptance snapshots the current item quantity');
    const done = questEngine.applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.hanzhu-cao', quantity: 5 });
    assert.equal(journal.states.get('quest.r31-teastall-herbal-water').status, 'completed');
    assert.equal(state.objectiveCounts.get('objective.r31-teastall-herbs'), 4, 'counts clamp to the declared requirement');
    assert.equal(done.completed.length, 1);
    const again = questEngine.applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.hanzhu-cao', quantity: 5 });
    assert.equal(again.completed.length, 0, 'collect rewards are one-time as well');
  }

  // ── 8. 战斗目标与失败原子性：败北失败任务并锁死其后续，胜绩无法复活已失败差事。
  const completeChainToBranch = (journal) => {
    let result = questEngine.acceptQuest(quests, journal, 'quest.round-07-medicine-run', new Map([['item.huichun-gao', 3]]));
    assert.equal(result.ok, true, 'medicine-run accepts with a full snapshot');
    result = questEngine.acceptQuest(quests, journal, 'quest.r31-herbal-inquiry');
    assert.equal(result.ok, true, 'herbal-inquiry unlocks after medicine-run');
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.rong-su-qing' });
    assert.equal(journal.states.get('quest.r31-herbal-inquiry').status, 'completed', 'the talk objective completes the inquiry');
    result = questEngine.acceptQuest(quests, journal, 'quest.r31-herbal-stocktaking', new Map([['item.cangya-gen', 3]]));
    assert.equal(result.ok, true);
    assert.equal(journal.states.get('quest.r31-herbal-stocktaking').status, 'completed', 'a full snapshot completes the stocktaking on acceptance');
    assert.equal(journal.states.get('quest.r31-mist-shore-watch').status, 'offered', 'the night watch unlocks');
    return result;
  };
  {
    const journal = freshJournal();
    completeChainToBranch(journal);
    questEngine.acceptQuest(quests, journal, 'quest.r31-mist-shore-watch');
    const defeated = questEngine.applyQuestSignal(quests, journal, {
      type: 'encounter-defeat', encounterId: 'encounter.mist-shore-prowler',
    });
    assert.deepEqual(defeated.failedQuestIds, ['quest.r31-mist-shore-watch'],
      'losing the prowler fight fails exactly the quest that declared it');
    assert.equal(journal.states.get('quest.r31-mist-shore-watch').status, 'failed');
    assert.equal(journal.states.get('quest.r31-caravan-provisioning').status, 'locked',
      'a failed prerequisite permanently locks the chain behind it');
    const lateVictory = questEngine.applyQuestSignal(quests, journal, {
      type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler',
    });
    assert.equal(journal.states.get('quest.r31-mist-shore-watch').status, 'failed', 'a victory never revives a failed quest');
    assert.equal(lateVictory.completed.length, 0);
  }

  // ── 9. 互斥分支：原子失败、确定性报告、幂等拒绝与各自后续解锁。
  {
    const journal = freshJournal();
    completeChainToBranch(journal);
    questEngine.acceptQuest(quests, journal, 'quest.r31-mist-shore-watch');
    questEngine.applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler' });
    const provisioning = questEngine.acceptQuest(quests, journal, 'quest.r31-caravan-provisioning', new Map([['item.wuji-dan', 1]]));
    assert.equal(provisioning.ok, true);
    assert.deepEqual(provisioning.update.failedQuestIds, [], 'the provisioning quest belongs to no exclusive group');
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    assert.equal(journal.states.get('quest.r31-caravan-provisioning').status, 'completed');
    assert.equal(journal.states.get('quest.r31-guard-the-caravan').status, 'offered', 'branch A is offered');
    assert.equal(journal.states.get('quest.r31-mend-the-pier').status, 'offered', 'branch B is offered');
    const chose = questEngine.acceptQuest(quests, journal, 'quest.r31-guard-the-caravan');
    assert.equal(chose.ok, true);
    assert.deepEqual(chose.update.failedQuestIds, ['quest.r31-mend-the-pier'],
      'accepting branch A deterministically reports branch B as failed (declaration order)');
    assert.equal(journal.states.get('quest.r31-mend-the-pier').status, 'failed');
    assert.equal(journal.states.get('quest.r31-guard-the-caravan').status, 'active');
    assert.equal(questEngine.acceptQuest(quests, journal, 'quest.r31-guard-the-caravan').ok, false,
      're-accepting the same branch is refused (idempotent)');
    assert.equal(questEngine.acceptQuest(quests, journal, 'quest.r31-mend-the-pier').ok, false,
      'accepting the failed sibling is refused');
    assert.equal(journal.states.get('quest.r31-caravan-gratitude').status, 'locked', 'follow-up A stays locked until branch A completes');
    const fought = questEngine.applyQuestSignal(quests, journal, {
      type: 'encounter-victory', encounterId: 'encounter.ferry-reed-ambush',
    });
    assert.equal(fought.failedQuestIds.length, 0);
    assert.equal(journal.states.get('quest.r31-guard-the-caravan').status, 'completed');
    assert.equal(journal.states.get('quest.r31-caravan-gratitude').status, 'offered', 'follow-up A unlocks only through branch A');
    assert.equal(journal.states.get('quest.r31-pier-toll-clearing').status, 'locked', 'follow-up B never unlocks through branch A');
  }
  {
    const journal = freshJournal();
    completeChainToBranch(journal);
    questEngine.acceptQuest(quests, journal, 'quest.r31-mist-shore-watch');
    questEngine.applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler' });
    questEngine.acceptQuest(quests, journal, 'quest.r31-caravan-provisioning', new Map([['item.wuji-dan', 1]]));
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    const chose = questEngine.acceptQuest(quests, journal, 'quest.r31-mend-the-pier');
    assert.equal(chose.ok, true);
    assert.deepEqual(chose.update.failedQuestIds, ['quest.r31-guard-the-caravan'],
      'accepting branch B fails branch A symmetrically');
    questEngine.applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.iron-sand', quantity: 3 });
    questEngine.applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.tough-leather', quantity: 2 });
    assert.equal(journal.states.get('quest.r31-mend-the-pier').status, 'completed', 'branch B completes through its two collect goals');
    assert.equal(journal.states.get('quest.r31-pier-toll-clearing').status, 'offered', 'follow-up B unlocks only through branch B');
    assert.equal(journal.states.get('quest.r31-caravan-gratitude').status, 'locked');
    questEngine.acceptQuest(quests, journal, 'quest.r31-pier-toll-clearing');
    const lost = questEngine.applyQuestSignal(quests, journal, {
      type: 'encounter-defeat', encounterId: 'encounter.pier-toll-robber',
    });
    assert.deepEqual(lost.failedQuestIds, ['quest.r31-pier-toll-clearing'], 'losing the toll fight fails exactly that quest');
    assert.equal(journal.states.get('quest.r31-pier-toll-clearing').status, 'failed');
  }

  // ── 10. E 键告示板不发谈话信号：npc-talk 只存在于真实对话入口 openDialogueWith。
  {
    const sceneSource = await readFile('src/game/grid-scene.ts', 'utf8');
    const firstSignal = sceneSource.indexOf("type: 'npc-talk'");
    assert.ok(firstSignal > 0, 'grid-scene wires the npc-talk signal');
    assert.equal(sceneSource.indexOf("type: 'npc-talk'"), sceneSource.lastIndexOf("type: 'npc-talk'"),
      'the npc-talk signal is emitted from exactly one place');
    const dialogueEntry = sceneSource.indexOf('private openDialogueWith');
    assert.ok(dialogueEntry > 0 && firstSignal > dialogueEntry,
      'the signal lives inside openDialogueWith, the real conversation entry (F path)');
    const boardOpen = sceneSource.indexOf('questPanel.open');
    assert.ok(boardOpen > 0 && boardOpen < dialogueEntry,
      'the E-key quest board opens through a different call site that never talks');
  }

  // ── 11. v1 存档兼容：互斥失败态与谈话计数按既有快照往返；R31 之前的旧档照常恢复。
  {
    const parsedProfiles = progressionEngine.parseCharacterProfileSet(
      await readJson('data/base/characters/round-04-profiles.json'),
    );
    const profile = parsedProfiles.set.profiles[0];
    const journal = freshJournal();
    completeChainToBranch(journal);
    questEngine.acceptQuest(quests, journal, 'quest.r31-mist-shore-watch');
    questEngine.applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler' });
    questEngine.acceptQuest(quests, journal, 'quest.r31-caravan-provisioning', new Map([['item.wuji-dan', 1]]));
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    questEngine.acceptQuest(quests, journal, 'quest.r31-guard-the-caravan');
    questEngine.applyQuestSignal(quests, journal, { type: 'encounter-victory', encounterId: 'encounter.ferry-reed-ambush' });
    questEngine.acceptQuest(quests, journal, 'quest.r31-caravan-gratitude');
    questEngine.applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.shi-bei' });

    const snapshot = saveEngine.captureSaveSnapshot({
      displayName: '岔路口',
      mapResourceId: 'map.round-10-mist-ferry',
      playerCol: 7,
      playerRow: 7,
      character: progressionEngine.createCharacterState(profile),
      inventory: itemEngine.createInventoryState(profile, []),
      shopStocks: new Map(),
      journal,
      social: socialEngine.createSocialState(),
      completedEncounters: new Set(['encounter.mist-shore-prowler', 'encounter.ferry-reed-ambush']),
      completedRegionalEvents: new Set(),
      knownKnowledgeNodeIds: new Set(),
      elapsedGameMinutes: 30,
      worldSeed: 20260927,
      now: () => new Date('2026-09-27T12:00:00Z'),
    });
    assert.equal(snapshot.protocolVersion, saveEngine.SAVE_PROTOCOL_VERSION, 'the snapshot stays on the v1 protocol');
    const parsed = saveEngine.parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(parsed.ok, true, `the round-31 state round-trips through a v1 snapshot (${parsed.ok ? '' : parsed.message})`);
    const restored = saveEngine.restoreRunState({
      profile,
      items: loaded.world.assembly.items,
      quests,
      shops: loaded.world.assembly.shops,
      snapshot: parsed.snapshot,
    });
    assert.equal(restored.journal.states.get('quest.r31-mend-the-pier').status, 'failed', 'the closed branch stays failed after reload');
    assert.equal(restored.journal.states.get('quest.r31-guard-the-caravan').status, 'completed');
    assert.equal(restored.journal.states.get('quest.r31-caravan-gratitude').status, 'active');
    assert.equal(
      restored.journal.states.get('quest.r31-caravan-gratitude').objectiveCounts.get('objective.r31-gratitude-escort'), 1,
      'talk objective progress restores by objective id',
    );
    assert.equal(restored.journal.states.get('quest.r31-pier-toll-clearing').status, 'locked', 'the other branch follow-up stays locked after reload');

    // A pre-Round-31 v1 snapshot only knew the two legacy quests.
    const legacySnapshot = JSON.parse(JSON.stringify(snapshot));
    legacySnapshot.quests = {
      states: legacySnapshot.quests.states.filter((state) => LEGACY_QUEST_IDS.includes(state.questId)),
      trackedQuestId: null,
    };
    const parsedLegacy = saveEngine.parseSaveSnapshot(legacySnapshot);
    assert.equal(parsedLegacy.ok, true, 'a pre-Round-31 v1 snapshot still parses');
    const restoredLegacy = saveEngine.restoreRunState({
      profile,
      items: loaded.world.assembly.items,
      quests,
      shops: loaded.world.assembly.shops,
      snapshot: parsedLegacy.snapshot,
    });
    assert.equal(restoredLegacy.journal.states.get('quest.round-07-medicine-run').status, 'completed',
      'legacy progress restores untouched');
    assert.equal(restoredLegacy.journal.states.get('quest.r31-teastall-herbal-water').status, 'offered',
      'new quests initialize from current data without any migration');
    assert.equal(restoredLegacy.journal.states.get('quest.r31-caravan-gratitude').status, 'locked');
  }

  console.info('[round-31] 任务链烟测通过：34 项任务（2 项原始任务、R31 新增恰 18、R42/R43 各新增 5、R44/R56 各新增 2）数量与全局 id 唯一、四型目标与互斥组结构解析、坏引用逐条隔离与互斥组整组校验（坏成员/前置不一/单成员均不留假单选）、完整世界装配零任务警告、三新遭遇槽位避让全部固定格且可达、谈话信号只认真实对话且接取不自动完成、物品接取快照与单次奖励、败北失败原子锁链、互斥分支确定性失败报告/幂等拒绝/双向各自后续、npc-talk 唯一入口源码断言、v1 快照往返与 R31 前旧档免迁移恢复。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
