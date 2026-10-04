/**
 * Round 279 pure authoring repairs: an optional one-shot roadside medical
 * exchange on the actual Iron Ridge northbound route, plus a readable fork
 * sign on the Cloud Ridge southern slope. Story/IDs live in data authoring
 * only; the engine keeps its generic dialogue/confirmation protocol.
 *
 * Facts pinned by terrain inspection (tests re-verify every cell):
 * - Iron Ridge actual route is (4,7)→N4→(4,3)→E46→(50,3) with the north gate
 *   at (50,2). Cell (26,3) sits midway on that row-3 corridor; (26,4) is a
 *   walkable roadside cell one step south, free of NPC/event/landmark/gate/
 *   encounter overlap (base positions and schedules checked), so the keeper
 *   stands beside the road without blocking it.
 * - Cloud Ridge actual safe approach is (50,97)→N41→(50,56)→W10→(40,56)→
 *   N13→(40,43); the 13 blocked N inputs at (50,56) are the waystation wall.
 *   The fork sign stands at (50,59) — three cells before the fork — and is
 *   E-readable from the south/west/east approach cells.
 */

export const ROAD_KEEPER_NPC = {
  id: 'char.r279-xin-danggui',
  name: '辛当归',
  mapResourceId: 'map.round-62-iron-ridge',
  dialogueId: 'dlg.r279-xin-danggui-road-keeper',
  position: { col: 26, row: 4 },
  // Reuses the licensed puny-characters frames already shipped for the herb
  // caravan leader 石北 (144/152/160/168): same outfit, different duty post.
  spriteFrame: 160,
  spriteFrames: { down: 144, right: 152, up: 160, left: 168 },
};

export const ROAD_KEEPER_NPC_FILE = JSON.stringify(
  { npcs: [ROAD_KEEPER_NPC] },
  null,
  2,
) + '\n';

export const EXCHANGE_VARIABLE_KEY = 'r279.road-exchange';
export const EXCHANGE_MINUTES = 8;

