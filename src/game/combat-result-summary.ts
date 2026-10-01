import type { CombatSession } from '../engine/turn-based-combat';

/** Presentation only: resources already reflect the engine's settlement. */
export function buildCombatResultSummary(session: Pick<CombatSession, 'finalResult' | 'playerView' | 'enemyView' | 'log'>): string {
  const result = session.finalResult;
  if (result === null) return '';
  const player = session.playerView;
  const outcome = { victory: '胜利', defeat: '战败', fled: '撤退' }[result.outcome];
  const authored = session.log.filter(entry => entry.kind === result.outcome).map(entry => entry.text);
  return [
    `战斗结果：${outcome}`,
    `${player.name} · 对手 ${session.enemyView.name}`,
    ...authored,
    result.outcome === 'defeat' ? '战败恢复已生效；下列为恢复后的当前资源。' : '下列为当前资源。',
    `生命 ${player.health.current}/${player.health.max} · 内力 ${player.qi.current}/${player.qi.max}`,
    `本场经验 +${result.experienceGained} · 升级 ${result.levelsGained} 次`,
    result.outcome === 'defeat' ? '战败不算胜利；相关差事后果在离开战场时结算。离开后按 B 打开背包使用补给，可退回安全处再作打算。' : '',
  ].filter(Boolean).join('\n');
}
