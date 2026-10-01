/**
 * Round 144: 终章路线解析优先级与可见回执。
 *
 * 引擎：unlockRoutes 按声明顺序优先采用首条已满足的扩展路线，仅当无扩展
 * 满足时回落 original；未满足仍拒绝且不产出 selectedRoute。选择结果以附
 * 加 route 字段向后兼容地透出。UI：列表详情、确认页、终章页三处显示实际
 * 解析路径；大字号（640x360 fontScale1.5）下路径行经计量换行，不与正文
 * 或页脚重叠；关闭重开不留旧路线；确认回调恰好一次；测试旅程不改写授权
 * 数据或知识上下文（不把测试算实走）。
 */
import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{UP:1,W:2,DOWN:3,S:4,ENTER:5,ESC:6,SPACE:7,RIGHT:8,LEFT:9}}}}}));
vi.mock('../src/game/ui-theme',()=>({UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#a',text:'#t',muted:'#m',jade:'#j'},addPixelPanelChrome:()=>{}}));
let scale=1;
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>`${Math.round(n*scale)}px`}));
import {EndingPanel} from '../src/game/ending-ui';
import {
  evaluateEndings,
  selectEnding,
  parseEndingSet,
  type AssembledEndingSet,
  type EndingData,
  type EndingEvaluationContext,
} from '../src/engine/ending-system';
import type {QuestStatus} from '../src/engine/quest-system';
import {createSocialState} from '../src/engine/social-state';

const rawText=readFileSync(new URL('../data/base/endings/round-27-endings.json',import.meta.url),'utf8');
const parsed=parseEndingSet(JSON.parse(rawText));
if(!parsed.ok)throw Error('endings');
const record=parsed.set;
const assembled:AssembledEndingSet={record,gate:record.gate,endings:record.endings};
const byId=(id:string):EndingData=>record.endings.find(e=>e.id===id)!;
const CLOSES=['event.r100-mainland-close','event.r101-north-close','event.r102-sea-close'] as const;
function context(known:readonly string[],quests:Record<string,QuestStatus>={}):EndingEvaluationContext{
  return {questStatuses:new Map(Object.entries(quests)),social:createSocialState(),factionMembership:null,knownKnowledgeNodeIds:new Set(known)};
}

