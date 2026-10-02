import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import {buildDialogueDeliveryGuideEntries, buildQuestGuideEntries, type QuestGuideInput} from '../src/engine/quest-guide';
import type {DialogueData} from '../src/engine/dialogue-graph';
import type {DialogueRuntimeContext} from '../src/engine/dialogue-runtime';
import {createSocialState} from '../src/engine/social-state';
import {createFactionMembershipState} from '../src/engine/faction-system';
import type {PlacedNpc} from '../src/engine/npc-placement';
import type {WorldMapAssembly} from '../src/engine/world-map';

const context = (): DialogueRuntimeContext => ({quests:new Map(),journal:{states:new Map(),trackedQuestId:null},items:new Map(),inventory:null,social:createSocialState(),speakerNpcId:'npc',knownKnowledgeNodeIds:new Set(['message']),knowledgeNodes:new Map(),character:null,factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'morning'});
const graph = (): DialogueData => ({id:'dlg',startNodeId:'start',nodes:[{id:'start',text:'入口',options:[{text:'转述已有分项判断（关系+1）',nextNodeId:'answer',conditions:[{kind:'knowledgeKnown',nodeId:'message'},{kind:'knowledgeKnown',nodeId:'delivered',isKnown:false}],effects:[{kind:'shareKnowledgeNode',nodeId:'message'},{kind:'adjustRelationship',delta:1},{kind:'discoverKnowledgeNode',nodeId:'delivered'}]}]},{id:'answer',text:'尚未交谈的接收人答复'}]});
const npc: PlacedNpc = {record:{id:'npc',name:'记录人',mapResourceId:'map',position:{col:1,row:2},dialogueId:'dlg',shopId:null,questGiver:false,schedule:[]},col:1,row:2};
function input(g=graph(),c=context()): QuestGuideInput {return {guide:{worldMap:{} as WorldMapAssembly,currentMapResourceId:'map',baseNpcs:[npc],shops:new Map(),items:new Map(),shopStocks:new Map(),knownKnowledgeNodeIds:c.knownKnowledgeNodeIds},quests:new Map(),journal:c.journal,access:{},encounters:[],dialogues:new Map([['dlg',g]]),dialogueContextFor:()=>c};}

