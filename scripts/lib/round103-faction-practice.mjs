// Round 103 five-faction field practice: pure authoring transformation shared
// by the incremental runner (deepen-round103-faction-practice.mjs) and tests.
// Quest and dialogue files carry hand-mixed formatting (short options on one
// line), so those two sources are patched as *text* — unrelated bytes stay
// untouched. Knowledge-graph files are already machine-shaped and go through
// parse/upsert/stringify instead. Every coordinate, gate, item id, encounter
// id and martial-art number below was verified against the shipped data.

export const wayfarerLetterNodeId = 'event.r43-wayfarer-letter';
const oldWayfarerLetterSummary = '黄昏雨夜在雾雨渡口偶遇赶路人，他带来五派各自托寻的一封匿名求助信。';
export const wayfarerLetterSummary =
  '黄昏雨夜在雾雨渡口偶遇赶路人，他带来五派各自托寻的一封匿名求助信；写信人未具名，入门弟子也可请本派师傅转抄与己派相关的一段。';

const known = (nodeId, isKnown = true) =>
  ({ kind: 'knowledgeKnown', nodeId, ...(isKnown ? {} : { isKnown: false }) });
const active = questId => ({ kind: 'questStatus', questId, status: 'active' });
const done = questId => ({ kind: 'questStatus', questId, status: 'completed' });
const member = factionId => ({ kind: 'factionMembership', factionId, isMember: true });
const discover = nodeId => ({ kind: 'discoverKnowledgeNode', nodeId });

// --- Authoring data (one entry per faction) ---------------------------------

