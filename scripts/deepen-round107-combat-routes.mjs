import {readFileSync,writeFileSync} from 'node:fs';
import {deepenCombatChallenges,deepenCombatRouteDialogues} from './lib/round107-combat-content.mjs';
for(const [path,transform] of [['data/base/battles/round-05-encounters.json',deepenCombatChallenges],['data/base/dialogues/round-03-conversations.json',deepenCombatRouteDialogues]]){
  const before=readFileSync(path,'utf8'),after=transform(before);if(before!==after)writeFileSync(path,after);
}
console.log('Round107: three existing challenge cycles and two mentor preparation routes deepened.');
