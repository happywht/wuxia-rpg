import { readFile, writeFile } from 'node:fs/promises';
import { people, relays } from './lib/round105-people-content.mjs';
import { addRelayFollowups } from './lib/round136-relay-followups.mjs';
for (const file of new Set(relays.map(relay => people.find(p => p.dialogueId === relay.targetDialogueId).file))) {
  const path = new URL(`../data/base/dialogues/${file}`, import.meta.url);
  const raw = await readFile(path, 'utf8'), set = JSON.parse(raw);
  for (const conversation of set.conversations) addRelayFollowups(conversation, relays);
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const after = (JSON.stringify(set, null, 2) + '\n').replace(/\n/g, newline);
  if (after !== raw) await writeFile(path, after);
}
console.log('Round136: six pure followups on three existing recipients; no rewards or save fields.');
