/**
 * Generic character-progression protocol: canonical attribute ids, defensive
 * parsing of character-profile / faction / martial-art sets, id indexing with
 * cross-reference checks, runtime character state, data-driven experience
 * thresholds and level growth, derived vital maxima and martial-art
 * eligibility.
 *
 * The engine knows the *shape* of the data only — names, labels, curves,
 * growth values, formulas and requirements all come from the parsed JSON, so
 * no world content may live here (see docs/ARCHITECTURE.md).
 *
 * The three schemas under `data/schema/` pin down static structure before
 * these functions run. Parsing re-checks shape defensively and adds the
 * single-file semantics a schema cannot express (max level above the
 * starting level, attribute starts within the cap, proficiency start within
 * its cap). A structurally invalid set is rejected as a unit; once parsing
 * succeeds, the indexing step adds the cross-resource rules (duplicate ids,
 * martial-art faction references) and isolates those failures per entry.
 *
 * Round 05 adds the combat action of a martial art (`combat`: attack/heal,
 * power, qi cost — numbers come from data) and the profile's starting
 * martial-art list, validated per reference by
 * {@link resolveStartingMartialArts} against the indexed arts.
 *
 * Round 06 splits runtime attributes into `baseAttributes` (level-up growth,
 * capped) and `attributes` (effective = base + equipment bonuses, what combat
 * reads), adds `equipmentBonuses` to the state and the profile's starting
 * economy (`startingCurrency`/`inventoryCapacity`/`startingItems` — validated
 * per reference by the item system at assembly time).
 *
 * Runtime state is serialized by the separate, versioned save protocol
 * rather than by this progression engine. Round 13 adds data contracts for
 * faction admission/departure and connects its existing faction-aware art
 * eligibility check to dialogue teaching effects; proficiency progression
 * remains a later feature.
 */

/** Canonical attribute ids (protocol; display names and values stay in data). */
export const ATTRIBUTE_IDS = ['body', 'force', 'agility', 'insight', 'resolve'] as const;

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

/** Complete map over all five canonical attributes. */
export type AttributeMap = Record<AttributeId, number>;

/** Partial map; omitted attributes carry no weight / no requirement. */
export type PartialAttributeMap = Partial<AttributeMap>;

/** Allowed attribute value range (protocol, mirrors the schemas). */
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 999;

function isAttributeId(value: string): value is AttributeId {
  return (ATTRIBUTE_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

/** Coefficients of one derived maximum: base + perLevel×(level−1) + Σ(weight×attribute). */
export interface DerivedStatFormulaData {
  base: number;
  perLevel: number;
  attributeWeights: PartialAttributeMap;
}

export interface CharacterDerivedStatsData {
  health: DerivedStatFormulaData;
  qi: DerivedStatFormulaData;
}

/** Wire format of one character profile inside a character-profiles JSON file. */
export interface CharacterProfileData {
  id: string;
  name: string;
  description: string;
  attributeLabels: Record<AttributeId, string>;
  attributes: AttributeMap;
  startingLevel: number;
  startingExperience: number;
  maxLevel: number;
  attributeCap: number;
  progression: {
    baseExperience: number;
    experiencePerLevel: number;
  };
  growth: AttributeMap;
  derivedStats: CharacterDerivedStatsData;
  /** Martial-art ids the character starts with (validated per reference at
   * assembly time by {@link resolveStartingMartialArts}). */
  startingMartialArtIds: string[];
  /** Starting money for the Round 06 item economy (0 allowed). */
  startingCurrency: number;
  /** Backpack capacity in distinct item stacks (Round 06). */
  inventoryCapacity: number;
  /** Starting item declarations (Round 06); references and quantities are
   * validated per entry at assembly time by the item system. */
  startingItems: StartingItemDeclarationData[];
}

/** Wire format of one `startingItems` entry (Round 06). */
export interface StartingItemDeclarationData {
  itemId: string;
  quantity: number;
}

/** Wire format of a character-profiles JSON file under `data/base/characters/`. */
export interface CharacterProfileSetData {
  profiles: CharacterProfileData[];
}

/** Combat-action kinds (protocol; the concrete numbers stay in data). */
export type CombatActionKind = 'attack' | 'heal';

/** Wire format of a martial art's combat effect (Round 05). */
export interface CombatActionData {
  kind: CombatActionKind;
  /** Raw magnitude: attack damage base or heal amount base. */
  power: number;
  /** Qi spent per use; an action costing more than the current qi is unusable. */
  qiCost: number;
}

export interface FactionAdmissionData {
  minimumLevel?: number;
  minimumAttributes: PartialAttributeMap;
  minimumMorality?: number;
  maximumMorality?: number;
  minimumRenown?: number;
  minimumFactionRenown?: number;
  minimumTeacherRelationship?: number;
  requiredQuestIds: string[];
}

export interface FactionDepartureData {
  allowed: boolean;
  moralityDelta: number;
  renownDelta: number;
  factionRenownDelta: number;
  forgetFactionMartialArts: boolean;
}

/** Wire format of one faction inside a faction-set JSON file. */
export interface FactionData {
  id: string;
  name: string;
  stance: string;
  philosophy: string;
  martialStyle: string;
  /** Valid dialogue speakers who may formally accept a student. */
  mentorNpcIds: string[];
  admission: FactionAdmissionData;
  departure: FactionDepartureData;
}

/** Wire format of a faction-set JSON file under `data/base/factions/`. */
export interface FactionSetData {
  factions: FactionData[];
}

/** Wire format of one martial art inside a martial-arts-set JSON file. */
export interface MartialArtData {
  id: string;
  name: string;
  category: string;
  style: string;
  description: string;
  /** Empty array means the art is open to every faction (and factionless). */
  factionIds: string[];
  requirements: {
    level: number;
    attributes: PartialAttributeMap;
  };
  initialProficiency: number;
  proficiencyCap: number;
  /** Combat use of the art (Round 05): attack/heal, power and qi cost. */
  combat: CombatActionData;
}

/** Wire format of a martial-arts-set JSON file under `data/base/skills/`. */
export interface MartialArtSetData {
  martialArts: MartialArtData[];
}

export type SetParseResult<T> = { ok: true; set: T } | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Defensive parsing helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the value when non-empty, null otherwise (enables TS narrowing). */
function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Returns the value when it is a finite integer inside [min, max]. */
function requireIntegerInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** Reads a complete five-key attribute map. */
function requireAttributeMap(raw: unknown): AttributeMap | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const map = {} as AttributeMap;
  for (const attributeId of ATTRIBUTE_IDS) {
    const value = requireIntegerInRange(source[attributeId], ATTRIBUTE_MIN, ATTRIBUTE_MAX);
    if (value === null) {
      return null;
    }
    map[attributeId] = value;
  }
  return map;
}

/** Reads a complete five-key per-level growth map; zero means no growth. */
function requireGrowthMap(raw: unknown): AttributeMap | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const map = {} as AttributeMap;
  for (const attributeId of ATTRIBUTE_IDS) {
    const value = requireIntegerInRange(source[attributeId], 0, 99);
    if (value === null) {
      return null;
    }
    map[attributeId] = value;
  }
  return map;
}

