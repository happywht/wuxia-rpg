const known = (nodeId, hint) => ({kind:'knowledgeKnown',nodeId,hint});
const closes = [
  known('event.r100-mainland-close','到沈雨霁处结清大陆三地调查与两处决定'),
  known('event.r101-north-close','到沈问秋处结清北境四地调查与两处决定'),
  known('event.r102-sea-close','到虞星槎处结清海路六差事与两处决定'),
];
export const chapterAftermath = [
  {id:'mainland',title:'大陆：更簿与井药',close:closes[0],fallbackText:'大陆调查与两处决定尚未结案，本页不替报信人或驿井补写一个已完成的答案。残篇作者与纸龄仍无定论。',
    first:[
      ['event.r100-record-open','更簿公开了署名，过路人得以核牌，秦素砚所护的报信人却承受了避处的负担。'],
      ['event.r100-record-guard','更簿保留了无名证词，你另留回春膏供报信人避路救急，报信人较能安行，过路人核牌仍留一处待询缺口。'],
    ],second:[
      ['event.r100-well-aid','你交出的回春膏留在驿井，伤者先得到照应，你自己的药囊少了一份。'],
      ['event.r100-well-reserve','你保留了自用药，驿井伤者仍待后批补给，罗金子的不满没有因结案消失。'],
    ],answer:'井壁记水、更簿记班、索孔记工；三类刻记不能合成残篇密钥。'},
  {id:'north',title:'北境：今烽与旧界',close:closes[1],fallbackText:'北境调查与两处决定尚未结案，照雪号码和霜松旧刻的处理仍须本人核妥。本页不把前朝碑刻充作当朝界令。',
    first:[
      ['event.r101-code-open','你付清心丸公开了今烽番号，散客辨火较方便，谷照雪仍须防范照抄号码的冒号客。'],
      ['event.r101-code-limited','你付回春膏限定报码队传号，队内校验较快，雪夜散客仍承担等候询号的寒意。'],
    ],second:[
      ['event.r101-mark-public','你另付清心丸公开前朝注记，旧路可查，柳寻径却多承受了一份巡路争执。'],
      ['event.r101-mark-private','你另付回春膏只留内部旧刻记录，巡路人较安静，沈问秋和外来路客却不易查到旧路。'],
    ],answer:'雁候记活物、今烽报当下、谷刻记前朝屯界，旧驿线另有来路；这些不能替残篇断年。'},
  {id:'sea',title:'海路：急药与传航',close:closes[2],fallbackText:'海路六差事与两处决定尚未结案，本页不把灯已点亮写成所有散船都已获助，也不推定残篇的作者。',
    first:[
      ['event.r102-shore-aid','海盐敷膏留给岸上救伤，顾潮生先照应归船伤者，岑隐礁的礁上急药仍未补齐。'],
      ['event.r102-keeper-aid','回春膏留给守礁急用，岑隐礁有药应急，岸上伤者却还要等待下一批。'],
    ],second:[
      ['event.r102-pilot-public','两片贝壳作公开辨潮样记，散船多了可查的潮时，虞星槎仍承担辨假号的余担。'],
      ['event.r102-pilot-crew','清心丸留给熟船值守，队内认船较快，陌生散船夜航仍要停下来核簿。'],
    ],answer:'回湾线、风灯向、水则、潮痕、灯谱用途各异；海路给出阶段答案，不替残篇认作者或纸龄。'},
];
const route = (id,title,epilogue,extra=[]) => ({id,title,epilogue,conditions:[...closes.map(c=>({...c})),...extra]});
export const endingChapterRoutes = [
  {id:'ending.r42-open-register',route:route('r108-open','三章公开记录',
    '你把大陆更簿、北境今烽与海路潮记分栏相对，公开范围的三次取舍留下可查的记录，也留下需要保护与辨假的人。公簿没有给残篇写上一个未经证明的作者；它给后来人保留了继续问证的入口。',[
      known('event.r100-record-open','大陆更簿选择公开署名；若已保护姓名的本次旅程请走其他归处'),
      known('event.r101-code-open','北境选择公开番号；若已限定报码的本次旅程请走其他归处'),
      known('event.r102-pilot-public','海路选择公开传示潮时；若已限定熟船的本次旅程请走其他归处'),
    ]),frame:'留在可查记录中的代价，也须与获益一同公开。'},
  {id:'ending.r42-sheltered-witness',route:route('r108-shelter','三章有限传证',
    '你把三章记录留在能校验的人手里，没有让更簿姓名、今烽番号与潮时一同散向所有过路人。灯下留住凭据，也留下外来人不易追问的空白。保护可以是一条路，但不能把未得到便利的人从尾声里删去。',[
      known('event.r100-record-guard','大陆更簿选择保护姓名；若已公开署名的本次旅程请走其他归处'),
      known('event.r101-code-limited','北境选择限定报码；若已公开号码的本次旅程请走其他归处'),
      known('event.r102-pilot-crew','海路选择熟船传示潮时；若已公开传示的本次旅程请走其他归处'),
    ]),frame:'你护住的人与仍待询的人，都在这份有限传证的账上。'},
  {id:'ending.open-water',route:route('r108-voyage','三章自由行路',
    '你把三章记录带回照心石前，仍未把自己的去处交给门墙。公开与有限传证可以混合，急药也没有一份够用的完美分法。轻舟载着已经核清的用途和仍未解的残篇来路，下一程不再替过去编出无代价的答案。',[
      {kind:'factionMembership',isMember:false,hint:'保持无门无派，或先行离门'},
    ]),frame:'再启行前，你承认这份取舍仍由后来的人继续承担。'},
];
export function deepenChapterEndings(set) {
  for(const target of endingChapterRoutes){
    const ending=set.endings.find(e=>e.id===target.id);if(!ending)throw Error('Missing existing ending '+target.id);
    ending.unlockRoutes=[...(ending.unlockRoutes??[]).filter(r=>!r.id.startsWith('r108-')),structuredClone(target.route)];
    ending.epilogueSections=[...(ending.epilogueSections??[]).filter(s=>!s.id.startsWith('r108-')),...chapterAftermath.map(chapter=>({
      id:'r108-'+chapter.id,title:chapter.title,fallbackText:chapter.fallbackText,
      variants:chapter.first.flatMap(([firstId,firstText],a)=>chapter.second.map(([secondId,secondText],b)=>({
        id:`r108-${chapter.id}-${a}-${b}`,text:firstText+secondText+chapter.answer+target.frame,
        conditions:[chapter.close,known(firstId,'已有第一处实际选择'),known(secondId,'已有第二处实际选择')],
      }))),
    }))];
  }
  return set;
}
