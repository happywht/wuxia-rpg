/** Pure preflight shared by dialogue transactions and scene dispatch. */
export interface DialogueBattleTarget {
  id: string;
  mapResourceId: string;
  repeatable: boolean;
}

export interface DialogueBattleReadiness {
  currentMapResourceId: string;
  targets: ReadonlyMap<string, DialogueBattleTarget>;
  completedEncounterIds: ReadonlySet<string>;
  characterReady: boolean;
  panelReady: boolean;
}

export type DialogueBattlePreflight =
  | { ok: true; encounterId: string }
  | { ok: false; reason: string };

/** Consume before scheduling, so duplicate callbacks or re-entry cannot dispatch twice. */
export function onceDialogueBattleDispatch(dispatch: () => void): () => void {
  let consumed = false;
  return () => {
    if (consumed) return;
    consumed = true;
    dispatch();
  };
}

/** Reject before committing any quest, item or variable effect. */
export function preflightDialogueBattle(
  encounterId: string,
  readiness: DialogueBattleReadiness | undefined,
): DialogueBattlePreflight {
  if (readiness === undefined) return { ok: false, reason: '当前无法发起对白挑战' };
  const target = readiness.targets.get(encounterId);
  if (target === undefined) return { ok: false, reason: '挑战资料不存在或未通过校验' };
  if (target.mapResourceId !== readiness.currentMapResourceId) {
    return { ok: false, reason: '这项挑战不在当前地区' };
  }
  if (!readiness.characterReady) return { ok: false, reason: '当前角色状态无法开始挑战' };
  if (!readiness.panelReady) return { ok: false, reason: '当前战斗界面尚未准备好' };
  if (!target.repeatable && readiness.completedEncounterIds.has(encounterId)) {
    return { ok: false, reason: '这项挑战已经完成，不能重复发起' };
  }
  return { ok: true, encounterId: target.id };
}
