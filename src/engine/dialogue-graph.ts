/**
 * Generic dialogue-graph protocol: wire types, defensive parsing, per-
 * conversation graph validation, id indexing and playback state.
 *
 * A conversation is a plain node graph: every node carries speaker text and
 * optional player options; a node without options is an end node. Round 08
 * adds data-driven conditions (an option is only offered while every
 * condition holds) and effects (executed atomically when the option is
 * confirmed — see `dialogue-runtime.ts`); this module owns their wire
 * protocol and defensive parsing only. Every visible string stays in the
 * JSON data (see docs/ARCHITECTURE.md).
 *
 * `data/schema/dialogue-set.schema.json` pins down static structure; the
 * per-conversation validation here adds the graph semantics a schema cannot
 * express (start node exists, option targets resolve, node ids unique) so a
 * single broken conversation disables exactly itself, not the whole set.
 * Cross-resource id checks (quest/item/NPC/knowledge/faction/martial-art/companion/
 * time-of-day references inside conditions and effects) run in
 * `assembleDialogueReferences` after world assembly and drop only the
 * offending option.
 */

import {
  MORALITY_RANGE,
  RELATIONSHIP_RANGE,
  FACTION_RENOWN_RANGE,
  RENOWN_RANGE,
} from './social-state';

/**
 * Condition-bound mirrors of the social ranges (single source of truth in
 * `social-state.ts`; these aliases keep the condition parser readable).
 */
const MORALITY_BOUND = MORALITY_RANGE;
const RENOWN_BOUND = RENOWN_RANGE;
const FACTION_RENOWN_BOUND = FACTION_RENOWN_RANGE;
const RELATIONSHIP_BOUND = RELATIONSHIP_RANGE;

// ---------------------------------------------------------------------------
// Round 08 condition / effect protocols
// ---------------------------------------------------------------------------

/** Quest lifecycle values a `questStatus` condition may compare against. */
export type DialogueQuestStatusValue = 'locked' | 'offered' | 'active' | 'completed' | 'failed';

/**
 * One condition on an option. Options carrying several conditions are only
 * visible while **every** one of them holds. `morality` / `renown` /
 * `npcRelationship` declare at least one of `minValue` / `maxValue`
 * (inclusive bounds). `timeOfDay` holds while the in-game clock's current
 * period id matches `periodId` (calendar-defined).
 */
export type DialogueConditionData =
  | { kind: 'questStatus'; questId: string; status: DialogueQuestStatusValue }
  | { kind: 'itemCount'; itemId: string; minCount: number }
  | { kind: 'morality'; minValue?: number; maxValue?: number }
  | { kind: 'renown'; minValue?: number; maxValue?: number }
  | { kind: 'factionRenown'; factionId: string; minValue?: number; maxValue?: number }
  | { kind: 'npcRelationship'; npcId: string; minValue?: number; maxValue?: number }
  | { kind: 'knowledgeKnown'; nodeId: string; isKnown?: boolean }
  | { kind: 'npcKnows'; npcId?: string; nodeId: string }
  | { kind: 'factionMembership'; factionId?: string; isMember: boolean }
  | { kind: 'martialArtEligible'; martialArtId: string }
  | { kind: 'timeOfDay'; periodId: string };

/**
 * One effect executed when its option is confirmed. The runtime validates
 * every effect of an option first and commits them together — a refused
 * effect changes nothing (atomicity, `dialogue-runtime.ts`). A missing
 * `npcId` on `adjustRelationship` targets the NPC being talked to.
 */
export type DialogueEffectData =
  | { kind: 'acceptQuest'; questId: string }
  | { kind: 'abandonQuest'; questId: string }
  | { kind: 'giveItem'; itemId: string; quantity: number }
  | { kind: 'takeItem'; itemId: string; quantity: number }
  | { kind: 'adjustMorality'; delta: number }
  | { kind: 'adjustRenown'; delta: number }
  | { kind: 'adjustFactionRenown'; factionId: string; delta: number }
  | { kind: 'adjustRelationship'; npcId?: string; delta: number }
  | { kind: 'discoverKnowledgeNode'; nodeId: string }
  | { kind: 'shareKnowledgeNode'; nodeId: string }
  | { kind: 'joinFaction'; factionId: string }
  | { kind: 'leaveFaction' }
  | { kind: 'learnMartialArt'; martialArtId: string }
  | { kind: 'recruitCompanion'; companionId: string }
  | { kind: 'dismissCompanion' };

