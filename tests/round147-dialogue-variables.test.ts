/**
 * Round 147 unit tests for persistent dialogue variables: protocol guards,
 * defensive graph parsing, runtime condition semantics, atomic effect
 * transactions, save capture/parse/restore (including old v1 defaults and
 * malformed-present rejection), the shipped no-reward repeat interaction on
 * the existing bookshop NPC, and the GridScene save wiring.
 *
 * Engine-level only: no Phaser Game boot, no browser, no network. The scene
 * wiring block follows the established source-assertion pattern (see
 * round115-navigation-budget.test.ts).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES,
  isDialogueVariableConditionMet,
  isFiniteDialogueVariableValue,
  isSafeDialogueVariableKey,
  type DialogueVariableValue,
} from '../src/engine/dialogue-variables';
import {
  type DialogueNodeData,
  parseDialogueSet,
  validateConversation,
} from '../src/engine/dialogue-graph';
import {
  type DialogueRuntimeContext,
  applyDialogueEffects,
  getVisibleOptions,
  isConditionMet,
} from '../src/engine/dialogue-runtime';
import { createFactionMembershipState } from '../src/engine/faction-system';
import { createQuestJournal, type QuestData } from '../src/engine/quest-system';
import { createSocialState } from '../src/engine/social-state';
import {
  type ItemRecordData,
  createInventoryState,
} from '../src/engine/item-system';
import { createCharacterState, parseCharacterProfileSet, type CharacterProfileData } from '../src/engine/character-progression';
import {
  captureSaveSnapshot,
  parseSaveSnapshot,
  planSnapshotRestore,
  restoreRunState,
} from '../src/engine/save-system';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuest(id: string): QuestData {
  return {
    id,
    name: `差事 ${id}`,
    description: '测试用任务说明。',
    giverNpcId: 'npc-elder',
    prerequisiteQuestIds: [],
    objectives: [
      { id: `${id}-obj`, kind: 'talkToNpc', targetId: 'npc-farmer', requiredCount: 1, text: '带话' },
    ],
    failOnEncounterIds: [],
    rewards: { experience: 10, currency: 5 },
  };
}

const TEST_ITEM: ItemRecordData = {
  id: 'item.test-herb',
  name: '测试草药',
  description: '仅用于本轮测试的普通物品。',
  category: 'misc',
  stackLimit: 9,
  buyPrice: 10,
  sellPrice: 5,
  consumable: null,
  equipment: null,
};

/** Minimal but fully-typed runtime context; overrides patch single fields. */
function loadProfile(): CharacterProfileData {
  const profileSource = JSON.parse(
    readFileSync(new URL('../data/base/characters/round-04-profiles.json', import.meta.url), 'utf8'),
  );
  const profiles = parseCharacterProfileSet(profileSource);
  if (!profiles.ok) throw new Error(profiles.errors.join('; '));
  return profiles.set.profiles[0]!;
}

function createContext(overrides: Partial<DialogueRuntimeContext> = {}): DialogueRuntimeContext {
  const profile = loadProfile();
  const quests = new Map([['quest-main', makeQuest('quest-main')]]);
  return {
    quests,
    journal: createQuestJournal(quests),
    items: new Map([[TEST_ITEM.id, TEST_ITEM]]),
    inventory: createInventoryState(profile, [{ itemId: TEST_ITEM.id, quantity: 2 }]),
    social: createSocialState(),
    speakerNpcId: 'npc-elder',
    knownKnowledgeNodeIds: new Set(),
    knowledgeNodes: new Map(),
    character: createCharacterState(profile),
    factions: new Map(),
    martialArts: new Map(),
    factionState: createFactionMembershipState(),
    timeOfDayPeriodId: 'morning',
    ...overrides,
  };
}

