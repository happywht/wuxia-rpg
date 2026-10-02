# Round178 验证

- `npx vitest run tests/world-navigation-guidance.test.ts tests/round115-navigation-budget.test.ts` — 2个测试文件、23项通过。
- `npm run build` — 通过。包含100个基础资源Schema校验、MOD检查、`tsc --noEmit`、172个测试文件/1497项、Round34文档审计、Round48指南审计和 Vite production build。
- 手动UI：在独立来源5181新建角色并查看Q差事、B背包、R行旅；逐格核对江南地形、人物变化、坐标和导航提示。真实开局链未完成，购买/战斗/拜师/出镇/保存读回不计通过。
- 浏览器原5178 LocalStorage与三栏未操作。5181是新origin，不写5178任何存档；5181新档未保存。
- `git diff --check` — 通过；仅提示既有Windows行尾转换告警，无空白错误。
- build存在既有大chunk提示：Phaser运行时1.37MB、应用入口711KB。
