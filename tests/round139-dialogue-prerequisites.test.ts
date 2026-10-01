import { describe, it, expect } from 'vitest';
import { describeOralPrerequisites } from '../src/game/dialogue-prerequisites';
import type { DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import type { DialogueNodeData } from '../src/engine/dialogue-graph';
const node: DialogueNodeData = { id: 'greet', text: '交谈', options: [{ text: '说明判断', nextNodeId: 'done', conditions: [{kind: 'knowledgeKnown', nodeId: 'message'}, {kind: 'questStatus',questId: 'quest',status: 'completed'}, {kind:'knowledgeKnown',nodeId:'done',isKnown:false}], effects: [{kind:'shareKnowledgeNode',nodeId:'message'}] }] };
const context = (known: string[], completed = true) => ({ quests: new Map([['quest',{name:'记雁'}]]), journal: { states: new Map([['quest', {status: completed ? 'completed' : 'active'}]]) }, knownKnowledgeNodeIds: new Set(known), knowledgeNodes: new Map([['message',{title:'口述'}],['done',{title:'已说明'}]]) } as unknown as DialogueRuntimeContext);
describe('Round139 oral prerequisite explanations', () => {
  it('reports ready conditions without running effects', () => {const c=context(['message']);expect(describeOralPrerequisites(node,c)).toContain('条件已齐');expect([...c.knownKnowledgeNodeIds]).toEqual(['message']);});
  it('reports actual missing knowledge and quest names',()=>{const text=describeOralPrerequisites(node,context([],false));expect(text).toContain('尚未取得「口述」');expect(text).toContain('差事「记雁」');});
  it('explains the one-time completion gate',()=>expect(describeOralPrerequisites(node,context(['message','done']))).toContain('已记录，不再重复'));
  it('keeps legacy conversation behavior',()=>expect(describeOralPrerequisites({id:'legacy',text:'交谈'},context([]))).toContain('没有需要核对'));
});
