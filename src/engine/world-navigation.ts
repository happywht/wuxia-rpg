import type { CellPosition } from './grid-map';
import type { PlacedNpc } from './npc-placement';
import type { QuestNavigationTarget } from './quest-navigation';
import {
  selectVisibleWorldLandmarks,
  type WorldLandmarkCategory,
  type WorldMapAssembly,
  type WorldRegionData,
} from './world-map';
import { findWorldTravelRoute } from './world-travel';

export type WorldMapWaypointKind = 'landmark' | 'transition' | 'remote-region' | 'remote-landmark';

/** Prefix of every stable landmark destination selector. */
export const LANDMARK_DESTINATION_PREFIX = 'landmark:';

/**
 * A map panel destination. `position` is always in the current map's local
 * coordinates. For a remote landmark this is the first crossing cell, never
 * the remote map's unrelated grid coordinate.
 */
export interface WorldMapWaypoint {
  id: string;
  name: string;
  category: WorldLandmarkCategory;
  position: CellPosition;
  kind: WorldMapWaypointKind;
  approachRadius: number;
  /** Stable lore id shared by this landmark's local and remote projections. */
  destinationLandmarkId?: string;
  /**
   * Unified runtime destination selector: `landmark:<id>` for stable atlas
   * pins or `quest:<questId>` for projected active-quest targets. The quest
   * selector stays stable while its active objective advances. Absent on pure
   * route stops (crossings/regions), which clear the
   * current destination when picked. Never persisted to saves.
   */
  destinationId?: string;
  destinationRegionName?: string;
  regionRouteNames?: string[];
  nextTransitionName?: string;
}

/** Phaser's FIT input reports Pointer.y in CSS pixels on a high-DPI canvas. */
export function normalizeWorldMapPointer(
  pointer: { x: number; y: number },
  canvasHeight: number,
  canvasClientHeight: number,
): { x: number; y: number } {
  const yScale = canvasClientHeight > 0 ? canvasHeight / canvasClientHeight : 1;
  return { x: pointer.x, y: pointer.y * yScale };
}

/** Wraps keyboard list focus; from no focus, forward starts first/backward last. */
export function cycleWorldWaypointIndex(currentIndex: number, count: number, step: -1 | 1): number {
  if (!Number.isInteger(count) || count <= 0) return -1;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= count) {
    return step < 0 ? count - 1 : 0;
  }
  return (currentIndex + step + count) % count;
}

/**
 * Derives every assembled NPC's region name from the world atlas. The NPC's
 * map stays fixed across schedule moves (schedules only change the cell), so
 * the base record's `mapResourceId` is the whole truth. NPCs whose map has no
 * registered region are simply absent from the map; callers fall back to a
 * generic "whereabouts unknown" label for them (Round 64 faction dossier).
 */
export function deriveNpcRegionNames(
  npcs: readonly PlacedNpc[],
  regions: readonly WorldRegionData[],
): ReadonlyMap<string, string> {
  const regionNameByMap = new Map(regions.map((region) => [region.mapResourceId, region.name]));
  const names = new Map<string, string>();
  for (const npc of npcs) {
    const regionName = regionNameByMap.get(npc.record.mapResourceId);
    if (regionName !== undefined) names.set(npc.record.id, regionName);
  }
  return names;
}

/**
 * Projects one resolved active-quest objective target into a map waypoint.
 * Same-map targets pin their own cell; remote targets pin the first gate of
 * the routed itinerary, mirroring remote-landmark semantics. Returns null
 * when no directed route reaches the target's map.
 */
export function buildQuestObjectiveWaypoint(
  world: WorldMapAssembly,
  currentMapResourceId: string,
  target: QuestNavigationTarget,
): WorldMapWaypoint | null {
  const route = findWorldTravelRoute(world, currentMapResourceId, target.mapResourceId);
  if (route === null) return null;
  const firstLeg = route.legs[0];
  if (firstLeg === undefined) {
    return {
      id: target.id,
      name: target.name,
      category: 'route',
      position: { col: target.col, row: target.row },
      kind: 'landmark',
      approachRadius: target.approachRadius,
      destinationId: target.id,
    };
  }
  return {
    id: target.id,
    name: target.name,
    category: 'route',
    position: { col: firstLeg.transition.from.col, row: firstLeg.transition.from.row },
    kind: 'remote-landmark',
    approachRadius: 0,
    destinationId: target.id,
    destinationRegionName: route.regionNames.at(-1),
    regionRouteNames: route.regionNames,
    nextTransitionName: firstLeg.transition.name,
  };
}

