/**
 * Generic turn-based-combat protocol: wire types, defensive parsing,
 * cross-resource encounter assembly and a Phaser-free combat session.
 *
 * The engine knows the *shape* of encounter data only — names, enemy stats,
 * rewards, recovery ratios and every prompt line come from the parsed JSON,
 * so no world content may live here (see docs/ARCHITECTURE.md).
 *
 * `data/schema/battle-encounters.schema.json` pins down static structure
 * before these functions run. The assembly step adds the cross-resource
 * rules a single-file schema cannot express (map/template/martial-art
 * references resolve, the trigger cell is inside the map and walkable, no
 * overlap with the player spawn, NPCs or other encounters) and isolates
 * failures per encounter: one bad record disables exactly that encounter.
 *
 * The session alternates player and enemy turns inside one {@link
 * CombatSession.playerUse} call (the UI renders the appended log entries).
 * Formulas are fixed protocol: attack damage `max(1, power + attackerForce
 * − floor(defenderBody / 3))`, heal amount `power + floor(actorResolve / 2)`
 * capped at the health maximum, and guard reduces the next incoming hit by
 * its data power while leaving at least one damage. The enemy deterministically
 * picks the highest-power affordable attack (ties broken by ascending art id),
 * otherwise the highest-power affordable guard, and passes when neither is
 * affordable. An invalid or unaffordable player action
 * consumes neither turn nor resources. Victory experience is granted exactly
 * once through the Round 04 progression API; defeat restores the player by
 * the encounter's declared ratios (always to at least 1 health); fleeing
 * awards nothing. One-shot completion flags live with the caller and are
 * serialized by the separate Round 09 save protocol.
 */

import {
  type AttributeMap,
  type CharacterProfileData,
  type CharacterState,
  grantExperience,
  type MartialArtData,
} from './character-progression';
import { type CellPosition, type GridMap } from './grid-map';
import { manhattanDistance } from './npc-placement';
import type { CompanionSupportData } from './companion-system';
import { awardCultivationPoints, type MeridianResourceRules } from './meridian-system';

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

/** Wire format of the single enemy of one encounter. */
export interface EncounterEnemyData {
  name: string;
  attributes: AttributeMap;
  /** Maximum health; the enemy starts at full health. */
  health: number;
  /** Maximum qi; the enemy starts at full qi. */
  qi: number;
  martialArtIds: string[];
  /** Optional visible deterministic cycle; absent retains the legacy AI. */
  behavior?: EnemyBehaviorStep[];
}

export type EnemyBehaviorStep =
  | { kind: 'art'; artId: string; cue: string; powerBonus?: number; guardDisruptsBonus?: boolean }
  | { kind: 'recoverQi'; amount: number; cue: string };

export function parseEnemyBehavior(raw: unknown): EnemyBehaviorStep[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return null;
  const steps: EnemyBehaviorStep[] = [];
  for (const value of raw) {
    if (!isPlainObject(value) || typeof value.cue !== 'string' || !value.cue.trim() || value.cue.length > 80) return null;
    if (value.kind === 'art') {
      if (Object.keys(value).some(key => !['kind', 'artId', 'cue', 'powerBonus', 'guardDisruptsBonus'].includes(key)) || !requireNonEmptyString(value.artId) ||
          (value.guardDisruptsBonus !== undefined && typeof value.guardDisruptsBonus !== 'boolean') ||
          (value.powerBonus !== undefined && requireIntegerInRange(value.powerBonus, 0, 30) === null)) return null;
      steps.push({ kind: 'art', artId: value.artId as string, cue: value.cue,
        ...(value.powerBonus !== undefined ? { powerBonus: value.powerBonus as number } : {}),
        ...(value.guardDisruptsBonus !== undefined ? { guardDisruptsBonus: value.guardDisruptsBonus as boolean } : {}) });
    } else if (value.kind === 'recoverQi') {
      if (Object.keys(value).some(key => !['kind', 'amount', 'cue'].includes(key)) || requireIntegerInRange(value.amount, 1, 9999) === null) return null;
      steps.push({ kind: 'recoverQi', amount: value.amount as number, cue: value.cue });
    } else return null;
  }
  return steps;
}

/** Wire format of one encounter inside a battle-encounters JSON file. */
export interface BattleEncounterData {
  id: string;
  name: string;
  mapResourceId: string;
  position: CellPosition;
  profileId: string;
  /** Optional graph character entry revealed when the player faces this foe. */
  knowledgeNodeId?: string;
  /** Optional climate tide phases during which this encounter exists. */
  tideIds?: string[];
  enemy: EncounterEnemyData;
  victoryExperience: number;
  defeatRecovery: {
    healthRatio: number;
    qiRatio: number;
  };
  repeatable: boolean;
  texts: {
    approach: string;
    intro: string;
    victory: string;
    defeat: string;
    flee: string;
  };
}

/** Wire format of a battle-encounters JSON file under `data/base/battles/`. */
export interface BattleEncounterSetData {
  encounters: BattleEncounterData[];
}

