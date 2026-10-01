import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {}, Input: { Keyboard: { KeyCodes: {} } },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
} }));
vi.mock('../src/game/settings', async (original) => ({
  ...await original<object>(), currentReducedMotion: () => true,
}));
import { GridScene } from '../src/game/grid-scene';
import { gridMapActorDepth } from '../src/engine/grid-map-renderer';

describe('Round110 reduced movement updates foreground depth at its final position', () => {
  it.each([1, -1])('sorts a snapped actor after a row change of %i', (delta) => {
    const scene = new GridScene();
    const internals = scene as unknown as Record<string, any>;
    const marker = { x: 72, y: 120, setPosition: vi.fn(function(this: any, x: number, y: number) {
      this.x = x; this.y = y; return this;
    }), setDepth: vi.fn() };
    const sort = vi.fn();
    Object.assign(internals, {
      map: { tileSize: 48, canEnter: () => true }, marker,
      playerCol: 1, playerRow: 2, occupancy: { isOccupied: () => false },
      encounterCells: new Map(), npcLayer: { sort }, clock: null,
    });
    for (const method of ['anyOverlayOpen', 'updatePlayerActorFrame', 'updateCoordsHud',
      'updateTransitionMarkerProximity', 'refreshNavigationGuide', 'updateInteractHint',
      'advanceTime', 'refreshCompanionFollower', 'triggerRegionEvents', 'runPendingDataReload']) {
      internals[method] = vi.fn(() => false);
    }
    internals.tryMove(0, delta);
    expect(marker.y).toBe((2 + delta) * 48 + 24);
    expect(marker.setDepth).toHaveBeenLastCalledWith(gridMapActorDepth(marker.y, 48));
    expect(sort).toHaveBeenCalledWith('depth');
    expect(internals.playerRow).toBe(2 + delta);
    expect(internals.moving).toBe(false);
    expect(internals.triggerRegionEvents).toHaveBeenCalledWith('', true);
  });
});
