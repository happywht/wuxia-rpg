/**
 * Round 129 authoring addition (raw-text surgery, pure, strict, idempotent).
 *
 * The Tiezhang stone-post practice (quest.r43-tiezhang-stone-post) is an
 * ordered three-step errand, but the mentor brief named no coordinates and
 * hid two real traps: the first-step informant Gu Yechen stands in Jiangnan
 * (51,42) — NOT in Iron Ridge — and the second-step roadblock encounter is
 * repeatable, so a historical victory never counts as this round's fight.
 * This addition gives each dialogue one reserved no-effect direction node
 * quoting the exact current world facts: gate (89,15)→(4,7), roadblock
 * (71,63), mentor default (3,1) plus midday (4,1)/dusk (3,2), admission line
 * (level 2, body 11, renown 5, morality ≥ −100, clear-alley prerequisite)
 * and the honest repeatable rule. No mechanics, no thresholds, no economy
 * changes; both options hang on the greet root so the R103/R107/R127
 * replays (which rebuild only their own managed nodes) keep them.
 *
 * Formatting matches JSON.stringify(,2) at the conversation's nesting depth
 * exactly (option object at 12, fields at 14; node object at 8, fields at
 * 10); line endings adapt to the shipped file (LF or CRLF) and are preserved
 * byte-for-byte. The applied state is verified EXACTLY — node text verbatim,
 * exactly one greet link with the exact option text and no extra keys, the
 * node living in its owning conversation with no options/effects/conditions,
 * and no stray copy anywhere else. Any other shape (node without link,
 * duplicate links, edited text, foreign placement) refuses loudly. Includes
 * a one-way exact migration from this round's first wording (which omitted
 * the mentor's default cell) so the already-applied checkout upgrades in
 * place without a broad reformat.
 */
const LEGACY_NODE_TEXT = '石北屈指在桩顶敲了三下：「差事名『石桩回声』，三步有先后，Q日志只认当前这一步。第一步问桩脚：顾夜尘此刻就在江南镇东道旁(51,42)——不在铁嶂，别往山里白跑。第二步实战：由雾雨渡口北门(89,15)过关入铁嶂北道(4,7)，拦路客占着碎岭弯道(71,63)；那伙人是老面孔，账却记新仗——你从前打散过也不抵这一轮，得当场再战一场才算数，伤药带足，挨不起先退，照战规恢复再来。第三步复命：回渡口石桩旁寻我，午间在(4,1)，入暮挪到(3,2)。入门与功夫照实账：等级2、体魄11、江湖声望5、善恶不负百、先清过巷口；桩谱各级攻耗照『门中功夫的门槛与用处』那条自己算，门中不白替你出力气。」';

const BRIEFS = [
  {
    dialogueId: 'dlg.shi-bei-mentor',
    nodeId: 'r129-tiezhang-practice-brief',
    optionText: '这趟石桩差事，请把路和账都说全。',
    nodeText: '石北屈指在桩顶敲了三下：「差事名『石桩回声』，三步有先后，Q日志只认当前这一步。第一步问桩脚：顾夜尘此刻就在江南镇东道旁(51,42)——不在铁嶂，别往山里白跑。第二步实战：由雾雨渡口北门(89,15)过关入铁嶂北道(4,7)，拦路客占着碎岭弯道(71,63)；那伙人是老面孔，账却记新仗——你从前打散过也不抵这一轮，得当场再战一场才算数，伤药带足，挨不起先退，照战规恢复再来。第三步复命：回渡口石桩旁寻我，平日在(3,1)，午间在(4,1)，入暮挪到(3,2)。入门与功夫照实账：等级2、体魄11、江湖声望5、善恶不负百、先清过巷口；桩谱各级攻耗照『门中功夫的门槛与用处』那条自己算，门中不白替你出力气。」',
  },
  {
    dialogueId: 'dlg.gu-yechen-roadside',
    nodeId: 'r129-gu-iron-route',
    optionText: '问桩之后，碎岭那段怎么走？',
    nodeText: '顾夜尘用刀鞘往北一指：「桩脚问完，下一程是碎岭实战：先到雾雨渡口北门(89,15)过关，落点就是铁嶂北道(4,7)，拦路客占着碎岭弯道(71,63)。那伙人是老面孔，账却记新仗——你从前打散过也不算这次，得当场再战一场才算数。头目筋骨硬、力气沉，伤药带足；挨不起就先退，恢复好了再来，没人笑话第二趟。」',
  },
];

const eolOf = (raw) => (raw.includes('\r\n') ? '\r\n' : '\n');
const count = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * Adds both reserved brief nodes to the round-03 raw text. Idempotent with an
 * EXACT applied-state check; migrates this round's first wording once;
 * refuses every other drifted shape without touching the input.
 */
