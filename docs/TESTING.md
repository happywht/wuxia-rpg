# 测试说明（TESTING）

Round 38 起本项目拥有可重复运行的 Vitest 自动化测试基线；Round 39 起这些检查与资料校验、MOD 检查、类型检查和文档审计共同组成统一质量门槛 `npm run check`，并进入生产构建（`npm run build`）与 GitHub Actions 持续集成。本文说明测试命令、配置取舍、覆盖范围、质量门槛与编写约定。

## 快速开始

```bash
npm run check       # 统一质量门槛：validate:data → inspect:mods → typecheck → test → audit:round-34 → audit:round-48-docs
npm run audit:final # 完整 checkout 上核对 R00–R50 计划/提交、内容数、文档与解耦证据（独立于 check/浅克隆 CI）
npm test            # vitest run，单次运行全部测试（CI 语义；不包含性能基准）
npm run benchmark:round-40 # 性能/内存基准（R40 起；与 npm test 双向隔离，见下文）
npm run smoke:round-46 # 真实资料驱动的开局→故事分支→多结局纵向集成回归
npm run smoke:round-68 # 四区逐格旅程→日程→盐道存读档→苦井差事→渡口结局
npm run smoke:round-69 # 真实授艺路径审计→守御/反击一击结算
npm run smoke:round-74 # 云岭百格地图、跨区关口、任务链和真实 manifest 装配
npm run smoke:round-79 # 落潮湾海岛、CC0 图素、六区舆图及旧区域投影兼容
npm run smoke:round-80 # 区域事件 E 调查、旧触发兼容、方向/范围/条件与遮挡
npm run smoke:round-81 # 扩图、旧投影稳定、CC0 素材与视口复位
npm run smoke:round-82 # 海岸地图、往返关口、旧区域投影和潮尺任务
npm run smoke:round-83 # 港镇多资源装配、商店/NPC 日程、海岸任务与坏资源隔离
npm run generate:round-83-east-coast # 确定性重建青帆埠角色、商店、任务和图谱登记
npm run smoke:round-84 # 384×256 舆图、风回岛关口、素材与灯影任务闭环
npm run generate:round-84-windward-isle # 确定性扩展舆图并重建风回岛数据
npm run smoke:round-76 # 五区补充图集帧、原碰撞/画层哈希与锚点
npm run smoke:round-77 # CC0 人物帧、方向动画数据、碰撞哈希和旧格式兼容
npm run generate:round-77-characters # 确定性重建 CC0 人物图集与人物帧表
npx vitest run tests/round75-region-event-approach.test.ts # 固定事件临近线索协议与五区数据
npm run generate:round-76-region-landmarks # 确定性应用五区 24 个环境图素
npm run package:release # 质量门槛 + 生产构建 + R72 chunk 审计 + R47 归档/路径 smoke + 版本化 Web 包
npm run audit:round-72 # 检查入口/Phaser chunk、大小比例和生产 JS 引用闭合
npm run typecheck   # tsc --noEmit，严格模式，包含 tests/ 与 vitest.config.ts
npm run validate:data  # 基础资料 CLI 校验（与测试共享同一实现，见下文）
```

## 质量门槛、构建与持续集成（Round 39 起）

`npm run check` 用 `&&` 串联六个步骤，**顺序固定、任一步非零退出即中止后续步骤**：

1. `npm run validate:data` — manifest 与全部基础资源 Schema 校验；
2. `npm run inspect:mods` — manifest 中已启用 MOD 覆盖层的只读校验与最终来源报告（覆盖边界：仅启用层，未启用目录不在检查范围）；
3. `npm run typecheck` — 严格 TypeScript 检查（含 `tests/` 与 `vitest.config.ts`）；
4. `npm test` — Vitest 单元测试；
5. `npm run audit:round-34` — 文档一致性审计（地图/对白/任务/世界设定）；
6. `npm run audit:round-48-docs` — R48 建立的玩家/MOD 手册、README/发布包索引、当前完成轮次/资料状态、发布包收录与授权边界审计；当前轮次从路线图已完成条目动态读取。

`npm run build` 先完整通过 `check` 再执行 Vite 生产构建：门槛失败时不会开始打包（此前 build 只跑 `tsc --noEmit`，类型检查不重复执行）。`npm run package:release` 在 build 后执行 Round 72 chunk 审计，再创建发行归档；Round 47 smoke 会从 `/preview/wuxia-rpg/` 子路径逐个请求发行包内的 JS chunk 和其 JS import，防止入口分离后漏包或路径解析错误。

`.github/workflows/quality-gates.yml` 在 push、pull request 与 workflow_dispatch 触发时于 Node 22 运行器上执行 `npm ci`（锁文件精确安装 + npm 缓存）→ `npm run build`（含完整门槛）→ `smoke:round-35`/`36`/`37` 回归烟测；仅 `contents: read` 权限、15 分钟超时、无部署发布步骤。CI 与本地命令完全同源；workflow 首次实际运行状态以 GitHub Actions 页面为准。

