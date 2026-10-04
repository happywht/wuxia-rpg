/**
 * Round 270 QA checkpoint envelope: pure build/parse/plan logic for the DEV
 * workbench. A checkpoint is *evidence about an already saved slot*, never a
 * way to manufacture progress:
 *
 * - `exportQaSlotSnapshot` reads the slot through the regular engine read
 *   protocol and wraps the parsed snapshot untouched — no live game state,
 *   no synthesized fields.
 * - `parseQaCheckpointEnvelope` defensively re-checks the v1 metadata bounds
 *   and delegates the payload to the regular `parseSaveSnapshot` protocol,
 *   so an imported file is held to exactly the same schema as a normal save.
 * - `planQaImport`/`commitQaImport` write only through the engine slot API
 *   onto the storage the caller passes (the QA-prefixed one), and make an
 *   existing target slot an explicit confirm step with cancel as the default.
 *
 * Every function here is pure over injected storage/now, so the boundary
 * tests run on memory adapters without a browser.
 */

import {
  SAVE_KEY_PREFIX,
  type SaveSlotId,
  type SaveSnapshotV1,
  type SaveStorage,
  type SaveWriteResult,
  isSaveSlotId,
  listSaveSlots,
  parseSaveSnapshot,
  readSaveSlot,
  writeSaveSlot,
} from '../engine/save-system';
import { isValidQaRunId } from './game-storage';

// ---------------------------------------------------------------------------
// Envelope protocol (v1)
// ---------------------------------------------------------------------------

/** Envelope discriminator; a file without this exact string is refused. */
export const QA_CHECKPOINT_FORMAT = 'wuxia-rpg.qa-checkpoint';

/** Envelope protocol version; unknown versions are refused, never guessed. */
export const QA_CHECKPOINT_VERSION = 1;

/** Candidate-version and stage/checkpoint-id bounds (trimmed length). */
export const QA_METADATA_MAX_LENGTH = 48;

/** Identifier shape: word character first, then word chars, dots or hyphens. */
const QA_METADATA_PATTERN = /^[\w][\w.-]*$/;

/** Upload guard for the workbench: 2 MiB is far above any real snapshot. */
export const QA_CHECKPOINT_MAX_BYTES = 2 * 1024 * 1024;

/** Exported checkpoint file: v1 metadata + the untouched parsed snapshot. */
export interface QaCheckpointEnvelopeV1 {
  format: typeof QA_CHECKPOINT_FORMAT;
  version: typeof QA_CHECKPOINT_VERSION;
  /** QA run id the export happened in (`?qa=` value). */
  qaRun: string;
  /** Candidate build/version label chosen at export time. */
  candidate: string;
  /** Stage / checkpoint id within the journey (e.g. `stage1-opening`). */
  stage: string;
  /** ISO 8601 export timestamp. */
  exportedAt: string;
  /** Slot the snapshot was normally saved in and read from. */
  sourceSlotId: SaveSlotId;
  /** Parsed payload from the slot, carried verbatim. */
  snapshot: SaveSnapshotV1;
}

/** True iff `value` is a legal candidate/stage label (trimmed 1–48 chars). */
export function isValidQaMetadataId(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= 1 &&
    trimmed.length <= QA_METADATA_MAX_LENGTH &&
    QA_METADATA_PATTERN.test(trimmed)
  );
}

// ---------------------------------------------------------------------------
// Build (slot read → envelope)
// ---------------------------------------------------------------------------

