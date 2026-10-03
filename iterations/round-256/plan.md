# Round 256：核实药队路线对白在运行时的显示与到达

## 本轮目标
在不选择或写入玩家分支存档的前提下，验证Round255新增的路线后果是否能由游戏实际对白条件系统显示、是否沿节点图可达，并确认任务状态和知识图谱奖励相互一致；查出并修复任何数据联接问题。

## 用户故事
- 完成药队任一方案后，我希望对白里确实出现对应回应，另一条回应保持隐藏。
- 我希望从告示板和后续NPC进入的任务，与分支设定、前置及当前状态相符。
- 尚未选择分支时，我的存档检查点应保持不变。

## 验收标准
1. 使用正式 `getVisibleOptions` 条件求值，以无路线见闻、仅A见闻、仅B见闻、A/B均知四种状态断言对白显隐。
2. 验证每个后续任务的发布人/对话入口、prerequisiteQuestIds与图谱 `requires`/`participatesIn` 联接一致，分支任务只有真实接取时造成互斥失败。
3. 复跑Round254/255和数据Schema、typecheck；记录测试边界，不声称当前浏览器实机或存档读写已验证。
4. 更新本轮证据和日志/路线图，独立提交 `round-256: ...`。

## 子任务
1. 为对白运行时条件和A/B互斥可见状态添加回归覆盖。
2. 审查药队两条后续任务的图谱发布人/前置关系和对话引用，修复发现的断链。

## 涉及文件
- `iterations/round-256/plan.md`、`iterations/round-256/playtest.md`
- `tests/round255-caravan-branches.test.ts`
- 可能涉及 `data/base/knowledge_graph/edges.json` 与对白/任务数据
- `docs/QUESTS.md`、`docs/JOURNEY-FACTS.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`docs/PROJECT-GOALS.md`、目标附件

## 风险
- 不从陈旧临时日志推定目前浏览器页面仍活动；不操作或覆盖玩家存档。
- 路线状态机和对白条件单测只证明数据协议与运行时求值，不证明真实键盘旅程。
- 保持本轮只暂存Round256相关文件，忽略仓库既有诊断产物。

## 预计人类工程师工时
≥45分钟。