- 测试框架：Vitest 5.0.2。官方指南要求 Vite >=6.4.0、Node >=22.12.0；本仓库使用 Vite 8.3.1 与 Node 22.18.0，符合要求（详见 [`docs/REFERENCES.md`](REFERENCES.md) #12；基准 API 见同文件 #16）。
- 运行环境：Node（无 DOM、无浏览器、无网络、无真实时钟依赖）。
- 覆盖统计：Round 87 当前 `npm run check` 为 61 个测试文件/407 个用例；Round 81 为 52/354，Round 77 专项发行验证为 48/324，Round 69 时为 41/292。R69 覆盖 30 门武学的起始/授艺来源、对白起点到学习效果的路径、门派导师匹配、属性曲线可达、四门身法守御映射、敌我守御的一击消耗及敌方攻击优先规则；完整历史结果见 `DEVLOG.md` Round 69。Round 51–62 增量覆盖地图/CC0 素材、舆图视口与相机坐标、地标和跨区寻路、地图扩区、见闻任务、任务导航以及动态占位路线；Round 63–64 覆盖跨时段步行模拟与多图七时段全部交互目标路线/商铺导航审计；Round 65 专项 `tests/round65-urban-art.test.ts` 以内置 PNG 调色板解码器审计城镇图集许可/网格/486 格与历史人物帧，并检查起始图城镇两图层帧引用、角色列帧禁入环境层、环境帧白名单、碰撞一致性及出生点/NPC/关口可达；Round 77 人物专项核查新 Puny 图集、方向帧/行走循环、十种外观和旧数据回退；Round 66–74 回归检查 208×128 七层舆图、五区地图、跨区关口、数据驱动人物/任务资源装配及路线可达性；`tests/round76-region-landmark-art.test.ts` 用内置 PNG RGBA 解码器核查 CC0 图集、396 帧范围与透明度、五区图层、旧画面层/碰撞哈希及玩家/事件/地标/关口/NPC/遭遇锚点。隔离浏览器还核对全域舆图 M、细图 G 和方向键行走跟随。

## 配置：为什么有独立的 `vitest.config.ts`

仓库的 `vite.config.ts` 是一个**异步工厂**：它会动态加载开发态资料热重载插件（`scripts/data-hmr-plugin.mjs`）并注册 `mods/` 开发服务器中间件。这些是 dev-server 副作用，测试运行器绝不能启动。

因此测试使用独立的 `vitest.config.ts`：当两个配置文件同时存在时，Vitest 只读取 `vitest.config.ts`、完全不加载应用配置。测试配置只声明三件事：

- `environment: 'node'` — 引擎单元是纯 TypeScript，无 Phaser 场景依赖；
- `include: ['tests/**/*.test.ts']` — 测试统一放在 `tests/` 目录；
- `benchmark.include: ['tests/**/*.bench.ts']` — 性能基准走独立通道（R40 起，见下节）。

## 性能基准：与单元测试双向隔离（Round 40 起）

性能与内存测量入口是 `npm run benchmark:round-40`（详见 [`docs/PERFORMANCE.md`](PERFORMANCE.md)），不进 `npm run check`/CI 门槛。隔离机制：

- 基准文件 `tests/performance-round-40.bench.ts` 只被 `vitest.config.ts` 的 `benchmark.include`（`tests/` 下全部 `*.bench.ts`）匹配；`npm test` 的 `test.include` 只匹配 `*.test.ts`——普通测试运行永远看不到基准文件，反之 `vitest bench` 只跑基准。Vitest 5 的基准 API（`test()` 回调中的 `bench` fixture）也只在 `*.bench.ts` 文件内可用。
- 入口 `scripts/benchmark-round-40.mjs` 串联两段：`vitest bench --run --silent=false`（`NODE_OPTIONS=--expose-gc` 使长跑可在读堆前强制 GC）与裸 Node 通道 `scripts/benchmark-round-40-bare.mjs`（Vite `build.ssr` 打包真实渲染器后计时，抵消 Vitest 模块 runner 的 export-getter 开销）。
- 基准内只做**结构性断言**（每轮 26 资源 / 0 诊断），毫秒与堆读数全部是描述性输出——速度不构成任何通过/失败条件。

## 测试覆盖范围

