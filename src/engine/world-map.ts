import type { CellPosition, GridMap } from './grid-map';

/** Data-only world atlas protocol. Coordinates in the atlas are presentation hints. */
export interface WorldMapData {
  id: string;
  startingMapResourceId: string;
  regions: WorldRegionData[];
  transitions: RegionTransitionData[];
  events: RegionEventData[];
}

export interface WorldRegionData {
  mapResourceId: string;
  name: string;
  description: string;
  atlasPosition: { x: number; y: number };
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
  once: boolean;
}

export interface WorldMapAssembly {
  data: WorldMapData;
  regions: WorldRegionData[];
  transitions: RegionTransitionData[];
  events: RegionEventData[];
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

function parseCell(value: unknown, label: string, errors: string[]): CellPosition | null {
  if (!isObject(value) || !integer(value.col) || !integer(value.row) || value.col < 0 || value.row < 0) {
    errors.push(`${label}：应含非负整数 col 与 row`);
    return null;
  }
  return { col: value.col, row: value.row };
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
    const atlasPosition = isObject(pos) && integer(pos.x) && integer(pos.y) && pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100
      ? { x: pos.x, y: pos.y } : null;
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (name === null) errors.push(`${label}.name：应为非空字符串`);
    if (description === null) errors.push(`${label}.description：应为字符串`);
    if (atlasPosition === null) errors.push(`${label}.atlasPosition：x/y 应为 0–100 整数`);
    if (mapResourceId !== null && name !== null && description !== null && atlasPosition !== null)
      regions.push({ mapResourceId, name, description, atlasPosition });
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
    const cell = parseCell(entry, label, errors);
    const once = typeof entry.once === 'boolean' ? entry.once : null;
    if (id === null) errors.push(`${label}.id：应为非空字符串`);
    if (mapResourceId === null) errors.push(`${label}.mapResourceId：应为非空字符串`);
    if (text === null) errors.push(`${label}.text：应为非空字符串`);
    if (once === null) errors.push(`${label}.once：应为布尔值`);
    if (id !== null && mapResourceId !== null && text !== null && once !== null && cell !== null)
      events.push({ id, mapResourceId, ...cell, text, once });
  });
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: { id: raw.id as string, startingMapResourceId: raw.startingMapResourceId as string, regions, transitions, events } };
}

/** Resolves map references and isolates bad region links/events to their row. */
export function assembleWorldMap(data: WorldMapData, maps: ReadonlyMap<string, GridMap>): WorldMapAssembly | { ok: false; errors: string[] } {
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
  const events: RegionEventData[] = [];
  const seenEvents = new Set<string>();
  for (const event of data.events) {
    const map = maps.get(event.mapResourceId);
    const problems: string[] = [];
    if (seenEvents.has(event.id)) problems.push('id 重复');
    if (!regions.some((region) => region.mapResourceId === event.mapResourceId)) problems.push('地图不在世界图区域中');
    if (map === undefined || !map.canEnter(event.col, event.row)) problems.push('触发坐标不可通行');
    seenEvents.add(event.id);
    if (problems.length > 0) warnings.push(`区域事件 "${event.id}" 已禁用：${problems.join('；')}`);
    else events.push(event);
  }
  return { data, regions, transitions, events, warnings };
}

export function selectAdjacentTransition(
  transitions: readonly RegionTransitionData[], mapResourceId: string, position: CellPosition,
): RegionTransitionData | null {
  return transitions.filter((transition) =>
    transition.from.mapResourceId === mapResourceId &&
    Math.abs(transition.from.col - position.col) + Math.abs(transition.from.row - position.row) === 1,
  ).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
