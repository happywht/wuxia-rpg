import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../data/base/', import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const save = async (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');
const saveDescriptions = async (path, quests) => {
 let raw = await readFile(new URL(path, root), 'utf8');
 for (const quest of quests) raw = raw.replace(new RegExp('("id": "' + quest.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '",[\\s\\S]*?"description": )"(?:[^"\\\\]|\\\\.)*"'), (_, prefix) => prefix + JSON.stringify(quest.description));
 await writeFile(new URL(path, root), raw);
};
const known = (nodeId, isKnown = true) => ({kind:'knowledgeKnown',nodeId,...(isKnown ? {} : {isKnown:false})});
const done = questId => ({kind:'questStatus',questId,status:'completed'});
const discover = nodeId => ({kind:'discoverKnowledgeNode',nodeId});
const relation = (npcId, delta) => ({kind:'adjustRelationship',npcId,delta});
const option = (text, nextNodeId, conditions = [], effects = []) => ({text,nextNodeId,...(conditions.length ? {conditions} : {}),...(effects.length ? {effects} : {})});
const upsert = (list, value) => { const i = list.findIndex(x => x.id === value.id); if(i < 0) list.push(value); else list[i] = value; };
const add = (dialogue, node, entry) => {upsert(dialogue.nodes,node);if(entry) {const options=dialogue.nodes.find(n=>n.id==='greet').options;const i=options.findIndex(x=>x.nextNodeId===entry.nextNodeId);if(i<0)options.splice(options.length-1,0,entry);else options[i]=entry;} };
const ridge = await load('dialogues/round-62-conversations.json');
const [shao,qin] = ridge.conversations;
shao.nodes.find(n=>n.id==='north-mark').text='邵长庚把水尺刻线与门楼图并排看：「先到碎岭旧道核界石，再来我这里接驿镇更次，找秦素砚对簿。只认你见到的凿痕，不必带一块石头回来。」';
shao.nodes.find(n=>n.id==='pass-active').text='「旧制是三短一长，界石若被挪过，凿痕还在。」邵长庚指向北坡，「核过刻痕，差事便记妥；下一程到驿镇找秦素砚。」';
qin.nodes.find(n=>n.id==='ledger-checked').text='秦素砚敲了敲桌上的石片：「三短一长，是换更记法，不是纸龄。你这一问已把更次核妥，谢仪照簿结清；不必再交一页不存在的字据。下一步在邵长庚处接碎岭清道。」';
add(qin,{id:'r100-record-choice',confirmEffects:true,text:'秦素砚把名字一栏遮住：「旧簿指向有人借错牌占路，可报信人也在山中。公开更次能让路客自查，却会让报信人暴露；只报刻线，查路的人便少一份可公开的证词，还得留一份回春膏给他避路救急。选定后记入见闻，不能改选。」',options:[
option('公开更次与署名（秦素砚关系−4，江湖声望+3）。','r100-record-open',[known('event.r100-record-settled',false)],[relation('char.qin-suyan',-4),{kind:'adjustRenown',delta:3},discover('event.r100-record-open'),discover('event.r100-record-settled')]),
option('隐去姓名并留回春膏×1（消耗药品，声望−2、秦素砚关系+4）。','r100-record-guard',[known('event.r100-record-settled',false),{kind:'itemCount',itemId:'item.huichun-gao',minCount:1}],[{kind:'takeItem',itemId:'item.huichun-gao',quantity:1},{kind:'adjustRenown',delta:-2},relation('char.qin-suyan',4),discover('event.r100-record-guard'),discover('event.r100-record-settled')]),
option('暂不定夺。','farewell')
]},option('更次已核妥，怎样处理报信人的姓名？','r100-record-choice',[done('quest.r62-post-ledger'),known('event.r100-record-settled',false)]));
add(qin,{id:'r100-record-open',text:'秦素砚将姓名摊开：「路客能互相核牌了，可那个人要躲一阵。下回到青岩驿，听听罗金子怎样看这件事。」'});
add(qin,{id:'r100-record-guard',text:'她遮住姓名：「药留给他救急，我替他记这份情。没有公开证词，旁人不会把功劳都算给你。到青岩驿核井壁水线，那里能把货担秤刻与更牌记法分开。」'});
for(const [flag,id,text] of [
['event.r100-record-open','r100-open-echo','邵长庚点了点更牌：「你公开了更次，路客来核牌的人多了；秦素砚还在替报信人找避处。清道是清道，不能说已把幕后人查尽。」'],
['event.r100-record-guard','r100-guard-echo','邵长庚把更牌背面翻给你：「姓名留在秦素砚那里，我这里只改错牌。少了公开证词，路客要多问一遍；报信人暂能照常巡路。」']]) add(shao,{id,text},option('更簿处理之后，驿路有什么变化？',id,[known(flag)]));
add(shao,{id:'r100-road-links',text:'「石脊西道在铁嶂南端，通青岩驿；断云北隘在北端，通云岭。」邵长庚摊开路图，「先核青岩苦井的货担刻线，再向沈雨霁问云纹石阶。三处记法对上，只能说明旧商路相通，不能凭此认出残篇作者。」'},option('清道之后，我要如何续查纸墨来路？','r100-road-links',[done('quest.r62-clear-ridge-road')]));
await save('dialogues/round-62-conversations.json',ridge);
const salt=await load('dialogues/round-67-conversations.json');const luo=salt.conversations[0];
luo.nodes.find(n=>n.id==='completed').text='罗金子听完井壁刻痕：「刻线是旧货担记水份的秤记，井咸不能全怪盐天。看过水线，差事已结，回来说话只是复核，不另领一次谢仪。去云岭找沈雨霁，查石阶第三道刻纹究竟指路还是指索。」';
add(luo,{id:'r100-well-choice',confirmEffects:true,text:'「井水发苦，过路人要多备药。」罗金子指着货担，「你可留一份回春膏作救急，也可自己带着继续走山路。我会照实告诉云岭的人，不替你装好人。选定后不可改选。」',options:[
option('留下回春膏×1（消耗药品，善恶+2、罗金子关系+4）。','r100-well-aid',[known('event.r100-well-settled',false),{kind:'itemCount',itemId:'item.huichun-gao',minCount:1}],[{kind:'takeItem',itemId:'item.huichun-gao',quantity:1},{kind:'adjustMorality',delta:2},relation('char.luo-jinzi',4),discover('event.r100-well-aid'),discover('event.r100-well-settled')]),
option('保留药品给自己的山路（罗金子关系−4，江湖声望−2）。','r100-well-reserve',[known('event.r100-well-settled',false)],[relation('char.luo-jinzi',-4),{kind:'adjustRenown',delta:-2},discover('event.r100-well-reserve'),discover('event.r100-well-settled')]),
option('我先筹备，稍后再定。','farewell')
]},option('水线核过了，过路人的补给怎么办？','r100-well-choice',[done('quest.r67-well-waterline'),known('event.r100-well-settled',false)]));
add(luo,{id:'r100-well-aid',text:'罗金子把药收入救急货担：「这份药留在驿棚，你自己的回春膏就少一份。往东关回铁嶂，再过断云北隘找沈雨霁，她会知道是谁帮过这段路。」'});
add(luo,{id:'r100-well-reserve',text:'罗金子没有伸手：「自己的命也是命，只是驿棚的缺口还在。往东关回铁嶂，再过断云北隘，沈雨霁若问，我就照你今天的选择说。」'});
add(luo,{id:'r100-open-echo',text:'罗金子压低声音：「更次摊开后，货担不用只信一张旧牌；那个署名的人却得避开陌生客。你让账好查了，也让一个人难过路。」'},option('公开更簿后，货路怎样？','r100-open-echo',[known('event.r100-record-open')]));
add(luo,{id:'r100-guard-echo',text:'「报信人还能在驿棚露脸，货主却仍追问是谁作证。」罗金子拨了拨秤珠，「守住一个名字，便要承受账目不够公开的疑问。」'},option('遮去更簿姓名后，货路怎样？','r100-guard-echo',[known('event.r100-record-guard')]));
add(luo,{"id":"r163-well-aid-followup","text":"「你留的回春膏已收进驿棚救急份额，不用再交一次。伤者先有照应，你自己的药囊却少了一份。往东关回铁嶂，再由断云北隘入云岭，找沈雨霁问青岩带话；相邻F交谈，R行旅可查人物当前去处。听过她的回应，再把井壁、更簿与索孔分清，援药不是替残篇断年来历。」"},option('井药取舍已定，之后去哪里听回响？','r163-well-aid-followup',[known('event.r100-well-aid')]));
add(luo,{"id":"r163-well-reserve-followup","text":"「你保留了自用药，驿棚仍等后批，这个缺口不会因为井水查完就消失。往东关回铁嶂，再由断云北隘入云岭，找沈雨霁问青岩带话；相邻F交谈，R行旅可查人物当前去处。听过她的回应，再把井壁、更簿与索孔分清，别把自备说成这里也分到了药。」"},option('井药取舍已定，之后去哪里听回响？','r163-well-reserve-followup',[known('event.r100-well-reserve')]));
await save('dialogues/round-67-conversations.json',salt);
const cloud=await load('dialogues/round-74-cloud-ridge-conversations.json');const shen=cloud.conversations[0];
shen.nodes.find(n=>n.id==='bridge-complete').text='沈雨霁在图上划掉路障：「悬桥边的拦路客已散，护索还要另行修补。你能走过这一路，不等于每个后来人都能不看脚下。」';
shen.nodes.find(n=>n.id==='marks-accepted').text='「石阶在客舍西北，第三道刻纹沿石缝续进去。看全刻痕，记入见闻即可，不必带回一份拓片。」沈雨霁在油纸图上圈出石阶。';
add(shen,{id:'r100-paper-check',text:'沈雨霁将三处记法并排：「更簿三短一长是换更，井壁圈线是记水份，石阶第三道刻纹指向旧索孔，旁边留着新拓纸纤维。三处并非同一套暗码，不能用刻痕给残篇断纸龄。书院转述的水纹纸药墨仍是待核的水路线索；山路上有人近日拓图，不等于他写了残篇，下一步应查船货记录。下一段沿越岭东行到青帆埠查船货，北台栈道的界标另有边防线索。」'},option('把更簿、井壁和石阶对照，残篇来路能坐实多少？','r100-paper-check',[done('quest.r62-post-ledger'),done('quest.r67-well-waterline'),done('quest.r74-cloud-marks')],[discover('event.r100-paper-crosscheck')]));
add(shen,{id:'r100-aid-echo',text:'「罗金子托过路人说，你留了回春膏。」沈雨霁看了看你的行囊，「人能先在驿棚救急，你上悬桥反而得算好剩药；这不是无代价的善举。」'},option('青岩驿有人带话来吗？','r100-aid-echo',[known('event.r100-well-aid')]));
add(shen,{id:'r100-reserve-echo',text:'「罗金子说你把药留给了自己。」沈雨霁没有责你，「山路确实险，可驿棚没补上缺口。下回过井边，别把那里的人都当作只会讨东西。」'},option('青岩驿有人带话来吗？','r100-reserve-echo',[known('event.r100-well-reserve')]));
add(shen,{id:'r100-mainland-close',text:'沈雨霁把清道与清桥两笔划在图上：「路障已清，不等于护索已修复，更不等于幕后查明。你对更簿和补给的选择，各处人都记着。大陆这一程已弄清三处刻痕分工；要继续追纸墨，东行问船货，北行核旧界标。」'},option('三地调查与清道完成，我要向哪里续查？','r100-mainland-close',[done('quest.r62-clear-ridge-road'),done('quest.r74-cloud-bridge'),known('event.r100-record-settled'),known('event.r100-well-settled'),known('event.r100-paper-crosscheck')],[discover('event.r100-mainland-close')]));
await save('dialogues/round-74-cloud-ridge-conversations.json',cloud);
const quests=await load('quests/round-07-quests.json');
const descriptions={
'quest.r62-north-pass-marks':'沿碎岭旧道核对界石凿痕，确认路标改动；见闻记入即结算，之后找邵长庚接驿镇更次，不需要拾取铜扣或拓片。',
'quest.r62-post-ledger':'界石已核，找秦素砚对更簿；交谈即结算。随后决定公开署名或保护报信人，代价与结果记录见闻，再到邵长庚处接清道。',
'quest.r62-clear-ridge-road':'更次已校，击退碎岭拦路客。返回邵长庚可知更簿选择的回响，并获石脊西道去青岩驿、断云北隘去云岭的续查方向。',
'quest.r67-well-waterline':'到回声苦井核对水线和货担秤刻；发现见闻即结算。返回罗金子复核后，可选择留下回春膏或保留药品，随后回铁嶂再向云岭对照石阶。'};
for(const q of quests.quests)if(descriptions[q.id])q.description=descriptions[q.id];await saveDescriptions('quests/round-07-quests.json',quests.quests.filter(q=>descriptions[q.id]));
const cq=await load('quests/round-74-cloud-ridge-quests.json');cq.quests[0].description='辨认云纹石阶的第三道刻痕，发现见闻即结算。若已核铁嶂更簿与青岩井壁，返回沈雨霁能对照三地记法，限定残篇纸墨的阶段性答案。';cq.quests[1].description='石阶刻痕显示护索方向改动，击退断索悬桥拦路客。清桥并非自动修复护索；完成铁嶂清道、两处立场与三地对照后，可向沈雨霁询问东行船货和北台界标。';await saveDescriptions('quests/round-74-cloud-ridge-quests.json',cq.quests);
const nodes=await load('knowledge_graph/nodes.json');const edges=await load('knowledge_graph/edges.json');
for(const [id,title,summary] of [
['record-open','更簿公开署名','玩家公开铁嶂更次与报信姓名，秦素砚关系−4、江湖声望+3；路客可核牌，报信人需要避处。'],
['record-guard','更簿隐去姓名','玩家保护报信姓名并留下回春膏×1，秦素砚关系+4、江湖声望−2；报信人仍能巡路，货主缺少公开证词。'],
['record-settled','更簿立场已定','玩家已作一次更簿处理选择；公开与保护不可同时选择或重复结算。'],
['well-aid','青岩救急留药','玩家在井水调查后留下回春膏×1，善恶+2、罗金子关系+4；药品留在驿棚，自身行囊减少。'],
['well-reserve','青岩行囊留药','玩家保留药品自备山路，罗金子关系−4、江湖声望−2；驿棚补给缺口仍在。'],
['well-settled','青岩补给已定','玩家已决定援助或自备，不能重复结算或改选。'],
['paper-crosscheck','三地刻痕对照','更簿三短一长记换更，井壁圈线记水份，石阶刻纹指旧索孔并留有新拓纤维；三处并非同一暗码，不足以判残篇纸龄、同批纸或作者。水纹纸药墨仍需船货记录核实。'],
['mainland-close','大陆调查阶段结案','更簿与补给立场、三地对照、碎岭和悬桥战斗完成；路障清除不等于护索修复，东行船货与北台界标继续未解线索。']]) {
 const nodeId='event.r100-'+id;upsert(nodes.nodes,{id:nodeId,kind:'event',title,summary,knownByDefault:false});
 const npc=id.startsWith('record')?'char.qin-suyan':id.startsWith('well')?'char.luo-jinzi':'char.r74-shen-yuji';upsert(edges.edges,{id:'kg.edge.r100-'+id,fromId:npc,toId:nodeId,relation:'knows',summary:'人物在本轮条件对白中处理或复核此事；此静态关联不表示运行时已知。'});
}
await save('knowledge_graph/nodes.json',nodes);await save('knowledge_graph/edges.json',edges);
console.log('Round100：6项既有差事、4人对白、8见闻/关系；未改变地图或任务ID。');