| 文件 | 覆盖对象 | 要点 |
| --- | --- | --- |
| `tests/event-bus.test.ts` | `src/engine/event-bus.ts` | `on`/`off`/unsubscribe 身份语义与幂等；`once` 恰好投递一次；**once 重入**（监听器内部重发同一事件时自身不再触发，重入投递仍达新订阅者）；`emit` 快照迭代（投递期间新订阅的监听器不收当次事件）；`clear`/`listenerCount` |
| `tests/dialogue.test.ts` | `src/engine/dialogue-graph.ts`、`dialogue-runtime.ts` | `parseDialogueSet` 正反向（信封破损整份拒绝、单段坏对话仅隔离自身）；`validateConversation` 图语义（重复节点 id、缺失起始节点、悬空选项目标）；运行时条件可见性 `isConditionMet`/`getVisibleOptions`（questStatus/itemCount/道德边界含端点/timeOfDay/npcKnows/knowledgeKnown；多条件全满足才可见、空结果即结束节点、索引指向原始数组）；`DialogueSession` 播放与敌意输入忽略 |
| `tests/quest-system.test.ts` | `src/engine/quest-system.ts`、`quest-consequences.ts` | `parseQuestSet` 防御解析；`assembleQuests` 跨资源装配（坏发布人/奖励引用剔除、前置循环禁用、互斥组整组校验）；接受/推进/完成/失败生命周期及互斥分支连带失败；声望/见闻奖励随首次完成发放、声望边界钳制与重复信号不重发 |
| `tests/data-validation.test.ts` | `scripts/lib/data-validation.mjs`、`scripts/validate-data.mjs` | **真实仓库**正向校验（manifest + 全部基础资源计数一致）；临时 fixture 反向校验（资源违反 Schema、manifest 违反 Schema、资源文件缺失、无效 Schema、JSON `null`）；另以临时 CLI 副本启动真实 Node 子进程，锁定可读错误输出与非零退出码 |
| `tests/grid-map-renderer.test.ts` | `src/engine/grid-map-renderer.ts` | R40 渲染器结构回归：场景对象数随面积增长恒为 2（O(1) 契约）；逐格命令顺序（底色→边线→亮边→暗边）与几何/颜色/alpha 精确锁定；绘制范围与地图像素尺寸一致；Graphics 挂在返回容器内（地图切换 `destroy()` 级联语义）；样式去重；`cellCenterOffset` 普通坐标返回；R52 验证容器及回退 Graphics 脱离 HUD 固定滚动默认值 |
| `tests/settings.test.ts` | `src/game/settings.ts` | R41 设置回归：Round 09 旧载荷 `{volume,textScaleIndex}` 迁移（新字段补默认、旧存储字节不动）；完整六字段往返；新字段"存在但无效"整载荷拒绝且不动存储；音量/字号越界与 JSON 损坏回退默认；写入拒绝（会话内仍生效）；`applyGameSettings` 声音总线音量与画布高对比度滤镜（mock game 结构替身，无浏览器依赖）；五档字号单调与 `uiFontSize`；`settingsRows`/`adjustGameSetting` 共享行数、循环与钳制语义 |
| `tests/input-settings.test.ts` | `src/game/input-settings.ts` | R41 输入回归：三档移动键位解析与键集（arrows 恰 4 键 / wasd 恰 4 键 / both 8 键）、逐键启用判定与帮助文本；摇杆死区（默认 0.5 与自定义）、主导轴、对角水平优先、非有限值；D-pad 基数优先于摇杆与对向键消解；标准映射采样（D-pad/左摇杆/A→confirm、B→back）；`GamepadEdgeTracker` 按住只发一次、换向即新边沿、释放重触发、confirm/back 边沿与 `reset()` |
| `tests/round42-story.test.ts` | `src/engine/quest-system.ts`、`dialogue-graph.ts`、`ending-system.ts` 与基础故事资料 | R42 主线集成：完整载入并装配任务和四张目标对白图；校验 R31 渡籍补录到三段主线、共享前置互斥分支、对话任务/物品/图谱引用；实际驱动任务状态机完成两条路线，验证兄弟失败和各自唯一新结局可达 |
| `tests/world-map.test.ts` | `src/engine/world-map.ts` 与 world-map schema | R43 漫游奇遇：旧地图缺省兼容、概率值拒绝、坏发现节点隔离、稳定候选顺序、无资格候选不消耗随机源、概率/一次性/可重复语义；R44 nearbyNpcIds 全员邻接判定与坏人物引用隔离 |
| `tests/round80-region-interactions.test.ts` | `src/engine/world-map.ts`、world-map schema 和云岭/海岛真实地图 | R80 交互字段解析与 Ajv 校验、旧踏入事件兼容、按方向/距离筛选、视线阻挡、事件条件/一次性状态、坏接近格隔离及两处真实环境调查点；专项命令 `npm run smoke:round-80` |
| `tests/round43-faction-routes.test.ts` | `src/engine/quest-system.ts`、`dialogue-runtime.ts` 与五派基础资料 | R43 门派支线：五项门派/见闻门槛与对白一致性、真实接取拒绝/成功、谈话完成及结果见闻发现、坏门派引用隔离 |
| `tests/round44-dynamic-events.test.ts` | `npc-schedule.ts`、`world-map.ts`、任务/对白/声望协议与基础资料 | R44 集成：解析真实日程并证明黄昏玩家邻接/日中离场；双 NPC 条件、时辰条件；两项互斥任务的对白入口、目标、一次性声望/知识奖励和声望钳制 |
| `tests/round45-balance.test.ts` | `arena-challenge.ts`、`turn-based-combat.ts`、角色成长和基础战斗/擂台资料 | R45 平衡回归：首夺一次性银两/物品、失败和重赛奖品为零、旧 `championships` 记录兼容、擂台每场战斗经验保留；无装备/无伙伴/起始散手开场实战 5 招胜出并验证升级补血 |
| `tests/round46-vertical-slice.test.ts` | 真实基础角色、地图、任务、对白、物品、战斗、武学、存档、图谱与结局资料及对应 Phaser-free 引擎 API | R46 纵向验收：开局和地图阻挡、真实 NPC 对白接任务、巷战经验/奖励、拜师学艺、快照往返与恢复、R42 两条互斥路线各自抵达一个结局；不会模拟浏览器 UI |
| `tests/release-package.test.ts` | `scripts/lib/release-package.mjs` | R47 发布协议：稳定排序的 SHA-256 清单、版本/提交约束、强制静态运行文件、拒绝路径穿越/隐藏目录/重复与递归清单，并要求归档精确符合 staging allowlist |
| `tests/round50-final-acceptance.test.ts` | `scripts/lib/final-acceptance.mjs` 与缺资料运行时入口 | R50 正反向临时 fixture：核验 51 份计划字段/子任务、轮次 commit、实际内容计数、24 份交付文档、Schema 家族、同名 MOD 路径与引擎资料字面量；验证缺计划/提交/数量、未登记 MOD 和世界 manifest 404 的可读错误 |
| `tests/round51-map-art.test.ts` | 基础地图/NPC 数据、地图 Schema 与官方静态素材 | R51 核对起始图 100×100 / 5 层资料尺寸、角色图集帧声明、碰撞容量、真实 CC0 图集与 License 文件；R55 回归渡口现为 100×100 / 10 层、关口与聚落可行格及边界碰撞 |
| `tests/round51-map-viewport.test.ts` | `src/engine/map-viewport.ts` | R51 核对全图适配、视窗边界钳制、以指针为中心的缩放、较小地图居中；Phaser UI 的滚轮与拖动另行做浏览器手测 |
| `tests/round52-map-camera.test.ts` | `src/engine/grid-map-renderer.ts` + 当前 100×100 地图资料 | R52 模拟 Phaser 场景新增对象默认固定在 HUD 平面的情况，验证真实地图 Image 与世界容器显式设回滚动坐标 |
| `tests/round52-map-landmarks.test.ts` | `src/engine/world-map.ts` + 两张基础地图 | R52 验证旧 world-map 缺省兼容、六个真实地标装配、无效地图/越界坐标逐条隔离和未知类别拒绝；R53 验证发现引用门控、坏节点隔离和未发现地点不进入可见资料投影 |
| `tests/grid-path.test.ts` | `src/engine/grid-path.ts` | R53 四向确定性最短路：绕障、solid 地标停靠点、并列路线稳定、越界/封闭区域拒绝、默认/自定义/非法半径、真实渡口数据路线与方向分段；R57 覆盖最短可行关口交互格、已经邻接和无可行停靠点 |
| `tests/world-travel.test.ts` | `src/engine/world-travel.ts` | R54 有向区域 BFS：稳定最短关口链、同长按关口 id 决胜、起点等于终点/未知地图/孤立区域边界 |
| `tests/world-navigation.test.ts` | `src/engine/world-navigation.ts` | R54 waypoint 组合：本区地标与关口投影、直接相邻区域可见、远区见闻门控不泄漏、远区目的地复用当前首关口坐标 |
| `tests/world-navigation-guidance.test.ts` | `src/engine/world-navigation-guidance.ts` + 两张基础地图与世界图 | R57 验证远区稳定地标在首关口与切区后续接本地区段、处于 E 交互格时的到关口状态、本区地标抵达、隐藏地标不泄漏及断开有向路线诊断 |
| `tests/round55-ferry-world.test.ts` | 基础地图/世界图/NPC/遭遇资料与 `grid-path.ts` | R55 雾雨渡口百格区域回归：100×100/十层尺寸、CC0 License、可行格下限、渡口关口/事件/NPC 日程/遭遇从出生点可达、双向端点精确值和碑记发现 `place.mist-sluice`；兼顾第五张地图后的世界图装配与历史地图阻挡地标停靠规则 |
| `tests/round62-iron-ridge.test.ts` | 五张基础地图、世界图/NPC/遭遇/任务/日历与寻路装配 | R62 铁嶂北道：100×100/十层图集范围、7,818 个可行格、五图/八关口装配、新增锚点 BFS，以及三段差事发布人和目标在七个时段的动态占位路线 |
| `tests/round67-salt-road.test.ts` | 西陲盐道地图/全域舆图/图谱/对白/任务装配资料 | R67 盐道 100×100/十层、入口 BFS 可达格、更新后的五图八关口装配、事件与地标可达、罗金子日程与差事完成闭环 |
| `tests/round68-long-journey.test.ts` | 五张基础地图、世界图、日历/气候、NPC 日程、遭遇、对白/任务/图谱、v1 存档和结局资料 | R68 历史四区 749 格逐步往返与五次切图、六时段/跨日、真实事件发现、远区保存/恢复、盐道见闻差事及行舟万里结局；世界装配包含第五区，旅程步骤保持原历史范围；专项命令 `npm run smoke:round-68` |
| `tests/round74-cloud-ridge.test.ts` | 五张区域图、世界舆图、NPC 日程、遭遇、对白/任务/图谱 | R74 云岭 100×100/十层与 GID、双向关口 BFS、所有地标/事件/NPC/遭遇锚点可达、两段任务链及 208×128 总图整合；与 `round49-default-world-integrity.test.ts` 共同覆盖分拆 NPC/任务资源装配，专项命令 `npm run smoke:round-74` |
| `tests/round77-character-art.test.ts` | CC0 人物图集、五区地图/NPC 资料、`grid-map` 帧选择器 | 4 项检查：PNG 320 帧/十种外观实际 alpha、五区方向 idle/三帧 walk 与碰撞哈希、NPC 外观分布、缺省方向映射与示例 MOD 兼容、发行包 CC0 来源清单 |
| `tests/round78-actor-depth.test.ts` | 五区地图/NPC 资料、`grid-map` 朝向规则和地图渲染深度函数 | 7 项检查：四向互相面向、显式前景行筛选/缓存通道、同一行遮挡 tie-break、NPC 四向帧/图集范围和旧静态格式回退、未知深度值拒绝 |
| `tests/round69-martial-paths.test.ts` | 基础角色、武学、全部对话、NPC 与门派资料 | R69 从对话起点核验授艺条件/效果/门派导师；覆盖 30 门目录、五派数量、无门派招式公开路线和裸成长属性门槛可达性 |
| `tests/round69-guard-combat.test.ts` | 基础角色、武学、开场遭遇与 `CombatSession` | R69 四门真实身法守御映射、内力支出、下一次攻击减伤、最低 1 点伤害、敌方守御消耗及攻击优先；专项命令 `npm run smoke:round-69` |
| `tests/round56-discovery-quests.test.ts`（及 R56 扩展的任务/世界地图/图谱既有测试） | quest-set/知识图谱/世界图资料与 `quest-system.ts` | R56 发现见闻回归：`discoverKnowledge` 目标与两段渡口巡标差事的解析/装配引用校验、首次发现信号只推进匹配目标一次、接取时已知见闻回填、旧档恢复重算、奖励见闻级联推进与发现门控地标/事件引用；专项命令 `npx vitest run tests/quest-system.test.ts tests/round56-discovery-quests.test.ts` 为 2 文件/29 用例 |

