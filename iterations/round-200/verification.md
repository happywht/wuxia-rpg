# Round 200 验证记录

## 自动验证

- `npm test -- --run tests/round87-southwest-isles.test.ts tests/round90-region-arrivals.test.ts`：通过，2个文件、17项测试。
- 正式资源集成测试覆盖：从`world-map.json`读取石涧事件，从图谱nodes/edges组装实际关系；仅地点已知时`kg.edge.r87-spring-event`仍隐藏；按GridScene相同事件发现选择规则触发后得到同ID事件节点，关系边显示；重复触发无新发现。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run validate:data`：通过，manifest及100个基础资源Schema校验通过。

## 人工实机验证边界

本轮没有操作浏览器。既有5200槽3的雾航实机进度在内存中且未保存；5181浏览器标签连接在`Emulation.setFocusEmulationEnabled`超时。本轮不刷新/重启该游戏或写入存档。Round199实机只观察到石涧到达文本和百科缺少事件条目；修复后的百科表现由正式资料驱动集成测试验证，后续需在独立新实例进行UI实机确认。
