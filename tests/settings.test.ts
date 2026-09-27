/**
 * Round 41 unit tests for the persistent interface settings.
 *
 * Pins the four contracts the game depends on:
 *
 * - backward compatibility: a Round 09 payload `{ volume, textScaleIndex }`
 *   loads with defaults for every Round 41 field; a payload carrying a
 *   present-but-invalid Round 41 field is refused whole (defaults, storage
 *   untouched), exactly like the original two-field rules;
 * - validation/persistence: corrupt JSON, out-of-range values and refused
 *   writes degrade to defaults / session-only settings instead of crashing;
 * - live application: the sound bus gets volume/10 and the game canvas gets
 *   (or loses) the high-contrast CSS filter, which is how "contrast changes
 *   the visible canvas" is asserted without a browser;
 * - the shared settings-page surface: both menus render `settingsRows` and
 *   adjust through `adjustGameSetting`, so their row count, cycle order and
 *   clamp behaviour are locked here once for both.
 *
 * `settings.ts` keeps a module-level runtime copy; every test re-loads or
 * re-saves first so ordering never matters.
 */

import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';

import {
  adjustGameSetting,
  applyGameSettings,
  currentGamepadEnabled,
  currentMovementLayout,
  currentReducedMotion,
  currentTextScale,
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  HIGH_CONTRAST_FILTER,
  loadGameSettings,
  saveGameSettings,
  SETTINGS_ROW_COUNT,
  SETTINGS_STORAGE_KEY,
  settingsRows,
  TEXT_SCALE_LABELS,
  TEXT_SCALE_STEPS,
  uiFontSize,
} from '../src/game/settings';
import type { SaveStorage } from '../src/engine/save-system';

/** In-memory storage stand-in; `failing` makes writes throw like a refused browser. */
function makeStorage(initial: Record<string, string> = {}, failing = false): SaveStorage & {
  dump: () => Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: (key: string, value: string) => {
      if (failing) {
        throw new Error('浏览器本地存储不可用');
      }
      store.set(key, value);
    },
    remove: (key: string) => {
      if (failing) {
        throw new Error('浏览器本地存储不可用');
      }
      store.delete(key);
    },
    dump: () => store,
  };
}

/** Minimal structural stand-in for the parts applyGameSettings touches. */
function makeMockGame(): {
  game: Phaser.Game;
  sound: { volume: number };
  canvas: { style: { filter: string } };
} {
  const sound = { volume: -1 };
  const canvas = { style: { filter: 'untouched' } };
  return { game: { sound, canvas } as unknown as Phaser.Game, sound, canvas };
}

const fullSettings: GameSettings = {
  volume: 3,
  textScaleIndex: 3,
  movementLayout: 'wasd',
  gamepadEnabled: false,
  highContrast: true,
  reducedMotion: true,
};

describe('Round 09 payload migration (v1 backward compatibility)', () => {
  it('fills Round 41 defaults for a legacy two-field payload', () => {
    const storage = makeStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ volume: 5, textScaleIndex: 2 }),
    });
    const loaded = loadGameSettings(storage);
    expect(loaded.volume).toBe(5);
    expect(loaded.textScaleIndex).toBe(2);
    expect(loaded.movementLayout).toBe('both');
    expect(loaded.gamepadEnabled).toBe(true);
    expect(loaded.highContrast).toBe(false);
    expect(loaded.reducedMotion).toBe(false);
  });

  it('keeps legacy payloads storable under the same key (no migration write)', () => {
    const legacy = JSON.stringify({ volume: 7, textScaleIndex: 0 });
    const storage = makeStorage({ [SETTINGS_STORAGE_KEY]: legacy });
    loadGameSettings(storage);
    expect(storage.dump().get(SETTINGS_STORAGE_KEY)).toBe(legacy);
  });
});

