import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {people} from '../../scripts/lib/round105-people-content.mjs';
const baseline='c4996bfb381199da4edaf5f7daec9e4e30bccbd8';
const old=p=>JSON.parse(execFileSync('git',['show',`${baseline}:${p}`],{encoding:'utf8',maxBuffer:64*1024*1024}));
const now=p=>JSON.parse(readFileSync(p,'utf8'));
const requireSame=(a,b,label)=>{if(!isDeepStrictEqual(a,b))throw Error('changed unrelated semantics: '+label);};
for(const dir of ['quests','maps','characters','skills','shops'])for(const f of readdirSync('data/base/'+dir).filter(f=>f.endsWith('.json'))){const p=`data/base/${dir}/${f}`;requireSame(old(p),now(p),p);}
for(const person of people){const path='data/base/dialogues/'+person.file,before=old(path),after=now(path);for(const d of before.conversations){const present=structuredClone(after.conversations.find(c=>c.id===d.id));present.nodes=present.nodes.filter(n=>!n.id.startsWith('r105-'));for(const n of present.nodes)if(n.options)n.options=n.options.filter(o=>!o.nextNodeId?.startsWith('r105-'));requireSame(d,present,d.id);}}
for(const key of ['nodes','edges']){const p=`data/base/knowledge_graph/${key}.json`,before=old(p)[key],after=now(p)[key];requireSame(before,after.filter(n=>!n.id.includes('r105-')),key);if(after.length-before.length!==(key==='nodes'?6:9))throw Error('unexpected graph count');}
const p='data/base/companions/round-19-companions.json',before=old(p),after=now(p);for(const c of before.companions){const n=structuredClone(after.companions.find(n=>n.id===c.id));n.description=c.description;delete n.stanceRules;requireSame(c,n,c.id);}
const text='PASS: all quests/maps/NPCs/skills/shops unchanged; all old dialogue nodes and options preserved; six new graph nodes and nine edges only; original companion identity and support preserved.\n';writeFileSync('iterations/round-105/unrelated-semantics.txt',text);console.log(text);
