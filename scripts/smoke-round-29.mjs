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
  const pathname = new URL(url, 'http://round-29.local').pathname;
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
  const [graphEngine, combatEngine, loaderModule] = await Promise.all([
    server.ssrLoadModule('/src/engine/knowledge-graph.ts'),
    server.ssrLoadModule('/src/engine/turn-based-combat.ts'),
    server.ssrLoadModule('/src/game/world-loader.ts'),
  ]);
  const [rawNodes, rawEdges, rawNpcs, rawItems, rawArts, rawManifest, rawEncounters] = await Promise.all([
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/characters/round-03-npcs.json'),
    readJson('data/base/items/round-06-items.json'),
    readJson('data/base/skills/round-04-martial-arts.json'),
    readJson('data/base/manifest.json'),
    readJson('data/base/battles/round-05-encounters.json'),
  ]);

  const parsedNodes = graphEngine.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = graphEngine.parseKnowledgeEdgeSet(rawEdges);
  assert.equal(parsedNodes.ok, true, 'base graph nodes should parse');
  assert.equal(parsedEdges.ok, true, 'base graph edges should parse');
  const graph = graphEngine.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  assert.equal(graph.nodes.size, rawNodes.nodes.length, 'every base graph node should assemble');

  // Progress is a read-only projection with a stable row for every category.
  const initiallyKnown = graphEngine.createKnowledgeState(graph);
  const knownBeforeProjection = [...initiallyKnown].sort();
  const nodeIdsBeforeProjection = [...graph.nodes.keys()].sort();
  const progress = graphEngine.projectKnowledgeCollection(graph, initiallyKnown);
  assert.equal(progress.length, 8, 'all graph categories appear, including empty categories');
  assert.deepEqual(progress.map((entry) => entry.kind), [
    'character', 'place', 'faction', 'item', 'martialArt', 'event', 'quest', 'ending',
  ]);
  assert.equal(progress.reduce((total, entry) => total + entry.total, 0), graph.nodes.size,
    'category totals partition every graph node exactly once');
  assert.equal(progress.reduce((total, entry) => total + entry.discovered, 0), initiallyKnown.size,
    'category discoveries match the current known-id set');
  assert.equal(progress.find((entry) => entry.kind === 'event')?.discovered, 0,
    'base events remain secret until discovered');
  assert.equal(progress.find((entry) => entry.kind === 'ending')?.discovered, 0,
    'base endings remain secret until discovered');
  assert.deepEqual([...initiallyKnown].sort(), knownBeforeProjection, 'projection never mutates discoveries');
  assert.deepEqual([...graph.nodes.keys()].sort(), nodeIdsBeforeProjection, 'projection never mutates graph data');

  // Runtime observations unlock only exact ids of the expected kinds.
  const discovered = new Set();
  const observed = graphEngine.discoverObservedKnowledge(graph, discovered, {
    characterIds: ['char.gu-yechen', 'char.gu-yechen', 'item.huichun-gao', 'char.mod-ghost'],
    placeIds: ['map.round-10-mist-ferry', 'event.old-footprints'],
    itemIds: ['item.shengji-san-cu', 'item.shengji-san-cu', 'skill.tingyu-jianfa'],
    martialArtIds: ['skill.tingyu-jianfa', 'skill.ghost-style'],
  });
  assert.deepEqual(observed.map((node) => node.id), [
    'char.gu-yechen', 'map.round-10-mist-ferry', 'item.shengji-san-cu', 'skill.tingyu-jianfa',
  ], 'same-id character, place, item and martial-art facts reveal matching nodes only');
  assert.equal(graphEngine.discoverObservedKnowledge(graph, discovered, {
    characterIds: ['char.gu-yechen'], placeIds: ['map.round-10-mist-ferry'],
    itemIds: ['item.shengji-san-cu'], martialArtIds: ['skill.tingyu-jianfa'],
  }).length, 0, 'repeated observations are idempotent');

  // Authored base ids line up with the runtime sources used by the scene.
  const characterNodes = new Set([...graph.nodes.values()].filter((node) => node.kind === 'character').map((node) => node.id));
  const itemNodes = new Set([...graph.nodes.values()].filter((node) => node.kind === 'item').map((node) => node.id));
  const martialArtNodes = new Set([...graph.nodes.values()].filter((node) => node.kind === 'martialArt').map((node) => node.id));
  assert.ok(rawNpcs.npcs.some((npc) => characterNodes.has(npc.id)), 'NPC ids overlap character records');
  assert.ok(rawItems.items.some((item) => itemNodes.has(item.id)), 'inventory item ids overlap item records');
  assert.ok(rawArts.martialArts.some((art) => martialArtNodes.has(art.id)), 'learned art ids overlap martial-art records');
  const graphPlaceIds = new Set([...graph.nodes.values()].filter((node) => node.kind === 'place').map((node) => node.id));
  assert.ok(rawManifest.resources.some((resource) => graphPlaceIds.has(resource.id) && resource.schema === 'grid-map'),
    'map resource ids overlap place records');

  // Optional encounter-person links preserve old documents and resolve in the full world assembly.
  const parsedEncounters = combatEngine.parseBattleEncounterSet(rawEncounters);
  assert.equal(parsedEncounters.ok, true, 'base encounter data should parse');
  assert.equal(parsedEncounters.ok && parsedEncounters.set.encounters[0]?.knowledgeNodeId, 'char.alley-blade',
    'the base masked foe declares a graph character entry');
  assert.equal(combatEngine.parseBattleEncounterSet({
    encounters: [{ ...rawEncounters.encounters[0], knowledgeNodeId: undefined }],
  }).ok, true, 'legacy encounters without optional knowledge links remain valid');
  const originalInfo = console.info;
  console.info = () => {};
  let loaded;
  try {
    loaded = await loaderModule.loadWorldData();
  } finally {
    console.info = originalInfo;
  }
  assert.equal(loaded.ok, true, 'the full base world still loads with encounter knowledge links');
  assert(loaded.ok);
  assert.equal(loaded.world.assembly.encounters
    .find((entry) => entry.record.id === 'encounter.alley-blade-bully')?.record.knowledgeNodeId,
  'char.alley-blade', 'a valid character graph reference survives assembly');
  assert.equal(loaded.world.optionalWarnings.some((warning) =>
    warning.resource === 'encounter.round-05-set' && warning.message.includes('知识人物节点')),
  false, 'valid encounter knowledge references produce no warnings');

  const worldDataFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (new URL(url, 'http://round-29.local').pathname.endsWith('/battles/round-05-encounters.json')) {
      const invalidEncounter = structuredClone(rawEncounters);
      invalidEncounter.encounters[0].knowledgeNodeId = 'event.old-footprints';
      return new Response(JSON.stringify(invalidEncounter), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return worldDataFetch(input);
  };
  let invalidReferenceWorld;
  try {
    invalidReferenceWorld = await loaderModule.loadWorldData();
  } finally {
    globalThis.fetch = worldDataFetch;
  }
  assert.equal(invalidReferenceWorld.ok, true, 'a bad optional graph link must not fail world loading');
  assert(invalidReferenceWorld.ok);
  const keptEncounter = invalidReferenceWorld.world.assembly.encounters
    .find((entry) => entry.record.id === 'encounter.alley-blade-bully');
  assert.ok(keptEncounter, 'the encounter remains playable when its optional discovery link is bad');
  assert.equal(keptEncounter.record.knowledgeNodeId, undefined, 'the mismatched non-character link is stripped');
  assert.equal(invalidReferenceWorld.world.optionalWarnings.some((warning) =>
    warning.resource === 'encounter.round-05-set' && warning.message.includes('知识人物节点')),
  true, 'the bad optional link produces a readable encounter warning');

  console.info('[round-29] 图鉴烟测通过：8 类投影、隐匿计数、纯度、四类发现匹配与幂等、基础 ID 对照、遭遇人物装配和坏引用隔离。');
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
