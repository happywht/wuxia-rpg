import {
  directionBetweenCells,
  GRID_MAP_ACTOR_DIRECTIONS,
  type CellPosition,
  type GridMap,
  type GridMapActorDirection,
  type GridMapArtLayerData,
  type GridMapTilesetData,
} from './grid-map';

/** Data-only world atlas protocol. Coordinates in the atlas are presentation hints. */
export interface WorldMapData {
  id: string;
  startingMapResourceId: string;
  regions: WorldRegionData[];
  /** Optional CC0 pixel-art overview; absent in legacy atlases and MODs. */
  atlasArt?: WorldAtlasArtData;
  /** Optional map-local presentation pins; absent in older world maps. */
  landmarks: WorldLandmarkData[];
  transitions: RegionTransitionData[];
  events: RegionEventData[];
  /** Optional one-shot/random-step encounters; absent in older world maps. */
  randomEvents: RandomRegionEventData[];
}

export const WORLD_LANDMARK_CATEGORIES = ['settlement', 'water', 'crossing', 'route', 'other'] as const;
export type WorldLandmarkCategory = typeof WORLD_LANDMARK_CATEGORIES[number];

/** One data-authored point of interest, positioned in grid-cell coordinates. */
export interface WorldLandmarkData extends RegionEndpoint {
  id: string;
  name: string;
  category: WorldLandmarkCategory;
  /** Knowledge node required before the landmark may be revealed to the player. */
  discoveryNodeId?: string;
}

export interface WorldRegionData {
  mapResourceId: string;
  name: string;
  description: string;
  atlasPosition: { x: number; y: number };
}

/** Layered presentation-only map art. It never defines collision or movement. */
export interface WorldAtlasArtData {
  columns: number;
  rows: number;
  tileSize: number;
  /** Optional fixed region footprint in atlas cells, so adding distant map space does not stretch existing regions. */
  regionFootprint?: { columns: number; rows: number };
  tilesets: GridMapTilesetData[];
  layers: GridMapArtLayerData[];
}

export interface RegionEndpoint extends CellPosition {
  mapResourceId: string;
}

/** One-way endpoint; a return route is a second record, authored explicitly. */
export interface RegionTransitionData {
  id: string;
  name: string;
  from: RegionEndpoint;
  to: RegionEndpoint;
}

export interface RegionEventData extends CellPosition {
  id: string;
  mapResourceId: string;
  text: string;
  /** Optional ambient notice surfaced while the player is near, not on, the cell. */
  approachText?: string;
  once: boolean;
  conditions?: RegionEventConditionsData;
  discoverKnowledgeNodeId?: string;
  /**
   * Optional E-key inspection declaration. When present, the event activates
   * only through a facing interaction instead of by stepping onto the cell;
   * omitted declarations keep the legacy step-trigger behaviour.
   */
  interaction?: RegionEventInteractionData;
}

/** Cardinal facing reused from grid actors: how the player looks at a target. */
export type RegionEventApproachDirection = GridMapActorDirection;

/** Declares a fixed event as scenery the player inspects with the E key. */
export interface RegionEventInteractionData {
  /** Non-empty HUD prompt shown while the target is inspectable. */
  prompt: string;
  /** Maximum aligned cell distance to the target; defaults to 1. */
  range?: number;
  /** Allowed facings from the player toward the target; any cardinal when omitted. */
  approachDirections?: RegionEventApproachDirection[];
}

/** When a roaming event may be sampled: after a step or after a map switch. */
export const RANDOM_REGION_EVENT_TRIGGERS = ['step', 'regionArrival'] as const;
export type RandomRegionEventTrigger = typeof RANDOM_REGION_EVENT_TRIGGERS[number];

/** A roaming event attempted after a successful step or region arrival. */
export interface RandomRegionEventData {
  id: string;
  mapResourceId: string;
  text: string;
  once: boolean;
  chance: number;
  /** Omitted legacy rows keep the step-only behaviour. */
  trigger?: RandomRegionEventTrigger;
  /**
   * Arrival gates a `regionArrival` event responds to; omitted lists respond
   * to any gate whose destination is this event's map.
   */
  transitionIds?: string[];
  conditions?: RegionEventConditionsData;
  discoverKnowledgeNodeId?: string;
}

/** All declared condition groups must pass; ids inside each group are alternatives. */
export interface RegionEventConditionsData {
  knowledgeNodeIds?: string[];
  periodIds?: string[];
  weatherIds?: string[];
  tideIds?: string[];
  /** Every listed NPC must be orthogonally adjacent to the player. */
  nearbyNpcIds?: string[];
}

/** Live player/world state read by the pure region-event evaluator. */
export interface RegionEventContext {
  knownKnowledgeNodeIds: ReadonlySet<string>;
  periodId: string | null;
  weatherId: string | null;
  /** Current deterministic climate tide phase; null for legacy climate data. */
  tideId?: string | null;
  /** NPCs on this map in the player's four-way interaction range. */
  nearbyNpcIds?: ReadonlySet<string>;
}

/**
 * Cross-resource ids used to disable only events and discovery-gated
 * landmarks with dangling references. Omitted by legacy direct callers,
 * whose references are then not validated.
 */
export interface RegionEventReferenceIds {
  knowledgeNodeIds: ReadonlySet<string>;
  periodIds: ReadonlySet<string>;
  weatherIds: ReadonlySet<string>;
  /** Optional for compatibility with older climate resources and direct callers. */
  tideIds?: ReadonlySet<string>;
  /** Optional for compatibility with direct engine consumers. */
  npcIds?: ReadonlySet<string>;
}

export interface WorldMapAssembly {
  data: WorldMapData;
  regions: WorldRegionData[];
  landmarks: WorldLandmarkData[];
  transitions: RegionTransitionData[];
  events: RegionEventData[];
  randomEvents: RandomRegionEventData[];
  warnings: string[];
}

