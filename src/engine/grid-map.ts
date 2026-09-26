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

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, map: new GridMap(raw as unknown as GridMapData) };
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
