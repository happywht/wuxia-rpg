import {readFile,writeFile} from 'node:fs/promises';
import {regionGuides} from './lib/round106-region-content.mjs';
const url=new URL('../data/base/world/world-map.json',import.meta.url);
const raw=await readFile(url,'utf8'),world=JSON.parse(raw);
if(regionGuides.length!==world.regions.length||regionGuides.some(g=>!world.regions.some(r=>r.mapResourceId===g.mapResourceId)))throw Error('地区指南与实际世界不闭合');
world.regionGuides=regionGuides;
const newline=raw.includes('\r\n')?'\r\n':'\n';await writeFile(url,(JSON.stringify(world,null,2)+'\n').replace(/\n/g,newline));
console.log('Round106: 22 region roles and travel advice; maps and original world rules untouched.');
