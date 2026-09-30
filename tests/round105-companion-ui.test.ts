import {describe,it,expect,vi} from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser',()=>({default:{Input:{Keyboard:{KeyCodes:{ESC:1,ENTER:2,T:3}}}}}));
vi.mock('../src/game/ui-theme',()=>({addPixelPanelChrome:()=>{},UI_FONT_FAMILY:'monospace',UI_PALETTE:{accent:'#fff',muted:'#aaa',text:'#eee',jade:'#afa'}}));
vi.mock('../src/game/settings',()=>({uiFontSize:(n:number)=>n}));
import {CompanionPanel,type CompanionPanelModel} from '../src/game/companion-ui';
import {createSocialState} from '../src/engine/social-state';
function setup(active:string|null){
 const texts:string[]=[];const keys=new Map<number,Set<()=>void>>();const container={setDepth(){return this},setVisible(){return this},add(){return this},removeAll(){return this},destroy(){}};
 const scene={scale:{width:800,height:600},input:{keyboard:{addKey(code:number){if(!keys.has(code))keys.set(code,new Set());return {on(_event:string,fn:()=>void){keys.get(code)!.add(fn)},off(_event:string,fn:()=>void){keys.get(code)!.delete(fn)}}}}},add:{container:()=>container,text:(_x:number,_y:number,text:string)=>({text,height:30,context:{measureText:(value:string)=>({width:value.length*12})},setText(value:string){this.text=value;texts.push(value);return this},setOrigin(){return this}})}} as unknown as Phaser.Scene;
 const events:string[]=[];const panel=new CompanionPanel(scene,()=>events.push('closed'));const model:CompanionPanelModel={companions:new Map([['companion.example',{id:'companion.example',npcId:'char.example',description:'这是一个需要按中文字素换行避免面板溢出的同行立场说明。'.repeat(4),combatSupport:{kind:'attack',power:9,everyPlayerActions:2}}]]),activeCompanionId:active,npcNames:new Map(),social:createSocialState(),mapResourceId:'map.example',onDismiss:()=>events.push('dismissed'),onTalk:()=>{expect(panel.isOpen).toBe(false);events.push('talked')}};panel.open(model);
 return {panel,events,texts,press:(code:number)=>{for(const fn of [...keys.get(code)??[]])fn();}};
}
describe('Round105 P panel keyboard callbacks (mock scene, not browser journey)',()=>{
 it('wraps Chinese stance descriptions by measured grapheme widths',()=>{const r=setup('companion.example');expect(r.texts[0]).toContain('\n');for(const line of r.texts[0]!.split('\n'))expect(line.length*12).toBeLessThanOrEqual(568);r.panel.close();});
 it('T closes before talking and unbinds to prevent duplicate opening',()=>{const r=setup('companion.example');r.press(3);r.press(3);expect(r.events).toEqual(['closed','talked']);});
 it('T cannot talk to a nonfollowing NPC',()=>{const r=setup(null);r.press(3);expect(r.events).toEqual([]);expect(r.panel.isOpen).toBe(true);r.panel.close();});
 it('Enter retains dismissal and Esc only closes',()=>{const r=setup('companion.example');r.press(2);expect(r.events).toEqual(['dismissed','closed']);const s=setup('companion.example');s.press(1);expect(s.events).toEqual(['closed']);});
});
