import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { gridMapArtTextureKey } from '../src/engine/grid-map-renderer';

function loadMap(path: string) {
  const parsed = parseGridMap(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('Round 51 world art data', () => {
  it('uses a collision-independent 100×100 layered pixel map and the licensed actor atlas', () => {
    const map = loadMap('../data/base/maps/round-01-grid.json');
    const art = map.data.art;
    expect(map.columns).toBe(100);
    expect(map.rows).toBe(100);
    expect(map.playerStart).toEqual({ col: 43, row: 37 });
    expect(art?.tileSize).toBe(16);
    // Five Tiled layers (Round 51) plus the two Round 65 urban street layers.
    expect(art?.layers).toHaveLength(7);
    expect(art?.tilesets.map((tileset) => tileset.id)).toEqual([
      'kenney.roguelike-rpg',
      'kenney.tiny-dungeon',
      'kenney.rpg-urban-pack',
    ]);
    expect(art?.actors.playerFrame).toBe(24);
    expect(art?.layers.every((layer) => layer.cells.length === map.rows && layer.cells.every((row) => row.length === map.columns))).toBe(true);
    expect(map.data.grid.join('').length).toBe(10_000);
    expect([...map.data.grid.join('')].filter((cell) => cell === '.').length).toBeGreaterThan(7_000);
    expect(gridMapArtTextureKey(map)).toMatch(/^wuxia-map-art-[0-9a-f]+$/);
    expect(gridMapArtTextureKey(map)).toBe(gridMapArtTextureKey(map));
  });

  it('ships only the source atlases and their original CC0 notices for map rendering', () => {
    for (const path of [
      '../data/assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png',
      '../data/assets/kenney/roguelike-rpg/License.txt',
      '../data/assets/kenney/tiny-dungeon/tilemap_packed.png',
      '../data/assets/kenney/tiny-dungeon/License.txt',
      '../data/assets/kenney/rpg-urban-pack/tilemap_packed.png',
      '../data/assets/kenney/rpg-urban-pack/License.txt',
      '../data/assets/kenney/tiny-town/tilemap_packed.png',
      '../data/assets/kenney/tiny-town/License.txt',
      '../data/assets/generated/world-palette.png',
    ]) {
      expect(existsSync(new URL(path, import.meta.url))).toBe(true);
    }
  });

  it('keeps the expanded ferry district on the licensed source atlas with its own collision grid', () => {
    const map = loadMap('../data/base/maps/round-10-mist-ferry.json');
    expect(map.columns).toBe(100);
    expect(map.rows).toBe(100);
    expect(map.data.art?.layers).toHaveLength(10);
    expect(map.canEnter(1, 4)).toBe(true);
    expect(map.canEnter(59, 65)).toBe(true);
    expect(map.isSolid(99, 99)).toBe(true);
  });
});
