import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Round 33 smoke: knowledge graph real catalog coverage and closing relations.
 * Pure data assertions against canonical JSON — no engine boot, no UI wording.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

const [manifest, rawNodes, rawEdges, rawItems, rawArts, rawQuests, rawFactions, rawNpcs, rawEndings, rawShops, rawForges, rawEncounters] =
  await Promise.all([
    readJson('data/base/manifest.json'),
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/items/round-06-items.json'),
    readJson('data/base/skills/round-04-martial-arts.json'),
    readJson('data/base/quests/round-07-quests.json'),
    readJson('data/base/factions/round-04-factions.json'),
    readJson('data/base/characters/round-03-npcs.json'),
    readJson('data/base/endings/round-27-endings.json'),
    readJson('data/base/shops/round-06-shops.json'),
    readJson('data/base/forges/round-24-equipment-forges.json'),
    readJson('data/base/battles/round-05-encounters.json'),
  ]);

const nodes = rawNodes.nodes;
const edges = rawEdges.edges;
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const idsOfKind = (kind) => new Set(nodes.filter((node) => node.kind === kind).map((node) => node.id));
const hasEdge = (fromId, toId, relation) =>
  edges.some((edge) => edge.fromId === fromId && edge.toId === toId && edge.relation === relation);

// 1. Size floor and global uniqueness.
assert(nodes.length >= 100, 'the base graph should carry at least 100 nodes, got ' + nodes.length);
assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length, 'node ids must be globally unique');
assert.equal(new Set(edges.map((edge) => edge.id)).size, edges.length, 'edge ids must be globally unique');

// 2. Every edge endpoint resolves to a declared node.
for (const edge of edges) {
  assert(nodeById.has(edge.fromId), 'edge ' + edge.id + ' fromId must reference a declared node');
  assert(nodeById.has(edge.toId), 'edge ' + edge.id + ' toId must reference a declared node');
}

// 3. Catalog mapping: item/martialArt/quest/faction ids map exactly to matching kinds.
const catalogPairs = [
  ['item', rawItems.items.map((entry) => entry.id), idsOfKind('item')],
  ['martialArt', rawArts.martialArts.map((entry) => entry.id), idsOfKind('martialArt')],
  ['quest', rawQuests.quests.map((entry) => entry.id), idsOfKind('quest')],
  ['faction', rawFactions.factions.map((entry) => entry.id), idsOfKind('faction')],
];
for (const [label, catalogIds, nodeIds] of catalogPairs) {
  for (const id of catalogIds) {
    assert(nodeIds.has(id), label + ' ' + id + ' must have a graph node of kind ' + label);
  }
  for (const id of nodeIds) {
    assert(catalogIds.includes(id), label + ' node ' + id + ' must come from the canonical catalog');
  }
}

// 4. NPC and grid-map coverage: every placed NPC and manifest map has a node.
const npcIds = rawNpcs.npcs.map((npc) => npc.id);
const characterIds = idsOfKind('character');
for (const id of npcIds) {
  assert(characterIds.has(id), 'npc ' + id + ' must have a character node');
}
const placeIds = idsOfKind('place');
for (const resource of manifest.resources) {
  if (resource.schema !== 'grid-map') continue;
  assert(placeIds.has(resource.id), 'map resource ' + resource.id + ' must have a place node');
}

// 5. Every faction martial art carries a belongsTo edge to its faction.
for (const art of rawArts.martialArts) {
  for (const factionId of art.factionIds) {
    assert(hasEdge(art.id, factionId, 'belongsTo'),
      'martial art ' + art.id + ' must belongTo its faction ' + factionId);
  }
}

// 6. Every shop stock entry is held by the shop NPC and exists as an item node.
const itemNodeIds = idsOfKind('item');
for (const shop of rawShops.shops) {
  for (const entry of shop.stock) {
    assert(itemNodeIds.has(entry.itemId), 'shop stock item ' + entry.itemId + ' must have an item node');
    assert(hasEdge(shop.npcId, entry.itemId, 'holds'),
      'shop npc ' + shop.npcId + ' must hold stock item ' + entry.itemId);
  }
}

// 7. Every forge result requires each declared ingredient.
for (const recipe of rawForges.recipes) {
  assert(itemNodeIds.has(recipe.resultItemId), 'forge result ' + recipe.resultItemId + ' must have an item node');
  for (const ingredient of recipe.ingredients) {
    assert(hasEdge(recipe.resultItemId, ingredient.itemId, 'requires'),
      'forge result ' + recipe.resultItemId + ' must require ingredient ' + ingredient.itemId);
  }
}

