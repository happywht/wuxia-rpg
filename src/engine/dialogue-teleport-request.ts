/** A data-authored journey; no Phaser or story dependencies. */
export interface DialogueTeleportRequest {
  mapResourceId: string;
  col: number;
  row: number;
  travelMinutes: number;
}

export interface DialogueTeleportReadiness {
  canEnter: (mapResourceId: string, col: number, row: number) => boolean;
  /** Host evaluates scheduled actors, live encounters and facilities at arrival time. */
  landingBlocked: (request: DialogueTeleportRequest, activeCompanionId: string | null) => boolean;
  characterReady: boolean;
  panelReady: boolean;
}

export interface DialogueLandingCell { mapResourceId: string; col: number; row: number }
export function isDialogueLandingOccupied(request: DialogueLandingCell, state: {
  npcs: readonly (DialogueLandingCell & { id: string })[];
  activeCompanionNpcId: string | null;
  /** Caller supplies only encounters enabled by the arrival tide. */
  encounters: readonly (DialogueLandingCell & { id: string; repeatable: boolean })[];
  completedEncounterIds: ReadonlySet<string>;
  markers: readonly DialogueLandingCell[];
}): boolean {
  const matches = (cell: DialogueLandingCell) => cell.mapResourceId === request.mapResourceId && cell.col === request.col && cell.row === request.row;
  return state.npcs.some(npc => npc.id !== state.activeCompanionNpcId && matches(npc)) ||
    state.encounters.some(encounter => (encounter.repeatable || !state.completedEncounterIds.has(encounter.id)) && matches(encounter)) ||
    state.markers.some(matches);
}

export function isDialogueTeleportRequest(value: DialogueTeleportRequest): boolean {
  return typeof value.mapResourceId === 'string' && value.mapResourceId.trim().length > 0 && value.mapResourceId.length <= 64 &&
    Number.isInteger(value.col) && value.col >= 0 && value.col <= 4095 &&
    Number.isInteger(value.row) && value.row >= 0 && value.row <= 4095 &&
    Number.isInteger(value.travelMinutes) && value.travelMinutes >= 0 && value.travelMinutes <= 10080;
}

export function preflightDialogueTeleport(
  request: DialogueTeleportRequest,
  readiness: DialogueTeleportReadiness | undefined,
  activeCompanionId: string | null = null,
): { ok: true } | { ok: false; reason: string } {
  if (!isDialogueTeleportRequest(request)) return { ok: false, reason: '引路资料的地区、落点或耗时无效' };
  if (!readiness?.characterReady || !readiness.panelReady) return { ok: false, reason: '当前角色或界面无法接受引路' };
  if (!readiness.canEnter(request.mapResourceId, request.col, request.row)) return { ok: false, reason: '目的地区不存在或落点不可通行' };
  if (readiness.landingBlocked(request, activeCompanionId)) return { ok: false, reason: '抵达时目的地被人物、挑战或设施挡住，请稍后再试' };
  return { ok: true };
}
