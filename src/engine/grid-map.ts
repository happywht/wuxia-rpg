/**
 * Generic grid-map protocol: types, runtime validation and read-only queries.
 *
 * The engine knows the *shape* of map data only — every world detail (layout,
 * colors, solid flags, spawn point) comes from the parsed data itself. No
 * world, lore or content strings may live here (see docs/ARCHITECTURE.md).
 *
 * Validation is intentionally minimal for Round 01: it checks the structural
 * contract above and reports every problem it finds as a readable technical
 * message, so callers can surface a full diagnostic list instead of a blank
 * screen. Formal JSON Schema (Ajv) integration is planned for Round 02.
 */

/** A single tile kind: render color plus solidity (blocks movement). */
export interface TileTypeDefinition {
  color: string;
  solid: boolean;
}

/** Static sprite-sheet metadata supplied by a map data pack. */
export interface GridMapTilesetData {
  id: string;
  image: string;
  tileSize: number;
  columns: number;
  rows: number;
  spacing: number;
  tileCount: number;
}

/** A data-authored Tiled-style image layer. GIDs are 1-based; zero is empty. */
export interface GridMapArtLayerData {
  id: string;
  tilesetId: string;
  cells: number[][];
}

/** Layered pixels-only art reusable by gameplay maps and the world atlas. */
export interface GridMapImageArtData {
  tileSize: number;
  tilesets: GridMapTilesetData[];
  layers: GridMapArtLayerData[];
}

/** Cardinal directions understood by grid movement and actor frame metadata. */
export const GRID_MAP_ACTOR_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type GridMapActorDirection = typeof GRID_MAP_ACTOR_DIRECTIONS[number];

/** Optional direction-aware player frames; omitted by older maps and MODs. */
export interface GridMapPlayerFrames {
  idle: Record<GridMapActorDirection, number>;
  walk: Record<GridMapActorDirection, number[]>;
}

/** Optional presentation data. Collision and movement remain in `grid`. */
export interface GridMapArtData extends GridMapImageArtData {
  actors: {
    tilesetId: string;
    playerFrame: number;
    defaultNpcFrame: number;
    playerFrames?: GridMapPlayerFrames;
  };
}

/** Resolves a player animation frame with a stable legacy fallback. */
export function selectGridMapPlayerFrame(
  actors: GridMapArtData['actors'],
  direction: GridMapActorDirection,
  moving: boolean,
  stepIndex = 0,
): number {
  const frames = actors.playerFrames;
  if (frames === undefined) return actors.playerFrame;
  if (!moving) return frames.idle[direction] ?? actors.playerFrame;
  const cycle = frames.walk[direction];
  if (!Array.isArray(cycle) || cycle.length === 0) return frames.idle[direction] ?? actors.playerFrame;
  const index = ((Math.trunc(stepIndex) % cycle.length) + cycle.length) % cycle.length;
  return cycle[index] ?? actors.playerFrame;
}

/** Grid-cell coordinates; (0, 0) is the top-left cell. */
export interface CellPosition {
  col: number;
  row: number;
}

/** Wire format of a grid-map JSON file under `data/base/maps/`. */
export interface GridMapData {
  id: string;
  name: string;
  tileSize: number;
  columns: number;
  rows: number;
  tileTypes: Record<string, TileTypeDefinition>;
  /** One string per row; each character indexes into `tileTypes`. */
  grid: string[];
  playerStart: CellPosition;
  /** Optional licensed pixel-art atlases and orthogonal sprite layers. */
  art?: GridMapArtData;
}

/** Result of validating and parsing raw JSON into a {@link GridMap}. */
export type GridMapParseResult =
  | { ok: true; map: GridMap }
  | { ok: false; errors: string[] };

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Hard bounds for numeric fields; wide enough for authored maps, small enough to catch junk. */
const LIMITS = {
  tileSize: { min: 8, max: 256 },
  dimension: { min: 1, max: 256 },
} as const;

/** Parses `#rrggbb` into a 0xRRGGBB number; returns null for anything else. */
export function parseHexColor(color: string): number | null {
  if (!COLOR_PATTERN.test(color)) {
    return null;
  }
  return parseInt(color.slice(1), 16);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
  errors: string[],
): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push(`${label}: expected an integer, got ${JSON.stringify(value)}`);
    return;
  }
  if (value < min || value > max) {
    errors.push(`${label}: expected an integer between ${min} and ${max}, got ${value}`);
  }
}

