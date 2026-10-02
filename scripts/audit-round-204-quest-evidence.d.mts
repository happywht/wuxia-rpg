export type QuestEvidenceRow = {
  id: string;
  categories: string[];
  implementation: string;
  journey: string;
  journeyStatus: string;
};
export function evaluateQuestEvidence(
  ledger: { quests?: QuestEvidenceRow[] },
  options: { knownQuestIds: Set<string>; existingEvidence: Set<string> },
): { issues: string[]; implementedCount: number; journeyCount: number; categoryCoverage: string[] };
export function runAudit(repoRoot?: string): ReturnType<typeof evaluateQuestEvidence>;
