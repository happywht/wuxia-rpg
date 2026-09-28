import type { CellPosition, GridMap } from './grid-map';
import { findGridPath, findGridPathToAdjacentCell } from './grid-path';
import { selectVisibleWorldLandmarks, type WorldMapAssembly } from './world-map';
import { findWorldTravelRoute } from './world-travel';

export interface WorldNavigationGuideSegment {
  status: 'en-route' | 'at-gate' | 'arrived';
  destinationLandmarkId: string;
  destinationName: string;
  destinationRegionName: string;
  /** Current map's cell path, ending at a landmark or beside its next gate. */
  path: CellPosition[];
  /** Remaining region sequence beginning with the player's current region. */
  regionRouteNames: string[];
  nextTransitionName: string | null;
}

export type WorldNavigationGuide = WorldNavigationGuideSegment
  | { status: 'target-lost' }
  | { status: 'route-broken'; destinationName: string };

/**
 * Rebuilds the current local guidance segment for a stable discovered landmark.
 * The result is intentionally ephemeral: callers keep only the landmark id and
 * recalculate after each step, region transition, or data reload.
 */
export function resolveWorldNavigationGuide(
  world: WorldMapAssembly,
  currentMapResourceId: string,
  destinationLandmarkId: string,
  knownKnowledgeNodeIds: ReadonlySet<string>,
  map: GridMap,
  playerPosition: CellPosition,
): WorldNavigationGuide {
  const landmark = selectVisibleWorldLandmarks(world.landmarks, knownKnowledgeNodeIds)
    .find((candidate) => candidate.id === destinationLandmarkId);
  if (landmark === undefined) return { status: 'target-lost' };

  const route = findWorldTravelRoute(world, currentMapResourceId, landmark.mapResourceId);
  if (route === null) return { status: 'route-broken', destinationName: landmark.name };
  const destinationRegionName = world.regions.find(
    (region) => region.mapResourceId === landmark.mapResourceId,
  )?.name;
  if (destinationRegionName === undefined) {
    return { status: 'route-broken', destinationName: landmark.name };
  }

  const nextLeg = route.legs[0];
  const path = nextLeg === undefined
    ? findGridPath(map, playerPosition, { col: landmark.col, row: landmark.row }, { approachRadius: 2 })
    : findGridPathToAdjacentCell(map, playerPosition, nextLeg.transition.from);
  if (path === null) return { status: 'route-broken', destinationName: landmark.name };

  const status = nextLeg === undefined
    ? (path.length === 1 ? 'arrived' : 'en-route')
    : (path.length === 1 ? 'at-gate' : 'en-route');
  return {
    status,
    destinationLandmarkId: landmark.id,
    destinationName: landmark.name,
    destinationRegionName,
    path,
    regionRouteNames: route.regionNames,
    nextTransitionName: nextLeg?.transition.name ?? null,
  };
}
