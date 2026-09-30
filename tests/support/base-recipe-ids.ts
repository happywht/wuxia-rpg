import { readFileSync } from 'node:fs';
/** Whole-world fixtures must provide the same crafting catalogue as world-loader. */
export const baseRecipeIds = new Set<string>([
  'forges/round-24-equipment-forges.json', 'alchemy/round-25-alchemy.json',
].flatMap(path => (JSON.parse(readFileSync(new URL(`../../data/base/${path}`, import.meta.url), 'utf8')).recipes as { id: string }[]).map(recipe => recipe.id)));
