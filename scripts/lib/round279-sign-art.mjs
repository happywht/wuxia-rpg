/** Project-authored CC0 sign layer; never changes collision or existing art. */
export const SIGN_TILESET = { id: 'kenney.tiny-town', image: 'assets/kenney/tiny-town/tilemap_packed.png', tileSize: 16, columns: 12, rows: 11, spacing: 0, tileCount: 132 };
export const SIGN_LAYER_ID = 'round279-cloud-fork-sign';
export function applyCloudForkSignArt(map, world) {
  const landmarks = world.landmarks.filter(x => x.id === 'landmark.r279-cloud-fork-sign');
  if (landmarks.length === 0) return map;
  if (landmarks.length !== 1) throw Error('岔牌地标重复');
  const sign = landmarks[0];
  if (sign.mapResourceId !== map.id || sign.col !== 50 || sign.row !== 59) throw Error('岔牌坐标漂移');
  if (map.tileTypes[map.grid[sign.row]?.[sign.col]]?.solid !== false) throw Error('岔牌不能放在不可通行格');
  const result = structuredClone(map);
  const art = result.art;
  if (!art) throw Error('岔牌需要地图像素图层');
  const declared = art.tilesets.filter(x => x.id === SIGN_TILESET.id);
  if (declared.length > 1 || declared.some(x => JSON.stringify(x) !== JSON.stringify(SIGN_TILESET))) throw Error('岔牌图集漂移');
  if (!declared.length) art.tilesets.push(structuredClone(SIGN_TILESET));
  const cells = Array.from({length:map.rows},()=>Array(map.columns).fill(0));
  cells[sign.row][sign.col] = 85; // Tiny Town CC0 frame 84, one-based map GID.
  const wanted = { id: SIGN_LAYER_ID, tilesetId: SIGN_TILESET.id, cells, depthSort: 'y' };
  const existing = art.layers.filter(x=>x.id===SIGN_LAYER_ID);
  if (existing.length > 1 || existing.some(x=>JSON.stringify(x)!==JSON.stringify(wanted))) throw Error('岔牌图层漂移');
  if (!existing.length) {
    const rail = art.layers.findIndex(x=>x.id==='round76-cloud-bridge-rails');
    art.layers.splice(rail < 0 ? art.layers.length : rail,0,wanted);
  }
  return result;
}
export function repairCloudSignArtRaw(raw, world) {
  const next = applyCloudForkSignArt(JSON.parse(raw), world);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return (JSON.stringify(next,null,2)+'\n').replace(/\n/g,eol);
}
