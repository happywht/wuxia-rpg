import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dialogueFacts, teaFact, repairDialogueFacts, repairQuestFacts, repairWatchPrerequisite, repairWatchEdge, watchGate } from '../scripts/lib/round272-journey-facts.mjs';
import { parseAlchemySet } from '../src/engine/alchemy-system';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { parseQuestSet, indexQuests, createQuestJournal, acceptQuest, applyQuestSignal, reconcileQuestFacts } from '../src/engine/quest-system';
import { parseSaveSnapshot, restoreRunState } from '../src/engine/save-system';
import { parseCharacterProfileSet } from '../src/engine/character-progression';
import { parseItemSet, indexItems } from '../src/engine/item-system';
const dialogues = readFileSync('data/base/dialogues/round-03-conversations.json', 'utf8');
const quests = readFileSync('data/base/quests/round-07-quests.json', 'utf8');
function baseline(raw: string, facts: { before: string; after: string }[]) {
  for (const fact of facts) raw = raw.replace(JSON.stringify(fact.after), JSON.stringify(fact.before));
  return raw;
}
describe('Round272 journey facts agree with actual data and preserve all rules', () => {
  it('teaches the actual two-herb one-root recipe and labour', () => {
    const parsed = parseAlchemySet(JSON.parse(readFileSync('data/base/alchemy/round-25-alchemy.json', 'utf8')));
    if (!parsed.ok) throw Error('recipe refused');
    const recipe = parsed.set.recipes.find(row => row.id === 'alchemy.recipe.shengji-san')!;
    expect(recipe.ingredients).toEqual([{ itemId: 'item.hanzhu-cao', quantity: 2 }, { itemId: 'item.cangya-gen', quantity: 1 }]);
    expect(recipe.currencyCost).toBe(18);
    expect(dialogueFacts[1]!.after).toContain('寒珠二、苍崖一');
    expect(dialogueFacts[1]!.after).toContain('十八银工钱');
    expect(dialogues).toContain(dialogueFacts[1]!.after);
  });
  it('names purchase/delivery actions and removes nonexistent credit/harvest promises', () => {
    expect(dialogueFacts[0]!.after).toContain('按E购药');
    expect(dialogueFacts[0]!.after).toContain('按F交谈');
    expect(dialogues).not.toContain('也先赊着');
    expect(quests).toContain(teaFact.after);
    expect(teaFact.after).not.toContain('采集');
    // The currently declared world has no hanzhu item grant or harvesting interaction.
    expect(readFileSync('data/base/world/world-map.json', 'utf8')).not.toContain('item.hanzhu-cao');
  });
  it('replays exactly and is byte-idempotent for LF and CRLF', () => {
    for (const eol of ['\n', '\r\n']) {
      const d = dialogues.replace(/\r?\n/g, eol), q = quests.replace(/\r?\n/g, eol);
      expect(repairDialogueFacts(baseline(d, dialogueFacts))).toBe(d);
      expect(repairQuestFacts(baseline(q, [teaFact]))).toBe(q);
      expect(repairDialogueFacts(d)).toBe(d);
      expect(repairQuestFacts(q)).toBe(q);
    }
  });
  it('changes only the three text fields, with schemas and every effect unchanged', () => {
    const before = JSON.parse(baseline(dialogues, dialogueFacts));
    for (const fact of dialogueFacts) before.conversations.find((c: { id: string }) => c.id === fact.conversationId).nodes.find((n: { id: string }) => n.id === fact.nodeId).text = fact.after;
    expect(before).toEqual(JSON.parse(dialogues));
    const q = JSON.parse(baseline(quests, [teaFact]));
    q.quests.find((r: { id: string }) => r.id === teaFact.questId).objectives.find((r: { id: string }) => r.id === teaFact.objectiveId).text = teaFact.after;
    expect(q).toEqual(JSON.parse(quests));
    expect(parseDialogueSet(JSON.parse(dialogues)).ok).toBe(true);
    expect(parseQuestSet(q).ok).toBe(true);
  });
  it('refuses unexpected text, missing/duplicate IDs and ambiguous raw text', () => {
    const d = JSON.parse(dialogues);
    const ma = d.conversations.find((c: { id: string }) => c.id === dialogueFacts[0]!.conversationId);
    ma.nodes.find((n: { id: string }) => n.id === 'quest-progress').text = '漂移';
    expect(() => repairDialogueFacts(JSON.stringify(d))).toThrow('人工复核');
    d.conversations.push(ma);
    expect(() => repairDialogueFacts(JSON.stringify(d))).toThrow('应唯一');
    expect(() => repairQuestFacts('{"quests":[]}')).toThrow('应唯一');
    const q = JSON.parse(baseline(quests, [teaFact]));
    q.quests[0].description = teaFact.before;
    expect(() => repairQuestFacts(JSON.stringify(q))).toThrow('不唯一');
  });
  it('runner preflights all four documents before any write and works outside cwd', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'wuxia-r272-facts-'));
    try {
      mkdirSync(join(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(join(sandbox, 'data/base/dialogues'), { recursive: true });
      mkdirSync(join(sandbox, 'data/base/quests'), { recursive: true });
      mkdirSync(join(sandbox, 'data/base/knowledge_graph'), { recursive: true });
      mkdirSync(join(sandbox, 'data/base/battles'), { recursive: true });
      cpSync('data/base/battles/round-05-encounters.json', join(sandbox, 'data/base/battles/round-05-encounters.json'));
      cpSync('data/base/knowledge_graph/edges.json', join(sandbox, 'data/base/knowledge_graph/edges.json'));
      cpSync('scripts/apply-round272.mjs', join(sandbox, 'scripts/apply-round272.mjs'));
      cpSync('scripts/lib/round272-journey-facts.mjs', join(sandbox, 'scripts/lib/round272-journey-facts.mjs'));
      const dPath = join(sandbox, 'data/base/dialogues/round-03-conversations.json');
      const qPath = join(sandbox, 'data/base/quests/round-07-quests.json');
      const initial = baseline(dialogues, dialogueFacts);
      writeFileSync(dPath, initial); writeFileSync(qPath, '{"quests":[]}');
      expect(() => execFileSync(process.execPath, [join(sandbox, 'scripts/apply-round272.mjs')], { cwd: tmpdir(), stdio: 'pipe' })).toThrow();
      expect(readFileSync(dPath, 'utf8')).toBe(initial);
      writeFileSync(qPath, baseline(quests, [teaFact]));
      for (const relative of ['knowledge_graph/edges.json', 'battles/round-05-encounters.json']) {
        const target = join(sandbox, 'data/base', relative);
        const original = readFileSync(target, 'utf8');
        writeFileSync(target, '{}');
        expect(() => execFileSync(process.execPath, [join(sandbox, 'scripts/apply-round272.mjs')], { cwd: tmpdir(), stdio: 'pipe' })).toThrow();
        expect(readFileSync(dPath, 'utf8')).toBe(initial);
        expect(readFileSync(qPath, 'utf8')).toBe(baseline(quests, [teaFact]));
        writeFileSync(target, original);
      }
      execFileSync(process.execPath, [join(sandbox, 'scripts/apply-round272.mjs')], { cwd: tmpdir() });
      expect(readFileSync(dPath, 'utf8')).toBe(dialogues);
      expect(readFileSync(qPath, 'utf8')).toBe(quests);
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });
});

