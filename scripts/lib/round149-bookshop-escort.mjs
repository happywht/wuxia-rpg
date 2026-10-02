export const escortNode = { id: 'r149-escort-confirm', text: '沈墨涵指了指铺外的路：「可托熟识的行脚人带你到雾雨渡口西口旁（2,5），全程两小时，不收银两；只带路，不替你交差、打斗或断定抄本来历。想好再答应，不走也无妨。」', options: [
  { text: '先不走，继续在镇上办事。', nextNodeId: 'greet' },
  { text: '请带我到雾雨渡口西口旁（耗时120分钟，无银费）。', nextNodeId: 'r149-escort-arrived', effects: [{ kind: 'teleport', mapResourceId: 'map.round-10-mist-ferry', col: 2, row: 5, travelMinutes: 120 }] },
] };
export const escortArrived = { id: 'r149-escort-arrived', text: '行脚人送你到了雾雨渡口西口旁。原有差事与同行仍待你亲自处理，回镇可从西口乘行。' };
export const escortOption = { text: '掌柜可否托人带路到雾雨渡口？（120分钟，无银费，先确认）', nextNodeId: escortNode.id, conditions: [{ kind: 'knowledgeKnown', nodeId: 'map.round-10-mist-ferry' }] };

/** Add only this layer; unrelated prose, option order and ids remain intact. */
export function addBookshopEscort(conversation) {
  if (conversation.id !== 'dlg.shen-mohan-bookshop') return conversation;
  const greet = conversation.nodes.find(node => node.id === conversation.startNodeId);
  if (!greet?.options) throw Error('书铺首节点选项不存在');
  for (const expected of [escortNode, escortArrived]) {
    const previous = conversation.nodes.find(node => node.id === expected.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(expected)) throw Error('拒绝覆盖已改动的引路节点');
    if (!previous) conversation.nodes.push(structuredClone(expected));
  }
  const previous = greet.options.find(option => option.nextNodeId === escortOption.nextNodeId);
  if (previous && JSON.stringify(previous) !== JSON.stringify(escortOption)) throw Error('拒绝覆盖已改动的引路选项');
  if (!previous) greet.options.push(structuredClone(escortOption));
  return conversation;
}

/** Retain unrelated author bytes; parsed equality is checked before any write. */
export function patchBookshopEscortRaw(original) {
  const expected = JSON.parse(original);
  const talk = expected.conversations.find(entry => entry.id === 'dlg.shen-mohan-bookshop');
  if (!talk) throw Error('引路人物对白不存在');
  const hadNode = talk.nodes.some(node => node.id === escortNode.id);
  const hadOption = talk.nodes.find(node => node.id === talk.startNodeId)?.options?.some(option => option.nextNodeId === escortNode.id);
  const hadArrived = talk.nodes.some(node => node.id === escortArrived.id);
  addBookshopEscort(talk);
  if (hadNode && hadArrived && hadOption) return original;
  if (hadNode || hadArrived || hadOption) throw Error('引路作者层不完整，拒绝猜测修补');
  const talkOffset = original.indexOf('"id": "dlg.shen-mohan-bookshop"');
  const nodesOpen = original.indexOf('[', original.indexOf('"nodes"', talkOffset));
  const greetOffset = original.indexOf('"id": "greet"', nodesOpen);
  const optionsOpen = original.indexOf('[', original.indexOf('"options"', greetOffset));
  const arrayEnd = open => {
    if (open < 0) throw Error('作者数组定位失败');
    let depth = 0, quoted = false, escaped = false;
    for (let i = open; i < original.length; i++) {
      const char = original[i];
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === '[') depth++;
      else if (char === ']' && --depth === 0) return i;
    }
    throw Error('作者数组未闭合');
  };
  const insertion = (open, values, indent) => {
    let at = arrayEnd(open);
    while (/\s/.test(original[at - 1] ?? '')) at--;
    return { at, text: ',\n' + values.map(value => JSON.stringify(value, null, 2).split('\n').map(line => ' '.repeat(indent) + line).join('\n')).join(',\n') };
  };
  let result = original;
  for (const edit of [insertion(nodesOpen, [escortNode, escortArrived], 8), insertion(optionsOpen, [escortOption], 12)].sort((a, b) => b.at - a.at)) result = result.slice(0, edit.at) + edit.text + result.slice(edit.at);
  if (JSON.stringify(JSON.parse(result)) !== JSON.stringify(expected)) throw Error('引路作者结果不符合完整结构，拒绝写入');
  return result;
}
