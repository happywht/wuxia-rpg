import {readFileSync,writeFileSync} from 'node:fs';
import {repairTownWestWicket} from './lib/round128-town-wicket.mjs';
import {repairRound03Raw,repairRound30Raw} from './lib/round128-aid-donation.mjs';
// Resolve against this script; preflight all repairs before any file is written.
const mapUrl=new URL('../data/base/maps/round-01-grid.json',import.meta.url),mapRaw=readFileSync(mapUrl,'utf8');
const map=JSON.parse(mapRaw),nextMap=repairTownWestWicket(map);
const outputs=[[mapUrl,mapRaw,nextMap===map?mapRaw:JSON.stringify(nextMap,null,2)+'\n']];
for(const[file,repair]of[['round-03-conversations.json',repairRound03Raw],['round-30-conversations.json',repairRound30Raw]]){
 const url=new URL('../data/base/dialogues/'+file,import.meta.url),raw=readFileSync(url,'utf8');outputs.push([url,raw,repair(raw)]);
}
for(const[url,raw,next]of outputs)if(raw!==next)writeFileSync(url,next);
console.log('Round128: strict single road cell and costed aid; no new resources/quests/save fields.');
