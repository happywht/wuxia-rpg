import fs from 'node:fs';
const final='最终 npm run build exit0：122文件1034测试（123.13秒）、100资源/默认MOD静态Schema、tsc、R34/R48文档审计及Vite通过；入口664.78KB/Phaser1374.54KB分块警告保留，独立发行未验收。证据iterations/round-126/build-complete.txt。';
for(const p of ['CHANGELOG.md','DEVLOG.md','docs/PROJECT-GOALS.md','docs/DEEPENING-ACCEPTANCE.md'])fs.appendFileSync(p,'\n'+final+'\n');
let p='iterations/round-126/verification.md',s=fs.readFileSync(p,'utf8').replace('build-complete.txt：最终完整构建正在登记','build-complete.txt：最终完整构建exit0（build-complete-exit.txt为0）');s+='\n## 最终结果\n\n'+final+'\n原始日志保持，包括先前失败与最终通过；最终成功门槛是build-complete.txt，不是build.txt/build-verified.txt/build-final.txt。第三19:59:29正常读回已完成，goal未关闭。\n';fs.writeFileSync(p,s);
