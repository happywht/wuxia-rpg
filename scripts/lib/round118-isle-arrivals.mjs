/**
 * Round 118 authoring repair: the four isle arrival records must fire from
 * every real inbound gate, not only from the one historical landing cell.
 *
 * Reuses the Round 116 arrivalTransitionIds protocol. Each spec pins the
 * event's preserved id/step-cell/once/knowledge, the complete list of actual
 * inbound gates and a gate-neutral arrival text (no direction-of-approach or
 * time-of-day claims that only one landing could make true). The repair is
 * idempotent, only ever touches the four event rows, and refuses to run on
 * worlds whose event/gate references do not match the authored reality.
 */
const ARRIVALS = [
  {
    eventId: 'event.r84-arrival',
    mapResourceId: 'map.round-84-windward-isle',
    knowledgeId: 'place.r84-windward-isle',
    col: 2,
    row: 50,
    gates: ['gate.r84-east-coast-to-windward-isle', 'gate.r85-tide-isle-to-windward-isle', 'gate.r97-lanxin-to-windward'],
    text: '风回岛在潮光里铺开：细沙滩脊一路向东坡收拢，坡上隐约立着一座白石灯标。',
  },
  {
    eventId: 'event.r85-arrival',
    mapResourceId: 'map.round-85-tide-isle',
    knowledgeId: 'place.r85-tide-isle',
    col: 2,
    row: 50,
    gates: ['gate.r85-windward-isle-to-tide-isle', 'gate.r94-south-to-tide', 'gate.r97-lanxin-to-tide'],
    text: '潮生屿在潮光里显出层层叠叠的礁脊，松林深处升起一缕炊烟，滩上水线层层退去又涨回。',
  },
  {
    eventId: 'event.r97-lanxin-arrival',
    mapResourceId: 'map.round-97-lanxin-isle',
    knowledgeId: 'place.r97-lanxin-isle',
    col: 7,
    row: 40,
    gates: ['gate.r97-windward-to-lanxin', 'gate.r97-tide-to-lanxin', 'gate.r97-pilot-to-lanxin'],
    text: '澜心洲在潮线间铺开，三道岔脊一路向岛心收拢。湾里泊着候潮的旧船，桅灯未点，缆绳却都收得利落。',
  },
  {
    eventId: 'event.r97-pilot-arrival',
    mapResourceId: 'map.round-97-pilot-reef',
    knowledgeId: 'place.r97-pilot-reef',
    col: 50,
    row: 92,
    gates: ['gate.r97-lanxin-to-pilot', 'gate.r97-east-to-pilot'],
    text: '引航礁在眼前铺开，黑礁连成一线，栈道自南向北直贯礁心。风里有一缕灯油味，航标就在礁脊某处亮着。',
  },
];

export function repairIsleArrivals(world) {
  // Only the four event rows change; do not expand/copy the layered atlas.
  const result = { ...world, events: world.events.map(event => ({ ...event })) };
  for (const spec of ARRIVALS) {
    const events = result.events.filter(event => event.id === spec.eventId);
    if (events.length !== 1) throw new Error(`入场事件 ${spec.eventId} 应恰好有一项。`);
    const event = events[0];
    if (event.mapResourceId !== spec.mapResourceId) throw new Error(`入场事件 ${spec.eventId} 地区与 authored 实际不符。`);
    const gates = result.transitions.filter(gate => spec.gates.includes(gate.id));
    if (gates.length !== spec.gates.length || new Set(gates.map(gate => gate.id)).size !== spec.gates.length || result.transitions.some(gate => gate.to.mapResourceId === spec.mapResourceId && !spec.gates.includes(gate.id))) throw new Error(`入场事件 ${spec.eventId} 的入站关口清单与 authored 实际不符。`);
    for (const gate of gates) {
      if (gate.to.mapResourceId !== spec.mapResourceId) throw new Error(`关口 ${gate.id} 并不通向 ${spec.mapResourceId}。`);
    }
    if (event.once !== true || event.interaction !== undefined || event.discoverKnowledgeNodeId !== spec.knowledgeId) {
      throw new Error(`入场事件 ${spec.eventId} 协议已变化，请人工复核。`);
    }
    // Preserve the historical step cell used by the original landing route.
    event.col = spec.col;
    event.row = spec.row;
    event.text = spec.text;
    event.arrivalTransitionIds = [...spec.gates];
  }
  return result;
}
