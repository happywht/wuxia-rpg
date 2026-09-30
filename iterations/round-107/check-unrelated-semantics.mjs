import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {deepStrictEqual} from 'node:assert';
import {combatChallengeCycles} from '../../scripts/lib/round107-combat-content.mjs';
const baseline='395c99524a992a011e45a0b91bfac63309dafbbb';
const old=p=>JSON.parse(execFileSync('git',['show',`${baseline}:${p}`],{encoding:'utf8',maxBuffer:64*1024*1024}));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const battlePath='data/base/battles/round-05-encounters.json',dialoguePath='data/base/dialogues/round-03-conversations.json';
const before=old(battlePath),after=read(battlePath);
for(const record of after.encounters){const cfg=combatChallengeCycles.find(c=>c.id===record.id);if(!cfg)continue;deepStrictEqual(record.enemy.behavior,cfg.behavior);const original=before.encounters.find(e=>e.id===record.id);deepStrictEqual(record.enemy.martialArtIds,[...new Set([...original.enemy.martialArtIds,...cfg.addArts])]);delete record.enemy.behavior;record.enemy.martialArtIds=original.enemy.martialArtIds;}
deepStrictEqual(after,before);
const dialogues=read(dialoguePath);for(const graph of dialogues.conversations){graph.nodes=graph.nodes.filter(n=>!n.id.startsWith('r107-'));for(const node of graph.nodes)if(node.options)node.options=node.options.filter(o=>!o.nextNodeId?.startsWith('r107-'));}deepStrictEqual(dialogues,old(dialoguePath));
const changed=execFileSync('git',['diff','--name-only',baseline,'--','data/base'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean).sort();deepStrictEqual(changed,[battlePath,dialoguePath].sort());
console.log('PASS: only three behavior cycles/declared enemy arts and six preparation nodes/options changed. All old stats, locations, rewards, dialogue conditions/effects and other base data preserved.');
