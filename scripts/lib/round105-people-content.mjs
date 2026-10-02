import { addWeatherPatrol } from './round141-weather-dialogue.mjs';
import { addDialogueDrill } from './round148-dialogue-drill.mjs';
import { addRelayFollowups } from './round136-relay-followups.mjs';
const known = (nodeId, isKnown = true) => ({ kind: 'knowledgeKnown', nodeId, ...(isKnown ? {} : { isKnown: false }) });
const quest = (questId, status) => ({ kind: 'questStatus', questId, status });
const discover = nodeId => ({ kind: 'discoverKnowledgeNode', nodeId });
const share = nodeId => ({ kind: 'shareKnowledgeNode', nodeId });
export const people = [
  { npcId: 'char.gu-yechen', dialogueId: 'dlg.gu-yechen-roadside', file: 'round-03-conversations.json', questId: 'quest.r58-pond-bandit-camp',
    before: '顾夜尘抹了抹刀背：「塘边断道的事，光有拳脚不够。我担心的是挑担的人再没第二条路。你没接差事前先查补给，别把逞强当护送。」',
    active: '顾夜尘望着塘路：「正查这一趟，就把假护送和真路客分开。交手前包里留药，赢一场也不等于一路永远太平；我肯同行，是帮人过路，不是替人发号施令。」',
    after: '顾夜尘把刀收了半寸：「断道那一场我记得。以后到了北境或海路，你的公开、保人和传号决定都当面告诉我；没听过的事我不会替你下判断。同行时按P再T也能谈。」' },
  { npcId: 'char.qin-suyan', dialogueId: 'dlg.qin-suyan-iron-ridge', file: 'round-62-conversations.json', questId: 'quest.r62-post-ledger',
    before: '秦素砚压住簿角：「我抄更次，也要让报信的人明日还敢出门。先核更簿，不急着把姓名写满纸；路客要证词，人也要避处，这两件事会相互牵扯。」',
    active: '秦素砚把笔尖悬在纸上：「核更次这一趟，邵长庚的当值与你见过的路标都要分别记。证人没说的不要替他补。我还在等你核对，署名与保护的事得等证据齐。」',
    after: '秦素砚合上更簿：「这一页核过了。公开署名便于查牌，也会把人推到争执前；隐名让人继续走路，却留下证词缺口。定过立场后，把我这层顾虑转述给北台聂栖雁，让她按自己的雁候记录判断。」' },
  { npcId: 'char.r74-shen-yuji', dialogueId: 'dlg.r74-shen-yuji-cloud-ridge', file: 'round-74-cloud-ridge-conversations.json', questId: 'quest.r74-cloud-marks',
    before: '沈雨霁按着石阶旁的旧索：「我守的不是一个神秘答案，是后人还能看清的记法。先看云阶刻痕，分清索孔与步记；不能因一句剑鸣传闻就把所有刻纹串成暗码。」',
    active: '沈雨霁把两道刻纹分开指给你：「正在核云阶，先写所见再写解释。旧索孔有旧索孔的用处，山路步记有山路步记的用处；别替尚未去过的北境下年代结论。」',
    after: '沈雨霁收好记簿：「云阶这一处已有着落。三地对照后若去霜松谷，把索孔与步记各自成立的判断告诉柳寻径；前朝界标仍须当地核证，山中记录不能替它作证。」' },
  { npcId: 'char.r91-nie-qiyan', dialogueId: 'dlg.r91-nie-qiyan-vigil', file: 'round-91-cloud-north-terrace-conversations.json', questId: 'quest.r91-goose-vigil',
    before: '聂栖雁隔着风数雁：「候雁的人最怕把愿望看成信号。崖台这一趟先看火与雁各自的记法，没核雪关前不拿雁阵补成一段暗号。」',
    active: '聂栖雁往雪关指了指：「你在查雁候，雁来去只说明雁来去；火号真假仍要问谷照雪。路上若有人谈更簿，我想知道证词是否让所有路客都能查，而不是只听一个漂亮结论。」',
    after: '聂栖雁把记录压进石缝：「雁候核过，这不替番号公开或限定作决定。若从铁嶂带来秦素砚的顾虑，就亲口转述给我；少了署名的证词，我会另留问号，不会装作人人都已明白。」' },
  { npcId: 'char.r92-gu-zhaoxue', dialogueId: 'dlg.r92-gu-zhaoxue-vigil', file: 'round-92-north-pass-conversations.json', questId: 'quest.r92-snow-beacon',
    before: '谷照雪拍掉号台积雪：「这里当值的人要让三烽传得准，也要防冒号的人学得快。先查烽记，再谈怎样传给别人；清心丸与回春膏带够，雪里没有替你生出来的补给。」',
    active: '谷照雪把号册挡在风里：「你正查传烽，核号、应对冒号客、回关报告各走一步。人愿不愿公开号码有各自代价，不要在事情还没核完时替北台答应。」',
    after: '谷照雪给号册扣上木夹：「现行火号这一处已核清。公开让路客便于识火，也让我多防假号；限定便于报码队查验，却让散客多等。哪一面是你亲自定的，原样告诉同行者，别只报好处。」' },
  { npcId: 'char.r93-liu-xunjing', dialogueId: 'dlg.r93-liu-xunjing-rounds', file: 'round-93-snow-pine-valley-conversations.json', questId: 'quest.r93-boundary-mark',
    before: '柳寻径抚去界标上的霜：「前朝的刻字留在当朝的路上，最容易被人拿来生新账。先查界标年代，我要护的是今天巡路的人，不是把旧字当今天的疆令。」',
    active: '柳寻径沿林边走了两步：「你正在核界标，旧刻、清场、回来说明得分开。刻过大梁两字不等于今日还属大梁；年代没说清，公开与私记都可能误伤人。」',
    after: '柳寻径把界标记下：「前朝屯界与当朝巡路分清了。公开注记让人能查，也引旧账争执；留在巡簿保护眼下的人，却不便外人核看。若沈雨霁谈山中刻痕，带来我再分项记，不能拿一处替另一处断代。」' },
  { npcId: 'char.r97-ji-wuchao', dialogueId: 'dlg.r97-ji-wuchao', file: 'round-97-lanxin-reef-conversations.json', questId: 'quest.r97-tide-ledger',
    before: '季无潮按住潮簿：「我想让散船也认得潮，虞星槎先要让灯号少被冒用。先把澜心潮痕核准；好心把错号传得更远，同样会误人。」',
    active: '季无潮翻开还空着的簿页：「这一趟还在查潮簿，潮痕到手、回来说明才是下一步。熟船和散船各有难处，尚未核灯谱前不要替我们保证一条永远畅通的航道。」',
    after: '季无潮把簿页夹稳：「澜心这一页已核。传示潮时的范围定过后，若顾夜尘有同行护人的话，你当面带来；我想知道岸上护路与海上护船怎样相通，但不会替没听过的话作答。」' },
  { npcId: 'char.r85-cen-yinjiao', dialogueId: 'dlg.r85-cen-yinjiao-reef', file: 'round-85-tide-isle-conversations.json', questId: 'quest.r85-low-tide-channel',
    before: '岑隐礁眯眼看退潮的沙脊：「守礁的人吃亏在无人在岸上看见。低潮礁道先查实，不要把守灯与照顾渔户说成互不相干；东西却只有一份，援谁都得承认另一边没拿到。」',
    active: '岑隐礁指向沙脊：「你在查低潮礁道，潮位、归途与夺货客都要分开看。盐风伤膏是渔户要用，回春膏是守灯人要用；我能说急处，不能替你从空包里变出药。」',
    after: '岑隐礁望着远灯：「礁道这一趟核过了，灯与人仍得有人照看。你既决定补给给哪边，就把未顾到的一边也说清；季无潮讨论传航时，别把药的取舍说成只要好心便两头都能满足。」' },
];
export const relays = [
  { key: 'ledger', sourceNpcId: 'char.qin-suyan', targetNpcId: 'char.r91-nie-qiyan', sourceDialogueId: 'dlg.qin-suyan-iron-ridge', targetDialogueId: 'dlg.r91-nie-qiyan-vigil',
    sourceQuestId: 'quest.r62-post-ledger', targetQuestId: 'quest.r91-goose-vigil', sourceGate: 'event.r100-record-settled',
    title: '更簿证词转述', sourceText: '秦素砚把笔搁下：「给聂栖雁转述：证词便于路客核查，报信人也要避处。你定过署名或隐名，原样说明，不替她先答。这是口头转述，不另给你一封实体信。」',
    variants: [
      { flag: 'event.r100-record-open', delta: 2, text: '聂栖雁听完：「秦素砚怕人受累，我怕路客无从查牌。你确实公开了署名，我按有证可查记下，但不替报信人承诺无风险。」' },
      { flag: 'event.r100-record-guard', delta: -1, text: '聂栖雁听完：「保护姓名的顾虑我记下了，可没有公开证人，路客仍要再问。我不会把照顾人说成证词已经齐全；往后核验还留一道问号。」' },
    ] },
  { key: 'carving', sourceNpcId: 'char.r74-shen-yuji', targetNpcId: 'char.r93-liu-xunjing', sourceDialogueId: 'dlg.r74-shen-yuji-cloud-ridge', targetDialogueId: 'dlg.r93-liu-xunjing-rounds',
    sourceQuestId: 'quest.r74-cloud-marks', targetQuestId: 'quest.r93-boundary-mark', sourceGate: 'event.r100-paper-crosscheck',
    title: '云阶界刻转述', sourceText: '沈雨霁交代：「给柳寻径转述：云阶刻纹是旧索与步记的记法，各自成立。界标年代须他在霜松谷亲核；不能拿云阶的结论给前朝字样背书。不送拓片，只转述判断边界。」',
    variants: [
      { flag: 'event.r101-mark-public', delta: 2, text: '柳寻径点头：「沈雨霁分开证据，我就能把前朝说明公开而不混成今朝疆令。你公开注记的选择与这份分项说明我都记下；巡路人的争执不会因此凭空消失。」' },
      { flag: 'event.r101-mark-private', delta: 1, text: '柳寻径合上巡簿：「这份分项判断适合与我保留的巡路记录并记。你选择私记，我先护巡路人；外人仍不能像查公开碑解那样方便核看，这个代价也留在案里。」' },
    ] },
  { key: 'road-sea', sourceNpcId: 'char.gu-yechen', targetNpcId: 'char.r97-ji-wuchao', sourceDialogueId: 'dlg.gu-yechen-roadside', targetDialogueId: 'dlg.r97-ji-wuchao',
    sourceGate: 'event.r100-record-settled', targetQuestId: 'quest.r97-tide-ledger', sourceSharedAny: ['event.r100-record-open', 'event.r100-record-guard'],
    title: '同行护航转述', sourceText: '顾夜尘把刀柄递正：「给季无潮转述：护路不是让自己的熟人都顺当就完事，也得承認暂时照顾不到谁。你告诉过我的更簿选择我听了；到了澜心洲，由你亲口说明，别说我已替海路作了决定。」',
    variants: [
      { flag: 'event.r102-pilot-public', delta: 2, text: '季无潮听完：「顾夜尘把护路说到熟人圈外，这和你公开传示潮时的取舍相通。我记下这番话，也记下辨假号的负担仍在虞星槎那里，没替他免去。」' },
      { flag: 'event.r102-pilot-crew', delta: -1, text: '季无潮皱眉：「顾夜尘提醒别只顾熟人，你却把潮时限定在熟船。辨号固然容易，散船仍要等。我记下话与选择的这层张力，不把未得照顾的人说成已经安置。」' },
    ] },
];
export const relayWaitingDirections = {
  ledger: '话已由你记下。接收人是雁回崖的聂栖雁：从铁嶂北道经北口入云岭，再沿云岭北口到雁回崖，寻找巡雁记录人。她的雁候差事办完后，仍须由你亲口说明已定的公开署名或保护姓名取舍；我不会替她说已经听见。',
  carving: '话已由你记下。接收人是霜松谷的柳寻径：从云岭北口经雁回崖、照雪关，再由照雪关西口入霜松谷，寻找巡路人。界标年代差事办完后，还须在柳寻径处定过公开注记或留在私记的取舍；若尚未决定，先问他怎样保存界标说明，再亲口转述。云阶刻纹不能替谷中界标年代作证；我不会替他说已经听见。',
  'road-sea': '话已由你记下。接收人是澜心洲的季无潮：已探索青帆埠可在雾雨渡口渡籍班船赴青帆，未探索时从云岭东口先走陆路。青帆东南涉潮登岛到风回岛，再经东渡澜心洲到季的潮簿记录处；澜心潮簿查完后，还须定过公开传示潮时或只向熟船传示的范围；若尚未决定，先向季无潮询问传示范围，再亲口转述。途中关口、班船和走格各有时间代价；他回应前仍是待送。',
};
export const sharingChoices = [
  ['event.r100-record-open', '把更簿公开署名的决定告诉你。', '顾夜尘听完：「查牌便于路客，报信人却要避处。这条路上若同行，我先帮你正面应对；别把公开的好处说成人人都没有风险。」'],
  ['event.r100-record-guard', '把更簿保护姓名的决定告诉你。', '顾夜尘听完：「人还能走路，证词却留缺口。这一带若同行，我把援护更多留作照顾伤者；承认代价，比替所有人编一个满意结局强。」'],
  ['event.r101-code-open', '把北境公开番号的决定告诉你。', '顾夜尘听完：「路客便于识火，冒号客也便于学。北境若同行，我替你正面应对，不能替谷照雪免去辨假号的担子。」'],
  ['event.r101-code-limited', '把北境限定报码的决定告诉你。', '顾夜尘听完：「报码队容易查验，散客多等。北境若同行，我先照顾挨冻受伤的人，但援护不能把等待的代价抹掉。」'],
  ['event.r102-pilot-public', '把海路公开传示潮时的决定告诉你。', '顾夜尘听完：「散船能查潮时，辨假号的人更累。海路若同行，我正面帮你护路；不是替季无潮保证所有船都能安稳过去。」'],
  ['event.r102-pilot-crew', '把海路仅熟船传示潮时的决定告诉你。', '顾夜尘听完：「少些错号，却把散船留在等候处。海路若同行，我多照顾受伤的人；这一招不会把未被传示的潮时变成人人都知道。」'],
];
const mainland = ['map.round-01-grid', 'map.round-10-mist-ferry', 'map.round-62-iron-ridge', 'map.round-67-salt-road', 'map.round-74-cloud-ridge'];
const north = ['map.round-91-cloud-north-terrace', 'map.round-92-north-pass', 'map.round-93-snow-pine-valley'];
// The coastal map was introduced in R82, not R83.
const sea = ['map.round-82-east-coast', 'map.round-84-windward-isle', 'map.round-85-tide-isle', 'map.round-97-lanxin-isle', 'map.round-97-pilot-reef'];
export const stanceRules = [
  ['main-open', mainland, 'event.r100-record-open', '正面护路', '你已转述公开署名；在大陆五处正面援护，报信风险仍在。', 'attack', 9],
  ['main-guard', mainland, 'event.r100-record-guard', '顾人护路', '你已转述保护姓名；在大陆五处改为疗伤援护，不补内力。', 'heal', 7],
  ['north-open', north, 'event.r101-code-open', '迎风应对', '你已转述公开番号；在北境三处正面援护，不保证号码不会被冒用。', 'attack', 9],
  ['north-limited', north, 'event.r101-code-limited', '护住伤者', '你已转述限定报码；在北境三处疗伤援护，散客等待仍在。', 'heal', 7],
  ['sea-public', sea, 'event.r102-pilot-public', '护散船路', '你已转述公开潮时；在五处代表海路正面援护，辨假号负担仍在。', 'attack', 9],
  ['sea-crew', sea, 'event.r102-pilot-crew', '照看同行', '你已转述熟船传示；在五处代表海路疗伤援护，不替未传示者作答。', 'heal', 7],
].map(([key, mapResourceIds, flag, label, description, kind, power]) => ({ id: `stance.r105-${key}`, label, description,
  mapResourceIds, requiredSharedKnowledgeNodeIds: [flag], combatSupport: { kind, power, everyPlayerActions: 2 } }));

