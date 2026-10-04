import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CombatSession, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { createCharacterState, cumulativeExperienceForLevel, grantExperience, parseCharacterProfileSet, parseMartialArtSet } from '../src/engine/character-progression';
import { prowlerId, prowlerBehavior, repairProwler } from '../scripts/lib/round272-journey-facts.mjs';
const raw = readFileSync('data/base/battles/round-05-encounters.json', 'utf8');
const data = parseBattleEncounterSet(JSON.parse(raw));
const profiles = parseCharacterProfileSet(JSON.parse(readFileSync('data/base/characters/round-04-profiles.json', 'utf8')));
const skills = parseMartialArtSet(JSON.parse(readFileSync('data/base/skills/round-04-martial-arts.json', 'utf8')));
if (!data.ok || !profiles.ok || !skills.ok) throw Error('real combat data refused');
const encounter = data.set.encounters.find(e => e.id === prowlerId)!;
const profile = profiles.set.profiles[0]!;
const arts = new Map(skills.set.martialArts.map(a => [a.id, a]));
function run(level: number, guard: boolean) {
  const player = createCharacterState(profile);
  grantExperience(profile, player, cumulativeExperienceForLevel(profile, level));
  player.martialArtIds.push('skill.r32-yunyin-buyun-lu');
  const battle = new CombatSession({ encounter, profile, player, martialArts: arts });
  let turns = 0;
  while (!battle.isOver && turns < 30) {
    const action = guard && battle.enemyIntent?.includes('准备重击') ? 'skill.r32-yunyin-buyun-lu' : 'skill.jianghu-sanshou';
    expect(battle.playerUse(action).ok).toBe(true); turns++;
  }
  return { battle, player, turns };
}
describe('Round272 real mist-shore challenge', () => {
  it('threatens the player even at zero enemy qi, and has readable attack/heavy/recovery cues', () => {
    expect(encounter.enemy.health).toBe(72);
    expect(encounter.enemy.behavior).toEqual(prowlerBehavior);
    const player = createCharacterState(profile);
    grantExperience(profile, player, cumulativeExperienceForLevel(profile, 6));
    const start = player.health.current;
    const zeroQi = { ...encounter, enemy: { ...encounter.enemy, qi: 0 } };
    const battle = new CombatSession({ encounter: zeroQi, profile, player, martialArts: arts });
    expect(battle.enemyIntent).toContain('试你的距离');
    battle.playerWait();
    expect(player.health.current).toBeLessThan(start);
    expect(battle.enemyIntent).toContain('准备重击');
    expect(battle.enemyIntent).toContain('守御可卸蓄势');
    battle.playerWait();
    expect(battle.enemyIntent).toContain('暂露空隙');
    const beforeRest = player.health.current;
    battle.playerWait();
    expect(player.health.current).toBe(beforeRest);
    expect(battle.enemyView.qi.current).toBe(0); // zero starting qi also means zero maximum
    const bounded = new CombatSession({ encounter, profile, player: createCharacterState(profile), martialArts: arts });
    bounded.playerWait(); bounded.playerWait(); bounded.playerWait();
    expect(bounded.enemyView.qi.current).toBe(8); // recovery respects the real enemy's cap
  });
  for (const level of [4, 6]) it(`level ${level}: guard trades turns and qi for less injury against the same real challenge`, () => {
    const plain = run(level, false), planned = run(level, true);
    expect(plain.battle.finalResult?.outcome).toBe('victory');
    expect(planned.battle.finalResult?.outcome).toBe('victory');
    expect(planned.player.health.current).toBeGreaterThan(plain.player.health.current);
    expect(planned.player.qi.current).toBeLessThan(plain.player.qi.current);
    expect(planned.turns).toBeGreaterThan(plain.turns);
  });
  it('repairs only this enemy, preserves map/text/rewards/failure, is idempotent and refuses drift', () => {
    const old = JSON.parse(raw);
    const enemy = old.encounters.find((e: { id: string }) => e.id === prowlerId).enemy;
    enemy.health = 42; enemy.martialArtIds = ['skill.yunyin-shenfa']; delete enemy.behavior;
    const fixed = repairProwler(JSON.stringify(old, null, 2) + '\n');
    expect(JSON.parse(fixed)).toEqual(JSON.parse(raw));
    expect(repairProwler(raw)).toBe(raw);
    enemy.health = 41;
    expect(() => repairProwler(JSON.stringify(old))).toThrow('人工复核');
  });
});
