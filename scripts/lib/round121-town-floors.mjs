/**
 * Round 121 authoring repair: the Jiangnan ground overlay must not occlude.
 *
 * import-round51-kenney-world.mjs imports five Tiled layers where layer-2 is
 * the ground overlay (pavement/floor tiles: PATH frames 576–580 and kin —
 * proven ground by every other map that uses them in non-y layers). Round 78
 * later marked layers 2–5 `depthSort: "y"`, so those opaque floor tiles
 * became foreground depth rows: standing on a walkable pavement cell drew the
 * pavement slice over the actor (observed at 43,41 and 89,50). The repair
 * removes the y flag from layer-2 only — roofs/trees/buildings on layers 3-5
 * keep their occlusion, and the grid, tileTypes, ids and anchors are
 * untouched. Idempotent; refuses a world whose layer shape changed.
 */
export function repairTownGroundOverlay(world) {
  const overlays = world.art.layers.filter(layer => layer.id === 'layer-2');
  if (overlays.length !== 1) throw new Error('江南 layer-2（地面覆盖层）应恰好有一项。');
  const overlay = overlays[0];
  if (overlay.tilesetId !== 'kenney.roguelike-rpg') throw new Error('江南 layer-2 图集协议已变化，请人工复核。');
  if (overlay.depthSort !== undefined && overlay.depthSort !== 'y') throw new Error('江南 layer-2 depthSort 已是未知值，请人工复核。');
  if (world.art.layers.filter(layer => layer.depthSort === 'y' && layer.id !== 'layer-2').length === 0) {
    throw new Error('江南前景层（3-5）缺少纵深标注，协议已变化，请人工复核。');
  }
  // Only the layer record changes; the huge cells arrays are shared, not cloned.
  const result = {
    ...world,
    art: {
      ...world.art,
      layers: world.art.layers.map(layer => {
        if (layer.id !== 'layer-2') return layer;
        const { depthSort, ...rest } = layer;
        void depthSort;
        return rest;
      }),
    },
  };
  return result;
}
