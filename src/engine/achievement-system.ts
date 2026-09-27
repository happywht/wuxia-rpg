/** Data-authored achievement conditions, progress projection and one-shot unlocks. */
import type { ArenaRecord } from './arena-challenge';
import type { CharacterState } from './character-progression';
import type { FactionMembership } from './faction-system';
import type { QuestStatus } from './quest-system';
import { getRelationship, type SocialState } from './social-state';

const MAX_COUNTER = 999_999_999;

interface ConditionBase { hint: string }
interface NumericRange { minValue?: number; maxValue?: number }
interface MinimumCount { minCount: number }

export type AchievementConditionData =
  | (ConditionBase & { kind: 'playerLevel'; minLevel: number })
  | (ConditionBase & MinimumCount & { kind: 'completedQuestCount' })
  | (ConditionBase & MinimumCount & { kind: 'knownKnowledgeCount' })
  | (ConditionBase & { kind: 'knowledgeKnown'; nodeId: string })
  | (ConditionBase & { kind: 'morality'; minValue?: number; maxValue?: number })
  | (ConditionBase & { kind: 'renown'; minValue?: number; maxValue?: number })
  | (ConditionBase & NumericRange & { kind: 'npcRelationship'; npcId: string })
  | (ConditionBase & { kind: 'factionMembership'; factionId?: string; isMember: boolean })
  | (ConditionBase & MinimumCount & { kind: 'battleVictories' })
  | (ConditionBase & MinimumCount & { kind: 'arenaChampionships' })
  | (ConditionBase & MinimumCount & { kind: 'meridianNodes' })
  | (ConditionBase & MinimumCount & { kind: 'customMartialArts' })
  | (ConditionBase & MinimumCount & { kind: 'equipmentCrafts' })
  | (ConditionBase & MinimumCount & { kind: 'alchemyCrafts' });

export interface AchievementRewardData {
  experience?: number;
  currency?: number;
}

export interface AchievementData {
  id: string;
  title: string;
  description: string;
  priority: number;
  conditions: AchievementConditionData[];
  reward: AchievementRewardData;
}

export interface AchievementSetData {
  id: string;
  achievements: AchievementData[];
}

export interface AchievementRunState {
  /** Stable historical ids; unknown ids are kept to prevent MOD toggle re-awards. */
  unlockedIds: string[];
  battleVictories: number;
  equipmentCrafts: number;
  alchemyCrafts: number;
}

export function createAchievementRunState(): AchievementRunState {
  return { unlockedIds: [], battleVictories: 0, equipmentCrafts: 0, alchemyCrafts: 0 };
}

export type AchievementCounter = 'battleVictories' | 'equipmentCrafts' | 'alchemyCrafts';

/** Monotonic and saturating counter update; the input state is not mutated. */
export function recordAchievementCounter(
  state: AchievementRunState,
  counter: AchievementCounter,
  amount = 1,
): AchievementRunState {
  if (!Number.isSafeInteger(amount) || amount <= 0) return state;
  return {
    ...state,
    [counter]: Math.min(MAX_COUNTER, state[counter] + amount),
    unlockedIds: [...state.unlockedIds],
  };
}

export type AchievementParseResult =
  | { ok: true; set: AchievementSetData; warnings: string[] }
  | { ok: false; errors: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function identifier(value: unknown, prefix = ''): value is string {
  return text(value, 96) && value.startsWith(prefix) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.slice(prefix.length));
}

function parseRange(
  value: Record<string, unknown>,
  min: number,
  max: number,
): NumericRange | null {
  const minValue = value.minValue;
  const maxValue = value.maxValue;
  if ((minValue === undefined && maxValue === undefined) ||
    (minValue !== undefined && !integer(minValue, min, max)) ||
    (maxValue !== undefined && !integer(maxValue, min, max)) ||
    (minValue !== undefined && maxValue !== undefined && minValue > maxValue)) return null;
  return {
    ...(minValue === undefined ? {} : { minValue: minValue as number }),
    ...(maxValue === undefined ? {} : { maxValue: maxValue as number }),
  };
}