/** One player-selectable branch leading to another node. */
export interface DialogueOptionData {
  text: string;
  nextNodeId: string;
  /** All must hold for the option to be offered; missing = unconditional. */
  conditions?: readonly DialogueConditionData[];
  /** Executed atomically on confirm; missing = plain transition. */
  effects?: readonly DialogueEffectData[];
}

/** A dialogue node; omitted or empty `options` marks an end node. */
export interface DialogueNodeData {
  id: string;
  text: string;
  options?: DialogueOptionData[];
}

/** One conversation: an entry node plus the node pool it may jump between. */
export interface DialogueData {
  id: string;
  startNodeId: string;
  nodes: DialogueNodeData[];
}

/** Wire format of a dialogue-set JSON file under `data/base/dialogues/`. */
export interface DialogueSetData {
  conversations: DialogueData[];
}

export type DialogueSetParseResult =
  | { ok: true; set: DialogueSetData; warnings: string[] }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True only when a protocol object contains no undeclared keys. */
function hasOnlyKeys(source: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(source).every((key) => allowed.includes(key));
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

const QUEST_STATUS_VALUES: readonly DialogueQuestStatusValue[] = [
  'locked',
  'offered',
  'active',
  'completed',
  'failed',
];

/**
 * Reads the optional inclusive bounds shared by the morality / renown /
 * npcRelationship conditions. Returns `[min, max]` where each entry may be
 * undefined but at least one must exist, or `null` when invalid.
 */
function requireRangeBounds(
  source: Record<string, unknown>,
  min: number,
  max: number,
): [number | undefined, number | undefined] | null {
  const hasMin = source.minValue !== undefined;
  const hasMax = source.maxValue !== undefined;
  if (!hasMin && !hasMax) {
    return null;
  }
  let minValue: number | undefined;
  let maxValue: number | undefined;
  if (hasMin) {
    const parsed: number | null = requireIntegerInRange(source.minValue, min, max);
    if (parsed === null) {
      return null;
    }
    minValue = parsed;
  }
  if (hasMax) {
    const parsed: number | null = requireIntegerInRange(source.maxValue, min, max);
    if (parsed === null) {
      return null;
    }
    maxValue = parsed;
  }
  if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
    return null;
  }
  return [minValue, maxValue];
}

/**
 * Defensive parse of one condition entry; `null` marks an unknown kind or an
 * out-of-protocol value (the schema rejects these earlier at load time).
 */
