/**
 * Round 271 pure authoring repairs: explicit hand-delivery for the two stable
 * J0 supply quests (巷口送药 / 茶棚凉汤) plus the B-key crafting hint fix.
 *
 * Conventions (matches lib/round128-aid-donation.mjs and
 * deepen-round104-crafting.mjs):
 * - Stable quest ids, rewards and the collect objective texts stay verbatim;
 *   delivery is a NEW ordered discoverKnowledge objective per quest.
 * - Repairs are pure string→string / object→object with input EOL preserved;
 *   re-running on already-repaired input is a byte-identical no-op, and an
 *   unexpected drift of any managed entry refuses instead of overwriting.
 */

export const MEDICINE_QUEST_ID = 'quest.round-07-medicine-run';
export const TEASTALL_QUEST_ID = 'quest.r31-teastall-herbal-water';
export const MEDICINE_EVENT_ID = 'event.r271-medicine-delivered';
export const TEASTALL_EVENT_ID = 'event.r271-teastall-delivered';

const MEDICINE_QUEST_DESCRIPTION =
  '镇西几户人家被巷口的刀客惊扰，伤者缺药。替马尚义备齐回春膏，回到镇内告示边按F与他交谈、当面交付三份，他会把药送去安置伤者。';
const TEASTALL_QUEST_DESCRIPTION =
  '入夏后茶棚的凉汤走俏，陆贞娘惯用寒珠草提味败火，岸边湿地的草却被夜雨打烂了一片。替她备来四株，回到茶棚按F与她交谈、当面交付，回头给赶路的药队也留一桶。';

const DELIVERY_QUESTS = [
  {
    questId: MEDICINE_QUEST_ID,
    oldDescription: '镇西几户人家被巷口的刀客惊扰，伤者缺药。替马尚义备齐回春膏，他会把药送去安置伤者。',
    newDescription: MEDICINE_QUEST_DESCRIPTION,
    objective: {
      id: 'objective.r271-medicine-delivery',
      kind: 'discoverKnowledge',
      targetId: MEDICINE_EVENT_ID,
      requiredCount: 1,
      navigationNpcId: 'char.ma-shangyi',
      text: '回马尚义处按F交付回春膏×3（按E看差事名录）',
    },
  },
  {
    questId: TEASTALL_QUEST_ID,
    oldDescription:
      '入夏后茶棚的凉汤走俏，陆贞娘惯用寒珠草提味败火，岸边湿地的草却被夜雨打烂了一片。替她备来四株，回头给赶路的药队也留一桶。',
    newDescription: TEASTALL_QUEST_DESCRIPTION,
    objective: {
      id: 'objective.r271-teastall-delivery',
      kind: 'discoverKnowledge',
      targetId: TEASTALL_EVENT_ID,
      requiredCount: 1,
      navigationNpcId: 'char.lu-zhenniang',
      text: '回茶棚找陆贞娘，按F交付寒珠草×4（按E看差事名录）',
    },
  },
];

/** Round 104 crafting hints pointed at the I catalogue; B is the backpack. */
export const CRAFTING_HINT_FIXES = [
  {
    objectiveId: 'objective.r104-heal',
    oldText: '损耗后按I打开背包，实际使用一剂生肌散（任意品质；无恢复收益会保留药）',
    newText: '损耗后按B打开背包，实际使用一剂生肌散（任意品质；无恢复收益会保留药）',
  },
  {
    objectiveId: 'objective.r104-equip',
    oldText: '按I打开背包，装备锻成的淬锋短剑',
    newText: '按B打开背包，装备锻成的淬锋短剑',
  },
];

