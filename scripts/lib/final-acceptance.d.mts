export interface FinalAcceptanceEvidence {
  roundsRequired: number;
  roundPlans: number;
  completeRoundPlans: number;
  plansWithTenMinuteEstimate: number;
  roundCommits: number;
  totalCommitCount: number;
  manifestResources: number;
  schemaFamilies: number;
  counts: Record<string, number>;
  requiredDocuments: number;
  loreCandidateCount: number;
  engineLoreHits: number;
  engineSourceFiles: number;
  modOverrideResources: number;
  documentedOriginalSystems: number;
}

export interface FinalAcceptanceReport {
  ok: boolean;
  problems: string[];
  evidence: FinalAcceptanceEvidence;
}

export function auditFinalAcceptance(options: {
  root: string;
  commitSubjects: string[];
}): Promise<FinalAcceptanceReport>;
