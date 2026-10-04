/**
 * Round 282 bounded journey evidence ledger (pure functions only).
 *
 * Computes measured differences across caller-supplied, ordered QA checkpoint
 * envelopes (format "wuxia-rpg.qa-checkpoint" v1, as exported by the QA save
 * isolation flow; see iterations/round-279/*c0-arrival.json and
 * iterations/round-280/*-c1-return.json) and rejects lineage problems before
 * any delta is trusted: mixed candidates, mixed qaRuns, undeclared source
 * slots, world-time or wall-clock rollbacks, and non-finite resource values.
 *
 * Deliberate limits (round-282 plan guardrails):
 * - Envelope metadata (stage/qaRun/exportedAt/displayName) is used for
 *   validation and echo only; it never generates a gameplay delta.
 * - The report contains measured differences only. It never infers gameplay
 *   from task counts, never claims journey/P1 completion, and never treats
 *   elapsedGameMinutes (in-world time) as human play duration.
 */

export const LEDGER_FORMAT = 'wuxia-rpg.journey-ledger';
export const LEDGER_VERSION = 1;
export const SUPPORTED_CHECKPOINT_FORMAT = 'wuxia-rpg.qa-checkpoint';
export const SUPPORTED_CHECKPOINT_VERSION = 1;

const PLAYER_STAT_FIELDS = ['level', 'experience', 'healthCurrent', 'qiCurrent', 'cultivationPoints'];

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonNegativeCount = (value) => isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
const parseInstant = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? Date.parse(value) : null);
const sameValue = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const distinct = (values) => [...new Set(values.filter((value) => value !== null))];
const stringSetOf = (list) => new Set((Array.isArray(list) ? list : []).filter((value) => typeof value === 'string'));

/**
 * Normalizes one envelope snapshot into comparison views. Tolerant by design:
 * invalid fields become null so a partially measurable report can still be
 * produced for evidence review (violations are recorded separately).
 */
function buildView(envelope) {
  const snapshot = isRecord(envelope) && isRecord(envelope.snapshot) ? envelope.snapshot : null;
  const inventory = snapshot && isRecord(snapshot.inventory) ? snapshot.inventory : {};
  const player = snapshot && isRecord(snapshot.player) ? snapshot.player : {};
  const quests = snapshot && isRecord(snapshot.quests) ? snapshot.quests : {};
  const social = snapshot && isRecord(snapshot.social) ? snapshot.social : {};

  const stackCounts = new Map();
  for (const stack of Array.isArray(inventory.stacks) ? inventory.stacks : []) {
    if (isRecord(stack) && typeof stack.itemId === 'string' && isFiniteNumber(stack.quantity)) {
      stackCounts.set(stack.itemId, (stackCounts.get(stack.itemId) ?? 0) + stack.quantity);
    }
  }

  const questStates = new Map();
  for (const state of Array.isArray(quests.states) ? quests.states : []) {
    if (!isRecord(state) || typeof state.questId !== 'string') continue;
    const objectives = new Map();
    for (const objective of Array.isArray(state.objectiveCounts) ? state.objectiveCounts : []) {
      if (isRecord(objective) && typeof objective.id === 'string') {
        objectives.set(objective.id, isFiniteNumber(objective.value) ? objective.value : null);
      }
    }
    questStates.set(state.questId, {
      status: typeof state.status === 'string' ? state.status : null,
      objectives,
    });
  }

  const numericEntryMap = (list, keyField) => {
    const map = new Map();
    for (const entry of Array.isArray(list) ? list : []) {
      if (isRecord(entry) && typeof entry[keyField] === 'string') {
        map.set(entry[keyField], isFiniteNumber(entry.value) ? entry.value : null);
      }
    }
    return map;
  };

  const npcKnowledge = new Map();
  for (const entry of Array.isArray(social.npcKnowledge) ? social.npcKnowledge : []) {
    if (isRecord(entry) && typeof entry.npcId === 'string') {
      npcKnowledge.set(entry.npcId, stringSetOf(entry.nodeIds));
    }
  }

  const variableMap = new Map();
  for (const entry of Array.isArray(snapshot?.dialogueVariables) ? snapshot.dialogueVariables : []) {
    if (isRecord(entry) && typeof entry.key === 'string') variableMap.set(entry.key, entry.value ?? null);
  }

  return {
    currency: isFiniteNumber(inventory.currency) ? inventory.currency : null,
    stats: Object.fromEntries(PLAYER_STAT_FIELDS.map((field) => [field, isFiniteNumber(player[field]) ? player[field] : null])),
    stackCounts,
    questStates,
    relationships: numericEntryMap(social.relationships, 'id'),
    factionRenown: numericEntryMap(social.factionRenown, 'id'),
    morality: isFiniteNumber(social.morality) ? social.morality : null,
    renown: isFiniteNumber(social.renown) ? social.renown : null,
    npcKnowledge,
    knownNodeIds: stringSetOf(snapshot?.knownKnowledgeNodeIds),
    encounters: stringSetOf(snapshot?.completedEncounters),
    regionalEvents: stringSetOf(snapshot?.completedRegionalEvents),
    variableMap,
    elapsedGameMinutes: snapshot && isFiniteNumber(snapshot.elapsedGameMinutes) ? snapshot.elapsedGameMinutes : null,
    savedAtMs: snapshot ? parseInstant(snapshot.savedAt) : null,
  };
}

