import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { describe,it,expect } from 'vitest';
import { createCharacterState,parseCharacterProfileSet,parseFactionSet,parseMartialArtSet } from '../src/engine/character-progression';
import { projectFactionAdmissions } from '../src/engine/faction-admission-preview';
import { checkFactionAdmission } from '../src/engine/faction-system';
import { projectFactionDeparture } from '../src/engine/faction-departure';
import { createSocialState } from '../src/engine/social-state';
import { createQuestJournal } from '../src/engine/quest-system';
import { buildFactionBlock,paginateFactionDossier } from '../src/game/faction-panel-layout';
import { addTransferDirections,TRANSFER_DIRECTION_NODE } from '../scripts/lib/round127-transfer-directions.mjs';
const read=(p:string)=>JSON.parse(readFileSync('data/base/'+p,'utf8'));
const fp=parseFactionSet(read('factions/round-04-factions.json')),pp=parseCharacterProfileSet(read('characters/round-04-profiles.json')),ap=parseMartialArtSet(read('skills/round-04-martial-arts.json'));
if(!fp.ok||!pp.ok||!ap.ok)throw Error('fixture');
const factions=new Map(fp.set.factions.map(f=>[f.id,f])),arts=new Map(ap.set.martialArts.map(a=>[a.id,a]));
const profile=pp.set.profiles[0]!;
function input(){const character=createCharacterState(profile);
 character.level=11;character.attributes={body:29,force:26,agility:17,insight:18,resolve:17};character.martialArtIds=[...arts.keys()];
 const social=createSocialState();social.morality=-10;social.renown=8;social.factionRenown.set('faction.panzhou-daochang',15);
 return{factions,character,social,martialArts:arts,quests:new Map(),journal:createQuestJournal(new Map()),membership:{factionId:'faction.panzhou-daochang',masterNpcId:'char.zhu-jiuxian'}};
}
describe('Round127 true post-departure admission gaps',()=>{
 it('clamps current departure and keeps inputs unchanged',()=>{const i=input(),before=structuredClone(i),result=projectFactionAdmissions(i);
  expect(i).toEqual(before);expect(result.size).toBe(5);
  expect(result.get('faction.tingyu-jiange')).toMatchObject({basis:'after-departure',morality:-15,renown:0,isCurrent:false});
  expect(result.get('faction.panzhou-daochang')).toMatchObject({isCurrent:true,morality:-10,renown:8,mentors:[]});
  expect(result.get('faction.tiezhang-pai')!.mentors[0]!.reasons.join(' ')).toContain('江湖声望需达到 5（当前 0）');
  expect(result.get('faction.tingyu-jiange')!.mentors[0]!.reasons).toEqual(['与师父的关系需达到 5（当前 0）']);
  expect(result.get('faction.hanshan-shuyuan')!.mentors[0]!.reasons.join(' ')).toContain('善恶值需达到 5（当前 -15）');
 });
 it.each([...factions.values()])('shares all actual admission checks after leaving $name',current=>{
  const i=input();i.membership={factionId:current.id,masterNpcId:current.mentorNpcIds[0]!};const result=projectFactionAdmissions(i);
  const d=projectFactionDeparture(current,i.social,i.character,arts),social={...i.social,morality:d.morality,renown:d.renown,factionRenown:new Map(i.social.factionRenown)};social.factionRenown.set(current.id,d.factionRenown);
  for(const f of factions.values())if(f.id!==current.id)for(const mentor of result.get(f.id)!.mentors)
   expect(mentor).toEqual({npcId:mentor.npcId,...checkFactionAdmission({faction:f,speakerNpcId:mentor.npcId,membership:null,character:i.character,social,quests:i.quests,journal:i.journal})});
 });
 it('evaluates each mentor relationship rather than assuming the first teacher',()=>{
  const i=input(),f=factions.get('faction.tingyu-jiange')!,copy={...f,mentorNpcIds:['npc.a','npc.b']};
  const changed=new Map(i.factions);changed.set(copy.id,copy);i.social.relationships.set('npc.b',5);
  const p=projectFactionAdmissions({...i,factions:changed,membership:null}).get(f.id)!;
  expect(p.basis).toBe('current');expect(p.mentors.map(m=>m.eligible)).toEqual([false,true]);
 });
 it('does not invent a legal exit for forbidden or missing current records',()=>{
  const i=input(),current=i.factions.get(i.membership.factionId)!,changed=new Map(i.factions);changed.set(current.id,{...current,departure:{...current.departure,allowed:false}});
  const blocked=projectFactionAdmissions({...i,factions:changed}).get('faction.tingyu-jiange')!;
  expect(blocked.unavailableReason).toContain('不允许退派');expect(blocked.mentors).toEqual([]);
  const missing=projectFactionAdmissions({...i,membership:{factionId:'missing',masterNpcId:'missing'}}).get('faction.tingyu-jiange')!;
  expect(missing.unavailableReason).toContain('资料不可用');expect(missing.mentors).toEqual([]);
 });
 it('shows no-character and missing quest gaps instead of passing',()=>{
  const i=input(),p=projectFactionAdmissions({...i,character:null,membership:null}).get('faction.tiezhang-pai')!;
  expect(p.mentors[0]!.eligible).toBe(false);expect(p.mentors[0]!.reasons.join(' ')).toContain('没有可拜师');expect(p.mentors[0]!.reasons.join(' ')).toContain('差事资料不可用');
 });
 it('marks ready only after the real relationship threshold and does not join',()=>{
  const i=input();i.social.relationships.set('char.ye-tingzhou',5);const before=structuredClone(i);
  expect(projectFactionAdmissions(i).get('faction.tingyu-jiange')!.mentors[0]!.eligible).toBe(true);expect(i).toEqual(before);
 });
 it('keeps complete gap copy in lossless narrow-font pagination',()=>{
  const i=input(),f=factions.get('faction.tiezhang-pai')!,p=projectFactionAdmissions(i).get(f.id)!;
  const text=buildFactionBlock({faction:f,isCurrent:false,mentorLabels:['长师名'.repeat(50)],renown:0,quests:i.quests,admissionPreview:p});
  expect(text).toContain('按退出当前师门后估算');expect(text).toContain('当前 0');
  const pages=paginateFactionDossier([text],120,3,s=>s.length*12);expect(pages.length).toBeGreaterThan(2);
  expect(pages.join('').replaceAll('\n','')).toContain('长师名'.repeat(50));
  expect(buildFactionBlock({faction:f,isCurrent:false,mentorLabels:[],renown:0,quests:i.quests})).not.toContain('估算');
 });
 it('keeps the authored directions idempotent, honest and without rewards',()=>{
  const set=read('dialogues/round-03-conversations.json');expect(addTransferDirections(set)).toEqual(set);
  const conversation=set.conversations.find((c:{id:string})=>c.id==='dlg.ye-tingzhou-mentor');
  const node=conversation.nodes.find((n:{id:string})=>n.id===TRANSFER_DIRECTION_NODE);
  expect(node.text).toContain('记录回填不能冒充此行观察');expect(node.text).toContain('身法18');
  expect(node.effects).toBeUndefined();expect(node.options.every((o:{effects?:unknown})=>o.effects===undefined)).toBe(true);
  expect(conversation.nodes.find((n:{id:string})=>n.id==='r103-tingyu-next').text).toContain('不能把记录回填说成此行观察');
 });
 it('replays the actual generator with CRLF and preserves Round107 authoring bytes',()=>{
  const root=resolve(mkdtempSync(join(tmpdir(),'wuxia-r127-')));
  expect(root.startsWith(resolve(tmpdir())+sep)).toBe(true);
  try {
   mkdirSync(join(root,'scripts/lib'),{recursive:true});mkdirSync(join(root,'data/base/dialogues'),{recursive:true});
   for(const file of ['generate-round127-transfer-directions.mjs','lib/round127-transfer-directions.mjs','lib/round103-faction-practice.mjs','lib/round107-combat-content.mjs'])cpSync(resolve('scripts',file),join(root,'scripts',file));
   const set=read('dialogues/round-03-conversations.json');
   const mentor=set.conversations.find((c:{id:string})=>c.id==='dlg.ye-tingzhou-mentor');
   mentor.nodes=mentor.nodes.filter((n:{id:string})=>n.id!==TRANSFER_DIRECTION_NODE);
   const greet=mentor.nodes.find((n:{id:string})=>n.id===mentor.startNodeId);
   greet.options=greet.options.filter((o:{nextNodeId?:string})=>o.nextNodeId!==TRANSFER_DIRECTION_NODE);
   const target=join(root,'data/base/dialogues/round-03-conversations.json');
   writeFileSync(target,JSON.stringify(set,null,2).replaceAll('\n','\r\n')+'\r\n');
   execFileSync(process.execPath,[join(root,'scripts/generate-round127-transfer-directions.mjs')],{cwd:root});
   const authored=readFileSync(target,'utf8');expect(authored.replaceAll('\r\n','')).not.toContain('\n');
   expect(JSON.parse(authored)).toEqual(addTransferDirections(set));
   execFileSync(process.execPath,[join(root,'scripts/generate-round127-transfer-directions.mjs')],{cwd:root});
   expect(readFileSync(target,'utf8')).toBe(authored);
   const library=new URL('../scripts/lib/round107-combat-content.mjs',import.meta.url);
   // Pure replay comparison verifies interoperability without writing the checkout.
   const replay=execFileSync(process.execPath,['--input-type=module','-e',`import{readFileSync}from'node:fs';import{deepenCombatRouteDialogues}from${JSON.stringify(library.href)};process.stdout.write(deepenCombatRouteDialogues(readFileSync(${JSON.stringify(target)},'utf8')));`],{encoding:'utf8'});
   expect(replay).toBe(authored);
  } finally {expect(root.startsWith(resolve(tmpdir())+sep)).toBe(true);rmSync(root,{recursive:true,force:true});}
 });
});
