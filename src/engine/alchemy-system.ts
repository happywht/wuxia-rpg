/** Data-authored medicine stations, discovered formulas, quality tiers and atomic crafting. */
import { manhattanDistance } from './npc-placement';
import { type CellPosition, type GridMap } from './grid-map';
import { type CharacterState } from './character-progression';
import {
  additionalCapacityFor,
  countItem,
  grantItems,
  removeItems,
  type InventoryState,
  type ItemRecordData,
} from './item-system';

export interface AlchemyStationData {
  id: string;
  name: string;
  mapResourceId: string;
  position: CellPosition;
}

export interface AlchemyIngredientData {
  itemId: string;
  quantity: number;
}

export interface AlchemyOutcomeData {
  name: string;
  minimumInsight: number;
  resultItemId: string;
}

export interface AlchemyRecipeData {
  id: string;
  name: string;
  description: string;
  discoveryHint: string;
  discoveryNodeId: string;
  stationId: string;
  ingredients: AlchemyIngredientData[];
  currencyCost: number;
  outcomes: AlchemyOutcomeData[];
}

export interface AlchemySetData {
  stations: AlchemyStationData[];
  recipes: AlchemyRecipeData[];
}

export interface AssembledAlchemyStation {
  record: AlchemyStationData;
  recipes: readonly AlchemyRecipeData[];
}

export type AlchemyParseResult =
  | { ok: true; set: AlchemySetData; warnings: string[] }
  | { ok: false; errors: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 100): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function identifier(value: unknown, pattern: RegExp): value is string {
  return text(value, 96) && pattern.test(value);
}

