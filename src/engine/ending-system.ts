/** Data-driven finale eligibility and a map-authored endgame gate. */
import { manhattanDistance } from './npc-placement';
import type { CellPosition, GridMap } from './grid-map';
import { getFactionRenown, getRelationship, type SocialState } from './social-state';
import type { FactionMembership } from './faction-system';
import type { QuestStatus } from './quest-system';
import type { KnowledgeNodeData } from './knowledge-graph';

export interface EndingGateData {
  id: string;
  name: string;
  mapResourceId: string;
  position: CellPosition;
  approachText: string;
}

interface ConditionBase { hint: string }
interface NumericRange {
  minValue?: number;
  maxValue?: number;
}

export type EndingConditionData =
  | (ConditionBase & { kind: 'questStatus'; questId: string; status: QuestStatus })
  | (ConditionBase & NumericRange & { kind: 'morality' })
  | (ConditionBase & NumericRange & { kind: 'renown' })
  | (ConditionBase & NumericRange & { kind: 'npcRelationship'; npcId: string })
  | (ConditionBase & { kind: 'factionMembership'; factionId?: string; isMember: boolean })
  | (ConditionBase & NumericRange & { kind: 'factionRenown'; factionId: string })
  | (ConditionBase & { kind: 'knowledgeKnown'; nodeId: string });

export interface EndingData {
  id: string;
  knowledgeNodeId: string;
  title: string;
  epilogue: string;
  priority: number;
  conditions: EndingConditionData[];
  /** Additional complete paths; the original conditions remain a valid path. */
  unlockRoutes?: EndingUnlockRoute[];
  /** Each section selects its first matching variant, otherwise its fallback. */
  epilogueSections?: EndingEpilogueSection[];
}

export interface EndingUnlockRoute {
  id: string;
  title: string;
  epilogue: string;
  conditions: EndingConditionData[];
}
export interface EndingEpilogueSection {
  id: string;
  title: string;
  fallbackText: string;
  variants: { id: string; text: string; conditions: EndingConditionData[] }[];
}

export interface EndingSetData {
  id: string;
  gate: EndingGateData;
  endings: EndingData[];
}

export interface AssembledEndingSet {
  record: EndingSetData;
  gate: EndingGateData;
  endings: readonly EndingData[];
}

export type EndingParseResult =
  | { ok: true; set: EndingSetData; warnings: string[] }
  | { ok: false; errors: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function identifier(value: unknown, prefix: string): value is string {
  return boundedText(value, 96) && value.startsWith(prefix) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.slice(prefix.length));
}

function parseRange(entry: Record<string, unknown>, min: number, max: number): NumericRange | null {
  const minValue = entry.minValue;
  const maxValue = entry.maxValue;
  if ((minValue === undefined && maxValue === undefined) ||
    (minValue !== undefined && !integer(minValue, min, max)) ||
    (maxValue !== undefined && !integer(maxValue, min, max)) ||
    (minValue !== undefined && maxValue !== undefined && minValue > maxValue)) return null;
  return {
    ...(minValue === undefined ? {} : { minValue: minValue as number }),
    ...(maxValue === undefined ? {} : { maxValue: maxValue as number }),
  };
}

function parseCondition(raw: unknown): EndingConditionData | null {
  if (!object(raw) || !boundedText(raw.hint, 140)) return null;
  switch (raw.kind) {
    case 'questStatus':
      return identifier(raw.questId, 'quest.') &&
        ['locked', 'offered', 'active', 'completed', 'failed'].includes(String(raw.status))
        ? { kind: 'questStatus', hint: raw.hint, questId: raw.questId, status: raw.status as QuestStatus }
        : null;
    case 'morality': {
      const range = parseRange(raw, -100, 100);
      return range === null ? null : { kind: 'morality', hint: raw.hint, ...range };
    }
    case 'renown': {
      const range = parseRange(raw, 0, 1000);
      return range === null ? null : { kind: 'renown', hint: raw.hint, ...range };
    }
    case 'npcRelationship': {
      const range = parseRange(raw, -100, 100);
      return range === null || !identifier(raw.npcId, 'char.')
        ? null
        : { kind: 'npcRelationship', hint: raw.hint, npcId: raw.npcId, ...range };
    }
    case 'factionMembership':
      return typeof raw.isMember === 'boolean' &&
        (raw.factionId === undefined || identifier(raw.factionId, 'faction.'))
        ? {
            kind: 'factionMembership',
            hint: raw.hint,
            isMember: raw.isMember,
            ...(raw.factionId === undefined ? {} : { factionId: raw.factionId }),
          }
        : null;
    case 'factionRenown': {
      const range = parseRange(raw, 0, 1000);
      return range === null || !identifier(raw.factionId, 'faction.')
        ? null
        : { kind: 'factionRenown', hint: raw.hint, factionId: raw.factionId, ...range };
    }
    case 'knowledgeKnown':
      return identifier(raw.nodeId, '')
        ? { kind: 'knowledgeKnown', hint: raw.hint, nodeId: raw.nodeId }
        : null;
    default:
      return null;
  }
}

