import type Phaser from 'phaser';

const PIXEL_FILTER_MODE = 1;

import { GridMap, parseHexColor, type GridMapTilesetData } from './grid-map';

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
  if (map.data.art !== undefined) {
    const artTextureKey = ensureGridMapArtTexture(scene, map);
    if (artTextureKey === null) throw new Error(`无法生成地图贴图：${map.data.id}`);
    const image = scene.add.image(0, 0, artTextureKey).setOrigin(0, 0)
      .setDisplaySize(map.pixelWidth, map.pixelHeight);
    container.add(image);
    return container;
  }
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

/** Stable Phaser texture key for a source atlas declared by the content pack. */
export function gridMapTilesetTextureKey(tilesetId: string): string {
  let hash = 2166136261;
  for (const char of tilesetId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `wuxia-atlas-${(hash >>> 0).toString(16)}`;
}

/** Stable cached ground-texture key, including a hash so live data edits rebuild it. */
export function gridMapArtTextureKey(map: GridMap): string {
  const art = map.data.art;
  if (art === undefined) return '';
  let hash = 2166136261;
  const mix = (value: number): void => { hash = Math.imul(hash ^ value, 16777619); };
  for (const layer of art.layers) {
    for (let index = 0; index < layer.id.length; index++) mix(layer.id.charCodeAt(index));
    for (const row of layer.cells) for (const gid of row) mix(gid >>> 0);
  }
  return `wuxia-map-art-${(hash >>> 0).toString(16)}`;
}

/** Loads the distinct source images required by a validated set of maps. */
export function loadGridMapArtAssets(scene: Phaser.Scene, maps: Iterable<GridMap>): Promise<void> {
  const tilesets = new Map<string, GridMapTilesetData>();
  for (const map of maps) {
    for (const tileset of map.data.art?.tilesets ?? []) tilesets.set(tileset.id, tileset);
  }
  const pending = [...tilesets.values()].filter((tileset) =>
    !scene.textures.exists(gridMapTilesetTextureKey(tileset.id)),
  );
  if (pending.length === 0) return Promise.resolve();

  const loader = scene.load;
  return new Promise((resolve, reject) => {
    let firstFailure: string | null = null;
    const onFileError = (file: Phaser.Loader.File): void => {
      const tileset = pending.find((entry) => gridMapTilesetTextureKey(entry.id) === file.key);
      if (tileset !== undefined) firstFailure ??= `${tileset.image}（${file.src}）`;
    };
    loader.on('loaderror', onFileError);
    loader.once('complete', () => {
      loader.off('loaderror', onFileError);
      const missing = pending.filter((tileset) => !scene.textures.exists(gridMapTilesetTextureKey(tileset.id)));
      if (firstFailure !== null || missing.length > 0) {
        reject(new Error(`地图像素素材加载失败：${firstFailure ?? missing.map((entry) => entry.image).join('、')}`));
        return;
      }
      for (const tileset of tilesets.values()) {
        scene.textures.get(gridMapTilesetTextureKey(tileset.id)).setFilter(PIXEL_FILTER_MODE);
      }
      resolve();
    });
    for (const tileset of pending) {
      loader.image(gridMapTilesetTextureKey(tileset.id), `${import.meta.env.BASE_URL}${tileset.image}`);
    }
    loader.start();
  });
}

/** Bakes layered 16px sprite art into one compact, nearest-neighbour map texture. */
export function ensureGridMapArtTexture(scene: Phaser.Scene, map: GridMap): string | null {
  const art = map.data.art;
  if (art === undefined) return null;
  const key = gridMapArtTextureKey(map);
  if (scene.textures.exists(key)) return key;
  const width = map.columns * art.tileSize;
  const height = map.rows * art.tileSize;
  const texture = scene.textures.createCanvas(key, width, height);
  if (texture === null) throw new Error(`无法创建地图贴图缓存：${map.data.id}（${width}×${height}）`);
  const context = texture.context;
  const tilesets = new Map(art.tilesets.map((tileset) => [tileset.id, tileset]));
  for (const layer of art.layers) {
    const tileset = tilesets.get(layer.tilesetId);
    if (tileset === undefined) throw new Error(`地图图层“${layer.id}”引用了缺失图集“${layer.tilesetId}”。`);
    const source = scene.textures.get(gridMapTilesetTextureKey(tileset.id)).getSourceImage();
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.columns; col++) {
        const rawGid = layer.cells[row]?.[col] ?? 0;
        const frame = rawGid & 0x0fffffff;
        if (frame === 0) continue;
        const sourceCol = (frame - 1) % tileset.columns;
        const sourceRow = Math.floor((frame - 1) / tileset.columns);
        const sourceX = sourceCol * (tileset.tileSize + tileset.spacing);
        const sourceY = sourceRow * (tileset.tileSize + tileset.spacing);
        const destinationX = col * art.tileSize;
        const destinationY = row * art.tileSize;
        drawTiledFrame(context, source, sourceX, sourceY, tileset.tileSize, destinationX, destinationY, art.tileSize, rawGid);
      }
    }
  }
  texture.refresh();
  texture.setFilter(PIXEL_FILTER_MODE);
  return key;
}

