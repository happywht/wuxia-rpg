/** Screen-space HUD padding for scrollable worlds; no movement/state effects. */
export interface ExplorationCameraBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function paddedWorldCameraBounds(
  mapWidth: number,
  mapHeight: number,
  viewWidth: number,
  viewHeight: number,
  topInset: number,
  bottomInset: number,
): ExplorationCameraBounds {
  // Small maps retain their existing centred, fixed-camera presentation.
  if (mapWidth <= viewWidth && mapHeight <= viewHeight) {
    return { x: 0, y: 0, width: viewWidth, height: viewHeight };
  }
  const top = Math.max(0, topInset);
  const bottom = Math.max(0, bottomInset);
  return {
    x: 0,
    y: top === 0 ? 0 : -top,
    width: Math.max(viewWidth, mapWidth),
    height: Math.max(viewHeight, mapHeight + top + bottom),
  };
}
