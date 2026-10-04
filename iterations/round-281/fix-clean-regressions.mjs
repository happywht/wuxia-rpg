import fs from 'node:fs';
const p='scripts/deepen-round103-faction-practice.mjs';let s=fs.readFileSync(p,'utf8');s=s.replace("const nodes = JSON.parse(await readText('knowledge_graph/nodes.json'));", "const nodesRaw = await readText('knowledge_graph/nodes.json');\nconst nodes = JSON.parse(nodesRaw);").replace("const edges = JSON.parse(await readText('knowledge_graph/edges.json'));", "const edgesRaw = await readText('knowledge_graph/edges.json');\nconst edges = JSON.parse(edgesRaw);");
const start=s.indexOf("await writeText('knowledge_graph/nodes.json', JSON.stringify(nodes");const end=s.indexOf('\n\nconsole.log',start);if(start<0||end<0)throw Error('anchor');
s=s.slice(0,start)+`// Keep an already applied file byte-identical, including its original EOL.
const serialize = (raw, value) => {
  if (JSON.stringify(JSON.parse(raw)) === JSON.stringify(value)) return raw;
  const eol = raw.includes('\\r\\n') ? '\\r\\n' : '\\n';
  return (JSON.stringify(value, null, 2) + '\\n').replace(/\\n/g, eol);
};
await writeText('knowledge_graph/nodes.json', serialize(nodesRaw, nodes));
await writeText('knowledge_graph/edges.json', serialize(edgesRaw, edges));`+s.slice(end);fs.writeFileSync(p,s);
const test='tests/round279-road-exchange.test.ts';s=fs.readFileSync(test,'utf8');s=s.replace("// git 基线是 LF、工作区该源为 CRLF——先按工作区行尾归一再挂 R278/R279 替换。", "// Historical bytes are normalized to the actual checkout EOL, then protected exactly.");s=s.replace("baseline('scripts/lib/round106-region-content.mjs').replace(/\\r?\\n/g, '\\r\\n')", "baseline('scripts/lib/round106-region-content.mjs').replace(/\\r?\\n/g, raw('scripts/lib/round106-region-content.mjs').includes('\\r\\n') ? '\\r\\n' : '\\n')");fs.writeFileSync(test,s);
fs.appendFileSync('iterations/round-281/plan.md','\n第二次干净Git构建198文件1789测试中仅2项失败：R103作者强制CRLF改写原已应用知识图谱；R279沙盒固定CRLF却和LF checkout比字节。修复作者按源行尾输出且已应用零改写，沙盒按真实checkout行尾构造；保留全部语义/漂移/原子断言。当前候选升级为2280b58加这两项有界工程修复，完整差异另留证据，须重新完整构建。\n');
