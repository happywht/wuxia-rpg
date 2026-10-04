export interface DialogueFact { conversationId: string; nodeId: string; before: string; after: string; }
export const dialogueFacts: DialogueFact[];
export const teaFact: { questId: string; objectiveId: string; before: string; after: string; };
export function repairDialogueFacts(raw: string): string;
export function repairQuestFacts(raw: string): string;
export const watchGate: { questId: string; before: string; after: string; edgeId: string; oldSummary: string; summary: string };
export function repairWatchPrerequisite(raw: string): string;
export function repairWatchEdge(raw: string): string;
export const prowlerId: string;
export const prowlerBehavior: object[];
export function repairProwler(raw: string): string;
