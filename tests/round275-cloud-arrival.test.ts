import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { createQuestJournal, parseQuestSet } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { regionGuides } from '../scripts/lib/round106-region-content.mjs';
import { guidePatches, eventPatches, arrivalNodes, arrivalOptions, repairWorldRaw, repairRegionSourceRaw, repairArrivalRaw } from '../scripts/lib/round275-cloud-arrival.mjs';
const root=resolve('.');
const worldPath='data/base/world/world-map.json', arrivalPath='data/base/dialogues/round-74-cloud-ridge-conversations.json', regionPath='scripts/lib/round106-region-content.mjs';
const raw=(p:string)=>readFileSync(join(root,p),'utf8');
const baseline=(p:string)=>execFileSync('git',['show','5ad5c8e:'+p],{encoding:'utf8',maxBuffer:32*1024*1024});
const world=JSON.parse(raw(worldPath));
const parsed=parseDialogueSet(JSON.parse(raw(arrivalPath)));
if(!parsed.ok)throw Error(parsed.errors.join());
const conversation=parsed.set.conversations[0]!, greet=conversation.nodes.find(n=>n.id===conversation.startNodeId)!;
const questSet=parseQuestSet(JSON.parse(raw('data/base/quests/round-07-quests.json')));
if(!questSet.ok)throw Error(questSet.errors.join());
const quests=new Map(questSet.set.quests.map(q=>[q.id,q]));
function context(completed?:string):DialogueRuntimeContext {
  const journal=createQuestJournal(quests);
  if(completed)journal.states.get(completed)!.status='completed';
  return {quests,journal,items:new Map(),inventory:null,social:createSocialState(),knownKnowledgeNodeIds:new Set(),knowledgeNodes:new Map(),speakerNpcId:'char.r74-shen-yuji',character:null,factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.afternoon'};
}
const echoes=(c:DialogueRuntimeContext)=>getVisibleOptions(greet,c).map(o=>o.option).filter(o=>o.nextNodeId.startsWith('r275-'));
describe('Round275 branch-aware arrival using real quest status',()=>{
  it('unselected or only reinforced pier cannot claim a completed passage',()=>{
    expect(echoes(context())).toHaveLength(0);
    const c=context('quest.r31-mend-the-pier');c.knownKnowledgeNodeIds.add('event.r31-pier-reinforced');
    expect(echoes(c)).toHaveLength(0);
  });
  for(const [questId,nodeId] of [['quest.r31-guard-the-caravan','r275-escort-arrival'],['quest.r31-pier-toll-clearing','r275-repair-arrival']])it(questId+' reveals only its own no-reward reply',()=>{
    const c=context(questId);expect(echoes(c).map(o=>o.nextNodeId)).toEqual([nodeId]);
    const option=echoes(c)[0]!;const node=conversation.nodes.find(n=>n.id===nodeId)!;
    expect(option.effects).toBeUndefined();expect(node.options).toBeUndefined();
    expect(node.text).toContain('云阶');expect(node.text).toContain('渡口');
    expect(echoes(c)).toEqual(echoes(c)); // Repeated projection has no settlement.
  });
  it('preserves every original node, option, finite shop and investigation gate',()=>{
    const original=JSON.parse(baseline(arrivalPath));const current=JSON.parse(raw(arrivalPath));
    const c=current.conversations[0];
    expect(c.nodes.filter((n:{id:string})=>arrivalNodes.some(w=>w.id===n.id))).toEqual(arrivalNodes);
    expect(c.nodes.find((n:{id:string})=>n.id===c.startNodeId).options.filter((o:{nextNodeId:string})=>arrivalOptions.some(w=>w.nextNodeId===o.nextNodeId))).toEqual(arrivalOptions);
    c.nodes=c.nodes.filter((n:{id:string})=>!arrivalNodes.some(w=>w.id===n.id));
    const g=c.nodes.find((n:{id:string})=>n.id===c.startNodeId);g.options=g.options.filter((o:{nextNodeId:string})=>!arrivalOptions.some(w=>w.nextNodeId===o.nextNodeId));
    expect(current).toEqual(original);
    expect(conversation.nodes.find(n=>n.id==='r112-supplies')!.text).toContain('数量有限');
  });
});
describe('Round275 actual world guidance',()=>{
  it('keeps all maps, gates, arrival coordinates, event rules and art unchanged',()=>{
    const restored=structuredClone(world), original=JSON.parse(baseline(worldPath));
    for(const p of guidePatches)restored.regionGuides.find((g:{mapResourceId:string})=>g.mapResourceId===p.id).advice=p.before;
    for(const p of eventPatches)restored.events.find((e:{id:string})=>e.id===p.id).text=p.before;
    expect(restored).toEqual(original);
    const first=world.transitions.find((t:{id:string})=>t.id==='gate.ferry-north-to-iron-ridge');
    const second=world.transitions.find((t:{id:string})=>t.id==='gate.iron-ridge-to-cloud-ridge');
    expect(first.from.mapResourceId).toBe('map.round-10-mist-ferry');expect(first.to.mapResourceId).toBe(second.from.mapResourceId);
    expect(second.to.mapResourceId).toBe('map.round-74-cloud-ridge');
    expect(first.name).toBe('雾岬北口');expect(second.name).toBe('断云北隘');
  });
  it('replays canonical region source and corrects location of the Yunyin practice',()=>{
    expect(world.regionGuides).toEqual(regionGuides);
    const advice=world.regionGuides.find((g:{mapResourceId:string})=>g.mapResourceId==='map.round-10-mist-ferry').advice;
    expect(advice).toContain('西陲苦井');expect(advice).toContain('没有直达传送');
    expect(world.regionGuides.find((g:{mapResourceId:string})=>g.mapResourceId==='map.round-74-cloud-ridge').advice).toContain('售完本程不补货');
  });
});
describe('Round275 surgical authoring',()=>{
  for(const [path,repair] of [[worldPath,repairWorldRaw],[arrivalPath,repairArrivalRaw],[regionPath,repairRegionSourceRaw]] as const)it(path+' baseline replay, LF/CRLF and byte-idempotence',()=>{
    const next=repair(baseline(path));
    expect(next.replace(/\r\n/g,'\n')).toBe(raw(path).replace(/\r\n/g,'\n'));
    for(const eol of ['\n','\r\n']){const input=raw(path).replace(/\r?\n/g,eol);expect(repair(input)).toBe(input);}
  });
  it('world text drift and duplicate event/guides refuse',()=>{
    const changed=structuredClone(world);changed.events.find((e:{id:string})=>e.id===eventPatches[0]!.id).text='漂移';
    expect(()=>repairWorldRaw(JSON.stringify(changed))).toThrow('漂移');
    const duplicate=structuredClone(world);duplicate.events.push({...duplicate.events.find((e:{id:string})=>e.id===eventPatches[0]!.id)});
    expect(()=>repairWorldRaw(JSON.stringify(duplicate))).toThrow('不唯一');
    const guides=structuredClone(world);guides.regionGuides.push({...guides.regionGuides.find((g:{mapResourceId:string})=>g.mapResourceId===guidePatches[0]!.id)});
    expect(()=>repairWorldRaw(JSON.stringify(guides))).toThrow('不唯一');
  });
  it('duplicate/drifted arrival layer and source text refuse',()=>{
    const changed=JSON.parse(raw(arrivalPath));changed.conversations[0].nodes.push({...arrivalNodes[0]});
    expect(()=>repairArrivalRaw(JSON.stringify(changed))).toThrow('漂移');
    expect(()=>repairRegionSourceRaw(raw(regionPath).replace(guidePatches[0]!.after,'漂移'))).toThrow('漂移');
  });
  it('CLI preflights all three resources before writing and is cwd-independent',()=>{
    const temp=mkdtempSync(join(tmpdir(),'wuxia-r275-'));
    try {
      for(const dir of ['scripts/lib','data/base/world','data/base/dialogues'])mkdirSync(join(temp,dir),{recursive:true});
      for(const p of ['scripts/apply-round275.mjs','scripts/lib/round275-cloud-arrival.mjs'])cpSync(join(root,p),join(temp,p));
      for(const p of [worldPath,regionPath,arrivalPath])writeFileSync(join(temp,p),baseline(p));
      const before=readFileSync(join(temp,worldPath));writeFileSync(join(temp,arrivalPath),'{}');
      const run=()=>execFileSync(process.execPath,[join(temp,'scripts/apply-round275.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      expect(run).toThrow();expect(readFileSync(join(temp,worldPath))).toEqual(before);
      writeFileSync(join(temp,arrivalPath),baseline(arrivalPath));run();const after=readFileSync(join(temp,worldPath));run();expect(readFileSync(join(temp,worldPath))).toEqual(after);
      expect(JSON.parse(after.toString())).toEqual(world);
    }finally {if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'wuxia-r275-'))throw Error('unsafe sandbox');rmSync(temp,{recursive:true,force:true});}
  },20000); // Full atlas bytes and three isolated CLI launches need a bounded I/O allowance.
});
