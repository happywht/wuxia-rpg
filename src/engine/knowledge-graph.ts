/**
 * Data-only knowledge graph protocol and run-state helpers. This module has
 * no Phaser or setting-specific references: every title and description is
 * supplied by validated JSON.
 */

export const KNOWLEDGE_NODE_KINDS = [
  'character',
  'place',
  'faction',
  'item',
  'martialArt',
  'event',
  'quest',
  'ending',
] as const;

export type KnowledgeNodeKind = (typeof KNOWLEDGE_NODE_KINDS)[number];

export const KNOWLEDGE_RELATIONS = [
  'mentorOf',
  'parentOf',
  'hostileTo',
  'belongsTo',
  'locatedAt',
  'holds',
  'triggers',
  'requires',
  'rewards',
  'knows',
  'participatesIn',
  'influences',
] as const;

export type KnowledgeRelation = (typeof KNOWLEDGE_RELATIONS)[number];

export interface KnowledgeNodeData {
  id: string;
  kind: KnowledgeNodeKind;
  title: string;
  summary: string;
  /** Whether a new run starts with this entry already known. */
  knownByDefault: boolean;
}

export interface KnowledgeNodeSetData {
  nodes: KnowledgeNodeData[];
}

export interface KnowledgeEdgeData {
  id: string;
  fromId: string;
  toId: string;
  relation: KnowledgeRelation;
  summary: string;
  /** Signed fraction of a source character's relationship change copied to the target. */
  attitudeSpread?: number;
}

export interface KnowledgeEdgeSetData {
  edges: KnowledgeEdgeData[];
}

export interface KnowledgeGraph {
  nodes: ReadonlyMap<string, KnowledgeNodeData>;
  edges: readonly KnowledgeEdgeData[];
  warnings: readonly string[];
}

export interface KnowledgeSetParseResult<T> {
  ok: true;
  data: T;
  warnings: string[];
}

export type KnowledgeParseResult<T> =
  | KnowledgeSetParseResult<T>
  | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/** Defensive parser; item-level problems are isolated with author-facing warnings. */
export function parseKnowledgeNodeSet(raw: unknown): KnowledgeParseResult<KnowledgeNodeSetData> {
  if (!isObject(raw) || !hasOnlyKeys(raw, ['nodes']) || !Array.isArray(raw.nodes)) {
    return { ok: false, errors: ['nodes：应为知识节点数组'] };
  }
  const nodes: KnowledgeNodeData[] = [];
  const warnings: string[] = [];
  raw.nodes.forEach((entry, index) => {
    const label = `nodes[${index}]`;
    if (!isObject(entry) || !hasOnlyKeys(entry, ['id', 'kind', 'title', 'summary', 'knownByDefault'])) {
      warnings.push(`${label}：节点形状无效，已忽略`);
      return;
    }
    const kind = KNOWLEDGE_NODE_KINDS.find((candidate) => candidate === entry.kind);
    if (
      !isNonEmptyString(entry.id, 64) || kind === undefined ||
      !isNonEmptyString(entry.title, 80) || !isNonEmptyString(entry.summary, 600) ||
      typeof entry.knownByDefault !== 'boolean'
    ) {
      warnings.push(`${label}：字段值无效，已忽略`);
      return;
    }
    nodes.push({
      id: entry.id,
      kind,
      title: entry.title,
      summary: entry.summary,
      knownByDefault: entry.knownByDefault,
    });
  });
  return { ok: true, data: { nodes }, warnings };
}

/** Defensive parser; malformed edge rows do not disable valid siblings. */
export function parseKnowledgeEdgeSet(raw: unknown): KnowledgeParseResult<KnowledgeEdgeSetData> {
  if (!isObject(raw) || !hasOnlyKeys(raw, ['edges']) || !Array.isArray(raw.edges)) {
    return { ok: false, errors: ['edges：应为知识关系数组'] };
  }
  const edges: KnowledgeEdgeData[] = [];
  const warnings: string[] = [];
  raw.edges.forEach((entry, index) => {
    const label = `edges[${index}]`;
    if (!isObject(entry) || !hasOnlyKeys(entry, [
      'id', 'fromId', 'toId', 'relation', 'summary', 'attitudeSpread',
    ])) {
      warnings.push(`${label}：关系形状无效，已忽略`);
      return;
    }
    const relation = KNOWLEDGE_RELATIONS.find((candidate) => candidate === entry.relation);
    if (
      !isNonEmptyString(entry.id, 64) || !isNonEmptyString(entry.fromId, 64) ||
      !isNonEmptyString(entry.toId, 64) || relation === undefined ||
      !isNonEmptyString(entry.summary, 400) ||
      (entry.attitudeSpread !== undefined && (
        typeof entry.attitudeSpread !== 'number' || !Number.isFinite(entry.attitudeSpread) ||
        entry.attitudeSpread < -1 || entry.attitudeSpread > 1 || entry.attitudeSpread === 0
      ))
    ) {
      warnings.push(`${label}：字段值无效，已忽略`);
      return;
    }
    edges.push({
      id: entry.id,
      fromId: entry.fromId,
      toId: entry.toId,
      relation,
      summary: entry.summary,
      ...(entry.attitudeSpread !== undefined ? { attitudeSpread: entry.attitudeSpread as number } : {}),
    });
  });
  return { ok: true, data: { edges }, warnings };
}

