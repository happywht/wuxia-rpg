import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {verifyReleaseCandidate} from './lib/release-candidate.mjs';
const [root,commit]=process.argv.slice(2);
if(!root||!commit)throw Error('Usage: node scripts/verify-release-candidate.mjs <extracted package directory> <full candidate SHA>');
async function walk(dir,prefix=''){
 const files=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  const p=prefix+e.name;
  if(e.isSymbolicLink())throw Error('symlink forbidden: '+p);
  if(e.isDirectory())files.push(...await walk(path.join(dir,e.name),p+'/'));
  else if(e.isFile())files.push({path:p,content:await readFile(path.join(dir,e.name))});
  else throw Error('unsupported file: '+p);
 }
 return files;
}
const manifest=JSON.parse(await readFile(path.join(root,'release-manifest.json'),'utf8'));
console.log(JSON.stringify(verifyReleaseCandidate(manifest,await walk(root),commit),null,2));
