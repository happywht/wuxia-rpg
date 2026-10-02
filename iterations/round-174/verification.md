# Round174 验证

- 专项：`npx vitest run tests/world-navigation-guidance.test.ts`，1文件9测试通过。
- 新用例复用实际渡口/江南地图及已装配关口，从R172保存位置(9,2)模拟当前人物阻挡(12,2)，验证路径恰为南1西7、8步、不踏入占位格，到达后为at-gate，作者地形在占位处仍可走。
- 正常键盘 UI 在同一存档读档，选择R指南回望石阶，八步通过到达提示，E过关。按实际游戏时钟21:20→22:13与8格+45分钟核对。用户档第一栏不覆盖，第二/第三档未改。
- `npm run build` exit 0：typecheck、数据校验、MOD检查、171个测试文件1491项全过（98.87秒）、round34/48文档审计及Vite构建通过；Vite大包体提示保留，完整日志见 `build.txt`。
- 构建后再次运行 `npm run audit:round-34` 与 `npm run audit:round-48-docs` 均exit 0，分别见 `audit-round-34.txt` 和 `audit-round-48-docs.txt`。
- 结论：R指南已经基于实时NPC格绕行并告知到达入口优先级，静态规划失败不能据以修改生产路线算法。六区整体节奏及目标其余M1–M5/发行验收继续未完成。
