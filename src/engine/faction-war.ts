/** Data-driven faction campaigns, cross-resource assembly and save records. */
import type { MartialArtData } from './character-progression';
import { manhattanDistance } from './npc-placement';
import type { CellPosition, GridMap } from './grid-map';
import type { BattleEncounterData, EncounterEnemyData } from './turn-based-combat';

export interface FactionWarOpponentData {
  enemy: EncounterEnemyData;
}
export interface FactionWarStageData {
  id: string;
  title: string;
  contribution: number;
  firstFactionOpponent: FactionWarOpponentData;
  secondFactionOpponent: FactionWarOpponentData;
  victoryExperience: number;
  defeatRecovery: { healthRatio: number; qiRatio: number };
  texts: { intro: string; victory: string; defeat: string; flee: string };
}
export interface FactionWarOutcomeData {
  personalRenownDelta: number;
  alliedFactionRenownDelta: number;
  opposingFactionRenownDelta: number;
  knowledgeNodeId: string;
  text: string;
}
export interface FactionWarData {
  id: string;
  name: string;
  description: string;
  mapResourceId: string;
  position: CellPosition;
  firstFactionId: string;
  secondFactionId: string;
  contributionThreshold: number;
  stages: FactionWarStageData[];
  outcomes: { victory: FactionWarOutcomeData; stalemate: FactionWarOutcomeData; defeat: FactionWarOutcomeData };
  texts: { approach: string };
}
export interface FactionWarSetData { wars: FactionWarData[] }
export interface FactionWarRecord {
  warId: string;
  attempts: number;
  victories: number;
  stalemates: number;
  defeats: number;
  bestContribution: number;
  lastContribution: number;
  lastOutcome: 'victory' | 'stalemate' | 'defeat' | null;
}
export interface AssembledFactionWar {
  record: FactionWarData;
  enemyArts: ReadonlyMap<string, readonly MartialArtData[]>;
}
export type FactionWarParseResult =
  | { ok: true; set: FactionWarSetData; errors: string[] }
  | { ok: false; errors: string[] };

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function str(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function int(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function ratio(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function stringIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(str) && new Set(value).size === value.length;
}

function parseOpponent(raw: unknown, label: string): { opponent: FactionWarOpponentData | null; errors: string[] } {
  const errors: string[] = [];
  if (!obj(raw)) return { opponent: null, errors: [label + '：应为对象'] };
  const enemy = obj(raw.enemy) ? raw.enemy : null;
  const attrs = enemy !== null && obj(enemy.attributes) ? enemy.attributes : null;
  const keys = ['body', 'force', 'agility', 'insight', 'resolve'] as const;
  const attributes = {} as EncounterEnemyData['attributes'];
  let attrsValid = attrs !== null;
  for (const key of keys) {
    if (attrs !== null && int(attrs[key], 1, 999)) attributes[key] = attrs[key];
    else attrsValid = false;
  }
  if (attrs !== null && Object.keys(attrs).length !== keys.length) attrsValid = false;
  const artIds = enemy?.martialArtIds;
  const valid = enemy !== null && str(enemy.name) && attrsValid && int(enemy.health, 1, 9999) &&
    int(enemy.qi, 0, 9999) && stringIds(artIds) && artIds.length > 0;
  if (!valid) errors.push(label + '.enemy：名称、属性、生命/内力与武学引用不合规');
  if (!valid) return { opponent: null, errors };
  return { opponent: { enemy: {
    name: enemy.name as string, attributes, health: enemy.health as number,
    qi: enemy.qi as number, martialArtIds: artIds as string[],
  } }, errors };
}

function parseStage(raw: unknown, label: string): { stage: FactionWarStageData | null; errors: string[] } {
  const errors: string[] = [];
  if (!obj(raw)) return { stage: null, errors: [label + '：应为对象'] };
  const firstFactionOpponent = parseOpponent(raw.firstFactionOpponent, label + '.firstFactionOpponent');
  const secondFactionOpponent = parseOpponent(raw.secondFactionOpponent, label + '.secondFactionOpponent');
  errors.push(...firstFactionOpponent.errors, ...secondFactionOpponent.errors);
  const recovery = obj(raw.defeatRecovery) ? raw.defeatRecovery : null;
  const sourceTexts = obj(raw.texts) ? raw.texts : null;
  const texts = sourceTexts !== null && str(sourceTexts.intro) && str(sourceTexts.victory) &&
    str(sourceTexts.defeat) && str(sourceTexts.flee)
    ? { intro: sourceTexts.intro, victory: sourceTexts.victory, defeat: sourceTexts.defeat, flee: sourceTexts.flee }
    : null;
  const ok = str(raw.id) && str(raw.title) && int(raw.contribution, 1, 1000) &&
    firstFactionOpponent.opponent !== null && secondFactionOpponent.opponent !== null && int(raw.victoryExperience, 0, 1000000) &&
    recovery !== null && ratio(recovery.healthRatio) && ratio(recovery.qiRatio) && texts !== null;
  if (!ok) errors.push(label + '：阶段、双方敌手、经验、恢复比例或文本结构无效');
  if (!ok) return { stage: null, errors };
  return { stage: {
    id: raw.id as string,
    title: raw.title as string,
    contribution: raw.contribution as number,
    firstFactionOpponent: firstFactionOpponent.opponent as FactionWarOpponentData,
    secondFactionOpponent: secondFactionOpponent.opponent as FactionWarOpponentData,
    victoryExperience: raw.victoryExperience as number,
    defeatRecovery: { healthRatio: recovery.healthRatio as number, qiRatio: recovery.qiRatio as number },
    texts: texts as FactionWarStageData['texts'],
  }, errors };
}

function parseOutcome(raw: unknown, label: string): { outcome: FactionWarOutcomeData | null; errors: string[] } {
  if (!obj(raw) || !int(raw.personalRenownDelta, -1000, 1000) ||
    !int(raw.alliedFactionRenownDelta, -1000, 1000) || !int(raw.opposingFactionRenownDelta, -1000, 1000) ||
    !str(raw.knowledgeNodeId) || !str(raw.text)) {
    return { outcome: null, errors: [label + '：声望变化、见闻引用或结算文本无效'] };
  }
  return { outcome: {
    personalRenownDelta: raw.personalRenownDelta,
    alliedFactionRenownDelta: raw.alliedFactionRenownDelta,
    opposingFactionRenownDelta: raw.opposingFactionRenownDelta,
    knowledgeNodeId: raw.knowledgeNodeId,
    text: raw.text,
  }, errors: [] };
}

function parseWar(raw: unknown, label: string): { war: FactionWarData | null; errors: string[] } {
  const errors: string[] = [];
  if (!obj(raw)) return { war: null, errors: [label + '：应为对象'] };
  const position = obj(raw.position) && int(raw.position.col, 0, 255) && int(raw.position.row, 0, 255)
    ? { col: raw.position.col, row: raw.position.row } : null;
  const texts = obj(raw.texts) && str(raw.texts.approach) ? { approach: raw.texts.approach } : null;
  const stages: FactionWarStageData[] = [];
  let stagesValid = Array.isArray(raw.stages) && raw.stages.length > 0;
  const stageIds = new Set<string>();
  if (Array.isArray(raw.stages)) raw.stages.forEach((entry, index) => {
    const parsed = parseStage(entry, label + '.stages[' + index + ']');
    errors.push(...parsed.errors);
    if (parsed.stage === null) stagesValid = false;
    else if (stageIds.has(parsed.stage.id)) {
      stagesValid = false;
      errors.push(label + '.stages[' + index + ']：阶段 id 重复');
    } else { stageIds.add(parsed.stage.id); stages.push(parsed.stage); }
  });
  const sourceOutcomes = obj(raw.outcomes) ? raw.outcomes : null;
  const victory = parseOutcome(sourceOutcomes?.victory, label + '.outcomes.victory');
  const stalemate = parseOutcome(sourceOutcomes?.stalemate, label + '.outcomes.stalemate');
  const defeat = parseOutcome(sourceOutcomes?.defeat, label + '.outcomes.defeat');
  errors.push(...victory.errors, ...stalemate.errors, ...defeat.errors);
  const ok = str(raw.id) && str(raw.name) && str(raw.description) && str(raw.mapResourceId) && position !== null &&
    str(raw.firstFactionId) && str(raw.secondFactionId) && raw.firstFactionId !== raw.secondFactionId &&
    int(raw.contributionThreshold, 1, 12000) && stagesValid && victory.outcome !== null &&
    stalemate.outcome !== null && defeat.outcome !== null && texts !== null;
  if (!ok) errors.push(label + '：门派战入口、参战方、贡献门槛、阶段或结局结构无效');
  if (!ok) return { war: null, errors };
  return { war: {
    id: raw.id as string, name: raw.name as string, description: raw.description as string,
    mapResourceId: raw.mapResourceId as string, position,
    firstFactionId: raw.firstFactionId as string, secondFactionId: raw.secondFactionId as string,
    contributionThreshold: raw.contributionThreshold as number, stages,
    outcomes: { victory: victory.outcome as FactionWarOutcomeData, stalemate: stalemate.outcome as FactionWarOutcomeData, defeat: defeat.outcome as FactionWarOutcomeData },
    texts: texts as FactionWarData['texts'],
  }, errors };
}

/** Semantic validation preserves sound records beside a malformed record. */
export function parseFactionWarSet(raw: unknown): FactionWarParseResult {
  if (!obj(raw) || !Array.isArray(raw.wars)) return { ok: false, errors: ['wars：应为数组'] };
  const wars: FactionWarData[] = [];
  const errors: string[] = [];
  raw.wars.forEach((entry, index) => {
    const parsed = parseWar(entry, 'wars[' + index + ']');
    errors.push(...parsed.errors);
    if (parsed.war !== null) wars.push(parsed.war);
  });
  return { ok: true, set: { wars }, errors };
}

export interface FactionWarAssemblyInput {
  set: FactionWarSetData | null;
  knownResourceIds: ReadonlySet<string>;
  maps: ReadonlyMap<string, GridMap>;
  blockedCells: ReadonlyMap<string, ReadonlySet<string>>;
  factions: ReadonlySet<string>;
  martialArts: ReadonlyMap<string, MartialArtData>;
  knowledgeNodeIds: ReadonlySet<string>;
}
export function assembleFactionWars(input: FactionWarAssemblyInput): { wars: AssembledFactionWar[]; warnings: string[] } {
  const wars: AssembledFactionWar[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const occupied = new Set<string>();
  for (const record of input.set?.wars ?? []) {
    const problems: string[] = [];
    const map = input.maps.get(record.mapResourceId);
    const cell = record.position.col + ',' + record.position.row;
    const key = record.mapResourceId + ':' + cell;
    if (!input.knownResourceIds.has(record.mapResourceId) || map === undefined) problems.push('地图不可用');
    else if (!map.inBounds(record.position.col, record.position.row) || map.isSolid(record.position.col, record.position.row)) problems.push('入口格不可通行');
    if (input.blockedCells.get(record.mapResourceId)?.has(cell)) problems.push('入口格与出生点、NPC、遭遇、擂台或门派战重叠');
    if (occupied.has(key)) problems.push('入口格与另一门派战重叠');
    if (seenIds.has(record.id)) problems.push('门派战 id 重复');
    if (!input.factions.has(record.firstFactionId) || !input.factions.has(record.secondFactionId)) problems.push('参战门派引用无效');
    if (record.contributionThreshold > record.stages.reduce((sum, stage) => sum + stage.contribution, 0)) problems.push('贡献门槛高于全部阶段可获贡献');
    const enemyArts = new Map<string, readonly MartialArtData[]>();
    for (const stage of record.stages) {
      for (const [factionId, opponent] of [
        [record.firstFactionId, stage.firstFactionOpponent] as const,
        [record.secondFactionId, stage.secondFactionOpponent] as const,
      ]) {
        const arts = opponent.enemy.martialArtIds.map((id) => input.martialArts.get(id));
        if (arts.some((art) => art === undefined)) problems.push('阶段 ' + stage.id + ' 的武学引用无效');
        else enemyArts.set(stage.id + ':' + factionId, arts as MartialArtData[]);
      }
    }
    for (const [outcomeId, outcome] of Object.entries(record.outcomes)) {
      if (!input.knowledgeNodeIds.has(outcome.knowledgeNodeId)) problems.push(outcomeId + ' 结局的见闻节点不存在');
    }
    seenIds.add(record.id);
    if (problems.length > 0) { warnings.push('门派战「' + record.id + '」已禁用：' + [...new Set(problems)].join('；')); continue; }
    occupied.add(key);
    wars.push({ record, enemyArts });
  }
  return { wars, warnings };
}

export function selectFactionWarTarget(wars: readonly AssembledFactionWar[], mapId: string, from: CellPosition): AssembledFactionWar | null {
  let result: AssembledFactionWar | null = null;
  for (const war of wars) {
    if (war.record.mapResourceId !== mapId || manhattanDistance(from, war.record.position) > 1) continue;
    if (result === null || war.record.id < result.record.id) result = war;
  }
  return result;
}

/** Pure stage pagination shared by the UI and no-Phaser verification. */
export function paginateFactionWarStages(
  stages: readonly FactionWarStageData[],
  requestedPage: number,
  pageSize: number,
): { pageIndex: number; pageCount: number; stages: FactionWarStageData[] } {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer');
  const pageCount = Math.ceil(stages.length / pageSize);
  const lastPage = Math.max(0, pageCount - 1);
  const pageIndex = Math.min(lastPage, Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  return { pageIndex, pageCount, stages: stages.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) };
}

export function createFactionWarRecord(warId: string): FactionWarRecord {
  return { warId, attempts: 0, victories: 0, stalemates: 0, defeats: 0, bestContribution: 0, lastContribution: 0, lastOutcome: null };
}

/** Shared outcome rule used by both the campaign scene and headless checks. */
export function resolveFactionWarOutcome(contribution: number, threshold: number): 'victory' | 'stalemate' | 'defeat' {
  if (!Number.isSafeInteger(contribution) || contribution < 0 || !Number.isSafeInteger(threshold) || threshold < 1) return 'defeat';
  return contribution >= threshold ? 'victory' : contribution > 0 ? 'stalemate' : 'defeat';
}

/** An omitted field is a valid pre-R21 v1 save. */
export function parseFactionWarRecords(raw: unknown): FactionWarRecord[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const records: FactionWarRecord[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!obj(entry) || !str(entry.warId) || seen.has(entry.warId) ||
      !int(entry.attempts, 0, Number.MAX_SAFE_INTEGER) || !int(entry.victories, 0, Number.MAX_SAFE_INTEGER) ||
      !int(entry.stalemates, 0, Number.MAX_SAFE_INTEGER) || !int(entry.defeats, 0, Number.MAX_SAFE_INTEGER) ||
      !int(entry.bestContribution, 0, 12000) || !int(entry.lastContribution, 0, 12000) ||
      !(entry.lastOutcome === null || entry.lastOutcome === 'victory' || entry.lastOutcome === 'stalemate' || entry.lastOutcome === 'defeat')) return null;
    seen.add(entry.warId);
    records.push({ warId: entry.warId, attempts: entry.attempts, victories: entry.victories, stalemates: entry.stalemates,
      defeats: entry.defeats, bestContribution: entry.bestContribution, lastContribution: entry.lastContribution, lastOutcome: entry.lastOutcome });
  }
  return records;
}

export function factionWarStageAsEncounter(
  war: FactionWarData,
  stage: FactionWarStageData,
  profileId: string,
  enemyFactionId: string,
): BattleEncounterData {
  const opponent = enemyFactionId === war.firstFactionId
    ? stage.firstFactionOpponent
    : stage.secondFactionOpponent;
  return {
    id: war.id + '.' + stage.id, name: stage.title, mapResourceId: war.mapResourceId, position: war.position,
    profileId, enemy: opponent.enemy, victoryExperience: stage.victoryExperience,
    defeatRecovery: stage.defeatRecovery, repeatable: true,
    texts: { approach: war.texts.approach, ...stage.texts },
  };
}
