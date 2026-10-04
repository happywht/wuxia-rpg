import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseItemSet, parseShopSet } from '../src/engine/item-system';
import { parseAlchemySet } from '../src/engine/alchemy-system';

const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const world = read('data/base/world/world-map.json') as {
  regionGuides: { mapResourceId: string; advice: string }[];
};
const town = world.regionGuides.find(row => row.mapResourceId === 'map.round-01-grid')!.advice;
const ferry = world.regionGuides.find(row => row.mapResourceId === 'map.round-10-mist-ferry')!.advice;

describe('Round271 departure preparation uses real local stock and recipe costs', () => {
  it('quotes the real medicine ingredients and labour before the player leaves town', () => {
    const parsed = parseAlchemySet(read('data/base/alchemy/round-25-alchemy.json'));
    if (!parsed.ok) throw Error('real alchemy data refused');
    const recipe = parsed.set.recipes.find(row => row.id === 'alchemy.recipe.shengji-san')!;
    expect(recipe.currencyCost).toBe(18);
    expect(recipe.ingredients).toEqual([
      { itemId: 'item.hanzhu-cao', quantity: 2 },
      { itemId: 'item.cangya-gen', quantity: 1 },
    ]);
    expect(town).toContain('寒珠草×2、苍崖根×3、无极丹×1');
    expect(town).toContain(`${recipe.currencyCost}银工钱`);
    expect(town).toContain('凉汤交出的四株不再留用');
    expect(ferry).toContain('清点苍崖根×3');
    expect(ferry).toContain('生肌散另耗寒珠草×2、根×1和18银');
  });

  it('names a real merchant with stock for the proposed materials', () => {
    const parsed = parseShopSet(read('data/base/shops/round-06-shops.json'));
    const itemSet = parseItemSet(read('data/base/items/round-06-items.json'));
    if (!parsed.ok || !itemSet.ok) throw Error('real shop/item data refused');
    const shop = parsed.set.shops.find(row => row.npcId === 'char.jiang-baiwei')!;
    for (const [itemId, needed] of [['item.hanzhu-cao', 2], ['item.cangya-gen', 3], ['item.wuji-dan', 1]] as const) {
      expect(shop.stock.some(row => row.itemId === itemId && (row.quantity === -1 || row.quantity >= needed))).toBe(true);
      expect(itemSet.set.items.some(row => row.id === itemId)).toBe(true);
    }
    expect(town).toContain('姜百味有售');
    expect(town).toContain('自用伤药');
    expect(town).toContain('E购料、F交付');
    expect(ferry).toContain('渡口无药铺');
  });
});
