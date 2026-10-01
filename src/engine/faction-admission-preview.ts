import type { CharacterState, FactionData, MartialArtData } from './character-progression';
import { checkFactionAdmission, type FactionMembership } from './faction-system';
import { projectFactionDeparture } from './faction-departure';
import type { QuestData, QuestJournal } from './quest-system';
import type { SocialState } from './social-state';

export interface FactionAdmissionPreview {
  factionId: string;
  isCurrent: boolean;
  basis: 'current' | 'after-departure';
  morality: number;
  renown: number;
  unavailableReason?: string;
  mentors: { npcId: string; eligible: boolean; reasons: string[] }[];
}

/** Advisory only: no departure, admission, relationship or quest mutation. */
export function projectFactionAdmissions(input: {
  factions: ReadonlyMap<string, FactionData>;
  membership: FactionMembership | null;
  character: Readonly<CharacterState> | null;
  social: Readonly<SocialState>;
  martialArts: ReadonlyMap<string, MartialArtData>;
  quests: ReadonlyMap<string, QuestData>;
  journal: Readonly<QuestJournal>;
}): Map<string, FactionAdmissionPreview> {
  let social = input.social;
  let character = input.character;
  let unavailableReason: string | undefined;
  const basis = input.membership === null ? 'current' : 'after-departure';
  if (input.membership !== null) {
    const current = input.factions.get(input.membership.factionId);
    if (current === undefined) unavailableReason = '当前师门资料不可用，无法估算退派后资格';
    else if (!current.departure.allowed) unavailableReason = '当前门规不允许退派，不能按无师门身份估算改投';
    else {
      const departure = projectFactionDeparture(current, input.social, input.character, input.martialArts);
      const factionRenown = new Map(input.social.factionRenown);
      factionRenown.set(current.id, departure.factionRenown);
      social = { ...input.social, morality: departure.morality, renown: departure.renown, factionRenown };
      if (character !== null) character = { ...character, martialArtIds: character.martialArtIds.filter(id => !departure.forgottenArtIds.includes(id)) };
    }
  }
  return new Map([...input.factions].map(([id, faction]) => {
    const isCurrent = input.membership?.factionId === id;
    const preview: FactionAdmissionPreview = {
      factionId: id, isCurrent, basis,
      morality: isCurrent ? input.social.morality : social.morality,
      renown: isCurrent ? input.social.renown : social.renown,
      ...(unavailableReason === undefined || isCurrent ? {} : { unavailableReason }),
      mentors: isCurrent || unavailableReason !== undefined ? [] : faction.mentorNpcIds.map(npcId => ({
        npcId, ...checkFactionAdmission({ faction, speakerNpcId: npcId, membership: null,
          character, social, quests: input.quests, journal: input.journal }),
      })),
    };
    return [id, preview];
  }));
}
