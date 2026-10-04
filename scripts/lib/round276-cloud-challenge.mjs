// P1 local investigation and combat clarity; narrative remains in authored data.
export const encounterId = 'encounter.r74-cloud-bridge-bandits';
export const behavior = [
  { kind: 'art', artId: 'skill.jianghu-sanshou', cue: '头目收索贴身，先试短打' },
  { kind: 'art', artId: 'skill.tiezhang-zhuanggong', powerBonus: 10, guardDisruptsBonus: true, cue: '头目沉肩绷索，准备重击' },
  { kind: 'recoverQi', amount: 8, cue: '头目撑索换气，暂露空隙' },
];
export const dialoguePatches = [
  {
    "id": "marks-complete",
    "before": "沈雨霁把拓痕对着旧图看了片刻：「这不是修路人的记号，是桥索换过方向。得先到断索悬桥看看，不能照旧线硬走。」",
    "after": "沈雨霁把刻痕对着旧图看了片刻：「第三道旧索孔转向东坡，这不是叫你照旧线硬走。云阶见闻已记，酬劳随差事结算；接下来去断索悬桥查拦路的人，刻痕给出了这一趟的理由。」"
  },
  {
    "id": "bridge-accepted",
    "before": "「悬桥在栈道东侧，拦路的人拆了两段护索。」她指向山坳，「确认没有人被困，再把路清出来。」",
    "previous": "「悬桥在客舍东侧。头目先以短打试探，沉肩绷索时要重击：步云履须花一回合和内力准备，可卸这一击的蓄势；换气时他不出手，正好进攻。先核断口、再清拦路客，伤后用膏、气短用丸，不必满气浪费。清开山径也不等于修好护索。」她圈出东坡。",
    "after": "「客舍东坡断口在(72,42)，拦路客在(75,42)。Q选断索清桥、N看可走路线，绕屋沿山径，走相邻格E，先核断口、再清拦路客。头目先短打，沉肩绷索时准备重击；步云履花一回合与内力卸蓄势，换气时可进攻。伤后用膏、气短用丸；客舍有有限补给。清退不等于修索。」"
  },
  {
    "id": "bridge-complete",
    "before": "沈雨霁在图上划掉路障：「悬桥边的拦路客已散，护索还要另行修补。你能走过这一路，不等于每个后来人都能不看脚下。」",
    "previous": "沈雨霁在图上划掉路障：「石阶指出旧索转向，断口也看到了拦路的痕迹。你清退了头目，酬劳已按差事到账；护索尚待修补，不能把胜负当成修索。如今本地这两件事有了答案，下一趟再选北台或东行；残篇的三地对照仍需更簿与井壁，不必仅为这次回報返渡口。」",
    "after": "沈雨霁核对刻痕与断口：「你查清旧索转向、清退拦路客；战斗与差事的经验、银两已经到账，复谈不会再领。回客舍是合上这两份线索、查看有限补给，不是重新交奖励。护索尚待修补。下一趟可选北台或东行；残篇三地对照仍需更簿与井壁，不必为本次回报返回渡口。」"
  }
];
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function unique(array, predicate) {
  const matches = array.filter(predicate);
  if (matches.length !== 1) throw Error('受管条目不唯一，请人工复核');
  return matches[0];
}
function endOfRecord(raw, start) {
  let depth=0, quoted=false, escaped=false;
  for(let i=start;i<raw.length;i++) {
    const c=raw[i];
    if(quoted) { if(escaped) escaped=false; else if(c==='\\') escaped=true; else if(c==='"') quoted=false; }
    else if(c==='"') quoted=true;
    else if(c==='{'||c==='[') depth++;
    else if(c==='}'||c===']') { if(--depth===0) return i; }
  }
  throw Error('条目括号不匹配，请人工复核');
}
export function repairEncounterRaw(raw) {
  const doc=JSON.parse(raw), record=unique(doc.encounters,e=>e.id===encounterId);
  if(record.enemy.health!==64||record.enemy.qi!==16||!same(record.enemy.martialArtIds,['skill.jianghu-sanshou','skill.tiezhang-zhuanggong'])) throw Error('战斗基值已漂移，请人工复核');
  if(same(record.enemy.behavior,behavior)) return raw;
  if(record.enemy.behavior!==undefined) throw Error('战斗循环已漂移，请人工复核');
  record.enemy.behavior=structuredClone(behavior);
  const at=raw.indexOf('"id": '+JSON.stringify(encounterId)),start=raw.lastIndexOf('    {',at);
  if(at<0||start<0) throw Error('条目边界不匹配，请人工复核');
  const end=endOfRecord(raw,start+4),eol=raw.includes('\r\n')?'\r\n':'\n';
  const next=raw.slice(0,start)+JSON.stringify(record,null,2).split('\n').map(line=>'    '+line).join(eol)+raw.slice(end+1);
  JSON.parse(next); return next;
}
export function repairDialogueRaw(raw) {
  const doc=JSON.parse(raw),dialogue=unique(doc.conversations,d=>d.id==='dlg.r74-shen-yuji-cloud-ridge');
  let next=raw;
  for(const p of dialoguePatches) {
    const node=unique(dialogue.nodes,n=>n.id===p.id);
    if(![p.before,p.previous,p.after].includes(node.text)) throw Error('本地回报已漂移，请人工复核');
    const before=JSON.stringify(node.text),after=JSON.stringify(p.after);
    const oldCount=next.split(before).length-1,newCount=next.split(after).length-1;
    if(node.text===p.after&&newCount===1) continue;
    if(oldCount!==1||newCount!==0) throw Error('本地回报文本重复或漂移，请人工复核');
    next=next.replace(before,after);
  }
  JSON.parse(next); return next;
}