/** Reads a partial attribute→weight map (values 0–99, protocol keys only). */
function requireAttributeWeightMap(raw: unknown): PartialAttributeMap | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const map: PartialAttributeMap = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isAttributeId(key)) {
      return null;
    }
    const weight = requireIntegerInRange(value, 0, 99);
    if (weight === null) {
      return null;
    }
    map[key] = weight;
  }
  return map;
}

/** Reads a partial attribute→minimum map (values 1–999, protocol keys only). */
function requireAttributeRequirementMap(raw: unknown): PartialAttributeMap | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const map: PartialAttributeMap = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isAttributeId(key)) {
      return null;
    }
    const minimum = requireIntegerInRange(value, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
    if (minimum === null) {
      return null;
    }
    map[key] = minimum;
  }
  return map;
}

/** Reads the attribute display-name map (five non-empty strings). */
function requireAttributeLabelMap(raw: unknown): Record<AttributeId, string> | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const labels = {} as Record<AttributeId, string>;
  for (const attributeId of ATTRIBUTE_IDS) {
    const label = requireNonEmptyString(source[attributeId]);
    if (label === null) {
      return null;
    }
    labels[attributeId] = label;
  }
  return labels;
}

function requireDerivedFormula(raw: unknown): DerivedStatFormulaData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const base = requireIntegerInRange(source.base, 0, Number.MAX_SAFE_INTEGER);
  const perLevel = requireIntegerInRange(source.perLevel, 0, Number.MAX_SAFE_INTEGER);
  const attributeWeights = requireAttributeWeightMap(source.attributeWeights);
  if (base === null || perLevel === null || attributeWeights === null) {
    return null;
  }
  return { base, perLevel, attributeWeights };
}

/** Reads one martial art's combat effect (kind/power/qiCost). */
function requireCombatAction(raw: unknown): CombatActionData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const kind: CombatActionKind | null =
    source.kind === 'attack' || source.kind === 'heal' ? source.kind : null;
  const power = requireIntegerInRange(source.power, 1, 999);
  const qiCost = requireIntegerInRange(source.qiCost, 0, 99);
  if (kind === null || power === null || qiCost === null) {
    return null;
  }
  return { kind, power, qiCost };
}

function requireDerivedStats(raw: unknown): CharacterDerivedStatsData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const health = requireDerivedFormula(source.health);
  const qi = requireDerivedFormula(source.qi);
  return health === null || qi === null ? null : { health, qi };
}

// ---------------------------------------------------------------------------
// Set parsers
// ---------------------------------------------------------------------------

/**
 * Defensive re-parse of a character-profiles document. The Ajv schema
 * already rejected structural violations at load time; this guards the
 * engine against unvalidated values and adds the single-file semantics a
 * schema cannot express: `maxLevel > startingLevel`, attribute starts within
 * `attributeCap`, and a growth total that can actually leave the start tier.
 */
