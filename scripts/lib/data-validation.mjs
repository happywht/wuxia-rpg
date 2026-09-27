/**
 * Shared base-data validator (Round 38).
 *
 * This is the single implementation behind `npm run validate:data` and the
 * Vitest data tests: it validates `data/base/manifest.json` against the
 * manifest schema, then every listed resource against its own schema. The
 * function is side-effect free — it never logs, never throws and never
 * touches process state, so the CLI entry and tests share the exact same
 * code path and observe identical outcomes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv from 'ajv';

/**
 * Validates the base data of one repository root.
 *
 * @param {string} root - Repository root holding `data/base` and `data/schema`.
 * @returns {Promise<{ok: true, validated: number} | {ok: false, problems: string[]}>}
 *   `validated` counts resources that passed their schema; `problems` carries
 *   one readable line per failed schema check or unreadable/parsable file.
 */
export async function validateBaseData(root) {
  const problems = [];
  const unreadable = Symbol('unreadable');
  const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });

  const safeRead = async (path, label) => {
    try {
      return await readJson(path);
    } catch (error) {
      problems.push(`${label}：无法读取或解析 JSON（${error.code ?? String(error)}）`);
      return unreadable;
    }
  };

  const safeCompile = (schema, label) => {
    try {
      return ajv.compile(schema);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(`${label}：Schema 编译失败（${reason}）`);
      return null;
    }
  };

  const manifest = await safeRead(resolve(root, 'data/base/manifest.json'), 'manifest.json');
  if (manifest === unreadable) {
    return { ok: false, problems };
  }
  const manifestSchema = await safeRead(
    resolve(root, 'data/schema/manifest.schema.json'),
    'manifest.schema.json',
  );
  if (manifestSchema === unreadable) {
    return { ok: false, problems };
  }

  const validateManifest = safeCompile(manifestSchema, 'manifest.schema.json');
  if (validateManifest === null) {
    return { ok: false, problems };
  }
  if (!validateManifest(manifest)) {
    problems.push('manifest.json：' + JSON.stringify(validateManifest.errors, null, 2));
    return { ok: false, problems };
  }

  let validated = 0;
  const compiled = new Map();
  for (const resource of manifest.resources) {
    let validate = compiled.get(resource.schema);
    if (validate === undefined) {
      const schema = await safeRead(
        resolve(root, 'data/schema', resource.schema + '.schema.json'),
        `${resource.schema}.schema.json`,
      );
      if (schema === unreadable) {
        continue;
      }
      validate = safeCompile(schema, `${resource.schema}.schema.json`);
      if (validate === null) {
        continue;
      }
      compiled.set(resource.schema, validate);
    }
    const data = await safeRead(resolve(root, 'data/base', resource.path), resource.id);
    if (data === unreadable) {
      continue;
    }
    if (!validate(data)) {
      problems.push(resource.id + '：' + JSON.stringify(validate.errors, null, 2));
      continue;
    }
    validated += 1;
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, validated };
}