export type BattleEncounterSetParseResult =
  | { ok: true; set: BattleEncounterSetData }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Defensive parsing helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requireIntegerInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** Reads a ratio in [0, 1] (finite number). */
function requireRatio(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  return value;
}

/** Reads a list of non-empty unique string ids; null when invalid. */
function requireIdList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = requireNonEmptyString(entry);
    if (id === null || seen.has(id)) {
      return null;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Reads one enemy entry; returns readable problems when invalid. */
function parseEnemy(raw: unknown, label: string): { enemy: EncounterEnemyData | null; problems: string[] } {
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    return { enemy: null, problems: [`${label}：应为对象`] };
  }

  const name = requireNonEmptyString(raw.name);
  const health = requireIntegerInRange(raw.health, 1, 9999);
  const qi = requireIntegerInRange(raw.qi, 0, 9999);
  const martialArtIds = requireIdList(raw.martialArtIds);
  const behavior = raw.behavior === undefined ? undefined : parseEnemyBehavior(raw.behavior);
  if (behavior === null) problems.push(`${label}.behavior：应为1–12条有效的武学/回气循环`);

  const attributesSource = isPlainObject(raw.attributes) ? raw.attributes : null;
  const attributes = {} as AttributeMap;
  for (const attributeId of ['body', 'force', 'agility', 'insight', 'resolve'] as const) {
    attributes[attributeId] =
      attributesSource === null ? 0 : (requireIntegerInRange(attributesSource[attributeId], 1, 999) ?? 0);
  }
  const attributesValid =
    attributesSource !== null &&
    (['body', 'force', 'agility', 'insight', 'resolve'] as const).every(
      (attributeId) => attributes[attributeId] > 0,
    );

  if (name === null) {
    problems.push(`${label}.name：应为非空字符串`);
  }
  if (!attributesValid) {
    problems.push(
      `${label}.attributes：应为 body/force/agility/insight/resolve 的 1–999 完整整数映射`,
    );
  }
  if (health === null) {
    problems.push(`${label}.health：应为 1–9999 的整数`);
  }
  if (qi === null) {
    problems.push(`${label}.qi：应为 0–9999 的整数`);
  }
  if (martialArtIds === null || martialArtIds.length === 0) {
    problems.push(`${label}.martialArtIds：应为非空且不重复的武学 id 数组`);
  }

  if (
    name === null ||
    !attributesValid ||
    health === null ||
    qi === null ||
    martialArtIds === null ||
    martialArtIds.length === 0 || behavior === null
  ) {
    return { enemy: null, problems };
  }
  return { enemy: { name, attributes, health, qi, martialArtIds, ...(behavior ? { behavior } : {}) }, problems };
}

/** Reads one encounter's five prompt lines. */
function parseEncounterTexts(
  raw: unknown,
  label: string,
): { texts: BattleEncounterData['texts'] | null; problems: string[] } {
  const problems: string[] = [];
  const source = isPlainObject(raw) ? raw : null;
  const texts = {} as BattleEncounterData['texts'];
  const keys = ['approach', 'intro', 'victory', 'defeat', 'flee'] as const;
  let valid = source !== null;
  for (const key of keys) {
    const text = source === null ? null : requireNonEmptyString(source[key]);
    if (text === null) {
      valid = false;
      continue;
    }
    texts[key] = text;
  }
  if (!valid) {
    problems.push(`${label}：应含 approach/intro/victory/defeat/flee 五条非空文本`);
    return { texts: null, problems };
  }
  return { texts, problems };
}

/**
 * Defensive re-parse of a battle-encounters document. The Ajv schema already
 * rejected structural violations at load time; this guards the engine
 * against unvalidated values and yields readable per-entry errors.
 */
