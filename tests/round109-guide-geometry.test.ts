/**
 * Round 109: 区域指南面板的几何派生与信息型条目回归。
 *
 * 用带真实行高的文本桩（height 随 setText 按行数×字号重算）验证两种
 * 几何：默认 960x540 与 640x360 逻辑比例 fontScale1.5。行容量必须由
 * 实际空间推导：标题/帮助/建议/分类按实际文本高度堆叠互不重叠，列表
 * 行、详情带、页脚全部落在面板内，长建议不压住列表；所有条目（含
 * 超出首屏者）仍可选；信息型条目 Enter 只提示不导航不关闭；单页详情
 * 与多页详情的页脚文案区分；导航回调仍先关面板再导航。
 */
import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{ESC:1,ENTER:2,LEFT:3,RIGHT:4,UP:5,DOWN:6,SPACE:7}}}}}));
vi.mock('../src/game/ui-theme',()=>({addPixelPanelChrome:()=>{},UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa'}}));
let scale=1;
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.round(n*scale)}px`}));
import {RegionalGuidePanel} from '../src/game/regional-guide-ui';
import type {RegionGuideEntry} from '../src/engine/regional-guide';

interface ShownText{text:string;y:number;height:number;size:number;destroyed:boolean}
function setup(width:number,height:number,fontScale:number,entries:RegionGuideEntry[],advice='行旅建议'.repeat(30)){
  scale=fontScale;
  const keys=new Map<number,Set<()=>void>>();const shown:ShownText[]=[];
  const container={setDepth(){return this},setVisible(){return this},add(){return this},
    removeAll(){for(const t of shown)t.destroyed=true;return this},destroy(){}};
  const scene={scale:{width,height},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());
    return{on(_e:string,fn:()=>void){keys.get(code)!.add(fn)},off(_e:string,fn:()=>void){keys.get(code)!.delete(fn)}}}}},
    add:{container:()=>container,text:(x:number,y:number,text:string,style:{fontSize:string})=>{
      expect(Number.isFinite(x)&&Number.isFinite(y)).toBe(true);
      const size=Number.parseInt(style.fontSize,10);
      const t={text,y,height:size,size,destroyed:false,
        context:{measureText:(v:string)=>({width:Array.from(v).length*size})},
        setOrigin(){return this},setPosition(_x:number,newY:number){this.y=newY;return this},
        setColor(){return this},destroy(){this.destroyed=true},
        setText(v:string){this.text=v;this.height=v.split('\n').length*(size+2);return this}};
      shown.push(t);return t;}}} as unknown as Phaser.Scene;
  const events:string[]=[];
  const panel=new RegionalGuidePanel(scene,()=>events.push('closed'));
  panel.open({name:'测试地区',role:'调查',advice,entries,onNavigate:id=>{expect(panel.isOpen).toBe(false);events.push(id)}});
  const visible=()=>shown.filter(t=>!t.destroyed);
  const find=(needle:string)=>visible().find(t=>t.text.includes(needle));
  return{panel,events,visible,find,
    press:(key:number)=>{for(const fn of [...keys.get(key)??[]])fn()}};
}
const entry=(id:string,category:RegionGuideEntry['category']='supply',destinationId:string|null='region-guide:npc:'+id):RegionGuideEntry=>
  ({id,category,title:'条目'+id,detail:'补给详情甲'.repeat(40),destinationId});
const twelve=Array.from({length:12},(_,i)=>entry(String(i)));

describe('Round109 regional guide geometry derived from actual space',()=>{
 for(const [width,height,fontScale,label] of [[960,540,1,'default 960x540'],[640,360,1.5,'640x360 fontScale1.5']] as const){
  it(label+': header bands stack by real text height without overlap',()=>{
    const r=setup(width,height,fontScale,twelve);
    const title=r.find(' · 调查行旅')!,help=r.find('←/→分类')!,advice=r.visible().find(t=>t.y>=(help.y+help.height)&&t.text.includes('行旅建议'))!,
      category=r.find('◆')!,footer=r.find('导航只带路')!;
    const rows=r.visible().filter(t=>/^(▶|　) /.test(t.text));
    // Check rendered bands, not object creation order (footers are allocated first).
    const status=r.find('第1/')!;
    const rowBottom=Math.max(...rows.map(row=>row.y+row.height));
    const detail=r.visible().find(t=>t.y>=rowBottom&&t.y<status.y&&t.text.length>0)!;
    const panelTop=(height-Math.min(500,height-40))/2,panelBottom=panelTop+Math.min(500,height-40);
    expect(title.y+title.height).toBeLessThanOrEqual(help.y);
    if(advice){expect(help.y+help.height).toBeLessThanOrEqual(advice.y);
      expect(advice.y+advice.height).toBeLessThanOrEqual(category.y);}
    else expect(help.y+help.height).toBeLessThanOrEqual(category.y);
    expect(category.y+category.height).toBeLessThanOrEqual(rows[0]!.y);
    for(const row of rows)expect(row.y+row.height).toBeLessThanOrEqual(detail.y);
    expect(detail).toBeDefined();
    expect(detail.y+detail.height).toBeLessThanOrEqual(status.y-2);
    expect(status.y+status.height).toBeLessThanOrEqual(footer.y); // Status line clears the action line.
    expect(footer.y+footer.height).toBeLessThanOrEqual(panelBottom);
    for(const t of r.visible()){expect(t.y).toBeGreaterThanOrEqual(panelTop);expect(t.y+t.height).toBeLessThanOrEqual(panelBottom);}
    r.panel.destroy();
  });

  it(label+': every entry stays reachable beyond the visible rows',()=>{
    const r=setup(width,height,fontScale,twelve);
    const seen=new Set<string>();
    const marker=()=>r.visible().find(t=>t.text.startsWith('▶ '));
    if(marker())seen.add(marker()!.text); // Entry 0 before any press.
    for(let i=0;i<11;i++){r.press(6);if(marker())seen.add(marker()!.text);}
    expect(seen.size).toBe(12); // Every entry was the selected row at some point.
    expect(seen.has('▶ 条目11')).toBe(true); // The last entry is selectable.
    expect(r.find('列表')).toBeDefined(); // Multi-page list advertises paging on the status line.
    r.press(2); // Enter on the selected remote entry still navigates after closing.
    expect(r.events).toEqual(['closed','region-guide:npc:11']);
  });

  it(label+': single-page and multi-page detail footers tell the truth',()=>{
    const r=setup(width,height,fontScale,[entry('only')]);
    // One short detail fits the band on the wide geometry; the tight one
    // paginates — both footers must state the real situation.
    r.press(7); // Space: on a single page this is a harmless no-op cycle.
    const footer=r.find('导航只带路')!.text;
    expect(footer.includes('详情已完整显示')||/详情\d+\/\d+页/.test(footer)).toBe(true);
    if(footer.includes('页'))expect(footer).toContain('Space翻页');
    r.panel.destroy();
  });
 }

 it('information-only entries notify instead of navigating or closing',()=>{
  const r=setup(640,360,1.5,[entry('q','quest',null)]);
  r.press(4); // → the quest category where the entry lives.
  r.press(2);
  expect(r.events).toEqual([]);
  expect(r.panel.isOpen).toBe(true);
  expect(r.find('仅作说明')).toBeDefined(); // Meaningful notice, panel stays open.
  r.press(1);
  expect(r.events).toEqual(['closed']);
 });

 it('multi-line supply details read page by page at tight geometry',()=>{
  const r=setup(640,360,1.5,[entry('1')]);
  const first=r.find('导航只带路')!.text;
  expect(first).toMatch(/详情1\/\d+页/); // One line per page: genuinely paged.
  r.press(7);
  expect(r.find('导航只带路')!.text).not.toBe(first); // Space turned a real page.
  r.panel.destroy();
 });
 it('compact categories always name the currently selected category',()=>{
  const r=setup(640,360,1.5,[entry('1')]);
  for(let i=0;i<5;i++)r.press(4);
  expect(r.find('◆说明')).toBeDefined();
  r.panel.destroy();
 });
});
