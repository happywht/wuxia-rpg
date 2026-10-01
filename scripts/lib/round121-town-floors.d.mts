export interface TownMapLike {
  art: { layers: { id: string; tilesetId: string; depthSort?: string; cells: number[][] }[] };
}
export function repairTownGroundOverlay<T extends TownMapLike>(world: T): T;
