/**
 * Round 07 quest protocol and Phaser-free journal state machine.
 *
 * Quest names, descriptions, objectives, failure targets and reward values
 * are authored in JSON. This module owns only generic parsing, cross-resource
 * validation, objective progress and one-time reward transitions.
 */

export type QuestObjectiveKind = 'collectItem' | 'defeatEncounter' | 'talkToNpc' | 'discoverKnowledge' | 'craftRecipe' | 'useItem' | 'equipItem';

export interface QuestObjectiveData {
  id: string;
  kind: QuestObjectiveKind;
  targetId: string;
  requiredCount: number;
  text: string;
  /** Equivalent item outcomes (for example quality tiers); action objectives only. */
  alternativeTargetIds?: string[];
  /** Optional victory equipment gate; historical victories cannot prove it. */
  requiredEquippedItemId?: string;
  /** Optional NPC waypoint for dialogue-backed discovery events. */
  navigationNpcId?: string;
}

export interface QuestRewardsData {
  experience: number;
  currency: number;
  /** Optional one-time standing changes paid only when the task completes. */
  factionRenown?: QuestFactionRenownReward[];
  /** Optional knowledge discoveries paid with the same completion transition. */
  discoverKnowledgeNodeIds?: string[];
}

export interface QuestFactionRenownReward {
  factionId: string;
  delta: number;
}

export interface QuestData {
  id: string;
  name: string;
  description: string;
  giverNpcId: string;
  prerequisiteQuestIds: string[];
  /** Optional eligibility gates checked by the quest board and acceptance API. */
  requiredFactionId?: string;
  requiredKnowledgeNodeId?: string;
  /**
   * Optional exclusive branch group: members with the same group id and the
   * same prerequisites form one player choice; accepting any member fails its
   * offered siblings. Groups with fewer than two valid members or mixed
   * prerequisites are disabled as a whole during assembly.
   */
  exclusiveGroupId?: string;
  /** Optional staged objectives; omitted retains legacy parallel signals. */
  orderedObjectives?: boolean;
  objectives: QuestObjectiveData[];
  failOnEncounterIds: string[];
  rewards: QuestRewardsData;
}

export interface QuestSetData {
  quests: QuestData[];
}

export type QuestSetParseResult =
  | { ok: true; set: QuestSetData }
  | { ok: false; errors: string[] };

export interface QuestIndex {
  byId: ReadonlyMap<string, QuestData>;
  duplicateIds: readonly string[];
}

export interface QuestAssemblyInput {
  questSet: QuestSetData | null;
  /** NPCs which survived NPC placement and explicitly publish tasks. */
  questGiverNpcIds: ReadonlySet<string>;
  /** Every placed NPC id; talk objectives resolve against this roster. */
  npcIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
  encounterIds: ReadonlySet<string>;
  /** Recipe ids from validated, usable crafting stations. */
  recipeIds?: ReadonlySet<string>;
  itemCategories?: ReadonlyMap<string, string>;
  /** Optional reference catalogs; required quest gates are checked when provided. */
  factionIds?: ReadonlySet<string>;
  knowledgeNodeIds?: ReadonlySet<string>;
}

export interface QuestAssemblyResult {
  quests: ReadonlyMap<string, QuestData>;
  warnings: readonly string[];
}

export type QuestStatus = 'locked' | 'offered' | 'active' | 'completed' | 'failed';

export interface QuestProgressState {
  questId: string;
  status: QuestStatus;
  /** Objective id → current count, clamped to its declared requirement. */
  objectiveCounts: Map<string, number>;
}

/** Runtime journal; a versioned save snapshot carries its statuses and progress. */
export interface QuestJournal {
  states: Map<string, QuestProgressState>;
  trackedQuestId: string | null;
}

/** Live facts required by quests which declare faction/lore eligibility. */
export interface QuestAccessContext {
  factionId?: string | null;
  knownKnowledgeNodeIds?: ReadonlySet<string>;
  completedEncounterIds?: ReadonlySet<string>;
}

export interface QuestRewardGrant {
  questId: string;
  experience: number;
  currency: number;
  factionRenown?: readonly QuestFactionRenownReward[];
  discoverKnowledgeNodeIds?: readonly string[];
}

export interface QuestUpdateResult {
  changed: boolean;
  completed: readonly QuestRewardGrant[];
  failedQuestIds: readonly string[];
}

export type QuestSignal =
  | { type: 'item-count'; itemId: string; quantity: number }
  | { type: 'recipe-crafted'; recipeId: string }
  | { type: 'item-used'; itemId: string }
  | { type: 'item-equipped'; itemId: string }
  | { type: 'encounter-victory'; encounterId: string; equippedItemIds?: readonly string[] }
  | { type: 'encounter-defeat'; encounterId: string }
  | { type: 'npc-talk'; npcId: string }
  | { type: 'knowledge-discovery'; nodeId: string };

