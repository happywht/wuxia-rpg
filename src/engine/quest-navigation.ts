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

import { UNLIMITED_STOCK, type AssembledShop, type ShopStockRuntime } from './item-system';
import type { PlacedNpc } from './npc-placement';
import type { QuestData, QuestJournal } from './quest-system';
import type { NavigationArrivalAction } from './world-navigation-guidance';
import type { PlacedEncounter } from './turn-based-combat';
import type { WorldMapAssembly } from './world-map';

/** Prefix shared by every runtime quest-objective destination id. */
export const QUEST_NAVIGATION_ID_PREFIX = 'quest:';

/** Objective kinds whose target resolves to a position on some map. */
export type SpatialQuestObjectiveKind =
  | 'talkToNpc'
  | 'defeatEncounter'
  | 'discoverKnowledge'
  | 'collectItem'
  | 'craftRecipe';

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
  /** Content-free control hint the HUD shows once the target is reached. */
  arrivalAction: NavigationArrivalAction;
  /** Stable landmark id when a discovery target coincides with a world landmark. */
  landmarkId?: string;
}

export type QuestNavigationNoTargetReason =
  | 'unknown-quest'
  | 'not-active'
  /** Every unfinished objective is non-spatial (e.g. non-map state goals). */
  | 'no-spatial-objective'
  /** A spatial objective exists but its referenced data is currently missing. */
  | 'unresolved-target'
  /** No assembled shop stocks the item a collect objective still needs. */
  | 'collect-item-not-stocked'
  /** Shops stock the item, but no available quantity covers the remaining need. */
  | 'collect-stock-insufficient';

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
  /** Real active follower; interaction uses the companion panel. */
  currentFollower?: PlacedNpc;
  /** Validated encounters across every map, as assembled by the loader. */
  encounters: readonly PlacedEncounter[];
  /** Knowledge node titles for readable discovery-target names. */
  knowledgeNodeTitles?: ReadonlyMap<string, string>;
  /** Assembled shops by id; collect objectives route to a stocked seller. */
  shops?: ReadonlyMap<string, AssembledShop>;
  /** Live per-shop stock; a shop without a runtime entry uses its shelf data. */
  shopStocks?: ReadonlyMap<string, ShopStockRuntime>;
  /** Map the player currently walks; same-map sellers win seller selection. */
  currentMapResourceId?: string;
  craftingStations?: readonly {
    record: { id: string; name: string; mapResourceId: string; position: { col: number; row: number } };
    recipes: readonly { id: string }[];
  }[];
}

/** Builds the runtime-only selector stable across objective progression. */
export function questNavigationTargetId(questId: string): string {
  return `${QUEST_NAVIGATION_ID_PREFIX}${questId}`;
}

