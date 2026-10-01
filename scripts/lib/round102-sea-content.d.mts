export const seaQuestIds: readonly string[];
export const PILOT_COST_HINT: string;
export function deepenSeaQuests<T extends {quests: unknown[]}>(set: T): T;
export function deepenSeaDialogues<T extends {conversations: unknown[]}>(set: T): T;
export const seaKnowledgeNodes: readonly {id:string;kind:'event';title:string;summary:string;knownByDefault:false}[];
