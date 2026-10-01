// Authored local paths: preserve region scale, stable destinations and side terrain.
export const CLOUD_ROUTE_LINES = [
  [[50,97],[50,57],[40,57],[40,43]],
  [[40,43],[40,31],[27,31]],
  [[40,43],[75,43],[75,42]],
  [[40,43],[40,34],[62,34],[62,3],[62,2]],
];

export function cloudRouteCells() {
  const cells=new Map();
  for(const line of CLOUD_ROUTE_LINES)for(let i=1;i<line.length;i++) {
    let [x,y]=line[i-1]; const [tx,ty]=line[i];
    if(x!==tx&&y!==ty)throw Error('Cloud path segment must be cardinal');
    cells.set(`${x},${y}`,[x,y]);
    while(x!==tx||y!==ty) { x+=Math.sign(tx-x);y+=Math.sign(ty-y);cells.set(`${x},${y}`,[x,y]); }
  }
  return [...cells.values()];
}

export function applyCloudRouteRefinement(map) {
  if(map.id!=='map.round-74-cloud-ridge'||map.columns!==100||map.rows!==100)throw Error('Expected existing Cloud Ridge map');
  const floor=map.art.layers.find(l=>l.id==='cloud-ridge-waystation-1');
  const trails=map.art.layers.find(l=>l.id==='cloud-ridge-stone-trails');
  if(!floor||!trails)throw Error('Cloud Ridge floor/path channels missing');
  // Copied waystation layer 1 is opaque paving. It is not a roof or tree:
  // y-sort on this layer covered actors even on valid, empty floor cells.
  delete floor.depthSort;
  const obstructions=map.art.layers.filter(l=>
    l.id==='cloud-ridge-scree'||l.id==='cloud-ridge-pines'||
    /^cloud-ridge-waystation-[2-6]$/.test(l.id));
  const grid=map.grid.map(row=>[...row]);
  for(const [col,row] of cloudRouteCells()) {
    grid[row][col]='.';
    for(const layer of obstructions)layer.cells[row][col]=0;
    trails.cells[row][col]=576+(col+row)%4;
  }
  // Later north/east gates were authored after R74. Normalize their existing
  // walkable approach buffers as R74's anchor protection does on regeneration.
  for(const [col,row] of [[50,97],[49,97],[96,50],[95,50],[62,2],[63,2]])
    for(let y=row-1;y<=row+1;y++)for(let x=col-1;x<=col+1;x++)grid[y][x]='.';
  map.grid=grid.map(row=>row.join(''));
  return map;
}

export const CLOUD_SHOP = {
  id:'shop.r112-cloud-waystation',name:'云栈客舍备药匣',npcId:'char.r74-shen-yuji',
  greeting:'寄存备药按原价出售：膏三份、丸两份，售完不补；缺货东去青帆埠。',
  sellRate:0.5,stock:[{itemId:'item.huichun-gao',quantity:3},{itemId:'item.qingxin-wan',quantity:2}],
};

export const CLOUD_SUPPLY_TEXT='沈雨霁指向寄存的备药匣：「E可按价买回春膏与清心丸，Q查看差事、F仍能问话。数量有限，售完本程不会自动补满。刻痕沿客舍西侧石路向北再折西，断桥走东侧石路；北行循主路到北台栈道，那里接雁回崖与照雪关。」';
