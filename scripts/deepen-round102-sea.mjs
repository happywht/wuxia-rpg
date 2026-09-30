import {readFile,writeFile} from 'node:fs/promises';
import {deepenSeaQuests,deepenSeaDialogues,seaKnowledgeNodes} from './lib/round102-sea-content.mjs';
const base=new URL('../data/base/',import.meta.url);
const load=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
const save=async(p,v)=>writeFile(new URL(p,base),JSON.stringify(v,null,2)+'\n');
for(const n of ['round-83-east-coast','round-84-windward-isle','round-85-tide-isle','round-97-lanxin-reef'])await save('quests/'+n+'-quests.json',deepenSeaQuests(await load('quests/'+n+'-quests.json')));
for(const n of ['round-83-east-coast','round-84-windward-isle','round-85-tide-isle','round-97-lanxin-reef'])await save('dialogues/'+n+'-conversations.json',deepenSeaDialogues(await load('dialogues/'+n+'-conversations.json')));
const nodes=await load('knowledge_graph/nodes.json'),edges=await load('knowledge_graph/edges.json');
const upsert=(list,v)=>{const i=list.findIndex(e=>e.id===v.id);if(i<0)list.push(v);else list[i]=v;};
for(const n of seaKnowledgeNodes){upsert(nodes.nodes,n);const suffix=n.id.slice('event.r102-'.length);upsert(edges.edges,{id:'kg.edge.r102-'+suffix,fromId:['shore-aid','keeper-aid','supply-settled'].includes(suffix)?'char.r83-gu-chaosheng':suffix.startsWith('pilot')?'char.r97-ji-wuchao':'char.r97-yu-xingcha',toId:n.id,relation:'knows',summary:'条件对白处理和回应此事，静态关系不替代运行时见闻。'});}
await save('knowledge_graph/nodes.json',nodes);await save('knowledge_graph/edges.json',edges);
console.log('Round102：六既有差事、沿海补给与传航两处决定、8见闻；地图/任务ID与奖励不变。');
