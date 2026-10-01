import type { CharacterState, FactionData, MartialArtData } from './character-progression';
import {
  clampSocialValue, getFactionRenown, MORALITY_RANGE, RENOWN_RANGE,
  FACTION_RENOWN_RANGE, type SocialState,
} from './social-state';

/** Read-only projection shared by the option preview and transaction settlement. */
export function projectFactionDeparture(
  faction: Readonly<FactionData>, social: Readonly<SocialState>,
  character: Readonly<CharacterState> | null, arts: ReadonlyMap<string, MartialArtData>,
) {
  const forgottenArtIds = faction.departure.forgetFactionMartialArts
    ? (character?.martialArtIds ?? []).filter(id => arts.get(id)?.factionIds.includes(faction.id))
    : [];
  return {
    morality: clampSocialValue(social.morality + faction.departure.moralityDelta, MORALITY_RANGE),
    renown: clampSocialValue(social.renown + faction.departure.renownDelta, RENOWN_RANGE),
    factionRenown: clampSocialValue(getFactionRenown(social, faction.id) + faction.departure.factionRenownDelta, FACTION_RENOWN_RANGE),
    forgottenArtIds,
  };
}

export function describeFactionDeparture(
  faction: Readonly<FactionData>, social: Readonly<SocialState>,
  character: Readonly<CharacterState> | null, arts: ReadonlyMap<string, MartialArtData>,
): string {
  const projected = projectFactionDeparture(faction, social, character, arts);
  const artConsequence = projected.forgottenArtIds.length > 0
    ? `遗忘武学：${projected.forgottenArtIds.map(id => arts.get(id)?.name ?? id).join('、')}`
    : faction.departure.forgetFactionMartialArts
      ? '遗忘本门武学（当前没有已学本门武学）' : '已学武学保留';
  return `退派当步预览「${faction.name}」：善恶 ${social.morality}→${projected.morality}；江湖声望 ${social.renown}→${projected.renown}；本门声望 ${getFactionRenown(social, faction.id)}→${projected.factionRenown}；${artConsequence}。尚未执行，Esc 可取消。`;
}
