/**
 * Round 130 authoring addition (raw-text surgery, pure, strict, idempotent).
 *
 * The Hanshan copybook practice (quest.r43-hanshan-copybook「副页留白」) is an
 * ordered three-step errand — Shen Mohan verifies the paper, the traveller
 * revisits the old boundary mark in Snow-Pine Valley, Liu Tinglan takes the
 * report — but the existing mentor lines name no cells, no gate minutes, no
 * climate cost, and never separate OLD-knowledge reconciliation from THIS
 * round's field revisit (the discoverKnowledge target place.r93-old-mark may
 * already be known: the ordered objective may advance from that record
 * without requiring a new event). Paper age and boundary-mark date
 * stay two different accounts: the mark proves when the stone was raised,
 * never when the ink was laid.
 *
 * Two reserved no-effect direction nodes quote the exact current world facts:
 * Shen at Jiangnan (45,37) midday/dusk; the full gate chain Jiangnan → ferry
 * north gate (89,15) → Iron Ridge (4,7) → north (50,2) into Cloud Ridge →
 * (62,2) into Cloud North Terrace (50,97) → (50,2) into North Pass (50,97) →
 * (3,64) into Snow-Pine Valley (96,50), mark at valley-west (24,32) — five
 * gates from the ferry north gate (225 minutes), six from Jiangnan (270).
 * Gates cost 45 travel minutes each (walking excluded; snow +2, mist +1,
 * clear +0 on the 1-minute base step); Liu's report cell (48,43) with midday
 * (49,43)/dusk (48,43); the honest backfill-vs-revisit rule; and the Hanshan
 * admission line exactly as authored (level ≥1, insight ≥8, morality ≥5,
 * renown ≥0, teacher relationship ≥5, no prerequisite errand).
 *
 * Liu's conversation lives in round-30, Shen's in round-03;
 * both options hang on the greet root BEFORE the managed R128 tail (R128's
 * wicket link on Liu, nothing managed on Shen), which all cross-round
 * replays rebuild only their own nodes/links. The applied state is verified
 * EXACTLY (verbatim text, exactly one link with the exact option pair, node
 * in its owning conversation, no options/effects/conditions on either side);
 * every other shape refuses loudly. Line endings adapt per file and are
 * preserved.
 */
const BRIEFS = [
  {
    file: 'round-03',
    dialogueId: 'dlg.shen-mohan-bookshop',
    nodeId: 'r130-hanshan-paper-route',
    optionText: '纸验过了，北境那段路请再说细些。',
    nodeText: '沈墨涵取出一页自用的路程单：「核纸之后可往霜松谷核看，到谷西旧界标(24,32)跟前比对——这差事名『副页留白』，Q日志只认当前一步。从镇上石阶渡口(90,50)到雾雨渡口，再由渡口北门(89,15)过关入铁嶂北道(4,7)，北上铁嶂(50,2)入云岭古道，再北上(62,2)入云北台地(50,97)，台地北端(50,2)入北隘(50,97)，北隘西口(3,64)过关便是霜松谷东口(96,50)——从渡口北门起五处关口，每处按日程45分钟、共225分钟；从镇上起还要加石阶渡口一关，共六关270分钟，只算过关不算步行；步行基础每格1分钟，落雪每格再加2分钟、轻雾加1分钟，晴天不另加。旧见闻若已记过界标，任务会用旧知识补齐界标目标，无需再次触发见闻；若要核对现场，仍可沿路复访，旧账回填与本轮亲眼核看应分开记，已知界标不会重复发奖。北境天寒路长，伤药按实价备足，我不赊账也不代购。」',
  },
  {
    file: 'round-30',
    dialogueId: 'dlg.liu-tinglan-mentor',
    nodeId: 'r130-hanshan-practice-brief',
    optionText: '副页这一程，请先生把路和证据边界说全。',
    nodeText: '柳听澜提笔在副页边缘画了三个圈：「差事名『副页留白』，三步有先后，Q日志只认当前这一步。第一步核纸：沈墨涵就在镇东书铺(45,37)，午间暮间都不挪摊。第二步实访：霜松谷西的旧界标(24,32)——由镇上石阶渡口(90,50)入雾雨渡口，再经渡口北门(89,15)入铁嶂(4,7)，北上(50,2)入云岭，(62,2)入云北台地(50,97)，(50,2)入北隘(50,97)，北隘西口(3,64)过关即霜松谷东口(96,50)；从渡口北门起五关各45分钟共225分钟；从镇上起六关270分钟，均不含步行；步行每格1分钟，落雪每格再加2、轻雾加1、晴不加。若你旧年已记过这界标，任务会据旧知识补齐这一目标，已知界标不会重复发奖；要再核现场便照路复访，回填与新访各记各的，不互相冒充。第三步复命：回讲书堂寻我，平日在(48,43)，午间在(49,43)。两笔账也再说一遍：碑上的年头是立碑的年头，纸上的年头是落笔的年头，拿界刻断纸龄，断不得。寒山入门照实账：等级1、悟性8、善恶5、与我关系5，江湖声望至少0；入门后可接这门实践，核纸、查界、复命照先后办理。」',
  },
];