export type WorldMapParseResult =
  | { ok: true; data: WorldMapData }
  | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parseUniqueStringArray(value: unknown, label: string, errors: string[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(nonEmpty)) {
    errors.push(`${label}：应为至少含一个非空字符串的数组`);
    return null;
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${label}：不应包含重复 id`);
    return null;
  }
  return [...value];
}

function parseRegionEventConditions(value: unknown, label: string, errors: string[]): RegionEventConditionsData | null {
  if (!isObject(value)) {
    errors.push(`${label}：应为对象`);
    return null;
  }
  const allowedKeys = new Set(['knowledgeNodeIds', 'periodIds', 'weatherIds', 'tideIds', 'nearbyNpcIds']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${label}.${key}：不是受支持的条件`);
  }
  const conditions: RegionEventConditionsData = {};
  for (const key of allowedKeys) {
    if (value[key] === undefined) continue;
    const ids = parseUniqueStringArray(value[key], `${label}.${key}`, errors);
    if (ids === null) continue;
    if (key === 'knowledgeNodeIds') conditions.knowledgeNodeIds = ids;
    else if (key === 'periodIds') conditions.periodIds = ids;
    else if (key === 'weatherIds') conditions.weatherIds = ids;
    else if (key === 'tideIds') conditions.tideIds = ids;
    else conditions.nearbyNpcIds = ids;
  }
  if (Object.keys(conditions).length === 0) {
    errors.push(`${label}：至少需要一种线索、时段或天气条件`);
  }
  return conditions;
}

