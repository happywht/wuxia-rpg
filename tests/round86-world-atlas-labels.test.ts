import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { layoutWorldAtlasRegionLabels, projectAtlasPosition } from '../src/engine/world-atlas-view';
import { parseWorldMap } from '../src/engine/world-map';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bounds = { width: 616, height: 340 };

describe('Round 86 atlas overview callouts', () => {
  it('keeps all eighteen region names readable at the fitted 768×576 panorama view', () => {
    const raw = JSON.parse(readFileSync(path.join(repoRoot, 'data/base/world/world-map.json'), 'utf8')) as unknown;
    const parsed = parseWorldMap(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.data.atlasArt === undefined) return;

    const art = parsed.data.atlasArt;
    const scale = Math.min(bounds.width / (art.columns * art.tileSize), bounds.height / (art.rows * art.tileSize));
    const imageWidth = art.columns * art.tileSize * scale;
    const imageHeight = art.rows * art.tileSize * scale;
    const labels = parsed.data.regions.map((region) => {
      const point = projectAtlasPosition(region.atlasPosition, art);
      const glyphCount = [...region.name].length;
      return {
        mapResourceId: region.mapResourceId,
        x: (bounds.width - imageWidth) / 2 + point.x * scale,
        y: (bounds.height - imageHeight) / 2 + point.y * scale,
        // Phaser renders these 11px callouts in the atlas camera without scaling the text.
        width: glyphCount * 11 + 8,
        height: 15,
      };
    });
    const placements = layoutWorldAtlasRegionLabels(labels, bounds, 'map.round-85-tide-isle');

    expect(labels).toHaveLength(18);
    expect(placements.size).toBe(18);
    const boxes = labels.map((label) => {
      const placement = placements.get(label.mapResourceId);
      expect(placement).toBeDefined();
      if (placement === undefined) return null;
      return {
        id: label.mapResourceId,
        left: placement.x - label.width * placement.originX,
        top: placement.y - label.height * placement.originY,
        right: placement.x + label.width * (1 - placement.originX),
        bottom: placement.y + label.height * (1 - placement.originY),
      };
    }).filter((box) => box !== null);

    for (const box of boxes) {
      expect(box!.left).toBeGreaterThanOrEqual(0);
      expect(box!.top).toBeGreaterThanOrEqual(0);
      expect(box!.right).toBeLessThanOrEqual(bounds.width);
      expect(box!.bottom).toBeLessThanOrEqual(bounds.height);
    }
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left]!;
        const b = boxes[right]!;
        const separated = a.right + 4 <= b.left || b.right + 4 <= a.left ||
          a.bottom + 4 <= b.top || b.bottom + 4 <= a.top;
        expect(separated, `${a.id} callout overlaps ${b.id}`).toBe(true);
      }
    }

    const activeLabel = placements.get('map.round-85-tide-isle');
    const activeRegion = labels.find(({ mapResourceId }) => mapResourceId === 'map.round-85-tide-isle');
    expect(activeLabel).toMatchObject({ originX: 0.5, originY: 1 });
    expect(activeLabel?.x).toBeCloseTo(activeRegion?.x ?? 0);
    expect(activeLabel?.y).toBeCloseTo((activeRegion?.y ?? 0) - 10);
  });
});
