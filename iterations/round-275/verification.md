# Round275 验证

## 自动命令与结果

- node scripts/apply-round275.mjs：三资源先全预检/再写/再验证幂等，成功；重复/漂移拒写由临时目录CLI测试覆盖。
- npm run validate:data：100资源Schema与manifest通过（validate-data.txt）。
- npm run typecheck：退出0（typecheck.txt）；首次声明/上下文字段错误保留typecheck-first.txt。
- npx vitest run tests/round275-cloud-arrival.test.ts及Round106/112/74/90相关文件 --reporter=dot：5文件48测试通过（focused-tests.txt）。本轮12项，包括两个完成态条件与仅加固负例、无效果复谈、完整历史资料比较、真正关口、指南/有限药匣作者一致、EOL/幂等/漂移重复及CLI预检。
- 首次focused-first.txt的Git读取世界JSON超过默认buffer修正32MiB，Round112重播移动历史补给层修正为原位更新；第二次focused-timeout.txt仅CLI三进程I/O超5秒，明确20秒预算后通过，未修改玩法速度。失败原记录保留。
- npm run build：退出0（build-first.txt）。100资源Schema、MOD解释、**192测试文件1698项**、TypeScript、Round34与48文档审计、Vite175模块正式构建通过。main724.45KB / Phaser1374.54KB，分包体积提示仍保留。历史作者负向测试打印的拒写异常是预期，不以stdout异常行替代总体退出码。

文档更新后再次执行两项审计，均退出0（docs-audit-final.txt）。

## 实际UI

双侧F2导入新独立run后正常继续，真实两关/天气/道路/人物/商店/用药/接任务，空槽二保存，标题Continue读回，F复谈，F8导出原始载荷。playtest.md与branch-comparison.json及截图记录。原download=disk=Git index字节检查在提交前执行；raw JSON通过.gitattributes -text保持原样。

当前仅P1 C0本段通过；C1/首玩时长及P2–P5整体门槛仍待。Round144两个日志及既有未跟踪历史文件未纳入提交，整体Goal未complete。
