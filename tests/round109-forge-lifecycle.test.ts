/**
 * Round 109: 自创武学面板的 world REPLACEMENT 生命周期回归。
 *
 * 以受控的 DOM/input mock 与键盘 emitter 验证：面板只拥有自己创建的
 * 离屏输入框（打开/关闭/重开复用同一个元素），destroy 幂等并卸下 DOM
 * 监听与场景 SHUTDOWN 钩子，热重载式“先销毁再重建”与场景关停/重进
 * 都不会堆积第二个输入框；输入归一化与“聚焦输入框独占按键（含 IME）”
 * 行为保持不变。组件与创制规则全部走真实引擎。
 */
import {beforeEach,describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{ESC:1,ENTER:2,LEFT:3,RIGHT:4,UP:5,DOWN:6,SPACE:7,W:8,A:9,S:10,D:11}}},Scenes:{Events:{SHUTDOWN:'shutdown'}}}}));
vi.mock('../src/game/ui-theme',()=>({addPixelPanelChrome:()=>{},UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa'}}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${n}px`}));
import {MartialArtForgePanel,type MartialArtForgePanelModel} from '../src/game/martial-art-forge-ui';
import {CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH,type MartialArtForgeComponentSet} from '../src/engine/martial-art-forge';

// ---- Minimal DOM mock: only elements this panel itself creates. ----------
interface FakeEvent{key:string;defaultPrevented:boolean;propagationStopped:boolean;preventDefault():void;stopPropagation():void}
const fakeEvent=(key:string):FakeEvent=>({key,defaultPrevented:false,propagationStopped:false,
  preventDefault(){this.defaultPrevented=true},stopPropagation(){this.propagationStopped=true}});
interface FakeParent{children:Set<FakeInput>;append(input:FakeInput):void}
const createParent=():FakeParent=>{const parent:FakeParent={children:new Set(),
  append(input){input.removed=false;input.parent=parent;parent.children.add(input)}};return parent};
interface FakeInput{type:string;value:string;autocomplete:string;spellcheck:boolean;
  style:Record<string,string>;ariaLabel:string;parent:FakeParent|null;focused:boolean;removed:boolean;
  listeners:Map<string,Set<(event:FakeEvent)=>void>>;
  setAttribute(name:'aria-label',value:string):void;
  addEventListener(type:string,fn:(event:FakeEvent)=>void):void;
  removeEventListener(type:string,fn:(event:FakeEvent)=>void):void;
  dispatch(type:string,event:FakeEvent):void;
  focus():void;blur():void;remove():void}
const createInput=():FakeInput=>{const input:FakeInput={type:'',value:'',autocomplete:'',spellcheck:false,style:{},ariaLabel:'',
  parent:null,focused:false,removed:false,listeners:new Map(),
  setAttribute(name,value){if(name==='aria-label')input.ariaLabel=value},
  addEventListener(type,fn){let set=input.listeners.get(type);if(!set){set=new Set();input.listeners.set(type,set)}set.add(fn)},
  removeEventListener(type,fn){input.listeners.get(type)?.delete(fn)},
  dispatch(type,event){for(const fn of [...input.listeners.get(type)??[]])fn(event)},
  focus(){input.focused=true},blur(){input.focused=false},
  remove(){input.removed=true;input.parent?.children.delete(input);input.parent=null}};return input};
let createdInputs:FakeInput[]=[];let domParent:FakeParent;
vi.stubGlobal('document',{createElement:()=>{const input=createInput();createdInputs.push(input);return input},
  body:{append(){throw Error('expected the canvas parent element, not document.body')}}});
beforeEach(()=>{createdInputs=[];domParent=createParent()});

// ---- Scene mock: container/text factory, keyboard emitter, SHUTDOWN bus. --
function makeScene(){
  const keys=new Map<number,Set<()=>void>>();const shutdownHandlers=new Map<unknown,()=>void>();const texts:string[]=[];
  const container={setDepth(){return this},setVisible(){return this},removeAll(){return this},add(){return this},destroy(){this.destroyed=true},destroyed:false};
  const scene={scale:{width:960,height:540},game:{canvas:{parentElement:domParent as unknown as HTMLElement}},
    events:{once(name:string,fn:()=>void){if(name==='shutdown')shutdownHandlers.set(fn,fn)},off(_name:string,fn:()=>void){shutdownHandlers.delete(fn)}},
    input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());
      return{on(_event:string,fn:()=>void){keys.get(code)!.add(fn)},off(_event:string,fn:()=>void){keys.get(code)!.delete(fn)}}}}},
    add:{container:()=>container,text:(_x:number,_y:number,text:string)=>{expect(Number.isFinite(_x)&&Number.isFinite(_y)).toBe(true);
      return{text,height:24,context:{measureText:(v:string)=>({width:Array.from(v).length*12})},
        setText(v:string){this.text=v;texts.push(v);return this},setOrigin(){texts.push(this.text);return this}}}}} as unknown as Phaser.Scene;
  return{scene,container,texts,keys,
    press:(code:number)=>{for(const fn of [...keys.get(code)??[]])fn()},
    shutdown:()=>{for(const fn of [...shutdownHandlers.values()])fn();shutdownHandlers.clear()}};
}
const components:MartialArtForgeComponentSet={components:[
  {id:'forge.intent.r109',slot:'intent',name:'试意',category:'进攻',style:'刚猛',description:'试意描述文本',power:8,qiCost:4,silverCost:10,kind:'attack'},
  {id:'forge.form.r109',slot:'form',name:'试形',category:'守御',style:'沉稳',description:'试形描述文本',power:1,qiCost:0,silverCost:0,kind:null},
  {id:'forge.breath.r109',slot:'breath',name:'试息',category:'养气',style:'绵长',description:'试息描述文本',power:0,qiCost:-1,silverCost:0,kind:null},
]};
function model(overrides:Partial<MartialArtForgePanelModel>={}):MartialArtForgePanelModel{
  return{components,existingArts:[],occupiedIds:new Set(),currency:100,
    onCraft:()=>({ok:true,message:'已创制'}),...overrides};
}

