import {readFile,writeFile} from 'node:fs/promises';
import {knowledgeNodes} from './lib/round105-people-content.mjs';
const path=new URL('../data/base/knowledge_graph/nodes.json',import.meta.url),before=await readFile(path,'utf8'),set=JSON.parse(before);
for(const authored of knowledgeNodes.filter(n=>n.progress)){const node=set.nodes.find(n=>n.id===authored.id);if(!node)throw new Error(`Missing ${authored.id}`);node.progress=structuredClone(authored.progress);}
const newline=before.includes('\r\n')?'\r\n':'\n';const after=(JSON.stringify(set,null,2)+'\n').replace(/\n/g,newline);if(before!==after)await writeFile(path,after);
console.log('Round134: three existing knowledge progress annotations, no new nodes or save fields.');
