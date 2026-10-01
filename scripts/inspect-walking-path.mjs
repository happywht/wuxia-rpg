import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Author-data inspection only. No browser, save, runtime state or mutation.
const [file, sx, sy, tx, ty] = process.argv.slice(2);
if (!file || [sx, sy, tx, ty].some(value => value === undefined || !/^\d+$/.test(value))) {
  throw new Error('Usage: node scripts/inspect-walking-path.mjs MAP_JSON START_COL START_ROW TARGET_COL TARGET_ROW');
}
const map = JSON.parse(await readFile(resolve(file), 'utf8'));
const start = [Number(sx), Number(sy)], target = [Number(tx), Number(ty)];
const passable = ([x,y]) => x >= 0 && y >= 0 && x < map.columns && y < map.rows && map.tileTypes[map.grid[y]?.[x]]?.solid === false;
if (!passable(start) || !passable(target)) throw new Error('Start or target is outside the authored walkable surface');
const key = cell => cell.join(',');
const queue = [start], previous = new Map([[key(start), null]]);
const steps = [[0,-1,'Up'],[1,0,'Right'],[0,1,'Down'],[-1,0,'Left']];
for (let index=0;index<queue.length && !previous.has(key(target));index++) {
  const cell=queue[index];
  for (const [dx,dy,direction] of steps) {
    const next=[cell[0]+dx,cell[1]+dy];
    if (passable(next) && !previous.has(key(next))) { previous.set(key(next),{cell,direction});queue.push(next); }
  }
}
if (!previous.has(key(target))) throw new Error('No authored terrain path');
const directions=[];let cursor=target;
while (previous.get(key(cursor))) { const step=previous.get(key(cursor));directions.push(step.direction);cursor=step.cell; }
directions.reverse();
const segments=[];
for (const direction of directions) { const last=segments.at(-1);if(last?.direction===direction)last.count++;else segments.push({direction,count:1}); }
console.log(JSON.stringify({scope:'Authored terrain only; NPCs, encounters and live movement require normal UI verification. Not journey evidence.',mapId:map.id,start,target,length:directions.length,segments},null,2));
