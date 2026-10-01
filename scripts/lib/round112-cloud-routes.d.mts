import type {GridMapData} from '../../src/engine/grid-map';
import type {ShopRecordData} from '../../src/engine/item-system';
export const CLOUD_ROUTE_LINES: ReadonlyArray<ReadonlyArray<readonly [number,number]>>;
export function cloudRouteCells(): Array<[number,number]>;
export function applyCloudRouteRefinement<T extends GridMapData>(map:T):T;
export const CLOUD_SHOP: ShopRecordData;
export const CLOUD_SUPPLY_TEXT:string;
