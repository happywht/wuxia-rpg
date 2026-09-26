/**
 * Generic item-system protocol (Round 06): wire types, defensive parsing,
 * cross-reference assembly and a Phaser-free inventory / equipment / trade
 * rules engine.
 *
 * The engine knows the *shape* of the data only — item names, descriptions,
 * prices, stack limits, consumable effects, equipment bonuses, shop texts,
 * sell rates and stock levels all come from the parsed JSON, so no world
 * content may live here (see docs/ARCHITECTURE.md). Failure paths carry
 * generic mechanical labels and structured reasons only.
 *
 * `data/schema/items-set.schema.json` and `data/schema/shops-set.schema.json`
 * pin down static structure before these functions run. Parsing re-checks
 * shape defensively and adds the single-file semantics a schema cannot
 * express (a consumable must restore something; the effect block must match
 * the declared category). The assembly step adds the cross-resource rules
 * (shop → placed NPC, shop stock → item ids, duplicate ids) and isolates
 * failures per shop / per stock entry.
 *
 * Runtime model: one {@link InventoryState} per player (currency, ordered
 * item stacks, equipment slots) plus one stock map per shop (finite stock
 * decrements on purchase and increments on sell-back; `-1` marks unlimited).
 * Equipped items stay in their stacks — a slot only *locks* one instance of
 * the item against being sold. Every mutating operation validates every
 * condition first and commits afterwards, so a refused operation changes
 * neither currency, nor stacks, nor stock, nor equipment, nor character
 * state (atomicity).
 *
 * Equipment bonuses flow into combat through the Round 06 split of
 * `CharacterState`: the item system recomputes the total bonuses of all
 * equipped slots and hands them to {@link applyEquipmentBonuses}, which
 * rebuilds the effective attributes from the untouched base values; vital
 * maxima recompute as `derived formula + bonus totals` and current values
 * clamp to the new maxima (no free healing). Level-up growth never rolls
 * back because it accumulates on `baseAttributes` only.
 */

import {
  type CharacterProfileData,
  type CharacterState,
  type PartialAttributeMap,
  applyEquipmentBonuses,
  computeVitalMaxima,
  type SetParseResult,
} from './character-progression';

// ---------------------------------------------------------------------------
// Wire formats
// ---------------------------------------------------------------------------

/** Item categories (protocol; every concrete effect stays in data). */
export type ItemCategory = 'consumable' | 'equipment' | 'misc';

/** Equipment slots (protocol): one item per slot at a time. */
export const EQUIPMENT_SLOT_IDS = ['weapon', 'garment', 'ornament'] as const;

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number];

function isEquipmentSlotId(value: string): value is EquipmentSlotId {
  return (EQUIPMENT_SLOT_IDS as readonly string[]).includes(value);
}

/** Consumable effect: using one instance restores these amounts (0 = none). */
export interface ConsumableEffectData {
  healthRestore: number;
  qiRestore: number;
}

/** Equipment effect: applied to the character while the item is equipped. */
export interface EquipmentEffectData {
  slot: EquipmentSlotId;
  attributeBonuses: PartialAttributeMap;
  healthBonus: number;
  qiBonus: number;
}

/** Wire format of one item inside an items-set JSON file. */
export interface ItemRecordData {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  /** Maximum units per stack; the same item never exceeds this count. */
  stackLimit: number;
  /** Shop buy price per unit (the shop decides whether it stocks the item). */
  buyPrice: number;
  /** Base sell price per unit; 0 marks the item unsellable. */
  sellPrice: number;
  /** Present only for `consumable` items. */
  consumable: ConsumableEffectData | null;
  /** Present only for `equipment` items. */
  equipment: EquipmentEffectData | null;
}

/** Wire format of an items-set JSON file under `data/base/items/`. */
export interface ItemSetData {
  items: ItemRecordData[];
}

/** Wire format of one shop stock entry. `-1` quantity means unlimited. */
export interface ShopStockEntryData {
  itemId: string;
  quantity: number;
}

/** Wire format of one shop inside a shops-set JSON file. */
export interface ShopRecordData {
  id: string;
  name: string;
  npcId: string;
  greeting: string;
  /** Sell payout ratio: `floor(sellPrice × sellRate)` per unit. */
  sellRate: number;
  stock: ShopStockEntryData[];
}

