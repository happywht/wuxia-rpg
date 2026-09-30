import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deepenChapterEndings} from './lib/round108-ending-content.mjs';
const path=resolve('data/base/endings/round-27-endings.json');
const set=JSON.parse(await readFile(path,'utf8'));
await writeFile(path,JSON.stringify(deepenChapterEndings(set),null,2)+'\n');
