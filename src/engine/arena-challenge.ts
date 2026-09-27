/** Data-driven arena contracts and Phaser-free helpers. Arena rounds use the
 * combat protocol without becoming placed world encounters or quest signals. */
import type { CellPosition, GridMap } from './grid-map';
import type { MartialArtData } from './character-progression';
import type { BattleEncounterData, EncounterEnemyData } from './turn-based-combat';
import { manhattanDistance } from './npc-placement';

export interface ArenaOpponentData {
  id: string;
  name: string;
  enemy: EncounterEnemyData;
  victoryExperience: number;
  defeatRecovery: { healthRatio: number; qiRatio: number };
  texts: { intro: string; victory: string; defeat: string; flee: string };
}
export interface ArenaData {
  id: string;
  name: string;
  description: string;
  mapResourceId: string;
  position: CellPosition;
  profileId: string;
  opponents: ArenaOpponentData[];
  reward: { currency: number; items: { itemId: string; quantity: number }[] };
  texts: { approach: string; champion: string; retreat: string };
}
export interface ArenaSetData { arenas: ArenaData[] }
export interface ArenaRecord {
  arenaId: string;
  attempts: number;
  bestWins: number;
  championships: number;
  lastWins: number;
}
export interface AssembledArena {
  record: ArenaData;
  enemyArts: ReadonlyMap<string, readonly MartialArtData[]>;
}
export type ArenaParseResult = { ok: true; set: ArenaSetData; errors: string[] } | { ok: false; errors: string[] };

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function str(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function int(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(str) && new Set(value).size === value.length;
}
function ratio(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }

function parseOpponent(value: unknown, label: string): { data: ArenaOpponentData | null; errors: string[] } {
  const errors: string[] = [];
  if (!obj(value)) return { data: null, errors: [label + '：应为对象'] };
  const enemy = obj(value.enemy) ? value.enemy : null;
  const attr = enemy !== null && obj(enemy.attributes) ? enemy.attributes : null;
  const keys = ['body', 'force', 'agility', 'insight', 'resolve'] as const;
  const attributes = {} as EncounterEnemyData['attributes'];
  let attributesValid = attr !== null;
  for (const key of keys) {
    if (attr !== null && int(attr[key], 1, 999)) attributes[key] = attr[key];
    else attributesValid = false;
  }
  if (attr !== null && Object.keys(attr).length !== keys.length) attributesValid = false;
  const martialArtIds = enemy?.martialArtIds;
  const recovery = obj(value.defeatRecovery) ? value.defeatRecovery : null;
  const texts = obj(value.texts) ? value.texts : null;
  const textData = {} as ArenaOpponentData['texts'];
  let textsValid = texts !== null;
  for (const key of ['intro', 'victory', 'defeat', 'flee'] as const) {
    if (texts !== null && str(texts[key])) textData[key] = texts[key];
    else textsValid = false;
  }
  if (!str(value.id) || !str(value.name)) errors.push(label + '：id/name 应为非空字符串');
  if (enemy === null || !str(enemy.name) || !attributesValid || !int(enemy.health, 1, 9999) ||
    !int(enemy.qi, 0, 9999) || !ids(martialArtIds) || martialArtIds.length === 0) {
    errors.push(label + '.enemy：名称、属性、生命/内力与武学引用不合规');
  }
  if (!int(value.victoryExperience, 0, 1000000)) errors.push(label + '.victoryExperience：整数应在 0–1000000');
  if (recovery === null || !ratio(recovery.healthRatio) || !ratio(recovery.qiRatio)) errors.push(label + '.defeatRecovery：比例应在 0–1');
  if (!textsValid) errors.push(label + '.texts：应含 intro/victory/defeat/flee 文本');
  if (errors.length || enemy === null || !str(enemy.name) || !attributesValid || !int(enemy.health, 1, 9999) ||
    !int(enemy.qi, 0, 9999) || !ids(martialArtIds) || !int(value.victoryExperience, 0, 1000000) ||
    recovery === null || !ratio(recovery.healthRatio) || !ratio(recovery.qiRatio) || !textsValid) {
    return { data: null, errors };
  }
  return { data: {
    id: value.id as string, name: value.name as string,
    enemy: { name: enemy.name, attributes, health: enemy.health, qi: enemy.qi, martialArtIds },
    victoryExperience: value.victoryExperience,
    defeatRecovery: { healthRatio: recovery.healthRatio, qiRatio: recovery.qiRatio },
    texts: textData,
  }, errors };
}

/** Semantic parser complements the static JSON Schema at the loader boundary. */
export function parseArenaSet(raw: unknown): ArenaParseResult {
  if (!obj(raw) || !Array.isArray(raw.arenas)) return { ok: false, errors: ['arenas：应为数组'] };
  const errors: string[] = [];
  const arenas: ArenaData[] = [];
  raw.arenas.forEach((value, index) => {
    const label = 'arenas[' + index + ']';
    if (!obj(value)) { errors.push(label + '：应为对象'); return; }
    const pos = obj(value.position) && int(value.position.col, 0, 255) && int(value.position.row, 0, 255)
      ? { col: value.position.col, row: value.position.row } : null;
    const reward = obj(value.reward) ? value.reward : null;
    const rawItems = reward?.items;
    const items: ArenaData['reward']['items'] = [];
    let itemsValid = Array.isArray(rawItems);
    if (Array.isArray(rawItems)) rawItems.forEach((item, n) => {
      if (!obj(item) || !str(item.itemId) || !int(item.quantity, 1, 999)) {
        itemsValid = false; errors.push(label + '.reward.items[' + n + ']：物品奖励无效');
      } else items.push({ itemId: item.itemId, quantity: item.quantity });
    });
    const sourceTexts = obj(value.texts) ? value.texts : null;
    const texts = sourceTexts !== null && str(sourceTexts.approach) && str(sourceTexts.champion) && str(sourceTexts.retreat)
      ? { approach: sourceTexts.approach, champion: sourceTexts.champion, retreat: sourceTexts.retreat } : null;
    const opponents: ArenaOpponentData[] = [];
    let opponentsValid = Array.isArray(value.opponents) && value.opponents.length > 0;
    const opponentIds = new Set<string>();
    if (Array.isArray(value.opponents)) value.opponents.forEach((rawOpponent, n) => {
      const parsed = parseOpponent(rawOpponent, label + '.opponents[' + n + ']');
      errors.push(...parsed.errors);
      if (parsed.data === null) opponentsValid = false;
      else if (opponentIds.has(parsed.data.id)) {
        opponentsValid = false;
        errors.push(label + '.opponents[' + n + ']：对手 id 重复');
      } else {
        opponentIds.add(parsed.data.id);
        opponents.push(parsed.data);
      }
    });
    const ok = str(value.id) && str(value.name) && str(value.description) && str(value.mapResourceId) &&
      str(value.profileId) && pos !== null && reward !== null && int(reward.currency, 0, 1000000000) &&
      itemsValid && texts !== null && opponentsValid;
    if (!ok) errors.push(label + '：入口、描述、奖励、提示或赛程结构不合规');
    if (!ok) return;
    const id = value.id as string;
    const name = value.name as string;
    const description = value.description as string;
    const mapResourceId = value.mapResourceId as string;
    const profileId = value.profileId as string;
    const rewardCurrency = reward?.currency as number;
    arenas.push({
      id, name, description, mapResourceId, position: pos, profileId, opponents,
      reward: { currency: rewardCurrency, items }, texts,
    });
  });
  // Valid entries survive row errors; assembler later isolates broken references.
  return { ok: true, set: { arenas }, errors };
}

export interface ArenaAssemblyInput {
  set: ArenaSetData | null;
  knownResourceIds: ReadonlySet<string>;
  maps: ReadonlyMap<string, GridMap>;
  spawns: ReadonlyMap<string, CellPosition>;
  npcCells: ReadonlyMap<string, ReadonlySet<string>>;
  encounterCells: ReadonlyMap<string, ReadonlySet<string>>;
  profileIds: ReadonlySet<string>;
  martialArts: ReadonlyMap<string, MartialArtData>;
  itemIds: ReadonlySet<string>;
}
export function assembleArenas(input: ArenaAssemblyInput): { arenas: AssembledArena[]; warnings: string[] } {
  const arenas: AssembledArena[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const occupied = new Set<string>();
  for (const record of input.set?.arenas ?? []) {
    const problems: string[] = [];
    const map = input.maps.get(record.mapResourceId);
    const cell = record.position.col + ',' + record.position.row;
    const key = record.mapResourceId + ':' + cell;
    if (!input.knownResourceIds.has(record.mapResourceId) || map === undefined) problems.push('地图不可用');
    else if (!map.inBounds(record.position.col, record.position.row) || map.isSolid(record.position.col, record.position.row)) problems.push('入口格不可通行');
    const spawn = input.spawns.get(record.mapResourceId);
    if (spawn?.col === record.position.col && spawn.row === record.position.row) problems.push('入口格与出生点重叠');
    if (input.npcCells.get(record.mapResourceId)?.has(cell)) problems.push('入口格与 NPC 重叠');
    if (input.encounterCells.get(record.mapResourceId)?.has(cell)) problems.push('入口格与遭遇重叠');
    if (occupied.has(key)) problems.push('入口格与另一擂台重叠');
    if (seen.has(record.id)) problems.push('擂台 id 重复');
    if (!input.profileIds.has(record.profileId)) problems.push('角色模板引用无效');
    const enemyArts = new Map<string, readonly MartialArtData[]>();
    for (const opponent of record.opponents) {
      const arts = opponent.enemy.martialArtIds.map((id) => input.martialArts.get(id));
      if (arts.some((art) => art === undefined)) problems.push('对手 ' + opponent.id + ' 的武学引用无效');
      else enemyArts.set(opponent.id, arts as MartialArtData[]);
    }
    for (const item of record.reward.items) if (!input.itemIds.has(item.itemId)) problems.push('奖励物品 ' + item.itemId + ' 不存在');
    seen.add(record.id);
    if (problems.length) { warnings.push('擂台 "' + record.id + '" 已禁用：' + problems.join('；')); continue; }
    occupied.add(key);
    arenas.push({ record, enemyArts });
  }
  return { arenas, warnings };
}

export function selectArenaTarget(arenas: readonly AssembledArena[], mapId: string, from: CellPosition): AssembledArena | null {
  let result: AssembledArena | null = null;
  for (const arena of arenas) {
    if (arena.record.mapResourceId !== mapId || manhattanDistance(from, arena.record.position) > 1) continue;
    if (result === null || arena.record.id < result.record.id) result = arena;
  }
  return result;
}
export function createArenaRecord(arenaId: string): ArenaRecord {
  return { arenaId, attempts: 0, bestWins: 0, championships: 0, lastWins: 0 };
}
/** Omitted field means a pre-R20 v1 save. */
export function parseArenaRecords(raw: unknown): ArenaRecord[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const result: ArenaRecord[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!obj(value) || !str(value.arenaId) || seen.has(value.arenaId) ||
      !int(value.attempts, 0, Number.MAX_SAFE_INTEGER) || !int(value.bestWins, 0, 999) ||
      !int(value.championships, 0, Number.MAX_SAFE_INTEGER) || !int(value.lastWins, 0, 999)) return null;
    seen.add(value.arenaId);
    result.push({ arenaId: value.arenaId, attempts: value.attempts, bestWins: value.bestWins, championships: value.championships, lastWins: value.lastWins });
  }
  return result;
}
export function arenaOpponentAsEncounter(arena: ArenaData, opponent: ArenaOpponentData, profileId: string): BattleEncounterData {
  return {
    id: arena.id + '.' + opponent.id, name: opponent.name, mapResourceId: arena.mapResourceId,
    position: arena.position, profileId, enemy: opponent.enemy, victoryExperience: opponent.victoryExperience,
    defeatRecovery: opponent.defeatRecovery, repeatable: true,
    texts: { approach: arena.texts.approach, ...opponent.texts },
  };
}
