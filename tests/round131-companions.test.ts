import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type Phaser from 'phaser';
import { createSocialState } from '../src/engine/social-state';
import { applyDialogueEffects, getVisibleOptions, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { applyCompanionTrust } from '../scripts/lib/round131-companion-trust.mjs';
import { resolveCompanionStance, parseCompanionSet } from '../src/engine/companion-system';
const font = vi.hoisted(() => ({ scale: 1 }));
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { ESC:1, ENTER:2, T:3, PAGE_UP:4, PAGE_DOWN:5 } } } } }));
vi.mock('../src/game/settings', () => ({ uiFontSize: (n:number) => `${n * font.scale}px` }));
vi.mock('../src/game/ui-theme', () => ({ addPixelPanelChrome:()=>{}, UI_FONT_FAMILY:'monospace', UI_PALETTE:{ accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa' } }));
import { CompanionPanel, type CompanionPanelModel } from '../src/game/companion-ui';
const root = fileURLToPath(new URL('../', import.meta.url));
function setup(count=1, active: string|null='c0', scale=1, memories:Record<string,string[]>={}, titles?:ReadonlyMap<string,string>) {
  font.scale=scale;
  const texts: any[]=[];
  const keys=new Map<number,Set<()=>void>>();
  const events:string[]=[];
  const container={ setDepth(){return this;},setVisible(){return this;},add(){return this;},removeAll(){texts.length=0;return this;},destroy(){} };
  const scene={scale:{width:960,height:540},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());return {on(_e:string,fn:()=>void){keys.get(code)!.add(fn);},off(_e:string,fn:()=>void){keys.get(code)!.delete(fn);}};}}},add:{container:()=>container,text(x:number,y:number,text:string,style:{fontSize:string}){
    const obj={x,y,text,size:parseFloat(style.fontSize),spacing:0,context:{measureText:(value:string)=>({width:[...value].length*parseFloat(style.fontSize)})},get height(){const n=this.text.split('\n').length;return n*this.size*1.2+(n-1)*this.spacing;},setText(value:string){this.text=value;return this;},setOrigin(){return this;},setLineSpacing(n:number){this.spacing=n;return this;}};
    texts.push(obj);return obj;
  }}} as unknown as Phaser.Scene;
  const panel=new CompanionPanel(scene,()=>events.push('closed'));
  const model:CompanionPanelModel={companions:new Map(Array.from({length:count},(_,i)=>[`c${i}`,{id:`c${i}`,npcId:`npc${i}`,description:'长途同行需要分清自己所知与当面转述的决定。'.repeat(18),combatSupport:{kind:'attack' as const,power:9,everyPlayerActions:2}}])),activeCompanionId:active,npcNames:new Map([['npc0','顾同行']]),social:createSocialState(),mapResourceId:'map.example',onDismiss:()=>events.push('dismissed'),onTalk:()=>{expect(panel.isOpen).toBe(false);events.push('talked');}};
  model.knowledgeTitles=titles;
  for(const [npc, ids] of Object.entries(memories))model.social.npcKnowledge.set(npc,new Set(ids));
  panel.open(model);
  const press=(code:number)=>{for(const fn of [...keys.get(code)??[]])fn();};
  return {panel,model,texts,events,press,keys};
}
describe('Round131 companion pagination (mock scene, not real journey)',()=>{
  it.each([1,1.4])('measured body stays above footer and all text survives pages at scale %s',scale=>{
    const r=setup(3,'c0',scale), seen:string[]=[];
    let expectedCount=0;
    for(let i=0;i<200;i++){
      const footer=r.texts.at(-1)!;
      const count=Number(footer.text.match(/\/(\d+)页/)[1]);expectedCount=count;
      const body=r.texts[2]!;
      expect(body.y+body.height).toBeLessThanOrEqual(footer.y-5);
      for(const line of body.text.split('\n'))expect([...line].length*body.size).toBeLessThanOrEqual(568);
      seen.push(body.text);
      if(i===count-1)break;
      r.press(5);
    }
    expect(expectedCount).toBeGreaterThan(1);
    expect(seen.join('\n')).toContain('npc2');
    expect(seen.join('').replace(/\n/g,'').split('长途同行').length-1).toBe(54);
    expect(r.events).toEqual([]);
    const last=r.texts[2]!.text;r.press(5);expect(r.texts[2]!.text).toBe(last);
    r.panel.close();r.panel.open(r.model);expect(r.texts.at(-1)!.text).toContain('第1/');r.panel.close();
  });
  it('page keys do not dismiss or talk and close unbinds all owned handlers',()=>{
    const r=setup();r.press(4);r.press(5);expect(r.events).toEqual([]);r.press(3);r.press(3);expect(r.events).toEqual(['closed','talked']);
    expect([...r.keys.values()].every(set=>set.size===0)).toBe(true);
  });
  it('nonfollowing roster cannot talk or dismiss; empty roster remains readable',()=>{
    const r=setup(1,null);r.press(3);r.press(2);expect(r.events).toEqual([]);r.panel.close();
    const s=setup(0,null);expect(s.texts[2]!.text).toContain('没有可用');expect(s.texts.at(-1)!.text).toContain('第1/1');s.panel.close();
  });
  it('Enter dismissal remains explicit and is not triggered by paging',()=>{
    const r=setup();r.press(5);r.press(2);expect(r.events).toEqual(['dismissed','closed']);
  });
});
describe('Round132 actual NPC memory presentation',()=>{
  function allPages(r:ReturnType<typeof setup>){const pages:string[]=[];for(let i=0;i<200;i++){pages.push(r.texts[2]!.text);const count=Number(r.texts.at(-1)!.text.match(/\/(\d+)页/)[1]);if(i===count-1)break;r.press(5);}return pages.join('').replace(/\n/g,'');}
  it('only shows this NPC memories and takes labels from supplied world data',()=>{
    const r=setup(1,'c0',1,{npc0:['event.b','event.a'],npcOther:['event.secret']},new Map([['event.a','公开署名'],['event.b','有限报码'],['event.secret','其他人物秘密']]));
    const text=allPages(r);expect(text).toContain('已知见闻 2 项：公开署名、有限报码');expect(text).not.toContain('其他人物秘密');r.panel.close();
  });
  it('missing titles remain inspectable as stable ids; unshared player discoveries are not inferred',()=>{
    const r=setup(1,'c0',1,{npc0:['event.mod-missing']},new Map([['event.player-only','玩家已知但未转述']]));
    const text=allPages(r);expect(text).toContain('event.mod-missing');expect(text).not.toContain('玩家已知但未转述');r.panel.close();
  });
  it('nonfollowing state clearly denies live support while retaining memory',()=>{
    const r=setup(1,null,1,{npc0:['event.a']},new Map([['event.a','旧决定']]));const text=allPages(r);expect(text).toContain('未同行，不触发援护');expect(text).toContain('旧决定');r.press(3);r.press(2);expect(r.events).toEqual([]);r.panel.close();
  });
  it('empty memory has an explicit message',()=>{const r=setup();expect(allPages(r)).toContain('尚无已记录的见闻');r.panel.close();});
  it('large mod memory lists preserve every title and page clearance at largest font',()=>{
    const ids=Array.from({length:80},(_,i)=>`event.${String(i).padStart(3,'0')}`),titles=new Map(ids.map((id,i)=>[id,`独立见闻第${i}项长说明`]));
    const r=setup(1,'c0',1.4,{npc0:ids},titles);const text=allPages(r);for(const title of titles.values())expect(text).toContain(title);expect(text).toContain('已知见闻 80 项');expect(r.events).toEqual([]);r.panel.close();
  });
});
describe('Round131 authored trust and actual stance data',()=>{
  const baseline=()=>execFileSync('git',['show','d6d5ecef796699a06c885d5847d2ac4be119938d:data/base/dialogues/round-03-conversations.json'],{cwd:root,encoding:'utf8'});
  it('migrates only Gu trust, preserves other characters and is idempotent for LF/CRLF',()=>{
    const old=baseline();
    for(const raw of [old,old.replace(/\r?\n/g,'\r\n')]){
      const out=applyCompanionTrust(raw);expect(applyCompanionTrust(out)).toBe(out);
      const before=JSON.parse(raw),after=JSON.parse(out);
      expect(after.conversations.filter((c:any)=>c.id!=='dlg.gu-yechen-roadside')).toEqual(before.conversations.filter((c:any)=>c.id!=='dlg.gu-yechen-roadside'));
      const c=after.conversations.find((c:any)=>c.id==='dlg.gu-yechen-roadside');
      const trust=c.nodes.find((n:any)=>n.id==='blade').options.find((o:any)=>o.nextNodeId==='ally');
      expect(trust.conditions[0]).toMatchObject({minValue:10,maxValue:14});
      expect(c.nodes.find((n:any)=>n.id==='search').options.find((o:any)=>o.nextNodeId==='deliver').conditions[0].maxValue).toBe(9);
      const invite=c.nodes.find((n:any)=>n.id==='greet').options.find((o:any)=>o.text==='顾兄，我们再结伴走一程。');
      expect(invite.effects).toEqual([{kind:'recruitCompanion',companionId:'companion.gu-yechen'}]);
      expect(c.nodes.find((n:any)=>n.id==='ally').text).toContain('旧账还没结清');
    }
  });
  it('refuses modified social reward and half applied invitation',()=>{
    const raw=baseline();expect(()=>applyCompanionTrust(raw.replace('掌柜的已经收到了。','掌柜没收到。'))).toThrow();
    const done=applyCompanionTrust(raw);expect(()=>applyCompanionTrust(done.replace('顾兄，我们再结伴走一程。','换个意思。'))).toThrow();
  });
  it('real runtime conditions stop repeated trust rewards and reinvitation preserves known decisions',()=>{
    const parsed=parseDialogueSet(JSON.parse(applyCompanionTrust(baseline())));if(!parsed.ok)throw Error(parsed.errors.join('\n'));
    const c=parsed.set.conversations.find(c=>c.id==='dlg.gu-yechen-roadside')!;
    const pc=parseCompanionSet(JSON.parse(readFileSync(new URL('../data/base/companions/round-19-companions.json',import.meta.url),'utf8')));if(!pc.ok)throw Error(pc.errors.join('\n'));
    const ctx:DialogueRuntimeContext={quests:new Map(),journal:{states:new Map(),trackedQuestId:null},items:new Map(),inventory:null,social:createSocialState(),speakerNpcId:'char.gu-yechen',knownKnowledgeNodeIds:new Set(['event.r100-record-open']),knowledgeNodes:new Map(),character:null,factions:new Map(),martialArts:new Map(),factionState:createFactionMembershipState(),timeOfDayPeriodId:'period.morning',companions:new Map(pc.set.companions.map(c=>[c.id,c])),companionState:{activeCompanionId:null}};
    const visible=(id:string)=>getVisibleOptions(c.nodes.find(n=>n.id===id)!,ctx);
    const promise=()=>visible('search').find(v=>v.option.nextNodeId==='deliver');
    const trust=()=>visible('blade').find(v=>v.option.nextNodeId==='ally');
    const invite=()=>visible('greet').find(v=>v.option.text==='顾兄，我们再结伴走一程。');
    expect(trust()).toBeUndefined();expect(invite()).toBeUndefined();
    expect(applyDialogueEffects(promise()!.option.effects!,ctx).ok).toBe(true);
    expect(ctx.social.relationships.get('char.gu-yechen')).toBe(10);expect(promise()).toBeUndefined();expect(invite()).toBeUndefined();
    expect(applyDialogueEffects(trust()!.option.effects!,ctx).ok).toBe(true);
    expect(ctx.social.relationships.get('char.gu-yechen')).toBe(15);expect(ctx.social.renown).toBe(2);expect(trust()).toBeUndefined();
    expect(applyDialogueEffects(invite()!.option.effects!,ctx).ok).toBe(true);
    expect(applyDialogueEffects(invite()!.option.effects!,ctx).ok).toBe(false);
    expect(applyDialogueEffects([{kind:'dismissCompanion'}],ctx).ok).toBe(true);
    expect(applyDialogueEffects(invite()!.option.effects!,ctx).ok).toBe(true);
    expect(ctx.companionState!.activeCompanionId).toBe('companion.gu-yechen');
    expect(ctx.social.relationships.get('char.gu-yechen')).toBe(15);expect(ctx.social.renown).toBe(2);
    expect(ctx.knownKnowledgeNodeIds.has('event.r100-record-open')).toBe(true);
    expect(visible('greet').some(v=>v.option.nextNodeId==='r105-shared-0')).toBe(true);
  });
  it('six regional stances require NPC-shared knowledge; known-to-player alone is insufficient',()=>{
    const parsed=parseCompanionSet(JSON.parse(readFileSync(new URL('../data/base/companions/round-19-companions.json',import.meta.url),'utf8')));if(!parsed.ok)throw Error(parsed.errors.join('\n'));
    const c=parsed.set.companions[0]!;
    for(const rule of c.stanceRules!){
      const map=rule.mapResourceIds![0]!;
      expect(resolveCompanionStance(c,{mapResourceId:map,sharedKnowledgeNodeIds:new Set()}).stanceId).toBe(null);
      expect(resolveCompanionStance(c,{mapResourceId:map,sharedKnowledgeNodeIds:new Set(rule.requiredSharedKnowledgeNodeIds)})).toMatchObject({stanceId:rule.id,combatSupport:rule.combatSupport});
      expect(resolveCompanionStance(c,{mapResourceId:'map.unrelated',sharedKnowledgeNodeIds:new Set(rule.requiredSharedKnowledgeNodeIds)}).stanceId).toBe(null);
    }
  });
});