function conditionList(raw: unknown): EndingConditionData[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return null;
  const parsed = raw.map(parseCondition);
  return parsed.some(value => value === null) ? null : parsed as EndingConditionData[];
}

function parseAdditions(entry: Record<string, unknown>): Pick<EndingData, 'unlockRoutes' | 'epilogueSections'> | null {
  const result: Pick<EndingData, 'unlockRoutes' | 'epilogueSections'> = {};
  if (entry.unlockRoutes !== undefined) {
    if (!Array.isArray(entry.unlockRoutes) || entry.unlockRoutes.length < 1 || entry.unlockRoutes.length > 8) return null;
    const seen = new Set<string>();
    result.unlockRoutes = [];
    for (const route of entry.unlockRoutes) {
      if (!object(route) || Object.keys(route).some(key => !['id', 'title', 'epilogue', 'conditions'].includes(key)) ||
        !identifier(route.id, '') || route.id === 'original' || seen.has(route.id) || !boundedText(route.title, 48) || !boundedText(route.epilogue, 600)) return null;
      const conditions = conditionList(route.conditions);
      if (conditions === null) return null;
      seen.add(route.id);
      result.unlockRoutes.push({ id: route.id, title: route.title, epilogue: route.epilogue, conditions });
    }
  }
  if (entry.epilogueSections !== undefined) {
    if (!Array.isArray(entry.epilogueSections) || entry.epilogueSections.length < 1 || entry.epilogueSections.length > 8) return null;
    const seen = new Set<string>();
    result.epilogueSections = [];
    for (const section of entry.epilogueSections) {
      if (!object(section) || Object.keys(section).some(key => !['id', 'title', 'fallbackText', 'variants'].includes(key)) ||
        !identifier(section.id, '') || seen.has(section.id) || !boundedText(section.title, 48) ||
        !boundedText(section.fallbackText, 240) || !Array.isArray(section.variants) || section.variants.length < 1 || section.variants.length > 8) return null;
      const variants: EndingEpilogueSection['variants'] = [];
      const variantIds = new Set<string>();
      for (const variant of section.variants) {
        if (!object(variant) || Object.keys(variant).some(key => !['id', 'text', 'conditions'].includes(key)) ||
          !identifier(variant.id, '') || variantIds.has(variant.id) || !boundedText(variant.text, 240)) return null;
        const conditions = conditionList(variant.conditions);
        if (conditions === null) return null;
        variantIds.add(variant.id);
        variants.push({ id: variant.id, text: variant.text, conditions });
      }
      seen.add(section.id);
      result.epilogueSections.push({ id: section.id, title: section.title, fallbackText: section.fallbackText, variants });
    }
  }
  return result;
}

/** Defensive semantic parse; a malformed ending is isolated from its peers. */
export function parseEndingSet(raw: unknown): EndingParseResult {
  if (!object(raw) || !identifier(raw.id, 'ending.set.') || !object(raw.gate) ||
    !Array.isArray(raw.endings) || raw.endings.length > 32) {
    return { ok: false, errors: ['id/gate/endings：结局集结构无效（结局最多 32 项）'] };
  }
  const gate = raw.gate;
  const position = object(gate.position) ? gate.position : null;
  if (!identifier(gate.id, 'ending.gate.') || !boundedText(gate.name, 48) ||
    !identifier(gate.mapResourceId, 'map.') || position === null ||
    !integer(position.col, 0, 255) || !integer(position.row, 0, 255) ||
    !boundedText(gate.approachText, 120)) {
    return { ok: false, errors: ['gate：入口 id、名称、地图、坐标或交互提示无效'] };
  }
  const warnings: string[] = [];
  const seen = new Set<string>();
  const endings: EndingData[] = [];
  raw.endings.forEach((entry, index) => {
    const label = 'endings[' + index + ']';
    if (!object(entry) || !identifier(entry.id, 'ending.') || seen.has(entry.id)) {
      warnings.push(label + '.id：结局 id 无效或重复，已禁用该结局');
      return;
    }
    seen.add(entry.id);
    if (!identifier(entry.knowledgeNodeId, '') || !boundedText(entry.title, 48) ||
      !boundedText(entry.epilogue, 600) || !integer(entry.priority, -1000, 1000) ||
      !Array.isArray(entry.conditions) || entry.conditions.length < 1 || entry.conditions.length > 12) {
      warnings.push(label + '：词条、标题、结局正文、优先级或条件列表无效，已禁用该结局');
      return;
    }
    const conditions: EndingConditionData[] = [];
    let valid = true;
    entry.conditions.forEach((condition, conditionIndex) => {
      const parsed = parseCondition(condition);
      if (parsed === null) {
        warnings.push(label + '.conditions[' + conditionIndex + ']：条件无效，已禁用该结局');
        valid = false;
      } else conditions.push(parsed);
    });
    const additions = parseAdditions(entry);
    if (additions === null) {
      warnings.push(label + '：额外达成路径或尾声分节无效，已禁用该结局');
      valid = false;
    }
    if (valid) endings.push({
      id: entry.id,
      knowledgeNodeId: entry.knowledgeNodeId,
      title: entry.title,
      epilogue: entry.epilogue,
      priority: entry.priority,
      conditions,
      ...additions,
    });
  });
  return {
    ok: true,
    set: {
      id: raw.id,
      gate: {
        id: gate.id,
        name: gate.name,
        mapResourceId: gate.mapResourceId,
        position: { col: position.col, row: position.row },
        approachText: gate.approachText,
      },
      endings,
    },
    warnings,
  };
}