/** Defensive semantic parser after the resource passed alchemy-set Schema. */
export function parseAlchemySet(raw: unknown): AlchemyParseResult {
  if (!object(raw) || !Array.isArray(raw.stations) || !Array.isArray(raw.recipes) ||
    raw.stations.length > 64 || raw.recipes.length > 128) {
    return { ok: false, errors: ['stations/recipes：应分别为最多 64/128 项数组'] };
  }

  const errors: string[] = [];
  const stationIds = new Set<string>();
  const stations: AlchemyStationData[] = [];
  raw.stations.forEach((entry, index) => {
    const label = `stations[${index}]`;
    if (!object(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = entry.id;
    const name = entry.name;
    const mapResourceId = entry.mapResourceId;
    const position = object(entry.position) ? entry.position : null;
    const col = position !== null && integer(position.col, 0, 255) ? position.col : null;
    const row = position !== null && integer(position.row, 0, 255) ? position.row : null;
    if (!identifier(id, /^alchemy\.station\.[A-Za-z0-9._-]+$/u) || stationIds.has(id)) {
      errors.push(`${label}.id：应为唯一的 alchemy.station.* id`);
      return;
    }
    if (!text(name, 40) || !identifier(mapResourceId, /^map\.[A-Za-z0-9._-]+$/u) || col === null || row === null) {
      errors.push(`${label}：名称、地图 id 或坐标无效`);
      return;
    }
    stationIds.add(id);
    stations.push({ id, name, mapResourceId, position: { col, row } });
  });

  const recipeIds = new Set<string>();
  const recipes: AlchemyRecipeData[] = [];
  raw.recipes.forEach((entry, index) => {
    const label = `recipes[${index}]`;
    if (!object(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = entry.id;
    const name = entry.name;
    const description = entry.description;
    const discoveryHint = entry.discoveryHint;
    const discoveryNodeId = entry.discoveryNodeId;
    const stationId = entry.stationId;
    const ingredientsSource = entry.ingredients;
    const outcomesSource = entry.outcomes;
    const currencyCost = entry.currencyCost;
    if (!identifier(id, /^alchemy\.recipe\.[A-Za-z0-9._-]+$/u) || recipeIds.has(id)) {
      errors.push(`${label}.id：应为唯一的 alchemy.recipe.* id`);
      return;
    }
    recipeIds.add(id);
    let valid = true;
    if (!text(name, 48) || !text(description, 180) || !text(discoveryHint, 120) ||
      !text(discoveryNodeId, 96) || !identifier(stationId, /^alchemy\.station\.[A-Za-z0-9._-]+$/u)) {
      errors.push(`${label}：名称/说明/发现线索/知识节点/工位 id 无效`);
      valid = false;
    }
    if (!integer(currencyCost, 1, 999_999)) {
      errors.push(`${label}.currencyCost：应为 1–999999 的银两整数`);
      valid = false;
    }
    if (!Array.isArray(ingredientsSource) || ingredientsSource.length < 2 || ingredientsSource.length > 8) {
      errors.push(`${label}.ingredients：应含 2–8 项药材投入`);
      valid = false;
    }
    const ingredients: AlchemyIngredientData[] = [];
    const ingredientIds = new Set<string>();
    if (Array.isArray(ingredientsSource)) {
      ingredientsSource.forEach((rawIngredient, ingredientIndex) => {
        const ingredientLabel = `${label}.ingredients[${ingredientIndex}]`;
        if (!object(rawIngredient) || !identifier(rawIngredient.itemId, /^item\.[A-Za-z0-9._-]+$/u) ||
          !integer(rawIngredient.quantity, 1, 99) || ingredientIds.has(rawIngredient.itemId)) {
          errors.push(`${ingredientLabel}：物品 id/数量无效或重复`);
          valid = false;
          return;
        }
        ingredientIds.add(rawIngredient.itemId);
        ingredients.push({ itemId: rawIngredient.itemId, quantity: rawIngredient.quantity });
      });
    }
    if (!Array.isArray(outcomesSource) || outcomesSource.length < 2 || outcomesSource.length > 5) {
      errors.push(`${label}.outcomes：应含 2–5 档确定性品质结果`);
      valid = false;
    }
    const outcomes: AlchemyOutcomeData[] = [];
    if (Array.isArray(outcomesSource)) {
      let priorThreshold = -1;
      outcomesSource.forEach((rawOutcome, outcomeIndex) => {
        const outcomeLabel = `${label}.outcomes[${outcomeIndex}]`;
        if (!object(rawOutcome) || !text(rawOutcome.name, 24) ||
          !integer(rawOutcome.minimumInsight, 0, 999) ||
          !identifier(rawOutcome.resultItemId, /^item\.[A-Za-z0-9._-]+$/u) ||
          typeof rawOutcome.minimumInsight === 'number' && rawOutcome.minimumInsight <= priorThreshold) {
          errors.push(`${outcomeLabel}：品质名称/悟性门槛/结果物品无效，或门槛未严格递增`);
          valid = false;
          return;
        }
        priorThreshold = rawOutcome.minimumInsight;
        outcomes.push({
          name: rawOutcome.name,
          minimumInsight: rawOutcome.minimumInsight,
          resultItemId: rawOutcome.resultItemId,
        });
      });
      if (outcomes[0]?.minimumInsight !== 0) {
        errors.push(`${label}.outcomes[0].minimumInsight：首档必须从 0 开始`);
        valid = false;
      }
    }
    if (valid) {
      recipes.push({
        id,
        name: name as string,
        description: description as string,
        discoveryHint: discoveryHint as string,
        discoveryNodeId: discoveryNodeId as string,
        stationId: stationId as string,
        ingredients,
        currencyCost: currencyCost as number,
        outcomes,
      });
    }
  });
  // Schema-level failures are handled by the loader. Semantic row failures
  // stay local so one damaged station or recipe cannot disable valid peers.
  return { ok: true, set: { stations, recipes }, warnings: errors };
}

export interface AlchemyAssemblyInput {
  set: AlchemySetData | null;
  knownResourceIds: ReadonlySet<string>;
  maps: ReadonlyMap<string, GridMap>;
  spawns: ReadonlyMap<string, CellPosition>;
  blockedCells: ReadonlyMap<string, ReadonlySet<string>>;
  items: ReadonlyMap<string, ItemRecordData>;
  knowledgeNodeIds: ReadonlySet<string>;
}

/** Resolves workstations and all recipe/input/output/knowledge references independently. */
export function assembleAlchemyStations(input: AlchemyAssemblyInput): {
  stations: AssembledAlchemyStation[];
  warnings: string[];
} {
  if (input.set === null) return { stations: [], warnings: [] };
  const warnings: string[] = [];
  const validStations = new Map<string, AlchemyStationData>();
  const occupied = new Set<string>();
  for (const station of input.set.stations) {
    const problems: string[] = [];
    const map = input.maps.get(station.mapResourceId);
    const cell = `${station.position.col},${station.position.row}`;
    const key = `${station.mapResourceId}:${cell}`;
    if (!input.knownResourceIds.has(station.mapResourceId) || map === undefined) problems.push('地图不可用');
    else if (!map.canEnter(station.position.col, station.position.row)) problems.push('药炉格不可通行');
    const spawn = input.spawns.get(station.mapResourceId);
    if (spawn?.col === station.position.col && spawn.row === station.position.row) problems.push('药炉格与出生点重叠');
    if (input.blockedCells.get(station.mapResourceId)?.has(cell)) problems.push('药炉格与 NPC、遭遇或活动入口重叠');
    if (occupied.has(key)) problems.push('药炉格与另一处药炉重叠');
    if (validStations.has(station.id)) problems.push('药炉 id 重复');
    if (problems.length > 0) {
      warnings.push(`炼药工位 "${station.id}"（${station.name}）已禁用：${problems.join('；')}`);
      continue;
    }
    occupied.add(key);
    validStations.set(station.id, station);
  }

  const seenRecipeIds = new Set<string>();
  const recipesByStation = new Map<string, AlchemyRecipeData[]>();
  for (const recipe of input.set.recipes) {
    const problems: string[] = [];
    if (seenRecipeIds.has(recipe.id)) problems.push('recipe id 重复，保留先声明者');
    if (!validStations.has(recipe.stationId)) problems.push(`炼药工位 "${recipe.stationId}" 不存在或不可用`);
    if (!input.knowledgeNodeIds.has(recipe.discoveryNodeId)) problems.push(`发现节点 "${recipe.discoveryNodeId}" 不存在`);
    const ingredients = recipe.ingredients.map((ingredient) => input.items.get(ingredient.itemId));
    if (ingredients.some((item) => item === undefined)) problems.push('投入药材存在缺失物品引用');
    if (ingredients.some((item) => item !== undefined && item.category !== 'misc')) {
      problems.push('炼药投入只能引用杂项药材');
    }
    const outcomeItems = recipe.outcomes.map((outcome) => input.items.get(outcome.resultItemId));
    if (outcomeItems.some((item) => item === undefined || item.category !== 'consumable' || item.consumable === null)) {
      problems.push('品质结果必须引用有效消耗品');
    }
    const validOutcomeItems = outcomeItems.filter((item): item is ItemRecordData =>
      item !== undefined && item.category === 'consumable' && item.consumable !== null);
    for (let index = 1; index < validOutcomeItems.length; index += 1) {
      const prior = validOutcomeItems[index - 1]?.consumable;
      const current = validOutcomeItems[index]?.consumable;
      if (prior === null || prior === undefined || current === null || current === undefined) continue;
      const noRegression = current.healthRestore >= prior.healthRestore && current.qiRestore >= prior.qiRestore;
      const improves = current.healthRestore > prior.healthRestore || current.qiRestore > prior.qiRestore;
      if (!noRegression || !improves) {
        problems.push('品质阶梯的气血/内力恢复必须单调不降且每档至少提升一项');
        break;
      }
    }
    if (problems.length > 0) {
      warnings.push(`药方 "${recipe.id}"（${recipe.name}）已禁用：${problems.join('；')}`);
      seenRecipeIds.add(recipe.id);
      continue;
    }
    seenRecipeIds.add(recipe.id);
    const list = recipesByStation.get(recipe.stationId) ?? [];
    list.push(recipe);
    recipesByStation.set(recipe.stationId, list);
  }

  const stations = [...validStations.values()].map((record) => ({
    record,
    recipes: recipesByStation.get(record.id) ?? [],
  }));
  for (const station of stations) {
    if (station.recipes.length === 0) {
      warnings.push(`炼药工位 "${station.record.id}"（${station.record.name}）已禁用：没有有效药方`);
    }
  }
  return { stations: stations.filter((station) => station.recipes.length > 0), warnings };
}

/** Selects a station from exactly one four-way-adjacent cell. */
export function selectAlchemyStation(
  stations: readonly AssembledAlchemyStation[],
  mapResourceId: string,
  from: CellPosition,
): AssembledAlchemyStation | null {
  let selected: AssembledAlchemyStation | null = null;
  for (const station of stations) {
    if (station.record.mapResourceId !== mapResourceId || manhattanDistance(from, station.record.position) !== 1) continue;
    if (selected === null || station.record.id < selected.record.id) selected = station;
  }
  return selected;
}

/** Chooses the highest data-authored insight threshold the character meets. */
export function selectAlchemyOutcome(recipe: AlchemyRecipeData, insight: number): AlchemyOutcomeData | null {
  if (!Number.isSafeInteger(insight) || insight < 0) return null;
  let selected: AlchemyOutcomeData | null = null;
  for (const outcome of recipe.outcomes) {
    if (outcome.minimumInsight > insight) break;
    selected = outcome;
  }
  return selected;
}

export interface AlchemyEligibility {
  available: boolean;
  reason: string | null;
  outcome: AlchemyOutcomeData | null;
}

/** Read-only check; nothing changes on any refusal. */
export function checkAlchemyRecipe(input: {
  recipe: AlchemyRecipeData;
  insight: number;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  inventory: Readonly<InventoryState>;
  items: ReadonlyMap<string, ItemRecordData>;
}): AlchemyEligibility {
  if (!input.knownKnowledgeNodeIds.has(input.recipe.discoveryNodeId)) {
    return { available: false, reason: input.recipe.discoveryHint, outcome: null };
  }
  const outcome = selectAlchemyOutcome(input.recipe, input.insight);
  if (outcome === null) return { available: false, reason: '当前悟性资料无效，无法判定药品品质。', outcome: null };
  if (input.inventory.currency < input.recipe.currencyCost) {
    return {
      available: false,
      reason: `银两不足：需要 ${input.recipe.currencyCost}，持有 ${input.inventory.currency}。`,
      outcome,
    };
  }
  for (const ingredient of input.recipe.ingredients) {
    const item = input.items.get(ingredient.itemId);
    if (item === undefined || item.category !== 'misc') {
      return { available: false, reason: `投入药材 ${ingredient.itemId} 已失效。`, outcome };
    }
    const owned = countItem(input.inventory, ingredient.itemId);
    if (owned < ingredient.quantity) {
      return {
        available: false,
        reason: `药材不足：「${item.name}」需 ${ingredient.quantity} 份，持有 ${owned} 份。`,
        outcome,
      };
    }
  }
  const result = input.items.get(outcome.resultItemId);
  if (result === undefined || result.category !== 'consumable' || result.consumable === null) {
    return { available: false, reason: '当前品质的药品资料暂不可用。', outcome };
  }
  const trial: InventoryState = {
    ...input.inventory,
    stacks: input.inventory.stacks.map((stack) => ({ ...stack })),
    equipped: { ...input.inventory.equipped },
  };
  for (const ingredient of input.recipe.ingredients) removeItems(trial, ingredient.itemId, ingredient.quantity);
  if (additionalCapacityFor(trial, result) < 1) {
    return { available: false, reason: '背包没有位置收纳成药；腾出一个物品格后再来。', outcome };
  }
  return { available: true, reason: null, outcome };
}

/** Clones, consumes, tests capacity and emits one fixed-quality item before committing. */
export function craftAlchemy(input: {
  station: AssembledAlchemyStation;
  recipeId: string;
  character: Pick<CharacterState, 'attributes'>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
}):
  | { ok: true; recipe: AlchemyRecipeData; outcome: AlchemyOutcomeData; result: ItemRecordData; remainingCurrency: number }
  | { ok: false; reason: string } {
  const recipe = input.station.recipes.find((entry) => entry.id === input.recipeId);
  if (recipe === undefined) return { ok: false, reason: '这个药方目前不可用。' };
  const eligibility = checkAlchemyRecipe({
    recipe,
    insight: input.character.attributes.insight,
    knownKnowledgeNodeIds: input.knownKnowledgeNodeIds,
    inventory: input.inventory,
    items: input.items,
  });
  if (!eligibility.available || eligibility.outcome === null) {
    return { ok: false, reason: eligibility.reason ?? '当前不能炼药。' };
  }
  const result = input.items.get(eligibility.outcome.resultItemId);
  if (result === undefined) return { ok: false, reason: '当前品质的药品资料暂不可用。' };

  const trial: InventoryState = {
    ...input.inventory,
    currency: input.inventory.currency - recipe.currencyCost,
    stacks: input.inventory.stacks.map((stack) => ({ ...stack })),
    equipped: { ...input.inventory.equipped },
  };
  for (const ingredient of recipe.ingredients) removeItems(trial, ingredient.itemId, ingredient.quantity);
  if (additionalCapacityFor(trial, result) < 1) return { ok: false, reason: '背包没有位置收纳成药。' };
  grantItems(trial, result, 1);

  input.inventory.currency = trial.currency;
  input.inventory.stacks = trial.stacks;
  input.inventory.equipped = trial.equipped;
  return { ok: true, recipe, outcome: eligibility.outcome, result, remainingCurrency: trial.currency };
}
