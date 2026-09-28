import type { CellPosition, GridMap } from './grid-map';
import { findGridPath, findGridPathToAdjacentCell } from './grid-path';
import { selectVisibleWorldLandmarks, type WorldMapAssembly } from './world-map';
import { findWorldTravelRoute } from './world-travel';

export interface WorldNavigationGuideSegment {
  status: 'en-route' | 'at-gate' | 'arrived';
  /** Stable lore id; carried only when the destination is a world landmark. */
  destinationLandmarkId?: string;
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

/** Any addressable destination cell: a landmark, or a projected quest target. */
export interface NavigationDestinationCell {
  mapResourceId: string;
  col: number;
  row: number;
  name: string;
  /** Number of cells from the destination considered reachable; defaults to 2 for landmarks. */
  approachRadius?: number;
}

/**
 * Rebuilds the current local guidance segment for one concrete destination
 * cell. The result is intentionally ephemeral: callers keep only the
 * destination selector and recalculate after each step, region transition or
 * data reload.
 */
export function resolveCellNavigationGuide(
  world: WorldMapAssembly,
  currentMapResourceId: string,
  destination: NavigationDestinationCell,
  map: GridMap,
  playerPosition: CellPosition,
): WorldNavigationGuide {
  const route = findWorldTravelRoute(world, currentMapResourceId, destination.mapResourceId);
  if (route === null) return { status: 'route-broken', destinationName: destination.name };
  const destinationRegionName = world.regions.find(
    (region) => region.mapResourceId === destination.mapResourceId,
  )?.name;
  if (destinationRegionName === undefined) {
    return { status: 'route-broken', destinationName: destination.name };
  }

  const nextLeg = route.legs[0];
  const path = nextLeg === undefined
    ? destination.approachRadius === 1
      // NPC and encounter cells are occupied at runtime but remain walkable
      // in static map data, so route to a real adjacent cell explicitly.
      ? findGridPathToAdjacentCell(map, playerPosition, destination)
      : findGridPath(
        map,
        playerPosition,
        { col: destination.col, row: destination.row },
        { approachRadius: destination.approachRadius ?? 2 },
      )
    : findGridPathToAdjacentCell(map, playerPosition, nextLeg.transition.from);
  if (path === null) return { status: 'route-broken', destinationName: destination.name };

  const status = nextLeg === undefined
    ? (path.length === 1 ? 'arrived' : 'en-route')
    : (path.length === 1 ? 'at-gate' : 'en-route');
  return {
    status,
    destinationName: destination.name,
    destinationRegionName,
    path,
    regionRouteNames: route.regionNames,
    nextTransitionName: nextLeg?.transition.name ?? null,
  };
}

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

  const guide = resolveCellNavigationGuide(
    world,
    currentMapResourceId,
    {
      mapResourceId: landmark.mapResourceId,
      col: landmark.col,
      row: landmark.row,
      name: landmark.name,
      approachRadius: 2,
    },
    map,
    playerPosition,
  );
  if (guide.status === 'target-lost' || guide.status === 'route-broken') return guide;
  return { ...guide, destinationLandmarkId: landmark.id };
}
