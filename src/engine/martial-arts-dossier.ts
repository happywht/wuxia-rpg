import { checkMartialArtEligibility, type CharacterState, type FactionData, type MartialArtData } from './character-progression';

export interface MartialArtsDossierInput {
  character: Readonly<CharacterState> | null;
  factionId: string | null;
  factions: ReadonlyMap<string, FactionData>;
  martialArts: ReadonlyMap<string, MartialArtData>;
}

const attributes: Record<string, string> = { body: '体魄', force: '力道', agility: '身法', insight: '悟性', resolve: '定力' };

/** Read-only snapshot. Eligibility is teaching eligibility, not learned ownership. */
export function buildMartialArtsDossier(input: MartialArtsDossierInput): string[] {
  const { character, martialArts, factionId } = input;
  if (character === null) return ['角色资料暂不可用。'];
  const learned = new Set(character.martialArtIds);
  const describe = (art: MartialArtData): string => {
    const action = art.combat;
    const effect = action.kind === 'attack'
      ? `攻：基础威力${action.power}；伤害=max(1,威力+自身力道−floor(敌体魄/3))。`
      : action.kind === 'heal'
        ? `养：回复${action.power}+自身定力/2向下取整生命，不超过上限；不回复内力。`
        : `守：下一次受击抵挡${action.power}伤害，仍至少受伤1；不是永久防御。`;
    const requirements = [`等级${art.requirements.level}`, ...Object.entries(art.requirements.attributes)
      .map(([id, value]) => `${attributes[id] ?? id}${value}`)].join('、');
    const factions = art.factionIds.length === 0 ? '通用'
      : art.factionIds.map(id => input.factions.get(id)?.name ?? id).join(' / ');
    const eligible = checkMartialArtEligibility(art, { level: character.level, attributes: character.attributes, factionId }).eligible;
    return `${art.name} · ${art.category} · ${learned.has(art.id) ? '已学' : eligible ? '未学：当前门槛达到，须找教习授艺' : '未学：尚未达到门槛'}\n${art.style}\n${art.description}\n耗气${action.qiCost}（每次行动）；${effect}\n学习门槛：${requirements}；${factions}。`;
  };
  const blocks = [`武学清单 · 等级${character.level} · 内力${character.qi.current}/${character.qi.max}\n${Object.entries(character.attributes).map(([id, value]) => `${attributes[id] ?? id}${value}`).join(' · ')}\n此页只查看，不授艺或消耗资源；招式参数来自当前资料，实际伤害还受敌人体魄、守御与战斗状态影响。`];
  blocks.push('已学招式');
  if (learned.size === 0) blocks.push('尚未学会招式。');
  for (const id of learned) {
    const art = martialArts.get(id);
    blocks.push(art === undefined ? `已学资料暂不可用（${id}）；本页不删除记录。` : describe(art));
  }
  const next = [...martialArts.values()].filter(art => !learned.has(art.id) &&
    (art.factionIds.length === 0 || (factionId !== null && art.factionIds.includes(factionId))));
  blocks.push('本门与通用的学习方向（门槛达到不等于已学，也不保证当前教习对白提供授艺）');
  if (next.length === 0) blocks.push('当前没有其他可列出的本门或通用招式。');
  for (const art of next) blocks.push(describe(art));
  return blocks;
}
