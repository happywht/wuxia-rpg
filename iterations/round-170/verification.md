# Round170 验证

- 首次 npm run build（build-first.txt）：1失败/1479通过；新夹具误用regionEvents，实际为world.events，已修正，失败日志保留。
- 第二次 npm run build（build-fixed.txt）：exit0；随后实走发现已接任务不能复谈指引，继续修正并重建，未将这次早期构建作为最终版本。
- 新复谈Schema首次构建（build-schema-failed.txt）：误用accepted状态，被Schema拒绝；改为引擎真实active状态，失败日志保留。
- 最终 npm run build（build-final.txt）：exit0；169文件1482测试，99.31秒，含5个本轮测试；Schema、MOD、typecheck、文档审计、Vite均通过。包体积警告仍存在，独立发行验收尚未完成。
- npx vitest run tests/round170-daytime-sea-route.test.ts（focused-runtime.txt）：5/5通过508ms；覆盖实际关口、夜间/见闻条件、交互方向、免费active复谈和作者源幂等一致。
- UI：实际五项海路调查、两个战斗行动、两次低潮候时、免费问路亲读、黄昏E和正常存读；细节见playtest.md及截图，不将自动检查冒充未走终章。
- 离线规划脚本的首个错误参数、错误资源结构检索已纠正；路线规划从资料导出，不等于实走。成功格和NPC阻挡按屏幕时间单独计数。