function parseRegionEventInteraction(value: unknown, label: string, errors: string[]): RegionEventInteractionData | null {
  if (!isObject(value)) {
    errors.push(`${label}：应为对象`);
    return null;
  }
  const allowedKeys = new Set(['prompt', 'range', 'approachDirections']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${label}.${key}：不是受支持的字段`);
  }
  const prompt = nonEmpty(value.prompt) ? value.prompt : null;
  if (prompt === null) errors.push(`${label}.prompt：应为非空字符串`);

  let range: number | null | undefined;
  if (value.range === undefined) range = undefined;
  else if (integer(value.range) && value.range >= REGION_EVENT_INTERACTION_MIN_RANGE &&
    value.range <= REGION_EVENT_INTERACTION_MAX_RANGE) range = value.range;
  else {
    range = null;
    errors.push(`${label}.range：应为 ${REGION_EVENT_INTERACTION_MIN_RANGE}–${REGION_EVENT_INTERACTION_MAX_RANGE} 之间的整数`);
  }

  let approachDirections: RegionEventApproachDirection[] | null | undefined;
  if (value.approachDirections === undefined) approachDirections = undefined;
  else if (!Array.isArray(value.approachDirections) || value.approachDirections.length === 0) {
    approachDirections = null;
    errors.push(`${label}.approachDirections：应为 down/left/right/up 的非空数组`);
  } else if (!value.approachDirections.every((entry) =>
    typeof entry === 'string' && (GRID_MAP_ACTOR_DIRECTIONS as readonly string[]).includes(entry))) {
    approachDirections = null;
    errors.push(`${label}.approachDirections：应只包含 down/left/right/up 方向`);
  } else if (new Set(value.approachDirections).size !== value.approachDirections.length) {
    approachDirections = null;
    errors.push(`${label}.approachDirections：不应包含重复方向`);
  } else {
    approachDirections = [...value.approachDirections] as RegionEventApproachDirection[];
  }

  if (prompt === null || range === null || approachDirections === null) return null;
  const interaction: RegionEventInteractionData = { prompt };
  if (range !== undefined) interaction.range = range;
  if (approachDirections !== undefined) interaction.approachDirections = approachDirections;
  return interaction;
}

function parseCell(value: unknown, label: string, errors: string[]): CellPosition | null {
  if (!isObject(value) || !integer(value.col) || !integer(value.row) || value.col < 0 || value.row < 0) {
    errors.push(`${label}：应含非负整数 col 与 row`);
    return null;
  }
  return { col: value.col, row: value.row };
}

/** Canonical wire token of one atlas row run: positive decimal length and unsigned gid. */
const ATLAS_RLE_TOKEN = /^([1-9][0-9]*):(0|[1-9][0-9]*)$/;

/** Validates one legacy dense `cells` matrix into the runtime row list. */
function parseDenseAtlasLayer(
  cells: unknown,
  columns: number | null,
  rows: number | null,
  tileset: GridMapTilesetData | undefined,
  path: string,
  errors: string[],
): number[][] | null {
  if (!Array.isArray(cells)) {
    errors.push(`${path}.cells：应为二维数组`);
    return null;
  }
  if (rows !== null && cells.length !== rows) {
    errors.push(`${path}.cells：应有 ${rows} 行，实际 ${cells.length} 行`);
  }
  let valid = true;
  const parsedRows: number[][] = [];
  cells.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      errors.push(`${path}.cells[${rowIndex}]：应为数组`);
      valid = false;
      return;
    }
    if (columns !== null && row.length !== columns) {
      errors.push(`${path}.cells[${rowIndex}]：应有 ${columns} 格，实际 ${row.length} 格`);
      valid = false;
    }
    const parsedRow: number[] = [];
    row.forEach((gid, colIndex) => {
      if (!integer(gid) || gid < 0 || gid > 0xffffffff) {
        errors.push(`${path}.cells[${rowIndex}][${colIndex}]：应为无符号整数 GID`);
        valid = false;
        return;
      }
      const frame = gid & 0x0fffffff;
      if (frame !== 0 && (tileset === undefined || frame > tileset.tileCount)) {
        errors.push(`${path}.cells[${rowIndex}][${colIndex}]：帧 ${frame} 超出图集`);
        valid = false;
      }
      parsedRow.push(gid);
    });
    parsedRows.push(parsedRow);
  });
  return valid ? parsedRows : null;
}

/**
 * Decodes one compact `cellsRle` wire layer — a string per atlas row of
 * comma-separated `runLength:gid` tokens — into the dense runtime matrix.
 * Row count, per-row run totals and tileset frame bounds are enforced here
 * so malformed rows surface as readable errors instead of render holes.
 */
function parseRleAtlasLayer(
  cellsRle: unknown,
  columns: number | null,
  rows: number | null,
  tileset: GridMapTilesetData | undefined,
  path: string,
  errors: string[],
): number[][] | null {
  if (!Array.isArray(cellsRle)) {
    errors.push(`${path}.cellsRle：应为字符串数组`);
    return null;
  }
  if (rows !== null && cellsRle.length !== rows) {
    errors.push(`${path}.cellsRle：应有 ${rows} 行，实际 ${cellsRle.length} 行`);
  }
  let valid = true;
  const parsedRows: number[][] = [];
  cellsRle.forEach((row, rowIndex) => {
    const rowPath = `${path}.cellsRle[${rowIndex}]`;
    if (typeof row !== 'string') {
      errors.push(`${rowPath}：应为字符串`);
      valid = false;
      return;
    }
    if (row.length === 0) {
      errors.push(`${rowPath}：不应为空行`);
      valid = false;
      return;
    }
    let total = 0;
    let rowValid = true;
    const parsedRow: number[] = [];
    row.split(',').forEach((token, tokenIndex) => {
      const match = ATLAS_RLE_TOKEN.exec(token);
      if (match === null) {
        errors.push(`${rowPath}：第 ${tokenIndex + 1} 段 "${token}" 应为 游程:GID（正数十进制游程与无符号 GID）`);
        rowValid = false;
        return;
      }
      const runLength = Number(match[1]);
      const gid = Number(match[2]);
      if (runLength > 640 || gid > 0xffffffff) {
        errors.push(`${rowPath}：第 ${tokenIndex + 1} 段 "${token}" 超出游程或 GID 上限`);
        rowValid = false;
        return;
      }
      total += runLength;
      if (columns !== null && total > columns) {
        errors.push(`${rowPath}：游程超过列数上限 ${columns} 格`);
        rowValid = false;
        return;
      }
      const frame = gid & 0x0fffffff;
      if (frame !== 0 && (tileset === undefined || frame > tileset.tileCount)) {
        errors.push(`${rowPath}：第 ${tokenIndex + 1} 段 "${token}" 的帧 ${frame} 超出图集`);
        rowValid = false;
        return;
      }
      for (let repeat = 0; repeat < runLength; repeat += 1) parsedRow.push(gid);
    });
    if (rowValid && columns !== null && total !== columns) {
      errors.push(`${rowPath}：游程应有 ${columns} 格，实际 ${total} 格`);
      rowValid = false;
    }
    if (!rowValid) valid = false;
    parsedRows.push(parsedRow);
  });
  return valid ? parsedRows : null;
}

function parseAtlasArt(value: unknown, errors: string[]): WorldAtlasArtData | null {
  const label = 'atlasArt';
  if (!isObject(value)) {
    errors.push(`${label}：应为对象`);
    return null;
  }
  const allowed = new Set(['columns', 'rows', 'tileSize', 'regionFootprint', 'tilesets', 'layers']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label}.${key}：不是受支持的字段`);
  const dimension = (field: 'columns' | 'rows'): number | null => {
    const candidate = value[field];
    if (!integer(candidate) || candidate < 1 || candidate > 640) {
      errors.push(`${label}.${field}：应为 1–640 之间的整数`);
      return null;
    }
    return candidate;
  };
  const columns = dimension('columns');
  const rows = dimension('rows');
  const tileSize = integer(value.tileSize) && value.tileSize >= 1 && value.tileSize <= 256
    ? value.tileSize
    : null;
  if (tileSize === null) errors.push(`${label}.tileSize：应为 1–256 之间的整数`);
  let regionFootprint: WorldAtlasArtData['regionFootprint'];
  if (value.regionFootprint !== undefined) {
    if (!isObject(value.regionFootprint) ||
      typeof value.regionFootprint.columns !== 'number' || !Number.isFinite(value.regionFootprint.columns) ||
      value.regionFootprint.columns <= 0 || value.regionFootprint.columns > 640 ||
      typeof value.regionFootprint.rows !== 'number' || !Number.isFinite(value.regionFootprint.rows) ||
      value.regionFootprint.rows <= 0 || value.regionFootprint.rows > 640 ||
      Object.keys(value.regionFootprint).some((key) => key !== 'columns' && key !== 'rows')) {
      errors.push(`${label}.regionFootprint：应为含正数 columns/rows 的对象`);
    } else {
      regionFootprint = { columns: value.regionFootprint.columns, rows: value.regionFootprint.rows };
    }
  }

  const tilesets: GridMapTilesetData[] = [];
  const tilesetIds = new Set<string>();
  const rawTilesets = Array.isArray(value.tilesets) ? value.tilesets : [];
  if (rawTilesets.length === 0) {
    errors.push(`${label}.tilesets：应为非空图集数组`);
  } else rawTilesets.forEach((entry, index) => {
    const path = `${label}.tilesets[${index}]`;
    if (!isObject(entry)) { errors.push(`${path}：应为对象`); return; }
    const { id, image, tileSize: sourceSize, columns: sourceColumns, rows: sourceRows, spacing, tileCount } = entry;
    if (!nonEmpty(id)) errors.push(`${path}.id：应为非空字符串`);
    if (nonEmpty(id) && tilesetIds.has(id)) errors.push(`${path}.id：图集 id 重复`);
    if (nonEmpty(id)) tilesetIds.add(id);
    if (typeof image !== 'string' || image.trim().length === 0 || image.startsWith('/') ||
      image.split('/').some((part) => part === '..')) errors.push(`${path}.image：应为不含绝对路径或 .. 的相对路径`);
    const integerField = (name: string, candidate: unknown, min: number, max: number): candidate is number => {
      if (!integer(candidate) || candidate < min || candidate > max) {
        errors.push(`${path}.${name}：应为 ${min}–${max} 之间的整数`);
        return false;
      }
      return true;
    };
    const validSourceSize = integerField('tileSize', sourceSize, 1, 256);
    const validSourceColumns = integerField('columns', sourceColumns, 1, 1024);
    const validSourceRows = integerField('rows', sourceRows, 1, 1024);
    const validSpacing = integerField('spacing', spacing, 0, 32);
    const validCount = integerField('tileCount', tileCount, 1, 1_048_576);
    if (validSourceColumns && validSourceRows && validCount && tileCount > sourceColumns * sourceRows) {
      errors.push(`${path}.tileCount：超过图集容量`);
    }
    if (nonEmpty(id) && typeof image === 'string' && validSourceSize && validSourceColumns && validSourceRows &&
      validSpacing && validCount) {
      tilesets.push({
        id, image, tileSize: sourceSize, columns: sourceColumns, rows: sourceRows,
        spacing, tileCount,
      });
    }
  });

  const layers: GridMapArtLayerData[] = [];
  const layerIds = new Set<string>();
  const rawLayers = Array.isArray(value.layers) ? value.layers : [];
  if (rawLayers.length === 0) {
    errors.push(`${label}.layers：应为非空图层数组`);
  } else rawLayers.forEach((entry, layerIndex) => {
    const path = `${label}.layers[${layerIndex}]`;
    if (!isObject(entry)) { errors.push(`${path}：应为对象`); return; }
    for (const key of Object.keys(entry)) {
      if (key !== 'id' && key !== 'tilesetId' && key !== 'cells' && key !== 'cellsRle') {
        errors.push(`${path}.${key}：不是受支持的字段`);
      }
    }
    const { id, tilesetId, cells, cellsRle } = entry;
    if (!nonEmpty(id)) errors.push(`${path}.id：应为非空字符串`);
    if (nonEmpty(id) && layerIds.has(id)) errors.push(`${path}.id：图层 id 重复`);
    if (nonEmpty(id)) layerIds.add(id);
    if (!nonEmpty(tilesetId) || !tilesetIds.has(tilesetId)) {
      errors.push(`${path}.tilesetId：未引用已声明图集`);
    }
    if (cells !== undefined && cellsRle !== undefined) {
      errors.push(`${path}：cells 与 cellsRle 只能提供其中一种`);
      return;
    }
    const tileset = tilesets.find((candidate) => candidate.id === tilesetId);
    let parsedRows: number[][] | null = null;
    if (cells !== undefined) {
      parsedRows = parseDenseAtlasLayer(cells, columns, rows, tileset, path, errors);
    } else if (cellsRle !== undefined) {
      parsedRows = parseRleAtlasLayer(cellsRle, columns, rows, tileset, path, errors);
    } else {
      errors.push(`${path}：应提供 cells 或 cellsRle 之一`);
    }
    if (parsedRows !== null && nonEmpty(id) && nonEmpty(tilesetId) && tilesetIds.has(tilesetId)) {
      layers.push({ id, tilesetId, cells: parsedRows });
    }
  });

  if (columns === null || rows === null || tileSize === null || layers.length !== rawLayers.length ||
    tilesets.length !== rawTilesets.length) return null;
  return { columns, rows, tileSize, ...(regionFootprint === undefined ? {} : { regionFootprint }), tilesets, layers };
}

