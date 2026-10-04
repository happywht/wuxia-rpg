import type { EnemyBehaviorStep } from '../../src/engine/turn-based-combat';
export const encounterId: string;
export const behavior: EnemyBehaviorStep[];
export const dialoguePatches: {id:string;before:string;after:string}[];
export function repairEncounterRaw(raw:string):string;
export function repairDialogueRaw(raw:string):string;
