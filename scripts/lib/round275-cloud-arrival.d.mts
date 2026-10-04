import type { DialogueNodeData, DialogueOptionData } from '../../src/engine/dialogue-graph';
export const guidePatches: { id: string; before: string; after: string; later?: string[] }[];
export const eventPatches: { id: string; before: string; after: string }[];
export const arrivalNodes: DialogueNodeData[];
export const arrivalOptions: DialogueOptionData[];
export function repairWorldRaw(raw: string): string;
export function repairRegionSourceRaw(raw: string): string;
export function repairArrivalRaw(raw: string): string;
