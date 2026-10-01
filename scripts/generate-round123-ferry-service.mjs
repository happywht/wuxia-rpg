import { readFileSync, writeFileSync } from 'node:fs';
import { addFerryService } from './lib/round123-ferry-service.mjs';
const path = new URL('../data/base/world/world-map.json', import.meta.url);
const world = JSON.parse(readFileSync(path, 'utf8'));
writeFileSync(path, JSON.stringify(addFerryService(world), null, 2) + '\n');
console.log('Round123：双向短渡更新，既有50关口保持；各8银/20分钟。');