/** Wire format of a shops-set JSON file under `data/base/shops/`. */
export interface ShopSetData {
  shops: ShopRecordData[];
}

/** Sentinel for unlimited shop stock (kept out of the public numeric range). */
export const UNLIMITED_STOCK = -1;

// ---------------------------------------------------------------------------
// Defensive parsing helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Reads a partial attribute→bonus map (values 0–99, protocol keys only). */
function requireAttributeBonusMap(raw: unknown): PartialAttributeMap | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const map: PartialAttributeMap = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      key !== 'body' &&
      key !== 'force' &&
      key !== 'agility' &&
      key !== 'insight' &&
      key !== 'resolve'
    ) {
      return null;
    }
    const bonus = requireIntegerInRange(value, 0, 99);
    if (bonus === null) {
      return null;
    }
    map[key] = bonus;
  }
  return map;
}

/** Reads one item's consumable effect. */
function requireConsumableEffect(raw: unknown): ConsumableEffectData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const healthRestore = requireIntegerInRange(source.healthRestore, 0, 9999);
  const qiRestore = requireIntegerInRange(source.qiRestore, 0, 9999);
  if (healthRestore === null || qiRestore === null) {
    return null;
  }
  return { healthRestore, qiRestore };
}

/** Reads one item's equipment effect. */
function requireEquipmentEffect(raw: unknown): EquipmentEffectData | null {
  const source = isPlainObject(raw) ? raw : null;
  if (source === null) {
    return null;
  }
  const slot = typeof source.slot === 'string' && isEquipmentSlotId(source.slot) ? source.slot : null;
  const attributeBonuses = requireAttributeBonusMap(source.attributeBonuses);
  const healthBonus = requireIntegerInRange(source.healthBonus, 0, 9999);
  const qiBonus = requireIntegerInRange(source.qiBonus, 0, 9999);
  if (slot === null || attributeBonuses === null || healthBonus === null || qiBonus === null) {
    return null;
  }
  return { slot, attributeBonuses, healthBonus, qiBonus };
}

/**
 * Defensive re-parse of an items-set document. The Ajv schema already
 * rejected structural violations at load time; this guards the engine
 * against unvalidated values and adds the single-file semantics a schema
 * cannot express: a `consumable` must restore at least one point, and the
 * effect blocks must match the declared category (consumable/equipment
 * blocks on other categories are ignored, never applied).
 */
