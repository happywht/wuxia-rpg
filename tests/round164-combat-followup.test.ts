import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCombatResultSummary } from '../src/game/combat-result-summary';
import { CombatSession, parseBattleEncounterSet } from '../src/engine/turn-based-combat';
import { createCharacterState, parseCharacterProfileSet, parseMartialArtSet } from '../src/engine/character-progression';
const read = (p: string) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
function setup() {
  const pp = parseCharacterProfileSet(read('data/base/characters/round-04-profiles.json'));
  const ap = parseMartialArtSet(read('data/base/skills/round-04-martial-arts.json'));
  const bp = parseBattleEncounterSet(read('data/base/battles/round-05-encounters.json'));
  if (!pp.ok || !ap.ok || !bp.ok) throw Error('base');
  const profile = pp.set.profiles[0]!;
  const player = createCharacterState(profile);
  return new CombatSession({ encounter: structuredClone(bp.set.encounters[0]!), profile, player,
    martialArts: new Map(ap.set.martialArts.map(a => [a.id, a])) });
}
describe('Round164 combat follow-up', () => {
  it('does not advertise settlement during an active battle', () => {
    expect(buildCombatResultSummary(setup())).toBe('');
  });
  it('victory separates engine experience from departure consequences without awarding again', () => {
    const session = setup();
    for (let i = 0; i < 100 && !session.isOver; i++) session.playerUse(session.playerActions[0]!.art.id);
    expect(session.finalResult?.outcome).toBe('victory');
    const before = JSON.stringify({ player: session.playerView, result: session.finalResult, log: session.log });
    const summary = buildCombatResultSummary(session);
    expect(summary).toContain('本场经验已结算');
    expect(summary).toContain('差事后果在离开战场时结算');
    expect(summary).toContain('按 Q');
    expect(summary).toContain('按 R');
    expect(summary).not.toContain('差事已完成');
    expect(buildCombatResultSummary(session)).toBe(summary);
    expect(JSON.stringify({ player: session.playerView, result: session.finalResult, log: session.log })).toBe(before);
  });
  it('retreat does not claim victory or successful quest completion', () => {
    const session = setup();
    session.flee();
    expect(session.finalResult?.outcome).toBe('fled');
    const summary = buildCombatResultSummary(session);
    expect(summary).toContain('撤退不算胜利');
    expect(summary).toContain('按 B');
    expect(summary).not.toContain('本场经验已结算');
  });
  it('defeat retains actual recovery and supplies guidance', () => {
    const session = setup();
    for (let i = 0; i < 100 && !session.isOver; i++) session.playerWait();
    expect(session.finalResult?.outcome).toBe('defeat');
    const summary = buildCombatResultSummary(session);
    expect(summary).toContain('战败不算胜利');
    expect(summary).toContain('恢复后的当前资源');
    expect(summary).not.toContain('撤退不算胜利');
  });
});
