// Round 130 incremental authoring: the two reserved no-effect Hanshan
// practice briefs (Liu Tinglan in round-30, Shen Mohan in round-03).
// Idempotent with exact applied-state checks; refuses drift WITHOUT mutating
// — raw and computed output are JSON-parsed before any write. Paths are
// absolute via import.meta.url, so any cwd works.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addHanshanBriefs } from './lib/round130-hanshan-practice-brief.mjs';

const pending = [];
for (const [name, file] of [['round-03-conversations.json', 'round-03'], ['round-30-conversations.json', 'round-30']]) {
  const target = new URL(`../data/base/dialogues/${name}`, import.meta.url);
  const path = fileURLToPath(target);
  const raw = readFileSync(path, 'utf8');
  const inputJson = JSON.parse(raw); // Refuse invalid raw without mutation.
  const before = inputJson.conversations.length;

  let out;
  try {
    out = addHanshanBriefs(raw, file);
  } catch (error) {
    console.error(`round130 refused ${name} (file untouched): ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    throw error;
  }
  const outputJson = JSON.parse(out); // Computed output must parse before writing.
  if (outputJson.conversations.length !== before) {
    throw new Error(`round130 自检失败：${name} 对话数量变化。`);
  }
  pending.push({ path, name, raw, out });
}
// Both inputs and both computed outputs must pass before the first write.
for (const { path, name, raw, out } of pending) {
  if (out !== raw) {
    writeFileSync(path, out);
    console.log(`round130 ${name} applied; byte delta:`, out.length - raw.length);
  } else {
    console.log(`round130 ${name} already applied; delta 0`);
  }
}
console.log('round130 self-check: both files parse, conversation counts unchanged.');
