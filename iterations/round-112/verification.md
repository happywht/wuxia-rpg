# Round 112 验证台账

基线e70bd9c；plan先于实现。改前真实截图与路径记录见playtest.md。

## 不同证据类型

- 真实R111：云阶探索去程51成功步、返程33；断桥往返各38；南口至人物68，最长连续无新决策40格。真实R112改前(52,41)帐篷遮身已复现，14步到达，源图该格可走。
- 不可把探索51步称为地形“必须51步”。`node iterations/round-112/baseline-routes.mjs`读不可变e70bd9c地图，BFS加列出NPC/遭遇占位：刻痕最短29、断桥邻格38、南口到夜间邻格64、北口邻格62；纯静态基线见baseline-routes.json，不是游玩体验、人类时间或动态路线保证。首次运行超出默认git子进程缓冲，增加显式4MiB读取上限后exit0，不影响地图。
- 地坪探针：walkable(52,41)，cloud-ridge-waystation-1 GID520且depthSort=y；查看实际图集确认这是不透明复制地坪，应属普通地面。只移除该层depthSort，其他自然/屋舍前景保留；同格实际前后证据不代表所有屋顶/岩石遮挡解决。

## 主代理实现与专项门槛

- 默认Claude Code既有会话本次429五小时额度，exit1且无修改；主代理接手实现，无模型/权限变更。raw JSON私有不入commit。
- `node scripts/deepen-round112-cloud.mjs`：幂等局部资料；实际运行成功。R74源过滤江南后来追加层，R78源排除地坪，隔离R74→R76→R78→R112回归保留断言。
- `npx vitest run tests/round112-cloud-routes-supply.test.ts tests/round74-cloud-ridge.test.ts tests/round78-actor-depth.test.ts tests/round106-regional-guide.test.ts tests/round111-actor-transition-visibility.test.ts`：5文件44测试PASS，focused-tests.txt。`npm run typecheck` PASS，typecheck.txt。
- 首次专项失败为fetch测试头非JSON和未绑定NPC shopId；随后生成回归揭示后来江南层复制、北东关口缓冲'.'/','差异。修正加载stub、真实NPC绑定与生成源/规范，未删除断言或扩大超时；类型问题补.mjs类型声明并用带canEnter的GridPathSurface替代错误Set参数。失败日志保留为过程，不算通过。
- `node iterations/round-112/verify-preserved-content.mjs` PASS：21非云岭地图全部语义相同，world仅云岭advice变化（舆图65层/关口50/事件/区域锚点均相同），NPC除店铺绑定外日程/坐标/对话ID相同，原店铺相同，manifest相同；preserved-content.json。
- 自动静态路径25/36/64/62只覆盖明确占位，不证明实际画面、日程变动或人类时长；保存测试通过真实capture→parse→preflight→restore与缺新shopStocks旧v1默认初始化，非完整浏览器光栅化。

## 实际浏览器证据

见playtest.md及截图：同一52,41地坪修复后角色可见；旧第三档正常装配新店；购买69银、3次用膏、售罄拒绝/指南青帆埠后备、正常保存菜单读回库存0/0资源343/131HP/膏1丸4。刻痕往返各25/断桥往返各36成功移动，北口实际64含偏移纠正（静态62），E45分钟真实跨图，上崖76格正常接取崖台雁候。普通动画一步与人物可见，减少动态已恢复关；10:47:30最终第三档，前两用户槽不动。未实际重新接云岭已完成差事、未送北境转述、未做白日雁台/整章，不冒充完成。

## 完整生产门槛

最终 npm run build exit0：100资源Schema、默认未启用MOD的静态覆盖检查、tsc、102文件840测试（2 worker）、文档34/48审计及Vite生产构建均通过；既有>500KB分块警告保留。最终日志build.txt，初次失败build-first.txt保留，未伪装首跑通过。 本轮新增8测试，未新下载素材，继续现有CC0授权，未改data/schema/engine/game/v1版本。

完整目标仍有大陆另一组完整跨区回响、北境/海路实走、成长/同行/新终章、旧档/MOD/降级/发行证据。M2–M5未通过，goal active。

完整首跑发现4处历史夹具失配：R61/R64仅早期NPC却读取共享shop-set，修为按fixture已放NPC界定输入，保留warnings=[]；完整R112装配仍要求所有店铺无警告。R76/R77仅更新本轮批准变更的云岭完整网格/地形指纹，其余四图哈希保留。扩展5文件28项回归PASS（expanded-regressions.txt）。R74最终统计改按细化后输出重新计数/可达与锚点检查，不报告旧计数。店铺截图欢迎语过长，最终缩为31字符，详细规则仍在F对白；交易/读回截图为缩句前，未再次折返看最后短欢迎语，不据此扩大视觉验证范围。
