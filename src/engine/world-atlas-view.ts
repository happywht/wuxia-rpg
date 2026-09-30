import type { CellPosition, GridMap } from './grid-map';
import { selectVisibleWorldLandmarks, type WorldAtlasArtData, type WorldLandmarkCategory, type WorldMapAssembly } from './world-map';

/** A point in the global atlas texture's pixel space. */
export interface WorldAtlasPoint {
  x: number;
  y: number;
}

export interface WorldAtlasRegionLabelMeasurement {
  mapResourceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldAtlasRegionLabelPlacement {
  x: number;
  y: number;
  originX: number;
  originY: number;
}

export interface WorldAtlasRegionMarker {
  mapResourceId: string;
  name: string;
  description: string;
  position: WorldAtlasPoint;
}

export interface WorldAtlasLandmarkMarker {
  id: string;
  mapResourceId: string;
  name: string;
  category: WorldLandmarkCategory;
  position: WorldAtlasPoint;
}

export interface WorldAtlasConnection {
  id: string;
  name: string;
  fromMapResourceId: string;
  toMapResourceId: string;
  from: WorldAtlasPoint;
  to: WorldAtlasPoint;
}

export interface WorldAtlasOverlays {
  regions: WorldAtlasRegionMarker[];
  connections: WorldAtlasConnection[];
  landmarks: WorldAtlasLandmarkMarker[];
  player: WorldAtlasPoint | null;
}

/** Fraction of the overview's width/height occupied by one region's local extent. */
export const WORLD_ATLAS_REGION_FOOTPRINT = 0.16;

/**
 * Places fixed-size map callouts without hiding region names at overview zoom.
 * Labels prefer their traditional above-marker anchor, then try nearby sides
 * in a stable order. The active region is placed first so crowded neighbors
 * move around the player's current location rather than covering it.
 */
export function layoutWorldAtlasRegionLabels(
  labels: readonly WorldAtlasRegionLabelMeasurement[],
  bounds: { width: number; height: number },
  primaryMapResourceId?: string,
  gap = 4,
): ReadonlyMap<string, WorldAtlasRegionLabelPlacement> {
  const placed: Array<{ mapResourceId: string; left: number; top: number; right: number; bottom: number }> = [];
  const result = new Map<string, WorldAtlasRegionLabelPlacement>();
  const candidates = (label: WorldAtlasRegionLabelMeasurement): WorldAtlasRegionLabelPlacement[] => {
    const preferred: WorldAtlasRegionLabelPlacement[] = [
      { x: label.x, y: label.y - 10, originX: 0.5, originY: 1 },
      { x: label.x + label.width / 2 + 6, y: label.y, originX: 0, originY: 0.5 },
      { x: label.x - label.width / 2 - 6, y: label.y, originX: 1, originY: 0.5 },
      { x: label.x, y: label.y + 6, originX: 0.5, originY: 0 },
      { x: label.x + label.width / 2 + 6, y: label.y - label.height / 2 - 4, originX: 0, originY: 1 },
      { x: label.x - label.width / 2 - 6, y: label.y - label.height / 2 - 4, originX: 1, originY: 1 },
      { x: label.x + label.width / 2 + 6, y: label.y + label.height / 2 + 4, originX: 0, originY: 0 },
      { x: label.x - label.width / 2 - 6, y: label.y + label.height / 2 + 4, originX: 1, originY: 0 },
    ];

    // Dense atlases can have more names than the eight immediate callout slots.
    // Expand in stable square rings so labels stay in view and remain readable
    // instead of silently overlapping after every nearby slot has been used.
    const stepX = Math.max(12, Math.ceil((label.width + gap) / 2));
    const stepY = Math.max(12, Math.ceil((label.height + gap) / 2));
    const maxRing = Math.ceil(Math.max(bounds.width / stepX, bounds.height / stepY)) + 1;
    for (let ring = 1; ring <= maxRing; ring += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          preferred.push({
            x: label.x + dx * stepX,
            y: label.y + dy * stepY,
            originX: 0.5,
            originY: 0.5,
          });
        }
      }
    }
    return preferred;
  };
  const ordered = [...labels].sort((a, b) => {
    if (a.mapResourceId === b.mapResourceId) return 0;
    if (a.mapResourceId === primaryMapResourceId) return -1;
    if (b.mapResourceId === primaryMapResourceId) return 1;
    return labels.indexOf(a) - labels.indexOf(b);
  });

  for (const label of ordered) {
    const options = candidates(label);
    let selected: WorldAtlasRegionLabelPlacement | undefined;
    let selectedBox: typeof placed[number] | undefined;
    for (const option of options) {
      const box = {
        mapResourceId: label.mapResourceId,
        left: option.x - label.width * option.originX,
        top: option.y - label.height * option.originY,
        right: option.x + label.width * (1 - option.originX),
        bottom: option.y + label.height * (1 - option.originY),
      };
      const inside = box.left >= 0 && box.top >= 0 && box.right <= bounds.width && box.bottom <= bounds.height;
      const overlaps = placed.some((other) =>
        box.left < other.right + gap && box.right + gap > other.left &&
        box.top < other.bottom + gap && box.bottom + gap > other.top,
      );
      if (inside && !overlaps) {
        selected = option;
        selectedBox = box;
        break;
      }
    }

    // A zoomed-in label can be partly clipped with its marker; keep that
    // relationship when there is no fully visible collision-free position.
    if (selected === undefined) {
      selected = options[0]!;
      selectedBox = {
        mapResourceId: label.mapResourceId,
        left: selected.x - label.width * selected.originX,
        top: selected.y - label.height * selected.originY,
        right: selected.x + label.width * (1 - selected.originX),
        bottom: selected.y + label.height * (1 - selected.originY),
      };
    }
    result.set(label.mapResourceId, selected);
    placed.push(selectedBox!);
  }
  return result;
}

