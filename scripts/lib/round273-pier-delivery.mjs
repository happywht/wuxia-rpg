/**
 * Round 273 pure authoring repairs: explicit confirmed hand-delivery with a
 * real two-day construction period for 先修栈桥 (quest.r31-mend-the-pier),
 * plus the generic `advanceTime` dialogue-effect schema entry it relies on.
 *
 * Conventions (matches lib/round271-journey-delivery.mjs):
 * - Stable quest id, objectives, rewards, exclusive group and follow-ups stay
 *   verbatim; delivery is a NEW ordered discoverKnowledge objective reusing
 *   the stable r31-pier-reinforced terminal marker (granted only after the
 *   real material cost and the two-day world-time cost are paid).
 * - Repairs are pure with input EOL preserved; re-running on repaired input
 *   is a byte-identical no-op, and an unexpected drift of any managed entry
 *   refuses instead of overwriting.
 */

export const PIER_QUEST_ID = 'quest.r31-mend-the-pier';
export const PIER_REINFORCED_EVENT_ID = 'event.r31-pier-reinforced';
export const PIER_CONSTRUCTION_MINUTES = 2880; // Two in-game days.

const PIER_QUEST_OLD_DESCRIPTION =
  '白鹭洲不赞成硬闯：旧栈桥的桩脚早就酥了，重载药队一上去便是塌。他要用熟铁砂补桩、韧皮捆扎，先把桥修牢，药队宁可等两日走旱桥。备齐三份熟铁砂与两捆韧皮料，工钱他出。';
const PIER_QUEST_NEW_DESCRIPTION =
  '白鹭洲不赞成硬闯：旧栈桥的桩脚早就酥了，重载药队一上去便是塌。他要用熟铁砂补桩、韧皮捆扎，先把桥修牢，药队宁可等两日走旱桥。备齐三份熟铁砂与两捆韧皮料后，回到渡口按F与白鹭洲交谈、当面交料并确认动工，工期两日、完工结算，工钱他出。';

export const PIER_DELIVERY_OBJECTIVE = {
  id: 'objective.r273-pier-delivery',
  kind: 'discoverKnowledge',
  targetId: PIER_REINFORCED_EVENT_ID,
  requiredCount: 1,
  navigationNpcId: 'char.bai-luzhou',
  text: '回白鹭洲处按F交料并确认动工（熟铁砂×3、韧皮×2；工期两日）',
};

export const BAI_DIALOGUE_ID = 'dlg.bai-luzhou-ferry-master';
export const PIER_DELIVERY_DIALOGUE = {
  conversationId: BAI_DIALOGUE_ID,
  readyOption: {
    text: '修桥的料备齐了：熟铁砂×3、韧皮×2，请渡董安排动工。',
    nextNodeId: 'r273-pier-delivery-confirm',
    conditions: [
      { kind: 'questStatus', questId: PIER_QUEST_ID, status: 'active' },
      { kind: 'itemCount', itemId: 'item.iron-sand', minCount: 3 },
      { kind: 'itemCount', itemId: 'item.tough-leather', minCount: 2 },
      { kind: 'knowledgeKnown', nodeId: PIER_REINFORCED_EVENT_ID, isKnown: false },
    ],
  },
  progressOption: {
    text: '渡董，修桥的料要怎么交、工期怎么算？',
    nextNodeId: 'r273-pier-progress',
    conditions: [{ kind: 'questStatus', questId: PIER_QUEST_ID, status: 'active' }],
  },
  confirmNode: {
    id: 'r273-pier-delivery-confirm',
    confirmEffects: true,
    text: '白鹭洲把工单压在渡籍旁：「熟铁砂三份、韧皮两捆，料要交给工匠。你点头，我就安排动工；工期两日，桥修好再走旱路。工钱我出。想清楚，别让药队白等。」',
    options: [
      {
        text: '当场交料，即日动工（熟铁砂×3、韧皮×2，工期两日）。',
        nextNodeId: 'r273-pier-delivered',
        effects: [
          { kind: 'takeItem', itemId: 'item.iron-sand', quantity: 3 },
          { kind: 'takeItem', itemId: 'item.tough-leather', quantity: 2 },
          { kind: 'advanceTime', minutes: PIER_CONSTRUCTION_MINUTES },
          { kind: 'discoverKnowledgeNode', nodeId: PIER_REINFORCED_EVENT_ID },
        ],
      },
      { text: '先不动工，容我再想想。', nextNodeId: 'greet' },
    ],
  },
  progressNode: {
    id: 'r273-pier-progress',
    text: '白鹭洲翻开工单：「熟铁砂三份、韧皮两捆，到江南姜百味处买，共五十六银，渡口没这批料。备齐后回来按F交谈，选交料动工；你点头我才收料，工期两日，工钱我出。」',
  },
  deliveredNode: {
    id: 'r273-pier-delivered',
    text: '两日后，白鹭洲在渡籍上勾了「栈桥已加固」：「砂补了桩，韧皮也扎紧了，桥身稳了。只是桥头那伙索银人还没走；把他们清开，旱桥才好通药担。你的谢仪先结清。」',
  },
};

