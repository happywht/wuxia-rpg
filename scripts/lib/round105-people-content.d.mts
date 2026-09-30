import type { DialogueData } from '../../src/engine/dialogue-graph';
import type { CompanionStanceRuleData } from '../../src/engine/companion-system';
export interface PersonDefinition {
  npcId: string; dialogueId: string; file: string; questId: string;
  before: string; active: string; after: string;
}
export interface RelayDefinition {
  key: string; sourceNpcId: string; targetNpcId: string;
  sourceDialogueId: string; targetDialogueId: string; sourceQuestId?: string; targetQuestId: string;
  sourceGate: string; sourceSharedAny?: string[]; title: string; sourceText: string;
  variants: { flag: string; delta: number; text: string }[];
}
export const people: PersonDefinition[];
export const relays: RelayDefinition[];
export const sharingChoices: [string, string, string][];
export const stanceRules: CompanionStanceRuleData[];
export const knowledgeNodes: { id: string; kind: string; title: string; summary: string; knownByDefault: boolean }[];
export const knowledgeEdges: { id: string; fromId: string; toId: string; relation: string; summary: string }[];
export function deepenPeopleConversation(conversation: DialogueData): DialogueData;

export function deepenPeopleDialogues<T extends { conversations: DialogueData[] }>(set: T): T;
