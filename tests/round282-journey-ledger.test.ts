/**
 * Round 282 unit tests for the bounded journey evidence ledger.
 *
 * All envelopes below are SMALL SYNTHETIC UNIT FIXTURES shaped like the real
 * QA checkpoint exports (iterations/round-279/*c0-arrival.json and
 * iterations/round-280/*-c1-return.json). They are NOT journey evidence and
 * assert nothing about real gameplay.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {computeJourneyLedger} from '../scripts/lib/journey-ledger.mjs';

const cliPath = fileURLToPath(new URL('../scripts/audit-journey-ledger.mjs', import.meta.url));

type Envelope = Record<string, unknown>;

/** Synthetic baseline fixture; every field the validator reads is present. */
const envelope = (envOver: Record<string, unknown> = {}, snapOver: Record<string, unknown> = {}): Envelope => ({
  format: 'wuxia-rpg.qa-checkpoint',
  version: 1,
  qaRun: 'unit-run-a',
  candidate: 'unit-candidate-a',
  stage: 'unit-stage-1',
  exportedAt: '2026-10-04T00:00:00.000Z',
  sourceSlotId: 'slot-unit',
  snapshot: {
    protocolVersion: 1,
    savedAt: '2026-10-04T09:00:00.000Z',
    displayName: '合成夹具',
    profileId: 'char.unit',
    mapResourceId: 'map.unit',
    playerPosition: {col: 1, row: 1},
    player: {level: 1, experience: 0, healthCurrent: 100, qiCurrent: 50, cultivationPoints: 0},
    inventory: {currency: 100, stacks: [{itemId: 'item.unit-herb', quantity: 2}]},
    quests: {
      states: [{questId: 'quest.unit-errand', status: 'offered', objectiveCounts: [{id: 'objective.unit-deliver', value: 0}]}],
      trackedQuestId: null,
    },
    social: {morality: 0, renown: 0, factionRenown: [{id: 'faction.unit', value: 0}], relationships: [{id: 'char.unit-keeper', value: 1}], npcKnowledge: [{npcId: 'char.unit-keeper', nodeIds: []}]},
    completedEncounters: [],
    completedRegionalEvents: [],
    knownKnowledgeNodeIds: [],
    elapsedGameMinutes: 10,
    worldSeed: 42,
    dialogueVariables: [],
    ...snapOver,
  },
  ...envOver,
});

/** Second synthetic checkpoint one segment later in the same linear journey. */
const laterEnvelope = (): Envelope =>
  envelope({stage: 'unit-stage-2', exportedAt: '2026-10-04T00:05:00.000Z'}, {
    savedAt: '2026-10-04T09:05:00.000Z',
    elapsedGameMinutes: 28,
    player: {level: 2, experience: 20, healthCurrent: 93, qiCurrent: 46, cultivationPoints: 1},
    inventory: {currency: 62, stacks: [{itemId: 'item.unit-herb', quantity: 1}, {itemId: 'item.unit-salve', quantity: 3}]},
    quests: {
      states: [{questId: 'quest.unit-errand', status: 'completed', objectiveCounts: [{id: 'objective.unit-deliver', value: 1}]}],
      trackedQuestId: 'quest.unit-errand',
    },
    social: {morality: 1, renown: 0, factionRenown: [{id: 'faction.unit', value: 3}], relationships: [{id: 'char.unit-keeper', value: 2}], npcKnowledge: [{npcId: 'char.unit-keeper', nodeIds: ['event.unit-ledger']}]},
    completedEncounters: ['encounter.unit-ambush'],
    completedRegionalEvents: ['event.unit-festival'],
    knownKnowledgeNodeIds: ['char.unit-elder'],
    dialogueVariables: [{key: 'unit.choice', value: 'stay'}],
  });

const codes = (report: ReturnType<typeof computeJourneyLedger>) => report.violations.map((violation) => violation.code);

