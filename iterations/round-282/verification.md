# Round282 验证

- 原始4检查点：正常新游戏→J0→F0→F1，标题Continue读回J0/F0/F1的真实资源、任务与后果；UI截图与逐回合记录见playtest.md。F0制作服药实际+18生命，F1扣丹1/结算28XP24银，两支offered。
- node scripts/audit-journey-ledger.mjs bf0e8d70f608816c7ed0127e540c39a0d4cc0268 <四文件>：退出0，common-ledger.json；切槽1→2→3→2警告保留。只证明字段一致，不能证明操作者真实性/Schema全量或P1。
- npx vitest run tests/round282-journey-ledger.test.ts：主复核后13项通过，退出0；夹具明确为合成，绝不冒充实走。
- npm run typecheck：退出0。
- npm run check：退出0，200文件1807测试、102资源Schema/MOD、类型与两文档审计。check-final.txt含刻意拒写负例报错及最终成功汇总，不能仅凭stderr判失败。
- 原下载与仓库工作副本4文件逐字节一致；冻结候选的272个src/data哈希无变化，证据见evidence-integrity.json。端口5312监听进程的命令行绑定clean-git候选根，runtime-process.json，不只相信F8手填candidate。
- Claude默认配置一次会话69c7911f-0b65-4048-9944-e00ea98c1a6c成功返回，约10.3分钟；主代理发现嵌套NPC知识问题并修正、增加负例，共13项。usage/cost原值保存在claude-output.json及外部会话登记，不据此推断缓存节省。
- 会话中断导致未保存F0丢失，已从J0正常恢复，初次截图仅历史。当前正式四原始文件未混入未保存段。
- GitHub主Round281 CI成功；冻结tag旧浅克隆CI历史对象缺失失败保留原日志。两者不混说。公开包仍预发布。
- 本轮没有重建冻结发行包，200/1807是本轮工作树check，不是Round281包的199/1794。src/data无本轮改动，旧Round144日志与Round131 EOL修改未提交。
- F2双側—C1及真人60—90分钟仍待；P1未通过、P2不启动、全局目标保持开启。
