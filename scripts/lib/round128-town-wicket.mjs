/**
 * Round 128 authoring repair: the west-town wicket must be walkable ground.
 *
 * The licensed Kenney Tiled pack parks its dirt-road decoration (GID 409) on
 * the Objects layer (16px source tiles across the
 * Jiangnan 100×100 map). The importer marks every nonzero Objects cell solid,
 * so the dirt road at (42,37) became a collision: the west-town link between the
 * mentors' quarters turned solid and every route detoured to the map's north
 * edge (83 steps). The repair moves exactly that one cell — GID 409 from
 * layer-3 (the y-sorted Objects copy) to layer-2 (the non-occluding ground
 * overlay) and opens the grid — leaving every other cell, layer, anchor and
 * id untouched. Strict about the pre-repair shape; idempotent; refuses any
 * mismatched tile/grid/layer state so a changed world gets a human look.
 */
const COL = 42;
const ROW = 37;
const ROAD_GID = 409;

export function repairTownWestWicket(map) {
  if (map.id !== 'map.round-01-grid' || map.columns !== 100 || map.rows !== 100 ||
      map.grid?.length !== 100 || map.grid.some(line => typeof line !== 'string' || line.length !== 100) ||
      map.tileTypes?.['.']?.solid !== false || map.tileTypes?.['#']?.solid !== true) {
    throw new Error('江南地图尺寸、通行协议或ID变化，请人工复核。');
  }
  const select = id => {
    const matches = map.art?.layers?.filter(layer => layer.id === id) ?? [];
    if (matches.length !== 1) throw new Error(`${id} 应恰有一层。`);
    const layer = matches[0];
    if (layer.tilesetId !== 'kenney.roguelike-rpg' || layer.cells?.length !== 100 ||
        layer.cells.some(row => !Array.isArray(row) || row.length !== 100)) throw new Error(`${id} 图集或尺寸已变化。`);
    return layer;
  };
  const base = select('layer-1'), layer2 = select('layer-2'), layer3 = select('layer-3');
  if (base.cells[ROW][COL] !== 63 || layer2.depthSort !== undefined || layer3.depthSort !== 'y') {
    throw new Error('路口底层或前景深度已变化，请人工复核。');
  }
  for (const layer of map.art.layers) {
    if (['layer-1', 'layer-2', 'layer-3'].includes(layer.id)) continue;
    if (layer.cells?.[ROW]?.[COL] !== 0) throw new Error(`路口另有 ${layer.id} 图素，请人工复核。`);
  }
  const gridRow = map.grid[ROW];
  if (gridRow[COL] === '.' && layer2.cells[ROW][COL] === ROAD_GID && layer3.cells[ROW][COL] === 0) return map;
  if (gridRow[COL] !== '#' || layer3.cells[ROW][COL] !== ROAD_GID || layer2.cells[ROW][COL] !== 0) {
    throw new Error('路口不是待修土路格，请人工复核。');
  }
  // Clone only the two affected cell rows (and the one grid line); the huge
  // remaining arrays stay shared, so no atlas-scale copy happens.
  return {
    ...map,
    grid: map.grid.map((line, index) => index === ROW ? `${line.slice(0, COL)}.${line.slice(COL + 1)}` : line),
    art: {
      ...map.art,
      layers: map.art.layers.map(layer => {
        if (layer.id === 'layer-2') {
          return { ...layer, cells: layer.cells.map((row, index) => index === ROW ? withCell(row, COL, ROAD_GID) : row) };
        }
        if (layer.id === 'layer-3') {
          return { ...layer, cells: layer.cells.map((row, index) => index === ROW ? withCell(row, COL, 0) : row) };
        }
        return layer;
      }),
    },
  };
}

function withCell(row, col, value) {
  const next = [...row];
  next[col] = value;
  return next;
}