/**
 * Validates `raw` (typically `await response.json()`) against the grid-map
 * contract and wraps it in a {@link GridMap}. Never throws: all problems are
 * collected into `errors` so the caller can render them.
 */
export function parseGridMap(raw: unknown): GridMapParseResult {
  const errors: string[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [`root: expected a JSON object, got ${typeof raw}`] };
  }

  for (const key of ['id', 'name'] as const) {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${key}: expected a non-empty string, got ${JSON.stringify(value)}`);
    }
  }
  checkIntegerInRange(raw.tileSize, LIMITS.tileSize.min, LIMITS.tileSize.max, 'tileSize', errors);
  checkIntegerInRange(raw.columns, LIMITS.dimension.min, LIMITS.dimension.max, 'columns', errors);
  checkIntegerInRange(raw.rows, LIMITS.dimension.min, LIMITS.dimension.max, 'rows', errors);
  validateTileTypes(raw.tileTypes, errors);
  validateGrid(raw.grid, raw.tileTypes, raw.columns, raw.rows, errors);
  validatePlayerStart(raw.playerStart, raw.tileTypes, raw.grid, raw.columns, raw.rows, errors);
  if (raw.art !== undefined) validateGridMapArt(raw.art, raw.columns, raw.rows, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, map: new GridMap(raw as unknown as GridMapData) };
}

function validateGridMapArt(art: unknown, columns: unknown, rows: unknown, errors: string[]): void {
  if (!isPlainObject(art)) {
    errors.push('art: expected an object');
    return;
  }
  checkIntegerInRange(art.tileSize, 1, 256, 'art.tileSize', errors);
  if (!Array.isArray(art.tilesets) || art.tilesets.length === 0) {
    errors.push('art.tilesets: expected at least one sprite sheet');
    return;
  }

  const tilesets = new Map<string, GridMapTilesetData>();
  art.tilesets.forEach((candidate, index) => {
    const path = `art.tilesets[${index}]`;
    if (!isPlainObject(candidate)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    const id = candidate.id;
    const image = candidate.image;
    if (typeof id !== 'string' || id.trim().length === 0) errors.push(`${path}.id: expected a non-empty string`);
    if (
      typeof image !== 'string' || image.trim().length === 0 ||
      image.startsWith('/') || image.split('/').some((part) => part === '..')
    ) errors.push(`${path}.image: expected a non-empty relative asset path without parent traversal`);
    checkIntegerInRange(candidate.tileSize, 1, 256, `${path}.tileSize`, errors);
    checkIntegerInRange(candidate.columns, 1, 1024, `${path}.columns`, errors);
    checkIntegerInRange(candidate.rows, 1, 1024, `${path}.rows`, errors);
    checkIntegerInRange(candidate.spacing, 0, 32, `${path}.spacing`, errors);
    checkIntegerInRange(candidate.tileCount, 1, 1_048_576, `${path}.tileCount`, errors);
    if (
      typeof id === 'string' && id.trim().length > 0 &&
      Number.isInteger(candidate.tileSize) && Number.isInteger(candidate.columns) &&
      Number.isInteger(candidate.rows) && Number.isInteger(candidate.spacing) &&
      Number.isInteger(candidate.tileCount)
    ) {
      if ((candidate.tileCount as number) > (candidate.columns as number) * (candidate.rows as number)) {
        errors.push(`${path}.tileCount: exceeds atlas capacity`);
      }
      if (tilesets.has(id)) errors.push(`${path}.id: duplicate sprite sheet id "${id}"`);
      else tilesets.set(id, candidate as unknown as GridMapTilesetData);
    }
  });

  if (!Array.isArray(art.layers) || art.layers.length === 0) {
    errors.push('art.layers: expected at least one image layer');
  } else {
    art.layers.forEach((candidate, layerIndex) => {
      const path = `art.layers[${layerIndex}]`;
      if (!isPlainObject(candidate)) {
        errors.push(`${path}: expected an object`);
        return;
      }
      if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) errors.push(`${path}.id: expected a non-empty string`);
      if (typeof candidate.tilesetId !== 'string' || !tilesets.has(candidate.tilesetId)) {
        errors.push(`${path}.tilesetId: does not name a declared sprite sheet`);
      }
      const cells = candidate.cells;
      if (!Array.isArray(cells)) {
        errors.push(`${path}.cells: expected an array of rows`);
        return;
      }
      if (typeof rows === 'number' && cells.length !== rows) errors.push(`${path}.cells: expected ${rows} rows, got ${cells.length}`);
      cells.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) {
          errors.push(`${path}.cells[${rowIndex}]: expected an array`);
          return;
        }
        if (typeof columns === 'number' && row.length !== columns) {
          errors.push(`${path}.cells[${rowIndex}]: expected ${columns} cells, got ${row.length}`);
        }
        row.forEach((gid, colIndex) => {
          if (typeof gid !== 'number' || !Number.isInteger(gid) || gid < 0 || gid > 0xffffffff) {
            errors.push(`${path}.cells[${rowIndex}][${colIndex}]: expected an unsigned Tiled GID`);
            return;
          }
          const frameId = gid & 0x0fffffff;
          const tileset = typeof candidate.tilesetId === 'string' ? tilesets.get(candidate.tilesetId) : undefined;
          if (frameId !== 0 && tileset !== undefined && frameId > tileset.tileCount) {
            errors.push(`${path}.cells[${rowIndex}][${colIndex}]: GID ${frameId} exceeds sprite sheet "${tileset.id}"`);
          }
        });
      });
    });
  }

  if (!isPlainObject(art.actors)) {
    errors.push('art.actors: expected an object');
    return;
  }
  const actorTilesetId = art.actors.tilesetId;
  const actorTileset = typeof actorTilesetId === 'string' ? tilesets.get(actorTilesetId) : undefined;
  if (actorTileset === undefined) errors.push('art.actors.tilesetId: does not name a declared sprite sheet');
  for (const field of ['playerFrame', 'defaultNpcFrame'] as const) {
    const value = art.actors[field];
    checkIntegerInRange(value, 0, 1_048_575, `art.actors.${field}`, errors);
    if (actorTileset !== undefined && typeof value === 'number' && value >= actorTileset.tileCount) {
      errors.push(`art.actors.${field}: frame ${value} exceeds sprite sheet "${actorTileset.id}"`);
    }
  }
  if (art.actors.playerFrames !== undefined) {
    const playerFrames = art.actors.playerFrames;
    if (!isPlainObject(playerFrames)) {
      errors.push('art.actors.playerFrames: expected an object');
    } else {
      for (const action of ['idle', 'walk'] as const) {
        const actionFrames = playerFrames[action];
        if (!isPlainObject(actionFrames)) {
          errors.push(`art.actors.playerFrames.${action}: expected a direction map`);
          continue;
        }
        for (const direction of GRID_MAP_ACTOR_DIRECTIONS) {
          const value = actionFrames[direction];
          if (action === 'idle') {
            checkIntegerInRange(value, 0, 1_048_575, `art.actors.playerFrames.idle.${direction}`, errors);
            if (actorTileset !== undefined && typeof value === 'number' && value >= actorTileset.tileCount) {
              errors.push(`art.actors.playerFrames.idle.${direction}: frame ${value} exceeds sprite sheet "${actorTileset.id}"`);
            }
            continue;
          }
          if (!Array.isArray(value) || value.length === 0) {
            errors.push(`art.actors.playerFrames.walk.${direction}: expected a non-empty frame array`);
            continue;
          }
          value.forEach((frame, index) => {
            checkIntegerInRange(frame, 0, 1_048_575, `art.actors.playerFrames.walk.${direction}[${index}]`, errors);
            if (actorTileset !== undefined && typeof frame === 'number' && frame >= actorTileset.tileCount) {
              errors.push(`art.actors.playerFrames.walk.${direction}[${index}]: frame ${frame} exceeds sprite sheet "${actorTileset.id}"`);
            }
          });
        }
        for (const direction of Object.keys(actionFrames)) {
          if (!(GRID_MAP_ACTOR_DIRECTIONS as readonly string[]).includes(direction)) {
            errors.push(`art.actors.playerFrames.${action}: unknown direction "${direction}"`);
          }
        }
      }
      for (const action of Object.keys(playerFrames)) {
        if (action !== 'idle' && action !== 'walk') {
          errors.push(`art.actors.playerFrames: unknown action "${action}"`);
        }
      }
    }
  }
}

function validateTileTypes(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`tileTypes: expected an object, got ${typeof value}`);
    return;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push('tileTypes: expected at least one tile definition');
    return;
  }

  for (const [key, def] of entries) {
    if (!isPlainObject(def)) {
      errors.push(`tileTypes.${key}: expected an object, got ${typeof def}`);
      continue;
    }
    if (typeof def.color !== 'string' || parseHexColor(def.color) === null) {
      errors.push(
        `tileTypes.${key}.color: expected a "#rrggbb" string, got ${JSON.stringify(def.color)}`,
      );
    }
    if (typeof def.solid !== 'boolean') {
      errors.push(`tileTypes.${key}.solid: expected a boolean, got ${JSON.stringify(def.solid)}`);
    }
  }
}

function validateGrid(
  grid: unknown,
  tileTypes: unknown,
  columns: unknown,
  rows: unknown,
  errors: string[],
): void {
  if (!Array.isArray(grid)) {
    errors.push(`grid: expected an array of strings, got ${typeof grid}`);
    return;
  }

  if (typeof rows === 'number' && grid.length !== rows) {
    errors.push(`grid: expected ${rows} rows, got ${grid.length}`);
  }

  const knownChars = isPlainObject(tileTypes) ? new Set(Object.keys(tileTypes)) : null;

  grid.forEach((line, rowIndex) => {
    if (typeof line !== 'string') {
      errors.push(`grid[${rowIndex}]: expected a string, got ${typeof line}`);
      return;
    }
    if (typeof columns === 'number' && line.length !== columns) {
      errors.push(`grid[${rowIndex}]: expected ${columns} characters, got ${line.length}`);
    }
    if (knownChars !== null) {
      for (const char of line) {
        if (!knownChars.has(char)) {
          errors.push(`grid[${rowIndex}]: unknown tile character "${char}"`);
        }
      }
    }
  });
}

function validatePlayerStart(
  start: unknown,
  tileTypes: unknown,
  grid: unknown,
  columns: unknown,
  rows: unknown,
  errors: string[],
): void {
  if (!isPlainObject(start)) {
    errors.push(`playerStart: expected an object, got ${typeof start}`);
    return;
  }
  if (!Number.isInteger(start.col) || !Number.isInteger(start.row)) {
    errors.push(
      `playerStart: col/row must be integers, got col=${JSON.stringify(start.col)}, row=${JSON.stringify(start.row)}`,
    );
    return;
  }

  const { col, row } = start as { col: number; row: number };
  const maxCol = typeof columns === 'number' ? columns - 1 : null;
  const maxRow = typeof rows === 'number' ? rows - 1 : null;
  if (maxCol === null || maxRow === null || col < 0 || col > maxCol || row < 0 || row > maxRow) {
    errors.push(`playerStart: (${col}, ${row}) is outside the grid`);
    return;
  }

  const line = Array.isArray(grid) ? grid[row] : undefined;
  const char = typeof line === 'string' ? line[col] : undefined;
  const def = isPlainObject(tileTypes) && typeof char === 'string' ? tileTypes[char] : undefined;
  if (isPlainObject(def) && def.solid === true) {
    errors.push(`playerStart: (${col}, ${row}) lands on a solid tile "${char ?? '?'}"`);
  }
}

/**
 * Validated, read-only view over grid-map data. All queries are safe for any
 * input: anything that cannot be resolved to a walkable tile (out of bounds,
 * unknown character) counts as solid, so movement code never needs extra
 * pre-checks.
 */
export class GridMap {
  readonly data: GridMapData;

  constructor(data: GridMapData) {
    this.data = data;
  }

  get columns(): number {
    return this.data.columns;
  }

  get rows(): number {
    return this.data.rows;
  }

  get tileSize(): number {
    return this.data.tileSize;
  }

  /** Total map width in pixels. */
  get pixelWidth(): number {
    return this.data.columns * this.data.tileSize;
  }

  /** Total map height in pixels. */
  get pixelHeight(): number {
    return this.data.rows * this.data.tileSize;
  }

  get playerStart(): CellPosition {
    return this.data.playerStart;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.columns && row < this.rows;
  }

  /** Tile type at a cell, or undefined when out of bounds / unknown character. */
  tileTypeAt(col: number, row: number): TileTypeDefinition | undefined {
    if (!this.inBounds(col, row)) {
      return undefined;
    }
    const line = this.data.grid[row];
    if (typeof line !== 'string') {
      return undefined;
    }
    const char = line[col];
    if (char === undefined) {
      return undefined;
    }
    return this.data.tileTypes[char];
  }

  /** Out-of-bounds cells always count as solid (safe default for movement). */
  isSolid(col: number, row: number): boolean {
    return this.tileTypeAt(col, row)?.solid ?? true;
  }

  /** True when a player may occupy the cell: inside the grid and not solid. */
  canEnter(col: number, row: number): boolean {
    return this.inBounds(col, row) && !this.isSolid(col, row);
  }
}