function parseCondition(raw: unknown): DialogueConditionData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  switch (source.kind) {
    case 'questStatus': {
      if (!hasOnlyKeys(source, ['kind', 'questId', 'status'])) return null;
      const questId = requireNonEmptyString(source.questId);
      const status = QUEST_STATUS_VALUES.find((value) => value === source.status);
      return questId !== null && status !== undefined
        ? { kind: 'questStatus', questId, status }
        : null;
    }
    case 'itemCount': {
      if (!hasOnlyKeys(source, ['kind', 'itemId', 'minCount'])) return null;
      const itemId = requireNonEmptyString(source.itemId);
      const minCount = requireIntegerInRange(source.minCount, 1, 999);
      return itemId !== null && minCount !== null
        ? { kind: 'itemCount', itemId, minCount }
        : null;
    }
    case 'morality': {
      if (!hasOnlyKeys(source, ['kind', 'minValue', 'maxValue'])) return null;
      const bounds = requireRangeBounds(source, MORALITY_BOUND.min, MORALITY_BOUND.max);
      if (bounds === null) {
        return null;
      }
      const [minValue, maxValue] = bounds;
      return { kind: 'morality', ...(minValue !== undefined ? { minValue } : {}), ...(maxValue !== undefined ? { maxValue } : {}) };
    }
    case 'renown': {
      if (!hasOnlyKeys(source, ['kind', 'minValue', 'maxValue'])) return null;
      const bounds = requireRangeBounds(source, RENOWN_BOUND.min, RENOWN_BOUND.max);
      if (bounds === null) {
        return null;
      }
      const [minValue, maxValue] = bounds;
      return { kind: 'renown', ...(minValue !== undefined ? { minValue } : {}), ...(maxValue !== undefined ? { maxValue } : {}) };
    }
    case 'factionRenown': {
      if (!hasOnlyKeys(source, ['kind', 'factionId', 'minValue', 'maxValue'])) return null;
      const factionId = requireNonEmptyString(source.factionId);
      const bounds = requireRangeBounds(source, FACTION_RENOWN_BOUND.min, FACTION_RENOWN_BOUND.max);
      if (factionId === null || bounds === null) return null;
      const [minValue, maxValue] = bounds;
      return {
        kind: 'factionRenown', factionId,
        ...(minValue !== undefined ? { minValue } : {}),
        ...(maxValue !== undefined ? { maxValue } : {}),
      };
    }
    case 'npcRelationship': {
      if (!hasOnlyKeys(source, ['kind', 'npcId', 'minValue', 'maxValue'])) return null;
      const npcId = requireNonEmptyString(source.npcId);
      const bounds = requireRangeBounds(source, RELATIONSHIP_BOUND.min, RELATIONSHIP_BOUND.max);
      if (npcId === null || bounds === null) {
        return null;
      }
      const [minValue, maxValue] = bounds;
      return { kind: 'npcRelationship', npcId, ...(minValue !== undefined ? { minValue } : {}), ...(maxValue !== undefined ? { maxValue } : {}) };
    }
    case 'knowledgeKnown': {
      if (!hasOnlyKeys(source, ['kind', 'nodeId', 'isKnown'])) return null;
      const nodeId = requireNonEmptyString(source.nodeId);
      if (source.isKnown !== undefined && typeof source.isKnown !== 'boolean') return null;
      return nodeId === null ? null : { kind: 'knowledgeKnown', nodeId, ...(source.isKnown === undefined ? {} : { isKnown: source.isKnown as boolean }) };
    }
    case 'npcKnows': {
      if (!hasOnlyKeys(source, ['kind', 'npcId', 'nodeId'])) return null;
      const nodeId = requireNonEmptyString(source.nodeId);
      const npcId = source.npcId === undefined ? undefined : requireNonEmptyString(source.npcId);
      return nodeId === null || npcId === null
        ? null
        : { kind: 'npcKnows', ...(npcId !== undefined ? { npcId } : {}), nodeId };
    }
    case 'factionMembership': {
      if (!hasOnlyKeys(source, ['kind', 'factionId', 'isMember'])) return null;
      const factionId = source.factionId === undefined ? undefined : requireNonEmptyString(source.factionId);
      if (factionId === null || typeof source.isMember !== 'boolean') return null;
      return {
        kind: 'factionMembership',
        ...(factionId !== undefined ? { factionId } : {}),
        isMember: source.isMember,
      };
    }
    case 'martialArtEligible': {
      if (!hasOnlyKeys(source, ['kind', 'martialArtId'])) return null;
      const martialArtId = requireNonEmptyString(source.martialArtId);
      return martialArtId === null ? null : { kind: 'martialArtEligible', martialArtId };
    }
    case 'timeOfDay': {
      if (!hasOnlyKeys(source, ['kind', 'periodId'])) return null;
      const periodId = requireNonEmptyString(source.periodId);
      return periodId === null ? null : { kind: 'timeOfDay', periodId };
    }
    default:
      return null;
  }
}

/**
 * Defensive parse of one effect entry; `null` marks an unknown kind or an
 * out-of-protocol value (the schema rejects these earlier at load time).
 */
