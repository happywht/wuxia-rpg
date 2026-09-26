/**
 * Round 07 quest protocol and Phaser-free journal state machine.
 *
 * Quest names, descriptions, objectives, failure targets and reward values
 * are authored in JSON. This module owns only generic parsing, cross-resource
 * validation, objective progress and one-time reward transitions.
 */

export type QuestObjectiveKind = 'collectItem' | 'defeatEncounter';

export interface QuestObjectiveData {
  id: string;
  kind: QuestObjectiveKind;
  targetId: string;
  requiredCount: number;
  text: string;
}

export interface QuestRewardsData {
  experience: number;
  currency: number;
}

export interface QuestData {
  id: string;
  name: string;
  description: string;
  giverNpcId: string;
  prerequisiteQuestIds: string[];
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
  itemIds: ReadonlySet<string>;
  encounterIds: ReadonlySet<string>;
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

export interface QuestRewardGrant {
  questId: string;
  experience: number;
  currency: number;
}

export interface QuestUpdateResult {
  changed: boolean;
  completed: readonly QuestRewardGrant[];
  failedQuestIds: readonly string[];
}

export type QuestSignal =
  | { type: 'item-count'; itemId: string; quantity: number }
  | { type: 'encounter-victory'; encounterId: string }
  | { type: 'encounter-defeat'; encounterId: string };

export type QuestActionResult =
  | { ok: true; update: QuestUpdateResult }
  | { ok: false; reason: 'unknown-quest' | 'not-offered' | 'not-active'; update: QuestUpdateResult };

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
  const maximumCount = kind === 'defeatEncounter' ? 99 : 999;
  const problems: string[] = [];
  if (id === null) problems.push('id 应为非空字符串');
  if (kind !== 'collectItem' && kind !== 'defeatEncounter') {
    problems.push('kind 必须是 collectItem 或 defeatEncounter');
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
  return { id, kind: kind as QuestObjectiveKind, targetId, requiredCount, text };
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
    const problems: string[] = [];
    if (id === null) problems.push('id 应为非空字符串');
    if (name === null) problems.push('name 应为非空字符串');
    if (description === null) problems.push('description 应为非空字符串');
    if (giverNpcId === null) problems.push('giverNpcId 应为非空字符串');
    if (prerequisiteQuestIds === null) problems.push('prerequisiteQuestIds 格式无效');
    if (failOnEncounterIds === null) problems.push('failOnEncounterIds 格式无效');
    if (rawRewards === null || experience === null || currency === null) {
      problems.push('rewards 必须声明非负安全整数 experience 与 currency');
    }
    if (problems.length > 0 || id === null || name === null || description === null ||
        giverNpcId === null || prerequisiteQuestIds === null || failOnEncounterIds === null ||
        experience === null || currency === null) {
      errors.push(`${label}：${problems.join('；')}`);
      return;
    }
    quests.push({
      id,
      name,
      description,
      giverNpcId,
      prerequisiteQuestIds,
      objectives,
      failOnEncounterIds,
      rewards: { experience, currency },
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
    const objectiveIds = new Set<string>();
    for (const objective of quest.objectives) {
      if (objectiveIds.has(objective.id)) problems.push(`目标 id "${objective.id}" 重复`);
      objectiveIds.add(objective.id);
      if (objective.kind === 'collectItem' && !input.itemIds.has(objective.targetId)) {
        problems.push(`收集目标引用无效物品 "${objective.targetId}"`);
      }
      if (objective.kind === 'defeatEncounter' && !input.encounterIds.has(objective.targetId)) {
        problems.push(`击败目标引用无效遭遇 "${objective.targetId}"`);
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
  return {
    questId: quest.id,
    experience: quest.rewards.experience,
    currency: quest.rewards.currency,
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

/** Accepts an offered quest and snapshots current item counts for collect goals. */
export function acceptQuest(
  quests: ReadonlyMap<string, QuestData>,
  journal: QuestJournal,
  questId: string,
  itemCounts: ReadonlyMap<string, number> = new Map(),
): QuestActionResult {
  const quest = quests.get(questId);
  const state = journal.states.get(questId);
  if (quest === undefined || state === undefined) {
    return { ok: false, reason: 'unknown-quest', update: emptyUpdate() };
  }
  if (state.status !== 'offered' || !isPrerequisiteComplete(journal, quest)) {
    return { ok: false, reason: 'not-offered', update: emptyUpdate() };
  }
  state.status = 'active';
  const completed: QuestRewardGrant[] = [];
  for (const objective of quest.objectives) {
    if (objective.kind === 'collectItem') {
      const quantity = Math.max(0, itemCounts.get(objective.targetId) ?? 0);
      state.objectiveCounts.set(objective.id, Math.min(quantity, objective.requiredCount));
    }
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
    update: { changed: true, completed, failedQuestIds: [] },
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

    for (const objective of quest.objectives) {
      const current = state.objectiveCounts.get(objective.id) ?? 0;
      let next = current;
      if (objective.kind === 'collectItem' && signal.type === 'item-count' && objective.targetId === signal.itemId) {
        const quantity = Number.isSafeInteger(signal.quantity) ? Math.max(0, signal.quantity) : 0;
        next = Math.min(objective.requiredCount, quantity);
      } else if (
        objective.kind === 'defeatEncounter' && signal.type === 'encounter-victory' &&
        objective.targetId === signal.encounterId
      ) {
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

export function getQuestObjectiveProgress(
  quest: QuestData,
  state: QuestProgressState,
): readonly { objective: QuestObjectiveData; current: number }[] {
  return quest.objectives.map((objective) => ({
    objective,
    current: state.objectiveCounts.get(objective.id) ?? 0,
  }));
}
