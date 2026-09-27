/** Data-authored components and bounded rules for player-created martial arts. */
import { parseMartialArtSet, type MartialArtData } from './character-progression';

export type MartialArtComponentSlot = 'intent' | 'form' | 'breath';
export interface MartialArtForgeComponent {
  id: string;
  slot: MartialArtComponentSlot;
  name: string;
  category: string;
  style: string;
  description: string;
  /** Intent: base power; form/breath: signed adjustment. */
  power: number;
  /** Intent: base qi cost; form/breath: signed adjustment. */
  qiCost: number;
  silverCost: number;
  /** Only intent components choose the final attack/heal action. */
  kind: 'attack' | 'heal' | null;
}
export interface MartialArtForgeComponentSet { components: MartialArtForgeComponent[] }
export interface MartialArtRecipe { intentId: string; formId: string; breathId: string }
export const MAX_CUSTOM_MARTIAL_ARTS = 5;
export const CUSTOM_MARTIAL_ART_ID_PREFIX = 'custom-art.';
export const CUSTOM_MARTIAL_ART_MAX_POWER = 18;
export const CUSTOM_MARTIAL_ART_MAX_QI = 12;
export const CUSTOM_MARTIAL_ART_MAX_BUDGET = 34;
export const CUSTOM_MARTIAL_ART_MIN_NAME_LENGTH = 2;
export const CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH = 16;