function parseEffect(raw: unknown): DialogueEffectData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  switch (source.kind) {
    case 'acceptQuest':
    case 'abandonQuest': {
      if (!hasOnlyKeys(source, ['kind', 'questId'])) return null;
      const questId = requireNonEmptyString(source.questId);
      return questId !== null ? ({ kind: source.kind, questId } as DialogueEffectData) : null;
    }
    case 'giveItem':
    case 'takeItem': {
      if (!hasOnlyKeys(source, ['kind', 'itemId', 'quantity'])) return null;
      const itemId = requireNonEmptyString(source.itemId);
      const quantity = requireIntegerInRange(source.quantity, 1, 99);
      return itemId !== null && quantity !== null
        ? ({ kind: source.kind, itemId, quantity } as DialogueEffectData)
        : null;
    }
    case 'adjustMorality': {
      if (!hasOnlyKeys(source, ['kind', 'delta'])) return null;
      const delta = requireIntegerInRange(source.delta, MORALITY_BOUND.min, MORALITY_BOUND.max);
      return delta !== null && delta !== 0 ? { kind: 'adjustMorality', delta } : null;
    }
    case 'adjustRenown': {
      if (!hasOnlyKeys(source, ['kind', 'delta'])) return null;
      // Renown itself is non-negative, but an adjustment is signed. Keep
      // the schema/parser protocol aligned while the runtime clamps the
      // resulting value back into RENOWN_BOUND.
      const delta = requireIntegerInRange(source.delta, -RENOWN_BOUND.max, RENOWN_BOUND.max);
      return delta !== null && delta !== 0 ? { kind: 'adjustRenown', delta } : null;
    }
    case 'adjustFactionRenown': {
      if (!hasOnlyKeys(source, ['kind', 'factionId', 'delta'])) return null;
      const factionId = requireNonEmptyString(source.factionId);
      const delta = requireIntegerInRange(source.delta, -FACTION_RENOWN_BOUND.max, FACTION_RENOWN_BOUND.max);
      return factionId !== null && delta !== null && delta !== 0
        ? { kind: 'adjustFactionRenown', factionId, delta }
        : null;
    }
    case 'adjustRelationship': {
      if (!hasOnlyKeys(source, ['kind', 'npcId', 'delta'])) return null;
      const delta = requireIntegerInRange(source.delta, RELATIONSHIP_BOUND.min, RELATIONSHIP_BOUND.max);
      if (delta === null || delta === 0) {
        return null;
      }
      const npcId = source.npcId === undefined ? undefined : requireNonEmptyString(source.npcId);
      if (npcId === null) {
        return null;
      }
      return { kind: 'adjustRelationship', ...(npcId !== undefined ? { npcId } : {}), delta };
    }
    case 'discoverKnowledgeNode': {
      if (!hasOnlyKeys(source, ['kind', 'nodeId'])) return null;
      const nodeId = requireNonEmptyString(source.nodeId);
      return nodeId === null ? null : { kind: 'discoverKnowledgeNode', nodeId };
    }
    case 'shareKnowledgeNode': {
      if (!hasOnlyKeys(source, ['kind', 'nodeId'])) return null;
      const nodeId = requireNonEmptyString(source.nodeId);
      return nodeId === null ? null : { kind: 'shareKnowledgeNode', nodeId };
    }
    case 'joinFaction': {
      if (!hasOnlyKeys(source, ['kind', 'factionId'])) return null;
      const factionId = requireNonEmptyString(source.factionId);
      return factionId === null ? null : { kind: 'joinFaction', factionId };
    }
    case 'leaveFaction':
      return hasOnlyKeys(source, ['kind']) ? { kind: 'leaveFaction' } : null;
    case 'learnMartialArt': {
      if (!hasOnlyKeys(source, ['kind', 'martialArtId'])) return null;
      const martialArtId = requireNonEmptyString(source.martialArtId);
      return martialArtId === null ? null : { kind: 'learnMartialArt', martialArtId };
    }
    case 'recruitCompanion': {
      if (!hasOnlyKeys(source, ['kind', 'companionId'])) return null;
      const companionId = requireNonEmptyString(source.companionId);
      return companionId === null ? null : { kind: 'recruitCompanion', companionId };
    }
    case 'dismissCompanion':
      return hasOnlyKeys(source, ['kind']) ? { kind: 'dismissCompanion' } : null;
    default:
      return null;
  }
}

/** Parses a condition list; `undefined` when the field is absent. */
function parseConditions(raw: unknown): readonly DialogueConditionData[] | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return null; // Empty condition lists are meaningless — require omission.
  }
  const parsed: DialogueConditionData[] = [];
  for (const entry of raw) {
    const condition = parseCondition(entry);
    if (condition === null) {
      return null;
    }
    parsed.push(condition);
  }
  return parsed;
}