// 8. Quest wiring: giver participation, prerequisites, and real objective targets.
const questNodeIds = idsOfKind('quest');
for (const quest of rawQuests.quests) {
  assert(hasEdge(quest.giverNpcId, quest.id, 'participatesIn'),
    'giver ' + quest.giverNpcId + ' must participateIn quest ' + quest.id);
  for (const prerequisiteId of quest.prerequisiteQuestIds ?? []) {
    assert(questNodeIds.has(prerequisiteId), 'prerequisite ' + prerequisiteId + ' must have a quest node');
    assert(hasEdge(quest.id, prerequisiteId, 'requires'),
      'quest ' + quest.id + ' must require its prerequisite ' + prerequisiteId);
  }
  for (const objective of quest.objectives) {
    if (objective.kind === 'collectItem') {
      assert(itemNodeIds.has(objective.targetId), 'objective item ' + objective.targetId + ' must have an item node');
      assert(hasEdge(quest.id, objective.targetId, 'requires'),
        'quest ' + quest.id + ' must require objective item ' + objective.targetId);
    } else if (objective.kind === 'talkToNpc') {
      assert(characterIds.has(objective.targetId), 'objective npc ' + objective.targetId + ' must have a character node');
      assert(hasEdge(objective.targetId, quest.id, 'participatesIn'),
        'objective npc ' + objective.targetId + ' must participateIn quest ' + quest.id);
    } else if (objective.kind === 'defeatEncounter') {
      assert(!nodeById.has(objective.targetId),
        'encounter target ' + objective.targetId + ' must not be faked as a graph node');
    }
  }
}

// 9. Encounters never appear as graph nodes under any naming.
const encounterIds = new Set(rawEncounters.encounters.map((encounter) => encounter.id));
for (const id of nodeById.keys()) {
  assert(!encounterIds.has(id), 'graph node ' + id + ' must not reuse an encounter business id');
}

// 10. Endings: node mapping, unknown-by-default, and condition-sourced influences edges.
assert(rawEndings.endings.length >= 3, 'the base ending set should keep at least three endings');
const endingNodeIds = idsOfKind('ending');
for (const ending of rawEndings.endings) {
  assert(endingNodeIds.has(ending.knowledgeNodeId),
    'ending ' + ending.id + ' must reference an ending-kind graph node');
}
for (const node of nodes.filter((node) => node.kind === 'ending')) {
  assert.equal(node.knownByDefault, false, 'ending node ' + node.id + ' must stay unknown by default');
}
for (const ending of rawEndings.endings) {
  for (const condition of ending.conditions) {
    let sourceId = null;
    if (condition.kind === 'questStatus') sourceId = condition.questId;
    else if (condition.kind === 'knowledgeKnown') sourceId = condition.nodeId;
    else if (condition.kind === 'npcRelationship') sourceId = condition.npcId;
    else if (condition.kind === 'factionMembership' && condition.factionId !== undefined) sourceId = condition.factionId;
    else if (condition.kind === 'factionRenown') sourceId = condition.factionId;
    if (sourceId === null) continue;
    assert(nodeById.has(sourceId), 'ending condition source ' + sourceId + ' must be a graph node');
    assert(hasEdge(sourceId, ending.knowledgeNodeId, 'influences'),
      'ending condition source ' + sourceId + ' must influence ending node ' + ending.knowledgeNodeId);
  }
}

// 11. Round-32 catalog entries joined the graph this round: they stay unknown
// until first observed (inventory possession or learning), per id convention.
for (const node of nodes) {
  if (node.kind === 'item' && node.id.startsWith('item.r32.')) {
    assert.equal(node.knownByDefault, false, 'r32 item node ' + node.id + ' must stay unknown before first acquisition');
  }
  if (node.kind === 'martialArt' && node.id.startsWith('skill.r32-')) {
    assert.equal(node.knownByDefault, false, 'r32 martial art node ' + node.id + ' must stay unknown before learning');
  }
}

console.log('通过：' + nodes.length + ' 节点/' + edges.length + ' 关系；物品/武学/任务/门派目录全量映射、NPC 与地图覆盖、唯一 id、端点闭合、货架持有、锻造投入、武学归属、任务发布人与前置/目标链路、遭遇不伪造节点、结局条件影响边与默认未知。');
