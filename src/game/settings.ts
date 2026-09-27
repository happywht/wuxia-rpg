/**
 * Round 09 persistent interface settings: master volume and text size.
 * Round 41 extends the same payload with input and accessibility options —
 * keyboard movement layout (both / arrows / WASD), gamepad input on/off,
 * high contrast and reduced motion — while staying backward compatible with
 * Round 09 payloads that only carry `{ volume, textScaleIndex }`: the two
 * original fields must still be valid or the payload is refused whole, the
 * new fields default when absent and invalidate the payload only when
 * present-but-wrong. A larger text-scale step (1.6) joins the ladder because
 * the 960×540 panels still fit it.
 *
 * Exactly the offered settings are wired into the running game — volume
 * drives the Phaser global sound bus, text scale feeds every UI panel's font
 * size through {@link uiFontSize}, high contrast retunes the live game
 * canvas, and movement layout / gamepad / reduced motion are read live by the
 * scenes through the `current*` accessors. Values persist through the same
 * storage adapters as saves, under a dedicated key, with defensive parsing:
 * a corrupt or partial settings payload falls back to the defaults without
 * touching storage (nothing is overwritten until the player changes a
 * setting).
 *
 * This module is Phaser-free except for {@link applyGameSettings}, which
 * takes the game instance the boot entry owns.
 */

import type Phaser from 'phaser';

import type { SaveStorage } from '../engine/save-system';
import {
  MOVEMENT_LAYOUT_LABELS,
  type MovementLayout,
  movementHelpText,
  parseMovementLayout,
} from './input-settings';

/** Dedicated storage key; never shares the save-slot key space. */
export const SETTINGS_STORAGE_KEY = 'wuxia-rpg.settings.v1';

/** Discrete volume levels 0–10 (shown as a bar in the settings pages). */
export const VOLUME_STEP_COUNT = 10;

/** Discrete text-scale steps; index 1 ("标准") is the default. */
export const TEXT_SCALE_STEPS = [0.85, 1, 1.2, 1.4, 1.6] as const;
export const TEXT_SCALE_LABELS = ['小', '标准', '大', '特大', '最大'] as const;
export const DEFAULT_TEXT_SCALE_INDEX = 1;
export const DEFAULT_VOLUME = 8;

/** CSS filter applied to the live game canvas while high contrast is on. */
export const HIGH_CONTRAST_FILTER = 'contrast(1.4) saturate(1.25)';

export interface GameSettings {
  /** Integer 0–10; the sound bus receives value/10. */
  volume: number;
  /** Index into {@link TEXT_SCALE_STEPS}. */
  textScaleIndex: number;
  /** Which movement key set the grid scene listens to. */
  movementLayout: MovementLayout;
  /** Whether standard-gamepad input triggers movement and menu actions. */
  gamepadEnabled: boolean;
  /** Retunes the game canvas for stronger figure/ground separation. */
  highContrast: boolean;
  /** Presents moves, fades and NPC repositioning without tweens/particles. */
  reducedMotion: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  volume: DEFAULT_VOLUME,
  textScaleIndex: DEFAULT_TEXT_SCALE_INDEX,
  movementLayout: 'both',
  gamepadEnabled: true,
  highContrast: false,
  reducedMotion: false,
};

/** Number of rows the shared settings pages render (cycling order). */
export const SETTINGS_ROW_COUNT = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses one settings payload; null on any problem. The Round 09 fields must
 * be valid; Round 41 fields default when absent and refuse the payload when
 * present but malformed. Unknown extra fields are ignored.
 */
function parseSettings(raw: unknown): GameSettings | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const volume = raw.volume;
  const textScaleIndex = raw.textScaleIndex;
  if (
    typeof volume !== 'number' ||
    !Number.isInteger(volume) ||
    volume < 0 ||
    volume > VOLUME_STEP_COUNT
  ) {
    return null;
  }
  if (
    typeof textScaleIndex !== 'number' ||
    !Number.isInteger(textScaleIndex) ||
    textScaleIndex < 0 ||
    textScaleIndex >= TEXT_SCALE_STEPS.length
  ) {
    return null;
  }
  const movementLayout = raw.movementLayout;
  if (movementLayout !== undefined) {
    if (parseMovementLayout(movementLayout) === null) {
      return null;
    }
  }
  for (const key of ['gamepadEnabled', 'highContrast', 'reducedMotion'] as const) {
    const value = raw[key];
    if (value !== undefined && typeof value !== 'boolean') {
      return null;
    }
  }
  return {
    volume,
    textScaleIndex,
    movementLayout: movementLayout === undefined
      ? DEFAULT_GAME_SETTINGS.movementLayout
      : (movementLayout as MovementLayout),
    gamepadEnabled: raw.gamepadEnabled === undefined
      ? DEFAULT_GAME_SETTINGS.gamepadEnabled
      : (raw.gamepadEnabled as boolean),
    highContrast: raw.highContrast === undefined
      ? DEFAULT_GAME_SETTINGS.highContrast
      : (raw.highContrast as boolean),
    reducedMotion: raw.reducedMotion === undefined
      ? DEFAULT_GAME_SETTINGS.reducedMotion
      : (raw.reducedMotion as boolean),
  };
}

/** Runtime copy the live accessors read (kept in sync by the loaders). */
let runtimeSettings: GameSettings = DEFAULT_GAME_SETTINGS;

/**
 * Reads settings from storage. Missing, corrupt or partially invalid
 * payloads return the defaults — storage is left exactly as it was.
 */