export const ROAD_KEEPER_DIALOGUE_FILE = JSON.stringify(
  {
    conversations: [
      {
        id: 'dlg.r279-xin-danggui-road-keeper',
        startNodeId: 'greet',
        nodes: [
          {
            id: 'greet',
            text: '辛当归把药担往道旁又挪了半尺，让开北行的路面：「我替石北留守这中段药担。北关还有二十多格上坡——身上带的清心丸或熟铁砂，匀一样出来，我换你一贴现熬的回春膏，另费八分钟火候。两种只换一次；留着丸路上调息、留着砂锻器备料，也都是正经打算，不勉强。」',
            options: [
              {
                text: '拿一丸清心丸，换一贴回春膏。',
                nextNodeId: 'r279-qingxin-detail',
                conditions: [
                  { kind: 'variable', key: EXCHANGE_VARIABLE_KEY, operator: 'missing' },
                  { kind: 'itemCount', itemId: 'item.qingxin-wan', minCount: 1 },
                ],
              },
              {
                text: '拿一份熟铁砂，换一贴回春膏。',
                nextNodeId: 'r279-iron-detail',
                conditions: [
                  { kind: 'variable', key: EXCHANGE_VARIABLE_KEY, operator: 'missing' },
                  { kind: 'itemCount', itemId: 'item.iron-sand', minCount: 1 },
                ],
              },
              {
                text: '核对换药的存根。',
                nextNodeId: 'r279-exchange-record',
                conditions: [
                  { kind: 'variable', key: EXCHANGE_VARIABLE_KEY, operator: 'exists' },
                ],
              },
              { text: '先赶路要紧，回头再说。', nextNodeId: 'r279-farewell' },
            ],
          },
          {
            id: 'r279-qingxin-detail',
            confirmEffects: true,
            text: '辛当归拈起那丸清心丸对着光看了看：「一丸清心丸，换回春膏一贴，再等我八分钟熬上药。换了，路上气短就没得含的了——步云履那一段费内力，你自家掂量。」',
            options: [
              {
                text: '就按这个换。',
                nextNodeId: 'r279-exchange-receipt',
                conditions: [
                  { kind: 'variable', key: EXCHANGE_VARIABLE_KEY, operator: 'missing' },
                  { kind: 'itemCount', itemId: 'item.qingxin-wan', minCount: 1 },
                ],
                effects: [
                  { kind: 'takeItem', itemId: 'item.qingxin-wan', quantity: 1 },
                  { kind: 'giveItem', itemId: 'item.huichun-gao', quantity: 1 },
                  { kind: 'advanceTime', minutes: EXCHANGE_MINUTES },
                  { kind: 'setVariable', key: EXCHANGE_VARIABLE_KEY, value: 'qingxin-wan' },
                ],
              },
              { text: '再想想，先不换。', nextNodeId: 'greet' },
            ],
          },
          {
            id: 'r279-iron-detail',
            confirmEffects: true,
            text: '辛当归捏了捏袋口的熟铁砂：「一份熟铁砂，换回春膏一贴，也等八分钟。这砂留着，往后锻器备料用得上；换出去，就是把余料押在伤药上。换成不成，你说了算。」',
            options: [
              {
                text: '就按这个换。',
                nextNodeId: 'r279-exchange-receipt',
                conditions: [
                  { kind: 'variable', key: EXCHANGE_VARIABLE_KEY, operator: 'missing' },
                  { kind: 'itemCount', itemId: 'item.iron-sand', minCount: 1 },
                ],
                effects: [
                  { kind: 'takeItem', itemId: 'item.iron-sand', quantity: 1 },
                  { kind: 'giveItem', itemId: 'item.huichun-gao', quantity: 1 },
                  { kind: 'advanceTime', minutes: EXCHANGE_MINUTES },
                  { kind: 'setVariable', key: EXCHANGE_VARIABLE_KEY, value: 'iron-sand' },
                ],
              },
              { text: '再想想，先不换。', nextNodeId: 'greet' },
            ],
          },
          { id: 'r279-farewell', text: '辛当归把药担让到道边：「北关还在前头，赶路也留心脚下。有伤再敷膏，气短才用丸，原路回来不必特地再换药。」' },
          {
            id: 'r279-exchange-receipt',
            text: '纸包还带着熬药的余温。辛当归把存根上的麻绳打了个结：「回春膏一贴收好，B键背包里查看，伤后再敷，按实际伤势用药。这笔换过了，我这担药不收第二回——原路回渡口时路过，打个招呼就行。」',
          },
          {
            id: 'r279-exchange-record',
            text: '辛当归翻开指边的麻绳存根：「你这笔早换过了。回春膏伤后敷；真缺药，客舍沈雨霁有少量药匣，或原路回渡口再想办法。没有第二贴，也不收退换。」',
          },
        ],
      },
    ],
  },
  null,
  2,
) + '\n';

export const FORK_SIGN_LANDMARK = {
  id: 'landmark.r279-cloud-fork-sign',
  mapResourceId: 'map.round-74-cloud-ridge',
  col: 50,
  row: 59,
  name: '云岭南岔指路牌',
  category: 'route',
};

export const FORK_SIGN_EVENT = {
  id: 'event.r279-cloud-fork-sign',
  mapResourceId: 'map.round-74-cloud-ridge',
  col: 50,
  row: 59,
  text: '新削的松木牌写着：「北上至(50,56)岔口须先折西，沿石路到四十列，再向北到客舍前道。屋墙挡道，别照直线穿屋；R人物查沈雨霁当下所在，走相邻再F交谈、E交易。回关可沿原路，不需为读口信另返渡口。」',
  approachText: '岔口前的松木牌在山风里轻叩桩响。',
  once: false,
  interaction: { prompt: '细看南坡岔口的新指路牌', approachDirections: ['up', 'down', 'left', 'right'] },
};

export const CLOUD_MAP_ID = 'map.round-74-cloud-ridge';
export const CLOUD_ADVICE_BEFORE =
  '先看刻痕再过断索、问沈雨霁；三地对照后选北台或青帆埠。客舍备药匣由沈雨霁售少量伤药，E交易、Q差事、F交谈，售完本程不补货；循石路接调查点与北台，缺货可东去青帆埠，回关仍可原路走。初到客舍先核渡口来路，再接云阶辨刻；刻痕确认后才接断索清桥。两件本地事可先完成，不必为残篇三地对照立即回渡口；清桥只是清退拦路客，不等于修好断索。';
export const CLOUD_ADVICE_AFTER =
  '先看刻痕再过断索、问沈雨霁；三地对照后选北台或青帆埠。客舍备药匣少量伤药，E交易、Q差事、F交谈，售完本程不补货；缺货可东去青帆埠，回关原路走。南坡(50,59)指路牌E可读：先折西到40列再北行至客舍前(40,43)，R人物核当期位置，不可穿墙。初到客舍先核渡口来路，再接云阶辨刻；刻痕确认后才接断索清桥。两件本地事先完成，不必为残篇三地对照立即回渡口；清桥只是清退拦路客，不等于修好断索。';

