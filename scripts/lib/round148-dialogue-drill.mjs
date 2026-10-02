/** Author layer: retain stable start-node ordering and refuse altered drill content. */
export function addDialogueDrill(conversation) {
  if (conversation.id !== 'dlg.r93-liu-xunjing-rounds') return conversation;
  const greet = conversation.nodes.find(node => node.id === conversation.startNodeId);
  if (!greet?.options) throw Error('合练首节点选项不存在');
  const node = { id: 'r148-drill-start', text: '柳寻径收起巡簿：「只练护路时的进退，不替旧碑断代，也不拿合练当差事报酬。准备好了便动手，想歇随时示意。」' };
  const option = { text: '现在请巡路人合练一场（立即战斗；无经验、银两或物品报酬，可撤退）。', nextNodeId: node.id, effects: [{ kind: 'startBattle', encounterId: 'encounter.r142-patrol-drill' }] };
  const oldNode = conversation.nodes.find(entry => entry.id === node.id);
  const oldOption = greet.options.find(entry => entry.nextNodeId === node.id);
  if ((oldNode && JSON.stringify(oldNode) !== JSON.stringify(node)) || (oldOption && JSON.stringify(oldOption) !== JSON.stringify(option))) throw Error('拒绝覆盖改动过的对白合练入口');
  conversation.nodes = [...conversation.nodes.filter(entry => entry.id !== node.id), node];
  if (!oldOption) greet.options.unshift(option);
  // Only our option changes position; historical nodes retain their original order.
  greet.options = [option, ...greet.options.filter(entry => entry.nextNodeId !== node.id)];
  return conversation;
}
