/** Data-authored meridian network, cultivation resource and unlock transactions. */
import {
  ATTRIBUTE_IDS,
  applyEquipmentBonuses,
  computeVitalMaxima,
  type AttributeId,
  type CharacterProfileData,
  type CharacterState,
  type ProgressionBonusData,
} from './character-progression';
import {
  countItem,
  isEquipped,
  removeItems,
  type InventoryState,
  type ItemRecordData,
} from './item-system';

export interface MeridianResourceRules {
  initialPoints: number;
  pointsPerLevel: number;
  maximumPoints: number;
}

export interface MeridianItemCost {
  itemId: string;
  quantity: number;
}

export interface MeridianNodeData {
  id: string;
  name: string;
  description: string;
  minimumLevel: number;
  pointCost: number;
  prerequisites: string[];
  itemCosts: MeridianItemCost[];
  effects: ProgressionBonusData;
}

export interface MeridianSetData {
  resource: MeridianResourceRules;
  nodes: MeridianNodeData[];
}

export type MeridianParseResult =
  | { ok: true; set: MeridianSetData }
  | { ok: false; errors: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function stringArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) => text(entry, 80));
}

/** Defensive semantic pass after the resource has passed its JSON Schema. */
export function parseMeridianSet(raw: unknown): MeridianParseResult {
  if (!object(raw) || !object(raw.resource) || !Array.isArray(raw.nodes) || raw.nodes.length > 64) {
    return { ok: false, errors: ['resource：应为修为规则对象，nodes：应为最多 64 项的节点数组'] };
  }

  const resourceSource = raw.resource;
  const initialPoints = resourceSource.initialPoints;
  const pointsPerLevel = resourceSource.pointsPerLevel;
  const maximumPoints = resourceSource.maximumPoints;
  const errors: string[] = [];
  if (!integer(initialPoints, 0, 20) || !integer(pointsPerLevel, 0, 5) || !integer(maximumPoints, 1, 999) ||
    (integer(initialPoints, 0, 20) && integer(maximumPoints, 1, 999) && initialPoints > maximumPoints)) {
    errors.push('resource：initialPoints、pointsPerLevel 或 maximumPoints 超出范围/互相矛盾');
  }

  const nodes: MeridianNodeData[] = [];
  const seen = new Set<string>();
  raw.nodes.forEach((value, index) => {
    const label = `nodes[${index}]`;
    if (!object(value)) { errors.push(`${label}：应为对象`); return; }
    const id = value.id;
    const name = value.name;
    const description = value.description;
    const minimumLevel = value.minimumLevel;
    const pointCost = value.pointCost;
    const prerequisites = value.prerequisites;
    const itemCosts = value.itemCosts;
    const effectsSource = object(value.effects) ? value.effects : null;
    let valid = true;
    if (!text(id, 80) || !/^meridian\.[A-Za-z0-9._-]+$/u.test(id) || seen.has(id)) {
      errors.push(`${label}.id：应为唯一的 meridian.* id`);
      valid = false;
    } else seen.add(id);
    if (!text(name, 40) || !text(description, 180)) {
      errors.push(`${label}：name/description 无效`);
      valid = false;
    }
    if (!integer(minimumLevel, 1, 99) || !integer(pointCost, 1, 20)) {
      errors.push(`${label}：minimumLevel/pointCost 超出范围`);
      valid = false;
    }
    if (!stringArray(prerequisites, 12) || new Set(prerequisites).size !== prerequisites.length ||
      (typeof id === 'string' && prerequisites.includes(id))) {
      errors.push(`${label}.prerequisites：应为无重复、无自指的节点 id 数组`);
      valid = false;
    }
    const parsedCosts: MeridianItemCost[] = [];
    if (!Array.isArray(itemCosts) || itemCosts.length > 8) {
      errors.push(`${label}.itemCosts：应为最多 8 项的物品消耗数组`);
      valid = false;
    } else {
      const costIds = new Set<string>();
      itemCosts.forEach((cost, costIndex) => {
        const costLabel = `${label}.itemCosts[${costIndex}]`;
        if (!object(cost) || !text(cost.itemId, 80) || !integer(cost.quantity, 1, 99) || costIds.has(cost.itemId)) {
          errors.push(`${costLabel}：物品 id/数量无效或重复`);
          valid = false;
          return;
        }
        costIds.add(cost.itemId);
        parsedCosts.push({ itemId: cost.itemId, quantity: cost.quantity });
      });
    }

    let attributes: Partial<Record<AttributeId, number>> = {};
    let health = 0;
    let qi = 0;
    if (effectsSource === null) {
      errors.push(`${label}.effects：应为效果对象`);
      valid = false;
    } else {
      health = effectsSource.health === undefined ? 0 : integer(effectsSource.health, 0, 50) ? effectsSource.health : -1;
      qi = effectsSource.qi === undefined ? 0 : integer(effectsSource.qi, 0, 50) ? effectsSource.qi : -1;
      if (health < 0 || qi < 0) {
        errors.push(`${label}.effects：health/qi 应为 0–50 的非负整数`);
        valid = false;
      }
      const attrSource = effectsSource.attributes === undefined ? {} : object(effectsSource.attributes) ? effectsSource.attributes : null;
      if (attrSource === null) {
        errors.push(`${label}.effects.attributes：应为属性加成对象`);
        valid = false;
      } else {
        for (const key of Object.keys(attrSource)) {
          if (!ATTRIBUTE_IDS.includes(key as AttributeId) || !integer(attrSource[key], 0, 3)) {
            errors.push(`${label}.effects.attributes.${key}：未知属性或超出 0–3 范围`);
            valid = false;
            continue;
          }
          attributes[key as AttributeId] = attrSource[key] as number;
        }
      }
      if (health === 0 && qi === 0 && Object.values(attributes).every((amount) => amount === 0)) {
        errors.push(`${label}.effects：至少需要一项正向效果`);
        valid = false;
      }
    }

    if (valid) {
      nodes.push({
        id: id as string,
        name: name as string,
        description: description as string,
        minimumLevel: minimumLevel as number,
        pointCost: pointCost as number,
        prerequisites: [...prerequisites as string[]],
        itemCosts: parsedCosts,
        effects: { attributes, health, qi },
      });
    }
  });

  if (nodes.length !== raw.nodes.length) return { ok: false, errors };
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const prerequisite of node.prerequisites) {
      if (!nodesById.has(prerequisite)) errors.push(`${node.id}：前置节点 ${prerequisite} 不存在`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { errors.push(`prerequisites：依赖图存在循环（${id}）`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of nodesById.get(id)?.prerequisites ?? []) {
      if (nodesById.has(prerequisite)) visit(prerequisite);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);

  return errors.length > 0
    ? { ok: false, errors: [...new Set(errors)] }
    : {
        ok: true,
        set: {
          resource: {
            initialPoints: initialPoints as number,
            pointsPerLevel: pointsPerLevel as number,
            maximumPoints: maximumPoints as number,
          },
          nodes,
        },
      };
}

/** Remove nodes with dangling item references and any nodes depending on them. */
export function resolveMeridianItemReferences(
  set: MeridianSetData,
  itemIds: ReadonlySet<string>,
): { set: MeridianSetData; warnings: string[] } {
  const nodesById = new Map(set.nodes.map((node) => [node.id, node]));
  const disabled = new Map<string, string>();
  for (const node of set.nodes) {
    const missing = node.itemCosts.find((cost) => !itemIds.has(cost.itemId));
    if (missing !== undefined) disabled.set(node.id, `物品 ${missing.itemId} 不存在`);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of set.nodes) {
      if (disabled.has(node.id)) continue;
      const missing = node.prerequisites.find((id) => disabled.has(id) || !nodesById.has(id));
      if (missing !== undefined) {
        disabled.set(node.id, `前置节点 ${missing} 已禁用`);
        changed = true;
      }
    }
  }
  return {
    set: { resource: { ...set.resource }, nodes: set.nodes.filter((node) => !disabled.has(node.id)) },
    warnings: [...disabled.entries()].map(([id, reason]) => `${id}：${reason}`),
  };
}

/** Award the data-configured training resource only for settled level gains. */
export function awardCultivationPoints(
  state: CharacterState,
  levelsGained: number,
  rules: MeridianResourceRules,
): number {
  if (!integer(levelsGained, 1, 99)) return 0;
  const before = state.cultivationPoints;
  const ceiling = Math.max(before, rules.maximumPoints);
  state.cultivationPoints = Math.min(ceiling, before + levelsGained * rules.pointsPerLevel);
  return state.cultivationPoints - before;
}

export interface MeridianEligibility {
  available: boolean;
  reason: string | null;
}

/** Describes a node's current state without mutating any run state. */
export function checkMeridianEligibility(input: {
  set: MeridianSetData;
  nodeId: string;
  level: number;
  cultivationPoints: number;
  unlockedNodeIds: readonly string[];
  inventory: Readonly<InventoryState>;
  items: ReadonlyMap<string, ItemRecordData>;
}): MeridianEligibility {
  const node = input.set.nodes.find((entry) => entry.id === input.nodeId);
  if (node === undefined) return { available: false, reason: '经脉节点资料不可用。' };
  if (input.unlockedNodeIds.includes(node.id)) return { available: false, reason: '此经脉节点已经打通。' };
  if (input.level < node.minimumLevel) return { available: false, reason: `需达到等级 ${node.minimumLevel}。` };
  const missingPrerequisite = node.prerequisites.find((id) => !input.unlockedNodeIds.includes(id));
  if (missingPrerequisite !== undefined) return { available: false, reason: `尚未打通前置节点 ${missingPrerequisite}。` };
  if (input.cultivationPoints < node.pointCost) return { available: false, reason: `修为不足：需要 ${node.pointCost} 点。` };
  for (const cost of node.itemCosts) {
    const item = input.items.get(cost.itemId);
    if (item === undefined) return { available: false, reason: `修炼所需物品 ${cost.itemId} 已失效。` };
    if (isEquipped(input.inventory, cost.itemId)) return { available: false, reason: `请先卸下修炼材料「${item.name}」。` };
    const owned = countItem(input.inventory, cost.itemId);
    if (owned < cost.quantity) return { available: false, reason: `修炼材料不足：「${item.name}」需 ${cost.quantity} 件，持有 ${owned} 件。` };
  }
  return { available: true, reason: null };
}

/** Validate every cost first, then spend resource/materials and learn the node. */
export function unlockMeridianNode(input: {
  set: MeridianSetData;
  nodeId: string;
  character: CharacterState;
  inventory: InventoryState;
  items: ReadonlyMap<string, ItemRecordData>;
}): { ok: true; node: MeridianNodeData; remainingPoints: number } | { ok: false; reason: string } {
  const eligibility = checkMeridianEligibility({
    set: input.set,
    nodeId: input.nodeId,
    level: input.character.level,
    cultivationPoints: input.character.cultivationPoints,
    unlockedNodeIds: input.character.unlockedMeridianNodeIds,
    inventory: input.inventory,
    items: input.items,
  });
  if (!eligibility.available) return { ok: false, reason: eligibility.reason ?? '当前无法修炼。' };
  const node = input.set.nodes.find((entry) => entry.id === input.nodeId);
  if (node === undefined) return { ok: false, reason: '经脉节点资料不可用。' };

  input.character.cultivationPoints -= node.pointCost;
  for (const cost of node.itemCosts) removeItems(input.inventory, cost.itemId, cost.quantity);
  input.character.unlockedMeridianNodeIds.push(node.id);
  return { ok: true, node, remainingPoints: input.character.cultivationPoints };
}

/** Sum current node effects in a fresh value object; no bonus is compounded. */
export function aggregateMeridianEffects(
  set: MeridianSetData | null,
  unlockedNodeIds: readonly string[],
): ProgressionBonusData {
  const bonuses: ProgressionBonusData = { attributes: {}, health: 0, qi: 0 };
  if (set === null) return bonuses;
  const nodes = new Map(set.nodes.map((node) => [node.id, node]));
  for (const id of new Set(unlockedNodeIds)) {
    const node = nodes.get(id);
    if (node === undefined) continue;
    for (const attributeId of ATTRIBUTE_IDS) {
      bonuses.attributes[attributeId] =
        (bonuses.attributes[attributeId] ?? 0) + (node.effects.attributes[attributeId] ?? 0);
    }
    bonuses.health += node.effects.health;
    bonuses.qi += node.effects.qi;
  }
  return bonuses;
}

/** Rebuilds effective attributes/vital caps while preserving current values. */
export function applyMeridianEffects(
  profile: CharacterProfileData,
  character: CharacterState,
  bonuses: ProgressionBonusData,
): void {
  character.meridianBonuses = {
    attributes: { ...bonuses.attributes },
    health: bonuses.health,
    qi: bonuses.qi,
  };
  applyEquipmentBonuses(character, character.equipmentBonuses);
  const { healthMax, qiMax } = computeVitalMaxima(profile, character.level, character.attributes);
  character.health.max = healthMax + character.equipmentBonuses.health + character.meridianBonuses.health;
  character.qi.max = qiMax + character.equipmentBonuses.qi + character.meridianBonuses.qi;
  character.health.current = Math.min(character.health.current, character.health.max);
  character.qi.current = Math.min(character.qi.current, character.qi.max);
}