/**
 * Indexes unique nodes and retains only uniquely identified edges whose two
 * endpoint nodes exist. A bad row cannot hide unrelated encyclopedia data.
 */
export function assembleKnowledgeGraph(
  nodeSet: KnowledgeNodeSetData,
  edgeSet: KnowledgeEdgeSetData,
): KnowledgeGraph {
  const warnings: string[] = [];
  const nodes = new Map<string, KnowledgeNodeData>();
  for (const node of nodeSet.nodes) {
    if (nodes.has(node.id)) {
      warnings.push(`知识节点 "${node.id}" 重复，保留首条`);
      continue;
    }
    nodes.set(node.id, node);
  }

  const edges: KnowledgeEdgeData[] = [];
  const seenEdgeIds = new Set<string>();
  for (const edge of edgeSet.edges) {
    if (seenEdgeIds.has(edge.id)) {
      warnings.push(`知识关系 "${edge.id}" 重复，保留首条`);
      continue;
    }
    seenEdgeIds.add(edge.id);
    if (!nodes.has(edge.fromId) || !nodes.has(edge.toId)) {
      warnings.push(`知识关系 "${edge.id}" 引用不存在的节点，已忽略`);
      continue;
    }
    if (edge.attitudeSpread !== undefined && (
      nodes.get(edge.fromId)?.kind !== 'character' || nodes.get(edge.toId)?.kind !== 'character'
    )) {
      const { attitudeSpread: _invalidSpread, ...withoutSpread } = edge;
      warnings.push(`知识关系 "${edge.id}" 的态度传播端点不是两名人物，已忽略传播系数`);
      edges.push(withoutSpread);
      continue;
    }
    edges.push(edge);
  }
  return { nodes, edges, warnings };
}

/** New runs know public entries; restored ids are intersected with this graph. */
export function createKnowledgeState(
  graph: Pick<KnowledgeGraph, 'nodes'>,
  restoredNodeIds: readonly string[] = [],
): Set<string> {
  const known = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.knownByDefault) known.add(node.id);
  }
  for (const id of restoredNodeIds) {
    if (graph.nodes.has(id)) known.add(id);
  }
  return known;
}

/** Static NPC knowledge comes only from directed, valid NPC `knows` edges. */
export function createNpcKnowledgeSeeds(
  graph: Pick<KnowledgeGraph, 'nodes' | 'edges'>,
): Map<string, Set<string>> {
  const memories = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.relation !== 'knows' || graph.nodes.get(edge.fromId)?.kind !== 'character') continue;
    let known = memories.get(edge.fromId);
    if (known === undefined) {
      known = new Set();
      memories.set(edge.fromId, known);
    }
    known.add(edge.toId);
  }
  return memories;
}

/** Combines static graph knowledge with saved additions, filtering stale ids. */
export function mergeNpcKnowledge(
  graph: Pick<KnowledgeGraph, 'nodes' | 'edges'>,
  saved?: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const merged = createNpcKnowledgeSeeds(graph);
  for (const [npcId, nodeIds] of saved ?? []) {
    if (graph.nodes.get(npcId)?.kind !== 'character') continue;
    let known = merged.get(npcId);
    if (known === undefined) {
      known = new Set();
      merged.set(npcId, known);
    }
    for (const nodeId of nodeIds) {
      if (graph.nodes.has(nodeId)) known.add(nodeId);
    }
  }
  return merged;
}

/** Returns the graph edges visible to a player who knows both endpoints. */
export function getKnownKnowledgeEdges(
  graph: Pick<KnowledgeGraph, 'edges'>,
  knownNodeIds: ReadonlySet<string>,
  nodeId?: string,
): KnowledgeEdgeData[] {
  return graph.edges.filter((edge) =>
    knownNodeIds.has(edge.fromId) &&
    knownNodeIds.has(edge.toId) &&
    (nodeId === undefined || edge.fromId === nodeId || edge.toId === nodeId),
  );
}
