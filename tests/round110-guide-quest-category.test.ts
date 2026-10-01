/**
 * Round 110: R 面板差事分类的界面语义回归（mock 场景）。
 *
 * 分类标签从「活动差事」改为「差事」；分类为空时不再是一片空白，而是
 * 明确「暂无进行中或本地可接委托；人物页可查交谈」；待接条目 Enter 只
 * 关面板并导航到委托人选择器，面板自身没有任何接取动作。R109 的实测
 * 几何约束（分页/尺寸推导）不受本轮改动影响，由 round109 专项继续覆盖。
 */
import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{ESC:1,ENTER:2,LEFT:3,RIGHT:4,UP:5,DOWN:6,SPACE:7}}}}}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.max(8,Math.round(n))}px`}));
vi.mock('../src/game/ui-theme',()=>({addPixelPanelChrome:()=>{},UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa'}}));
import {RegionalGuidePanel} from '../src/game/regional-guide-ui';
import type {RegionGuideEntry} from '../src/engine/regional-guide';

function baseTextStub(texts:string[],initial:string,measurePerChar=12){
 return {text:initial,ox:0,oy:0,x:0,y:0,height:24,
  context:{measureText:(t:string)=>({width:t.length*measurePerChar})},
  setText(t:string){this.text=t;texts.push(t);return this},
  setOrigin(ox:number=0,oy:number=0){this.ox=ox;this.oy=oy;texts.push(this.text);return this},
  setPosition(x:number,y:number){this.x=x;this.y=y;return this},
  setColor(){return this},setVisible(){return this},destroy(){}};
}
function setup(entries:RegionGuideEntry[],advice='行旅建议'.repeat(30)){
 const keys=new Map<number,Set<()=>void>>(),texts:string[]=[],events:string[]=[];
 const container={setDepth(){return this},setVisible(){return this},removeAll(){return this},add(){return this},destroy(){}};
 const scene={scale:{width:960,height:540},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());
   return{on(_event:string,fn:()=>void){keys.get(code)!.add(fn)},off(_event:string,fn:()=>void){keys.get(code)!.delete(fn)}}}}},
  add:{container:()=>container,text:(_x:number,_y:number,text:string)=>{expect(Number.isFinite(_x)&&Number.isFinite(_y)).toBe(true);return baseTextStub(texts,text);}}} as unknown as Phaser.Scene;
 const panel=new RegionalGuidePanel(scene,()=>events.push('closed'));
 panel.open({name:'铁嶂北道',role:'调查',advice,entries,onNavigate:id=>{expect(panel.isOpen).toBe(false);events.push(id)}});
 return{panel,texts,events,press:(key:number)=>{for(const fn of [...keys.get(key)??[]])fn();}};
}

describe('Round110 quest category label, empty state and navigate-only offers',()=>{
 it('renames the category to 差事 and explains an empty page instead of leaving it blank',()=>{
  const r=setup([]);
  r.press(4); // ←/→ once: supply → quest.
  expect(r.texts.some(t=>t.includes('◆差事'))).toBe(true);
  expect(r.texts.some(t=>t.includes('活动差事'))).toBe(false);
  expect(r.texts.some(t=>t.includes('暂无进行中或本地可接委托；人物页可查交谈。'))).toBe(true);
  r.press(2); // Nothing selectable: Enter must not close or navigate.
  expect(r.events).toEqual([]);
  expect(r.panel.isOpen).toBe(true);
  r.press(1);
  expect(r.events).toEqual(['closed']);
  r.panel.destroy();
 });

 it('shows an offered commission row and only walks the player to the giver',()=>{
  const entries:RegionGuideEntry[]=[
   {id:'offer:quest.r62-north-pass-marks',category:'quest',title:'北隘校标（待接取）',
    detail:'待接取 · 委托人 邵长庚 (49,48) · 位置随当前时段重算。',destinationId:'region-guide:npc:char.shao-changgeng'},
   {id:'quest:quest.r62-post-ledger',category:'quest',title:'驿镇更次',
    detail:'找秦素砚核对旧烽台巡山更次 · 秦素砚',destinationId:'quest:quest.r62-post-ledger'},
  ];
  const r=setup(entries);
  r.press(4); // quest category.
  expect(r.texts.some(t=>t.includes('▶ 北隘校标（待接取）'))).toBe(true);
  expect(r.texts.some(t=>t.includes('　 驿镇更次'))).toBe(true); // Idle row keeps its full title.
  r.press(2); // Enter on the offered row: navigate only, never accept.
  expect(r.events).toEqual(['closed','region-guide:npc:char.shao-changgeng']);
  r.panel.destroy();
 });

 it('keeps the active band intact: objective rows keep their quest selector',()=>{
  const entries:RegionGuideEntry[]=[
   {id:'quest:quest.r62-post-ledger',category:'quest',title:'驿镇更次',
    detail:'找秦素砚核对旧烽台巡山更次 · 秦素砚',destinationId:'quest:quest.r62-post-ledger'},
  ];
  const r=setup(entries);
  r.press(4);
  r.press(2);
  expect(r.events).toEqual(['closed','quest:quest.r62-post-ledger']);
  r.panel.destroy();
 });
});
