# Round 199 验证记录

## 自动验证

- `npm test -- --run tests/round90-region-arrivals.test.ts tests/round87-southwest-isles.test.ts`：通过，2个文件、16项测试。
- 本轮专项覆盖：存在同ID知识节点时触发后发现事件自身；同时发现显式配置地点；地点已知时仍补发现事件；重复触发幂等；无图谱同ID节点时继续只发现配置节点。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run validate:data`：通过（manifest 与 100 个基础资源 Schema）。

## 人工实机验证

见 `playtest.md`。旧档任务回填、雾航调查/复命奖励、48格实走抵达石涧均已观察。触发文本在到达时出现，但触发后的百科事件页未在代码修复后重载验证；未保存任何槽。
