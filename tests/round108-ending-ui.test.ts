import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{UP:1,W:2,DOWN:3,S:4,ENTER:5,ESC:6,SPACE:7,RIGHT:8,LEFT:9}}}}}));
vi.mock('../src/game/ui-theme',()=>({UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#a',text:'#t',muted:'#m',jade:'#j'},addPixelPanelChrome:()=>{}}));
let scale=1;
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.round(n*scale)}px`}));
import {EndingPanel} from '../src/game/ending-ui';
import {parseEndingSet,type EndingEvaluationContext} from '../src/engine/ending-system';
import {createSocialState} from '../src/engine/social-state';
const parsed=parseEndingSet(JSON.parse(readFileSync(new URL('../data/base/endings/round-27-endings.json',import.meta.url),'utf8')));
if(!parsed.ok)throw Error('endings');const record=parsed.set;
function setup(available=true,width=960,height=540,fontScale=1){
 scale=fontScale;
 const keys=new Map<number,Set<()=>void>>(),shown:{text:string;destroyed:boolean;x:number;y:number;size:number;height:number}[]=[];
 const container={setVisible(){return this},setDepth(){return this},add(){return this},removeAll(){for(const t of shown)t.destroyed=true;return this},destroy(){}};
 const scene={scale:{width,height},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());return {on(_e:string,fn:()=>void){keys.get(code)!.add(fn)},off(_e:string,fn:()=>void){keys.get(code)!.delete(fn)}};}}},add:{container:()=>container,text:(x:number,y:number,text:string,style:{fontSize:string})=>{
  const size=Number.parseInt(style.fontSize,10),t={text,destroyed:false,x,y,size,height:size,context:{measureText:(v:string)=>({width:Array.from(v).length*size})},destroy(){this.destroyed=true},setOrigin(){return this},setText(v:string){this.text=v;this.height=v.split('\n').length*(size+3);return this}};shown.push(t);return t;
 }}} as unknown as Phaser.Scene;
 const context:EndingEvaluationContext={questStatuses:new Map(available?[['quest.r42-open-register','completed']]:[]),social:createSocialState(),factionMembership:null,knownKnowledgeNodeIds:new Set(available?['event.r42-public-record-vow']:[])};
 let closed=0,finished=0;const panel=new EndingPanel(scene,()=>closed++);
 panel.open({endingSet:{record,gate:record.gate,endings:[record.endings.find(e=>e.id==='ending.r42-open-register')!]},context,onFinish:()=>finished++});
 return {panel,context,visible:()=>shown.filter(t=>!t.destroyed),text:()=>shown.filter(t=>!t.destroyed).map(t=>t.text).join('\n'),finished:()=>finished,closed:()=>closed,press:(code:number)=>{for(const fn of [...keys.get(code)??[]])fn();}};
}
describe('Round108 actual ending panel callbacks and pagination',()=>{
 it('an available ending first opens a cancellable confirmation and never finishes on the first Enter',()=>{const r=setup();r.press(5);expect(r.text()).toContain('确认此行归处');expect(r.text()).toContain('不会自动保存或覆盖存档');expect(r.finished()).toBe(0);r.press(6);expect(r.text()).toContain('结局推演');expect(r.closed()).toBe(0);expect(r.finished()).toBe(0);r.panel.destroy();});
 it('Enter advances every terminal page before ending once; handlers are removed afterwards',()=>{const r=setup(true,640,360,1.5);r.press(5);r.press(5);expect(r.text()).toContain('终章');const seen:string[]=[];for(let guard=0;guard<30&&r.finished()===0;guard++){seen.push(r.text());r.press(5);}expect(seen.length).toBeGreaterThan(1);expect(seen.join('\n')).toContain('大陆');expect(seen.join('\n')).toContain('北境');expect(seen.join('\n')).toContain('海路');expect(seen.join('\n')).toContain('尚未结案');expect(r.finished()).toBe(1);expect(r.closed()).toBe(1);r.press(5);r.press(6);expect(r.finished()).toBe(1);});
 it('locked routes show complete paginated alternatives, and refused Enter does not finish',()=>{const r=setup(false,640,360,1.5);const text:string[]=[];for(let guard=0;guard<20;guard++){text.push(r.text());r.press(7);}expect(text.join('\n')).toContain('原有旅程');expect(text.join('\n')).toContain('三章公开记录');expect(text.join('\n')).toContain('沈雨霁');expect(text.join('\n')).toContain('沈问秋');expect(text.join('\n')).toContain('虞星槎');r.press(5);expect(r.text()).toContain('尚未达成');expect(r.text()).not.toContain('确认此行归处');expect(r.finished()).toBe(0);r.press(6);expect(r.closed()).toBe(1);});
 it('Escape during terminal reading explicitly ends once, whereas Escape during browsing only leaves',()=>{const r=setup();r.press(6);expect(r.closed()).toBe(1);expect(r.finished()).toBe(0);const s=setup();s.press(5);s.press(5);s.press(6);expect(s.finished()).toBe(1);s.press(6);expect(s.finished()).toBe(1);});
 it('large-font terminal body stays above its fixed footer on each page without losing text',()=>{const r=setup(true,640,360,1.5);r.press(5);r.press(5);for(let n=0;n<20;n++){const body=r.visible().find(t=>t.y===104);expect(body).toBeDefined();expect(body!.y+body!.height).toBeLessThanOrEqual(283);r.press(8);}r.panel.destroy();});
 it('selection freezes the resolved text and does not mutate the authored ending or journey flags',()=>{const original=record.endings.find(e=>e.id==='ending.r42-open-register')!.epilogue;const r=setup();r.press(5);r.press(5);(r.context.knownKnowledgeNodeIds as Set<string>).add('event.r100-mainland-close');r.press(8);expect(record.endings.find(e=>e.id==='ending.r42-open-register')!.epilogue).toBe(original);expect(r.finished()).toBe(0);r.panel.destroy();expect(r.finished()).toBe(0);});
});
