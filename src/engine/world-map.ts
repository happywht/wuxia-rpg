import type { CellPosition, GridMap } from './grid-map';

/** Data-only world atlas protocol. Coordinates in the atlas are presentation hints. */
export interface WorldMapData {
  id: string;
  startingMapResourceId: string;
  regions: WorldRegionData[];
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
  conditions?: RegionEventConditionsData;
  discoverKnowledgeNodeId?: string;
}

/** A roaming event attempted after a successful player grid step. */
export interface RandomRegionEventData {
  id: string;
  mapResourceId: string;
  text: string;
  once: boolean;
  chance: number;
  conditions?: RegionEventConditionsData;
  discoverKnowledgeNodeId?: string;
}

/** All declared condition groups must pass; ids inside each group are alternatives. */
export interface RegionEventConditionsData {
  knowledgeNodeIds?: string[];
  periodIds?: string[];
  weatherIds?: string[];
  /** Every listed NPC must be orthogonally adjacent to the player. */
  nearbyNpcIds?: string[];
}

/** Live player/world state read by the pure region-event evaluator. */
export interface RegionEventContext {
  knownKnowledgeNodeIds: ReadonlySet<string>;
  periodId: string | null;
  weatherId: string | null;
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
  const allowedKeys = new Set(['knowledgeNodeIds', 'periodIds', 'weatherIds', 'nearbyNpcIds']);
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
    else conditions.nearbyNpcIds = ids;
  }
  if (Object.keys(conditions).length === 0) {
    errors.push(`${label}：至少需要一种线索、时段或天气条件`);
  }
  return conditions;
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
    const cell = parseCell(entry, label, errors);
    const once = typeof entry.once === 'boolean' ? entry.once : null;
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
    if (discoverKnowledgeNodeId === null) errors.push(`${label}.discoverKnowledgeNodeId：应为非空字符串`);
    if (id !== null && mapResourceId !== null && text !== null && once !== null && cell !== null &&
      conditions !== null && discoverKnowledgeNodeId !== null) {
      events.push({
        id, mapResourceId, ...cell, text, once,
        ...(conditions === undefined ? {} : { conditions }),
        ...(discoverKnowledgeNodeId === undefined ? {} : { discoverKnowledgeNodeId }),
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
    if (discoverKnowledgeNodeId === null) errors.push(`${label}.discoverKnowledgeNodeId：应为非空字符串`);
    if (id !== null && mapResourceId !== null && text !== null && once !== null && chance !== null &&
      conditions !== null && discoverKnowledgeNodeId !== null) {
      randomEvents.push({
        id, mapResourceId, text, once, chance,
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
      landmarks,
      transitions,
      events,
      randomEvents,
    } };
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
    if (map === undefined || !map.canEnter(event.col, event.row)) problems.push('触发坐标不可通行');
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
  const nearbyNpcIds = context.nearbyNpcIds ?? new Set<string>();
  if (conditions.nearbyNpcIds?.some((id) => !nearbyNpcIds.has(id))) return false;
  return true;
}

/** Selects ready events at an exact cell without mutating completion or knowledge state. */
export function selectTriggeredRegionEvents(
  events: readonly RegionEventData[],
  location: { mapResourceId: string } & CellPosition,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
): RegionEventData[] {
  return events.filter((event) =>
    event.mapResourceId === location.mapResourceId &&
    event.col === location.col && event.row === location.row &&
    (!event.once || !completedEventIds.has(event.id)) &&
    regionEventConditionsMet(event, context),
  );
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
 * Picks at most one eligible roaming event for a successful step. The first
 * random sample selects uniformly from stable id order; the second tests its
 * authored chance. No candidate means the random source is never consulted.
 */
export function selectTriggeredRandomRegionEvent(
  events: readonly RandomRegionEventData[],
  mapResourceId: string,
  completedEventIds: ReadonlySet<string>,
  context: RegionEventContext,
  random: () => number = Math.random,
): RandomRegionEventData | null {
  const candidates = events.filter((event) =>
    event.mapResourceId === mapResourceId && event.chance > 0 &&
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
