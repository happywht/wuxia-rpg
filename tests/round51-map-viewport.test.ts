import { describe, expect, it } from 'vitest';

import { clampMapViewport, createMapViewport, panMapViewport, zoomMapViewport } from '../src/engine/map-viewport';

const bounds = { x: 100, y: 50, width: 520, height: 298 };

describe('Round 51 movable map viewport', () => {
  it('fits the full map inside the overview bounds', () => {
    const viewport = createMapViewport(bounds, 1600, 1600);
    expect(viewport.scale).toBeCloseTo(298 / 1600);
    expect(viewport.x).toBe(bounds.x + bounds.width / 2);
    expect(viewport.y).toBe(bounds.y + bounds.height / 2);
    expect(1600 * viewport.scale).toBeLessThanOrEqual(bounds.width);
    expect(1600 * viewport.scale).toBeLessThanOrEqual(bounds.height);
  });

  it('clamps panning so an enlarged map cannot expose empty space at an edge', () => {
    const initial = { x: 360, y: 199, scale: 0.5 };
    const leftTop = panMapViewport(bounds, 1600, 1600, initial, 900, 900);
    const rightBottom = panMapViewport(bounds, 1600, 1600, initial, -900, -900);
    expect(leftTop.x - 1600 * leftTop.scale / 2).toBe(bounds.x);
    expect(leftTop.y - 1600 * leftTop.scale / 2).toBe(bounds.y);
    expect(rightBottom.x + 1600 * rightBottom.scale / 2).toBe(bounds.x + bounds.width);
    expect(rightBottom.y + 1600 * rightBottom.scale / 2).toBe(bounds.y + bounds.height);
  });

  it('keeps the map point below the pointer stationary while zooming', () => {
    const initial = { x: 360, y: 199, scale: 0.2 };
    const pointer = { x: 360, y: 172 };
    const mapX = (pointer.x - initial.x) / initial.scale + 800;
    const mapY = (pointer.y - initial.y) / initial.scale + 800;
    const zoomed = zoomMapViewport(bounds, 1600, 1600, initial, pointer.x, pointer.y, 1.8, 0.1, 1.2);
    expect(zoomed.scale).toBeCloseTo(0.36);
    expect(zoomed.x + (mapX - 800) * zoomed.scale).toBeCloseTo(pointer.x);
    expect(zoomed.y + (mapY - 800) * zoomed.scale).toBeCloseTo(pointer.y);
  });

  it('centers maps smaller than the viewport on both axes', () => {
    const viewport = clampMapViewport(bounds, 256, 144, { x: -1000, y: 4000, scale: 1 });
    expect(viewport.x).toBe(bounds.x + bounds.width / 2);
    expect(viewport.y).toBe(bounds.y + bounds.height / 2);
  });
});
