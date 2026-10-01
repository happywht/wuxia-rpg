import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const args=['scripts/inspect-walking-path.mjs','data/base/maps/round-93-snow-pine-valley.json','50','62','94','50'];
const result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
assert.equal(result.length,56);assert.equal(result.segments.reduce((n,segment)=>n+segment.count,0),56);
let cell=[...result.start];const offsets={Up:[0,-1],Right:[1,0],Down:[0,1],Left:[-1,0]};
for(const segment of result.segments){const offset=offsets[segment.direction];assert.ok(offset);cell=[cell[0]+offset[0]*segment.count,cell[1]+offset[1]*segment.count];}
assert.deepEqual(cell,result.target);
for(const wrong of [args.slice(0,2),[...args.slice(0,2),'-1','62','94','50'],[...args.slice(0,2),'100000','62','94','50']]){
 let refused=false;try{execFileSync(process.execPath,wrong,{stdio:'pipe'});}catch(error){refused=error.status!==0;}assert.equal(refused,true);
}
console.log('Passed: authored route length/endpoints and missing/negative/out-of-bounds argument refusal. No runtime or save access.');