function parseCondition(raw: unknown): AchievementConditionData | null {
  if (!object(raw) || !text(raw.hint, 140)) return null;
  const hint = raw.hint;
  switch (raw.kind) {
    case 'playerLevel':
      return integer(raw.minLevel, 1, 99) ? { kind: 'playerLevel', hint, minLevel: raw.minLevel } : null;
    case 'completedQuestCount':
    case 'knownKnowledgeCount':
    case 'battleVictories':
    case 'arenaChampionships':
    case 'meridianNodes':
    case 'customMartialArts':
    case 'equipmentCrafts':
    case 'alchemyCrafts': {
      const maximum = raw.kind === 'completedQuestCount' ? 256
        : raw.kind === 'knownKnowledgeCount' ? 4096
          : raw.kind === 'arenaChampionships' ? 99_999
            : raw.kind === 'meridianNodes' ? 64
              : raw.kind === 'customMartialArts' ? 128
                : 999_999;
      return integer(raw.minCount, 1, maximum)
        ? { kind: raw.kind, hint, minCount: raw.minCount } as AchievementConditionData
        : null;
    }
    case 'morality': {
      const range = parseRange(raw, -100, 100);
      return range === null ? null : { kind: 'morality', hint, ...range };
    }
    case 'knowledgeKnown':
      return identifier(raw.nodeId)
        ? { kind: 'knowledgeKnown', hint, nodeId: raw.nodeId }
        : null;
    case 'renown': {
      const range = parseRange(raw, 0, 1000);
      return range === null ? null : { kind: 'renown', hint, ...range };
    }
    case 'npcRelationship': {
      const range = parseRange(raw, -100, 100);
      return range === null || !identifier(raw.npcId, 'char.')
        ? null
        : { kind: 'npcRelationship', hint, npcId: raw.npcId, ...range };
    }
    case 'factionMembership':
      return typeof raw.isMember === 'boolean' &&
        (raw.factionId === undefined || identifier(raw.factionId, 'faction.'))
        ? {
            kind: 'factionMembership',
            hint,
            isMember: raw.isMember,
            ...(raw.factionId === undefined ? {} : { factionId: raw.factionId }),
          }
        : null;
    default:
      return null;
  }
}

/** Defensive parser complements the static JSON Schema and isolates each bad entry. */
export function parseAchievementSet(raw: unknown): AchievementParseResult {
  if (!object(raw) || !identifier(raw.id, 'achievement.set.') ||
    !Array.isArray(raw.achievements) || raw.achievements.length < 1 || raw.achievements.length > 128) {
    return { ok: false, errors: ['id/achievements：成就集结构无效（应含 1–128 项）'] };
  }
  const warnings: string[] = [];
  const seen = new Set<string>();
  const achievements: AchievementData[] = [];
  raw.achievements.forEach((entry, index) => {
    const label = 'achievements[' + index + ']';
    if (!object(entry) || !identifier(entry.id, 'achievement.') || seen.has(entry.id)) {
      warnings.push(label + '.id：成就 id 无效或重复，已禁用该条');
      return;
    }
    const reward = object(entry.reward) ? entry.reward : null;
    const rewardExperience = reward?.experience;
    const rewardCurrency = reward?.currency;
    const rewardValid = reward !== null &&
      (rewardExperience === undefined || integer(rewardExperience, 1, 100000)) &&
      (rewardCurrency === undefined || integer(rewardCurrency, 1, 1000000)) &&
      ((typeof rewardExperience === 'number' && rewardExperience > 0) ||
        (typeof rewardCurrency === 'number' && rewardCurrency > 0));
    if (!text(entry.title, 48) || !text(entry.description, 240) ||
      !integer(entry.priority, -1000, 1000) || !Array.isArray(entry.conditions) ||
      entry.conditions.length < 1 || entry.conditions.length > 12 || !rewardValid) {
      warnings.push(label + '：名称、说明、优先级、条件或奖励无效，已禁用该条');
      return;
    }
    const conditions: AchievementConditionData[] = [];
    let valid = true;
    entry.conditions.forEach((condition, conditionIndex) => {
      const parsed = parseCondition(condition);
      if (parsed === null) {
        warnings.push(label + '.conditions[' + conditionIndex + ']：条件无效，已禁用该条');
        valid = false;
      } else conditions.push(parsed);
    });
    if (!valid) return;
    seen.add(entry.id);
    achievements.push({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      priority: entry.priority,
      conditions,
      reward: {
        ...(rewardExperience === undefined ? {} : { experience: rewardExperience as number }),
        ...(rewardCurrency === undefined ? {} : { currency: rewardCurrency as number }),
      },
    });
  });
  return {
    ok: true,
    set: { id: raw.id, achievements },
    warnings,
  };
}

