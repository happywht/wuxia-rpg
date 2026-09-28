# Round 64 — 采集目标商铺导航、师门地域展示与全量路线审计

## 本轮目标

把差事导航从"跳过采集目标"推进为"采集目标可导航到真实装配的 NPC 商铺"：当某家已装配商店上架了目标物品且可用库存（含运行时余量）满足剩余数量时，导航解析器把目标投射到店主当前时段位置，优先同图卖家、否则按装配顺序确定选取；解析不出合格卖家时返回精确、可读的 no-target 原因，绝不编造坐标。同时让 J 师门页为每位登记师父显示由装配 NPC/地图/世界区域资料派生的地域名，并提供一轮覆盖三张地图、七个历日时段、全部登记师父、差事给予者与谈话目标的可复现 Phaser-free 路线审计，区分静态断连与动态阻挡。

## 用户故事

- 作为接下采集差事的行旅者，我希望按 N 导航时，采集目标能把路线指向确实卖这件物品、库存也够补齐余量的店主，走到跟前按 E 就能直接交易；如果没有任何商店上架或库存不足，我要得到明确的说明，而不是一个虚构的坐标。
- 作为查看 J 师门页的玩家，我希望每位师父名字旁能看到其所在的区域名，方便规划拜师行程；资料缺失时显示通用占位而不是报错。
- 作为开发者，我需要一份自动审计证明：三张地图的全部交互关键目标（师父、给予者、谈话对象）在各时段从各自区域入口出发都能走到相邻交互格，静态地图没有断连。

## 验收标准

1. `resolveQuestNavigationTarget` 支持 `collectItem`：以装配商店集合、可选运行时库存与当前地图 id 为输入，库存 `-1` 视为无限、正数为有限、`0`/未上架视为不可用；优先解析到当前地图的合格卖家，否则按装配顺序取第一个；目标 id 沿用运行时命名空间且不持久化。
2. 无法解析合格卖家时返回新增的精确原因（无任何商店上架、全部上架商店库存不足），延续 `unresolved-target` 于店主定位失败；不编造任何坐标；已完成的采集目标照旧让位给后续谈话/交手/见闻目标。
3. 在核对 `grid-scene.ts` E 键优先级（店主优先开商铺，F 直接交谈）后新增通用抵达动作 `shop` 及其 HUD 提示，文案准确描述"按 E 直接交易"。
4. J 师门页为每位登记师父显示数据派生区域名（装配 NPC 的 `mapResourceId` → 世界区域名）；未解析师父保持现有名字回退并显示通用地域占位；UI 与引擎不硬编码任何门派/人物/地点。
5. 新增可复现的 Phaser-free 路线审计：真实三图几何、装配 NPC、遭遇、七个历日时段、全部登记门派师父、差事给予者与谈话目标；从各区域入口（出生点与各关口落点）检验同图可达相邻交互格，区分静态断连（无占位也不可达）与动态阻挡（占位导致），发现真实交互关键阻挡则做最小通用修复，否则如实记录。
6. 更新 `docs/PLAYER-GUIDE.md`、新增 `docs/ROUND-64-ROUTE-AUDIT.md`、更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`；执行专项测试、`npm test`、`npm run typecheck`、`npm run validate:data`、路线审计与 `npm run package:release`，提交一个符合格式的 Round 64 commit。

## 子任务

1. 扩展 `src/engine/quest-navigation.ts` 的采集目标解析与商店输入；在 `src/engine/world-navigation-guidance.ts` 增加 `shop` 抵达动作；在 `src/game/grid-scene.ts` 接线装配商店、运行时库存、当前地图 id 与新增原因文案。
2. 在 `src/engine/world-navigation.ts` 增加 NPC 区域名派生纯函数；`src/game/faction-ui.ts` 与 `grid-scene.ts` 的 J 页接入地域展示与回退。
3. 编写 `tests/round64-collect-shop-navigation.test.ts`（真实资料集成 + 边界用例）与 `tests/round64-route-audit.test.ts`（全量审计）；同步修正 `tests/quest-navigation.test.ts` 中被新语义取代的断言。
4. 复核与更新玩家指南、路线审计文档与三份日志/路线图，执行全部验证命令并复核 diff。

## 涉及文件

- 修改：`src/engine/quest-navigation.ts`、`src/engine/world-navigation-guidance.ts`、`src/engine/world-navigation.ts`、`src/game/grid-scene.ts`、`src/game/faction-ui.ts`、`tests/quest-navigation.test.ts`。
- 新增：`tests/round64-collect-shop-navigation.test.ts`、`tests/round64-route-audit.test.ts`、`docs/ROUND-64-ROUTE-AUDIT.md`。
- 必须更新：`docs/PLAYER-GUIDE.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`；如架构契约变化，同步 `docs/ARCHITECTURE.md`。

## 风险

- 现有装配数据中仅一家商店在营，且 `quest.r42-seal-rubbing` 的采集物未在任何商店上架——这正是"无卖家"原因的真实用例；测试必须用真实资料锁定行为，而不是为覆盖率造假资料。
- 有限库存（如清心丸余 5）可能在运行时被买空：导航按运行时余量判定，买空后返回库存不足原因，测试需覆盖静态与运行时两层。
- 全量审计在 3×100×100 地图上按七时段遍历全部交互目标，耗时明显高于 R61；按入口×目标做记忆化路径查询并报告实际耗时。
- 动态阻挡不必然是缺陷（运行时 `resolveNpcPlacementsForPlayer` 会让开玩家所在格）；只把静态断连视为必须修复的问题，动态阻挡如实计数记录。

## 预计人类工程师工时

约 75–105 分钟：采集目标商铺解析与 E 键语义核对 20–30 分钟，师门地域派生与 UI 接线 10–15 分钟，全量路线审计测试与结果分析 25–35 分钟，文档与全量验证、提交 20–25 分钟。