export const GRAPH_NODE = {
  id: 'char.r279-xin-danggui',
  kind: 'character',
  title: '辛当归',
  summary: '铁嶂北行道旁的药队留守人，替石北看顾中段山路的药担，清心丸或熟铁砂任选一种换膏，总计一次。',
  knownByDefault: false,
};

export const GRAPH_EDGES = [
  {
    id: 'kg.edge.r279-danggui-located',
    fromId: 'char.r279-xin-danggui',
    toId: 'map.round-62-iron-ridge',
    relation: 'locatedAt',
    summary: '辛当归在铁嶂北行路中段(26,3)道旁留守药担。',
  },
  {
    id: 'kg.edge.r279-danggui-knows-shibei',
    fromId: 'char.r279-xin-danggui',
    toId: 'char.shi-bei',
    relation: 'knows',
    summary: '辛当归替石北的药队留守中段山路，换药存根与渡口药簿对账。',
  },
];

export const MANIFEST_ENTRIES = [
  { id: 'npc.round-279-iron-ridge-set', path: 'characters/round-279-iron-ridge-npcs.json', schema: 'npc-set' },
  { id: 'dialogue.round-279-road-keeper-set', path: 'dialogues/round-279-road-keeper-conversations.json', schema: 'dialogue-set' },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const clone = (value) => structuredClone(value);

function one(array, predicate, label) {
  const found = array.filter(predicate);
  if (found.length !== 1) throw new Error(`${label} 应恰有一项，请人工复核。`);
  return found[0];
}

/** Verified idempotent world-map patch: fork landmark + E-readable fork event. */
export function repairWorldMapRaw(raw) {
  const parsed = JSON.parse(raw);
  let changed = false;
  for (const wanted of [FORK_SIGN_LANDMARK]) {
    const existing = parsed.landmarks.filter((entry) => entry.id === wanted.id);
    const applied = existing.length === 1 && same(existing[0], wanted);
    if (existing.length > 0 && !applied) throw new Error(`地标 ${wanted.id} 已存在但内容不符，请人工复核。`);
    const clash = parsed.landmarks.filter((entry) =>
      entry.id !== wanted.id &&
      entry.mapResourceId === wanted.mapResourceId &&
      entry.col === wanted.col && entry.row === wanted.row);
    if (clash.length > 0) throw new Error(`地标格 (${wanted.col},${wanted.row}) 已有其他地标，请人工复核。`);
    if (applied) continue;
    parsed.landmarks.push(clone(wanted));
    changed = true;
  }
  for (const wanted of [FORK_SIGN_EVENT]) {
    const existing = parsed.events.filter((entry) => entry.id === wanted.id);
    const applied = existing.length === 1 && same(existing[0], wanted);
    if (existing.length > 0 && !applied) throw new Error(`事件 ${wanted.id} 已存在但内容不符，请人工复核。`);
    const clash = parsed.events.filter((entry) =>
      entry.id !== wanted.id &&
      entry.mapResourceId === wanted.mapResourceId &&
      entry.col === wanted.col && entry.row === wanted.row);
    if (clash.length > 0) throw new Error(`事件格 (${wanted.col},${wanted.row}) 已有其他事件，请人工复核。`);
    if (applied) continue;
    parsed.events.push(clone(wanted));
    changed = true;
  }
  const guide = one(parsed.regionGuides, (entry) => entry.mapResourceId === CLOUD_MAP_ID, '云岭行旅指南');
  if (guide.advice === CLOUD_ADVICE_AFTER) {
    // applied
  } else if (guide.advice === CLOUD_ADVICE_BEFORE) {
    guide.advice = CLOUD_ADVICE_AFTER;
    changed = true;
  } else {
    throw new Error('云岭行旅指南已漂移，请人工复核。');
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(parsed, null, 2) + '\n').replace(/\n/g, eol);
  JSON.parse(next);
  return changed ? next : raw;
}

/** Appends the keeper character node (CRLF file convention preserved). */
export function repairGraphNodesRaw(raw) {
  const parsed = JSON.parse(raw);
  const existing = parsed.nodes.filter((entry) => entry.id === GRAPH_NODE.id);
  if (existing.length === 1 && same(existing[0], GRAPH_NODE)) return raw;
  if (existing.length > 0) throw new Error(`图谱节点 ${GRAPH_NODE.id} 已存在但内容不符，请人工复核。`);
  if (parsed.nodes.some((entry) => entry.title === GRAPH_NODE.title && entry.kind === 'character')) {
    throw new Error('图谱已有同名人物，请人工复核。');
  }
  parsed.nodes.push(clone(GRAPH_NODE));
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(parsed, null, 2) + '\n').replace(/\n/g, eol);
  JSON.parse(next);
  return next;
}