describe('Round272 medicine practice and shore challenge can serve each other', () => {
  const parsed = parseQuestSet(JSON.parse(quests));
  if (!parsed.ok) throw Error('real quests refused');
  const indexed = indexQuests(parsed.set).byId;
  const medicine = 'quest.r31-herbal-stocktaking', inquiry = 'quest.r31-herbal-inquiry', watch = watchGate.questId, departure = 'quest.r31-caravan-provisioning';
  function prepare() {
    const journal = createQuestJournal(indexed);
    journal.states.get('quest.round-07-medicine-run')!.status = 'completed';
    reconcileQuestFacts(indexed, journal, {});
    expect(acceptQuest(indexed, journal, inquiry).ok).toBe(true);
    applyQuestSignal(indexed, journal, { type: 'npc-talk', npcId: 'char.rong-su-qing' });
    return journal;
  }
  function practice(journal: ReturnType<typeof prepare>) {
    expect(acceptQuest(indexed, journal, medicine, new Map([['item.cangya-gen', 3]])).ok).toBe(true);
    applyQuestSignal(indexed, journal, { type: 'knowledge-discovery', nodeId: 'event.formula-shengji-san' });
    applyQuestSignal(indexed, journal, { type: 'recipe-crafted', recipeId: 'alchemy.recipe.shengji-san' });
    applyQuestSignal(indexed, journal, { type: 'item-used', itemId: 'item.shengji-san-cu' });
    applyQuestSignal(indexed, journal, { type: 'npc-talk', npcId: 'char.rong-su-qing' });
  }
  it('opens both at inquiry, but requires both real completions before departure in either order', () => {
    for (const challengeFirst of [true, false]) {
      const journal = prepare();
      expect(journal.states.get(watch)!.status).toBe('offered');
      expect(journal.states.get(medicine)!.status).toBe('offered');
      expect(journal.states.get(departure)!.status).toBe('locked');
      if (!challengeFirst) practice(journal);
      expect(acceptQuest(indexed, journal, watch).ok).toBe(true);
      applyQuestSignal(indexed, journal, { type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler' });
      if (challengeFirst) {
        expect(journal.states.get(departure)!.status).toBe('locked');
        practice(journal);
      }
      expect(journal.states.get(departure)!.status).toBe('offered');
      expect(indexed.get(departure)!.prerequisiteQuestIds).toEqual([medicine, watch]);
    }
  });
  it('keeps challenge failure and downstream lock even after practice or a later victory', () => {
    const journal = prepare();
    acceptQuest(indexed, journal, watch);
    applyQuestSignal(indexed, journal, { type: 'encounter-defeat', encounterId: 'encounter.mist-shore-prowler' });
    practice(journal);
    applyQuestSignal(indexed, journal, { type: 'encounter-victory', encounterId: 'encounter.mist-shore-prowler' });
    expect(journal.states.get(watch)!.status).toBe('failed');
    expect(journal.states.get(departure)!.status).toBe('locked');
  });
  it('replays the gate and requires edge exactly, with drift refusal and stable edge ID', () => {
    const edges = readFileSync('data/base/knowledge_graph/edges.json', 'utf8');
    const qOld = quests.replace(/("id": "quest.r31-mist-shore-watch"[\s\S]*?"prerequisiteQuestIds": \[\s*)"quest.r31-herbal-inquiry"/, '$1"quest.r31-herbal-stocktaking"');
    const eOld = edges.replace(JSON.stringify(watchGate.summary), JSON.stringify(watchGate.oldSummary));
    const eAt = eOld.indexOf(JSON.stringify(watchGate.edgeId));
    const eLegacy = eOld.slice(0, eAt) + eOld.slice(eAt).replace('"toId": "quest.r31-herbal-inquiry"', '"toId": "quest.r31-herbal-stocktaking"');
    expect(repairWatchPrerequisite(qOld)).toBe(quests);
    expect(repairWatchPrerequisite(quests)).toBe(quests);
    expect(repairWatchEdge(eLegacy)).toBe(edges);
    expect(repairWatchEdge(edges)).toBe(edges);
    const drift = JSON.parse(quests);
    drift.quests.find((q: { id: string }) => q.id === watch).prerequisiteQuestIds = [];
    expect(() => repairWatchPrerequisite(JSON.stringify(drift))).toThrow('人工复核');
    expect(() => repairWatchEdge(edges.replace(watchGate.summary, '漂移'))).toThrow('人工复核');
  });
  it('old locked saves unlock after inquiry, while completed/failed remain terminal and no reward is replayed', () => {
    const profiles = parseCharacterProfileSet(JSON.parse(readFileSync('data/base/characters/round-04-profiles.json', 'utf8')));
    const itemData = parseItemSet(JSON.parse(readFileSync('data/base/items/round-06-items.json', 'utf8')));
    if (!profiles.ok || !itemData.ok) throw Error('real profile/items refused');
    const raw = JSON.parse(readFileSync('iterations/round-271/j0-delivery.json', 'utf8')).snapshot;
    const inquirySaved = raw.quests.states.find((q: { questId: string }) => q.questId === inquiry);
    inquirySaved.status = 'completed'; inquirySaved.objectiveCounts[0].value = 1;
    for (const status of ['locked', 'completed', 'failed']) {
      const snapshot = structuredClone(raw);
      snapshot.quests.states.find((q: { questId: string }) => q.questId === watch).status = status;
      const parsedSave = parseSaveSnapshot(snapshot);
      if (!parsedSave.ok) throw Error('old save refused');
      const restored = restoreRunState({ profile: profiles.set.profiles[0]!, items: indexItems(itemData.set).byId, quests: indexed, shops: new Map(), snapshot: parsedSave.snapshot });
      const refreshed = reconcileQuestFacts(indexed, restored.journal, {});
      expect(refreshed.completed).toEqual([]);
      expect(restored.journal.states.get(watch)!.status).toBe(status === 'locked' ? 'offered' : status);
      expect(restored.inventory.currency).toBe(171);
    }
  });
});
