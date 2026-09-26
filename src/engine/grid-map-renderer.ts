import Phaser from 'phaser';

import { GridMap, parseHexColor } from './grid-map';

/**
 * Renders a validated {@link GridMap} as flat colored rectangles.
 *
 * Purely data-driven: colors, dimensions and layout come from the map data;
 * this module knows nothing about any specific world or content.
 */

/** Fallback fill for a definition whose color somehow fails to parse. */
const FALLBACK_FILL = 0x000000;

/** Subtle per-cell border so individual tiles remain countable on screen. */
const TILE_BORDER_COLOR = 0x0b0e14;
const TILE_BORDER_ALPHA = 0.35;

/**
 * Draws the grid into a new container anchored at (originX, originY).
 * Cell (col, row) occupies the square [col * tileSize, (col + 1) * tileSize).
 */
export function renderGridMap(
  scene: Phaser.Scene,
  map: GridMap,
  originX: number,
  originY: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(originX, originY);
  const tileSize = map.tileSize;

  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      const tileType = map.tileTypeAt(col, row);
      if (tileType === undefined) {
        continue;
      }
      const fill = parseHexColor(tileType.color) ?? FALLBACK_FILL;
      const cell = scene.add.rectangle(
        col * tileSize + tileSize / 2,
        row * tileSize + tileSize / 2,
        tileSize,
        tileSize,
        fill,
      );
      cell.setStrokeStyle(1, TILE_BORDER_COLOR, TILE_BORDER_ALPHA);
      container.add(cell);
    }
  }

  return container;
}

/** Pixel center of a cell relative to the map origin — for marker positioning. */
export function cellCenterOffset(map: GridMap, col: number, row: number): Phaser.Math.Vector2 {
  const tileSize = map.tileSize;
  return new Phaser.Math.Vector2(col * tileSize + tileSize / 2, row * tileSize + tileSize / 2);
}
