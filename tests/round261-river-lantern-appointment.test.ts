import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createCharacterState, parseCharacterProfileSet } from '../src/engine/character-progression';
import { createInventoryState, indexItems, parseItemSet } from '../src/engine/item-system';
import { parseQuestSet, applyQuestSignal, createQuestJournal, type QuestData } from '../src/engine/quest-system';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createSocialState } from '../src/engine/social-state';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../data/base/${path}`, import.meta.url), 'utf8'));
const questSet = (() => { const result = parseQuestSet(read('quests/round-07-quests.json')); if (!result.ok) throw new Error(result.errors.join('\n')); return result.set; })();
const dialogueSet = (() => { const result = parseDialogueSet(read('dialogues/round-30-conversations.json')); if (!result.ok) throw new Error(result.errors.join('\n')); return result.set; })();
const itemSet = (() => { const result = parseItemSet(read('items/round-06-items.json')); if (!result.ok) throw new Error(result.errors.join('\n')); return result.set; })();
const profileSet = (() => { const result = parseCharacterProfileSet(read('characters/round-04-profiles.json')); if (!result.ok) throw new Error(result.errors.join('\n')); return result.set; })();

const questId = 'quest.r31-river-lantern-promise';
const eventId = 'event.r31-river-lantern-time-agreed';
const conversation = dialogueSet.conversations.find((entry) => entry.id === 'dlg.bai-luzhou-ferry-master')!;
const greet = conversation.nodes.find((node) => node.id === 'greet')!;

function runtime(): DialogueRuntimeContext {
  const quests = new Map<string, QuestData>(questSet.quests.map((quest) => [quest.id, quest]));
  const profile = profileSet.profiles[0]!;
  const context: DialogueRuntimeContext = {
    quests,
    journal: createQuestJournal(quests),
    items: indexItems(itemSet).byId,
    inventory: createInventoryState(profile, [{ itemId: 'item.luodie-hua', quantity: 3 }]),
    social: createSocialState(),
    speakerNpcId: 'char.bai-luzhou',
    knownKnowledgeNodeIds: new Set(),
    knowledgeNodes: new Map<string, KnowledgeNodeData>(
      (read('knowledge_graph/nodes.json') as { nodes: KnowledgeNodeData[] }).nodes.map((node) => [node.id, node]),
    ),
    character: createCharacterState(profile),
    factions: new Map(),
    martialArts: new Map(),
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: 'period.midday',
  };
  context.journal.states.get(questId)!.status = 'active';
  return context;
}

describe('Round261 河灯船位必须由明确对白约定', () => {
  it('ordinary talk is insufficient; discovering the appointment event completes the task', () => {
    const context = runtime();
    const objective = context.quests.get(questId)!.objectives.find((entry) => entry.id === 'objective.r31-lantern-appointment')!;
    expect(objective).toMatchObject({ kind: 'discoverKnowledge', targetId: eventId });

    applyQuestSignal(context.quests, context.journal, { type: 'item-count', itemId: 'item.luodie-hua', quantity: 3 });
    applyQuestSignal(context.quests, context.journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    expect(context.journal.states.get(questId)?.status).toBe('active');
    expect(context.journal.states.get(questId)?.objectiveCounts.get(objective.id)).toBe(0);

    applyQuestSignal(context.quests, context.journal, { type: 'knowledge-discovery', nodeId: eventId });
    expect(context.journal.states.get(questId)?.status).toBe('completed');
  });

  it('only shows the appointment choice when the quest is active and all three flowers are held', () => {
    const context = runtime();
    const option = greet.options?.find((choice) => choice.nextNodeId === 'r31-river-lantern-time-agreed')!;
    expect(option.conditions).toEqual([
      { kind: 'questStatus', questId, status: 'active' },
      { kind: 'itemCount', itemId: 'item.luodie-hua', minCount: 3 },
    ]);
    expect(getVisibleOptions(greet, context).some((entry) => entry.option === option)).toBe(true);

    context.inventory!.stacks[0]!.quantity = 2;
    expect(getVisibleOptions(greet, context).some((entry) => entry.option === option)).toBe(false);
    context.inventory!.stacks[0]!.quantity = 3;
    expect(applyDialogueEffects(option.effects ?? [], context).ok).toBe(true);
    expect(context.knownKnowledgeNodeIds.has(eventId)).toBe(true);
    expect(conversation.nodes.find((node) => node.id === 'r31-river-lantern-time-agreed')?.text)
      .toContain('时辰');
  });
});
