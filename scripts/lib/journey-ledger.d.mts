/**
 * Type surface for the Round 282 journey evidence ledger. The implementation
 * lives in the sibling .mjs; the vitest suite and the audit CLI share it.
 */

export type LedgerChangeKind = 'added' | 'removed' | 'changed';

export interface LedgerViolation {
  code: string;
  message: string;
  index?: number;
  fromIndex?: number;
  toIndex?: number;
  [extra: string]: unknown;
}

export interface LedgerWarning {
  code: string;
  message: string;
  fromIndex?: number;
  toIndex?: number;
  [extra: string]: unknown;
}

export interface PairScope {
  fromIndex: number;
  toIndex: number;
}

export interface NumericChange {
  from: number | null;
  to: number | null;
  delta: number;
  change: LedgerChangeKind;
}

export interface TimeDeltas {
  elapsedGameMinutes: Array<PairScope & { from: number; to: number; delta: number }>;
  savedAt: Array<PairScope & { from: string | null; to: string | null; deltaMs: number }>;
  totals: { elapsedGameMinutes: number | null; savedAtMs: number | null };
}

export interface ResourceDeltas {
  currency: Array<PairScope & NumericChange>;
  stats: Array<PairScope & NumericChange & { stat: string }>;
  inventory: Array<PairScope & NumericChange & { itemId: string }>;
}

export interface QuestDeltas {
  statuses: Array<PairScope & { questId: string; fromStatus: string | null; toStatus: string | null }>;
  objectives: Array<PairScope & NumericChange & { questId: string; objectiveId: string }>;
}

export interface KnowledgeDeltas {
  knownNodeIds: Array<PairScope & { nodeId: string; change: 'added' | 'removed' }>;
  npcKnowledge: Array<PairScope & { npcId: string; added: string[]; removed: string[] }>;
}

export interface RelationshipDeltas {
  values: Array<PairScope & NumericChange & { npcId: string }>;
  factionRenown: Array<PairScope & NumericChange & { factionId: string }>;
  scalars: Array<PairScope & NumericChange & { field: string }>;
}

export type VariableDeltas = Array<PairScope & { key: string; fromValue: unknown; toValue: unknown; change: LedgerChangeKind }>;

export interface EncounterDeltas {
  completedEncounters: Array<PairScope & { encounterId: string; change: 'added' | 'removed' }>;
  completedRegionalEvents: Array<PairScope & { eventId: string; change: 'added' | 'removed' }>;
}

export interface LedgerGuardrails {
  measuredDifferencesOnly: boolean;
  infersGameplayFromTaskCounts: boolean;
  claimsJourneyCompletion: boolean;
  claimsHumanPlaytime: boolean;
  note: string;
}

export interface LedgerMetadataUsage {
  validationOnly: string[];
  evidenceOnly: string;
  note: string;
}

export interface LedgerObserved {
  candidates: string[];
  qaRuns: string[];
  stages: Array<string | null>;
  sourceSlotIds: Array<string | null>;
  slotTransitions: Array<{ fromIndex: number; toIndex: number; fromSlot: string; toSlot: string }>;
  worldSeeds: number[];
  profileIds: string[];
}

export interface JourneyLedgerDeltas {
  time: TimeDeltas;
  resources: ResourceDeltas;
  quests: QuestDeltas;
  knowledge: KnowledgeDeltas;
  relationships: RelationshipDeltas;
  variables: VariableDeltas;
  encounters: EncounterDeltas;
}

export interface JourneyLedgerReport {
  format: string;
  version: number;
  ok: boolean;
  checkpointCount: number;
  expectedCandidate: string | null;
  observed: LedgerObserved;
  violations: LedgerViolation[];
  warnings: LedgerWarning[];
  guardrails: LedgerGuardrails;
  metadataUsage: LedgerMetadataUsage;
  deltas: JourneyLedgerDeltas;
}

export const LEDGER_FORMAT: string;
export const LEDGER_VERSION: number;
export const SUPPORTED_CHECKPOINT_FORMAT: string;
export const SUPPORTED_CHECKPOINT_VERSION: number;

/**
 * Audits ordered QA checkpoint envelopes against one explicit expected
 * candidate and computes measured gameplay deltas between adjacent
 * checkpoints. Pure: performs no I/O and never mutates its inputs.
 */
export function computeJourneyLedger(
  checkpoints: readonly unknown[],
  expectedCandidate: string | undefined,
): JourneyLedgerReport;