/** Parses an effect list; `undefined` when the field is absent. */
function parseEffects(raw: unknown): readonly DialogueEffectData[] | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return null; // Empty effect lists are meaningless — require omission.
  }
  const parsed: DialogueEffectData[] = [];
  for (const entry of raw) {
    const effect = parseEffect(entry);
    if (effect === null) {
      return null;
    }
    parsed.push(effect);
  }
  return parsed;
}

/**
 * Parses one node's `options` field.
 * - `undefined` when the field is absent (an end node — valid);
 * - an empty list when the field is `[]` (also an end node — valid);
 * - a validated option list when every entry has `text` and `nextNodeId`
 *   plus structurally valid optional `conditions` / `effects`;
 * - `null` when the field exists but is structurally invalid.
 */
function parseOptions(raw: unknown): DialogueOptionData[] | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return null;
  }
  if (raw.length === 0) {
    return [];
  }
  const parsed: DialogueOptionData[] = [];
  for (const option of raw) {
    const source = isPlainObject(option) ? option : null;
    if (source !== null && !hasOnlyKeys(source, ['text', 'nextNodeId', 'conditions', 'effects'])) {
      return null;
    }
    const text = source === null ? null : requireNonEmptyString(source.text);
    const nextNodeId = source === null ? null : requireNonEmptyString(source.nextNodeId);
    const conditions = source === null ? undefined : parseConditions(source.conditions);
    const effects = source === null ? undefined : parseEffects(source.effects);
    if (text === null || nextNodeId === null || conditions === null || effects === null) {
      return null;
    }
    parsed.push({
      text,
      nextNodeId,
      ...(conditions !== undefined ? { conditions } : {}),
      ...(effects !== undefined ? { effects } : {}),
    });
  }
  return parsed;
}

/**
 * Defensive re-parse of a dialogue-set document. The Ajv schema already
 * rejected static shape violations at load time; this guards the engine
 * against semantic and unvalidated values. A bad conversation is skipped
 * with a local warning while valid siblings remain available. Only a broken
 * set envelope rejects the complete document.
 */
