import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const before=JSON.parse(execFileSync('git',['show','9c7125f8b9f288a4bf92d03f6866f3b411feb248:data/base/maps/round-01-grid.json'],{encoding:'utf8',maxBuffer:8*1024*1024}));
const after=JSON.parse(fs.readFileSync('data/base/maps/round-01-grid.json','utf8'));
const records=[];
for(const dir of ['characters','battles'])for(const file of fs.readdirSync('data/base/'+dir).filter(f=>f.endsWith('.json'))){const d=JSON.parse(fs.readFileSync(`data/base/${dir}/${file}`,'utf8'));records.push(...[...d.npcs??[],...d.encounters??[]].filter(e=>e.mapResourceId===after.id));}
function route(map,period,start,target){
 const blocked=new Set(records.map(e=>{const p=e.schedule?.find(s=>s.periodId===period)?.position??e.position;return `${p.col},${p.row}`;}));
 const q=[start],prev=new Map([[start.join(','),null]]);
 for(let i=0;i<q.length&&!prev.has(target.join(','));i++){const[x,y]=q[i];for(const[dx,dy,key]of[[0,-1,'Up'],[1,0,'Right'],[0,1,'Down'],[-1,0,'Left']]){const nx=x+dx,ny=y+dy,id=`${nx},${ny}`;if(nx<0||ny<0||nx>=map.columns||ny>=map.rows||map.tileTypes[map.grid[ny][nx]].solid||blocked.has(id)||prev.has(id))continue;prev.set(id,{from:`${x},${y}`,key});q.push([nx,ny]);}}
 if(!prev.has(target.join(',')))return{unreachable:true};const keys=[];let c=target.join(',');while(prev.get(c)!==null){const p=prev.get(c);keys.push(p.key);c=p.from;}keys.reverse();const runs=[];for(const key of keys){if(runs.at(-1)?.key===key)runs.at(-1).count++;else runs.push({key,count:1});}return{steps:keys.length,runs};
}
const output=['midnight','dawn','morning','midday','afternoon','dusk','night'].map(period=>({period:'period.'+period,before:route(before,'period.'+period,[40,37],[47,43]),after:route(after,'period.'+period,[40,37],[47,43]),reverse:route(after,'period.'+period,[47,43],[40,37])}));
console.log(JSON.stringify({note:'Static per-period authored slots, not runtime inspection. Actual placements and route still require formal scheduler and keyboard checks.',output},null,2));
