import type { DialogueData, DialogueNodeData, DialogueOptionData } from '../../src/engine/dialogue-graph';
export const escortNode: DialogueNodeData;
export const escortArrived: DialogueNodeData;
export const escortOption: DialogueOptionData;
export function addBookshopEscort(conversation: DialogueData): DialogueData;
export function patchBookshopEscortRaw(original: string): string;
