/**
 * Type surface for the Round 279 authoring module, shared by the incremental
 * runner and the vitest suite. The implementation lives in the sibling .mjs.
 */

export interface RoadKeeperNpc {
  id: string;
  name: string;
  mapResourceId: string;
  dialogueId: string;
  position: { col: number; row: number };
  spriteFrame: number;
  spriteFrames: { down: number; right: number; up: number; left: number };
}

export const ROAD_KEEPER_NPC: RoadKeeperNpc;
export const ROAD_KEEPER_NPC_FILE: string;
export const EXCHANGE_VARIABLE_KEY: string;
export const EXCHANGE_MINUTES: number;
export const ROAD_KEEPER_DIALOGUE_FILE: string;

export interface ForkSignRecord {
  id: string;
  mapResourceId: string;
  col: number;
  row: number;
}

export const FORK_SIGN_LANDMARK: ForkSignRecord & {
  name: string;
  category: 'settlement' | 'water' | 'crossing' | 'route' | 'other';
};
export const FORK_SIGN_EVENT: ForkSignRecord & {
  text: string;
  approachText: string;
  once: boolean;
  interaction: { prompt: string; approachDirections: ('up' | 'down' | 'left' | 'right')[] };
};

export const CLOUD_MAP_ID: string;
export const CLOUD_ADVICE_BEFORE: string;
export const CLOUD_ADVICE_AFTER: string;

export interface KnowledgeNodeRecord {
  id: string;
  kind: 'character' | 'place' | 'faction' | 'item' | 'martialArt' | 'event' | 'quest' | 'ending';
  title: string;
  summary: string;
  knownByDefault: boolean;
}

export const GRAPH_NODE: KnowledgeNodeRecord;

export interface KnowledgeEdgeRecord {
  id: string;
  fromId: string;
  toId: string;
  relation:
    | 'mentorOf' | 'parentOf' | 'hostileTo' | 'belongsTo' | 'locatedAt'
    | 'holds' | 'triggers' | 'requires' | 'rewards' | 'knows'
    | 'participatesIn' | 'influences';
  summary: string;
}

export const GRAPH_EDGES: KnowledgeEdgeRecord[];

export const MANIFEST_ENTRIES: { id: string; path: string; schema: string }[];

export function repairWorldMapRaw(raw: string): string;
export function repairGraphNodesRaw(raw: string): string;
export function repairGraphEdgesRaw(raw: string): string;
export function repairRegionGuideSourceRaw(source: string): string;
export function repairManifestRaw(raw: string): string;
export function staticResourceState(
  raw: string | undefined,
  expected: string,
  label: string,
): { present: boolean; ok: boolean };

export const R279_ROAD_EXCHANGE_EXPECTATION: {
  npcId: string;
  npcName: string;
  npcMap: string;
  npcCell: { col: number; row: number };
  routeCell: { col: number; row: number };
  dialogueId: string;
  variableKey: string;
  minutes: number;
  payItems: string[];
  gainItem: string;
  forkSignCell: { col: number; row: number };
  forkEventId: string;
  forkLandmarkId: string;
  adviceFragment: string;
};
