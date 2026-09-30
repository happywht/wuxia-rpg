/** Static purchase/crafting ledger from authored records, not a gameplay claim. */
import { readFile, readdir } from 'node:fs/promises';
const base = new URL('../data/base/', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, base), 'utf8'));
const items = new Map((await read('items/round-06-items.json')).items.map(i => [i.id, i]));
const shops = (await Promise.all((await readdir(new URL('shops/', base))).filter(n => n.endsWith('.json')).map(n => read(`shops/${n}`)))).flatMap(s => s.shops);
const forge = await read('forges/round-24-equipment-forges.json');
const alchemy = await read('alchemy/round-25-alchemy.json');
const sellers = id => shops.flatMap(shop => shop.stock.filter(s => s.itemId === id && s.quantity !== 0).map(s => ({ name: shop.name, quantity: s.quantity })));
function acquireCost(id, seen = new Set()) {
  if (sellers(id).length) return items.get(id).buyPrice;
  if (seen.has(id)) throw new Error(`配方循环 ${id}`);
  const recipe = forge.recipes.find(r => r.resultItemId === id);
  if (!recipe) throw new Error(`没有交易或上游制作来源 ${id}`);
  const next = new Set([...seen, id]);
  return recipe.currencyCost + recipe.ingredients.reduce((sum, i) => sum + acquireCost(i.itemId, next) * i.quantity, 0);
}
console.log('# 制作经济静态账本（Round104）\n\n按当前购买标价从零获得全部投入，上级成器若未出售则递归制作；不扣任务赠品，不含额外治疗。有限库存和已装备投入仍受运行时限制。重复挑战只给经验，不凭空算银两。\n');
console.log('| 配方 | 投入与来源 | 工钱 | 从零购料/逐级制作总成本 | 成品在姜百味处返售价 |\n| --- | --- | --- | --- | --- |');
for (const recipe of [...forge.recipes, ...alchemy.recipes]) {
  const cost = recipe.currencyCost + recipe.ingredients.reduce((sum, i) => sum + acquireCost(i.itemId) * i.quantity, 0);
  const inputs = recipe.ingredients.map(i => `${items.get(i.itemId).name}×${i.quantity}（${sellers(i.itemId).map(s => `${s.name}${s.quantity === -1 ? '常备' : `限${s.quantity}`}`).join('、') || '上游锻造'}）`).join('；');
  const results = recipe.outcomes?.map(o => o.resultItemId) ?? [recipe.resultItemId];
  const refunds = results.map(id => Math.floor(items.get(id).sellPrice * shops[0].sellRate));
  if (refunds.some(refund => refund >= cost)) throw new Error(`制作返售不应覆盖全部购买成本 ${recipe.id}`);
  console.log(`| ${recipe.name} | ${inputs} | ${recipe.currencyCost} | ${cost} | ${refunds.join('/')} |`);
}
console.log('\n九项锻造/三项炼药均有交易或上游制作来源；此表不证明有限库存已耗尽的旧档仍能做所有配方。Round104仅将两条实践所需青铜笔剑改常备，其他有限货物仍照常耗尽。');
