import type { CellPosition } from './grid-map';
import { findGridPath, type GridPathSurface } from './grid-path';
import { selectInteractableRegionEvent, type RegionEventData, type RegionEventContext } from './world-map';

export interface NavigationEventContext extends RegionEventContext {
  conditionLabel?: (kind: 'period' | 'weather' | 'tide', id: string) => string | undefined;
  possibleWeatherIds?: ReadonlySet<string>;
  completedEventIds?: ReadonlySet<string>;
}

/** Route to a cell accepted by the actual E-interaction protocol, not its marker. */
export function findRegionEventInteractionPath(surface: GridPathSurface, start: CellPosition, event: RegionEventData): CellPosition[] | null {
  if (!event.interaction) return null;
  const geometryOnly = { ...event, conditions: undefined };
  const context: RegionEventContext = { knownKnowledgeNodeIds: new Set(), periodId: null, weatherId: null };
  let best: CellPosition[] | null = null;
  for (let distance = 1; distance <= (event.interaction.range ?? 1); distance++) {
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const cell = { col: event.col + dc * distance, row: event.row + dr * distance };
      if (!surface.canEnter(cell.col, cell.row)) continue;
      if (!selectInteractableRegionEvent([geometryOnly], { ...cell, mapResourceId: event.mapResourceId }, new Set(), context,
        (col, row) => surface.canEnter(col, row))) continue;
      const path = findGridPath(surface, start, cell, { approachRadius: 0 });
      if (path && (best === null || path.length < best.length)) best = path;
    }
  }
  return best;
}

/** Explain the same condition groups enforced by interaction; never waive them. */
export function regionEventNavigationHint(event: RegionEventData, context?: NavigationEventContext): string {
  if (!context) return `按 E ${event.interaction?.prompt ?? '调查'}，须满足现场条件`;
  const c = event.conditions;
  const missing: string[] = [];
  const labels = (kind: 'period' | 'weather' | 'tide', ids: string[], fallback: string) => {
    const names = ids.map(id => context.conditionLabel?.(kind, id));
    return names.every(name => name !== undefined) ? names.join('/') : fallback;
  };
  if (c?.knowledgeNodeIds?.some(id => !context.knownKnowledgeNodeIds.has(id))) missing.push('前置见闻');
  if (c?.periodIds && (context.periodId === null || !c.periodIds.includes(context.periodId))) missing.push(labels('period', c.periodIds, '指定时段'));
  if (c?.weatherIds && (context.weatherId === null || !c.weatherIds.includes(context.weatherId))) missing.push(labels('weather', c.weatherIds, '指定天气'));
  if (c?.tideIds && (!context.tideId || !c.tideIds.includes(context.tideId))) missing.push(labels('tide', c.tideIds, '指定潮汐'));
  if (c?.nearbyNpcIds?.some(id => !context.nearbyNpcIds?.has(id))) missing.push('相关人物在场');
  const impossibleWeather = c?.weatherIds && context.possibleWeatherIds !== undefined
    && !c.weatherIds.some(id => context.possibleWeatherIds!.has(id));
  return missing.length ? `尚缺：${missing.join('、')}；${impossibleWeather
    ? '所需天气本季不会出现，先查 Q/R 其他行程'
    : 'V 等候后复查，前置见闻与人物可查 Q/R'}` : `按 E ${event.interaction?.prompt ?? '调查'}`;
}
