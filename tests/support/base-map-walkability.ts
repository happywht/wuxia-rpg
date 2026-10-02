import { readFileSync } from 'node:fs';
import { parseGridMap, type GridMap } from '../../src/engine/grid-map';
const manifest = JSON.parse(readFileSync('data/base/manifest.json', 'utf8')) as { resources: { id: string; path: string; schema: string }[] };
const maps = new Map<string, GridMap>();
for (const resource of manifest.resources) {
  if (resource.schema !== 'grid-map') continue;
  const parsed = parseGridMap(JSON.parse(readFileSync(`data/base/${resource.path}`, 'utf8')));
  if (!parsed.ok) throw Error(parsed.errors.join('\n'));
  maps.set(resource.id, parsed.map);
}
/** Actual shipped map geometry, shared by older complete-dialogue assembly fixtures. */
export function baseMapCanEnter(mapResourceId: string, col: number, row: number): boolean {
  return maps.get(mapResourceId)?.canEnter(col, row) ?? false;
}