describe('round282 journey evidence ledger (synthetic unit fixtures)', () => {
  it('computes measured deltas for a valid same-candidate linear journey', () => {
    const report = computeJourneyLedger([envelope(), laterEnvelope()], 'unit-candidate-a');
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.observed.candidates).toEqual(['unit-candidate-a']);
    expect(report.observed.qaRuns).toEqual(['unit-run-a']);
    expect(report.deltas.time.elapsedGameMinutes[0]!.delta).toBe(18);
    expect(report.deltas.time.savedAt[0]!.deltaMs).toBe(5 * 60 * 1000);
    expect(report.deltas.time.totals).toEqual({elapsedGameMinutes: 18, savedAtMs: 300000});
    expect(report.deltas.quests.statuses[0]).toMatchObject({questId: 'quest.unit-errand', fromStatus: 'offered', toStatus: 'completed'});
    expect(report.deltas.quests.objectives[0]).toMatchObject({objectiveId: 'objective.unit-deliver', from: 0, to: 1, delta: 1});
    expect(report.deltas.knowledge.knownNodeIds).toEqual([{nodeId: 'char.unit-elder', change: 'added', fromIndex: 0, toIndex: 1}]);
    expect(report.deltas.knowledge.npcKnowledge[0]).toMatchObject({npcId: 'char.unit-keeper', added: ['event.unit-ledger'], removed: []});
    expect(report.deltas.relationships.values[0]).toMatchObject({npcId: 'char.unit-keeper', from: 1, to: 2, delta: 1});
    expect(report.deltas.relationships.factionRenown[0]).toMatchObject({factionId: 'faction.unit', from: 0, to: 3, delta: 3});
    expect(report.deltas.relationships.scalars[0]).toMatchObject({field: 'morality', from: 0, to: 1, delta: 1});
    expect(report.deltas.variables[0]).toMatchObject({key: 'unit.choice', fromValue: null, toValue: 'stay', change: 'added'});
    expect(report.deltas.encounters.completedEncounters).toEqual([{encounterId: 'encounter.unit-ambush', change: 'added', fromIndex: 0, toIndex: 1}]);
    expect(report.deltas.encounters.completedRegionalEvents).toEqual([{eventId: 'event.unit-festival', change: 'added', fromIndex: 0, toIndex: 1}]);
  });

  it('reads NPC knowledge from the real nested social protocol, ignoring a misleading top-level field', () => {
    const a=envelope(); const b=laterEnvelope();
    (b.snapshot as Record<string,unknown>).npcKnowledge=[{npcId:'char.fake',nodeIds:['event.fake']}];
    const report=computeJourneyLedger([a,b],'unit-candidate-a');
    expect(report.ok).toBe(true);
    expect(report.deltas.knowledge.npcKnowledge).toEqual([{npcId:'char.unit-keeper',fromIndex:0,toIndex:1,added:['event.unit-ledger'],removed:[]}]);
  });

  it('rejects absent core evidence, different identities and negative player resources', () => {
    for (const [over,code] of [[{quests:null},'QUESTS_MISSING'],[{social:null},'SOCIAL_MISSING'],[{completedEncounters:null},'EVIDENCE_ARRAY_MISSING'],[{worldSeed:null},'WORLD_SEED_INVALID'],[{profileId:''},'PROFILE_INVALID']] as const) {
      expect(codes(computeJourneyLedger([envelope({},over)],'unit-candidate-a'))).toContain(code);
    }
    expect(codes(computeJourneyLedger([envelope(),envelope({}, {worldSeed:99})],'unit-candidate-a'))).toContain('WORLD_SEED_CHANGED');
    expect(codes(computeJourneyLedger([envelope(),envelope({}, {profileId:'char.other'})],'unit-candidate-a'))).toContain('PROFILE_CHANGED');
    const negative=envelope(); ((negative.snapshot as Record<string,unknown>).player as Record<string,unknown>).qiCurrent=-1;
    expect(codes(computeJourneyLedger([negative],'unit-candidate-a'))).toContain('PLAYER_STAT_INVALID');
  });

  it('rejects mixed candidates and a missing explicit expected candidate', () => {
    const mixed = computeJourneyLedger([envelope(), envelope({candidate: 'unit-candidate-b'})], 'unit-candidate-a');
    expect(mixed.ok).toBe(false);
    expect(codes(mixed)).toContain('CANDIDATE_MISMATCH');
    expect(mixed.observed.candidates).toEqual(['unit-candidate-a', 'unit-candidate-b']);
    const noExpectation = computeJourneyLedger([envelope()], undefined);
    expect(noExpectation.ok).toBe(false);
    expect(codes(noExpectation)).toContain('EXPECTED_CANDIDATE_MISSING');
  });

  it('rejects mixed qaRun across one linear journey', () => {
    const report = computeJourneyLedger([envelope(), envelope({qaRun: 'unit-run-b'})], 'unit-candidate-a');
    expect(report.ok).toBe(false);
    expect(codes(report)).toContain('QA_RUN_MISMATCH');
    expect(report.observed.qaRuns).toEqual(['unit-run-a', 'unit-run-b']);
  });

  it('rejects world-time and wall-clock rollbacks', () => {
    const worldTime = computeJourneyLedger([envelope(), envelope({}, {elapsedGameMinutes: 9})], 'unit-candidate-a');
    expect(worldTime.ok).toBe(false);
    expect(codes(worldTime)).toContain('ELAPSED_TIME_ROLLBACK');
    const wallClock = computeJourneyLedger(
      [envelope(), envelope({}, {savedAt: '2026-10-04T08:59:00.000Z', elapsedGameMinutes: 20})],
      'unit-candidate-a',
    );
    expect(wallClock.ok).toBe(false);
    expect(codes(wallClock)).toContain('SAVED_AT_ROLLBACK');
  });

  it('rejects missing source slot declarations and reports slot changes as warnings', () => {
    const absent = envelope();
    delete absent.sourceSlotId;
    const missing = computeJourneyLedger([absent, envelope()], 'unit-candidate-a');
    expect(missing.ok).toBe(false);
    expect(codes(missing)).toContain('SOURCE_SLOT_MISSING');
    const changed = computeJourneyLedger([envelope(), envelope({sourceSlotId: 'slot-other'})], 'unit-candidate-a');
    expect(changed.ok).toBe(true);
    expect(changed.warnings.map((warning) => warning.code)).toContain('SOURCE_SLOT_CHANGED');
    expect(changed.observed.slotTransitions).toEqual([{fromIndex: 0, toIndex: 1, fromSlot: 'slot-unit', toSlot: 'slot-other'}]);
  });

  it('reports only actual resource deltas with exact arithmetic', () => {
    const report = computeJourneyLedger([envelope(), laterEnvelope()], 'unit-candidate-a');
    expect(report.deltas.resources.currency[0]).toMatchObject({from: 100, to: 62, delta: -38});
    expect(report.deltas.resources.stats).toEqual(expect.arrayContaining([
      expect.objectContaining({stat: 'level', from: 1, to: 2, delta: 1}),
      expect.objectContaining({stat: 'healthCurrent', from: 100, to: 93, delta: -7}),
    ]));
    expect(report.deltas.resources.inventory).toEqual([
      {itemId: 'item.unit-herb', fromIndex: 0, toIndex: 1, from: 2, to: 1, delta: -1, change: 'changed'},
      {itemId: 'item.unit-salve', fromIndex: 0, toIndex: 1, from: null, to: 3, delta: 3, change: 'added'},
    ]);
    const unchanged = computeJourneyLedger([envelope(), envelope({stage: 'unit-stage-2'})], 'unit-candidate-a');
    expect(unchanged.deltas.resources.currency).toEqual([]);
    expect(unchanged.deltas.resources.inventory).toEqual([]);
    expect(unchanged.deltas.quests.statuses).toEqual([]);
  });

  it('does not mutate caller inputs', () => {
    const input = [envelope(), laterEnvelope(), envelope({candidate: 'unit-candidate-b', qaRun: 'unit-run-b'})];
    const before = structuredClone(input);
    computeJourneyLedger(input, 'unit-candidate-a');
    expect(input).toEqual(before);
  });

  it('rejects bad format/version and non-finite resource values', () => {
    expect(codes(computeJourneyLedger([envelope({format: 'other.format'})], 'unit-candidate-a'))).toContain('FORMAT_MISMATCH');
    expect(codes(computeJourneyLedger([envelope({version: 2})], 'unit-candidate-a'))).toContain('VERSION_UNSUPPORTED');
    expect(codes(computeJourneyLedger([envelope({}, {inventory: {currency: '62', stacks: []}})], 'unit-candidate-a'))).toContain('CURRENCY_INVALID');
    expect(
      codes(computeJourneyLedger([envelope({}, {inventory: {currency: 100, stacks: [{itemId: 'item.unit-herb', quantity: -1}]}})], 'unit-candidate-a')),
    ).toContain('INVENTORY_STACK_INVALID');
    const sickPlayer = envelope();
    (sickPlayer.snapshot as Record<string, unknown>).player = {level: 1, experience: 0, healthCurrent: Number.NaN, qiCurrent: 50, cultivationPoints: 0};
    expect(codes(computeJourneyLedger([sickPlayer], 'unit-candidate-a'))).toContain('PLAYER_STAT_INVALID');
  });

  it('rejects missing stage and malformed export timestamp', () => {
    expect(codes(computeJourneyLedger([envelope({stage:''})],'unit-candidate-a'))).toContain('STAGE_MISSING');
    expect(codes(computeJourneyLedger([envelope({exportedAt:'bad'})],'unit-candidate-a'))).toContain('EXPORTED_AT_INVALID');
  });

  it('never infers gameplay from envelope metadata', () => {
    const report = computeJourneyLedger(
      [
        envelope(),
        envelope({stage: 'renamed-stage', exportedAt: '2026-10-04T10:00:00.000Z'}, {displayName: '另一样合成夹具'}),
      ],
      'unit-candidate-a',
    );
    expect(report.ok).toBe(true);
    expect(report.deltas.time.elapsedGameMinutes).toEqual([]);
    expect(report.deltas.resources.currency).toEqual([]);
    expect(report.deltas.quests.statuses).toEqual([]);
    expect(report.guardrails).toMatchObject({
      measuredDifferencesOnly: true,
      infersGameplayFromTaskCounts: false,
      claimsJourneyCompletion: false,
      claimsHumanPlaytime: false,
    });
    expect('journeyComplete' in report).toBe(false);
    expect('p1Complete' in report).toBe(false);
  });

  it('CLI reports hashes, metadata and deltas without touching inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'round282-journey-ledger-'));
    try {
      const first = join(dir, 'c0.json');
      const second = join(dir, 'c1.json');
      writeFileSync(first, JSON.stringify(envelope()), 'utf8');
      writeFileSync(second, JSON.stringify(laterEnvelope()), 'utf8');
      const shaOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
      const before = [shaOf(first), shaOf(second)];

      const ok = spawnSync(process.execPath, [cliPath, 'unit-candidate-a', first, second], {encoding: 'utf8'});
      expect(ok.status).toBe(0);
      const okReport = JSON.parse(ok.stdout) as {files: Array<{path: string; sha256: string; envelopeMetadata: {candidate: string}}>; ledger: {ok: boolean; deltas: {resources: {currency: Array<{delta: number}>}}}};
      expect(okReport.files.map((file) => file.sha256)).toEqual(before);
      expect(okReport.files[0]!.envelopeMetadata.candidate).toBe('unit-candidate-a');
      expect(okReport.ledger.ok).toBe(true);
      expect(okReport.ledger.deltas.resources.currency[0]!.delta).toBe(-38);
      expect([shaOf(first), shaOf(second)]).toEqual(before);

      const rolledBack = join(dir, 'rollback.json');
      writeFileSync(rolledBack, JSON.stringify(envelope({}, {elapsedGameMinutes: 9})), 'utf8');
      const bad = spawnSync(process.execPath, [cliPath, 'unit-candidate-a', first, rolledBack], {encoding: 'utf8'});
      expect(bad.status).toBe(1);
      expect((JSON.parse(bad.stdout) as {ledger: {violations: Array<{code: string}>}}).ledger.violations.map((v) => v.code)).toContain('ELAPSED_TIME_ROLLBACK');

      const usage = spawnSync(process.execPath, [cliPath], {encoding: 'utf8'});
      expect(usage.status).toBe(2);
      expect(usage.stderr).toContain('Usage');
      expect([shaOf(first), shaOf(second)]).toEqual(before);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
