import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('.'),temp=mkdtempSync(join(tmpdir(),'wuxia-r163-author-'));
const files=['dialogues/round-62-conversations.json','dialogues/round-67-conversations.json','dialogues/round-74-cloud-ridge-conversations.json','quests/round-07-quests.json','quests/round-74-cloud-ridge-quests.json','knowledge_graph/nodes.json','knowledge_graph/edges.json'];
for(const f of files){const p=join(temp,'data/base',f);mkdirSync(dirname(p),{recursive:true});copyFileSync(join(root,'data/base',f),p);}
mkdirSync(join(temp,'scripts'),{recursive:true});copyFileSync(join(root,'scripts/deepen-round100-mainland.mjs'),join(temp,'scripts/deepen-round100-mainland.mjs'));
const file=join(temp,'data/base/dialogues/round-67-conversations.json');
const shipped=JSON.parse(readFileSync(join(root,'data/base/dialogues/round-67-conversations.json'),'utf8')).conversations[0];
for(let run=0;run<2;run++){
 execFileSync(process.execPath,['scripts/deepen-round100-mainland.mjs'],{cwd:temp,stdio:'pipe'});
 const d=JSON.parse(readFileSync(file,'utf8')).conversations[0];
 for(const flag of ['aid','reserve']){const id=`r163-well-${flag}-followup`;assert.deepEqual(d.nodes.find(n=>n.id===id),shipped.nodes.find(n=>n.id===id));assert.deepEqual(d.nodes.find(n=>n.id===d.startNodeId).options.filter(o=>o.nextNodeId===id),shipped.nodes.find(n=>n.id===shipped.startNodeId).options.filter(o=>o.nextNodeId===id));}
 if(run===0)writeFileSync(join(temp,'first-dialogue.json'),readFileSync(file));else assert.equal(readFileSync(file,'utf8'),readFileSync(join(temp,'first-dialogue.json'),'utf8'));
}
console.log('Two isolated author runs: added follow-up nodes/options match shipped data; second dialogue output byte-stable. Historical unrelated text is outside this comparison. Sandbox:',temp);