describe('Round157 current delivery guide', () => {
  it('projects original question, raw index and destination without revealing or executing answer', () => {
    const c=context(),i=input(graph(),c),before=JSON.stringify([[...c.knownKnowledgeNodeIds],c.social,[...i.dialogues!]]);
    const rows=buildDialogueDeliveryGuideEntries(i);
    expect(rows).toHaveLength(1);expect(rows[0]!.title).toContain('转述已有分项判断');
    expect(rows[0]!.id).toBe('delivery:npc:start:0');expect(rows[0]!.destinationId).toBe('region-guide:npc:npc');
    expect(rows[0]!.detail).not.toContain('尚未交谈的接收人答复');expect(buildQuestGuideEntries(i)).toContainEqual(rows[0]);
    expect(JSON.stringify([[...c.knownKnowledgeNodeIds],c.social,[...i.dialogues!]])).toBe(before);
  });
  it('requires every shared fact to be known and removes a one-time delivery after completion', () => {
    const c=context(),g=graph();c.knownKnowledgeNodeIds.clear();expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);
    c.knownKnowledgeNodeIds.add('message');g.nodes[0]!.options![0]!.effects=[...g.nodes[0]!.options![0]!.effects!,{kind:'shareKnowledgeNode',nodeId:'other'}];
    expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);c.knownKnowledgeNodeIds.add('other');expect(buildDialogueDeliveryGuideEntries(input(g,c))).toHaveLength(1);
    c.knownKnowledgeNodeIds.add('delivered');expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);
  });
  it('respects additional quest qualification and never traverses a hidden or effectful entry', () => {
    const g=graph(),c=context();g.nodes[0]!.options![0]!.conditions=[...g.nodes[0]!.options![0]!.conditions!,{kind:'questStatus',questId:'q',status:'completed'}];
    expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);c.journal.states.set('q',{questId:'q',status:'completed',objectiveCounts:new Map()});
    expect(buildDialogueDeliveryGuideEntries(input(g,c))).toHaveLength(1);
    g.nodes.unshift({id:'gate',text:'入口',options:[{text:'进入',nextNodeId:'start',conditions:[{kind:'knowledgeKnown',nodeId:'gate'}]}]});g.startNodeId='gate';
    expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);c.knownKnowledgeNodeIds.add('gate');g.nodes[0]!.options![0]!.effects=[{kind:'adjustRenown',delta:1}];
    expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);
  });
  it('excludes resource costs, battle and confirmation choices', () => {
    for(const extra of [{kind:'adjustRenown',delta:1} as const,{kind:'startBattle',encounterId:'fight'} as const,{kind:'takeItem',itemId:'medicine',quantity:1} as const]) {
      const g=graph();g.nodes[0]!.options![0]!.effects=[...g.nodes[0]!.options![0]!.effects!,extra];expect(buildDialogueDeliveryGuideEntries(input(g))).toEqual([]);
    }
    const g=graph();g.nodes[0]!.confirmEffects=true;expect(buildDialogueDeliveryGuideEntries(input(g))).toEqual([]);
  });
  it('keeps an authored negative relationship delivery visible without applying its cost', () => {
    const set=JSON.parse(readFileSync('data/base/dialogues/round-91-cloud-north-terrace-conversations.json','utf8'));
    const g:DialogueData=set.conversations[0],c=context();
    c.knownKnowledgeNodeIds=new Set(['event.r105-ledger-message','event.r100-record-guard']);
    c.journal.states.set('quest.r91-goose-vigil',{questId:'quest.r91-goose-vigil',status:'completed',objectiveCounts:new Map()});
    const before=JSON.stringify(c.social),rows=buildDialogueDeliveryGuideEntries(input(g,c));
    expect(rows).toHaveLength(1);expect(rows[0]!.title).toContain('关系-1');expect(JSON.stringify(c.social)).toBe(before);
  });
  it('deduplicates cyclic traversal, retains raw indices and uses actual schedule/follower placement', () => {
    const g=graph();g.nodes[0]!.options!.unshift({text:'回环',nextNodeId:'start'});const i=input(g);i.guide.baseNpcs=[npc,npc];i.guide.periodNpcs=[{...npc,col:8,row:9}];
    let rows=buildDialogueDeliveryGuideEntries(i);expect(rows).toHaveLength(1);expect(rows[0]!.id).toBe('delivery:npc:start:1');expect(rows[0]!.detail).toContain('(8,9)');
    i.guide.follower={npc,col:4,row:5,mapResourceId:'map'};rows=buildDialogueDeliveryGuideEntries(i);expect(rows[0]!.detail).toContain('(4,5)');expect(rows[0]!.detail).toContain('P再T交谈');
  });
  it('handles missing dialogue/context and NPC outside current region', () => {
    const i=input();delete i.dialogues;expect(buildDialogueDeliveryGuideEntries(i)).toEqual([]);
    const j=input();delete j.dialogueContextFor;expect(buildDialogueDeliveryGuideEntries(j)).toEqual([]);
    const k=input();k.guide.currentMapResourceId='other';expect(buildDialogueDeliveryGuideEntries(k)).toEqual([]);
  });
  it('real public/private deliveries follow the chosen stance and disappear after delivery', () => {
    const set=JSON.parse(readFileSync('data/base/dialogues/round-93-snow-pine-valley-conversations.json','utf8'));
    const g:DialogueData=set.conversations[0];
    for(const stance of ['public','private']) {
      const c=context();c.knownKnowledgeNodeIds=new Set(['event.r105-carving-message',`event.r101-mark-${stance}`]);
      c.journal.states.set('quest.r93-boundary-mark',{questId:'quest.r93-boundary-mark',status:'completed',objectiveCounts:new Map()});
      const rows=buildDialogueDeliveryGuideEntries(input(g,c));expect(rows).toHaveLength(1);expect(rows[0]!.title).toContain(stance==='public'?'关系+2':'关系+1');
      expect(rows[0]!.detail).not.toContain(g.nodes.find(n=>n.id===`r105-carving-receive-${stance==='public'?0:1}`)!.text);
      c.knownKnowledgeNodeIds.add('event.r105-carving-delivered');expect(buildDialogueDeliveryGuideEntries(input(g,c))).toEqual([]);
    }
  });
});