export const PIER_NODE_UPDATE = {
  id: PIER_REINFORCED_EVENT_ID,
  summary:
    '玩家备齐熟铁砂与韧皮料，在白鹭洲处按F当面交料并确认动工，经两日工期完成栈桥加固；仅完成「先修栈桥」后记录，并由此开放栈桥通渡。',
};

export const PIER_EDGE_UPDATE = {
  id: 'kg.edge.mend-pier-rewards-reinforced-event',
  summary:
    '备齐补桩与捆扎材料、经白鹭洲当面交料并两日工期完工后，渡籍记下栈桥已加固。',
};

export const ADVANCE_TIME_SCHEMA_ENTRY =
  '{"type":"object","additionalProperties":false,"required":["kind","minutes"],"properties":{"kind":{"const":"advanceTime"},"minutes":{"type":"integer","minimum":1,"maximum":10080,"description":"世界时间前进的分钟数（Round 273）：事务内原子计入，任一效果拒绝则整笔回滚、时钟不动；只推进时间，不移动角色。"}}}';
const ADVANCE_TIME_ANCHOR = '"const":"teleport"';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);
function one(array, predicate, label) {
  const found = array.filter(predicate);
  if (found.length !== 1) throw new Error(`${label} 应恰有一项，请人工复核。`);
  return found[0];
}

