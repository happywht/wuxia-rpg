/**
 * Round 270 QA checkpoint envelope: export wraps an already-saved slot's
 * parsed snapshot untouched behind v1 metadata; the defensive parser holds
 * uploaded files to the same schema as a normal save; imports target QA
 * slots only, require an explicit (default-cancel) confirm when the target
 * holds bytes, and commit through the regular engine write protocol so the
 * normal title Continue path reads them back. All on memory adapters.
 */
import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY_PREFIX,
  type SaveSnapshotV1,
  type SaveStorage,
  createMemorySaveStorage,
  listSaveSlots,
  readSaveSlot,
  writeSaveSlot,
} from '../src/engine/save-system';
import {
  QA_CHECKPOINT_FORMAT,
  QA_CHECKPOINT_MAX_BYTES,
  QA_CHECKPOINT_VERSION,
  commitQaImport,
  exportQaSlotSnapshot,
  isValidQaMetadataId,
  parseQaCheckpointEnvelope,
  planQaImport,
  qaImportNeedsConfirmation,
} from '../src/game/qa-checkpoint';
import { type BrowserStorageLike, qaStorageKeyPrefix, resolveGameStorage } from '../src/game/game-storage';

const RUN_ID = 'journey-20261004';
const EXPORTED_AT = '2026-10-04T09:30:00.000Z';

