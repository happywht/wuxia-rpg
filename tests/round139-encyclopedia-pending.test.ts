import { describe, it, expect } from 'vitest';
import { isPendingEncyclopediaEntry } from '../src/game/encyclopedia-progress';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
const node: KnowledgeNodeData = { id: 'message', kind: 'event', title: '判断', summary: '口述', knownByDefault: false, progress: { completedByNodeId: 'done', pendingLabel: '待说明', completedLabel: '已说明' } };
describe('Round139 pending encyclopedia entries', () => {
  it('includes a discovered unfinished message', () => expect(isPendingEncyclopediaEntry(node, new Set(['message']))).toBe(true));
  it('excludes completed messages', () => expect(isPendingEncyclopediaEntry(node, new Set(['message', 'done']))).toBe(false));
  it('never exposes undiscovered entries', () => expect(isPendingEncyclopediaEntry(node, new Set(['done']))).toBe(false));
  it('excludes legacy entries without progress', () => { const { progress: _, ...legacy } = node; expect(isPendingEncyclopediaEntry(legacy, new Set(['message']))).toBe(false); });
  it('does not mutate knowledge or entries', () => { const known = new Set(['message']); const before = JSON.stringify(node); isPendingEncyclopediaEntry(node, known); expect([...known]).toEqual(['message']); expect(JSON.stringify(node)).toBe(before); });
});
