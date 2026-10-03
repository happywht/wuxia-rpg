import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import {
  applyQuestSignal,
  createQuestJournal,
  parseQuestSet,
} from '../src/engine/quest-system';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const questResult = parseQuestSet(read('data/base/quests/round-07-quests.json'));
if (!questResult.ok) throw new Error(questResult.errors.join('\n'));
const dialogueResult = parseDialogueSet(read('data/base/dialogues/round-30-conversations.json'));
if (!dialogueResult.ok) throw new Error(dialogueResult.errors.join('\n'));

const provisioningId = 'quest.r31-caravan-provisioning';
const appointmentId = 'event.r31-caravan-time-agreed';

describe('Round254 药队预约需要玩家明确敲定', () => {
  it('ordinary talk cannot complete the schedule objective; the explicit knowledge signal unlocks both branches', () => {
    const quests = new Map(questResult.set.quests.map((quest) => [quest.id, quest]));
    const provisioning = quests.get(provisioningId)!;
    const appointment = provisioning.objectives.find((objective) => objective.id === 'objective.r31-caravan-ferry-time')!;
    expect(appointment).toMatchObject({ kind: 'discoverKnowledge', targetId: appointmentId });

    const journal = createQuestJournal(quests);
    journal.states.get('quest.r31-herbal-stocktaking')!.status = 'completed';
    journal.states.get('quest.r31-mist-shore-watch')!.status = 'completed';
    journal.states.get(provisioningId)!.status = 'active';

    applyQuestSignal(quests, journal, { type: 'item-count', itemId: 'item.wuji-dan', quantity: 1 });
    const greeting = applyQuestSignal(quests, journal, { type: 'npc-talk', npcId: 'char.bai-luzhou' });
    expect(greeting.completed).toHaveLength(0);
    expect(journal.states.get(provisioningId)?.status).toBe('active');
    expect(journal.states.get('quest.r31-guard-the-caravan')?.status).toBe('locked');
    expect(journal.states.get('quest.r31-mend-the-pier')?.status).toBe('locked');

    const agreement = applyQuestSignal(quests, journal, { type: 'knowledge-discovery', nodeId: appointmentId });
    expect(agreement.completed.map((reward) => reward.questId)).toContain(provisioningId);
    expect(journal.states.get('quest.r31-guard-the-caravan')?.status).toBe('offered');
    expect(journal.states.get('quest.r31-mend-the-pier')?.status).toBe('offered');
  });

  it('the greeting only exposes the explicit appointment choice while the active quest and pill are present', () => {
    const conversation = dialogueResult.set.conversations.find((entry) => entry.id === 'dlg.bai-luzhou-ferry-master')!;
    const greeting = conversation.nodes.find((node) => node.id === 'greet')!;
    const option = greeting.options?.find((choice) => choice.nextNodeId === 'r31-caravan-time-agreed');
    expect(option?.conditions).toEqual([
      { kind: 'questStatus', questId: provisioningId, status: 'active' },
    ]);
    expect(option?.effects).toEqual([
      { kind: 'discoverKnowledgeNode', nodeId: appointmentId },
      { kind: 'takeItem', itemId: 'item.wuji-dan', quantity: 1 },
    ]);
    expect(conversation.nodes.find((node) => node.id === 'r31-caravan-time-agreed')?.text)
      .toContain('先保药队过雾桥，还是先修牢栈桥');
  });
});
