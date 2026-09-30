import Phaser from 'phaser';
import {wrapDialogueText,paginateDialogueLines} from './dialogue-layout';
import {addPixelPanelChrome,UI_FONT_FAMILY,UI_PALETTE} from './ui-theme';
import {uiFontSize} from './settings';
import type {RegionGuideCategory,RegionGuideEntry} from '../engine/regional-guide';
export interface RegionalGuidePanelModel { name:string;role:string;advice:string;entries:readonly RegionGuideEntry[];onNavigate:(id:string)=>void }
const categories:RegionGuideCategory[]=['supply','quest','people','exit','landmark','overview'];
const labels:Record<RegionGuideCategory,string>={supply:'补给',quest:'活动差事',people:'人物',exit:'出区',landmark:'已知地标',overview:'说明'};
/** Read-only directory: Enter selects a walking guide, never performs its action. */
export class RegionalGuidePanel {
 private container:Phaser.GameObjects.Container;
 private bindings:{key:Phaser.Input.Keyboard.Key;fn:()=>void}[]=[];
 private model:RegionalGuidePanelModel|null=null;
 private category=0;private selected=0;private detailPage=0;private detailPages=1;
 constructor(private scene:Phaser.Scene,private onClose:()=>void){this.container=scene.add.container(0,0).setDepth(1200).setVisible(false);}
 get isOpen(){return this.model!==null;}
 open(model:RegionalGuidePanelModel){if(this.isOpen)return;this.model=model;this.category=0;this.selected=0;this.detailPage=0;this.container.setVisible(true);const keyboard=this.scene.input.keyboard;if(keyboard){const K=Phaser.Input.Keyboard.KeyCodes;for(const [code,fn]of [[K.ESC,()=>this.close()],[K.LEFT,()=>this.changeCategory(-1)],[K.RIGHT,()=>this.changeCategory(1)],[K.UP,()=>this.changeSelection(-1)],[K.DOWN,()=>this.changeSelection(1)],[K.SPACE,()=>{this.detailPage=(this.detailPage+1)%this.detailPages;this.render();}],[K.ENTER,()=>this.navigate()]] as [number,()=>void][]){const key=keyboard.addKey(code);key.on('down',fn);this.bindings.push({key,fn});}}this.render();}
 close(){if(!this.isOpen)return;this.model=null;for(const {key,fn}of this.bindings)key.off('down',fn);this.bindings=[];this.container.setVisible(false).removeAll(true);this.onClose();}
 destroy(){this.close();this.container.destroy();}
 private entries(){if(categories[this.category]==='overview'&&this.model)return [{id:'overview',category:'overview' as const,title:'地区角色与行旅建议',detail:this.model.advice,destinationId:null}];return this.model?.entries.filter(e=>e.category===categories[this.category])??[];}
 private changeCategory(step:number){this.category=(this.category+step+categories.length)%categories.length;this.selected=0;this.detailPage=0;this.render();}
 private changeSelection(step:number){const count=this.entries().length;this.selected=count?(this.selected+step+count)%count:0;this.detailPage=0;this.render();}
 private navigate(){const id=this.entries()[this.selected]?.destinationId;if(!id)return;const callback=this.model!.onNavigate;this.close();callback(id);}
 private text(x:number,y:number,value:string,size:number,color:string,width?:number){const t=this.scene.add.text(x,y,value,{fontFamily:UI_FONT_FAMILY,fontSize:uiFontSize(size),color}).setOrigin(0,0);if(width)t.setText(wrapDialogueText(value,width,s=>t.context.measureText(s).width).join('\n'));this.container.add(t);return t;}
 private render(){const model=this.model;if(!model)return;this.container.removeAll(true);const width=Math.min(850,this.scene.scale.width-40),height=Math.min(500,this.scene.scale.height-40),left=(this.scene.scale.width-width)/2,top=(this.scene.scale.height-height)/2;
  addPixelPanelChrome(this.scene,this.container,{x:left,y:top,width,height},0.96);
  this.text(left+24,top+18,`${model.name} · ${model.role}行旅`,18,UI_PALETTE.accent);
  this.text(left+24,top+49,'←/→分类 · ↑/↓选择 · Enter只设步行导航 · Space详情翻页 · R/Esc收起',11,UI_PALETTE.muted,width-48);
  const advice=this.text(left+24,top+78,model.advice,12,UI_PALETTE.text,width-48);const adviceLines=wrapDialogueText(model.advice,width-48,s=>advice.context.measureText(s).width);if(adviceLines.length>2)advice.setText(adviceLines[0]+'\n完整行旅建议见「说明」分类');const categoryTop=top+78+Math.min(62,Math.max(34,advice.height))+12;
  this.text(left+24,categoryTop,categories.map((c,i)=>`${i===this.category?'◆':'◇'}${labels[c]}`).join('　'),13,UI_PALETTE.jade,width-48);
  const rowHeight=Math.ceil(Number.parseInt(uiFontSize(13),10)*1.5)+4;const listTop=categoryTop+rowHeight,entries=this.entries(),page=Math.floor(this.selected/5);const shown=entries.slice(page*5,page*5+5);
  if(!entries.length)this.text(left+24,listTop,categories[this.category]==='supply'?'目前没有可达且有库存的生命/内力补给。可切出区查看去向。':'此分类当前没有可用条目。',12,UI_PALETTE.muted,width-48);
  shown.forEach((entry,i)=>{const row=this.text(left+24,listTop+i*rowHeight,`${page*5+i===this.selected?'▶':'　'} ${entry.title}`,13,page*5+i===this.selected?UI_PALETTE.accent:UI_PALETTE.text);const lines=wrapDialogueText(row.text,width-60,v=>row.context.measureText(v).width);if(lines.length>1)row.setText(lines[0]+'…');});
  const detailTop=listTop+5*rowHeight+8,chosen=entries[this.selected];if(chosen){const t=this.text(left+24,detailTop,'',12,UI_PALETTE.text);const pages=paginateDialogueLines(wrapDialogueText(chosen.title+'\n'+chosen.detail,width-48,s=>t.context.measureText(s).width),Math.max(1,Math.floor((top+height-38-detailTop)/Math.ceil(Number.parseInt(uiFontSize(12),10)*1.5))));this.detailPages=pages.length;this.detailPage=Math.min(this.detailPage,pages.length-1);t.setText(pages[this.detailPage]!);}
  else this.detailPages=1;
  this.text(left+24,top+height-26,`${entries.length?this.selected+1:0}/${entries.length} 条 · 详情${this.detailPage+1}/${this.detailPages}页 · 导航不交易、不接差事、不传送`,10,UI_PALETTE.muted,width-48);
 }
}