export function parseCharacterProfileSet(raw: unknown): SetParseResult<CharacterProfileSetData> {
  if (!isPlainObject(raw) || !Array.isArray(raw.profiles)) {
    return { ok: false, errors: ['profiles：应为角色模板数组'] };
  }

  const profiles: CharacterProfileData[] = [];
  const errors: string[] = [];
  raw.profiles.forEach((entry, index) => {
    const label = `profiles[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const description = requireNonEmptyString(entry.description);
    const attributeLabels = requireAttributeLabelMap(entry.attributeLabels);
    const attributes = requireAttributeMap(entry.attributes);
    const growth = requireGrowthMap(entry.growth);
    const derivedStats = requireDerivedStats(entry.derivedStats);
    const startingLevel = requireIntegerInRange(entry.startingLevel, 1, 99);
    const maxLevel = requireIntegerInRange(entry.maxLevel, 2, 99);
    const startingExperience = requireIntegerInRange(
      entry.startingExperience,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const attributeCap = requireIntegerInRange(entry.attributeCap, 1, ATTRIBUTE_MAX);

    const startingMartialArtIds: string[] | null = Array.isArray(entry.startingMartialArtIds)
      ? (() => {
          const ids: string[] = [];
          for (const id of entry.startingMartialArtIds) {
            const value = requireNonEmptyString(id);
            if (value === null) {
              return null;
            }
            ids.push(value);
          }
          return ids;
        })()
      : null;

    // Round 06: starting economy and backpack declaration.
    const startingCurrency = requireIntegerInRange(entry.startingCurrency, 0, 999_999);
    const inventoryCapacity = requireIntegerInRange(entry.inventoryCapacity, 1, 99);
    const startingItems = Array.isArray(entry.startingItems)
      ? (() => {
          const declarations: StartingItemDeclarationData[] = [];
          for (const declaration of entry.startingItems) {
            const source = isPlainObject(declaration) ? declaration : null;
            const itemId = source === null ? null : requireNonEmptyString(source.itemId);
            const quantity = source === null ? null : requireIntegerInRange(source.quantity, 1, 999);
            if (itemId === null || quantity === null) {
              return null;
            }
            declarations.push({ itemId, quantity });
          }
          return declarations;
        })()
      : null;

    const progressionSource = isPlainObject(entry.progression) ? entry.progression : null;
    const baseExperience =
      progressionSource === null
        ? null
        : requireIntegerInRange(progressionSource.baseExperience, 1, Number.MAX_SAFE_INTEGER);
    const experiencePerLevel =
      progressionSource === null
        ? null
        : requireIntegerInRange(progressionSource.experiencePerLevel, 0, Number.MAX_SAFE_INTEGER);

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (description === null) {
      problems.push(`${label}.description：应为非空字符串`);
    }
    if (attributeLabels === null) {
      problems.push(`${label}.attributeLabels：应含五项属性的非空显示名称`);
    }
    if (attributes === null) {
      problems.push(
        `${label}.attributes：应为 ${ATTRIBUTE_IDS.join('/')} 的 ${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX} 整数映射`,
      );
    }
    if (growth === null) {
      problems.push(`${label}.growth：应为五项属性的 0–99 整数映射`);
    }
    if (derivedStats === null) {
      problems.push(`${label}.derivedStats：应含 health/qi 公式（base、perLevel、attributeWeights）`);
    }
    if (startingLevel === null) {
      problems.push(`${label}.startingLevel：应为 1–99 的整数`);
    }
    if (maxLevel === null) {
      problems.push(`${label}.maxLevel：应为 2–99 的整数`);
    }
    if (startingExperience === null) {
      problems.push(`${label}.startingExperience：应为非负整数`);
    }
    if (attributeCap === null) {
      problems.push(`${label}.attributeCap：应为 1–${ATTRIBUTE_MAX} 的整数`);
    }
    if (startingMartialArtIds === null) {
      problems.push(`${label}.startingMartialArtIds：应为武学 id 字符串数组（可为空数组）`);
    }
    if (startingCurrency === null) {
      problems.push(`${label}.startingCurrency：应为 0–999999 的整数`);
    }
    if (inventoryCapacity === null) {
      problems.push(`${label}.inventoryCapacity：应为 1–99 的整数（按物品堆数计）`);
    }
    if (startingItems === null) {
      problems.push(
        `${label}.startingItems：应为起始物品声明数组（itemId 非空字符串、quantity 1–999 整数）`,
      );
    }
    if (baseExperience === null || experiencePerLevel === null) {
      problems.push(`${label}.progression：应含 baseExperience（正整数）与 experiencePerLevel（非负整数）`);
    }

    // Single-file semantics a schema cannot express.
    if (startingLevel !== null && maxLevel !== null && maxLevel <= startingLevel) {
      problems.push(`${label}：maxLevel（${maxLevel}）必须大于 startingLevel（${startingLevel}）`);
    }
    if (attributes !== null && attributeCap !== null) {
      for (const attributeId of ATTRIBUTE_IDS) {
        if (attributes[attributeId] > attributeCap) {
          problems.push(
            `${label}.attributes.${attributeId}（${attributes[attributeId]}）超过 attributeCap（${attributeCap}）`,
          );
        }
      }
    }

    if (
      id === null ||
      name === null ||
      description === null ||
      attributeLabels === null ||
      attributes === null ||
      growth === null ||
      derivedStats === null ||
      startingLevel === null ||
      maxLevel === null ||
      startingExperience === null ||
      attributeCap === null ||
      startingMartialArtIds === null ||
      startingCurrency === null ||
      inventoryCapacity === null ||
      startingItems === null ||
      baseExperience === null ||
      experiencePerLevel === null ||
      problems.length > 0
    ) {
      errors.push(...problems);
      return;
    }

    profiles.push({
      id,
      name,
      description,
      attributeLabels,
      attributes,
      startingLevel,
      startingExperience,
      maxLevel,
      attributeCap,
      progression: { baseExperience, experiencePerLevel },
      growth,
      derivedStats,
      startingMartialArtIds,
      startingCurrency,
      inventoryCapacity,
      startingItems,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { profiles } };
}

function parseFactionAdmission(raw: unknown): FactionAdmissionData | null {
  if (raw === undefined) {
    return { minimumAttributes: {}, requiredQuestIds: [] };
  }
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) return null;
  const minimumLevel = source.minimumLevel === undefined
    ? undefined
    : requireIntegerInRange(source.minimumLevel, 1, 99);
  const minimumAttributes = source.minimumAttributes === undefined
    ? {}
    : requireAttributeRequirementMap(source.minimumAttributes);
  const minimumMorality = source.minimumMorality === undefined
    ? undefined
    : requireIntegerInRange(source.minimumMorality, -100, 100);
  const maximumMorality = source.maximumMorality === undefined
    ? undefined
    : requireIntegerInRange(source.maximumMorality, -100, 100);
  const minimumRenown = source.minimumRenown === undefined
    ? undefined
    : requireIntegerInRange(source.minimumRenown, 0, 1000);
  const minimumFactionRenown = source.minimumFactionRenown === undefined
    ? undefined
    : requireIntegerInRange(source.minimumFactionRenown, 0, 1000);
  const minimumTeacherRelationship = source.minimumTeacherRelationship === undefined
    ? undefined
    : requireIntegerInRange(source.minimumTeacherRelationship, -100, 100);
  const requiredQuestIds: string[] = [];
  if (source.requiredQuestIds !== undefined) {
    if (!Array.isArray(source.requiredQuestIds)) return null;
    for (const questId of source.requiredQuestIds) {
      const id = requireNonEmptyString(questId);
      if (id === null || requiredQuestIds.includes(id)) return null;
      requiredQuestIds.push(id);
    }
  }
  if (
    minimumLevel === null ||
    minimumAttributes === null ||
    minimumMorality === null ||
    maximumMorality === null ||
    minimumRenown === null ||
    minimumFactionRenown === null ||
    minimumTeacherRelationship === null
  ) return null;
  if (
    minimumMorality !== undefined &&
    maximumMorality !== undefined &&
    minimumMorality > maximumMorality
  ) return null;
  return {
    ...(minimumLevel !== undefined ? { minimumLevel } : {}),
    minimumAttributes,
    ...(minimumMorality !== undefined ? { minimumMorality } : {}),
    ...(maximumMorality !== undefined ? { maximumMorality } : {}),
    ...(minimumRenown !== undefined ? { minimumRenown } : {}),
    ...(minimumFactionRenown !== undefined ? { minimumFactionRenown } : {}),
    ...(minimumTeacherRelationship !== undefined ? { minimumTeacherRelationship } : {}),
    requiredQuestIds,
  };
}

function parseFactionDeparture(raw: unknown): FactionDepartureData | null {
  if (raw === undefined) {
    return { allowed: true, moralityDelta: 0, renownDelta: 0, factionRenownDelta: 0, forgetFactionMartialArts: false };
  }
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) return null;
  const allowed = source.allowed === undefined ? true : source.allowed;
  const moralityDelta = source.moralityDelta === undefined
    ? 0
    : requireIntegerInRange(source.moralityDelta, -100, 100);
  const renownDelta = source.renownDelta === undefined
    ? 0
    : requireIntegerInRange(source.renownDelta, -1000, 1000);
  const factionRenownDelta = source.factionRenownDelta === undefined
    ? 0
    : requireIntegerInRange(source.factionRenownDelta, -1000, 1000);
  const forgetFactionMartialArts = source.forgetFactionMartialArts === undefined
    ? false
    : source.forgetFactionMartialArts;
  if (
    typeof allowed !== 'boolean' ||
    moralityDelta === null ||
    renownDelta === null ||
    factionRenownDelta === null ||
    typeof forgetFactionMartialArts !== 'boolean'
  ) return null;
  return { allowed, moralityDelta, renownDelta, factionRenownDelta, forgetFactionMartialArts };
}

/**
 * Defensive re-parse of a faction-set document. Membership rules are
 * optional for legacy MODs and normalize to open admission/no-cost departure.
 */
export function parseFactionSet(raw: unknown): SetParseResult<FactionSetData> {
  if (!isPlainObject(raw) || !Array.isArray(raw.factions)) {
    return { ok: false, errors: ['factions：应为门派条目数组'] };
  }

  const factions: FactionData[] = [];
  const errors: string[] = [];
  raw.factions.forEach((entry, index) => {
    const label = `factions[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const stance = requireNonEmptyString(entry.stance);
    const philosophy = requireNonEmptyString(entry.philosophy);
    const martialStyle = requireNonEmptyString(entry.martialStyle);
    const mentorNpcIds: string[] = [];
    if (entry.mentorNpcIds !== undefined) {
      if (Array.isArray(entry.mentorNpcIds)) {
        for (const npcId of entry.mentorNpcIds) {
          const id = requireNonEmptyString(npcId);
          if (id === null || mentorNpcIds.includes(id)) {
            mentorNpcIds.length = 0;
            break;
          }
          mentorNpcIds.push(id);
        }
      }
    }
    const admission = parseFactionAdmission(entry.admission);
    const departure = parseFactionDeparture(entry.departure);

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (stance === null) {
      problems.push(`${label}.stance：应为非空字符串`);
    }
    if (philosophy === null) {
      problems.push(`${label}.philosophy：应为非空字符串`);
    }
    if (martialStyle === null) {
      problems.push(`${label}.martialStyle：应为非空字符串`);
    }
    if (entry.mentorNpcIds !== undefined && (!Array.isArray(entry.mentorNpcIds) ||
      (entry.mentorNpcIds.length > 0 && mentorNpcIds.length === 0))) {
      problems.push(`${label}.mentorNpcIds：应为不重复的 NPC id 字符串数组`);
    }
    if (admission === null) {
      problems.push(`${label}.admission：入门条件无效`);
    }
    if (departure === null) {
      problems.push(`${label}.departure：退门规则无效`);
    }
    if (
      id === null ||
      name === null ||
      stance === null ||
      philosophy === null ||
      martialStyle === null ||
      admission === null ||
      departure === null ||
      (entry.mentorNpcIds !== undefined && !Array.isArray(entry.mentorNpcIds))
    ) {
      errors.push(...problems);
      return;
    }

    factions.push({ id, name, stance, philosophy, martialStyle, mentorNpcIds, admission, departure });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { factions } };
}

/**
 * Defensive re-parse of a martial-arts-set document. Adds the single-file
 * semantic a schema cannot express: `initialProficiency ≤ proficiencyCap`.
 * Faction references are resolved later by {@link indexMartialArts} against
 * the valid faction set, so one dangling reference disables exactly one art.
 */
export function parseMartialArtSet(raw: unknown): SetParseResult<MartialArtSetData> {
  if (!isPlainObject(raw) || !Array.isArray(raw.martialArts)) {
    return { ok: false, errors: ['martialArts：应为武学条目数组'] };
  }

  const martialArts: MartialArtData[] = [];
  const errors: string[] = [];
  raw.martialArts.forEach((entry, index) => {
    const label = `martialArts[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const category = requireNonEmptyString(entry.category);
    const style = requireNonEmptyString(entry.style);
    const description = requireNonEmptyString(entry.description);
    const initialProficiency = requireIntegerInRange(entry.initialProficiency, 0, 999);
    const proficiencyCap = requireIntegerInRange(entry.proficiencyCap, 1, 999);
    const combat = requireCombatAction(entry.combat);

    const factionIds: string[] = [];
    if (Array.isArray(entry.factionIds)) {
      for (const factionId of entry.factionIds) {
        const value = requireNonEmptyString(factionId);
        if (value === null) {
          factionIds.length = 0;
          break;
        }
        factionIds.push(value);
      }
    }

    const requirementsSource = isPlainObject(entry.requirements) ? entry.requirements : null;
    const requiredLevel =
      requirementsSource === null ? null : requireIntegerInRange(requirementsSource.level, 1, 99);
    const requiredAttributes =
      requirementsSource === null ? null : requireAttributeRequirementMap(requirementsSource.attributes);

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (category === null) {
      problems.push(`${label}.category：应为非空类别字符串`);
    }
    if (style === null) {
      problems.push(`${label}.style：应为非空字符串`);
    }
    if (description === null) {
      problems.push(`${label}.description：应为非空字符串`);
    }
    if (!Array.isArray(entry.factionIds)) {
      problems.push(`${label}.factionIds：应为门派 id 数组（空数组表示不限门派）`);
    } else if (factionIds.length === 0 && entry.factionIds.length > 0) {
      problems.push(`${label}.factionIds：数组元素应为非空字符串`);
    }
    if (requiredLevel === null || requiredAttributes === null) {
      problems.push(`${label}.requirements：应含 level（1–99 整数）与 attributes（属性→最低值映射）`);
    }
    if (initialProficiency === null) {
      problems.push(`${label}.initialProficiency：应为 0–999 的整数`);
    }
    if (proficiencyCap === null) {
      problems.push(`${label}.proficiencyCap：应为 1–999 的整数`);
    }
    if (combat === null) {
      problems.push(
        `${label}.combat：应含 kind（attack/heal）、power（1–999 整数）与 qiCost（0–99 整数）`,
      );
    }

    // Single-file semantics a schema cannot express.
    if (initialProficiency !== null && proficiencyCap !== null && initialProficiency > proficiencyCap) {
      problems.push(
        `${label}：initialProficiency（${initialProficiency}）超过 proficiencyCap（${proficiencyCap}）`,
      );
    }

    if (
      id === null ||
      name === null ||
      category === null ||
      style === null ||
      description === null ||
      !Array.isArray(entry.factionIds) ||
      requiredLevel === null ||
      requiredAttributes === null ||
      initialProficiency === null ||
      proficiencyCap === null ||
      combat === null ||
      problems.length > 0
    ) {
      errors.push(...problems);
      return;
    }

    martialArts.push({
      id,
      name,
      category,
      style,
      description,
      factionIds,
      requirements: { level: requiredLevel, attributes: requiredAttributes },
      initialProficiency,
      proficiencyCap,
      combat,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { martialArts } };
}

// ---------------------------------------------------------------------------
// Id indexing with cross-reference isolation
// ---------------------------------------------------------------------------

export interface ProfileIndex {
  /** Valid profiles by id; first declaration wins on duplicates. */
  byId: Map<string, CharacterProfileData>;
  /** Dropped duplicate ids, e.g. for warnings. */
  duplicateIds: string[];
}

/** Indexes character profiles by id, keeping the first declaration of each id. */
export function indexProfiles(set: CharacterProfileSetData): ProfileIndex {
  const byId = new Map<string, CharacterProfileData>();
  const duplicateIds: string[] = [];
  for (const profile of set.profiles) {
    if (byId.has(profile.id)) {
      duplicateIds.push(profile.id);
      continue;
    }
    byId.set(profile.id, profile);
  }
  return { byId, duplicateIds };
}

export interface FactionIndex {
  /** Valid factions by id; first declaration wins on duplicates. */
  byId: Map<string, FactionData>;
  /** Dropped duplicate ids, e.g. for warnings. */
  duplicateIds: string[];
}

/** Indexes factions by id, keeping the first declaration of each id. */
export function indexFactions(set: FactionSetData): FactionIndex {
  const byId = new Map<string, FactionData>();
  const duplicateIds: string[] = [];
  for (const faction of set.factions) {
    if (byId.has(faction.id)) {
      duplicateIds.push(faction.id);
      continue;
    }
    byId.set(faction.id, faction);
  }
  return { byId, duplicateIds };
}

export interface MartialArtIndexInput {
  /** Parsed martial-arts set; null when the resource is missing or structurally invalid. */
  set: MartialArtSetData | null;
  /** Valid faction ids (already indexed); martial arts resolve against these. */
  factionIds: ReadonlySet<string>;
}

export interface MartialArtIndex {
  /** Arts that passed every check, by id; first declaration wins on duplicates. */
  byId: Map<string, MartialArtData>;
  /** Dropped duplicate ids, e.g. for warnings. */
  duplicateIds: string[];
  /** Per-art problems; each disables exactly the art it names. */
  warnings: string[];
}

/**
 * Indexes martial arts by id and resolves every faction reference against the
 * valid faction set. An art listing a faction that is missing or was itself
 * disabled drops out with one readable warning; all other arts survive. An
 * empty `factionIds` list places no constraint and always passes this check.
 */
export function indexMartialArts(input: MartialArtIndexInput): MartialArtIndex {
  const byId = new Map<string, MartialArtData>();
  const duplicateIds: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  if (input.set === null) {
    return { byId, duplicateIds, warnings };
  }

  for (const art of input.set.martialArts) {
    if (seenIds.has(art.id)) {
      duplicateIds.push(art.id);
      continue;
    }
    seenIds.add(art.id);

    const dangling = art.factionIds.filter((factionId) => !input.factionIds.has(factionId));
    if (dangling.length > 0) {
      warnings.push(
        `武学 "${art.id}"（${art.name}）已禁用：引用的门派 ${dangling
          .map((factionId) => `"${factionId}"`)
          .join('、')} 不存在或已因校验失败被禁用`,
      );
      continue;
    }

    byId.set(art.id, art);
  }

  return { byId, duplicateIds, warnings };
}

// ---------------------------------------------------------------------------
// Derived vitals
// ---------------------------------------------------------------------------

/**
 * Data-driven derived maximum: `base + perLevel × (level − 1) +
 * Σ(weight × attribute)`. The shape of the formula is this protocol; every
 * number in it comes from the profile JSON.
 */
export function computeDerivedMax(
  formula: DerivedStatFormulaData,
  level: number,
  attributes: Readonly<AttributeMap>,
): number {
  const effectiveLevel = Math.max(Math.trunc(level) || 1, 1);
  let total = formula.base + formula.perLevel * (effectiveLevel - 1);
  for (const attributeId of ATTRIBUTE_IDS) {
    total += (formula.attributeWeights[attributeId] ?? 0) * (attributes[attributeId] ?? 0);
  }
  return total;
}

export interface VitalMaxima {
  healthMax: number;
  qiMax: number;
}

/** Computes both vital maxima for a level/attribute pair under the profile's formulas. */
export function computeVitalMaxima(
  profile: CharacterProfileData,
  level: number,
  attributes: Readonly<AttributeMap>,
): VitalMaxima {
  return {
    healthMax: computeDerivedMax(profile.derivedStats.health, level, attributes),
    qiMax: computeDerivedMax(profile.derivedStats.qi, level, attributes),
  };
}

// ---------------------------------------------------------------------------
// Runtime character state and progression
// ---------------------------------------------------------------------------

export interface CharacterVitals {
  current: number;
  max: number;
}

/** Equipment-granted bonuses (Round 06); maintained by the item system. */
export interface EquipmentBonusData {
  attributes: PartialAttributeMap;
  health: number;
  qi: number;
}

/** Runtime state; the versioned save engine snapshots its pure data fields. */
export interface CharacterState {
  profileId: string;
  level: number;
  /** Cumulative experience; level-ups settle whenever experience is granted. */
  experience: number;
  /**
   * Base attributes: level-up growth accumulates here (capped by
   * `attributeCap`), never mixed with equipment bonuses.
   */
  baseAttributes: AttributeMap;
  /**
   * Effective attributes: base + equipment bonuses (Round 06). Combat and all
   * other consumers read these; without equipment they equal the base values.
   */
  attributes: AttributeMap;
  health: CharacterVitals;
  qi: CharacterVitals;
  /** Equipment bonuses currently applied to {@link attributes} and the maxima. */
  equipmentBonuses: EquipmentBonusData;
  /**
   * Martial-art ids the character has mastered. Copied verbatim from the
   * profile's declared starting list; callers validate the references first
   * (see {@link resolveStartingMartialArts}) and may overwrite this copy with
   * the validated list so broken references never reach combat.
   */
  martialArtIds: string[];
}

/**
 * Creates the runtime state declared by a profile: starting level, starting
 * experience, copied attributes and copied starting martial-art list, with
 * both vitals full. The declared starting point is taken verbatim — if the
 * data happens to declare enough starting experience for a level-up, that
 * settles on the next {@link grantExperience} call, not implicitly here.
 * Equipment bonuses start at zero (nothing equipped).
 */
export function createCharacterState(profile: CharacterProfileData): CharacterState {
  const { healthMax, qiMax } = computeVitalMaxima(
    profile,
    profile.startingLevel,
    profile.attributes,
  );
  return {
    profileId: profile.id,
    level: profile.startingLevel,
    experience: profile.startingExperience,
    baseAttributes: { ...profile.attributes },
    attributes: { ...profile.attributes },
    health: { current: healthMax, max: healthMax },
    qi: { current: qiMax, max: qiMax },
    equipmentBonuses: { attributes: {}, health: 0, qi: 0 },
    martialArtIds: [...profile.startingMartialArtIds],
  };
}

/**
 * Applies a new set of equipment bonuses (Round 06): stores them on the state
 * and recomputes the effective attributes from the untouched base values, so
 * re-equipping never compounds and level-up growth is never rolled back. The
 * caller owns vital-maximum adjustment and current-value clamping (see the
 * item system); level-ups refresh both through this same function.
 */
export function applyEquipmentBonuses(state: CharacterState, bonuses: EquipmentBonusData): void {
  state.equipmentBonuses = {
    attributes: { ...bonuses.attributes },
    health: bonuses.health,
    qi: bonuses.qi,
  };
  for (const attributeId of ATTRIBUTE_IDS) {
    state.attributes[attributeId] =
      state.baseAttributes[attributeId] + (bonuses.attributes[attributeId] ?? 0);
  }
}

/**
 * Cumulative experience required to *reach* `level` under the profile's
 * curve: the step from level k to k+1 costs `baseExperience +
 * experiencePerLevel × (k − 1)`, so every threshold grows with the level.
 * Out-of-range inputs clamp to [1, maxLevel] (level 1 always costs 0).
 */
export function cumulativeExperienceForLevel(
  profile: CharacterProfileData,
  level: number,
): number {
  const clamped = Math.min(Math.max(Math.trunc(level) || 1, 1), profile.maxLevel);
  const steps = clamped - 1;
  const { baseExperience, experiencePerLevel } = profile.progression;
  return steps * baseExperience + (experiencePerLevel * steps * (steps - 1)) / 2;
}

/** Experience still needed to reach the next level; null once at max level. */
export function experienceToNextLevel(
  profile: CharacterProfileData,
  state: Readonly<CharacterState>,
): number | null {
  if (state.level >= profile.maxLevel) {
    return null;
  }
  const threshold = cumulativeExperienceForLevel(profile, state.level + 1);
  return Math.max(threshold - state.experience, 0);
}

export interface ExperienceGainResult {
  /** How many levels were gained in this single grant (cross-level settles at once). */
  levelsGained: number;
  /** Experience discarded because the character reached max level. */
  discardedExperience: number;
}

/**
 * Grants experience and settles every resulting level-up in one pass:
 * base attributes grow by the profile's per-level amounts (capped at
 * `attributeCap` — equipment bonuses never eat into the cap), effective
 * attributes resynchronize as base + equipment, vital maxima recompute from
 * the data formulas plus the equipment bonuses, and the maxima delta heals
 * into the current values (a fully healthy character stays fully healthy).
 * Experience beyond the max-level threshold is discarded — max level does not
 * bank experience. Non-positive or non-finite amounts are no-ops. Mutates
 * `state`; the same profile that created it must be supplied on every call.
 */
export function grantExperience(
  profile: CharacterProfileData,
  state: CharacterState,
  amount: number,
): ExperienceGainResult {
  const wholeAmount = Math.floor(amount);
  if (!Number.isSafeInteger(wholeAmount) || wholeAmount <= 0) {
    return { levelsGained: 0, discardedExperience: 0 };
  }

  const previousHealthMax = state.health.max;
  const previousQiMax = state.qi.max;
  state.experience += wholeAmount;

  let levelsGained = 0;
  while (state.level < profile.maxLevel) {
    const threshold = cumulativeExperienceForLevel(profile, state.level + 1);
    if (state.experience < threshold) {
      break;
    }
    state.level += 1;
    levelsGained += 1;
    for (const attributeId of ATTRIBUTE_IDS) {
      state.baseAttributes[attributeId] = Math.min(
        state.baseAttributes[attributeId] + profile.growth[attributeId],
        profile.attributeCap,
      );
    }
  }

  let discardedExperience = 0;
  if (state.level >= profile.maxLevel) {
    const ceiling = cumulativeExperienceForLevel(profile, profile.maxLevel);
    if (state.experience > ceiling) {
      discardedExperience = state.experience - ceiling;
      state.experience = ceiling;
    }
  }

  if (levelsGained > 0) {
    applyEquipmentBonuses(state, state.equipmentBonuses); // Resync effective attributes.
    const { healthMax, qiMax } = computeVitalMaxima(profile, state.level, state.attributes);
    const newHealthMax = healthMax + state.equipmentBonuses.health;
    const newQiMax = qiMax + state.equipmentBonuses.qi;
    state.health.max = newHealthMax;
    state.qi.max = newQiMax;
    state.health.current = Math.min(
      state.health.current + (newHealthMax - previousHealthMax),
      newHealthMax,
    );
    state.qi.current = Math.min(state.qi.current + (newQiMax - previousQiMax), newQiMax);
  }

  return { levelsGained, discardedExperience };
}

// ---------------------------------------------------------------------------
// Martial-art eligibility
// ---------------------------------------------------------------------------

export interface MartialArtEligibilityQuery {
  level: number;
  attributes: Readonly<AttributeMap>;
  /** Current faction id of the character; null means factionless. */
  factionId: string | null;
}

export interface MartialArtEligibility {
  eligible: boolean;
  /** Mechanical failure reasons naming protocol ids and numbers (no setting text). */
  reasons: string[];
}

/**
 * Checks one martial art's requirements against a character: minimum level,
 * minimum attributes and faction membership. An empty `factionIds` list
 * means the art is open to everyone (including factionless characters);
 * otherwise the character's faction id must appear in the list.
 */
export function checkMartialArtEligibility(
  art: MartialArtData,
  query: MartialArtEligibilityQuery,
): MartialArtEligibility {
  const reasons: string[] = [];

  if (query.level < art.requirements.level) {
    reasons.push(`等级 ${query.level} 低于要求 ${art.requirements.level}`);
  }

  for (const attributeId of ATTRIBUTE_IDS) {
    const required = art.requirements.attributes[attributeId];
    if (required === undefined) {
      continue;
    }
    const actual = query.attributes[attributeId] ?? 0;
    if (actual < required) {
      reasons.push(`${attributeId} ${actual} 低于要求 ${required}`);
    }
  }

  if (art.factionIds.length > 0) {
    if (query.factionId === null) {
      reasons.push(`需加入门派（要求：${art.factionIds.join('、')}）`);
    } else if (!art.factionIds.includes(query.factionId)) {
      reasons.push(`当前门派 "${query.factionId}" 不在适用范围（要求：${art.factionIds.join('、')}）`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Starting martial arts (Round 05)
// ---------------------------------------------------------------------------

export interface StartingMartialArtResolution {
  /** Validated ids in declaration order; broken references dropped. */
  ids: string[];
  /** The martial-art records matching `ids`. */
  arts: MartialArtData[];
  /** One readable problem per dropped or duplicated reference. */
  warnings: string[];
}

/**
 * Validates a profile's `startingMartialArtIds` against the indexed (already
 * faction-checked) martial arts: every id must exist, must not be disabled,
 * must be declared only once and must satisfy the art's requirements at the
 * profile's *starting* standing — starting level, starting attributes and no
 * faction (joining arrives in Round 13). A broken reference drops exactly
 * that art with one readable warning; the profile itself stays usable.
 */
export function resolveStartingMartialArts(
  profile: CharacterProfileData,
  martialArts: ReadonlyMap<string, MartialArtData>,
): StartingMartialArtResolution {
  const ids: string[] = [];
  const arts: MartialArtData[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const artId of profile.startingMartialArtIds) {
    if (seen.has(artId)) {
      warnings.push(`模板 "${profile.id}" 的起始武学 "${artId}" 重复声明，保留首次出现`);
      continue;
    }
    seen.add(artId);

    const art = martialArts.get(artId);
    if (art === undefined) {
      warnings.push(
        `模板 "${profile.id}" 的起始武学 "${artId}" 不存在或已因校验失败被禁用，已剔除`,
      );
      continue;
    }

    const eligibility = checkMartialArtEligibility(art, {
      level: profile.startingLevel,
      attributes: profile.attributes,
      factionId: null,
    });
    if (!eligibility.eligible) {
      warnings.push(
        `模板 "${profile.id}" 的起始武学 "${artId}"（${art.name}）不满足起始条件：${eligibility.reasons.join('；')}，已剔除`,
      );
      continue;
    }

    ids.push(artId);
    arts.push(art);
  }

  return { ids, arts, warnings };
}