describe('Round144 route precedence in evaluation and selection',()=>{
  it('adopts the satisfied chapter route even though the original path is also satisfied',()=>{
    const ctx=context([...CLOSES,'event.old-footprints']);
    const row=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.open-water')!;
    expect(row.available).toBe(true);
    expect(row.selectedRoute).toEqual({id:'r108-voyage',title:'三章自由行路'});
    expect(row.resolvedEpilogue.startsWith('你把三章记录带回照心石前')).toBe(true);
    expect(row.resolvedEpilogue).not.toContain('你没有把名字留在任何一块门墙下');
    const selected=selectEnding(assembled,'ending.open-water',ctx);
    expect(selected.ok).toBe(true);
    if(!selected.ok)return;
    expect(selected.route).toEqual({id:'r108-voyage',title:'三章自由行路'});
    expect(selected.ending.id).toBe('ending.open-water');
    expect(selected.ending.epilogue.startsWith('你把三章记录带回照心石前')).toBe(true);
  });

  it('keeps the register epilogue on its chapter route when both paths are open',()=>{
    const ctx=context([...CLOSES,'event.r100-record-open','event.r101-code-open','event.r102-pilot-public','event.r42-public-record-vow'],
      {'quest.r42-open-register':'completed'});
    const register=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.r42-open-register')!;
    expect(register.available).toBe(true);
    expect(register.selectedRoute).toEqual({id:'r108-open',title:'三章公开记录'});
    expect(register.resolvedEpilogue.startsWith('你把大陆更簿、北境今烽与海路潮记分栏相对')).toBe(true);
    const shelter=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.r42-sheltered-witness')!;
    expect(shelter.available).toBe(false);
    expect(shelter.selectedRoute).toBeUndefined();
  });

  it('falls back to the original path only when no authored route is satisfied',()=>{
    const ctx=context(['event.old-footprints']);
    const row=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.open-water')!;
    expect(row.available).toBe(true);
    expect(row.selectedRoute).toEqual({id:'original',title:'原有旅程'});
    expect(row.resolvedEpilogue.startsWith('你没有把名字留在任何一块门墙下')).toBe(true);
    const selected=selectEnding(assembled,'ending.open-water',ctx);
    expect(selected.ok).toBe(true);
    if(selected.ok)expect(selected.route).toEqual({id:'original',title:'原有旅程'});
  });

  it('a mixed chapter state unlocks the voyage route while the original path stays unmet',()=>{
    const ctx=context([...CLOSES,'event.r100-record-open','event.r101-code-limited','event.r102-pilot-crew']);
    const voyage=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.open-water')!;
    expect(voyage.available).toBe(true);
    expect(voyage.selectedRoute).toEqual({id:'r108-voyage',title:'三章自由行路'});
    const register=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.r42-open-register')!;
    expect(register.available).toBe(false);
    expect(register.selectedRoute).toBeUndefined();
    const shelter=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.r42-sheltered-witness')!;
    expect(shelter.available).toBe(false);
    expect(shelter.unmetHints).toEqual(['大陆更簿选择保护姓名；若已公开署名的本次旅程请走其他归处']);
  });

  it('declaration order decides between multiple satisfied authored routes',()=>{
    const synthetic=(first:'a'|'b'):AssembledEndingSet=>{
      const route=(key:'a'|'b')=>({id:'route-'+key,title:'路线'+(key==='a'?'甲':'乙'),
        epilogue:(key==='a'?'甲':'乙')+'引言。',conditions:[{kind:'knowledgeKnown',nodeId:'event.'+key,hint:'取'+(key==='a'?'甲':'乙')}]});
      const result=parseEndingSet({
        id:'ending.set.round144-order',
        gate:{id:'ending.gate.round144-order',name:'试心石',mapResourceId:'map.round-10-mist-ferry',position:{col:1,row:1},approachText:'试。'},
        endings:[{id:'ending.round144-order',knowledgeNodeId:'ending.round144-order',title:'双路归处',epilogue:'原始引言。',priority:10,
          conditions:[{kind:'knowledgeKnown',nodeId:'event.base',hint:'基础'}],unlockRoutes:[route(first),route(first==='a'?'b':'a')]}],
      });
      if(!result.ok)throw Error('synthetic');
      return {record:result.set,gate:result.set.gate,endings:result.set.endings};
    };
    const both=evaluateEndings(synthetic('a'),context(['event.base','event.a','event.b']))[0]!;
    expect(both.selectedRoute).toEqual({id:'route-a',title:'路线甲'});
    expect(both.resolvedEpilogue.startsWith('甲引言。')).toBe(true);
    const reversed=evaluateEndings(synthetic('b'),context(['event.base','event.a','event.b']))[0]!;
    expect(reversed.selectedRoute).toEqual({id:'route-b',title:'路线乙'});
    expect(reversed.resolvedEpilogue.startsWith('乙引言。')).toBe(true);
    const onlySecond=evaluateEndings(synthetic('a'),context(['event.b']))[0]!;
    expect(onlySecond.selectedRoute).toEqual({id:'route-b',title:'路线乙'});
    expect(onlySecond.resolvedEpilogue.startsWith('乙引言。')).toBe(true);
    const originalOnly=evaluateEndings(synthetic('a'),context(['event.base']))[0]!;
    expect(originalOnly.selectedRoute).toEqual({id:'original',title:'原有旅程'});
    expect(originalOnly.resolvedEpilogue.startsWith('原始引言。')).toBe(true);
    const none=evaluateEndings(synthetic('a'),context([]))[0]!;
    expect(none.available).toBe(false);
    expect(none.selectedRoute).toBeUndefined();
    expect(selectEnding(synthetic('a'),'ending.round144-order',context([])).ok).toBe(false);
  });

  it('refusal keeps reporting the nearest route hints without adopting any route',()=>{
    const ctx=context(['event.r42-public-record-vow']);
    const row=evaluateEndings(assembled,ctx).find(r=>r.ending.id==='ending.r42-open-register')!;
    expect(row.available).toBe(false);
    expect(row.selectedRoute).toBeUndefined();
    expect(row.unmetHints).toEqual(['完成「明册立约」，将证物誊入书院副册']);
    const selected=selectEnding(assembled,'ending.r42-open-register',ctx);
    expect(selected.ok).toBe(false);
    if(!selected.ok)expect(selected.reason).toBe('完成「明册立约」，将证物誊入书院副册');
  });
});

