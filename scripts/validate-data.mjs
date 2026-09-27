/**
 * Thin CLI entry for `npm run validate:data` (Round 38).
 *
 * All validation logic lives in `scripts/lib/data-validation.mjs`, shared
 * with the Vitest suite. This entry only maps the structured result to the
 * console: the success line is byte-identical to the previous behaviour and
 * a failure still exits non-zero (problems go to stderr).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBaseData } from './lib/data-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await validateBaseData(root);
if (result.ok) {
  console.log('通过：manifest Schema 与 ' + result.validated + ' 个基础资源 Schema。');
} else {
  for (const problem of result.problems) {
    console.error('校验失败：' + problem);
  }
  process.exitCode = 1;
}
