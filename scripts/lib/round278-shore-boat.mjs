/**
 * Round 278 pure authoring repairs: a paid intra-map shore boat on the mist
 * ferry map (渡口西岸船埠 ⇄ 雾岬北岸), reusing the generic transition
 * protocol exactly as the Round 123 芦桥短渡 already does on this map.
 *
 * Facts pinned by terrain inspection (see tests + implementation notes):
 * - Source (0,3) is beside the existing 芦岸登船点 (1,4). Every walkable
 *   approach is clear of NPC/service priority and other adjacent gates.
 *   The R275 free-route cells (4,3)/(5,4) stay untouched.
 * - Landing (87,15) is walkable, one cell east of the water gauge (86,15) and
 *   two cells west of the north gate (89,15): riding skips the shore walk but
 *   never grants gauge discovery (landing is not the gauge cell) or skips the two
 *   Iron Ridge gates; the free walk route stays available.
 * - Return mirrors the R123 off-by-one landing convention: from (87,16) to
 *   (0,4).
 * - Fare 8 / travelMinutes 20 matches the existing same-map precedent.
 */

export const SHORE_BOAT_TRANSITIONS = [
  {
    id: 'gate.r278-ferry-north-boat',
    from: { mapResourceId: 'map.round-10-mist-ferry', col: 0, row: 3 },
    to: { mapResourceId: 'map.round-10-mist-ferry', col: 87, row: 15 },
    fare: 8,
    travelMinutes: 20,
    name: '雾岬驿舟·去北岸',
  },
  {
    id: 'gate.r278-ferry-north-boat-return',
    from: { mapResourceId: 'map.round-10-mist-ferry', col: 87, row: 16 },
    to: { mapResourceId: 'map.round-10-mist-ferry', col: 0, row: 4 },
    fare: 8,
    travelMinutes: 20,
    name: '雾岬驿舟·回渡口',
  },
];

/**
 * The ferry region-guide advice is capped at 240 schema characters and was
 * exactly full (Round 275 wording). Round 278 rewrites it as an equal-or-
 * shorter string that keeps every test-anchored fragment (清点苍崖根×3 /
 * 生肌散另耗寒珠草×2、根×1和18银 / 铁砂×3 / 韧皮×2（56银） / 渡口无料铺 /
 * 西陲苦井 / 没有直达传送) and states the boat trade-off.
 */
export const FERRY_ADVICE_BEFORE =
  '药路先问容素青：清点苍崖根×3，生肌散另耗寒珠草×2、根×1和18银；问方、炼成后可先巡岸，伤后用药再复核。药队封箱另交无极丹×1并专门约时。若考虑修桥，另备铁砂×3、韧皮×2（56银），渡口无料铺。渡口无药铺，缺料回镇找姜百味；缺急救药先查R补给页。公所续差事，Q核目标、F问话。药队一事定下后，上山去核云阶旧索的方向：R出区选雾岬北口，到铁嶂后选断云北隘，再到云岭客舍问沈雨霁。此路没有直达传送；铁嶂调查可顺路记下，不必全做才过境。云隐药路余香另指西陲苦井，不把它当云岭必修。';
export const FERRY_ADVICE_AFTER =
  '药路先问容素青：清点苍崖根×3，生肌散另耗寒珠草×2、根×1和18银。修桥另备铁砂×3、韧皮×2（56银），渡口无料铺；封箱另交无极丹×1并约时。渡口无药铺，缺药回镇找姜百味，R补给页可查；Q核目标、F问话。上北岸可步行，也可芦岸登船点北侧(0,3)旁按E乘驿舟：8银/20分钟，只到北岸，铁嶂两关仍自过，水尺见闻乘舟略过。到铁嶂选断云北隘，再到云岭客舍问沈雨霁；此路没有直达传送。云隐药路余香另指西陲苦井。';

export const BAI_DIALOGUE_ID = 'dlg.bai-luzhou-ferry-master';
export const SHORE_BOAT_DIALOGUE = {
  conversationId: BAI_DIALOGUE_ID,
  infoOption: {
    text: '渡口的驿舟怎么算？我想省一段北岸的路。',
    nextNodeId: 'r278-shore-boat-info',
  },
  infoNode: {
    id: 'r278-shore-boat-info',
    text: '白鹭洲往芦岸登船点一指：「驿舟八银一位、二十分钟，从登船点北侧(0,3)旁按E候舟，只送到北岸水尺旁——铁嶂两关还得你自己过，别当它直达云岭。腿脚愿意走，沿北岸老路照旧不要钱，路过的水尺见闻也还是你的；上了船，那一段就略过了。去程回程都这个价，走不走你自己掂量。」',
  },
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);
function one(array, predicate, label) {
  const found = array.filter(predicate);
  if (found.length !== 1) throw new Error(`${label} 应恰有一项，请人工复核。`);
  return found[0];
}

