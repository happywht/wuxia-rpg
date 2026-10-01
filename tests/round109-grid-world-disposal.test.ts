/**
 * Round 109: GridScene 世界替换（数据热重载）与关停共用的单一面板处置
 * 回归。以最小 Phaser 桩直接实例化 GridScene，验证 disposeWorldPanels：
 * 逐面板 destroy 且清空引用；处置期间面板 destroy 触发的 onClose 不会
 * 重入 noteOverlayClosed（守卫先于 this.time 访问生效，未守卫会当场
 * 抛错）；二次处置为无操作；处置后可再建新一代面板（替换/重进语义）。
 * setupWorld 全流程与真实 HMR 管线由主代理在浏览器验证，此处为聚焦
 * 单元回归。
 */
import {describe,it,expect,vi} from 'vitest';
vi.mock('phaser',()=>({default:{
  Scene:class{constructor(_key?:string){}},
  Input:{Keyboard:{KeyCodes:{}}},
  Scenes:{Events:{SHUTDOWN:'shutdown'}},
  Math:{Vector2:class{constructor(public x=0,public y=0){}}},
}}));
import {GridScene} from '../src/game/grid-scene';

/** The panel fields the disposal pass owns, mirrored from the scene class. */
const PANEL_FIELDS=['dialoguePanel','battlePanel','inventoryPanel','shopPanel','questPanel',
 'pauseMenu','controlsPanel','factionPanel','worldMapPanel','encyclopediaPanel','modStatusPanel',
 'collectionPanel','companionPanel','regionalGuidePanel','arenaPanel','factionWarPanel',
 'martialArtForgePanel','equipmentForgePanel','alchemyPanel','endingPanel','achievementPanel',
 'meridianPanel'] as const;
type PanelFields=typeof PANEL_FIELDS[number];
interface FakePanel{destroyCount:number;destroy():void}

function seed(scene:GridScene,onDestroy?:(field:PanelFields)=>void){
  const destroyed:string[]=[];
  for(const field of PANEL_FIELDS){
    const panel:FakePanel={destroyCount:0,destroy(){this.destroyCount+=1;destroyed.push(field);onDestroy?.(field)}};
    Object.assign(scene,{[field]:panel});
  }
  return destroyed;
}
const internals=(scene:GridScene)=>scene as unknown as Record<string,unknown>;
const internalCall=(scene:GridScene,name:string)=>(internals(scene)[name] as unknown as ()=>void).bind(scene);

describe('Round109 GridScene single disposal pass for world replacement and shutdown',()=>{
 it('destroys every overlay panel exactly once and clears the stale HUD refs',()=>{
   const scene=new GridScene();
   const destroyed=seed(scene);
   internals(scene).coordsText={destroyed:false}; // Stale HUD ref stand-in.
   internalCall(scene,'disposeWorldPanels')();
   expect(destroyed).toHaveLength(PANEL_FIELDS.length);
   expect(new Set(destroyed).size).toBe(PANEL_FIELDS.length);
   for(const field of PANEL_FIELDS)expect(internals(scene)[field]).toBeNull();
   expect(internals(scene).coordsText).toBeNull();
 });

 it('onClose callbacks fired inside destroy do not re-enter the close/reload hooks',()=>{
   const scene=new GridScene();
   // Without the disposal guard this would hit `this.time.now` on a bare
   // scene and throw; noteOverlayClosed must return before any field use.
   seed(scene,()=>{
     (internals(scene).noteOverlayClosed as ()=>void).call(scene);
   });
   expect(()=>internalCall(scene,'disposeWorldPanels')()).not.toThrow();
 });

 it('a second disposal pass is a no-op, and a rebuilt generation disposes again',()=>{
   const scene=new GridScene();
   const first=seed(scene);
   internalCall(scene,'disposeWorldPanels')();
   internalCall(scene,'disposeWorldPanels')(); // SHUTDOWN after replacement reuse.
   expect(first).toHaveLength(PANEL_FIELDS.length);
   const second=seed(scene); // setupWorld rebuilt the panels after the reload.
   internalCall(scene,'disposeWorldPanels')();
   expect(second).toHaveLength(PANEL_FIELDS.length);
   for(const field of PANEL_FIELDS)expect(internals(scene)[field]).toBeNull();
 });

 it('the disposal guard is released afterwards so real user closes still work',()=>{
   const scene=new GridScene();
   seed(scene);
   internalCall(scene,'disposeWorldPanels')();
   expect(internals(scene).disposingWorldPanels).toBe(false);
 });
});
