import type { GridMapData } from '../../src/engine/grid-map';
import type { WorldMapData } from '../../src/engine/world-map';
export const SIGN_TILESET: {id:string;image:string;tileSize:number;columns:number;rows:number;spacing:number;tileCount:number};
export const SIGN_LAYER_ID: string;
export function applyCloudForkSignArt(map: GridMapData, world: WorldMapData): GridMapData;
export function repairCloudSignArtRaw(raw:string, world:WorldMapData):string;
