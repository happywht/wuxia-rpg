// Round 129 incremental authoring: the two reserved no-effect iron-practice
// briefs for Shi Bei and Gu Yechen. Idempotent (exact applied-state check,
// one-way legacy-text migration); refuses drifted anchors WITHOUT mutating
// the file — the raw is parsed and the computed output JSON-parsed before
// anything is written. Paths are absolute via import.meta.url, so the runner
// works from any cwd.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addIronPracticeBriefs } from './lib/round129-iron-practice-brief.mjs';

const target = new URL('../data/base/dialogues/round-03-conversations.json', import.meta.url);
const path = fileURLToPath(target);
const raw = readFileSync(path, 'utf8');

// Refuse invalid raw without mutation: the input itself must parse.
const inputJson = JSON.parse(raw);

let out;
try {
  out = addIronPracticeBriefs(raw);
} catch (error) {
  console.error(`round129 refused (file untouched): ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
  throw error;
}

// The computed output must also be valid JSON before any write happens.
const outputJson = JSON.parse(out);
if (outputJson.conversations.length !== inputJson.conversations.length) {
  throw new Error('round129 自检失败：对话数量变化。');
}

if (out !== raw) {
  writeFileSync(path, out);
  console.log('round129 applied; byte delta:', out.length - raw.length);
} else {
  console.log('round129 already applied; delta 0');
}
console.log('round129 self-check: computed output parses, conversation count unchanged.');