const eolOf = (raw) => (raw.includes('\r\n') ? '\r\n' : '\n');
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** Adds the file's brief to its raw text; idempotent exact-hit returns input. */
export function addHanshanBriefs(raw, file) {
  JSON.parse(raw);
  const eol = eolOf(raw);
  const brief = BRIEFS.find(candidate => candidate.file === file);
  if (brief === undefined) throw new Error(`round130：文件 ${file} 没有匹配的简报配置。`);
  const out = addOne(raw, brief, eol);
  const set = JSON.parse(out);
  const owners = set.conversations.filter(c => c.id === brief.dialogueId);
  if (owners.length !== 1) throw new Error('简报归属对话变化。');
  const c = owners[0];
  const nodes = set.conversations.flatMap(owner => owner.nodes.filter(n => n.id === brief.nodeId).map(n => ({ owner: owner.id, node: n })));
  if (nodes.length !== 1 || nodes[0].owner !== brief.dialogueId || JSON.stringify(nodes[0].node) !== JSON.stringify({ id: brief.nodeId, text: brief.nodeText })) throw new Error('简报节点协议变化。');
  const links = set.conversations.flatMap(owner => owner.nodes.flatMap(n => (n.options ?? []).filter(o => o.nextNodeId === brief.nodeId).map(o => ({ owner: owner.id, node: n.id, option: o }))));
  if (c.startNodeId !== 'greet' || links.length !== 1 || links[0].owner !== brief.dialogueId || links[0].node !== 'greet' || JSON.stringify(links[0].option) !== JSON.stringify({ text: brief.optionText, nextNodeId: brief.nodeId })) throw new Error('简报入口协议变化。');
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
    verifyApplied(conversation, brief, eol);
    if (conversation.includes(JSON.stringify(brief.nodeText))) return raw; // Exact hit.
    throw new Error(`${brief.nodeId} 文本与已授权内容不符，请人工复核。`);
  }

  // Not applied: a live link without its node is half-applied drift.
  if (conversation.includes(`"nextNodeId": "${brief.nodeId}"`)) {
    throw new Error(`${brief.dialogueId} 已有指向 ${brief.nodeId} 的选项但节点缺失，属半应用漂移，请人工复核。`);
  }
  const greetAt = conversation.indexOf('"id": "greet",');
  if (greetAt < 0) throw new Error(`${brief.dialogueId} 缺少 greet 根节点。`);
  const greetOptionsClose = conversation.indexOf(`${eol}          ]`, greetAt);
  if (greetOptionsClose < 0) throw new Error(`${brief.dialogueId} 的 greet 选项数组收尾未找到。`);
  const optionBlock = [
    `            {`,
    `              "text": ${JSON.stringify(brief.optionText)},`,
    `              "nextNodeId": "${brief.nodeId}"`,
    `            }`,
  ].join(eol);
  const nodeBlock = [
    `        {`,
    `          "id": "${brief.nodeId}",`,
    `          "text": ${JSON.stringify(brief.nodeText)}`,
    `        }`,
  ].join(eol);
  // Insert BEFORE the managed tail when this file has one: the committed
  // R128 transform re-splices its wicket link to the greet tail (and its node
  // to the nodes tail), so anything placed after it would break R128's
  // same()-based byte stability. Before it, the rebuild is a no-op.
  const managedTailLink = conversation.indexOf(`"nextNodeId": "r128-west-wicket"`, greetAt);
  const optionInsertAt = managedTailLink >= 0 && managedTailLink < greetOptionsClose
    ? conversation.lastIndexOf(`${eol}            {`, managedTailLink)
    : greetOptionsClose;
  if (optionInsertAt < 0) throw new Error(`${brief.dialogueId} 的插入锚未找到。`);
  // Anchors point at the eol before an existing block (or the array close);
  // normalize any trailing separator, then splice `,eol+block` cleanly.
  // Before a managed block the ORIGINAL separator was a trailing comma —
  // strip it, place ours before the new block and restore one after it; at
  // an array close there is no trailing comma, so only ours-before remains.
  const optionBeforeBlock = conversation.slice(0, optionInsertAt);
  const optionsPatched = optionBeforeBlock.endsWith(',')
    ? `${optionBeforeBlock}${eol}${optionBlock},${conversation.slice(optionInsertAt)}`
    : `${optionBeforeBlock},${eol}${optionBlock}${conversation.slice(optionInsertAt)}`;
  const managedTailNode = optionsPatched.indexOf(`"id": "r128-west-wicket"`);
  const nodeInsertAt = managedTailNode >= 0
    ? optionsPatched.lastIndexOf(`${eol}        {`, managedTailNode)
    : optionsPatched.length; // Conversation tail: append as the last node.
  if (nodeInsertAt < 0) throw new Error(`${brief.dialogueId} 的节点插入锚未找到。`);
  const nodeBeforeBlock = optionsPatched.slice(0, nodeInsertAt);
  const patched = nodeBeforeBlock.endsWith(',')
    ? `${nodeBeforeBlock}${eol}${nodeBlock},${optionsPatched.slice(nodeInsertAt)}`
    : `${nodeBeforeBlock},${eol}${nodeBlock}${optionsPatched.slice(nodeInsertAt)}`;
  return raw.slice(0, dialogueStart) + patched + after.slice(nodesClose);
}

/** Exact applied shape: verbatim text, one plain link with the exact pair, node owned here. */
function verifyApplied(conversation, brief, eol) {
  if (!conversation.includes(`"id": "${brief.nodeId}"`)) {
    throw new Error(`${brief.nodeId} 不在 ${brief.dialogueId} 内（外来节点），请人工复核。`);
  }
  if (!conversation.includes(JSON.stringify(brief.nodeText))) {
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

export const HANSHAN_BRIEF_IDS = BRIEFS.map(brief => brief.nodeId);
