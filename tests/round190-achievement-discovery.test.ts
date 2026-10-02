import { describe, expect, it } from 'vitest';
import {
  createAchievementRunState,
  evaluateAchievements,
  parseAchievementSet,
  recordAchievementCounter,
} from '../src/engine/achievement-system';
import { readFileSync } from 'node:fs';

const achievementData = JSON.parse(readFileSync(
  new URL('../data/base/achievements/round-28-achievements.json', import.meta.url),
).toString()) as unknown;

function context(state = createAchievementRunState()) {
  return {
    character: { level: 1, unlockedMeridianNodeIds: [], martialArtIds: [] },
    customMartialArtCount: 0,
    questStatuses: new Map(),
    knownKnowledgeNodeIds: new Set(Array.from({ length: 64 }, (_, index) => `public.${index}`)),
    social: { morality: 0, renown: 0, factionRenown: new Map(), relationships: new Map(), npcKnowledge: new Map() },
    factionMembership: null,
    relationships: new Map(),
    arenaRecords: new Map(),
    state,
  };
}

describe('Round190 knowledge-discovery achievement semantics', () => {
  it('does not award 江湖百闻 for public knowledge supplied at new-game start', () => {
    const parsed = parseAchievementSet(achievementData);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = evaluateAchievements(parsed.set, context())
      .find((entry) => entry.achievement.id === 'achievement.river-of-stories');
    expect(row?.met).toBe(false);
    expect(row?.conditions[0]?.currentText).toBe('0');
  });

  it('awards progress only as first-time discoveries accumulate and persists the counter', () => {
    const parsed = parseAchievementSet(achievementData);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const state = recordAchievementCounter(createAchievementRunState(), 'discoveredKnowledge', 16);
    const row = evaluateAchievements(parsed.set, context(state))
      .find((entry) => entry.achievement.id === 'achievement.river-of-stories');
    expect(row?.met).toBe(true);
    expect(state.discoveredKnowledge).toBe(16);
  });
});
