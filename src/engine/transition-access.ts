import type { RegionTransitionData } from './world-map';

/** Legacy gates are open; an authored service can require a persistent discovery. */
export function transitionAccessReason(
  transition: Readonly<RegionTransitionData>, known: ReadonlySet<string> = new Set(),
): string | null {
  const required = transition.requiredKnowledgeNodeId;
  return required === undefined || known.has(required) ? null
    : transition.lockedText ?? `需先取得见闻「${required}」，当前不能乘行。`;
}
