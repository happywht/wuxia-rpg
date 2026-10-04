/**
 * Round 270 QA storage isolation: the game-level storage factory must keep a
 * `?qa=` run entirely inside its own localStorage namespace — probe, settings
 * and every slot key — while normal runs keep the exact engine keys. Anything
 * ambiguous (invalid id, two qa entries, a QA query in a production build)
 * refuses storage outright instead of falling back to the player namespace.
 *
 * All branches run on injected memory localStorage fixtures; nothing here
 * touches a real browser profile or mocks import.meta/window.
 */
import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY_PREFIX,
  SAVE_SLOT_LABELS,
  type SaveSnapshotV1,
  deleteSaveSlot,
  listSaveSlots,
  readSaveSlot,
  writeSaveSlot,
} from '../src/engine/save-system';
import {
  type BrowserStorageLike,
  isValidQaRunId,
  qaStorageKeyPrefix,
  resolveGameStorage,
} from '../src/game/game-storage';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY, loadGameSettings, saveGameSettings } from '../src/game/settings';

/** Memory localStorage with key introspection (the only fixture in this file). */
function memoryLocalStorage(initial?: ReadonlyMap<string, string>): BrowserStorageLike & { keys: () => string[] } {
  const store = new Map<string, string>(initial ?? []);
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    keys: () => [...store.keys()],
  };
}

const makeSnapshot = (displayName: string): SaveSnapshotV1 => ({
  protocolVersion: 1,
  savedAt: '2026-10-04T08:00:00.000Z',
  displayName,
  profileId: 'profile.round270',
  mapResourceId: 'map.round270',
  playerPosition: { col: 1, row: 2 },
  player: {
    level: 3,
    experience: 0,
    baseAttributes: { body: 5, force: 5, agility: 5, insight: 5, resolve: 5 },
    healthCurrent: 50,
    qiCurrent: 30,
    martialArtIds: [],
    factionMembership: null,
    cultivationPoints: 0,
    unlockedMeridianNodeIds: [],
  },
  inventory: { currency: 10, capacity: 20, stacks: [], equipped: {} },
  shopStocks: [],
  quests: { states: [], trackedQuestId: null },
  social: { morality: 0, renown: 0, factionRenown: [], relationships: [] },
  completedEncounters: [],
  completedRegionalEvents: [],
  knownKnowledgeNodeIds: [],
  elapsedGameMinutes: 0,
  worldSeed: 1,
  activeCompanionId: null,
  arenaRecords: [],
  factionWarRecords: [],
  customMartialArts: [],
  achievementState: {
    unlockedIds: [], battleVictories: 0, equipmentCrafts: 0, alchemyCrafts: 0, discoveredKnowledge: 0,
  },
});

const RUN_ID = 'journey-20261004';
const QA_PREFIX = qaStorageKeyPrefix(RUN_ID);

describe('Round270 QA run id protocol', () => {
  it('accepts 3–48 char lowercase ids and rejects everything else', () => {
    expect(isValidQaRunId('abc')).toBe(true);
    expect(isValidQaRunId(RUN_ID)).toBe(true);
    expect(isValidQaRunId('a'.repeat(48))).toBe(true);
    expect(isValidQaRunId('ab')).toBe(false); // Too short.
    expect(isValidQaRunId('a'.repeat(49))).toBe(false); // Too long.
    expect(isValidQaRunId('')).toBe(false);
    expect(isValidQaRunId('Journey-20261004')).toBe(false); // Uppercase.
    expect(isValidQaRunId('1abc')).toBe(false); // Digit first.
    expect(isValidQaRunId('-abc')).toBe(false); // Hyphen first.
    expect(isValidQaRunId('a_b')).toBe(false); // Underscore.
    expect(isValidQaRunId('a.b')).toBe(false); // Dot.
    expect(isValidQaRunId('北京')).toBe(false); // Non-ASCII.
  });
});

