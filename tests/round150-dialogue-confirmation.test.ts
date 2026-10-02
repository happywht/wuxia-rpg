import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{UP:1,W:2,DOWN:3,S:4,ENTER:5,ESC:6,PAGE_UP:7,PAGE_DOWN:8,LEFT:9,RIGHT:10,TAB:11}}}}}));
vi.mock('../src/game/ui-theme',()=>({UI_FONT_FAMILY:'monospace',addPixelPanelChrome:()=>{},addPixelSelection:()=>{}}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${n}px`}));
import { DialoguePanel } from '../src/game/dialogue-ui';
import { parseDialogueSet, type DialogueData } from '../src/engine/dialogue-graph';
import { requestDialogueEffectConfirmation, resolveDialogueEffectConfirmation } from '../src/game/dialogue-effect-confirmation';
const effect={kind:'adjustRenown' as const,delta:3};
const conversation:DialogueData={id:'test',startNodeId:'a',nodes:[{id:'a',text:'不可改选，代价三点。',confirmEffects:true,options:[{text:'决定甲',nextNodeId:'b',effects:[effect]},{text:'决定乙',nextNodeId:'b',effects:[{...effect,delta:-2}]},{text:'先离开',nextNodeId:'b'}]},{id:'b',text:'结束'}]};
function setup(talk=structuredClone(conversation)){
 const handlers=new Map<number,()=>void>(),shown:{text:string,dead:boolean}[]=[];
 const container={setVisible(){return this},setDepth(){return this},add(){return this},removeAll(){shown.forEach(t=>t.dead=true);return this},destroy(){}};
 const scene={scale:{width:960,height:540},input:{keyboard:{addKey(code:number){return{on(_e:string,fn:()=>void){handlers.set(code,fn)},off(){handlers.delete(code)}}}}},add:{container:()=>container,text:(_x:number,_y:number,text:string)=>{const t={text,dead:false,context:{measureText:(v:string)=>({width:Array.from(v).length*14})},setOrigin(){return this},setText(v:string){this.text=v;return this},setColor(){return this}};shown.push(t);return t;}}};
 let calls=0,allowed=true;
 const panel=new DialoguePanel(scene as unknown as Phaser.Scene);
 const controller={visibleOptions:(node:DialogueData['nodes'][number])=>(node.options??[]).map((option,index)=>({option,index})).filter(v=>allowed||v.index!==0),confirmOption:(session:import('../src/engine/dialogue-graph').DialogueSession,index:number,raw?:number)=>{calls++;const visible=controller.visibleOptions(session.currentNode);expect(visible[index]!.index).toBe(raw);session.choose(raw!);return{advanced:true,feedback:'已结算'};}};
 panel.open(talk,'测试',controller);
 return{panel,talk,press:(code:number)=>handlers.get(code)?.(),text:()=>shown.filter(t=>!t.dead).map(t=>t.text).join('\n'),calls:()=>calls,expire:()=>{allowed=false}};
}
describe('Round150 irreversible dialogue confirmation',()=>{
 it('defaults cancel, Enter cancels with zero host calls and keeps original choice',()=>{const s=setup();s.press(5);expect(s.text()).toContain('先不作决定');expect(s.text()).toContain('本次选择：决定甲');expect(s.calls()).toBe(0);s.press(5);expect(s.calls()).toBe(0);expect(s.text()).not.toContain('本次选择');s.press(5);expect(s.text()).toContain('先不作决定');});
 it('explicit second choice calls host once with original index then ends',()=>{const s=setup();s.press(3);s.press(5);expect(s.text()).toContain('本次选择：决定乙');s.press(3);s.press(5);expect(s.calls()).toBe(1);expect(s.text()).toContain('结束');s.press(5);expect(s.calls()).toBe(1);expect(s.panel.isOpen).toBe(false);});
 it('Escape in preview closes without effects',()=>{const s=setup();s.press(5);s.press(6);expect(s.calls()).toBe(0);expect(s.panel.isOpen).toBe(false);});
 it('expired condition refuses confirmation without choosing replacement',()=>{const s=setup();s.press(5);s.expire();s.press(3);s.press(5);expect(s.calls()).toBe(0);expect(s.text()).toContain('选项或条件已改变');});
 it('condition shift before preview refuses the newly substituted option',()=>{const s=setup();s.expire();s.press(5);expect(s.calls()).toBe(0);expect(s.text()).toContain('选项或条件已改变');expect(s.text()).not.toContain('本次选择');});
 it('changed option refuses stale preview',()=>{const s=setup();s.press(5);s.talk.nodes[0]!.options![0]!.text='改动';s.press(3);s.press(5);expect(s.calls()).toBe(0);});
 it('plain exit is immediate and unmarked old data keeps old operation',()=>{const s=setup();s.press(3);s.press(3);s.press(5);expect(s.calls()).toBe(1);const old=structuredClone(conversation);delete old.nodes[0]!.confirmEffects;const r=setup(old);r.press(5);expect(r.calls()).toBe(1);});
 it('all body pages must be read before preview and again before confirmation',()=>{const talk=structuredClone(conversation);talk.nodes[0]!.text='长篇说明'.repeat(180);const s=setup(talk);s.press(5);expect(s.text()).not.toContain('本次选择');expect(s.calls()).toBe(0);for(let i=0;i<20;i++)s.press(8);s.press(5);s.press(3);s.press(5);expect(s.calls()).toBe(0);for(let i=0;i<20;i++)s.press(8);s.press(5);expect(s.calls()).toBe(1);});
 it.each([true,false,undefined])('parser retains optional boolean %s',value=>{const raw=structuredClone(conversation);raw.nodes[0]!.confirmEffects=value;const p=parseDialogueSet({conversations:[raw]});expect(p.ok).toBe(true);if(p.ok)expect(p.set.conversations[0]!.nodes[0]!.confirmEffects).toBe(value);});
 it.each(['true',0,null,{}])('parser rejects malformed marker %s',value=>{const raw=JSON.parse(JSON.stringify(conversation));raw.nodes[0].confirmEffects=value;const p=parseDialogueSet({conversations:[raw]});expect(p.ok).toBe(true);if(p.ok){expect(p.set.conversations).toEqual([]);expect(p.warnings.join()).toContain('confirmEffects');}});
 it('pure resolver handles shifted visible index but rejects other node or changed payload',()=>{const node=conversation.nodes[0]!,opt={index:1,option:node.options![1]!};const r=requestDialogueEffectConfirmation(node,opt)!;expect(resolveDialogueEffectConfirmation(r,node,[opt])).toBe(0);expect(resolveDialogueEffectConfirmation(r,{...node,id:'x'},[opt])).toBeNull();expect(resolveDialogueEffectConfirmation(r,node,[{...opt,option:{...opt.option,effects:[effect]}}])).toBeNull();expect(requestDialogueEffectConfirmation(node,{index:2,option:node.options![2]!})).toBeNull();});
 it('exact six authored nodes use marker, twelve effectful branches retain conditions and settled flags',()=>{const files=['round-62-conversations','round-67-conversations','round-92-north-pass-conversations','round-93-snow-pine-valley-conversations','round-83-east-coast-conversations','round-97-lanxin-reef-conversations'];let nodes=0,branches=0;for(const f of files){const raw=JSON.parse(readFileSync(new URL('../data/base/dialogues/'+f+'.json',import.meta.url),'utf8'));for(const d of raw.conversations)for(const n of d.nodes)if(n.confirmEffects){nodes++;for(const o of n.options)if(o.effects?.length){branches++;expect(o.conditions?.length).toBeGreaterThan(0);expect(o.effects.some((e:{kind:string,nodeId?:string})=>e.kind==='discoverKnowledgeNode'&&e.nodeId?.endsWith('-settled'))).toBe(true);}}}expect(nodes).toBe(6);expect(branches).toBe(12);});
});