export const DELIVERY_DIALOGUES = [
  {
    conversationId: 'dlg.ma-shangyi-notice-board',
    readyOption: {
      text: '三份回春膏备齐了，这就当面交给你送去。',
      nextNodeId: 'r271-medicine-delivered',
      conditions: [
        { kind: 'questStatus', questId: MEDICINE_QUEST_ID, status: 'active' },
        { kind: 'itemCount', itemId: 'item.huichun-gao', minCount: 3 },
        { kind: 'knowledgeKnown', nodeId: MEDICINE_EVENT_ID, isKnown: false },
      ],
      effects: [
        { kind: 'takeItem', itemId: 'item.huichun-gao', quantity: 3 },
        { kind: 'adjustRelationship', npcId: 'char.ma-shangyi', delta: 3 },
        { kind: 'discoverKnowledgeNode', nodeId: MEDICINE_EVENT_ID },
      ],
    },
    progressOption: {
      text: '马叔，送药的差事，药要怎么交给你？',
      nextNodeId: 'r271-medicine-progress',
      conditions: [{ kind: 'questStatus', questId: MEDICINE_QUEST_ID, status: 'active' }],
    },
    echoOption: {
      text: '马叔，上次交去的那批药，伤者用得如何？',
      nextNodeId: 'r271-medicine-echo',
      conditions: [{ kind: 'knowledgeKnown', nodeId: MEDICINE_EVENT_ID }],
    },
    progressNode: {
      id: 'r271-medicine-progress',
      text: '马尚义压平告示：「伤者需要三份回春膏。备齐后回来按F交谈，选交药，我点收后便给几家送去，谢仪也在这里结算。你自己的伤药记得另留，按E可看差事名录。」',
    },
    deliveredNode: {
      id: 'r271-medicine-delivered',
      text: '马尚义当面点清三份回春膏，在旧账上勾了这笔：「三份实收，正好够巷口几家换药。差事这就算结了，谢仪照旧，这份跑腿的情我另记一笔。」',
    },
    echoNode: {
      id: 'r271-medicine-echo',
      text: '马尚义翻着旧账：「你交上来的那三份药都敷到了伤者疮口上，巷口几家总算睡得踏实。往后再想支援，告示上添药那条还作数——那是另算的捐助，不与这趟差事相混。」',
    },
  },
  {
    conversationId: 'dlg.lu-zhenniang-teastall',
    readyOption: {
      text: '贞娘，四株寒珠草备齐了，这就当面交给您。',
      nextNodeId: 'r271-teastall-delivered',
      conditions: [
        { kind: 'questStatus', questId: TEASTALL_QUEST_ID, status: 'active' },
        { kind: 'itemCount', itemId: 'item.hanzhu-cao', minCount: 4 },
        { kind: 'knowledgeKnown', nodeId: TEASTALL_EVENT_ID, isKnown: false },
      ],
      effects: [
        { kind: 'takeItem', itemId: 'item.hanzhu-cao', quantity: 4 },
        { kind: 'adjustRelationship', npcId: 'char.lu-zhenniang', delta: 3 },
        { kind: 'discoverKnowledgeNode', nodeId: TEASTALL_EVENT_ID },
      ],
    },
    progressOption: {
      text: '贞娘，凉汤要用的草，要怎么交给你？',
      nextNodeId: 'r271-teastall-progress',
      conditions: [{ kind: 'questStatus', questId: TEASTALL_QUEST_ID, status: 'active' }],
    },
    echoOption: {
      text: '贞娘，上次交去的草，凉汤熬得如何？',
      nextNodeId: 'r271-teastall-echo',
      conditions: [{ kind: 'knowledgeKnown', nodeId: TEASTALL_EVENT_ID }],
    },
    progressNode: {
      id: 'r271-teastall-progress',
      text: '陆贞娘把茶碗码好：「寒珠草要四株。备齐后回来按F交谈，选交草，我便点收下锅，凉汤的差事也在这里结算。按E可看差事名录。」',
    },
    deliveredNode: {
      id: 'r271-teastall-delivered',
      text: '陆贞娘接过四株寒珠草，一株株抖去根泥：「四株实收，凉汤这就续上。差事算结了，谢仪照旧，这份细心我记在茶账上。」',
    },
    echoNode: {
      id: 'r271-teastall-echo',
      text: '陆贞娘指了指灶上的大桶：「你交来的四株寒珠草都下了汤，赶路的药队也分到了一桶。入夏这口凉汤里有你的一份力气，路过只管来喝。」',
    },
  },
];

export const DELIVERY_NODES = [
  {
    id: MEDICINE_EVENT_ID,
    kind: 'event',
    title: '巷口伤药已当面交付',
    summary:
      '玩家备齐三份回春膏后，在镇内告示边与马尚义按F交谈、当面点清交付；仅此一次交付结案送药差事，普通交谈与只持有药材都不构成交付。',
    knownByDefault: false,
  },
  {
    id: TEASTALL_EVENT_ID,
    kind: 'event',
    title: '茶棚寒珠草已当面交付',
    summary:
      '玩家备齐四株寒珠草后，回茶棚与陆贞娘按F交谈、当面点清交付；仅此一次交付结案凉汤差事，普通交谈与只采买持有都不构成交付。',
    knownByDefault: false,
  },
];

