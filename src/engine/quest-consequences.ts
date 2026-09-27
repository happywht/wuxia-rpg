/** Phaser-free application of optional quest rewards to social and lore state. */

import {
  adjustFactionRenown,
  type SocialState,
} from './social-state';
import type { QuestRewardGrant } from './quest-system';

export interface QuestFactionRenownChange {
  factionId: string;
  delta: number;
  value: number;
}

export interface QuestRewardConsequenceResult {
  factionRenown: readonly QuestFactionRenownChange[];
  discoveredKnowledgeNodeIds: readonly string[];
}

/**
 * Applies authored social/lore consequences from one completion grant.
 * Callers receive only first discoveries; task state transitions guarantee
 * that a reward grant is emitted once when the status first becomes complete.
 */
export function applyQuestRewardConsequences(
  grant: QuestRewardGrant,
  social: SocialState,
  knownKnowledgeNodeIds: Set<string>,
): QuestRewardConsequenceResult {
  const factionRenown = (grant.factionRenown ?? []).map((reward) => ({
    factionId: reward.factionId,
    delta: reward.delta,
    value: adjustFactionRenown(social, reward.factionId, reward.delta),
  }));
  const discoveredKnowledgeNodeIds: string[] = [];
  for (const nodeId of grant.discoverKnowledgeNodeIds ?? []) {
    if (knownKnowledgeNodeIds.has(nodeId)) continue;
    knownKnowledgeNodeIds.add(nodeId);
    discoveredKnowledgeNodeIds.push(nodeId);
  }
  return { factionRenown, discoveredKnowledgeNodeIds };
}
