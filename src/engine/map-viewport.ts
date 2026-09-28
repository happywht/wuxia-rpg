/** Math-only state for a movable atlas image inside a fixed UI viewport. */
export interface MapViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapViewportState {
  x: number;
  y: number;
  scale: number;
}

export function createMapViewport(
  bounds: MapViewportBounds,
  imageWidth: number,
  imageHeight: number,
): MapViewportState {
  const scale = Math.min(bounds.width / imageWidth, bounds.height / imageHeight);
  return clampMapViewport(bounds, imageWidth, imageHeight, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    scale,
  });
}

export function clampMapViewport(
  bounds: MapViewportBounds,
  imageWidth: number,
  imageHeight: number,
  state: MapViewportState,
): MapViewportState {
  const width = imageWidth * state.scale;
  const height = imageHeight * state.scale;
  const x = width <= bounds.width
    ? bounds.x + bounds.width / 2
    : Math.max(bounds.x + bounds.width - width / 2, Math.min(bounds.x + width / 2, state.x));
  const y = height <= bounds.height
    ? bounds.y + bounds.height / 2
    : Math.max(bounds.y + bounds.height - height / 2, Math.min(bounds.y + height / 2, state.y));
  return { x, y, scale: state.scale };
}

/** Zooms around a screen point, keeping the map coordinate under the pointer fixed. */
export function zoomMapViewport(
  bounds: MapViewportBounds,
  imageWidth: number,
  imageHeight: number,
  state: MapViewportState,
  pointerX: number,
  pointerY: number,
  factor: number,
  minScale: number,
  maxScale: number,
): MapViewportState {
  const scale = Math.max(minScale, Math.min(maxScale, state.scale * factor));
  const ratio = scale / state.scale;
  return clampMapViewport(bounds, imageWidth, imageHeight, {
    x: pointerX - (pointerX - state.x) * ratio,
    y: pointerY - (pointerY - state.y) * ratio,
    scale,
  });
}

export function panMapViewport(
  bounds: MapViewportBounds,
  imageWidth: number,
  imageHeight: number,
  state: MapViewportState,
  deltaX: number,
  deltaY: number,
): MapViewportState {
  return clampMapViewport(bounds, imageWidth, imageHeight, {
    ...state,
    x: state.x + deltaX,
    y: state.y + deltaY,
  });
}
