import fs from 'node:fs';
import{addTransferDirections}from'./lib/round127-transfer-directions.mjs';
const path=new URL('../data/base/dialogues/round-03-conversations.json',import.meta.url);
let source=fs.readFileSync(path,'utf8');const prior=JSON.parse(source),next=addTransferDirections(prior);
for(let i=0;i<prior.conversations.length;i++) {
 const old=prior.conversations[i],c=next.conversations[i];if(JSON.stringify(old)===JSON.stringify(c))continue;
 const index=source.indexOf('"id": '+JSON.stringify(old.id)),start=source.lastIndexOf('{',index);
 let depth=0,quoted=false,escaped=false,end=start;
 for(;end<source.length;end++){const ch=source[end];if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end++;break;}}
 if(JSON.stringify(JSON.parse(source.slice(start,end)))!==JSON.stringify(old))throw Error('Wrong conversation boundary');
 const replacement=JSON.stringify(c,null,2).split('\n').map((line,n)=>n===0?line:'    '+line).join(source.includes('\r\n')?'\r\n':'\n');source=source.slice(0,start)+replacement+source.slice(end);
}
if(JSON.stringify(JSON.parse(source))!==JSON.stringify(next))throw Error('Output mismatch');fs.writeFileSync(path,source);
console.log('Round127: one mentor direction; historical observation wording; stable IDs/resources.');
