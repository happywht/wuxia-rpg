import { describe, it, expect } from 'vitest';
import { describeEncyclopediaProgress, paginateEncyclopediaSummary } from '../src/game/encyclopedia-progress';
import type { KnowledgeNodeData } from '../src/engine/knowledge-graph';
const node: KnowledgeNodeData = {id:'event.message',kind:'event',title:'历史待送标题',summary:'历史判断',knownByDefault:false,progress:{completedByNodeId:'event.done',pendingLabel:'待亲口说明',completedLabel:'已亲口说明'}};
describe('Round138 encyclopedia current progress',()=>{
  it('keeps pending history and current progress separate',()=>{expect(describeEncyclopediaProgress(node,new Set([node.id]))).toBe('玩家进度：待亲口说明');expect(node.title).toBe('历史待送标题');});
  it('completed wins while preserving the historical entry',()=>{expect(describeEncyclopediaProgress(node,new Set([node.id,'event.done']))).toBe('玩家进度：已亲口说明');});
  it('unknown entries never disclose progress even with a completion observation',()=>{expect(describeEncyclopediaProgress(node,new Set(['event.done']))).toBeUndefined();});
  it('legacy entries without progress retain the old presentation',()=>{const {progress:_,...legacy}=node;expect(describeEncyclopediaProgress(legacy,new Set([legacy.id]))).toBeUndefined();});
  it('wraps and paginates Chinese summaries without loss or word-space dependence',()=>{const text='云阶与界标各自核证。'.repeat(30);const pages=paginateEncyclopediaSummary(text,40,60,20,s=>Array.from(s).length*10);expect(pages.length).toBeGreaterThan(1);expect(pages.join('').replace(/\n/g,'')).toBe(text);for(const page of pages){expect(page.split('\n').length).toBeLessThanOrEqual(3);for(const line of page.split('\n'))expect(Array.from(line).length*10).toBeLessThanOrEqual(40);}});
  it('invalid dimensions cannot erase the summary',()=>{expect(paginateEncyclopediaSummary('事实',20,NaN,20,s=>s.length*10)).toEqual(['事实']);});
  it('larger line height reduces capacity without losing paragraphs or graphemes',()=>{const text='界标👨‍👩‍👧‍👦\n巡路'.repeat(8);const measure=(s:string)=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)).length*10;const pages=paginateEncyclopediaSummary(text,30,45,30,measure);expect(pages.every(p=>p.split('\n').length===1)).toBe(true);expect(pages.join('\n').replace(/\n/g,'')).toBe(text.replace(/\n/g,''));});
});
