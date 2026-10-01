import Phaser from 'phaser';
import {wrapDialogueText,paginateDialogueBlocks} from './dialogue-layout';
import {addPixelPanelChrome,UI_FONT_FAMILY,UI_PALETTE} from './ui-theme';
import {uiFontSize} from './settings';
import type {RegionGuideCategory,RegionGuideEntry} from '../engine/regional-guide';
export interface RegionalGuidePanelModel { name:string;role:string;advice:string;entries:readonly RegionGuideEntry[];onNavigate:(id:string)=>void }
const categories:RegionGuideCategory[]=['supply','quest','people','exit','landmark','overview'];
/** Empty-state copy per category; the quest page names where to look next instead of a bare blank. */
const emptyText:Record<RegionGuideCategory,string>={supply:'目前没有可达且有库存的生命/内力补给。可切出区查看去向。',quest:'暂无进行中或本地可接委托；人物页可查交谈。',people:'此分类当前没有可用条目。',exit:'此分类当前没有可用条目。',landmark:'此分类当前没有可用条目。',overview:'此分类当前没有可用条目。'};
function emptyCategoryText(category:RegionGuideCategory|undefined):string{return category===undefined?'此分类当前没有可用条目。':emptyText[category];}
const labels:Record<RegionGuideCategory,string>={supply:'补给',quest:'差事',people:'人物',exit:'出区',landmark:'已知地标',overview:'说明'};
/** Read-only directory: Enter selects a walking guide, never performs its action. */
export class RegionalGuidePanel {
 private container:Phaser.GameObjects.Container;
 private bindings:{key:Phaser.Input.Keyboard.Key;fn:()=>void}[]=[];
 private model:RegionalGuidePanelModel|null=null;
 private category=0;private selected=0;private detailPage=0;private detailPages=1;
 private notice:string|null=null;
 constructor(private scene:Phaser.Scene,private onClose:()=>void){this.container=scene.add.container(0,0).setDepth(1200).setVisible(false);}
 get isOpen(){return this.model!==null;}
 open(model:RegionalGuidePanelModel){if(this.isOpen)return;this.model=model;this.category=0;this.selected=0;this.detailPage=0;this.notice=null;this.container.setVisible(true);const keyboard=this.scene.input.keyboard;if(keyboard){const K=Phaser.Input.Keyboard.KeyCodes;for(const [code,fn]of [[K.ESC,()=>this.close()],[K.LEFT,()=>this.changeCategory(-1)],[K.RIGHT,()=>this.changeCategory(1)],[K.UP,()=>this.changeSelection(-1)],[K.DOWN,()=>this.changeSelection(1)],[K.SPACE,()=>{this.detailPage=(this.detailPage+1)%this.detailPages;this.render();}],[K.ENTER,()=>this.navigate()]] as [number,()=>void][]){const key=keyboard.addKey(code);key.on('down',fn);this.bindings.push({key,fn});}}this.render();}
 close(){if(!this.isOpen)return;this.model=null;for(const {key,fn}of this.bindings)key.off('down',fn);this.bindings=[];this.container.setVisible(false).removeAll(true);this.onClose();}
 destroy(){this.close();this.container.destroy();}
 private entries(){if(categories[this.category]==='overview'&&this.model)return [{id:'overview',category:'overview' as const,title:'地区角色与行旅建议',detail:this.model.advice,destinationId:null}];return this.model?.entries.filter(e=>e.category===categories[this.category])??[];}
 private changeCategory(step:number){this.category=(this.category+step+categories.length)%categories.length;this.selected=0;this.detailPage=0;this.notice=null;this.render();}
 private changeSelection(step:number){const count=this.entries().length;this.selected=count?(this.selected+step+count)%count:0;this.detailPage=0;this.notice=null;this.render();}
 private navigate(){const chosen=this.entries()[this.selected];if(!chosen)return;
  if(chosen.destinationId===null){this.notice='此条目仅作说明，没有可步行导航的目标。';this.render();return;}
  const callback=this.model!.onNavigate;this.close();callback(chosen.destinationId);}
 private lineSize(size:number){return Math.ceil(Number.parseInt(uiFontSize(size),10)*1.5);}
 /** Width of `value` at the given text object's live font (its canvas context is font-synced on creation). */
 private measure(value:string,text:Phaser.GameObjects.Text){return text.context.measureText(value).width;}
 /** Grapheme-truncates with an ellipsis until the value fits the given width. */
 private fitLine(value:string,width:number,text:Phaser.GameObjects.Text):string{
  if(value.length===0||this.measure(value,text)<=width)return value;
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});let kept='';
  for(const {segment}of segmenter.segment(value)){if(this.measure(kept+segment+'…',text)>width)break;kept+=segment;}
  return kept+'…';
 }
 private text(x:number,y:number,value:string,size:number,color:string,width?:number){const t=this.scene.add.text(x,y,value,{fontFamily:UI_FONT_FAMILY,fontSize:uiFontSize(size),color}).setOrigin(0,0);if(width)t.setText(wrapDialogueText(value,width,s=>t.context.measureText(s).width).join('\n'));this.container.add(t);return t;}
 private render(){const model=this.model;if(!model)return;this.container.removeAll(true);const width=Math.min(850,this.scene.scale.width-40),height=Math.min(500,this.scene.scale.height-40),left=(this.scene.scale.width-width)/2,top=(this.scene.scale.height-height)/2;
  addPixelPanelChrome(this.scene,this.container,{x:left,y:top,width,height},0.96);
  const innerX=left+24,innerW=width-48;
  // Round 109 measured geometry: every band reserves the height its wrapped
  // text actually occupies at the live font scale, the footer is laid out
  // from the bottom edge first, and the row/detail capacity derives from the
  // space that truly remains — never a fixed slot and never forced ≥1.
  const titleRaw=`${model.name} · ${model.role}行旅`;
  const title=this.text(innerX,top+18,titleRaw,18,UI_PALETTE.accent,innerW);
  // Compact heading: one line only. A wrap (long MOD name) keeps its first
  // measured line with an ellipsis; the full name stays in the world atlas.
  const titleLines=title.text.split('\n');
  if(titleLines.length>1)title.setText(this.fitLine(`${titleLines[0]}…`,innerW,title));
  let cursor=top+18+this.lineSize(18)+8;
  const help=this.text(innerX,cursor,'←/→分类 · ↑/↓选择 · Enter步行导航 · Space详情翻页 · R/Esc收起',11,UI_PALETTE.muted,innerW);
  cursor+=Math.max(1,help.text.split('\n').length)*this.lineSize(11)+8;
  const advice=this.text(innerX,cursor,'',12,UI_PALETTE.text);
  const adviceLines=wrapDialogueText(model.advice,innerW,s=>advice.context.measureText(s).width);
  // Preview band options: the first two authored lines (a longer advice
  // keeps one ellipsized line plus the FULL pointer to the overview
  // category on its own line, so the pointer itself never truncates), or
  // nothing at all when the panel runs out of room.
  const adviceShown=adviceLines.length<=2
    ?adviceLines
    :[this.fitLine(`${adviceLines[0]}…`,innerW,advice),'完整行旅建议见「说明」分类'];
  // Category strip: wrapped to the actual width, at most two lines (a MOD
  // flood truncates the second); its real height feeds the list top, and the
  // last ladder stage below may compress it to one ellipsized line — every
  // category stays reachable through the ←/→ cycle either way.
  const categoryRaw=categories.map((c,i)=>`${i===this.category?'◆':'◇'}${labels[c]}`).join('　');
  const cat=this.text(innerX,0,'',13,UI_PALETTE.jade);
  const catLines=wrapDialogueText(categoryRaw,innerW,s=>cat.context.measureText(s).width);
  const catShown=catLines.length<=2?catLines:[catLines[0]!,this.fitLine(`${catLines[1]}…`,innerW,cat)];
  const catSingle=[this.fitLine(`◆${labels[categories[this.category]!]} · ←/→切换分类`,innerW,cat)];
  // Footer first from the bottom edge: two measured single lines, so every
  // band above derives from the vertical space that actually remains.
  const footerStatus=this.text(innerX,0,'',10,UI_PALETTE.muted);
  const footerAction=this.text(innerX,0,'',10,UI_PALETTE.muted);
  const footerLineH=this.lineSize(10);
  const actionTop=top+height-10-footerLineH;
  const statusTop=actionTop-2-footerLineH;
  const detailBottom=statusTop-6;
  const detailLineH=this.lineSize(12),rowH=this.lineSize(13)+4,gap=8;
  // Capacity ladder: keep at least one actionable row AND one readable
  // detail line before any comfort band. The detail reserve drops from two
  // lines to one, then the advice preview disappears, and finally the
  // category strip compresses to a single line — rows are never forced into
  // a band too short to hold them.
  let keepAdvice=true,catUse=catShown,catTop=cursor,listTop=cursor,capacity=0;
  for(const [keepAdviceTry,detailReserve,catTry] of [[true,2,catShown],[true,1,catShown],[false,1,catShown],[false,1,catSingle]] as [boolean,number,string[]][]){
   const adviceH=(keepAdviceTry?adviceShown.length:0)*detailLineH;
   const catTopTry=cursor+adviceH+(adviceH>0?gap:0);
   const listTopTry=catTopTry+catTry.length*this.lineSize(13)+6;
   const cap=Math.floor((detailBottom-listTopTry-gap-detailReserve*detailLineH)/rowH);
   if(cap>=1){keepAdvice=keepAdviceTry;catUse=catTry;catTop=catTopTry;listTop=listTopTry;capacity=cap;break;}
  }
  if(keepAdvice)advice.setText(adviceShown.join('\n'));else advice.destroy();
  cat.setPosition(innerX,catTop).setText(catUse.join('\n'));
  const entries=this.entries(),page=capacity>0?Math.floor(this.selected/capacity):0;
  const shown=capacity>0?entries.slice(page*capacity,page*capacity+capacity):[];
  if(!entries.length)this.text(innerX,listTop,emptyCategoryText(categories[this.category]),12,UI_PALETTE.muted,innerW);
  else if(capacity===0)this.text(innerX,listTop,'面板空间不足：请在设置中调小字号或放大窗口后重新打开本页。',12,UI_PALETTE.muted,innerW);
  shown.forEach((entry,i)=>{const row=this.text(innerX,listTop+i*rowH,`${page*capacity+i===this.selected?'▶':'　'} ${entry.title}`,13,page*capacity+i===this.selected?UI_PALETTE.accent:UI_PALETTE.text);const lines=wrapDialogueText(row.text,width-60,s=>row.context.measureText(s).width);if(lines.length>1)row.setText(this.fitLine(`${lines[0]}…`,width-60,row));});
  // The detail band starts after the rows actually in use; its capacity is
  // measured from the real remaining band, and the ladder above guarantees
  // at least one line whenever any row is shown.
  const visibleRows=Math.min(entries.length,Math.max(0,capacity)),detailTop=listTop+visibleRows*rowH+gap,chosen=entries[this.selected];
  if(chosen&&capacity>0){const t=this.text(innerX,detailTop,'',12,UI_PALETTE.text);const lines=wrapDialogueText(chosen.title+'\n'+chosen.detail,innerW,s=>t.context.measureText(s).width);
   const detailCapacity=Math.max(1,Math.floor((statusTop-detailTop)/detailLineH));const pages=paginateDialogueBlocks(lines,detailCapacity);
   this.detailPages=pages.length;this.detailPage=Math.min(this.detailPage,pages.length-1);t.setText(pages[this.detailPage]!);}
  else this.detailPages=1;
  const listPages=Math.max(1,Math.ceil(entries.length/Math.max(1,capacity)));
  const listSegment=entries.length?`第${this.selected+1}/${entries.length}条`:'此分类没有条目';
  const pageSegment=listPages>1?` · 列表${page+1}/${listPages}页 · ↑/↓换条`:'';
  // The notice replaces the status line: an information-only entry has no
  // detail paging worth reporting while its notice is up.
  footerStatus.setPosition(innerX,statusTop).setText(this.fitLine(this.notice??`${listSegment}${pageSegment}`,innerW,footerStatus));
  if(this.notice!==null)footerStatus.setColor('#e8b04b');
  const detailSegment=this.detailPages>1?`详情${this.detailPage+1}/${this.detailPages}页 · Space翻页`:'详情已完整显示';
  footerAction.setPosition(innerX,actionTop).setText(this.fitLine(`${detailSegment} · 导航只带路，不交易`,innerW,footerAction));
 }
}
