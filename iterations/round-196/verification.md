# Round 196 验证记录

## 自动验证

- `npm run generate:round-87-southwest-isles`：通过；生成器运行成功，扩展已在当前世界图中，执行为确定性no-op。
- `npx vitest run tests/round87-southwest-isles.test.ts`：通过，1文件10项。第一次先只改了生成数据，字节一致性用例按设计报错；随后同步修改Round87作者脚本并重生成数据，最终重跑通过。
- `npm run validate:data`：通过，manifest Schema与100个基础资源 Schema。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run smoke:round-87`：通过，18个测试文件、106项测试。

集成回归覆盖雾航引水任务对话的`discoverKnowledgeNode`接取效果、孟海洲参与关系、烽台知识发现、石涧淡泉奖励发现和重复奖励幂等性。完整`requires`和`rewards`边仅在任务及其地点端点均为玩家已知时显示。

## 实机验证范围

- 5200画面确认任务日志为已完成，地点百科分类中出现「石涧淡泉」。
- 本轮未验证新数据热更新后的重新接取，也未保存/读回该状态；没有执行完整游戏构建。
- 存档1至3均未修改，完成任务的Round195现场仍未持久化。
