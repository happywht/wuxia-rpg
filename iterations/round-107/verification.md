# Round 107 验证

所有命令在仓库根执行；成功以最终退出码为准。

| 命令 | 最终结果 | 证据 |
|---|---|---|
| npm run typecheck | 退出0 | typecheck.txt |
| npm run validate:data | 退出0，manifest及100资源Schema通过 | validate-data.txt |
| npm run inspect:mods | 退出0 | inspect-mods.txt |
| npm run audit:round-34 | 退出0 | audit-34.txt |
| npm run audit:round-48-docs | 退出0 | audit-48.txt |
| WUXIA_R107_REPORT=1，npx vitest run tests/round107-enemy-behavior.test.ts tests/round107-growth-routes.test.ts tests/round107-combat-ui.test.ts --maxWorkers=2 | 3文件33项通过；真实接口账本输出 | focused-tests.txt，两个ledger.json、response-comparison.json |
| npx vitest run --maxWorkers=2 | 退出0，86文件643项，114.59秒 | full-tests.txt |
| npm run build（最终单独重跑） | 退出0；内含86文件643项及生产构建，原有大chunk提示保留 | build.txt |
| node iterations/round-107/check-unrelated-semantics.mjs | 退出0；两基础资料之外无base改动、三敌原基础规则及其他对白语义保留 | unrelated-semantics.txt |
| node iterations/round-107/check-historical-replay.mjs | 退出0；隔离且校验绝对目录内R101生成器双重放保持R107战斗文件 | historical-replay.txt |

33项新增：20行为协议/装配/战斗，9真实成长/资格/经济/存档/导师/源幂等，4真实BattlePanel协议。真实成长接口不用伪造银两/等级/武学，实际一次新手挑战加三次既有可重复市集练级达到Lv5。剑法与守御调息各通过市集及北境；同守御准备状态盲打/读势比较为生命115/128、内力97/91，两者均胜，表明资源取舍而非必选解。

首轮全量旧Round45断言生命29失败，新声明循环实际53；测试同时核对新循环53和移除可选behavior的旧AI仍29，两种规则精确保留。另首次npm run build与全量独立测试并发，默认并发中的两个历史用例5秒超时；终止进程已退出1，未当成功，最终单独重跑643项及构建退出0。未放宽超时或删断言。

真实页面：正常读R106测试档→接差事→实际19格→五行动击败刀客；预告12/24与实际一致，调息4不攻击；任务经验30/银25、正常第三槽保存、主菜单正常读回(55,45)/08:22、Q已完成1/1，详见playtest.md与JPEG。自动两构筑不冒充完整键盘路线，三章/关键双分支/五派/制作/六地节奏仍待验收。

22地图、65任务、38NPC、52物品、30武学、425节点/540边与100资源保持；不引入新素材。M3部分推进、M2–M5未通过，goal保持active；继续Round108结局后果。
