import fs from 'node:fs';
const p='scripts/deepen-round104-crafting.mjs';let s=fs.readFileSync(p,'utf8');const old="const save = async (p, value) => writeFile(new URL(p, root),\n  (JSON.stringify(value, null, 2) + '\\n').replace(/\\n/g, p.includes('knowledge_graph/') ? '\\r\\n' : '\\n'));";
if(!s.includes(old))throw Error('save anchor');s=s.replace(old,`const save = async (p, value) => {
  const original = await readFile(new URL(p, root), 'utf8');
  if (JSON.stringify(JSON.parse(original)) === JSON.stringify(value)) return;
  const eol = original.includes('\\r\\n') ? '\\r\\n' : '\\n';
  await writeFile(new URL(p, root), (JSON.stringify(value, null, 2) + '\\n').replace(/\\n/g, eol));
};`);fs.writeFileSync(p,s);
fs.appendFileSync('iterations/round-281/plan.md','\n第三次修复候选全套199文件1794测试中R103/R279通过，揭示R104同类强制CRLF问题（1项失败）。同样修复save按原行尾、语义未变零落盘，不改游戏资料。更新冻结工程候选后完整重跑；前候选尚无实机存档，不混合证明。\n');