function upsert(conversation, id, text, optionText, conditions, effects = []) {
  const node = { id, text };
  const index = conversation.nodes.findIndex(n => n.id === id);
  if (index < 0) conversation.nodes.push(node); else conversation.nodes[index] = node;
  const greet = conversation.nodes.find(n => n.id === conversation.startNodeId);
  if (!greet?.options) throw new Error(`缺少人物入口 ${conversation.id}`);
  const option = { text: optionText, nextNodeId: id, conditions, ...(effects.length ? { effects } : {}) };
  const oi = greet.options.findIndex(o => o.nextNodeId === id && JSON.stringify(o.conditions?.find(c => c.kind === 'questStatus')) === JSON.stringify(conditions.find(c => c.kind === 'questStatus')));
  if (oi < 0) greet.options.splice(Math.max(0, greet.options.length - 1), 0, option); else greet.options[oi] = option;
}
export function deepenPeopleConversation(conversation) {
  const person = people.find(p => p.dialogueId === conversation.id);
  if (!person) return conversation;
  for (const status of ['locked', 'offered', 'active', 'completed']) {
    const key = status === 'locked' || status === 'offered' ? 'before' : status === 'active' ? 'active' : 'after';
    upsert(conversation, `r105-${key}`, person[key], '这件差事对你意味着什么？', [quest(person.questId, status)]);
  }
  if (person.npcId === 'char.gu-yechen') {
    for (const [index, [flag, option, text]] of sharingChoices.entries()) upsert(conversation, `r105-shared-${index}`, text, option, [known(flag)], [share(flag)]);
  }
  for (const relay of relays) {
    const message = `event.r105-${relay.key}-message`, delivered = `event.r105-${relay.key}-delivered`;
    if (relay.sourceDialogueId === conversation.id) {
      const base = [known(relay.sourceGate), known(message, false), ...(relay.sourceQuestId ? [quest(relay.sourceQuestId, 'completed')] : [])];
      if (relay.sourceSharedAny) {
        for (const [index, flag] of relay.sourceSharedAny.entries()) upsert(conversation, `r105-${relay.key}-source-${index}`, relay.sourceText,
          '把这番护路顾虑转述给季无潮，可以吗？', [...base, { kind: 'npcKnows', nodeId: flag }], [discover(message)]);
      } else upsert(conversation, `r105-${relay.key}-source`, relay.sourceText, '能把你的判断转述给另一处的记录人吗？', base, [discover(message)]);
      upsert(conversation, `r105-${relay.key}-waiting`, relayWaitingDirections[relay.key], '那番转述现在怎样了？', [known(message), known(delivered, false)]);
      upsert(conversation, `r105-${relay.key}-closed`, '你已经亲口转述并得到回应。这一回关系后果已经记过，不能重复领认同；原判断和对方的取舍仍各自成立。', '对方听过后，这层关系怎样看？', [known(delivered)]);
    }
    if (relay.targetDialogueId === conversation.id) {
      for (const [index, variant] of relay.variants.entries()) upsert(conversation, `r105-${relay.key}-receive-${index}`, variant.text,
        `转述另一处的判断（关系${variant.delta >= 0 ? '+' : ''}${variant.delta}，仅一次）。`,
        [known(message), known(delivered, false), quest(relay.targetQuestId, 'completed'), known(variant.flag)],
        [share(message), share(variant.flag), { kind: 'adjustRelationship', delta: variant.delta }, discover(delivered)]);
      upsert(conversation, `r105-${relay.key}-received`, '这番转述和你说明的取舍已记下。关系后果不会重付；若查原处事实，仍应回原处核对，不拿口头转述替代实地记录。', '此前转述还记得吗？', [known(delivered), { kind: 'npcKnows', nodeId: message }]);
    }
  }
  return addDialogueDrill(addWeatherPatrol(addRelayFollowups(conversation, relays)));
}
export const knowledgeNodes = relays.flatMap(relay => [
  { id: `event.r105-${relay.key}-message`, kind: 'event', title: `${relay.title}待送达`, summary: relay.sourceText, knownByDefault: false, progress: { completedByNodeId: `event.r105-${relay.key}-delivered`, pendingLabel: '待亲口说明', completedLabel: '已亲口说明' } },
  { id: `event.r105-${relay.key}-delivered`, kind: 'event', title: `${relay.title}已说明`, summary: '玩家亲口向另一地区人物说明，NPC记忆和单次关系后果保存；不生成实体信件，不替代实地调查。', knownByDefault: false },
]);
export const knowledgeEdges = relays.flatMap(relay => [
  { id: `kg.edge.r105-${relay.key}-people`, fromId: relay.sourceNpcId, toId: relay.targetNpcId, relation: 'influences', summary: '通过玩家亲口转述产生后续判断；静态关系不代表已经送达。' },
  { id: `kg.edge.r105-${relay.key}-source`, fromId: relay.sourceNpcId, toId: `event.r105-${relay.key}-message`, relation: 'knows', summary: '来源判断，不代表接收人已听见。' },
  { id: `kg.edge.r105-${relay.key}-target`, fromId: relay.targetNpcId, toId: `event.r105-${relay.key}-delivered`, relation: 'knows', summary: '接收回应，运行时仍须实际分享。' },
]);

export function deepenPeopleDialogues(set) { for (const conversation of set.conversations) deepenPeopleConversation(conversation); return set; }