export function addIronPracticeBriefs(raw) {
  JSON.parse(raw);
  const eol = eolOf(raw);
  let out = raw;
  for (const brief of BRIEFS) {
    out = addOne(out, brief, eol);
  }
  const set = JSON.parse(out);
  for (const brief of BRIEFS) {
    const owners = set.conversations.filter(c => c.id === brief.dialogueId);
    if (owners.length !== 1) throw new Error('简报归属对话变化。');
    const c = owners[0], nodes = c.nodes.filter(n => n.id === brief.nodeId);
    const expected = { id: brief.nodeId, text: brief.nodeText };
    if (nodes.length !== 1 || JSON.stringify(nodes[0]) !== JSON.stringify(expected)) throw new Error('简报节点协议变化。');
    const links = c.nodes.flatMap(n => (n.options ?? []).filter(o => o.nextNodeId === brief.nodeId).map(o => ({ node: n.id, option: o })));
    if (c.startNodeId !== 'greet' || links.length !== 1 || links[0].node !== c.startNodeId || JSON.stringify(links[0].option) !== JSON.stringify({ text: brief.optionText, nextNodeId: brief.nodeId })) throw new Error('简报入口协议变化。');
  }
  return out;
}

function addOne(raw, brief, eol) {
  const nodeIds = count(raw, `"id": "${brief.nodeId}"`);
  if (nodeIds > 1) throw new Error(`${brief.nodeId} 出现 ${nodeIds} 次，请人工复核。`);

  const dialogueAnchor = `"id": "${brief.dialogueId}",`;
  if (count(raw, dialogueAnchor) !== 1) throw new Error(`${brief.dialogueId} 对话应恰有一处。`);
  const dialogueStart = raw.indexOf(dialogueAnchor);
  const after = raw.slice(dialogueStart);
  const nodesClose = after.indexOf(`${eol}      ]`);
  if (nodesClose < 0) throw new Error(`${brief.dialogueId} 的节点数组收尾未找到。`);
  const conversation = after.slice(0, nodesClose);

  if (nodeIds === 1) {
    // Applied (or legacy) state: verify EXACTLY, then migrate legacy text.
    verifyApplied(conversation, brief, eol);
    if (conversation.includes(JSON.stringify(brief.nodeText))) return raw; // Exact hit.
    if (conversation.includes(JSON.stringify(LEGACY_NODE_TEXT))) {
      return replaceNodeText(raw, brief, LEGACY_NODE_TEXT, brief.nodeText);
    }
    throw new Error(`${brief.nodeId} 文本与已授权内容不符，请人工复核。`);
  }

  // Not applied: a greet link without its node is half-applied drift.
  if (conversation.includes(`"nextNodeId": "${brief.nodeId}"`)) {
    throw new Error(`${brief.dialogueId} 已有指向 ${brief.nodeId} 的选项但节点缺失，属半应用漂移，请人工复核。`);
  }

  const greetAt = conversation.indexOf('"id": "greet",');
  if (greetAt < 0) throw new Error(`${brief.dialogueId} 缺少 greet 根节点。`);
  const greetOptionsClose = conversation.indexOf(`${eol}          ]`, greetAt);
  if (greetOptionsClose < 0) throw new Error(`${brief.dialogueId} 的 greet 选项数组收尾未找到。`);
  const optionBlock = [
    `,`,
    `            {`,
    `              "text": ${JSON.stringify(brief.optionText)},`,
    `              "nextNodeId": "${brief.nodeId}"`,
    `            }`,
  ].join(eol);
  const nodeBlock = [
    `,`,
    `        {`,
    `          "id": "${brief.nodeId}",`,
    `          "text": ${JSON.stringify(brief.nodeText)}`,
    `        }`,
  ].join(eol);
  const patched = conversation.slice(0, greetOptionsClose) + optionBlock + conversation.slice(greetOptionsClose) + nodeBlock;
  return raw.slice(0, dialogueStart) + patched + after.slice(nodesClose);
}

/** The exact applied shape: one node in THIS conversation with verbatim text, one plain greet link, nothing else. */
function verifyApplied(conversation, brief, eol) {
  // The node must live in its owning conversation (a foreign copy elsewhere
  // in the file was already rejected by the >1 check; here the local window
  // must actually contain it).
  if (!conversation.includes(`"id": "${brief.nodeId}"`)) {
    throw new Error(`${brief.nodeId} 不在 ${brief.dialogueId} 内（外来节点），请人工复核。`);
  }
  if (!conversation.includes(JSON.stringify(brief.nodeText)) && !conversation.includes(JSON.stringify(LEGACY_NODE_TEXT))) {
    throw new Error(`${brief.nodeId} 文本被改动，请人工复核。`);
  }
  const linkCount = count(conversation, `"nextNodeId": "${brief.nodeId}"`);
  if (linkCount !== 1) {
    throw new Error(`${brief.dialogueId} 指向 ${brief.nodeId} 的选项应恰有一条，实际 ${linkCount} 条，请人工复核。`);
  }
  const expectedPair = `"text": ${JSON.stringify(brief.optionText)},${eol}              "nextNodeId": "${brief.nodeId}"`;
  if (!conversation.includes(expectedPair)) {
    throw new Error(`${brief.nodeId} 的入口选项文本被改动，请人工复核。`);
  }
}

/** Replaces the node's text value verbatim; nothing else moves. */
function replaceNodeText(raw, brief, fromText, toText) {
  const from = `"text": ${JSON.stringify(fromText)}`;
  const to = `"text": ${JSON.stringify(toText)}`;
  if (count(raw, from) !== 1) throw new Error(`${brief.nodeId} 旧文本锚点应恰有一处。`);
  return raw.replace(from, to);
}

export const IRON_PRACTICE_BRIEF_IDS = BRIEFS.map(brief => brief.nodeId);