describe('Round270 QA namespace isolation (all keys, probe included)', () => {
  it('a valid DEV qa query resolves to qa mode with prefixed storage', () => {
    const ls = memoryLocalStorage();
    const resolution = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    expect(resolution.mode).toBe('qa');
    expect(resolution.qaRunId).toBe(RUN_ID);
    expect(resolution.storage).not.toBeNull();
  });

  it('slot writes land only behind the QA prefix, never on player keys', () => {
    const ls = memoryLocalStorage();
    const playerSlotKey = `${SAVE_KEY_PREFIX}slot-1`;
    ls.setItem(playerSlotKey, JSON.stringify(makeSnapshot('玩家旧档')));
    const { storage } = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    expect(storage).not.toBeNull();
    if (storage === null) return;

    const write = writeSaveSlot(storage, 'slot-1', makeSnapshot('QA检查点角色'));
    expect(write.ok).toBe(true);

    // The QA slot exists ONLY under the QA-prefixed key; the player key keeps
    // its exact original bytes.
    expect(ls.keys()).toContain(`${QA_PREFIX}${SAVE_KEY_PREFIX}slot-1`);
    expect(ls.getItem(playerSlotKey)).toBe(JSON.stringify(makeSnapshot('玩家旧档')));

    // Every key the QA run created or probed lives in the QA namespace.
    for (const key of ls.keys()) {
      if (key === playerSlotKey) continue; // Pre-existing player key, never touched.
      expect(key.startsWith(QA_PREFIX)).toBe(true);
    }
  });

  it('the availability probe also stays inside the QA namespace', () => {
    const ls = memoryLocalStorage();
    resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    // The probe is written and removed inside the prefix; no engine probe key
    // may ever appear at the player level.
    expect(ls.keys()).not.toContain(`${SAVE_KEY_PREFIX}probe`);
    for (const key of ls.keys()) {
      expect(key.startsWith(QA_PREFIX)).toBe(true);
    }
  });

  it('settings load/save round-trips inside the QA namespace', () => {
    const ls = memoryLocalStorage();
    ls.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_GAME_SETTINGS, volume: 2 }));
    const { storage } = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    expect(storage).not.toBeNull();
    if (storage === null) return;

    // The player settings must be invisible to the QA run: defaults load.
    const loaded = loadGameSettings(storage);
    expect(loaded.volume).toBe(DEFAULT_GAME_SETTINGS.volume);

    const adjusted = { ...DEFAULT_GAME_SETTINGS, volume: 7 };
    expect(saveGameSettings(storage, adjusted)).toBe(true);
    expect(ls.keys()).toContain(`${QA_PREFIX}${SETTINGS_STORAGE_KEY}`);
    expect(ls.getItem(SETTINGS_STORAGE_KEY)).toBe(JSON.stringify({ ...DEFAULT_GAME_SETTINGS, volume: 2 }));
    expect(loadGameSettings(storage).volume).toBe(7); // Round-trip inside the prefix.
  });

  it('QA reads never see a player slot and QA deletes never remove player keys', () => {
    const ls = memoryLocalStorage();
    const playerSlotKey = `${SAVE_KEY_PREFIX}slot-2`;
    const playerBytes = JSON.stringify(makeSnapshot('玩家档二'));
    ls.setItem(playerSlotKey, playerBytes);
    const { storage } = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    if (storage === null) {
      expect.unreachable('qa storage should be available');
      return;
    }

    const read = readSaveSlot(storage, 'slot-2');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe('empty'); // The player save is invisible.

    const deleted = deleteSaveSlot(storage, 'slot-2');
    expect(deleted.ok).toBe(true);
    expect(ls.getItem(playerSlotKey)).toBe(playerBytes); // Still exactly there.
  });

  it('two QA runs with different ids never share a namespace', () => {
    const ls = memoryLocalStorage();
    const first = resolveGameStorage({ dev: true, search: '?qa=run-one', openLocalStorage: () => ls });
    const second = resolveGameStorage({ dev: true, search: '?qa=run-two', openLocalStorage: () => ls });
    if (first.storage === null || second.storage === null) {
      expect.unreachable('both qa storages should be available');
      return;
    }
    expect(writeSaveSlot(first.storage, 'slot-1', makeSnapshot('一号运行')).ok).toBe(true);
    const read = readSaveSlot(second.storage, 'slot-1');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe('empty');
  });
});

