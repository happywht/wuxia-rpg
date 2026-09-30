import { readFile,writeFile } from 'node:fs/promises';
import { deepenNorthQuests,deepenNorthDialogues,northKnowledgeNodes,NORTH_CHALLENGE_ID } from './lib/round101-north-content.mjs';
const base=new URL('../data/base/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const save=async(path,value)=>writeFile(new URL(path,base),JSON.stringify(value,null,2)+'\n');
for(const name of ['round-91-cloud-north-terrace','round-92-north-pass','round-93-snow-pine-valley','round-94-frontiers']){
 await save('quests/'+name+'-quests.json',deepenNorthQuests(await load('quests/'+name+'-quests.json')));
 await save('dialogues/'+name+'-conversations.json',deepenNorthDialogues(await load('dialogues/'+name+'-conversations.json')));
}
const encounter={id:NORTH_CHALLENGE_ID,name:'照雪燧台冒号客',mapResourceId:'map.round-92-north-pass',position:{col:62,row:25},profileId:'char.scribe-apprentice',enemy:{name:'冒号索路头目',attributes:{body:10,force:11,agility:8,insight:6,resolve:8},health:76,qi:20,martialArtIds:['skill.jianghu-sanshou','skill.tiezhang-zhuanggong']},victoryExperience:48,defeatRecovery:{healthRatio:0.6,qiRatio:0.6},repeatable:false,texts:{approach:'燧台东南有人借烽号索路钱，按E阻止',intro:'头目举着学来的三烽牌：「谁分得清真火假火？留下过路药，才肯让你报信。」',victory:'冒号客丢下假牌逃走，燧台附近不再被这伙人借号索钱。',defeat:'你被逼退到雪坡，伤势稍复后可再来，调查见闻不会因此丢失。',flee:'你退到关墙下，冒号客仍在燧台东南。'}};
const battlePath=new URL('battles/round-05-encounters.json',base);const raw=await readFile(battlePath,'utf8');const battle=JSON.parse(raw);const previous=battle.encounters.find(e=>e.id===encounter.id);
if(previous){if(JSON.stringify(previous)!==JSON.stringify(encounter))throw Error('本轮受管遭遇已改动，请先复核，拒绝覆盖。');}
else{const end=raw.lastIndexOf('\n  ]');if(end<0)throw Error('遭遇数组闭合格式不匹配，拒绝写入。');const text=JSON.stringify(encounter,null,2).split('\n').map(line=>'    '+line).join('\n');await writeFile(battlePath,raw.slice(0,end).trimEnd()+',\n'+text+raw.slice(end));}
const nodes=await load('knowledge_graph/nodes.json'),edges=await load('knowledge_graph/edges.json');
const upsert=(list,v)=>{const i=list.findIndex(e=>e.id===v.id);if(i<0)list.push(v);else list[i]=v;};
for(const n of northKnowledgeNodes){upsert(nodes.nodes,n);const suffix=n.id.slice('event.r101-'.length);upsert(edges.edges,{id:'kg.edge.r101-'+suffix,fromId:suffix.startsWith('code')?'char.r92-gu-zhaoxue':suffix.startsWith('mark')?'char.r93-liu-xunjing':'char.r94-shen-wenqiu',toId:n.id,relation:'knows',summary:'人物在条件对白中处理或复核此事；静态百科关系不表示运行时已知。'});}
await save('knowledge_graph/nodes.json',nodes);await save('knowledge_graph/edges.json',edges);
console.log('Round101：四项既有任务有序推进，两处立场、跨人物回应、8见闻与照雪挑战；地图/任务ID不变。');
