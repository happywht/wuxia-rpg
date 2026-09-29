import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseGridMap } from '../src/engine/grid-map';
import { gridMapGroundTextureKey, renderGridMap } from '../src/engine/grid-map-renderer';

function loadStartingMap() {
  const value = JSON.parse(readFileSync(new URL('../data/base/maps/round-01-grid.json', import.meta.url), 'utf8')) as unknown;
  const parsed = parseGridMap(value);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.map;
}

describe('Round 52 world-map camera space', () => {
  it('keeps the baked pixel-map image in world space even when the scene pins new objects to the HUD', () => {
    const map = loadStartingMap();
    const containerChildren: { scrollFactor: number; setOrigin: () => unknown; setDisplaySize: () => unknown; setScrollFactor: (value: number) => unknown }[][] = [];
    const createdFactors: { container: number; image: number } = { container: 0, image: 0 };
    const container = {
      setScrollFactor(value: number) { createdFactors.container = value; return this; },
      add(child: typeof containerChildren[number][number]) { containerChildren[0]?.push(child); return this; },
    };
    const scene = {
      textures: { exists: (key: string) => key === gridMapGroundTextureKey(map) },
      add: {
        container: () => { containerChildren.push([]); return container; },
        image: () => {
          const image = {
            scrollFactor: 0, // matches GridScene's ADDED_TO_SCENE HUD default
            setOrigin() { return this; },
            setDisplaySize() { return this; },
            setScrollFactor(value: number) { this.scrollFactor = value; createdFactors.image = value; return this; },
          };
          return image;
        },
      },
    };

    renderGridMap(scene as never, map, 0, 0);

    expect(createdFactors).toEqual({ container: 1, image: 1 });
  });
});