export interface AchievementAssemblyInput {
  set: AchievementSetData | null;
  npcIds: ReadonlySet<string>;
  factionIds: ReadonlySet<string>;
  knowledgeNodeIds: ReadonlySet<string>;
}

/** Cross-validates references and drops only an achievement with a bad reference. */
export function assembleAchievementSet(
  input: AchievementAssemblyInput,
): { set: AchievementSetData | null; warnings: string[] } {
  if (input.set === null) return { set: null, warnings: [] };
  const warnings: string[] = [];
  const achievements = input.set.achievements.filter((achievement) => {
    for (const condition of achievement.conditions) {
      if (condition.kind === 'npcRelationship' && !input.npcIds.has(condition.npcId)) {
        warnings.push('成就 "' + achievement.id + '" 引用不存在的人物 "' + condition.npcId + '"，已禁用该条');
        return false;
      }
      if (condition.kind === 'factionMembership' && condition.factionId !== undefined &&
        !input.factionIds.has(condition.factionId)) {
        warnings.push('成就 "' + achievement.id + '" 引用不存在的门派 "' + condition.factionId + '"，已禁用该条');
        return false;
      }
      if (condition.kind === 'knowledgeKnown' && !input.knowledgeNodeIds.has(condition.nodeId)) {
        warnings.push('成就 "' + achievement.id + '" 引用不存在的知识节点 "' + condition.nodeId + '"，已禁用该条');
        return false;
      }
    }
    return true;
  });
  return { set: { id: input.set.id, achievements }, warnings };
}

export interface AchievementEvaluationContext {
  character: Pick<CharacterState, 'level' | 'unlockedMeridianNodeIds' | 'martialArtIds'>;
  customMartialArtCount: number;
  questStatuses: ReadonlyMap<string, QuestStatus>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  social: Readonly<SocialState>;
  factionMembership: FactionMembership | null;
  relationships: ReadonlyMap<string, number>;
  arenaRecords: ReadonlyMap<string, ArenaRecord>;
  state: AchievementRunState;
}

export interface AchievementConditionProgress {
  hint: string;
  met: boolean;
  currentText: string;
  targetText: string;
}

export interface EvaluatedAchievement {
  achievement: AchievementData;
  unlocked: boolean;
  met: boolean;
  metConditionCount: number;
  conditions: AchievementConditionProgress[];
}

function rangeProgress(
  value: number,
  condition: NumericRange,
): { met: boolean; currentText: string; targetText: string } {
  return {
    met: (condition.minValue === undefined || value >= condition.minValue) &&
      (condition.maxValue === undefined || value <= condition.maxValue),
    currentText: String(value),
    targetText: condition.minValue !== undefined && condition.maxValue !== undefined
      ? condition.minValue + '–' + condition.maxValue
      : condition.minValue !== undefined
        ? '≥ ' + condition.minValue
        : '≤ ' + condition.maxValue,
  };
}