describe('Round270 normal mode stays byte-identical', () => {
  it('no qa query keeps the engine keys and full slot behaviour', () => {
    const ls = memoryLocalStorage();
    const resolution = resolveGameStorage({ dev: true, search: '?other=1', openLocalStorage: () => ls });
    expect(resolution.mode).toBe('normal');
    expect(resolution.qaRunId).toBeNull();
    if (resolution.storage === null) {
      expect.unreachable('normal storage should be available');
      return;
    }
    expect(writeSaveSlot(resolution.storage, 'slot-3', makeSnapshot('普通玩家')).ok).toBe(true);
    expect(ls.keys()).toContain(`${SAVE_KEY_PREFIX}slot-3`); // Exact engine key.
    expect(ls.keys().some((key) => key.startsWith('wuxia-rpg.qa.'))).toBe(false);

    const listing = listSaveSlots(resolution.storage);
    expect(listing.ok).toBe(true);
    if (listing.ok) expect(listing.slots.find((slot) => slot.slotId === 'slot-3')?.state).toBe('ok');
  });

  it('an empty search string is a normal run', () => {
    const resolution = resolveGameStorage({ dev: true, search: '', openLocalStorage: () => memoryLocalStorage() });
    expect(resolution.mode).toBe('normal');
    expect(resolution.storage).not.toBeNull();
  });
});

describe('Round270 refusal rules (never fall back to the player namespace)', () => {
  const refusedCases: [string, string][] = [
    ['uppercase id', '?qa=Journey-20261004'],
    ['too short', '?qa=ab'],
    ['too long', `?qa=${'a'.repeat(49)}`],
    ['illegal characters', '?qa=a_b'],
    ['leading digit', '?qa=1abc'],
    ['empty value', '?qa='],
    ['multiple qa entries', '?qa=first-run&qa=second-run'],
    ['production build with a valid id', '?qa=journey-20261004'],
  ];

  for (const [label, search] of refusedCases) {
    it(`${label} refuses storage with a readable reason`, () => {
      const dev = label !== 'production build with a valid id';
      const resolution = resolveGameStorage({ dev, search, openLocalStorage: () => memoryLocalStorage() });
      expect(resolution.mode).toBe('refused');
      expect(resolution.storage).toBeNull(); // No storage — never the player keys.
      expect(resolution.message).toBeTruthy();
    });
  }

  it('production without a qa query stays a normal run', () => {
    const resolution = resolveGameStorage({ dev: false, search: '', openLocalStorage: () => memoryLocalStorage() });
    expect(resolution.mode).toBe('normal');
    expect(resolution.storage).not.toBeNull();
  });

  it('a refusal never mutated any localStorage key', () => {
    const ls = memoryLocalStorage();
    resolveGameStorage({ dev: true, search: '?qa=BAD_ID', openLocalStorage: () => ls });
    expect(ls.keys()).toEqual([]); // Not even a probe: refusal happens first.
  });
});

describe('Round270 inaccessible storage degrades to null, not to player keys', () => {
  it('a throwing localStorage accessor yields null storage in qa mode', () => {
    const resolution = resolveGameStorage({
      dev: true,
      search: `?qa=${RUN_ID}`,
      openLocalStorage: () => {
        throw new Error('private mode');
      },
    });
    expect(resolution.mode).toBe('qa');
    expect(resolution.storage).toBeNull();
  });

  it('a localStorage that rejects writes fails the probe and yields null (qa and normal)', () => {
    const rejecting: BrowserStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    const qa = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => rejecting });
    expect(qa.mode).toBe('qa');
    expect(qa.storage).toBeNull();
    const normal = resolveGameStorage({ dev: true, search: '', openLocalStorage: () => rejecting });
    expect(normal.mode).toBe('normal');
    expect(normal.storage).toBeNull();
  });
});

describe('Round270 slot labels remain shared with the engine protocol', () => {
  it('the three fixed slots keep their labels for QA listings', () => {
    const ls = memoryLocalStorage();
    const { storage } = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    if (storage === null) {
      expect.unreachable('qa storage should be available');
      return;
    }
    for (const slotId of ['slot-1', 'slot-2', 'slot-3'] as const) {
      expect(writeSaveSlot(storage, slotId, makeSnapshot(`角色${SAVE_SLOT_LABELS[slotId]}`)).ok).toBe(true);
    }
    const listing = listSaveSlots(storage);
    expect(listing.ok).toBe(true);
    if (listing.ok) {
      expect(listing.slots.every((slot) => slot.state === 'ok')).toBe(true);
      expect(ls.keys().every((key) => key.startsWith(QA_PREFIX))).toBe(true);
    }
  });
});
