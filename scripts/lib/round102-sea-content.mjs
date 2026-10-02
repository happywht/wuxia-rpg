// Pure authoring transformation, shared by incremental and historical sources.
const known=(nodeId,isKnown=true)=>({kind:'knowledgeKnown',nodeId,...(isKnown?{}:{isKnown:false})});
const done=questId=>({kind:'questStatus',questId,status:'completed'});
const discover=nodeId=>({kind:'discoverKnowledgeNode',nodeId});
const relation=(npcId,delta)=>({kind:'adjustRelationship',npcId,delta});
const has=(itemId,minCount=1)=>({kind:'itemCount',itemId,minCount});
const take=(itemId,quantity=1)=>({kind:'takeItem',itemId,quantity});
const option=(text,nextNodeId,conditions=[],effects=[])=>({text,nextNodeId,...(conditions.length?{conditions}:{}),...(effects.length?{effects}:{})});
const upsert=(list,value)=>{const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(value);else list[i]=value;};
const add=(d,node,entry)=>{upsert(d.nodes,node);if(entry){const opts=d.nodes.find(n=>n.id===d.startNodeId).options;const i=opts.findIndex(o=>o.nextNodeId===entry.nextNodeId);if(i<0)opts.splice(opts.length-1,0,entry);else opts[i]=entry;}};
const text=(d,id,value)=>{const node=d.nodes.find(n=>n.id===id);if(node)node.text=value;};
const GU='char.r83-gu-chaosheng',JIN='char.r83-jin-yunfan',RUAN='char.r84-ruan-huilan',CEN='char.r85-cen-yinjiao',JI='char.r97-ji-wuchao',YU='char.r97-yu-xingcha';
export const seaQuestIds=['quest.r83-net-recovery','quest.r83-night-channel','quest.r84-lantern-ledger','quest.r85-low-tide-channel','quest.r97-tide-ledger','quest.r97-beacon-relight'];
export const PILOT_COST_HINT='核过的潮时传给散船，还是只传熟船队？公开传示需厚蚌壳片2片，青帆埠金云帆的补给摊出售；熟船值守需清心丸1份。备齐再决定，传航范围与各家态度都会记下。';
export function deepenSeaQuests(set){
 const descriptions=[
  '承接青帆埠潮尺调查，击退潮沟夺网客后即结算经验、银两与浅滩见闻，不发网具物品，也不改变浮标地形。回顾潮生可续查暮潮刻线。',
  '击退夺网客之后，黄昏或入夜调查浅滩石标，见闻记下回湾刻线即结算，不须交拓纸。随后顾潮生会问补给给谁留：两种决定消耗药品并改变人物关系。',
  '登风回岛东坡调查风回灯标，灯影方位记入见闻即结算经验、银两，不再交实体簿页。阮回澜可说明它与潮生屿水则的不同用途。',
  '谢照汀托你渡潮生屿，低潮调查礁道水则，再回风回岛报告见闻，无拓纸物品。目标有序，调查前闲聊不算复命；已知水则不必重拓。',
  '季无潮托你调查澜心洲北沙脊潮痕碑，再找本人复核。目标有序，不交簿页；此地调查不额外要求低潮，局部潮汐限制以地图提示为准。之后决定传航范围。',
  '潮簿复核后，向虞星槎承接灯谱登记：澜心洲观汐台见闻若已有，直接去引航礁报告，不必多跑一趟。完成只结算经验、银两与航标见闻，不切换地图灯光或解除潮汐。'];
 for(const q of set.quests){const index=seaQuestIds.indexOf(q.id);if(index<0)continue;q.description=descriptions[index];if(index>=3)q.orderedObjectives=true;
  if(q.id==='quest.r85-low-tide-channel')q.objectives.at(-1).text='调查后回风回岛向谢照汀报告所记水则（无拓纸物品）';
  if(q.id==='quest.r97-tide-ledger')q.objectives[0].text='调查北沙脊潮痕碑（无额外低潮条件）';
  if(q.id==='quest.r97-beacon-relight'){q.objectives[0].text='在澜心洲观汐台记下灯谱见闻（已有见闻可复用）';q.objectives[1].text='向引航礁虞星槎报告灯谱，核定航标见闻';}
 }
 return set;
}
function choice(d,id,prompt,gate,branches){
 if(!d.nodes.some(n=>n.id==='farewell'))d.nodes.push({id:'farewell',text:'你暂且收住话头，先去筹备要用的物资。'});
 const settled='event.r102-'+id+'-settled';
 add(d,{id:'r102-'+id+'-choice',confirmEffects:true,text:prompt,options:[...branches.map(b=>option(b.label,'r102-'+b.flag,[known(settled,false),has(b.item,b.quantity??1)],[take(b.item,b.quantity??1),...b.effects,discover('event.r102-'+b.flag),discover(settled)])),option('先备好物资，再作决定。','farewell')]},option(prompt,'r102-'+id+'-choice',[...gate,known(settled,false)]));
 for(const b of branches)add(d,{id:'r102-'+b.flag,text:b.response});
}
function echo(d,flag,label,value){add(d,{id:'r102-echo-'+flag,text:value},option(label,'r102-echo-'+flag,[known('event.r102-'+flag)]));}
export function deepenSeaDialogues(set){
 for(const d of set.conversations){
 if(d.id==='dlg.r83-gu-chaosheng-tide-line'){
  text(d,'recovery-complete','「夺网客已退，浅滩见闻和谢仪已经结算；你身上没有新增网具，浮标也不会自动换样。接下暮潮牵标，在黄昏或入夜调查浅滩石标，再来谈沿海补给。」');
  text(d,'channel-complete','「回湾刻线已经记入见闻，谢仪结清。它说明这一段浅湾的辨向，不能凭一条线许诺全海路都安全。由青帆埠东南海口(91,71)到风回岛，再由风回岛东岸关口(97,50)往潮生屿；M舆图可查实际关口。」');
  for(const n of d.nodes)for(const o of n.options??[])if(o.nextNodeId==='recovery-complete')o.text='夺网客已经击退，浅滩见闻已记。';
  choice(d,'supply','这份补给给岸上救伤，还是留给守标人？',[done('quest.r83-night-channel')],[
   {flag:'shore-aid',label:'给岸上救伤留海盐敷膏1罐（顾+4、岑−3、声望+2）',item:'item.r83-sea-salt-ointment',effects:[relation(GU,4),relation(CEN,-3),{kind:'adjustRenown',delta:2}],response:'顾潮生收下海盐敷膏交给岸上伤者：「船回埠有人照应了，守礁人的缺药却得另想办法。」'},
   {flag:'keeper-aid',label:'给守礁药囊留回春膏1份（顾−3、岑+4、声望−1）',item:'item.huichun-gao',effects:[relation(GU,-3),relation(CEN,4),{kind:'adjustRenown',delta:-1}],response:'顾潮生收下回春膏，记在守礁药囊名下：「岛上应急多一份，岸上的人却要等下一批。」'}]);
  add(d,{id:'r102-mainland-link',text:'「更簿、井壁、索孔都不是水则；海上也要分清回湾线、风灯向和潮位层。先到风回岛问阮回澜与谢照汀，再调查潮生屿。海盐敷膏在金云帆摊上按价买，别把谢仪当成药已经到手。」'},option('大陆的刻痕对照，对海路有何用？','r102-mainland-link',[known('event.r100-paper-crosscheck')]));
  echo(d,'pilot-public','澜心洲的传航办法如何？','「散船能看到核过的潮时了，假号也会照学；虞星槎的辨号差事比从前重。」');
  echo(d,'pilot-crew','澜心洲的传航办法如何？','「熟船队好互认，散船还得找人核簿。海路秩序省下的麻烦，换成了陌生人的等候。」');
 }
 if(d.id==='dlg.r83-jin-yunfan-provisions')text(d,'harbor','「顾潮生在查夺网客和暮潮刻线。海盐敷膏每罐26银两，回春膏15，清心丸12；贝壳也在货匣里。相邻按E买货，F打听。两处传航决定会消耗药或贝壳，先留够自己的伤药，没有物资可暂缓，不会凭空赊给你。」');
 if(d.id==='dlg.r84-ruan-huilan-lantern'){
  text(d,'completed','阮回澜核对你所记灯影：「见闻与谢仪已经记妥，没有实体簿页可交。风灯方位不是礁道水位，也不能凭它给残篇断纸龄。问谢照汀低潮礁道，再去潮生屿读水则；澜心洲可从本岛东侧关口渡去。」');
  text(d,'tides','「由M舆图查本岛关口：西岸返青帆埠，东岸(97,50)至潮生屿，东侧(93,55)至澜心洲。局部礁道按当前潮汐提示走；这些渡口不会因为你选了传航立场就永久解锁。」');
  echo(d,'shore-aid','青帆埠留下的补给怎样了？','「岸上伤者有药，我替他们记这一份。岑隐礁仍要自己担礁上急伤，别把一处善举说成所有人都受益。」');
  echo(d,'keeper-aid','青帆埠留下的补给怎样了？','「守礁药囊多了一份，岸上有人觉得你偏帮岛上。好意有去处，也有没被照顾到的人。」');
 }
 if(d.id==='dlg.r85-xie-zhaoting-channel'){
  text(d,'accepted','「从风回岛东岸(97,50)渡潮生屿，等低潮到礁道水则(26,56)按E记见闻，再回来报告。沿途留够伤药，水则记过就不必重跑。」');
  text(d,'isle','「从本岛东岸(97,50)南渡潮生屿，落脚在西滩。守礁人岑隐礁在松林营地附近，陆余白卖有限药品；具体人物位置看M舆图。」');
  text(d,'active','「潮生屿低潮时在礁道水则按E记见闻，再来报告；调查前的闲聊不算复命。记下过的水则可以复用，不须多跑一次，也没有拓纸物品。」');
  text(d,'completed','谢照汀核对你记的水则：「谢仪已结。这里的低潮刻度只说明礁脊露出的条件，不是风灯航向。接着在澜心洲核潮簿和灯谱，再问引航礁虞星槎；不能把旧水则当成全海域永远可走。」');
  for(const n of d.nodes)for(const o of n.options??[])if(o.nextNodeId==='completed')o.text='低潮水则见闻已经记下，来复核。';
 }
 if(d.id==='dlg.r85-cen-yinjiao-reef'){
  text(d,'reefwait','「礁道水则在(26,56)，低潮时按E读刻度，把见闻记清即可。当前潮汐看提示，返潮后先回稳妥的地方，别拿命换一行字。」');
  text(d,'greet','岑隐礁把藤索缠在肩上：「礁道水则须低潮才能调查，当前潮汐看提示。陆余白在岛上卖有限药品，相邻按E；别把他货囊里的存量当成无穷。东北海口(86,54)可渡澜心洲，再到引航礁核灯谱。」');
  echo(d,'shore-aid','青帆埠的补给决定，你如何看？','「岸上救伤值得，但药囊这回没分到药。你下次踏礁时，要记得谁还在自己扛急伤。」');
  echo(d,'keeper-aid','青帆埠的补给决定，你如何看？','「留的回春膏已记作守礁应急份额，我领这份情；岸上的伤者不是因此就都安稳了。」');
 }
 if(d.id==='dlg.r97-ji-wuchao'){
  text(d,'accepted','「北沙脊潮痕碑(58,22)按E调查，再来复核；这处调查没有额外低潮条件，局部通路限制看提示。上午我在(50,44)、日中在(54,50)，其余时段看M人物位置；已有见闻不用重复描刻。」');
  text(d,'active','「先记潮痕碑，再报告；先前闲聊不算复命。潮时在见闻里，没有簿页物品。下一步核观汐台(46,76)灯谱，可在去引航礁前顺路记好，少一次往返。」');
  text(d,'completed','「潮簿已经核定，谢仪结清。先顺路记观汐台灯谱，再由东北关口到引航礁向虞星槎承接并报告；已有灯谱见闻会同步，不必再渡回来。澜心洲西口通风回岛、南口通潮生屿。」');
  choice(d,'pilot','核过的潮时传给散船，还是只传熟船队？',[done('quest.r97-tide-ledger')],[
   {flag:'pilot-public',label:'拿贝壳2片作公开辨潮记号（季+4、虞−4、声望+3）',item:'item.r32.clam-shell',quantity:2,effects:[relation(JI,4),relation(YU,-4),{kind:'adjustRenown',delta:3}],response:'季无潮接下两片贝壳作传示样记：「散船有了认潮的样子，假号客也能照学；虞星槎得承担辨号。」'},
   {flag:'pilot-crew',label:'留清心丸1份给熟船值守（季−4、虞+4、声望−2）',item:'item.qingxin-wan',effects:[relation(JI,-4),relation(YU,4),{kind:'adjustRenown',delta:-2}],response:'季无潮把清心丸记在船队值守名下：「队内认得人，核号快了；陌生的散船要再来问，夜航的等待仍由他们担。」'}]);
  text(d,'r102-pilot-choice',PILOT_COST_HINT);
  echo(d,'shore-aid','沿岸补给怎样影响这里？','「你先照应岸上伤者，岑隐礁的急药却没补齐。传潮时也不能只看谁方便，得看谁承担漏下的风险。」');
  echo(d,'keeper-aid','沿岸补给怎样影响这里？','「礁上多一份急药，岸上却少一份。传潮时之前也要想好，要把等候留给谁。」');
  add(d,{id:'r102-north-link',text:'「北境火号报当下，旧驿刻记从前；海上潮痕记水位，灯谱记报码节律，都不是残篇密钥。别把相似短线当同一个东西。到引航礁复核，我们才有资格说海路这一段核清了。」'},option('北境已对照，海上能续出什么？','r102-north-link',[known('event.r101-north-close')]));
 }
 if(d.id==='dlg.r97-yu-xingcha'){
  text(d,'greet','虞星槎擦着灯罩：「灯一直有人养护，重燃星槎灯这趟差事要核准灯谱。观汐台见闻记过，就接下差事后直接报告；没记过再南渡。灯号核准了，行船仍要看潮。」');
  text(d,'accepted','「观汐台在澜心洲(46,76)，灯谱记入见闻即可，不交纸物品。已有见闻可以直接报告，调查之前的闲聊不作数。」');
  text(d,'active','「核观汐台见闻以后，再来报告。M舆图能查人物日程与关口，东南航路(89,89)通天门关，可接北境旧驿线。」');
  text(d,'completed','「潮簿对灯谱，报码时序已核妥，谢仪与航标见闻结清。我照常养护这盏灯，你往返仍须看潮；两处决定让不同船客承担了不同的等候。」');
  echo(d,'pilot-public','公开传潮时，守标人怎样回应？','「散船方便了，可假号会照抄。你拿贝壳作样记有用，查假号的余担仍由我来收。」');
  echo(d,'pilot-crew','限定熟船传潮时，守标人怎样回应？','「值守有清心丸，认船也快。但散船不能靠这份便利，他们夜里仍要停下来核簿。」');
  const all=seaQuestIds.map(done);
  add(d,{id:'r102-sea-crosscheck',text:'虞星槎逐项对照：「回湾刻线指浅湾、风灯指向、水则记露礁、潮痕记水位、灯谱记报码节律；不是一串藏起来的暗码。残篇纸墨仍只能沿既有证据判断，作者与年岁未定。海路调查这一步有了可用的阶段答案。」'},option('六项差事核妥，海路刻痕可以合成什么？','r102-sea-crosscheck',[...all,known('event.r102-sea-crosscheck',false)],[discover('event.r102-sea-crosscheck')]));
  add(d,{id:'r102-sea-close',text:'「调查和两处决定都留下了记录。海路阶段结案，但谁承担等候、谁先得到补给不会被一声结案抹去。北行至天门关可找沈问秋核旧驿脊，南返潮生屿可看岑隐礁的回应；大陆的更簿也仍有报信人的代价。」'},option('连同两处决定，结清海路这一阶段。','r102-sea-close',[...all,known('event.r102-supply-settled'),known('event.r102-pilot-settled'),known('event.r102-sea-crosscheck'),known('event.r102-sea-close',false)],[discover('event.r102-sea-close')]));
 }
 }
 return set;
}
export const seaKnowledgeNodes=[
 ['shore-aid','岸上救伤补给','海盐敷膏1罐，顾+4/岑−3/声望+2；守礁急药仍需另外筹备。'],
 ['keeper-aid','守礁应急补给','回春膏1份，顾−3/岑+4/声望−1；岸上伤者仍待后批。'],
 ['supply-settled','沿海补给决定','岸上或守礁两种去向已单次结算。'],
 ['pilot-public','公开传示潮时','贝壳2片，季+4/虞−4/声望+3；散船便利，辨假号负担增加。'],
 ['pilot-crew','熟船传示潮时','清心丸1份，季−4/虞+4/声望−2；队内便利，散船等待。'],
 ['pilot-settled','传航范围决定','公开或熟船两种范围已单次结算，不改变地图通路。'],
 ['sea-crosscheck','海路五类刻记对照','回湾线、风灯向、水则、潮痕和灯谱用途不同，不确定残篇作者或纸龄。'],
 ['sea-close','海路阶段结案','六差事、两处决定与刻记对照已记录，供后续终章读取。']
].map(([suffix,title,summary])=>({id:'event.r102-'+suffix,kind:'event',title,summary,knownByDefault:false}));
