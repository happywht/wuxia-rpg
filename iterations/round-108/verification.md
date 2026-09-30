# Round 108 验证记录

## 自动测试

| 命令 | 实际结果 | 记录 |
|---|---|---|
| `npx vitest run tests/round108-chapter-endings.test.ts tests/round108-ending-ui.test.ts tests/round42-story.test.ts tests/round46-vertical-slice.test.ts --maxWorkers=2` | 4文件82项通过，其中本轮77项 | focused-tests.txt |
| `npx vitest run --maxWorkers=2` | 88文件719项通过，116.03秒，进程exit0 | full-tests.txt |
| `node iterations/round-108/check-unrelated-semantics.mjs` | 七原结局/条件/入口/引言语义一致，基础资料仅结局文件修改 | unrelated-semantics.txt |

71项章节专项包括64组合的实际对白扣物品、选择锁、结案、v1恢复；另外7项覆盖旧路径、未结案、门派资格、坏字段/引用及两次源重放。6项UI专项覆盖锁定缺项、确认取消、两页及回调、较大字体、小视口与文本冻结。所有组合提供任务前置和材料，不能冒充三章完整键盘旅程。

首跑测试fixture少计隐名更簿回春膏1，修正初始数量4→5与预期成本；该失败是测试准备错误，不通过改变游戏成本修复。失败原日志保留在本地，不作为最终通过证据。

## 实际界面

见playtest.md与实际截图：正常旧检查点走格47步到渡口入口、正常45分钟过渡、到照心石保存；未达成锁定、取消确认、行舟万里两页、末页返回主菜单和第三槽正常读回原位置/时间。两个用户槽原日期保持。结束无自动覆盖存档。三条新结局路径实际完整流程仍未验收。

## 兼容与范围

保留七原条件、四非目标结局、新增字段可省略、v1无新格式；坏新增字段和引用隔离所属结局。源重放在临时目录，核验两次一致且原仓库资料未改。历史脚本只有smoke读取结局文件，不存在需同步的旧写入生成器。

M4部分推进，M2–M5保持未通过，总goal active。没有新增地图、任务、人物、物品或素材，授权清单无需新增来源。本轮构建检查不等于新版发行包已交付。六区实走、三章双结果、完整构筑键盘流程和发行包留在下一轮/后续验收。

## 最终生产门槛

`npm run build` 最终进程exit0：100基础资源Schema通过、MOD问题0、tsc通过、88文件720项通过（75.07秒）、Round34/48文档审计通过、Vite143模块构建成功。build.txt为最终同步后日志。已有入口/Phaser大块警告仍存在，不影响本次构建，不声明新版发行包已验收。

Claude Code重试时采用已配置默认模型、只读Read/Grep/Glob；有效进程约204秒exit0。其读取较早Schema快照提出original保留值P2，与主代理已发现并修复项相同；最终Schema拒绝回归及720项构建通过。复核裁决见review-resolution.md。

新增协议id的96字符上限与original保留值已同步到Schema，并增加Schema/运行时共同拒绝回归。719项记录是该同步前的全量；最终同步后由完整build再次运行全量，最终结果单列于下。
