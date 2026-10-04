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
import { dialoguePatches as challengePatches, repairDialogueRaw as applyCloudChallenge } from '../scripts/lib/round276-cloud-challenge.mjs';
import { regionGuides } from '../scripts/lib/round106-region-content.mjs';
import { repairWorldMapRaw as applyShoreBoatWorld, repairRegionGuideSourceRaw as applyShoreBoatGuide } from '../scripts/lib/round278-shore-boat.mjs';
import { repairWorldMapRaw as applyRoadExchangeWorld, repairRegionGuideSourceRaw as applyRoadExchangeGuide } from '../scripts/lib/round279-road-exchange.mjs';
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
    for(const p of challengePatches){const node=c.nodes.find((n:{id:string})=>n.id===p.id);expect(node.text).toBe(p.after);node.text=p.before;}
    expect(current).toEqual(original);
    expect(conversation.nodes.find(n=>n.id==='r112-supplies')!.text).toContain('数量有限');
  });
});
describe('Round275 actual world guidance',()=>{
  it('keeps all maps, gates, arrival coordinates, event rules and art unchanged',()=>{
    const restored=structuredClone(world), original=JSON.parse(baseline(worldPath));
    // R278 的两条驿舟门与 R279 的岔口地标/事件是后续链增量，对比前从当前侧剥离。
    restored.transitions=restored.transitions.filter((t:{id:string})=>!t.id.startsWith('gate.r278-'));
    restored.landmarks=restored.landmarks.filter((l:{id:string})=>l.id!=='landmark.r279-cloud-fork-sign');
    restored.events=restored.events.filter((e:{id:string})=>e.id!=='event.r279-cloud-fork-sign');
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
    const repaired=repair(baseline(path));
    // 链式重放：arrival 挂 R276，世界/指南源再挂 R278 驿舟与 R279 岔口增量，恰得当前字节。
    const next=path===arrivalPath?applyCloudChallenge(repaired):(path===worldPath?applyRoadExchangeWorld(applyShoreBoatWorld(repaired)):path===regionPath?applyRoadExchangeGuide(applyShoreBoatGuide(repaired)):repaired);
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
    expect(()=>repairRegionSourceRaw(raw(regionPath).replace((guidePatches[0] as {later?:string[]}).later![0]!,'漂移'))).toThrow('漂移'); // R278 后源内是 later 串
  });
  it('CLI preflights all three resources before writing and is cwd-independent',()=>{
    const temp=mkdtempSync(join(tmpdir(),'wuxia-r275-'));
    try {
      for(const dir of ['scripts/lib','data/base/world','data/base/dialogues','data/base/knowledge_graph','data/base/characters','data/base/maps'])mkdirSync(join(temp,dir),{recursive:true});
      // R278 链末 CLI 还读写渡口对白（dlg.bai-luzhou-ferry-master）。
      cpSync(join(root,'data/base/dialogues/round-30-conversations.json'),join(temp,'data/base/dialogues/round-30-conversations.json'));
      cpSync(join(root,'data/base/maps/round-74-cloud-ridge.json'),join(temp,'data/base/maps/round-74-cloud-ridge.json'));
      // R279 链末 CLI 另读图谱/manifest，并在沙盒内创建新人物与对白静态文件。
      cpSync(join(root,'data/base/knowledge_graph/nodes.json'),join(temp,'data/base/knowledge_graph/nodes.json'));
      cpSync(join(root,'data/base/knowledge_graph/edges.json'),join(temp,'data/base/knowledge_graph/edges.json'));
      cpSync(join(root,'data/base/manifest.json'),join(temp,'data/base/manifest.json'));
      for(const p of ['scripts/apply-round275.mjs','scripts/lib/round275-cloud-arrival.mjs','scripts/apply-round278.mjs','scripts/lib/round278-shore-boat.mjs','scripts/apply-round279.mjs','scripts/lib/round279-road-exchange.mjs','scripts/lib/round279-sign-art.mjs'])cpSync(join(root,p),join(temp,p));
      for(const p of [worldPath,regionPath,arrivalPath])writeFileSync(join(temp,p),baseline(p));
      const before=readFileSync(join(temp,worldPath));writeFileSync(join(temp,arrivalPath),'{}');
      const run=()=>execFileSync(process.execPath,[join(temp,'scripts/apply-round275.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      expect(run).toThrow();expect(readFileSync(join(temp,worldPath))).toEqual(before);
      writeFileSync(join(temp,arrivalPath),baseline(arrivalPath));run();
      execFileSync(process.execPath,[join(temp,'scripts/apply-round278.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      execFileSync(process.execPath,[join(temp,'scripts/apply-round279.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      const after=readFileSync(join(temp,worldPath));run();execFileSync(process.execPath,[join(temp,'scripts/apply-round278.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      execFileSync(process.execPath,[join(temp,'scripts/apply-round279.mjs')],{cwd:tmpdir(),stdio:'pipe'});
      expect(readFileSync(join(temp,worldPath))).toEqual(after);
      expect(JSON.parse(after.toString())).toEqual(world);
    }finally {if(!resolve(temp).startsWith(resolve(tmpdir())+sep+'wuxia-r275-'))throw Error('unsafe sandbox');rmSync(temp,{recursive:true,force:true});}
  },20000); // Full atlas bytes and three isolated CLI launches need a bounded I/O allowance.
});
