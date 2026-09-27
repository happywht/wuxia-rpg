import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const [knowledge, dialogueGraph, dialogueRuntime, socialEngine, saveEngine, progression, itemsEngine, questsEngine, factionsEngine] = await Promise.all([
    server.ssrLoadModule('/src/engine/knowledge-graph.ts'),
    server.ssrLoadModule('/src/engine/dialogue-graph.ts'),
    server.ssrLoadModule('/src/engine/dialogue-runtime.ts'),
    server.ssrLoadModule('/src/engine/social-state.ts'),
    server.ssrLoadModule('/src/engine/save-system.ts'),
    server.ssrLoadModule('/src/engine/character-progression.ts'),
    server.ssrLoadModule('/src/engine/item-system.ts'),
    server.ssrLoadModule('/src/engine/quest-system.ts'),
    server.ssrLoadModule('/src/engine/faction-system.ts'),
  ]);
  const [rawNodes, rawEdges, rawDialogues, rawProfiles, rawItems] = await Promise.all([
    readJson('data/base/knowledge_graph/nodes.json'),
    readJson('data/base/knowledge_graph/edges.json'),
    readJson('data/base/dialogues/round-03-conversations.json'),
    readJson('data/base/characters/round-04-profiles.json'),
    readJson('data/base/items/round-06-items.json'),
  ]);
  const parsedNodes = knowledge.parseKnowledgeNodeSet(rawNodes);
  const parsedEdges = knowledge.parseKnowledgeEdgeSet(rawEdges);
  const parsedDialogues = dialogueGraph.parseDialogueSet(rawDialogues);
  const parsedProfiles = progression.parseCharacterProfileSet(rawProfiles);
  const parsedItems = itemsEngine.parseItemSet(rawItems);
  for (const [name, result] of Object.entries({ parsedNodes, parsedEdges, parsedDialogues, parsedProfiles, parsedItems })) {
    assert.equal(result.ok, true, `${name} should parse`);
  }
  if (!parsedNodes.ok || !parsedEdges.ok || !parsedDialogues.ok || !parsedProfiles.ok || !parsedItems.ok) {
    throw new Error('Round 26 base data failed its runtime parser');
  }

  const graph = knowledge.assembleKnowledgeGraph(parsedNodes.data, parsedEdges.data);
  const luId = 'char.lu-zhenniang';
  const guId = 'char.gu-yechen';
  const footprintId = 'event.old-footprints';
  const seeded = knowledge.createNpcKnowledgeSeeds(graph);
  assert.equal(socialEngine.npcKnows({ ...socialEngine.createSocialState(), npcKnowledge: seeded }, luId, guId), true,
    'directed NPC knows edges should seed private memory');
  assert.equal(seeded.get(luId)?.has(footprintId) ?? false, false,
    'a player-only clue must not leak into NPC memory');
  assert.equal(seeded.get('char.rong-su-qing')?.has('event.formula-shuanghe-dan'), true,
    'the herbalist starts knowing the authored formula');

  const luConversation = parsedDialogues.set.conversations.find((entry) => entry.id === 'dlg.lu-zhenniang-teastall');
  assert(luConversation, 'tea-stall example conversation should be loaded');
  const validAssembly = dialogueRuntime.assembleDialogueReferences({
    conversations: new Map([[luConversation.id, luConversation]]),
    quests: new Map(), items: new Map(), placedNpcIds: new Set([luId]),
    knowledgeNodeIds: new Set(graph.nodes.keys()), factionIds: new Set(), martialArtIds: new Set(),
    timeOfDayPeriodIds: new Set(), companionIds: new Set(),
  });
  assert.equal(validAssembly.warnings.length, 0, 'NPC memory example references should assemble cleanly');
  const broken = {
    ...luConversation,
    nodes: luConversation.nodes.map((node) => node.id !== 'greet' ? node : {
      ...node,
      options: [...(node.options ?? []), {
        text: 'bad author reference', nextNodeId: 'thanks',
        conditions: [{ kind: 'npcKnows', npcId: 'char.removed', nodeId: footprintId }],
      }],
    }),
  };
  const isolated = dialogueRuntime.assembleDialogueReferences({
    conversations: new Map([[broken.id, broken]]),
    quests: new Map(), items: new Map(), placedNpcIds: new Set([luId]),
    knowledgeNodeIds: new Set(graph.nodes.keys()), factionIds: new Set(), martialArtIds: new Set(),
    timeOfDayPeriodIds: new Set(), companionIds: new Set(),
  });
  assert.equal(isolated.warnings.length, 1, 'bad explicit NPC references should produce one local warning');
  assert.equal(isolated.conversations.get(broken.id)?.nodes.find((node) => node.id === 'greet')?.options?.length,
    luConversation.nodes.find((node) => node.id === 'greet')?.options?.length,
    'only the invalid option should be removed');

  const social = socialEngine.createSocialState();
  social.npcKnowledge = knowledge.mergeNpcKnowledge(graph, seeded);
  const context = {
    quests: new Map(), journal: questsEngine.createQuestJournal(new Map()), items: new Map(), inventory: null,
    social, speakerNpcId: luId, knownKnowledgeNodeIds: new Set([footprintId]), knowledgeNodes: graph.nodes,
    knowledgeEdges: graph.edges, npcNames: new Map([[luId, '陆贞娘'], [guId, '顾夜尘']]), character: null,
    factions: new Map(), martialArts: new Map(), factionState: factionsEngine.createFactionMembershipState(),
    timeOfDayPeriodId: 'day',
  };
  const greet = luConversation.nodes.find((node) => node.id === 'greet');
  assert(greet, 'tea-stall opening should exist');
  const shareOption = greet.options?.find((option) => option.effects?.some((effect) => effect.kind === 'shareKnowledgeNode'));
  const rememberedOption = greet.options?.find((option) => option.conditions?.some((condition) => condition.kind === 'npcKnows'));
  assert(shareOption && rememberedOption, 'sample dialogue should author a share path and a later memory response');
  const visibleBefore = dialogueRuntime.getVisibleOptions(greet, context).map((entry) => entry.option);
  assert(visibleBefore.includes(shareOption), 'known player clue should be shareable');
  assert(!visibleBefore.includes(rememberedOption), 'NPC-only response should be hidden before sharing');

  const atomicContext = { ...context, social: socialEngine.createSocialState() };
  atomicContext.social.npcKnowledge = knowledge.mergeNpcKnowledge(graph);
  const undisclosedContext = {
    ...atomicContext,
    knownKnowledgeNodeIds: new Set(),
  };
  const cannotShare = dialogueRuntime.applyDialogueEffects([
    { kind: 'shareKnowledgeNode', nodeId: footprintId },
  ], undisclosedContext);
  assert.equal(cannotShare.ok, false, 'the player must know a node before sharing it');
  assert.equal(socialEngine.npcKnows(undisclosedContext.social, luId, footprintId), false,
    'refused sharing must not alter NPC memory');
  const refused = dialogueRuntime.applyDialogueEffects([
    { kind: 'shareKnowledgeNode', nodeId: footprintId },
    { kind: 'takeItem', itemId: 'item.no-such-item', quantity: 1 },
  ], atomicContext);
  assert.equal(refused.ok, false, 'later refused effects should reject the full social-memory transaction');
  assert.equal(socialEngine.npcKnows(atomicContext.social, luId, footprintId), false,
    'staged NPC memory must not leak after a refused transaction');

  const effectResult = dialogueRuntime.applyDialogueEffects(shareOption.effects, context);
  assert.equal(effectResult.ok, true, 'sharing an owned clue should commit');
  if (!effectResult.ok) throw new Error(effectResult.reason);
  assert.equal(socialEngine.npcKnows(social, luId, footprintId), true);
  assert.equal(socialEngine.getRelationship(social, luId), 6, 'authored direct relationship effect should apply');
  assert.equal(socialEngine.getRelationship(social, guId), 3, 'attitude should spread one hop by the graph coefficient');
  assert(effectResult.summary.lines.some((line) => line.includes('顾夜尘')),
    'graph spread feedback should use the related NPC name from data');
  assert(dialogueRuntime.getVisibleOptions(greet, context).map((entry) => entry.option).includes(rememberedOption),
    'a later response should read NPC memory rather than the player knowledge set');
  const signedSocial = socialEngine.createSocialState();
  socialEngine.adjustRelationship(signedSocial, luId, 98);
  const signedContext = {
    ...context,
    social: signedSocial,
    knowledgeEdges: graph.edges.map((edge) => edge.id === 'kg.edge.lu-knows-gu'
      ? { ...edge, attitudeSpread: -0.5 }
      : edge),
  };
  const signedSpread = dialogueRuntime.applyDialogueEffects([
    { kind: 'adjustRelationship', npcId: luId, delta: 6 },
  ], signedContext);
  assert.equal(signedSpread.ok, true);
  assert.equal(socialEngine.getRelationship(signedSocial, luId), 100,
    'direct relationship should clamp at its upper bound');
  assert.equal(socialEngine.getRelationship(signedSocial, guId), -1,
    'negative coefficient should invert only the actual post-clamp delta');
  const halfSocial = socialEngine.createSocialState();
  const halfContext = { ...context, social: halfSocial, knowledgeEdges: signedContext.knowledgeEdges };
  const halfSpread = dialogueRuntime.applyDialogueEffects([
    { kind: 'adjustRelationship', npcId: luId, delta: 1 },
  ], halfContext);
  assert.equal(halfSpread.ok, true);
  assert.equal(socialEngine.getRelationship(halfSocial, guId), -1,
    'negative half steps should round away from zero symmetrically');
  const targetClampSocial = socialEngine.createSocialState();
  socialEngine.adjustRelationship(targetClampSocial, guId, 99);
  const targetClampContext = { ...context, social: targetClampSocial };
  const targetClamp = dialogueRuntime.applyDialogueEffects([
    { kind: 'adjustRelationship', npcId: luId, delta: 6 },
  ], targetClampContext);
  assert.equal(targetClamp.ok, true);
  assert.equal(socialEngine.getRelationship(targetClampSocial, guId), 100,
    'propagated target should clamp using the normal relationship boundary');
  const duplicateShare = dialogueRuntime.applyDialogueEffects([{ kind: 'shareKnowledgeNode', nodeId: footprintId }], context);
  assert.equal(duplicateShare.ok, true);
  assert(duplicateShare.ok && duplicateShare.summary.lines.some((line) => line.includes('已知道')),
    'repeated sharing should be idempotent and readable');

  const badEdgeParse = knowledge.parseKnowledgeEdgeSet({ edges: [
    { id: 'bad-zero', fromId: luId, toId: guId, relation: 'knows', summary: 'zero', attitudeSpread: 0 },
    { id: 'bad-range', fromId: luId, toId: guId, relation: 'knows', summary: 'range', attitudeSpread: 1.1 },
    { id: 'good', fromId: luId, toId: guId, relation: 'knows', summary: 'valid', attitudeSpread: -0.5 },
  ] });
  assert(badEdgeParse.ok && badEdgeParse.data.edges.length === 1, 'invalid spread coefficients should be isolated');
  const stripped = knowledge.assembleKnowledgeGraph(parsedNodes.data, { edges: [
    { id: 'bad-endpoints', fromId: luId, toId: footprintId, relation: 'knows', summary: 'not character-to-character', attitudeSpread: 0.5 },
  ] });
  assert.equal(stripped.edges[0].attitudeSpread, undefined, 'non-character graph edges must not carry attitude effects');
  assert.equal(stripped.warnings.length, 1);

  const profile = parsedProfiles.set.profiles[0];
  const items = new Map(parsedItems.set.items.map((item) => [item.id, item]));
  const memoryForSave = socialEngine.createSocialState();
  socialEngine.teachNpcKnowledge(memoryForSave, luId, footprintId);
  const snapshot = saveEngine.captureSaveSnapshot({
    displayName: 'Round 26 smoke', mapResourceId: 'map.round-01-grid', playerCol: 1, playerRow: 1,
    character: progression.createCharacterState(profile), inventory: itemsEngine.createInventoryState(profile, []),
    shopStocks: new Map(), journal: questsEngine.createQuestJournal(new Map()), social: memoryForSave,
    completedEncounters: new Set(), completedRegionalEvents: new Set(), knownKnowledgeNodeIds: new Set([footprintId]),
    elapsedGameMinutes: 0, worldSeed: 26, now: () => new Date('2026-09-27T00:00:00.000Z'),
  });
  const parsedSnapshot = saveEngine.parseSaveSnapshot(snapshot);
  assert(parsedSnapshot.ok, 'v1 snapshot with NPC knowledge should parse');
  if (!parsedSnapshot.ok) throw new Error(parsedSnapshot.message);
  const duplicateMemory = structuredClone(snapshot);
  duplicateMemory.social.npcKnowledge = [{ npcId: luId, nodeIds: [footprintId, footprintId] }];
  assert.equal(saveEngine.parseSaveSnapshot(duplicateMemory).ok, false,
    'duplicate NPC memory node ids should be rejected at the save boundary');
  const oldSnapshot = structuredClone(snapshot);
  delete oldSnapshot.social.npcKnowledge;
  const parsedOld = saveEngine.parseSaveSnapshot(oldSnapshot);
  assert(parsedOld.ok && parsedOld.snapshot.social.npcKnowledge?.length === 0,
    'older v1 snapshots without NPC memory should normalize to empty additions');
  const refSets = {
    profileIds: new Set([profile.id]), mapResourceId: 'map.round-01-grid', isWalkableCell: () => true,
    isCellOccupied: () => false, itemIds: new Set(items.keys()), martialArtIds: new Set(profile.startingMartialArtIds), questIds: new Set(),
    questObjectiveIds: new Map(), encounterIds: new Set(), shopIds: new Set(), npcIds: new Set([luId, guId]),
    knowledgeNodeIds: new Set(graph.nodes.keys()),
  };
  const restorePlan = saveEngine.planSnapshotRestore(parsedSnapshot.snapshot, refSets);
  assert(restorePlan.ok, 'saved private memory should pass current-world preflight');
  if (!restorePlan.ok) throw new Error(restorePlan.errors.join('\n'));
  const restored = saveEngine.restoreRunState({ profile, items, quests: new Map(), shops: new Map(), snapshot: restorePlan.snapshot });
  assert.equal(socialEngine.npcKnows(restored.social, luId, footprintId), true, 'NPC private memory should survive v1 roundtrip');
  const recoveredOldMemory = knowledge.mergeNpcKnowledge(graph, parsedOld.ok ? new Map(parsedOld.snapshot.social.npcKnowledge?.map((entry) => [entry.npcId, new Set(entry.nodeIds)]) ?? []) : undefined);
  assert.equal(recoveredOldMemory.get(luId)?.has(guId), true, 'old saves should regain current static graph knowledge');

  const staleSnapshot = structuredClone(parsedSnapshot.snapshot);
  staleSnapshot.social.npcKnowledge = [
    { npcId: luId, nodeIds: [footprintId, 'event.removed-by-mod'] },
    { npcId: 'char.removed-by-mod', nodeIds: [footprintId] },
  ];
  const stalePlan = saveEngine.planSnapshotRestore(staleSnapshot, { ...refSets, npcIds: new Set([luId]) });
  assert(stalePlan.ok, 'deleted secondary memory references should not invalidate a save');
  assert(stalePlan.ok && stalePlan.snapshot.social.npcKnowledge?.length === 1 &&
    stalePlan.snapshot.social.npcKnowledge[0].nodeIds.length === 1 && stalePlan.warnings.length === 2,
  `MOD-removed NPCs and nodes should be filtered individually with warnings: ${JSON.stringify(stalePlan)}`);

  console.log('通过：NPC 私有见闻种子/分享/专属对白、引用隔离、事务回滚、图谱一跳关系传播、系数校验、v1 新旧存档与 MOD 软过滤。');
} finally {
  await server.close();
}