/** Maps one spatial objective kind onto the generic arrival control hint. */
export function questObjectiveArrivalAction(kind: SpatialQuestObjectiveKind): NavigationArrivalAction {
  if (kind === 'talkToNpc') return 'talk';
  if (kind === 'defeatEncounter') return 'battle';
  if (kind === 'collectItem') return 'shop';
  if (kind === 'craftRecipe') return 'craft';
  return 'discover';
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
  const follower = input.currentFollower;
  const live = follower?.record.id === npcId ? follower : input.currentMapNpcs?.find((npc) => npc.record.id === npcId);
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

/** One stocked seller for a collect objective, resolved against live state. */
interface CollectSeller {
  shop: AssembledShop;
  npc: NpcPosition;
}

/**
 * Available units of `itemId` at one assembled shop: the live runtime stock
 * wins when the scene tracks purchases, otherwise the assembled shelf entry
 * stands in. `UNLIMITED_STOCK` (-1) passes every finite requirement; zero or
 * a missing shelf entry means the shop cannot serve the objective at all.
 */
function availableShopStock(
  input: QuestNavigationInput,
  shop: AssembledShop,
  itemId: string,
): number | null {
  const live = input.shopStocks?.get(shop.record.id)?.get(itemId);
  if (live !== undefined) return live;
  const shelf = shop.stock.find((entry) => entry.itemId === itemId);
  return shelf === undefined ? null : shelf.quantity;
}

/**
 * Resolves a collect objective's seller against the assembled shops. Among
 * shops that stock the item with enough available quantity, a seller on the
 * player's current map wins (declaration order breaks ties); otherwise the
 * first eligible shop in loaded world order is selected deterministically.
 * Precise reasons come back instead of a target whenever no seller qualifies,
 * so a coordinate is never fabricated for an item nobody can sell.
 */
function resolveCollectSeller(
  input: QuestNavigationInput,
  itemId: string,
  remaining: number,
): CollectSeller | 'collect-item-not-stocked' | 'collect-stock-insufficient' | 'unresolved-target' {
  const shops = input.shops;
  if (shops === undefined || shops.size === 0) return 'collect-item-not-stocked';

  let stockedAny = false;
  let enoughStockAny = false;
  let eligible: CollectSeller | null = null;
  let eligibleOtherMap: CollectSeller | null = null;
  for (const shop of shops.values()) {
    const available = availableShopStock(input, shop, itemId);
    if (available === null || available === 0) continue;
    stockedAny = true;
    if (available !== UNLIMITED_STOCK && available < remaining) continue;
    enoughStockAny = true;

    const npc = resolveNpcPosition(input, shop.record.npcId);
    if (npc === null) continue; // Unplaceable keeper: skip, other shops may serve.
    const seller = { shop, npc };
    if (input.currentMapResourceId === undefined ||
        npc.mapResourceId === input.currentMapResourceId) {
      // First declaration wins within each preference tier.
      if (eligible === null) eligible = seller;
    } else if (eligibleOtherMap === null) {
      eligibleOtherMap = seller;
    }
  }

  const selected = eligible ?? eligibleOtherMap;
  if (selected !== null) return selected;
  if (enoughStockAny) return 'unresolved-target';
  return stockedAny ? 'collect-stock-insufficient' : 'collect-item-not-stocked';
}

/**
 * Resolves the next unfinished spatial objective of an active quest in
 * declaration order. Collect objectives resolve to a real stocked seller's
 * keeper position (same-map shops preferred); a quest whose remaining goals
 * cannot be mapped to assembled data reports a readable, precise no-target
 * reason instead of guessing.
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
    const current = state.objectiveCounts.get(candidate.id) ?? 0;
    return current < candidate.requiredCount;
  });
  if (objective === undefined) {
    return { status: 'no-target', reason: 'no-spatial-objective' };
  }

  const id = questNavigationTargetId(quest.id);
  if (objective.kind === 'useItem' || objective.kind === 'equipItem') {
    return { status: 'no-target', reason: 'no-spatial-objective' };
  }
  if (objective.kind === 'craftRecipe') {
    const station = input.craftingStations?.find(entry => entry.recipes.some(recipe => recipe.id === objective.targetId));
    if (!station) return { status: 'no-target', reason: 'unresolved-target' };
    return { status: 'target', target: {
      id, questId: quest.id, objectiveId: objective.id, kind: objective.kind,
      name: station.record.name, objectiveText: objective.text,
      mapResourceId: station.record.mapResourceId,
      col: station.record.position.col, row: station.record.position.row,
      approachRadius: 1, arrivalAction: 'craft',
    } };
  }
  if (objective.kind === 'collectItem') {
    const current = state.objectiveCounts.get(objective.id) ?? 0;
    const seller = resolveCollectSeller(input, objective.targetId, objective.requiredCount - current);
    if (typeof seller === 'string') {
      return { status: 'no-target', reason: seller };
    }
    return {
      status: 'target',
      target: {
        id,
        questId: quest.id,
        objectiveId: objective.id,
        kind: objective.kind,
        name: seller.shop.record.name,
        objectiveText: objective.text,
        mapResourceId: seller.npc.mapResourceId,
        col: seller.npc.col,
        row: seller.npc.row,
        approachRadius: 1,
        arrivalAction: questObjectiveArrivalAction(objective.kind),
      },
    };
  }
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
        arrivalAction: input.currentFollower?.record.id === objective.targetId ? 'companion' : questObjectiveArrivalAction(objective.kind),
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
        arrivalAction: questObjectiveArrivalAction(objective.kind),
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
      arrivalAction: questObjectiveArrivalAction(objective.kind),
      ...(knowledge.landmarkId === undefined ? {} : { landmarkId: knowledge.landmarkId }),
    },
  };
}
