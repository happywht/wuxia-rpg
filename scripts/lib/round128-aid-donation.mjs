/** Pure authoring repairs. Stable IDs, localized conversation replacement and input EOL preservation. */
const OLD_OPTION='回春膏备齐了，这就交给你带去。';
const OLD_RESULT='（马尚义接过药，掂了掂分量）齐了！我这就给人送去。你这份心意，镇上的乡邻都记着——往后有什么难处，尽管来寻我。';
const OLD_BOARD='有劳。做成做不成，都请回来告我一声。';
const OPTION='捐回春膏三份：善恶+5、声望+5、关系+10。';
const RESULT='马尚义把三份回春膏收好：「药已送去。此回实耗三份，善恶+5、江湖声望+5、与我关系+10。额外援药由你自备，不退银两，也不再发已办差事的酬金。往后备足三份仍可再援药。」';
const BOARD='有劳。已办完送药后，仍可额外支援巷口伤者：每次交回春膏三份，善恶+5、江湖声望+5、与我关系+10。药由你自备；姜百味现价每份15银，三份45银，不退银两或重发差事奖励。不足三份时不能交药。';
const CONDITIONS=[{kind:'questStatus',questId:'quest.round-07-medicine-run',status:'completed'},{kind:'itemCount',itemId:'item.huichun-gao',minCount:3}];
const BEFORE=[{kind:'takeItem',itemId:'item.huichun-gao',quantity:3},{kind:'adjustRelationship',npcId:'char.ma-shangyi',delta:10},{kind:'adjustRenown',delta:5}];
const EFFECTS=[BEFORE[0],BEFORE[1],{kind:'adjustMorality',delta:5},BEFORE[2]];
const DIRECTION_ID='r128-west-wicket';
const DIRECTION_OPTION='叶先生与柳先生之间，镇内如何走？';
const directions={
 'dlg.ye-tingzhou-mentor':'叶庭舟指向东侧：「从我身旁向东，经土路(42,37)接上镇内街面，再沿街向南转到柳听澜(48,43)旁。不必绕北门。陆贞娘和姜百味会换摊位，经过时让一让；若要买药，可先寻姜百味。」',
 'dlg.liu-tinglan-mentor':'柳听澜指向西北：「返叶庭舟(39,37)，先沿镇内街路北行，再向西穿过土路(42,37)。不必绕北门。经过茶摊与药担时留意人物所在，叶先生住在路口西侧。」',
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function one(array,predicate,label){const found=array.filter(predicate);if(found.length!==1)throw Error(`${label} 应恰有一项，请人工复核。`);return found[0];}
function repairBoard(conversation){
 const out=structuredClone(conversation);
 const board=one(out.nodes,n=>n.id==='board','board');
 const result=one(out.nodes,n=>n.id==='quest-delivered','quest-delivered');
 const option=one(board.options??[],o=>o.nextNodeId==='quest-delivered','援药选项');
 if(!same(option.conditions,CONDITIONS))throw Error('援药前置条件已变化。');
 const old=option.text===OLD_OPTION&&result.text===OLD_RESULT&&board.text===OLD_BOARD&&same(option.effects,BEFORE);
 const applied=option.text===OPTION&&result.text===RESULT&&board.text===BOARD&&same(option.effects,EFFECTS);
 if(!old&&!applied)throw Error('援药作者协议已变化，请人工复核。');
 option.text=OPTION;option.effects=structuredClone(EFFECTS);board.text=BOARD;result.text=RESULT;
 return out;
}
function addDirections(conversation){
 const out=structuredClone(conversation),text=directions[out.id];
 const root=one(out.nodes,n=>n.id===out.startNodeId,'导师交谈入口');
 if(!Array.isArray(root.options))throw Error('导师入口缺少选项。');
 const nodes=out.nodes.filter(n=>n.id===DIRECTION_ID),links=out.nodes.flatMap(n=>(n.options??[]).filter(o=>o.nextNodeId===DIRECTION_ID).map(o=>({node:n.id,option:o})));
 const node={id:DIRECTION_ID,text},option={text:DIRECTION_OPTION,nextNodeId:DIRECTION_ID};
 if(nodes.length||links.length){if(nodes.length!==1||links.length!==1||links[0].node!==root.id||!same(nodes[0],node)||!same(links[0].option,option))throw Error('导师道路说明已变化，请人工复核。');}
 root.options=root.options.filter(o=>o.nextNodeId!==DIRECTION_ID);out.nodes=out.nodes.filter(n=>n.id!==DIRECTION_ID);
 const optionIndex=root.options.findIndex(o=>o.nextNodeId==='r127-transfer-readiness');
 const nodeIndex=out.nodes.findIndex(n=>n.id==='r127-transfer-readiness');
 root.options.splice(optionIndex<0?root.options.length:optionIndex,0,option);
 out.nodes.splice(nodeIndex<0?out.nodes.length:nodeIndex,0,node);return out;
}
function replaceConversations(raw,repairs){
 const before=JSON.parse(raw),after=structuredClone(before);let result=raw;
 for(const[id,repair]of repairs){
  const old=one(before.conversations,c=>c.id===id,'对话 '+id),next=repair(old);
  after.conversations[before.conversations.indexOf(old)]=next;
  if(same(old,next))continue;
  const marker='"id": '+JSON.stringify(id),index=result.indexOf(marker),start=result.lastIndexOf('{',index);
  if(index<0||start<0)throw Error('未找到对话边界。');
  let depth=0,quoted=false,escaped=false,end=start;
  for(;end<result.length;end++){const ch=result[end];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end++;break;}}
  if(!same(JSON.parse(result.slice(start,end)),old))throw Error('对话边界不匹配。');
  const replacement=JSON.stringify(next,null,2).split('\n').map((line,n)=>n===0?line:'    '+line).join(raw.includes('\r\n')?'\r\n':'\n');
  result=result.slice(0,start)+replacement+result.slice(end);
 }
 if(!same(JSON.parse(result),after))throw Error('对白输出与纯修复不匹配。');
 return result;
}
export const repairRound03Raw=raw=>replaceConversations(raw,[['dlg.ma-shangyi-notice-board',repairBoard],['dlg.ye-tingzhou-mentor',addDirections]]);
export const repairRound30Raw=raw=>replaceConversations(raw,[['dlg.liu-tinglan-mentor',addDirections]]);
export const AID_DONATION_EXPECTATION={optionText:OPTION,resultText:RESULT,effects:structuredClone(EFFECTS)};
