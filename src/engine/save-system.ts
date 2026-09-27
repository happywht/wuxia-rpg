/**
 * Round 09 save protocol: versioned pure-data snapshots, defensive parsing,
 * slot-oriented storage adapters and lossless run-state capture/restore.
 *
 * The module knows the *shape* of a save only — every world value inside a
 * snapshot came from the data-driven systems and is restored through their
 * regular engines, so no world content lives here (see docs/ARCHITECTURE.md
 * and docs/SAVES.md).
 *
 * Layers, each independently testable and free of Phaser:
 *
 * 1. {@link SaveSnapshotV1} — the wire format. Maps/Sets are serialized as
 *    JSON-safe entry arrays; derived values (effective attributes, equipment
 *    bonus totals, vital *maxima*) are deliberately NOT stored — they are
 *    recomputed from the base values plus the current data on restore, so a
 *    data update that changes a formula never resurrects stale numbers.
 * 2. {@link parseSaveSnapshot} — defensive re-parse of untrusted JSON with
 *    per-field readable errors and range checks mirroring the engine
 *    protocols (attribute bounds, social scalar ranges, vital consistency).
 * 3. {@link SaveStorage} — a tiny synchronous key/value adapter. Browser
 *    localStorage is optional (private modes throw); tests inject memory or
 *    faulting adapters, so nothing here touches real user data.
 * 4. Slot API — {@link listSaveSlots} / {@link readSaveSlot} /
 *    {@link writeSaveSlot} / {@link deleteSaveSlot} over three fixed slots.
 *    Writes serialize first and fail atomically: a refused write (quota,
 *    unavailable storage) leaves the previous slot content untouched.
 * 5. {@link planSnapshotRestore} — cross-reference preflight against the
 *    *current* loaded world. A dangling character profile, a different map
 *    resource or an unloadable player position refuses the whole save
 *    (fatal); dangling secondary ids (items, quests, encounters, shops, NPC
 *    relationships) drop exactly those entries with readable warnings, which
 *    mirrors the smallest-unit isolation philosophy of the data pipeline.
 * 6. {@link captureSaveSnapshot} / {@link restoreRunState} — lossless
 *    round-trip between live engine runtime objects and the wire format.
 *    Equipment restores through the regular equip path, so bonuses and vital
 *    maxima reconcile exactly like in-game equipping.
 *
 * Cross-slot migrations from older protocol versions are intentionally not
 * implemented yet (v1 is the first format); the version check refuses
 * unknown versions with a readable message instead of guessing.
 */

import {
  ATTRIBUTE_IDS,
  type AttributeId,
  type CharacterProfileData,
  type CharacterState,
  applyEquipmentBonuses,
  computeVitalMaxima,
  createCharacterState,
} from './character-progression';
import {
  type AssembledShop,
  EQUIPMENT_SLOT_IDS,
  type InventoryState,
  type ItemRecordData,
  type ShopStockRuntime,
  UNLIMITED_STOCK,
  createShopStockRuntime,
  equipItem,
} from './item-system';
import {
  type QuestData,
  type QuestJournal,
  type QuestStatus,
  createQuestJournal,
} from './quest-system';
import {
  type SocialState,
  FACTION_RENOWN_RANGE,
  MORALITY_RANGE,
  RENOWN_RANGE,
  RELATIONSHIP_RANGE,
} from './social-state';
import type { FactionMembership } from './faction-system';
import {
  DEFAULT_WORLD_SEED,
  WORLD_SEED_MAX,
  WORLD_SEED_MIN,
  isWorldSeed,
} from './climate-system';

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

/** Current save protocol version; stored in every snapshot. */
export const SAVE_PROTOCOL_VERSION = 1;

/** The three fixed local save slots (summary labels stay in the UI layer). */
export const SAVE_SLOT_IDS = ['slot-1', 'slot-2', 'slot-3'] as const;

export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

export function isSaveSlotId(value: string): value is SaveSlotId {
  return (SAVE_SLOT_IDS as readonly string[]).includes(value);
}

/** Storage key prefix for save slots; slot keys are `${prefix}${slotId}`. */
export const SAVE_KEY_PREFIX = 'wuxia-rpg.save.';

/** Display-name protocol: trimmed length between 1 and this bound. */
export const DISPLAY_NAME_MAX_LENGTH = 24;

// ---------------------------------------------------------------------------
// Wire format (v1)
// ---------------------------------------------------------------------------

/** JSON-safe entry array form of a Map<K, V> (K must be a string id). */
export interface IdEntry<T> {
  id: string;
  value: T;
}

/** Player-side numbers that cannot be recomputed from data. */
export interface SavePlayerData {
  level: number;
  experience: number;
  /** Base attributes (level-up growth); effective values are recomputed. */
  baseAttributes: Record<AttributeId, number>;
  /** Current vital values; maxima recompute from the profile formulas. */
  healthCurrent: number;
  qiCurrent: number;
  /** Martial-art ids the character has mastered (validated on restore). */
  martialArtIds: string[];
  /** Current school and master; absent in older v1 saves means unaffiliated. */
  factionMembership: FactionMembership | null;
}

export interface SaveStackData {
  itemId: string;
  quantity: number;
}

/** Everything the Round 06+ run state needs to come back identically. */
export interface SaveSnapshotV1 {
  protocolVersion: typeof SAVE_PROTOCOL_VERSION;
  /** ISO 8601 timestamp of the capture (displayed in slot summaries). */
  savedAt: string;
  /** Player-chosen display name (never used as a content id). */
  displayName: string;
  /** Character template id the run started from. */
  profileId: string;
  /** Map resource id the run takes place on. */
  mapResourceId: string;
  playerPosition: { col: number; row: number };
  player: SavePlayerData;
  inventory: {
    currency: number;
    capacity: number;
    stacks: SaveStackData[];
    equipped: Partial<Record<string, string>>;
  };
  /** Per-shop remaining stock; only finite entries need storing. */
  shopStocks: { shopId: string; stock: SaveStackData[] }[];
  quests: {
    states: {
      questId: string;
      status: QuestStatus;
      objectiveCounts: IdEntry<number>[];
    }[];
    trackedQuestId: string | null;
  };
  social: {
    morality: number;
    renown: number;
    factionRenown: IdEntry<number>[];
    relationships: IdEntry<number>[];
  };
  /** One-shot encounter ids already beaten this run. */
  completedEncounters: string[];
  /** One-shot data event ids already triggered; absent in older v1 saves. */
  completedRegionalEvents: string[];
  /** Discovered encyclopedia nodes; absent from Round 10 and earlier v1 saves. */
  knownKnowledgeNodeIds: string[];
  /**
   * In-game minutes elapsed since the calendar start; absent in Round 13 and
   * earlier v1 saves (the run then resumes at the calendar's start moment).
   * Only the counter is stored — year/month/day are always re-derived from
   * the current calendar data, so changing month lengths never contradicts
   * a save.
   */
  elapsedGameMinutes: number;
  /**
   * 32-bit world seed the daily weather derives from; absent in Round 14 and
   * earlier v1 saves (the run then uses the stable default seed, so old
   * worlds keep deterministic weather across every future load).
   */
  worldSeed: number;
  /** Active companion; missing in older v1 saves means no companion. */
  activeCompanionId: string | null;
}