测试只调用**公共导出函数**并断言行为，不做源码文本匹配；引擎模块均为 Phaser-free 设计，无需启动任何场景。

## 数据校验：CLI 与测试共享同一条代码路径

Round 38 之前 `scripts/validate-data.mjs` 在模块顶层直接执行校验（顶层 `await` + `assert`），无法被安全导入。现在：

- **`scripts/lib/data-validation.mjs`** — 唯一的校验实现：`validateBaseData(root)` 返回结构化结果 `{ ok: true, validated }` 或 `{ ok: false, problems }`，不打印、不抛错、不触碰进程状态；文件缺失、JSON 损坏、Schema 编译失败都被折叠为 `problems` 条目；合法 JSON `null` 会被送入 Schema 校验而不是误认作读取失败。
- **`scripts/validate-data.mjs`** — 薄 CLI 入口：成功时输出与历史逐字节一致的成功行；失败时把每条 problem 打到 stderr 并置非零退出码（与旧的 assert 抛错同样以非零退出）。
- **`scripts/lib/data-validation.d.mts`** — 类型声明，让严格 TypeScript 测试直接导入该模块而不重复实现规则。

因此 `npm run validate:data` 的结果与 `tests/data-validation.test.ts` 的正向用例**永远同源**：任何 Schema 或校验行为的变更都会同时体现在 CLI 与测试中。

