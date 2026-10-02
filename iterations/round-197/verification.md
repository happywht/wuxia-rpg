# Round 197 验证记录

## 自动验证

- `npx vitest run tests/round87-southwest-isles.test.ts`：通过，1文件11项。
- `npx vitest run tests/round87-southwest-isles.test.ts tests/round119-quest-panel-detail.test.ts`：通过，2文件22项。
- QuestPanel Enter接取回调：Round119面板测试覆盖，11项全部通过。
- `npm run smoke:round-87`：通过，18个测试文件、107项测试。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run validate:data`：通过，manifest与100个基础资源Schema。

新增的`questKnowledgeNodeIdsToBackfill`只返回journal状态为active/completed/failed且同ID知识节点kind为quest、并且当前未发现的节点。回归确认offered与locked不回填；active/completed/failed均回填；已知人物与任务关系可显示；淡泉边在地点端点尚未发现时仍隐藏；已知节点不重复返回。人物名录/Q面板接取回调另由Round119面板测试覆盖；对白接取仍由Round196资料效果处理。

## 实机

5200页面保留未保存结案现场。Q确认雾航引水已完成；K地点分类出现石涧淡泉，但旧现场详细页显示暂无线索相连。该旧运行没有重载新代码，所以本轮未实机证实回填后关联显示。槽1/2/3未修改；不运行完整构建。