describe('validation and persistence', () => {
  it('round-trips a full Round 41 payload', () => {
    const storage = makeStorage();
    expect(saveGameSettings(storage, fullSettings)).toBe(true);
    expect(loadGameSettings(storage)).toEqual(fullSettings);
    expect(JSON.parse(storage.dump().get(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual(fullSettings);
  });

  it('refuses a payload whose new field is present but invalid', () => {
    const storage = makeStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        volume: 5,
        textScaleIndex: 2,
        movementLayout: 'qwerty',
      }),
    });
    expect(loadGameSettings(storage)).toEqual({ ...DEFAULT_GAME_SETTINGS });
    // Refusal leaves storage exactly as it was.
    expect(JSON.parse(storage.dump().get(SETTINGS_STORAGE_KEY) ?? '{}').movementLayout).toBe('qwerty');
  });

  it('refuses non-boolean flag values', () => {
    for (const field of ['gamepadEnabled', 'highContrast', 'reducedMotion'] as const) {
      const payload = { volume: 5, textScaleIndex: 2, [field]: 'yes' };
      const storage = makeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(payload) });
      expect(loadGameSettings(storage)).toEqual({ ...DEFAULT_GAME_SETTINGS });
    }
  });

  it('still refuses the Round 09 fields when out of range', () => {
    for (const payload of [
      { volume: -1, textScaleIndex: 1 },
      { volume: 11, textScaleIndex: 1 },
      { volume: 5, textScaleIndex: -1 },
      { volume: 5, textScaleIndex: TEXT_SCALE_STEPS.length },
      { volume: 5.5, textScaleIndex: 1 },
      { volume: Number.NaN, textScaleIndex: 1 },
    ]) {
      const storage = makeStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify(payload) });
      expect(loadGameSettings(storage)).toEqual({ ...DEFAULT_GAME_SETTINGS });
    }
  });

  it('falls back to defaults for missing keys, corrupt JSON and non-objects', () => {
    expect(loadGameSettings(makeStorage())).toEqual({ ...DEFAULT_GAME_SETTINGS });
    const broken = makeStorage({ [SETTINGS_STORAGE_KEY]: 'not json {' });
    expect(loadGameSettings(broken)).toEqual({ ...DEFAULT_GAME_SETTINGS });
    expect(loadGameSettings(makeStorage({ [SETTINGS_STORAGE_KEY]: '[1,2,3]' })))
      .toEqual({ ...DEFAULT_GAME_SETTINGS });
    expect(loadGameSettings(makeStorage({ [SETTINGS_STORAGE_KEY]: 'null' })))
      .toEqual({ ...DEFAULT_GAME_SETTINGS });
  });

  it('ignores unknown extra fields instead of refusing them', () => {
    const storage = makeStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({ ...fullSettings, futureField: 'whatever' }),
    });
    const loaded = loadGameSettings(storage);
    expect(loaded).toEqual(fullSettings);
  });

  it('saveGameSettings refuses invalid input without touching storage', () => {
    const storage = makeStorage({ [SETTINGS_STORAGE_KEY]: 'sentinel' });
    expect(saveGameSettings(storage, { ...fullSettings, volume: 99 })).toBe(false);
    expect(storage.dump().get(SETTINGS_STORAGE_KEY)).toBe('sentinel');
  });

  it('a refused write keeps settings session-only but live', () => {
    const storage = makeStorage({}, true); // Writes throw like a blocked browser.
    expect(saveGameSettings(storage, fullSettings)).toBe(false);
    // The runtime copy still updated: panels read the live accessors.
    applyGameSettings(makeMockGame().game, fullSettings);
    expect(currentTextScale()).toBe(TEXT_SCALE_STEPS[3]);
    expect(currentMovementLayout()).toBe('wasd');
    expect(currentGamepadEnabled()).toBe(false);
    expect(currentReducedMotion()).toBe(true);
  });

  it('a throwing read degrades to defaults', () => {
    const storage = makeStorage();
    storage.read = () => {
      throw new Error('unavailable');
    };
    expect(loadGameSettings(storage)).toEqual({ ...DEFAULT_GAME_SETTINGS });
  });
});

describe('live application (sound bus and canvas appearance)', () => {
  it('applies volume/10 to the sound bus', () => {
    const { game, sound } = makeMockGame();
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, volume: 8 });
    expect(sound.volume).toBeCloseTo(0.8);
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, volume: 0 });
    expect(sound.volume).toBe(0);
  });

  it('applies and clears the high-contrast canvas filter', () => {
    const { game, canvas } = makeMockGame();
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, highContrast: true });
    expect(canvas.style.filter).toBe(HIGH_CONTRAST_FILTER);
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, highContrast: false });
    expect(canvas.style.filter).toBe('');
  });

  it('survives a missing sound manager or canvas', () => {
    const canvas = { style: { filter: 'untouched' } };
    applyGameSettings({ canvas } as unknown as Phaser.Game, fullSettings);
    expect(canvas.style.filter).toBe(HIGH_CONTRAST_FILTER);
    applyGameSettings({ sound: null } as unknown as Phaser.Game, fullSettings); // no crash
    const bare = {} as Phaser.Game;
    applyGameSettings(bare, fullSettings); // no crash
  });

  it('ignores invalid settings payloads', () => {
    const { game, sound, canvas } = makeMockGame();
    // First apply syncs the appearance (defaults clear the filter to '').
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, volume: 6 });
    expect(canvas.style.filter).toBe('');
    // An invalid payload must change nothing — not volume, not appearance.
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, volume: 42, highContrast: true });
    expect(sound.volume).toBeCloseTo(0.6); // unchanged
    expect(canvas.style.filter).toBe(''); // contrast request never landed
  });
});