export function loadGameSettings(storage: SaveStorage): GameSettings {
  let text: string | null = null;
  try {
    text = storage.read(SETTINGS_STORAGE_KEY);
  } catch {
    text = null; // Unavailable storage: defaults, never a crash.
  }
  if (text === null) {
    runtimeSettings = { ...DEFAULT_GAME_SETTINGS };
    return { ...runtimeSettings };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    runtimeSettings = { ...DEFAULT_GAME_SETTINGS };
    return { ...runtimeSettings };
  }
  const parsed = parseSettings(raw);
  runtimeSettings = { ...(parsed ?? DEFAULT_GAME_SETTINGS) };
  return { ...runtimeSettings };
}

/** Updates the live setting immediately, then persists; false means session-only. */
export function saveGameSettings(storage: SaveStorage, settings: GameSettings): boolean {
  const validated = parseSettings(settings);
  if (validated === null) {
    return false;
  }
  runtimeSettings = { ...validated };
  try {
    storage.write(SETTINGS_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    return false; // Quota/disabled storage: settings stay session-only.
  }
  return true;
}

/** Applies settings to the live game (sound bus, canvas contrast; fonts read lazily). */
export function applyGameSettings(game: Phaser.Game, settings: GameSettings): void {
  const validated = parseSettings(settings);
  if (validated === null) {
    return;
  }
  runtimeSettings = { ...validated };
  const manager = game.sound as unknown as { volume?: number } | null | undefined;
  if (manager != null && typeof manager.volume === 'number') {
    manager.volume = validated.volume / VOLUME_STEP_COUNT;
  }
  // High contrast retunes the whole rendered canvas in one place. This is a
  // display-level boost of the existing pixel-art palette, not a per-element
  // WCAG color audit — see docs/ACCESSIBILITY.md for the exact scope.
  const canvas = game.canvas as
    | { style: { filter?: string } }
    | null
    | undefined;
  if (canvas !== null && canvas !== undefined) {
    canvas.style.filter = validated.highContrast ? HIGH_CONTRAST_FILTER : '';
  }
}

/** Current text-scale factor (1 = standard). */
export function currentTextScale(): number {
  return TEXT_SCALE_STEPS[runtimeSettings.textScaleIndex] ?? 1;
}

/** Current movement layout (grid scene and help texts read this live). */
export function currentMovementLayout(): MovementLayout {
  return runtimeSettings.movementLayout;
}

/** Whether gamepad input currently reaches movement and menus. */
export function currentGamepadEnabled(): boolean {
  return runtimeSettings.gamepadEnabled;
}

/** Whether gameplay presents movement and fades without tweens/particles. */
export function currentReducedMotion(): boolean {
  return runtimeSettings.reducedMotion;
}

/**
 * Font-size string for UI text, honoring the persisted text-scale setting.
 * Every panel asks this helper instead of hard-coding pixel sizes, so one
 * setting resizes the whole interface consistently.
 */
export function uiFontSize(base: number): string {
  return `${Math.max(8, Math.round(base * currentTextScale()))}px`;
}

/** Formats the volume level as the settings pages display it. */
export function volumeLabel(volume: number): string {
  return '▮'.repeat(volume) + '▯'.repeat(VOLUME_STEP_COUNT - volume);
}

function onOffLabel(value: boolean): string {
  return value ? '开' : '关';
}

/**
 * The settings rows both the main menu and the pause menu render. One source
 * guarantees the two pages always expose — and describe — the same settings.
 */
export function settingsRows(settings: GameSettings): string[] {
  return [
    `音量　${volumeLabel(settings.volume)}（${settings.volume}/10）`,
    `文字大小　${TEXT_SCALE_LABELS[settings.textScaleIndex] ?? '标准'}（全界面即时生效）`,
    `移动键位　${MOVEMENT_LAYOUT_LABELS[settings.movementLayout]}（探索与帮助同步）`,
    `手柄输入　${onOffLabel(settings.gamepadEnabled)}（D-pad/左摇杆移动，A 确认，B 返回）`,
    `高对比度　${onOffLabel(settings.highContrast)}（增强画面对比，立即生效）`,
    `减少动态效果　${onOffLabel(settings.reducedMotion)}（移动与昼夜/天气变化不播动画）`,
  ];
}

/**
 * Left/Right adjustment of one settings row, shared by both settings pages.
 * Returns the unchanged reference for an out-of-range row so callers can
 * skip persisting no-ops.
 */
export function adjustGameSetting(settings: GameSettings, row: number, delta: number): GameSettings {
  if (row === 0) {
    if (settings.volume + delta < 0 || settings.volume + delta > VOLUME_STEP_COUNT) {
      return settings;
    }
    return { ...settings, volume: settings.volume + delta };
  }
  if (row === 1) {
    const count = TEXT_SCALE_STEPS.length;
    return { ...settings, textScaleIndex: (settings.textScaleIndex + delta + count) % count };
  }
  if (row === 2) {
    const order = settings.movementLayout === 'both' ? 0 : settings.movementLayout === 'arrows' ? 1 : 2;
    const next = (order + delta + 3) % 3;
    return {
      ...settings,
      movementLayout: next === 0 ? 'both' : next === 1 ? 'arrows' : 'wasd',
    };
  }
  if (row === 3) {
    return { ...settings, gamepadEnabled: !settings.gamepadEnabled };
  }
  if (row === 4) {
    return { ...settings, highContrast: !settings.highContrast };
  }
  if (row === 5) {
    return { ...settings, reducedMotion: !settings.reducedMotion };
  }
  return settings;
}

/** Movement help line for the current live layout (HUD and controls panel). */
export function currentMovementHelpText(): string {
  return movementHelpText(runtimeSettings.movementLayout);
}
