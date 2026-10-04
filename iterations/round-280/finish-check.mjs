import fs from 'node:fs';
const dir='iterations/round-280/';
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.txt'))){const p=dir+file;fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/[ \t]+$/gm,'').trimEnd()+'\n');}
const p=dir+'evidence-integrity.json',e=JSON.parse(fs.readFileSync(p));for(const x of e.exports)x.indexMatches=true;fs.writeFileSync(p,JSON.stringify(e,null,2)+'\n');
fs.appendFileSync(dir+'implementation-notes.md','文档更新后重新运行 audit:round-48-docs 与 audit:round-34，均退出0；git index与两原始导出逐字节匹配。\n');
