import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  arenaOpponentAsEncounter,
  parseArenaSet,
  parseArenaRecords,
  resolveArenaAttemptPayout,
} from '../src/engine/arena-challenge';
import {
  createCharacterState,
  parseCharacterProfileSet,
  parseMartialArtSet,
} from '../src/engine/character-progression';
import { parseBattleEncounterSet, CombatSession } from '../src/engine/turn-based-combat';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

describe('Round 45 combat and reward balance', () => {
  it('reads the two-round arena experience and resolves its first-clear prize from data', () => {
    const parsed = parseArenaSet(readJson('../data/base/arenas/round-20-arenas.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const arena = parsed.set.arenas[0];
    expect(arena).toBeDefined();

    expect(resolveArenaAttemptPayout(arena!, 0, true)).toEqual({
      firstChampionship: true,
      currency: 45,
      items: [{ itemId: 'item.qingxin-wan', quantity: 1 }],
    });
    expect(arena!.opponents.reduce((sum, opponent) => sum + opponent.victoryExperience, 0)).toBe(40);
  });

  it('pays neither partial attempts nor repeat championships, while legacy championship records remain sufficient', () => {
    const parsed = parseArenaSet(readJson('../data/base/arenas/round-20-arenas.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const arena = parsed.set.arenas[0]!;

    expect(resolveArenaAttemptPayout(arena, 0, false)).toEqual({
      firstChampionship: false,
      currency: 0,
      items: [],
    });
    expect(resolveArenaAttemptPayout(arena, 1, true)).toEqual({
      firstChampionship: false,
      currency: 0,
      items: [],
    });
    const legacyChampion = { arenaId: arena.id, attempts: 3, bestWins: 2, championships: 2, lastWins: 2 };
    expect(parseArenaRecords([legacyChampion])).toEqual([legacyChampion]);
    expect(resolveArenaAttemptPayout(arena, legacyChampion.championships, true).firstChampionship).toBe(false);
  });

  it('keeps per-round arena XP attached to real combat wins while withholding repeat cash and item prizes', () => {
    const parsed = parseArenaSet(readJson('../data/base/arenas/round-20-arenas.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const arena = parsed.set.arenas[0]!;

    for (const opponent of arena.opponents) {
      expect(opponent.victoryExperience).toBeGreaterThan(0);
      expect(arenaOpponentAsEncounter(arena, opponent, arena.profileId).victoryExperience).toBe(opponent.victoryExperience);
    }
  });

  it('keeps the opening fixed encounter beatable with the declared starting arts and no companion', () => {
    const profiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
    const arts = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
    const encounters = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
    expect(profiles.ok && arts.ok && encounters.ok).toBe(true);
    if (!profiles.ok || !arts.ok || !encounters.ok) throw new Error('基础战斗资料未通过解析');

    const profile = profiles.set.profiles[0]!;
    const encounter = encounters.set.encounters.find((entry) => entry.id === 'encounter.alley-blade-bully');
    expect(encounter).toBeDefined();
    const player = createCharacterState(profile);
    const session = new CombatSession({
      encounter: encounter!,
      profile,
      player,
      martialArts: new Map(arts.set.martialArts.map((art) => [art.id, art])),
    });

    let turns = 0;
    while (!session.isOver && turns < 20) {
      expect(session.playerUse('skill.jianghu-sanshou').ok).toBe(true);
      turns += 1;
    }
    expect(session.finalResult?.outcome).toBe('victory');
    expect(session.finalResult?.experienceGained).toBe(encounter!.victoryExperience);
    expect(turns).toBe(5);
    expect(player.health).toEqual({ current: 29, max: 101 });
  });
});
