/**
 * Round 120: pure crafting-panel layout helpers (Phaser-free).
 *
 * Reuses the Round 119 measured-panel geometry and lossless pagination
 * verbatim; adds only the two stations' detail-block assembly. Every block is
 * returned complete — full descriptions, every material with live owned/needed
 * counts, fee/eligibility reasons and outcome use text — so a measured wrapper
 * and block pager can present it without fixed clipping. An undiscovered
 * alchemy formula assembles ONLY its clue lines: never its name, ingredients
 * or outcome, so no pagination can leak what the run has not learned yet.
 */
import type { AlchemyRecipeData } from '../engine/alchemy-system';
import type { EquipmentForgeRecipeData } from '../engine/equipment-forge';
import type { InventoryState, ItemRecordData } from '../engine/item-system';

export { questFooterColumns as craftingFooterColumns, buildQuestPanelGeometry as buildCraftingPanelGeometry, paginateQuestDetail as paginateCraftingDetail, type QuestPanelGeometry as CraftingPanelGeometry } from './quest-panel-layout';

export interface CraftingIngredientView {
  itemId: string;
  name: string;
  owned: number;
  quantity: number;
}

/** Live owned/needed view of one recipe's ingredient list. */
export function craftingIngredientViews(
  recipe: { ingredients: readonly { itemId: string; quantity: number }[] },
  inventory: InventoryState,
  items: ReadonlyMap<string, ItemRecordData>,
): CraftingIngredientView[] {
  return recipe.ingredients.map((ingredient) => ({
    itemId: ingredient.itemId,
    name: items.get(ingredient.itemId)?.name ?? ingredient.itemId,
    owned: inventory.stacks.find((stack) => stack.itemId === ingredient.itemId)?.quantity ?? 0,
    quantity: ingredient.quantity,
  }));
}

const materialLines = (views: readonly CraftingIngredientView[]): string[] =>
  views.length === 0 ? ['无'] : views.map((view) => `${view.name}　${view.owned}/${view.quantity}`);

export interface AlchemyOutcomeView {
  qualityName: string;
  itemName: string;
  healthRestore: number;
  qiRestore: number;
  description: string;
}

/**
 * Blank-line-separated detail blocks for one alchemy recipe. The known branch
 * is lossless; the unknown branch is confidentiality-by-construction — only
 * the discovery hint lines, none of the formula's own names or materials.
 */
export function buildAlchemyDetailBlocks(input: {
  recipe: AlchemyRecipeData;
  known: boolean;
  /** 1-based list position, used to name an undiscovered formula. */
  index: number;
  ingredientViews: readonly CraftingIngredientView[];
  outcome: AlchemyOutcomeView | null;
  eligibility: { available: boolean; reason: string | null };
}): string[] {
  if (!input.known) {
    return [
      `未识药方 ${input.index}`,
      '尚未掌握此方',
      input.recipe.discoveryHint,
      '与江湖人物交谈、留心见闻，或许能找到传授药方的人。',
    ];
  }
  const blocks = [
    input.recipe.name,
    input.recipe.description,
    `药材\n${materialLines(input.ingredientViews).join('\n')}`,
  ];
  if (input.outcome !== null) {
    blocks.push(`悟性与成药\n悟性决定品质 · 当前${input.outcome.qualityName}「${input.outcome.itemName}」\n恢复气血 ${input.outcome.healthRestore}　·　恢复内力 ${input.outcome.qiRestore}\n${input.outcome.description}`);
  } else {
    blocks.push('悟性与成药\n当前品质的药品资料暂不可用');
  }
  blocks.push(input.eligibility.available ? '材料与工钱齐备，可以开炉。' : input.eligibility.reason ?? '当前无法炼药。');
  return blocks;
}

export interface ForgeResultView {
  name: string;
  statsLine: string;
  description: string;
}

/** Blank-line-separated detail blocks for one forge recipe, lossless. */
export function buildForgeDetailBlocks(input: {
  recipe: EquipmentForgeRecipeData;
  ingredientViews: readonly CraftingIngredientView[];
  result: ForgeResultView | null;
  eligibility: { available: boolean; reason: string | null };
}): string[] {
  const blocks = [
    input.recipe.name,
    input.recipe.description,
    `投入\n${materialLines(input.ingredientViews).join('\n')}`,
  ];
  if (input.result !== null) {
    blocks.push(`产出预览\n${input.result.name}\n${input.result.statsLine}\n${input.result.description}`);
  } else {
    blocks.push('产出预览\n产物资料当前不可用');
  }
  blocks.push(input.eligibility.available ? '条件齐备，可以锻造。' : input.eligibility.reason ?? '当前无法锻造。');
  return blocks;
}

/** A receipt distinguishes the craft settlement from later quest/achievement effects. */
export function craftingReceipt(action: '炼成' | '锻成', resultName: string, craftBalance: number, currentBalance: number): string {
  const extra = currentBalance - craftBalance;
  return extra === 0
    ? `已${action}「${resultName}」，当前银两 ${currentBalance}。`
    : `已${action}「${resultName}」；工钱结算后 ${craftBalance}，随后变化 ${extra > 0 ? '+' : ''}${extra}，当前银两 ${currentBalance}。`;
}
