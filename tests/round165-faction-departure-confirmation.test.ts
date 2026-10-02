import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{UP:1,W:2,DOWN:3,S:4,ENTER:5,ESC:6,PAGE_UP:7,PAGE_DOWN:8,LEFT:9,RIGHT:10,TAB:11}}}}}));
vi.mock('../src/game/ui-theme',()=>({UI_FONT_FAMILY:'monospace',addPixelPanelChrome:()=>{},addPixelSelection:()=>{}}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${n}px`}));
import { DialoguePanel } from '../src/game/dialogue-ui';
import { parseDialogueSet, type DialogueData } from '../src/engine/dialogue-graph';
import { requestDialogueEffectConfirmation, resolveDialogueEffectConfirmation } from '../src/game/dialogue-effect-confirmation';
const effect={kind:'leaveFaction' as const};
const conversation:DialogueData={id:'test',startNodeId:'a',nodes:[{id:'a',text:'退门代价。',options:[{text:'请准退门，声望减少并遗忘本门武学。',nextNodeId:'b',effects:[effect]},{text:'只是问话',nextNodeId:'b',effects:[{kind:'adjustRenown',delta:3}]}]},{id:'b',text:'结束'}]};
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
describe('Round165 existing faction departure confirmation',()=>{
 it('unmarked departure previews and defaults cancel without host calls',()=>{const s=setup();s.press(5);expect(s.text()).toContain('本次选择');expect(s.text()).toContain('先不作决定');expect(s.calls()).toBe(0);s.press(5);expect(s.calls()).toBe(0);expect(s.text()).not.toContain('本次选择');});
 it('Escape cancels without host effects',()=>{const s=setup();s.press(5);s.press(6);expect(s.calls()).toBe(0);expect(s.panel.isOpen).toBe(false);});
 it('explicit second selection executes exactly once',()=>{const s=setup();s.press(5);s.press(3);s.press(5);expect(s.calls()).toBe(1);expect(s.text()).toContain('结束');s.press(5);expect(s.calls()).toBe(1);});
 it('ordinary unmarked effects still run directly',()=>{const s=setup();s.press(3);s.press(5);expect(s.calls()).toBe(1);expect(s.text()).not.toContain('本次选择');});
 it('expired departure never executes a substituted ordinary effect',()=>{const s=setup();s.press(5);s.expire();s.press(3);s.press(5);expect(s.calls()).toBe(0);expect(s.text()).toContain('选项或条件已改变');});
 it('eligibility shift before preview never executes replacement',()=>{const s=setup();s.expire();s.press(5);expect(s.calls()).toBe(0);expect(s.text()).toContain('选项或条件已改变');});
 it('changed projected cost refuses stale preview',()=>{const s=setup();s.press(5);s.talk.nodes[0]!.options![0]!.text='新代价';s.press(3);s.press(5);expect(s.calls()).toBe(0);});
 it('changing departure into an ordinary effect invalidates request',()=>{const node=structuredClone(conversation.nodes[0]!);const option={index:0,option:node.options![0]!};const request=requestDialogueEffectConfirmation(node,option)!;node.options![0]!.effects=[{kind:'adjustRenown',delta:3}];expect(resolveDialogueEffectConfirmation(request,node,[{index:0,option:node.options![0]!}])).toBeNull();});
 it('long projected costs must be read before an accepted departure',()=>{const talk=structuredClone(conversation);talk.nodes[0]!.options![0]!.text='遗忘本门武学，声望扣除。'.repeat(80);const s=setup(talk);for(let i=0;i<30;i++)s.press(10);s.press(5);s.press(3);s.press(5);expect(s.calls()).toBe(0);for(let i=0;i<30;i++)s.press(8);s.press(5);expect(s.calls()).toBe(1);});
 it('all five real authored departures receive confirmation without modifying data',()=>{let count=0;for(const file of ['round-03-conversations.json','round-30-conversations.json']){const raw=JSON.parse(readFileSync(new URL('../data/base/dialogues/'+file,import.meta.url),'utf8'));const parsed=parseDialogueSet(raw);if(!parsed.ok)throw Error('data');const before=JSON.stringify(parsed.set);for(const d of parsed.set.conversations)for(const node of d.nodes)for(const [index,option]of(node.options??[]).entries())if(option.effects?.some(e=>e.kind==='leaveFaction')){count++;const request=requestDialogueEffectConfirmation(node,{index,option});expect(request).not.toBeNull();expect(resolveDialogueEffectConfirmation(request!,node,[{index,option}])).toBe(0);}expect(JSON.stringify(parsed.set)).toBe(before);}expect(count).toBe(5);});
});