export interface EndingAssemblyInput {
  set: EndingSetData | null;
  maps: ReadonlyMap<string, GridMap>;
  /** Cells occupied by all fixed world objects and map triggers. */
  blockedCells: ReadonlyMap<string, ReadonlySet<string>>;
  knowledgeNodes: ReadonlyMap<string, KnowledgeNodeData>;
  questIds: ReadonlySet<string>;
  npcIds: ReadonlySet<string>;
  factionIds: ReadonlySet<string>;
}

/** Resolves map geometry and cross-resource condition/ending references. */
export function assembleEndingSet(input: EndingAssemblyInput): {
  endingSet: AssembledEndingSet | null;
  warnings: string[];
} {
  const set = input.set;
  if (set === null) return { endingSet: null, warnings: [] };
  const warnings: string[] = [];
  const map = input.maps.get(set.gate.mapResourceId);
  const key = set.gate.position.col + ',' + set.gate.position.row;
  const blocked = input.blockedCells.get(set.gate.mapResourceId);
  if (map === undefined || !map.canEnter(set.gate.position.col, set.gate.position.row) ||
    blocked?.has(key) === true) {
    return {
      endingSet: null,
      warnings: ['终章入口「' + set.gate.name + '」所在地图或坐标无效/占用，已关闭结局入口'],
    };
  }

  const endings: EndingData[] = [];
  for (const ending of set.endings) {
    const node = input.knowledgeNodes.get(ending.knowledgeNodeId);
    if (node?.kind !== 'ending') {
      warnings.push('结局 "' + ending.id + '" 引用的知识节点 "' + ending.knowledgeNodeId +
        '" 不存在或不是 ending 类型，已禁用');
      continue;
    }
    let valid = true;
    const allConditions = [...ending.conditions,
      ...(ending.unlockRoutes ?? []).flatMap(route => route.conditions),
      ...(ending.epilogueSections ?? []).flatMap(section => section.variants.flatMap(variant => variant.conditions))];
    for (const condition of allConditions) {
      if (condition.kind === 'questStatus' && !input.questIds.has(condition.questId)) {
        warnings.push('结局 "' + ending.id + '" 的任务条件 "' + condition.questId + '" 不存在，已禁用该结局');
        valid = false;
        break;
      }
      if (condition.kind === 'npcRelationship' && !input.npcIds.has(condition.npcId)) {
        warnings.push('结局 "' + ending.id + '" 的人物关系条件 "' + condition.npcId + '" 不存在，已禁用该结局');
        valid = false;
        break;
      }
      if ((condition.kind === 'factionMembership' || condition.kind === 'factionRenown') &&
        condition.factionId !== undefined && !input.factionIds.has(condition.factionId)) {
        warnings.push('结局 "' + ending.id + '" 的门派条件 "' + condition.factionId + '" 不存在，已禁用该结局');
        valid = false;
        break;
      }
      if (condition.kind === 'knowledgeKnown' && !input.knowledgeNodes.has(condition.nodeId)) {
        warnings.push('结局 "' + ending.id + '" 的知识条件 "' + condition.nodeId + '" 不存在，已禁用该结局');
        valid = false;
        break;
      }
    }
    if (valid) endings.push(ending);
  }
  endings.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return { endingSet: { record: set, gate: set.gate, endings }, warnings };
}

export interface EndingEvaluationContext {
  questStatuses: ReadonlyMap<string, QuestStatus>;
  social: Readonly<SocialState>;
  factionMembership: FactionMembership | null;
  knownKnowledgeNodeIds: ReadonlySet<string>;
}

