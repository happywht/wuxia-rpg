# Round165 计划

## 目标与用户故事
公开旅程 r163 从渡口出镇，进入大陆校标、更簿与井水调查，实际选择公开署名和援药。上一轮已观察到拜师后动态选项变化会误退门；玩家选择退门时应先核对动态真实代价，并默认取消，不能一次误按丢失武学和声望。

## 验收标准
- 既有五派 leaveFaction 对话效果自动走确认，默认取消/ESC无结算，显式确认只执行一次；条件、标签或效果改变拒绝旧确认。
- 不改具体门派ID、资料、Schema、MOD及v1存档；普通旧对白仍直达，已有三章确认保持。
- 独立第一栏真实出镇并完成大陆公开/援药阶段及正常保存恢复；第三栏有限终章和原5178保持。未达云岭不得计援药完整跨区。
- 专项、全量及构建通过，记录真实UI而非注入。

## 子任务
1. 扩展通用对白确认到退门效果，补充取消/执行/动态变化/五派数据/只读测试，实际当前师门确认取消。
2. 正常推进大陆公开与援药旅程、记录时间资源/存读，更新目标、验收文档与开发日志并独立提交。

## 涉及文件
src/game/dialogue-effect-confirmation.ts、src/game/dialogue-ui.ts、tests/round165-faction-departure-confirmation.test.ts、iterations/round-165/*、docs/PLAYER-GUIDE.md、docs/PROJECT-GOALS.md、docs/DEEPENING-ACCEPTANCE.md、README.md、CHANGELOG.md、DEVLOG.md、ROADMAP.md、目标附件。

## 风险
动态 NPC/雾天导致路线重算；长代价预览必须读完再确认；门派活动与章节分开，不把已有成长路线重复算作完成；井药决定有实际库存代价。

## 预计人类工程师工时
240–330分钟（≥10分钟）。