describe('Round109 forge panel owns exactly one offscreen input across its lifecycle',()=>{
 it('open/close/reopen reuses the same DOM element and resets transient state',()=>{
   const r=makeScene();const closed:string[]=[];const panel=new MartialArtForgePanel(r.scene,()=>closed.push('closed'));
   expect(domParent.children.size).toBe(1);
   panel.open(model());
   expect(panel.isOpen).toBe(true);expect([...domParent.children][0]!.focused).toBe(false);
   r.press(6);r.press(6);r.press(6); // ↓ to the name row focuses the owned input.
   expect([...domParent.children][0]!.focused).toBe(true);
   panel.close();
   expect(panel.isOpen).toBe(false);expect(closed).toEqual(['closed']);
   expect(domParent.children.size).toBe(1); // close() keeps the element for reopening.
   panel.open(model());
   expect(panel.isOpen).toBe(true);expect(createdInputs).toHaveLength(1);
   panel.destroy();expect(domParent.children.size).toBe(0);
 });

 it('normalizes typed names to the engine limit while the input owns IME keys',()=>{
   const r=makeScene();const panel=new MartialArtForgePanel(r.scene);panel.open(model());
   const input=createdInputs[0]!;
   r.press(6);r.press(6);r.press(6);
   input.value='清'.repeat(CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH+5);
   input.dispatch('input',fakeEvent('清'));
   expect(Array.from(input.value)).toHaveLength(CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH);
   // Every key the focused DOM input sees stays owned by it: arrows and
   // Enter are handled, plain text/IME composition and Backspace pass on
   // untouched, and all of them stop reaching the scene keyboard.
   const arrow=fakeEvent('ArrowDown');input.dispatch('keydown',arrow);
   expect(arrow.defaultPrevented).toBe(true);expect(arrow.propagationStopped).toBe(true);
   const backspace=fakeEvent('Backspace');input.dispatch('keydown',backspace);
   expect(backspace.defaultPrevented).toBe(false);expect(backspace.propagationStopped).toBe(true);
   const composing=fakeEvent('Process');input.dispatch('keydown',composing);
   expect(composing.defaultPrevented).toBe(false);expect(composing.propagationStopped).toBe(true);
   panel.destroy();
 });

 it('Enter on the focused name row crafts through the real engine and closes once',()=>{
   const r=makeScene();const crafts:{name:string}[]=[];const closed:string[]=[];
   const panel=new MartialArtForgePanel(r.scene,()=>closed.push('closed'));
   panel.open(model({onCraft:(_recipe,name)=>{crafts.push({name});return{ok:true,message:'已创制'}}}));
   const input=createdInputs[0]!;
   r.press(6);r.press(6);r.press(6);
   input.value='清风剑法';input.dispatch('input',fakeEvent('清'));
   input.dispatch('keydown',fakeEvent('Enter'));
   expect(crafts).toEqual([{name:'清风剑法'}]);
   expect(panel.isOpen).toBe(false);expect(closed).toEqual(['closed']);
   panel.destroy();
 });

 it('destroy is idempotent and detaches DOM listeners so late events are inert',()=>{
   const r=makeScene();const panel=new MartialArtForgePanel(r.scene);panel.open(model());
   const input=createdInputs[0]!;
   panel.destroy();panel.destroy(); // Repeated destroy must stay a no-op.
   expect(domParent.children.size).toBe(0);expect(input.removed).toBe(true);
   const late=fakeEvent('Enter');input.dispatch('keydown',late);
   expect(late.propagationStopped).toBe(false); // Listener really detached.
   expect(panel.isOpen).toBe(false);
 });

 it('hot-reload style replacement never stacks a second input',()=>{
   const r=makeScene();
   const first=new MartialArtForgePanel(r.scene);first.open(model());
   r.press(6);r.press(6);r.press(6); // Leave it focused mid-edit, worst case.
   first.destroy();
   const second=new MartialArtForgePanel(r.scene);second.open(model());
   expect(createdInputs).toHaveLength(2);
   expect(domParent.children.size).toBe(1); // Old element removed, new one live.
   expect([...domParent.children][0]).toBe(createdInputs[1]);
   second.destroy();
 });

 it('scene shutdown destroys the panel and a later reentry starts clean',()=>{
   const r=makeScene();
   const panel=new MartialArtForgePanel(r.scene);panel.open(model());
   r.shutdown();
   expect(panel.isOpen).toBe(false);expect(domParent.children.size).toBe(0);
   // Reentry: the same scene bus accepts a fresh panel with one input.
   const reentered=new MartialArtForgePanel(r.scene);reentered.open(model());
   expect(domParent.children.size).toBe(1);expect(reentered.isOpen).toBe(true);
   reentered.destroy();
 });

 it('a destroyed panel refuses to reopen instead of reviving dead bindings',()=>{
   const r=makeScene();const panel=new MartialArtForgePanel(r.scene);panel.destroy();
   panel.open(model());
   expect(panel.isOpen).toBe(false);
   expect(r.texts).toEqual([]); // No render work after destruction.
 });
});