export interface EvaluatedEnding {
  ending: EndingData;
  available: boolean;
  unmetHints: readonly string[];
  routes: readonly { id: string; title: string; available: boolean; unmetHints: readonly string[] }[];
  /** The path actually adopted when available: first satisfied authored route, else the original. */
  selectedRoute?: { id: string; title: string };
  /** Chosen path introduction plus state-resolved aftermath; pure and unsaved. */
  resolvedEpilogue: string;
}

function within(value: number, minValue?: number, maxValue?: number): boolean {
  return (minValue === undefined || value >= minValue) &&
    (maxValue === undefined || value <= maxValue);
}

function meetsCondition(condition: EndingConditionData, context: EndingEvaluationContext): boolean {
  switch (condition.kind) {
    case 'questStatus': return context.questStatuses.get(condition.questId) === condition.status;
    case 'morality': return within(context.social.morality, condition.minValue, condition.maxValue);
    case 'renown': return within(context.social.renown, condition.minValue, condition.maxValue);
    case 'npcRelationship':
      return within(getRelationship(context.social, condition.npcId), condition.minValue, condition.maxValue);
    case 'factionMembership': {
      const isMember = condition.factionId === undefined
        ? context.factionMembership !== null
        : context.factionMembership?.factionId === condition.factionId;
      return isMember === condition.isMember;
    }
    case 'factionRenown':
      return within(getFactionRenown(context.social, condition.factionId), condition.minValue, condition.maxValue);
    case 'knowledgeKnown': return context.knownKnowledgeNodeIds.has(condition.nodeId);
  }
}

/** Pure evaluation: conditions within each route are conjunctive; any complete route unlocks. */
export function evaluateEndings(
  endingSet: AssembledEndingSet,
  context: EndingEvaluationContext,
): EvaluatedEnding[] {
  return endingSet.endings.map((ending) => {
    const paths = [{ id: 'original', title: '原有旅程', epilogue: ending.epilogue, conditions: ending.conditions },
      ...(ending.unlockRoutes ?? [])];
    const routes = paths.map(path => {
      const unmetHints = path.conditions.filter(condition => !meetsCondition(condition, context)).map(condition => condition.hint);
      return { id: path.id, title: path.title, available: unmetHints.length === 0, unmetHints };
    });
    // Authored unlockRoutes win in declaration order; the original path is
    // only a fallback, so a completed three-chapter journey is never masked
    // by an earlier still-valid legacy introduction.
    const extensionIndex = routes.findIndex((route, index) => index > 0 && route.available);
    const availableIndex = extensionIndex >= 0 ? extensionIndex : routes[0]!.available ? 0 : -1;
    const nearest = routes.reduce((best, route) => route.unmetHints.length < best.unmetHints.length ? route : best, routes[0]!);
    const introduction = paths[availableIndex < 0 ? 0 : availableIndex]!.epilogue;
    const sections = (ending.epilogueSections ?? []).map(section => {
      const variant = section.variants.find(candidate => candidate.conditions.every(condition => meetsCondition(condition, context)));
      return section.title + '\n' + (variant?.text ?? section.fallbackText);
    });
    return { ending, available: availableIndex >= 0, unmetHints: availableIndex >= 0 ? [] : nearest.unmetHints,
      routes, ...(availableIndex >= 0 ? { selectedRoute: { id: paths[availableIndex]!.id, title: paths[availableIndex]!.title } } : {}),
      resolvedEpilogue: [introduction, ...sections].join('\n\n') };
  });
}

export type EndingSelectionResult =
  | { ok: true; ending: EndingData; route: { id: string; title: string } }
  | { ok: false; reason: string };

/** Validates a UI selection against the same current-state evaluation. */
export function selectEnding(
  endingSet: AssembledEndingSet,
  endingId: string,
  context: EndingEvaluationContext,
): EndingSelectionResult {
  const evaluated = evaluateEndings(endingSet, context).find((candidate) => candidate.ending.id === endingId);
  if (evaluated === undefined) return { ok: false, reason: '该结局当前不可用' };
  if (!evaluated.available) return { ok: false, reason: evaluated.unmetHints.join('；') };
  const route = evaluated.selectedRoute ?? { id: 'original', title: '原有旅程' };
  return { ok: true, ending: { ...evaluated.ending, epilogue: evaluated.resolvedEpilogue }, route };
}

/** The gate follows the world's standard four-way adjacency interaction rule. */
export function selectAdjacentEndingGate(
  endingSet: AssembledEndingSet | null,
  mapResourceId: string,
  player: CellPosition,
): AssembledEndingSet | null {
  if (endingSet === null || endingSet.gate.mapResourceId !== mapResourceId) return null;
  return manhattanDistance(endingSet.gate.position, player) === 1 ? endingSet : null;
}
