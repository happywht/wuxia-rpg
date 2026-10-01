import fs from 'node:fs';import{execFileSync}from'node:child_process';
const original=p=>JSON.parse(execFileSync('git',['show','HEAD:'+p],{encoding:'utf8',maxBuffer:32*1024*1024}));
const paths=['data/base/world/world-map.json','data/base/dialogues/round-30-conversations.json','data/base/dialogues/round-83-east-coast-conversations.json'];
for(const p of paths){const prior=original(p),current=JSON.parse(fs.readFileSync(p,'utf8'));
if(p.includes('/world/'))current.transitions=current.transitions.filter(g=>!g.id.startsWith('gate.r126-'));
else for(const conversation of current.conversations){conversation.nodes=conversation.nodes.filter(n=>n.id!=='r126-coastal-service');for(const node of conversation.nodes)if(node.options)node.options=node.options.filter(o=>o.nextNodeId!=='r126-coastal-service');}
if(JSON.stringify(prior)!==JSON.stringify(current))throw Error('Unexpected semantic change: '+p);
console.log('Unrelated authored data unchanged: '+p);}
