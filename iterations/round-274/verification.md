# Round274 验证

## 命令与记录

- npm run validate:data：100资源通过（validate-data.txt）。
- npx tsc --noEmit：类型检查通过（typecheck-final.txt）；首轮闭包类型收窄问题记录typecheck-first.txt，已改由解析成功后的encounterRecords引用。
- npx vitest run tests/round274-ferry-choice.test.ts tests/round273-pier-delivery.test.ts tests/round130-hanshan-practice-brief.test.ts tests/round107-enemy-behavior.test.ts tests/round272-journey-facts.test.ts tests/round271-journey-delivery.test.ts：6文件74测试通过（focused-final.txt）。首轮失败保留focused-first.txt，修复可见选项包装、恢复Set、累计作者后续层隔离/精确核验和循环数量，不删负向检查。
- npx vitest run tests/round274-ferry-choice.test.ts tests/round143-save-overwrite.test.ts：2文件55测试通过（readback-regressions.txt），本轮新增最终16测试。
- npm run build：最终退出0，191文件1686测试全通过，100资源Schema/MOD/类型/34与48文档审计/Vite正式构建通过（build-release.txt），175模块、主包724.45KB/Phaser1374.54KB。首次完整仅Round59旧选项数失败（190文件/1685测试通过），build-first.txt保留；31项基线与新内容精确核对后定向14项通过（historical-dialogue-regression.txt），再完整重跑成功。

## 覆盖与实机

两侧实际四回合、护送答谢/修桥清障、默认取消/确定领取/复问、空槽保存/标题读回/原样F8导出。步骤、物品/银/时间/成就对照与缺陷修复见playtest.md及branch-comparison.json；不同QA键隔离，不直接注入状态。

自动：零气仍攻击、循环恢复不暗击、重击预兆与实际伤/守御耗气，原稳定ID/属性/奖励/失败保持，只有加固不能领通渡药，两侧领取条件及共享标记、防双领，满包/满变量账本整笔拒绝，正常保存/解析/恢复标记，纯作者幂等/EOL/漂移/重复拒绝、多资源写前预检/CWD无关。真实护送载荷15次发现与目录16不等价，恢复不凭目录补高/送银；旧缺计数0且历史已领保留，启动装配源码防重复推断加真实重读截图。

原始下载与仓库两JSON字节/hash一致；-text保护。提交前精确暂存，保护Round144两日志与既有未跟踪文件，不使用git add-all。仅改数据作者/测试/文档与GridScene删除一段错误计数推断，不新增故事专用引擎或协议。

## 边界

只验P1渡口F2两侧。普通寒暄推进答谢仍是后续明确缺口；HUD天气“+1分/格”与基本1分叠加，导航预算已包含二者，实走一致；现有跨图区门未因分支新建，不能宣称桥路新增通行条件。云岭C0/C1、真人首玩60–90分钟、P2 12多解/P3两成长路线/P4整区美术/P5同版整体发行待后续。目标未标complete，桌面paused无法由工具恢复，授权工作继续。
