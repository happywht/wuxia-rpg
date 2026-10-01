# Round 115 验证

2026-10-01，基线1547eaa。先plan再实现；Claude已确认429重置13:52，本轮执行仍在重置前，由主代理完成，未反复启动失败委托。

| 命令/操作 | 结果 |
|---|---|
| npx vitest run tests/round115-navigation-budget.test.ts tests/round114-regional-climate.test.ts | 2文件24项通过；其中新增13项；focused-tests.txt |
| npm run typecheck | 最终exit0；首次fixture返回宽联合类型导致TS2339，精确改为WorldNavigationGuideSegment；保留typecheck-first.txt，不削弱运行校验 |
| npm run build | exit0；100资源Schema、默认MOD静态覆盖检查、tsc、105文件875测试（94.13秒）、R34/R48文档审计、Vite生产构建；build.txt |
| 正常键盘两种界标成本与Gu跨区回应、北境公开路线结案 | 实走通过；playtest.md及截图 |
| 正常菜单第三栏保存→返回→继续读回 | 12:55:19第三档，天门关(46,42)/青阳6日00:35，Lv8命97/209气130/130银443膏1丸2；章末已记下；前两档不变 |
| git diff --check | 通过；只出现Windows LF/CRLF转换提示 |

预算不收费、不持久化，只在有效en-route路径估算当前地区成功格数；实际地形阻挡不收费。跨午夜和NPC换岗后重算。导航时间推进顺序与同一时段等待重算测试覆盖；自动测试不代替真实旅程。

生产入口642.35KB、Phaser1374.54KB，已有>500KB分块警告保留，独立发行包/部署未验收。data、Schema、MOD、地图层、任务、人物与50关口零修改。

范围限制：当前公开一路完成北境四地阶段收束；限定番号的外部回响、私记沈问秋完整后程、海路、六区整体节奏、五派/两制作/两构筑/同行/三个新结局/独立发行尚需直接证据。入口记录绕开导致55格返门、长无决策路段待下一轮优化。M2–M5未通过，大目标active。