// ---------------------------------------------------------------------------
function setup(known:readonly string[],width:number,height:number,fontScale:number,ending:EndingData=byId('ending.open-water')){
  scale=fontScale;
  const keys=new Map<number,Set<()=>void>>();
  const shown:{text:string;destroyed:boolean;x:number;y:number;size:number;height:number}[]=[];
  const container={setVisible(){return this},setDepth(){return this},add(){return this},removeAll(){for(const t of shown)t.destroyed=true;return this},destroy(){}};
  const scene={scale:{width,height},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());
    return{on(_e:string,fn:()=>void){keys.get(code)!.add(fn)},off(_e:string,fn:()=>void){keys.get(code)!.delete(fn)}};}}},
    add:{container:()=>container,text:(x:number,y:number,text:string,style:{fontSize:string})=>{
      const size=Number.parseInt(style.fontSize,10),t={text,destroyed:false,x,y,size,height:size,
        context:{measureText:(v:string)=>({width:Array.from(v).length*size})},destroy(){this.destroyed=true},setOrigin(){return this},setText(v:string){this.text=v;this.height=v.split('\n').length*(size+3);return this}};
      shown.push(t);return t;}}} as unknown as Phaser.Scene;
  const ctx:EndingEvaluationContext={questStatuses:new Map(),social:createSocialState(),factionMembership:null,knownKnowledgeNodeIds:new Set(known)};
  let closed=0,finished=0;let finishedEnding:EndingData|null=null;
  const panel=new EndingPanel(scene,()=>closed++);
  const openArgs={endingSet:{record,gate:record.gate,endings:[ending]},context:ctx,
    onFinish:(ending:EndingData)=>{finished+=1;finishedEnding=ending;}};
  panel.open(openArgs);
  return{panel,ctx,openArgs,
    visible:()=>shown.filter(t=>!t.destroyed),text:()=>shown.filter(t=>!t.destroyed).map(t=>t.text).join('\n'),
    // Wrapping is layout, not content: assertions must survive mid-phrase breaks.
    flat:()=>shown.filter(t=>!t.destroyed).map(t=>t.text).join('').replace(/\n/g,''),
    finished:()=>finished,finishedEnding:()=>finishedEnding,closed:()=>closed,reopen:()=>panel.open(openArgs),
    press:(code:number)=>{for(const fn of [...keys.get(code)??[]])fn();}};
}

