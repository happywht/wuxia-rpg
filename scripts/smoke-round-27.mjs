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
  const pathname = new URL(url, 'http://round-27.local').pathname;
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

try {
  const [endingEngine, graphEngine, mapEngine, socialEngine, questEngine, loaderModule] = await Promise.all([
    server.ssrLoadModule('/src/engine/ending-system.ts'),
    server.ssrLoadModule('/src/engine/knowledge-graph.ts'),
    server.ssrLoadModule('/src/engine/grid-map.ts'),
    server.ssrLoadModule('/src/engine/social-state.ts'),
    server.ssrLoadModule('/src/engine/quest-system.ts'),
    server.ssrLoadModule('/src/game/world-loader.ts'),
  ]);
  const [rawEndings, rawNodes, rawEdges, rawMap, rawQuests] = await Promise.all([
    readJson('data/base/endings/round-27-endings.json'),
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/maps/round-10-mist-ferry.json'),
    readJson('data/base/quests/round-07-quests.json'),
  ]);

  const parsedEndings = endingEngine.parseEndingSet(rawEndings);
  const parsedNodes = graphEngine.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = graphEngine.parseKnowledgeEdgeSet(rawEdges);
  const parsedMap = mapEngine.parseGridMap(rawMap);
  const parsedQuests = questEngine.parseQuestSet(rawQuests);
  for (const [name, result] of Object.entries({ parsedEndings, parsedNodes, parsedEdges, parsedMap, parsedQuests })) {
    assert.equal(result.ok, true, name + ' should parse');
  }
  if (!parsedEndings.ok || !parsedNodes.ok || !parsedEdges.ok || !parsedMap.ok || !parsedQuests.ok) {
    throw new Error('Round 27 base data failed its runtime parser');
  }

  const graph = graphEngine.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  const gateCell = rawEndings.gate.position.col + ',' + rawEndings.gate.position.row;
  const assembly = endingEngine.assembleEndingSet({
    set: parsedEndings.set,
    maps: new Map([[parsedMap.map.data.id, parsedMap.map]]),
    blockedCells: new Map(),
    knowledgeNodes: graph.nodes,
    questIds: new Set(parsedQuests.set.quests.map((quest) => quest.id)),
    npcIds: new Set([...graph.nodes.values()].filter((node) => node.kind === 'character').map((node) => node.id)),
    factionIds: new Set([...graph.nodes.values()].filter((node) => node.kind === 'faction').map((node) => node.id)),
  });
  assert(assembly.endingSet, 'the ending gate should assemble');
  assert.equal(assembly.warnings.length, 0, 'all base ending references should resolve');
  assert.equal(assembly.endingSet.endings.length, 5, 'five authored endings should survive assembly');
  assert.deepEqual(
    assembly.endingSet.endings.map((ending) => ending.id),
    ['ending.river-lantern', 'ending.tingyu-oath', 'ending.tiezhang-foundation', 'ending.yunyin-healer', 'ending.open-water'],
    'eligible choices have a stable priority order',
  );
  assert(parsedMap.map.canEnter(rawEndings.gate.position.col, rawEndings.gate.position.row),
    'the mirror-stone cell should be walkable');
  assert.equal(endingEngine.selectAdjacentEndingGate(assembly.endingSet, 'map.round-10-mist-ferry', {
    col: rawEndings.gate.position.col - 1, row: rawEndings.gate.position.row,
  })?.gate.id, rawEndings.gate.id, 'orthogonal adjacency should find the gate');
  assert.equal(endingEngine.selectAdjacentEndingGate(assembly.endingSet, 'map.round-10-mist-ferry', {
    col: rawEndings.gate.position.col - 1, row: rawEndings.gate.position.row + 1,
  }), null, 'diagonal distance two should not find the gate');
  assert.equal(endingEngine.selectAdjacentEndingGate(assembly.endingSet, 'map.round-01-grid', {
    col: rawEndings.gate.position.col - 1, row: rawEndings.gate.position.row,
  }), null, 'the gate is scoped to its authored map');

  const makeContext = ({
    statuses = {},
    morality = 0,
    renown = 0,
    factionMembership = null,
    factionRenown = {},
    relationships = {},
    known = [],
  } = {}) => {
    const social = socialEngine.createSocialState();
    social.morality = morality;
    social.renown = renown;
    for (const [id, value] of Object.entries(factionRenown)) social.factionRenown.set(id, value);
    for (const [id, value] of Object.entries(relationships)) social.relationships.set(id, value);
    return {
      questStatuses: new Map(Object.entries(statuses)),
      social,
      factionMembership,
      knownKnowledgeNodeIds: new Set(known),
    };
  };
  const footprints = 'event.old-footprints';
  const medicine = 'quest.round-07-medicine-run';
  const alley = 'quest.round-07-clear-alley';
  const tingyu = 'faction.tingyu-jiange';
  const tiezhang = 'faction.tiezhang-pai';
  const yunyin = 'faction.yunyin-shanzhuang';

  const neutral = makeContext({ known: [footprints] });
  const neutralAvailable = endingEngine.evaluateEndings(assembly.endingSet, neutral)
    .filter((entry) => entry.available).map((entry) => entry.ending.id);
  assert.deepEqual(neutralAvailable, ['ending.open-water'],
    'the open-water ending is an accessible route after discovering the ferry clue');
  assert.equal(endingEngine.selectEnding(assembly.endingSet, 'ending.river-lantern', neutral).ok, false,
    'a locked ending cannot be selected');

  const river = makeContext({
    statuses: { [medicine]: 'completed' }, morality: 5, relationships: { 'char.lu-zhenniang': 10 },
    known: [footprints],
  });
  assert.equal(endingEngine.selectEnding(assembly.endingSet, 'ending.river-lantern', river).ok, true,
    'quest, morality, relation and discovery can unlock the river ending at inclusive thresholds');
  const nearRiver = makeContext({
    statuses: { [medicine]: 'completed' }, morality: 5, relationships: { 'char.lu-zhenniang': 9 },
    known: [footprints],
  });
  const riverLocked = endingEngine.evaluateEndings(assembly.endingSet, nearRiver)
    .find((entry) => entry.ending.id === 'ending.river-lantern');
  assert.equal(riverLocked?.available, false, 'a relationship point below the threshold remains locked');
  assert(riverLocked?.unmetHints.some((hint) => hint.includes('茶棚主人')),
    'locked results explain the missing data-authored condition');

  const factionCases = [
    ['ending.tingyu-oath', tingyu, 'char.ye-tingzhou', 'quest.round-07-clear-alley'],
    ['ending.tiezhang-foundation', tiezhang, 'char.shi-bei', 'quest.round-07-clear-alley'],
    ['ending.yunyin-healer', yunyin, 'char.wen-suxin', medicine],
  ];
  for (const [endingId, factionId, npcId, questId] of factionCases) {
    const context = makeContext({
      statuses: { [questId]: 'completed', ...(questId === medicine ? {} : { [medicine]: 'active' }) },
      morality: 5,
      renown: 5,
      factionMembership: { factionId, masterNpcId: npcId },
      factionRenown: { [factionId]: 10 },
      relationships: { [npcId]: endingId === 'ending.tingyu-oath' ? 5 : 0 },
      known: [footprints],
    });
    assert.equal(endingEngine.selectEnding(assembly.endingSet, endingId, context).ok, true,
      endingId + ' should use the matching quest, faction, renown and mentor relation');
  }

  const originalSocial = JSON.stringify({
    morality: river.social.morality,
    renown: river.social.renown,
    relationships: [...river.social.relationships],
    factionRenown: [...river.social.factionRenown],
  });
  endingEngine.evaluateEndings(assembly.endingSet, river);
  assert.equal(JSON.stringify({
    morality: river.social.morality,
    renown: river.social.renown,
    relationships: [...river.social.relationships],
    factionRenown: [...river.social.factionRenown],
  }), originalSocial, 'evaluation must never mutate the live journey');

  const brokenSet = structuredClone(parsedEndings.set);
  brokenSet.endings[0].conditions[0].questId = 'quest.deleted-by-mod';
  const brokenAssembly = endingEngine.assembleEndingSet({
    set: brokenSet,
    maps: new Map([[parsedMap.map.data.id, parsedMap.map]]),
    blockedCells: new Map(),
    knowledgeNodes: graph.nodes,
    questIds: new Set(parsedQuests.set.quests.map((quest) => quest.id)),
    npcIds: new Set([...graph.nodes.values()].filter((node) => node.kind === 'character').map((node) => node.id)),
    factionIds: new Set([...graph.nodes.values()].filter((node) => node.kind === 'faction').map((node) => node.id)),
  });
  assert.equal(brokenAssembly.endingSet?.endings.length, 4,
    'one dangling MOD condition should disable only its ending');
  assert.equal(brokenAssembly.warnings.length, 1, 'the isolated ending reference should be reported');
  const blockedAssembly = endingEngine.assembleEndingSet({
    set: parsedEndings.set,
    maps: new Map([[parsedMap.map.data.id, parsedMap.map]]),
    blockedCells: new Map([[parsedMap.map.data.id, new Set([gateCell])]]),
    knowledgeNodes: graph.nodes,
    questIds: new Set(parsedQuests.set.quests.map((quest) => quest.id)),
    npcIds: new Set(),
    factionIds: new Set(),
  });
  assert.equal(blockedAssembly.endingSet, null, 'occupied gate cells should be rejected');

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
  assert.equal(loaded.world.assembly.endings?.endings.length, 5,
    'the ending set should reach the playable world assembly');
  assert.equal(loaded.world.optionalWarnings.some((warning) => warning.resource === 'ending.round-27-set'), false,
    'base ending data and map references should produce no assembly warnings');
  for (const placements of loaded.world.assembly.npcsByPeriod.values()) {
    assert.equal(placements.some((npc) =>
      npc.record.mapResourceId === rawEndings.gate.mapResourceId &&
      npc.col === rawEndings.gate.position.col && npc.row === rawEndings.gate.position.row), false,
    'the fixed ending marker cell must remain clear in every NPC schedule');
  }

  console.log('通过：五结局条件评估/边界、任务/善恶/关系/门派/声望/见闻分支、锁定提示与不可变性、MOD 引用隔离、终章格装配/邻接及完整世界加载。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
