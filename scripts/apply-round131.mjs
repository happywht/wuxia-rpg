import { readFileSync, writeFileSync } from 'node:fs';
import { applyCompanionTrust } from './lib/round131-companion-trust.mjs';
const target = new URL('../data/base/dialogues/round-03-conversations.json', import.meta.url);
const raw = readFileSync(target, 'utf8');
const out = applyCompanionTrust(raw);
if (out !== raw) writeFileSync(target, out);
console.log(out === raw ? 'round131 already applied' : 'round131 trust applied');
