import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const manifest = await readJson(resolve(root, 'data/base/manifest.json'));
const manifestSchema = await readJson(resolve(root, 'data/schema/manifest.schema.json'));
const validateManifest = ajv.compile(manifestSchema);
assert(validateManifest(manifest), JSON.stringify(validateManifest.errors, null, 2));
let validated = 0;
const compiled = new Map();
for (const resource of manifest.resources) {
  let validate = compiled.get(resource.schema);
  if (validate === undefined) {
    const schema = await readJson(resolve(root, 'data/schema', resource.schema + '.schema.json'));
    validate = ajv.compile(schema);
    compiled.set(resource.schema, validate);
  }
  const data = await readJson(resolve(root, 'data/base', resource.path));
  assert(validate(data), resource.id + ': ' + JSON.stringify(validate.errors, null, 2));
  validated += 1;
}
console.log('通过：manifest Schema 与 ' + validated + ' 个基础资源 Schema。');
