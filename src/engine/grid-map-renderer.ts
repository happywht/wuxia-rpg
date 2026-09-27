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

function shadeColor(color: number, amount: number): number {
  const channels = [16, 8, 0].map((shift) => Math.max(0, Math.min(255, ((color >> shift) & 0xff) + amount)));
  return ((channels[0] ?? 0) << 16) | ((channels[1] ?? 0) << 8) | (channels[2] ?? 0);
}

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
      const edge = Math.max(1, Math.round(tileSize / 16));
      const highlight = scene.add.rectangle(
        col * tileSize + tileSize / 2,
        row * tileSize + edge / 2,
        tileSize - edge * 2,
        edge,
        shadeColor(fill, 18),
        0.75,
      );
      const shadow = scene.add.rectangle(
        col * tileSize + tileSize - edge / 2,
        row * tileSize + tileSize / 2,
        edge,
        tileSize - edge * 2,
        shadeColor(fill, -20),
        0.75,
      );
      container.add([cell, highlight, shadow]);
    }
  }

  return container;
}

/** Pixel center of a cell relative to the map origin — for marker positioning. */
export function cellCenterOffset(map: GridMap, col: number, row: number): Phaser.Math.Vector2 {
  const tileSize = map.tileSize;
  return new Phaser.Math.Vector2(col * tileSize + tileSize / 2, row * tileSize + tileSize / 2);
}
