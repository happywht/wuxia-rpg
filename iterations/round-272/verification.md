# Round272 验证与边界

## 代码/资料

三处采购/药方事实修正；灯下问药后实践/巡岸并行，封箱双门槛保留；巡岸探子72生命/零耗攻击、重击可守御卸势、换气窗口。纯作者层四资源预检，文本/规则漂移全部拒写；稳定ID、奖励/费用/失败终态/旧v1协议不改。R行旅渡口指引与R106来源同步。未向grid-scene增加装配或硬编码剧情。

## 命令与结果

- `npx vitest run tests/round272-journey-facts.test.ts tests/round272-shore-challenge.test.ts tests/round263-medicine-chain.test.ts tests/round107-enemy-behavior.test.ts`：4文件39测试通过（review-final.txt）。覆盖材料/文案、LF/CRLF幂等、四资源预检拒写/出cwd执行、并行两种完成顺序、失败锁、真实旧J0v1恢复/门槛刷新、0内力攻击、Lv4/Lv6同预算守御收益、旧AI保持等。
- 初定向回归记录facts/pacing/challenge/affected日志；零内力测试将初始值当最大值，旧R64采集文案及R107循环数断言已按当前发布事实修正，不删除负向保护。
- 初完整build：187文件1641测试通过、2失败均R263旧串行前置断言；补问药共同前置/并行结构后重新构建。一次人工换行转义导致TS1127已修复。原失败日志保留build.txt，随后文档审计检测到矩阵已升272而日志尚未写272；完成日志后最终全量结果见build-release.txt。
- `node scripts/audit-content-state.mjs`：100资源/22图/65任务/431节点548边/117目标；前置最大深度6（原7）、16有序任务，其他计数不变。静态数量不作体验通过。
- 正常UI J0→J1/F0、保存槽三/标题Continue读回/下载原样JSON已完成；来源、收支、实战伤害和恢复详见playtest.md。

## 尚未通过

完整代表旅程、真人首玩时长、互斥双侧、12多解合同、两成长路线、六区美术、北境/海路、同候选三结局和独立发行。Goal工具仍paused不可由update_goal恢复，继续执行已有用户授权；未调用complete。

最终完整 npm run build 退出0：188文件1643测试全部通过，100资源Schema、MOD覆盖、tsc、两文档审计及Vite正式构建通过；174模块，主包722.04KB，Phaser1374.54KB（既有体积提示）。