## 编写约定

1. **断言行为而非实现**：只经公共 API 触发与验证；不断言源码文本、模块私有结构。
2. **失败案例用临时 fixture**：反向数据校验在 `mkdtemp` 临时目录构造（Schema 从仓库复制、数据手写破坏），`afterEach` 清理，绝不修改 `data/` 下受版本控制的资料。
3. **确定性优先**：不依赖真实时间、随机数、网络或跨用例共享可变状态；每个用例自建 fixture（如任务、对话、运行时上下文）。
4. **类型即测试**：`tests/` 与 `vitest.config.ts` 均在 `tsconfig.json` 的 `include` 内，`npm run typecheck` 对测试代码执行同等严格检查（`noUncheckedIndexedAccess` 等全部生效）。
5. **保持隔离**：不引入 DOM/浏览器环境需求；需要 Phaser 场景的 UI 层验证仍走各轮专项烟测脚本（`npm run smoke:round-*`）。

## 与既有验证手段的关系

| 手段 | 定位 |
| --- | --- |
| `npm run check` | 统一质量门槛（R39 起）：资料、MOD、类型、测试、文档审计一次跑全，任一失败非零退出 |
| `npm test`（Vitest） | 引擎规则与数据校验的快速单元回归，毫秒级、可重复（check 的第 4 步） |
| `npm run validate:data` | 内容作者的提交前资料检查（与测试共享实现；check 的第 1 步） |
| `npm run smoke:round-*` | 各轮专项端到端烟测（含真实 Vite 服务器、CLI 全链路）；R35–37 三条进入 CI |
| `npm run smoke:round-42` | Round 42 主线专项集成验证（章节状态机、对白图引用、互斥分支与结局可达性） |
| `npm run smoke:round-43` | Round 43 漫游事件协议及五派支线资格/对白/见闻集成回归 |
| `npm run smoke:round-44` | Round 44 NPC 日程附近条件、任务声望/见闻奖励与渡口互斥分支回归 |
| `npm run smoke:round-46` | Round 46 真实资料驱动的开局、任务/战斗/成长、存档恢复和两条结局路线纵向回归 |
| `npm run smoke:round-47` | Round 47 npm 版本归档解包/哈希核验及非根路径 HTML/JS/CSS/MOD/当前 manifest 资源与 Schema、全部 CC0 图集/许可加载验证（先运行 `npm run package:release`） |
| `npm run smoke:round-78` | NPC 四向交互、五区前景行、旧 NPC 单帧兼容和默认世界装配专项 |
| `npm run audit:final` | 完整 Git checkout 专用的 R00–R50 最终结构审计；核对 51 份计划标题、子任务小节（至少两项）和至少 10 分钟计划工时估算、逐轮 round commit、同 Schema 多资源合并计数、Schema 家族、同名 MOD 样例、资料解耦/错误回退证据文件与必需交付文档 |
| `npm run smoke:round-20` | 擂台首夺货币/物品彩头、逐场经验、连战与旧/新 v1 存档回归（R45 扩展） |
| `npm run typecheck` | 严格类型检查（check 的第 3 步） |
| `npm run benchmark:round-40` | 性能/内存基准（R40 起）：渲染对象数与耗时双口径、26 资源加载、50 轮长跑堆观察；与 `npm test` 双向隔离、不进门槛（读数与局限见 `docs/PERFORMANCE.md`） |
| `npm run build` | `check` 全部通过后的 Vite 生产构建门槛（R39 起含完整 check） |
| GitHub Actions（`.github/workflows/quality-gates.yml`） | push/PR/手动触发的托管同源门槛 + R35–37 烟测（R39 起） |

## 变更记录