/** Index of the bracket closing the one opened at `openIdx` (string-aware). */
function matchBracket(text, openIdx) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      if (--depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Verified idempotent world-map patch: upserts the two shore-boat gates and
 * rewrites the ferry advice. The file ships in stringify(2)+LF form (the
 * generate-round123 writer convention), so a full re-serialization is the
 * canonical byte shape. Refuses on any managed-entry drift.
 */
export function repairWorldMapRaw(raw) {
  const parsed = JSON.parse(raw);
  let changed = false;
  for (const gate of SHORE_BOAT_TRANSITIONS) {
    const existing = parsed.transitions.filter((entry) => entry.id === gate.id);
    const alreadyApplied = existing.length === 1 && same(existing[0], gate);
    if (existing.length > 0 && !alreadyApplied) throw new Error(`关口 ${gate.id} 已存在但内容不符，请人工复核。`);
    // A from/to cell may host at most one gate — refuse silent collisions.
    for (const point of [gate.from, gate.to]) {
      const clash = parsed.transitions.some((entry) =>
        entry.id !== gate.id &&
        entry.from.mapResourceId === point.mapResourceId &&
        entry.from.col === point.col && entry.from.row === point.row);
      if (clash) throw new Error(`落点/入口 (${point.col},${point.row}) 已有其他关口，请人工复核。`);
    }
    if (alreadyApplied) continue;
    // Insert ahead of the R126 coastal gates: later generators (R126) append
    // their own gates at the tail, so this ordering keeps every full-chain
    // replay byte-stable instead of swapping gate order after R278.
    const anchorIndex = parsed.transitions.findIndex((entry) => String(entry.id).startsWith('gate.r126-'));
    parsed.transitions.splice(anchorIndex < 0 ? parsed.transitions.length : anchorIndex, 0, clone(gate));
    changed = true;
  }
  const guide = one(parsed.regionGuides, (entry) => entry.mapResourceId === 'map.round-10-mist-ferry', '渡口行旅指南');
  if (guide.advice === FERRY_ADVICE_AFTER) {
    // applied
  } else if (guide.advice === FERRY_ADVICE_BEFORE) {
    guide.advice = FERRY_ADVICE_AFTER;
    changed = true;
  } else {
    throw new Error('渡口行旅指南已漂移，请人工复核。');
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(parsed, null, 2) + '\n').replace(/\n/g, eol);
  JSON.parse(next);
  return changed ? next : raw;
}

/**
 * Syncs the canonical region-guide source (scripts/lib/round106-region-
 * content.mjs): the advice lives there verbatim, so the R278 rewrite replaces
 * the old string in place. Idempotent; refuses when neither form is found.
 */
export function repairRegionGuideSourceRaw(source) {
  const beforeCount = source.split(FERRY_ADVICE_BEFORE).length - 1;
  const afterCount = source.split(FERRY_ADVICE_AFTER).length - 1;
  if (afterCount === 1 && beforeCount === 0) return source;
  if (beforeCount === 1 && afterCount === 0) {
    return source.replace(FERRY_ADVICE_BEFORE, FERRY_ADVICE_AFTER);
  }
  throw new Error('round106 源中的渡口指南锚点已变化，请人工复核。');
}

/**
 * Verified idempotent patch of Bai Luzhou's shore-boat info entries. Surgical
 * insertions only (option before the greet options-array close, node before
 * the conversation nodes-array close), matching the R271/R273 writers.
 */
export function repairDialoguesRaw(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const spec = SHORE_BOAT_DIALOGUE;
  const parsed = JSON.parse(raw);
  const conversation = one(parsed.conversations, (entry) => entry.id === spec.conversationId, '对话 ' + spec.conversationId);
  const greet = one(conversation.nodes, (node) => node.id === conversation.startNodeId, '对话入口');
  if (!Array.isArray(greet.options) || greet.options.length === 0) {
    throw new Error(`${spec.conversationId} 入口缺少选项。`);
  }
  const wantedOptions = [spec.infoOption];
  const wantedNodes = [spec.infoNode];
  const exactOptions = greet.options.filter((option) => wantedOptions.some((wanted) => same(option, wanted)));
  const exactNodes = conversation.nodes.filter((node) => wantedNodes.some((wanted) => same(node, wanted)));
  const touchedOption = greet.options.filter((option) => option.nextNodeId === spec.infoOption.nextNodeId);
  const touchedNode = conversation.nodes.filter((node) => node.id === spec.infoNode.id);
  if (exactOptions.length === 1 && exactNodes.length === 1 && touchedOption.length === 1 && touchedNode.length === 1) return raw;
  if (touchedOption.length !== 0 || touchedNode.length !== 0) {
    throw new Error(`对话 ${spec.conversationId} 驿舟提示选项/节点已变化，请人工复核。`);
  }

  const conversationMarker = '"id": ' + JSON.stringify(spec.conversationId);
  const conversationAt = raw.indexOf(conversationMarker);
  const conversationStart = raw.lastIndexOf('{', conversationAt);
  const conversationEnd = matchBracket(raw, conversationStart);
  if (conversationAt < 0 || conversationStart < 0 || conversationEnd < 0) throw new Error('未找到对话边界。');
  let slice = raw.slice(conversationStart, conversationEnd + 1);

  const greetMarker = '"id": ' + JSON.stringify(conversation.startNodeId);
  const greetAt = slice.indexOf(greetMarker);
  const greetStart = slice.lastIndexOf('        {', greetAt);
  const greetEnd = slice.indexOf(eol + '        }', greetAt);
  if (greetAt < 0 || greetStart < 0 || greetEnd < 0) throw new Error('未找到对话入口节点边界。');
  const greetBlock = slice.slice(greetStart, greetEnd);
  const optionsOpen = greetBlock.indexOf('"options": [');
  if (optionsOpen < 0) throw new Error('对话入口缺少选项数组。');
  const optionsClose = matchBracket(greetBlock, greetBlock.indexOf('[', optionsOpen));
  if (optionsClose < 0) throw new Error('选项数组括号不匹配。');
  const optionsInsertAt = greetBlock.lastIndexOf(eol, optionsClose);
  const formattedOption = JSON.stringify(spec.infoOption, null, 2)
    .split('\n')
    .map((line) => '            ' + line)
    .join(eol);
  const nextGreetBlock = greetBlock.slice(0, optionsInsertAt) + ',' + eol + formattedOption + greetBlock.slice(optionsInsertAt);
  slice = slice.slice(0, greetStart) + nextGreetBlock + slice.slice(greetEnd);

  const nodesOpen = slice.indexOf('"nodes": [');
  if (nodesOpen < 0) throw new Error('对话缺少节点数组。');
  const nodesClose = matchBracket(slice, slice.indexOf('[', nodesOpen));
  if (nodesClose < 0) throw new Error('节点数组括号不匹配。');
  const nodesInsertAt = slice.lastIndexOf(eol, nodesClose);
  const formattedNode = JSON.stringify(spec.infoNode, null, 2)
    .split('\n')
    .map((line) => '        ' + line)
    .join(eol);
  slice = slice.slice(0, nodesInsertAt) + ',' + eol + formattedNode + slice.slice(nodesInsertAt);

  const updatedAt = raw.indexOf(conversationMarker);
  const updatedStart = raw.lastIndexOf('{', updatedAt);
  const updatedEnd = matchBracket(raw, updatedStart);
  if (updatedAt < 0 || updatedStart < 0 || updatedEnd < 0) throw new Error('对话边界失效。');
  if (!same(JSON.parse(raw.slice(updatedStart, updatedEnd + 1)), conversation)) {
    throw new Error('对话边界不匹配。');
  }
  const result = raw.slice(0, updatedStart) + slice + raw.slice(updatedEnd + 1);
  greet.options.push(clone(spec.infoOption));
  conversation.nodes.push(clone(spec.infoNode));
  if (!same(JSON.parse(result), parsed)) throw new Error('对白输出与纯修复不匹配。');
  return result;
}

/** Expected post-repair shape for tests and the CLI self-check. */
export const R278_SHORE_BOAT_EXPECTATION = {
  transitionIds: SHORE_BOAT_TRANSITIONS.map((gate) => gate.id),
  fare: 8,
  travelMinutes: 20,
  mapResourceId: 'map.round-10-mist-ferry',
  source: { col: 0, row: 3 },
  landing: { col: 87, row: 15 },
  returnSource: { col: 87, row: 16 },
  returnLanding: { col: 0, row: 4 },
  adviceFragment: '芦岸登船点北侧(0,3)旁按E乘驿舟',
  dialogueNodeId: SHORE_BOAT_DIALOGUE.infoNode.id,
};