/** Splices one re-serialized top-level array record back into raw JSON text. */
function spliceRecord(source, id, record, eol) {
  const anchor = source.indexOf(`"id": ${JSON.stringify(id)}`);
  const start = source.lastIndexOf('    {', anchor);
  const next = source.indexOf(eol + '    }', anchor);
  if (anchor < 0 || start < 0 || next < 0) throw new Error(`受管条目边界无效 ${id}`);
  const replacement = JSON.stringify(record, null, 2)
    .split('\n')
    .map((line) => '    ' + line)
    .join(eol);
  const updated = source.slice(0, start) + replacement + source.slice(next + eol.length + 5);
  JSON.parse(updated);
  return updated;
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

/** Verified idempotent patch of the pier quest record. Returns raw text. */
export function repairQuestsRaw(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const parsed = JSON.parse(raw);
  const quest = one(parsed.quests, (entry) => entry.id === PIER_QUEST_ID, '任务 ' + PIER_QUEST_ID);
  const delivery = quest.objectives.filter((objective) => objective.id === PIER_DELIVERY_OBJECTIVE.id);
  const applied =
    delivery.length === 1 &&
    same(delivery[0], PIER_DELIVERY_OBJECTIVE) &&
    quest.objectives.length === 3 &&
    quest.description === PIER_QUEST_NEW_DESCRIPTION &&
    quest.orderedObjectives === true;
  if (applied) return raw;
  const pristine =
    delivery.length === 0 &&
    quest.description === PIER_QUEST_OLD_DESCRIPTION &&
    quest.orderedObjectives === undefined &&
    quest.objectives.length === 2;
  if (!pristine) throw new Error(`任务 ${PIER_QUEST_ID} 交付作者协议已变化，请人工复核。`);
  quest.description = PIER_QUEST_NEW_DESCRIPTION;
  quest.orderedObjectives = true;
  quest.objectives.push(clone(PIER_DELIVERY_OBJECTIVE));
  const updated = spliceRecord(raw, PIER_QUEST_ID, quest, eol);
  JSON.parse(updated);
  return updated;
}

/**
 * Verified idempotent patch of Bai Luzhou's pier-delivery conversation.
 * Surgical insertions only (options before the greet options-array close,
 * nodes before the conversation nodes-array close), matching R271.
 */
export function repairDialoguesRaw(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const spec = PIER_DELIVERY_DIALOGUE;
  const parsed = JSON.parse(raw);
  const conversation = one(parsed.conversations, (entry) => entry.id === spec.conversationId, '对话 ' + spec.conversationId);
  const greet = one(conversation.nodes, (node) => node.id === conversation.startNodeId, '对话入口');
  if (!Array.isArray(greet.options) || greet.options.length === 0) {
    throw new Error(`${spec.conversationId} 入口缺少选项。`);
  }
  const wantedOptions = [spec.readyOption, spec.progressOption];
  const wantedNodes = [spec.confirmNode, spec.progressNode, spec.deliveredNode];
  const optionTargets = wantedOptions.map((wanted) => wanted.nextNodeId);
  const nodeIds = wantedNodes.map((wanted) => wanted.id);
  const touchedOption = greet.options.filter((option) => optionTargets.includes(option.nextNodeId));
  const touchedNode = conversation.nodes.filter((node) => nodeIds.includes(node.id));
  const exactOptions = greet.options.filter((option) => wantedOptions.some((wanted) => same(option, wanted)));
  const exactNodes = conversation.nodes.filter((node) => wantedNodes.some((wanted) => same(node, wanted)));
  if (exactOptions.length === 2 && exactNodes.length === 3 && touchedOption.length === 2 && touchedNode.length === 3) return raw;
  if (touchedOption.length !== 0 || touchedNode.length !== 0) {
    throw new Error(`对话 ${spec.conversationId} 修桥交付选项/节点已变化，请人工复核。`);
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
  const formattedOptions = wantedOptions
    .map((option) =>
      JSON.stringify(option, null, 2)
        .split('\n')
        .map((line) => '            ' + line)
        .join(eol),
    )
    .join(',' + eol);
  const nextGreetBlock =
    greetBlock.slice(0, optionsInsertAt) + ',' + eol + formattedOptions + greetBlock.slice(optionsInsertAt);
  slice = slice.slice(0, greetStart) + nextGreetBlock + slice.slice(greetEnd);

  const nodesOpen = slice.indexOf('"nodes": [');
  if (nodesOpen < 0) throw new Error('对话缺少节点数组。');
  const nodesClose = matchBracket(slice, slice.indexOf('[', nodesOpen));
  if (nodesClose < 0) throw new Error('节点数组括号不匹配。');
  const nodesInsertAt = slice.lastIndexOf(eol, nodesClose);
  const formattedNodes = wantedNodes
    .map((node) =>
      JSON.stringify(node, null, 2)
        .split('\n')
        .map((line) => '        ' + line)
        .join(eol),
    )
    .join(',' + eol);
  slice = slice.slice(0, nodesInsertAt) + ',' + eol + formattedNodes + slice.slice(nodesInsertAt);

  const updatedAt = raw.indexOf(conversationMarker);
  const updatedStart = raw.lastIndexOf('{', updatedAt);
  const updatedEnd = matchBracket(raw, updatedStart);
  if (updatedAt < 0 || updatedStart < 0 || updatedEnd < 0) throw new Error('对话边界失效。');
  if (!same(JSON.parse(raw.slice(updatedStart, updatedEnd + 1)), conversation)) {
    throw new Error('对话边界不匹配。');
  }
  const result = raw.slice(0, updatedStart) + slice + raw.slice(updatedEnd + 1);
  // Mirror the byte-level insertion into the reference tree, then round-trip.
  for (const wanted of wantedNodes) conversation.nodes.push(clone(wanted));
  for (const wanted of wantedOptions) greet.options.push(clone(wanted));
  if (!same(JSON.parse(result), parsed)) throw new Error('对白输出与纯修复不匹配。');
  return result;
}

/** Verified idempotent summary updates of the pier marker node and reward edge. */
export function repairKnowledgeGraph(nodesDoc, edgesDoc) {
  const node = one(nodesDoc.nodes, (entry) => entry.id === PIER_NODE_UPDATE.id, '见闻节点 ' + PIER_NODE_UPDATE.id);
  const nodeApplied = node.summary === PIER_NODE_UPDATE.summary;
  const edge = one(edgesDoc.edges, (entry) => entry.id === PIER_EDGE_UPDATE.id, '见闻边 ' + PIER_EDGE_UPDATE.id);
  const edgeApplied = edge.summary === PIER_EDGE_UPDATE.summary;
  if (nodeApplied && edgeApplied) return { nodesDoc, edgesDoc, changed: false };
  const pristineNode =
    node.summary === '玩家备齐熟铁砂与韧皮料，完成栈桥加固；仅完成「先修栈桥」后记录，并由此开放栈桥通渡。';
  const pristineEdge = edge.summary === '备齐补桩与捆扎材料、完成修桥后，渡籍记下栈桥已加固。';
  if (!nodeApplied && !pristineNode) throw new Error(`见闻节点 ${PIER_NODE_UPDATE.id} 摘要已变化，请人工复核。`);
  if (!edgeApplied && !pristineEdge) throw new Error(`见闻边 ${PIER_EDGE_UPDATE.id} 摘要已变化，请人工复核。`);
  node.summary = PIER_NODE_UPDATE.summary;
  edge.summary = PIER_EDGE_UPDATE.summary;
  return { nodesDoc, edgesDoc, changed: true };
}

/**
 * Adds the generic `advanceTime` effect entry to the dialogue-set schema.
 * The schema keeps hand-mixed formatting, so this is a text-splice after the
 * compact teleport entry (idempotent; refuses on unexpected anchor drift).
 */
export function repairDialogueSchemaRaw(raw) {
  const entries = JSON.parse(raw).definitions?.effect?.oneOf;
  if (!Array.isArray(entries) || entries.filter(entry => entry.properties?.kind?.const === 'teleport').length !== 1) {
    throw new Error('dialogue Schema 的 teleport 效果锚点已变化，请人工复核。');
  }
  const applied = entries.filter(entry => entry.properties?.kind?.const === 'advanceTime');
  if (applied.length > 0) {
    if (applied.length !== 1 || !same(applied[0], JSON.parse(ADVANCE_TIME_SCHEMA_ENTRY))) {
      throw new Error('dialogue Schema 的 advanceTime 规则已变化，请人工复核。');
    }
    return raw;
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const anchorLine = raw.split(eol).find((line) => line.includes(ADVANCE_TIME_ANCHOR));
  if (anchorLine === undefined || !anchorLine.trimEnd().endsWith(',')) {
    throw new Error('dialogue Schema 的 teleport 效果锚点已变化，请人工复核。');
  }
  const indent = anchorLine.slice(0, anchorLine.length - anchorLine.trimStart().length);
  const updated = raw.replace(
    anchorLine,
    anchorLine + eol + indent + ADVANCE_TIME_SCHEMA_ENTRY + ',',
  );
  JSON.parse(updated);
  return updated;
}

/** Expected post-repair shape for tests and the CLI self-check. */
export const R273_PIER_DELIVERY_EXPECTATION = {
  questId: PIER_QUEST_ID,
  deliveryObjectiveId: PIER_DELIVERY_OBJECTIVE.id,
  eventId: PIER_REINFORCED_EVENT_ID,
  conversationId: BAI_DIALOGUE_ID,
  confirmNodeId: PIER_DELIVERY_DIALOGUE.confirmNode.id,
  constructionMinutes: PIER_CONSTRUCTION_MINUTES,
};
