import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { addCoastalService, addCoastalServiceDirections, COASTAL_SERVICES } from './lib/round126-coastal-service.mjs';
const root = new URL('../data/base/', import.meta.url);
const worldPath = new URL('world/world-map.json', root);
const maps = readdirSync(new URL('maps/', root)).filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(readFileSync(new URL(`maps/${file}`, root), 'utf8')));
for (const service of COASTAL_SERVICES) for (const endpoint of [service.from, service.to]) {
  const map = maps.find(candidate => candidate.id === endpoint.mapResourceId);
  if (!map || map.tileTypes[map.grid[endpoint.row]?.[endpoint.col]]?.solid !== false) throw Error(`Service endpoint blocked: ${JSON.stringify(endpoint)}`);
}
const original = JSON.parse(readFileSync(worldPath, 'utf8'));
writeFileSync(worldPath, JSON.stringify(addCoastalService(original), null, 2) + '\n');
let conversations = 0;
for (const file of readdirSync(new URL('dialogues/', root)).filter(file => file.endsWith('.json'))) {
  const path = new URL(`dialogues/${file}`, root), input = JSON.parse(readFileSync(path, 'utf8'));
  const output = addCoastalServiceDirections(input);
  if (JSON.stringify(input) !== JSON.stringify(output)) { writeFileSync(path, JSON.stringify(output, null, 2) + '\n'); conversations++; }
}
console.log(`Round126: ${COASTAL_SERVICES.length} bidirectional services, 30 silver/90 minutes; ${conversations} dialogue files updated.`);