/** Appends the two keeper edges (CRLF file convention preserved). */
export function repairGraphEdgesRaw(raw) {
  const parsed = JSON.parse(raw);
  let changed = false;
  for (const wanted of GRAPH_EDGES) {
    const existing = parsed.edges.filter((entry) => entry.id === wanted.id);
    if (existing.length === 1 && same(existing[0], wanted)) continue;
    if (existing.length > 0) throw new Error(`图谱边 ${wanted.id} 已存在但内容不符，请人工复核。`);
    parsed.edges.push(clone(wanted));
    changed = true;
  }
  if (!changed) return raw;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(parsed, null, 2) + '\n').replace(/\n/g, eol);
  JSON.parse(next);
  return next;
}

/** Syncs the canonical region-guide source (round106) Cloud Ridge advice. */
export function repairRegionGuideSourceRaw(source) {
  const beforeCount = source.split(CLOUD_ADVICE_BEFORE).length - 1;
  const afterCount = source.split(CLOUD_ADVICE_AFTER).length - 1;
  if (afterCount === 1 && beforeCount === 0) return source;
  if (beforeCount === 1 && afterCount === 0) {
    return source.replace(CLOUD_ADVICE_BEFORE, CLOUD_ADVICE_AFTER);
  }
  throw new Error('round106 源中的云岭指南锚点已变化，请人工复核。');
}

/** Registers the two static Round 279 resources in the manifest (append tail). */
export function repairManifestRaw(raw) {
  const parsed = JSON.parse(raw);
  let changed = false;
  for (const wanted of MANIFEST_ENTRIES) {
    const existing = parsed.resources.filter((entry) => entry.id === wanted.id);
    if (existing.length === 1 && same(existing[0], wanted)) continue;
    if (existing.length > 0) throw new Error(`manifest 条目 ${wanted.id} 已存在但内容不符，请人工复核。`);
    const pathClash = parsed.resources.filter((entry) => entry.path === wanted.path);
    if (pathClash.length > 0) throw new Error(`manifest 路径 ${wanted.path} 已被占用，请人工复核。`);
    parsed.resources.push(clone(wanted));
    changed = true;
  }
  if (!changed) return raw;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(parsed, null, 2) + '\n').replace(/\n/g, eol);
  JSON.parse(next);
  return next;
}

/**
 * Static new-file guard for the CLI: an existing file must equal the shipped
 * bytes exactly apart from LF/CRLF (semantic/spacing drift refuses); a missing file reports as unwritten so the
 * runner can create it inside the same preflight-then-write batch.
 */
export function staticResourceState(raw, expected, label) {
  if (raw === undefined) return { present: false, ok: true };
  if (raw.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n')) return { present: true, ok: true };
  throw new Error(`${label} 已存在但与定稿字节不符，请人工复核。`);
}

/** Expected post-repair shape for tests and the CLI self-check. */
export const R279_ROAD_EXCHANGE_EXPECTATION = {
  npcId: ROAD_KEEPER_NPC.id,
  npcName: ROAD_KEEPER_NPC.name,
  npcMap: ROAD_KEEPER_NPC.mapResourceId,
  npcCell: { col: 26, row: 4 },
  routeCell: { col: 26, row: 3 },
  dialogueId: ROAD_KEEPER_NPC.dialogueId,
  variableKey: EXCHANGE_VARIABLE_KEY,
  minutes: EXCHANGE_MINUTES,
  payItems: ['item.qingxin-wan', 'item.iron-sand'],
  gainItem: 'item.huichun-gao',
  forkSignCell: { col: 50, row: 59 },
  forkEventId: FORK_SIGN_EVENT.id,
  forkLandmarkId: FORK_SIGN_LANDMARK.id,
  adviceFragment: '先折西到40列再北行至客舍前(40,43)',
};
