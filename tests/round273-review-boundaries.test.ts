import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { repairDialoguesRaw } from '../scripts/lib/round273-pier-delivery.mjs';
import { acceptQuest, applyQuestSignal, createQuestJournal, reconcileQuestFacts, type QuestData } from '../src/engine/quest-system';
import { applyDialogueEffects, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createSocialState } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';

it('refuses extra managed entries even when all exact authored originals remain present', () => {
  const original = JSON.parse(readFileSync(new URL('../data/base/dialogues/round-30-conversations.json', import.meta.url), 'utf8'));
  for (const kind of ['node', 'option']) {
    const data = structuredClone(original);
    const conversation = data.conversations.find((entry: { id: string }) => entry.id === 'dlg.bai-luzhou-ferry-master');
    if (kind === 'node') {
      const node = conversation.nodes.find((entry: { id: string }) => entry.id === 'r273-pier-delivered');
      conversation.nodes.push({ ...node, text: '漂移重复节点' });
    } else {
      const greet = conversation.nodes.find((entry: { id: string }) => entry.id === conversation.startNodeId);
      const option = greet.options.find((entry: { nextNodeId: string }) => entry.nextNodeId === 'r273-pier-delivery-confirm');
      greet.options.push({ ...option, text: '漂移重复入口' });
    }
    expect(() => repairDialoguesRaw(JSON.stringify(data))).toThrow('已变化');
  }
});

it('announces optional bridge materials before leaving town and retains the ferry reminder', () => {
  const world = JSON.parse(readFileSync(new URL('../data/base/world/world-map.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('../scripts/lib/round106-region-content.mjs', import.meta.url), 'utf8');
  for (const id of ['map.round-01-grid', 'map.round-10-mist-ferry']) {
    const advice = world.regionGuides.find((entry: { mapResourceId: string }) => entry.mapResourceId === id).advice;
    expect(advice).toContain('铁砂×3');
    expect(advice).toContain('韧皮×2（56银）');
    expect(advice).toContain('渡口无料铺');
    expect(source).toContain(advice);
  }
});
function fixture(separator: boolean) {
  const quest: QuestData = {
    id: 'quest.review-materials', name: '材料检验', description: '通用有序边界', giverNpcId: 'npc.test',
    prerequisiteQuestIds: [], failOnEncounterIds: [], orderedObjectives: true,
    objectives: [
      { id: 'iron', kind: 'collectItem', targetId: 'item.iron', requiredCount: 3, text: '铁料' },
      ...(separator ? [{ id: 'report', kind: 'talkToNpc' as const, targetId: 'npc.test', requiredCount: 1, text: '报告' }] : []),
      { id: 'leather', kind: 'collectItem', targetId: 'item.leather', requiredCount: 2, text: '皮料' },
      { id: 'handoff', kind: 'discoverKnowledge', targetId: 'event.delivery', requiredCount: 1, text: '交付' },
    ], rewards: { experience: 0, currency: 0 },
  };
  const quests = new Map([[quest.id, quest]]), journal = createQuestJournal(quests);
  expect(acceptQuest(quests, journal, quest.id).ok).toBe(true);
  return { quests, journal, counts: journal.states.get(quest.id)!.objectiveCounts };
}
describe('Primary Round273 review of ordered material boundaries', () => {
  it('does not pre-fill a future collect stage across a required report', () => {
    const f = fixture(true);
    applyQuestSignal(f.quests, f.journal, { type: 'item-count', itemId: 'item.leather', quantity: 2 });
    expect(f.counts.get('leather')).toBe(0);
    reconcileQuestFacts(f.quests, f.journal, { itemCounts: new Map([['item.leather', 2]]) });
    expect(f.counts.get('leather')).toBe(0);
  });
  it('future materials sold before the previous stage is ready are not falsely displayed as held', () => {
    const f = fixture(false);
    applyQuestSignal(f.quests, f.journal, { type: 'item-count', itemId: 'item.leather', quantity: 2 });
    applyQuestSignal(f.quests, f.journal, { type: 'item-count', itemId: 'item.leather', quantity: 0 });
    expect(f.counts.get('leather')).toBe(0);
    reconcileQuestFacts(f.quests, f.journal, { itemCounts: new Map([['item.leather', 2]]) });
    reconcileQuestFacts(f.quests, f.journal, { itemCounts: new Map() });
    expect(f.counts.get('leather')).toBe(0);
  });
});

describe('Primary Round273 review of cumulative time transaction', () => {
  function context(start: number): DialogueRuntimeContext {
    let elapsed = start;
    const quests = new Map<string, QuestData>();
    return {
      quests, journal: createQuestJournal(quests), items: new Map(), inventory: null,
      social: createSocialState(), speakerNpcId: 'npc.test', knownKnowledgeNodeIds: new Set(),
      knowledgeNodes: new Map(), character: null, factions: new Map(), martialArts: new Map(),
      factionState: createFactionMembershipState(), timeOfDayPeriodId: 'period.test',
      clock: { get elapsedMinutes() { return elapsed; }, advance(minutes) {
        if (!Number.isSafeInteger(elapsed + minutes)) return false;
        elapsed += minutes; return true;
      } },
    };
  }
  it('refuses cumulative overflow and leaves the live clock unchanged', () => {
    const start = Number.MAX_SAFE_INTEGER - 100, c = context(start);
    const result = applyDialogueEffects([{ kind: 'advanceTime', minutes: 64 }, { kind: 'advanceTime', minutes: 64 }], c);
    expect(result.ok).toBe(false);
    expect(c.clock!.elapsedMinutes).toBe(start);
  });
  it('commits both valid advances exactly once', () => {
    const c = context(355);
    const result = applyDialogueEffects([{ kind: 'advanceTime', minutes: 60 }, { kind: 'advanceTime', minutes: 120 }], c);
    expect(result.ok).toBe(true);
    expect(c.clock!.elapsedMinutes).toBe(535);
    if (result.ok) expect(result.summary.timeAdvancedMinutes).toBe(180);
  });
  it.each([-1, 0.5, NaN, Infinity])('refuses invalid live clock state %s without normalizing it', start => {
    const c = context(start);
    expect(applyDialogueEffects([{ kind: 'advanceTime', minutes: 60 }], c).ok).toBe(false);
    expect(c.clock!.elapsedMinutes).toBe(start);
  });
});
