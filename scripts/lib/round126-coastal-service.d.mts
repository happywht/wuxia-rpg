import type { RegionTransitionData } from '../../src/engine/world-map';
import type { DialogueSetData } from '../../src/engine/dialogue-graph';
export const COASTAL_SERVICE_KNOWLEDGE: string;
export const COASTAL_SERVICES: RegionTransitionData[];
export function addCoastalService<T extends { transitions: { id: string }[] }>(world: T): T;
export function addCoastalServiceDirections<T extends DialogueSetData>(set: T): T;
