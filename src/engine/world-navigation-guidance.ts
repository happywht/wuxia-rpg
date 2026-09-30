import type { CellPosition, GridMap } from './grid-map';
import { findGridPath, findGridPathToAdjacentCell, type GridPathSurface } from './grid-path';
import { selectVisibleWorldLandmarks, type WorldMapAssembly } from './world-map';
import { findWorldTravelRoute } from './world-travel';

/**
 * Generic, content-free control hint for a reached quest destination. The
 * engine knows only which existing control applies — never the character,
 * place or story behind the objective (see docs/ARCHITECTURE.md).
 */
export type NavigationArrivalAction = 'talk' | 'battle' | 'discover' | 'shop' | 'craft' | 'travel' | 'companion';

export interface WorldNavigationGuideSegment {
  status: 'en-route' | 'at-gate' | 'arrived';
  /** Stable lore id; carried only when the destination is a world landmark. */
  destinationLandmarkId?: string;
  /** Control hint carried from quest targets; landmarks leave this unset. */
  arrivalAction?: NavigationArrivalAction;
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
  | { status: 'route-blocked'; destinationName: string }
  | { status: 'route-broken'; destinationName: string };

/** Any addressable destination cell: a landmark, or a projected quest target. */
export interface NavigationDestinationCell {
  mapResourceId: string;
  col: number;
  row: number;
  name: string;
  /** Number of cells from the destination considered reachable; defaults to 2 for landmarks. */
  approachRadius?: number;
  /** Control hint surfaced by the HUD once the guide reports 'arrived'. */
  arrivalAction?: NavigationArrivalAction;
}

/** Applies live occupants without mutating the authored map or persisted data. */
function withNavigationBlockers(
  map: GridMap,
  blockedCells: ReadonlySet<string> | undefined,
): GridPathSurface {
  if (blockedCells === undefined || blockedCells.size === 0) return map;
  return {
    columns: map.columns,
    rows: map.rows,
    inBounds: (col, row) => map.inBounds(col, row),
    canEnter: (col, row) => map.canEnter(col, row) && !blockedCells.has(`${col},${row}`),
  };
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
  blockedCells?: ReadonlySet<string>,
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
  const navigationMap = withNavigationBlockers(map, blockedCells);
  const findPath = (surface: GridPathSurface) => nextLeg === undefined
    ? destination.approachRadius === 1
      // NPC and encounter cells are occupied at runtime but remain walkable
      // in static map data, so route to a real adjacent cell explicitly.
      ? findGridPathToAdjacentCell(surface, playerPosition, destination)
      : findGridPath(
        surface,
        playerPosition,
        { col: destination.col, row: destination.row },
        { approachRadius: destination.approachRadius ?? 2 },
      )
    : findGridPathToAdjacentCell(surface, playerPosition, nextLeg.transition.from);
  const path = findPath(navigationMap);
  if (path === null) {
    // Distinguish a blocked corridor that may open on the next NPC schedule
    // or encounter update from a destination disconnected by the map itself.
    if (blockedCells !== undefined && blockedCells.size > 0 && findPath(map) !== null) {
      return { status: 'route-blocked', destinationName: destination.name };
    }
    return { status: 'route-broken', destinationName: destination.name };
  }

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
    ...(destination.arrivalAction === undefined
      ? {}
      : { arrivalAction: destination.arrivalAction }),
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
  blockedCells?: ReadonlySet<string>,
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
    blockedCells,
  );
  if (guide.status === 'target-lost' || guide.status === 'route-broken' || guide.status === 'route-blocked') {
    return guide;
  }
  return { ...guide, destinationLandmarkId: landmark.id };
}

/**
 * HUD copy naming the existing control that acts on a reached quest target.
 * Mirrors the scene's input precedence — F talks directly, E serves an
 * adjacent NPC before an encounter (opening that keeper's shop first),
 * discovery fires on arrival but can be gated by period or weather — so the
 * copy never claims the interaction or discovery has already happened, only
 * that the player is next to it.
 */
export function arrivalActionHint(action: NavigationArrivalAction): string {
  switch (action) {
    case 'companion':
      return '按 P 再 T 与当前同行者交谈';
    case 'travel':
      return '按 E 通过关口（人物等相邻入口仍有优先级）';
    case 'craft':
      return '按 E 打开工位，选择配方并制作；缺料先查投入与持有数';
    case 'talk':
      return '按 F 直接交谈（E 键优先处理商铺或差事名录）';
    case 'battle':
      return '按 E 交手（身旁另有人物时 E 会先应对他们）';
    case 'discover':
      return '见闻须满足事件条件；可按 V 推进时段等待';
    case 'shop':
      return '按 E 直接交易 · F 交谈（购买后差事计数自动核对）';
  }
}
