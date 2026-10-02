# Round 147 计划：持久化对白变量

## 目标与用户故事
玩家通过数据驱动对白留下变量决定，后续对白及正常存读保持；MOD 作者无需硬编码剧情。

## 验收标准
variable 条件和 setVariable 效果贯通 Schema、解析、事务与场景；使用严格键和有限 JSON 标量，缺失语义明确。旧 v1 缺少字段默认空，损坏字段明确拒绝。多效果失败不留下写入，选项变化防误选保持。既有 NPC 无奖励复谈使用协议，重复不奖励。测试与构建记录，不冒充键盘旅程。

## 子任务及涉及文件
1. 通用变量、事务、存档兼容：src/engine、src/game、data/schema、tests。
2. 既有对白实例、规范与回归：data/dialogues、docs、README、ROADMAP、CHANGELOG、DEVLOG、本轮证据。

## 风险
旧存档、浅拷贝污染、危险键、条件变化误选。teleport/startBattle 后续独立轮次，完整目标不缩减。

## 预计人类工程师工时
120–240 分钟（≥10 分钟）。
