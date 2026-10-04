import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {repairDialogueRaw,dialoguePatches} from '../scripts/lib/round276-cloud-challenge.mjs';
const path='data/base/dialogues/round-74-cloud-ridge-conversations.json';
const current=readFileSync(path,'utf8');
const parent=execFileSync('git',['show','bff5245:'+path],{encoding:'utf8',maxBuffer:1000000});
describe('Round280 cloud challenge and purposeful return',()=>{
 it('upgrades the exact Round279 parent and is byte idempotent for both line endings',()=>{expect(JSON.parse(repairDialogueRaw(parent))).toEqual(JSON.parse(current));for(const eol of ['\n','\r\n']){const raw=current.replace(/\r?\n/g,eol);expect(repairDialogueRaw(raw)).toBe(raw);}});
 it('changes only two texts, never conditions effects rewards or stable IDs',()=>{const before=JSON.parse(parent),after=JSON.parse(current);for(const id of ['bridge-accepted','bridge-complete']){const n=after.conversations[0].nodes.find((n:{id:string})=>n.id===id);n.text=before.conversations[0].nodes.find((n:{id:string})=>n.id===id).text;}expect(after).toEqual(before);});
 it('provides actual local targets and distinguishes paid rewards from a report',()=>{const nodes=JSON.parse(current).conversations[0].nodes;const accept=nodes.find((n:{id:string})=>n.id==='bridge-accepted').text;expect(accept).toContain('(72,42)');expect(accept).toContain('(75,42)');expect(accept).toContain('Q');expect(accept).toContain('N');const done=nodes.find((n:{id:string})=>n.id==='bridge-complete').text;expect(done).toContain('已经到账');expect(done).toContain('复谈不会再领');expect(done).toContain('护索尚待修补');expect(done).toContain('不必');});
 it('rejects arbitrary drift and duplicate managed nodes even with predecessor support',()=>{const doc=JSON.parse(parent),n=doc.conversations[0].nodes.find((n:{id:string})=>n.id==='bridge-accepted');n.text+='漂移';expect(()=>repairDialogueRaw(JSON.stringify(doc))).toThrow('漂移');n.text=dialoguePatches.find(p=>p.id==='bridge-accepted')!.after;doc.conversations[0].nodes.push({...n});expect(()=>repairDialogueRaw(JSON.stringify(doc))).toThrow('不唯一');});
});