const makeSnapshot = (displayName: string, level: number, savedAt: string): SaveSnapshotV1 => ({
  protocolVersion: 1,
  savedAt,
  displayName,
  profileId: 'profile.round270',
  mapResourceId: 'map.round270',
  playerPosition: { col: 1, row: 2 },
  player: {
    level,
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
  social: { morality: 0, renown: 0, factionRenown: [], relationships: [], npcKnowledge: [] },
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
  dialogueVariables: [],
});

const snapshot = makeSnapshot('QA开局侠', 4, '2026-10-04T08:00:00.000Z');

/** Snapshot another QA run exported and this run wants to import. */
const imported = makeSnapshot('导入检查点侠', 6, '2026-10-03T12:00:00.000Z');

/** Storage with one normally saved slot-1 (the export fixture). */
function storageWithSavedSlot(): SaveStorage & { dump(): ReadonlyMap<string, string> } {
  const storage = createMemorySaveStorage();
  const written = writeSaveSlot(storage, 'slot-1', snapshot);
  expect(written.ok).toBe(true);
  return storage;
}

describe('Round270 candidate/stage metadata bounds', () => {
  it('accepts bounded word/dot/hyphen ids and rejects the rest', () => {
    expect(isValidQaMetadataId('round-270')).toBe(true);
    expect(isValidQaMetadataId('stage1-opening')).toBe(true);
    expect(isValidQaMetadataId('v270.1')).toBe(true);
    expect(isValidQaMetadataId('  padded  ')).toBe(true); // Trimmed then checked.
    expect(isValidQaMetadataId('')).toBe(false);
    expect(isValidQaMetadataId('   ')).toBe(false);
    expect(isValidQaMetadataId('.hidden')).toBe(false); // Dot first.
    expect(isValidQaMetadataId('-dash')).toBe(false); // Hyphen first.
    expect(isValidQaMetadataId('a'.repeat(49))).toBe(false);
    expect(isValidQaMetadataId('候选 270')).toBe(false); // Space inside / non-word.
  });
});

describe('Round270 export wraps an already-saved slot untouched', () => {
  it('builds the v1 envelope from the slot through the read protocol', () => {
    const storage = storageWithSavedSlot();
    const result = exportQaSlotSnapshot(storage, {
      runId: RUN_ID,
      candidate: 'round-270',
      stage: 'stage1-opening',
      slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.format).toBe(QA_CHECKPOINT_FORMAT);
    expect(result.envelope.version).toBe(QA_CHECKPOINT_VERSION);
    expect(result.envelope.qaRun).toBe(RUN_ID);
    expect(result.envelope.candidate).toBe('round-270');
    expect(result.envelope.stage).toBe('stage1-opening');
    expect(result.envelope.exportedAt).toBe(EXPORTED_AT);
    expect(result.envelope.sourceSlotId).toBe('slot-1');
    expect(result.envelope.snapshot).toEqual(snapshot); // Payload carried verbatim.
  });

  it('an empty slot refuses the export', () => {
    const result = exportQaSlotSnapshot(createMemorySaveStorage(), {
      runId: RUN_ID, candidate: 'round-270', stage: 'stage1-opening', slotId: 'slot-2',
      now: () => new Date(EXPORTED_AT),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('空');
  });

  it('a corrupt slot refuses the export with the readable protocol error', () => {
    const storage = createMemorySaveStorage();
    storage.write(`${SAVE_KEY_PREFIX}slot-3`, 'not-json{{{');
    const result = exportQaSlotSnapshot(storage, {
      runId: RUN_ID, candidate: 'round-270', stage: 'stage1-opening', slotId: 'slot-3',
      now: () => new Date(EXPORTED_AT),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('无法解析');
  });

  it('a faulting storage refuses the export instead of inventing a snapshot', () => {
    const faulting: SaveStorage = {
      read() { throw new Error('quota'); },
      write() {}, remove() {},
    };
    const result = exportQaSlotSnapshot(faulting, {
      runId: RUN_ID, candidate: 'round-270', stage: 'stage1-opening', slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('不可用');
  });

  it('invalid run id / candidate / stage refuse before any read', () => {
    const storage = storageWithSavedSlot();
    const bad = exportQaSlotSnapshot(storage, {
      runId: 'BAD', candidate: 'round-270', stage: 'stage1', slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(bad.ok).toBe(false);
    const badCandidate = exportQaSlotSnapshot(storage, {
      runId: RUN_ID, candidate: '', stage: 'stage1', slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(badCandidate.ok).toBe(false);
    const badStage = exportQaSlotSnapshot(storage, {
      runId: RUN_ID, candidate: 'round-270', stage: 'x'.repeat(60), slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(badStage.ok).toBe(false);
  });
});

describe('Round270 defensive envelope parsing', () => {
  const buildEnvelope = (): Record<string, unknown> => {
    const storage = storageWithSavedSlot();
    const result = exportQaSlotSnapshot(storage, {
      runId: RUN_ID, candidate: 'round-270', stage: 'stage1-opening', slotId: 'slot-1',
      now: () => new Date(EXPORTED_AT),
    });
    expect(result.ok).toBe(true);
    return result.ok ? (JSON.parse(JSON.stringify(result.envelope)) as Record<string, unknown>) : {};
  };

  it('requires canonical UTC ISO timestamps, not Date.parse guesses or normalized impossible dates', () => {
    for (const exportedAt of ['2026', '10/04/2026', '2026-02-30T08:00:00.000Z', '2026-10-04T08:00:00+08:00']) {
      expect(parseQaCheckpointEnvelope({ ...buildEnvelope(), exportedAt }).ok).toBe(false);
    }
    expect(parseQaCheckpointEnvelope(buildEnvelope()).ok).toBe(true);
  });

  it('round-trips a built envelope through JSON', () => {
    const raw = buildEnvelope();
    const parsed = parseQaCheckpointEnvelope(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.qaRun).toBe(RUN_ID);
      expect(parsed.envelope.stage).toBe('stage1-opening');
      expect(parsed.envelope.sourceSlotId).toBe('slot-1');
      expect(parsed.envelope.snapshot).toEqual(snapshot);
    }
  });

  it('refuses non-objects, wrong format and wrong versions', () => {
    for (const raw of [null, 'text', 42, [], true]) {
      expect(parseQaCheckpointEnvelope(raw).ok).toBe(false);
    }
    const wrongFormat = { ...buildEnvelope(), format: 'something-else' };
    expect(parseQaCheckpointEnvelope(wrongFormat).ok).toBe(false);
    const wrongVersion = { ...buildEnvelope(), version: 2 };
    const versionResult = parseQaCheckpointEnvelope(wrongVersion);
    expect(versionResult.ok).toBe(false);
    if (!versionResult.ok) expect(versionResult.message).toContain('不受支持');
  });

  it('refuses each violated metadata bound with a named error', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['uppercase qaRun', { qaRun: 'Journey' }, 'qaRun'],
      ['empty candidate', { candidate: '' }, 'candidate'],
      ['overlong stage', { stage: 's'.repeat(60) }, 'stage'],
      ['non-ISO exportedAt', { exportedAt: 'yesterday' }, 'exportedAt'],
      ['invalid sourceSlotId', { sourceSlotId: 'slot-9' }, 'sourceSlotId'],
    ];
    for (const [label, patch, field] of cases) {
      const result = parseQaCheckpointEnvelope({ ...buildEnvelope(), ...patch });
      expect(result.ok, label).toBe(false);
      if (!result.ok) {
        expect(result.errors.join('\n'), label).toContain(field);
      }
    }
  });

  it('holds the payload to the regular save protocol', () => {
    const corrupt = { ...buildEnvelope(), snapshot: { protocolVersion: 1, player: null } };
    const result = parseQaCheckpointEnvelope(corrupt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('存档不合规');

    const unsupported = { ...buildEnvelope(), snapshot: { ...snapshot, protocolVersion: 99 } };
    const versionResult = parseQaCheckpointEnvelope(unsupported);
    expect(versionResult.ok).toBe(false);
  });
});

describe('Round270 import plan and commit', () => {
  it('cross-run copies require explicit review even into an empty QA slot', () => {
    expect(qaImportNeedsConfirmation({ action: 'write' }, RUN_ID, 'branch-escort')).toBe(true);
    expect(qaImportNeedsConfirmation({ action: 'write' }, RUN_ID, RUN_ID)).toBe(false);
    expect(qaImportNeedsConfirmation({ action: 'confirm', existing: null }, RUN_ID, RUN_ID)).toBe(true);
    expect(qaImportNeedsConfirmation({ action: 'refuse', message: 'unavailable' }, RUN_ID, 'branch-repair')).toBe(false);
  });
  it('an empty target slot plans a direct write', () => {
    const plan = planQaImport(createMemorySaveStorage(), 'slot-2');
    expect(plan.action).toBe('write');
  });

  it('an occupied target slot requires an explicit confirm and names the resident', () => {
    const storage = storageWithSavedSlot();
    const plan = planQaImport(storage, 'slot-1');
    expect(plan.action).toBe('confirm');
    if (plan.action === 'confirm') {
      expect(plan.existing).toContain('QA开局侠');
      expect(plan.existing).toContain('Lv.4');
    }
  });

  it('corrupt resident bytes also require the confirm (with a null summary)', () => {
    const storage = createMemorySaveStorage();
    storage.write(`${SAVE_KEY_PREFIX}slot-2`, 'junk');
    const plan = planQaImport(storage, 'slot-2');
    expect(plan.action).toBe('confirm');
    if (plan.action === 'confirm') expect(plan.existing).toBeNull();
  });

  it('a faulting storage refuses the import plan', () => {
    const faulting: SaveStorage = {
      read() { throw new Error('quota'); },
      write() {}, remove() {},
    };
    const plan = planQaImport(faulting, 'slot-1');
    expect(plan.action).toBe('refuse');
    if (plan.action === 'refuse') expect(plan.message).toContain('不可用');
  });

  it('cancel keeps the resident bytes exactly; confirm commits the imported snapshot', () => {
    const storage = storageWithSavedSlot();
    const residentBytes = storage.dump().get(`${SAVE_KEY_PREFIX}slot-1`);

    // Cancelled confirmation: nothing commits, bytes untouched.
    const plan = planQaImport(storage, 'slot-1');
    expect(plan.action).toBe('confirm');
    expect(storage.dump().get(`${SAVE_KEY_PREFIX}slot-1`)).toBe(residentBytes);

    // Explicit confirm: the commit replaces the slot through the engine write.
    const committed = commitQaImport(storage, 'slot-1', imported);
    expect(committed.ok).toBe(true);
    const read = readSaveSlot(storage, 'slot-1');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.snapshot).toEqual(imported);
  });

  it('a faulting write refuses and leaves the resident bytes untouched', () => {
    const memory = storageWithSavedSlot();
    const residentBytes = memory.dump().get(`${SAVE_KEY_PREFIX}slot-1`);
    const faulting: SaveStorage = {
      read: (key) => memory.read(key),
      write() { throw new Error('quota'); },
      remove: (key) => memory.remove(key),
    };
    const committed = commitQaImport(faulting, 'slot-1', imported);
    expect(committed.ok).toBe(false);
    if (!committed.ok) expect(committed.message).toContain('不可用');
    expect(memory.dump().get(`${SAVE_KEY_PREFIX}slot-1`)).toBe(residentBytes);
  });

  it('a committed import appears in the regular slot listing (normal Continue path)', () => {
    const storage = createMemorySaveStorage();
    expect(commitQaImport(storage, 'slot-3', imported).ok).toBe(true);
    const listing = listSaveSlots(storage);
    expect(listing.ok).toBe(true);
    if (listing.ok) {
      const slot = listing.slots.find((entry) => entry.slotId === 'slot-3');
      expect(slot?.state).toBe('ok');
      expect(slot?.displayName).toBe('导入检查点侠');
      expect(slot?.level).toBe(6);
    }
  });
});

describe('Round270 end-to-end: import lands only in the QA namespace', () => {
  it('an imported checkpoint writes exactly one QA-prefixed slot key', () => {
    const ls: BrowserStorageLike & { keys: () => string[] } = (() => {
      const store = new Map<string, string>();
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
    })();
    ls.setItem(`${SAVE_KEY_PREFIX}slot-1`, JSON.stringify(makeSnapshot('玩家一号档', 2, '2026-10-01T00:00:00.000Z')));
    const before = new Set(ls.keys());

    const resolution = resolveGameStorage({ dev: true, search: `?qa=${RUN_ID}`, openLocalStorage: () => ls });
    expect(resolution.mode).toBe('qa');
    if (resolution.storage === null) {
      expect.unreachable('qa storage should be available');
      return;
    }

    const plan = planQaImport(resolution.storage, 'slot-2');
    expect(plan.action).toBe('write'); // QA slot-2 is empty even though the player has slot-1.
    const committed = commitQaImport(resolution.storage, 'slot-2', imported);
    expect(committed.ok).toBe(true);

    const added = ls.keys().filter((key) => !before.has(key));
    expect(added).toEqual([`${qaStorageKeyPrefix(RUN_ID)}${SAVE_KEY_PREFIX}slot-2`]);
    expect(ls.getItem(`${SAVE_KEY_PREFIX}slot-1`)).toContain('玩家一号档'); // Untouched.
    expect(QA_CHECKPOINT_MAX_BYTES).toBeGreaterThan(JSON.stringify(snapshot).length); // Bound sanity.
  });
});
