import {readFileSync,writeFileSync} from 'node:fs';
import {repairIsleArrivals} from './lib/round118-isle-arrivals.mjs';
const path=new URL('../data/base/world/world-map.json',import.meta.url);
const source=JSON.parse(readFileSync(path,'utf8'));
writeFileSync(path,JSON.stringify(repairIsleArrivals(source),null,2)+'\n');
console.log('四岛实际关口入场修复完成；旧记录格与非目标资料保持。');