/** Extracts one sprite frame from a declared atlas and scales it to one world cell. */
export function createGridMapActor(
  scene: Phaser.Scene,
  map: GridMap,
  x: number,
  y: number,
  frameIndex?: number,
): Phaser.GameObjects.Image | null {
  const art = map.data.art;
  if (art === undefined) return null;
  const tileset = art.tilesets.find((entry) => entry.id === art.actors.tilesetId);
  if (tileset === undefined) return null;
  const frame = frameIndex ?? art.actors.defaultNpcFrame;
  const key = gridMapTilesetTextureKey(tileset.id);
  const frameKey = `actor-${tileset.id}-${frame}`;
  const texture = scene.textures.get(key);
  if (!texture.has(frameKey)) {
    const sourceX = (frame % tileset.columns) * (tileset.tileSize + tileset.spacing);
    const sourceY = Math.floor(frame / tileset.columns) * (tileset.tileSize + tileset.spacing);
    if (texture.add(frameKey, 0, sourceX, sourceY, tileset.tileSize, tileset.tileSize) === null) {
      throw new Error(`无法读取人物精灵帧 ${frame}（图集“${tileset.id}”）。`);
    }
  }
  return scene.add.image(x, y, key, frameKey).setScrollFactor(1)
    .setDisplaySize(map.tileSize, map.tileSize).setDepth(10);
}

function drawTiledFrame(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement | Phaser.GameObjects.RenderTexture,
  sourceX: number,
  sourceY: number,
  sourceSize: number,
  destinationX: number,
  destinationY: number,
  destinationSize: number,
  rawGid: number,
): void {
  const flipH = (rawGid & 0x80000000) !== 0;
  const flipV = (rawGid & 0x40000000) !== 0;
  const flipD = (rawGid & 0x20000000) !== 0;
  if (!flipH && !flipV && !flipD) {
    context.drawImage(source as CanvasImageSource, sourceX, sourceY, sourceSize, sourceSize, destinationX, destinationY, destinationSize, destinationSize);
    return;
  }
  context.save();
  context.translate(destinationX + destinationSize / 2, destinationY + destinationSize / 2);
  if (flipD) context.rotate(Math.PI / 2);
  context.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  context.drawImage(source as CanvasImageSource, sourceX, sourceY, sourceSize, sourceSize, -destinationSize / 2, -destinationSize / 2, destinationSize, destinationSize);
  context.restore();
}

/** Pixel center of a cell relative to the map origin — for marker positioning. */
export function cellCenterOffset(map: GridMap, col: number, row: number): { x: number; y: number } {
  const tileSize = map.tileSize;
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}
