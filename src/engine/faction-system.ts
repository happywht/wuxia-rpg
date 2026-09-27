/**
 * Phaser-free faction membership rules. Faction definitions and all thresholds
 * come from data; this module only evaluates the shared admission protocol and
 * owns the player's single active master/faction relationship.
 */

import type { CharacterState, FactionData } from './character-progression';
import type { QuestData, QuestJournal } from './quest-system';
import { getFactionRenown, getRelationship, type SocialState } from './social-state';

export interface FactionMembership {
  factionId: string;
  masterNpcId: string;
}

/** Stable object identity lets dialogue transactions commit in place. */
export interface FactionMembershipState {
  membership: FactionMembership | null;
}

export function createFactionMembershipState(membership: FactionMembership | null = null): FactionMembershipState {
  return { membership: membership === null ? null : { ...membership } };
}

export interface FactionAdmissionQuery {
  faction: FactionData;
  speakerNpcId: string;
  membership: FactionMembership | null;
  character: Readonly<CharacterState> | null;
  social: Readonly<SocialState>;
  quests: ReadonlyMap<string, QuestData>;
  journal: Readonly<QuestJournal>;
}

export interface FactionAdmissionResult {
  eligible: boolean;
  reasons: string[];
}

/** Checks every authored admission rule and confirms this speaker may mentor. */
export function checkFactionAdmission(query: FactionAdmissionQuery): FactionAdmissionResult {
  const { faction, speakerNpcId, membership, character, social, quests, journal } = query;
  const reasons: string[] = [];
  if (membership !== null) reasons.push(`已属于其他门派（${membership.factionId}），请先处理当前师门关系`);
  if (!faction.mentorNpcIds.includes(speakerNpcId)) reasons.push('当前对话对象不是该门派登记的师父');
  if (character === null) reasons.push('当前没有可拜师的角色');

  const admission = faction.admission;
  if (character !== null) {
    if (admission.minimumLevel !== undefined && character.level < admission.minimumLevel) {
      reasons.push(`等级需达到 ${admission.minimumLevel}（当前 ${character.level}）`);
    }
    for (const [attributeId, minimum] of Object.entries(admission.minimumAttributes)) {
      const actual = character.attributes[attributeId as keyof typeof character.attributes];
      if (actual < minimum) reasons.push(`${attributeId} 需达到 ${minimum}（当前 ${actual}）`);
    }
  }
  if (admission.minimumMorality !== undefined && social.morality < admission.minimumMorality) {
    reasons.push(`善恶值需达到 ${admission.minimumMorality}（当前 ${social.morality}）`);
  }
  if (admission.maximumMorality !== undefined && social.morality > admission.maximumMorality) {
    reasons.push(`善恶值不得高于 ${admission.maximumMorality}（当前 ${social.morality}）`);
  }
  if (admission.minimumRenown !== undefined && social.renown < admission.minimumRenown) {
    reasons.push(`江湖声望需达到 ${admission.minimumRenown}（当前 ${social.renown}）`);
  }
  if (admission.minimumFactionRenown !== undefined) {
    const factionRenown = getFactionRenown(social, faction.id);
    if (factionRenown < admission.minimumFactionRenown) {
      reasons.push(`本门声望需达到 ${admission.minimumFactionRenown}（当前 ${factionRenown}）`);
    }
  }
  if (
    admission.minimumTeacherRelationship !== undefined &&
    getRelationship(social, speakerNpcId) < admission.minimumTeacherRelationship
  ) {
    const relationship = getRelationship(social, speakerNpcId);
    reasons.push(`与师父的关系需达到 ${admission.minimumTeacherRelationship}（当前 ${relationship}）`);
  }
  for (const questId of admission.requiredQuestIds) {
    const quest = quests.get(questId);
    const state = journal.states.get(questId);
    if (quest === undefined || state === undefined) {
      reasons.push(`门派前置差事资料不可用：${questId}`);
    } else if (state.status !== 'completed') {
      reasons.push(`须先完成差事「${quest.name}」`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

export function setFactionMembership(
  state: FactionMembershipState,
  factionId: string,
  masterNpcId: string,
): void {
  state.membership = { factionId, masterNpcId };
}

export function clearFactionMembership(state: FactionMembershipState): FactionMembership | null {
  const previous = state.membership;
  state.membership = null;
  return previous === null ? null : { ...previous };
}