/** Stable cache key that naturally invalidates after a hot-reloaded atlas edit. */
export function worldAtlasArtTextureKey(world: WorldMapAssembly): string | null {
  const art = world.data.atlasArt;
  if (art === undefined) return null;
  let hash = 2166136261;
  const mix = (value: number): void => { hash = Math.imul(hash ^ value, 16777619); };
  mix(art.columns);
  mix(art.rows);
  mix(art.tileSize);
  for (const tileset of art.tilesets) {
    for (const value of `${tileset.id}\u0000${tileset.image}`) mix(value.charCodeAt(0));
  }
  for (const layer of art.layers) {
    for (const value of `${layer.id}\u0000${layer.tilesetId}`) mix(value.charCodeAt(0));
    for (const row of layer.cells) for (const gid of row) mix(gid >>> 0);
  }
  return `wuxia-world-atlas-${(hash >>> 0).toString(16)}`;
}

/** Maps the 0–100 data-authored atlas coordinate to a pixel-cell center. */
export function projectAtlasPosition(position: { x: number; y: number }, art: WorldAtlasArtData): WorldAtlasPoint {
  return {
    x: (position.x / 100 * (art.columns - 1) + 0.5) * art.tileSize,
    y: (position.y / 100 * (art.rows - 1) + 0.5) * art.tileSize,
  };
}

/**
 * Projects a playable region cell into its authored overview footprint.
 * Region footprints share a consistent percentage of the panorama even when
 * underlying gameplay maps have different grid dimensions.
 */
export function projectWorldCell(
  position: CellPosition,
  map: GridMap,
  regionPosition: { x: number; y: number },
  art: WorldAtlasArtData,
): WorldAtlasPoint {
  const center = projectAtlasPosition(regionPosition, art);
  const u = map.columns <= 1 ? 0 : (position.col + 0.5) / map.columns - 0.5;
  const v = map.rows <= 1 ? 0 : (position.row + 0.5) / map.rows - 0.5;
  const footprintColumns = art.regionFootprint?.columns ?? art.columns * WORLD_ATLAS_REGION_FOOTPRINT;
  const footprintRows = art.regionFootprint?.rows ?? art.rows * WORLD_ATLAS_REGION_FOOTPRINT;
  return {
    x: center.x + u * footprintColumns * art.tileSize,
    y: center.y + v * footprintRows * art.tileSize,
  };
}

/** Builds all public overlay geometry from assembled world data and live position. */
export function buildWorldAtlasOverlays(
  world: WorldMapAssembly,
  maps: ReadonlyMap<string, GridMap>,
  currentMapResourceId: string,
  playerPosition: CellPosition,
  knownKnowledgeNodeIds: ReadonlySet<string>,
): WorldAtlasOverlays {
  const art = world.data.atlasArt;
  if (art === undefined) return { regions: [], connections: [], landmarks: [], player: null };

  const regionByMap = new Map(world.regions.map((region) => [region.mapResourceId, region]));
  const regions = world.regions.flatMap((region): WorldAtlasRegionMarker[] => {
    if (!maps.has(region.mapResourceId)) return [];
    return [{
      mapResourceId: region.mapResourceId,
      name: region.name,
      description: region.description,
      position: projectAtlasPosition(region.atlasPosition, art),
    }];
  });
  const connections = world.transitions.flatMap((transition): WorldAtlasConnection[] => {
    const fromRegion = regionByMap.get(transition.from.mapResourceId);
    const toRegion = regionByMap.get(transition.to.mapResourceId);
    const fromMap = maps.get(transition.from.mapResourceId);
    const toMap = maps.get(transition.to.mapResourceId);
    if (fromRegion === undefined || toRegion === undefined || fromMap === undefined || toMap === undefined) return [];
    return [{
      id: transition.id,
      name: transition.name,
      fromMapResourceId: transition.from.mapResourceId,
      toMapResourceId: transition.to.mapResourceId,
      from: projectWorldCell(transition.from, fromMap, fromRegion.atlasPosition, art),
      to: projectWorldCell(transition.to, toMap, toRegion.atlasPosition, art),
    }];
  });
  const landmarks = selectVisibleWorldLandmarks(world.landmarks, knownKnowledgeNodeIds).flatMap((landmark) => {
    const region = regionByMap.get(landmark.mapResourceId);
    const map = maps.get(landmark.mapResourceId);
    if (region === undefined || map === undefined) return [];
    return [{
      id: landmark.id,
      mapResourceId: landmark.mapResourceId,
      name: landmark.name,
      category: landmark.category,
      position: projectWorldCell(landmark, map, region.atlasPosition, art),
    }];
  });
  const currentRegion = regionByMap.get(currentMapResourceId);
  const currentMap = maps.get(currentMapResourceId);
  const player = currentRegion === undefined || currentMap === undefined
    ? null
    : projectWorldCell(playerPosition, currentMap, currentRegion.atlasPosition, art);
  return { regions, connections, landmarks, player };
}