export function parseBattleEncounterSet(raw: unknown): BattleEncounterSetParseResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.encounters)) {
    return { ok: false, errors: ['encounters：应为遭遇条目数组'] };
  }

  const encounters: BattleEncounterData[] = [];
  const errors: string[] = [];
  raw.encounters.forEach((entry, index) => {
    const label = `encounters[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const mapResourceId = requireNonEmptyString(entry.mapResourceId);
    const profileId = requireNonEmptyString(entry.profileId);
    const knowledgeNodeId = entry.knowledgeNodeId === undefined
      ? null
      : requireNonEmptyString(entry.knowledgeNodeId);
    const tideIds = entry.tideIds === undefined ? undefined : requireIdList(entry.tideIds);
    const victoryExperience = requireIntegerInRange(entry.victoryExperience, 0, 1_000_000);
    const repeatable = typeof entry.repeatable === 'boolean' ? entry.repeatable : null;

    const positionSource = isPlainObject(entry.position) ? entry.position : null;
    const col =
      positionSource === null ? null : requireIntegerInRange(positionSource.col, 0, 255);
    const row =
      positionSource === null ? null : requireIntegerInRange(positionSource.row, 0, 255);

    const recoverySource = isPlainObject(entry.defeatRecovery) ? entry.defeatRecovery : null;
    const healthRatio = recoverySource === null ? null : requireRatio(recoverySource.healthRatio);
    const qiRatio = recoverySource === null ? null : requireRatio(recoverySource.qiRatio);

    const { enemy, problems: enemyProblems } = parseEnemy(entry.enemy, `${label}.enemy`);
    const { texts, problems: textProblems } = parseEncounterTexts(entry.texts, `${label}.texts`);

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (mapResourceId === null) {
      problems.push(`${label}.mapResourceId：应为非空字符串`);
    }
    if (profileId === null) {
      problems.push(`${label}.profileId：应为非空字符串`);
    }
    if (entry.knowledgeNodeId !== undefined && knowledgeNodeId === null) {
      problems.push(`${label}.knowledgeNodeId：应为非空知识节点 id`);
    }
    if (entry.tideIds !== undefined && (tideIds === undefined || tideIds === null || tideIds.length === 0)) {
      problems.push(`${label}.tideIds：应为非空且不重复的潮位 id 数组`);
    }
    if (victoryExperience === null) {
      problems.push(`${label}.victoryExperience：应为 0–1000000 的整数`);
    }
    if (repeatable === null) {
      problems.push(`${label}.repeatable：应为布尔值`);
    }
    if (col === null || row === null) {
      problems.push(`${label}.position：应含 0–255 的整数 col 与 row`);
    }
    if (healthRatio === null || qiRatio === null) {
      problems.push(`${label}.defeatRecovery：应含 0–1 的 healthRatio 与 qiRatio`);
    }
    problems.push(...enemyProblems, ...textProblems);

    if (
      id === null ||
      name === null ||
      mapResourceId === null ||
      profileId === null ||
      victoryExperience === null ||
      repeatable === null ||
      (entry.tideIds !== undefined && (tideIds === undefined || tideIds === null)) ||
      col === null ||
      row === null ||
      healthRatio === null ||
      qiRatio === null ||
      enemy === null ||
      texts === null ||
      problems.length > 0
    ) {
      errors.push(...problems);
      return;
    }

    encounters.push({
      id,
      name,
      mapResourceId,
      position: { col, row },
      profileId,
      ...(knowledgeNodeId !== null ? { knowledgeNodeId } : {}),
      ...(tideIds !== undefined && tideIds !== null ? { tideIds } : {}),
      enemy,
      victoryExperience,
      defeatRecovery: { healthRatio, qiRatio },
      repeatable,
      texts,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { encounters } };
}

// ---------------------------------------------------------------------------
// Cross-resource assembly
// ---------------------------------------------------------------------------

/** An encounter that passed every check, with references resolved. */
export interface PlacedEncounter {
  record: BattleEncounterData;
  col: number;
  row: number;
  /** The resolved player profile (validates `profileId` at assembly time). */
  profile: CharacterProfileData;
  /** The enemy's martial arts resolved against the indexed set. */
  enemyArts: MartialArtData[];
}

export interface BattleEncounterAssemblyInput {
  /** Parsed encounter set; null when the resource is missing or structurally invalid. */
  encounterSet: BattleEncounterSetData | null;
  /** Manifest resource ids present in the loaded data set (any schema). */
  knownResourceIds: ReadonlySet<string>;
  /** Validated maps by manifest resource id. */
  maps: ReadonlyMap<string, GridMap>;
  /** The map the current scene runs; encounters targeting another map are skipped. */
  currentMapResourceId: string;
  /** Cells occupied by placed NPCs ("col,row"); encounters must not overlap them. */
  npcCells: ReadonlySet<string>;
  /** Valid character profiles by id. */
  profiles: ReadonlyMap<string, CharacterProfileData>;
  /** Valid martial arts by id (already faction-checked). */
  martialArts: ReadonlyMap<string, MartialArtData>;
  /** Knowledge node ids whose kind is character, used for optional encounter discoveries. */
  knowledgeCharacterNodeIds: ReadonlySet<string>;
  /** Valid climate tide phase ids; optional only for legacy direct engine callers. */
  tideIds?: ReadonlySet<string>;
}

/** Whether a parsed encounter is active in the supplied tide phase. */
export function encounterMatchesTide(
  encounter: Pick<BattleEncounterData, 'tideIds'>,
  tideId: string | null,
): boolean {
  return encounter.tideIds === undefined || (tideId !== null && encounter.tideIds.includes(tideId));
}

export interface BattleEncounterAssemblyResult {
  /** Encounters that passed all checks and stand on the current map. */
  encounters: PlacedEncounter[];
  /** Readable per-encounter problems; each disables exactly the encounter it names. */
  warnings: string[];
  /** Encounters skipped because they target another (valid) map — not an error. */
  skippedOtherMap: number;
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Runs every cross-resource rule for each encounter in declaration order and
 * keeps only the ones that pass, resolving template and enemy-art references
 * along the way. Each failure produces one readable warning naming the
 * encounter, so a single broken record never disables the rest of the set:
 *
 * - id must be unique (first declaration wins);
 * - `mapResourceId` must exist and be the current map (other valid maps are
 *   skipped silently — normal multi-map data);
 * - the trigger cell must be inside the map, walkable, free of the player
 *   spawn, NPC cells and already placed encounters;
 * - `profileId` must resolve to a valid character profile;
 * - every `enemy.martialArtIds` entry must resolve to a valid martial art.
 */
export function assembleBattleEncounters(
  input: BattleEncounterAssemblyInput,
): BattleEncounterAssemblyResult {
  const encounters: PlacedEncounter[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const occupiedCells = new Map<string, string>(); // cellKey -> encounter id
  let skippedOtherMap = 0;

  if (input.encounterSet === null) {
    return { encounters, warnings, skippedOtherMap };
  }

  for (const record of input.encounterSet.encounters) {
    const problems: string[] = [];
    const encounterMap = input.maps.get(record.mapResourceId);

    for (const tideId of record.tideIds ?? []) {
      if (input.tideIds !== undefined && !input.tideIds.has(tideId)) {
        problems.push(`引用的潮位 id "${tideId}" 未在气候资料中登记`);
      }
    }

    if (!input.knownResourceIds.has(record.mapResourceId)) {
      problems.push(`引用的地图资源 "${record.mapResourceId}" 未登记或加载失败`);
    } else if (encounterMap === undefined) {
      problems.push(`引用的地图资源 "${record.mapResourceId}" 未加载为有效地图`);
    } else if (record.mapResourceId !== input.currentMapResourceId) {
      seenIds.add(record.id);
      skippedOtherMap += 1;
      continue;
    } else {
      const { col, row } = record.position;
      if (!encounterMap.inBounds(col, row)) {
        problems.push(
          `坐标 (${col}, ${row}) 超出地图边界（${encounterMap.columns}×${encounterMap.rows}）`,
        );
      } else if (encounterMap.isSolid(col, row)) {
        problems.push(`坐标 (${col}, ${row}) 落在阻挡格上`);
      } else if (col === encounterMap.playerStart.col && row === encounterMap.playerStart.row) {
        problems.push(`坐标 (${col}, ${row}) 与玩家出生点重叠`);
      } else if (input.npcCells.has(cellKey(col, row))) {
        problems.push(`坐标 (${col}, ${row}) 与人物占用的格子重叠`);
      } else {
        const clashId = occupiedCells.get(cellKey(col, row));
        if (clashId !== undefined) {
          problems.push(`坐标 (${col}, ${row}) 与遭遇 "${clashId}" 的触发格重叠`);
        }
      }
    }

    if (seenIds.has(record.id)) {
      problems.push('id 与前面的条目重复，保留先声明者');
    }
    const profile = input.profiles.get(record.profileId);
    if (profile === undefined) {
      problems.push(`引用的角色模板 "${record.profileId}" 不存在或已因校验失败被禁用`);
    }

    const enemyArts: MartialArtData[] = [];
    for (const artId of record.enemy.martialArtIds) {
      const art = input.martialArts.get(artId);
      if (art === undefined) {
        problems.push(`敌人的武学 "${artId}" 不存在或已因校验失败被禁用`);
        continue;
      }
      enemyArts.push(art);
    }
    if (enemyArts.length === 0) {
      problems.push('敌人没有任何可用的有效武学');
    }
    for (const step of record.enemy.behavior ?? []) {
      if (step.kind !== 'art') continue;
      const art = enemyArts.find(candidate => candidate.id === step.artId);
      if (!art) problems.push(`行为引用武学 "${step.artId}" 不在敌方武学列表中`);
      else if ((step.powerBonus ?? 0) > 0 && art.combat.kind !== 'attack') problems.push('行为额外威力只支持攻击武学');
      else if (step.guardDisruptsBonus && (art.combat.kind !== 'attack' || (step.powerBonus ?? 0) <= 0)) problems.push('可卸蓄势要求攻击及正额外威力');
    }

    seenIds.add(record.id);
    if (problems.length > 0) {
      warnings.push(`遭遇 "${record.id}"（${record.name}）已禁用：${problems.join('；')}`);
      continue;
    }
    if (profile === undefined) {
      continue; // Unreachable in practice: a missing profile pushes a problem above.
    }

    occupiedCells.set(cellKey(record.position.col, record.position.row), record.id);
    let placedRecord = record;
    if (record.knowledgeNodeId !== undefined && !input.knowledgeCharacterNodeIds.has(record.knowledgeNodeId)) {
      const { knowledgeNodeId: _invalidKnowledgeNodeId, ...withoutKnowledgeReference } = record;
      placedRecord = withoutKnowledgeReference;
      warnings.push(`遭遇 "${record.id}" 的知识人物节点 "${record.knowledgeNodeId}" 不存在或并非人物，见闻引用已忽略`);
    }
    encounters.push({
      record: placedRecord,
      col: record.position.col,
      row: record.position.row,
      profile,
      enemyArts,
    });
  }

  return { encounters, warnings, skippedOtherMap };
}

// ---------------------------------------------------------------------------
// Encounter targeting
// ---------------------------------------------------------------------------

/**
 * Picks the battle trigger among placed encounters: only four-way adjacent
 * cells qualify. Equal distances break by ascending encounter id, mirroring
 * the NPC interaction rule, so the outcome is deterministic for every data
 * set. Callers pass only the encounters that should stay active (e.g. not
 * yet completed, or repeatable ones).
 */
export function selectEncounterTarget(
  encounters: readonly PlacedEncounter[],
  from: CellPosition,
): PlacedEncounter | null {
  let best: PlacedEncounter | null = null;
  for (const encounter of encounters) {
    const distance = manhattanDistance(from, { col: encounter.col, row: encounter.row });
    if (distance !== 1) {
      continue; // Only four-way adjacency counts as interactable.
    }
    if (best === null || encounter.record.id < best.record.id) {
      best = encounter;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Combat math (fixed protocol, data supplies the numbers)
// ---------------------------------------------------------------------------

/** Attack damage: `max(1, power + attacker.force − floor(defender.body / 3))`. */
export function computeAttackDamage(
  power: number,
  attackerForce: number,
  defenderBody: number,
): number {
  return Math.max(1, Math.trunc(power + attackerForce - Math.floor(defenderBody / 3)));
}

/** Applies a one-hit guard while keeping attack damage at least one. */
export function computeDamageAfterGuard(
  incomingDamage: number,
  guardPower: number,
): { damage: number; prevented: number } {
  const incoming = Math.max(1, Math.trunc(incomingDamage));
  const damage = Math.max(1, incoming - Math.max(0, Math.trunc(guardPower)));
  return { damage, prevented: incoming - damage };
}

/** Heal amount: `power + floor(actor.resolve / 2)`. */
export function computeHealAmount(power: number, actorResolve: number): number {
  return Math.trunc(power + Math.floor(actorResolve / 2));
}

/** Deterministic strongest-action selection with an id tie-break. */
function strongestAffordableArt(
  arts: readonly MartialArtData[],
  availableQi: number,
  kind: 'attack' | 'guard',
): MartialArtData | null {
  return arts
    .filter((art) => art.combat.kind === kind && availableQi >= art.combat.qiCost)
    .reduce<MartialArtData | null>((best, art) => {
      if (best === null || art.combat.power > best.combat.power) return art;
      return art.combat.power === best.combat.power && art.id < best.id ? art : best;
    }, null);
}

// ---------------------------------------------------------------------------
// Combat session
// ---------------------------------------------------------------------------

export type CombatPhase = 'player-turn' | 'enemy-turn' | 'victory' | 'defeat' | 'fled';

/** Why a player action was refused; the turn and all resources stay intact. */
export type ActionRefusalReason = 'not-player-turn' | 'unknown-art' | 'insufficient-qi';

export interface CompanionSupportReceipt {
  kind: 'attack' | 'heal';
  power: number;
  actualAmount: number;
  before: number;
  after: number;
  actionNumber: number;
}

export interface CombatLogEntry {
  kind: 'intro' | 'player-action' | 'companion-action' | 'enemy-action' | 'enemy-idle' | 'victory' | 'defeat' | 'fled';
  text: string;
  companionSupport?: CompanionSupportReceipt;
}

/** Read-only view of one combatant for UI rendering. */
export interface CombatantView {
  name: string;
  health: { current: number; max: number };
  qi: { current: number; max: number };
}

/** One selectable player action and whether it is currently affordable. */
export interface PlayerActionView {
  art: MartialArtData;
  affordable: boolean;
}

export interface CombatResult {
  outcome: 'victory' | 'defeat' | 'fled';
  /** Experience actually granted (post max-level discard); 0 for defeat/fled. */
  experienceGained: number;
  levelsGained: number;
}

export interface CombatSessionConfig {
  encounter: BattleEncounterData;
  profile: CharacterProfileData;
  /**
   * The player's runtime state; mutated in place (resources, experience).
   * Its `martialArtIds` should already be validated — the session resolves
   * each id against `martialArts` and silently skips unknown ones.
   */
  player: CharacterState;
  /** Valid martial arts by id (player and enemy arts resolve here). */
  martialArts: ReadonlyMap<string, MartialArtData>;
  /** Optional automatic support resolved after successful player turns. */
  companion?: { name: string; support: CompanionSupportData };
  /** Optional data-driven cultivation reward applied when victory grants levels. */
  meridianResourceRules?: MeridianResourceRules;
}

/**
 * Pure-logic combat session for one encounter against a single enemy.
 * Alternates player and enemy turns inside {@link playerUse}: the player
 * action resolves first, then — unless the enemy died — the enemy acts, then
 * the phase returns to `player-turn`. Every step appends readable log
 * entries; all names in them come from data, the sentence frames are generic
 * UI mechanics. Deterministic and side-effect-free apart from mutating the
 * supplied player state.
 */
export class CombatSession {
  private readonly encounter: BattleEncounterData;
  private readonly profile: CharacterProfileData;
  private readonly player: CharacterState;
  private readonly playerArts: MartialArtData[];
  private readonly playerName: string;
  private readonly companion: CombatSessionConfig['companion'];
  private readonly meridianResourceRules: MeridianResourceRules | undefined;
  private successfulPlayerActions = 0;
  private playerGuardPower = 0;
  private enemyGuardPower = 0;
  private enemyStepIndex = 0;

  private readonly enemy: CombatantView & { attributes: AttributeMap; arts: MartialArtData[] };

  private phase: CombatPhase = 'player-turn';
  private readonly logEntries: CombatLogEntry[] = [];
  private experienceAwarded = false;
  private result: CombatResult | null = null;

  constructor(config: CombatSessionConfig) {
    this.encounter = config.encounter;
    this.profile = config.profile;
    this.player = config.player;
    this.playerName = config.profile.name;
    this.companion = config.companion;
    this.meridianResourceRules = config.meridianResourceRules;
    this.playerArts = this.player.martialArtIds
      .map((artId) => config.martialArts.get(artId))
      .filter((art): art is MartialArtData => art !== undefined);

    this.enemy = {
      name: config.encounter.enemy.name,
      attributes: { ...config.encounter.enemy.attributes },
      health: {
        current: config.encounter.enemy.health,
        max: config.encounter.enemy.health,
      },
      qi: {
        current: config.encounter.enemy.qi,
        max: config.encounter.enemy.qi,
      },
      arts:
        config.encounter.enemy.martialArtIds
          .map((artId) => config.martialArts.get(artId))
          .filter((art): art is MartialArtData => art !== undefined),
    };

    this.logEntries.push({ kind: 'intro', text: config.encounter.texts.intro });
  }

  get currentPhase(): CombatPhase {
    return this.phase;
  }

  get isOver(): boolean {
    return this.phase === 'victory' || this.phase === 'defeat' || this.phase === 'fled';
  }

  /** Read-only projection of the existing support cadence; no new counters or save fields. */
  get companionCadence(): { name: string; kind: CompanionSupportData['kind']; power: number; everyPlayerActions: number; successfulActions: number; actionsUntilSupport: number } | null {
    if (this.companion === undefined || this.isOver) return null;
    const { name, support } = this.companion;
    return { name, ...support, successfulActions: this.successfulPlayerActions,
      actionsUntilSupport: support.everyPlayerActions - this.successfulPlayerActions % support.everyPlayerActions };
  }

  get log(): readonly CombatLogEntry[] {
    return this.logEntries;
  }

  get finalResult(): CombatResult | null {
    return this.result;
  }

  get playerView(): CombatantView {
    return {
      name: this.playerName,
      health: { current: this.player.health.current, max: this.player.health.max },
      qi: { current: this.player.qi.current, max: this.player.qi.max },
    };
  }

  get enemyView(): CombatantView {
    return {
      name: this.enemy.name,
      health: { ...this.enemy.health },
      qi: { ...this.enemy.qi },
    };
  }

  /** Selectable actions in declaration order, with affordability flags. */
  get playerActions(): PlayerActionView[] {
    return this.playerArts.map((art) => ({
      art,
      affordable: this.player.qi.current >= art.combat.qiCost,
    }));
  }

  /** Preview and execution use the same resolver; reads do not advance AI. */
  private resolveEnemyAction(): { art: MartialArtData | null; cue: string; powerBonus: number; recoverQi: number; guardDisruptsBonus?: boolean } {
    const steps = this.encounter.enemy.behavior;
    const step = steps?.[this.enemyStepIndex % steps.length];
    if (step?.kind === 'recoverQi') return { art: null, cue: step.cue, powerBonus: 0, recoverQi: step.amount };
    if (step?.kind === 'art') {
      const art = this.enemy.arts.find(candidate => candidate.id === step.artId);
      if (art && this.enemy.qi.current >= art.combat.qiCost) return { art, cue: step.cue,
        powerBonus: art.combat.kind === 'attack' ? step.powerBonus ?? 0 : 0, recoverQi: 0, guardDisruptsBonus: step.guardDisruptsBonus };
    }
    const art = strongestAffordableArt(this.enemy.arts, this.enemy.qi.current, 'attack') ??
      strongestAffordableArt(this.enemy.arts, this.enemy.qi.current, 'guard');
    return { art, cue: step ? '预定招式内力不足或失效，改用可用招式' : '', powerBonus: 0, recoverQi: 0 };
  }

  /** Null after settlement; legacy enemies retain their old unannounced AI. */
  get enemyIntent(): string | null {
    if (this.isOver || !this.encounter.enemy.behavior) return null;
    const action = this.resolveEnemyAction();
    const prefix = `${action.cue} · `;
    if (action.recoverQi > 0) return prefix + `回气 ${Math.min(action.recoverQi, this.enemy.qi.max - this.enemy.qi.current)}，本回合不攻击`;
    if (!action.art) return prefix + '无可用招式，本回合停手';
    const art = action.art;
    const effect = art.combat.kind === 'attack' ? `预计未守御伤害 ${computeAttackDamage(art.combat.power + action.powerBonus, this.enemy.attributes.force, this.player.attributes.body)}` :
      art.combat.kind === 'guard' ? `下一击至多减伤 ${art.combat.power}` : `最多疗伤 ${computeHealAmount(art.combat.power, this.enemy.attributes.resolve)}`;
    return prefix + `「${art.name}」${effect}，耗气 ${art.combat.qiCost}${action.guardDisruptsBonus ? '；守御可卸蓄势' : ''}`;
  }

  /**
   * Attempts one player action. An unknown art or one the player cannot
   * afford is refused without consuming the turn or any resource. A valid
   * action resolves, then the enemy follows its declared cycle, or the legacy
   * strongest-affordable attack/guard fallback (ties by ascending art id;
   * an enemy with neither passes), then the phase returns to `player-turn`
   * unless someone fell.
   */
  playerUse(artId: string): { ok: true } | { ok: false; reason: ActionRefusalReason } {
    if (this.phase !== 'player-turn') {
      return { ok: false, reason: 'not-player-turn' };
    }
    const art = this.playerArts.find((candidate) => candidate.id === artId);
    if (art === undefined) {
      return { ok: false, reason: 'unknown-art' };
    }
    if (this.player.qi.current < art.combat.qiCost) {
      return { ok: false, reason: 'insufficient-qi' };
    }

    this.player.qi.current -= art.combat.qiCost;
    if (art.combat.kind === 'attack') {
      const baseDamage = computeAttackDamage(
        art.combat.power,
        this.player.attributes.force,
        this.enemy.attributes.body,
      );
      const guarded = computeDamageAfterGuard(baseDamage, this.enemyGuardPower);
      this.enemyGuardPower = 0;
      const damage = guarded.damage;
      this.enemy.health.current = Math.max(0, this.enemy.health.current - damage);
      this.logEntries.push({
        kind: 'player-action',
        text: `${this.playerName}使出「${art.name}」，对${this.enemy.name}造成 ${damage} 点伤害${
          guarded.prevented > 0 ? `（守御抵挡 ${guarded.prevented} 点）` : ''
        }`,
      });
    } else if (art.combat.kind === 'heal') {
      const amount = computeHealAmount(art.combat.power, this.player.attributes.resolve);
      const healed = Math.min(amount, this.player.health.max - this.player.health.current);
      this.player.health.current += healed;
      this.logEntries.push({
        kind: 'player-action',
        text: `${this.playerName}运起「${art.name}」，恢复 ${healed} 点生命`,
      });
    } else {
      this.playerGuardPower = Math.max(this.playerGuardPower, art.combat.power);
      this.logEntries.push({
        kind: 'player-action',
        text: `${this.playerName}使出「${art.name}」，摆出守势（下次受击至多减伤 ${this.playerGuardPower} 点）`,
      });
    }

    if (this.enemy.health.current <= 0) {
      this.settleVictory();
      return { ok: true };
    }

    this.successfulPlayerActions += 1;
    this.companionTurn();
    if (this.enemy.health.current <= 0) {
      this.settleVictory();
      return { ok: true };
    }

    this.enemyTurn();
    return { ok: true };
  }

  /** Yield a real turn: no free healing, qi or new guard; enemy still acts. */
  playerWait(): { ok: true } | { ok: false; reason: ActionRefusalReason } {
    if (this.phase !== 'player-turn') return { ok: false, reason: 'not-player-turn' };
    this.logEntries.push({ kind: 'player-action', text: `${this.playerName}暂缓出招，未回复生命或内力；仍将承受敌方行动` });
    this.successfulPlayerActions += 1;
    this.companionTurn();
    if (this.enemy.health.current <= 0) this.settleVictory();
    else this.enemyTurn();
    return { ok: true };
  }

  /** Data-authored support fires every N accepted player actions. */
  private companionTurn(): void {
    const companion = this.companion;
    if (companion === undefined || this.successfulPlayerActions % companion.support.everyPlayerActions !== 0) return;
    if (companion.support.kind === 'attack') {
      const before = this.enemy.health.current;
      const damage = Math.min(companion.support.power, before);
      this.enemy.health.current = before - damage;
      this.logEntries.push({
        kind: 'companion-action',
        text: `${companion.name}援手一击，对${this.enemy.name}造成 ${damage} 点伤害（生命 ${before}→${this.enemy.health.current}）`,
        companionSupport: { kind: 'attack', power: companion.support.power, actualAmount: damage, before, after: this.enemy.health.current, actionNumber: this.successfulPlayerActions },
      });
      return;
    }
    const before = this.player.health.current;
    const healed = Math.min(companion.support.power, this.player.health.max - before);
    this.player.health.current = before + healed;
    this.logEntries.push({
      kind: 'companion-action',
      text: `${companion.name}出手相助，为${this.playerName}恢复 ${healed} 点生命（${before}→${this.player.health.current}）`,
      companionSupport: { kind: 'heal', power: companion.support.power, actualAmount: healed, before, after: this.player.health.current, actionNumber: this.successfulPlayerActions },
    });
  }

  /**
   * Flees the battle: allowed only on the player's turn, awards nothing and
   * ends the session immediately (the enemy does not answer).
   */
  flee(): { ok: true } | { ok: false; reason: 'not-player-turn' | 'already-over' } {
    if (this.isOver) {
      return { ok: false, reason: 'already-over' };
    }
    if (this.phase !== 'player-turn') {
      return { ok: false, reason: 'not-player-turn' };
    }
    this.phase = 'fled';
    this.logEntries.push({ kind: 'fled', text: this.encounter.texts.flee });
    this.result = { outcome: 'fled', experienceGained: 0, levelsGained: 0 };
    return { ok: true };
  }

  /** Execute the declared cycle step or the legacy affordable fallback. */
  private enemyTurn(): void {
    const action = this.resolveEnemyAction();
    this.enemyStepIndex += 1;
    if (action.recoverQi > 0) {
      const gained = Math.min(action.recoverQi, this.enemy.qi.max - this.enemy.qi.current);
      this.enemy.qi.current += gained;
      this.logEntries.push({ kind: 'enemy-idle', text: `${this.enemy.name}收势调息，恢复 ${gained} 点内力` });
      this.phase = 'player-turn';
      return;
    }
    if (action.art?.combat.kind === 'heal') {
      this.enemy.qi.current -= action.art.combat.qiCost;
      const healed = Math.min(computeHealAmount(action.art.combat.power, this.enemy.attributes.resolve), this.enemy.health.max - this.enemy.health.current);
      this.enemy.health.current += healed;
      this.logEntries.push({ kind: 'enemy-action', text: `${this.enemy.name}运起「${action.art.name}」，恢复 ${healed} 点生命` });
      this.phase = 'player-turn';
      return;
    }
    const attack = action.art?.combat.kind === 'attack' ? action.art : null;
    if (attack === null) {
      const guard = action.art?.combat.kind === 'guard' ? action.art : null;
      if (guard !== null) {
        this.enemy.qi.current -= guard.combat.qiCost;
        this.enemyGuardPower = Math.max(this.enemyGuardPower, guard.combat.power);
        this.logEntries.push({
          kind: 'enemy-action',
          text: `${this.enemy.name}使出「${guard.name}」，摆出守势（下次受击至多减伤 ${this.enemyGuardPower} 点）`,
        });
        this.phase = 'player-turn';
        return;
      }
      this.logEntries.push({
        kind: 'enemy-idle',
        text: `${this.enemy.name}内力不济，蓄势未发`,
      });
      this.phase = 'player-turn';
      return;
    }

    this.enemy.qi.current -= attack.combat.qiCost;
    const disrupted = action.guardDisruptsBonus === true && this.playerGuardPower > 0;
    const baseDamage = computeAttackDamage(
      attack.combat.power + (disrupted ? 0 : action.powerBonus),
      this.enemy.attributes.force,
      this.player.attributes.body,
    );
    const guarded = computeDamageAfterGuard(baseDamage, this.playerGuardPower);
    this.playerGuardPower = 0;
    const damage = guarded.damage;
    this.player.health.current = Math.max(0, this.player.health.current - damage);
    this.logEntries.push({
      kind: 'enemy-action',
      text: `${this.enemy.name}使出「${attack.name}」，对${this.playerName}造成 ${damage} 点伤害${
          guarded.prevented > 0 ? `（守御抵挡 ${guarded.prevented} 点${disrupted ? '，蓄势已卸去' : ''}）` : ''
      }`,
    });

    if (this.player.health.current <= 0) {
      this.settleDefeat();
      return;
    }
    this.phase = 'player-turn';
  }

  /**
   * Ends the battle with a win: grants the encounter's experience exactly
   * once through the Round 04 progression API and appends the data victory
   * line.
   */
  private settleVictory(): void {
    this.phase = 'victory';
    let experienceGained = 0;
    let levelsGained = 0;
    if (!this.experienceAwarded) {
      this.experienceAwarded = true;
      const granted = grantExperience(this.profile, this.player, this.encounter.victoryExperience);
      if (this.meridianResourceRules !== undefined) {
        awardCultivationPoints(this.player, granted.levelsGained, this.meridianResourceRules);
      }
      experienceGained = this.encounter.victoryExperience - granted.discardedExperience;
      levelsGained = granted.levelsGained;
    }
    this.logEntries.push({ kind: 'victory', text: this.encounter.texts.victory });
    this.result = { outcome: 'victory', experienceGained, levelsGained };
  }

  /**
   * Ends the battle with a loss: restores the player to the encounter's
   * declared ratios of the maxima (always to at least 1 health so
   * exploration can continue) and appends the data defeat line.
   */
  private settleDefeat(): void {
    this.phase = 'defeat';
    const { healthRatio, qiRatio } = this.encounter.defeatRecovery;
    this.player.health.current = Math.max(
      1,
      Math.ceil(this.player.health.max * healthRatio),
    );
    this.player.qi.current = Math.max(
      this.player.qi.current,
      Math.ceil(this.player.qi.max * qiRatio),
    );
    this.logEntries.push({ kind: 'defeat', text: this.encounter.texts.defeat });
    this.result = { outcome: 'defeat', experienceGained: 0, levelsGained: 0 };
  }
}
