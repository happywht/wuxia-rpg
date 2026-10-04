/**
 * Type surface for the Round 273 authoring module, shared by the incremental
 * runner and the vitest suite. The implementation lives in the sibling .mjs;
 * declarations reuse the engine's parsed-data shapes.
 */
import type { DialogueConditionData, DialogueEffectData } from '../../src/engine/dialogue-graph';

export const PIER_QUEST_ID: string;
export const PIER_REINFORCED_EVENT_ID: string;
export const PIER_CONSTRUCTION_MINUTES: number;

export interface PierDeliveryObjectiveDeclaration {
  id: string;
  kind: 'discoverKnowledge';
  targetId: string;
  requiredCount: number;
  navigationNpcId: string;
  text: string;
}

export const PIER_DELIVERY_OBJECTIVE: PierDeliveryObjectiveDeclaration;

export interface PierConfirmOption {
  text: string;
  nextNodeId: string;
  effects: DialogueEffectData[];
}

export interface PierDeliveryDialogueSpec {
  conversationId: string;
  readyOption: {
    text: string;
    nextNodeId: string;
    conditions: DialogueConditionData[];
  };
  progressOption: { text: string; nextNodeId: string; conditions: DialogueConditionData[] };
  confirmNode: {
    id: string;
    confirmEffects: true;
    text: string;
    options: PierConfirmOption[];
  };
  progressNode: { id: string; text: string };
  deliveredNode: { id: string; text: string };
}

export const PIER_DELIVERY_DIALOGUE: PierDeliveryDialogueSpec;

export const PIER_NODE_UPDATE: { id: string; summary: string };
export const PIER_EDGE_UPDATE: { id: string; summary: string };
export const ADVANCE_TIME_SCHEMA_ENTRY: string;

export function repairQuestsRaw(raw: string): string;
export function repairDialoguesRaw(raw: string): string;
export function repairKnowledgeGraph(
  nodesDoc: { nodes: { id: string; summary: string }[] },
  edgesDoc: { edges: { id: string; summary: string }[] },
): { nodesDoc: unknown; edgesDoc: unknown; changed: boolean };

export function repairDialogueSchemaRaw(raw: string): string;

export const R273_PIER_DELIVERY_EXPECTATION: {
  questId: string;
  deliveryObjectiveId: string;
  eventId: string;
  conversationId: string;
  confirmNodeId: string;
  constructionMinutes: number;
};
