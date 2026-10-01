import type { DialogueNodeData } from '../engine/dialogue-graph';
import { isConditionMet, type DialogueRuntimeContext } from '../engine/dialogue-runtime';

/** Explain authored oral exchanges through normal UI without running effects. */
export function describeOralPrerequisites(node: DialogueNodeData, context: DialogueRuntimeContext): string {
  const exchanges = (node.options ?? []).filter(o => o.effects?.some(e => e.kind === 'shareKnowledgeNode'));
  if (exchanges.length === 0) return '当前这段交谈没有需要核对的口述传达。';
  return exchanges.map(o => {
    const missing = (o.conditions ?? []).filter(c => !isConditionMet(c, context)).map(c => {
      if (c.kind === 'questStatus') return `差事「${context.quests.get(c.questId)?.name ?? '相关差事'}」尚未达到要求`;
      if (c.kind === 'knowledgeKnown') {
        const title = context.knowledgeNodes.get(c.nodeId)?.title ?? '相关见闻';
        return c.isKnown === false ? `「${title}」已记录，不再重复` : `尚未取得「${title}」`;
      }
      return '当前尚不满足这段交谈的前提';
    });
    return `${o.text}：${missing.length ? missing.join('；') : '条件已齐，可从当前选项说明。'}`;
  }).join('\n');
}