function evaluateCondition(
  condition: AchievementConditionData,
  context: AchievementEvaluationContext,
): AchievementConditionProgress {
  const countProgress = (current: number, target: number): AchievementConditionProgress => ({
    hint: condition.hint,
    met: current >= target,
    currentText: String(current),
    targetText: String(target),
  });
  switch (condition.kind) {
    case 'playerLevel':
      return countProgress(context.character.level, condition.minLevel);
    case 'completedQuestCount':
      return countProgress(
        [...context.questStatuses.values()].filter((status) => status === 'completed').length,
        condition.minCount,
      );
    case 'knownKnowledgeCount':
      return countProgress(context.knownKnowledgeNodeIds.size, condition.minCount);
    case 'knowledgeKnown': {
      const known = context.knownKnowledgeNodeIds.has(condition.nodeId);
      return {
        hint: condition.hint,
        met: known,
        currentText: known ? '已发现' : '未发现',
        targetText: '已发现',
      };
    }
    case 'morality':
      return { hint: condition.hint, ...rangeProgress(context.social.morality, condition) };
    case 'renown':
      return { hint: condition.hint, ...rangeProgress(context.social.renown, condition) };
    case 'npcRelationship':
      return {
        hint: condition.hint,
        ...rangeProgress(context.relationships.get(condition.npcId) ??
          getRelationship(context.social, condition.npcId), condition),
      };
    case 'factionMembership': {
      const member = condition.factionId === undefined
        ? context.factionMembership !== null
        : context.factionMembership?.factionId === condition.factionId;
      return {
        hint: condition.hint,
        met: member === condition.isMember,
        currentText: member ? '是' : '否',
        targetText: condition.isMember ? '是' : '否',
      };
    }
    case 'battleVictories':
      return countProgress(context.state.battleVictories, condition.minCount);
    case 'arenaChampionships':
      return countProgress(
        [...context.arenaRecords.values()].reduce((sum, record) => sum + record.championships, 0),
        condition.minCount,
      );
    case 'meridianNodes':
      return countProgress(context.character.unlockedMeridianNodeIds.length, condition.minCount);
    case 'customMartialArts':
      return countProgress(context.customMartialArtCount, condition.minCount);
    case 'equipmentCrafts':
      return countProgress(context.state.equipmentCrafts, condition.minCount);
    case 'alchemyCrafts':
      return countProgress(context.state.alchemyCrafts, condition.minCount);
  }
}

/** Pure progress projection. The input state and all referenced maps/sets remain unchanged. */
export function evaluateAchievements(
  set: AchievementSetData | null,
  context: AchievementEvaluationContext,
): EvaluatedAchievement[] {
  if (set === null) return [];
  const unlocked = new Set(context.state.unlockedIds);
  return [...set.achievements]
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .map((achievement) => {
      const conditions = achievement.conditions.map((condition) => evaluateCondition(condition, context));
      const metConditionCount = conditions.filter((condition) => condition.met).length;
      return {
        achievement,
        unlocked: unlocked.has(achievement.id),
        met: conditions.length > 0 && metConditionCount === conditions.length,
        metConditionCount,
        conditions,
      };
    });
}

/** Latches newly met ids so later condition changes or repeated calls never pay twice. */
export function unlockReadyAchievements(
  set: AchievementSetData | null,
  state: AchievementRunState,
  context: AchievementEvaluationContext,
): { state: AchievementRunState; newlyUnlocked: AchievementData[] } {
  const existing = new Set(state.unlockedIds);
  const newlyUnlocked = evaluateAchievements(set, { ...context, state })
    .filter((row) => row.met && !existing.has(row.achievement.id))
    .map((row) => row.achievement);
  if (newlyUnlocked.length === 0) return { state, newlyUnlocked };
  return {
    state: {
      ...state,
      unlockedIds: [...state.unlockedIds, ...newlyUnlocked.map((achievement) => achievement.id)],
    },
    newlyUnlocked,
  };
}
