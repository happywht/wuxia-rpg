# Round183 验证

## 手动实走

- `http://127.0.0.1:5181/`：按正常UI读Round182检查点，实走「潮沟夺网」战斗和「暮潮牵标」夜间调查；完成放弃确认、守标人与岸上伤者两种互斥补给选择；分别保存并读回两个分支，检查经验、银两、物品、关系、声望、任务和见闻。详细操作与时间/格数见 [playtest.md](playtest.md)。
- `http://127.0.0.1:5178/`：未进入或修改。

## 自动验证

| 命令 | 结果 |
|---|---|
| `npm exec vitest run tests/round83-east-coast-town.test.ts tests/round170-daytime-sea-route.test.ts tests/round102-sea.test.ts tests/round82-east-coast.test.ts` | 4个测试文件、30项通过，0失败，4.33秒。|
| `npm run audit:round-34` | 通过；数据/叙事/引擎文档计数与支持条件/效果一致。|
| `npm run audit:round-48-docs` | 通过；玩家/MOD指南、发布索引与授权边界一致。|
| `git diff --check` | 通过；仅报告工作区CRLF提醒，没有空白错误。|

本轮没有改代码或数据，因此未重跑完整构建；四份专项覆盖了本轮真实旅程的对话、任务、昼夜、分支效果、持久化与路线相关逻辑。