export const factionPracticeConfigs = [
  {
    key: 'tingyu',
    questId: 'quest.r43-tingyu-eave-rain',
    factionId: 'faction.tingyu-jiange',
    mentorCharId: 'char.ye-tingzhou',
    mentorDialogueId: 'dlg.ye-tingzhou-mentor',
    fieldDialogueId: 'dlg.liu-tinglan-mentor',
    outcomeNodeId: 'event.r43-tingyu-eave-rain',
    practiceNodeId: 'event.r103-tingyu-practice',
    oldDescription: '赶路人带来的匿名信提到芦苇岸边有一段不合潮声的剑鸣。听雨剑阁不愿只凭传闻指认来客，叶庭舟请你把信中时辰交柳听澜核对，辨清究竟是剑声还是船索回荡。',
    firstObjectiveText: '请柳听澜核对信中剑鸣时辰',
    experience: 36,
    currency: 22,
    description: '赶路人带来的匿名信提到芦苇岸边有一段不合潮声的剑鸣。听雨剑阁不愿只凭传闻指认来客：先请柳听澜核对信中时辰，再往云岭古道云纹石阶观察旧索孔与刻痕的记法，最后回叶庭舟处复命；山中刻纹证不了江岸的声音，练的是眼力与分寸。',
    objectives: [
      { id: 'objective.r103-tingyu-ridge-sight', kind: 'discoverKnowledge', targetId: 'place.r74-cloud-markers', requiredCount: 1, text: '到云岭古道云纹石阶观察旧索孔与刻痕记法' },
      { id: 'objective.r103-tingyu-report', kind: 'talkToNpc', targetId: 'char.ye-tingzhou', requiredCount: 1, text: '回镇里向叶庭舟复命' },
    ],
    practiceTitle: '听雨云阶实践',
    practiceSummary: '柳听澜核对时辰、观察云纹石阶旧索孔刻痕后回叶庭舟复命；听雨剑阁声望+5，山中刻纹证不了江岸剑鸣，观察记法自成一手。',
    fieldBrief: '柳听澜把对过的时辰誊在信角：「核时辰是第一步——眼力也得练。云岭古道的云纹石阶在道西北(27,31)：由雾雨渡口北门(89,15)过关入铁嶂北道，循北麓(50,2)登上云岭古道，石阶就在左近，云栈客舍(39,43)可歇脚。去看旧索孔与刻痕如何记时序与受力，只记所见、不替它下结论——山里的刻纹，证不了江岸的声音。」',
    mentorBrief: '叶庭舟把剑谱合上：「这一程分三段：柳教习核时辰、云纹石阶看旧索孔刻痕、回我这里复命。看的是记法，练的是分寸。」既有见闻在核时辰后可推进记录；若这轮未实到云阶，不能把记录回填说成此行观察。',
    practiceEcho: '叶庭舟听完，在门中名册上记了一笔：「柳教习的结论仍是索环回弹，你在石阶看的是刻痕记法——两件事各自成立，谁也不替谁作证。眼力练到了，剑阁记你一功。修习照剑录的门槛来：够得着的先练，够不着的别硬够。」',
    verifyEcho: '叶庭舟点头：「时辰那一段，柳教习替你核明了，这桩告一段落。石阶那趟观察还没人替剑阁走过——往后行经云岭古道，多看多记，回来仍可与我说。剑法上的事，剑谱都在。」',
    letterCopy: '叶庭舟从案头取出一页抄本：「门中正查那封匿名信。与剑阁相关的一段，我抄了副本给你——写信人未具名，抄本照抄，我不替他落款。」',
    letterOption: '听说门中在查一封匿名信，能否让我也看一眼？',
    training: '叶庭舟把剑录翻到末页，逐条指给你看：「落雨七分剑，等级2、身法11/悟性11，攻击12、耗气3；覆水回澜剑，等级4、身法12/悟性13，攻击16、耗气5；怀音养息诀，等级4、悟性14/定力12，恢复17、耗气7；回澜照影剑，等级6、身法14/悟性15，攻击20、耗气8；听潮入微剑，等级10、身法18/悟性18，攻击27、耗气13。出手只分攻、养、守三用：攻是伤敌，养是疗伤回复生命、要耗内力却不补内力，守只挡得住下一击。剑阁没有隔空封穴的手段，别信传闻。」',
    fieldOption: '信中时辰核对过了，接下来这一程怎么走？',
    mentorBriefOption: '这趟门中差事，下一步往哪里去？',
    practiceEchoOption: '云纹石阶的旧索孔刻痕看过了，来回禀。',
    verifyEchoOption: '信中剑鸣那一段先前已核明，来回话。',
    trainingOption: '门中剑法的门槛与用处，请师父照实说一遍。',
  },
  {
    key: 'tiezhang',
    questId: 'quest.r43-tiezhang-stone-post',
    factionId: 'faction.tiezhang-pai',
    mentorCharId: 'char.shi-bei',
    mentorDialogueId: 'dlg.shi-bei-mentor',
    fieldDialogueId: 'dlg.gu-yechen-roadside',
    outcomeNodeId: 'event.r43-tiezhang-stone-post',
    practiceNodeId: 'event.r103-tiezhang-practice',
    oldDescription: '信中说芦苇岸旧桩夜里会传来三下空响。铁嶂派不信邪说，石北让你去问走过旧船道的顾夜尘：先弄清是桩脚松动，还是有人借声引路，再回报是否需要加固。',
    firstObjectiveText: '向顾夜尘问清旧系缆桩的底脚',
    experience: 40,
    currency: 18,
    description: '信中说芦苇岸旧桩夜里会传来三下空响。铁嶂派不信邪说：先问走过旧船道的顾夜尘弄清桩脚底细，再击退碎岭路上借界石截道的拦路客，最后回石北处复命，回报是否需要加固。',
    objectives: [
      { id: 'objective.r103-tiezhang-clear-road', kind: 'defeatEncounter', targetId: 'encounter.r62-ridge-roadblock', requiredCount: 1, text: '击退碎岭路上截道的拦路客' },
      { id: 'objective.r103-tiezhang-report', kind: 'talkToNpc', targetId: 'char.shi-bei', requiredCount: 1, text: '回雾雨渡口向石北复命' },
    ],
    practiceTitle: '铁嶂碎岭清道',
    practiceSummary: '顾夜尘问明桩脚、击退碎岭拦路客后回雾雨渡口石北复命；铁嶂派声望+5，旧桩空响与截道两事一并了清。',
    fieldBrief: '顾夜尘用刀鞘点了点桩脚的方向：「底细我问清了，路却还堵着——碎岭弯道(71,63)有伙拦路客借『界石』截停过山客，铁钎横在路心。由雾雨渡口北门(89,15)过关入铁嶂北道，往中段东去便是。那头目筋骨硬、力气沉，你挨不起就先躲，带够伤药再动身。」',
    mentorBrief: '石北把手掌按回桩顶：「三步：顾夜尘问桩脚、碎岭赶散拦路客、回渡口向我复命。桩要一根一根打，路要一段一段清。」',
    practiceEcho: '石北听完，在你肩上重重一拍：「拦路客这一趟散了，碎岭眼前清净；他们若再来，照今日的办法再清便是。桩脚松、人借声，两笔账一并了清。铁嶂记你一功。修习照桩谱的门槛来，站得稳的先练。」',
    verifyEcho: '石北沉声道：「桩脚的事，顾夜尘替你问明白了，旧响有了下文。只是碎岭那伙截道的还没人去清——(71,63)的事，遇上便是铁嶂的差事。功夫的事照桩谱来。」',
    letterCopy: '石北从桩顶取下一张折起的纸：「那封匿名信门中在查，与铁嶂相关的一段我抄下来了。信是谁写的没查实，抄本是抄本，别当原件传。」',
    letterOption: '听说门中在查一封匿名信，能否让我也看一眼？',
    training: '石北把桩谱摊开，粗指逐行划过：「铁桩靠山拳，等级2、体魄11/定力9，攻击13、耗气3；翻磅劲，等级4、体魄13/定力10，攻击17、耗气5；开山扛鼎刀，等级5、体魄15/力道13，攻击20、耗气7；截顶护身桩，等级7、体魄17/定力13，攻击22、耗气9；十手推碑腿，等级10、体魄19/身法14，攻击27、耗气12。铁嶂的功夫只分攻、养、守：攻是伤敌，养是疗伤回复生命、要耗内力却不补内力，守只挡得住下一击。没有站着不倒挨打不还手的神功。」',
    fieldOption: '桩脚问清了，碎岭那边还要做什么？',
    mentorBriefOption: '这趟门中差事，下一步往哪里去？',
    practiceEchoOption: '碎岭的拦路客散了，来回禀。',
    verifyEchoOption: '旧桩空响那一段先前已核明，来回话。',
    trainingOption: '门中功夫的门槛与用处，请师父照实说一遍。',
  },
  {
    key: 'yunyin',
    questId: 'quest.r43-yunyin-herb-road',
    factionId: 'faction.yunyin-shanzhuang',
    mentorCharId: 'char.wen-suxin',
    mentorDialogueId: 'dlg.wen-suxin-mentor',
    fieldDialogueId: 'dlg.rong-su-qing-herbalist',
    outcomeNodeId: 'event.r43-yunyin-herb-road',
    practiceNodeId: 'event.r103-yunyin-practice',
    oldDescription: '匿名信的封蜡沾着一味不该出现在江风里的苦香。闻素心不肯贸然辨药，托你去问容素青最近是否有人将湿药材带过旧船道；若能对上药气，庄中才好提前备下解潮方。',
    firstObjectiveText: '向容素青确认封蜡残留的药香',
    experience: 34,
    currency: 20,
    description: '匿名信的封蜡沾着一味不该出现在江风里的苦香。闻素心托你先向容素青确认药香来历，再到西陲盐道回声苦井核对水线，并自备两份回春膏以防途中急用，最后回来复命；药是自备防身，庄中并不收取。',
    objectives: [
      { id: 'objective.r103-yunyin-well-check', kind: 'discoverKnowledge', targetId: 'place.r67-brine-well', requiredCount: 1, text: '到西陲盐道回声苦井核对水线' },
      { id: 'objective.r103-yunyin-prepare-ointment', kind: 'collectItem', targetId: 'item.huichun-gao', requiredCount: 2, text: '自备两份回春膏以防急用' },
      { id: 'objective.r103-yunyin-report', kind: 'talkToNpc', targetId: 'char.wen-suxin', requiredCount: 1, text: '回雾雨渡口向闻素心复命' },
    ],
    practiceTitle: '云隐盐道验药',
    practiceSummary: '容素青辨明药香、回声苦井核对水线并自备回春膏两份后回闻素心复命；云隐山庄声望+5，药膏留作自用，庄中不收。',
    fieldBrief: '容素青把药匾往檐下一收：「药香对上了陈艾受潮——纸上闻得出，井边对得上才算数。回声苦井在西陲盐道西北(26,28)：由雾雨渡口北门(89,15)入铁嶂北道，南下(52,90)过关便是青岩驿(95,74)，井在盐道中北。回春膏按现行铺价一份十五两、自购两份共三十两：渡镇姜百味的担子上就有，青帆埠金云帆的摊上也备着；买来防身自用，庄中不收药、也不逼你交出来。」',
    mentorBrief: '闻素心把手上的药汁擦净：「这一程四段：容医师辨药香、苦井对水线、自备两份回春膏、回来复命。药是给你自己路上用的——救人之前，先护好自己。」',
    practiceEcho: '闻素心听完，在庄中记档上落了一笔：「陈艾受潮、井水水线，两处对上了，解潮方心里有底。膏子你自己收好，庄里不收你的药。云隐记你一功。修习照札记的门槛来，莫为争胜强练。」',
    verifyEcho: '闻素心颔首：「药香那一段，容素青替你核明了。若要再进一步，盐道的苦井(26,28)水线还没人去看——这趟你若肯去，备好自己的药。修习的事照札记来。」',
    letterCopy: '闻素心取过一页素笺：「那封匿名信庄里也收了风声，与药香相关的一段我抄给你。写信人是谁未明，抄的时候别添名字。」',
    letterOption: '听说庄中在查一封匿名信，能否让我也看一眼？',
    training: '闻素心翻开行功札记：「草木回息篇，等级2、定力10/悟性11，恢复15、耗气6；步云履，等级2、身法11/悟性10，守御9、耗气3；清风拂穴掌，等级4、身法12/定力12，攻击18、耗气6；回阳引气诀，等级7、定力15/悟性15，恢复24、耗气10；露墙穿枝步，等级8、身法16/悟性15，守御16、耗气6。庄中功夫只分攻、养、守：养是疗伤回复生命、要耗内力却不补内力，守只挡得住下一击。没有制住人穴道叫人不能动的手段。」',
    fieldOption: '药香对上了，这一程接下来怎么走？',
    mentorBriefOption: '这趟庄中差事，下一步往哪里去？',
    practiceEchoOption: '苦井水线对过、药也备下了，来回禀。',
    verifyEchoOption: '封蜡药香那一段先前已核明，来回话。',
    trainingOption: '庄中功夫的门槛与用处，请庄主照实说一遍。',
  },
  {
    key: 'hanshan',
    questId: 'quest.r43-hanshan-copybook',
    factionId: 'faction.hanshan-shuyuan',
    mentorCharId: 'char.liu-tinglan',
    mentorDialogueId: 'dlg.liu-tinglan-mentor',
    fieldDialogueId: 'dlg.shen-mohan-bookshop',
    outcomeNodeId: 'event.r43-hanshan-copybook',
    practiceNodeId: 'event.r103-hanshan-practice',
    oldDescription: '五封信里有一封提到旧渡籍曾少抄一列船名。柳听澜不愿把缺字补成猜测，请你向沈墨涵核一核书铺旧抄的墨色和纸龄，再决定那一栏该留白还是补注。',
    firstObjectiveText: '请沈墨涵辨认旧抄的纸龄与墨色',
    experience: 38,
    currency: 24,
    description: '五封信里有一封提到旧渡籍曾少抄一列船名。柳听澜请你先向沈墨涵核一核书铺旧抄的墨色和纸龄，再往北境霜松谷亲眼看一看旧界标——界刻立碑的年头不是纸龄的凭据，回来再定那一栏留白还是补注。',
    objectives: [
      { id: 'objective.r103-hanshan-old-mark-check', kind: 'discoverKnowledge', targetId: 'place.r93-old-mark', requiredCount: 1, text: '到北境霜松谷核看旧界标' },
      { id: 'objective.r103-hanshan-report', kind: 'talkToNpc', targetId: 'char.liu-tinglan', requiredCount: 1, text: '回讲书堂向柳听澜复命' },
    ],
    practiceTitle: '寒山界刻核证',
    practiceSummary: '沈墨涵验过纸墨、霜松谷旧界标核看后回柳听澜复命；寒山书院声望+5，界刻年头不能断纸龄，缺页照旧注缺。',
    fieldBrief: '沈墨涵把旧抄迎着窗光收好：「纸墨的年限我验到头了——纤维与墨色都早于那场争执，再多我验不出。有人往北边寻『旧界刻』对年头，我得提醒一句：界标刻的是立碑的年头，不是纸上落的笔，拿它断纸龄，断不得。旧界标在北境霜松谷西(24,32)：由云岭古道北上(62,2)入雁回崖，再过关(50,2)入照雪关，出关(3,64)便是霜松谷东口(96,50)，界标在谷西。路远天寒，备足伤药。」',
    mentorBrief: '柳听澜铺开一张空白的副页：「三段路：沈掌柜验纸墨、霜松谷看界刻、回来定夺。记住——碑上的年头是碑的，纸上的年头是纸的，两笔账不能混。」',
    practiceEcho: '柳听澜听罢，在副页那一栏旁批了一行小字：「立碑之年与落笔之年，两不相干——这一栏照旧留白，只注缺页。这一趟山跑得值，书院记你一功。武课照武录的门槛来。」',
    verifyEcho: '柳听澜点头：「纸墨那一段，沈掌柜已替你验明，缺的一列只能注缺页。往北霜松谷有旧界标(24,32)，立的年头与纸龄对不上号；若要去看，路远天寒，量力而行。武课照武录来。」',
    letterCopy: '柳听澜从抄档里抽出一页：「那封信书院有抄档，与渡籍相关的一段誊给你。写信人未具名，抄本照抄，不添一笔。」',
    letterOption: '听说书院在查一封匿名信，能否让我也看一眼？',
    training: '柳听澜翻开武录副本：「朱墨点腕笔，等级2、悟性11/身法10，攻击12、耗气3；点津校脉笔，等级4、悟性13/身法12，攻击16、耗气5；锋折批隙手，等级6、悟性15/定力13，攻击20、耗气7；经纶定息篇，等级6、悟性16/定力14，恢复21、耗气9；定理贯脉诀，等级10、悟性19/定力17，恢复27、耗气13。笔路只分攻、养、守三用：攻是伤敌，养是疗伤回复生命、要耗内力却不补内力，守只挡得住下一击。没有封穴制人的手段，别把话本当课业。」',
    fieldOption: '纸墨验到头了，往北还能核什么？',
    mentorBriefOption: '这趟书院差事，下一步往哪里去？',
    practiceEchoOption: '霜松谷的界刻看过了，来回禀。',
    verifyEchoOption: '旧抄纸墨那一段先前已核明，来回话。',
    trainingOption: '书院武课的门槛与用处，请先生照实说一遍。',
  },
  {
    key: 'panzhou',
    questId: 'quest.r43-panzhou-return-tide',
    factionId: 'faction.panzhou-daochang',
    mentorCharId: 'char.zhu-jiuxian',
    mentorDialogueId: 'dlg.zhu-jiuxian-mentor',
    fieldDialogueId: 'dlg.bai-luzhou-ferry-master',
    outcomeNodeId: 'event.r43-panzhou-return-tide',
    practiceNodeId: 'event.r103-panzhou-practice',
    oldDescription: '信上画了三道缆痕，却没有写船名。祝九弦要你将潮时与痕迹交给白鹭洲核对公所旧簿；若只是往来船队留下的磨损，刀场便不必惊动整条水路。',
    firstObjectiveText: '请白鹭洲核对三道缆痕对应的渡船',
    experience: 42,
    currency: 26,
    description: '信上画了三道缆痕，却没有写船名。祝九弦要你先将潮时与痕迹交白鹭洲核对公所旧簿，再击退东溟海岸潮沟趁退潮夺网的夺网客，最后回来复命；若只是往来船队的磨损，刀场便不必惊动整条水路。',
    objectives: [
      { id: 'objective.r103-panzhou-defend-netters', kind: 'defeatEncounter', targetId: 'encounter.r83-tide-wake-looters', requiredCount: 1, text: '击退东溟海岸潮沟的夺网客' },
      { id: 'objective.r103-panzhou-report', kind: 'talkToNpc', targetId: 'char.zhu-jiuxian', requiredCount: 1, text: '回栈桥向祝九弦复命' },
    ],
    practiceTitle: '盘舷潮沟护航',
    practiceSummary: '白鹭洲对清缆痕、击退潮沟夺网客后回祝九弦复命；盘舷刀场声望+5，缆痕系运盐船磨损，水路不必惊动。',
    fieldBrief: '白鹭洲把旧簿翻到缆痕那一页：「三道痕对上了三艘运盐船——账是清了，滩上却有人趁退潮夺网。潮沟在东溟海岸(73,68)：由云岭古道东南(96,50)过关至青帆埠(6,50)，往中段南去便是。那伙人力气不小，窄滩上站稳再出手，别追进水里。」',
    mentorBrief: '祝九弦把缆绳往桩上一套：「三步走：白鹭洲对旧簿、潮沟赶散夺网客、回来复命。船上规矩——先认人，再出手。」',
    practiceEcho: '祝九弦听罢，指节在缆桩上一叩：「夺网客这一趟散了，浮标也重新露了头——缆痕的账、滩上的事，一并了清。这类人退了还来，护船的就再赶一场。刀场记你一功。修习照刀谱的门槛来。」',
    verifyEcho: '祝九弦点点头：「缆痕那段，白鹭洲替你对清了，是运盐船磨的痕，不必封渡。滩上夺网的事还没人管——潮沟(73,68)的事，遇上便是刀场的差事。刀谱都在，按门槛挑。」',
    letterCopy: '祝九弦从缆桩下抽出一张油纸包着的纸：「那封匿名信刀场也在查，与缆痕相关的一段我抄下来了。写信人没露名，抄本上我也不替他落款。」',
    letterOption: '听说刀场在查一封匿名信，能否让我也看一眼？',
    training: '祝九弦把刀谱压平在膝上：「翻桨刀，等级2、体魄11/身法11，攻击14、耗气4；顺汛换步，等级3、身法12/体魄10，守御9、耗气3；截浪回舷刀，等级4、体魄13/身法13，攻击18、耗气6；破白连环刀，等级9、体魄17/身法16，攻击26、耗气11。刀路只分攻、养、守：攻是伤敌，养是疗伤回复生命、要耗内力却不补内力，守只挡得住下一击。窄板上护住同船的人，比一刀劈得响要紧。」',
    fieldOption: '缆痕对清了，滩上的事怎么办？',
    mentorBriefOption: '这趟刀场差事，下一步往哪里去？',
    practiceEchoOption: '潮沟的夺网客赶散了，来回禀。',
    verifyEchoOption: '缆痕潮时那一段先前已核明，来回话。',
    trainingOption: '刀场功夫的门槛与用处，请师父照实说一遍。',
  },
];

