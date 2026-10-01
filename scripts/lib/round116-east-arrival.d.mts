import type { WorldMapData } from '../../src/engine/world-map';
export function repairEastArrival<T extends Pick<WorldMapData, 'events' | 'transitions'>>(world: T): T;
