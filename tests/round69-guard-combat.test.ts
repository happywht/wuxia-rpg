import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  createCharacterState,
  parseCharacterProfileSet,
  parseMartialArtSet,
} from '../src/engine/character-progression';
import {
  CombatSession,
  computeAttackDamage,
  computeDamageAfterGuard,
  parseBattleEncounterSet,
} from '../src/engine/turn-based-combat';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;

const profiles = parseCharacterProfileSet(readJson('../data/base/characters/round-04-profiles.json'));
const martialArts = parseMartialArtSet(readJson('../data/base/skills/round-04-martial-arts.json'));
const encounters = parseBattleEncounterSet(readJson('../data/base/battles/round-05-encounters.json'));
if (!profiles.ok || !martialArts.ok || !encounters.ok) throw new Error('基础角色、武学或战斗资料未通过解析');

const profile = profiles.set.profiles[0]!;
const artsById = new Map(martialArts.set.martialArts.map((art) => [art.id, art]));
const sourceEncounter = encounters.set.encounters.find((entry) => entry.id === 'encounter.alley-blade-bully')!;

function makeSession(enemyArtIds: string[], enemyQi = 40): {
  session: CombatSession;
  player: ReturnType<typeof createCharacterState>;
} {
  const player = createCharacterState(profile);
  player.martialArtIds.push('skill.r32-yunyin-buyun-lu');
  const encounter = {
    ...sourceEncounter,
    enemy: {
      ...sourceEncounter.enemy,
      health: 200,
      qi: enemyQi,
      attributes: { ...sourceEncounter.enemy.attributes, body: 9, force: 16 },
      martialArtIds: enemyArtIds,
    },
  };
  return {
    player,
    session: new CombatSession({
      encounter,
      profile,
      player,
      martialArts: artsById,
    }),
  };
}

describe('Round 69 one-hit guard combat', () => {
  it('parses the four real footwork arts as data-driven guard actions', () => {
    const footwork = martialArts.set.martialArts.filter((art) => art.category === '身法');
    expect(footwork).toHaveLength(4);
    expect(footwork.every((art) => art.combat.kind === 'guard')).toBe(true);
    expect(footwork.map(({ id, combat }) => [id, combat.power, combat.qiCost])).toEqual([
      ['skill.yunyin-shenfa', 14, 4],
      ['skill.r32-yunyin-buyun-lu', 9, 3],
      ['skill.r32-yunyin-luqiang-shenfa', 16, 6],
      ['skill.r32-panzhou-shunxun-bu', 9, 3],
    ]);
  });

  it('spends qi, reduces only the next hit and still takes at least one damage', () => {
    const attackerArt = artsById.get('skill.jianghu-sanshou')!;
    const guardArt = artsById.get('skill.r32-yunyin-buyun-lu')!;
    const { session, player } = makeSession([attackerArt.id]);
    const rawDamage = computeAttackDamage(attackerArt.combat.power, 16, player.attributes.body);
    const guarded = computeDamageAfterGuard(rawDamage, guardArt.combat.power);
    const qiBefore = player.qi.current;
    const healthBefore = player.health.current;

    expect(session.playerUse(guardArt.id)).toEqual({ ok: true });
    expect(player.qi.current).toBe(qiBefore - guardArt.combat.qiCost);
    expect(session.playerView.health.current).toBe(healthBefore - guarded.damage);
    expect(session.log.at(-1)?.text).toContain(`守御抵挡 ${guarded.prevented} 点`);

    const healthBeforeSecondHit = session.playerView.health.current;
    expect(session.playerUse(attackerArt.id)).toEqual({ ok: true });
    expect(healthBeforeSecondHit - session.playerView.health.current).toBe(rawDamage);

    expect(computeDamageAfterGuard(5, 999)).toEqual({ damage: 1, prevented: 4 });
    expect(computeDamageAfterGuard(1, 999)).toEqual({ damage: 1, prevented: 0 });
  });

  it('lets an enemy guard only when no affordable attack exists, then uses it once', () => {
    const attackerArt = artsById.get('skill.jianghu-sanshou')!;
    const guardArt = artsById.get('skill.r32-yunyin-buyun-lu')!;
    const { session } = makeSession([guardArt.id], guardArt.combat.qiCost + 4);
    const enemyQiBefore = session.enemyView.qi.current;
    const playerHealthBefore = session.playerView.health.current;
    const playerDamage = computeAttackDamage(
      attackerArt.combat.power,
      profile.attributes.force,
      9,
    );

    expect(session.playerUse(attackerArt.id)).toEqual({ ok: true });
    expect(session.playerView.health.current).toBe(playerHealthBefore);
    expect(session.enemyView.qi.current).toBe(enemyQiBefore - guardArt.combat.qiCost);
    expect(session.log.at(-1)?.text).toContain('摆出守势');

    const healthBeforeGuardedHit = session.enemyView.health.current;
    expect(session.playerUse(attackerArt.id)).toEqual({ ok: true });
    expect(healthBeforeGuardedHit - session.enemyView.health.current)
      .toBe(computeDamageAfterGuard(playerDamage, guardArt.combat.power).damage);
  });

  it('keeps an affordable enemy attack ahead of its defensive option', () => {
    const attackerArt = artsById.get('skill.jianghu-sanshou')!;
    const guardArt = artsById.get('skill.r32-yunyin-buyun-lu')!;
    const { session } = makeSession([guardArt.id, attackerArt.id]);
    const expectedDamage = computeAttackDamage(attackerArt.combat.power, 16, profile.attributes.body);
    const healthBefore = session.playerView.health.current;

    expect(session.playerUse(attackerArt.id)).toEqual({ ok: true });
    expect(healthBefore - session.playerView.health.current).toBe(expectedDamage);
    expect(session.log.at(-1)?.text).toContain(`造成 ${expectedDamage} 点伤害`);
    expect(session.log.at(-1)?.text).not.toContain('摆出守势');
  });
});