/**
 * Describes a numeric difference between two nullable snapshots.
 * Returns null when nothing changed (measured differences only).
 */
function numericChange(from, to) {
  if (from === to) return null;
  return {
    from,
    to,
    delta: (to ?? 0) - (from ?? 0),
    change: from === null ? 'added' : to === null ? 'removed' : 'changed',
  };
}

/**
 * Audits an ordered list of QA checkpoint envelopes against one explicit
 * expected candidate and computes the measured gameplay deltas between
 * adjacent checkpoints.
 *
 * @param {readonly unknown[]} checkpoints - Parsed envelopes in journey order;
 *   branch journeys must be audited as separate reports (never merged).
 * @param {string | undefined} expectedCandidate - The single candidate this
 *   report may cover; supplied explicitly by the caller, never guessed.
 * @returns A JSON-serializable ledger report. `ok` is false when any
 *   violation was recorded; warnings (e.g. source slot changes) are surfaced
 *   without failing the audit because they are measured observations.
 */
export function computeJourneyLedger(checkpoints, expectedCandidate) {
  const violations = [];
  const warnings = [];
  const fail = (code, message, detail) => violations.push({ code, message, ...(detail ?? {}) });
  const warn = (code, message, detail) => warnings.push({ code, message, ...(detail ?? {}) });

  const hasExpectedCandidate = typeof expectedCandidate === 'string' && expectedCandidate.length > 0;
  if (!hasExpectedCandidate) {
    fail('EXPECTED_CANDIDATE_MISSING', 'caller must supply the explicit expected candidate for this report', {
      expectedCandidate: expectedCandidate ?? null,
    });
  }

  const envelopes = Array.isArray(checkpoints) ? checkpoints : null;
  if (!envelopes) fail('CHECKPOINTS_NOT_ARRAY', 'checkpoints must be an ordered array of QA checkpoint envelopes');
  const ordered = envelopes ?? [];
  if (ordered.length === 0) fail('CHECKPOINTS_EMPTY', 'at least one checkpoint envelope is required');

  const stages = [];
  const slots = [];
  const candidates = [];
  const qaRuns = [];
  const worldSeeds = [];
  const profileIds = [];
  const rawSavedAt = [];
  const views = [];

  ordered.forEach((envelope, index) => {
    if (!isRecord(envelope)) {
      fail('ENVELOPE_NOT_OBJECT', `checkpoint ${index} is not an object`, { index });
      stages.push(null);
      slots.push(null);
      candidates.push(null);
      qaRuns.push(null);
      worldSeeds.push(null);
      profileIds.push(null);
      rawSavedAt.push(null);
      views.push(buildView(null));
      return;
    }

    const snapshot = isRecord(envelope.snapshot) ? envelope.snapshot : null;
    stages.push(typeof envelope.stage === 'string' ? envelope.stage : null);
    slots.push(typeof envelope.sourceSlotId === 'string' && envelope.sourceSlotId.length > 0 ? envelope.sourceSlotId : null);
    candidates.push(typeof envelope.candidate === 'string' && envelope.candidate.length > 0 ? envelope.candidate : null);
    qaRuns.push(typeof envelope.qaRun === 'string' && envelope.qaRun.length > 0 ? envelope.qaRun : null);
    worldSeeds.push(snapshot && isFiniteNumber(snapshot.worldSeed) ? snapshot.worldSeed : null);
    profileIds.push(snapshot && typeof snapshot.profileId === 'string' ? snapshot.profileId : null);
    rawSavedAt.push(snapshot && typeof snapshot.savedAt === 'string' ? snapshot.savedAt : null);

    if (envelope.format !== SUPPORTED_CHECKPOINT_FORMAT) {
      fail('FORMAT_MISMATCH', `checkpoint ${index} format must be "${SUPPORTED_CHECKPOINT_FORMAT}"`, {
        index,
        observed: typeof envelope.format === 'string' ? envelope.format : null,
      });
    }
    if (envelope.version !== SUPPORTED_CHECKPOINT_VERSION) {
      fail('VERSION_UNSUPPORTED', `checkpoint ${index} version must be ${SUPPORTED_CHECKPOINT_VERSION}`, {
        index,
        observed: typeof envelope.version === 'number' ? envelope.version : null,
      });
    }
    if (!candidates[index]) {
      fail('CANDIDATE_MISSING', `checkpoint ${index} does not declare a candidate`, { index });
    } else if (hasExpectedCandidate && candidates[index] !== expectedCandidate) {
      fail('CANDIDATE_MISMATCH', `checkpoint ${index} candidate "${candidates[index]}" does not match the expected candidate "${expectedCandidate}"`, {
        index,
        observed: candidates[index],
        expected: hasExpectedCandidate ? expectedCandidate : null,
      });
    }
    if (!stages[index]?.trim()) fail('STAGE_MISSING', 'checkpoint stage must be declared', {index});
    if (parseInstant(envelope.exportedAt) === null) fail('EXPORTED_AT_INVALID', 'exportedAt must be a parseable timestamp', {index});
    if (!qaRuns[index]) fail('QA_RUN_MISSING', `checkpoint ${index} does not declare a qaRun`, { index });
    if (!slots[index]) fail('SOURCE_SLOT_MISSING', `checkpoint ${index} must declare its sourceSlotId`, { index });

    if (!snapshot) {
      fail('SNAPSHOT_MISSING', `checkpoint ${index} has no snapshot object`, { index });
    } else {
      if (parseInstant(snapshot.savedAt) === null) {
        fail('SAVED_AT_INVALID', `checkpoint ${index} snapshot.savedAt must be a parseable ISO timestamp`, {
          index,
          observed: typeof snapshot.savedAt === 'string' ? snapshot.savedAt : null,
        });
      }
      if (!isFiniteNumber(snapshot.elapsedGameMinutes) || snapshot.elapsedGameMinutes < 0) {
        fail('ELAPSED_MINUTES_INVALID', `checkpoint ${index} elapsedGameMinutes must be a finite non-negative number`, {
          index,
          observed: isFiniteNumber(snapshot.elapsedGameMinutes) ? snapshot.elapsedGameMinutes : null,
        });
      }

      const inventory = isRecord(snapshot.inventory) ? snapshot.inventory : null;
      const stacks = inventory && Array.isArray(inventory.stacks) ? inventory.stacks : null;
      if (!inventory || !stacks) {
        fail('INVENTORY_INVALID', `checkpoint ${index} inventory.stacks must be an array`, { index });
      } else {
        stacks.forEach((stack, stackPosition) => {
          if (!isRecord(stack) || typeof stack.itemId !== 'string' || stack.itemId.length === 0 || !isNonNegativeCount(stack.quantity)) {
            fail('INVENTORY_STACK_INVALID', `checkpoint ${index} stack ${stackPosition} must declare itemId and a finite non-negative integer quantity`, {
              index,
              stackPosition,
            });
          }
        });
      }
      if (!isFiniteNumber(inventory?.currency) || (inventory?.currency ?? -1) < 0) {
        fail('CURRENCY_INVALID', `checkpoint ${index} inventory.currency must be a finite non-negative number`, {
          index,
          observed: isFiniteNumber(inventory?.currency) ? inventory.currency : null,
        });
      }

      const player = isRecord(snapshot.player) ? snapshot.player : null;
      if (!player) {
        fail('PLAYER_MISSING', `checkpoint ${index} has no player object`, { index });
      } else {
        for (const field of PLAYER_STAT_FIELDS) {
          if (!isFiniteNumber(player[field]) || player[field] < 0) {
            fail('PLAYER_STAT_INVALID', `checkpoint ${index} player.${field} must be a finite non-negative number`, {
              index,
              stat: field,
              observed: player[field] ?? null,
            });
          }
        }
      }

      const states = isRecord(snapshot.quests) && Array.isArray(snapshot.quests.states) ? snapshot.quests.states : [];
      for (const state of states) {
        if (!isRecord(state) || typeof state.questId !== 'string' || state.questId.length === 0) {
          fail('QUEST_STATE_INVALID', `checkpoint ${index} has a quest state without a questId`, { index });
          continue;
        }
        for (const objective of Array.isArray(state.objectiveCounts) ? state.objectiveCounts : []) {
          if (isRecord(objective) && typeof objective.id === 'string' && !isFiniteNumber(objective.value)) {
            fail('OBJECTIVE_VALUE_INVALID', `checkpoint ${index} quest ${state.questId} objective ${objective.id} value must be a finite number`, {
              index,
              questId: state.questId,
              objectiveId: objective.id,
            });
          }
        }
      }

      const social = isRecord(snapshot.social) ? snapshot.social : {};
      for (const entry of Array.isArray(social.relationships) ? social.relationships : []) {
        if (isRecord(entry) && typeof entry.id === 'string' && !isFiniteNumber(entry.value)) {
          fail('RELATIONSHIP_VALUE_INVALID', `checkpoint ${index} relationship ${entry.id} value must be a finite number`, {
            index,
            npcId: entry.id,
            observed: entry.value ?? null,
          });
        }
      }
    }

    if (snapshot) {
      if (!isFiniteNumber(snapshot.worldSeed)) fail('WORLD_SEED_INVALID', 'worldSeed must be declared and finite', {index});
      if (typeof snapshot.profileId !== 'string' || !snapshot.profileId) fail('PROFILE_INVALID', 'profileId must be declared', {index});
      if (!isRecord(snapshot.quests) || !Array.isArray(snapshot.quests.states)) fail('QUESTS_MISSING', 'quests.states must be an array', {index});
      if (!isRecord(snapshot.social) || !Array.isArray(snapshot.social.relationships) || !Array.isArray(snapshot.social.factionRenown) || !Array.isArray(snapshot.social.npcKnowledge)) fail('SOCIAL_MISSING', 'social relationship, faction and NPC knowledge arrays must be declared', {index});
      for (const field of ['completedEncounters','completedRegionalEvents','knownKnowledgeNodeIds','dialogueVariables']) {
        if (!Array.isArray(snapshot[field])) fail('EVIDENCE_ARRAY_MISSING', 'missing evidence array: '+field, {index, field});
      }
    }
    views.push(buildView(envelope));
  });

  const observedQaRuns = distinct(qaRuns);
  if (observedQaRuns.length > 1) {
    fail('QA_RUN_MISMATCH', 'one linear journey report must keep a single qaRun; audit branch journeys as separate reports', {
      observedQaRuns,
    });
  }

  const slotTransitions = [];
  for (let i = 1; i < ordered.length; i++) {
    const fromIndex = i - 1;
    const toIndex = i;
    const earlier = views[fromIndex] ?? buildView(null);
    const later = views[toIndex] ?? buildView(null);

    if (earlier.savedAtMs !== null && later.savedAtMs !== null && later.savedAtMs < earlier.savedAtMs) {
      fail('SAVED_AT_ROLLBACK', `checkpoint ${toIndex} savedAt is earlier than checkpoint ${fromIndex}`, {
        fromIndex,
        toIndex,
        fromSavedAt: rawSavedAt[fromIndex] ?? null,
        toSavedAt: rawSavedAt[toIndex] ?? null,
      });
    }
    if (
      earlier.elapsedGameMinutes !== null &&
      later.elapsedGameMinutes !== null &&
      later.elapsedGameMinutes < earlier.elapsedGameMinutes
    ) {
      fail('ELAPSED_TIME_ROLLBACK', `checkpoint ${toIndex} elapsedGameMinutes went backwards (world-time rollback)`, {
        fromIndex,
        toIndex,
        fromMinutes: earlier.elapsedGameMinutes,
        toMinutes: later.elapsedGameMinutes,
      });
    }
    if (slots[fromIndex] && slots[toIndex] && slots[fromIndex] !== slots[toIndex]) {
      slotTransitions.push({ fromIndex, toIndex, fromSlot: slots[fromIndex], toSlot: slots[toIndex] });
      warn('SOURCE_SLOT_CHANGED', `source slot changed between checkpoint ${fromIndex} and ${toIndex}; consequences may be masked by a different slot`, {
        fromIndex,
        toIndex,
        fromSlot: slots[fromIndex],
        toSlot: slots[toIndex],
      });
    }
  }

  const observedWorldSeeds = distinct(worldSeeds);
  if (observedWorldSeeds.length > 1) {
    fail('WORLD_SEED_CHANGED', 'worldSeed differs across checkpoints of one journey', { observedWorldSeeds });
  }
  const observedProfileIds = distinct(profileIds);
  if (observedProfileIds.length > 1) {
    fail('PROFILE_CHANGED', 'profileId differs across checkpoints of one journey', { observedProfileIds });
  }

  const timeDeltas = { elapsedGameMinutes: [], savedAt: [], totals: { elapsedGameMinutes: null, savedAtMs: null } };
  const resourceDeltas = { currency: [], stats: [], inventory: [] };
  const questDeltas = { statuses: [], objectives: [] };
  const knowledgeDeltas = { knownNodeIds: [], npcKnowledge: [] };
  const relationshipDeltas = { values: [], factionRenown: [], scalars: [] };
  const variableDeltas = [];
  const encounterDeltas = { completedEncounters: [], completedRegionalEvents: [] };

  for (let i = 1; i < ordered.length; i++) {
    const fromIndex = i - 1;
    const toIndex = i;
    const a = views[fromIndex] ?? buildView(null);
    const b = views[toIndex] ?? buildView(null);

    if (a.elapsedGameMinutes !== null && b.elapsedGameMinutes !== null && b.elapsedGameMinutes !== a.elapsedGameMinutes) {
      timeDeltas.elapsedGameMinutes.push({
        fromIndex,
        toIndex,
        from: a.elapsedGameMinutes,
        to: b.elapsedGameMinutes,
        delta: b.elapsedGameMinutes - a.elapsedGameMinutes,
      });
    }
    if (a.savedAtMs !== null && b.savedAtMs !== null && b.savedAtMs !== a.savedAtMs) {
      timeDeltas.savedAt.push({
        fromIndex,
        toIndex,
        from: rawSavedAt[fromIndex] ?? null,
        to: rawSavedAt[toIndex] ?? null,
        deltaMs: b.savedAtMs - a.savedAtMs,
      });
    }

    const currency = numericChange(a.currency, b.currency);
    if (currency) resourceDeltas.currency.push({ fromIndex, toIndex, ...currency });

    for (const field of PLAYER_STAT_FIELDS) {
      const stat = numericChange(a.stats[field] ?? null, b.stats[field] ?? null);
      if (stat) resourceDeltas.stats.push({ stat: field, fromIndex, toIndex, ...stat });
    }

    for (const itemId of new Set([...a.stackCounts.keys(), ...b.stackCounts.keys()])) {
      const item = numericChange(a.stackCounts.get(itemId) ?? null, b.stackCounts.get(itemId) ?? null);
      if (item) resourceDeltas.inventory.push({ itemId, fromIndex, toIndex, ...item });
    }

    for (const questId of new Set([...a.questStates.keys(), ...b.questStates.keys()])) {
      const before = a.questStates.get(questId) ?? null;
      const after = b.questStates.get(questId) ?? null;
      const fromStatus = before ? before.status : null;
      const toStatus = after ? after.status : null;
      if (fromStatus !== toStatus) questDeltas.statuses.push({ questId, fromIndex, toIndex, fromStatus, toStatus });
      for (const objectiveId of new Set([...(before?.objectives.keys() ?? []), ...(after?.objectives.keys() ?? [])])) {
        const objective = numericChange(before?.objectives.get(objectiveId) ?? null, after?.objectives.get(objectiveId) ?? null);
        if (objective) questDeltas.objectives.push({ questId, objectiveId, fromIndex, toIndex, ...objective });
      }
    }

    for (const nodeId of b.knownNodeIds) {
      if (!a.knownNodeIds.has(nodeId)) knowledgeDeltas.knownNodeIds.push({ nodeId, change: 'added', fromIndex, toIndex });
    }
    for (const nodeId of a.knownNodeIds) {
      if (!b.knownNodeIds.has(nodeId)) knowledgeDeltas.knownNodeIds.push({ nodeId, change: 'removed', fromIndex, toIndex });
    }
    for (const npcId of new Set([...a.npcKnowledge.keys(), ...b.npcKnowledge.keys()])) {
      const fromNodes = a.npcKnowledge.get(npcId) ?? new Set();
      const toNodes = b.npcKnowledge.get(npcId) ?? new Set();
      const added = [...toNodes].filter((nodeId) => !fromNodes.has(nodeId));
      const removed = [...fromNodes].filter((nodeId) => !toNodes.has(nodeId));
      if (added.length > 0 || removed.length > 0) {
        knowledgeDeltas.npcKnowledge.push({ npcId, fromIndex, toIndex, added, removed });
      }
    }

    for (const npcId of new Set([...a.relationships.keys(), ...b.relationships.keys()])) {
      const value = numericChange(a.relationships.get(npcId) ?? null, b.relationships.get(npcId) ?? null);
      if (value) relationshipDeltas.values.push({ npcId, fromIndex, toIndex, ...value });
    }
    for (const factionId of new Set([...a.factionRenown.keys(), ...b.factionRenown.keys()])) {
      const value = numericChange(a.factionRenown.get(factionId) ?? null, b.factionRenown.get(factionId) ?? null);
      if (value) relationshipDeltas.factionRenown.push({ factionId, fromIndex, toIndex, ...value });
    }
    for (const field of ['morality', 'renown']) {
      const scalar = numericChange(a[field], b[field]);
      if (scalar) relationshipDeltas.scalars.push({ field, fromIndex, toIndex, ...scalar });
    }

    for (const key of new Set([...a.variableMap.keys(), ...b.variableMap.keys()])) {
      const fromValue = a.variableMap.get(key) ?? null;
      const toValue = b.variableMap.get(key) ?? null;
      if (!sameValue(fromValue, toValue)) {
        variableDeltas.push({
          key,
          fromIndex,
          toIndex,
          fromValue,
          toValue,
          change: fromValue === null ? 'added' : toValue === null ? 'removed' : 'changed',
        });
      }
    }

    for (const encounterId of b.encounters) {
      if (!a.encounters.has(encounterId)) encounterDeltas.completedEncounters.push({ encounterId, change: 'added', fromIndex, toIndex });
    }
    for (const encounterId of a.encounters) {
      if (!b.encounters.has(encounterId)) encounterDeltas.completedEncounters.push({ encounterId, change: 'removed', fromIndex, toIndex });
    }
    for (const eventId of b.regionalEvents) {
      if (!a.regionalEvents.has(eventId)) encounterDeltas.completedRegionalEvents.push({ eventId, change: 'added', fromIndex, toIndex });
    }
    for (const eventId of a.regionalEvents) {
      if (!b.regionalEvents.has(eventId)) encounterDeltas.completedRegionalEvents.push({ eventId, change: 'removed', fromIndex, toIndex });
    }
  }

  const first = views.length > 0 ? views[0] : null;
  const last = views.length > 0 ? views[views.length - 1] : null;
  if (first && last) {
    timeDeltas.totals.elapsedGameMinutes =
      first.elapsedGameMinutes !== null && last.elapsedGameMinutes !== null ? last.elapsedGameMinutes - first.elapsedGameMinutes : null;
    timeDeltas.totals.savedAtMs = first.savedAtMs !== null && last.savedAtMs !== null ? last.savedAtMs - first.savedAtMs : null;
  }

  return {
    format: LEDGER_FORMAT,
    version: LEDGER_VERSION,
    ok: violations.length === 0,
    checkpointCount: ordered.length,
    expectedCandidate: hasExpectedCandidate ? expectedCandidate : null,
    observed: {
      candidates: distinct(candidates),
      qaRuns: observedQaRuns,
      stages,
      sourceSlotIds: slots,
      slotTransitions,
      worldSeeds: observedWorldSeeds,
      profileIds: observedProfileIds,
    },
    violations,
    warnings,
    guardrails: {
      measuredDifferencesOnly: true,
      infersGameplayFromTaskCounts: false,
      claimsJourneyCompletion: false,
      claimsHumanPlaytime: false,
      note: 'Deltas are measured snapshot differences only. elapsedGameMinutes is in-world time and is NOT evidence of human play duration; P1 human 60-90 minute acceptance still requires separate human evidence.',
    },
    metadataUsage: {
      validationOnly: [
        'format',
        'version',
        'candidate',
        'qaRun',
        'sourceSlotId',
        'stage',
        'exportedAt',
        'snapshot.savedAt',
        'snapshot.elapsedGameMinutes',
        'snapshot.worldSeed',
        'snapshot.profileId',
      ],
      evidenceOnly: 'deltas come exclusively from snapshot gameplay fields',
      note: 'Envelope stage/exportedAt/displayName are echoed as raw metadata and never generate gameplay deltas or completion claims.',
    },
    deltas: {
      time: timeDeltas,
      resources: resourceDeltas,
      quests: questDeltas,
      knowledge: knowledgeDeltas,
      relationships: relationshipDeltas,
      variables: variableDeltas,
      encounters: encounterDeltas,
    },
  };
}