export function parseDialogueSet(raw: unknown): DialogueSetParseResult {
  if (
    !isPlainObject(raw) ||
    !hasOnlyKeys(raw, ['conversations']) ||
    !Array.isArray(raw.conversations)
  ) {
    return { ok: false, errors: ['conversations：应为对话条目数组'] };
  }

  const conversations: DialogueData[] = [];
  const warnings: string[] = [];
  raw.conversations.forEach((entry, index) => {
    const label = `conversations[${index}]`;
    if (!isPlainObject(entry)) {
      warnings.push(`对话 ${label} 已禁用：应为对象`);
      return;
    }
    if (!hasOnlyKeys(entry, ['id', 'startNodeId', 'nodes'])) {
      warnings.push(`对话 ${label} 已禁用：含有未声明字段`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const startNodeId = requireNonEmptyString(entry.startNodeId);
    const rawNodes = entry.nodes;
    const nodes: DialogueNodeData[] = [];

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (startNodeId === null) {
      problems.push(`${label}.startNodeId：应为非空字符串`);
    }
    if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
      problems.push(`${label}.nodes：应为至少含一个节点的数组`);
    }
    if (id === null || startNodeId === null || !Array.isArray(rawNodes) || rawNodes.length === 0) {
      const subject = id === null ? `对话 ${label}` : `对话 "${id}"`;
      warnings.push(`${subject} 已禁用：${problems.join('；')}`);
      return;
    }

    rawNodes.forEach((node, nodeIndex) => {
      const nodeLabel = `${label}.nodes[${nodeIndex}]`;
      if (!isPlainObject(node)) {
        problems.push(`${nodeLabel}：应为对象`);
        return;
      }
      if (!hasOnlyKeys(node, ['id', 'text', 'options'])) {
        problems.push(`${nodeLabel}：含有未声明字段`);
        return;
      }
      const nodeId = requireNonEmptyString(node.id);
      const text = requireNonEmptyString(node.text);
      const options = parseOptions(node.options);

      const nodeProblems: string[] = [];
      if (nodeId === null) {
        nodeProblems.push(`${nodeLabel}.id：应为非空字符串`);
      }
      if (text === null) {
        nodeProblems.push(`${nodeLabel}.text：应为非空字符串`);
      }
      if (options === null) {
        nodeProblems.push(`${nodeLabel}.options：应为选项数组，结束节点可省略或使用空数组`);
      }
      if (nodeId === null || text === null || options === null) {
        problems.push(...nodeProblems);
        return;
      }

      nodes.push(options === undefined ? { id: nodeId, text } : { id: nodeId, text, options });
    });

    if (problems.length > 0) {
      warnings.push(`对话 "${id}" 已禁用：${problems.join('；')}`);
      return;
    }
    conversations.push({ id, startNodeId, nodes });
  });

  return { ok: true, set: { conversations }, warnings };
}

/**
 * Graph validation for one conversation: node ids unique, start node
 * resolves, every option target resolves. Returns readable problems; an
 * empty array means the conversation is safe to play. Callers disable a
 * conversation (and its referencing NPCs) when problems exist.
 */
export function validateConversation(conversation: DialogueData): string[] {
  const problems: string[] = [];
  const nodeIds = new Set<string>();
  for (const node of conversation.nodes) {
    if (nodeIds.has(node.id)) {
      problems.push(`节点 id "${node.id}" 重复`);
    }
    nodeIds.add(node.id);
  }

  if (!nodeIds.has(conversation.startNodeId)) {
    problems.push(`起始节点 "${conversation.startNodeId}" 不存在`);
  }

  for (const node of conversation.nodes) {
    for (const [index, option] of (node.options ?? []).entries()) {
      if (!nodeIds.has(option.nextNodeId)) {
        problems.push(
          `节点 "${node.id}" 的选项 ${index + 1}（"${option.text}"）指向不存在的节点 "${option.nextNodeId}"`,
        );
      }
    }
  }

  return problems;
}

export interface DialogueIndex {
  /** Valid conversations by id; first declaration wins on duplicates. */
  byId: Map<string, DialogueData>;
  /** Dropped duplicate ids, e.g. for warnings. */
  duplicateIds: string[];
}

/** Indexes conversations by id, keeping the first declaration of each id. */
export function indexConversations(set: DialogueSetData): DialogueIndex {
  const byId = new Map<string, DialogueData>();
  const duplicateIds: string[] = [];
  for (const conversation of set.conversations) {
    if (byId.has(conversation.id)) {
      duplicateIds.push(conversation.id);
      continue;
    }
    byId.set(conversation.id, conversation);
  }
  return { byId, duplicateIds };
}

/**
 * Playback state for one conversation. Pure logic — the UI reads the current
 * node and options, calls {@link DialogueSession.choose} on confirm. A node
 * without options is an end node; the UI decides when to close on it.
 */
export class DialogueSession {
  private readonly nodes: readonly DialogueNodeData[];
  private readonly nodeIds: ReadonlySet<string>;
  private readonly startNode: DialogueNodeData;
  private node: DialogueNodeData;

  constructor(conversation: DialogueData) {
    this.nodes = conversation.nodes;
    this.nodeIds = new Set(conversation.nodes.map((node) => node.id));
    const start = conversation.nodes.find((node) => node.id === conversation.startNodeId);
    if (start === undefined) {
      // Callers only build sessions for graph-validated conversations.
      throw new Error(`对话 "${conversation.id}" 缺少起始节点 "${conversation.startNodeId}"`);
    }
    this.startNode = start;
    this.node = start;
  }

  get currentNode(): DialogueNodeData {
    return this.node;
  }

  /** Options of the current node; empty on end nodes. */
  get options(): readonly DialogueOptionData[] {
    return this.node.options ?? [];
  }

  /** True when the current node has no options — Enter/Esc should end. */
  get isAtEndNode(): boolean {
    return this.options.length === 0;
  }

  /** Restores the initial node, e.g. when the same NPC is talked to again. */
  reset(): void {
    this.node = this.startNode;
  }

  /**
   * Advances along the option at `optionIndex`. Out-of-range indexes and
   * dangling targets are ignored (data was graph-validated upstream), so the
   * session never crashes on hostile input.
   */
  choose(optionIndex: number): void {
    const option = this.options.at(optionIndex);
    if (option === undefined || !this.nodeIds.has(option.nextNodeId)) {
      return;
    }
    const next = this.nodes.find((node) => node.id === option.nextNodeId);
    if (next !== undefined) {
      this.node = next;
    }
  }
}