/** Unicode code-point limit shared by the DOM name editor and craft rule. */
export function normalizeCustomMartialArtName(value: string): string {
  return Array.from(value.normalize('NFC')).slice(0, CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH).join('');
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max;
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Defensively parses component content after its resource has passed JSON Schema. */
export function parseMartialArtForgeComponents(raw: unknown):
  | { ok: true; set: MartialArtForgeComponentSet }
  | { ok: false; errors: string[] } {
  if (!object(raw) || !Array.isArray(raw.components)) return { ok: false, errors: ['components：应为组件数组'] };
  const errors: string[] = [];
  const components: MartialArtForgeComponent[] = [];
  const seenIds = new Set<string>();
  const counts: Record<MartialArtComponentSlot, number> = { intent: 0, form: 0, breath: 0 };
  raw.components.forEach((value, index) => {
    const label = `components[${index}]`;
    if (!object(value)) { errors.push(`${label}：应为对象`); return; }
    const slot = value.slot;
    const validSlot = slot === 'intent' || slot === 'form' || slot === 'breath';
    const validIntent = slot === 'intent' && (value.kind === 'attack' || value.kind === 'heal') &&
      integer(value.power, 1, CUSTOM_MARTIAL_ART_MAX_POWER) && integer(value.qiCost, 0, CUSTOM_MARTIAL_ART_MAX_QI);
    const validAdjustment = (slot === 'form' || slot === 'breath') && value.kind === null &&
      integer(value.power, -10, CUSTOM_MARTIAL_ART_MAX_POWER) && integer(value.qiCost, -10, CUSTOM_MARTIAL_ART_MAX_QI);
    if (!text(value.id, 80) || seenIds.has(value.id)) errors.push(`${label}.id：应为非空且唯一的 id`);
    if (text(value.id, 80)) seenIds.add(value.id);
    if (!validSlot || !(validIntent || validAdjustment)) errors.push(`${label}：槽位、招式种类或功力/内力值不匹配`);
    if (!text(value.name, 40) || !text(value.category, 24) || !text(value.style, 80) || !text(value.description, 120)) {
      errors.push(`${label}：名称、类别、路数或说明无效`);
    }
    if (!integer(value.silverCost, 1, 10000)) errors.push(`${label}.silverCost：应为 1–10000 的正整数`);
    if (validSlot) counts[slot] += 1;
    if (text(value.id, 80) && validSlot &&
      (validIntent || validAdjustment) && text(value.name, 40) && text(value.category, 24) &&
      text(value.style, 80) && text(value.description, 120) && integer(value.silverCost, 1, 10000)) {
      components.push({
        id: value.id, slot, name: value.name.trim(), category: value.category.trim(), style: value.style.trim(),
        description: value.description.trim(), power: value.power as number, qiCost: value.qiCost as number,
        silverCost: value.silverCost, kind: value.kind as MartialArtForgeComponent['kind'],
      });
    }
  });
  for (const slot of ['intent', 'form', 'breath'] as const) {
    if (counts[slot] === 0) errors.push(`components：至少需要一个 ${slot} 组件`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, set: { components } };
}

export type CustomMartialArtCraftResult =
  | { ok: true; art: MartialArtData; silverCost: number; budget: number }
  | { ok: false; reason: string };

/** Pure builder. Refusals never mutate the character, inventory or source set. */
export function craftCustomMartialArt(input: {
  components: MartialArtForgeComponentSet;
  recipe: MartialArtRecipe;
  name: string;
  existingArts: readonly MartialArtData[];
  occupiedIds?: ReadonlySet<string>;
}): CustomMartialArtCraftResult {
  if (input.existingArts.length >= MAX_CUSTOM_MARTIAL_ARTS) return { ok: false, reason: `自创武学最多 ${MAX_CUSTOM_MARTIAL_ARTS} 门。` };
  const name = input.name.normalize('NFC').trim();
  const nameLength = Array.from(name).length;
  if (nameLength < CUSTOM_MARTIAL_ART_MIN_NAME_LENGTH || nameLength > CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(name)) {
    return { ok: false, reason: `名号须为 ${CUSTOM_MARTIAL_ART_MIN_NAME_LENGTH}–${CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH} 个字符。` };
  }
  const normalizedName = name.toLocaleLowerCase();
  if (input.existingArts.some((art) => art.name.normalize('NFC').trim().toLocaleLowerCase() === normalizedName)) {
    return { ok: false, reason: '自创武学名号不可重复。' };
  }
  const byId = new Map(input.components.components.map((component) => [component.id, component]));
  const intent = byId.get(input.recipe.intentId);
  const form = byId.get(input.recipe.formId);
  const breath = byId.get(input.recipe.breathId);
  if (intent?.slot !== 'intent' || form?.slot !== 'form' || breath?.slot !== 'breath' || intent.kind === null) {
    return { ok: false, reason: '招式、架势和吐纳各须选择一个有效组件。' };
  }
  const power = intent.power + form.power + breath.power;
  const qiCost = intent.qiCost + form.qiCost + breath.qiCost;
  const budget = power + qiCost * 2;
  const silverCost = intent.silverCost + form.silverCost + breath.silverCost;
  if (power < 1 || power > CUSTOM_MARTIAL_ART_MAX_POWER || qiCost < 0 || qiCost > CUSTOM_MARTIAL_ART_MAX_QI || budget > CUSTOM_MARTIAL_ART_MAX_BUDGET) {
    return { ok: false, reason: `组合超出功力约束（功力≤${CUSTOM_MARTIAL_ART_MAX_POWER}、内力≤${CUSTOM_MARTIAL_ART_MAX_QI}、预算≤${CUSTOM_MARTIAL_ART_MAX_BUDGET}）。` };
  }
  const usedIds = new Set(input.occupiedIds ?? []);
  for (const art of input.existingArts) usedIds.add(art.id);
  let ordinal = 1;
  while (usedIds.has(CUSTOM_MARTIAL_ART_ID_PREFIX + ordinal)) ordinal += 1;
  const style = Array.from(`${form.style}，${breath.style}`).slice(0, 160).join('');
  const description = `${intent.description}；${form.description}；${breath.description}`;
  return {
    ok: true,
    art: {
      id: CUSTOM_MARTIAL_ART_ID_PREFIX + ordinal,
      name,
      category: intent.category,
      style,
      description,
      factionIds: [],
      requirements: { level: 1, attributes: {} },
      initialProficiency: 0,
      proficiencyCap: 100,
      combat: { kind: intent.kind, power, qiCost },
    },
    silverCost,
    budget,
  };
}

/** Validates, charges and registers as one Phaser-free player-state mutation. */
export function craftAndRegisterCustomMartialArt(input: {
  components: MartialArtForgeComponentSet;
  recipe: MartialArtRecipe;
  name: string;
  existingArts: readonly MartialArtData[];
  occupiedIds?: ReadonlySet<string>;
  inventory: { currency: number };
  learnedArtIds: string[];
  customArts: Map<string, MartialArtData>;
}): CustomMartialArtCraftResult {
  const preview = craftCustomMartialArt(input);
  if (!preview.ok) return preview;
  if (!Number.isSafeInteger(input.inventory.currency) || input.inventory.currency < preview.silverCost) {
    return { ok: false, reason: `银两不足：创制需 ${preview.silverCost}，现有 ${input.inventory.currency}。` };
  }
  if (input.learnedArtIds.includes(preview.art.id) || input.customArts.has(preview.art.id)) {
    return { ok: false, reason: '这门自创武学已经收入你的招式谱。' };
  }
  input.inventory.currency -= preview.silverCost;
  input.customArts.set(preview.art.id, preview.art);
  input.learnedArtIds.push(preview.art.id);
  return preview;
}

/** Save parser: custom moves are bounded again and remain valid without mods. */
export function parseSavedCustomMartialArts(raw: unknown): MartialArtData[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CUSTOM_MARTIAL_ARTS) return null;
  const parsed = parseMartialArtSet({ martialArts: raw });
  if (!parsed.ok) return null;
  const arts = parsed.set.martialArts;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const art of arts) {
    const name = art.name.normalize('NFC').trim();
    const normalizedName = name.toLocaleLowerCase();
    const budget = art.combat.power + art.combat.qiCost * 2;
    if (!new RegExp(`^${CUSTOM_MARTIAL_ART_ID_PREFIX.replace('.', '\\.')}[1-9][0-9]*$`, 'u').test(art.id) ||
      ids.has(art.id) || /[\u0000-\u001f\u007f]/u.test(name) || Array.from(name).length < CUSTOM_MARTIAL_ART_MIN_NAME_LENGTH ||
      Array.from(name).length > CUSTOM_MARTIAL_ART_MAX_NAME_LENGTH || names.has(normalizedName) ||
      Array.from(art.category).length > 24 || Array.from(art.style).length > 160 || Array.from(art.description).length > 380 ||
      art.factionIds.length !== 0 || art.requirements.level !== 1 || Object.keys(art.requirements.attributes).length !== 0 ||
      art.initialProficiency !== 0 || art.proficiencyCap !== 100 || art.combat.power > CUSTOM_MARTIAL_ART_MAX_POWER ||
      art.combat.qiCost > CUSTOM_MARTIAL_ART_MAX_QI || budget > CUSTOM_MARTIAL_ART_MAX_BUDGET) return null;
    ids.add(art.id);
    names.add(normalizedName);
  }
  return arts;
}
