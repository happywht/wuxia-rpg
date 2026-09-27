/**
 * Type declarations for `scripts/lib/data-validation.mjs` so the strict
 * TypeScript tests (and any future TS consumer) can import the exact module
 * `npm run validate:data` runs, without duplicating the validation rules.
 */

export interface DataValidationSuccess {
  ok: true;
  /** Number of manifest resources that passed their schema. */
  validated: number;
}

export interface DataValidationFailure {
  ok: false;
  /** One readable line per failed schema check or unreadable data file. */
  problems: string[];
}

export type DataValidationResult = DataValidationSuccess | DataValidationFailure;

export function validateBaseData(root: string): Promise<DataValidationResult>;
