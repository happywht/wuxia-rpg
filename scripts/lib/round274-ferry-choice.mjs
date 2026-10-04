// Pure, bounded P1 repairs. All story/IDs live in data authoring, never engine.
export const pierId = 'encounter.pier-toll-robber';
export const escortId = 'encounter.ferry-reed-ambush';
export const supplyKey = 'r274.ferry.departure-supply';
export const pierBehavior = [
  { kind: 'art', artId: 'skill.tiezhang-zhuanggong', powerBonus: 8, guardDisruptsBonus: true, cue: '索银人沉肩抡担，准备重击' },
  { kind: 'art', artId: 'skill.jianghu-sanshou', cue: '索银人横扫扁担，逼你退步' },
  { kind: 'recoverQi', amount: 8, cue: '索银人拄担换气，暂露空隙' },
];
export const escortBehavior = [
  { kind: 'art', artId: 'skill.lanmen-daofa', cue: '伏兵抬桨掩身，刀锋将至' },
  { kind: 'art', artId: 'skill.jianghu-sanshou', cue: '伏兵贴船逼近，准备短打' },
  { kind: 'recoverQi', amount: 4, cue: '伏兵稳船换气，暂露空隙' },
];
const spec = [
  { id: pierId, oldArts: ['skill.tiezhang-zhuanggong'], arts: ['skill.tiezhang-zhuanggong', 'skill.jianghu-sanshou'], health: 50, qi: 10, behavior: pierBehavior },
  { id: escortId, oldArts: ['skill.jianghu-sanshou', 'skill.lanmen-daofa'], arts: ['skill.jianghu-sanshou', 'skill.lanmen-daofa'], health: 54, qi: 6, behavior: escortBehavior },
];
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const one = (array, predicate) => { const hits=array.filter(predicate); if(hits.length!==1) throw Error('受管条目不唯一，请人工复核'); return hits[0]; };
function closeBracket(text, start) {
  let depth=0, quoted=false, escaped=false;
  for(let i=start;i<text.length;i++) { const c=text[i]; if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0)return i;} }
  throw Error('条目括号不匹配，请人工复核');
}
function splice(raw, id, record) {
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  const at=raw.indexOf('"id": '+JSON.stringify(id));
  const start=raw.lastIndexOf('    {',at); if(at<0||start<0)throw Error('条目边界不匹配，请人工复核');
  const end=closeBracket(raw,start+4);
  const out=raw.slice(0,start)+JSON.stringify(record,null,2).split('\n').map(line=>'    '+line).join(eol)+raw.slice(end+1);
  JSON.parse(out);return out;
}
export function repairEncountersRaw(raw) {
  let next=raw;
  for(const s of spec) {
    const encounter=one(JSON.parse(next).encounters,e=>e.id===s.id), enemy=encounter.enemy;
    if(enemy.health!==s.health||enemy.qi!==s.qi)throw Error('战斗基值已漂移，请人工复核');
    if(same(enemy.martialArtIds,s.arts)&&same(enemy.behavior,s.behavior))continue;
    if(!same(enemy.martialArtIds,s.oldArts)||enemy.behavior!==undefined)throw Error('战斗循环已漂移，请人工复核');
    enemy.martialArtIds=clone(s.arts);enemy.behavior=clone(s.behavior);
    next=splice(next,s.id,encounter);
  }
  return next;
}
const escortQuest='quest.r31-guard-the-caravan', pierQuest='quest.r31-pier-toll-clearing';
function conditions(questId) { return [{kind:'questStatus',questId,status:'completed'},{kind:'variable',key:supplyKey,operator:'missing'}]; }
function supplyNode(id, questId, itemId, relationship, text) {
  return {id,confirmEffects:true,text,options:[
    {text:'收下出发补给，记住这份人情。',nextNodeId:'r274-ferry-supply-receipt',conditions:conditions(questId),effects:[
      {kind:'giveItem',itemId,quantity:1},
      {kind:'adjustRelationship',npcId:'char.bai-luzhou',delta:relationship},
      {kind:'setVariable',key:supplyKey,value:questId===escortQuest?'escort':'repair'},
    ]},
    {text:'眼下先不领，稍后再来。',nextNodeId:'greet'},
  ]};
}
export const supplyOptions = [
  {text:'药队已过雾桥，领一份上山伤药。',nextNodeId:'r274-ferry-supply-escort',conditions:conditions(escortQuest)},
  {text:'桥头已清，领一份上山调息药。',nextNodeId:'r274-ferry-supply-pier',conditions:conditions(pierQuest)},
  {text:'核对已经领取的出发补给。',nextNodeId:'r274-ferry-supply-collected',conditions:[{kind:'variable',key:supplyKey,operator:'exists'}]},
];
export const supplyNodes = [
  supplyNode('r274-ferry-supply-escort',escortQuest,'item.huichun-gao',2,'白鹭洲合上护送簿：「药队及时过了雾桥，你也挨了这一程。石北托我留一份回春膏，给你上山备着。收下这份伤药，我也记住你押队的情义。」'),
  supplyNode('r274-ferry-supply-pier',pierQuest,'item.qingxin-wan',3,'白鹭洲望了望清净的桥头：「两日没白等，新桥稳了，索银人也走了。工匠托我留一丸清心丸，给你上山调息。你肯先做这番费时的活，我记着。」'),
  {id:'r274-ferry-supply-receipt',text:'白鹭洲把药包递过来：「云岭的石阶不短。伤了便敷药，气短便调息；到山上别硬撑。药已收妥，按B在背包里查看。」'},
  {id:'r274-ferry-supply-collected',text:'白鹭洲指了指渡籍：「你的出发药包已经领过。桥路各有难处，往后再来，就把沿途的新消息说给我听。」'},
];
const oldOption='栈桥已修牢，药队改走旱桥了。';
const newOption='栈桥已加固，我来核对桥头是否通渡。';
const oldText='白鹭洲摸了摸新换的桩脚：「熟铁砂补了根，韧皮也勒紧了，药队走旱桥稳当。桥心那伙索银人却盯上了新木料；先把桥头清干净，渡口才能重新开闸。」';
const newText='白鹭洲摸了摸新换的桩脚：「桥身已经稳了；能否放药担过桥，还得看桥心那伙索银人。若还未清开，先去处理；若已清开，就把通渡结果登记，我备一份上山调息药给你。」';
export function repairDialoguesRaw(raw) {
  const doc=JSON.parse(raw), conversation=one(doc.conversations,c=>c.id==='dlg.bai-luzhou-ferry-master');
  const greet=one(conversation.nodes,n=>n.id===conversation.startNodeId);
  const pierOption=one(greet.options,o=>o.nextNodeId==='r31-pier-reinforced');
  const pierNode=one(conversation.nodes,n=>n.id==='r31-pier-reinforced');
  if(![oldOption,newOption].includes(pierOption.text)||![oldText,newText].includes(pierNode.text))throw Error('通渡回响已漂移，请人工复核');
  const touchedOptions=greet.options.filter(o=>supplyOptions.some(w=>w.nextNodeId===o.nextNodeId));
  const touchedNodes=conversation.nodes.filter(n=>supplyNodes.some(w=>w.id===n.id));
  const applied=same(touchedOptions,supplyOptions)&&same(touchedNodes,supplyNodes);
  if(applied&&pierOption.text===newOption&&pierNode.text===newText)return raw;
  if(touchedOptions.length||touchedNodes.length)throw Error('补给条目已漂移，请人工复核');
  pierOption.text=newOption;pierNode.text=newText;
  greet.options.push(...clone(supplyOptions));conversation.nodes.push(...clone(supplyNodes));
  return splice(raw,conversation.id,conversation);
}
