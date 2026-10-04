import fs from 'node:fs';
const dir='iterations/round-281/';
const text=`## Round281 当前增量证据

干净Git候选bf0e8d70f608816c7ed0127e540c39a0d4cc0268（2280b58加7项工程文件，src/data零差异）完整package:release退出0：199文件1794测试、102资源Schema/MOD/类型/两文档审计/生产chunk审计/166文件归档与子路径HTTP smoke通过。修复R103/R104强制CRLF改写及R279沙盒固定CRLF，两CI改全历史checkout；首次失败日志保留。新增独立源码SHA/逐文件大小哈希/额外文件校验CLI与5项测试。

独立解包端口5311正常新游戏抄书学徒，E接茶棚凉汤，左移1格到42,37，向下受地形阻挡未移动（世界08:01）；正常空槽一保存18:18:50，刷新标题Continue读回，B核对Lv1/83命53气/120银/膏2丸1/旧残篇1，Q凉汤active0/4未结算。无QA导入、赠品或隐藏状态写入，发行JS无工作台。此为开局启动检查点，不是完整J0或P1旅程。

发行归档1545656字节，SHA256514105af8bcd8eeaebd7826f7f6b09037566ad1307d90ff818642ffc0985444b；来源另以round281-verification标签绑定，主round提交包括补充证据/文档/CI配置，不能把不同提交冒充同一包。完整同候选新游戏到C1与关键选择两侧、真人60—90分钟仍待；P1未放行，P2不启动。

`;
fs.writeFileSync(dir+'playtest.md','# Round281 独立发行实启与正常存读\n\n'+text+'## 真实操作\n\n标题Enter→默认抄书学徒Enter→加载完成→出生43,37；E任务名录→Enter接凉汤→Escape关闭→Left成功→Down阻挡→B资源；Escape关闭→Escape暂停→Down保存→Enter空槽一→Enter保存。刷新后过早输入发生在加载页而未消费，等实际标题出现再Down/Enter→槽一Enter；加载完成B/Q核对。仅记录成功位移，不把阻挡算路程。\n\n## 后续\n\n本origin与5310独立QA/5178玩家隔离。生产包无F8导出；本轮保留正常槽一、截图和包完整性，下一轮在冻结版本独立QA角色推进完整首段及分支双侧，生产角色也可从42,37续行。\n');
for(const file of ['CHANGELOG.md','DEVLOG.md','ROADMAP.md'])fs.writeFileSync(file,'## Round 281 — 干净发行复现与独立开局存读\n\n'+text.replace('## Round281 当前增量证据\n\n','')+'下一轮：锁定该版本继续完整首段与代表旅程，不提前进入P2。\n\n'+fs.readFileSync(file,'utf8'));
const matrix='docs/CURRENT-ACCEPTANCE.md';let m=fs.readFileSync(matrix,'utf8');m=m.replace('Round280冻结候选（基于bff5245）','Round281冻结发行候选（bf0e8d7）');m=m.replace('## Round280 当前增量证据',text+'## Round280 历史增量证据');fs.writeFileSync(matrix,m);
fs.appendFileSync('docs/QA-CHECKPOINTS.md','\n'+text+'独立包5311普通origin槽一：phase=start-tea，42,37/08:01/active茶棚凉汤；截图在iterations/round-281。此档未F8导出，不伪称有原始载荷证明。\n');
fs.appendFileSync('docs/RELEASE.md','\n'+text+'验证预发布：https://github.com/happywht/wuxia-rpg/releases/tag/round281-verification 。非完整旅程稳定发行；Pages未部署。\n');
fs.appendFileSync('docs/PROJECT-GOALS.md','\n## 当前推进位置（Round281）\n\n干净源码候选完整打包与独立正常开局存读已验，详见当前矩阵。下一轮从明确首段检查点继续同版本代表旅程，五阶段完整目标保留，P1及大目标不得关闭。\n');
fs.writeFileSync(dir+'github-release-notes.md','# Round281 验证预发布\n\n'+text+'## 运行\n\n解压tgz，将package目录放到HTTP静态主机；不要file://打开。包含合法像素素材、基础资料、Schema、运行时许可证及玩家指南。\n');
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.txt')||x.endsWith('.patch'))){let p=dir+file;fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/[ \t]+$/gm,'').trimEnd()+'\n');}
