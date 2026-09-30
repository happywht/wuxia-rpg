export const combatRouteMentors = [
  { id: 'dlg.ye-tingzhou-mentor', key: 'sword', option: '想走剑法与淬锋路线，该怎样准备？', pages: [
    '叶庭舟指了指剑录：「先做镇中差事、清巷口，再到渡口护集。抄书学徒原生身法7，每级长1；落雨七分剑虽然等级门槛2，还要身法11、悟性11。不是升到2就能学：不借装备，要到5；柳叶判官笔加身法1，可在4级够得着。先问剑意，关系达5，再按入门条件拜师，来授艺页逐条核资格。」',
    '「出门先问朱九弦刀场淬料，按清点差事备熟铁砂与青铜笔剑，在渡口工位淬锋；基础刀料与工钱合108两，成品加力道4。先学会再换兵器，不要把兵器加成当天生根骨。气海拓8内力，手阳耗修为1与清心丸1、加力道1，都是实付。导师不替你免费置办。」',
    '「旧例管事先摆守势，再举刀重砍，随后调息；看『敌方下一步』，别把重砍窗口白送给他。你的剑法多耗气，能在他调息时结束就不必拖。照雪冒号客有重砸、调养、守势与回气，抢攻未必每次都划算；有伤先在战外用药，输了照既有比例复原，调查不会丢。装备与成长可缩短出手轮数，仍须自己选择。」',
  ] },
  { id: 'dlg.wen-suxin-mentor', key: 'endurance', option: '想走守御调息路线，该怎样准备？', pages: [
    '闻素心摊开采药札：「庄中入门看定力7、善恶不负。步云履要身法11、悟性10，草木回息篇要定力10、悟性11；抄书学徒不借装备，至少到5级同时够格。若4级借柳叶判官笔的身法1可学，但银两85，别误以为等级2就全够了。授艺页仍会逐条验资格。」',
    '「气海花修为1扩内力8；足阳要气海、2级、修为1与回春膏1，添体魄1和生命8，打通不自动补满。背包药可在战外恢复，战内靠草木或吐纳疗伤，疗伤耗气、不回气。自创页选调息、轻灵抢势、留力惜气，46两，成招恢复10、耗气2；便宜在久战，不是凭空生内力。」',
    '「看敌手的下一步：标明「守御可卸蓄势」的举刀重砸，用步云履可先卸去额外威力、再至多挡9，耗气3，只挡下一次受击；敌人守御或回气时可疗伤，生命够就散手反击；不要为了补最后几点血浪费整份25点回春膏。旧例管事和照雪冒号客节奏不同，不要无休止站着守。你的内力不会自行回满，备清心丸、看余量。伤重可退，败后按该场规则恢复，再用战外药补足；这条路以多出手和内力换取较少的受伤。」',
  ] },
];
export const combatChallengeCycles = [
  { id:'encounter.alley-blade-bully', addArts:[], behavior:[
    {kind:'art',artId:'skill.jianghu-sanshou',cue:'刀客虚晃探手，先试距离'},
    {kind:'art',artId:'skill.lanmen-daofa',powerBonus:6,guardDisruptsBonus:true,cue:'刀客举刀压肩，下一击较重'},
    {kind:'recoverQi',amount:4,cue:'刀客退半步换气，留出空隙'},
  ] },
  { id:'encounter.r58-market-toll-claimer',addArts:['skill.r32-panzhou-shunxun-bu'],behavior:[
    {kind:'art',artId:'skill.r32-panzhou-shunxun-bu',cue:'管事侧身收刀，先护住中路'},
    {kind:'art',artId:'skill.lanmen-daofa',powerBonus:12,guardDisruptsBonus:true,cue:'管事举刀压棚，重砍将至'},
    {kind:'recoverQi',amount:7,cue:'管事横刀喘息，这一拍不追击'},
  ] },
  { id:'encounter.r101-beacon-raider',addArts:['skill.r32-yunyin-buyun-lu','skill.tuna-yangqi-jue'],behavior:[
    {kind:'art',artId:'skill.tiezhang-zhuanggong',powerBonus:18,guardDisruptsBonus:true,cue:'头目踏雪沉肩，将借桩劲重砸'},
    {kind:'art',artId:'skill.tuna-yangqi-jue',cue:'头目捂伤调养，暂不出拳'},
    {kind:'art',artId:'skill.r32-yunyin-buyun-lu',cue:'头目缩身移步，护住受伤一侧'},
    {kind:'art',artId:'skill.tiezhang-zhuanggong',powerBonus:18,guardDisruptsBonus:true,cue:'头目再度沉肩，将重砸来路'},
    {kind:'recoverQi',amount:16,cue:'头目退到雪垛调息，留出反击窗口'},
  ] },
];

/** Replace only the containing object bearing this stable id, preserving other objects. */
function patchObject(text,id,transform){
  const marker=text.indexOf(`"id": "${id}"`);if(marker<0)throw Error(`round107 missing ${id}`);
  const start=text.lastIndexOf('{',marker);let depth=0,inString=false,escaped=false,end=-1;
  for(let i=start;i<text.length;i++){const ch=text[i];if(inString){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end=i+1;break;}}
  if(end<0)throw Error(`round107 unclosed ${id}`);
  const nl=text.includes('\r\n')?'\r\n':'\n';
  const result=JSON.stringify(transform(JSON.parse(text.slice(start,end))),null,2).replace(/\n/g,nl+'    ');
  return text.slice(0,start)+result+text.slice(end);
}
export function applyCombatChallenge(record){const cfg=combatChallengeCycles.find(c=>c.id===record.id);if(cfg){record.enemy.martialArtIds=[...new Set([...record.enemy.martialArtIds,...cfg.addArts])];record.enemy.behavior=cfg.behavior;}return record;}
export function deepenCombatChallenges(text){for(const cfg of combatChallengeCycles)text=patchObject(text,cfg.id,applyCombatChallenge);return text;}
export function deepenCombatRouteDialogues(text){for(const cfg of combatRouteMentors)text=patchObject(text,cfg.id,graph=>{
  graph.nodes=graph.nodes.filter(n=>!n.id.startsWith('r107-'));
  const ids=cfg.pages.map((_p,i)=>`r107-${cfg.key}-${i+1}`);
  graph.nodes.unshift(...cfg.pages.map((page,i)=>({id:ids[i],text:page,options:[{text:i+1<ids.length?'接着说。':'记下了，回去准备。',nextNodeId:i+1<ids.length?ids[i+1]:graph.startNodeId}]})));
  const greet=graph.nodes.find(n=>n.id===graph.startNodeId);greet.options=greet.options.filter(o=>!o.nextNodeId?.startsWith('r107-'));
  greet.options.unshift({text:cfg.option,nextNodeId:ids[0]});return graph;
});return text;}