function parseEndpoint(value: unknown, label: string, errors: string[]): RegionEndpoint | null {
  const cell = parseCell(value, label, errors);
  if (!isObject(value) || cell === null || !nonEmpty(value.mapResourceId)) {
    if (isObject(value) && !nonEmpty(value.mapResourceId)) {
      errors.push(`${label}.mapResourceId：应为非空字符串`);
    }
    return null;
  }
  return { ...cell, mapResourceId: value.mapResourceId };
}

/** Defensive runtime parser alongside the manifest Ajv schema. */
export function parseWorldMap(raw: unknown): WorldMapParseResult {
  if (!isObject(raw)) return { ok: false, errors: ['根节点应为 JSON 对象'] };
  const errors: string[] = [];
  if (!nonEmpty(raw.id)) errors.push('id：应为非空字符串');
  if (!nonEmpty(raw.startingMapResourceId)) errors.push('startingMapResourceId：应为非空字符串');
  const atlasArt = raw.atlasArt === undefined ? undefined : parseAtlasArt(raw.atlasArt, errors) ?? undefined;
  const regions: WorldRegionData[] = [];
  if (!Array.isArray(raw.regions) || raw.regions.length === 0) {
    errors.push('regions：应为非空区域数组');
  } else raw.regions.forEach((entry, index) => {
    const label = `regions[${index}]`;
    if (!isObject(entry)) { errors.push(`${label}：应为对象`); return; }
    const mapResourceId = nonEmpty(entry.mapResourceId) ? entry.mapResourceId : null;
    const name = nonEmpty(entry.name) ? entry.name : null;
    const description = typeof entry.description === 'string' ? entry.description : null;
    const pos = entry.atlasPosition;
    const atlasPosition = isObject(pos) && typeof pos.x === 'number' && Number.isFinite(pos.x) &&
      typeof pos.y === 'number' && Number.isFinite(pos.y) && pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100
      ? { x: pos.x, y: pos.y } : null;
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (name === null) errors.push(`${label}.name：应为非空字符串`);
    if (description === null) errors.push(`${label}.description：应为字符串`);
    if (atlasPosition === null) errors.push(`${label}.atlasPosition：x/y 应为 0–100 有限数值`);
    if (mapResourceId !== null && name !== null && description !== null && atlasPosition !== null)
      regions.push({ mapResourceId, name, description, atlasPosition });
  });
  const landmarks: WorldLandmarkData[] = [];
  const rawLandmarks = raw.landmarks === undefined ? [] : raw.landmarks;
  if (!Array.isArray(rawLandmarks)) errors.push('landmarks：应为数组');
  else rawLandmarks.forEach((entry, index) => {
    const label = `landmarks[${index}]`;
    if (!isObject(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = nonEmpty(entry.id) ? entry.id : null;
    const name = nonEmpty(entry.name) ? entry.name : null;
    const mapResourceId = nonEmpty(entry.mapResourceId) ? entry.mapResourceId : null;
    const cell = parseCell(entry, label, errors);
    const category = typeof entry.category === 'string' &&
      (WORLD_LANDMARK_CATEGORIES as readonly string[]).includes(entry.category)
      ? entry.category as WorldLandmarkCategory : null;
    const discoveryNodeId = entry.discoveryNodeId === undefined
      ? undefined
      : nonEmpty(entry.discoveryNodeId) ? entry.discoveryNodeId : null;
    if (id === null) errors.push(`${label}.id：应为非空字符串`);
    if (name === null) errors.push(`${label}.name：应为非空字符串`);
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (category === null) errors.push(`${label}.category：应为受支持的地标类型`);
    if (discoveryNodeId === null) errors.push(`${label}.discoveryNodeId：应为非空字符串`);
    if (id !== null && name !== null && mapResourceId !== null && cell !== null && category !== null &&
      discoveryNodeId !== null) {
      landmarks.push({
        id, name, mapResourceId, ...cell, category,
        ...(discoveryNodeId === undefined ? {} : { discoveryNodeId }),
      });
    }
  });
  const transitions: RegionTransitionData[] = [];
  if (!Array.isArray(raw.transitions)) errors.push('transitions：应为数组');
  else raw.transitions.forEach((entry, index) => {
    const label = `transitions[${index}]`;
    if (!isObject(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = nonEmpty(entry.id) ? entry.id : null;
    const name = nonEmpty(entry.name) ? entry.name : null;
    const from = parseEndpoint(entry.from, `${label}.from`, errors);
    const to = parseEndpoint(entry.to, `${label}.to`, errors);
    if (id === null) errors.push(`${label}.id：应为非空字符串`);
    if (name === null) errors.push(`${label}.name：应为非空字符串`);
    if (id !== null && name !== null && from !== null && to !== null) transitions.push({ id, name, from, to });
  });
  const events: RegionEventData[] = [];
  if (!Array.isArray(raw.events)) errors.push('events：应为数组');
  else raw.events.forEach((entry, index) => {
    const label = `events[${index}]`;
    if (!isObject(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = nonEmpty(entry.id) ? entry.id : null;
    const mapResourceId = nonEmpty(entry.mapResourceId) ? entry.mapResourceId : null;
    const text = nonEmpty(entry.text) ? entry.text : null;
    const approachText = entry.approachText === undefined
      ? undefined
      : nonEmpty(entry.approachText) ? entry.approachText : null;
    const cell = parseCell(entry, label, errors);
    const once = typeof entry.once === 'boolean' ? entry.once : null;
    const conditions = entry.conditions === undefined
      ? undefined
      : parseRegionEventConditions(entry.conditions, `${label}.conditions`, errors);
    const discoverKnowledgeNodeId = entry.discoverKnowledgeNodeId === undefined
      ? undefined
      : nonEmpty(entry.discoverKnowledgeNodeId) ? entry.discoverKnowledgeNodeId : null;
    const interaction = entry.interaction === undefined
      ? undefined
      : parseRegionEventInteraction(entry.interaction, `${label}.interaction`, errors);
    if (id === null) errors.push(`${label}.id：应为非空字符串`);
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (text === null) errors.push(`${label}.text：应为非空字符串`);
    if (approachText === null) errors.push(`${label}.approachText：应为非空字符串`);
    if (once === null) errors.push(`${label}.once：应为布尔值`);
    if (discoverKnowledgeNodeId === null) errors.push(`${label}.discoverKnowledgeNodeId：应为非空字符串`);
    if (id !== null && mapResourceId !== null && text !== null && approachText !== null && once !== null &&
      cell !== null && conditions !== null && discoverKnowledgeNodeId !== null && interaction !== null) {
      events.push({
        id, mapResourceId, ...cell, text, once,
        ...(approachText === undefined ? {} : { approachText }),
        ...(conditions === undefined ? {} : { conditions }),
        ...(discoverKnowledgeNodeId === undefined ? {} : { discoverKnowledgeNodeId }),
        ...(interaction === undefined ? {} : { interaction }),
      });
    }
  });
  const randomEvents: RandomRegionEventData[] = [];
  const rawRandomEvents = raw.randomEvents === undefined ? [] : raw.randomEvents;
  if (!Array.isArray(rawRandomEvents)) errors.push('randomEvents：应为数组');
  else rawRandomEvents.forEach((entry, index) => {
    const label = `randomEvents[${index}]`;
    if (!isObject(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = nonEmpty(entry.id) ? entry.id : null;
    const mapResourceId = nonEmpty(entry.mapResourceId) ? entry.mapResourceId : null;
    const text = nonEmpty(entry.text) ? entry.text : null;
    const once = typeof entry.once === 'boolean' ? entry.once : null;
    const chance = typeof entry.chance === 'number' && Number.isFinite(entry.chance) &&
      entry.chance >= 0 && entry.chance <= 1 ? entry.chance : null;
    const rawTrigger: unknown = entry.trigger === undefined ? 'step' : entry.trigger;
    const trigger = typeof rawTrigger === 'string' &&
      (RANDOM_REGION_EVENT_TRIGGERS as readonly string[]).includes(rawTrigger)
      ? rawTrigger as RandomRegionEventTrigger
      : null;
    const transitionIds = entry.transitionIds === undefined
      ? undefined
      : parseUniqueStringArray(entry.transitionIds, `${label}.transitionIds`, errors);
    const transitionMisdeclared = trigger === 'step' && transitionIds !== undefined;
    const conditions = entry.conditions === undefined
      ? undefined
      : parseRegionEventConditions(entry.conditions, `${label}.conditions`, errors);
    const discoverKnowledgeNodeId = entry.discoverKnowledgeNodeId === undefined
      ? undefined
      : nonEmpty(entry.discoverKnowledgeNodeId) ? entry.discoverKnowledgeNodeId : null;
    if (id === null) errors.push(`${label}.id：应为非空字符串`);
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (text === null) errors.push(`${label}.text：应为非空字符串`);
    if (once === null) errors.push(`${label}.once：应为布尔值`);
    if (chance === null) errors.push(`${label}.chance：应为 0–1 之间的有限数值`);
    if (trigger === null) errors.push(`${label}.trigger：应为 step 或 regionArrival`);
    if (transitionMisdeclared) {
      errors.push(`${label}.transitionIds：仅 regionArrival 触发可声明入境关口`);
    }
    if (discoverKnowledgeNodeId === null) errors.push(`${label}.discoverKnowledgeNodeId：应为非空字符串`);
    if (id !== null && mapResourceId !== null && text !== null && once !== null && chance !== null &&
      trigger !== null && !transitionMisdeclared && transitionIds !== null && conditions !== null &&
      discoverKnowledgeNodeId !== null) {
      randomEvents.push({
        id, mapResourceId, text, once, chance,
        ...(trigger === 'step' ? {} : { trigger }),
        ...(transitionIds === undefined ? {} : { transitionIds }),
        ...(conditions === undefined ? {} : { conditions }),
        ...(discoverKnowledgeNodeId === undefined ? {} : { discoverKnowledgeNodeId }),
      });
    }
  });
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: {
      id: raw.id as string,
      startingMapResourceId: raw.startingMapResourceId as string,
      regions,
      ...(atlasArt === undefined ? {} : { atlasArt }),
      landmarks,
      transitions,
      events,
      randomEvents,
    } };
}

/**
 * Offset from an interaction target to the player cell facing it along each
 * approach direction. `up` means the target sits above the player, so the
 * player cell lies one step below the target, and so on for the other cards.
 */
const APPROACH_DIRECTION_PLAYER_OFFSETS: Record<RegionEventApproachDirection, CellPosition> = {
  down: { col: 0, row: -1 },
  left: { col: 1, row: 0 },
  right: { col: -1, row: 0 },
  up: { col: 0, row: 1 },
};

/**
 * True when at least one declared approach direction has a walkable player
 * cell within the declared range. Only the standing cell is checked here;
 * live line-of-sight between the player and the target stays a runtime
 * concern because passability can change after assembly.
 */
function hasWalkableInteractionApproach(
  map: GridMap,
  col: number,
  row: number,
  interaction: RegionEventInteractionData,
): boolean {
  const range = interaction.range ?? REGION_EVENT_INTERACTION_DEFAULT_RANGE;
  return GRID_MAP_ACTOR_DIRECTIONS.some((direction) => {
    if (interaction.approachDirections !== undefined &&
      !interaction.approachDirections.includes(direction)) return false;
    const offset = APPROACH_DIRECTION_PLAYER_OFFSETS[direction];
    for (let distance = 1; distance <= range; distance += 1) {
      const approachCol = col + offset.col * distance;
      const approachRow = row + offset.row * distance;
      if (!map.canEnter(approachCol, approachRow)) break;
      return true;
    }
    return false;
  });
}

/** Resolves map references and isolates bad region links/events to their row. */
export function assembleWorldMap(
  data: WorldMapData,
  maps: ReadonlyMap<string, GridMap>,
  eventReferences?: RegionEventReferenceIds,
): WorldMapAssembly | { ok: false; errors: string[] } {
  const warnings: string[] = [];
  const regions: WorldRegionData[] = [];
  const seenRegions = new Set<string>();
  for (const region of data.regions) {
    const map = maps.get(region.mapResourceId);
    if (seenRegions.has(region.mapResourceId)) {
      warnings.push(`区域地图 "${region.mapResourceId}" 重复登记，忽略后续条目`);
      continue;
    }
    seenRegions.add(region.mapResourceId);
    if (map === undefined) {
      warnings.push(`区域 "${region.name}" 引用的地图 "${region.mapResourceId}" 不可用，已忽略`);
      continue;
    }
    regions.push(region);
  }
  if (!maps.has(data.startingMapResourceId) || !regions.some((region) => region.mapResourceId === data.startingMapResourceId)) {
    return { ok: false, errors: [`起始地图资源 "${data.startingMapResourceId}" 未登记、无效或未加入区域列表`] };
  }
  const transitions: RegionTransitionData[] = [];
  const seenTransitionIds = new Set<string>();
  for (const transition of data.transitions) {
    const fromMap = maps.get(transition.from.mapResourceId);
    const toMap = maps.get(transition.to.mapResourceId);
    const problems: string[] = [];
    if (seenTransitionIds.has(transition.id)) problems.push('id 重复');
    if (!regions.some((region) => region.mapResourceId === transition.from.mapResourceId)) problems.push('来源地图不在世界图区域中');
    if (!regions.some((region) => region.mapResourceId === transition.to.mapResourceId)) problems.push('目的地图不在世界图区域中');
    if (fromMap === undefined || !fromMap.canEnter(transition.from.col, transition.from.row)) problems.push('来源坐标不可通行');
    else if (transition.from.col === fromMap.playerStart.col && transition.from.row === fromMap.playerStart.row) problems.push('来源坐标与玩家出生点重叠');
    if (toMap === undefined || !toMap.canEnter(transition.to.col, transition.to.row)) problems.push('目的坐标不可通行');
    seenTransitionIds.add(transition.id);
    if (problems.length > 0) warnings.push(`关口 "${transition.id}" 已禁用：${problems.join('；')}`);
    else transitions.push(transition);
  }
  /** Assembled (enabled) gates only, so arrival events never match a disabled transition. */
  const transitionsById = new Map(transitions.map((transition) => [transition.id, transition]));
  const landmarks: WorldLandmarkData[] = [];
  const seenLandmarkIds = new Set<string>();
  for (const landmark of data.landmarks) {
    const map = maps.get(landmark.mapResourceId);
    const problems: string[] = [];
    if (seenLandmarkIds.has(landmark.id)) problems.push('id 重复');
    if (!regions.some((region) => region.mapResourceId === landmark.mapResourceId)) problems.push('地图不在世界图区域中');
    if (map === undefined || landmark.col >= map.columns || landmark.row >= map.rows) problems.push('坐标超出地图范围');
    if (eventReferences !== undefined && landmark.discoveryNodeId !== undefined &&
      !eventReferences.knowledgeNodeIds.has(landmark.discoveryNodeId)) {
      problems.push(`发现节点未登记：${landmark.discoveryNodeId}`);
    }
    seenLandmarkIds.add(landmark.id);
    if (problems.length > 0) warnings.push(`地标 "${landmark.id}" 已忽略：${problems.join('；')}`);
    else landmarks.push(landmark);
  }
  const events: RegionEventData[] = [];
  const randomEvents: RandomRegionEventData[] = [];
  const seenEvents = new Set<string>();
  for (const event of data.events) {
    const map = maps.get(event.mapResourceId);
    const problems: string[] = [];
    if (seenEvents.has(event.id)) problems.push('id 重复');
    if (!regions.some((region) => region.mapResourceId === event.mapResourceId)) problems.push('地图不在世界图区域中');
    if (event.interaction === undefined) {
      if (map === undefined || !map.canEnter(event.col, event.row)) problems.push('触发坐标不可通行');
    } else if (map === undefined || event.col >= map.data.columns || event.row >= map.data.rows) {
      problems.push('交互坐标超出地图范围');
    } else if (!hasWalkableInteractionApproach(map, event.col, event.row, event.interaction)) {
      problems.push('交互目标在声明方向与调查距离内无可通行接近格');
    }
    if (eventReferences !== undefined) {
      if (event.discoverKnowledgeNodeId !== undefined &&
        !eventReferences.knowledgeNodeIds.has(event.discoverKnowledgeNodeId)) {
        problems.push(`发现节点未登记：${event.discoverKnowledgeNodeId}`);
      }
      for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
        if (!eventReferences.knowledgeNodeIds.has(nodeId)) problems.push(`条件节点未登记：${nodeId}`);
      }
      for (const periodId of event.conditions?.periodIds ?? []) {
        if (!eventReferences.periodIds.has(periodId)) problems.push(`引用无效时段：${periodId}`);
      }
      for (const weatherId of event.conditions?.weatherIds ?? []) {
        if (!eventReferences.weatherIds.has(weatherId)) problems.push(`引用无效天气：${weatherId}`);
      }
      for (const tideId of event.conditions?.tideIds ?? []) {
        if (eventReferences.tideIds !== undefined && !eventReferences.tideIds.has(tideId)) {
          problems.push(`引用无效潮位：${tideId}`);
        }
      }
      for (const npcId of event.conditions?.nearbyNpcIds ?? []) {
        if (eventReferences.npcIds !== undefined && !eventReferences.npcIds.has(npcId)) {
          problems.push(`附近 NPC 未登记：${npcId}`);
        }
      }
    }
    seenEvents.add(event.id);
    if (problems.length > 0) warnings.push(`区域事件 "${event.id}" 已禁用：${problems.join('；')}`);
    else events.push(event);
  }
  for (const event of data.randomEvents) {
    const problems: string[] = [];
    if (seenEvents.has(event.id)) problems.push('id 与其他区域事件重复');
    if (!regions.some((region) => region.mapResourceId === event.mapResourceId)) {
      problems.push('地图不在世界图区域中');
    }
    if (event.trigger === 'regionArrival') {
      for (const transitionId of event.transitionIds ?? []) {
        const transition = transitionsById.get(transitionId);
        if (transition === undefined) problems.push(`入境关口未登记：${transitionId}`);
        else if (transition.to.mapResourceId !== event.mapResourceId) {
          problems.push(`入境关口 "${transitionId}" 通向的地图与事件地图不一致`);
        }
      }
    }
    if (eventReferences !== undefined) {
      if (event.discoverKnowledgeNodeId !== undefined &&
        !eventReferences.knowledgeNodeIds.has(event.discoverKnowledgeNodeId)) {
        problems.push(`发现节点未登记：${event.discoverKnowledgeNodeId}`);
      }
      for (const nodeId of event.conditions?.knowledgeNodeIds ?? []) {
        if (!eventReferences.knowledgeNodeIds.has(nodeId)) problems.push(`条件节点未登记：${nodeId}`);
      }
      for (const periodId of event.conditions?.periodIds ?? []) {
        if (!eventReferences.periodIds.has(periodId)) problems.push(`引用无效时段：${periodId}`);
      }
      for (const weatherId of event.conditions?.weatherIds ?? []) {
        if (!eventReferences.weatherIds.has(weatherId)) problems.push(`引用无效天气：${weatherId}`);
      }
      for (const tideId of event.conditions?.tideIds ?? []) {
        if (eventReferences.tideIds !== undefined && !eventReferences.tideIds.has(tideId)) {
          problems.push(`引用无效潮位：${tideId}`);
        }
      }
      for (const npcId of event.conditions?.nearbyNpcIds ?? []) {
        if (eventReferences.npcIds !== undefined && !eventReferences.npcIds.has(npcId)) {
          problems.push(`附近 NPC 未登记：${npcId}`);
        }
      }
    }
    seenEvents.add(event.id);
    if (problems.length > 0) warnings.push(`漫游奇遇「${event.id}」已禁用：${problems.join('；')}`);
    else randomEvents.push(event);
  }
  return { data, regions, landmarks, transitions, events, randomEvents, warnings };
}

/** Returns only map pins that are currently public to the player's knowledge state. */
export function selectVisibleWorldLandmarks(
  landmarks: readonly WorldLandmarkData[],
  knownKnowledgeNodeIds: ReadonlySet<string>,
): WorldLandmarkData[] {
  return landmarks.filter((landmark) =>
    landmark.discoveryNodeId === undefined || knownKnowledgeNodeIds.has(landmark.discoveryNodeId),
  );
}

/** True when every condition group on this event is satisfied by live state. */
export function regionEventConditionsMet(
  event: Pick<RegionEventData, 'conditions'>,
  context: RegionEventContext,
): boolean {
  const conditions = event.conditions;
  if (conditions === undefined) return true;
  if (conditions.knowledgeNodeIds?.some((id) => !context.knownKnowledgeNodeIds.has(id))) return false;
  if (conditions.periodIds !== undefined &&
    (context.periodId === null || !conditions.periodIds.includes(context.periodId))) return false;
  if (conditions.weatherIds !== undefined &&
    (context.weatherId === null || !conditions.weatherIds.includes(context.weatherId))) return false;
  if (conditions.tideIds !== undefined &&
    (context.tideId == null || !conditions.tideIds.includes(context.tideId))) return false;
  const nearbyNpcIds = context.nearbyNpcIds ?? new Set<string>();
  if (conditions.nearbyNpcIds?.some((id) => !nearbyNpcIds.has(id))) return false;
  return true;
}

/**
 * Selects ready step-triggered events at an exact cell without mutating
 * completion or knowledge state. Events carrying an interaction declaration
 * are E-key inspections and never fire by stepping onto their cell.
 */
export function selectTriggeredRegionEvents(
  events: readonly RegionEventData[],
  location: { mapResourceId: string } & CellPosition,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
): RegionEventData[] {
  return events.filter((event) =>
    event.interaction === undefined &&
    event.mapResourceId === location.mapResourceId &&
    event.col === location.col && event.row === location.row &&
    (!event.once || !completedEventIds.has(event.id)) &&
    regionEventConditionsMet(event, context),
  );
}

/** Manhattan distance within which a fixed event's approach clue may surface. */
export const REGION_EVENT_APPROACH_RADIUS = 2;

/**
 * Picks the nearest eligible fixed event's ambient clue around the player.
 * Only the data-authored clue string is returned — never the full discovery
 * text or node ids. The exact trigger cell stays silent (the event itself
 * fires there), live event conditions still apply, completed one-shot events
 * and already-discovered nodes are suppressed, and equal distances resolve
 * by stable event id.
 */
export function selectRegionEventApproachClue(
  events: readonly RegionEventData[],
  location: { mapResourceId: string } & CellPosition,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
  radius: number = REGION_EVENT_APPROACH_RADIUS,
): string | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  let best: { id: string; approachText: string; distance: number } | null = null;
  for (const event of events) {
    if (event.approachText === undefined || event.mapResourceId !== location.mapResourceId) continue;
    if (event.once && completedEventIds.has(event.id)) continue;
    if (event.discoverKnowledgeNodeId !== undefined &&
      context.knownKnowledgeNodeIds.has(event.discoverKnowledgeNodeId)) continue;
    if (!regionEventConditionsMet(event, context)) continue;
    const distance = Math.abs(event.col - location.col) + Math.abs(event.row - location.row);
    if (distance <= 0 || distance > radius) continue;
    if (best === null || distance < best.distance ||
      (distance === best.distance && event.id.localeCompare(best.id) < 0)) {
      best = { id: event.id, approachText: event.approachText, distance };
    }
  }
  return best === null ? null : best.approachText;
}

/** Bounds for the optional interaction `range`; authored distance in aligned cells. */
export const REGION_EVENT_INTERACTION_MIN_RANGE = 1;
export const REGION_EVENT_INTERACTION_MAX_RANGE = 4;
export const REGION_EVENT_INTERACTION_DEFAULT_RANGE = 1;

/** One inspectable interaction target with everything the HUD and settlement need. */
export interface RegionEventInteractionSelection {
  event: RegionEventData;
  prompt: string;
  /** Facing from the player toward the target that satisfied the declaration. */
  approachDirection: RegionEventApproachDirection;
  /** Aligned cell distance between the player and the target. */
  distance: number;
}

/**
 * Picks the single best E-key interaction target around the player without
 * mutating completion or knowledge state. Candidates must sit on the same
 * row or column within their declared range (default 1); the target cell
 * itself may be solid, but every strictly intermediate cell must pass the
 * optional passability callback. The approach facing is computed from the
 * player toward the target and filtered by the authored direction list,
 * live event conditions and once-completion still apply, and equal
 * distances resolve by stable event id.
 */
export function selectInteractableRegionEvent(
  events: readonly RegionEventData[],
  location: { mapResourceId: string } & CellPosition,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
  isPassable?: (col: number, row: number) => boolean,
): RegionEventInteractionSelection | null {
  let best: RegionEventInteractionSelection | null = null;
  for (const event of events) {
    const interaction = event.interaction;
    if (interaction === undefined || event.mapResourceId !== location.mapResourceId) continue;
    if (event.once && completedEventIds.has(event.id)) continue;
    if (!regionEventConditionsMet(event, context)) continue;
    const deltaCol = event.col - location.col;
    const deltaRow = event.row - location.row;
    // Aligned cardinal targets only: same column or same row as the player.
    if (deltaCol !== 0 && deltaRow !== 0) continue;
    const distance = Math.abs(deltaCol) + Math.abs(deltaRow);
    if (distance < 1 || distance > (interaction.range ?? REGION_EVENT_INTERACTION_DEFAULT_RANGE)) continue;
    const approachDirection = directionBetweenCells(location, event);
    if (interaction.approachDirections !== undefined &&
      !interaction.approachDirections.includes(approachDirection)) continue;
    if (isPassable !== undefined) {
      // Line of sight: every cell strictly between player and target, so the
      // (possibly solid) target itself is never tested by the callback.
      const stepCol = Math.sign(deltaCol);
      const stepRow = Math.sign(deltaRow);
      let clear = true;
      for (let step = 1; step < distance; step += 1) {
        if (!isPassable(location.col + stepCol * step, location.row + stepRow * step)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
    }
    if (best === null || distance < best.distance ||
      (distance === best.distance && event.id.localeCompare(best.event.id) < 0)) {
      best = { event, prompt: interaction.prompt, approachDirection, distance };
    }
  }
  return best;
}

/** Returns first-time node discoveries for a ready batch without mutating the save state. */
export function selectNewRegionEventKnowledgeIds(
  events: readonly { discoverKnowledgeNodeId?: string }[],
  knownKnowledgeNodeIds: ReadonlySet<string>,
): string[] {
  const seen = new Set(knownKnowledgeNodeIds);
  const discoveries: string[] = [];
  for (const event of events) {
    const nodeId = event.discoverKnowledgeNodeId;
    if (nodeId === undefined || seen.has(nodeId)) continue;
    seen.add(nodeId);
    discoveries.push(nodeId);
  }
  return discoveries;
}

/**
 * Picks at most one eligible roaming event for a successful step (no arrival
 * gate passed) or for a completed map switch (`arrivalTransitionId` names the
 * gate actually travelled). Step sampling only sees step rows — legacy rows
 * without an explicit trigger included — while arrival sampling only sees
 * `regionArrival` rows whose declared gates (or any gate, when none are
 * declared) include the travelled one. The first random sample selects
 * uniformly from stable id order; the second tests its authored chance. No
 * candidate means the random source is never consulted.
 */
export function selectTriggeredRandomRegionEvent(
  events: readonly RandomRegionEventData[],
  mapResourceId: string,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
  random: () => number = Math.random,
  /** The gate id of a completed map switch; omitted for a step cause. */
  arrivalTransitionId?: string,
): RandomRegionEventData | null {
  const candidates = events.filter((event) =>
    event.mapResourceId === mapResourceId && event.chance > 0 &&
    (arrivalTransitionId === undefined
      ? (event.trigger ?? 'step') === 'step'
      : event.trigger === 'regionArrival' &&
        (event.transitionIds === undefined || event.transitionIds.includes(arrivalTransitionId))) &&
    (!event.once || !completedEventIds.has(event.id)) &&
    regionEventConditionsMet(event, context),
  ).sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) return null;
  const selectionSample = normalizeRandomSample(random());
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(selectionSample * candidates.length))]!;
  return normalizeRandomSample(random()) < selected.chance ? selected : null;
}

function normalizeRandomSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1 - Number.EPSILON));
}

export function selectAdjacentTransition(
  transitions: readonly RegionTransitionData[], mapResourceId: string, position: CellPosition,
): RegionTransitionData | null {
  return transitions.filter((transition) =>
    transition.from.mapResourceId === mapResourceId &&
    Math.abs(transition.from.col - position.col) + Math.abs(transition.from.row - position.row) === 1,
  ).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