export interface QaCheckpointExportInput {
  runId: string;
  candidate: string;
  stage: string;
  slotId: SaveSlotId;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export type QaCheckpointExportResult =
  | { ok: true; envelope: QaCheckpointEnvelopeV1 }
  | { ok: false; message: string };

/**
 * Exports one already-saved QA slot as a checkpoint envelope. The snapshot
 * is read through the regular slot protocol — an empty, corrupt or
 * unreadable slot refuses the export; nothing is ever constructed from live
 * state. The parsed snapshot is carried by reference, untouched.
 */
export function exportQaSlotSnapshot(
  storage: SaveStorage,
  input: QaCheckpointExportInput,
): QaCheckpointExportResult {
  if (!isValidQaRunId(input.runId)) {
    return { ok: false, message: `QA 运行标识非法："${input.runId}"` };
  }
  if (!isValidQaMetadataId(input.candidate)) {
    return { ok: false, message: `候选版本非法（1–48 个字符，字母/数字开头，可含点/连字符）："${input.candidate}"` };
  }
  if (!isValidQaMetadataId(input.stage)) {
    return { ok: false, message: `阶段/检查点标识非法（1–48 个字符，字母/数字开头，可含点/连字符）："${input.stage}"` };
  }

  const read = readSaveSlot(storage, input.slotId);
  if (!read.ok) {
    return { ok: false, message: `读取槽位 ${input.slotId} 失败：${read.message}` };
  }
  return {
    ok: true,
    envelope: {
      format: QA_CHECKPOINT_FORMAT,
      version: QA_CHECKPOINT_VERSION,
      qaRun: input.runId,
      candidate: input.candidate.trim(),
      stage: input.stage.trim(),
      exportedAt: (input.now ?? (() => new Date()))().toISOString(),
      sourceSlotId: input.slotId,
      snapshot: read.snapshot,
    },
  };
}

// ---------------------------------------------------------------------------
// Parse (untrusted file → envelope)
// ---------------------------------------------------------------------------

export type QaCheckpointParseResult =
  | { ok: true; envelope: QaCheckpointEnvelopeV1 }
  | { ok: false; message: string; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Defensive re-parse of an untrusted checkpoint file. Metadata bounds are
 * checked here; the payload goes through the regular save protocol, so an
 * imported checkpoint can never smuggle in a save that the game itself
 * would refuse. Any problem refuses the whole file with readable errors.
 */
export function parseQaCheckpointEnvelope(raw: unknown): QaCheckpointParseResult {
  if (!isPlainObject(raw)) {
    return { ok: false, message: '检查点文件应为 JSON 对象', errors: ['检查点文件应为 JSON 对象'] };
  }
  if (raw.format !== QA_CHECKPOINT_FORMAT) {
    return {
      ok: false,
      message: `文件格式标识不符（期望 "${QA_CHECKPOINT_FORMAT}"）`,
      errors: [`format：期望 "${QA_CHECKPOINT_FORMAT}"`],
    };
  }
  if (raw.version !== QA_CHECKPOINT_VERSION) {
    return {
      ok: false,
      message: `检查点版本 ${String(raw.version)} 不受支持（当前支持版本 ${QA_CHECKPOINT_VERSION}）`,
      errors: [`version：期望 ${QA_CHECKPOINT_VERSION}`],
    };
  }

  const errors: string[] = [];
  const qaRun = typeof raw.qaRun === 'string' ? raw.qaRun : '';
  if (!isValidQaRunId(qaRun)) {
    errors.push(`qaRun：应为 ${3}–48 位小写字母开头的 QA 运行标识`);
  }
  const candidate = typeof raw.candidate === 'string' ? raw.candidate : '';
  if (!isValidQaMetadataId(candidate)) {
    errors.push(`candidate：应为 1–${QA_METADATA_MAX_LENGTH} 个字符的候选版本标识`);
  }
  const stage = typeof raw.stage === 'string' ? raw.stage : '';
  if (!isValidQaMetadataId(stage)) {
    errors.push(`stage：应为 1–${QA_METADATA_MAX_LENGTH} 个字符的阶段/检查点标识`);
  }
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt) ||
    Number.isNaN(Date.parse(exportedAt)) || new Date(exportedAt).toISOString() !== exportedAt) {
    errors.push('exportedAt：应为有效 ISO 时间字符串');
  }
  const sourceSlotIdRaw = typeof raw.sourceSlotId === 'string' ? raw.sourceSlotId : '';
  const sourceSlotId = isSaveSlotId(sourceSlotIdRaw) ? sourceSlotIdRaw : null;
  if (sourceSlotId === null) {
    errors.push('sourceSlotId：应为 slot-1/slot-2/slot-3 之一');
  }
  if (errors.length > 0 || sourceSlotId === null) {
    return { ok: false, message: '检查点元数据不合规', errors };
  }

  const parsedSnapshot = parseSaveSnapshot(raw.snapshot);
  if (!parsedSnapshot.ok) {
    return {
      ok: false,
      message: `检查点内含的存档不合规：${parsedSnapshot.message}`,
      errors: parsedSnapshot.errors,
    };
  }
  return {
    ok: true,
    envelope: {
      format: QA_CHECKPOINT_FORMAT,
      version: QA_CHECKPOINT_VERSION,
      qaRun,
      candidate: candidate.trim(),
      stage: stage.trim(),
      exportedAt,
      sourceSlotId,
      snapshot: parsedSnapshot.snapshot,
    },
  };
}

// ---------------------------------------------------------------------------
// Import plan (target slot guard) + commit
// ---------------------------------------------------------------------------

/** What the workbench should do next for one import against one target slot. */
export type QaImportPlan =
  | { action: 'write' }
  | { action: 'confirm'; existing: string | null }
  | { action: 'refuse'; message: string };

/**
 * Guards the import target. An empty (or absent) slot imports directly; any
 * existing bytes — readable save, corrupt junk, anything — require an
 * explicit confirmation whose default is cancel. Storage failures refuse
 * the import; a refused or cancelled plan never writes.
 */
export function planQaImport(storage: SaveStorage, targetSlotId: SaveSlotId): QaImportPlan {
  let raw: string | null;
  try {
    raw = storage.read(`${SAVE_KEY_PREFIX}${targetSlotId}`);
  } catch {
    return { action: 'refuse', message: '浏览器本地存储当前不可用，无法导入' };
  }
  if (raw === null) {
    return { action: 'write' };
  }
  // Existing bytes (readable or not) require an explicit confirm; the label
  // comes from the regular listing when the slot is readable.
  const listing = listSaveSlots(storage);
  const summary = listing.ok
    ? (listing.slots.find((slot) => slot.slotId === targetSlotId) ?? null)
    : null;
  const existingLabel = summary !== null && summary.state === 'ok'
    ? `${summary.displayName ?? '未知侠客'} Lv.${summary.level ?? '?'}（${summary.savedAt ?? '时间未知'}）`
    : null;
  return { action: 'confirm', existing: existingLabel };
}

/**
 * Commits a confirmed import through the regular engine write protocol, so
 * the stored bytes are byte-compatible with a normal save (title Continue
 * reads them back through the normal path — no hidden scene restore).
 */
export function commitQaImport(
  storage: SaveStorage,
  targetSlotId: SaveSlotId,
  snapshot: SaveSnapshotV1,
): SaveWriteResult {
  return writeSaveSlot(storage, targetSlotId, snapshot);
}

/** Cross-run copies are how two independent QA roles fork a real checkpoint. */
export function qaImportNeedsConfirmation(plan: QaImportPlan, sourceRunId: string, targetRunId: string): boolean {
  return plan.action === 'confirm' || (plan.action === 'write' && sourceRunId !== targetRunId);
}