/**
 * Projects current-region landmarks/crossings and reachable, discovered
 * remote landmarks into destinations that can be reached from the current
 * grid. Knowledge filtering occurs before remote region names are inspected
 * or copied into the projection. Remote region names are projected only when
 * they are the direct destination of a visible outgoing crossing; deeper
 * route regions are left for an explicitly discovered landmark itinerary.
 * Supplemental quest targets append after the atlas pins: they are runtime
 * projections of already-accepted quests and intentionally bypass the
 * knowledge gate without ever revealing locked or unaccepted content.
 */
export function buildWorldMapWaypoints(
  world: WorldMapAssembly,
  currentMapResourceId: string,
  knownKnowledgeNodeIds: ReadonlySet<string>,
  supplementalQuestTargets: readonly QuestNavigationTarget[] = [],
): WorldMapWaypoint[] {
  const visibleLandmarks = selectVisibleWorldLandmarks(world.landmarks, knownKnowledgeNodeIds);
  const currentLandmarks = visibleLandmarks
    .filter((landmark) => landmark.mapResourceId === currentMapResourceId)
    .map((landmark): WorldMapWaypoint => ({
      id: `landmark:${landmark.id}`,
      name: landmark.name,
      category: landmark.category,
      position: { col: landmark.col, row: landmark.row },
      kind: 'landmark',
      approachRadius: 2,
      destinationLandmarkId: landmark.id,
      destinationId: `${LANDMARK_DESTINATION_PREFIX}${landmark.id}`,
    }));
  const crossings = world.transitions
    .filter((transition) => transition.from.mapResourceId === currentMapResourceId)
    .map((transition): WorldMapWaypoint => ({
      id: `transition:${transition.id}`,
      name: transition.name,
      category: 'crossing',
      position: { col: transition.from.col, row: transition.from.row },
      kind: 'transition',
      approachRadius: 0,
      destinationRegionName: world.regions.find((region) => region.mapResourceId === transition.to.mapResourceId)?.name ?? transition.to.mapResourceId,
    }));
  const remoteRegions: WorldMapWaypoint[] = [];
  for (const region of world.regions) {
    if (region.mapResourceId === currentMapResourceId) continue;
    const route = findWorldTravelRoute(world, currentMapResourceId, region.mapResourceId);
    const firstLeg = route?.legs[0];
    if (route === null || route === undefined || firstLeg === undefined || route.legs.length !== 1) continue;
    remoteRegions.push({
      id: `region:${region.mapResourceId}`,
      name: region.name,
      category: 'crossing',
      position: { col: firstLeg.transition.from.col, row: firstLeg.transition.from.row },
      kind: 'remote-region',
      approachRadius: 0,
      destinationRegionName: region.name,
      regionRouteNames: route.regionNames,
      nextTransitionName: firstLeg.transition.name,
    });
  }
  const remoteLandmarks: WorldMapWaypoint[] = [];
  for (const landmark of visibleLandmarks) {
    if (landmark.mapResourceId === currentMapResourceId) continue;
    const route = findWorldTravelRoute(world, currentMapResourceId, landmark.mapResourceId);
    const firstLeg = route?.legs[0];
    if (route === null || route === undefined || firstLeg === undefined) continue;
    const currentPosition = firstLeg.transition.from;
    remoteLandmarks.push({
      id: `remote:${landmark.id}`,
      name: landmark.name,
      category: landmark.category,
      position: { col: currentPosition.col, row: currentPosition.row },
      kind: 'remote-landmark',
      approachRadius: 0,
      destinationLandmarkId: landmark.id,
      destinationId: `${LANDMARK_DESTINATION_PREFIX}${landmark.id}`,
      destinationRegionName: route.regionNames.at(-1),
      regionRouteNames: route.regionNames,
      nextTransitionName: firstLeg.transition.name,
    });
  }
  const questWaypoints = supplementalQuestTargets
    .map((target) => buildQuestObjectiveWaypoint(world, currentMapResourceId, target))
    .filter((waypoint): waypoint is WorldMapWaypoint => waypoint !== null);
  return [...currentLandmarks, ...crossings, ...remoteRegions, ...remoteLandmarks, ...questWaypoints];
}