- 2026-09-29（Round 78）：新增人物朝向/地图纵深专项，检查五区前景行数据、相互面向方向函数、同一行遮挡 tie-break、静态 NPC 回退和未知图层标记拒绝；专项命令为 `npm run smoke:round-78`。
- 2026-09-29（Round 65）：新增 `tests/round65-urban-art.test.ts`（内置纯 Node PNG 调色板解码器，审计 RPG Urban Pack CC0 许可文本、432×288/27×18 网格与 486 格非空、三图角色图集与帧落在角色列、14 名 NPC 帧非空/互异/不与玩家共用、起始图两种新路面层的帧引用、角色列帧禁入环境层、铺装只落于原装饰空白的可走格、井盖具有路面底层、出生点/NPC/关口 BFS 可达）；`tests/round51-map-art.test.ts` 图层数/图集清单/玩家帧断言随协议演进更新。同日两次视觉纠偏：先以联络表排除把门窗误作人物/路面的错误帧；再发现原阻挡区属于墓园后，取消门面覆盖，限制地面仅落于可走且原装饰为空的格子。专项 2 文件 14 用例与关联回归 5 文件 16 用例通过；全量与发行数字见 `DEVLOG.md` Round 65 验证段。
- 2026-09-29（Round 66）：新增 `tests/round66-world-atlas.test.ts` 5 项全域舆图回归；该测试夹具随 Round 70/74/84 迭代，当前检查 384×256 二十层（保留原十六层并增添四个 Puny World 东/南拓展层）的尺寸/GID、主地表连续性、旧世界无 `atlasArt` 兼容、坏尺寸/帧拒绝、所有区域/关口/玩家投影及未发现地标隔离。Round 66 当时的 128×80 五层历史结果及浏览器操作仍见 `DEVLOG.md` Round 66。
- 2026-09-29（Round 67）：新增 `tests/round67-salt-road.test.ts` 4 项回归，检查 100×100 盐道图、十层 Kenney CC0 画面、8,280 个入口连通可行格、58 个受保护锚点；其全域投影夹具现随地图扩展更新为六图/336×224/十个有向关口。罗金子日程、敌对遭遇和苦井发现任务回归保持不变。`tests/round52-map-landmarks.test.ts` 增加盐道三处普通地标与回声苦井发现门控断言。Round 67 当时的四区投影与六个关口历史结果见 `DEVLOG.md` Round 67。
- 2026-09-29（Round 68）：新增 `tests/round68-long-journey.test.ts` 一项集成回归与 `npm run smoke:round-68`，逐格使用当前四区真实地图、动态 NPC/遭遇、日历气候、存档 API 与结局 API 完成盐道去返/任务/结局路线；测试为逐段方向路径新增关口相邻格断言。浏览器试玩记录明示人工实走首个关口及舆图操作；完整后半程由自动引擎集成回归覆盖，未冒称浏览器手测。最终全量统计和命令见 `DEVLOG.md` Round 68。
- 2026-09-29（Round 74）：新增五区云岭专项回归与 `smoke:round-74`，并扩展真实 manifest 世界装配断言，确保多份 `npc-set`/`quest-set` 资源均进入 NPC、对白和任务运行集；补齐云岭地图知识节点与图谱边端点。
- 2026-09-29（Round 56）：新增 `tests/round56-discovery-quests.test.ts`，扩展 `tests/quest-system.test.ts` 及地图/知识图谱/旧档相关回归，净增 9 个用例；基线 26 文件/202 用例。专项 2 文件/29 用例及 `npm test` 的 26/202 全量通过；`npm run package:release` 全门槛通过并生成 756,726 bytes 发行包（69 个内容文件，SHA-256 `e5e474dd3d7d268beb0c6ff41f391a85a8d310efde7f2450273ce86347b60a61`）；详情见 `DEVLOG.md` Round 56。
- 2026-09-29（Round 57）：新增 `tests/world-navigation-guidance.test.ts` 4 个用例，扩展 `tests/grid-path.test.ts` 2 个用例并加强稳定地标 id 断言；专项 `typecheck` + 3 文件/24 用例通过。完整门槛首次运行发现文档审计遗漏，补齐 Round 57 DEVLOG 与 DATA-GUIDE 状态后复跑全部 27 文件/208 用例、Schema/MOD/类型/双文档审计、生产构建和归档 smoke 均通过，详情见 `DEVLOG.md` Round 57。
- 2026-09-28（Round 55）：新增 `tests/round55-ferry-world.test.ts` 3 个用例，锁定雾雨渡口 100×100/十层 CC0 地图尺寸、可行格下限、全部玩法锚点 BFS 可达、两向关口端点精确值与碑记事件发现引用；更新旧测试的地图尺寸和地标基线。`npm run package:release` 全通，25 个测试文件/193 个用例通过，完整输出见 `DEVLOG.md` Round 55。
- 2026-09-28（Round 54，补记）：新增 `tests/world-travel.test.ts` 与 `tests/world-navigation.test.ts` 共 14 个用例（有向区域最短关口链、waypoint 组合与远区见闻门控）；当轮完整验证为 24 文件/190 用例（证据见 `DEVLOG.md` Round 54，本表此前未随 R54 更新，现补齐）。
- 2026-09-28（Round 51）：新增 2 个测试文件/7 个用例，覆盖 100×100 Kenney 五层地图/人物素材及舆图适配、钳制、指针缩放、地图居中；浏览器手测新游戏、跟随镜头、滚轮放大后拖动地图。Round 51 当时统计为 19 个文件/155 个用例。
- 2026-09-28（Round 52）：新增 2 个测试文件/5 个用例，覆盖地图贴图退出 HUD 固定默认值、旧 world-map 兼容、真实六标记装配、坏地图/越界点逐项隔离和未知类别拒绝；更新 performance bench 的真实地图夹具以适配 100×100 网格。`npm run check` 全通，完整覆盖 21 个测试文件/160 个用例。
- 2026-09-28（Round 53）：新增 `tests/grid-path.test.ts` 11 用例，验证确定性四向最短路、阻挡地标停靠、封闭/越界端点、半径配置、方向压缩和真实雾雨渡口路线；扩展 `tests/round52-map-landmarks.test.ts` 5 用例，验证发现门槛引用隔离及未知地标从展示投影中完全移除。最终全量命令/用例数与浏览器操作记录于 Round 53 开发日志。
- 2026-09-28（Round 50）：新增 `tests/round50-final-acceptance.test.ts` 5 用例，含通过夹具及轮次/计划/内容/MOD/引擎边界反向 fixture，并验证多资源汇总、子任务小节/最低工时判断和缺 manifest 时的玩家可读错误；补充 quest completion 清理旧跟踪 ID 的状态回归。完整覆盖统计更新为 17 文件/148 用例。`npm run audit:final` 依赖 Git 完整历史，单独执行而不进入浅克隆 CI `check`。
- 2026-09-28（Round 49）：新增真实 `data/` 世界装配回归，检查清单内资源全部加载、核心内容数量达标且默认可选系统没有装配告警；修复沼琥珀锻造配方产物降低原装备 resolve/qi 的错误；文档审计改为从路线图识别最新已完成轮次。浏览器另走查新游戏、移动/墙体与 NPC 阻挡、对白/任务接取、擂台入口和暂停设置/空存档槽导航；详情见 `docs/PLAYTEST-FEEDBACK.md`。完整覆盖统计更新为 16 文件/143 用例。
- 2026-09-28（Round 48）：新增 `tests/docs-audit-round-48.test.ts` 9 用例覆盖玩家/MOD 指南、README/包索引、实际命令、manifest/Schema/内容计数、轮次/绝对路径和许可边界正反向审计；测试统计更新为 15 文件/142 用例。`npm run check` 新增末尾步骤 `audit:round-48-docs`。
- 2026-09-28（Round 43）：新增 `tests/world-map.test.ts` 6 用例与 `tests/round43-faction-routes.test.ts` 3 用例，覆盖可选随机事件协议及五派任务资格、真实状态机/对白发现；覆盖统计更新为 10 文件 117 用例，新增 `npm run smoke:round-43`。
- 2026-09-28（Round 44）：新增 nearby NPC 条件和任务声望/图谱奖励的解析、装配、幂等结算测试；新增真实渡口日程/邻接和两条互斥路线集成用例；新增 `npm run smoke:round-44`。完整覆盖统计更新为 11 文件 123 用例。
- 2026-09-28（Round 45）：新增 `tests/round45-balance.test.ts` 4 用例，覆盖首次夺魁奖品、未完成/重赛边界、逐场经验保留和开场战斗升级基线；扩展 `npm run smoke:round-20` 检查首夺彩头及每轮经验。完整覆盖统计更新为 12 文件 127 用例。
- 2026-09-28（Round 46）：新增 `tests/round46-vertical-slice.test.ts` 2 用例，以真实基础资料串联开局、网格阻挡、NPC 对白、任务、战斗成长、拜师学艺、快照恢复与 R42 两条互斥结局路线；新增 `npm run smoke:round-46`。完整覆盖统计更新为 13 文件 129 用例；不声称覆盖浏览器 UI。
- 2026-09-28（Round 47）：新增 `tests/release-package.test.ts` 4 用例，验证版本清单、哈希与路径 allowlist；`npm run smoke:round-47` 解包版本归档并检查全部文件哈希后，将其挂载到非根路径实际加载 26 项基础资料/Schema；新增 `npm run package:release` 与手动 Pages 流程。完整覆盖统计更新为 14 文件 133 用例。
- 2026-09-28（Round 42）：新增 `tests/round42-story.test.ts` 3 用例，验证 R31→R42 任务解锁、两份对白图引用、分支互斥/兄弟失败及两条数据结局可达性；新增 `npm run smoke:round-42` 专项入口；覆盖统计更新为 8 文件 108 用例。
- 2026-09-28（Round 41）：新增 `tests/settings.test.ts`（21 用例：v1 旧载荷迁移、验证/持久化、声音总线与画布外观应用、五档字号、共享设置行/调整语义）与 `tests/input-settings.test.ts`（21 用例：键位布局、摇杆死区/主导轴、D-pad 基数优先、标准映射采样、边沿检测）；覆盖统计更新为 7 文件 105 用例。手柄路由的浏览器内行为另经生产构建 + Playwright 烟测（设置导航/画布滤镜/布局门控），物理控制器硬件未测试——见 `DEVLOG.md` Round 41。
- 2026-09-28（Round 40）：新增性能/内存基准通道 `npm run benchmark:round-40`（`benchmark.include` 独立匹配 `*.bench.ts`，与 `npm test` 双向隔离）；新增 `tests/grid-map-renderer.test.ts` 10 用例锁定 R40 单 Graphics 渲染器结构契约；覆盖统计更新为 5 文件 63 用例。
- 2026-09-28（Round 39）：新增统一质量门槛 `npm run check`（资料校验 → MOD 检查 → 类型 → 测试 → 文档审计，`&&` 串联失败即中止）；`npm run build` 改为先过 `check` 再 Vite 生产构建；新增 GitHub Actions `quality-gates.yml`（Node 22、`npm ci`、只读权限、15 分钟超时、build + R35–37 烟测）。
- 2026-09-28（Round 38）：建立 Vitest 5 测试基线；抽取共享数据校验器 `scripts/lib/data-validation.mjs`（CLI 变薄）；新增四组 53 个单元测试；`tsconfig.json` 纳入 `tests/` 与 `vitest.config.ts` 严格检查。

