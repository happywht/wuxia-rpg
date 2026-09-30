import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { assembleWorldMap, parseWorldMap } from '../src/engine/world-map';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown;
}

function loadWorld() {
  const raw = readJson('../data/base/world/world-map.json');
  const parsed = parseWorldMap(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const manifest = readJson('../data/base/manifest.json') as {
    resources: { id: string; path: string; schema: string }[];
  };
  const maps = new Map([...manifest.resources]
    .filter((resource) => resource.schema === 'grid-map')
    .map((resource) => {
      const result = parseGridMap(readJson('../data/base/' + resource.path));
      if (!result.ok) throw new Error(result.errors.join('\n'));
      return [resource.id, result.map] as const;
    }));
  const assembled = assembleWorldMap(parsed.data, maps);
  if ('ok' in assembled) throw new Error(assembled.errors.join('\n'));
  return { data: parsed.data, assembled, maps };
}

function projectCell(
  region: { atlasPosition: { x: number; y: number } },
  map: { columns: number; rows: number },
  point: { col: number; row: number },
  columns: number,
  rows: number,
  footprint: { columns: number; rows: number },
) {
  return {
    col: Math.round(region.atlasPosition.x / 100 * (columns - 1) + ((point.col + 0.5) / map.columns - 0.5) * footprint.columns),
    row: Math.round(region.atlasPosition.y / 100 * (rows - 1) + ((point.row + 0.5) / map.rows - 0.5) * footprint.rows),
  };
}

describe('Round 70 continental world atlas', () => {
  it('keeps every region anchor and projected gate endpoint on dry atlas cells', () => {
    const { data, maps } = loadWorld();
    const art = data.atlasArt;
    expect(art).toBeDefined();
    if (art === undefined) return;
    const land = art.layers.find(({ id }) => id === 'world-land')!.cells;
    const regionById = new Map(data.regions.map((region) => [region.mapResourceId, region]));
    const footprint = art.regionFootprint ?? { columns: art.columns * 0.16, rows: art.rows * 0.16 };
    for (const region of data.regions) {
      const col = Math.round(region.atlasPosition.x / 100 * (art.columns - 1));
      const row = Math.round(region.atlasPosition.y / 100 * (art.rows - 1));
      if (region.mapResourceId === 'map.round-82-east-coast') {
        const coastLand = art.layers.find(({ id }) => id === 'world-r81-expanse-land')!.cells;
        expect(coastLand[row]?.[col]).toBeGreaterThan(0);
      } else if (region.mapResourceId === 'map.round-84-windward-isle') {
        const isleLand = art.layers.find(({ id }) => id === 'world-r84-expanse-land')!.cells;
        expect(isleLand[row]?.[col]).toBeGreaterThan(0);
      } else if (region.mapResourceId === 'map.round-85-tide-isle') {
        const tideIsleLand = art.layers.find(({ id }) => id === 'world-r85-expanse-land')!.cells;
        expect(tideIsleLand[row]?.[col]).toBeGreaterThan(0);
      } else if (region.mapResourceId === 'map.round-87-southwest-isles') {
        const southwestLand = art.layers.find(({ id }) => id === 'world-r87-expanse-land')!.cells;
        expect(southwestLand[row]?.[col]).toBeGreaterThan(0);
      } else if (region.mapResourceId === 'map.round-91-cloud-north-terrace') {
        const terraceLand = art.layers.find(({ id }) => id === 'world-r91-terrace-land')!.cells;
        expect(terraceLand[row]?.[col]).toBeGreaterThan(0);
      } else if (region.mapResourceId === 'map.round-79-isles') {
        const shoalLand = art.layers.find(({ id }) => id === 'world-r79-shoal-land')!.cells;
        expect(shoalLand[row]?.[col]).toBeGreaterThan(0);
      } else {
        expect(land[row]?.[col]).toBeGreaterThan(1);
      }
    }
    for (const transition of data.transitions) {
      for (const endpoint of [transition.from, transition.to]) {
        const region = regionById.get(endpoint.mapResourceId)!;
        const map = maps.get(endpoint.mapResourceId)!;
        const cell = projectCell(region, map, endpoint, art.columns, art.rows, footprint);
        if (endpoint.mapResourceId === 'map.round-82-east-coast') {
          expect(art.layers.find(({ id }) => id === 'world-r81-expanse-land')?.cells[cell.row]?.[cell.col]).toBeGreaterThan(0);
        } else if (endpoint.mapResourceId === 'map.round-84-windward-isle') {
          expect(art.layers.find(({ id }) => id === 'world-r84-expanse-land')?.cells[cell.row]?.[cell.col]).toBeGreaterThan(0);
        } else if (endpoint.mapResourceId === 'map.round-85-tide-isle') {
          expect(art.layers.find(({ id }) => id === 'world-r85-expanse-land')?.cells[cell.row]?.[cell.col]).toBeGreaterThan(0);
        } else if (endpoint.mapResourceId === 'map.round-87-southwest-isles') {
          expect(art.layers.find(({ id }) => id === 'world-r87-expanse-land')?.cells[cell.row]?.[cell.col]).toBeGreaterThan(0);
        } else if (endpoint.mapResourceId === 'map.round-91-cloud-north-terrace') {
          // Round 91 gates may land on the plateau floor or the rim trail.
          const painted = ['world-r91-terrace-land', 'world-r91-terrace-route', 'world-r91-terrace-cliffs']
            .some((layerId) => (art.layers.find(({ id }) => id === layerId)?.cells[cell.row]?.[cell.col] ?? 0) > 0);
          expect(painted, `${transition.id} endpoint on bare atlas`).toBe(true);
        } else if (endpoint.mapResourceId === 'map.round-79-isles') {
          // Round 87 fog-pilot gates leave from the western reef shallows
          // instead of the old official ferry route.
          const layerId = transition.id.startsWith('gate.r87-')
            ? 'world-r79-shoal-water'
            : 'world-r79-gate-routes';
          expect(art.layers.find(({ id }) => id === layerId)?.cells[cell.row]?.[cell.col]).toBeGreaterThan(0);
        } else {
          expect(land[cell.row]?.[cell.col]).toBeGreaterThan(1);
        }
      }
    }
  });

  it('uses CC0 Tiny Town icons only as data-driven decoration and keeps discoveries out of the baked atlas', () => {
    const { data } = loadWorld();
    const art = data.atlasArt!;
    const tinyTownLayers = art.layers.filter(({ tilesetId }) => tilesetId === 'kenney.tiny-town');
    expect(tinyTownLayers.map(({ id }) => id)).toEqual(['world-relief', 'world-settlements']);
    expect(tinyTownLayers.every(({ cells }) => cells.flat().every((gid) => gid <= 132))).toBe(true);
    expect(tinyTownLayers.flatMap(({ cells }) => cells.flat()).filter((gid) => gid > 0).length).toBeGreaterThan(100);
    expect(JSON.stringify(art)).not.toContain('landmark.reedbank-landing');
    expect(JSON.stringify(art)).not.toContain('芦岸登船点');
    expect(existsSync(new URL('../data/assets/kenney/tiny-town/tilemap_packed.png', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../data/assets/kenney/tiny-town/License.txt', import.meta.url))).toBe(true);
  });

  it('ships a valid 128×16 generated palette atlas and documents its source asset', () => {
    const png = readFileSync(new URL('../data/assets/generated/world-palette.png', import.meta.url));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(16);
    const references = readFileSync(new URL('../docs/REFERENCES.md', import.meta.url), 'utf8');
    expect(references).toContain('https://kenney.nl/assets/tiny-town');
    expect(references).toContain('world-palette.png');
    expect(references).toMatch(/Tiny Town[\s\S]*?CC0/u);
  });
});