// ---------------------------------------------------------------------------
// Defensive parsing
// ---------------------------------------------------------------------------

export type SaveParseFailureReason = 'corrupt' | 'unsupported-version';

export type SaveParseResult =
  | { ok: true; snapshot: SaveSnapshotV1 }
  | {
      ok: false;
      reason: SaveParseFailureReason;
      message: string;
      /** Per-field readable problems (corrupt only). */
      errors: string[];
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Non-empty string or null. */
function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Finite integer in [min, max] or null. */
function requireIntegerInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** Array of non-empty unique strings or null. */
function requireUniqueNonEmptyStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = requireNonEmptyString(entry);
    if (id === null || seen.has(id)) {
      return null;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Defensive re-parse of untrusted save JSON. Every field is read from the
 * white-listed shape only (unknown extra fields are ignored for forward
 * compatibility); every number carries its engine protocol range; vital
 * values must be self-consistent (current ≤ snapshot max). Any problem
 * refuses the whole snapshot with readable errors — a partially loaded save
 * must never reach the runtime.
 */
export function parseSaveSnapshot(raw: unknown): SaveParseResult {
  const errors: string[] = [];

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      reason: 'corrupt',
      message: '存档应为 JSON 对象',
      errors: ['存档应为 JSON 对象'],
    };
  }

  const version = raw.protocolVersion;
  if (version !== SAVE_PROTOCOL_VERSION) {
    const message =
      typeof version === 'number'
        ? `存档协议版本 ${version} 不受支持（当前支持版本 ${SAVE_PROTOCOL_VERSION}）`
        : `存档缺少有效的 protocolVersion（当前支持版本 ${SAVE_PROTOCOL_VERSION}）`;
    return { ok: false, reason: 'unsupported-version', message, errors: [message] };
  }

  const savedAt = requireNonEmptyString(raw.savedAt);
  if (savedAt === null || Number.isNaN(Date.parse(savedAt))) {
    errors.push('savedAt：应为有效 ISO 时间字符串');
  }
  const displayNameRaw = typeof raw.displayName === 'string' ? raw.displayName.trim() : null;
  if (displayNameRaw === null || displayNameRaw.length === 0 || displayNameRaw.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.push(`displayName：应为去空格后 1–${DISPLAY_NAME_MAX_LENGTH} 个字符的字符串`);
  }
  const profileId = requireNonEmptyString(raw.profileId);
  if (profileId === null) {
    errors.push('profileId：应为非空字符串');
  }
  const mapResourceId = requireNonEmptyString(raw.mapResourceId);
  if (mapResourceId === null) {
    errors.push('mapResourceId：应为非空字符串');
  }

  const positionSource = isPlainObject(raw.playerPosition) ? raw.playerPosition : null;
  const playerCol = positionSource === null ? null : requireIntegerInRange(positionSource.col, 0, 999);
  const playerRow = positionSource === null ? null : requireIntegerInRange(positionSource.row, 0, 999);
  if (playerCol === null || playerRow === null) {
    errors.push('playerPosition：应含 col/row（0–999 整数）');
  }

  const playerSource = isPlainObject(raw.player) ? raw.player : null;
  const level = playerSource === null ? null : requireIntegerInRange(playerSource.level, 1, 99);
  if (level === null) {
    errors.push('player.level：应为 1–99 的整数');
  }
  const experience =
    playerSource === null
      ? null
      : requireIntegerInRange(playerSource.experience, 0, Number.MAX_SAFE_INTEGER);
  if (experience === null) {
    errors.push('player.experience：应为非负整数');
  }

  const attributesSource = playerSource === null ? null : playerSource.baseAttributes;
  const baseAttributes = isPlainObject(attributesSource) ? attributesSource : null;
  if (baseAttributes === null) {
    errors.push('player.baseAttributes：应为五项属性的 1–999 整数映射');
  } else {
    for (const attributeId of ATTRIBUTE_IDS) {
      if (requireIntegerInRange(baseAttributes[attributeId], 1, 999) === null) {
        errors.push(`player.baseAttributes.${attributeId}：应为 1–999 的整数`);
      }
    }
  }

  const healthCurrent =
    playerSource === null
      ? null
      : requireIntegerInRange(playerSource.healthCurrent, 0, 999_999);
  if (healthCurrent === null) {
    errors.push('player.healthCurrent：应为 0–999999 的整数');
  }
  const qiCurrent = playerSource === null ? null : requireIntegerInRange(playerSource.qiCurrent, 0, 999_999);
  if (qiCurrent === null) {
    errors.push('player.qiCurrent：应为 0–999999 的整数');
  }

  const martialArtIds = playerSource === null ? null : requireUniqueNonEmptyStringArray(playerSource.martialArtIds);
  if (martialArtIds === null) {
    errors.push('player.martialArtIds：应为非重复的非空字符串数组');
  }
  let factionMembership: FactionMembership | null = null;
  if (playerSource !== null && playerSource.factionMembership !== undefined && playerSource.factionMembership !== null) {
    const membershipSource = isPlainObject(playerSource.factionMembership)
      ? playerSource.factionMembership
      : null;
    const factionId = membershipSource === null ? null : requireNonEmptyString(membershipSource.factionId);
    const masterNpcId = membershipSource === null ? null : requireNonEmptyString(membershipSource.masterNpcId);
    if (factionId === null || masterNpcId === null) {
      errors.push('player.factionMembership：应为含 factionId/masterNpcId 的门派师承，或 null');
    } else {
      factionMembership = { factionId, masterNpcId };
    }
  }

  const inventorySource = isPlainObject(raw.inventory) ? raw.inventory : null;
  const currency =
    inventorySource === null
      ? null
      : requireIntegerInRange(inventorySource.currency, 0, 999_999_999);
  if (currency === null) {
    errors.push('inventory.currency：应为 0–999999999 的整数');
  }
  const capacity = inventorySource === null ? null : requireIntegerInRange(inventorySource.capacity, 1, 99);
  if (capacity === null) {
    errors.push('inventory.capacity：应为 1–99 的整数');
  }

  const stacks: SaveStackData[] = [];
  const stackIds = new Set<string>();
  if (inventorySource === null || !Array.isArray(inventorySource.stacks)) {
    errors.push('inventory.stacks：应为物品堆数组（itemId 非空字符串、quantity 1–999 整数）');
  } else {
    for (const [index, entry] of inventorySource.stacks.entries()) {
      const label = `inventory.stacks[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const itemId = source === null ? null : requireNonEmptyString(source.itemId);
      const quantity = source === null ? null : requireIntegerInRange(source.quantity, 1, 999);
      if (itemId === null || quantity === null) {
        errors.push(`${label}：应含 itemId（非空字符串）与 quantity（1–999 整数）`);
        continue;
      }
      if (stackIds.has(itemId)) {
        errors.push(`${label}：物品 "${itemId}" 重复出现（每件物品只应有一堆）`);
        continue;
      }
      stackIds.add(itemId);
      stacks.push({ itemId, quantity });
    }
  }

  const equipped: Partial<Record<string, string>> = {};
  if (inventorySource === null || !isPlainObject(inventorySource.equipped)) {
    errors.push('inventory.equipped：应为槽位→物品 id 的对象');
  } else {
    for (const [slot, itemId] of Object.entries(inventorySource.equipped)) {
      const id = requireNonEmptyString(itemId);
      if (id === null) {
        errors.push(`inventory.equipped.${slot}：应为非空字符串`);
        continue;
      }
      equipped[slot] = id;
    }
  }

  const shopStocks: { shopId: string; stock: SaveStackData[] }[] = [];
  const seenShops = new Set<string>();
  if (!Array.isArray(raw.shopStocks)) {
    errors.push('shopStocks：应为商店库存数组');
  } else {
    for (const [index, entry] of raw.shopStocks.entries()) {
      const label = `shopStocks[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const shopId = source === null ? null : requireNonEmptyString(source.shopId);
      if (shopId === null) {
        errors.push(`${label}.shopId：应为非空字符串`);
        continue;
      }
      if (seenShops.has(shopId)) {
        errors.push(`${label}.shopId：商店 "${shopId}" 重复出现`);
        continue;
      }
      seenShops.add(shopId);
      if (!Array.isArray(source?.stock)) {
        errors.push(`${label}.stock：应为库存条目数组`);
        continue;
      }
      const stock: SaveStackData[] = [];
      const seenItems = new Set<string>();
      let stockOk = true;
      for (const [stockIndex, stockEntry] of source.stock.entries()) {
        const stockSource = isPlainObject(stockEntry) ? stockEntry : null;
        const itemId = stockSource === null ? null : requireNonEmptyString(stockSource.itemId);
        // -1 = unlimited stock (UNLIMITED_STOCK); otherwise a non-negative count.
        const quantity =
          stockSource === null
            ? null
            : stockSource.quantity === UNLIMITED_STOCK
              ? UNLIMITED_STOCK
              : requireIntegerInRange(stockSource.quantity, 0, 999_999);
        if (itemId === null || quantity === null) {
          errors.push(
            `${label}.stock[${stockIndex}]：应含 itemId（非空字符串）与 quantity（-1 表示无限，否则 0–999999 整数）`,
          );
          stockOk = false;
          continue;
        }
        if (seenItems.has(itemId)) {
          errors.push(`${label}.stock[${stockIndex}]：物品 "${itemId}" 重复出现`);
          stockOk = false;
          continue;
        }
        seenItems.add(itemId);
        stock.push({ itemId, quantity });
      }
      if (stockOk) {
        shopStocks.push({ shopId, stock });
      }
    }
  }

  const QUEST_STATUSES: readonly QuestStatus[] = ['locked', 'offered', 'active', 'completed', 'failed'];
  const questStates: { questId: string; status: QuestStatus; objectiveCounts: IdEntry<number>[] }[] = [];
  const seenQuests = new Set<string>();
  const questsSource = isPlainObject(raw.quests) ? raw.quests : null;
  if (questsSource === null || !Array.isArray(questsSource.states)) {
    errors.push('quests.states：应为任务状态数组');
  } else {
    for (const [index, entry] of questsSource.states.entries()) {
      const label = `quests.states[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const questId = source === null ? null : requireNonEmptyString(source.questId);
      const status =
        source !== null && QUEST_STATUSES.includes(source.status as QuestStatus)
          ? (source.status as QuestStatus)
          : null;
      if (questId === null || status === null) {
        errors.push(`${label}：应含 questId（非空字符串）与 status（locked/offered/active/completed/failed）`);
        continue;
      }
      if (seenQuests.has(questId)) {
        errors.push(`${label}.questId：任务 "${questId}" 重复出现`);
        continue;
      }
      seenQuests.add(questId);
      const counts: IdEntry<number>[] = [];
      const seenObjectives = new Set<string>();
      if (!Array.isArray(source?.objectiveCounts)) {
        errors.push(`${label}.objectiveCounts：应为条目数组（id 非空字符串、value 非负整数）`);
        continue;
      }
      for (const countEntry of source.objectiveCounts) {
        const countSource = isPlainObject(countEntry) ? countEntry : null;
        const objectiveId = countSource === null ? null : requireNonEmptyString(countSource.id);
        const value =
          countSource === null
            ? null
            : requireIntegerInRange(countSource.value, 0, Number.MAX_SAFE_INTEGER);
        if (objectiveId === null || value === null) {
          errors.push(`${label}.objectiveCounts：应含 id（非空字符串）与 value（非负整数）`);
          continue;
        }
        if (seenObjectives.has(objectiveId)) {
          errors.push(`${label}.objectiveCounts：目标 "${objectiveId}" 重复出现`);
          continue;
        }
        seenObjectives.add(objectiveId);
        counts.push({ id: objectiveId, value });
      }
      questStates.push({ questId, status, objectiveCounts: counts });
    }
  }
  const trackedQuestRaw = questsSource === null ? undefined : questsSource.trackedQuestId;
  let trackedQuestId: string | null = null;
  if (trackedQuestRaw === null) {
    trackedQuestId = null;
  } else {
    const tracked = requireNonEmptyString(trackedQuestRaw);
    if (tracked === null) {
      errors.push('quests.trackedQuestId：应为非空字符串或 null');
    } else {
      trackedQuestId = tracked;
    }
  }

  const socialSource = isPlainObject(raw.social) ? raw.social : null;
  const morality =
    socialSource === null
      ? null
      : requireIntegerInRange(socialSource.morality, MORALITY_RANGE.min, MORALITY_RANGE.max);
  if (morality === null) {
    errors.push(`social.morality：应为 ${MORALITY_RANGE.min}–${MORALITY_RANGE.max} 的整数`);
  }
  const renown =
    socialSource === null ? null : requireIntegerInRange(socialSource.renown, RENOWN_RANGE.min, RENOWN_RANGE.max);
  if (renown === null) {
    errors.push(`social.renown：应为 ${RENOWN_RANGE.min}–${RENOWN_RANGE.max} 的整数`);
  }
  const factionRenown: IdEntry<number>[] = [];
  let factionRenownValid = true;
  const factionRenownRaw = socialSource?.factionRenown;
  if (socialSource === null || (factionRenownRaw !== undefined && !Array.isArray(factionRenownRaw))) {
    factionRenownValid = false;
    errors.push('social.factionRenown：应为门派 id/value 条目数组');
  } else if (Array.isArray(factionRenownRaw)) {
    const seenFactionRenown = new Set<string>();
    for (const [index, entry] of factionRenownRaw.entries()) {
      const label = `social.factionRenown[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const factionId = source === null ? null : requireNonEmptyString(source.id);
      const value = source === null
        ? null
        : requireIntegerInRange(source.value, FACTION_RENOWN_RANGE.min, FACTION_RENOWN_RANGE.max);
      if (factionId === null || value === null) {
        factionRenownValid = false;
        errors.push(`${label}：应含 id（非空字符串）与 value（${FACTION_RENOWN_RANGE.min}–${FACTION_RENOWN_RANGE.max} 整数）`);
        continue;
      }
      if (seenFactionRenown.has(factionId)) {
        factionRenownValid = false;
        errors.push(`${label}.id：门派 "${factionId}" 的声望重复出现`);
        continue;
      }
      seenFactionRenown.add(factionId);
      factionRenown.push({ id: factionId, value });
    }
  }
  const relationships: IdEntry<number>[] = [];
  const seenRelationships = new Set<string>();
  if (socialSource === null || !Array.isArray(socialSource.relationships)) {
    errors.push('social.relationships：应为关系条目数组');
  } else {
    for (const [index, entry] of socialSource.relationships.entries()) {
      const label = `social.relationships[${index}]`;
      const source = isPlainObject(entry) ? entry : null;
      const npcId = source === null ? null : requireNonEmptyString(source.id);
      const value =
        source === null
          ? null
          : requireIntegerInRange(source.value, RELATIONSHIP_RANGE.min, RELATIONSHIP_RANGE.max);
      if (npcId === null || value === null) {
        errors.push(`${label}：应含 id（非空字符串）与 value（${RELATIONSHIP_RANGE.min}–${RELATIONSHIP_RANGE.max} 整数）`);
        continue;
      }
      if (seenRelationships.has(npcId)) {
        errors.push(`${label}.id：人物 "${npcId}" 的关系重复出现`);
        continue;
      }
      seenRelationships.add(npcId);
      relationships.push({ id: npcId, value });
    }
  }

  const completedEncounters = requireUniqueNonEmptyStringArray(raw.completedEncounters);
  if (completedEncounters === null) {
    errors.push('completedEncounters：应为非重复的非空字符串数组');
  }
  const completedRegionalEvents = raw.completedRegionalEvents === undefined
    ? []
    : requireUniqueNonEmptyStringArray(raw.completedRegionalEvents);
  if (completedRegionalEvents === null) {
    errors.push('completedRegionalEvents：应为非重复的非空字符串数组');
  }
  const knownKnowledgeNodeIds = raw.knownKnowledgeNodeIds === undefined
    ? []
    : requireUniqueNonEmptyStringArray(raw.knownKnowledgeNodeIds);
  if (knownKnowledgeNodeIds === null) {
    errors.push('knownKnowledgeNodeIds：应为非重复的非空字符串数组');
  }
  const elapsedGameMinutes = raw.elapsedGameMinutes === undefined
    ? 0
    : requireIntegerInRange(raw.elapsedGameMinutes, 0, Number.MAX_SAFE_INTEGER);
  if (elapsedGameMinutes === null) {
    errors.push('elapsedGameMinutes：应为非负整数');
  }
  const worldSeed = raw.worldSeed === undefined
    ? DEFAULT_WORLD_SEED
    : requireIntegerInRange(raw.worldSeed, WORLD_SEED_MIN, WORLD_SEED_MAX);
  if (worldSeed === null) {
    errors.push(`worldSeed：应为 ${WORLD_SEED_MIN}–${WORLD_SEED_MAX} 的整数（32 位世界种子）`);
  }
  const activeCompanionId = raw.activeCompanionId === undefined || raw.activeCompanionId === null
    ? null
    : requireNonEmptyString(raw.activeCompanionId);
  if (raw.activeCompanionId !== undefined && raw.activeCompanionId !== null && activeCompanionId === null) {
    errors.push('activeCompanionId：应为非空伙伴 id 或 null');
  }

  if (
    errors.length > 0 ||
    savedAt === null ||
    displayNameRaw === null ||
    profileId === null ||
    mapResourceId === null ||
    playerCol === null ||
    playerRow === null ||
    level === null ||
    experience === null ||
    baseAttributes === null ||
      healthCurrent === null ||
      qiCurrent === null ||
      martialArtIds === null ||
    currency === null ||
    capacity === null ||
    morality === null ||
    renown === null ||
    !factionRenownValid ||
    completedEncounters === null ||
    completedRegionalEvents === null ||
    knownKnowledgeNodeIds === null ||
    elapsedGameMinutes === null ||
    worldSeed === null
  ) {
    return { ok: false, reason: 'corrupt', message: '存档结构不合规', errors };
  }

  const snapshot: SaveSnapshotV1 = {
    protocolVersion: SAVE_PROTOCOL_VERSION,
    savedAt,
    displayName: displayNameRaw,
    profileId,
    mapResourceId,
    playerPosition: { col: playerCol, row: playerRow },
    player: {
      level,
      experience,
      baseAttributes: baseAttributes as Record<AttributeId, number>,
      healthCurrent,
      qiCurrent,
      martialArtIds,
      factionMembership,
    },
    inventory: { currency, capacity, stacks, equipped },
    shopStocks,
    quests: { states: questStates, trackedQuestId },
    social: { morality, renown, factionRenown, relationships },
    completedEncounters,
    completedRegionalEvents,
    knownKnowledgeNodeIds,
    elapsedGameMinutes,
    worldSeed,
    activeCompanionId,
  };
  return { ok: true, snapshot };
}

// ---------------------------------------------------------------------------
// Storage adapters
// ---------------------------------------------------------------------------

/**
 * Minimal synchronous key/value storage. Implementations signal "key
 * missing" with null; *environment* failures (quota, disabled storage) throw
 * and are converted by the slot API into structured results, never into a
 * half-written slot.
 */
export interface SaveStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * Browser localStorage adapter, or null when the environment disallows
 * storage access (some private modes throw on the bare property access —
 * probing once up front keeps the game playable without saves).
 */
export function createBrowserSaveStorage(): SaveStorage | null {
  try {
    const probeKey = `${SAVE_KEY_PREFIX}probe`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
  } catch {
    return null;
  }
  return {
    read(key) {
      const value = window.localStorage.getItem(key);
      return value === null ? null : value;
    },
    write(key, value) {
      window.localStorage.setItem(key, value); // May throw (quota/disabled).
    },
    remove(key) {
      window.localStorage.removeItem(key);
    },
  };
}

/** In-memory adapter for tests and headless harnesses (isolated by default). */
export function createMemorySaveStorage(
  initial?: ReadonlyMap<string, string>,
): SaveStorage & { dump(): ReadonlyMap<string, string> } {
  const store = new Map<string, string>(initial ?? new Map());
  return {
    read(key) {
      return store.get(key) ?? null;
    },
    write(key, value) {
      store.set(key, value);
    },
    remove(key) {
      store.delete(key);
    },
    dump() {
      return store;
    },
  };
}

// ---------------------------------------------------------------------------
// Slot API
// ---------------------------------------------------------------------------

export type SaveWriteFailureReason = 'unavailable' | 'quota' | 'serialize' | 'invalid';

export type SaveWriteResult =
  | { ok: true; slotId: SaveSlotId; savedAt: string }
  | { ok: false; reason: SaveWriteFailureReason; message: string };

export type SaveReadFailureReason = 'unavailable' | 'empty' | 'corrupt' | 'unsupported-version';

export type SaveReadResult =
  | { ok: true; snapshot: SaveSnapshotV1 }
  | { ok: false; reason: SaveReadFailureReason; message: string; errors: string[] };

export type SaveDeleteResult =
  | { ok: true; slotId: SaveSlotId }
  | { ok: false; reason: 'unavailable'; message: string };

/** Human-readable slot summary for menu lists; no world data required. */
export interface SaveSlotSummary {
  slotId: SaveSlotId;
  /** `empty` = no save; `ok` = readable save; `error` = present but unusable. */
  state: 'empty' | 'ok' | 'error';
  displayName: string | null;
  level: number | null;
  savedAt: string | null;
  /** Present iff state === 'error' (readable, e.g. version mismatch). */
  error: string | null;
}

export interface SaveSlotListing {
  ok: boolean;
  /** Present iff ok === false: storage is unavailable in this environment. */
  message: string | null;
  slots: SaveSlotSummary[];
}

function slotKey(slotId: SaveSlotId): string {
  return `${SAVE_KEY_PREFIX}${slotId}`;
}

/**
 * Summaries of all three slots. A broken slot never breaks the listing: it
 * shows up as `error` with a readable message, the others stay usable.
 */
export function listSaveSlots(storage: SaveStorage): SaveSlotListing {
  const slots: SaveSlotSummary[] = [];
  for (const slotId of SAVE_SLOT_IDS) {
    let text: string | null;
    try {
      text = storage.read(slotKey(slotId));
    } catch {
      return { ok: false, message: '浏览器本地存储当前不可用，无法读取存档列表', slots: [] };
    }
    if (text === null) {
      slots.push({ slotId, state: 'empty', displayName: null, level: null, savedAt: null, error: null });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      slots.push({
        slotId,
        state: 'error',
        displayName: null,
        level: null,
        savedAt: null,
        error: `存档 JSON 无法解析（${reason}）`,
      });
      continue;
    }
    const parsed = parseSaveSnapshot(raw);
    if (!parsed.ok) {
      slots.push({ slotId, state: 'error', displayName: null, level: null, savedAt: null, error: parsed.message });
      continue;
    }
    slots.push({
      slotId,
      state: 'ok',
      displayName: parsed.snapshot.displayName,
      level: parsed.snapshot.player.level,
      savedAt: parsed.snapshot.savedAt,
      error: null,
    });
  }
  return { ok: true, message: null, slots };
}

/**
 * Reads and parses one slot. Storage/environment failures become structured
 * results — the caller keeps the current run untouched on any failure.
 */
export function readSaveSlot(storage: SaveStorage, slotId: SaveSlotId): SaveReadResult {
  let text: string | null;
  try {
    text = storage.read(slotKey(slotId));
  } catch {
    return { ok: false, reason: 'unavailable', message: '浏览器本地存储当前不可用，无法读取存档', errors: [] };
  }
  if (text === null) {
    return { ok: false, reason: 'empty', message: '该存档槽为空', errors: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'corrupt', message: `存档 JSON 无法解析（${reason}）`, errors: [] };
  }
  const parsed = parseSaveSnapshot(raw);
  if (parsed.ok) {
    return { ok: true, snapshot: parsed.snapshot };
  }
  return { ok: false, reason: parsed.reason, message: parsed.message, errors: parsed.errors };
}

/**
 * Serializes and writes one snapshot. Serialization happens before any
 * storage mutation, and a thrown write (quota/disabled) leaves the previous
 * slot content untouched — failed saves never destroy the old save.
 */
export function writeSaveSlot(
  storage: SaveStorage,
  slotId: SaveSlotId,
  snapshot: SaveSnapshotV1,
): SaveWriteResult {
  const validation = parseSaveSnapshot(snapshot);
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'invalid',
      message: `存档未通过协议校验：${validation.errors.join('；')}`,
    };
  }
  let text: string;
  try {
    text = JSON.stringify(validation.snapshot);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'serialize', message: `存档序列化失败（${reason}）` };
  }
  try {
    storage.write(slotKey(slotId), text);
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    const reason = quota ? '浏览器本地存储空间不足' : '浏览器本地存储当前不可用，无法写入存档';
    return {
      ok: false,
      reason: quota ? 'quota' : 'unavailable',
      message: `${reason}（${error instanceof Error ? error.message : String(error)}）`,
    };
  }
  return { ok: true, slotId, savedAt: snapshot.savedAt };
}

