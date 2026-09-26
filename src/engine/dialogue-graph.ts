/**
 * Generic dialogue-graph protocol: wire types, defensive parsing, per-
 * conversation graph validation, id indexing and playback state.
 *
 * A conversation is a plain node graph: every node carries speaker text and
 * optional player options; a node without options is an end node. Conditions
 * and effects are deliberately out of scope until Round 08 — the engine only
 * understands ids and node transitions, and every visible string stays in
 * the JSON data (see docs/ARCHITECTURE.md).
 *
 * `data/schema/dialogue-set.schema.json` pins down static structure; the
 * per-conversation validation here adds the graph semantics a schema cannot
 * express (start node exists, option targets resolve, node ids unique) so a
 * single broken conversation disables exactly itself, not the whole set.
 */

/** One player-selectable branch leading to another node. */
export interface DialogueOptionData {
  text: string;
  nextNodeId: string;
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
  | { ok: true; set: DialogueSetData }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the value when non-empty, null otherwise (enables TS narrowing). */
function requireNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Parses one node's `options` field.
 * - `undefined` when the field is absent (an end node — valid);
 * - an empty list when the field is `[]` (also an end node — valid);
 * - a validated option list when every entry has `text` and `nextNodeId`;
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
    const text = source === null ? null : requireNonEmptyString(source.text);
    const nextNodeId = source === null ? null : requireNonEmptyString(source.nextNodeId);
    if (text === null || nextNodeId === null) {
      return null;
    }
    parsed.push({ text, nextNodeId });
  }
  return parsed;
}

/**
 * Defensive re-parse of a dialogue-set document. The Ajv schema already
 * rejected structural violations at load time; this guards the engine
 * against unvalidated values and yields readable per-entry errors.
 */
export function parseDialogueSet(raw: unknown): DialogueSetParseResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.conversations)) {
    return { ok: false, errors: ['conversations：应为对话条目数组'] };
  }

  const conversations: DialogueData[] = [];
  const errors: string[] = [];
  raw.conversations.forEach((entry, index) => {
    const label = `conversations[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
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
      errors.push(...problems);
      return;
    }

    rawNodes.forEach((node, nodeIndex) => {
      const nodeLabel = `${label}.nodes[${nodeIndex}]`;
      if (!isPlainObject(node)) {
        errors.push(`${nodeLabel}：应为对象`);
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
        errors.push(...nodeProblems);
        return;
      }

      nodes.push(options === undefined ? { id: nodeId, text } : { id: nodeId, text, options });
    });

    if (errors.length > 0) {
      return; // A single bad node invalidates the whole set document.
    }
    conversations.push({ id, startNodeId, nodes });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { conversations } };
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
