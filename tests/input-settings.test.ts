/**
 * Round 41 unit tests for the Phaser-free input settings helpers.
 *
 * Everything here pins the contracts the scenes rely on: keyboard movement
 * layouts (which keys each layout listens to, and the help text that
 * follows), standard-gamepad direction resolution (D-pad cardinal priority,
 * stick deadzone and tie handling) and the edge tracker that converts held
 * pads/sticks into single presses — the mechanism that keeps a held stick
 * from moving the player every frame. No Phaser import is involved; the
 * scenes adapt their pad objects into these plain structures.
 */

import { describe, expect, it } from 'vitest';

import {
  GamepadEdgeTracker,
  MOVEMENT_LAYOUTS,
  movementHelpText,
  movementKeyNamesForLayout,
  type MovementKeyName,
  isMovementKeyEnabled,
  parseMovementLayout,
  resolveGamepadDirection,
  resolveStickDirection,
  STICK_DEADZONE,
  sampleStandardPad,
} from '../src/game/input-settings';

function sortedKeys(keys: readonly MovementKeyName[]): string[] {
  return [...keys].sort();
}

const centeredDpad = { up: false, down: false, left: false, right: false };

describe('movement layout parsing', () => {
  it('accepts the three persisted layouts', () => {
    expect(parseMovementLayout('both')).toBe('both');
    expect(parseMovementLayout('arrows')).toBe('arrows');
    expect(parseMovementLayout('wasd')).toBe('wasd');
    expect(MOVEMENT_LAYOUTS).toEqual(['both', 'arrows', 'wasd']);
  });

  it('rejects unknown and mistyped values', () => {
    expect(parseMovementLayout('qwerty')).toBeNull();
    expect(parseMovementLayout('BOTH')).toBeNull();
    expect(parseMovementLayout(123)).toBeNull();
    expect(parseMovementLayout(true)).toBeNull();
    expect(parseMovementLayout(null)).toBeNull();
    expect(parseMovementLayout(undefined)).toBeNull();
  });
});

describe('movement keys per layout', () => {
  it('both binds the full eight-key set', () => {
    expect(sortedKeys(movementKeyNamesForLayout('both'))).toEqual(
      sortedKeys(['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D']),
    );
  });

  it('arrows binds only the arrow keys', () => {
    expect(sortedKeys(movementKeyNamesForLayout('arrows'))).toEqual(
      sortedKeys(['UP', 'DOWN', 'LEFT', 'RIGHT']),
    );
  });

  it('wasd binds only the WASD keys', () => {
    expect(sortedKeys(movementKeyNamesForLayout('wasd'))).toEqual(
      sortedKeys(['W', 'A', 'S', 'D']),
    );
  });

  it('isMovementKeyEnabled follows the layout switch', () => {
    expect(isMovementKeyEnabled('arrows', 'UP')).toBe(true);
    expect(isMovementKeyEnabled('arrows', 'W')).toBe(false);
    expect(isMovementKeyEnabled('wasd', 'W')).toBe(true);
    expect(isMovementKeyEnabled('wasd', 'UP')).toBe(false);
    expect(isMovementKeyEnabled('both', 'UP')).toBe(true);
    expect(isMovementKeyEnabled('both', 'D')).toBe(true);
  });

  it('help text names exactly the bound key set', () => {
    expect(movementHelpText('both')).toBe('方向键 / WASD 移动');
    expect(movementHelpText('arrows')).toBe('方向键移动');
    expect(movementHelpText('wasd')).toBe('WASD 移动');
  });
});

