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

export interface KnowledgeCollectionProgress {
  kind: KnowledgeNodeKind;
  discovered: number;
  total: number;
  /** Empty categories report 0%; they contain no collectible entries yet. */
  percent: number;
}

/** Runtime facts with stable ids that can reveal matching graph entries. */
export interface KnowledgeObservations {
  characterIds?: readonly string[];
  placeIds?: readonly string[];
  itemIds?: readonly string[];
  martialArtIds?: readonly string[];
}

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

export interface KnowledgeProgressData {
  completedByNodeId: string;
  pendingLabel: string;
  completedLabel: string;
}

export interface KnowledgeNodeData {
  id: string;
  kind: KnowledgeNodeKind;
  title: string;
  summary: string;
  /** Whether a new run starts with this entry already known. */
  knownByDefault: boolean;
  progress?: KnowledgeProgressData;
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
    if (!isObject(entry) || !hasOnlyKeys(entry, ['id', 'kind', 'title', 'summary', 'knownByDefault', 'progress'])) {
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
    let progress: KnowledgeProgressData | undefined;
    if (entry.progress !== undefined) {
      const candidate = entry.progress;
      if (isObject(candidate) && hasOnlyKeys(candidate, ['completedByNodeId', 'pendingLabel', 'completedLabel']) &&
        isNonEmptyString(candidate.completedByNodeId, 64) && isNonEmptyString(candidate.pendingLabel, 80) &&
        isNonEmptyString(candidate.completedLabel, 80)) {
        progress = { completedByNodeId: candidate.completedByNodeId, pendingLabel: candidate.pendingLabel, completedLabel: candidate.completedLabel };
      } else warnings.push(`${label}：进度说明无效，保留节点并忽略进度`);
    }
    nodes.push({
      id: entry.id,
      kind,
      title: entry.title,
      summary: entry.summary,
      knownByDefault: entry.knownByDefault,
      ...(progress === undefined ? {} : { progress }),
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

  for (const [id, node] of nodes) {
    if (node.progress !== undefined && (node.progress.completedByNodeId === id || !nodes.has(node.progress.completedByNodeId))) {
      const { progress: _invalidProgress, ...withoutProgress } = node;
      nodes.set(id, withoutProgress);
      warnings.push(`知识节点 "${id}" 的进度完成引用无效，保留节点并忽略进度`);
    }
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

/** Purely projects collection totals from the graph and current discovery set. */
export function projectKnowledgeCollection(
  graph: Pick<KnowledgeGraph, 'nodes'>,
  knownNodeIds: ReadonlySet<string>,
): KnowledgeCollectionProgress[] {
  return KNOWLEDGE_NODE_KINDS.map((kind) => {
    let total = 0;
    let discovered = 0;
    for (const node of graph.nodes.values()) {
      if (node.kind !== kind) continue;
      total += 1;
      if (knownNodeIds.has(node.id)) discovered += 1;
    }
    return {
      kind,
      discovered,
      total,
      percent: total === 0 ? 0 : Math.floor((discovered / total) * 100),
    };
  });
}

/**
 * Adds entries revealed by observed game facts when ids and node kinds match.
 * The graph remains immutable; already-known, unknown, or mismatched ids are
 * ignored, and the returned rows contain only newly discovered entries.
 */
export function discoverObservedKnowledge(
  graph: Pick<KnowledgeGraph, 'nodes'>,
  knownNodeIds: Set<string>,
  observations: KnowledgeObservations,
): KnowledgeNodeData[] {
  const groups: readonly [KnowledgeNodeKind, readonly string[] | undefined][] = [
    ['character', observations.characterIds],
    ['place', observations.placeIds],
    ['item', observations.itemIds],
    ['martialArt', observations.martialArtIds],
  ];
  const discovered: KnowledgeNodeData[] = [];
  for (const [kind, ids] of groups) {
    for (const id of ids ?? []) {
      const node = graph.nodes.get(id);
      if (node === undefined || node.kind !== kind || knownNodeIds.has(id)) continue;
      knownNodeIds.add(id);
      discovered.push(node);
    }
  }
  return discovered;
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

/** Read-only projection of player progress; NPC memories are never completion evidence. */
export function projectKnowledgeProgress(node: KnowledgeNodeData, knownNodeIds: ReadonlySet<string>): { state: 'unreceived' | 'pending' | 'completed'; label: string } | undefined {
  const progress = node.progress;
  if (progress === undefined) return undefined;
  if (knownNodeIds.has(progress.completedByNodeId)) return { state: 'completed', label: progress.completedLabel };
  if (knownNodeIds.has(node.id)) return { state: 'pending', label: progress.pendingLabel };
  return { state: 'unreceived', label: '你尚未取得此见闻' };
}
