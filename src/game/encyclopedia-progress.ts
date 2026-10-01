import { projectKnowledgeProgress, type KnowledgeNodeData } from '../engine/knowledge-graph';
import { paginateDialogueLines, wrapDialogueText } from './dialogue-layout';

export function paginateEncyclopediaSummary(text: string, width: number, height: number, lineHeight: number, measure: (text: string) => number): string[] {
  return paginateDialogueLines(wrapDialogueText(text, width, measure), Number.isFinite(height / lineHeight) ? Math.max(1, Math.floor(height / Math.max(1, lineHeight))) : 1);
}

/** Never project undiscovered node details into the encyclopedia. */
export function describeEncyclopediaProgress(node: KnowledgeNodeData, known: ReadonlySet<string>): string | undefined {
  if (!known.has(node.id)) return undefined;
  const progress = projectKnowledgeProgress(node, known);
  return progress === undefined ? undefined : `玩家进度：${progress.label}`;
}
