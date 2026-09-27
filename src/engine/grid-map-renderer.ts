import type Phaser from 'phaser';

import { GridMap, parseHexColor } from './grid-map';

/**
 * Renders a validated {@link GridMap} as flat colored rectangles.
 *
 * Purely data-driven: colors, dimensions and layout come from the map data;
 * this module knows nothing about any specific world or content.
 *
 * Round 40: the map is baked into a single Graphics layer (O(1) scene
 * objects per map instead of 3 rectangles per cell) by first generating a
 * pure list of {@link GridMapDrawCommand}s and then replaying it onto one
 * Graphics object. The module imports Phaser as types only, so the command
 * generator is benchmarkable and testable in a bare Node process.
 */

/** Fallback fill for a definition whose color somehow fails to parse. */
const FALLBACK_FILL = 0x000000;

/** Subtle per-cell border so individual tiles remain countable on screen. */
const TILE_BORDER_COLOR = 0x0b0e14;
const TILE_BORDER_ALPHA = 0.35;
const HIGHLIGHT_ALPHA = 0.75;
const SHADOW_ALPHA = 0.75;
const HIGHLIGHT_SHADE = 18;
const SHADOW_SHADE = -20;

function shadeColor(color: number, amount: number): number {
  const channels = [16, 8, 0].map((shift) => Math.max(0, Math.min(255, ((color >> shift) & 0xff) + amount)));
  return ((channels[0] ?? 0) << 16) | ((channels[1] ?? 0) << 8) | (channels[2] ?? 0);
}

/**
 * One baked draw operation in map-local pixel space. Replay order equals
 * array order: per cell, the base fill, then its border stroke, then the
 * top highlight bar, then the right-edge shadow bar — exactly the stacking
 * order of the rectangles the pre-Round-40 renderer added to the container.
 */
export interface GridMapDrawCommand {
  op: 'fillRect' | 'strokeRect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  alpha: number;
}

/**
 * Pure draw-command generation for a validated map: 4 commands per rendered
 * cell (fill, border, highlight, shadow). Color derivations are cached per
 * tile-type color string, so each distinct color is parsed and shaded once.
 */
export function buildGridMapDrawCommands(map: GridMap): GridMapDrawCommand[] {
  const commands: GridMapDrawCommand[] = [];
  const tileSize = map.tileSize;
  const edge = Math.max(1, Math.round(tileSize / 16));
  const palette = new Map<string, { fill: number; highlight: number; shadow: number }>();
  const paletteFor = (tileColor: string): { fill: number; highlight: number; shadow: number } => {
    let entry = palette.get(tileColor);
    if (entry === undefined) {
      const fill = parseHexColor(tileColor) ?? FALLBACK_FILL;
      entry = {
        fill,
        highlight: shadeColor(fill, HIGHLIGHT_SHADE),
        shadow: shadeColor(fill, SHADOW_SHADE),
      };
      palette.set(tileColor, entry);
    }
    return entry;
  };

  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      const tileType = map.tileTypeAt(col, row);
      if (tileType === undefined) {
        continue;
      }
      const colors = paletteFor(tileType.color);
      const x = col * tileSize;
      const y = row * tileSize;
      commands.push(
        { op: 'fillRect', x, y, width: tileSize, height: tileSize, color: colors.fill, alpha: 1 },
        {
          op: 'strokeRect',
          x,
          y,
          width: tileSize,
          height: tileSize,
          color: TILE_BORDER_COLOR,
          alpha: TILE_BORDER_ALPHA,
        },
        {
          op: 'fillRect',
          x: x + edge,
          y,
          width: tileSize - edge * 2,
          height: edge,
          color: colors.highlight,
          alpha: HIGHLIGHT_ALPHA,
        },
        {
          op: 'fillRect',
          x: x + tileSize - edge,
          y: y + edge,
          width: edge,
          height: tileSize - edge * 2,
          color: colors.shadow,
          alpha: SHADOW_ALPHA,
        },
      );
    }
  }
  return commands;
}

/**
 * Draws the grid into a new container anchored at (originX, originY).
 * Cell (col, row) occupies the square [col * tileSize, (col + 1) * tileSize).
 *
 * Allocates exactly two scene objects regardless of map area: the returned
 * container (unchanged public contract, so callers keep `destroy()` semantics
 * for map transitions) and one Graphics layer holding every cell. Destroying
 * the container destroys the Graphics child with it.
 */
export function renderGridMap(
  scene: Phaser.Scene,
  map: GridMap,
  originX: number,
  originY: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(originX, originY);
  const layer = scene.add.graphics();
  // Repeated style calls with identical arguments are skipped; fill and line
  // styles are independent Graphics state, so alternating ops stays correct.
  let lastFill: { color: number; alpha: number } | null = null;
  let lastLine: { color: number; alpha: number } | null = null;
  for (const command of buildGridMapDrawCommands(map)) {
    if (command.op === 'fillRect') {
      if (lastFill === null || lastFill.color !== command.color || lastFill.alpha !== command.alpha) {
        layer.fillStyle(command.color, command.alpha);
        lastFill = { color: command.color, alpha: command.alpha };
      }
      layer.fillRect(command.x, command.y, command.width, command.height);
    } else {
      if (lastLine === null || lastLine.color !== command.color || lastLine.alpha !== command.alpha) {
        layer.lineStyle(1, command.color, command.alpha);
        lastLine = { color: command.color, alpha: command.alpha };
      }
      layer.strokeRect(command.x, command.y, command.width, command.height);
    }
  }
  container.add(layer);
  return container;
}

/** Pixel center of a cell relative to the map origin — for marker positioning. */
export function cellCenterOffset(map: GridMap, col: number, row: number): { x: number; y: number } {
  const tileSize = map.tileSize;
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}
