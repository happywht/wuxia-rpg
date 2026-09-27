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
  const pathname = new URL(url, 'http://round-30.local').pathname;
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

const NEW_NPC_IDS = ['char.bai-luzhou', 'char.liu-tinglan', 'char.zhu-jiuxian'];
const NEW_FACTION_IDS = ['faction.hanshan-shuyuan', 'faction.panzhou-daochang'];
const NEW_DIALOGUE_IDS = ['dlg.bai-luzhou-ferry-master', 'dlg.liu-tinglan-mentor', 'dlg.zhu-jiuxian-mentor'];
const LEGACY_NPC_IDS = [
  'char.shen-mohan', 'char.lu-zhenniang', 'char.gu-yechen', 'char.jiang-baiwei',
  'char.ma-shangyi', 'char.ye-tingzhou', 'char.shi-bei', 'char.wen-suxin', 'char.rong-su-qing',
];
const LEGACY_FACTION_IDS = ['faction.tingyu-jiange', 'faction.tiezhang-pai', 'faction.yunyin-shanzhuang'];

try {
  const [placementEngine, scheduleEngine, progressionEngine, factionEngine, dialogueGraphEngine, dialogueRuntimeEngine, graphEngine, gridMapEngine, socialEngine, questEngine, itemEngine, loaderModule] = await Promise.all([
    server.ssrLoadModule('/src/engine/npc-placement.ts'),
    server.ssrLoadModule('/src/engine/npc-schedule.ts'),
    server.ssrLoadModule('/src/engine/character-progression.ts'),
    server.ssrLoadModule('/src/engine/faction-system.ts'),
    server.ssrLoadModule('/src/engine/dialogue-graph.ts'),
    server.ssrLoadModule('/src/engine/dialogue-runtime.ts'),
    server.ssrLoadModule('/src/engine/knowledge-graph.ts'),
    server.ssrLoadModule('/src/engine/grid-map.ts'),
    server.ssrLoadModule('/src/engine/social-state.ts'),
    server.ssrLoadModule('/src/engine/quest-system.ts'),
    server.ssrLoadModule('/src/engine/item-system.ts'),
    server.ssrLoadModule('/src/game/world-loader.ts'),
  ]);
  const [rawNpcs, rawFactions, rawDialogues03, rawDialogues30, rawManifest, rawNodes, rawEdges, rawProfiles, rawEncounters, rawArenas, rawForges, rawAlchemy, rawWars, rawEndings, rawWorldMap, rawCalendar] = await Promise.all([
    readJson('data/base/characters/round-03-npcs.json'),
    readJson('data/base/factions/round-04-factions.json'),
    readJson('data/base/dialogues/round-03-conversations.json'),
    readJson('data/base/dialogues/round-30-conversations.json'),
    readJson('data/base/manifest.json'),
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/characters/round-04-profiles.json'),
    readJson('data/base/battles/round-05-encounters.json'),
    readJson('data/base/arenas/round-20-arenas.json'),
    readJson('data/base/forges/round-24-equipment-forges.json'),
    readJson('data/base/alchemy/round-25-alchemy.json'),
    readJson('data/base/faction_wars/round-21-wars.json'),
    readJson('data/base/endings/round-27-endings.json'),
    readJson('data/base/world/world-map.json'),
    readJson('data/base/worldview/calendar.json'),
  ]);

  // ── 1. 数量下限：基础世界至少 12 名 NPC、5 个门派；本轮新增恰为 3 名 NPC 与 2 个门派。
  assert.ok(rawNpcs.npcs.length >= 12, 'the base cast reaches at least 12 NPCs');
  assert.ok(rawFactions.factions.length >= 5, 'the base faction set reaches at least 5 factions');
  assert.deepEqual(
    rawNpcs.npcs.map((npc) => npc.id).filter((id) => !LEGACY_NPC_IDS.includes(id)).sort(),
    [...NEW_NPC_IDS].sort(),
    'Round 30 adds exactly the three new NPCs',
  );
  assert.deepEqual(
    rawFactions.factions.map((faction) => faction.id).filter((id) => !LEGACY_FACTION_IDS.includes(id)).sort(),
    [...NEW_FACTION_IDS].sort(),
    'Round 30 adds exactly the two new factions',
  );

  // ── 2. 全局 ID 唯一：NPC、门派、对话（跨两个文件合并）、知识节点与关系边。
  const assertUnique = (ids, label) => {
    const seen = new Set();
    for (const id of ids) {
      assert.ok(!seen.has(id), `${label} id "${id}" must be unique`);
      seen.add(id);
    }
  };
  assertUnique(rawNpcs.npcs.map((npc) => npc.id), 'NPC');
  assertUnique(rawFactions.factions.map((faction) => faction.id), 'faction');
  const mergedConversations = [...rawDialogues03.conversations, ...rawDialogues30.conversations];
  assertUnique(mergedConversations.map((conversation) => conversation.id), 'conversation');
  for (const dialogue of rawDialogues30.conversations) {
    assert.ok(!rawDialogues03.conversations.some((old) => old.id === dialogue.id),
      `new conversation "${dialogue.id}" must not collide with the round-03 set`);
  }
  assertUnique(rawNodes.nodes.map((node) => node.id), 'knowledge node');
  assertUnique(rawEdges.edges.map((edge) => edge.id), 'knowledge edge');

  // ── 3. 地图位置可行：两图的 NPC 放置与日程编译零警告；新 NPC 不占任何固定互动格。
  const parsedNpcSet = placementEngine.parseNpcSet(rawNpcs);
  assert.equal(parsedNpcSet.ok, true, 'the extended NPC set should parse');
  const maps = new Map();
  for (const resource of rawManifest.resources) {
    if (resource.schema !== 'grid-map') continue;
    const parsed = gridMapEngine.parseGridMap(await readJson('data/base/' + resource.path));
    assert.equal(parsed.ok, true, `map ${resource.id} should parse`);
    maps.set(resource.id, parsed.map);
  }
  const dialogueIds = new Set(mergedConversations.map((conversation) => conversation.id));
  const knownResourceIds = new Set(rawManifest.resources.map((resource) => resource.id));
  let placedTotal = 0;
  for (const mapId of maps.keys()) {
    const placement = placementEngine.assembleNpcPlacements({
      npcSet: parsedNpcSet.set,
      knownResourceIds,
      maps,
      currentMapResourceId: mapId,
      dialogueIds,
    });
    assert.deepEqual(placement.warnings, [], `every NPC on ${mapId} places without warnings`);
    placedTotal += placement.npcs.length;
  }
  assert.equal(placedTotal, rawNpcs.npcs.length, 'all 12 NPCs place across the two maps');
  // 固定互动格：遭遇、擂台、锻造工位、药炉、门派战入口、终章入口、关口端点与区域事件。
  const fixedCells = new Map([...maps.keys()].map((id) => [id, new Set()]));
  const markFixed = (mapResourceId, col, row) => {
    const cells = fixedCells.get(mapResourceId);
    assert.ok(cells !== undefined, `fixed cell references a registered map (${mapResourceId})`);
    cells.add(`${col},${row}`);
  };
  for (const encounter of rawEncounters.encounters) markFixed(encounter.mapResourceId, encounter.position.col, encounter.position.row);
  for (const arena of rawArenas.arenas) markFixed(arena.mapResourceId, arena.position.col, arena.position.row);
  for (const station of rawForges.stations) markFixed(station.mapResourceId, station.position.col, station.position.row);
  for (const station of rawAlchemy.stations) markFixed(station.mapResourceId, station.position.col, station.position.row);
  for (const war of rawWars.wars) markFixed(war.mapResourceId, war.position.col, war.position.row);
  markFixed(rawEndings.gate.mapResourceId, rawEndings.gate.position.col, rawEndings.gate.position.row);
  for (const transition of rawWorldMap.transitions) {
    for (const endpoint of [transition.from, transition.to]) markFixed(endpoint.mapResourceId, endpoint.col, endpoint.row);
  }
  for (const event of rawWorldMap.events) markFixed(event.mapResourceId, event.col, event.row);
  for (const npc of rawNpcs.npcs) {
    const map = maps.get(npc.mapResourceId);
    const positions = [npc.position, ...(npc.schedule ?? []).map((entry) => entry.position)];
    for (const position of positions) {
      assert.ok(map.inBounds(position.col, position.row), `${npc.id} cell stays inside the map`);
      assert.ok(!map.isSolid(position.col, position.row), `${npc.id} cell is walkable`);
      assert.notDeepEqual(position, map.data.playerStart, `${npc.id} never covers the player spawn`);
      assert.ok(!fixedCells.get(npc.mapResourceId).has(`${position.col},${position.row}`),
        `${npc.id} cell (${position.col},${position.row}) keeps every fixed interaction tile reachable`);
    }
  }
  const allPlaced = [...maps.keys()].flatMap((mapId) => placementEngine.assembleNpcPlacements({
    npcSet: parsedNpcSet.set, knownResourceIds, maps, currentMapResourceId: mapId, dialogueIds,
  }).npcs);
  const scheduleCompilation = scheduleEngine.compileNpcSchedules({
    npcs: allPlaced,
    periods: rawCalendar.periods,
    maps,
    blockedCellsByMap: fixedCells,
  });
  assert.deepEqual(scheduleCompilation.warnings, [], 'every NPC schedule compiles without warnings');

  // Check actual interaction reachability, not just that NPCs avoid fixed
  // cells. NPCs occupy their tiles; the player must still reach an adjacent
  // open tile for all new people and all region-event cells in every period.
  const cellKey = (col, row) => `${col},${row}`;
  for (const [periodId, periodNpcs] of scheduleCompilation.placementsByPeriod) {
    for (const map of maps.values()) {
      const occupied = new Set(periodNpcs
        .filter((npc) => npc.record.mapResourceId === map.data.id)
        .map((npc) => cellKey(npc.col, npc.row)));
      const start = map.data.playerStart;
      assert.ok(!occupied.has(cellKey(start.col, start.row)),
        `NPCs keep the player spawn free on ${map.data.id} during ${periodId}`);
      const reachable = new Set([cellKey(start.col, start.row)]);
      const queue = [[start.col, start.row]];
      for (let index = 0; index < queue.length; index += 1) {
        const [col, row] = queue[index];
        for (const [nextCol, nextRow] of [
          [col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1],
        ]) {
          const key = cellKey(nextCol, nextRow);
          if (reachable.has(key) || occupied.has(key) ||
              !map.inBounds(nextCol, nextRow) || map.isSolid(nextCol, nextRow)) continue;
          reachable.add(key);
          queue.push([nextCol, nextRow]);
        }
      }
      for (const npcId of NEW_NPC_IDS) {
        const npc = periodNpcs.find((placed) => placed.record.id === npcId);
        if (npc === undefined || npc.record.mapResourceId !== map.data.id) continue;
        const canApproach = [
          [npc.col + 1, npc.row], [npc.col - 1, npc.row],
          [npc.col, npc.row + 1], [npc.col, npc.row - 1],
        ].some(([col, row]) => reachable.has(cellKey(col, row)));
        assert.ok(canApproach, `player can approach ${npcId} on ${map.data.id} during ${periodId}`);
      }
      for (const event of rawWorldMap.events.filter((entry) => entry.mapResourceId === map.data.id)) {
        assert.ok(reachable.has(cellKey(event.col, event.row)),
          `event ${event.id} remains reachable on ${map.data.id} during ${periodId}`);
      }
    }
  }

  // ── 4. 导师引用：两个新门派的导师都在放置成功的 NPC 之列，且导师对话可解析。
  const placedNpcIds = new Set(allPlaced.map((npc) => npc.record.id));
  for (const factionId of NEW_FACTION_IDS) {
    const faction = rawFactions.factions.find((entry) => entry.id === factionId);
    assert.ok(faction.mentorNpcIds.length > 0, `${factionId} declares a mentor`);
    for (const mentorId of faction.mentorNpcIds) {
      assert.ok(placedNpcIds.has(mentorId), `${factionId} mentor ${mentorId} is a placed NPC`);
      const mentor = rawNpcs.npcs.find((npc) => npc.id === mentorId);
      assert.ok(dialogueIds.has(mentor.dialogueId), `mentor ${mentorId} keeps a resolvable dialogue`);
    }
  }
  for (const npcId of NEW_NPC_IDS) {
    const npc = rawNpcs.npcs.find((entry) => entry.id === npcId);
    assert.ok(dialogueIds.has(npc.dialogueId), `new NPC ${npcId} references a resolvable dialogue`);
  }

  // ── 5. 门派规则装配 + 拜师/授艺/退门事务：用通用对话运行时真跑效果。
  const parsedFactions = progressionEngine.parseFactionSet(rawFactions);
  assert.equal(parsedFactions.ok, true, 'the extended faction set should parse');
  assert.deepEqual(parsedFactions.set.factions.map((faction) => faction.id).length, 5, 'five factions parse');
  const parsedProfiles = progressionEngine.parseCharacterProfileSet(rawProfiles);
  assert.equal(parsedProfiles.ok, true, 'the base profile set should parse');
  const profile = parsedProfiles.set.profiles[0];
  const originalInfo = console.info;
  console.info = () => {};
  let loaded;
  try {
    loaded = await loaderModule.loadWorldData();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(loaded.ok, true, 'the full base world loads with the new content');
  const buildContext = (overrides = {}) => {
    const social = socialEngine.createSocialState();
    const character = progressionEngine.createCharacterState(profile);
    const factionState = factionEngine.createFactionMembershipState();
    return {
      quests: loaded.world.assembly.quests,
      journal: questEngine.createQuestJournal(loaded.world.assembly.quests),
      items: loaded.world.assembly.items,
      inventory: itemEngine.createInventoryState(profile, []),
      social,
      speakerNpcId: 'char.liu-tinglan',
      knownKnowledgeNodeIds: new Set(),
      knowledgeNodes: loaded.world.knowledgeGraph.nodes,
      character,
      factions: loaded.world.assembly.progression.factions,
      martialArts: loaded.world.assembly.progression.martialArts,
      factionState,
      timeOfDayPeriodId: 'period.morning',
      ...overrides,
    };
  };

  // 寒山书院：善名 5 + 师徒关系 5 + 悟性 8（初始档案即有）→ 拜师事务成功。
  {
    const context = buildContext();
    context.social.morality = 5;
    context.social.relationships.set('char.liu-tinglan', 5);
    const join = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'joinFaction', factionId: 'faction.hanshan-shuyuan' }], context,
    );
    assert.equal(join.ok, true, `hanshan admission commits when thresholds are met (${join.ok ? '' : join.reason})`);
    assert.equal(context.factionState.membership?.factionId, 'faction.hanshan-shuyuan');
    // 重复拜入（任意门派在籍）被现有规则拒绝。
    const rejoin = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'joinFaction', factionId: 'faction.panzhou-daochang' }], context,
    );
    assert.equal(rejoin.ok, false, 'a member cannot join another faction through the same protocol');
    // 退门按书院声明的代价结算。
    const depart = dialogueRuntimeEngine.applyDialogueEffects([{ kind: 'leaveFaction' }], context);
    assert.equal(depart.ok, true, 'hanshan departure commits by its own rules');
    assert.equal(context.factionState.membership, null);
  }
  // 寒山书院：善名不足 5 → 拒绝且无任何状态变化。
  {
    const context = buildContext();
    context.social.morality = 4;
    context.social.relationships.set('char.liu-tinglan', 5);
    const refused = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'joinFaction', factionId: 'faction.hanshan-shuyuan' }], context,
    );
    assert.equal(refused.ok, false, 'hanshan refuses a morality of 4');
    assert.equal(context.factionState.membership, null, 'a refused join mutates nothing');
  }
  // 盘舷刀场：等级 2 + 体魄 9 + 身法 8 + 江湖声望 5 → 拜师成功；声望不足 → 拒绝。
  {
    const context = buildContext({ speakerNpcId: 'char.zhu-jiuxian' });
    context.character.level = 2;
    context.character.attributes.agility = 8;
    context.social.renown = 5;
    const join = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'joinFaction', factionId: 'faction.panzhou-daochang' }], context,
    );
    assert.equal(join.ok, true, `panzhou admission commits when thresholds are met (${join.ok ? '' : join.reason})`);
    // 授艺走已存在的通用武学「拦门刀法」（等级 3 / 体魄 10 / 身法 9）。
    context.character.level = 3;
    context.character.attributes.body = 10;
    context.character.attributes.agility = 9;
    const learn = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'learnMartialArt', martialArtId: 'skill.lanmen-daofa' }], context,
    );
    assert.equal(learn.ok, true, `the mentor teaches the existing lanmen blade art (${learn.ok ? '' : learn.reason})`);
    assert.ok(context.character.martialArtIds.includes('skill.lanmen-daofa'));
  }
  {
    const context = buildContext({ speakerNpcId: 'char.zhu-jiuxian' });
    context.character.level = 2;
    context.character.attributes.agility = 8;
    context.social.renown = 4;
    const refused = dialogueRuntimeEngine.applyDialogueEffects(
      [{ kind: 'joinFaction', factionId: 'faction.panzhou-daochang' }], context,
    );
    assert.equal(refused.ok, false, 'panzhou refuses renown 4');
    assert.equal(context.factionState.membership, null, 'a refused join mutates nothing');
  }

  // ── 6. 新对话可解析：结构、图语义与跨资源引用全部通过。
  const parsedDialogues30 = dialogueGraphEngine.parseDialogueSet(rawDialogues30);
  assert.equal(parsedDialogues30.ok, true, 'the round-30 dialogue set parses');
  assert.deepEqual(parsedDialogues30.warnings ?? [], [], 'no per-conversation warnings survive parsing');
  const dialogueIndex = dialogueGraphEngine.indexConversations({ conversations: mergedConversations });
  assert.deepEqual(dialogueIndex.duplicateIds, [], 'merged dialogue ids stay unique');
  for (const [id, conversation] of dialogueIndex.byId) {
    const problems = dialogueGraphEngine.validateConversation(conversation);
    assert.deepEqual(problems, [], `conversation "${id}" passes graph validation`);
  }
  assert.ok(loaded.world.assembly.dialogues.size >= mergedConversations.length,
    'the assembled world carries both dialogue files');

  // ── 7. 知识图谱：新节点/关系全部装配，端点有效，态度传播只落在人物边。
  const parsedNodes = graphEngine.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = graphEngine.parseKnowledgeEdgeSet(rawEdges);
  assert.equal(parsedNodes.ok && parsedEdges.ok, true, 'the extended graph parses');
  const graph = graphEngine.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  assert.deepEqual(graph.warnings, [], 'no duplicate or dangling graph rows');
  assert.equal(graph.nodes.size, rawNodes.nodes.length, 'every node assembles');
  assert.equal(graph.edges.length, rawEdges.edges.length, 'every edge assembles');
  const nodeKindById = new Map(rawNodes.nodes.map((node) => [node.id, node.kind]));
  assert.equal(nodeKindById.get('char.liu-tinglan'), 'character');
  assert.equal(nodeKindById.get('char.zhu-jiuxian'), 'character');
  assert.equal(nodeKindById.get('char.bai-luzhou'), 'character');
  assert.equal(nodeKindById.get('faction.hanshan-shuyuan'), 'faction');
  assert.equal(nodeKindById.get('faction.panzhou-daochang'), 'faction');
  assert.equal(nodeKindById.get('event.ferry-passage-registry'), 'event');
  const newEdges = rawEdges.edges.filter((edge) =>
    NEW_NPC_IDS.includes(edge.fromId) || NEW_NPC_IDS.includes(edge.toId) ||
    NEW_FACTION_IDS.includes(edge.fromId) || NEW_FACTION_IDS.includes(edge.toId) ||
    edge.fromId === 'event.ferry-passage-registry' || edge.toId === 'event.ferry-passage-registry');
  assert.ok(newEdges.length >= 10, 'the new cast and factions are wired into the graph');
  for (const edge of newEdges) {
    assert.ok(nodeKindById.has(edge.fromId) && nodeKindById.has(edge.toId),
      `edge "${edge.id}" endpoints exist`);
    if (edge.attitudeSpread !== undefined) {
      assert.equal(nodeKindById.get(edge.fromId), 'character', `edge "${edge.id}" spread source is a character`);
      assert.equal(nodeKindById.get(edge.toId), 'character', `edge "${edge.id}" spread target is a character`);
    }
  }

  // ── 8. 完整世界：12 名 NPC、5 个门派、3 段新对话全部进入装配，无逐条隔离警告。
  assert.equal(loaded.world.assembly.npcs.length, 12, 'the assembled world places 12 NPCs');
  assert.equal(loaded.world.assembly.progression.factions.size, 5, 'five factions assemble');
  for (const dialogueId of NEW_DIALOGUE_IDS) {
    assert.ok(loaded.world.assembly.dialogues.has(dialogueId), `dialogue "${dialogueId}" survives assembly`);
  }
  const isolationOrigins = new Set(['npc-assembly', 'dialogue-assembly', 'knowledge-assembly']);
  assert.deepEqual(
    loaded.world.optionalWarnings.filter((diagnostic) =>
      isolationOrigins.has(diagnostic.origin) || diagnostic.resource === 'dialogue.round-30-set'),
    [],
    'no NPC/dialogue/graph row was disabled during assembly',
  );

  // ── 9. 兼容保护：新门派不出现在任何结局条件或门派战双方，既有专属内容不误触发。
  const endingFactionRefs = rawEndings.endings.flatMap((ending) => ending.conditions
    .filter((condition) => condition.kind === 'factionMembership' || condition.kind === 'factionRenown')
    .map((condition) => condition.factionId)
    .filter((factionId) => factionId !== undefined));
  for (const factionId of endingFactionRefs) {
    assert.ok(LEGACY_FACTION_IDS.includes(factionId),
      `ending faction conditions stay with the three base factions (${factionId})`);
  }
  assert.equal(loaded.world.assembly.endings?.endings.length, rawEndings.endings.length,
    'all five endings survive the extended world');
  for (const war of rawWars.wars) {
    for (const factionId of [war.firstFactionId, war.secondFactionId]) {
      assert.ok(LEGACY_FACTION_IDS.includes(factionId),
        `faction war belligerents stay with the base factions (${factionId})`);
    }
  }

  console.info('[round-30] 人物与门派烟测通过：12 NPC/5 门派数量与新增恰数、全局 ID 唯一、两图放置与日程零警告、固定互动格全避让、导师引用闭合、拜师/授艺/退门事务按资料结算、拒绝路径零变更、对话合并解析、图谱端点与态度边校验、完整世界装配及结局/门派战兼容保护。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
