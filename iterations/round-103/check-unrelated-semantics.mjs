import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const before=path=>JSON.parse(execFileSync('git',['show','c74c287:'+path],{cwd:fileURLToPath(root),encoding:'utf8'}));
const after=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const path='data/base/quests/round-07-quests.json';
const oldQuests=before(path).quests,newQuests=after(path).quests;
assert.deepEqual(newQuests.map(q=>q.id),oldQuests.map(q=>q.id),'任务集合/顺序保持');
for(const q of oldQuests){if(q.id.startsWith('quest.r43-'))continue;assert.deepEqual(newQuests.find(n=>n.id===q.id),q,'未涉及任务 '+q.id);}
let preservedNodes=0,preservedOptions=0;
for(const path of ['data/base/dialogues/round-03-conversations.json','data/base/dialogues/round-30-conversations.json']){
 const old=before(path).conversations,current=after(path).conversations;
 assert.deepEqual(current.map(d=>d.id),old.map(d=>d.id),'对话ID保持 '+path);
 for(const d of old){const n=current.find(n=>n.id===d.id);assert.equal(n.startNodeId,d.startNodeId);
  for(const oldNode of d.nodes){const node=n.nodes.find(n=>n.id===oldNode.id);assert.ok(node,'原节点保留 '+oldNode.id);
   if(oldNode.id.startsWith('r43-'))continue;
   if(oldNode.id===d.startNodeId){assert.equal(node.text,oldNode.text,'原开场文案 '+d.id);assert.deepEqual(node.options.filter(o=>!o.nextNodeId.startsWith('r103-')),oldNode.options,'原入口保持 '+d.id);preservedOptions+=oldNode.options.length;}
   else{assert.deepEqual(node,oldNode,'非R43原节点保持 '+d.id+'/'+oldNode.id);preservedNodes++;}
  }
 }
}
for(const [path,key] of [['data/base/knowledge_graph/nodes.json','nodes'],['data/base/knowledge_graph/edges.json','edges']]){
 const old=before(path)[key],current=after(path)[key];assert.equal(current.length,old.length+5,'只增5项 '+key);
 for(const entry of old){const n=current.find(n=>n.id===entry.id);assert.ok(n);if(entry.id==='event.r43-wayfarer-letter'){assert.deepEqual({...n,summary:entry.summary},entry);}else assert.deepEqual(n,entry,'原图谱条目 '+entry.id);}
}
console.log(`无关语义保持：原任务集合、${preservedNodes}个非R43节点、${preservedOptions}个原入口、原图谱；仅5项任务/实践见闻和匿名信摘要属于本轮范围。`);