/** One option document with a variable condition and/or a setVariable effect. */
function documentWith(
  condition?: unknown,
  effect?: unknown,
): unknown {
  return {
    conversations: [
      {
        id: 'dlg.test-vars',
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            text: '说吧。',
            options: [
              {
                text: '好的。',
                nextNodeId: 'end',
                ...(condition === undefined ? {} : { conditions: [condition] }),
                ...(effect === undefined ? {} : { effects: [effect] }),
              },
            ],
          },
          { id: 'end', text: '后会有期。' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Protocol guards (dialogue-variables.ts)
// ---------------------------------------------------------------------------

describe('Round147 variable protocol guards', () => {
  it('accepts letter-led bounded keys and rejects unsafe ones', () => {
    for (const key of ['dlg.shen-mohan.news-asked', 'a', 'A-b_C.d', 'x'.repeat(64)]) {
      expect(isSafeDialogueVariableKey(key)).toBe(true);
    }
    for (const key of [
      '', // empty
      '1abc', // digit-led
      '_private', // underscore-led (also blocks __proto__ by shape)
      '__proto__', 'prototype', 'constructor', // explicit prototype names
      'has space', ' diálogo', 'a/b', 'a#b',
      'x'.repeat(65), // over the length bound
      42, null, undefined, {}, // non-strings
    ]) {
      expect(isSafeDialogueVariableKey(key)).toBe(false);
    }
  });

  it('accepts only finite JSON scalars as values', () => {
    for (const value of [true, false, 0, -7, 3.5, 1_000_000_000, '', '短句', 'y'.repeat(200)]) {
      expect(isFiniteDialogueVariableValue(value)).toBe(true);
    }
    for (const value of [
      null, undefined, NaN, Infinity, -Infinity,
      1_000_000_000.5, // beyond the numeric bound
      'y'.repeat(201), // beyond the string bound
      [1], { v: 1 }, () => 1, Symbol('x'),
    ]) {
      expect(isFiniteDialogueVariableValue(value)).toBe(false);
    }
  });

  it('evaluates the explicit missing semantics for every operator', () => {
    const empty: Map<string, DialogueVariableValue> | undefined = undefined;
    // No ledger at all: exists/eq/orderings fail, missing/ne hold.
    expect(isDialogueVariableConditionMet({ key: 'k', operator: 'exists' }, empty)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'k', operator: 'missing' }, empty)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'k', operator: 'eq', value: true }, empty)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'k', operator: 'ne', value: true }, empty)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'k', operator: 'ge', value: 0 }, empty)).toBe(false);

    const ledger = new Map<string, DialogueVariableValue>([
      ['flag', true],
      ['count', 3],
      ['word', '风'],
    ]);
    // Presence checks.
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'exists' }, ledger)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'missing' }, ledger)).toBe(false);
    // eq: same type + same value; cross-type never equals.
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'eq', value: true }, ledger)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'eq', value: false }, ledger)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'count', operator: 'eq', value: '3' }, ledger)).toBe(false);
    // ne is eq's exact negation (missing counts as "not equal").
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'ne', value: false }, ledger)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'flag', operator: 'ne', value: true }, ledger)).toBe(false);
    // Orderings compare numbers only; non-number pairs fail closed.
    expect(isDialogueVariableConditionMet({ key: 'count', operator: 'lt', value: 4 }, ledger)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'count', operator: 'le', value: 3 }, ledger)).toBe(true);
    expect(isDialogueVariableConditionMet({ key: 'count', operator: 'gt', value: 3 }, ledger)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'count', operator: 'ge', value: 4 }, ledger)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'word', operator: 'lt', value: '雨' }, ledger)).toBe(false);
    expect(isDialogueVariableConditionMet({ key: 'word', operator: 'ge', value: 3 }, ledger)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Graph parser (dialogue-graph.ts)
// ---------------------------------------------------------------------------

describe('Round147 dialogue graph parsing', () => {
  it('keeps valid variable conditions and setVariable effects', () => {
    const result = parseDialogueSet(documentWith(
      { kind: 'variable', key: 'dlg.t.news-asked', operator: 'missing' },
      { kind: 'setVariable', key: 'dlg.t.news-asked', value: true },
    ));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    const option = result.set.conversations[0]!.nodes[0]!.options![0]!;
    expect(option.conditions).toEqual([
      { kind: 'variable', key: 'dlg.t.news-asked', operator: 'missing' },
    ]);
    expect(option.effects).toEqual([
      { kind: 'setVariable', key: 'dlg.t.news-asked', value: true },
    ]);
    expect(validateConversation(result.set.conversations[0]!)).toEqual([]);
  });

  it('parses comparison operators with scalars of every type', () => {
    for (const condition of [
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: '风' },
      { kind: 'variable', key: 'dlg.t.k', operator: 'ne', value: false },
      { kind: 'variable', key: 'dlg.t.k', operator: 'lt', value: 12 },
      { kind: 'variable', key: 'dlg.t.k', operator: 'le', value: -3 },
      { kind: 'variable', key: 'dlg.t.k', operator: 'gt', value: 0 },
      { kind: 'variable', key: 'dlg.t.k', operator: 'ge', value: 1_000_000_000 },
    ]) {
      const result = parseDialogueSet(documentWith(condition));
      expect(result.ok, JSON.stringify(condition)).toBe(true);
      if (result.ok) expect(result.warnings).toEqual([]);
    }
  });

  it('rejects unsafe keys, non-scalar values and operator/value mismatches', () => {
    const badConditions: unknown[] = [
      { kind: 'variable', key: '__proto__', operator: 'exists' },
      { kind: 'variable', key: 'constructor', operator: 'missing' },
      { kind: 'variable', key: 'prototype', operator: 'eq', value: 1 },
      { kind: 'variable', key: '1-led', operator: 'exists' },
      { kind: 'variable', key: 'x'.repeat(65), operator: 'exists' },
      { kind: 'variable', operator: 'exists' }, // missing key
      { kind: 'variable', key: 'dlg.t.k', operator: 'bogus' },
      { kind: 'variable', key: 'dlg.t.k', operator: 'exists', value: true }, // presence + value
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq' }, // comparison without value
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: null },
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: { a: 1 } },
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: [1] },
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: 2_000_000_000 },
      { kind: 'variable', key: 'dlg.t.k', operator: 'eq', value: 'z'.repeat(201) },
    ];
    for (const condition of badConditions) {
      const result = parseDialogueSet(documentWith(condition));
      expect(result.ok, JSON.stringify(condition)).toBe(true);
      if (result.ok) {
        // The conversation is disabled with a readable warning instead.
        expect(result.set.conversations).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    }
    const badEffects: unknown[] = [
      { kind: 'setVariable', key: '__proto__', value: 1 },
      { kind: 'setVariable', key: 'dlg.t.k' }, // missing value
      { kind: 'setVariable', value: 1 }, // missing key
      { kind: 'setVariable', key: 'dlg.t.k', value: null },
      { kind: 'setVariable', key: 'dlg.t.k', value: 'z'.repeat(201) },
      { kind: 'setVariable', key: 'dlg.t.k', value: 2_000_000_000 },
      { kind: 'setVariable', key: 'dlg.t.k', value: [true] },
    ];
    for (const effect of badEffects) {
      const result = parseDialogueSet(documentWith(undefined, effect));
      expect(result.ok, JSON.stringify(effect)).toBe(true);
      if (result.ok) {
        expect(result.set.conversations).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime: conditions and atomic effect transactions
// ---------------------------------------------------------------------------

describe('Round147 runtime conditions and atomic setVariable', () => {
  it('filters options through variable conditions and follows the write', () => {
    const context = createContext({ dialogueVariables: new Map() });
    const node: DialogueNodeData = {
      id: 'start',
      text: '说吧。',
      options: [
        {
          text: '初次打听',
          nextNodeId: 'end',
          conditions: [{ kind: 'variable', key: 'dlg.t.news-asked', operator: 'missing' as const }],
          effects: [{ kind: 'setVariable', key: 'dlg.t.news-asked', value: true }],
        },
        {
          text: '再讲一遍',
          nextNodeId: 'end',
          conditions: [{ kind: 'variable', key: 'dlg.t.news-asked', operator: 'exists' as const }],
        },
      ],
    };
    const before = getVisibleOptions(node, context);
    expect(before.map((entry) => entry.option.text)).toEqual(['初次打听']);
    const applied = applyDialogueEffects(before[0]!.option.effects!, context);
    expect(applied.ok).toBe(true);
    expect(context.dialogueVariables?.get('dlg.t.news-asked')).toBe(true);
    const after = getVisibleOptions(node, context);
    expect(after.map((entry) => entry.option.text)).toEqual(['再讲一遍']);
    // The repeat branch carries no effects at all — repeating pays nothing.
    expect(after[0]!.option.effects).toBeUndefined();
    // And confirming it again neither changes state nor duplicates rewards.
    const repeat = applyDialogueEffects(after[0]!.option.effects ?? [], context);
    expect(repeat.ok).toBe(true);
    expect(context.dialogueVariables?.get('dlg.t.news-asked')).toBe(true);
  });

  it('isConditionMet handles variable without a ledger (legacy contexts)', () => {
    const context = createContext(); // dialogueVariables deliberately omitted
    expect(context.dialogueVariables).toBeUndefined();
    expect(isConditionMet({ kind: 'variable', key: 'k', operator: 'missing' }, context)).toBe(true);
    expect(isConditionMet({ kind: 'variable', key: 'k', operator: 'exists' }, context)).toBe(false);
    expect(isConditionMet({ kind: 'variable', key: 'k', operator: 'ne', value: 1 }, context)).toBe(true);
    expect(isConditionMet({ kind: 'variable', key: 'k', operator: 'eq', value: 1 }, context)).toBe(false);
  });

  it('rolls the whole option back when a later effect refuses', () => {
    const context = createContext({ dialogueVariables: new Map() });
    const result = applyDialogueEffects([
      { kind: 'setVariable', key: 'dlg.t.first', value: '风' },
      { kind: 'setVariable', key: 'dlg.t.second', value: 7 },
      // takeItem asks for more than the fixture carries (2): refuses.
      { kind: 'takeItem', itemId: TEST_ITEM.id, quantity: 3 },
    ], context);
    expect(result.ok).toBe(false);
    expect(context.dialogueVariables?.size ?? 0).toBe(0); // atomic rollback
    expect(context.inventory?.stacks).toHaveLength(1);
    expect(result.ok ? null : result.reason).toContain(TEST_ITEM.name);

    // Refusal first, write later: still nothing leaks.
    const reversed = applyDialogueEffects([
      { kind: 'takeItem', itemId: TEST_ITEM.id, quantity: 3 },
      { kind: 'setVariable', key: 'dlg.t.first', value: '风' },
    ], context);
    expect(reversed.ok).toBe(false);
    expect(context.dialogueVariables?.size ?? 0).toBe(0);
  });

  it('commits multiple writes together and lets later writes win per key', () => {
    const context = createContext({ dialogueVariables: new Map() });
    const result = applyDialogueEffects([
      { kind: 'setVariable', key: 'dlg.t.choice', value: '公开' },
      { kind: 'setVariable', key: 'dlg.t.choice', value: '隐去' },
      { kind: 'setVariable', key: 'dlg.t.count', value: 2 },
    ], context);
    expect(result.ok).toBe(true);
    expect(context.dialogueVariables?.get('dlg.t.choice')).toBe('隐去');
    expect(context.dialogueVariables?.get('dlg.t.count')).toBe(2);
    if (result.ok) {
      expect(result.summary.lines.join('·')).toContain('已记下');
      expect(result.summary.lines.join('·')).toContain('已改记');
      expect(result.summary.lines.join('·')).not.toContain('dlg.t.');
    }
  });

  it('refuses writes without a ledger and when the ledger is full', () => {
    const ledgerless = createContext();
    const refused = applyDialogueEffects(
      [{ kind: 'setVariable', key: 'dlg.t.k', value: true }],
      ledgerless,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain('变量簿');

    const full = createContext({ dialogueVariables: new Map() });
    for (let i = 0; i < DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES; i += 1) {
      full.dialogueVariables!.set(`dlg.t.fill-${i}`, i);
    }
    // A brand-new key beyond the cap refuses…
    const overflow = applyDialogueEffects(
      [{ kind: 'setVariable', key: 'dlg.t.new-key', value: 1 }],
      full,
    );
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.reason).toContain('已记满');
    expect(full.dialogueVariables!.has('dlg.t.new-key')).toBe(false);
    // …while overwriting one of the existing keys still commits.
    const overwrite = applyDialogueEffects(
      [{ kind: 'setVariable', key: 'dlg.t.fill-0', value: 99 }],
      full,
    );
    expect(overwrite.ok).toBe(true);
    expect(full.dialogueVariables!.get('dlg.t.fill-0')).toBe(99);
    expect(full.dialogueVariables!.size).toBe(DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES);
  });

  it('never leaks partial writes when the atomic ledger-full refusal fires', () => {
    const context = createContext({ dialogueVariables: new Map() });
    for (let i = 0; i < DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES - 1; i += 1) {
      context.dialogueVariables!.set(`dlg.t.fill-${i}`, i);
    }
    const result = applyDialogueEffects([
      { kind: 'setVariable', key: 'dlg.t.last-slot', value: '占位' }, // fits exactly
      { kind: 'setVariable', key: 'dlg.t.beyond', value: true }, // refuses
    ], context);
    expect(result.ok).toBe(false);
    // The first write must not survive the second one's refusal.
    expect(context.dialogueVariables!.has('dlg.t.last-slot')).toBe(false);
    expect(context.dialogueVariables!.size).toBe(DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES - 1);
  });
});

// ---------------------------------------------------------------------------
// Save protocol: capture/parse round-trip, old v1 defaults, malformed rejects
// ---------------------------------------------------------------------------

describe('Round147 save persistence', () => {
  const baseCapture = (dialogueVariables?: Map<string, DialogueVariableValue>) => {
    const context = createContext(dialogueVariables === undefined ? {} : { dialogueVariables });
    return captureSaveSnapshot({
      displayName: '变量测试',
      mapResourceId: 'map.round-01-grid',
      playerCol: 1,
      playerRow: 1,
      character: context.character!,
      inventory: context.inventory!,
      journal: context.journal,
      social: context.social,
      shopStocks: new Map(),
      completedEncounters: new Set(),
      completedRegionalEvents: new Set(),
      knownKnowledgeNodeIds: context.knownKnowledgeNodeIds,
      elapsedGameMinutes: 10,
      worldSeed: 123,
      ...(dialogueVariables === undefined ? {} : { dialogueVariables }),
      now: () => new Date('2026-10-02T08:00:00Z'),
    });
  };

  const minimalRefs = (profileId: string) => ({
    profileIds: new Set([profileId]),
    mapResourceId: 'map.round-01-grid',
    isWalkableCell: () => true,
    isCellOccupied: () => false,
    itemIds: new Set([TEST_ITEM.id]),
    martialArtIds: new Set<string>(),
    questIds: new Set(['quest-main']),
    questObjectiveIds: new Map([['quest-main', new Set(['quest-main-obj'])]]),
    encounterIds: new Set<string>(),
    shopIds: new Set<string>(),
    npcIds: new Set<string>(),
  });

  const profileOf = () => {
    const context = createContext();
    // The context's profile is embedded in its character state id.
    return context.character!.profileId;
  };

  it('captures, parses, plans and restores variable entries losslessly', () => {
    const ledger = new Map<string, DialogueVariableValue>([
      ['dlg.shen-mohan.news-asked', true],
      ['dlg.test.count', 12],
      ['dlg.test.word', '风'],
    ]);
    const snapshot = baseCapture(ledger);
    expect(snapshot.dialogueVariables).toEqual([
      { key: 'dlg.shen-mohan.news-asked', value: true },
      { key: 'dlg.test.count', value: 12 },
      { key: 'dlg.test.word', value: '风' },
    ]);

    const parsed = parseSaveSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.dialogueVariables).toHaveLength(3);

    const profileId = profileOf();
    const plan = planSnapshotRestore(parsed.snapshot, minimalRefs(profileId));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.snapshot.dialogueVariables).toHaveLength(3);

    const restored = restoreRunState({
      profile: loadProfile(),
      items: new Map([[TEST_ITEM.id, TEST_ITEM]]),
      quests: new Map([['quest-main', makeQuest('quest-main')]]),
      shops: new Map(),
      snapshot: plan.snapshot,
    });
    expect(restored.dialogueVariables.get('dlg.shen-mohan.news-asked')).toBe(true);
    expect(restored.dialogueVariables.get('dlg.test.count')).toBe(12);
    expect(restored.dialogueVariables.get('dlg.test.word')).toBe('风');
    // Fresh allocation: mutating the restored ledger never touches the snapshot.
    restored.dialogueVariables.set('dlg.test.extra', 1);
    expect(plan.snapshot.dialogueVariables).toHaveLength(3);
  });

  it('defaults an absent dialogueVariables field to empty (old v1 saves)', () => {
    const snapshot = baseCapture();
    const raw = JSON.parse(JSON.stringify(snapshot));
    expect('dialogueVariables' in raw).toBe(true);
    delete raw.dialogueVariables; // simulate a pre-R147 v1 save
    const parsed = parseSaveSnapshot(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.dialogueVariables).toEqual([]);

    const plan = planSnapshotRestore(parsed.snapshot, minimalRefs(profileOf()));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const restored = restoreRunState({
      profile: loadProfile(),
      items: new Map([[TEST_ITEM.id, TEST_ITEM]]),
      quests: new Map([['quest-main', makeQuest('quest-main')]]),
      shops: new Map(),
      snapshot: plan.snapshot,
    });
    expect(restored.dialogueVariables.size).toBe(0);
  });

  it('rejects malformed present dialogueVariables fields with readable errors', () => {
    const snapshot = baseCapture();
    const mutate = (value: unknown) => {
      const raw = JSON.parse(JSON.stringify(snapshot));
      raw.dialogueVariables = value;
      return parseSaveSnapshot(raw);
    };
    // Not an array.
    expect(mutate({}).ok).toBe(false);
    // Over the entry cap.
    expect(mutate(
      Array.from({ length: DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES + 1 }, (_, i) => ({
        key: `dlg.t.k-${i}`, value: 1,
      })),
    ).ok).toBe(false);
    // Prototype-style and unsafe keys.
    expect(mutate([{ key: '__proto__', value: 1 }]).ok).toBe(false);
    expect(mutate([{ key: 'constructor', value: 1 }]).ok).toBe(false);
    expect(mutate([{ key: '1-led', value: 1 }]).ok).toBe(false);
    // Non-scalar / out-of-bound values.
    expect(mutate([{ key: 'dlg.t.k', value: null }]).ok).toBe(false);
    expect(mutate([{ key: 'dlg.t.k', value: { a: 1 } }]).ok).toBe(false);
    expect(mutate([{ key: 'dlg.t.k', value: 2_000_000_000 }]).ok).toBe(false);
    expect(mutate([{ key: 'dlg.t.k', value: 'z'.repeat(201) }]).ok).toBe(false);
    // Duplicate keys.
    expect(mutate([{ key: 'dlg.t.k', value: 1 }, { key: 'dlg.t.k', value: 2 }]).ok).toBe(false);
    // Error messages name the field for at least one representative case.
    const duplicate = mutate([{ key: 'dlg.t.k', value: 1 }, { key: 'dlg.t.k', value: 2 }]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.errors.some((line) => line.includes('dialogueVariables'))).toBe(true);
      expect(duplicate.errors.some((line) => line.includes('重复'))).toBe(true);
    }
    const proto = mutate([{ key: '__proto__', value: 1 }]);
    expect(proto.ok).toBe(false);
    if (!proto.ok) {
      expect(proto.errors.some((line) => line.includes('dialogueVariables'))).toBe(true);
    }
  });

  it('round-trips a save written to and read from a slot-shaped JSON string', () => {
    const ledger = new Map<string, DialogueVariableValue>([['dlg.shen-mohan.news-asked', true]]);
    const snapshot = baseCapture(ledger);
    const text = JSON.stringify(snapshot);
    const parsed = parseSaveSnapshot(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.dialogueVariables).toEqual([
      { key: 'dlg.shen-mohan.news-asked', value: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Shipped data instance: no-reward repeat talk on the existing bookshop NPC
// ---------------------------------------------------------------------------

describe('Round147 shipped bookshop repeat interaction', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const set = parseDialogueSet(
    JSON.parse(readFileSync(`${root}/data/base/dialogues/round-03-conversations.json`, 'utf8')),
  );

  it('ships a valid conversation using the variable protocol', () => {
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const conversation = set.set.conversations.find((entry) => entry.id === 'dlg.shen-mohan-bookshop');
    expect(conversation).toBeDefined();
    expect(set.warnings).toEqual([]);
    expect(validateConversation(conversation!)).toEqual([]);
  });

  it('keeps the first ask gated on missing, the repeat on exists, with no rewards', () => {
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const conversation = set.set.conversations.find((entry) => entry.id === 'dlg.shen-mohan-bookshop')!;
    const greet = conversation.nodes.find((node) => node.id === 'greet')!;
    const first = greet.options!.find((option) => option.nextNodeId === 'news-first');
    const repeat = greet.options!.find((option) => option.nextNodeId === 'news-repeat');
    expect(first).toBeDefined();
    expect(repeat).toBeDefined();

    expect(first!.conditions).toEqual([
      { kind: 'variable', key: 'dlg.shen-mohan.news-asked', operator: 'missing' },
    ]);
    expect(first!.effects).toEqual([
      { kind: 'setVariable', key: 'dlg.shen-mohan.news-asked', value: true },
    ]);
    expect(repeat!.conditions).toEqual([
      { kind: 'variable', key: 'dlg.shen-mohan.news-asked', operator: 'exists' },
    ]);
    // The repeat branch only re-narrates: no effects, hence no reward repeat.
    expect(repeat!.effects).toBeUndefined();

    const context = createContext({ dialogueVariables: new Map() });
    const visibleTexts = () =>
      getVisibleOptions(greet, context).map((entry) => entry.option.nextNodeId);
    expect(visibleTexts()).toContain('news-first');
    expect(visibleTexts()).not.toContain('news-repeat');
    const applied = applyDialogueEffects(first!.effects!, context);
    expect(applied.ok).toBe(true);
    expect(visibleTexts()).not.toContain('news-first');
    expect(visibleTexts()).toContain('news-repeat');
  });

  it('does not touch chapter-decision nodes of the conversation', () => {
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const conversation = set.set.conversations.find((entry) => entry.id === 'dlg.shen-mohan-bookshop')!;
    const nodeIds = conversation.nodes.map((node) => node.id);
    // Round-authored decision/report nodes stay untouched and unrewarded by us.
    for (const preserved of ['r103-hanshan-field-brief', 'r43-resolved-hanshan-copybook', 'r130-hanshan-paper-route']) {
      expect(nodeIds).toContain(preserved);
    }
    // The only setVariable in the shipped conversation is our news marker.
    const allEffects = conversation.nodes
      .flatMap((node) => node.options ?? [])
      .flatMap((option) => option.effects ?? []);
    expect(allEffects.filter((effect) => effect.kind === 'setVariable')).toEqual([
      { kind: 'setVariable', key: 'dlg.shen-mohan.news-asked', value: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// GridScene save wiring (source assertions; no Phaser Game boot)
// ---------------------------------------------------------------------------

describe('Round147 GridScene wiring', () => {
  const source = readFileSync(`${fileURLToPath(new URL('..', import.meta.url))}/src/game/grid-scene.ts`, 'utf8');

  it('keeps one run-owned ledger wired into the dialogue context and saves', () => {
    expect(source).toContain('private readonly dialogueVariables');
    // Runtime context: conditions and effects run against the live ledger.
    expect(source).toContain('companionState: this.companionState,');
    expect(source).toContain('dialogueVariables: this.dialogueVariables,');
    // Save capture: the ledger travels into every snapshot.
    expect(source).toContain('achievementState: this.achievementState,');
    expect(source).toContain('dialogueVariables: this.dialogueVariables,');
    // Restore: a save slot repopulates the ledger before play resumes.
    expect(source).toContain('for (const [key, value] of restoredRun.dialogueVariables) {');
    expect(source).toContain('this.dialogueVariables.set(key, value);');
    // World reset: a new world cannot inherit the previous run's decisions.
    expect(source).toContain('this.dialogueVariables.clear();');
  });
});
