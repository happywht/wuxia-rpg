import {readFileSync,mkdtempSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {createCharacterState,parseCharacterProfileSet,parseMartialArtSet} from '../src/engine/character-progression';
import {CombatSession,parseBattleEncounterSet} from '../src/engine/turn-based-combat';
import {parseCompanionSet,resolveCompanionStance} from '../src/engine/companion-system';
const read=(p:string)=>JSON.parse(readFileSync(new URL('../data/base/'+p,import.meta.url),'utf8'));
describe('Round105 real combat and incremental writer',()=>{
 for(const [flag,kind,power] of [['event.r100-record-open','attack',9],['event.r100-record-guard','heal',7]] as const)it(kind+' applies through CombatSession after two successful actions',()=>{
  const p=parseCharacterProfileSet(read('characters/round-04-profiles.json')),a=parseMartialArtSet(read('skills/round-04-martial-arts.json')),b=parseBattleEncounterSet(read('battles/round-05-encounters.json')),c=parseCompanionSet(read('companions/round-19-companions.json'));if(!p.ok||!a.ok||!b.ok||!c.ok)throw Error('default data failed');
  const profile=p.set.profiles[0]!,encounter=b.set.encounters.find(e=>e.id==='encounter.r58-market-toll-claimer')!,arts=new Map(a.set.martialArts.map(a=>[a.id,a]));const player=createCharacterState(profile);player.health.current-=30;
  const support=resolveCompanionStance(c.set.companions[0]!,{mapResourceId:'map.round-01-grid',sharedKnowledgeNodeIds:new Set([flag])}).combatSupport;
  const baseline=new CombatSession({encounter,profile,player:structuredClone(player),martialArts:arts}),helped=new CombatSession({encounter,profile,player:structuredClone(player),martialArts:arts,companion:{name:'fixture',support}});
  expect(helped.playerUse('skill.missing').ok).toBe(false);
  for(let i=0;i<2;i++){expect(baseline.playerUse('skill.jianghu-sanshou').ok).toBe(true);expect(helped.playerUse('skill.jianghu-sanshou').ok).toBe(true);if(i===0){expect(helped.enemyView).toEqual(baseline.enemyView);expect(helped.playerView).toEqual(baseline.playerView);}}
  if(kind==='attack')expect(baseline.enemyView.health.current-helped.enemyView.health.current).toBe(power);else expect(helped.playerView.health.current-baseline.playerView.health.current).toBe(power);
 });
 it('two incremental runs are byte stable inside an isolated checked sandbox',()=>{
  const target=mkdtempSync(join(tmpdir(),'wuxia-r105-'));const root=resolve(target);expect(root.startsWith(resolve(tmpdir())+sep+'wuxia-r105-')).toBe(true);
  try{mkdirSync(join(root,'scripts','lib'),{recursive:true});cpSync(new URL('../data/',import.meta.url),join(root,'data'),{recursive:true});cpSync(new URL('../scripts/deepen-round105-people.mjs',import.meta.url),join(root,'scripts','deepen-round105-people.mjs'));cpSync(new URL('../scripts/lib/round105-people-content.mjs',import.meta.url),join(root,'scripts','lib','round105-people-content.mjs'));cpSync(new URL('../scripts/lib/round136-relay-followups.mjs',import.meta.url),join(root,'scripts','lib','round136-relay-followups.mjs'));execFileSync(process.execPath,[join(root,'scripts','deepen-round105-people.mjs')]);const files=['base/companions/round-19-companions.json','base/knowledge_graph/nodes.json','base/knowledge_graph/edges.json','schema/companion-set.schema.json'];const source=readFileSync(new URL('../scripts/lib/round105-people-content.mjs',import.meta.url),'utf8');const dialogueFiles=[...source.matchAll(/file: '([^']+)'/g)].map(m=>'base/dialogues/'+m[1]);files.push(...dialogueFiles);const before=files.map(f=>readFileSync(join(root,'data',f),'utf8'));execFileSync(process.execPath,[join(root,'scripts','deepen-round105-people.mjs')]);expect(files.map(f=>readFileSync(join(root,'data',f),'utf8'))).toEqual(before);for(let i=0;i<files.length;i++)expect(before[i]).toBe(readFileSync(new URL('../data/'+files[i],import.meta.url),'utf8'));}
  finally{if(!root.startsWith(resolve(tmpdir())+sep+'wuxia-r105-'))throw Error('unsafe sandbox path');rmSync(root,{recursive:true,force:true});}
 });
});
