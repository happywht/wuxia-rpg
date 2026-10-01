/** Revisit service joins two existing ports after a real discovery; never replaces the land route. */
export const COASTAL_SERVICE_KNOWLEDGE = 'place.r82-east-coast';
export const COASTAL_SERVICES = [
  { id: 'gate.r126-ferry-to-coast', name: '渡籍班船·去青帆埠',
    from: { mapResourceId: 'map.round-10-mist-ferry', col: 18, row: 9 },
    to: { mapResourceId: 'map.round-82-east-coast', col: 87, row: 70 } },
  { id: 'gate.r126-coast-to-ferry', name: '渡籍班船·回雾渡',
    from: { mapResourceId: 'map.round-82-east-coast', col: 88, row: 70 },
    to: { mapResourceId: 'map.round-10-mist-ferry', col: 18, row: 10 } },
].map(service => ({ ...service, fare: 30, travelMinutes: 90,
  requiredKnowledgeNodeId: COASTAL_SERVICE_KNOWLEDGE,
  lockedText: '先经陆路抵达青帆埠，记下港口见闻后开通班船。' }));

export function addCoastalService(world) {
  const ids = new Set(COASTAL_SERVICES.map(service => service.id));
  return { ...world, transitions: [...world.transitions.filter(gate => !ids.has(gate.id)), ...structuredClone(COASTAL_SERVICES)] };
}

export function addCoastalServiceDirections(set) {
  return { ...set, conversations: set.conversations.map(conversation => {
    const speakers = new Set(['dlg.bai-luzhou-ferry-master', 'dlg.zhu-jiuxian-mentor', 'dlg.r83-jin-yunfan-provisions']);
    if (!speakers.has(conversation.id)) return conversation;
    const id = 'r126-coastal-service';
    return { ...conversation, nodes: [
      ...conversation.nodes.filter(node => node.id !== id).map(node => node.id !== conversation.startNodeId ? node : {
        ...node, options: [...(node.options ?? []).filter(option => option.nextNodeId !== id),
          { text: '渡口与青帆之间，有回程班船吗？', nextNodeId: id }],
      }),
      { id, text: '渡籍班船只接熟悉两港的客人：先循陆路越云岭到青帆埠，记下港口见闻，班船才开通。雾雨渡口东侧(18,9)、青帆埠码头(88,70)各有船牌，走到邻格按E。每程30银、90世界分钟，报价读完再确认，Esc可取消；落点受阻或银两不足不扣费。原陆路照旧可走，班船没有沿路调查，也不会替你完成护网差事。',
        options: [{ text: '明白了，我自行安排。', nextNodeId: conversation.startNodeId }] },
    ] };
  }) };
}
