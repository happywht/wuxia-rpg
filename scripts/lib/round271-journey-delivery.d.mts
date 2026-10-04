/**
 * Type surface for the Round 271 authoring module, shared by the incremental
 * runner and the vitest suite. The implementation lives in the sibling .mjs;
 * declarations reuse the engine's parsed-data shapes so tests can hand the
 * authored entries straight to the real interpreters.
 */
import type { DialogueConditionData, DialogueEffectData } from '../../src/engine/dialogue-graph';
import type { KnowledgeEdgeData, KnowledgeNodeData } from '../../src/engine/knowledge-graph';

export const MEDICINE_QUEST_ID: string;
export const TEASTALL_QUEST_ID: string;
export const MEDICINE_EVENT_ID: string;
export const TEASTALL_EVENT_ID: string;

export interface DeliveryDialogueSpec {
  conversationId: string;
  readyOption: {
    text: string;
    nextNodeId: string;
    conditions: DialogueConditionData[];
    effects: DialogueEffectData[];
  };
  progressOption: { text: string; nextNodeId: string; conditions: DialogueConditionData[] };
  echoOption: { text: string; nextNodeId: string; conditions: DialogueConditionData[] };
  progressNode: { id: string; text: string };
  deliveredNode: { id: string; text: string };
  echoNode: { id: string; text: string };
}

export const DELIVERY_DIALOGUES: DeliveryDialogueSpec[];

export const CRAFTING_HINT_FIXES: { objectiveId: string; oldText: string; newText: string }[];

export const DELIVERY_NODES: KnowledgeNodeData[];
export const DELIVERY_EDGES: KnowledgeEdgeData[];

export function repairQuestsRaw(raw: string): string;
export function repairDialoguesRaw(raw: string): string;
export function repairKnowledgeGraph(
  nodesDoc: { nodes: KnowledgeNodeData[] },
  edgesDoc: { edges: KnowledgeEdgeData[] },
): { nodesDoc: { nodes: KnowledgeNodeData[] }; edgesDoc: { edges: KnowledgeEdgeData[] } };

export const R271_DELIVERY_EXPECTATION: {
  deliveryQuestIds: string[];
  deliveryObjectiveIds: string[];
  eventNodeIds: string[];
  edgeIds: string[];
};
