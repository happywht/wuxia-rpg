// Immutable pre-change map: static geometry only, never a player-time estimate.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const map=JSON.parse(execFileSync('git',['show','e70bd9c:data/base/maps/round-74-cloud-ridge.json'],{encoding:'utf8',maxBuffer:4*1024*1024}));
function distance(from,to,occupied=[]) {
  const blocked=new Set(occupied.map(p=>`${p[0]},${p[1]}`));
  const queue=[[...from,0]], seen=new Set([`${from[0]},${from[1]}`]);
  for(let i=0;i<queue.length;i++) {
    const [x,y,d]=queue[i]; if(x===to[0]&&y===to[1]) return d;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,key=`${nx},${ny}`,tile=map.grid[ny]?.[nx];
      if(tile===undefined||map.tileTypes[tile].solid||seen.has(key)||blocked.has(key))continue;
      seen.add(key);queue.push([nx,ny,d+1]);
    }
  } return null;
}
const routes=[
  {name:'night-neighbour-to-marks',from:[40,43],to:[27,31],occupied:[[39,43]]},
  {name:'night-neighbour-to-bridge-neighbour',from:[40,43],to:[75,42],occupied:[[39,43],[76,42]]},
  {name:'south-arrival-to-night-neighbour',from:[50,97],to:[40,43],occupied:[[39,43]]},
  {name:'night-neighbour-to-north-exit-neighbour',from:[40,43],to:[62,3],occupied:[[39,43]]},
];
const report={baseline:'e70bd9c',boundary:'BFS static walkability with listed occupants, not actual journey or human duration',routes:routes.map(r=>({...r,distance:distance(r.from,r.to,r.occupied)})),occlusionProbe:{position:[52,41],solid:map.tileTypes[map.grid[41][52]].solid,layers:map.art.layers.filter(l=>l.cells[41][52]).map(l=>({id:l.id,gid:l.cells[41][52],depthSort:l.depthSort??'ground'}))}};
writeFileSync('iterations/round-112/baseline-routes.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
