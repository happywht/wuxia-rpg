/**
 * Round 09 persistent interface settings: master volume and text size.
 *
 * Exactly the two settings the plan demands, each genuinely wired into the
 * running game — volume drives the Phaser global sound bus (every current
 * and future audio channel inherits it), text scale feeds every UI panel's
 * font size through {@link uiFontSize}. Unsupported settings are simply not
 * offered. Values persist through the same storage adapters as saves, under
 * a dedicated key, with the same defensive parsing: a corrupt or partial
 * settings payload falls back to the defaults without touching storage
 * (nothing is overwritten until the player changes a setting).
 *
 * This module is Phaser-free except for {@link applyGameSettings}, which
 * takes the game instance the boot entry owns.
 */

import type Phaser from 'phaser';

import type { SaveStorage } from '../engine/save-system';

/** Dedicated storage key; never shares the save-slot key space. */
export const SETTINGS_STORAGE_KEY = 'wuxia-rpg.settings.v1';

/** Discrete volume levels 0–10 (shown as a bar in the settings pages). */
export const VOLUME_STEP_COUNT = 10;

/** Discrete text-scale steps; index 1 ("标准") is the default. */
export const TEXT_SCALE_STEPS = [0.85, 1, 1.2, 1.4] as const;
export const TEXT_SCALE_LABELS = ['小', '标准', '大', '特大'] as const;
export const DEFAULT_TEXT_SCALE_INDEX = 1;
export const DEFAULT_VOLUME = 8;

export interface GameSettings {
  /** Integer 0–10; the sound bus receives value/10. */
  volume: number;
  /** Index into {@link TEXT_SCALE_STEPS}. */
  textScaleIndex: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  volume: DEFAULT_VOLUME,
  textScaleIndex: DEFAULT_TEXT_SCALE_INDEX,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses one settings payload; null on any problem (unknown fields are
 * ignored, but the two known fields must be valid).
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
  return { volume, textScaleIndex };
}

/** Runtime copy the font-size helper reads (kept in sync by the loaders). */
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

/** Applies settings to the live game (sound bus volume; fonts read lazily). */
export function applyGameSettings(game: Phaser.Game, settings: GameSettings): void {
  const validated = parseSettings(settings);
  if (validated === null) {
    return;
  }
  runtimeSettings = { ...validated };
  const manager = game.sound as unknown as { volume?: number } | null;
  if (manager !== null && typeof manager.volume === 'number') {
    manager.volume = validated.volume / VOLUME_STEP_COUNT;
  }
}

/** Current text-scale factor (1 = standard). */
export function currentTextScale(): number {
  return TEXT_SCALE_STEPS[runtimeSettings.textScaleIndex] ?? 1;
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