describe('Round144 ending panel shows the resolved route receipt',()=>{
  it('list, confirmation and terminal views all name the adopted chapter route',()=>{
    const r=setup([...CLOSES,'event.old-footprints'],640,360,1.5);
    // 第一页先给回执；块保护分页会把引言块推到详情后续页。
    expect(r.flat()).toContain('采用路径：三章自由行路');
    r.press(7);
    expect(r.flat()).toContain('你把三章记录带回照心石前');
    r.press(7);
    r.press(5);
    expect(r.text()).toContain('确认此行归处');
    expect(r.text()).toContain('采用路径：三章自由行路');
    r.press(5);
    expect(r.text()).toContain('采用路径：三章自由行路');
    const body=r.visible().find(t=>t.y===104)!;
    expect(body.text.split('\n')[0]).toContain('你把三章记录带回照心石前');
    expect(r.text()).not.toContain('你没有把名字留在任何一块门墙下');
    expect(r.finished()).toBe(0);
    r.panel.destroy();
  });

  it('at large font the wrapped route line never overlaps the paged body or footer, and the callback fires once',()=>{
    const r=setup([...CLOSES,'event.old-footprints'],640,360,1.5);
    r.press(5);r.press(5);
    let pages=0;
    for(let guard=0;guard<40&&r.finished()===0;guard+=1){
      const route=r.visible().find(t=>t.text.includes('采用路径：'))!;
      const body=r.visible().find(t=>t.y===104)!;
      expect(route).toBeDefined();
      expect(body).toBeDefined();
      expect(route.y+route.height).toBeLessThanOrEqual(body.y);
      expect(body.y+body.height).toBeLessThanOrEqual(283); // Round108 geometry bound.
      expect(r.text()).toContain('采用路径：三章自由行路');
      pages+=1;
      r.press(5);
    }
    expect(pages).toBeGreaterThan(1);
    expect(r.finished()).toBe(1);
    expect(r.closed()).toBe(1);
    r.press(5);r.press(6);
    expect(r.finished()).toBe(1);
  });

  it('reopening with another context leaves no stale route and resets the pager',()=>{
    const r=setup([...CLOSES,'event.old-footprints'],640,360,1.5);
    expect(r.text()).toContain('详情 1/');
    expect(r.flat()).toContain('采用路径：三章自由行路');
    r.press(7);
    expect(r.text()).toMatch(/详情 [2-9]\//);
    r.press(6);
    expect(r.closed()).toBe(1);
    expect(r.finished()).toBe(0);
    r.reopen();
    expect(r.text()).toContain('详情 1/');
    expect(r.flat()).toContain('采用路径：三章自由行路');
    r.press(5); // 确认页
    expect(r.text()).toContain('采用路径：三章自由行路');
    r.press(6); // 取消
    r.press(6); // 关闭
    expect(r.closed()).toBe(2);
    // 同一面板、仅剩旧渡口线索的回落上下文：不得残留上一旅程的三章路径。
    r.panel.open({endingSet:{record,gate:record.gate,endings:[byId('ending.open-water')]},
      context:context(['event.old-footprints']),onFinish:()=>{}});
    expect(r.flat()).toContain('采用路径：原有旅程');
    expect(r.flat()).not.toContain('采用路径：三章自由行路');
    expect(r.flat()).not.toContain('你把三章记录带回照心石前');
    r.panel.destroy();
  });

  it('a locked route is still refused without entering confirmation',()=>{
    const r=setup([],640,360,1.5);
    r.press(5);
    expect(r.text()).toContain('尚未达成');
    expect(r.text()).not.toContain('确认此行归处');
    expect(r.finished()).toBe(0);
    expect(r.closed()).toBe(0);
    r.press(6);
    expect(r.closed()).toBe(1);
  });

  it('the full test journey never mutates authored data or the knowledge context',()=>{
    const before=structuredClone(record);
    const r=setup([...CLOSES,'event.old-footprints'],960,540,1);
    r.press(5);r.press(5);
    for(let guard=0;guard<40&&r.finished()===0;guard+=1)r.press(5);
    expect(r.finished()).toBe(1);
    expect(r.closed()).toBe(1);
    expect(r.ctx.knownKnowledgeNodeIds.size).toBe(4);
    expect(record).toEqual(before);
    expect(JSON.parse(rawText)).toEqual(before);
    const ending=r.finishedEnding()!;
    expect(ending.epilogue).toContain('你把三章记录带回照心石前');
    ending.epilogue='改写';
    expect(byId('ending.open-water').epilogue).toBe(before.endings.find(e=>e.id==='ending.open-water')!.epilogue);
  });
});


describe('Round144 primary long-title and third-route review',()=>{
 it('selects the limited witness chapter route without changing the authored data',()=>{
  const before=JSON.stringify(record);
  const ctx=context([...CLOSES,'event.r100-record-guard','event.r101-code-limited','event.r102-pilot-crew']);
  const result=selectEnding(assembled,'ending.r42-sheltered-witness',ctx);
  expect(result.ok).toBe(true);
  if(result.ok){expect(result.route.id).toBe('r108-shelter');expect(result.ending.epilogue).toContain(byId('ending.r42-sheltered-witness').unlockRoutes![0]!.epilogue);}
  expect(JSON.stringify(record)).toBe(before);
 });
 it('reads a long route receipt losslessly before confirming and pages it above the epilogue',()=>{
  const original=byId('ending.open-water');
  const title='长路线说明'.repeat(15);
  const ending={...original,unlockRoutes:original.unlockRoutes!.map(route=>({...route,title}))};
  const r=setup([...CLOSES,'event.old-footprints'],640,360,1.5,ending);
  r.press(5);
  let confirmText='';
  for(let i=0;i<20;i++){
   const rows=r.visible();const body=rows.find(t=>t.y===102)!;
   expect(body).toBeDefined();expect(body.y+body.height).toBeLessThanOrEqual(282);
   confirmText+=body.text.replace(/\n/g,'');
   if(r.text().includes('Enter确认进入终章'))break;
   expect(r.finished()).toBe(0);r.press(5);
  }
  expect(confirmText).toContain(title);expect(r.finished()).toBe(0);
  r.press(5);
  let epilogue='';
  for(let i=0;i<60&&r.finished()===0;i++){
   const body=r.visible().find(t=>t.y===104)!;expect(body).toBeDefined();
   expect(body.y+body.height).toBeLessThanOrEqual(283);
   epilogue+=body.text.replace(/\n/g,'');r.press(5);
  }
  expect(epilogue).toContain(title);expect(epilogue).toContain('你把三章记录带回照心石前');expect(r.finished()).toBe(1);
 });
});
