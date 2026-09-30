# Round 90 计划：跨区抵达奇遇与潮路回访

## 本轮目标

扩展现有数据驱动漫游奇遇协议，使作者可声明事件在成功走格或通过指定跨区关口抵达时触发，并能按入境关口、知识、时段、天气等既有条件门控。沿 R89 学到的回汐潮序，增加青帆埠与云岭古道之间一组往返抵达见闻；事件发现与一次性完成状态应在存档/读档后保持一致，玩家重新走过时不重复播报。

## 用户故事

- 作为完成「东汊回声」并再次行走这条潮路的玩家，我能在抵达青帆埠或返抵云岭古道时看到与实际来路相关的见闻，而不是只有普通的区域切换提示。
- 作为资料作者，我能声明一条漫游事件响应的触发类型与允许的入境关口；旧事件省略新字段时仍只在成功走格后抽取。
- 作为读档玩家，我保存往返中途的探索状态后，已见过的一次性抵达奇遇不会重播，尚未触发的返程奇遇仍可正常出现。

## 验收标准

1. 计划先于本轮实现变更落盘；计划含不少于 3 个子任务，预计人类工程师工时不少于 10 分钟。
2. `randomEvents` 可声明 `trigger: "step" | "regionArrival"` 和可选 `transitionIds`；旧资源省略时兼容按 `step` 解析。入境关口引用需存在且其目的地图必须与事件地图相同；无效行按资源隔离并给出可读警告。
3. 场景只在成功切换地图后，将实际 `RegionTransitionData.id` 交给抵达事件选择器；被阻挡/拒绝的关口、开局、原地等待和普通走格不能误触发抵达奇遇。原有走格奇遇抽取时机和概率语义保持不变。
4. 以 `place.r89-safe-return-current` 为条件，加入青帆埠入境和返回云岭古道的原创一次性潮路见闻；知识图谱端点、世界事件、跨区关口、任务奖励引用完整，不改旧关口、碰撞、舆图像素或存档版本。
5. 专项测试使用真实基础世界地图与关口验证入境来源筛选、成功抵达触发、条件未满足不消耗概率、一次性事件与知识发现经 v1 存档恢复，以及旧 `step` 行为兼容；`npm run validate:data`、`npm run typecheck`、`npm run check`、`npm run build` 通过。
6. 更新地图/漫游事件协议、图谱、世界设定、路线说明、测试文档、`CHANGELOG.md`、`DEVLOG.md`；以 `round-90: ...` 独立提交。

## 子任务

1. 追踪 `switchRegion`、漫游事件选择、跨资源解析与 `completedRegionalEvents` 的读档流程；为协议定义向后兼容的触发类型与入境关口验证。
2. 实现通用解析/装配/事件选择支持，并将切图成功后的入境原因接入场景事件处理；确保失败切图、开局、等待和普通走格保持各自原语义。
3. 为 R89 已学潮序的青帆埠—云岭往返加入资料驱动的一次性抵达见闻与图谱关系；专项测试真实地图路径、关口来源、知识门控及存档往返。
4. 更新资料规范和日志，运行专项、全量质量门槛与生产构建，检查差异并提交。

## 涉及文件

- `iterations/round-90/plan.md`
- `data/schema/world-map.schema.json`、`data/base/world/world-map.json`、`data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`
- `src/engine/world-map.ts`、`src/game/grid-scene.ts`
- `tests/world-map.test.ts`、`tests/round90-region-arrivals.test.ts`、`package.json`
- `docs/MAP-ATLAS.md`、`docs/DATA-GUIDE.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/WORLD-SETTING.md`、`docs/TESTING.md`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`

## 风险

- 入境事件不能在关口落点被 NPC/遭遇阻挡时提前结算；因此事件选择必须发生在占位复核与切图成功之后。
- 现有漫游事件通过 `completedRegionalEvents` 保存；新触发协议不得增加存档字段或破坏旧事件 id 的完成状态。
- 多个事件若同时响应同一地图/关口仍沿用既有稳定排序与单次抽取语义，资料需要避免无意竞争；本轮两个抵达事件分别绑定不同方向关口。
- 本轮不新增美术资源，继续使用现有世界/角色 CC0 图集；不因此改写 `REFERENCES.md` 的来源记录。

## 预计人类工程师工时

约 14–20 小时，含通用协议兼容、场景切图时序梳理、往返事件与知识图谱设计、真实地图/存档回归及完整文档和发行门槛验证。
