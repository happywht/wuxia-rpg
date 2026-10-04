import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {verifyReleaseCandidate} from '../scripts/lib/release-candidate.mjs';
const sha='1'.repeat(40);
const files=['index.html','base/manifest.json','THIRD-PARTY-NOTICES.md'].map(path=>({path,content:Buffer.from(path)}));
const manifest=()=>({formatVersion:1,sourceCommit:sha,files:files.map(f=>({path:f.path,bytes:f.content.length,sha256:createHash('sha256').update(f.content).digest('hex')}))});
describe('release candidate provenance',()=>{
 it('verifies every extracted byte against an independently chosen commit',()=>expect(verifyReleaseCandidate(manifest(),files,sha)).toEqual({sourceCommit:sha,verifiedFiles:3}));
 it('rejects absent or wrong source stamps and abbreviated expected hashes',()=>{for(const value of [null,'2'.repeat(40)])expect(()=>verifyReleaseCandidate({...manifest(),sourceCommit:value},files,sha)).toThrow('commit');expect(()=>verifyReleaseCandidate(manifest(),files,'123')).toThrow('SHA');});
 it('rejects tampered content and declared size',()=>{expect(()=>verifyReleaseCandidate(manifest(),[{...files[0]!,content:Buffer.from('bad')},...files.slice(1)],sha)).toThrow('mismatch');const m=manifest();m.files[0]!!.bytes++;expect(()=>verifyReleaseCandidate(m,files,sha)).toThrow('mismatch');});
 it('rejects extra extracted files and duplicates',()=>{expect(()=>verifyReleaseCandidate(manifest(),[...files,{path:'secret.txt',content:Buffer.from('x')}],sha)).toThrow('unlisted');expect(()=>verifyReleaseCandidate(manifest(),[...files,files[0]!],sha)).toThrow('duplicate');const m=manifest();m.files.push(m.files[0]!!);expect(()=>verifyReleaseCandidate(m,files,sha)).toThrow('duplicate');});
 it('rejects traversal paths and omitted critical payload',()=>{const m=manifest();m.files[0]!!.path='../index.html';expect(()=>verifyReleaseCandidate(m,files,sha)).toThrow('path');const n=manifest();n.files.shift();expect(()=>verifyReleaseCandidate(n,files.slice(1),sha)).toThrow('required');});
});
