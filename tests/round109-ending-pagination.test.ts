/**
 * Round 109: 块感知分页器与结局面板页脚回归。
 *
 * paginateDialogueBlocks：内容无关、不丢行（含空行分隔）、章题不孤悬页尾、
 * capacity=1 不死循环不丢字；paginateDialogueLines 默认行为不变。面板侧用
 * 真实结局数据：单页终章页脚不再邀请不存在的下一页，多页终章区分“读下
 * 一页”与“末页结束”，重开面板后页数/页码复位，终章任何一页都不以章节
 * 标题行收尾。几何断言沿用 Round108 的 640x360 fontScale1.5 约束。
 */
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {paginateDialogueLines,paginateDialogueBlocks,wrapDialogueText} from '../src/game/dialogue-layout';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{UP:1,W:2,DOWN:3,S:4,ENTER:5,ESC:6,SPACE:7,RIGHT:8,LEFT:9}}}}}));
vi.mock('../src/game/ui-theme',()=>({UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#a',text:'#t',muted:'#m',jade:'#j'},addPixelPanelChrome:()=>{}}));
let scale=1;
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.round(n*scale)}px`}));
import {EndingPanel} from '../src/game/ending-ui';
import {parseEndingSet,type EndingEvaluationContext,type EndingData} from '../src/engine/ending-system';
import {createSocialState} from '../src/engine/social-state';

describe('Round109 block-aware paginator keeps chapter titles with their body',()=>{
 const measure=(text:string):number=>Array.from(text).length*12;
 const blockOrphanAtEnd=(pages:string[],lines:readonly string[]):boolean=>{
   let offset=0;
   for(const page of pages){const chunk=page.split('\n'); // '' is one real blank line.
     const globalIndex=offset+chunk.length-1;
     const startsBlock=globalIndex===0||(lines[globalIndex]!==''&&lines[globalIndex-1]==='');
     let length=0;while(globalIndex+length<lines.length&&lines[globalIndex+length]!=='')length+=1;
     if(startsBlock&&length>=2)return true;
     offset+=chunk.length;}
   return false;};
 const authored='开篇引言一句话。\n开篇第二句。\n\n大陆：更簿与井药\n更簿公开了署名，过路人得以核牌。\n井壁记水、更簿记班。\n\n北境：今烽与旧界\n今烽番号已公开。\n旧路可查。';
 const wrapped=wrapDialogueText(authored,40,measure);

 it('loses no lines, including blank separators, at any capacity',()=>{
  for(const capacity of [1,2,3,4,7,100]){
    const pages=paginateDialogueBlocks(wrapped,capacity);
    expect(pages.join('\n')).toBe(wrapped.join('\n'));
  }
 });
 it('never strands a block-opening line at the bottom of a page',()=>{
  const trap=['引言一','引言二','引言三','引言四','','章题','章文第一行'];
  for(const capacity of [2,3,6]){
    const pages=paginateDialogueBlocks(trap,capacity);
    expect(pages.join('\n')).toBe(trap.join('\n'));
    expect(blockOrphanAtEnd(pages,trap)).toBe(false);
  }
  expect(paginateDialogueBlocks(trap,6).at(-1)!.split('\n')).toEqual(['章题','章文第一行']);
 });
 it('capacity one still yields exactly one page per line and terminates',()=>{
  const lines=['甲','','乙','丙','','','丁'];
  const pages=paginateDialogueBlocks(lines,1);
  expect(pages).toHaveLength(lines.length);
  expect(pages.join('\n')).toBe(lines.join('\n'));
 });
 it('empty and single-line inputs keep the legacy page contract',()=>{
  expect(paginateDialogueBlocks([],3)).toEqual(['']);
  expect(paginateDialogueBlocks(['唯一'],3)).toEqual(['唯一']);
  expect(paginateDialogueBlocks(['',''],1)).toEqual(['','']);
 });
 it('paginateDialogueLines default behavior stays byte-identical',()=>{
  expect(paginateDialogueLines(wrapped,4)).toEqual(
    Array.from({length:Math.ceil(wrapped.length/4)},(_,i)=>wrapped.slice(i*4,i*4+4).join('\n')));
 });
 it('walks every page of the real epilogue without orphaned section titles',()=>{
  const parsed=parseEndingSet(JSON.parse(readFileSync(new URL('../data/base/endings/round-27-endings.json',import.meta.url),'utf8')));
  if(!parsed.ok)throw Error('endings');
  for(const ending of parsed.set.endings){
    const lines=wrapDialogueText(ending.epilogue,30,measure);
    const pages=paginateDialogueBlocks(lines,2);
    expect(pages.join('\n')).toBe(lines.join('\n'));
    expect(blockOrphanAtEnd(pages,lines)).toBe(false);
  }
 });
});

// ---------------------------------------------------------------------------
const parsedSet=parseEndingSet(JSON.parse(readFileSync(new URL('../data/base/endings/round-27-endings.json',import.meta.url),'utf8')));
if(!parsedSet.ok)throw Error('endings');
const record=parsedSet.set;
function setup(available:boolean,width:number,height:number,fontScale:number,endingOverride?:Partial<EndingData>){
 scale=fontScale;
 const keys=new Map<number,Set<()=>void>>();const shown:{text:string;destroyed:boolean;x:number;y:number;height:number;size:number}[]=[];
 const container={setVisible(){return this},setDepth(){return this},add(){return this},removeAll(){for(const t of shown)t.destroyed=true;return this},destroy(){}};
 const scene={scale:{width,height},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());
  return{on(_e:string,fn:()=>void){keys.get(code)!.add(fn)},off(_e:string,fn:()=>void){keys.get(code)!.delete(fn)}}}}},
  add:{container:()=>container,text:(x:number,y:number,text:string,style:{fontSize:string})=>{
   const size=Number.parseInt(style.fontSize,10),t={text,destroyed:false,x,y,size,height:size,
    context:{measureText:(v:string)=>({width:Array.from(v).length*size})},destroy(){this.destroyed=true},setOrigin(){return this},setText(v:string){this.text=v;this.height=v.split('\n').length*(size+3);return this}};
   shown.push(t);return t;}}} as unknown as Phaser.Scene;
 const context:EndingEvaluationContext={questStatuses:new Map(available?[['quest.r42-open-register','completed']]:[]),social:createSocialState(),factionMembership:null,
  knownKnowledgeNodeIds:new Set(available?['event.r42-public-record-vow']:[])};
 let closed=0,finished=0;const panel=new EndingPanel(scene,()=>closed++);
 const base=record.endings.find(e=>e.id==='ending.r42-open-register')!;
 const ending={...base,...endingOverride};
 const openArgs={endingSet:{record,gate:record.gate,endings:[ending]},context,onFinish:()=>finished++};
 panel.open(openArgs);
 return{panel,visible:()=>shown.filter(t=>!t.destroyed),text:()=>shown.filter(t=>!t.destroyed).map(t=>t.text).join('\n'),
  finished:()=>finished,closed:()=>closed,reopen:()=>panel.open(openArgs),
  press:(code:number)=>{for(const fn of [...keys.get(code)??[]])fn()}};
}

describe('Round109 ending panel footers match the real page count',()=>{
 it('a single-page terminal footer invites finishing, never a next page',()=>{
  const r=setup(true,960,540,1,{epilogue:'短终章：一行足矣。\n第二行收束。',epilogueSections:undefined});
  r.press(5);r.press(5); // Browse → confirm → terminal.
  expect(r.text()).toContain('终章已完整显示');
  expect(r.text()).not.toContain('下一页');
  r.press(5); // Enter on the single page finishes in one step.
  expect(r.finished()).toBe(1);expect(r.closed()).toBe(1);
 });

 it('a multi-page terminal distinguishes next-page from last-page finish',()=>{
  const r=setup(true,640,360,1.5); // Round108 geometry: several pages.
  r.press(5);r.press(5);
  const flat=()=>r.visible().map(t=>t.text).join(' ').replace(/\n/g,''); // Footer may wrap.
  expect(flat()).toContain('终章 1/');
  expect(flat()).toContain('Enter读下一页');
  const seen:string[]=[];
  for(let guard=0;guard<40&&r.finished()===0;guard++){seen.push(flat());r.press(8);}
  expect(seen.join(' ')).not.toContain('终章已完整显示'); // Genuinely multi-page.
  expect(seen.at(-1)!).toContain('Enter结束本次旅程');
  expect(seen.at(-1)!).not.toContain('读下一页');
  r.press(5);
  expect(r.finished()).toBe(1);
 });

 it('list-view detail footer states a fully shown single page',()=>{
  const r=setup(true,960,540,1,{epilogue:'短终章：一行足矣。\n第二行收束。',epilogueSections:undefined});
  expect(r.text()).toContain('详情已完整显示');
  expect(r.text()).not.toContain('Space/←/→翻页');
  r.panel.destroy();
 });

 it('reopening resets the page counter from any previous position',()=>{
  const locked=setup(false,640,360,1.5); // Long route detail → multi-page.
  expect(locked.text()).toContain('详情 1/');
  locked.press(7); // Space to a later detail page.
  expect(locked.text()).toMatch(/详情 [2-9]\//);
  locked.press(6); // Escape leaves the list view.
  expect(locked.closed()).toBe(1);
  locked.reopen(); // Same panel, fresh open: counters start over.
  expect(locked.text()).toContain('详情 1/');
  locked.panel.destroy();
 });

 it('no terminal page ends on an authored section title line',()=>{
  const r=setup(true,640,360,1.5);
  r.press(5);r.press(5);
  const titles=record.endings.find(e=>e.id==='ending.r42-open-register')!.epilogueSections!.map(s=>s.title);
  let pages=0;
  for(let guard=0;guard<40&&r.finished()===0;guard++){
    const body=r.visible().find(t=>t.y===104);
    expect(body).toBeDefined();
    expect(body!.y+body!.height).toBeLessThanOrEqual(283); // Round108 geometry bound.
    const lastLine=body!.text.split('\n').at(-1)!;
    expect(titles).not.toContain(lastLine);
    pages+=1;
    r.press(5); // Enter advances the page and finishes on the last one.
  }
  expect(pages).toBeGreaterThan(1);
  expect(r.finished()).toBe(1);
 });
});
