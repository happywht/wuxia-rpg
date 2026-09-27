/** Data-authored forge stations, recipe assembly and atomic equipment conversion. */
import { manhattanDistance } from './npc-placement';
import { type CellPosition, type GridMap } from './grid-map';
import {
  additionalCapacityFor,
  countItem,
  grantItems,
  isEquipped,
  removeItems,
  type InventoryState,
  type ItemRecordData,
} from './item-system';

export interface EquipmentForgeStationData {
  id: string;
  name: string;
  mapResourceId: string;
  position: CellPosition;
}

export interface EquipmentForgeIngredientData {
  itemId: string;
  quantity: number;
}

export interface EquipmentForgeRecipeData {
  id: string;
  name: string;
  description: string;
  stationId: string;
  ingredients: EquipmentForgeIngredientData[];
  currencyCost: number;
  resultItemId: string;
}

export interface EquipmentForgeSetData {
  stations: EquipmentForgeStationData[];
  recipes: EquipmentForgeRecipeData[];
}

export interface AssembledEquipmentForgeStation {
  record: EquipmentForgeStationData;
  recipes: readonly EquipmentForgeRecipeData[];
}

export type EquipmentForgeParseResult =
  | { ok: true; set: EquipmentForgeSetData }
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

/** Defensive semantic parser after the resource passed equipment-forge-set Schema. */
export function parseEquipmentForgeSet(raw: unknown): EquipmentForgeParseResult {
  if (!object(raw) || !Array.isArray(raw.stations) || !Array.isArray(raw.recipes) ||
    raw.stations.length > 64 || raw.recipes.length > 128) {
    return { ok: false, errors: ['stations/recipes：应分别为最多 64/128 项数组'] };
  }

  const errors: string[] = [];
  const stationIds = new Set<string>();
  const stations: EquipmentForgeStationData[] = [];
  raw.stations.forEach((entry, index) => {
    const label = `stations[${index}]`;
    if (!object(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = entry.id;
    const name = entry.name;
    const mapResourceId = entry.mapResourceId;
    const positionSource = object(entry.position) ? entry.position : null;
    const col = positionSource === null ? null : integer(positionSource.col, 0, 255) ? positionSource.col : null;
    const row = positionSource === null ? null : integer(positionSource.row, 0, 255) ? positionSource.row : null;
    if (!identifier(id, /^forge\.station\.[A-Za-z0-9._-]+$/u) || stationIds.has(id)) {
      errors.push(`${label}.id：应为唯一的 forge.station.* id`);
      return;
    }
    stationIds.add(id);
    if (!text(name, 40) || !identifier(mapResourceId, /^map\.[A-Za-z0-9._-]+$/u) || col === null || row === null) {
      errors.push(`${label}：名称、地图 id 或坐标无效`);
      return;
    }
    stations.push({ id, name, mapResourceId, position: { col, row } });
  });

  const recipeIds = new Set<string>();
  const recipes: EquipmentForgeRecipeData[] = [];
  raw.recipes.forEach((entry, index) => {
    const label = `recipes[${index}]`;
    if (!object(entry)) { errors.push(`${label}：应为对象`); return; }
    const id = entry.id;
    const name = entry.name;
    const description = entry.description;
    const stationId = entry.stationId;
    const ingredientsSource = entry.ingredients;
    const currencyCost = entry.currencyCost;
    const resultItemId = entry.resultItemId;
    if (!identifier(id, /^forge\.recipe\.[A-Za-z0-9._-]+$/u) || recipeIds.has(id)) {
      errors.push(`${label}.id：应为唯一的 forge.recipe.* id`);
      return;
    }
    recipeIds.add(id);
    let valid = true;
    if (!text(name, 48) || !text(description, 180) ||
      !identifier(stationId, /^forge\.station\.[A-Za-z0-9._-]+$/u) ||
      !identifier(resultItemId, /^item\.[A-Za-z0-9._-]+$/u)) {
      errors.push(`${label}：name/description/stationId/resultItemId 无效`);
      valid = false;
    }
    if (!integer(currencyCost, 1, 999_999)) {
      errors.push(`${label}.currencyCost：应为 1–999999 的银两整数`);
      valid = false;
    }
    if (!Array.isArray(ingredientsSource) || ingredientsSource.length < 2 || ingredientsSource.length > 8) {
      errors.push(`${label}.ingredients：应含 2–8 种配料（含一件基础装备）`);
      valid = false;
    }
    const ingredients: EquipmentForgeIngredientData[] = [];
    if (Array.isArray(ingredientsSource)) {
      const ingredientIds = new Set<string>();
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
      if (typeof resultItemId === 'string' && ingredientIds.has(resultItemId)) {
        errors.push(`${label}：结果装备不能同时作为投入物品`);
        valid = false;
      }
    }
    if (valid) {
      recipes.push({
        id,
        name: name as string,
        description: description as string,
        stationId: stationId as string,
        ingredients,
        currencyCost: currencyCost as number,
        resultItemId: resultItemId as string,
      });
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, set: { stations, recipes } };
}

export interface EquipmentForgeAssemblyInput {
  set: EquipmentForgeSetData | null;
  knownResourceIds: ReadonlySet<string>;
  maps: ReadonlyMap<string, GridMap>;
  spawns: ReadonlyMap<string, CellPosition>;
  blockedCells: ReadonlyMap<string, ReadonlySet<string>>;
  items: ReadonlyMap<string, ItemRecordData>;
}

/** Resolve station geometry and recipe/item references independently. */
export function assembleEquipmentForges(input: EquipmentForgeAssemblyInput): {
  stations: AssembledEquipmentForgeStation[];
  warnings: string[];
} {
  if (input.set === null) return { stations: [], warnings: [] };
  const warnings: string[] = [];
  const stations = new Map<string, EquipmentForgeStationData>();
  const occupied = new Set<string>();
  for (const station of input.set.stations) {
    const problems: string[] = [];
    const map = input.maps.get(station.mapResourceId);
    const cell = `${station.position.col},${station.position.row}`;
    const key = `${station.mapResourceId}:${cell}`;
    if (!input.knownResourceIds.has(station.mapResourceId) || map === undefined) problems.push('地图不可用');
    else if (!map.canEnter(station.position.col, station.position.row)) problems.push('工位格不可通行');
    const spawn = input.spawns.get(station.mapResourceId);
    if (spawn?.col === station.position.col && spawn.row === station.position.row) problems.push('工位格与出生点重叠');
    if (input.blockedCells.get(station.mapResourceId)?.has(cell)) problems.push('工位格与 NPC、遭遇或活动入口重叠');
    if (occupied.has(key)) problems.push('工位格与另一工位重叠');
    if (stations.has(station.id)) problems.push('工位 id 重复');
    if (problems.length > 0) {
      warnings.push(`锻造工位 "${station.id}"（${station.name}）已禁用：${problems.join('；')}`);
      continue;
    }
    occupied.add(key);
    stations.set(station.id, station);
  }

  const recipesByStation = new Map<string, EquipmentForgeRecipeData[]>();
  const seenRecipeIds = new Set<string>();
  for (const recipe of input.set.recipes) {
    const problems: string[] = [];
    if (seenRecipeIds.has(recipe.id)) problems.push('recipe id 重复，保留先声明者');
    if (!stations.has(recipe.stationId)) problems.push(`锻造工位 "${recipe.stationId}" 不存在或不可用`);
    const result = input.items.get(recipe.resultItemId);
    if (result === undefined || result.category !== 'equipment' || result.equipment === null) {
      problems.push(`结果 "${recipe.resultItemId}" 不存在或不是装备`);
    }
    const ingredientItems = recipe.ingredients.map((ingredient) => input.items.get(ingredient.itemId));
    if (ingredientItems.some((item) => item === undefined)) problems.push('投入材料存在缺失物品引用');
    const equipmentIngredients = ingredientItems.filter((item) => item?.category === 'equipment' && item.equipment !== null);
    if (equipmentIngredients.length !== 1) problems.push('配方必须且只能投入一件基础装备');
    if (recipe.ingredients.some((ingredient, index) => ingredientItems[index]?.category === 'equipment' && ingredient.quantity !== 1)) {
      problems.push('基础装备投入数量必须为一件');
    }
    if (ingredientItems.some((item) => item !== undefined && item.category !== 'equipment' && item.category !== 'misc')) {
      problems.push('非装备投入必须是杂项材料');
    }
    if (result !== undefined && result.equipment !== null && equipmentIngredients.length === 1 &&
      equipmentIngredients[0]?.equipment?.slot !== result.equipment.slot) {
      problems.push('结果装备与基础装备的槽位不同');
    }
    const baseEquipment = equipmentIngredients[0]?.equipment ?? null;
    if (result?.equipment !== undefined && result.equipment !== null && baseEquipment !== null) {
      const keys = ['body', 'force', 'agility', 'insight', 'resolve'] as const;
      const attributeDominates = keys.every((key) =>
        (result.equipment?.attributeBonuses[key] ?? 0) >= (baseEquipment.attributeBonuses[key] ?? 0));
      const strictlyImproves = keys.some((key) =>
        (result.equipment?.attributeBonuses[key] ?? 0) > (baseEquipment.attributeBonuses[key] ?? 0)) ||
        result.equipment.healthBonus > baseEquipment.healthBonus || result.equipment.qiBonus > baseEquipment.qiBonus;
      if (!attributeDominates || result.equipment.healthBonus < baseEquipment.healthBonus ||
        result.equipment.qiBonus < baseEquipment.qiBonus || !strictlyImproves) {
        problems.push('结果装备须同槽且不降低基础装备的任何加成，并至少提升一项');
      }
    }
    if (problems.length > 0) {
      warnings.push(`锻造配方 "${recipe.id}"（${recipe.name}）已禁用：${problems.join('；')}`);
      seenRecipeIds.add(recipe.id);
      continue;
    }
    seenRecipeIds.add(recipe.id);
    const list = recipesByStation.get(recipe.stationId) ?? [];
    list.push(recipe);
    recipesByStation.set(recipe.stationId, list);
  }

  const assembledStations = [...stations.values()].map((record) => ({
    record,
    recipes: recipesByStation.get(record.id) ?? [],
  }));
  for (const station of assembledStations) {
    if (station.recipes.length === 0) {
      warnings.push(`锻造工位 "${station.record.id}"（${station.record.name}）已禁用：没有有效配方`);
    }
  }
  return { stations: assembledStations.filter((station) => station.recipes.length > 0), warnings };
}

/** Selects the nearest four-way-adjacent forge station, then stable id. */
export function selectEquipmentForgeStation(
  stations: readonly AssembledEquipmentForgeStation[],
  mapResourceId: string,
  from: CellPosition,
): AssembledEquipmentForgeStation | null {
  let result: AssembledEquipmentForgeStation | null = null;
  for (const station of stations) {
    if (station.record.mapResourceId !== mapResourceId ||
      manhattanDistance(from, station.record.position) !== 1) continue;
    if (result === null || station.record.id < result.record.id) result = station;
  }
  return result;
}

export interface ForgeRecipeEligibility {
  available: boolean;
  reason: string | null;
}

/** Read-only, exact explanation of what blocks one recipe at this moment. */
export function checkEquipmentForgeRecipe(input: {
  recipe: EquipmentForgeRecipeData;
  inventory: Readonly<InventoryState>;
  items: ReadonlyMap<string, ItemRecordData>;
}): ForgeRecipeEligibility {
  if (input.inventory.currency < input.recipe.currencyCost) {
    return { available: false, reason: `银两不足：需要 ${input.recipe.currencyCost}，持有 ${input.inventory.currency}。` };
  }
  for (const ingredient of input.recipe.ingredients) {
    const item = input.items.get(ingredient.itemId);
    if (item === undefined) return { available: false, reason: `所需物品 ${ingredient.itemId} 已失效。` };
    if (item.category === 'equipment' && isEquipped(input.inventory, item.id)) {
      return { available: false, reason: `请先卸下基础装备「${item.name}」。` };
    }
    const owned = countItem(input.inventory, ingredient.itemId);
    if (owned < ingredient.quantity) {
      return { available: false, reason: `材料不足：「${item.name}」需 ${ingredient.quantity} 件，持有 ${owned} 件。` };
    }
  }

  const result = input.items.get(input.recipe.resultItemId);
  if (result === undefined || result.category !== 'equipment' || result.equipment === null) {
    return { available: false, reason: '进阶装备资料暂不可用。' };
  }
  const trial: InventoryState = {
    ...input.inventory,
    stacks: input.inventory.stacks.map((stack) => ({ ...stack })),
    equipped: { ...input.inventory.equipped },
  };
  for (const ingredient of input.recipe.ingredients) removeItems(trial, ingredient.itemId, ingredient.quantity);
  if (additionalCapacityFor(trial, result) < 1) {
    return { available: false, reason: '背包没有位置收纳进阶装备；腾出一个物品格后再来。' };
  }
  return { available: true, reason: null };
}

/** Runs the complete transaction against a copy, committing one final state only on success. */
export function craftEquipment(input: {
  station: AssembledEquipmentForgeStation;
  recipeId: string;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
}):
  | { ok: true; recipe: EquipmentForgeRecipeData; result: ItemRecordData; remainingCurrency: number }
  | { ok: false; reason: string } {
  const recipe = input.station.recipes.find((entry) => entry.id === input.recipeId);
  if (recipe === undefined) return { ok: false, reason: '这个锻造配方目前不可用。' };
  const eligibility = checkEquipmentForgeRecipe({ recipe, inventory: input.inventory, items: input.items });
  if (!eligibility.available) return { ok: false, reason: eligibility.reason ?? '当前不能锻造。' };
  const result = input.items.get(recipe.resultItemId);
  if (result === undefined) return { ok: false, reason: '进阶装备资料暂不可用。' };

  const trial: InventoryState = {
    ...input.inventory,
    currency: input.inventory.currency - recipe.currencyCost,
    stacks: input.inventory.stacks.map((stack) => ({ ...stack })),
    equipped: { ...input.inventory.equipped },
  };
  for (const ingredient of recipe.ingredients) removeItems(trial, ingredient.itemId, ingredient.quantity);
  if (additionalCapacityFor(trial, result) < 1) return { ok: false, reason: '背包没有位置收纳进阶装备。' };
  grantItems(trial, result, 1);

  input.inventory.currency = trial.currency;
  input.inventory.stacks = trial.stacks;
  input.inventory.equipped = trial.equipped;
  return { ok: true, recipe, result, remainingCurrency: trial.currency };
}
