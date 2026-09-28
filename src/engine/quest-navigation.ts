/**
 * Round 60 quest-objective navigation protocol: Phaser-free resolution of an
 * active quest's next unfinished spatial objective into a concrete map cell.
 *
 * The resolver knows only the *shape* of the assembled data — quest journals,
 * NPC placements, encounters and the world atlas all arrive as arguments, so
 * no character, place or story content may live here (see docs/ARCHITECTURE.md).
 *
 * Resolution is intentionally ephemeral: callers re-run it whenever the clock
 * period, an NPC schedule or quest progress changes, and the returned target
 * id is a runtime-only, namespaced key that must never be persisted.
 */

import type { PlacedNpc } from './npc-placement';
import type { QuestData, QuestJournal } from './quest-system';
import type { PlacedEncounter } from './turn-based-combat';
import type { WorldMapAssembly } from './world-map';

/** Prefix shared by every runtime quest-objective destination id. */
export const QUEST_NAVIGATION_ID_PREFIX = 'quest:';

/** Objective kinds whose target resolves to a position on some map. */
export type SpatialQuestObjectiveKind = 'talkToNpc' | 'defeatEncounter' | 'discoverKnowledge';

/** One resolved, navigable quest objective target. */
export interface QuestNavigationTarget {
  /** Runtime-only destination selector, stable while this quest advances. */
  id: string;
  questId: string;
  objectiveId: string;
  kind: SpatialQuestObjectiveKind;
  /** Data-driven display name (NPC/encounter name or knowledge node title). */
  name: string;
  /** Objective text as authored in the quest set. */
  objectiveText: string;
  mapResourceId: string;
  col: number;
  row: number;
  /** Exact for discovery events; adjacent for NPCs/encounters. */
  approachRadius: number;
  /** Stable landmark id when a discovery target coincides with a world landmark. */
  landmarkId?: string;
}

export type QuestNavigationNoTargetReason =
  | 'unknown-quest'
  | 'not-active'
  /** Every unfinished objective is non-spatial (e.g. collect-only quests). */
  | 'no-spatial-objective'
  /** A spatial objective exists but its referenced data is currently missing. */
  | 'unresolved-target';

export type QuestNavigationResult =
  | { status: 'target'; target: QuestNavigationTarget }
  | { status: 'no-target'; reason: QuestNavigationNoTargetReason };

export interface QuestNavigationInput {
  quests: ReadonlyMap<string, QuestData>;
  journal: QuestJournal;
  questId: string;
  worldMap: WorldMapAssembly;
  /** Validated base placements across every map (schedule fallback). */
  baseNpcs: readonly PlacedNpc[];
  /** Compiled placements for the current calendar period across every map. */
  periodNpcs: readonly PlacedNpc[];
  /** Live placements on the current map; preferred for same-map NPC targets. */
  currentMapNpcs?: readonly PlacedNpc[];
  /** Validated encounters across every map, as assembled by the loader. */
  encounters: readonly PlacedEncounter[];
  /** Knowledge node titles for readable discovery-target names. */
  knowledgeNodeTitles?: ReadonlyMap<string, string>;
}

/** Builds the runtime-only selector stable across objective progression. */
export function questNavigationTargetId(questId: string): string {
  return `${QUEST_NAVIGATION_ID_PREFIX}${questId}`;
}

interface NpcPosition {
  mapResourceId: string;
  col: number;
  row: number;
  name: string;
}

/**
 * Finds one NPC's live cell: current-map runtime placements win over the
 * compiled period set, which wins over the stable base record. Returning null
 * (instead of guessing a static coordinate) keeps the caller honest when the
 * referenced NPC is not part of any assembled placement.
 */
function resolveNpcPosition(
  input: QuestNavigationInput,
  npcId: string,
): NpcPosition | null {
  const live = input.currentMapNpcs?.find((npc) => npc.record.id === npcId);
  if (live !== undefined) {
    return {
      mapResourceId: live.record.mapResourceId,
      col: live.col,
      row: live.row,
      name: live.record.name,
    };
  }
  const scheduled = input.periodNpcs.find((npc) => npc.record.id === npcId);
  const npc = scheduled ?? input.baseNpcs.find((candidate) => candidate.record.id === npcId);
  if (npc === undefined) return null;
  return {
    mapResourceId: npc.record.mapResourceId,
    col: npc.col,
    row: npc.row,
    name: npc.record.name,
  };
}

