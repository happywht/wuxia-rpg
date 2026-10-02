// Shared by R91–94 authoring and the incremental updater; no filesystem effects.
const known = (nodeId, isKnown = true) => ({kind:'knowledgeKnown',nodeId,...(isKnown ? {} : {isKnown:false})});
const done = questId => ({kind:'questStatus',questId,status:'completed'});
const discover = nodeId => ({kind:'discoverKnowledgeNode',nodeId});
const relation = (npcId,delta) => ({kind:'adjustRelationship',npcId,delta});
const take = itemId => ({kind:'takeItem',itemId,quantity:1});
const has = itemId => ({kind:'itemCount',itemId,minCount:1});
const option = (text,nextNodeId,conditions=[],effects=[]) => ({text,nextNodeId,...(conditions.length?{conditions}:{}),...(effects.length?{effects}:{})});
export const NORTH_CHALLENGE_ID='encounter.r101-beacon-raider';
const aid='item.huichun-gao',focus='item.qingxin-wan';
const gu='char.r92-gu-zhaoxue',nie='char.r91-nie-qiyan',liu='char.r93-liu-xunjing',shen='char.r94-shen-wenqiu';
const upsert=(list,value)=>{const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(value);else list[i]=value;};
const add=(d,node,entry)=>{upsert(d.nodes,node);if(entry){const opts=d.nodes.find(n=>n.id==='greet').options;const i=opts.findIndex(o=>o.nextNodeId===entry.nextNodeId);if(i<0)opts.splice(opts.length-1,0,entry);else opts[i]=entry;}};
const setText=(d,id,text)=>{d.nodes.find(n=>n.id===id).text=text;};
export function deepenNorthQuests(set){
 const descriptions={
 'quest.r91-goose-vigil':'白日越雁桥记雁候，再回聂栖雁复核，谢仪为经验与银两，不发崖茶物品。目标按顺序推进；北境栈道通照雪关，东行天门雪道通天门关。',
 'quest.r92-snow-beacon':'入照雪关，在落雪日黄昏/入夜/子夜点验烽号，击退燧台东南(62,25)的冒号客，再找谷照雪复命。随后可决定公开番号或限定传号，皆需药品支援；谢仪为经验、银两及北界碑见闻。',
 'quest.r93-boundary-mark':'越照雪关西行冰桥入霜松谷，核谷西旧界刻，再找柳寻径报告。前朝屯垦界不是当朝疆界；随后选择公开注记或内部留录，两途需药品，后果见闻保存。',
 'quest.r94-snowline-signal':'从北台东行天门雪道至天门关，核东望烽台旧驿刻，再找沈问秋报告。完成雁候/雪烽/谷界与两处立场后，可对照现行烽号和旧商路，获得海路续查入口。'};
 for(const q of set.quests){if(!descriptions[q.id])continue;q.description=descriptions[q.id];q.orderedObjectives=true;
  if(q.id==='quest.r92-snow-beacon'&&!q.objectives.some(o=>o.targetId===NORTH_CHALLENGE_ID))q.objectives.splice(q.objectives.length-1,0,{id:'objective.r101-clear-beacon-raider',kind:'defeatEncounter',targetId:NORTH_CHALLENGE_ID,requiredCount:1,text:'在燧台东南(62,25)击退冒用烽号的索路客'});
  const report=q.objectives.at(-1);if(report?.kind==='talkToNpc')report.text='调查'+(q.id==='quest.r92-snow-beacon'?'与挑战':'')+'完成后，向任务人物报告所记见闻（无字据物品）';
 }
 return set;
}
export function deepenNorthDialogues(set){
 for(const d of set.conversations){
 if(d.id==='dlg.r91-nie-qiyan-vigil'){
  setText(d,'greet','聂栖雁把记雁的竹筒压在石阶旁：「雁候能帮山里人看季节，不是人间烽号。替我白日记一回阵形，再回来核对，谢仪按经验与银两结清。」');
  setText(d,'completed','聂栖雁听完你记的阵形：「雁候这一笔核妥了，谢仪已结，不另发崖茶或竹筒。北境栈道通照雪关，暮雪时那里的烽火才看得清；东行天门雪道另通旧驿脊。」');
  add(d,{id:'r101-mainland-link',text:'聂栖雁摇头：「井壁、更簿、索孔有各自用处；雁阵是活物，不能再拿来凑第四段暗码。去照雪关核现行火号，再到谷里核前朝界刻，先分清谁在记今天、谁在记旧事。」'},option('大陆三地刻痕已经对照，北台能续查什么？','r101-mainland-link',[known('event.r100-paper-crosscheck')]));
  for(const [flag,id,text]of[
   ['code-open','r101-open-echo','「你把番号传给了过路人。」聂栖雁点头又皱眉，「人能认火，冒号的人也能照学。谷照雪多了一份防假号的担子。」'],
   ['code-limited','r101-limited-echo','「号码只留在报码队。」她望向山下，「真假好查了，可赶路的人见三烽仍要再找人问，雪夜里的迟疑由他们来担。」']])add(d,{id,text},option('照雪关传号的决定，山下怎样看？',id,[known('event.r101-'+flag)]));
 }
 if(d.id==='dlg.r92-gu-zhaoxue-vigil'){
  add(d,{id:'r166-provisions-budget',text:'谷照雪摊开两份用药簿：「公开现行番号需清心丸1，霜松谷公开前朝注记另需清心丸1；两处都公开共需2颗，战斗补气用掉的不能再交。若两处都限定或内部留录，则各需回春膏1，共2份，救伤用药也得另算。我的补给摊起初只有清心丸2、回春膏3，售出后不会因复谈补满；库存和价格按E查看，R行旅的补给页可找我当前所在。备齐也不替你作决定，到了各处仍要亲自核查、报告和确认。」'},option('北境两处决定与战斗，要怎样分开筹药？','r166-provisions-budget'));

  setText(d,'greet','谷照雪把松明捆上燧杆：「雁候看季节，烽号报当下。有人学了火号向客商索路钱，你既肯点验，也得把燧台东南那伙冒号客赶开，再来复命。谢仪只有经验、银两和见闻，不送烈酒。」');
  setText(d,'accepted','「只走冰河中渡踏痕。落雪日的黄昏、入夜或子夜，到东北燧台按E点验。然后去燧台东南(62,25)击退冒号客，最后找我报告。若先前已赢过这伙人，记录仍作数，不必再找消失的敌人。」');
  setText(d,'active','「先点验再清扰号，最后复命；没核清时的闲聊不算报告。晨光/日中我在石屋(50,26)，暮时在燧台南(58,24)，夜与子夜在(51,27)，午后在(52,28)，黎明也在燧台南。天气或时辰不符，烽台提示会说明。」');
  setText(d,'completed','谷照雪把你记的烽号与册上相核：「这一回点验与复核记妥了，谢仪已结。若仍见冒号客，也可另外清扰，但本回谢仪不再结第二次。纸墨的旧案不能凭这季火号定年，更不能凭旧碑越界。」');
  add(d,{id:'r101-code-choice',confirmEffects:true,text:'「一烽平安、二烽客至、三烽有事，是现行报码。」谷照雪把册压住，「公开番号，过路人看得懂，也有人能假传；限定报码，真假可核，却让客商多一次询问。传话与护号都要药品备夜路，定了便不能改选。」',options:[
   option('公开番号（清心丸−1，谷关系−4、聂关系+3、声望+2）。','r101-code-open',[known('event.r101-code-settled',false),has(focus)],[take(focus),relation(gu,-4),relation(nie,3),{kind:'adjustRenown',delta:2},discover('event.r101-code-open'),discover('event.r101-code-settled')]),
   option('限定报码（回春膏−1，谷关系+4、聂关系−3、声望−2）。','r101-code-limited',[known('event.r101-code-settled',false),has(aid)],[take(aid),relation(gu,4),relation(nie,-3),{kind:'adjustRenown',delta:-2},discover('event.r101-code-limited'),discover('event.r101-code-settled')]),option('先筹备药品，稍后再定。','farewell')
  ]},option('烽号核妥，番号要传给所有过路人吗？','r101-code-choice',[done('quest.r92-snow-beacon'),known('event.r101-code-settled',false)]));
  add(d,{id:'r101-code-open',text:'谷照雪收下清心丸给传号人凝神：「番号会传下去，我也得加倍查假火。回北台问聂栖雁，别只听我这里的一面话。西行冰桥到霜松谷，那里旧界文又是另一回事。」'});
  add(d,{id:'r101-code-limited',text:'她收下回春膏作护号救急：「细号只交报码队，过客须问人认火。回北台听聂栖雁怎样说，再走西行冰桥核谷里的旧界，别把前朝字当成今天的令。」'});
  for(const [flag,id,text]of[
   ['mark-public','r101-public-echo','谷照雪看过传来的注记：「前朝屯界与今朝关防分开写，免了几次越界争论；柳寻径却要接住更多来问旧账的人。公开一页史料，不会自动给今天定界。」'],
   ['mark-private','r101-private-echo','「谷里留了内部旧刻记录。」她点头，「少惹争执是好事，可关外来的人看不到注记，问疆界时仍要有人解释。没有公开文字，不代表旧碑成了现行界。」']])add(d,{id,text},option('霜松谷处理旧界文之后，有什么变化？',id,[known('event.r101-'+flag)]));
 }
 if(d.id==='dlg.r93-liu-xunjing-rounds'){
  setText(d,'greet','柳寻径烘着旧裹脚：「谷西有块前朝屯垦界标。我巡的是旧路，不是替前朝复立疆界。去核碑阳刻文，回来报告，谢仪照经验和银两结；不发烈酒或拓纸物品。」');
  setText(d,'accepted','「沿主径过冰溪踏痕，向西南找界标。在石下按E记刻文，见闻自会留住；无需取纸或背回一块碑。核过之后再找我报告。」');
  setText(d,'completed','柳寻径听你复述：「北墉屯界，西至松谷，是前朝屯垦的旧刻，不是大雍的新界令。报告已核，谢仪已结；北界碑与谷界文都要注明时代，不能拿它们给残篇认作者。」');
  add(d,{id:'r101-mark-choice',confirmEffects:true,text:'柳寻径把旧刻记录放在窗边：「可让人公开张贴前朝注记，免得外人误把旧屯界当今界；也可只留巡路内部，少惹争执，但来人仍要逐个问。传话人要清心丸，护卷人要回春膏，定了不可改选。」',options:[
   option('公开前朝注记（清心丸−1，柳关系−4、声望+3）。','r101-mark-public',[known('event.r101-mark-settled',false),has(focus)],[take(focus),relation(liu,-4),{kind:'adjustRenown',delta:3},discover('event.r101-mark-public'),discover('event.r101-mark-settled')]),
   option('内部留录（回春膏−1，柳关系+4、沈问秋关系−3、声望−2）。','r101-mark-private',[known('event.r101-mark-settled',false),has(aid)],[take(aid),relation(liu,4),relation(shen,-3),{kind:'adjustRenown',delta:-2},discover('event.r101-mark-private'),discover('event.r101-mark-settled')]),option('暂不定夺，先筹备。','farewell')
  ]},option('旧界文该怎样说明它的时代？','r101-mark-choice',[done('quest.r93-boundary-mark'),known('event.r101-mark-settled',false)]));
  add(d,{id:'r101-mark-public',text:'他收下药交传话人：「注记会说明前朝屯垦，不划新界。我得应付来问旧账的人；谷照雪会少几次误判，去听听关里怎样看。」'});
  add(d,{id:'r101-mark-private',text:'他把药留作护卷救急：「记录放巡路屋里，来人还是得问。沈问秋想让旧路更好查，这回他恐怕不满意。回照雪关再南返北台，沿东行天门雪道问他。」'});
  add(d,{id:'r101-north-check',text:'柳寻径分开三笔：「雁候记活物，照雪烽号报当下，谷界文记前朝屯垦。北界碑的大梁刻字也是旧刻，不可外推为大雍今界。它们只让我们分清记录用途，不能替残篇断纸龄。要追水纹纸药墨，得问天门关旧驿线怎样通海路。」'},option('雁候、雪烽和谷界对过，能给残篇定年来路吗？','r101-north-check',[done('quest.r91-goose-vigil'),done('quest.r92-snow-beacon'),done('quest.r93-boundary-mark')],[discover('event.r101-north-crosscheck')]));
 }
 if(d.id==='dlg.r94-shen-wenqiu'){
  setText(d,'accepted','「沿东脊核东望烽台。只记正对山口那三道短线，不把刻记当这季火号；见闻记下后再回来报告，不需要携带拓本物品。」');
  setText(d,'completed','沈问秋听完刻记：「三道短线，一道向海，两道回山，是旧驿路向；它不等同照雪关现行火号。报告与谢仪已结，只有经验、银两和云窗见闻，不另发暖石。」');
  add(d,{id:'r101-north-close',text:'沈问秋将四地记录分栏：「北境这一程能坐实用途与时代：雁候、今烽、前朝屯界、旧驿线各不相同。残篇水纹纸药墨的出处仍待船货核实，不认作者。番号和旧界注记怎样传，你付的药、各家的态度都记着。天门关南走雾杉关、听杉谷、照叶港可往归帆洲；归帆洲再接潮生屿，继续海路调查。」'},option('四地复核与立场都已定，下一章怎样接海路？','r101-north-close',[done('quest.r91-goose-vigil'),done('quest.r92-snow-beacon'),done('quest.r93-boundary-mark'),done('quest.r94-snowline-signal'),known('event.r101-code-settled'),known('event.r101-mark-settled'),known('event.r101-north-crosscheck')],[discover('event.r101-north-close')]));
  add(d,{id:'r101-private-echo',text:'「谷里的旧刻只留内部。」沈问秋把驿牒翻给你，「保护了巡路人的安静，却让后来者难查旧路。我不满意的是记录不易查，不是要用前朝碑文替今朝划界。」'},option('柳寻径选择内部留录，你怎样看？','r101-private-echo',[known('event.r101-mark-private')]));
  add(d,{id:'r101-public-echo',text:'沈问秋指向新注记：「注明时代，比只画一道界线公允。旧路能查，现行关防仍须另核；柳寻径承受的争执也不能当作没有。」'},option('柳寻径公开前朝注记，你怎样看？','r101-public-echo',[known('event.r101-mark-public')]));
 }
 }
 return set;
}
export const northKnowledgeNodes=[
 ['code-open','照雪番号公开','玩家支出清心丸1公开番号，谷关系−4、聂关系+3、声望+2；过客易认，守烽者多防假号。'],
 ['code-limited','照雪限定传号','玩家支出回春膏1限定报码，谷关系+4、聂关系−3、声望−2；真假易核，客商须再询问。'],
 ['code-settled','照雪传号已定','番号公开与限定不可重复或同时选择。'],
 ['mark-public','霜松前朝注记公开','支出清心丸1，柳关系−4、声望+3；时代说明易查，巡路人承受旧账争执。'],
 ['mark-private','霜松旧刻内部留录','支出回春膏1，柳关系+4、沈问秋关系−3、声望−2；内部护卷，过客难查。'],
 ['mark-settled','霜松旧刻处理已定','公开注记与内部留录不可改选或重复结算。'],
 ['north-crosscheck','北境记录用途分辨','雁候、现行火号、前朝屯界用途不一；大梁遗刻不能认作大雍今界，不能替残篇定纸龄。'],
 ['north-close','北境调查阶段结案','四地复核和两处决定完成，旧驿线通向南行海路，水纹纸药墨作者仍待船货证据。']
].map(([suffix,title,summary])=>({id:'event.r101-'+suffix,kind:'event',title,summary,knownByDefault:false}));
