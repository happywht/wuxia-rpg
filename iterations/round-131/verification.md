# Round 131 验证

- 定向：npm test -- tests/round131-companions.test.ts tests/round105-companion-ui.test.ts tests/round105-people.test.ts tests/round130-hanshan-practice-brief.test.ts tests/round129-iron-practice-brief.test.ts tests/round59-regional-dialogue.test.ts：6文件77测试exit0（2.17秒），focused-tests.txt。长中文/多伙伴/特大字体分页、页界/打开重置/解绑/T交谈/空资料、作者迁移/漂移/LFCRLF、实际关系档上下界/记忆保留/重复邀请拒绝、六地域规则与v1恢复覆盖。
- npx tsc --noEmit：exit0，typecheck.txt空输出。
- node scripts/apply-round131.mjs：局部作者入口幂等；回归核对R130固定基线→R131当前资料，无其他NPC语义变化。
- 实走：playtest.md及截图，正常邀请/实际决定转述/暂离再邀/跨区跟随/第二行动9援护/胜利/01:55:03第三栏正常主菜单读回。没有注入，自动测试与真实旅程分开。
- 最终npm run build：exit0，131文件1118测试（142.22秒）、100Schema资源、默认MOD静态检查、tsc、R34/R48文档审计及Vite通过。入口667.42KB/Phaser1374.54KB分块警告保留，build.txt；独立发行未验收。
- 失败修正：首次新排版测试按换行后字面连续串计数造成2失败，改为移除布局换行再核对完整内容；uiFontSize返回字符串，引发2类型错误，改为parseFloat；新增重复招募测试误把已同行第二次邀请预期成功，修正为真实拒绝并暂离再邀；首次全量遗漏两根日志使文档审计1失败/1117通过（139.96秒，build-docs-failure.txt），补日志后完整重跑1118通过。没有把失败结果删除或报成成功。
- 最终文档状态审计见docs-audits.txt；全目标保持active，M2–M5未通过。