describe('stick direction resolution', () => {
  it('reads deflections inside the deadzone as centered', () => {
    expect(resolveStickDirection(0, 0)).toBeNull();
    expect(resolveStickDirection(0.3, 0.3)).toBeNull();
    expect(resolveStickDirection(0.49, 0)).toBeNull();
    expect(resolveStickDirection(0, -0.49)).toBeNull();
  });

  it('resolves the dominant axis at the default deadzone', () => {
    expect(resolveStickDirection(0.8, 0.2)).toBe('right');
    expect(resolveStickDirection(-0.8, 0.2)).toBe('left');
    expect(resolveStickDirection(0.1, 0.9)).toBe('down');
    expect(resolveStickDirection(0.1, -0.9)).toBe('up');
  });

  it('favours the horizontal axis on exact diagonals', () => {
    expect(resolveStickDirection(0.7, 0.7)).toBe('right');
    expect(resolveStickDirection(-0.7, -0.7)).toBe('left');
  });

  it('honours a custom deadzone and rejects non-finite axes', () => {
    expect(STICK_DEADZONE).toBe(0.5);
    expect(resolveStickDirection(0.3, 0, 0.2)).toBe('right');
    expect(resolveStickDirection(Number.NaN, 0.8)).toBeNull();
    expect(resolveStickDirection(0.8, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('gamepad direction combination', () => {
  it('gives the D-pad cardinal priority over the stick', () => {
    expect(resolveGamepadDirection(
      { up: true, down: false, left: false, right: false },
      0.9,
      0,
    )).toBe('up');
    expect(resolveGamepadDirection(
      { up: false, down: true, left: false, right: false },
      -0.9,
      0,
    )).toBe('down');
  });

  it('breaks opposing D-pad pairs up-before-down and left-before-right', () => {
    expect(resolveGamepadDirection(
      { up: true, down: true, left: false, right: false },
      0,
      0,
    )).toBe('up');
    expect(resolveGamepadDirection(
      { up: false, down: false, left: true, right: true },
      0,
      0,
    )).toBe('left');
  });

  it('falls back to the stick only when the D-pad is silent', () => {
    expect(resolveGamepadDirection(centeredDpad, -0.9, 0)).toBe('left');
    expect(resolveGamepadDirection(centeredDpad, 0, 0.9)).toBe('down');
    expect(resolveGamepadDirection(centeredDpad, 0, 0)).toBeNull();
  });
});

describe('standard pad sampling', () => {
  it('maps D-pad, stick and A/B into menu actions', () => {
    expect(sampleStandardPad({
      dpad: { up: false, down: true, left: false, right: false },
      leftStick: { x: 0, y: 0 },
      A: true,
      B: false,
    })).toEqual({ direction: 'down', confirm: true, back: false });

    expect(sampleStandardPad({
      dpad: centeredDpad,
      leftStick: { x: 0.9, y: 0.1 },
      A: false,
      B: true,
    })).toEqual({ direction: 'right', confirm: false, back: true });

    expect(sampleStandardPad({
      dpad: centeredDpad,
      leftStick: { x: 0.2, y: 0.2 },
      A: false,
      B: false,
    })).toEqual({ direction: null, confirm: false, back: false });
  });
});

describe('GamepadEdgeTracker', () => {
  it('fires a direction once when it appears', () => {
    const tracker = new GamepadEdgeTracker();
    expect(tracker.update({ direction: 'up', confirm: false, back: false }).direction).toBe('up');
    expect(tracker.update({ direction: 'up', confirm: false, back: false }).direction).toBeNull();
    expect(tracker.update({ direction: 'up', confirm: false, back: false }).direction).toBeNull();
  });

  it('treats a stick rotation to a new direction as a fresh press', () => {
    const tracker = new GamepadEdgeTracker();
    tracker.update({ direction: 'up', confirm: false, back: false });
    expect(tracker.update({ direction: 'right', confirm: false, back: false }).direction).toBe('right');
    expect(tracker.update({ direction: 'right', confirm: false, back: false }).direction).toBeNull();
  });

  it('re-arms after the direction is released', () => {
    const tracker = new GamepadEdgeTracker();
    tracker.update({ direction: 'down', confirm: false, back: false });
    tracker.update({ direction: null, confirm: false, back: false });
    expect(tracker.update({ direction: 'down', confirm: false, back: false }).direction).toBe('down');
  });

  it('fires confirm and back only on the press frame', () => {
    const tracker = new GamepadEdgeTracker();
    expect(tracker.update({ direction: null, confirm: true, back: false }).confirm).toBe(true);
    expect(tracker.update({ direction: null, confirm: true, back: false }).confirm).toBe(false);
    expect(tracker.update({ direction: null, confirm: false, back: false }).confirm).toBe(false);
    expect(tracker.update({ direction: null, confirm: true, back: false }).confirm).toBe(true);

    expect(tracker.update({ direction: null, confirm: false, back: true }).back).toBe(true);
    expect(tracker.update({ direction: null, confirm: false, back: true }).back).toBe(false);
  });

  it('reset() forgets held state so the next equal frame reads as a press', () => {
    const tracker = new GamepadEdgeTracker();
    tracker.update({ direction: 'left', confirm: true, back: false });
    tracker.reset();
    const edges = tracker.update({ direction: 'left', confirm: true, back: false });
    expect(edges.direction).toBe('left');
    expect(edges.confirm).toBe(true);
  });

  it('keeps direction and button edges independent within one update', () => {
    const tracker = new GamepadEdgeTracker();
    const edges = tracker.update({ direction: 'up', confirm: true, back: true });
    expect(edges).toEqual({ direction: 'up', confirm: true, back: true });
  });
});