/** Removes one slot; deleting an already-empty slot is a success. */
export function deleteSaveSlot(storage: SaveStorage, slotId: SaveSlotId): SaveDeleteResult {
  try {
    storage.remove(slotKey(slotId));
  } catch {
    return { ok: false, reason: 'unavailable', message: '浏览器本地存储当前不可用，无法删除存档' };
  }
  return { ok: true, slotId };
}

// ---------------------------------------------------------------------------
// Capture: runtime objects → snapshot
// ---------------------------------------------------------------------------

/** Live run state handed over by the scene when the player saves. */
export interface CaptureInput {
  displayName: string;
  mapResourceId: string;
  playerCol: number;
  playerRow: number;
  character: Readonly<CharacterState>;
  inventory: Readonly<InventoryState>;
  shopStocks: ReadonlyMap<string, ReadonlyMap<string, number>>;
  journal: Readonly<QuestJournal>;
  social: Readonly<SocialState>;
  completedEncounters: ReadonlySet<string>;
  completedRegionalEvents: ReadonlySet<string>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  /** In-game minutes elapsed since the calendar start (GameClock counter). */
  elapsedGameMinutes: number;
  /** 32-bit world seed the daily weather derives from (Round 15+). */
  worldSeed: number;
  /** Optional for older capture callers; omitted means no active companion. */
  activeCompanionId?: string | null;
  /** Absent in older callers/snapshots means currently unaffiliated. */
  factionMembership?: FactionMembership | null;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/** Captures the pure-data snapshot of a live run (Map/Set → JSON arrays). */
export function captureSaveSnapshot(input: CaptureInput): SaveSnapshotV1 {
  const now = input.now ?? (() => new Date());
  return {
    protocolVersion: SAVE_PROTOCOL_VERSION,
    savedAt: now().toISOString(),
    displayName: input.displayName.trim().slice(0, DISPLAY_NAME_MAX_LENGTH),
    profileId: input.character.profileId,
    mapResourceId: input.mapResourceId,
    playerPosition: { col: input.playerCol, row: input.playerRow },
    player: {
      level: input.character.level,
      experience: input.character.experience,
      baseAttributes: { ...input.character.baseAttributes },
      healthCurrent: input.character.health.current,
      qiCurrent: input.character.qi.current,
      martialArtIds: [...input.character.martialArtIds],
      factionMembership: input.factionMembership === undefined || input.factionMembership === null
        ? null
        : { ...input.factionMembership },
    },
    inventory: {
      currency: input.inventory.currency,
      capacity: input.inventory.capacity,
      stacks: input.inventory.stacks.map((stack) => ({ ...stack })),
      equipped: { ...input.inventory.equipped },
    },
    shopStocks: [...input.shopStocks.entries()].map(([shopId, stock]) => ({
      shopId,
      stock: [...stock.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    })),
    quests: {
      states: [...input.journal.states.values()].map((state) => ({
        questId: state.questId,
        status: state.status,
        objectiveCounts: [...state.objectiveCounts.entries()].map(([id, value]) => ({ id, value })),
      })),
      trackedQuestId: input.journal.trackedQuestId,
    },
    social: {
      morality: input.social.morality,
      renown: input.social.renown,
      factionRenown: [...input.social.factionRenown.entries()].map(([id, value]) => ({ id, value })),
      relationships: [...input.social.relationships.entries()].map(([id, value]) => ({ id, value })),
    },
    completedEncounters: [...input.completedEncounters],
    completedRegionalEvents: [...input.completedRegionalEvents],
    knownKnowledgeNodeIds: [...input.knownKnowledgeNodeIds],
    elapsedGameMinutes: Math.max(0, Math.floor(input.elapsedGameMinutes)),
    worldSeed: isWorldSeed(input.worldSeed) ? input.worldSeed : DEFAULT_WORLD_SEED,
    activeCompanionId: input.activeCompanionId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Restore preflight: snapshot × current world
// ---------------------------------------------------------------------------

/** Ids and geometry of the currently loaded world a snapshot must fit into. */
export interface SaveWorldReferences {
  profileIds: ReadonlySet<string>;
  /** Current profile limits let restores safely reconcile changed data. */
  profileRecords?: ReadonlyMap<string, CharacterProfileData>;
  /** Resource id of the map the run would load onto. */
  mapResourceId: string;
  /** Inside-bounds AND walkable cell test (walls/borders refuse). */
  isWalkableCell: (col: number, row: number) => boolean;
  /** True while an NPC or still-active encounter occupies the cell. */
  isCellOccupied: (col: number, row: number) => boolean;
  /** Additional map geometries/occupancy for cross-region saves (Round 10). */
  maps?: ReadonlyMap<string, {
    isWalkableCell: (col: number, row: number) => boolean;
    isCellOccupied: (col: number, row: number) => boolean;
  }>;
  itemIds: ReadonlySet<string>;
  /** Item category, slot and stack limit for load-time sanitization. */
  itemRecords?: ReadonlyMap<string, ItemRecordData>;
  /** Indexed martial arts (faction-checked) the character may keep. */
  martialArtIds: ReadonlySet<string>;
  questIds: ReadonlySet<string>;
  /** questId → valid objective ids (for per-objective warnings). */
  questObjectiveIds: ReadonlyMap<string, ReadonlySet<string>>;
  encounterIds: ReadonlySet<string>;
  shopIds: ReadonlySet<string>;
  /** Current shelves, used to reject saved stock for items no longer sold. */
  shopRecords?: ReadonlyMap<string, AssembledShop>;
  /** Current objective caps, used to clamp progress on changed quest data. */
  questRecords?: ReadonlyMap<string, QuestData>;
  npcIds: ReadonlySet<string>;
  /** Current valid event ids; stale completion flags are dropped on load. */
  regionalEventIds?: ReadonlySet<string>;
  /** Current knowledge graph ids and immutable public baseline. */
  knowledgeNodeIds?: ReadonlySet<string>;
  defaultKnowledgeNodeIds?: ReadonlySet<string>;
  /** Current valid faction ids; missing saved membership is a soft reference. */
  factionIds?: ReadonlySet<string>;
  /** Current faction id → NPC ids permitted to serve as that player's master. */
  factionMentorNpcIds?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Current valid companion ids; deleted entries are softly cleared. */
  companionIds?: ReadonlySet<string>;
}

export type RestorePlanResult =
  | { ok: true; snapshot: SaveSnapshotV1; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Cross-resource preflight of a parsed snapshot against the current world.
 * Fatal problems (dangling profile, different map resource, unloadable
 * player position) refuse the entire save — the caller keeps the running
 * game or menu state untouched. Dangling secondary references drop exactly
 * their entry with a readable warning, matching the data pipeline's
 * smallest-unit isolation. The returned snapshot is a sanitized copy; the
 * input is never mutated.
 */
export function planSnapshotRestore(
  snapshot: SaveSnapshotV1,
  refs: SaveWorldReferences,
): RestorePlanResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!refs.profileIds.has(snapshot.profileId)) {
    errors.push(`存档引用的角色模板 "${snapshot.profileId}" 在当前资料中不存在或已被禁用`);
  }
  const profile = refs.profileRecords?.get(snapshot.profileId);
  if (profile !== undefined && snapshot.player.level > profile.maxLevel) {
    errors.push(
      `存档等级 ${snapshot.player.level} 超过当前角色模板的上限 ${profile.maxLevel}`,
    );
  }
  const mapReferences = refs.maps?.get(snapshot.mapResourceId) ??
    (snapshot.mapResourceId === refs.mapResourceId
      ? { isWalkableCell: refs.isWalkableCell, isCellOccupied: refs.isCellOccupied }
      : undefined);
  if (mapReferences === undefined) {
    errors.push(`存档引用的地图资源 "${snapshot.mapResourceId}" 在当前世界中不存在或已失效`);
  } else if (!mapReferences.isWalkableCell(snapshot.playerPosition.col, snapshot.playerPosition.row)) {
    errors.push(
      `存档位置 (${snapshot.playerPosition.col}, ${snapshot.playerPosition.row}) 不在地图 "${snapshot.mapResourceId}" 的可通行区域内`,
    );
  } else if (mapReferences.isCellOccupied(snapshot.playerPosition.col, snapshot.playerPosition.row)) {
    errors.push(
      `存档位置 (${snapshot.playerPosition.col}, ${snapshot.playerPosition.row}) 被当前世界的人物或敌人占据`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const martialArtIds = snapshot.player.martialArtIds.filter((artId) => {
    if (refs.martialArtIds.has(artId)) {
      return true;
    }
    warnings.push(`已掌握的武学 "${artId}" 在当前资料中不存在或已被禁用，已遗忘`);
    return false;
  });

  let factionMembership = snapshot.player.factionMembership === undefined
    ? null
    : snapshot.player.factionMembership;
  if (factionMembership !== null && refs.factionIds !== undefined && !refs.factionIds.has(factionMembership.factionId)) {
    warnings.push(`所属门派 "${factionMembership.factionId}" 在当前资料中不存在，已恢复为无门派`);
    factionMembership = null;
  }
  if (factionMembership !== null && refs.factionMentorNpcIds !== undefined) {
    const mentors = refs.factionMentorNpcIds.get(factionMembership.factionId);
    if (mentors === undefined || !mentors.has(factionMembership.masterNpcId)) {
      warnings.push(`师父 "${factionMembership.masterNpcId}" 已不再是当前门派的有效导师，已恢复为无门派`);
      factionMembership = null;
    }
  }

  const baseAttributes = { ...snapshot.player.baseAttributes };
  if (profile !== undefined) {
    for (const attributeId of ATTRIBUTE_IDS) {
      if (baseAttributes[attributeId] > profile.attributeCap) {
        warnings.push(
          `基础属性 ${attributeId} 超过当前模板上限 ${profile.attributeCap}，已按上限修正`,
        );
        baseAttributes[attributeId] = profile.attributeCap;
      }
    }
  }

  let inventoryCapacity = snapshot.inventory.capacity;
  if (profile !== undefined && inventoryCapacity > profile.inventoryCapacity) {
    warnings.push(
      `背包容量 ${inventoryCapacity} 超过当前模板容量 ${profile.inventoryCapacity}，已按当前资料修正`,
    );
    inventoryCapacity = profile.inventoryCapacity;
  }

  const stacks = snapshot.inventory.stacks
    .filter((stack) => {
      if (refs.itemIds.has(stack.itemId)) {
        return true;
      }
      warnings.push(`背包物品 "${stack.itemId}" 在当前资料中不存在，已丢弃该堆`);
      return false;
    })
    .map((stack) => {
      const item = refs.itemRecords?.get(stack.itemId);
      if (item === undefined || stack.quantity <= item.stackLimit) {
        return stack;
      }
      warnings.push(
        `背包物品 "${stack.itemId}" 数量超过当前堆叠上限 ${item.stackLimit}，已按上限修正`,
      );
      return { ...stack, quantity: item.stackLimit };
    });
  if (stacks.length > inventoryCapacity) {
    warnings.push(
      `背包物品堆数（${stacks.length}）超过容量 ${inventoryCapacity}，保留前 ${inventoryCapacity} 堆`,
    );
    stacks.length = inventoryCapacity;
  }

  const remainingItemIds = new Set(stacks.map((stack) => stack.itemId));
  const equipped: Partial<Record<string, string>> = {};
  for (const [slot, itemIdEntry] of Object.entries(snapshot.inventory.equipped)) {
    const itemId = itemIdEntry; // Partial entries are string | undefined.
    if (itemId === undefined) {
      continue; // Defensive: parse guarantees non-empty strings.
    }
    if (!(EQUIPMENT_SLOT_IDS as readonly string[]).includes(slot)) {
      warnings.push(`装备槽 "${slot}" 不是受支持的槽位，已忽略`);
      continue;
    }
    if (!refs.itemIds.has(itemId)) {
      warnings.push(`装备槽 ${slot} 引用的物品 "${itemId}" 在当前资料中不存在，已卸下`);
      continue;
    }
    if (!remainingItemIds.has(itemId)) {
      warnings.push(`装备槽 ${slot} 引用的物品 "${itemId}" 不在存档背包中，已卸下`);
      continue;
    }
    const item = refs.itemRecords?.get(itemId);
    if (item !== undefined && (item.category !== 'equipment' || item.equipment?.slot !== slot)) {
      warnings.push(`装备槽 ${slot} 与物品 "${itemId}" 的当前装备类型不匹配，已卸下`);
      continue;
    }
    equipped[slot] = itemId;
  }

  const shopStocks = snapshot.shopStocks.flatMap((shop) => {
    if (!refs.shopIds.has(shop.shopId)) {
      warnings.push(`商店 "${shop.shopId}" 在当前资料中不存在，忽略其库存`);
      return [];
    }
    const shopRecord = refs.shopRecords?.get(shop.shopId);
    const shelfItemIds = shopRecord === undefined
      ? null
      : new Set(shopRecord.stock.map((entry) => entry.itemId));
    const stock = shop.stock.filter((entry) => {
      if (refs.itemIds.has(entry.itemId)) {
        if (shelfItemIds === null || shelfItemIds.has(entry.itemId)) {
          return true;
        }
        warnings.push(`商店 "${shop.shopId}" 当前不再出售物品 "${entry.itemId}"，忽略其库存`);
        return false;
      }
      warnings.push(`商店 "${shop.shopId}" 的库存物品 "${entry.itemId}" 在当前资料中不存在，已剔除`);
      return false;
    });
    return [{ shopId: shop.shopId, stock }];
  });

  const questStates = snapshot.quests.states.flatMap((state) => {
    if (!refs.questIds.has(state.questId)) {
      warnings.push(`任务 "${state.questId}" 在当前资料中不存在，忽略其进度`);
      return [];
    }
    const objectiveIds = refs.questObjectiveIds.get(state.questId);
    const questRecord = refs.questRecords?.get(state.questId);
    const objectiveLimits = new Map(
      (questRecord?.objectives ?? []).map((objective) => [objective.id, objective.requiredCount]),
    );
    const objectiveCounts = state.objectiveCounts.flatMap((entry) => {
      if (objectiveIds !== undefined && !objectiveIds.has(entry.id)) {
        warnings.push(`任务 "${state.questId}" 的目标 "${entry.id}" 在当前资料中不存在，忽略该项进度`);
        return [];
      }
      const requiredCount = objectiveLimits.get(entry.id);
      if (requiredCount === undefined || entry.value <= requiredCount) {
        return [entry];
      }
      warnings.push(
        `任务 "${state.questId}" 的目标 "${entry.id}" 进度超过当前上限 ${requiredCount}，已按上限修正`,
      );
      return [{ ...entry, value: requiredCount }];
    });
    return [{ ...state, objectiveCounts }];
  });
  let trackedQuestId = snapshot.quests.trackedQuestId;
  if (trackedQuestId !== null) {
    const trackedState = questStates.find((state) => state.questId === trackedQuestId);
    if (trackedState?.status !== 'active') {
      warnings.push(`跟踪中的任务 "${trackedQuestId}" 当前不是进行中任务，取消跟踪`);
      trackedQuestId = null;
    }
  }

  const relationships = snapshot.social.relationships.filter((entry) => {
    if (refs.npcIds.has(entry.id)) {
      return true;
    }
    warnings.push(`与 "${entry.id}" 的关系值在当前资料中无对应人物，已忽略`);
    return false;
  });
  const factionRenown = snapshot.social.factionRenown.filter((entry) => {
    if (refs.factionIds === undefined || refs.factionIds.has(entry.id)) return true;
    warnings.push(`门派声望所属门派 "${entry.id}" 在当前资料中不存在，已忽略`);
    return false;
  });

  const completedEncounters = snapshot.completedEncounters.filter((encounterId) => {
    if (refs.encounterIds.has(encounterId)) {
      return true;
    }
    warnings.push(`已完成的遭遇 "${encounterId}" 在当前资料中不存在，已忽略`);
    return false;
  });
  const completedRegionalEvents = snapshot.completedRegionalEvents.filter((eventId) => {
    if (refs.regionalEventIds?.has(eventId) ?? true) return true;
    warnings.push(`区域事件 "${eventId}" 在当前资料中不存在，忽略其完成状态`);
    return false;
  });
  const knownKnowledgeNodeIds: string[] = [];
  const knownKnowledgeSeen = new Set<string>();
  for (const nodeId of refs.defaultKnowledgeNodeIds ?? []) {
    if ((refs.knowledgeNodeIds?.has(nodeId) ?? true) && !knownKnowledgeSeen.has(nodeId)) {
      knownKnowledgeSeen.add(nodeId);
      knownKnowledgeNodeIds.push(nodeId);
    }
  }
  for (const nodeId of snapshot.knownKnowledgeNodeIds) {
    if (refs.knowledgeNodeIds?.has(nodeId) ?? true) {
      if (!knownKnowledgeSeen.has(nodeId)) {
        knownKnowledgeSeen.add(nodeId);
        knownKnowledgeNodeIds.push(nodeId);
      }
    } else {
      warnings.push(`已发现的知识条目 "${nodeId}" 在当前图谱中不存在，已忽略`);
    }
  }
  let activeCompanionId = snapshot.activeCompanionId ?? null;
  if (activeCompanionId !== null && refs.companionIds !== undefined && !refs.companionIds.has(activeCompanionId)) {
    warnings.push(`同行伙伴 "${activeCompanionId}" 在当前资料中不存在，已恢复为无伙伴`);
    activeCompanionId = null;
  }

  return {
    ok: true,
    warnings,
    snapshot: {
      ...snapshot,
      player: { ...snapshot.player, baseAttributes, martialArtIds, factionMembership },
      inventory: { ...snapshot.inventory, capacity: inventoryCapacity, stacks, equipped },
      shopStocks,
      quests: { states: questStates, trackedQuestId },
      social: { ...snapshot.social, factionRenown, relationships },
      completedEncounters,
      completedRegionalEvents,
      knownKnowledgeNodeIds,
      activeCompanionId,
    },
  };
}

// ---------------------------------------------------------------------------
// Restore: sanitized snapshot → runtime objects
// ---------------------------------------------------------------------------

/** World datasets restore needs (all already validated by the loaders). */
export interface RestoreRunInput {
  profile: CharacterProfileData;
  items: ReadonlyMap<string, ItemRecordData>;
  quests: ReadonlyMap<string, QuestData>;
  shops: ReadonlyMap<string, AssembledShop>;
  /** Sanitized snapshot from {@link planSnapshotRestore}. */
  snapshot: SaveSnapshotV1;
}

/** Fully constructed fresh runtime objects (no aliasing into the snapshot). */
export interface RestoredRunState {
  character: CharacterState;
  inventory: InventoryState;
  shopStocks: Map<string, ShopStockRuntime>;
  journal: QuestJournal;
  social: SocialState;
  completedEncounters: string[];
  completedRegionalEvents: string[];
  knownKnowledgeNodeIds: string[];
  factionMembership: FactionMembership | null;
  activeCompanionId: string | null;
}

/**
 * Rebuilds every run-state object from a sanitized snapshot, all fresh
 * allocations so a caller can adopt the result atomically (assign every
 * field only after this call succeeded — a refused load never partially
 * mutates the live run).
 *
 * Vital maxima and equipment bonuses recompute from the *current* data
 * formulas (createCharacterState → overwrite base values → re-equip through
 * the regular equip path), then the saved current values clamp into the new
 * maxima — a data update that changes a formula never resurrects stale
 * numbers. Quest objective progress rebuilds against the current quest
 * definitions: objectives the data added start at 0, removed ones drop.
 */
export function restoreRunState(input: RestoreRunInput): RestoredRunState {
  const { profile, items, quests, shops, snapshot } = input;

  const character = createCharacterState(profile);
  character.level = snapshot.player.level;
  character.experience = snapshot.player.experience;
  character.baseAttributes = { ...snapshot.player.baseAttributes };
  character.martialArtIds = [...snapshot.player.martialArtIds];
  applyEquipmentBonuses(character, { attributes: {}, health: 0, qi: 0 });
  const { healthMax, qiMax } = computeVitalMaxima(profile, character.level, character.attributes);
  character.health = {
    current: Math.max(0, Math.min(snapshot.player.healthCurrent, healthMax)),
    max: healthMax,
  };
  character.qi = {
    current: Math.max(0, Math.min(snapshot.player.qiCurrent, qiMax)),
    max: qiMax,
  };

  const inventory: InventoryState = {
    currency: snapshot.inventory.currency,
    capacity: snapshot.inventory.capacity,
    stacks: snapshot.inventory.stacks.map((stack) => ({ ...stack })),
    equipped: {},
  };
  for (const itemId of Object.values(snapshot.inventory.equipped)) {
    const item = itemId === undefined ? undefined : items.get(itemId);
    if (item === undefined) {
      continue; // Defensive: the plan already dropped dangling references.
    }
    equipItem({ inventory, character, profile, items }, item);
  }

  const shopStocks = new Map<string, ShopStockRuntime>();
  for (const shop of shops.values()) {
    shopStocks.set(shop.record.id, createShopStockRuntime(shop));
  }
  for (const savedShop of snapshot.shopStocks) {
    const runtime = shopStocks.get(savedShop.shopId);
    if (runtime === undefined) {
      continue; // Defensive: the plan already dropped unknown shops.
    }
    for (const entry of savedShop.stock) {
      runtime.set(entry.itemId, entry.quantity);
    }
  }

  const journal = createQuestJournal(quests);
  for (const savedState of snapshot.quests.states) {
    const quest = quests.get(savedState.questId);
    const state = journal.states.get(savedState.questId);
    if (quest === undefined || state === undefined) {
      continue; // Defensive: the plan already dropped unknown quests.
    }
    state.status = savedState.status;
    const savedCounts = new Map(savedState.objectiveCounts.map((entry) => [entry.id, entry.value]));
    state.objectiveCounts = new Map(
      quest.objectives.map((objective) => [objective.id, savedCounts.get(objective.id) ?? 0]),
    );
  }
  journal.trackedQuestId = snapshot.quests.trackedQuestId;

  const social: SocialState = {
    morality: snapshot.social.morality,
    renown: snapshot.social.renown,
    factionRenown: new Map(snapshot.social.factionRenown.map((entry) => [entry.id, entry.value])),
    relationships: new Map(snapshot.social.relationships.map((entry) => [entry.id, entry.value])),
  };

  return {
    character,
    inventory,
    shopStocks,
    journal,
    social,
    completedEncounters: [...snapshot.completedEncounters],
    completedRegionalEvents: [...snapshot.completedRegionalEvents],
    knownKnowledgeNodeIds: [...snapshot.knownKnowledgeNodeIds],
    factionMembership: snapshot.player.factionMembership === null
      ? null
      : { ...snapshot.player.factionMembership },
    activeCompanionId: snapshot.activeCompanionId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers for the UI layer
// ---------------------------------------------------------------------------

/**
 * Renders `savedAt` for slot lists: the raw ISO string when unparsable
 * (never throws on hostile saves), otherwise a locale date-time string.
 */
export function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? savedAt : date.toLocaleString();
}

/** Slot labels are presentation, but kept beside the protocol for consistency. */
export const SAVE_SLOT_LABELS: Record<SaveSlotId, string> = {
  'slot-1': '存档一',
  'slot-2': '存档二',
  'slot-3': '存档三',
};
