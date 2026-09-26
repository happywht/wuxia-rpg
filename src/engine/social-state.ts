/**
 * Round 08 social state: Phaser-free scalar morality / renown values plus
 * one relationship value per NPC, each with an explicit protocol range and
 * boundary clamping.
 *
 * The module knows only the numeric protocol — what "morality" or "renown"
 * *means* in the world is authored in dialogue JSON effects, and every
 * visible consequence line stays out of here (see docs/ARCHITECTURE.md).
 * Values live in memory for the current run only; persistence is Round 09.
 * Unified faction-level renown rules arrive in Round 18 — this module keeps
 * a single global scalar until then.
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

/** Relationship: how one specific NPC feels about the player. */
export const RELATIONSHIP_RANGE: SocialRange = { min: -100, max: 100 };

/** Runtime-only social state; reset when the current game page refreshes. */
export interface SocialState {
  morality: number;
  renown: number;
  /** NPC id → relationship value; unknown NPCs read as 0. */
  relationships: Map<string, number>;
}

/** Creates the social state every fresh run starts from (all zeros). */
export function createSocialState(): SocialState {
  return { morality: 0, renown: 0, relationships: new Map() };
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

/** Shifts morality by `delta` and returns the clamped new value. */
export function adjustMorality(state: SocialState, delta: number): number {
  state.morality = clampSocialValue(state.morality + delta, MORALITY_RANGE);
  return state.morality;
}

/** Shifts renown by `delta` and returns the clamped new value. */
export function adjustRenown(state: SocialState, delta: number): number {
  state.renown = clampSocialValue(state.renown + delta, RENOWN_RANGE);
  return state.renown;
}

/** Shifts the relationship with `npcId` by `delta`, returning the new value. */
export function adjustRelationship(state: SocialState, npcId: string, delta: number): number {
  const next = clampSocialValue(getRelationship(state, npcId) + delta, RELATIONSHIP_RANGE);
  state.relationships.set(npcId, next);
  return next;
}
