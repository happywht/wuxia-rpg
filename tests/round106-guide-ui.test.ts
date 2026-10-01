import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{ESC:1,ENTER:2,LEFT:3,RIGHT:4,UP:5,DOWN:6,SPACE:7}}}}}));
const scaleRef=vi.hoisted(()=>({v:1}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.max(8,Math.round(n*scaleRef.v))}px`}));
vi.mock('../src/game/ui-theme',()=>({addPixelPanelChrome:()=>{},UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa'}}));
import {RegionalGuidePanel} from '../src/game/regional-guide-ui';
import type {RegionGuideEntry} from '../src/engine/regional-guide';
/** Minimal text surface the panel touches; `height` stays fixed here — the semantic tests never assert geometry. */
function baseTextStub(texts:string[],initial:string,measurePerChar=12){
 return {text:initial,ox:0,oy:0,x:0,y:0,
  get fontPx(){return 12;},set fontPx(_v:number){},
  height:24,
  context:{measureText:(t:string)=>({width:t.length*measurePerChar})},
  setText(t:string){this.text=t;texts.push(t);return this},
  setOrigin(ox:number=0,oy:number=0){this.ox=ox;this.oy=oy;texts.push(this.text);return this},
  setPosition(x:number,y:number){this.x=x;this.y=y;return this},
  setColor(){return this},setVisible(){return this},destroy(){}};
}
function setup(entries:RegionGuideEntry[]){const keys=new Map<number,Set<()=>void>>(),texts:string[]=[],events:string[]=[];const container={setDepth(){return this},setVisible(){return this},removeAll(){return this},add(){return this},destroy(){}};const scene={scale:{width:960,height:540},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());return{on(_event:string,fn:()=>void){keys.get(code)!.add(fn)},off(_event:string,fn:()=>void){keys.get(code)!.delete(fn)}};}}},add:{container:()=>container,text:(_x:number,_y:number,text:string)=>{expect(Number.isFinite(_x)&&Number.isFinite(_y)).toBe(true);return baseTextStub(texts,text);}}} as unknown as Phaser.Scene;const panel=new RegionalGuidePanel(scene,()=>events.push('closed'));panel.open({name:'测试地区',role:'调查',advice:'测试建议'.repeat(50),entries,onNavigate:id=>{expect(panel.isOpen).toBe(false);events.push(id);}});return{panel,texts,events,press:(key:number)=>{for(const fn of [...keys.get(key)??[]])fn();}};}
const entry=(id:string,category:RegionGuideEntry['category']='supply',destinationId:string|null='region-guide:npc:'+id):RegionGuideEntry=>({id,category,title:'条目'+id,detail:'价格与库存长说明'.repeat(140),destinationId});
describe('Round106 actual panel callbacks with mock scene',()=>{
 it('selects a destination only after closing and does not navigate twice',()=>{const r=setup([entry('1')]);r.press(2);r.press(2);expect(r.events).toEqual(['closed','region-guide:npc:1']);});
 it('cycles categories and cannot act from an empty list',()=>{const r=setup([entry('1')]);r.press(4);r.press(2);expect(r.events).toEqual([]);r.press(1);expect(r.events).toEqual(['closed']);});
 it('paginates more than five entries without losing later selectable entries',()=>{const r=setup(Array.from({length:8},(_,i)=>entry(String(i))));for(let i=0;i<6;i++)r.press(6);expect(r.texts).toContain('▶ 条目6');r.press(2);expect(r.events).toEqual(['closed','region-guide:npc:6']);});
 it('wraps long Chinese details and allows reading every detail page',()=>{const r=setup([entry('1')]);const before=r.texts.at(-1);r.press(7);expect(r.texts.at(-1)).not.toBe(before);expect(r.texts.some(t=>t.includes('详情2/'))).toBe(true);r.panel.close();});
 // Round109: the panel now derives the row capacity from the actual space,
 // so a short list earns a taller detail band; this fixture stays long
 // enough to still exercise multi-page detail reading.
 it('retains full long authored advice in the overview instead of hiding overflow',()=>{const r=setup([]);for(let i=0;i<5;i++)r.press(4);expect(r.texts).toContain('▶ 地区角色与行旅建议');expect(r.texts.some(t=>t.includes('完整行旅建议见「说明」分类'))).toBe(true);r.press(2);expect(r.panel.isOpen).toBe(true);r.press(1);});
 it('nonspatial quest information can be read but cannot fabricate a destination',()=>{const r=setup([entry('q','quest',null)]);r.press(4);r.press(2);expect(r.events).toEqual([]);r.panel.destroy();expect(r.events).toEqual(['closed']);});
});

/**
 * Round109 measured-geometry regression: the texts below report REAL
 * rendered rectangles (width from the same measuring context the panel
 * uses, height from the wrapped line count at the live font size), so the
 * old fixed-height stubs can no longer mask an overlap. Both target
 * configurations from the acceptance brief are covered: 640x360 at text
 * scale 1.5 and 960x540 at the maximum scale 1.6, each with a long CJK
 * MOD region name.
 */
interface MeasuredText{
 x:number;y:number;text:string;fontPx:number;
 lines:string[];
 width:number;height:number;
}
function measuredSetup(options:{vw:number;vh:number;scale:number;name?:string;entries:RegionGuideEntry[]}){
 scaleRef.v=options.scale;
 const created:MeasuredText[]=[];
 const makeText=(x:number,y:number,text:string,fontSize:string)=>{
  const t={x,y,text,fontPx:Number.parseFloat(fontSize),lines:[text],destroyed:false,
   get width(){return Math.max(1,...this.lines.map(l=>l.length*this.fontPx));},
   get height(){return this.lines.length*this.fontPx*1.2+2;},
   setText(v:string){this.text=v;this.lines=v.split('\n');return this;},
   setOrigin(){return this;},setPosition(px:number,py:number){this.x=px;this.y=py;return this;},
   setColor(){return this;},setVisible(){return this;},
   destroy(){this.destroyed=true;},
   context:{} as {measureText:(s:string)=>{width:number}}};
  t.context={measureText:(s:string)=>({width:s.length*t.fontPx})};
  created.push(t as MeasuredText);return t;};
 const scene={scale:{width:options.vw,height:options.vh},input:{keyboard:{addKey:()=>({on(){},off(){}})}},
  add:{container:()=>({setDepth(){return this},setVisible(){return this},removeAll(){return this},add(){return this},destroy(){}}),
   text:(x:number,y:number,text:string,style:{fontSize:string})=>makeText(x,y,text,style.fontSize)}} as unknown as Phaser.Scene;
 const panel=new RegionalGuidePanel(scene,()=>{});
 panel.open({name:options.name??'铁嶂北道·岩关驿镇',role:'调查',advice:'此区人物多托付差事，补给在驿站南侧，出行宜早。'.repeat(6),entries:options.entries,onNavigate(){}});
 return {panel,texts:created.filter(t=>!t.lines.every(l=>l===''))};
}
describe('Round109 measured panel geometry at both target configurations',()=>{
 const configs=[{vw:640,vh:360,scale:1.5,label:'640x360 at scale 1.5'},{vw:960,vh:540,scale:1.6,label:'960x540 at scale 1.6'}];
 for(const config of configs){
  it(`keeps every rendered rectangle inside the panel with no vertical band overlap (${config.label})`,()=>{
   const longName='云岭古道·断云栈道以西外加的极长MOD命名后缀';
   const {texts}=measuredSetup({...config,name:longName,entries:Array.from({length:6},(_,i)=>entry(String(i)))});
   const width=Math.min(850,config.vw-40),height=Math.min(500,config.vh-40);
   const left=(config.vw-width)/2,top=(config.vh-height)/2;
   const live=texts.filter(t=>t.lines.some(l=>l.length>0));
   expect(live.length).toBeGreaterThan(0);
   for(const t of live){ // every rectangle inside the panel body
    expect(t.x).toBeGreaterThanOrEqual(left+20);
    expect(t.x+t.width).toBeLessThanOrEqual(left+width-12);
    expect(t.y).toBeGreaterThanOrEqual(top+12);
    expect(t.y+t.height).toBeLessThanOrEqual(top+height-4);
   }
   // Single inner column: the vertical stack must not overlap itself.
   const stack=[...live].sort((a,b)=>a.y-b.y);
   for(let i=1;i<stack.length;i+=1)
    expect(stack[i]!.y).toBeGreaterThanOrEqual(stack[i-1]!.y+stack[i-1]!.height-1);
   // The compact heading (topmost text) is one line and a MOD-long name
   // never renders in full — it ellipsizes, keeping the atlas copy intact.
   const heading=stack[0]!;
   expect(heading.lines).toHaveLength(1);
   expect(heading.text).not.toBe(`${longName} · 调查行旅`);
   expect(heading.text.endsWith('…')).toBe(true);
  });
  it(`shows at least one actionable row plus a readable detail band (${config.label})`,()=>{
   const {texts}=measuredSetup({...config,entries:[entry('1'),entry('2')]});
   const live=texts.filter(t=>t.lines.some(l=>l.length>0));
   const row=live.find(t=>t.lines[0]!.startsWith('▶ '));
   const footer=live.filter(t=>t.text.includes('导航只带路')||t.lines[0]?.startsWith('第')||t.text.includes('没有条目'));

   expect(row).toBeDefined();
   expect(footer.length).toBeGreaterThan(0);
   const rowBottom=row!.y+row!.height;
   const footerTop=Math.min(...footer.map(t=>t.y));
   const detail=live.filter(t=>t!==row&&t.y>=rowBottom&&t.y<footerTop&&t.lines.join('').length>10);
   expect(detail.length).toBeGreaterThan(0); // a readable detail body exists below the rows
   const detailBottom=Math.max(...detail.map(t=>t.y+t.height));
   expect(detailBottom).toBeLessThanOrEqual(footerTop-2);
  });
 }
 it('counts the actual wrapped category height before the list starts (scale 1.6 narrow panel)',()=>{
  scaleRef.v=1.6;
  const created:MeasuredText[]=[];
  const makeText=(x:number,y:number,text:string,fontSize:string)=>{
   const t={x,y,text,fontPx:Number.parseFloat(fontSize),lines:[text],
    get width(){return Math.max(1,...this.lines.map(l=>l.length*this.fontPx));},
    get height(){return this.lines.length*this.fontPx*1.2+2;},
    setText(v:string){this.text=v;this.lines=v.split('\n');return this;},
    setOrigin(){return this;},setPosition(px:number,py:number){this.x=px;this.y=py;return this;},
    setColor(){return this;},setVisible(){return this;},destroy(){},
    context:{} as {measureText:(s:string)=>{width:number}}};
   t.context={measureText:(s:string)=>({width:s.length*t.fontPx})};
   created.push(t as MeasuredText);return t;};
  const scene={scale:{width:640,height:360},input:{keyboard:{addKey:()=>({on(){},off(){}})}},
   add:{container:()=>({setDepth(){return this},setVisible(){return this},removeAll(){return this},add(){return this},destroy(){}}),
    text:(x:number,y:number,text:string,style:{fontSize:string})=>makeText(x,y,text,style.fontSize)}} as unknown as Phaser.Scene;
  const panel=new RegionalGuidePanel(scene,()=>{});
  panel.open({name:'雾雨渡口',role:'行旅',advice:'短建议',entries:[entry('1')],onNavigate(){}});
  const live=created.filter(t=>t.lines.some(l=>l.length>0));
  const category=live.find(t=>t.text.includes('◆补给'))!;
  const row=live.find(t=>t.lines[0]!.startsWith('▶ '))!;
  expect(category.lines.length).toBeGreaterThanOrEqual(1);
  expect(row.y).toBeGreaterThanOrEqual(category.y+category.height-1); // listTop includes the real wrapped strip
 });
});
