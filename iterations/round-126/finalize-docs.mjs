import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,t)=>fs.writeFileSync(p,t.trimEnd()+'\n');
const progress=`## Round 126 班船与实际回访（2026-10-01）

通用关口新增可选见闻门槛及锁定理由，Schema/解析与装配引用校验，坏引用只禁用对应关口。E开船和确认各重验；M/R/任务与供应跨区选路共享资格，首次探索仍走三段陆路，已知港口可用直航。新增两港双向班船，每程30银/90世界分钟；22图65任务100资源不变，总关口54。三名既有人物有无效果说明。

第三档正常实走：读19:12:59档，从祝九弦旁11,4走13格到18,10，取消报价仍531银/01:10。最大字号E报价、R回程出口、M第7/55点费用及祝九弦说明完整可读。去程531→501银/01:10→02:40，青帆87,70；步行17格到护网点73,67再17格原返，没有再次战斗或奖励。回程501→471银/03:14→04:44，渡口18,10，走13格回11,4/04:57。合计60成功格与180航程分钟；R125为636格陆路，出发点是白鹭洲旁5,4，不能当作相同起终点的精确比例。最长单向重复按键段本轮7格；这不是全部六区节奏验收。

标准字号恢复，第三栏19:59:29保存，正常主菜单读回11,4/青阳10日04:57、471银/188命/101气、7项背包与徒手装备；前两栏9/28 05:12:08及05:16:02保留。锁定资格、资格撤销、余额不足与到达占位拒绝是Host/自动证据，未冒充浏览器实测。旧v1独立兼容发行等目标保持待验收，M2–M5未通过、goal active。最终完整构建结果见 iterations/round-126/verification.md。Round127推进声望/善恶正常成长与剩余门派实践。
`;
for(const p of ['docs/PROJECT-GOALS.md','docs/DEEPENING-ACCEPTANCE.md','DEVLOG.md'])write(p,read(p)+'\n\n'+progress);
write('CHANGELOG.md',read('CHANGELOG.md')+'\n\n'+progress);
write('README.md',read('README.md').replace('Round 126 开发与验证中；下一轮 Round 127','Round 126 已完成；下一轮 Round 127'));
write('ROADMAP.md',read('ROADMAP.md').replace('- **R126** — 开发与验证中：渡籍班船见闻门槛、两港双向付费回访、M/R资格选路与拒绝原子回归；正常第三档取消/往返/存读证据完成后结轮。','- **R126** — 已完成：渡籍班船见闻门槛、双向30银/90分钟回访、M/R资格选路与拒绝回归；正常第三档取消/60格护网点往返/19:59:29保存读回471银。M2–M5仍待验收。'));
const attachment='C:/Users/Hitao/.codex/attachments/4c50acb7-1161-43f6-8448-59cd317d996a/goal-objective.md';
const old=read(attachment),history=old.slice(old.indexOf('---\n')>=0?old.indexOf('---\n'):old.indexOf('---\r\n'));
write(attachment,`# 当前持续大目标：完整江湖体验深化与交付（2026-10-01更新）

在 D:\\工作\\城建院\\2609\\收心\\wuxia-rpg 继承已完成Round126，从Round127持续推进。权威目标 docs/PROJECT-GOALS.md 与 docs/DEEPENING-ACCEPTANCE.md；路线图 ROADMAP.md。

交付三章实际旅程与各两处代价选择双结果及后续、十二项四类深化差事、五派实际实践、两制作循环和两战斗路线、八人物/三跨区关系/伙伴、六代表区域实走优化、三种承接新章节决定的完整终章、新游戏/中途存读/旧v1/MOD/空坏资料/授权/独立发行证据。保持22既有地图65任务、技术冻结、稳定ID、合法素材和资料引擎分离。逐轮先计划、实现、验证、更新文档与独立commit。

Round125已实际盘舷授艺/护网再战/复命；Round126新增探索见闻解锁班船、双向30银/90分钟、M/R路线接续及正常取消/60格回访/第三栏19:59:29正常读回471银、188命101气。活动失败任务分支、剩余三派实践、伙伴、三章关键双分支后续、新终章与独立发行仍待验收。tracker核实active，M2–M5未通过，数量/轮次/测试不能代替完整验收，必需证据齐备前不得关闭。

`+history);
write('iterations/round-126/playtest.md',`# Round126 正常键盘实测

仅第三档、正常游戏按键。无传送、资源/时钟注入、运行态读取；静态JSON BFS仅辅助路线选择。

`+progress+`
## 操作与证据

- slots-before.png：正常继续游戏，第三19:12:59；旧前两栏不动。
- before-cancel.png / quote-standard.png / cancel-unchanged.png：13格到18,10；E报价Esc取消，531银与01:10不变。
- quote-max.png：设置特大字号（标准Right两次），完整费用与拒绝说明，一页后Enter乘行。
- coast-arrival.png / coast-paid.png：落87,70，02:40，501银/188命/101气。
- guide-max-service.png：R向右三次出口、Down两次，回程30银90分钟详情完整；未收取费用。
- map-max-service.png：M全域，S七次第7/55点，Enter只规划，显示0格/费用；截图是可移动768×576全域舆图。
- netter-revisit-17.png：Left6 Up1 Left3 Up1 Left2 Up1 Left3，实际17格到73,67/02:57；未按E战斗。逆序17格返回03:14。
- return-quote-max.png / ferry-return.png / roundtrip-paid.png：E/Enter实际回船到18,10/04:44；Up6 Left7到11,4/04:57，471银。
- directions-max.png：F祝九弦，8个可见选项中Down7/Enter，班船说明完整且无效果。
- 恢复标准：设置文字大小Left两次。save-third.png：仅第三19:59:29。
- slots-readback.png / readback-bag.png：正常返回主菜单（确认返回），继续/第三读回；时间位置资源完整。没有早按Down/误开新游戏。

## 比较边界与剩余项

本轮60格路径Zhu→船→护网邻格→船→Zhu；R125636格Bai→三段陆路→同护网邻格→陆路→Zhu，起点相差，不能声称同起终点90.6%精确改善。班船减轻已探索回访，首探原陆路仍走，不能替代护网实战、三章双结果或其他五区节奏验收。白鹭洲/金云帆说明只自动检查，祝九弦说明真实阅读；未解锁与拒绝路径自动覆盖。

## 浏览器恢复

旧标签15连续截图/焦点超时；在同一IAB2新建16，正常读第三档继续。未读取/写入localStorage或游戏内部状态。
`);
