/**
 * Type surface for the Round 103 authoring module, shared by the incremental
 * runner and the vitest suite. The implementation lives in the sibling .mjs;
 * only the shapes tests and the runner rely on are declared here.
 */

export interface FactionPracticeObjectiveDeclaration {
  id: string;
  kind: 'discoverKnowledge' | 'defeatEncounter' | 'collectItem' | 'talkToNpc';
  targetId: string;
  requiredCount: number;
  text: string;
}

export interface FactionPracticeConfig {
  key: 'tingyu' | 'tiezhang' | 'yunyin' | 'hanshan' | 'panzhou';
  questId: string;
  factionId: string;
  mentorCharId: string;
  mentorDialogueId: string;
  fieldDialogueId: string;
  outcomeNodeId: string;
  practiceNodeId: string;
  oldDescription: string;
  firstObjectiveText: string;
  experience: number;
  currency: number;
  description: string;
  objectives: FactionPracticeObjectiveDeclaration[];
  practiceTitle: string;
  practiceSummary: string;
  fieldBrief: string;
  mentorBrief: string;
  practiceEcho: string;
  verifyEcho: string;
  letterCopy: string;
  letterOption: string;
  training: string;
  fieldOption: string;
  mentorBriefOption: string;
  practiceEchoOption: string;
  verifyEchoOption: string;
  trainingOption: string;
}

export interface PracticeKnowledgeNode {
  id: string;
  kind: 'event';
  title: string;
  summary: string;
  knownByDefault: boolean;
}

export interface PracticeKnowledgeEdge {
  id: string;
  fromId: string;
  toId: string;
  relation: 'knows';
  summary: string;
}

export const wayfarerLetterNodeId: string;
export const wayfarerLetterSummary: string;
export const factionPracticeConfigs: FactionPracticeConfig[];
export const factionPracticeKnowledgeNodes: PracticeKnowledgeNode[];
export const factionPracticeKnowledgeEdges: PracticeKnowledgeEdge[];
export function patchFactionPracticeQuests(text: string): string;
export function patchFactionPracticeDialogues(text: string): string;
export function deepenFactionPracticeKnowledge(nodes: unknown, edges: unknown): { nodes: unknown; edges: unknown };
