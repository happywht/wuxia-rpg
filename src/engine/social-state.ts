/**
 * Phaser-free social values: morality, personal renown, per-faction renown
 * and per-NPC relationships. Every change uses the same signed-delta and
 * boundary-clamping rules; values remain independent by scope.
 *
 * The module knows only the numeric protocol — what "morality" or "renown"
 * *means* in the world is authored in dialogue JSON effects, and every
 * visible consequence line stays out of here (see docs/ARCHITECTURE.md).
 * Values live in memory during play; the save engine serializes maps as
 * JSON-safe entry arrays.
 */

/** Inclusive protocol range of one social scalar. */
export interface SocialRange {
  min: number;
  max: number;
}

/** Morality: positive = benevolent repute, negative = notorious repute. */
export const MORALITY_RANGE: SocialRange = { min: -100, max: 100 };

/** Renown: how widely the player's deeds are known (never negative). */
export const RENOWN_RANGE: SocialRange = { min: 0, max: 1000 };

/** Faction standing is independent for every faction but shares the renown range. */
export const FACTION_RENOWN_RANGE: SocialRange = { min: 0, max: 1000 };

/** Relationship: how one specific NPC feels about the player. */
export const RELATIONSHIP_RANGE: SocialRange = { min: -100, max: 100 };

/** A signed change in one of the four social scopes. */
export type SocialChange =
  | { kind: 'morality'; delta: number }
  | { kind: 'renown'; delta: number }
  | { kind: 'factionRenown'; factionId: string; delta: number }
  | { kind: 'relationship'; npcId: string; delta: number };

/** Runtime social values; the save protocol stores them without Map objects. */
export interface SocialState {
  morality: number;
  renown: number;
  /** Faction id → local standing; absent factions read as neutral (0). */
  factionRenown: Map<string, number>;
  /** NPC id → relationship value; unknown NPCs read as 0. */
  relationships: Map<string, number>;
}

/** Creates the social state every fresh run starts from (all zeros). */
export function createSocialState(): SocialState {
  return { morality: 0, renown: 0, factionRenown: new Map(), relationships: new Map() };
}

/** Clamps `value` into `range` (dialogue deltas may overshoot by design). */
export function clampSocialValue(value: number, range: SocialRange): number {
  if (!Number.isFinite(value)) {
    return range.min;
  }
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/** Current relationship with `npcId`; unmet NPCs count as neutral (0). */
export function getRelationship(state: Readonly<SocialState>, npcId: string): number {
  return state.relationships.get(npcId) ?? 0;
}

/** Current standing with `factionId`; an untouched faction starts neutral. */
export function getFactionRenown(state: Readonly<SocialState>, factionId: string): number {
  return state.factionRenown.get(factionId) ?? 0;
}

/** Applies one scoped signed delta with the range assigned to that scope. */
export function applySocialChange(state: SocialState, change: SocialChange): number {
  switch (change.kind) {
    case 'morality':
      state.morality = clampSocialValue(state.morality + change.delta, MORALITY_RANGE);
      return state.morality;
    case 'renown':
      state.renown = clampSocialValue(state.renown + change.delta, RENOWN_RANGE);
      return state.renown;
    case 'factionRenown': {
      const next = clampSocialValue(getFactionRenown(state, change.factionId) + change.delta, FACTION_RENOWN_RANGE);
      state.factionRenown.set(change.factionId, next);
      return next;
    }
    case 'relationship': {
      const next = clampSocialValue(getRelationship(state, change.npcId) + change.delta, RELATIONSHIP_RANGE);
      state.relationships.set(change.npcId, next);
      return next;
    }
  }
}

/** Applies authored changes in order; transactionality is provided by callers using staged state. */
export function applySocialChanges(state: SocialState, changes: readonly SocialChange[]): number[] {
  return changes.map((change) => applySocialChange(state, change));
}

/** Shifts morality by `delta` and returns the clamped new value. */
export function adjustMorality(state: SocialState, delta: number): number {
  return applySocialChange(state, { kind: 'morality', delta });
}

/** Shifts renown by `delta` and returns the clamped new value. */
export function adjustRenown(state: SocialState, delta: number): number {
  return applySocialChange(state, { kind: 'renown', delta });
}

/** Shifts standing with one faction without changing the player's global renown. */
export function adjustFactionRenown(state: SocialState, factionId: string, delta: number): number {
  return applySocialChange(state, { kind: 'factionRenown', factionId, delta });
}

/** Shifts the relationship with `npcId` by `delta`, returning the new value. */
export function adjustRelationship(state: SocialState, npcId: string, delta: number): number {
  return applySocialChange(state, { kind: 'relationship', npcId, delta });
}