// --- JSON block rendering matching the hand-authored data style -------------

const renderInline = value =>
  '{ ' + Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${JSON.stringify(entry)}`).join(', ') + ' }';

/** One member per line; primitive arrays inline; object arrays one entry per line. */
const renderBlock = (value, indent) => {
  const inner = ' '.repeat(indent + 2);
  const lines = Object.entries(value).map(([key, entry]) => {
    if (Array.isArray(entry)) {
      if (entry.length === 0) return `${inner}${JSON.stringify(key)}: []`;
      if (entry.every(item => typeof item !== 'object' || item === null)) {
        return `${inner}${JSON.stringify(key)}: [${entry.map(item => JSON.stringify(item)).join(', ')}]`;
      }
      const items = entry.map(item => typeof item === 'object' && item !== null && !Array.isArray(item)
        ? renderInline(item)
        : JSON.stringify(item));
      return `${inner}${JSON.stringify(key)}: [\n${items.map(item => inner + '  ' + item).join(',\n')}\n${inner}]`;
    }
    if (typeof entry === 'object' && entry !== null) return `${inner}${JSON.stringify(key)}: ${renderInline(entry)}`;
    return `${inner}${JSON.stringify(key)}: ${JSON.stringify(entry)}`;
  });
  return `{\n${lines.join(',\n')}\n${' '.repeat(indent)}}`;
};

const countOccurrences = (text, needle) => text.split(needle).length - 1;
const replaceOnce = (text, from, to, label) => {
  if (countOccurrences(text, from) !== 1) throw new Error(`round103 锚点不唯一或缺席：${label}`);
  return text.replace(from, to);
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Replaces one already-deepened managed block (`{`…`}` at `indent` spaces)
 * that contains `anchor`. Managed blocks were generated by renderBlock, so
 * their braces sit at the exact managed indentation.
 */
const replaceManagedBlock = (text, anchor, replacement, indent, nl, label) => {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`round103 受管块锚点缺席：${label}`);
  const pad = ' '.repeat(indent);
  const openAt = text.lastIndexOf(nl + pad + '{', at);
  const closeAt = text.indexOf(nl + pad + '}', at);
  if (openAt < 0 || closeAt < 0 || closeAt < openAt) throw new Error(`round103 受管块边界异常：${label}`);
  const braceEnd = closeAt + 1 + nl.length + pad.length; // position just after `}`
  return text.slice(0, openAt + 1 + nl.length) + replacement + text.slice(braceEnd);
};

/** Replaces one quest's whole rewards object, keeping formatting outside it. */
const replaceQuestRewards = (text, questId, rewards, nl) => {
  const questStart = text.indexOf(`"id": "${questId}"`);
  if (questStart < 0) throw new Error(`round103 找不到任务 ${questId}`);
  const rewardsKeyAt = text.indexOf('"rewards": {', questStart);
  if (rewardsKeyAt < 0) throw new Error(`round103 任务 ${questId} 缺少 rewards`);
  const closeAt = text.indexOf(nl + '      }', rewardsKeyAt);
  if (closeAt < 0) throw new Error(`round103 任务 ${questId} rewards 闭合异常`);
  const braceEnd = closeAt + 1 + nl.length + '      '.length;
  return text.slice(0, rewardsKeyAt) + '"rewards": ' + renderBlock(rewards, 6).replace(/\n/g, nl) + text.slice(braceEnd);
};

// --- Text-level quest patch (keeps unrelated formatting byte-for-byte) ------
// First run deepens; re-runs reconcile the managed description, appended
// objectives and reward fields against the config so a changed lib never
// leaves the shipped JSON silently out of sync. Original pay and unrelated
// bytes stay data-owned.

export function patchFactionPracticeQuests(text) {
  let patched = text;
  const nl = patched.includes('\r\n') ? '\r\n' : '\n';
  const current = JSON.parse(patched);
  for (const config of factionPracticeConfigs) {
    const questStart = patched.indexOf(`"id": "${config.questId}"`);
    if (questStart < 0) throw new Error(`round103 找不到任务 ${config.questId}`);
    const existing = current.quests.find(quest => quest.id === config.questId);

    if (!existing?.orderedObjectives) {
      patched = replaceOnce(patched, config.oldDescription, config.description, `${config.questId} 描述`);

      // From this quest's unique id, the next letter-gate line is this quest's own.
      const letterLine = '"requiredKnowledgeNodeId": "event.r43-wayfarer-letter",';
      const letterAt = patched.indexOf(letterLine, questStart);
      if (letterAt < 0) throw new Error(`round103 任务 ${config.questId} 的信件门槛锚点异常`);
      const orderedAt = letterAt + letterLine.length;
      patched = patched.slice(0, orderedAt) + `${nl}      "orderedObjectives": true,` + patched.slice(orderedAt);

      const rewards = {
        experience: config.experience,
        currency: config.currency,
        factionRenown: [{ factionId: config.factionId, delta: 5 }],
        discoverKnowledgeNodeIds: [config.practiceNodeId, config.outcomeNodeId],
      };
      const objectiveBlocks = config.objectives
        .map(objective => '        ' + renderBlock(objective, 8).replace(/\n/g, nl))
        .join(',' + nl);
      const anchor = `"${config.firstObjectiveText}"${nl}        }${nl}      ],${nl}      "rewards": { "experience": ${config.experience}, "currency": ${config.currency} }`;
      const replacement = `"${config.firstObjectiveText}"${nl}        },${nl}${objectiveBlocks}${nl}      ],${nl}      "rewards": ${renderBlock(rewards, 6).replace(/\n/g, nl)}`;
      patched = replaceOnce(patched, anchor, replacement, `${config.questId} 目标与奖励`);
      continue;
    }

    // Already deepened: reconcile managed description, objectives and rewards.
    if (existing.description !== config.description) {
      patched = replaceOnce(patched, JSON.stringify(existing.description), JSON.stringify(config.description),
        `${config.questId} 描述同步`);
    }
    for (const objective of config.objectives) {
      const shipped = existing.objectives.find(entry => entry.id === objective.id);
      if (shipped && !sameJson(shipped, objective)) {
        patched = replaceManagedBlock(patched, `"id": "${objective.id}"`,
          renderBlock(objective, 8).replace(/\n/g, nl), 8, nl, `${config.questId} 目标 ${objective.id}`);
      } else if (!shipped) {
        throw new Error(`round103 任务 ${config.questId} 已深但缺少受管目标 ${objective.id}，请从干净基准重跑`);
      }
    }
    const managedRenown = [{ factionId: config.factionId, delta: 5 }];
    const managedInsights = [config.practiceNodeId, config.outcomeNodeId];
    if (!sameJson(existing.rewards.factionRenown, managedRenown) ||
        !sameJson(existing.rewards.discoverKnowledgeNodeIds, managedInsights)) {
      patched = replaceQuestRewards(patched, config.questId, {
        experience: existing.rewards.experience,
        currency: existing.rewards.currency,
        factionRenown: managedRenown,
        discoverKnowledgeNodeIds: managedInsights,
      }, nl);
    }
  }
  return patched;
}

// --- Text-level dialogue patch ----------------------------------------------

// One dialogue can carry two roles (dlg.liu-tinglan-mentor is the hanshan
// mentor *and* the tingyu verifier), so insertion is driven per config×role
// rather than per dialogue id.
export function patchFactionPracticeDialogues(text) {
  let patched = text;
  const nl = patched.includes('\r\n') ? '\r\n' : '\n';
  for (const config of factionPracticeConfigs) {
    const targets = [
      {
        dialogueId: config.mentorDialogueId,
        marker: `r103-${config.key}-next`,
        entries: [
          { id: `r103-${config.key}-next`, text: config.mentorBrief, option: { text: config.mentorBriefOption, nextNodeId: `r103-${config.key}-next`, conditions: [member(config.factionId), active(config.questId)] } },
          { id: `r103-${config.key}-echo`, text: config.practiceEcho, option: { text: config.practiceEchoOption, nextNodeId: `r103-${config.key}-echo`, conditions: [done(config.questId), known(config.practiceNodeId)] } },
          { id: `r103-${config.key}-verify`, text: config.verifyEcho, option: { text: config.verifyEchoOption, nextNodeId: `r103-${config.key}-verify`, conditions: [done(config.questId), known(config.practiceNodeId, false)] } },
          { id: `r103-${config.key}-letter`, text: config.letterCopy, option: { text: config.letterOption, nextNodeId: `r103-${config.key}-letter`, conditions: [member(config.factionId), known(wayfarerLetterNodeId, false)], effects: [discover(wayfarerLetterNodeId)] } },
          { id: `r103-${config.key}-training`, text: config.training, option: { text: config.trainingOption, nextNodeId: `r103-${config.key}-training`, conditions: [member(config.factionId)] } },
        ],
      },
      {
        dialogueId: config.fieldDialogueId,
        marker: `r103-${config.key}-field-brief`,
        entries: [
          { id: `r103-${config.key}-field-brief`, text: config.fieldBrief, option: { text: config.fieldOption, nextNodeId: `r103-${config.key}-field-brief`, conditions: [active(config.questId)] } },
        ],
      },
    ];
    for (const target of targets) {
      const dialogueStart = patched.indexOf(`"id": "${target.dialogueId}"`);
      if (dialogueStart < 0) continue; // this dialogue lives in the other file
      const dialogueEnd = patched.indexOf(`${nl}    },${nl}    {`, dialogueStart);
      const window = patched.slice(dialogueStart, dialogueEnd < 0 ? undefined : dialogueEnd);
      const current = JSON.parse(patched);
      const conversation = current.conversations.find(entry => entry.id === target.dialogueId);

      if (window.includes(target.marker)) {
        // Role already deepened: reconcile managed nodes and greet options so
        // a changed lib never leaves the shipped dialogue silently stale.
        for (const entry of target.entries) {
          const node = conversation?.nodes.find(candidate => candidate.id === entry.id);
          if (node && node.text !== entry.text) {
            patched = replaceManagedBlock(patched, `"id": "${entry.id}"`,
              renderBlock({ id: entry.id, text: entry.text }, 8).replace(/\n/g, nl), 8, nl,
              `${target.dialogueId} 节点 ${entry.id}`);
          }
          const greet = conversation?.nodes.find(candidate => candidate.id === 'greet');
          const option = greet?.options.find(candidate => candidate.nextNodeId === entry.id);
          if (option && !sameJson(option, entry.option)) {
            patched = replaceManagedBlock(patched, `"nextNodeId": "${entry.id}"`,
              renderBlock(entry.option, 12).replace(/\n/g, nl), 12, nl,
              `${target.dialogueId} 选项 ${entry.id}`);
          }
        }
        continue;
      }

      // 1) Insert the new options before the last existing greet option (the
      //    farewell-style tail stays last, matching the r102 authoring habit).
      //    The options array closes at the first ten-space `]` after greet;
      //    nested condition/effect arrays sit at deeper indentation.
      const greetAt = patched.indexOf('"id": "greet"', dialogueStart);
      if (greetAt < 0 || greetAt > (dialogueEnd < 0 ? patched.length : dialogueEnd)) {
        throw new Error(`round103 对话 ${target.dialogueId} 缺少 greet 节点`);
      }
      const greetOptionsClose = patched.indexOf(nl + '          ]', greetAt);
      if (greetOptionsClose < 0) throw new Error(`round103 对话 ${target.dialogueId} 缺少 greet options 闭合`);
      const lastOptionStart = patched.lastIndexOf(nl + '            {', greetOptionsClose);
      if (lastOptionStart < 0) throw new Error(`round103 对话 ${target.dialogueId} 缺少 greet 选项`);
      const optionsText = target.entries.map(entry => '            ' + renderBlock(entry.option, 12).replace(/\n/g, nl)).join(',' + nl);
      const optionInsertAt = lastOptionStart + nl.length;
      patched = patched.slice(0, optionInsertAt) + optionsText + ',' + nl + patched.slice(optionInsertAt);

      // 2) Prepend the new nodes right after "nodes": [ — declaration order is
      //    irrelevant because startNodeId drives the dialogue entry point.
      const nodesOpen = patched.indexOf('"nodes": [' + nl, patched.indexOf(`"id": "${target.dialogueId}"`));
      if (nodesOpen < 0) throw new Error(`round103 对话 ${target.dialogueId} 缺少 nodes 数组`);
      const insertAt = nodesOpen + ('"nodes": [' + nl).length;
      const nodesText = target.entries.map(entry => '        ' + renderBlock({ id: entry.id, text: entry.text }, 8).replace(/\n/g, nl)).join(',' + nl) + ',' + nl;
      patched = patched.slice(0, insertAt) + nodesText + patched.slice(insertAt);
    }
  }
  return patched;
}

// --- Knowledge-graph additions (machine-shaped files, structural upsert) -----

/** Five one-shot practice-insight nodes; quest completion is their only source. */
export const factionPracticeKnowledgeNodes = factionPracticeConfigs.map(config => ({
  id: config.practiceNodeId,
  kind: 'event',
  title: config.practiceTitle,
  summary: config.practiceSummary,
  knownByDefault: false,
}));

/** Static mentor→practice-insight edges; static relations never replace runtime discovery. */
export const factionPracticeKnowledgeEdges = factionPracticeConfigs.map(config => ({
  id: `kg.edge.r103-${config.key}-practice`,
  fromId: config.mentorCharId,
  toId: config.practiceNodeId,
  relation: 'knows',
  summary: '师傅复命时记档此事；静态关系不替代运行时见闻。',
}));

const upsert = (list, value) => {
  const index = list.findIndex(entry => entry.id === value.id);
  if (index < 0) list.push(value); else list[index] = value;
};

/** Upserts the five practice nodes/edges and re-words the wayfarer-letter summary (two attested sources). */
export function deepenFactionPracticeKnowledge(nodes, edges) {
  for (const node of factionPracticeKnowledgeNodes) upsert(nodes.nodes, node);
  for (const edge of factionPracticeKnowledgeEdges) upsert(edges.edges, edge);
  const letter = nodes.nodes.find(node => node.id === wayfarerLetterNodeId);
  if (letter && letter.summary === oldWayfarerLetterSummary) letter.summary = wayfarerLetterSummary;
  else if (letter && letter.summary !== wayfarerLetterSummary) {
    throw new Error('round103 信件节点摘要与预期不符，拒绝覆盖');
  }
  return { nodes, edges };
}
