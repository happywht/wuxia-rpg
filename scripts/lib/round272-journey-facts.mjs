/** P1 authored corrections: facts, parallel watch gate, and local challenge. Stable IDs/rewards preserved. */
export const dialogueFacts = [
  { conversationId: 'dlg.ma-shangyi-notice-board', nodeId: 'quest-progress',
    before: '药还没备齐？不急。姜百味的担子里就有回春膏，银两一时不凑手，也先赊着——回头我替你补上。',
    after: '马尚义翻了翻药账：「姜百味的担子里有回春膏，邻格按E购药。备齐三份后回来按F交谈，选当面交药，我再结谢仪。你自己路上的伤药也留一份。」' },
  { conversationId: 'dlg.rong-su-qing-herbalist', nodeId: 'teach-shengji',
    before: '她抓起一把寒珠草，又按上两段苍崖根：「寒珠败火定血，苍崖托气生肌，二比一下料，文火收霜，宁少勿多。记住了——散是死的，伤口是活的。」',
    after: '她将两份寒珠草与一份苍崖根分放药匾：「寒珠败火定血，苍崖托气生肌。寒珠二、苍崖一，文火收霜；备十八银工钱，去渡口药炉试做。记住了——散是死的，伤口是活的。」' }
];
export const teaFact = { questId: 'quest.r31-teastall-herbal-water', objectiveId: 'objective.r31-teastall-herbs',
  before: '备齐四株寒珠草（可采集，也可向江南姜百味采买）',
  after: '备齐寒珠草×4（江南姜百味处按E采买）' };
function one(rows, id, label) {
  if (!Array.isArray(rows)) throw Error(`${label}缺失，请人工复核`);
  const found = rows.filter(row => row.id === id);
  if (found.length !== 1) throw Error(`${label} ${id}应唯一，请人工复核`);
  return found[0];
}
function textPatch(raw, record, fact) {
  if (record.text === fact.after) return raw;
  if (record.text !== fact.before) throw Error('旅程事实文本已漂移，请人工复核');
  const token = JSON.stringify(fact.before);
  if (raw.split(token).length !== 2) throw Error('旅程事实文本边界不唯一，请人工复核');
  return raw.replace(token, JSON.stringify(fact.after));
}
export function repairDialogueFacts(raw) {
  const doc = JSON.parse(raw); let result = raw;
  for (const fact of dialogueFacts) {
    const conversation = one(doc.conversations, fact.conversationId, '对白');
    result = textPatch(result, one(conversation.nodes, fact.nodeId, '节点'), fact);
  }
  JSON.parse(result); return result;
}
export function repairQuestFacts(raw) {
  const doc = JSON.parse(raw);
  const quest = one(doc.quests, teaFact.questId, '差事');
  const result = textPatch(raw, one(quest.objectives, teaFact.objectiveId, '目标'), teaFact);
  JSON.parse(result); return result;
}

export const watchGate = {
  questId: 'quest.r31-mist-shore-watch', before: 'quest.r31-herbal-stocktaking', after: 'quest.r31-herbal-inquiry',
  edgeId: 'kg.edge.mist-watch-requires-stocktaking',
  oldSummary: '雾夜巡岸接在药庐清点之后，药队起运前夜才要巡岸。',
  summary: '问药后即可准备巡岸，与药庐实践并行；伤后可用自制药复核，封箱仍须两项完成。'
};
function patchRecordToken(raw, id, token, replacement) {
  const at = raw.indexOf(JSON.stringify(id));
  const end = raw.indexOf('\n    }', at);
  if (at < 0 || end < 0) throw Error('旅程节奏条目边界缺失，请人工复核');
  const body = raw.slice(at, end);
  if (body.split(token).length !== 2) throw Error('旅程节奏条目边界不唯一，请人工复核');
  const next = raw.slice(0, at) + body.replace(token, replacement) + raw.slice(end);
  JSON.parse(next); return next;
}
export function repairWatchPrerequisite(raw) {
  const q = one(JSON.parse(raw).quests, watchGate.questId, '巡岸');
  const gate = JSON.stringify(q.prerequisiteQuestIds);
  if (gate === JSON.stringify([watchGate.after])) return raw;
  if (gate !== JSON.stringify([watchGate.before])) throw Error('巡岸门槛已漂移，请人工复核');
  return patchRecordToken(raw, watchGate.questId, JSON.stringify(watchGate.before), JSON.stringify(watchGate.after));
}
export function repairWatchEdge(raw) {
  const edge = one(JSON.parse(raw).edges, watchGate.edgeId, '巡岸图谱');
  if (edge.fromId !== watchGate.questId || edge.relation !== 'requires') throw Error('巡岸关系已漂移，请人工复核');
  if (edge.toId === watchGate.after && edge.summary === watchGate.summary) return raw;
  if (edge.toId !== watchGate.before || edge.summary !== watchGate.oldSummary) throw Error('巡岸关系已漂移，请人工复核');
  const next = patchRecordToken(raw, watchGate.edgeId, JSON.stringify(watchGate.before), JSON.stringify(watchGate.after));
  return patchRecordToken(next, watchGate.edgeId, JSON.stringify(watchGate.oldSummary), JSON.stringify(watchGate.summary));
}

export const prowlerId = 'encounter.mist-shore-prowler';
export const prowlerBehavior = [
  { kind: 'art', artId: 'skill.jianghu-sanshou', cue: '探子探出苇杆，试你的距离' },
  { kind: 'art', artId: 'skill.jianghu-sanshou', powerBonus: 10, guardDisruptsBonus: true, cue: '探子横压苇杆，准备重击' },
  { kind: 'recoverQi', amount: 4, cue: '探子收杆换气，暂露空隙' }
];
export function repairProwler(raw) {
  const encounter = one(JSON.parse(raw).encounters, prowlerId, '探子遭遇');
  const enemy = encounter.enemy;
  const arts = ['skill.yunyin-shenfa', 'skill.jianghu-sanshou'];
  if (enemy.health === 72 && enemy.qi === 8 && JSON.stringify(enemy.martialArtIds) === JSON.stringify(arts) && JSON.stringify(enemy.behavior) === JSON.stringify(prowlerBehavior)) return raw;
  if (enemy.health !== 42 || enemy.qi !== 8 || JSON.stringify(enemy.martialArtIds) !== JSON.stringify(['skill.yunyin-shenfa']) || enemy.behavior !== undefined) throw Error('探子战斗资料已漂移，请人工复核');
  const next = structuredClone(encounter);
  next.enemy.health = 72; next.enemy.martialArtIds = arts; next.enemy.behavior = structuredClone(prowlerBehavior);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const at = raw.indexOf(JSON.stringify(prowlerId)), start = raw.lastIndexOf('    {', at), end = raw.indexOf(eol + '    }', at);
  if (start < 0 || end < 0) throw Error('探子文本边界缺失，请人工复核');
  const result = raw.slice(0, start) + JSON.stringify(next, null, 2).split('\n').map(line => '    ' + line).join(eol) + raw.slice(end + eol.length + 5);
  JSON.parse(result); return result;
}
