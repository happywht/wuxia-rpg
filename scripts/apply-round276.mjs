import { readFileSync, writeFileSync } from 'node:fs';
import { repairEncounterRaw, repairDialogueRaw } from './lib/round276-cloud-challenge.mjs';
const inputs=[['../data/base/battles/round-05-encounters.json',repairEncounterRaw],['../data/base/dialogues/round-74-cloud-ridge-conversations.json',repairDialogueRaw]];
const outputs=inputs.map(([path,repair])=>{const url=new URL(path,import.meta.url),raw=readFileSync(url,'utf8'),next=repair(raw);if(repair(next)!==next)throw Error('作者不幂等，请人工复核');return {url,raw,next};});
for(const {url,raw,next} of outputs)if(raw!==next)writeFileSync(url,next);
console.log('Round276：云阶到断索的本地因果与可读攻击/重击/换气；保留全部基值/奖励/重复规则。');
