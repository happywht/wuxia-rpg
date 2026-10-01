/** Authoring repair: a real arrival should not require walking back to an arbitrary cell. */
export function repairEastArrival(world) {
  // Only the event row changes; do not expand/copy the entire layered atlas.
  const result = { ...world, events: world.events.map(event => ({ ...event })) };
  const events = result.events.filter(event => event.id === 'event.r94-east-arrival');
  const gates = result.transitions.filter(gate => gate.id === 'gate.r94-terrace-to-east');
  if (events.length !== 1 || gates.length !== 1) throw new Error('天门关入场事件/东脊关口应各有一项。');
  const event = events[0];
  const landing = gates[0].to;
  if (landing.mapResourceId !== event.mapResourceId) throw new Error('东脊关口与入场事件地区不符。');
  if (event.once !== true || event.interaction !== undefined || event.discoverKnowledgeNodeId !== 'place.r94-east-gate') {
    throw new Error('天门关入场协议已变化，请人工复核。');
  }
  // Preserve the historical step point used by the woodland return route.
  event.col = 6;
  event.row = 50;
  event.arrivalTransitionIds = [gates[0].id];
  return result;
}
