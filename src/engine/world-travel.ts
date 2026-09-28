import type { RegionTransitionData, WorldMapAssembly } from './world-map';

/** One declared, one-way region boundary crossed by a world travel route. */
export interface WorldTravelLeg {
  transition: RegionTransitionData;
  fromRegionName: string;
  toRegionName: string;
}

/** Shortest route through the directed region graph, including both regions. */
export interface WorldTravelRoute {
  regionMapResourceIds: string[];
  regionNames: string[];
  legs: WorldTravelLeg[];
}

/**
 * Finds a deterministic minimum-transition route through the declared world.
 * Transitions are directed records; a return trip exists only when the data
 * declares a reverse edge. Equal-length alternatives are ordered by
 * transition id so array reordering cannot change the chosen route.
 */
export function findWorldTravelRoute(
  world: Pick<WorldMapAssembly, 'regions' | 'transitions'>,
  fromMapResourceId: string,
  toMapResourceId: string,
): WorldTravelRoute | null {
  const regions = new Map(world.regions.map((region) => [region.mapResourceId, region]));
  if (!regions.has(fromMapResourceId) || !regions.has(toMapResourceId)) return null;
  if (fromMapResourceId === toMapResourceId) {
    const region = regions.get(fromMapResourceId)!;
    return { regionMapResourceIds: [fromMapResourceId], regionNames: [region.name], legs: [] };
  }

  const outgoing = new Map<string, RegionTransitionData[]>();
  for (const transition of world.transitions) {
    if (!regions.has(transition.from.mapResourceId) || !regions.has(transition.to.mapResourceId)) continue;
    const edges = outgoing.get(transition.from.mapResourceId) ?? [];
    edges.push(transition);
    outgoing.set(transition.from.mapResourceId, edges);
  }
  for (const edges of outgoing.values()) {
    edges.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  }

  const queue = [fromMapResourceId];
  const visited = new Set(queue);
  const previous = new Map<string, { mapResourceId: string; transition: RegionTransitionData }>();
  for (let head = 0; head < queue.length && !visited.has(toMapResourceId); head += 1) {
    const current = queue[head]!;
    for (const transition of outgoing.get(current) ?? []) {
      const next = transition.to.mapResourceId;
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, { mapResourceId: current, transition });
      queue.push(next);
      if (next === toMapResourceId) break;
    }
  }
  if (!visited.has(toMapResourceId)) return null;

  const reverseLegs: WorldTravelLeg[] = [];
  const reverseRegions = [toMapResourceId];
  for (let current = toMapResourceId; current !== fromMapResourceId;) {
    const step = previous.get(current);
    if (step === undefined) return null; // Defensive guard for malformed callers.
    reverseLegs.push({
      transition: step.transition,
      fromRegionName: regions.get(step.mapResourceId)!.name,
      toRegionName: regions.get(current)!.name,
    });
    current = step.mapResourceId;
    reverseRegions.push(current);
  }

  const regionMapResourceIds = reverseRegions.reverse();
  const legs = reverseLegs.reverse();
  return {
    regionMapResourceIds,
    regionNames: regionMapResourceIds.map((mapResourceId) => regions.get(mapResourceId)!.name),
    legs,
  };
}
