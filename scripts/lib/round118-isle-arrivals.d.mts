import type { WorldMapData } from '../../src/engine/world-map';
export function repairIsleArrivals<T extends Pick<WorldMapData, 'events' | 'transitions'>>(world: T): T;