describe('text scale ladder', () => {
  it('adds a strictly larger top step for the five labels', () => {
    expect(TEXT_SCALE_STEPS.length).toBe(5);
    expect(TEXT_SCALE_LABELS.length).toBe(5);
    for (let index = 1; index < TEXT_SCALE_STEPS.length; index += 1) {
      expect(TEXT_SCALE_STEPS[index]!).toBeGreaterThan(TEXT_SCALE_STEPS[index - 1]!);
    }
    expect(TEXT_SCALE_STEPS[4]).toBe(1.6);
  });

  it('feeds uiFontSize from the live setting (minimum 8px)', () => {
    const { game } = makeMockGame();
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, textScaleIndex: 4 });
    expect(uiFontSize(10)).toBe('16px');
    applyGameSettings(game, { ...DEFAULT_GAME_SETTINGS, textScaleIndex: 0 });
    expect(uiFontSize(10)).toBe('9px'); // 10 × 0.85 = 8.5 → 9
    expect(uiFontSize(4)).toBe('8px'); // clamped up from 3.4
  });
});

describe('shared settings-page surface (both menus)', () => {
  it('renders six rows mentioning every setting', () => {
    const rows = settingsRows(fullSettings);
    expect(rows).toHaveLength(SETTINGS_ROW_COUNT);
    expect(SETTINGS_ROW_COUNT).toBe(6);
    expect(rows[0]).toContain('音量');
    expect(rows[1]).toContain('文字大小');
    expect(rows[2]).toContain('移动键位');
    expect(rows[3]).toContain('手柄输入');
    expect(rows[4]).toContain('高对比度');
    expect(rows[5]).toContain('减少动态效果');
    // fullSettings flags render on/off consistently.
    expect(rows[3]).toContain('关');
    expect(rows[4]).toContain('开');
    expect(rows[5]).toContain('开');
  });

  it('adjusts volume with a clamp instead of a cycle', () => {
    expect(adjustGameSetting({ ...DEFAULT_GAME_SETTINGS, volume: 9 }, 0, 1).volume).toBe(10);
    const atMax = { ...DEFAULT_GAME_SETTINGS, volume: 10 };
    expect(adjustGameSetting(atMax, 0, 1)).toBe(atMax); // no-op keeps identity
    expect(adjustGameSetting({ ...DEFAULT_GAME_SETTINGS, volume: 0 }, 0, -1).volume).toBe(0);
  });

  it('cycles text scale and movement layout through their steps', () => {
    const top = adjustGameSetting({ ...DEFAULT_GAME_SETTINGS, textScaleIndex: 4 }, 1, 1);
    expect(top.textScaleIndex).toBe(0);
    expect(adjustGameSetting({ ...DEFAULT_GAME_SETTINGS, textScaleIndex: 0 }, 1, -1).textScaleIndex)
      .toBe(4);

    let settings = { ...DEFAULT_GAME_SETTINGS };
    settings = adjustGameSetting(settings, 2, 1);
    expect(settings.movementLayout).toBe('arrows');
    settings = adjustGameSetting(settings, 2, 1);
    expect(settings.movementLayout).toBe('wasd');
    settings = adjustGameSetting(settings, 2, 1);
    expect(settings.movementLayout).toBe('both');
    settings = adjustGameSetting(settings, 2, -1);
    expect(settings.movementLayout).toBe('wasd');
  });

  it('toggles the three boolean rows and ignores unknown rows', () => {
    const base = { ...DEFAULT_GAME_SETTINGS };
    expect(adjustGameSetting(base, 3, 1).gamepadEnabled).toBe(false);
    expect(adjustGameSetting(base, 4, 1).highContrast).toBe(true);
    expect(adjustGameSetting(base, 5, -1).reducedMotion).toBe(true);
    expect(adjustGameSetting(base, 99, 1)).toBe(base);
  });
});
