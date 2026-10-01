import fs from 'node:fs';
const [mapId,sx,sy,tx,ty]=process.argv.slice(2);
const files=fs.readdirSync('data/base/maps').filter(f=>f.endsWith('.json'));
const map=files.map(f=>JSON.parse(fs.readFileSync('data/base/maps/'+f,'utf8'))).find(m=>m.id===mapId);
if(!map)throw Error('missing map');
const blocked=new Set();
for(const dir of ['characters','battles'])for(const file of fs.readdirSync('data/base/'+dir).filter(f=>f.endsWith('.json'))){const data=JSON.parse(fs.readFileSync(`data/base/${dir}/${file}`,'utf8'));for(const e of [...data.npcs??[],...data.encounters??[]])if(e.mapResourceId===mapId){blocked.add(`${e.position.col},${e.position.row}`);for(const s of e.schedule??[])blocked.add(`${s.position.col},${s.position.row}`);}}
const start=[+sx,+sy],target=[+tx,+ty],queue=[start],previous=new Map([[start.join(','),null]]);
for(let i=0;i<queue.length&&!previous.has(target.join(','));i++) {const [x,y]=queue[i];for(const [dx,dy,key]of [[0,-1,'Up'],[1,0,'Right'],[0,1,'Down'],[-1,0,'Left']]){const nx=x+dx,ny=y+dy,id=`${nx},${ny}`;if(nx<0||ny<0||nx>=map.columns||ny>=map.rows||map.tileTypes[map.grid[ny][nx]].solid||blocked.has(id)||previous.has(id))continue;previous.set(id,{from:`${x},${y}`,key});queue.push([nx,ny]);}}
let current=target.join(','),keys=[];if(!previous.has(current))throw Error('no route');while(previous.get(current)!==null){const p=previous.get(current);keys.push(p.key);current=p.from;}keys.reverse();const runs=[];for(const key of keys){if(runs.at(-1)?.key===key)runs.at(-1).count++;else runs.push({key,count:1});}console.log(JSON.stringify({mapId,start,target,steps:keys.length,runs}));
