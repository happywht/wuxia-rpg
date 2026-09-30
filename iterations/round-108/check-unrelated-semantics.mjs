import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const file='data/base/endings/round-27-endings.json';
const base=JSON.parse(execFileSync('git',['show',`87f5fbd9bd5c074b31800a03502236081ba782ed:${file}`],{encoding:'utf8'}));
const current=JSON.parse(fs.readFileSync(file,'utf8'));
const ids=new Set(['ending.r42-open-register','ending.r42-sheltered-witness','ending.open-water']);
for(const ending of current.endings){if(ids.has(ending.id)){assert.ok(ending.unlockRoutes?.length);assert.ok(ending.epilogueSections?.length);delete ending.unlockRoutes;delete ending.epilogueSections;}}
assert.deepEqual(current,base);
const paths=execFileSync('git',['diff','--name-only','--','data/base'],{encoding:'utf8'}).trim().split('\n');
assert.deepEqual(paths,[file]);
console.log('PASS: 七个原结局/入口/条件/引言语义保持；基础资料仅三个结局新增R108字段。');
