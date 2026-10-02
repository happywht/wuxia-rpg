/**
 * Round 147 dialogue variable protocol: bounded safe keys, typed finite
 * JSON scalars and explicit missing semantics for data-driven choices that
 * outlive a single conversation.
 *
 * The ledger is a plain `Map<string, DialogueVariableValue>` owned by the
 * scene and handed to the dialogue runtime through its context. A Map (not a
 * plain object) is deliberate: prototype keys such as `__proto__` cannot
 * pollute anything through it, and the key guard below still rejects them
 * outright so a hostile *save* or *MOD* never smuggles one past parsing.
 *
 * Everything here is pure protocol logic — no Phaser, no data loading — so
 * the graph parser, the runtime transaction and the save system all share
 * exactly one definition of "a legal variable key/value" (see
 * docs/DIALOGUE-GUIDE.md §3/§4 and docs/SAVES.md).
 */

/** One stored variable value: a finite JSON scalar (never null/undefined). */
export type DialogueVariableValue = string | number | boolean;

/**
 * Comparison operators a `variable` condition may use. `exists`/`missing`
 * only check key presence (no `value` field); the rest compare the stored
 * value against `value` under the missing semantics documented on
 * {@link isDialogueVariableConditionMet}.
 */
export type DialogueVariableOperator =
  | 'exists'
  | 'missing'
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge';

export const DIALOGUE_VARIABLE_OPERATORS: readonly DialogueVariableOperator[] = [
  'exists',
  'missing',
  'eq',
  'ne',
  'lt',
  'le',
  'gt',
  'ge',
];

/** Variable keys start with a letter and stay within this total length. */
export const DIALOGUE_VARIABLE_KEY_MAX_LENGTH = 64;

/** Upper bound on distinct keys one run may record (bounded memory). */
export const DIALOGUE_VARIABLE_LEDGER_MAX_ENTRIES = 64;

/** Upper bound on a stored string value's length. */
export const DIALOGUE_VARIABLE_STRING_MAX_LENGTH = 200;

/** Upper bound on |number| a variable may hold (finite by construction). */
export const DIALOGUE_VARIABLE_NUMBER_ABS_MAX = 1_000_000_000;

const KEY_PATTERN = new RegExp(`^[A-Za-z][A-Za-z0-9_.-]{0,${DIALOGUE_VARIABLE_KEY_MAX_LENGTH - 1}}$`);

/**
 * Keys a plain-object ledger must never accept. A Map makes them inert
 * anyway; rejecting them keeps saves and wire data free of hostile names.
 */
const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * True only for letter-led, pattern-bounded keys that are not prototype
 * names. This single guard backs the graph parser, the runtime effect
 * validation and the save parser.
 */
export function isSafeDialogueVariableKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length <= DIALOGUE_VARIABLE_KEY_MAX_LENGTH &&
    KEY_PATTERN.test(key) &&
    !PROTOTYPE_KEYS.has(key)
  );
}

/**
 * True only for finite JSON scalars: booleans, finite numbers within
 * ±DIALOGUE_VARIABLE_NUMBER_ABS_MAX, and strings up to the protocol length.
 * Null, undefined, NaN/Infinity, arrays and objects are refused.
 */
export function isFiniteDialogueVariableValue(value: unknown): value is DialogueVariableValue {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= DIALOGUE_VARIABLE_NUMBER_ABS_MAX;
  }
  if (typeof value === 'string') {
    return value.length <= DIALOGUE_VARIABLE_STRING_MAX_LENGTH;
  }
  return false;
}

/** Same-type, same-value equality; cross-type pairs are never equal. */
function valuesEqual(current: unknown, expected: unknown): boolean {
  return typeof current === typeof expected && current === expected;
}

/**
 * Evaluates one `variable` condition against the run ledger. Missing
 * semantics are explicit and total:
 *
 * - `exists` is true iff the key is recorded; `missing` is its negation —
 *   even when no ledger is wired into the context at all.
 * - `eq` requires the key to exist **and** hold a same-type equal value;
 *   `ne` is its exact negation, so a missing (or cross-type) key counts as
 *   "not equal" and the condition holds.
 * - `lt`/`le`/`gt`/`ge` compare numbers only: a missing key, a non-number
 *   stored value or a non-number expected value makes the condition fail.
 */
export function isDialogueVariableConditionMet(
  condition: {
    key: string;
    operator: DialogueVariableOperator;
    value?: DialogueVariableValue;
  },
  ledger: ReadonlyMap<string, DialogueVariableValue> | undefined,
): boolean {
  const has = ledger?.has(condition.key) ?? false;
  switch (condition.operator) {
    case 'exists':
      return has;
    case 'missing':
      return !has;
    case 'ne':
      // A missing (or differently typed) value is "not equal" to anything.
      return !has || !valuesEqual(ledger!.get(condition.key), condition.value);
    case 'eq':
      return has && valuesEqual(ledger!.get(condition.key), condition.value);
    case 'lt':
    case 'le':
    case 'gt':
    case 'ge': {
      if (!has) {
        return false;
      }
      const current = ledger!.get(condition.key);
      if (typeof current !== 'number' || typeof condition.value !== 'number') {
        return false;
      }
      switch (condition.operator) {
        case 'lt':
          return current < condition.value;
        case 'le':
          return current <= condition.value;
        case 'gt':
          return current > condition.value;
        case 'ge':
          return current >= condition.value;
      }
    }
  }
}
