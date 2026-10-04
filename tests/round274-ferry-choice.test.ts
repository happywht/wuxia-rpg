// Synthetic engine tests using shipped data; these are not keyboard QA runs.
import { describe, expect, it } from 'vitest';
import { readFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { CombatSession, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { createCharacterState, cumulativeExperienceForLevel, grantExperience, parseCharacterProfileSet, parseMartialArtSet } from '../src/engine/character-progression';
import { parseQuestSet, createQuestJournal } from '../src/engine/quest-system';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createInventoryState, parseItemSet, indexItems, countItem } from '../src/engine/item-system';
import { createSocialState, getRelationship } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES } from '../src/engine/dialogue-variables';
import { captureSaveSnapshot, parseSaveSnapshot, planSnapshotRestore, restoreRunState } from '../src/engine/save-system';
import { repairEncounterRaw as applyCloudChallenge } from '../scripts/lib/round276-cloud-challenge.mjs';
import { escortId, pierId, escortBehavior, pierBehavior, supplyKey, supplyNodes, repairEncountersRaw, repairDialoguesRaw } from '../scripts/lib/round274-ferry-choice.mjs';
const root=resolve('.');
const raw=(p:string)=>readFileSync(join(root,p),'utf8');
const parse=(p:string)=>JSON.parse(raw(p));
const encounters=parseBattleEncounterSet(parse('data/base/battles/round-05-encounters.json'));
const profiles=parseCharacterProfileSet(parse('data/base/characters/round-04-profiles.json'));
const skills=parseMartialArtSet(parse('data/base/skills/round-04-martial-arts.json'));
const questSet=parseQuestSet(parse('data/base/quests/round-07-quests.json'));
const itemSet=parseItemSet(parse('data/base/items/round-06-items.json'));
const dialogSet=parseDialogueSet(parse('data/base/dialogues/round-30-conversations.json'));
if(!encounters.ok||!profiles.ok||!skills.ok||!questSet.ok||!itemSet.ok||!dialogSet.ok)throw Error('shipped data refused');
const profile=profiles.set.profiles[0]!;
const encounterRecords=encounters.set.encounters;
const arts=new Map(skills.set.martialArts.map(a=>[a.id,a]));
const quests=new Map(questSet.set.quests.map(q=>[q.id,q]));
const items=indexItems(itemSet.set).byId;
const dialogue=dialogSet.set.conversations.find(d=>d.id==='dlg.bai-luzhou-ferry-master')!;
const greet=dialogue.nodes.find(n=>n.id===dialogue.startNodeId)!;
function battle(id:string, zero=false) {
  const player=createCharacterState(profile);
  grantExperience(profile,player,cumulativeExperienceForLevel(profile,6));
  player.martialArtIds.push('skill.r32-yunyin-buyun-lu');
  const encounter=structuredClone(encounterRecords.find(e=>e.id===id)!);
  if(zero)encounter.enemy.qi=0;
  return {player,session:new CombatSession({encounter,profile,player,martialArts:arts})};
}
function context(questId?:string):DialogueRuntimeContext {
  const journal=createQuestJournal(quests);
  if(questId) {const state=journal.states.get(questId)!;state.status='completed';for(const objective of quests.get(questId)!.objectives)state.objectiveCounts.set(objective.id,objective.requiredCount);}
  return {quests,journal,items,inventory:createInventoryState(profile,[]),social:createSocialState(),speakerNpcId:'char.bai-luzhou',knownKnowledgeNodeIds:new Set(),knowledgeNodes:new Map(),character:createCharacterState(profile),factions:new Map(),martialArts:arts,factionState:createFactionMembershipState(),timeOfDayPeriodId:'afternoon',dialogueVariables:new Map()};
}
const visibleSupply=(c:DialogueRuntimeContext)=>getVisibleOptions(greet,c).map(o=>o.option).filter(o=>o.nextNodeId.startsWith('r274-ferry-supply'));
describe('Round274 existing choice threats',()=>{
  for(const id of [pierId,escortId])it(`${id}: zero qi still attacks, recovery cue has no hidden strike`,()=>{
    const {player,session}=battle(id,true), start=player.health.current;
    expect(session.enemyIntent).toContain('改用可用招式');
    session.playerWait();expect(player.health.current).toBeLessThan(start);
    const second=player.health.current;session.playerWait();expect(player.health.current).toBeLessThan(second);
    expect(session.enemyIntent).toContain('本回合不攻击');
    const third=player.health.current;session.playerWait();expect(player.health.current).toBe(third);
    expect(session.enemyView.qi.current).toBe(0);
    const fourth=player.health.current;session.playerWait();expect(player.health.current).toBeLessThan(fourth);
  });
  it('pier guard unloads the declared heavy bonus; preparation costs a turn and qi',()=>{
    const plain=battle(pierId),planned=battle(pierId), start=plain.player.health.current;
    expect(plain.session.enemyIntent).toContain('守御可卸蓄势');
    const preview=Number(plain.session.enemyIntent!.match(/预计未守御伤害 (\d+)/)![1]);
    plain.session.playerWait();expect(start-plain.player.health.current).toBe(preview);
    planned.session.playerUse('skill.r32-yunyin-buyun-lu');
    expect(planned.player.health.current).toBeGreaterThan(plain.player.health.current);
    expect(planned.session.log.at(-1)?.text).toContain('蓄势已卸去');
    expect(planned.player.qi.current).toBeLessThan(plain.player.qi.current);
  });
  for(const id of [pierId,escortId])it(`${id}: same level can clear, no-free-standing threat is sustained`,()=>{
    const {player,session}=battle(id), start=player.health.current;
    let actions=0;while(!session.isOver&&actions++<30){session.playerUse(session.enemyIntent!.includes('守御可卸蓄势')?'skill.r32-yunyin-buyun-lu':'skill.jianghu-sanshou');}
    expect(session.finalResult?.outcome).toBe('victory');expect(player.health.current).toBeLessThan(start);
  });
  it('cycles preserve health, qi, identity, position, rewards and defeat/flee rules',()=>{
    const baseline=JSON.parse(execFileSync('git',['show','baa5ebe:data/base/battles/round-05-encounters.json'],{encoding:'utf8'}));
    const expected=structuredClone(baseline);
    for(const [id,behavior] of [[pierId,pierBehavior],[escortId,escortBehavior]] as const){const e=expected.encounters.find((e:{id:string})=>e.id===id);e.enemy.behavior=behavior;if(id===pierId)e.enemy.martialArtIds.push('skill.jianghu-sanshou');}
    expect(JSON.parse(repairEncountersRaw(JSON.stringify(baseline,null,2)))).toEqual(expected);
    expect(JSON.parse(applyCloudChallenge(JSON.stringify(expected,null,2)))).toEqual(parse('data/base/battles/round-05-encounters.json'));
  });
});
describe('Round274 explicit differing supply and persistent consequences',()=>{
  it('no completion or merely reinforced bridge does not grant departure supply',()=>{
    expect(visibleSupply(context())).toEqual([]);
    const c=context('quest.r31-mend-the-pier');c.knownKnowledgeNodeIds.add('event.r31-pier-reinforced');
    expect(visibleSupply(c)).toEqual([]);
  });
  for(const [questId,nodeId,itemId,delta,route] of [
    ['quest.r31-guard-the-caravan','r274-ferry-supply-escort','item.huichun-gao',2,'escort'],
    ['quest.r31-pier-toll-clearing','r274-ferry-supply-pier','item.qingxin-wan',3,'repair'],
  ] as const)it(`${route}: actual item/relationship, persistent once-only gate, cancel has no effects`,()=>{
    const c=context(questId), node=dialogue.nodes.find(n=>n.id===nodeId)!;
    expect(visibleSupply(c).map(o=>o.nextNodeId)).toEqual([nodeId]);expect(node.confirmEffects).toBe(true);
    expect(node.options!.at(-1)?.effects).toBeUndefined();
    expect(countItem(c.inventory!,itemId)).toBe(0);expect(c.dialogueVariables!.has(supplyKey)).toBe(false);
    const option=getVisibleOptions(node,c)[0]!.option;
    expect(applyDialogueEffects(option.effects!,c).ok).toBe(true);
    expect(countItem(c.inventory!,itemId)).toBe(1);expect(getRelationship(c.social,'char.bai-luzhou')).toBe(delta);
    expect(c.dialogueVariables!.get(supplyKey)).toBe(route);
    expect(getVisibleOptions(node,c).some(o=>o.option.effects)).toBe(false);
    expect(visibleSupply(c).map(o=>o.nextNodeId)).toEqual(['r274-ferry-supply-collected']);
  });
  it('full variable ledger refuses atomically after staging item and relationship',()=>{
    const c=context('quest.r31-guard-the-caravan');
    for(let i=0;i<DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES;i++)c.dialogueVariables!.set('test.fill-'+i,true);
    const effects=supplyNodes[0]!.options![0]!.effects!;
    expect(applyDialogueEffects(effects,c).ok).toBe(false);
    expect(countItem(c.inventory!,'item.huichun-gao')).toBe(0);expect(getRelationship(c.social,'char.bai-luzhou')).toBe(0);
    expect(c.dialogueVariables!.has(supplyKey)).toBe(false);
  });
  it('full backpack refuses before relationship or once-only flag is changed',()=>{
    const c=context('quest.r31-guard-the-caravan');
    c.inventory=createInventoryState(profile,[...items.keys()].filter(id=>id!=='item.huichun-gao').slice(0,12).map(itemId=>({itemId,quantity:1})));
    const before=structuredClone(c.inventory);
    expect(applyDialogueEffects(supplyNodes[0]!.options![0]!.effects!,c).ok).toBe(false);
    expect(c.inventory).toEqual(before);expect(getRelationship(c.social,'char.bai-luzhou')).toBe(0);expect(c.dialogueVariables!.has(supplyKey)).toBe(false);
  });
  it('save parse/plan/restore preserves supplies, relationship and prevents re-claim',()=>{
    const c=context('quest.r31-pier-toll-clearing');applyDialogueEffects(supplyNodes[1]!.options![0]!.effects!,c);
    const snapshot=captureSaveSnapshot({displayName:'合成存读',mapResourceId:'map.round-10-mist-ferry',playerCol:3,playerRow:4,character:c.character!,inventory:c.inventory!,journal:c.journal,social:c.social,shopStocks:new Map(),completedEncounters:new Set(),completedRegionalEvents:new Set(),knownKnowledgeNodeIds:new Set(),elapsedGameMinutes:3581,worldSeed:274,dialogueVariables:c.dialogueVariables});
    const parsed=parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));if(!parsed.ok)throw Error(parsed.message);
    const plan=planSnapshotRestore(parsed.snapshot,{profileIds:new Set([profile.id]),profileRecords:new Map([[profile.id,profile]]),mapResourceId:snapshot.mapResourceId,isWalkableCell:()=>true,isCellOccupied:()=>false,itemIds:new Set(items.keys()),itemRecords:items,martialArtIds:new Set(arts.keys()),questIds:new Set(quests.keys()),questObjectiveIds:new Map([...quests].map(([id,q])=>[id,new Set(q.objectives.map(o=>o.id))])),questRecords:quests,encounterIds:new Set(),shopIds:new Set(),npcIds:new Set(['char.bai-luzhou'])});
    if(!plan.ok)throw Error(plan.errors.join());
    const restored=restoreRunState({snapshot:plan.snapshot,profile,items,quests,shops:new Map()});
    const after:DialogueRuntimeContext={...c,...restored,knownKnowledgeNodeIds:new Set(restored.knownKnowledgeNodeIds)};
    expect(countItem(after.inventory!,'item.qingxin-wan')).toBe(1);expect(getRelationship(after.social,'char.bai-luzhou')).toBe(3);
    expect(after.dialogueVariables!.get(supplyKey)).toBe('repair');expect(visibleSupply(after).map(o=>o.nextNodeId)).toEqual(['r274-ferry-supply-collected']);
  });
});
describe('Round274 pure authoring',()=>{
  it('roundtrips baseline and LF/CRLF idempotence; drift and duplicates refuse',()=>{
    const baseline=execFileSync('git',['show','baa5ebe:data/base/dialogues/round-30-conversations.json'],{encoding:'utf8'});
    expect(JSON.parse(repairDialoguesRaw(baseline))).toEqual(parse('data/base/dialogues/round-30-conversations.json'));
    for(const eol of ['\n','\r\n']){const current=raw('data/base/dialogues/round-30-conversations.json').replace(/\r?\n/g,eol);expect(repairDialoguesRaw(current)).toBe(current);}
    const changed=parse('data/base/dialogues/round-30-conversations.json');const bai=changed.conversations.find((c:{id:string})=>c.id===dialogue.id);bai.nodes.push({...supplyNodes[0],text:'重复漂移'});
    expect(()=>repairDialoguesRaw(JSON.stringify(changed))).toThrow('漂移');
    const battleDoc=parse('data/base/battles/round-05-encounters.json');battleDoc.encounters.find((e:{id:string})=>e.id===pierId).enemy.health++;
    expect(()=>repairEncountersRaw(JSON.stringify(battleDoc))).toThrow('漂移');
    expect(repairEncountersRaw(raw('data/base/battles/round-05-encounters.json'))).toBe(raw('data/base/battles/round-05-encounters.json'));
  });
  it('all-resource CLI preflight and cwd independence; bad dialogue leaves battle bytes unchanged',()=>{
    const temp=mkdtempSync(join(tmpdir(),'wuxia-r274-'));
    try {
      for(const dir of ['scripts/lib','data/base/battles','data/base/dialogues'])mkdirSync(join(temp,dir),{recursive:true});
      for(const path of ['scripts/apply-round274.mjs','scripts/lib/round274-ferry-choice.mjs'])cpSync(join(root,path),join(temp,path));
      const battlePath='data/base/battles/round-05-encounters.json',dialoguePath='data/base/dialogues/round-30-conversations.json';
      for(const path of [battlePath,dialoguePath])writeFileSync(join(temp,path),execFileSync('git',['show','baa5ebe:'+path]));
      const before=readFileSync(join(temp,battlePath));writeFileSync(join(temp,dialoguePath),'{}');
      const run=()=>execFileSync(process.execPath,[join(temp,'scripts/apply-round274.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      expect(run).toThrow();expect(readFileSync(join(temp,battlePath))).toEqual(before);
      writeFileSync(join(temp,dialoguePath),execFileSync('git',['show','baa5ebe:'+dialoguePath]));run();
      const settled=readFileSync(join(temp,battlePath));run();expect(readFileSync(join(temp,battlePath))).toEqual(settled);
    } finally { if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'wuxia-r274-'))throw Error('unsafe sandbox');rmSync(temp,{recursive:true,force:true}); }
  });
});

describe('Round274 discovered counter stays authoritative on load',()=>{
  it('restores the real 15-discovery escort checkpoint without turning 16 catalog entries into currency',()=>{
    const checkpoint=parse('iterations/round-274/f2-escort.json');
    const parsed=parseSaveSnapshot(checkpoint.snapshot);if(!parsed.ok)throw Error(parsed.message);
    const restored=restoreRunState({snapshot:parsed.snapshot,profile,items,quests,shops:new Map()});
    expect(restored.achievementState.discoveredKnowledge).toBe(15);
    expect(restored.achievementState.unlockedIds).not.toContain('achievement.river-of-stories');
    expect(restored.inventory.currency).toBe(326);
    const nodes=parse('data/base/knowledge_graph/nodes.json').nodes as {id:string;knownByDefault?:boolean}[];
    expect(restored.knownKnowledgeNodeIds.filter(id=>!nodes.find(n=>n.id===id)?.knownByDefault)).toHaveLength(16);
    const scene=raw('src/game/grid-scene.ts');
    // Wiring check complements engine restoration and actual keyboard readback.
    const startup=scene.slice(scene.indexOf('this.knownKnowledgeNodeIds = createKnowledgeState('),scene.indexOf('this.factionState = createFactionMembershipState(restoredRun?.factionMembership'));
    expect(startup).not.toContain('this.achievementState.discoveredKnowledge');
  });
  it('legacy missing counter remains protocol-default zero, preserving historical rewards',()=>{
    const legacy=parse('iterations/round-274/f2-escort.json').snapshot;
    const unlocked=[...legacy.achievementState.unlockedIds];delete legacy.achievementState.discoveredKnowledge;
    const parsed=parseSaveSnapshot(legacy);if(!parsed.ok)throw Error(parsed.message);
    const restored=restoreRunState({snapshot:parsed.snapshot,profile,items,quests,shops:new Map()});
    expect(restored.achievementState.discoveredKnowledge).toBe(0);
    expect(restored.achievementState.unlockedIds).toEqual(unlocked);
    expect(restored.inventory.currency).toBe(326);
  });
});