export function parseItemSet(raw: unknown): SetParseResult<ItemSetData> {
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) {
    return { ok: false, errors: ['items：应为物品条目数组'] };
  }

  const items: ItemRecordData[] = [];
  const errors: string[] = [];
  raw.items.forEach((entry, index) => {
    const label = `items[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const description = requireNonEmptyString(entry.description);
    const category: ItemCategory | null =
      entry.category === 'consumable' || entry.category === 'equipment' || entry.category === 'misc'
        ? entry.category
        : null;
    const stackLimit = requireIntegerInRange(entry.stackLimit, 1, 999);
    const buyPrice = requireIntegerInRange(entry.buyPrice, 0, 999_999);
    const sellPrice = requireIntegerInRange(entry.sellPrice, 0, 999_999);

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (description === null) {
      problems.push(`${label}.description：应为非空字符串`);
    }
    if (category === null) {
      problems.push(`${label}.category：应为 consumable/equipment/misc 之一`);
    }
    if (stackLimit === null) {
      problems.push(`${label}.stackLimit：应为 1–999 的整数`);
    }
    if (buyPrice === null) {
      problems.push(`${label}.buyPrice：应为 0–999999 的整数`);
    }
    if (sellPrice === null) {
      problems.push(`${label}.sellPrice：应为 0–999999 的整数`);
    }

    let consumable: ConsumableEffectData | null = null;
    let equipment: EquipmentEffectData | null = null;
    if (category === 'consumable') {
      consumable = requireConsumableEffect(entry.consumable);
      if (consumable === null) {
        problems.push(
          `${label}.consumable：应含 healthRestore 与 qiRestore（0–9999 整数）`,
        );
      } else if (consumable.healthRestore <= 0 && consumable.qiRestore <= 0) {
        problems.push(`${label}：消耗品至少应恢复一项生命/内力`);
      }
    } else if (category === 'equipment') {
      equipment = requireEquipmentEffect(entry.equipment);
      if (equipment === null) {
        problems.push(
          `${label}.equipment：应含 slot（weapon/garment/ornament）、attributeBonuses、healthBonus 与 qiBonus`,
        );
      }
    }

    if (
      id === null ||
      name === null ||
      description === null ||
      category === null ||
      stackLimit === null ||
      buyPrice === null ||
      sellPrice === null ||
      problems.length > 0
    ) {
      errors.push(...problems);
      return;
    }

    items.push({ id, name, description, category, stackLimit, buyPrice, sellPrice, consumable, equipment });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { items } };
}

/**
 * Defensive re-parse of a shops-set document. The Ajv schema already
 * rejected structural violations at load time; this guards the engine
 * against unvalidated values and yields readable per-entry errors.
 */
export function parseShopSet(raw: unknown): SetParseResult<ShopSetData> {
  if (!isPlainObject(raw) || !Array.isArray(raw.shops)) {
    return { ok: false, errors: ['shops：应为商店条目数组'] };
  }

  const shops: ShopRecordData[] = [];
  const errors: string[] = [];
  raw.shops.forEach((entry, index) => {
    const label = `shops[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label}：应为对象`);
      return;
    }

    const id = requireNonEmptyString(entry.id);
    const name = requireNonEmptyString(entry.name);
    const npcId = requireNonEmptyString(entry.npcId);
    const greeting = requireNonEmptyString(entry.greeting);
    const sellRate =
      typeof entry.sellRate === 'number' && Number.isFinite(entry.sellRate) && entry.sellRate >= 0 && entry.sellRate <= 10
        ? entry.sellRate
        : null;

    const stock: ShopStockEntryData[] | null = Array.isArray(entry.stock)
      ? (() => {
          const entries: ShopStockEntryData[] = [];
          for (const stockEntry of entry.stock) {
            const source = isPlainObject(stockEntry) ? stockEntry : null;
            const itemId = source === null ? null : requireNonEmptyString(source.itemId);
            const quantity = source === null ? null : requireIntegerInRange(source.quantity, -1, 999_999);
            if (itemId === null || quantity === null) {
              return null;
            }
            entries.push({ itemId, quantity });
          }
          return entries;
        })()
      : null;

    const problems: string[] = [];
    if (id === null) {
      problems.push(`${label}.id：应为非空字符串`);
    }
    if (name === null) {
      problems.push(`${label}.name：应为非空字符串`);
    }
    if (npcId === null) {
      problems.push(`${label}.npcId：应为非空字符串`);
    }
    if (greeting === null) {
      problems.push(`${label}.greeting：应为非空字符串`);
    }
    if (sellRate === null) {
      problems.push(`${label}.sellRate：应为 0–10 的数值`);
    }
    if (stock === null) {
      problems.push(`${label}.stock：应为货架条目数组（itemId 非空、quantity -1 至 999999）`);
    }

    if (
      id === null ||
      name === null ||
      npcId === null ||
      greeting === null ||
      sellRate === null ||
      stock === null ||
      problems.length > 0
    ) {
      errors.push(...problems);
      return;
    }

    shops.push({ id, name, npcId, greeting, sellRate, stock });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, set: { shops } };
}

// ---------------------------------------------------------------------------
// Indexing and cross-resource assembly
// ---------------------------------------------------------------------------

export interface ItemIndex {
  /** Valid items by id; first declaration wins on duplicates. */
  byId: Map<string, ItemRecordData>;
  /** Dropped duplicate ids, e.g. for warnings. */
  duplicateIds: string[];
}

/** Indexes items by id, keeping the first declaration of each id. */
export function indexItems(set: ItemSetData): ItemIndex {
  const byId = new Map<string, ItemRecordData>();
  const duplicateIds: string[] = [];
  for (const item of set.items) {
    if (byId.has(item.id)) {
      duplicateIds.push(item.id);
      continue;
    }
    byId.set(item.id, item);
  }
  return { byId, duplicateIds };
}

/** A shop that passed every cross-resource check, with its valid shelf. */
export interface AssembledShop {
  record: ShopRecordData;
  /** Stock entries whose item references resolved; first declaration wins. */
  stock: ShopStockEntryData[];
}

export interface ShopAssemblyInput {
  /** Parsed shops set; null when the resource is missing or structurally invalid. */
  shopSet: ShopSetData | null;
  /** Ids of NPCs that passed placement (a shop needs its keeper on the map). */
  placedNpcIds: ReadonlySet<string>;
  /** Valid items by id (already indexed). */
  items: ReadonlyMap<string, ItemRecordData>;
}

export interface ShopAssemblyResult {
  /** Valid shops by id; first declaration wins on duplicates. */
  shops: Map<string, AssembledShop>;
  /** Readable per-shop / per-entry problems; each disables its smallest unit. */
  warnings: string[];
}

/**
 * Runs every cross-resource rule for each shop in declaration order:
 *
 * - id must be unique (first declaration wins);
 * - `npcId` must resolve to a placed NPC (otherwise nobody can open the shop);
 * - every stock `itemId` must resolve to a valid item — a dangling or
 *   duplicate entry drops out alone, the shop itself stays usable.
 */
export function assembleShops(input: ShopAssemblyInput): ShopAssemblyResult {
  const shops = new Map<string, AssembledShop>();
  const warnings: string[] = [];
  if (input.shopSet === null) {
    return { shops, warnings };
  }

  for (const record of input.shopSet.shops) {
    const problems: string[] = [];
    if (shops.has(record.id)) {
      problems.push('id 与前面的条目重复，保留先声明者');
    }
    if (!input.placedNpcIds.has(record.npcId)) {
      problems.push(`引用的开店 NPC "${record.npcId}" 不存在或未放置`);
    }

    const stock: ShopStockEntryData[] = [];
    const seenItemIds = new Set<string>();
    for (const stockEntry of record.stock) {
      if (seenItemIds.has(stockEntry.itemId)) {
        warnings.push(
          `商店 "${record.id}"（${record.name}）的货架条目 "${stockEntry.itemId}" 重复，保留先声明者`,
        );
        continue;
      }
      seenItemIds.add(stockEntry.itemId);
      if (!input.items.has(stockEntry.itemId)) {
        warnings.push(
          `商店 "${record.id}"（${record.name}）的货架条目 "${stockEntry.itemId}" 已剔除：引用的物品不存在或已因校验失败被禁用`,
        );
        continue;
      }
      stock.push(stockEntry);
    }

    if (problems.length > 0) {
      warnings.push(`商店 "${record.id}"（${record.name}）已禁用：${problems.join('；')}`);
      continue;
    }
    shops.set(record.id, { record, stock });
  }

  return { shops, warnings };
}

// ---------------------------------------------------------------------------
// Runtime inventory state
// ---------------------------------------------------------------------------

/** One ordered stack of identical items. */
export interface InventoryStackData {
  itemId: string;
  quantity: number;
}

/** Runtime-only player inventory; never persisted this round (Round 09). */
export interface InventoryState {
  currency: number;
  /** Maximum number of distinct stacks (capacity counts stacks, not units). */
  capacity: number;
  stacks: InventoryStackData[];
  /** Equipped item id per slot; an equipped item stays in its stack (locked). */
  equipped: Partial<Record<EquipmentSlotId, string>>;
}

export interface StartingItemsResolution {
  /** Validated stacks in declaration order. */
  stacks: InventoryStackData[];
  /** One readable problem per dropped, clamped, merged or truncated entry. */
  warnings: string[];
}

/**
 * Validates a profile's `startingItems` against the indexed items: a broken
 * reference drops exactly that declaration; a quantity above the item's
 * `stackLimit` clamps to it; duplicate declarations of one item merge into a
 * single stack; declarations beyond `inventoryCapacity` truncate. The
 * profile itself always stays usable.
 */
export function resolveStartingItems(
  profile: CharacterProfileData,
  items: ReadonlyMap<string, ItemRecordData>,
): StartingItemsResolution {
  const stacks: InventoryStackData[] = [];
  const warnings: string[] = [];
  const byItemId = new Map<string, number>(); // itemId -> index into stacks

  for (const declaration of profile.startingItems) {
    const item = items.get(declaration.itemId);
    if (item === undefined) {
      warnings.push(
        `模板 "${profile.id}" 的起始物品 "${declaration.itemId}" 不存在或已因校验失败被禁用，已剔除`,
      );
      continue;
    }

    let quantity = declaration.quantity;
    if (quantity > item.stackLimit) {
      warnings.push(
        `模板 "${profile.id}" 的起始物品 "${declaration.itemId}"（${item.name}）数量 ${quantity} 超过堆叠上限 ${item.stackLimit}，已按上限截取`,
      );
      quantity = item.stackLimit;
    }

    const existingIndex = byItemId.get(item.id);
    if (existingIndex !== undefined) {
      const stack = stacks[existingIndex];
      if (stack === undefined) {
        continue; // Unreachable: byItemId mirrors stacks.
      }
      const before = stack.quantity;
      stack.quantity = Math.min(before + quantity, item.stackLimit);
      if (stack.quantity !== before + quantity) {
        warnings.push(
          `模板 "${profile.id}" 的起始物品 "${item.id}"（${item.name}）重复声明合并后超过堆叠上限，已按上限截取`,
        );
      }
      continue;
    }

    byItemId.set(item.id, stacks.length);
    stacks.push({ itemId: item.id, quantity });
  }

  if (stacks.length > profile.inventoryCapacity) {
    warnings.push(
      `模板 "${profile.id}" 的起始物品共 ${stacks.length} 堆，超过背包容量 ${profile.inventoryCapacity}，已截取前 ${profile.inventoryCapacity} 堆`,
    );
    stacks.length = profile.inventoryCapacity;
  }

  return { stacks, warnings };
}

/** Creates the runtime inventory declared by a profile (copies the stacks). */
export function createInventoryState(
  profile: CharacterProfileData,
  stacks: readonly InventoryStackData[],
): InventoryState {
  return {
    currency: profile.startingCurrency,
    capacity: profile.inventoryCapacity,
    stacks: stacks.map((stack) => ({ ...stack })),
    equipped: {},
  };
}

/** Per-shop mutable stock: itemId → remaining units (`-1` = unlimited). */
export type ShopStockRuntime = Map<string, number>;

/** Creates the per-run stock copy of one assembled shop. */
export function createShopStockRuntime(shop: AssembledShop): ShopStockRuntime {
  const runtime: ShopStockRuntime = new Map();
  for (const entry of shop.stock) {
    runtime.set(entry.itemId, entry.quantity);
  }
  return runtime;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Total owned units of one item across stacks. */
export function countItem(inventory: Readonly<InventoryState>, itemId: string): number {
  let total = 0;
  for (const stack of inventory.stacks) {
    if (stack.itemId === itemId) {
      total += stack.quantity;
    }
  }
  return total;
}

/** Item id equipped in `slot`, if any. */
export function equippedItemId(
  inventory: Readonly<InventoryState>,
  slot: EquipmentSlotId,
): string | undefined {
  return inventory.equipped[slot];
}

/** True while the item occupies any equipment slot (its stack stays locked). */
export function isEquipped(inventory: Readonly<InventoryState>, itemId: string): boolean {
  return (EQUIPMENT_SLOT_IDS as readonly EquipmentSlotId[]).some(
    (slot) => inventory.equipped[slot] === itemId,
  );
}

/**
 * How many more units of `item` fit right now: leftover space in matching
 * stacks plus free stack slots times the item's stack limit. Capacity counts
 * distinct stacks only — topping up an existing stack never needs capacity.
 */
export function additionalCapacityFor(
  inventory: Readonly<InventoryState>,
  item: ItemRecordData,
): number {
  let free = 0;
  for (const stack of inventory.stacks) {
    if (stack.itemId === item.id) {
      free += item.stackLimit - stack.quantity;
    }
  }
  const freeSlots = inventory.capacity - inventory.stacks.length;
  if (freeSlots > 0) {
    free += freeSlots * item.stackLimit;
  }
  return free;
}

/** Sell payout per unit: `floor(sellPrice × sellRate)`; 0 marks unsellable. */
export function computeSellPrice(item: ItemRecordData, shop: ShopRecordData): number {
  if (item.sellPrice <= 0) {
    return 0;
  }
  return Math.floor(item.sellPrice * shop.sellRate);
}

// ---------------------------------------------------------------------------
// Internal stack helpers (unvalidated; callers pre-check their contracts)
// ---------------------------------------------------------------------------

/** Inserts `quantity` units of `item`, filling matching stacks first. */
function insertItem(inventory: InventoryState, item: ItemRecordData, quantity: number): void {
  let remaining = quantity;
  for (const stack of inventory.stacks) {
    if (stack.itemId !== item.id || remaining === 0) {
      continue;
    }
    const moved = Math.min(item.stackLimit - stack.quantity, remaining);
    stack.quantity += moved;
    remaining -= moved;
  }
  while (remaining > 0) {
    const moved = Math.min(item.stackLimit, remaining);
    inventory.stacks.push({ itemId: item.id, quantity: moved });
    remaining -= moved;
  }
}

/** Removes `quantity` units of `itemId`, dropping emptied stacks. */
function takeItem(inventory: InventoryState, itemId: string, quantity: number): void {
  let remaining = quantity;
  for (let index = 0; index < inventory.stacks.length && remaining > 0; ) {
    const stack = inventory.stacks[index];
    if (stack === undefined || stack.itemId !== itemId) {
      index += 1;
      continue;
    }
    const moved = Math.min(stack.quantity, remaining);
    stack.quantity -= moved;
    remaining -= moved;
    if (stack.quantity === 0) {
      inventory.stacks.splice(index, 1);
    } else {
      index += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Dialogue-effect commit primitives (Round 08)
// ---------------------------------------------------------------------------

/**
 * Commit half of a pre-validated item grant (used by dialogue effects):
 * callers verify headroom with {@link additionalCapacityFor} first, so this
 * insert cannot overflow stacks or capacity. Mirrors the trade operations'
 * split of "validate everything, then commit everything".
 */
export function grantItems(
  inventory: InventoryState,
  item: ItemRecordData,
  quantity: number,
): void {
  insertItem(inventory, item, quantity);
}

/**
 * Commit half of a pre-validated item removal (used by dialogue effects):
 * callers verify ownership (and the one equipped instance being locked out)
 * with {@link countItem} / {@link isEquipped} first, so this removal cannot
 * go negative or strip an equipped item's stack.
 */
export function removeItems(
  inventory: InventoryState,
  itemId: string,
  quantity: number,
): void {
  takeItem(inventory, itemId, quantity);
}

// ---------------------------------------------------------------------------
// Equipment rules
// ---------------------------------------------------------------------------

/** Everything an equipment change needs to reconcile character state. */
export interface EquipmentContext {
  inventory: InventoryState;
  character: CharacterState;
  profile: CharacterProfileData;
  items: ReadonlyMap<string, ItemRecordData>;
}

export type EquipRefusalReason = 'not-owned' | 'not-equipment' | 'already-equipped';

export type EquipResult =
  | { ok: true; slot: EquipmentSlotId; replacedItemId: string | null }
  | { ok: false; reason: EquipRefusalReason; message: string };

/**
 * Equips one owned equipment item into its declared slot, replacing whatever
 * occupied the slot (the replaced item simply becomes unequipped — it never
 * left the bag). Effective attributes, vital maxima and current values
 * reconcile immediately; the current values only clamp (no free healing).
 * Every check runs before the first mutation, so a refusal changes nothing.
 */
export function equipItem(context: EquipmentContext, item: ItemRecordData): EquipResult {
  const { inventory } = context;
  if (item.category !== 'equipment' || item.equipment === null) {
    return { ok: false, reason: 'not-equipment', message: `「${item.name}」不是可装备的物品` };
  }
  if (countItem(inventory, item.id) <= 0) {
    return { ok: false, reason: 'not-owned', message: `没有「${item.name}」可装备` };
  }
  if (inventory.equipped[item.equipment.slot] === item.id) {
    return { ok: false, reason: 'already-equipped', message: `「${item.name}」已在该槽位装备中` };
  }

  const replacedItemId = inventory.equipped[item.equipment.slot] ?? null;
  inventory.equipped[item.equipment.slot] = item.id;
  reconcileEquipment(context);
  return { ok: true, slot: item.equipment.slot, replacedItemId };
}

export type UnequipRefusalReason = 'slot-empty';

export type UnequipResult =
  | { ok: true; slot: EquipmentSlotId }
  | { ok: false; reason: UnequipRefusalReason; message: string };

/** Clears one equipment slot; the item stays in its stack, merely unlocked. */
export function unequipItem(context: EquipmentContext, slot: EquipmentSlotId): UnequipResult {
  const { inventory } = context;
  const current = inventory.equipped[slot];
  if (current === undefined) {
    return { ok: false, reason: 'slot-empty', message: '该槽位没有装备' };
  }
  delete inventory.equipped[slot];
  reconcileEquipment(context);
  return { ok: true, slot };
}

/**
 * Recomputes the total bonuses of every equipped slot, resynchronizes the
 * effective attributes from the base values and rebuilds the vital maxima as
 * `derived formula + bonus totals`, clamping the current values on the way
 * (shrinking maxima cut into current values; growing maxima heal nothing).
 * A dangling equipped reference grants nothing — defensive by construction.
 */
function reconcileEquipment(context: EquipmentContext): void {
  const { inventory, character, profile, items } = context;
  const totals = {
    attributes: {} as PartialAttributeMap,
    health: 0,
    qi: 0,
  };
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const itemId = inventory.equipped[slot];
    if (itemId === undefined) {
      continue;
    }
    const equipment = items.get(itemId)?.equipment ?? null;
    if (equipment === null) {
      continue; // Dangling reference: grants nothing, defensive by construction.
    }
    for (const [attributeId, bonus] of Object.entries(equipment.attributeBonuses)) {
      const key = attributeId as keyof PartialAttributeMap;
      totals.attributes[key] = (totals.attributes[key] ?? 0) + bonus;
    }
    totals.health += equipment.healthBonus;
    totals.qi += equipment.qiBonus;
  }

  applyEquipmentBonuses(character, totals);
  const { healthMax, qiMax } = computeVitalMaxima(profile, character.level, character.attributes);
  const newHealthMax = healthMax + totals.health;
  const newQiMax = qiMax + totals.qi;
  character.health.current = Math.min(character.health.current, newHealthMax);
  character.qi.current = Math.min(character.qi.current, newQiMax);
  character.health.max = newHealthMax;
  character.qi.max = newQiMax;
}

// ---------------------------------------------------------------------------
// Consumable rules
// ---------------------------------------------------------------------------

export type UseRefusalReason = 'not-owned' | 'not-consumable';

export interface UseOutcome {
  healthHealed: number;
  qiRestored: number;
}

export type UseResult =
  | { ok: true; outcome: UseOutcome }
  | { ok: false; reason: UseRefusalReason; message: string };

/**
 * Uses one owned consumable: restores its declared amounts to the character,
 * clamped at the current maxima, then removes exactly one unit. Refusals
 * happen before any mutation (not owned / not a consumable). Values already
 * at their maxima simply absorb nothing — using a full-health character's
 * healing item is legal, just wasteful, and stays the player's decision.
 */
export function useConsumable(
  inventory: InventoryState,
  character: CharacterState,
  item: ItemRecordData,
): UseResult {
  if (item.category !== 'consumable' || item.consumable === null) {
    return { ok: false, reason: 'not-consumable', message: `「${item.name}」不是可使用的物品` };
  }
  if (countItem(inventory, item.id) <= 0) {
    return { ok: false, reason: 'not-owned', message: `没有「${item.name}」可使用` };
  }

  const healthHealed = Math.min(
    item.consumable.healthRestore,
    character.health.max - character.health.current,
  );
  const qiRestored = Math.min(item.consumable.qiRestore, character.qi.max - character.qi.current);
  character.health.current += healthHealed;
  character.qi.current += qiRestored;
  takeItem(inventory, item.id, 1);
  return { ok: true, outcome: { healthHealed, qiRestored } };
}

// ---------------------------------------------------------------------------
// Trade rules (atomic: validate everything, then commit everything)
// ---------------------------------------------------------------------------

export type BuyRefusalReason =
  | 'invalid-quantity'
  | 'not-stocked'
  | 'out-of-stock'
  | 'insufficient-currency'
  | 'capacity-exceeded';

export interface BuyOutcome {
  cost: number;
  quantity: number;
}

export type BuyResult =
  | { ok: true; outcome: BuyOutcome }
  | { ok: false; reason: BuyRefusalReason; message: string };

/**
 * Buys `quantity` units of `item` from the shop's runtime stock. Validation
 * covers presence on the shelf, remaining stock (unlimited passes), total
 * cost and stack/capacity headroom — only then do currency, stacks and stock
 * change together. A refusal leaves every one of them untouched.
 */
export function buyItem(
  inventory: InventoryState,
  stock: ShopStockRuntime,
  item: ItemRecordData,
  quantity = 1,
): BuyResult {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      reason: 'invalid-quantity',
      message: '购买数量必须为正整数',
    };
  }
  const remaining = stock.get(item.id);
  if (remaining === undefined) {
    return { ok: false, reason: 'not-stocked', message: `「${item.name}」未在该商店上架` };
  }
  if (remaining !== UNLIMITED_STOCK && remaining < quantity) {
    return {
      ok: false,
      reason: 'out-of-stock',
      message: `「${item.name}」库存不足（剩余 ${remaining}）`,
    };
  }
  const cost = item.buyPrice * quantity;
  if (!Number.isSafeInteger(cost)) {
    return {
      ok: false,
      reason: 'invalid-quantity',
      message: '购买总价超出可处理范围',
    };
  }
  if (inventory.currency < cost) {
    return { ok: false, reason: 'insufficient-currency', message: `银两不足（需 ${cost}）` };
  }
  if (additionalCapacityFor(inventory, item) < quantity) {
    return { ok: false, reason: 'capacity-exceeded', message: '背包放不下更多物品' };
  }

  inventory.currency -= cost;
  insertItem(inventory, item, quantity);
  if (remaining !== UNLIMITED_STOCK) {
    stock.set(item.id, remaining - quantity);
  }
  return { ok: true, outcome: { cost, quantity } };
}

export type SellRefusalReason = 'invalid-quantity' | 'unsellable' | 'not-owned' | 'equipped';

export interface SellOutcome {
  revenue: number;
  quantity: number;
}

export type SellResult =
  | { ok: true; outcome: SellOutcome }
  | { ok: false; reason: SellRefusalReason; message: string };

/**
 * Sells `quantity` units of `item` to the shop at
 * `floor(sellPrice × sellRate)` per unit. Unsellable items (`sellPrice` 0),
 * missing ownership and equipped instances (each slot locks one unit) are
 * refused before anything changes; a successful sale moves the units out of
 * the bag, pays once and returns finite stock to the shelf.
 */
export function sellItem(
  inventory: InventoryState,
  stock: ShopStockRuntime,
  shop: ShopRecordData,
  item: ItemRecordData,
  quantity = 1,
): SellResult {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      reason: 'invalid-quantity',
      message: '出售数量必须为正整数',
    };
  }
  if (item.sellPrice <= 0) {
    return { ok: false, reason: 'unsellable', message: `「${item.name}」无法出售` };
  }
  const owned = countItem(inventory, item.id);
  if (owned < quantity) {
    return { ok: false, reason: 'not-owned', message: `没有足够的「${item.name}」可出售` };
  }
  const locked = isEquipped(inventory, item.id) ? 1 : 0;
  if (owned - locked < quantity) {
    return {
      ok: false,
      reason: 'equipped',
      message: `「${item.name}」正在装备中，无法出售`,
    };
  }

  const revenue = computeSellPrice(item, shop) * quantity;
  if (!Number.isSafeInteger(revenue)) {
    return {
      ok: false,
      reason: 'invalid-quantity',
      message: '出售金额超出可处理范围',
    };
  }
  inventory.currency += revenue;
  takeItem(inventory, item.id, quantity);
  const remaining = stock.get(item.id);
  if (remaining !== undefined && remaining !== UNLIMITED_STOCK) {
    stock.set(item.id, remaining + quantity);
  }
  return { ok: true, outcome: { revenue, quantity } };
}
