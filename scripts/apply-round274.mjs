import { readFileSync, writeFileSync } from 'node:fs';
import { repairEncountersRaw, repairDialoguesRaw } from './lib/round274-ferry-choice.mjs';
const inputs=[['../data/base/battles/round-05-encounters.json',repairEncountersRaw],['../data/base/dialogues/round-30-conversations.json',repairDialoguesRaw]];
// Preflight every output and its idempotence before any write.
const writes=inputs.map(([path,repair])=>{const url=new URL(path,import.meta.url);const raw=readFileSync(url,'utf8'),next=repair(raw);if(repair(next)!==next)throw Error('作者不幂等');return {url,raw,next};});
for(const {url,raw,next} of writes)if(raw!==next)writeFileSync(url,next);
console.log('Round274：两侧既有挑战声明可信行动循环，桥头增加零气散手；加固与通渡分明，完成各侧后可明确领取一次不同出发补给及关系回响。');
