/** Authored optional local transport; walking, actors and challenges stay intact. */
export function addFerryService(world) {
  const map = 'map.round-10-mist-ferry';
  const services = [
    { id: 'gate.r123-ferry-hub-market', name: '芦桥短渡·去旧例集', from: { mapResourceId: map, col: 14, row: 8 }, to: { mapResourceId: map, col: 58, row: 66 }, fare: 8, travelMinutes: 20 },
    { id: 'gate.r123-ferry-market-hub', name: '芦桥短渡·回渡口', from: { mapResourceId: map, col: 58, row: 65 }, to: { mapResourceId: map, col: 14, row: 9 }, fare: 8, travelMinutes: 20 },
  ];
  const present = new Set(world.transitions.map(gate => gate.id));
  return { ...world, transitions: [
    ...world.transitions.map(gate => services.find(service => service.id === gate.id) ?? gate),
    ...services.filter(service => !present.has(service.id)),
  ] };
}