describe('Round134 companion player progress labels',()=>{
  it('renders player status separately from NPC memory and keeps every page',()=>{
    const node={id:'event.message',kind:'event' as const,title:'历史待送标题',summary:'资料',knownByDefault:false,progress:{completedByNodeId:'event.done',pendingLabel:'待亲口说明',completedLabel:'已亲口说明'}};
    for(const [known,label] of [[[],'你尚未取得此见闻'],[['event.message'],'待亲口说明'],[['event.message','event.done'],'已亲口说明']] as const){
      const r=setup(1,'c0',1.4,{npc0:['event.message']},new Map([['event.message',node.title]]));r.panel.close();r.events.length=0;
      r.model.knowledgeNodes=new Map([[node.id,node]]);r.model.playerKnownNodeIds=new Set<string>(known);r.panel.open(r.model);
      const pages:string[]=[];for(let i=0;i<200;i++){pages.push(r.texts[2]!.text);const count=Number(r.texts.at(-1)!.text.match(/\/(\d+)页/)[1]);if(i===count-1)break;r.press(5);}
      expect(pages.join('').replace(/\n/g,'')).toContain(`历史待送标题【玩家：${label}】`);expect([...r.model.social.npcKnowledge.get('npc0')!]).toEqual(['event.message']);expect([...r.model.playerKnownNodeIds]).toEqual([...known]);expect(r.events).toEqual([]);r.panel.close();
    }
  });
  it('does not invent a player progress status if discoveries are unavailable',()=>{
    const r=setup(1,'c0',1,{npc0:['event.message']},new Map([['event.message','历史待送标题']]));r.panel.close();r.model.knowledgeNodes=new Map([['event.message',{id:'event.message',kind:'event',title:'历史待送标题',summary:'资料',knownByDefault:false,progress:{completedByNodeId:'event.done',pendingLabel:'待说明',completedLabel:'已说明'}}]]);r.panel.open(r.model);expect(r.texts[2]!.text).not.toContain('【玩家：');r.panel.close();
  });
});
