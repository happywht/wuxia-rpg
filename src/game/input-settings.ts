/**
 * Round 41 input settings helpers: keyboard movement-layout selection and
 * standard-gamepad direction/action resolution.
 *
 * Deliberately Phaser-free so every rule below is unit-testable in bare Node
 * (mirroring the engine modules): scenes adapt their Phaser objects into the
 * plain structures these functions accept and apply the verdicts. The
 * standard mapping follows the browser "standard gamepad mapping" exposed by
 * Phaser's Gamepad class — D-pad booleans, a left-stick vector and the
 * A (bottom) / B (right) cluster buttons.
 *
 * Two behaviours matter most for feel and are pinned by tests:
 *
 * - D-pad wins over the stick, and diagonal stick deflections resolve to a
 *   single cardinal axis (larger component first, horizontal on ties), so a
 *   grid walk never needs diagonal handling;
 * - {@link GamepadEdgeTracker} turns held inputs into edges: a stick or
 *   button that stays down fires exactly once, which is what keeps a held
 *   direction from moving the player every frame.
 */

/** Persisted keyboard movement layouts, in settings-page cycle order. */
export const MOVEMENT_LAYOUTS = ['both', 'arrows', 'wasd'] as const;

export type MovementLayout = (typeof MOVEMENT_LAYOUTS)[number];

/** Settings-page labels; same order as {@link MOVEMENT_LAYOUTS}. */
export const MOVEMENT_LAYOUT_LABELS: Record<MovementLayout, string> = {
  both: '方向键 + WASD',
  arrows: '仅方向键',
  wasd: '仅 WASD',
};

/** Parses a persisted layout value; null on anything unknown. */
export function parseMovementLayout(value: unknown): MovementLayout | null {
  return typeof value === 'string' && (MOVEMENT_LAYOUTS as readonly string[]).includes(value)
    ? (value as MovementLayout)
    : null;
}

/** Abstract movement key names; scenes map them onto Phaser KeyCodes. */
export const MOVEMENT_KEY_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D'] as const;

export type MovementKeyName = (typeof MOVEMENT_KEY_NAMES)[number];

/** Which movement keys the layout listens to (order: arrows then WASD). */
export function movementKeyNamesForLayout(layout: MovementLayout): readonly MovementKeyName[] {
  const arrows: MovementKeyName[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  const wasd: MovementKeyName[] = ['W', 'A', 'S', 'D'];
  if (layout === 'arrows') {
    return arrows;
  }
  if (layout === 'wasd') {
    return wasd;
  }
  return [...arrows, ...wasd];
}

/** True when the layout currently accepts the given movement key. */
export function isMovementKeyEnabled(layout: MovementLayout, key: MovementKeyName): boolean {
  return movementKeyNamesForLayout(layout).includes(key);
}

/** Movement help line shown in the HUD and the controls panel. */
export function movementHelpText(layout: MovementLayout): string {
  if (layout === 'arrows') {
    return '方向键移动';
  }
  if (layout === 'wasd') {
    return 'WASD 移动';
  }
  return '方向键 / WASD 移动';
}

/** Cardinal directions a gamepad can express for grid navigation. */
export type GamepadDirection = 'up' | 'down' | 'left' | 'right';

/** Stick deflection below this magnitude reads as centered. */
export const STICK_DEADZONE = 0.5;

/**
 * Resolves one stick position to a cardinal direction: inside the deadzone
 * null; otherwise the larger |component| wins and exact diagonals favour the
 * horizontal axis, so one deflection always yields at most one direction.
 */
export function resolveStickDirection(
  x: number,
  y: number,
  deadzone = STICK_DEADZONE,
): GamepadDirection | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadzone) {
    return null;
  }
  return Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
}

/** D-pad state as Phaser's standard-mapping booleans report it. */
export interface GamepadDpadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Combines D-pad and left stick into one direction: D-pad wins whenever any
 * of its buttons reads pressed (cardinal priority), the stick only fills in
 * when the pad is silent. Opposing simultaneous D-pad buttons resolve by
 * up-before-down and left-before-right, matching the key-pair precedence the
 * keyboard path has always had.
 */
export function resolveGamepadDirection(
  dpad: GamepadDpadState,
  stickX: number,
  stickY: number,
  deadzone = STICK_DEADZONE,
): GamepadDirection | null {
  if (dpad.up) {
    return 'up';
  }
  if (dpad.down) {
    return 'down';
  }
  if (dpad.left) {
    return 'left';
  }
  if (dpad.right) {
    return 'right';
  }
  return resolveStickDirection(stickX, stickY, deadzone);
}

/** The pad surface {@link sampleStandardPad} reads; Phaser-free by design. */
export interface StandardPadSource {
  /** Standard-mapping D-pad booleans. */
  dpad: GamepadDpadState;
  /** Left-stick axes, each nominally -1..1 (already thresholded by Phaser). */
  leftStick: { x: number; y: number };
  /** Standard-mapping bottom cluster button (Xbox A / DualShock ✕). */
  A: boolean;
  /** Standard-mapping right cluster button (Xbox B / DualShock ○). */
  B: boolean;
}

/** One frame's worth of resolved gamepad intent. */
export interface StandardPadAction {
  /** Resolved D-pad/stick direction, null when centered. */
  direction: GamepadDirection | null;
  /** Confirm intent (A). */
  confirm: boolean;
  /** Back intent (B). */
  back: boolean;
}

/** Samples a standard-mapped pad into menu/gameplay actions. */
export function sampleStandardPad(
  source: StandardPadSource,
  deadzone = STICK_DEADZONE,
): StandardPadAction {
  return {
    direction: resolveGamepadDirection(source.dpad, source.leftStick.x, source.leftStick.y, deadzone),
    confirm: source.A,
    back: source.B,
  };
}

/**
 * Converts held gamepad state into press edges. Feed it the sampled action
 * every frame; the returned object is true only on the frame an input
 * *appeared* (a held stick or button yields false until released and pressed
 * again). Rotation between directions without centering still counts as a new
 * edge, so rolling the stick from up to right fires exactly one right press.
 */
export class GamepadEdgeTracker {
  private lastDirection: GamepadDirection | null = null;
  private lastConfirm = false;
  private lastBack = false;

  update(action: StandardPadAction): StandardPadAction {
    const direction = action.direction !== null && action.direction !== this.lastDirection
      ? action.direction
      : null;
    const confirm = action.confirm && !this.lastConfirm;
    const back = action.back && !this.lastBack;
    this.lastDirection = action.direction;
    this.lastConfirm = action.confirm;
    this.lastBack = action.back;
    return { direction, confirm, back };
  }

  /** Clears the held-state memory (used when a panel closes mid-press). */
  reset(): void {
    this.lastDirection = null;
    this.lastConfirm = false;
    this.lastBack = false;
  }
}
