import {readFile,writeFile} from 'node:fs/promises';
import {people,relays} from './lib/round105-people-content.mjs';
import {applyRelayWaitingDirections} from './lib/round133-relay-directions.mjs';
const files=new Set(relays.map(r=>people.find(p=>p.dialogueId===r.sourceDialogueId)?.file));
for(const file of files){if(!file)throw new Error('Missing source');const path=new URL(`../data/base/dialogues/${file}`,import.meta.url);const before=await readFile(path,'utf8'),after=applyRelayWaitingDirections(before);if(before!==after)await writeFile(path,after);}
console.log('Round133: updated three existing waiting texts only; no effects or ids changed.');