/**
 * Resolves a discoverKnowledge objective against the validated world atlas:
 * the first authored map event that teaches the node wins (events are the
 * actual trigger), then a discovery-gated landmark pinned to the same node.
 */
function resolveKnowledgePosition(
  input: QuestNavigationInput,
  nodeId: string,
): { mapResourceId: string; col: number; row: number; name: string; landmarkId?: string } | null {
  const event = input.worldMap.events.find(
    (candidate) => candidate.discoverKnowledgeNodeId === nodeId,
  );
  if (event !== undefined) {
    const landmark = input.worldMap.landmarks.find(
      (candidate) =>
        candidate.discoveryNodeId === nodeId &&
        candidate.mapResourceId === event.mapResourceId &&
        candidate.col === event.col && candidate.row === event.row,
    );
    return {
      mapResourceId: event.mapResourceId,
      col: event.col,
      row: event.row,
      name: input.knowledgeNodeTitles?.get(nodeId) ?? landmark?.name ?? nodeId,
      ...(landmark === undefined ? {} : { landmarkId: landmark.id }),
    };
  }
  const landmark = input.worldMap.landmarks.find(
    (candidate) => candidate.discoveryNodeId === nodeId,
  );
  if (landmark === undefined) return null;
  return {
    mapResourceId: landmark.mapResourceId,
    col: landmark.col,
    row: landmark.row,
    name: input.knowledgeNodeTitles?.get(nodeId) ?? landmark.name,
    landmarkId: landmark.id,
  };
}

/**
 * Resolves the next unfinished spatial objective of an active quest in
 * declaration order. Non-spatial collect objectives are skipped without
 * fabricating coordinates; a quest whose remaining goals are all collect-only
 * (or whose spatial target is missing from the assembled data) reports a
 * readable no-target reason instead of guessing.
 */
export function resolveQuestNavigationTarget(input: QuestNavigationInput): QuestNavigationResult {
  const quest = input.quests.get(input.questId);
  const state = input.journal.states.get(input.questId);
  if (quest === undefined || state === undefined) {
    return { status: 'no-target', reason: 'unknown-quest' };
  }
  if (state.status !== 'active') {
    return { status: 'no-target', reason: 'not-active' };
  }

  const objective = quest.objectives.find((candidate) => {
    if (candidate.kind === 'collectItem') return false;
    const current = state.objectiveCounts.get(candidate.id) ?? 0;
    return current < candidate.requiredCount;
  });
  if (objective === undefined || objective.kind === 'collectItem') {
    return { status: 'no-target', reason: 'no-spatial-objective' };
  }

  const id = questNavigationTargetId(quest.id);
  if (objective.kind === 'talkToNpc') {
    const npc = resolveNpcPosition(input, objective.targetId);
    if (npc === null) return { status: 'no-target', reason: 'unresolved-target' };
    return {
      status: 'target',
      target: {
        id,
        questId: quest.id,
        objectiveId: objective.id,
        kind: objective.kind,
        name: npc.name,
        objectiveText: objective.text,
        mapResourceId: npc.mapResourceId,
        col: npc.col,
        row: npc.row,
        approachRadius: 1,
      },
    };
  }
  if (objective.kind === 'defeatEncounter') {
    const encounter = input.encounters.find(
      (candidate) => candidate.record.id === objective.targetId,
    );
    if (encounter === undefined) return { status: 'no-target', reason: 'unresolved-target' };
    return {
      status: 'target',
      target: {
        id,
        questId: quest.id,
        objectiveId: objective.id,
        kind: objective.kind,
        name: encounter.record.name,
        objectiveText: objective.text,
        mapResourceId: encounter.record.mapResourceId,
        col: encounter.record.position.col,
        row: encounter.record.position.row,
        approachRadius: 1,
      },
    };
  }
  const knowledge = resolveKnowledgePosition(input, objective.targetId);
  if (knowledge === null) return { status: 'no-target', reason: 'unresolved-target' };
  return {
    status: 'target',
    target: {
      id,
      questId: quest.id,
      objectiveId: objective.id,
      kind: objective.kind,
      name: knowledge.name,
      objectiveText: objective.text,
      mapResourceId: knowledge.mapResourceId,
      col: knowledge.col,
      row: knowledge.row,
      approachRadius: 0,
      ...(knowledge.landmarkId === undefined ? {} : { landmarkId: knowledge.landmarkId }),
    },
  };
}