export const DELIVERY_EDGES = [
  {
    id: 'kg.edge.r271-medicine-delivery',
    fromId: MEDICINE_QUEST_ID,
    toId: MEDICINE_EVENT_ID,
    relation: 'rewards',
    summary: '巷口送药差事由马尚义当面点清三份回春膏后结案，并记下这次实际交付。',
  },
  {
    id: 'kg.edge.r271-medicine-delivery-at',
    fromId: MEDICINE_EVENT_ID,
    toId: 'char.ma-shangyi',
    relation: 'locatedAt',
    summary: '巷口伤药在镇内告示边交到马尚义手上。',
  },
  {
    id: 'kg.edge.r271-teastall-delivery',
    fromId: TEASTALL_QUEST_ID,
    toId: TEASTALL_EVENT_ID,
    relation: 'rewards',
    summary: '茶棚凉汤差事由陆贞娘当面点清四株寒珠草后结案，并记下这次实际交付。',
  },
  {
    id: 'kg.edge.r271-teastall-delivery-at',
    fromId: TEASTALL_EVENT_ID,
    toId: 'char.lu-zhenniang',
    relation: 'locatedAt',
    summary: '寒珠草在茶棚当面交到陆贞娘手上。',
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);
function one(array, predicate, label) {
  const found = array.filter(predicate);
  if (found.length !== 1) throw new Error(`${label} 应恰有一项，请人工复核。`);
  return found[0];
}

/** Splices one re-serialized top-level array record back into raw JSON text. */
function spliceRecord(source, arrayKey, id, record, eol) {
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

/** Verified idempotent patch of one managed quest record. Returns raw text. */
export function repairQuestsRaw(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const parsed = JSON.parse(raw);
  let source = raw;
  for (const spec of DELIVERY_QUESTS) {
    const quest = one(parsed.quests, (entry) => entry.id === spec.questId, '任务 ' + spec.questId);
    const delivery = quest.objectives.filter((objective) => objective.id === spec.objective.id);
    const applied =
      delivery.length === 1 &&
      same(delivery[0], spec.objective) &&
      quest.objectives.length === 2 &&
      quest.description === spec.newDescription &&
      quest.orderedObjectives === true;
    if (applied) continue;
    const pristine =
      delivery.length === 0 &&
      quest.description === spec.oldDescription &&
      quest.orderedObjectives === undefined &&
      quest.objectives.length === 1;
    if (!pristine) throw new Error(`任务 ${spec.questId} 交付作者协议已变化，请人工复核。`);
    quest.description = spec.newDescription;
    quest.orderedObjectives = true;
    quest.objectives.push(clone(spec.objective));
    source = spliceRecord(source, 'quests', spec.questId, quest, eol);
  }
  for (const fix of CRAFTING_HINT_FIXES) {
    let touched = null;
    for (const quest of parsed.quests) {
      const objective = quest.objectives.find((entry) => entry.id === fix.objectiveId);
      if (objective === undefined) continue;
      if (touched !== null) throw new Error(`目标 ${fix.objectiveId} 出现多处，请人工复核。`);
      touched = { quest, objective };
    }
    if (touched === null) throw new Error(`制作指导目标 ${fix.objectiveId} 缺失，请人工复核。`);
    const { quest, objective } = touched;
    if (same(objective, { ...objective, text: fix.newText })) continue;
    if (objective.text !== fix.oldText) throw new Error(`制作指导 ${fix.objectiveId} 已变化，请人工复核。`);
    objective.text = fix.newText;
    source = spliceRecord(source, 'quests', quest.id, quest, eol);
  }
  JSON.parse(source);
  return source;
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
 * Verified idempotent patch of the two delivery conversations. Insertions are
 * surgical (append options before the greet options-array close, nodes before
 * the conversation nodes-array close) so hand-compact sibling entries keep
 * their exact bytes; a partial drift refuses instead of being overwritten.
 */
export function repairDialoguesRaw(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const parsed = JSON.parse(raw);
  let result = raw;
  for (const spec of DELIVERY_DIALOGUES) {
    const conversation = one(
      parsed.conversations,
      (entry) => entry.id === spec.conversationId,
      '对话 ' + spec.conversationId,
    );
    const greet = one(conversation.nodes, (node) => node.id === conversation.startNodeId, '对话入口');
    if (!Array.isArray(greet.options) || greet.options.length === 0) {
      throw new Error(`${spec.conversationId} 入口缺少选项。`);
    }
    const wantedOptions = [spec.readyOption, spec.progressOption, spec.echoOption];
    const wantedNodes = [spec.progressNode, spec.deliveredNode, spec.echoNode];
    const exactOptions = greet.options.filter((option) =>
      wantedOptions.some((wanted) => same(option, wanted)),
    );
    const exactNodes = conversation.nodes.filter((node) =>
      wantedNodes.some((wanted) => same(node, wanted)),
    );
    if (exactOptions.length === 3 && exactNodes.length === 3) continue;
    const optionTargets = wantedOptions.map((wanted) => wanted.nextNodeId);
    const nodeIds = wantedNodes.map((wanted) => wanted.id);
    const touchedOption = greet.options.filter((option) => optionTargets.includes(option.nextNodeId));
    const touchedNode = conversation.nodes.filter((node) => nodeIds.includes(node.id));
    if (touchedOption.length !== 0 || touchedNode.length !== 0) {
      throw new Error(`对话 ${spec.conversationId} 交付选项/节点已变化，请人工复核。`);
    }

    // Work on the live text: locate the conversation, its greet node and both
    // array closers, then insert formatted entries without touching siblings.
    const conversationMarker = '"id": ' + JSON.stringify(spec.conversationId);
    const conversationAt = result.indexOf(conversationMarker);
    const conversationStart = result.lastIndexOf('{', conversationAt);
    if (conversationAt < 0 || conversationStart < 0) throw new Error('未找到对话边界。');
    const conversationEnd = matchBracket(result, conversationStart);
    if (conversationEnd < 0) throw new Error('对话括号不匹配。');
    let slice = result.slice(conversationStart, conversationEnd + 1);

    const greetMarker = '"id": ' + JSON.stringify(conversation.startNodeId);
    const greetAt = slice.indexOf(greetMarker);
    const greetStart = slice.lastIndexOf('        {', greetAt);
    const greetEnd = greetAt >= 0 && greetStart >= 0 ? slice.indexOf(eol + '        }', greetAt) : -1;
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

    // The slice edits above shifted offsets; re-locate the conversation block
    // boundary in the (still unmodified) result before splicing it back.
    const updatedConversationAt = result.indexOf(conversationMarker);
    const updatedStart = result.lastIndexOf('{', updatedConversationAt);
    const updatedEnd = matchBracket(result, updatedStart);
    if (updatedConversationAt < 0 || updatedStart < 0 || updatedEnd < 0) throw new Error('对话边界失效。');
    if (!same(JSON.parse(result.slice(updatedStart, updatedEnd + 1)), conversation)) {
      throw new Error('对话边界不匹配。');
    }
    result = result.slice(0, updatedStart) + slice + result.slice(updatedEnd + 1);
    // Mirror the byte-level insertion into the reference tree so the whole
    // document (including earlier iterations) must round-trip exactly.
    for (const wanted of wantedNodes) conversation.nodes.push(clone(wanted));
    for (const wanted of wantedOptions) greet.options.push(clone(wanted));
    if (!same(JSON.parse(result), parsed)) throw new Error('对白输出与纯修复不匹配。');
  }
  return result;
}

/** Verified idempotent upsert of the delivery knowledge nodes and edges. */
export function repairKnowledgeGraph(nodesDoc, edgesDoc) {
  for (const node of DELIVERY_NODES) {
    const existing = nodesDoc.nodes.filter((entry) => entry.id === node.id);
    if (existing.length === 0) {
      nodesDoc.nodes.push(clone(node));
      continue;
    }
    if (existing.length === 1 && same(existing[0], node)) continue;
    throw new Error(`见闻节点 ${node.id} 已存在但内容不符，请人工复核。`);
  }
  for (const edge of DELIVERY_EDGES) {
    const existing = edgesDoc.edges.filter((entry) => entry.id === edge.id);
    if (existing.length === 0) {
      edgesDoc.edges.push(clone(edge));
      continue;
    }
    if (existing.length === 1 && same(existing[0], edge)) continue;
    throw new Error(`见闻边 ${edge.id} 已存在但内容不符，请人工复核。`);
  }
  return { nodesDoc, edgesDoc };
}

/** Expected post-repair shape for tests and the CLI self-check. */
export const R271_DELIVERY_EXPECTATION = {
  deliveryQuestIds: DELIVERY_QUESTS.map((spec) => spec.questId),
  deliveryObjectiveIds: DELIVERY_QUESTS.map((spec) => spec.objective.id),
  eventNodeIds: DELIVERY_NODES.map((node) => node.id),
  edgeIds: DELIVERY_EDGES.map((edge) => edge.id),
};
