export interface DialogueNodeLike { text?: string }
export interface DialogueFileLike { conversations: { nodes: DialogueNodeLike[] }[] }
export function repairYunyinPracticeBrief<T extends DialogueFileLike>(dialogues: T): T;
export const YUNYIN_PRICE_ANCHOR_NEW: string;
