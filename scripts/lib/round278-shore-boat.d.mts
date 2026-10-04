/**
 * Type surface for the Round 278 authoring module, shared by the incremental
 * runner and the vitest suite. The implementation lives in the sibling .mjs.
 */
export interface ShoreBoatTransition {
  id: string;
  from: { mapResourceId: string; col: number; row: number };
  to: { mapResourceId: string; col: number; row: number };
  fare: number;
  travelMinutes: number;
  name: string;
}

export const SHORE_BOAT_TRANSITIONS: ShoreBoatTransition[];
export const FERRY_ADVICE_BEFORE: string;
export const FERRY_ADVICE_AFTER: string;

export interface ShoreBoatDialogueSpec {
  conversationId: string;
  infoOption: { text: string; nextNodeId: string };
  infoNode: { id: string; text: string };
}

export const SHORE_BOAT_DIALOGUE: ShoreBoatDialogueSpec;

export function repairWorldMapRaw(raw: string): string;
export function repairRegionGuideSourceRaw(source: string): string;
export function repairDialoguesRaw(raw: string): string;

export const R278_SHORE_BOAT_EXPECTATION: {
  transitionIds: string[];
  fare: number;
  travelMinutes: number;
  mapResourceId: string;
  source: { col: number; row: number };
  landing: { col: number; row: number };
  returnSource: { col: number; row: number };
  returnLanding: { col: number; row: number };
  adviceFragment: string;
  dialogueNodeId: string;
};