export type QuestActionResult =
  | { ok: true; update: QuestUpdateResult }
  | { ok: false; reason: 'unknown-quest' | 'not-offered' | 'not-active' | 'wrong-faction' | 'missing-knowledge'; update: QuestUpdateResult };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safeNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseIdList(value: unknown, label: string, errors: string[]): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${label}：应为数组`);
    return null;
  }
  const result: string[] = [];
  for (const [index, entry] of value.entries()) {
    const id = string(entry);
    if (id === null) {
      errors.push(`${label}[${index}]：应为非空字符串`);
      continue;
    }
    if (result.includes(id)) {
      errors.push(`${label}[${index}]：id "${id}" 重复`);
      continue;
    }
    result.push(id);
  }
  return result;
}

function parseFactionRenownRewards(
  value: unknown,
  label: string,
  errors: string[],
): QuestFactionRenownReward[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label}：应为门派声望奖励数组`);
    return null;
  }
  const seen = new Set<string>();
  const rewards: QuestFactionRenownReward[] = [];
  value.forEach((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${itemLabel}：应为对象`);
      return;
    }
    const factionId = string(entry.factionId);
    const delta = entry.delta;
    const validDelta = typeof delta === 'number' && Number.isSafeInteger(delta) &&
      delta !== 0 && delta >= -1000 && delta <= 1000;
    if (factionId === null) errors.push(`${itemLabel}.factionId：应为非空字符串`);
    else if (seen.has(factionId)) errors.push(`${itemLabel}.factionId：同一任务不可重复奖励此门派`);
    if (!validDelta) errors.push(`${itemLabel}.delta：应为 -1000…1000 之间的非零安全整数`);
    if (factionId !== null && validDelta && !seen.has(factionId)) {
      seen.add(factionId);
      rewards.push({ factionId, delta: delta as number });
    }
  });
  return rewards;
}

const OBJECTIVE_KINDS: readonly QuestObjectiveKind[] = [
  'collectItem', 'defeatEncounter', 'talkToNpc', 'discoverKnowledge', 'craftRecipe', 'useItem', 'equipItem',
];

function parseObjective(raw: unknown, label: string, errors: string[]): QuestObjectiveData | null {
  if (!isPlainObject(raw)) {
    errors.push(`${label}：应为对象`);
    return null;
  }
  const id = string(raw.id);
  const kind = raw.kind;
  const targetId = string(raw.targetId);
  const requiredCount = safeNonNegativeInteger(raw.requiredCount);
  const text = string(raw.text);
  const maximumCount = kind === 'collectItem' ? 999 : kind === 'discoverKnowledge' ? 1 : 99;
  const problems: string[] = [];
  const alternativeTargetIds = parseIdList(raw.alternativeTargetIds, `${label}.alternativeTargetIds`, errors);
  if (raw.alternativeTargetIds !== undefined && kind !== 'useItem' && kind !== 'equipItem') {
    problems.push('alternativeTargetIds 仅用于使用/装备目标');
  }
  if (alternativeTargetIds === null || alternativeTargetIds.includes(targetId ?? '')) {
    problems.push('替代目标不得重复主目标');
  }
  if ((alternativeTargetIds?.length ?? 0) > 16) problems.push('替代目标最多16项');
  if (raw.requiredEquippedItemId !== undefined && (kind !== 'defeatEncounter' || string(raw.requiredEquippedItemId) === null)) {
    problems.push('requiredEquippedItemId 仅用于战胜目标且应为非空ID');
  }
  const navigationNpcId = raw.navigationNpcId === undefined ? undefined : string(raw.navigationNpcId);
  if (raw.navigationNpcId !== undefined && (kind !== 'discoverKnowledge' || navigationNpcId === null)) {
    problems.push('navigationNpcId 仅用于发现见闻目标且应为非空NPC ID');
  }
  if (id === null) problems.push('id 应为非空字符串');
  if (!OBJECTIVE_KINDS.includes(kind as QuestObjectiveKind)) {
    problems.push(`kind 必须是 ${OBJECTIVE_KINDS.join(' 或 ')}`);
  }
  if (targetId === null) problems.push('targetId 应为非空字符串');
  if (requiredCount === null || requiredCount <= 0 || requiredCount > maximumCount) {
    problems.push(`requiredCount 应为 1–${maximumCount} 的安全整数`);
  }
  if (text === null) problems.push('text 应为非空字符串');
  if (problems.length > 0 || id === null || targetId === null || text === null || requiredCount === null) {
    errors.push(`${label}：${problems.join('；')}`);
    return null;
  }
  return { id, kind: kind as QuestObjectiveKind, targetId, requiredCount, text,
    ...(raw.requiredEquippedItemId === undefined ? {} : { requiredEquippedItemId: raw.requiredEquippedItemId as string }),
    ...(navigationNpcId === undefined ? {} : { navigationNpcId: navigationNpcId! }),
    ...(raw.alternativeTargetIds === undefined ? {} : { alternativeTargetIds: alternativeTargetIds! }) };
}

/** Defensive parser; schema validation still runs first in the data loader. */
export function parseQuestSet(raw: unknown): QuestSetParseResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.quests)) {
    return { ok: false, errors: ['quests：应为任务条目数组'] };
  }
  const errors: string[] = [];
  const quests: QuestData[] = [];
  raw.quests.forEach((entry, index) => {
    const label = `quests[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }
    const id = string(entry.id);
    const name = string(entry.name);
    const description = string(entry.description);
    const giverNpcId = string(entry.giverNpcId);
    const exclusiveGroupId = entry.exclusiveGroupId === undefined
      ? undefined
      : string(entry.exclusiveGroupId);
    const requiredFactionId = entry.requiredFactionId === undefined
      ? undefined
      : string(entry.requiredFactionId);
    const requiredKnowledgeNodeId = entry.requiredKnowledgeNodeId === undefined
      ? undefined
      : string(entry.requiredKnowledgeNodeId);
    const prerequisiteQuestIds = parseIdList(
      entry.prerequisiteQuestIds,
      `${label}.prerequisiteQuestIds`,
      errors,
    );
    const failOnEncounterIds = parseIdList(
      entry.failOnEncounterIds,
      `${label}.failOnEncounterIds`,
      errors,
    );
    const objectives: QuestObjectiveData[] = [];
    if (!Array.isArray(entry.objectives) || entry.objectives.length === 0) {
      errors.push(`${label}.objectives：应为非空数组`);
    } else {
      entry.objectives.forEach((objective, objectiveIndex) => {
        const parsed = parseObjective(objective, `${label}.objectives[${objectiveIndex}]`, errors);
        if (parsed !== null) objectives.push(parsed);
      });
    }
    const rawRewards = isPlainObject(entry.rewards) ? entry.rewards : null;
    const experience = rawRewards === null ? null : safeNonNegativeInteger(rawRewards.experience);
    const currency = rawRewards === null ? null : safeNonNegativeInteger(rawRewards.currency);
    const factionRenownRewards = rawRewards === null
      ? null
      : parseFactionRenownRewards(rawRewards.factionRenown, `${label}.rewards.factionRenown`, errors);
    const discoverKnowledgeNodeIds = rawRewards === null || rawRewards.discoverKnowledgeNodeIds === undefined
      ? []
      : parseIdList(rawRewards.discoverKnowledgeNodeIds, `${label}.rewards.discoverKnowledgeNodeIds`, errors);
    const problems: string[] = [];
    if (id === null) problems.push('id 应为非空字符串');
    if (name === null) problems.push('name 应为非空字符串');
    if (description === null) problems.push('description 应为非空字符串');
    if (giverNpcId === null) problems.push('giverNpcId 应为非空字符串');
    if (entry.orderedObjectives !== undefined && typeof entry.orderedObjectives !== 'boolean') {
      problems.push('orderedObjectives 应为布尔值');
    }
    if (entry.exclusiveGroupId !== undefined && exclusiveGroupId === null) {
      problems.push('exclusiveGroupId 应为非空字符串');
    }
    if (entry.requiredFactionId !== undefined && requiredFactionId === null) {
      problems.push('requiredFactionId 应为非空字符串');
    }
    if (entry.requiredKnowledgeNodeId !== undefined && requiredKnowledgeNodeId === null) {
      problems.push('requiredKnowledgeNodeId 应为非空字符串');
    }
    if (prerequisiteQuestIds === null) problems.push('prerequisiteQuestIds 格式无效');
    if (failOnEncounterIds === null) problems.push('failOnEncounterIds 格式无效');
    if (rawRewards === null || experience === null || currency === null ||
        factionRenownRewards === null || discoverKnowledgeNodeIds === null) {
      problems.push('rewards 必须声明非负安全整数 experience 与 currency');
    }
    if (problems.length > 0 || id === null || name === null || description === null ||
        giverNpcId === null || prerequisiteQuestIds === null || failOnEncounterIds === null ||
        experience === null || currency === null || factionRenownRewards === null ||
        discoverKnowledgeNodeIds === null) {
      errors.push(`${label}：${problems.join('；')}`);
      return;
    }
    quests.push({
      id,
      name,
      description,
      giverNpcId,
      ...(entry.orderedObjectives === undefined ? {} : { orderedObjectives: entry.orderedObjectives as boolean }),
      ...(exclusiveGroupId !== null && exclusiveGroupId !== undefined
        ? { exclusiveGroupId }
        : {}),
      ...(requiredFactionId !== null && requiredFactionId !== undefined
        ? { requiredFactionId }
        : {}),
      ...(requiredKnowledgeNodeId !== null && requiredKnowledgeNodeId !== undefined
        ? { requiredKnowledgeNodeId }
        : {}),
      prerequisiteQuestIds,
      objectives,
      failOnEncounterIds,
      rewards: {
        experience,
        currency,
        ...(factionRenownRewards.length > 0 ? { factionRenown: factionRenownRewards } : {}),
        ...(discoverKnowledgeNodeIds.length > 0 ? { discoverKnowledgeNodeIds } : {}),
      },
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, set: { quests } };
}

/** First declaration wins; duplicate quest ids are reported to the caller. */
export function indexQuests(set: QuestSetData): QuestIndex {
  const byId = new Map<string, QuestData>();
  const duplicateIds: string[] = [];
  for (const quest of set.quests) {
    if (byId.has(quest.id)) duplicateIds.push(quest.id);
    else byId.set(quest.id, quest);
  }
  return { byId, duplicateIds };
}

/**
 * Resolves task references after NPC, item and encounter assembly. Broken
 * tasks are isolated; valid tasks remain available to all boards.
 */
export function assembleQuests(input: QuestAssemblyInput): QuestAssemblyResult {
  if (input.questSet === null) return { quests: new Map(), warnings: [] };
  const index = indexQuests(input.questSet);
  const warnings = index.duplicateIds.map((id) => `任务 id "${id}" 重复，保留先声明者`);
  const valid = new Map<string, QuestData>();
  for (const [id, quest] of index.byId) {
    const problems: string[] = [];
    if (!input.questGiverNpcIds.has(quest.giverNpcId)) {
      problems.push(`发布 NPC "${quest.giverNpcId}" 不存在或未声明为任务发布人`);
    }
    if (quest.requiredFactionId !== undefined && input.factionIds !== undefined &&
        !input.factionIds.has(quest.requiredFactionId)) {
      problems.push(`资格门派 "${quest.requiredFactionId}" 未登记`);
    }
    if (quest.requiredKnowledgeNodeId !== undefined && input.knowledgeNodeIds !== undefined &&
        !input.knowledgeNodeIds.has(quest.requiredKnowledgeNodeId)) {
      problems.push(`资格见闻 "${quest.requiredKnowledgeNodeId}" 未登记`);
    }
    for (const reward of quest.rewards.factionRenown ?? []) {
      if (input.factionIds !== undefined && !input.factionIds.has(reward.factionId)) {
        problems.push(`声望奖励引用无效门派 "${reward.factionId}"`);
      }
    }
    for (const nodeId of quest.rewards.discoverKnowledgeNodeIds ?? []) {
      if (input.knowledgeNodeIds !== undefined && !input.knowledgeNodeIds.has(nodeId)) {
        problems.push(`结算见闻节点 "${nodeId}" 未登记`);
      }
    }
    const objectiveIds = new Set<string>();
    for (const objective of quest.objectives) {
      if (objective.requiredEquippedItemId !== undefined && (!input.itemIds.has(objective.requiredEquippedItemId) ||
        (input.itemCategories !== undefined && input.itemCategories.get(objective.requiredEquippedItemId) !== 'equipment'))) {
        problems.push(`战胜装备条件引用无效装备 "${objective.requiredEquippedItemId}"`);
      }
      if (objective.kind === 'craftRecipe' && !input.recipeIds?.has(objective.targetId)) {
        problems.push(`制作目标引用无效配方 "${objective.targetId}"`);
      }
      if (objective.kind === 'useItem' || objective.kind === 'equipItem') {
        for (const itemId of [objective.targetId, ...(objective.alternativeTargetIds ?? [])]) {
          if (!input.itemIds.has(itemId)) problems.push(`行动目标引用无效物品 "${itemId}"`);
          if (input.itemCategories && input.itemCategories.get(itemId) !== (objective.kind === 'useItem' ? 'consumable' : 'equipment')) {
            problems.push(`行动目标物品类别不匹配 "${itemId}"`);
          }
        }
      }
      if (objectiveIds.has(objective.id)) problems.push(`目标 id "${objective.id}" 重复`);
      objectiveIds.add(objective.id);
      if (objective.kind === 'collectItem' && !input.itemIds.has(objective.targetId)) {
        problems.push(`收集目标引用无效物品 "${objective.targetId}"`);
      }
      if (objective.kind === 'defeatEncounter' && !input.encounterIds.has(objective.targetId)) {
        problems.push(`击败目标引用无效遭遇 "${objective.targetId}"`);
      }
      if (objective.kind === 'talkToNpc' && !input.npcIds.has(objective.targetId)) {
        problems.push(`谈话目标引用无效人物 "${objective.targetId}"`);
      }
      if (objective.kind === 'discoverKnowledge' && input.knowledgeNodeIds !== undefined &&
          !input.knowledgeNodeIds.has(objective.targetId)) {
        problems.push(`见闻目标引用无效知识节点 "${objective.targetId}"`);
      }
    }
    for (const prerequisiteId of quest.prerequisiteQuestIds) {
      if (prerequisiteId === id || !index.byId.has(prerequisiteId)) {
        problems.push(`前置任务 "${prerequisiteId}" 不存在或引用自身`);
      }
    }
    for (const encounterId of quest.failOnEncounterIds) {
      if (!input.encounterIds.has(encounterId)) {
        problems.push(`失败条件引用无效遭遇 "${encounterId}"`);
      }
    }
    if (problems.length > 0) warnings.push(`任务 "${id}" 已禁用：${problems.join('；')}`);
    else valid.set(id, quest);
  }

  // Remove any quest whose prerequisite chain contains a cycle. This prevents
  // a valid-looking but permanently locked loop from entering the journal.
  const cyclic = findCyclicQuestIds(valid);
  for (const id of cyclic) {
    valid.delete(id);
    warnings.push(`任务 "${id}" 因前置任务形成循环而禁用`);
  }

  // Exclusive branch groups are validated as a whole: every group must keep
  // at least two valid members that declare identical prerequisites. A group
  // with a broken member never degrades into a false single-choice branch.
  const groups = new Map<string, QuestData[]>();
  for (const quest of valid.values()) {
    if (quest.exclusiveGroupId === undefined) continue;
    const members = groups.get(quest.exclusiveGroupId) ?? [];
    members.push(quest);
    groups.set(quest.exclusiveGroupId, members);
  }
  for (const [groupId, members] of groups) {
    const groupProblems: string[] = [];
    if (members.length < 2) {
      groupProblems.push('有效成员不足 2 项，不足以构成可选分支');
    } else {
      const signature = prerequisiteSignature(members[0]!);
      if (members.some((member) => prerequisiteSignature(member) !== signature)) {
        groupProblems.push('成员前置任务不一致，不能并列为玩家选择');
      }
    }
    if (groupProblems.length === 0) continue;
    for (const member of members) {
      valid.delete(member.id);
      warnings.push(`任务 "${member.id}" 已禁用：互斥组 "${groupId}" ${groupProblems.join('；')}`);
    }
  }

  // A quest depending on a cyclic/otherwise disabled quest is invalid too.
  let removed = true;
  while (removed) {
    removed = false;
    for (const [id, quest] of [...valid]) {
      const missing = quest.prerequisiteQuestIds.find((prerequisite) => !valid.has(prerequisite));
      if (missing !== undefined) {
        valid.delete(id);
        warnings.push(`任务 "${id}" 已禁用：前置任务 "${missing}" 不可用`);
        removed = true;
      }
    }
  }
  return { quests: valid, warnings };
}

function findCyclicQuestIds(quests: ReadonlyMap<string, QuestData>): Set<string> {
  const cyclic = new Set<string>();
  const visiting: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const loopStart = visiting.indexOf(id);
    if (loopStart >= 0) {
      for (const cycleId of visiting.slice(loopStart)) cyclic.add(cycleId);
      return;
    }
    const quest = quests.get(id);
    if (quest === undefined) return;
    visiting.push(id);
    for (const prerequisite of quest.prerequisiteQuestIds) visit(prerequisite);
    visiting.pop();
    visited.add(id);
  };
  for (const id of quests.keys()) visit(id);
  return cyclic;
}

function isPrerequisiteComplete(journal: QuestJournal, quest: QuestData): boolean {
  return quest.prerequisiteQuestIds.every(
    (id) => journal.states.get(id)?.status === 'completed',
  );
}

/** Shared eligibility predicate for UI visibility, dialogue and direct acceptance. */
export function hasQuestAccess(quest: QuestData, access: QuestAccessContext = {}): boolean {
  if (quest.requiredFactionId !== undefined && access.factionId !== quest.requiredFactionId) return false;
  if (quest.requiredKnowledgeNodeId !== undefined &&
      !access.knownKnowledgeNodeIds?.has(quest.requiredKnowledgeNodeId)) return false;
  return true;
}

/** Order-insensitive prerequisite comparison key for exclusive group checks. */
function prerequisiteSignature(quest: QuestData): string {
  return [...quest.prerequisiteQuestIds].sort().join('|');
}

export function createQuestJournal(quests: ReadonlyMap<string, QuestData>): QuestJournal {
  const journal: QuestJournal = { states: new Map(), trackedQuestId: null };
  for (const quest of quests.values()) {
    journal.states.set(quest.id, {
      questId: quest.id,
      status: quest.prerequisiteQuestIds.length === 0 ? 'offered' : 'locked',
      objectiveCounts: new Map(quest.objectives.map((objective) => [objective.id, 0])),
    });
  }
  return journal;
}

function emptyUpdate(): QuestUpdateResult {
  return { changed: false, completed: [], failedQuestIds: [] };
}

function completeQuest(
  journal: QuestJournal,
  quest: QuestData,
): QuestRewardGrant {
  const state = journal.states.get(quest.id);
  if (state !== undefined) state.status = 'completed';
  if (journal.trackedQuestId === quest.id) journal.trackedQuestId = null;
  return {
    questId: quest.id,
    experience: quest.rewards.experience,
    currency: quest.rewards.currency,
    ...(quest.rewards.factionRenown !== undefined
      ? { factionRenown: quest.rewards.factionRenown.map((reward) => ({ ...reward })) }
      : {}),
    ...(quest.rewards.discoverKnowledgeNodeIds !== undefined
      ? { discoverKnowledgeNodeIds: [...quest.rewards.discoverKnowledgeNodeIds] }
      : {}),
  };
}

function refreshUnlocked(quests: ReadonlyMap<string, QuestData>, journal: QuestJournal): boolean {
  let changed = false;
  for (const quest of quests.values()) {
    const state = journal.states.get(quest.id);
    if (state?.status === 'locked' && isPrerequisiteComplete(journal, quest)) {
      state.status = 'offered';
      changed = true;
    }
  }
  return changed;
}

/**
 * Accepts an offered quest and snapshots current item counts for collect
 * goals. Accepting a member of an exclusive group deterministically fails
 * its still-offered siblings (declaration order) and reports their ids.
 */
export function acceptQuest(
  quests: ReadonlyMap<string, QuestData>,
  journal: QuestJournal,
  questId: string,
  itemCounts: ReadonlyMap<string, number> = new Map(),
  access: QuestAccessContext = {},
): QuestActionResult {
  const quest = quests.get(questId);
  const state = journal.states.get(questId);
  if (quest === undefined || state === undefined) {
    return { ok: false, reason: 'unknown-quest', update: emptyUpdate() };
  }
  if (state.status !== 'offered' || !isPrerequisiteComplete(journal, quest)) {
    return { ok: false, reason: 'not-offered', update: emptyUpdate() };
  }
  if (quest.requiredFactionId !== undefined && access.factionId !== quest.requiredFactionId) {
    return { ok: false, reason: 'wrong-faction', update: emptyUpdate() };
  }
  if (quest.requiredKnowledgeNodeId !== undefined &&
      !access.knownKnowledgeNodeIds?.has(quest.requiredKnowledgeNodeId)) {
    return { ok: false, reason: 'missing-knowledge', update: emptyUpdate() };
  }
  state.status = 'active';
  const failedQuestIds: string[] = [];
  if (quest.exclusiveGroupId !== undefined) {
    for (const sibling of quests.values()) {
      if (sibling.id === quest.id || sibling.exclusiveGroupId !== quest.exclusiveGroupId) continue;
      const siblingState = journal.states.get(sibling.id);
      if (siblingState?.status !== 'offered') continue;
      siblingState.status = 'failed';
      failedQuestIds.push(sibling.id);
    }
  }
  const completed: QuestRewardGrant[] = [];
  for (const objective of quest.objectives) {
    if (objective.kind === 'collectItem') {
      const quantity = Math.max(0, itemCounts.get(objective.targetId) ?? 0);
      state.objectiveCounts.set(objective.id, Math.min(quantity, objective.requiredCount));
    } else if (objective.kind === 'discoverKnowledge' && access.knownKnowledgeNodeIds?.has(objective.targetId)) {
      state.objectiveCounts.set(objective.id, objective.requiredCount);
    } else if (objective.kind === 'defeatEncounter' && access.completedEncounterIds?.has(objective.targetId)) {
      state.objectiveCounts.set(objective.id, 1);
    }
    if (quest.orderedObjectives && (state.objectiveCounts.get(objective.id) ?? 0) < objective.requiredCount) break;
  }
  if (quest.objectives.every(
    (objective) => (state.objectiveCounts.get(objective.id) ?? 0) >= objective.requiredCount,
  )) {
    completed.push(completeQuest(journal, quest));
  }
  if (state.status === 'active' &&
      (journal.trackedQuestId === null || journal.states.get(journal.trackedQuestId)?.status !== 'active')) {
    journal.trackedQuestId = quest.id;
  }
  refreshUnlocked(quests, journal);
  return {
    ok: true,
    update: { changed: true, completed, failedQuestIds },
  };
}

/** Tracks one active quest; selecting the tracked quest again clears tracking. */
export function toggleTrackedQuest(journal: QuestJournal, questId: string): boolean {
  if (journal.states.get(questId)?.status !== 'active') return false;
  journal.trackedQuestId = journal.trackedQuestId === questId ? null : questId;
  return true;
}

/** Abandoning an active quest records a terminal failed state. */
export function abandonQuest(journal: QuestJournal, questId: string): QuestActionResult {
  const state = journal.states.get(questId);
  if (state === undefined) {
    return { ok: false, reason: 'unknown-quest', update: emptyUpdate() };
  }
  if (state.status !== 'active') {
    return { ok: false, reason: 'not-active', update: emptyUpdate() };
  }
  state.status = 'failed';
  if (journal.trackedQuestId === questId) journal.trackedQuestId = null;
  return {
    ok: true,
    update: { changed: true, completed: [], failedQuestIds: [questId] },
  };
}

/** Applies one objective/failure event to every currently active quest. */
export function applyQuestSignal(
  quests: ReadonlyMap<string, QuestData>,
  journal: QuestJournal,
  signal: QuestSignal,
): QuestUpdateResult {
  const completed: QuestRewardGrant[] = [];
  const failedQuestIds: string[] = [];
  let changed = false;
  for (const quest of quests.values()) {
    const state = journal.states.get(quest.id);
    if (state?.status !== 'active') continue;
    if (signal.type === 'encounter-defeat' && quest.failOnEncounterIds.includes(signal.encounterId)) {
      state.status = 'failed';
      failedQuestIds.push(quest.id);
      changed = true;
      if (journal.trackedQuestId === quest.id) journal.trackedQuestId = null;
      continue;
    }

    const pending = quest.orderedObjectives ? quest.objectives.find(objective =>
      (state.objectiveCounts.get(objective.id) ?? 0) < objective.requiredCount) : undefined;
    for (const objective of quest.objectives) {
      if (quest.orderedObjectives && objective !== pending) continue;
      const current = state.objectiveCounts.get(objective.id) ?? 0;
      let next = current;
      if (objective.kind === 'collectItem' && signal.type === 'item-count' && objective.targetId === signal.itemId) {
        const quantity = Number.isSafeInteger(signal.quantity) ? Math.max(0, signal.quantity) : 0;
        next = Math.min(objective.requiredCount, quantity);
      } else if (
        objective.kind === 'defeatEncounter' && signal.type === 'encounter-victory' &&
        objective.targetId === signal.encounterId &&
        (objective.requiredEquippedItemId === undefined || signal.equippedItemIds?.includes(objective.requiredEquippedItemId))
      ) {
        next = Math.min(objective.requiredCount, current + 1);
      } else if (
        objective.kind === 'talkToNpc' && signal.type === 'npc-talk' &&
        objective.targetId === signal.npcId
      ) {
        next = Math.min(objective.requiredCount, current + 1);
      } else if (
        objective.kind === 'discoverKnowledge' && signal.type === 'knowledge-discovery' &&
        objective.targetId === signal.nodeId
      ) {
        next = objective.requiredCount;
      } else if (objective.kind === 'craftRecipe' && signal.type === 'recipe-crafted' &&
        objective.targetId === signal.recipeId) {
        next = Math.min(objective.requiredCount, current + 1);
      } else if (((objective.kind === 'useItem' && signal.type === 'item-used') ||
        (objective.kind === 'equipItem' && signal.type === 'item-equipped')) &&
        [objective.targetId, ...(objective.alternativeTargetIds ?? [])].includes(signal.itemId)) {
        next = Math.min(objective.requiredCount, current + 1);
      }
      if (next !== current) {
        state.objectiveCounts.set(objective.id, next);
        changed = true;
      }
    }
    if (quest.objectives.every(
      (objective) => (state.objectiveCounts.get(objective.id) ?? 0) >= objective.requiredCount,
    )) {
      completed.push(completeQuest(journal, quest));
      changed = true;
    }
  }
  if (refreshUnlocked(quests, journal)) changed = true;
  return { changed, completed, failedQuestIds };
}

/** Reconciles active knowledge objectives after loading an older compatible save. */
export function reconcileKnownKnowledgeObjectives(
  quests: ReadonlyMap<string, QuestData>,
  journal: QuestJournal,
  knownKnowledgeNodeIds: ReadonlySet<string>,
): QuestUpdateResult {
  const aggregate: { changed: boolean; completed: QuestRewardGrant[]; failedQuestIds: string[] } = {
    changed: false,
    completed: [],
    failedQuestIds: [],
  };
  // Repeat after a completion unlocks a follow-up whose target was already
  // seen earlier in this pass. Every pass either settles a quest or stops.
  let passChanged = true;
  let passes = 0;
  const maxPasses = [...quests.values()].reduce((sum, quest) => sum + quest.objectives.length, 1);
  while (passChanged && passes <= maxPasses) {
    passChanged = false;
    passes += 1;
    for (const nodeId of knownKnowledgeNodeIds) {
      const update = applyQuestSignal(quests, journal, { type: 'knowledge-discovery', nodeId });
      if (!update.changed) continue;
      passChanged = true;
      aggregate.changed = true;
      aggregate.completed.push(...update.completed);
      aggregate.failedQuestIds.push(...update.failedQuestIds);
    }
  }
  return aggregate;
}

/** Replay persistent facts, never prior conversations; one saved victory counts once. */
export function reconcileQuestFacts(
  quests: ReadonlyMap<string, QuestData>, journal: QuestJournal,
  facts: QuestAccessContext & { itemCounts?: ReadonlyMap<string, number> },
): QuestUpdateResult {
  const completed: QuestRewardGrant[] = [];
  let changed = false;
  const maxPasses = [...quests.values()].reduce((sum, quest) => sum + quest.objectives.length, 1);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let passChanged = false;
    for (const quest of quests.values()) {
      const state = journal.states.get(quest.id);
      if (state?.status !== 'active') continue;
      const pending = quest.orderedObjectives ? quest.objectives.find(objective =>
        (state.objectiveCounts.get(objective.id) ?? 0) < objective.requiredCount) : undefined;
      for (const objective of quest.objectives) {
        if (quest.orderedObjectives && objective !== pending) continue;
        const current = state.objectiveCounts.get(objective.id) ?? 0;
        let next = current;
        if (objective.kind === 'discoverKnowledge' && facts.knownKnowledgeNodeIds?.has(objective.targetId)) next = objective.requiredCount;
        else if (objective.kind === 'defeatEncounter' && facts.completedEncounterIds?.has(objective.targetId)) next = Math.max(current, 1);
        else if (objective.kind === 'collectItem' && facts.itemCounts !== undefined) {
          const quantity = facts.itemCounts.get(objective.targetId) ?? 0;
          next = Math.min(objective.requiredCount, Number.isSafeInteger(quantity) ? Math.max(0, quantity) : 0);
        }
        if (next !== current) { state.objectiveCounts.set(objective.id, next); changed = true; passChanged = true; }
      }
      if (quest.objectives.every(objective => (state.objectiveCounts.get(objective.id) ?? 0) >= objective.requiredCount)) {
        completed.push(completeQuest(journal, quest)); changed = true; passChanged = true;
      }
    }
    if (!passChanged) break;
  }
  if (refreshUnlocked(quests, journal)) changed = true;
  return { changed, completed, failedQuestIds: [] };
}

/** Clear out-of-order active save progress; completed legacy tasks stay completed. */
export function resetFutureOrderedObjectiveCounts(quest: QuestData, state: QuestProgressState): string[] {
  if (!quest.orderedObjectives || state.status !== 'active') return [];
  let pendingSeen = false;
  const reset: string[] = [];
  for (const objective of quest.objectives) {
    const current = state.objectiveCounts.get(objective.id) ?? 0;
    if (pendingSeen && current > 0) { state.objectiveCounts.set(objective.id, 0); reset.push(objective.id); }
    if (current < objective.requiredCount) pendingSeen = true;
  }
  return reset;
}

export function getQuestObjectiveProgress(
  quest: QuestData,
  state: QuestProgressState,
): readonly { objective: QuestObjectiveData; current: number }[] {
  return quest.objectives.map((objective) => ({
    objective,
    current: state.objectiveCounts.get(objective.id) ?? 0,
  }));
}
