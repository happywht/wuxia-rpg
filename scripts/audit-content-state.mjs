// Read-only inventory of registered base content. This is not a playtest or runtime validation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('data/base/manifest.json');
const resources = manifest.resources.map((r) => ({ ...r, data: read(`data/base/${r.path}`) }));
const list = (schema, field) => resources.filter((r) => r.schema === schema).flatMap((r) => r.data[field] ?? []);
const maps = resources.filter((r) => r.schema === 'grid-map').map((r) => r.data);
const npcs = list('npc-set', 'npcs');
const quests = list('quest-set', 'quests');
const encounters = list('battle-encounters', 'encounters');
const shops = list('shops-set', 'shops');
const factions = list('faction-set', 'factions');
const endings = list('ending-set', 'endings');
const world = resources.find((r) => r.schema === 'world-map').data;
const byNpc = new Map(npcs.map((n) => [n.id, n]));
const byQuest = new Map(quests.map((q) => [q.id, q]));
const histogram = (values) => Object.fromEntries([...new Set(values)].sort().map((v) => [v, values.filter((x) => x === v).length]));
const active = new Set();
const depths = new Map();
const cycles = new Set();
const missingPrerequisites = new Set();
function depth(id) {
  if (depths.has(id)) return depths.get(id);
  if (active.has(id)) { cycles.add(id); return 0; }
  const quest = byQuest.get(id);
  if (!quest) { missingPrerequisites.add(id); return 0; }
  active.add(id);
  const prerequisites = quest.prerequisiteQuestIds ?? [];
  const result = 1 + Math.max(0, ...prerequisites.map(depth));
  active.delete(id);
  depths.set(id, result);
  return result;
}
quests.forEach((q) => depth(q.id));
const reachable = new Set([world.startingMapResourceId]);
for (let changed = true; changed;) {
  changed = false;
  for (const t of world.transitions) {
    if (reachable.has(t.from.mapResourceId) && !reachable.has(t.to.mapResourceId)) {
      reachable.add(t.to.mapResourceId); changed = true;
    }
  }
}
const stations = [...list('equipment-forge-set', 'stations'), ...list('alchemy-set', 'stations')];
const arenas = list('arena-set', 'arenas');
const wars = list('faction-war-set', 'wars');
const mentorIds = new Set(factions.flatMap((f) => f.mentorNpcIds ?? []));
const dialogueOptions = list('dialogue-set', 'conversations').flatMap((c) => c.nodes ?? []).flatMap((n) => n.options ?? []);
const laterMaps = new Set(maps.filter((m) => /round-(?:79|8[2457]|9\d)-/.test(m.id)).map((m) => m.id));
const laterQuests = quests.filter((q) => laterMaps.has(byNpc.get(q.giverNpcId)?.mapResourceId));
const report = {
  basis: 'Registered base JSON at command time; read-only static inventory, not runtime or human playtest acceptance',
  counts: {
    resources: resources.length, maps: maps.length, hundredByHundredMaps: maps.filter((m) => m.columns === 100 && m.rows === 100).length,
    npcs: npcs.length, factions: factions.length, quests: quests.length, items: list('items-set', 'items').length,
    martialArts: list('martial-arts-set', 'martialArts').length, endings: endings.length,
    knowledgeNodes: list('knowledge-nodes', 'nodes').length, knowledgeEdges: list('knowledge-edges', 'edges').length,
    encounters: encounters.length, shops: shops.length, companions: list('companion-set', 'companions').length,
    forgeRecipes: list('equipment-forge-set', 'recipes').length, alchemyRecipes: list('alchemy-set', 'recipes').length,
    arenas: arenas.length, factionWars: wars.length, achievements: list('achievement-set', 'achievements').length,
    meridianNodes: list('meridian-set', 'nodes').length,
    regions: world.regions.length, directedTransitions: world.transitions.length, landmarks: world.landmarks.length,
    fixedEvents: world.events.length, randomEvents: world.randomEvents.length,
    atlas: { columns: world.atlasArt.columns, rows: world.atlasArt.rows, layers: world.atlasArt.layers.length },
  },
  questStructure: {
    roots: quests.filter((q) => !(q.prerequisiteQuestIds?.length)).length,
    withPrerequisites: quests.filter((q) => q.prerequisiteQuestIds?.length).length,
    maxPrerequisiteDepth: Math.max(...depths.values()), // Includes the root quest; not narrative length or hours.
    exclusiveGroups: histogram(quests.map((q) => q.exclusiveGroupId).filter(Boolean)),
    objectiveKinds: histogram(quests.flatMap((q) => q.objectives.map((o) => o.kind))),
    objectiveCombinations: histogram(quests.map((q) => q.objectives.map((o) => o.kind).join(' + '))),
    factionGated: quests.filter((q) => q.requiredFactionId).length,
    rewardFactionRenown: quests.filter((q) => q.rewards.factionRenown?.length).length,
    rewardKnowledge: quests.filter((q) => q.rewards.discoverKnowledgeNodeIds?.length).length,
    laterMapGiverQuests: laterQuests.length,
    laterMapObjectiveCombinations: histogram(laterQuests.map((q) => q.objectives.map((o) => o.kind).join(' + '))),
    cycles: [...cycles], missingPrerequisites: [...missingPrerequisites],
  },
  dialogue: {
    conversations: list('dialogue-set', 'conversations').length,
    conditionKinds: histogram(dialogueOptions.flatMap((o) => (o.conditions ?? []).map((c) => c.kind))),
    effectKinds: histogram(dialogueOptions.flatMap((o) => (o.effects ?? []).map((e) => e.kind))),
  },
  endingQuestDependencies: endings.map((e) => ({ id: e.id, quests: e.conditions.filter((c) => c.kind === 'questStatus').map((c) => c.questId) })),
  regions: maps.map((m) => {
    const localNpcs = npcs.filter((n) => n.mapResourceId === m.id);
    return {
      id: m.id, name: m.name, dimensions: [m.columns, m.rows], reachableByDeclaredTransitions: reachable.has(m.id),
      walkableCells: m.grid.join('').split('').filter((cell) => m.tileTypes[cell]?.solid === false).length,
      npcs: localNpcs.length, questGivers: localNpcs.filter((n) => n.questGiver).length,
      questsByGiver: quests.filter((q) => byNpc.get(q.giverNpcId)?.mapResourceId === m.id).length,
      encounters: encounters.filter((e) => e.mapResourceId === m.id).length,
      shops: shops.filter((s) => byNpc.get(s.npcId)?.mapResourceId === m.id).length,
      craftingStations: stations.filter((s) => s.mapResourceId === m.id).length,
      mentors: localNpcs.filter((n) => mentorIds.has(n.id)).length,
      arenas: arenas.filter((a) => a.mapResourceId === m.id).length,
      factionWars: wars.filter((w) => w.mapResourceId === m.id).length,
      events: world.events.filter((e) => e.mapResourceId === m.id).length,
      outgoingTransitions: world.transitions.filter((t) => t.from.mapResourceId === m.id).length,
    };
  }),
};
report.coverage = {
  mapsWithEncounters: report.regions.filter((r) => r.encounters > 0).length,
  mapsWithShops: report.regions.filter((r) => r.shops > 0).length,
  mapsWithCrafting: report.regions.filter((r) => r.craftingStations > 0).length,
  mapsWithMentors: report.regions.filter((r) => r.mentors > 0).length,
  mapsWithoutNpcs: report.regions.filter((r) => r.npcs === 0).map((r) => r.id),
  unreachableByDeclaredTransitions: report.regions.filter((r) => !r.reachableByDeclaredTransitions).map((r) => r.id),
};
report.integrity = {
  missingQuestGivers: quests.filter((q) => !byNpc.has(q.giverNpcId)).map((q) => q.id),
  duplicateIds: Object.fromEntries(Object.entries({ maps, npcs, quests, encounters, shops }).map(([key, records]) =>
    [key, [...new Set(records.map((r) => r.id))].filter((id) => records.filter((r) => r.id === id).length > 1)])),
};
console.log(JSON.stringify(report, null, 2));