| `tests/round79-island-region.test.ts` | 海岛资料/图素、世界舆图与任务闭环 | 4 项检查：100×100 与 16px/27×65 CC0 图集引用、入口连通和渡口双向 BFS、四地标/三区域事件可达、旧区域投影像素不漂移、岛链总图层/图集边界、对白接取并发现灯标后完成任务；纳入 `npm run smoke:round-79`。 |
| `tests/round80-region-interactions.test.ts` | 区域事件交互 Schema、选择器及云岭/海岛真实地图 | 覆盖声明校验、旧踏入事件、方向/距离、动态视线遮挡、条件/一次性状态与真实事件坐标；纳入 `npm run smoke:round-80`。 |
| `tests/round81-world-atlas.test.ts` | 扩展全域舆图、区域投影、已登记 CC0 图素与视口 | 校验当前 448×320 Schema/解析上限、旧 384×256 区域逐格哈希、全部既有锚点像素坐标、东/南新地貌、许可引用及 fit/pan/reset；纳入 `npm run smoke:round-81` 和 `npm run smoke:round-85`。 |
| `tests/round82-east-coast.test.ts` | 东溟海岸、双向步行关口、CC0 像素素材和潮尺任务闭环 | 校验第七张 100×100 地图、旧六区投影、两端 BFS 可达、锚点与调查方向、素材尺寸/许可、对白接取、见闻完成及任务奖励；纳入 `npm run smoke:round-82`。 |
| `tests/round83-east-coast-town.test.ts` | 内容集合装配器与青帆埠港镇资料 | 校验跨资源 items/shops/encounters 合并、损坏集合隔离、重复 id 首项优先、七时段 NPC 可达与无冲突、限量商品购买、互动门控、两段任务奖励及图谱引用；纳入 `npm run smoke:round-83`。 |
| `tests/round84-windward-isle.test.ts` | 风回岛地图、舆图扩展、双向关口和灯影任务 | 校验 100×100 可走岛图、CC0 图集/GID、384×256 新海岛地貌、两端 BFS 可达、地标/事件通路、对白接取任务、灯标发现奖励及图谱端点；纳入 `npm run smoke:round-84`。 |
| `tests/round85-tide-isle.test.ts` | 潮生屿地图、舆图扩展、潮位事件与跨岛任务 | 校验 448×320/24 层舆图、旧二十层矩阵哈希与八区像素锚点、CC0 图集/GID、两端 BFS、潮位引用、气候装配、任务对白与图谱关系；纳入 `npm run smoke:round-85`。 |
| `tests/round85-tide-system.test.ts` | 游戏内潮汐周期和低潮事件条件 | 校验 720 分钟周期边界、旧 climate MOD 兼容、重复/无效相位拒绝，以及 `tideIds` 按相位放行；纳入 `npm run smoke:round-85`。 |
| `tests/round86-world-atlas-rle.test.ts` | 舆图逐行 RLE 协议与历史密集 MOD 兼容 | 检查 JSON Schema 编码互斥、坏 token/尺寸/GID 拒绝、旧密集层解析、生成器 RLE 无损往返及 24 层历史 SHA-256；纳入 `npm run smoke:round-86`。 |
| `tests/round86-world-atlas-labels.test.ts` | 全景区域标题排布 | 用真实 448×320 总图的九区坐标与视口缩放，检查完整标注处于 616×340 视口内且互不重叠，并让当前区域保留原始锚点；纳入 `npm run smoke:round-86`。 |
| `tests/round86-tide-and-supply.test.ts` | 潮生屿低潮战斗、NPC 与有限药囊 | 检查遭遇只在 `tide.low` 存在且可重复、不奖励经验，气候相位引用有效；整世界装配、补给 NPC/商店库存、物品引用和知识图谱无告警；纳入 `npm run smoke:round-86`。 |
| `tests/round87-southwest-isles.test.ts` | 西南列岛、舆图扩展、CC0 素材、跨区关口和「雾航引水」 | 校验旧 448×320 舆图 24 层哈希、九区投影不漂移、512×384/28 层新海域、新地图碰撞与可达性、CC0 图集帧、双向过图、任务目标顺序/导航/奖励及历史夹具兼容；纳入 `npm run smoke:round-87`。 |
| `tests/round88-mist-schedule.test.ts` | 轻雾天气协议、敖晚晴七时段日程与雾哨崖调查窗口 | 校验旧雨雪格式兼容、雾粒子参数解析/无效值、种子日期确定性、七个日程位置可达无告警、天气/时段/NPC 邻接 AND 门控、一次性调查与原跨区差事顺序；纳入 `npm run smoke:round-88`。 |
- 2026-09-29（Round 79）：新增海岛区域专项与可重复生成命令；世界图夹具升级为六区/十向关口，覆盖 Puny World CC0 图集网格、任务发现奖励、舆图保留旧大陆图层及旧区域锚点稳定。专项命令 `npm run smoke:round-79`。
- 2026-09-30（Round 80）：新增固定区域事件环境调查专项，覆盖 interaction Schema/解析、默认踏入事件、方向/距离/视线、条件/一次性与云岭悬桥/落潮湾灯标真实格位；`npm run smoke:round-80`。
- 2026-09-30（Round 81）：新增 336×224 超大舆图专项，锁定旧 12 层历史像素、六区及全部关口/地标/玩家投影，验证新拓展图素、Schema 最大尺寸、Puny World CC0 来源与适配视口；`npm run smoke:round-81`。
- 2026-09-30（Round 84）：舆图当前扩至 384×256；逐格哈希守护旧 336×224 画布、更新八区投影兼容，并新增风回岛地图/关口/任务测试；`npm run smoke:round-84`。
- 2026-09-30（Round 85）：舆图当前扩至 448×320；SHA-256 锁定旧 384×256 二十层像素和八个旧区域中心；新增潮生屿、低潮门控、跨岛任务及历史装配夹具，复用已登记 CC0 素材；`npm run smoke:round-85`。
- 2026-09-30（Round 86）：新增逐行 RLE Schema/解码、密集 MOD 兼容、448×320 九区全景标签避让、潮生屿低潮遭遇与限量药囊/存档测试；`npm run smoke:round-86`（专项 6 文件/34 项）。
- 2026-09-30（Round 87）：新增 512×384、28 层舆图扩展与旧像素/投影守护；西南列岛可达性、CC0 图素帧、双向关口、跨区三阶段任务和目的地导航回归；`npm run smoke:round-87`（18 个测试文件，104 项）。完整质量门槛结果记录于 `DEVLOG.md`。
- 2026-09-30（Round 88）：新增可选 `fog` 天气粒子解析、气候兼容/确定性、七时段 NPC 可达性、雾哨崖 AND 条件与旧任务顺序专项；`npm run smoke:round-88`（5 个测试文件，33 项）。完整质量门槛与浏览器走查边界记录于 `DEVLOG.md`。
