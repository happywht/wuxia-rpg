import type { CombatSession } from '../engine/turn-based-combat';
/** Mechanic-only label; actor names and support values come from data. */
export function companionCadenceLabel(view: CombatSession['companionCadence']): string | null {
  if (view === null) return null;
  return `援护：${view.name} · 再${view.actionsUntilSupport}次成功行动 · ${view.kind === 'attack' ? '攻击' : '恢复'}至多${view.power}`;
}
