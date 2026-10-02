import { readFile, writeFile } from 'node:fs/promises';
import { patchBookshopEscortRaw } from './lib/round149-bookshop-escort.mjs';
const path = 'data/base/dialogues/round-03-conversations.json';
const original = await readFile(path, 'utf8');
const updated = patchBookshopEscortRaw(original);
if (updated !== original) await writeFile(path, updated);
