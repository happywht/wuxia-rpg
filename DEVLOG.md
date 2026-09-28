# 开发日志（DEVLOG）

按轮次记录实际做过什么、核验到什么、没做什么。**只记录事实，不预制结果。**

---

## Round 65 — 世界地图美术与角色精灵升级（2026-09-29，已完成）

### 计划与实现

- 按 `iterations/round-65/plan.md` 执行；本轮按用户优先级升级授权像素素材与角色精灵，保留 R64 以来三张 100×100 可移动大地图、碰撞、任务和存档实现。
- **素材核验**：接入 Kenney 官方 RPG Urban Pack（官方产品页与下载链接登记在 `docs/REFERENCES.md`），随项目保留原始 CC0 `License.txt`。图集实测 432×288、27×18 格、16px、0 间距，共 486 个含像素的格子。包内 `Tilemap/tilemap.txt` 声称 spacing 为 1px，与 PNG 尺寸冲突，文档注明以逐像素测量为准。发行仅包含运行时使用的打包图集与许可，不带入整包/散片。
- **人物帧修正**：以逐格编号的放大联络表目检图集：人物只在第 23–26 列，每 4 帧为同一外观的静态姿态/朝向；五组为 23–26、131–134、239–242、347–350、455–458。初版把门窗格误作人物，复核后已改为玩家帧 24、默认帧 131、14 个资料驱动且互异的 NPC 帧。三张地图的 `art.actors` 均指向新图集，引擎不读取人物身份来选帧。
- **街景修正**：首版把红砖格放在阻挡格上，浏览器显示为覆盖墓碑的长横条。实际地图目检证明近出生点的阻挡区是墓园，并非商铺建筑；因此保留修正后的数据，只在起始地图新增 `urban-street-ground` 与 `urban-street-details`：生成器仅在原 Tiled 装饰层 2–5 为空且碰撞可走的格子绘地面，共 42 格铺装，另有 2 格井盖细节。墓园、既有土路、房屋、碰撞格与任务坐标均保持原样；本轮不把小型素材样板夸称为已建成城镇。
- **专项测试**：`tests/round65-urban-art.test.ts` 共 11 项，内置 PNG 调色板解码器，检查 CC0 文本、图集像素/网格、三图 actor 帧、14 名 NPC 帧、环境帧白名单、人物列禁入景物层、新增地面与旧装饰/碰撞逐格不相交、井盖底层、出生点/NPC/出口 BFS 可达。`tests/round51-map-art.test.ts` 同步检查三图图集资源与帧。
- **发布与文档**：生产发行白名单及 R47 静态包 smoke 纳入第三张 Kenney 图集与原许可；更新 `docs/REFERENCES.md`、`docs/MAP-ATLAS.md`、`docs/PLAYER-GUIDE.md`、`docs/TESTING.md`、架构/数据指南、README、路线图、变更日志及本开发日志。

### 验证

- `npm run import:round-65-urban-town`：三张地图统一使用新人物图集；起始地图输出 42 格铺装和 2 个井盖，重复运行不累积图层。
- `npx vitest run tests/round65-urban-art.test.ts tests/round51-map-art.test.ts`：2 个文件、14 项通过。
- 隔离端口 `http://127.0.0.1:5182/` 新档试玩：进入起始地图，步行至 `(53,43)`，HUD 时间从 08:00 到 08:22；镜头随玩家位置滚动。M 舆图实际打开后滚轮放大/缩小、拖动改变地图视口、再次按 M 返回世界地图，操作闭环可用；用户原有的 `127.0.0.1:5178` 标签页与存档未被该新档污染。
- `npm run package:release`：全通——28 项基础资源 Schema、28 项 MOD 零问题、`tsc --noEmit`、36 个测试文件/275 项用例、Round 34 与 Round 48 文档审计、Vite 138 模块构建、归档与 R47 子路径 smoke 均通过；发行包 808,362 bytes，SHA-256 `d801f53051d9d786639242cc22cab680888407f000c000afb57e7102707d855d`，74 个归档文件/73 个内容文件，smoke 确认三张 Kenney 图集与原始 CC0 License。Vite 1,933.34 kB 主 JS 体积建议为非阻断。

### 边界

本轮美术交付是人物精灵替换与小型地面样板，不是完整城镇改造；新铺装刻意避开起始图墓园及所有旧装饰。后续轮次可沿可走道路继续扩建城镇或在确认为建筑的格区添加门面。
---

## Round 64 — 采集目标商铺导航、师门地域展示与全量路线审计（2026-09-29，已完成）

### 计划与实现

- 接到按 `iterations/round-64/plan.md` 实现的任务，但该文件当时并不存在（仓库只有 R00–R63 的计划书）；按用户指令中的四项范围补写了 `iterations/round-64/plan.md`（含用户故事、验收、子任务、风险与约 75–105 分钟预计人类工程师工时），未改动 `.serena/` 与 Round 62 的三张未跟踪调色板图。
- 核对 `grid-scene.ts` 的 E 键优先级（相邻 NPC：商铺 → 差事名录 → 对话；F 直接交谈）后，为 `NavigationArrivalAction` 新增 `shop` 抵达动作，HUD 文案为「按 E 直接交易 · F 交谈（购买后差事计数自动核对）」，与 `updateInteractHint` 对店主的「按 E 交易 · F 交谈」提示和 ShopPanel `onChange → refreshQuestCollectObjectives` 的实际链路一致。
- `src/engine/quest-navigation.ts`：`SpatialQuestObjectiveKind` 纳入 `collectItem`；输入新增可选 `shops`（装配商店表）、`shopStocks`（逐店运行时库存）、`currentMapResourceId`；新增 `resolveCollectSeller` 在「运行时库存优先、货架 `-1` 无限、正数有限、`0`/未上架不可用」规则下筛选能补齐剩余份数（`requiredCount - 当前计数`）的卖家——同图优先、组内按装配声明顺序取首，无同图合格卖家时按装配顺序取首个异地卖家；返回新增精确原因 `collect-item-not-stocked`（无任何商店上架）与 `collect-stock-insufficient`（有上架但可用量全部不足），店主无法定位沿用 `unresolved-target`。目标名取商店名、位置取店主当前时段布置（同图活位 > 编译时段位 > 基础位）、`approachRadius: 1`；目标 id 沿用 `quest:` 运行时命名空间不进存档。引擎仅 import `item-system` 的类型与 `UNLIMITED_STOCK` 协议常量，无内容常量。
- `GridScene.resolveQuestNavigation` 传入 `world.assembly.shops`、`this.shopStocks` 与 `this.currentMapResourceId`；Q→N 的 no-target 文案补两种缺货原因。
- Scope 2：`src/engine/world-navigation.ts` 新增 `deriveNpcRegionNames` 纯函数（装配 NPC 的固定 `mapResourceId` → 世界区域名；NPC 日程只改格不改图）；`faction-ui.ts` 的 J 页师父名旁显示 `名字（区域名）`，未解析导师显示「行踪未详」通用占位；`grid-scene.ts` 打开面板时以装配数据派生。
- 新增 `tests/round64-collect-shop-navigation.test.ts`：以真实物品/商店/NPC/任务/历法资料装配，验证无限库存采集目标解析到姜百味商铺、`quest.r42-seal-rubbing` 的拓本未上架返回 `collect-item-not-stocked`、清心丸静态货架 5/运行时买空至 1 时按剩余需求精确拒绝、姜百味七个时段位置（午后 `(43,39)`、入夜 `(44,39)`、其余基础 `(45,39)`）逐段跟随，以及导师地域名派生与未登记地图的省略行为。
- 新增 `tests/round64-route-audit.test.ts`：按世界加载器同款逐图 `assembleNpcPlacements` 合并 14 名 NPC、`compileNpcSchedules` 编译七时段并装入全部野外遭遇；审计目标为全部登记门派师父、差事给予者与 `talkToNpc` 对象（去重 14 人，全部通过装配存在性检查），入口为起始图出生点与每条有向关口落点（去重后 5 个不同格位：江南道 2、雾雨渡口 2、铁嶂北道 1）。可达性判定与 `findGridPathToAdjacentCell` 契约一致（入口 BFS 可达集 ∩ 目标四向可走邻格），分静态（纯几何）与动态（当期 NPC+遭遇占位、豁免入口格以对齐 `resolveNpcPlacementsForPlayer` 的让位保证）两层，并审计每个入口到本图全部交互目标及出图关口 `from` 格。结果 462 项检查零静态断连、零动态阻挡，本轮未发现需要修复的交互关键阻挡，未改动任何地图/日程数据；口径与数字记入新增 `docs/ROUND-64-ROUTE-AUDIT.md`。
- 更新 `tests/quest-navigation.test.ts` 两项被 Round 64 语义取代的断言（采集完成态让位后续目标；无商店资料时返回 `collect-item-not-stocked` 而非编造坐标）并新增 7 项商铺导航用例；`tests/round61-route-audit.test.ts` 补装配真实商店（`assembleShops`，零警告）后，`quest.r58-market-stall-pact` 首个未完成目标从后续谈话改为跨区导购（距离 3–5 格 → 62–64 格），其余五条 R58 路线距离不变。
- 文档：`docs/PLAYER-GUIDE.md` 更新采集目标导航、J 师门行与「按 N 没有导航」疑难说明；`docs/ARCHITECTURE.md` 状态行、导航模块段与变更表补 Round 64；新增 `docs/ROUND-64-ROUTE-AUDIT.md`；`CHANGELOG.md`/`DEVLOG.md`/`ROADMAP.md`/`README.md`/`docs/DATA-GUIDE.md` 按轮次联动更新。
- 限制与边界：当前基础资料仅一家在营商铺，「无卖家」与「库存不足」原因各有真实数据用例（拓本未上架、清心丸有限货架）；师门页地域名依赖装配 NPC 与世界区域资料齐全；本轮审计覆盖入口→同图交互格可达性，跨时区长途步行与天气耗时沿用 R63 模拟口径。主流程复核后补做隔离浏览器新档试玩（独立 `127.0.0.1:5182`：接取「巷口送药」→ Q/N 导航到姜百味百宝担 → M 查看三格路线 → 按步行指引绕过阻挡 → 抵达提示按 E 交易 → 购买一份回春膏后差事显示 3/3 已完成；J 页同时核验五位师父均显示区域名），没有写入或覆盖用户的 `127.0.0.1:5178` 页面/存档。

### 验证

- `npx vitest run tests/quest-navigation.test.ts tests/round64-collect-shop-navigation.test.ts tests/round64-route-audit.test.ts`：3 个文件 26 项通过；主流程独立复跑 `npx vitest run tests/quest-navigation.test.ts tests/round61-route-audit.test.ts tests/round64-collect-shop-navigation.test.ts tests/round64-route-audit.test.ts`：4 个文件 27 项通过；审计行输出 `maps=3 periods=7 targets=14 entries=5 checks=462 static-disconnected=0 dynamic-blocked=0`。
- `npm run typecheck`：`tsc --noEmit` 通过（含两处测试类型修正：runtime 商铺 id 非空检查、历法时段显式类型，以及删除审计测试一个未使用的 `WorldMapAssembly` 导入）。
- `npm test`：首轮 264 项中 1 项失败——R61 审计未传商店输入导致采集首目标返回 no-target；补装配后 35 个测试文件 264 项全部通过。
- `npm run validate:data`：28 项基础资源 Schema 通过；`npm run audit:round-34`：文档一致性审计通过；`npm run audit:round-48-docs`：全部六份联动文档（README/ROADMAP/CHANGELOG/DEVLOG/ARCHITECTURE/DATA-GUIDE/PLAYER-GUIDE）更新到 Round 64 后通过。
- 最终 `npm run package:release`：通过——28 项资源 Schema、28 项 MOD 检查零问题、严格类型检查、35 个测试文件/264 项用例、Round 34/48 文档审计、Vite 138 模块生产构建、发行归档与 Round 47 子路径 smoke；发行包 788,135 bytes、72 个归档文件/71 个内容文件，SHA-256 `f93769c4058a8a72ab60a86198c2e5af49553c513fd90cb70f2dbf1c19b4ddc2`，主 JS 1,933.34 kB（gzip 511.00 kB）的 Vite 体积提示仍为非阻断。
- 环境备注：本轮在 Git Bash 下执行，PATH 首位的 GNU tar 1.35 会把 `D:\` 盘符路径误当远程主机导致 `smoke:round-47` 失败；以仅含 Windows bsdtar 3.8.8 的临时 shim 目录前置 PATH 后 smoke 完整通过（仓库脚本未为此改动；R63 及更早记录在 bsdtar 环境下验证）。
- `.serena/`、`iterations/round-62/*.png` 与任何生成资产保持未改动、未纳入本轮。

---

## Round 63 — 跨时段实时行路模拟与玩家引导复核（2026-09-29，已完成）

### 计划与实现

- 开工前先读取用户指定的 `goal-objective.md`，确认仍按逐轮计划/实现/验证/文档/独立提交推进；该文件定义的是至少 Round 00–50 的长期开发目标，不把历史 Round 50 结构验收当作整个产品完成。工作区保留 `.serena/` 与 Round 62 三张未跟踪地图调色板图。
- 开工前写入 `iterations/round-63/plan.md`：模拟三张大地图上的游戏时间逐格推进、日程目标跟随、NPC/遭遇避让与抵达提示；列明用户故事、验收、四个子任务、风险、涉及文件与约 60–90 分钟人类工程师工时。
- 新增 `tests/round63-live-clock-navigation.test.ts`：装配真实地图、区域关系、任务、NPC、遭遇、历法与气候；以 `GameClock`、`ClimateRuntime`、NPC 日程编译/实时玩家安全落位、差事目标解析和正式导航引擎复演实际单格步行。测试为三条路线各自寻找开局春季天气表中最高步耗时的确定性雨天 seed（基础 1 + 雨天额外 2 = 3 分钟/成功走格），每一格都断言路径首格/可行/无人物或遭遇占位、推进时钟且换时段后重算目标及寻路。
- 江南道出生点 `(43,37)` 到南麓聚落 `(70,75)`：雨天 71 格 / 213 分钟，09:30 到 13:03，跨晨光→日中，见闻停在事件格。
- 雾雨渡口关口落点 `(1,4)` 到芦桥集 `(59,65)`：119 格 / 357 分钟，14:00 到 19:57，跨午后→黄昏→入夜，抵达见闻触发格。
- 铁嶂北道入口 `(4,7)` 追踪「驿镇更次」中的秦素砚：94 格 / 282 分钟，18:00 到 22:42，跨黄昏→入夜；目的地真实从 `(57,49)` 更新到夜班 `(56,50)`，最终停在 `(56,49)` 的相邻格，HUD 按键提示为 F。
- 三条独立路线共 284 格 / 852 游戏分钟；均无封路、断路、NPC/遭遇占格或坏目的地。复现数字、方法和审计边界记入 `docs/ROUND-63-TIMED-ROUTE-AUDIT.md`。
- 对照 `GridScene` 每次成功移动的 `stepMinutes + currentClimate().weather.stepMinutes` 与时段变化时 NPC/导航刷新次序，检查 `arrivalActionHint` 三类映射和 `docs/PLAYER-GUIDE.md`。未发现路线或抵达 HUD 运行逻辑缺陷；玩家手册原来没有明说天气会为每步加时及路线每格重算，现已写明“显示指引、仍由玩家手动走格”和天气加时 HUD 说明。
- 更新 README 当前轮次、CHANGELOG、DEVLOG、ROADMAP；下轮路线调整为 R64 关键 NPC 通路/收集与师门玩法引导，整个项目目标继续 active。

### 验证

- `$env:ROUND63_REPORT='1'; npx vitest run tests/round63-live-clock-navigation.test.ts --silent=false`：3 项专项全部通过；逐项输出 71 / 119 / 94 格与 213 / 357 / 282 分钟、雨天加时 2 分/格及各跨段时段。
- `npx vitest run tests/round63-live-clock-navigation.test.ts tests/round61-route-audit.test.ts tests/world-navigation-guidance.test.ts`：3 个文件、12 项通过。
- `npm run typecheck`：`tsc --noEmit` 通过。
- 首轮 `npm run package:release` 的全量测试为 249/250：Round 48 文档审计发现 `docs/ARCHITECTURE.md` 与 `docs/DATA-GUIDE.md` 当前状态仍为 Round 62；已补上 R63 实时路线审计摘要后复跑。
- `npm run package:release`：最终完整通过——28 项基础 Schema、28 项 MOD 检查/0 问题、`tsc --noEmit`、33 个测试文件/250 项用例、Round 34/48 文档审计、Vite 138 模块生产构建、发行归档与 Round 47 子路径 smoke。包 787,419 bytes、72 个归档文件/71 个内容文件，SHA-256 `65aa13d03d475c85a302b78b1ab92780d165fdf87badac1f665b56593cdb402c`；smoke 校验解包哈希及 `/preview/wuxia-rpg/` 页面、MOD/资料/Schema/图集资源加载通过。
- `git diff --check`：通过。生产主 JS 为 1,931.59 kB（gzip 510.45 kB），Vite 仍提示高于 500 kB 建议阈值；构建和 smoke 成功。
- 浏览器：未进行人工 UI 试玩或声称采集到玩家反馈；R63 属于真实资料驱动的自动逐格模拟。没有改动存档格式、生产运行时规则、玩家原有存档或用户浏览器状态。

### 边界

- 测试按三种地区路线分别建立游戏内时间快照，行程合计 14 小时 12 分，不是一个角色连续跑完的单次一天行程。
- 模拟验证目标抵达和提示，不模拟事件奖励、任务结算、遭遇战、渲染和 Phaser Tween；相关完整游戏流程仍需后续浏览器试玩。
- `.serena/` 和 Round 62 预览图片保持未跟踪、未纳入本轮提交。

## Round 62 — 铁嶂北道第三块百格区域（2026-09-29，已完成）

### 计划与实现

- 开工前写入 `iterations/round-62/plan.md`，列明第三个 100×100 地图、双向步行关口、区域发现/人物/遭遇/三段任务、地图路线回归、文档与发行检查等验收项；预计人类工程工时约 90–150 分钟，并拆为四个可验证子任务。原候选“多轮时钟推进路线模拟”顺延到 R63，优先响应用户长期提出的超大可移动世界需求。
- 新增 `scripts/generate-round62-iron-ridge.mjs` 与 `npm run generate:round-62-iron-ridge`：确定性生成“铁嶂北道·岩关驿镇”100×100 地图，复用仓库已留存 License 的 Kenney Roguelike/RPG CC0 图集构造八层地表/山脊/林带/聚落/道路贴图，独立碰撞网格含 7,818 个可行格；保护并 BFS 检查出生点、关口、地标、事件、NPC 日程位和遭遇共 87 个锚点。
- `data/base/world/world-map.json` 加入北行双向关口（渡口 (89,15) → 北道 (4,7)，北道 (3,7) → 渡口 (89,16)）与四个地标/四项见闻事件。新增邵长庚、秦素砚、两个可重战遭遇和「北隘校标 → 驿镇更次 → 碎岭清道」三段任务；图谱新增 14 节点/17 关系，manifest 增至 28 项资料。
- 新增 `tests/round62-iron-ridge.test.ts` 四项专项验证；扩展渡口测试覆盖三地图装配，并更新 R58/R59 的实时资料数量断言（43 项任务、195 节点/305 关系）。路线专项把新增区域三项空间任务目标和发布人按实际 NPC/遭遇占格，在日历七时段逐个求路。
- 同步架构、数据、地图、玩家手册、人物志、任务志、世界设定、知识图谱、测试说明、授权用途、README、路线图和变更日志。`smoke:round-47` 删除过期固定资源数断言，改为使用发行 manifest 的资源清单。

### 验证

- `npm run generate:round-62-iron-ridge`：通过，生成 7,818 个可行格、96 株 CC0 松木和 1,459 格岩脊，并核验 87 个受保护锚点。运行前后地图 SHA-256 均为 `DCC60968F991294ABDE6945387D1729E11DC09F9EC42EBB7557BB782122E8868`，逐字节重建稳定。
- `npx vitest run tests/round55-ferry-world.test.ts tests/round62-iron-ridge.test.ts tests/round58-region-quests.test.ts tests/round59-regional-dialogue.test.ts`：4 个文件、25 项通过。
- `npx vitest run tests/round52-map-landmarks.test.ts tests/world-map.test.ts`：16 项通过。全量第一次复核发现这两组旧测试的装配夹具仍只提供 R00/R10 地图，造成新增第三地图相关诊断进入断言；为夹具补入真实第三地图、知识引用和新地标数量后复跑通过，生产数据/引擎逻辑无需绕过校验。
- `npm run validate:data`：通过，manifest 与 28 项基础资源 Schema 全部通过。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run package:release`：通过。MOD 检查 28 项资源/0 问题；全量 Vitest 32 文件/247 项；`audit:round-34` 核对三张地图、三个区域、四道关口、12 个定点事件、两项漫游事件、43 项任务与五派资料；`audit:round-48-docs` 通过；Vite 138 模块构建、发行包归档/哈希和 `/preview/wuxia-rpg/` 子路径 smoke 均通过。归档 787,244 bytes，72 个归档文件/71 个内容文件，SHA-256 `80e02bc11d43ece3ad2786081156873b7e52533f3126e51537c6b5b0dd21c158`。主 JS 1,931.59 kB、gzip 510.45 kB，保留既有非阻断的 500 kB chunk 提示。
- 浏览器试玩：为避免写入用户原有存档，在 `node_modules/.cache/round62-preview-dist/` 建临时发行副本，只将副本的起始地图改为 R62 地图，并以独立 `127.0.0.1:5181` origin 开新游戏。截图确认 100×100 岩脊/林地/碎石路图层和 Kenney 人物贴图正确渲染；WASD 向东从 `(4,7)` 走到 `(5,7)` 再到 `(17,7)`，游戏时间同步由 08:00 推进至 08:13，镜头随行而地图内容滚动。临时测试标签页与服务随后关闭，未保存该试玩进度。

---

## Round 61 — 差事导航抵达提示与动态寻路审计（2026-09-29，已完成）

### 计划与实现

- 开工前写入 `iterations/round-61/plan.md`，列明抵达操作提示、动态 NPC/遭遇避让与暂堵恢复、R58 六项任务七时段路线审计、数据修复、文档/测试/提交标准及约 60–90 分钟人类工程工时；发现当前路径只查静态地形后，将动态阻挡与暂时封路恢复纳入本轮目标。
- 差事目标在 `quest-navigation.ts` 传递内容无关的 `talk`/`battle`/`discover` 抵达动作；`world-navigation-guidance.ts` 负责泛型动作枚举与提示映射，`GridScene` 只在 `arrived` HUD 写入对应按键。人物说明 F 直接交谈；遭遇说明 E 的邻近人物优先级；见闻说明先满足区域事件条件、V 推进时段等待。普通地标沿用旧抵达文案；引擎协议没有人物名、地点名或剧情文本。
- 导航计算接收仅在场景运行期构造的当前人物/活动遭遇占位集合，用其余可走格重新做当前区域 BFS，人物与遭遇终点仍取四向相邻停靠格。若有占位时无路、但忽略动态占位存在地形路线，则返回 `route-blocked` 并保留当前选择，在 HUD 提示通路状态变化后自动重算；若地形本身无路则沿用既有失效提示/清除。占位不改写地图数据或存档。
- 新增 `tests/round61-route-audit.test.ts`：加载真实 100×100 地图、world-map、任务、NPC、战斗、日历，逐一按七个 `periodId` 编译人物位置；从江南道出生格或雾雨渡口关口落点出发，按 NPC/遭遇实际占位计算到 R58 六个发布人及其空间目标的四向最短步数。collect 目标无空间坐标，按 R60 目标解析规则跳过；每项各时段可达性及六组 min/max 距离都断言锁定，共 42 个路线场景。
- 路线审计查明三处内容放置问题并修正 `data/base/characters/round-03-npcs.json`：顾夜尘原 `(51,40)` 的所有邻格都不接入江南道起点可达区，改为 `(51,42)`；陆贞娘入夜位置从 `(43,38)` 改为 `(44,38)`，释放被人物占位封住的出生区出口；黄昏位置从 `(41,38)`（发布人路线 92 格）调到 `(44,37)`，让「南麓捎药」在七时段下落至 3–4 格总路程。
- 距离范围与限制见新文档 `docs/ROUND-61-ROUTE-AUDIT.md`；更新 `docs/PLAYER-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、README、ROADMAP 和 CHANGELOG。

### 验证

- `npx vitest run tests/round61-route-audit.test.ts tests/world-navigation-guidance.test.ts tests/quest-navigation.test.ts`：3 个文件 / 21 项用例通过，包含真实资料 42 路线、三类动作映射/透传、动态占位绕行与暂时封路状态。
- `npm run typecheck`：`tsc --noEmit` 通过。
- `git diff --check`：通过。
- 第一次 `npm run package:release`：资料 Schema（26 项）、MOD 检查（26 项零问题）与类型检查通过；全量 Vitest 为 31 个文件、242/243 项通过，唯一失败为 `tests/docs-audit-round-48.test.ts` 检出 README/ROADMAP/CHANGELOG/DEVLOG/DATA-GUIDE 的当前轮次尚未同步到 R61。随后已补齐文档标记和 R62 路线。
- 复跑 `npm run package:release`：通过——26 项基础资源 Schema、26 项 MOD 零问题、`tsc --noEmit`、31 个测试文件 / 243 项用例、Round 34/48 文档审计、Vite 138 模块生产构建、发行归档及 Round 47 子路径 smoke 全通过；归档 768,107 bytes，SHA-256 `880932add1451c20ff7c0bd1fe3f95f2778adea486c32e9035139abbb7ccc9d2`，含 70 个归档文件 / 69 个内容文件。主 JS chunk 1,931.59 kB（gzip 510.45 kB）仍高于 Vite 500 kB 建议线，但不影响构建及 smoke。

### 边界与未做

- 没有非维护者试玩记录；路线表是可复现步数审计，不伪称主观体感结论或平衡性评估。
- 没有浏览器手动走完任务链；未接触玩家存档，未改存档格式。
- `.serena/` 保持原样，不纳入本轮提交。

---

## Round 60 — 差事目标导航与跑图提示（2026-09-29，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-60/plan.md`：让玩家从 Q 差事日志把进行中差事的下一项未完成空间目标设为舆图行路目标，记录用户故事、验收标准、三个子任务、文件范围、风险与约 60–90 分钟人类工程师工时。
- 新增 Phaser-free 解析器 `src/engine/quest-navigation.ts`：按声明顺序取活动差事第一个未完成的空间目标（`talkToNpc`/`defeatEncounter`/`discoverKnowledge`），跳过非空间的 `collectItem` 且不伪造坐标；人物目标按「当前地图运行时布置 → 当前时段编译布置 → 基础布置」三级优先解析，遭遇目标取装配布置位置，见闻目标先匹配世界图事件（触发点优先于同节点地标，同位时附带地标 id）再匹配发现门槛地标；目标缺失时返回 `unknown-quest`/`not-active`/`no-spatial-objective`/`unresolved-target` 四种可读原因。引擎不写任何具体人物、地点或剧情。
- 导航层扩展：`world-navigation-guidance.ts` 提取通用 `resolveCellNavigationGuide`（地标版成为其薄封装，跨区首关口/碰撞寻路/区域名逻辑共用）；`world-navigation.ts` 为航点新增统一目的地选择器 `destinationId`（`landmark:<id>` 稳定命名空间 / `quest:<questId>` 运行期命名空间；同一差事跨阶段保持选择稳定）并新增 `buildQuestObjectiveWaypoint` 投影（同图目标钉自身格，跨图目标钉首道关口，不可达不投影）。
- UI/场景接线：`quest-ui.ts` 活动差事绑定 N 导航（Q 面板打开期间主层 N 仍由 `anyOverlayOpen` 防护互不干扰）并把场景答复的原因显示在面板状态行；`world-map-ui.ts` 选择回调改传 `destinationId`、重开时按其恢复选中，差事航点在侧栏显示「差事」金色标签；`grid-scene.ts` 以 `navigationDestinationId` 取代地标专用字段，`resolveNavigationGuide` 按前缀分发到地标/差事两路解析（差事路每次刷新用当前时段与实际布置重算），`navigateQuestObjective` 完成跟踪→投影→关 Q→开 M 的整链，M 舆图打开时附带当前活动差事导航目标的补充标点；`applyQuestUpdate` 与 `syncNpcSchedule` 末尾新增行路重算（目标完成/差事结束/时段切换即时生效），移动与跨区既有刷新点不变。
- 数据门槛：`data/base/world/world-map.json` 为 `landmark.mist-willow-market` 与 `landmark.south-hamlet` 补挂与其首访事件相同的知识节点（`place.mist-willow-market`/`place.south-hamlet`），未获知前不再常显；已接取差事的目标由运行期投影引导，锁定/未接取差事不投影。
- 测试：新增 `tests/quest-navigation.test.ts`（11 项，全部加载真实世界图与两张百格地图）：活动状态过滤、声明顺序与进度跳过、采集目标跳过与 collect-only 无目标、NPC 三级位置优先、遭遇/见闻匹配（含事件优先于地标、同位附带地标 id、跨图遭遇）、数据缺失 unresolved、id 命名空间、知识门槛旁路的差事 pin 投影（不夹带其他隐藏内容）、同图/跨图/无路三种航点投影、本地碰撞寻路 guide 与跨区首关口 guide 集成。既有 `world-navigation.test.ts`、`world-navigation-guidance.test.ts`、`round52-map-landmarks.test.ts`、`round58-region-quests.test.ts` 共 6 处断言按新门槛收紧更新（例如芦桥集空知识集下不可见、可见地标计数 6→4、R58 断言升级为「地标门槛与首访事件节点一致」），未放宽任何运行时校验。
- 文档：更新 `docs/PLAYER-GUIDE.md`（Q 面板 N 导航说明、M 舆图差事标点、常见问题新增「按 N 没有导航」条目、状态行升至 Round 60）与 `CHANGELOG.md`、`ROADMAP.md`、本日志。

### 阶段验证

- `npm run typecheck`：通过（`tsc --noEmit`；首轮报 5 处类型错误——夹具笔误 `PlacedNpcs`、find 谓词不缩窄 collectItem、guide 联合类型 spread、场景字段改名残留、未用 import，逐一修复后通过）。
- `npx vitest run tests/quest-navigation.test.ts`：11 项用例通过（首轮 3 处失败为测试自身问题——`makeJournal` 参数缺默认值、一处 filter 条件写反、跨区起点选在关口邻格导致 at-gate；修正后通过）。
- `npm test`：30 个测试文件 / 237 项用例全通过（R59 基线 29 文件/226 用例；补门槛后首轮 4 文件 6 项既有断言失败，全部按新可见性收紧更新）。
- `npm run validate:data`：通过（manifest 与 26 个基础资源 Schema）。
- `npm run inspect:mods`：通过（26 项资源基础层零问题）。
- 独立代码复核修正了三项边界：NPC/遭遇格虽在静态地形上可行，但运行时被占用，所以舆图和 HUD 都改为走到真实相邻格；见闻目标必须走到实际触发格；任务选择器在同一差事推进到下一阶段时保持稳定，M 重开仍能选中新目标。抵达人物/遭遇后保留标点，直到交互真正推进目标。专项回归 `npx vitest run tests/quest-navigation.test.ts tests/world-navigation.test.ts tests/world-navigation-guidance.test.ts tests/round52-map-landmarks.test.ts tests/round58-region-quests.test.ts`：5 个文件 / 34 项全通过。
- 独立 `npm run package:release` 期间，类型检查分别发现并修复了新测试里已失用的导入，以及到达状态分支中目的地可能为空的窄化问题；最终整条命令通过：Schema/MOD 检查、`tsc --noEmit`、30 个测试文件 / 237 项、两项文档审计、Vite 生产构建、发行包解包及 69 个文件哈希烟测均通过；最终包 SHA-256 为 `403b26a02617852a426ed657b93105bb47ead10429f7348a5b36b92d17772c67`。主 bundle 1,930.37 kB（gzip 509.96 kB）仍触发 Vite 既有的 500 kB 提示，构建与烟测通过。
- 最终 `git diff --check`：通过（见提交前复核）。

### 边界与未做

- 未改动 `.serena/`（轮前既有的未跟踪目录）。
- 未改动存档格式：差事目的地选择器只存于运行期字段，`SaveSnapshotV1` 零变化。
- 未做浏览器人工试玩（本轮全部以真实资料的 Phaser-free 回归验证解析、投影与导引；按 N 的面板联动逻辑与既有 Q/M 面板键位路径一致）。
- 见闻导航指向触发事件的格子，事件自身的时段/天气条件不在导航层判断（玩家到达后按既有事件规则触发，手册已说明）。

---

## Round 59 — 区域差事对话回声与世界设定校正（2026-09-29，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-59/plan.md`：把 R58 两条区域任务链接入七位既有人物的条件对白、同步滞后的世界设定/人物志等文档、增加有意义的专项回归；记录用户故事、验收标准、三个子任务、文件范围、风险与不少于 30 分钟人类工程师工时。
- 对话数据：`round-03-conversations.json`（陆贞娘、顾夜尘、姜百味、马尚义、石北）与 `round-30-conversations.json`（祝九弦、白鹭洲）的既有 greet 节点尾部追加 16 个仅按 `questStatus` 显隐的回应选项与 16 个新节点（石北覆盖芦桥寻集/集期赶办两条任务，其余各一条）。新增节点 id 以 `r58-` 前缀全局唯一（白鹭洲的集期赶办节点用 `r58-stall-pact-charter`/`-logged` 避免与石北重名）。全部新选项无 effects，不重发接取、奖励、物品、关系或声望；既有选项与节点零改动。
- 文本事实核对：回应只引用数据中已存在的地点/人物/事件——河湾旧幌、韧皮料、摊棚与药担通路、旧例索钱人的刀路、茶匾旧驿道、苍崖根配散、东野冒牌护队等；石北与姜百味的活动态回应写成"还缺什么"，完成态写成"刚办妥什么"，与谈话即完成的真实次序吻合。
- 文档同步：修正《世界设定》三处滞后内容——「芦桥集暂无任务内容」旧句、「南麓聚落等只是图册描述点非交互入口」的过时范围、图谱节点数 171 → 181 与 R58 增补说明；状态行升至 Round 59。更新人物志（总表职责列补 R58 区域差事身份、新增 R59 回声一节）、任务志第八章（补 R59 对白回声说明）、对白指南（新增 3.2「任务状态回声」写法与谈话目标次序提醒），并同步 README/ARCHITECTURE/DATA-GUIDE/PLAYER-GUIDE/ROADMAP/CHANGELOG 的当前轮次与 R59 摘要。
- 专项回归 `tests/round59-regional-dialogue.test.ts`：以真实基础 quest/dialogue/物品/门派/武学/图谱/历法/伙伴数据完成解析与 `assembleQuests`/`assembleDialogueReferences` 跨资源装配（零警告断言）；七组对白（含石北两条任务共 8 组规格）在 locked/offered/active/completed/failed 五态下的可见性互斥验证；16 个新节点跨文件唯一、每对恰好 active+completed 两选项且条件仅 `questStatus` 无 effects；七个 greet 节点选项总数锚定与签名选项存活断言；按 `GridScene.openDialogueWith` 的真实次序（`grid-scene.ts` 先发 `npc-talk` 信号、后以同一 journal 求首节点可见选项）验证石北（韧皮料齐备谈话）与姜百味（苍崖根齐备谈话）当次对话即切换到完成态回应，并以马尚义（非谈话目标）作对照组；陆贞娘跨对话联动完成态可见。
- 边界约束遵守：未创建 git commit；未改引擎规则（`src/` 零改动）与存档协议；未修改/删除 `.serena/`；未在浏览器玩家存档上移动、接取或战斗（本轮无浏览器操作，全部以纯逻辑运行时回归代替）。

### 阶段验证

- `npx vitest run tests/round59-regional-dialogue.test.ts`：14 项用例全部通过（首轮 4 项失败为测试自身问题——`parseQuestSet` 成功结果无 warnings 字段、全局节点唯一性误把各对话复用的 `greet` 计入、两个 greet 选项基线数字数错；修正断言范围与基线后通过，未放宽任何运行时校验）。
- `npm run typecheck`：通过（`tsc --noEmit`，`src/` 零改动）。
- `npm run validate:data`：通过（manifest 与 26 个基础资源 Schema）。
- `npm run audit:round-34`：通过（文档一致性审计，对白条件/效果、40 项任务、5 门派名与数据一致）。
- `npm run audit:round-48-docs`：首轮报「ROADMAP.md 缺少 Round 59/Round 60 当前及后续条目」——审计要求 ROADMAP 含 `**R60**` 粗体条目；把后续建议首条改为 `- **R60** — …` 格式后复跑通过。
- `npm test`：全量通过——29 个测试文件 / 226 项用例（R58 基线 28 文件/212 用例，新增本轮 1 文件/14 用例）。

### 最终验证

- 主代理执行 `npm run package:release` 全通：manifest/26 项基础资源 Schema、26 项 MOD 资源零问题、`tsc --noEmit`、29 个测试文件/226 项用例、Round 34 与 Round 48 文档审计、Vite 137 modules 生产构建、静态归档与 Round 47 子路径 smoke。
- 发行包 `release/wuxia-rpg-web-0.0.1.tgz`：765,530 bytes，70 个归档文件/69 个内容文件，SHA-256 `b08e3daa7aa4d44c02b9c51974a29d4e1a5511d74ce46208e6d68db77ac354fb`。smoke 核验全部 69 个内容文件大小/哈希、`/preview/wuxia-rpg/` 挂载和全套 26 项基础资料/Schema、示例 MOD、Kenney 图集及 CC0 License。
- 本轮未对既有玩家存档做浏览器操作；任务状态对白显隐与 `npc-talk` 先行、首节点后算的实时顺序由真实基础资料驱动的专项引擎回归验证。Vite 主 JS chunk 1,924.52 kB（gzip 508.47 kB）超过 500 kB 建议线；构建和 smoke 均成功，代码分块留待后续性能轮次。

---

## Round 58 — 芦桥集与南麓聚落区域任务链（2026-09-29，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-58/plan.md`：将两张百格大地图上已存在的聚落地点扩为可发现、可接续的区域内容，记录用户故事、验收标准、三个可验证子任务、文件范围、风险与至少 10 分钟人类工程师工时。
- 在现有 quest-set 中追加六项顺次任务：芦桥集「芦桥寻集 → 集期赶办 → 集口拦贩」；南麓聚落「南麓寻村 → 南麓捎药 → 塘匪断道」。见闻目标引用图谱节点，收集目标选择货郎无限库存的硬皮/苍牙根，谈话目标与现有 NPC 相连，末段将战斗失败接回任务状态。
- 世界地图新增两处首次到访事件，分别在雾雨渡口 (59,65) 与江南道 (70,75)；保留两处旧地标常显，避免已有玩家见闻未知时目的地消失。新增两场可重战遭遇：芦桥 (60,67)、江南道 (80,20)，避开阻挡地标、人物与既有触发格。
- 知识图谱新增六项任务、两处地点、两项事件，共 10 个节点、21 条关系；基础资料现为 40 项任务、181 个节点/288 条关系。未改 Schema、存档协议或引擎运行时代码。
- 更新任务志、地图舆图、图谱、资料/架构/玩家指南、路线图、战斗经济基线、变更日志和本开发日志。战斗经济基线按来源任务 JSON 逐项复算为 1,298 经验/968 文总和；含互斥分支的单一路线分别至多 1,169 经验/880 文。
- 全量回归发现三个旧断言仍固定任务总数为 34，或在区域事件装配夹具中漏登新图谱节点/百格坐标；将断言收窄为检查五项门派任务，补全知识引用并把旧地图 stub 扩至本轮真实百格尺寸，没有放宽运行时校验。

### 阶段验证

- `npx vitest run tests/round58-region-quests.test.ts`：4 项专项回归通过。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run validate:data`：通过（manifest 与 26 项基础资源 Schema）。
- `npm run audit:round-34`：通过，确认 40 项任务及既有资料引用一致。
- `npm run audit:round-48-docs`：补齐 CHANGELOG/DEVLOG 本轮记录后通过；首轮提示缺本轮日志条目，已在全量最终复跑中确认。

### 最终验证

- `npm run package:release`：全通——26 项基础资料 Schema、26 项 MOD 零问题、`tsc --noEmit`、28 个测试文件/212 项用例、Round 34 与 Round 48 文档审计、Vite 137 modules 生产构建和 Round 47 静态归档/子路径 smoke。
- 发行包 `release/wuxia-rpg-web-0.0.1.tgz`：762,596 bytes，70 个归档文件/69 个内容文件，SHA-256 `f7be4826d733c90663732046b51021feed11e941ba5cfb925718be399c3995fa`；smoke 核验归档 69 个文件的大小与哈希、`/preview/wuxia-rpg/` 子路径以及全部基础资料/Schema和既有 Kenney CC0 素材。
- 浏览器只读打开任务日志，现有玩家记录下可见「芦桥寻集」待接取；检查后恢复原先打开的舆图，没有移动、接取或保存玩家进度。事件格触发、两条任务链和新遭遇胜负由专项自动回归验证；本轮未在浏览器中人工走格或开战。
- Vite 报告既有主 JS chunk 1,924.52 kB（gzip 508.47 kB）超过 500 kB 建议线；构建和 smoke 均通过，代码分块留待后续性能轮次。

---

## Round 57 — 跨区舆图目的地接续（2026-09-29，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-57/plan.md`：记录持续地标目标、手动切区后接续路线、HUD 指引、门控/抵达清理的用户故事、验收标准、文件范围、风险和不少于两小时的工程工时估算。
- `world-navigation.ts` 为本区/远区地标 waypoint 填入同一稳定地标 id；新增 Phaser-free `world-navigation-guidance.ts`，每次按当前地图、知识门控和坐标解析有向剩余区域路由与本图路径。
- `grid-path.ts` 新增到四向可行交互格的确定性最短路。M 舆图选点回调向 GridScene 传递稳定目标；重新打开时恢复投影并重画当前段。GridScene 在走格/成功切区后更新方向、格数和下一关口 HUD 提示；只保留运行时地标 id，不改 v1 存档；已知地标抵达/目标失效/路线断开时清理提示状态。
- 专项 `npm run typecheck` 与三文件 Vitest 回归首轮通过。首轮完整 `npm run package:release` 的 208 项用例中 207 项通过；Round 48 文档审计发现缺 Round 57 DEVLOG 条目及 DATA-GUIDE 状态摘要过期，已补齐并准备复跑全量门槛。

### 最终验证

- 自动：`npx vitest run tests/grid-path.test.ts tests/world-navigation.test.ts tests/world-navigation-guidance.test.ts` 为 3 文件/24 用例通过；`npm run package:release` 复跑全通——26 项基础资源 Schema、启用 MOD 0 问题、`tsc --noEmit`、27 个测试文件/208 个用例、Round 34 与 Round 48 文档审计、Vite 137 模块生产构建及 Round 47 静态归档/子路径 smoke 均成功。
- 发行包：`release/wuxia-rpg-web-0.0.1.tgz` 758,471 bytes，70 个归档文件/69 个内容文件；SHA-256 `92db34165b52ee60d120501ff697c99b4a77597255b62e7e28d4e9f2549743b7`。smoke 校验逐文件大小/哈希、`/preview/wuxia-rpg/` 路径、26 项资料/Schema、两张 Kenney PNG 图集与 CC0 License。
- 浏览器：现有 `http://127.0.0.1:5178/` 页面中新建临时角色，M 舆图选择远区「芦桥集」，收起后画面左上出现本区行路方向/关口提示，重开舆图仍高亮原地标并显示路线。未把临时角色存档；完整步行过关没有进行浏览器人工长途走格，本轮以真实双图资料的引擎回归覆盖过关后接续路线。
- 构建器仅报告既有主 JS chunk 1,924.52 kB（gzip 508.47 kB）高于 500 kB 建议线；构建及 smoke 成功。首轮文档审计失败原因和补齐过程如上，最终审计通过。

## Round 56 — 区域见闻差事与 discoverKnowledge 任务目标（2026-09-29，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-56/plan.md`：为雾雨渡口增补区域专属见闻差事，并把「发现知识节点」做成通用任务目标，含目标、用户故事、验收标准、可验证子任务、风险与人类工时估算。
- 任务协议新增通用 `discoverKnowledge` 目标：quest-set Schema、防御解析器与跨资源装配三层校验知识节点引用；`requiredCount` 固定为 1。知识图谱首次新增节点时发出任务信号，匹配的目标只被推进一次；接取任务时按玩家已知见闻回填进度；读档时把存档已知节点重算到活跃发现目标——复用既有 v1 目标 id/计数快照，不新增存档字段；任务奖励解锁的见闻沿同一信号链级联推进其他活动任务。
- 新增两段石北发布的雾雨渡口见闻巡标差事：玩家先经 R55 碑记事件发现旧渠石闸（`place.mist-sluice`），随后可接取「北岬水尺巡查」——至雾岬林地 (86,15) 触发发现事件解锁 `place.mist-north-cap` 完成；完成前段后接取「南湾水路测绘」——至南湾苇池 (81,87) 发现 `place.mist-south-pool` 完成。两项不互斥且顺次可完成。
- `world-map.json` 为雾岬林地、南湾苇池两处地点设置 `discoveryNodeId` 发现门控地标与一次性发现事件；知识图谱新增 6 个节点、8 条关系，总量扩至 171 节点/267 条关系；基础差事总量扩至 34 项，任务奖励合计 1,108 经验/812 文（含互斥取舍的单周目上界 979 经验/724 文，本轮新增 56 经验/42 文直接计入，见 `docs/COMBAT-BALANCE.md`）。
- 新增/更新自动测试：新增 `tests/round56-discovery-quests.test.ts`，并扩展 `tests/quest-system.test.ts` 及世界地图、知识图谱、读档兼容与文档一致性相关既有测试，合计净增 9 个用例；静态测试基线更新为 26 个测试文件/202 个用例。

### 自动验证（阶段记录）

- `npx vitest run tests/quest-system.test.ts tests/round56-discovery-quests.test.ts`：通过，2 个文件/29 个用例。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run validate:data`：通过（manifest 与 26 个基础资源 Schema）。
- `npm run audit:round-34`：通过。

### 最终验证

- 完整 `npm test`：26 个测试文件、202 个用例全部通过。
- `npm run package:release`：完整质量门槛通过——manifest 与 26 项基础资源 Schema、26 项 MOD 资源零问题、严格类型检查、26/202 全量测试、Round 34 与 Round 48 文档审计、Vite 生产构建（136 modules）及 Round 47 解包/子路径 smoke。
- 发行包 `release/wuxia-rpg-web-0.0.1.tgz`：756,726 bytes；70 个归档文件、69 个内容清单文件；SHA-256 `e5e474dd3d7d268beb0c6ff41f391a85a8d310efde7f2450273ce86347b60a61`。Round 47 smoke 确认 69 个文件的大小/哈希清单相符，可挂载于 `/preview/wuxia-rpg/` 并加载 26 项基础资料/Schema、两张 Kenney PNG 图集及原始 CC0 License。
- `npm run smoke:round-31`：通过，34 项差事、四类任务目标及既有互斥分支/旧档行为烟测；`npm run smoke:round-43`：通过，2 个测试文件/11 个用例。
- Vite 对 1,921.01 kB 主 JS chunk（gzip 507.42 kB）的 >500 kB 建议为非阻断提示。

### 边界

- 巡标差事与发现事件仅覆盖雾岬林地、南湾苇池两处地点；芦桥集与旧渠石闸本体尚无任务内容。远端发布、物理手柄与外部公测仍无证据；本轮未做浏览器手动走查，任务链与发现门控由专项自动测试覆盖。

---

## Round 55 — 扩建第二块百格区域与跨区步行闭环（2026-09-28，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-55/plan.md`：把雾雨渡口从 16×9 过场小图扩建为独立 100×100 可步行区域，含用户故事、6 项验收标准、4 项可验证子任务、风险、预计文件及至少 2 小时人类工时。
- 新增确定性生成脚本 `scripts/generate-round55-ferry-world.mjs` 与 `npm run generate:round-55-ferry` 命令：以格坐标种子哈希与折线河道路径的距离场铺地貌，从已授权 Kenney CC0 图集（Roguelike/RPG 地表 + Tiny Dungeon 人物，许可见 `docs/REFERENCES.md` 第六节）生成 100×100 十层视觉图（mist-river-grass/-shores/-blooms/-woods 四层河流走廊、mist-willow-market-1~5 五层渡镇聚落、mist-river-trails 步径层）与独立碰撞网格。当前产出 7,340 个可行格（`,` 与 `.` 可走，`~` 江水与 `#` 岩岸阻挡）、林木层 388 处 CC0 树木；脚本对全部关口端点、事件格、NPC 基础/日程位、遇怪格、出生点设保护落点，重建不迁移既有坐标。
- 保留事实核验：出生点 (7,7)；关口 `gate.trial-to-ferry` (90,50)→(1,4)、`gate.ferry-to-trial` (2,4)→(89,50)；事件 `event.ferry-first-arrival` (1,4)、`event.reedbank-traces` (5,4)；石北/闻素心/容素青/祝九弦/白鹭洲五名 NPC 的基础位与日程位；三处任务遇怪格 (5,6)/(6,6)/(10,6) 均未移动。
- `world-map.json` 新增四个雾雨渡口地标：雾岬林地 (86,15)、芦桥集 (59,65)、旧渠石闸 (46,53)、南湾苇池 (81,87)；旧渠石闸带 `discoveryNodeId: place.mist-sluice` 见闻门控。新增固定格事件「石闸潮尺铭文」`event.r55-sluice-inscription` (46,53)，成功触发发现 `place.mist-sluice`。
- 知识图谱新增 2 个节点（`event.r55-sluice-inscription`、`place.mist-sluice`，均默认未知）与 1 条 `locatedAt` 关系边，总量由 163 节点/258 边扩至 165/259。
- `scripts/import-round51-kenney-world.mjs` 收窄为只重建起始大地图，不再改写 `map.round-10-mist-ferry`；渡口图层唯一由 Round 55 生成脚本产出，防止旧导入器覆盖第二区域。
- 新增专项回归 `tests/round55-ferry-world.test.ts`（3 个用例）：锁定 100×100/十层尺寸与 License 文件、可行格下限、全部关口/事件/日程 NPC/遇怪/地标锚点从出生点 BFS 可达、两向关口端点坐标精确值，以及碑记事件的 `place.mist-sluice` 发现引用。

### 浏览器手动验证

- 本机开发服务器从江南道实际走至石阶渡口关卡 (90,50) 按 E，落入雾雨渡口码头 (1,4)；跟随镜头在新区域步进，河湾、林地、渡镇与步径多层像素地貌随玩家滚动，碰撞与视觉一致。
- 探索至东南侧芦桥集 (59,65)，继续抵达旧渠石闸 (46,53)：踩入碑记事件格触发「石闸潮尺铭文」见闻，`place.mist-sluice` 词条解锁并进入舆图地标展示。
- 从 (59,65) 返回关口附近，走到回望石阶渡口侧触发格 (2,4) 的相邻格 (2,5) 后按 E，返回江南道 (89,50)，跨区往返闭环走通；进入渡口即落在初到脚印事件格 (1,4)，一次性事件照常触发。

### 自动验证（最终结果）

- `npm run generate:round-55-ferry` 连续重建前后产物 SHA-256 相同：`0557f1467560099a7864c997b888434209af5c2eb54c6ed6b6afd4b49b8a5b51`，证实生成确定性。
- `npm run package:release` 通过：`validate:data`（manifest 与 26 个基础资源 Schema）、`inspect:mods`（26 项资源、0 问题）、`typecheck`、`npm test`（25 文件/193 用例）、`audit:round-34`、`audit:round-48-docs`、Vite 生产构建、版本归档与 `smoke:round-47`。
- 发布 smoke 解包核对 69 个内容文件的大小/哈希，确认静态包可挂载 `/preview/wuxia-rpg/`，并可加载 HTML/JS/CSS、示例 MOD、26 项基础资料与 Schema、两张 Kenney 图集及原始 CC0 License。最终归档 `release/wuxia-rpg-web-0.0.1.tgz`：754,075 字节，SHA-256 `0c0611524064e21a2490d1c1c3c72367db39f539a34be1aad3b078314533eae9`。
- `npm run build` 报告主 JS chunk 为 1,919.61 kB（gzip 507.07 kB），超过 500 kB 提示阈值；构建和发行包仍通过。本轮没有实施代码分块，列入后续性能跟踪。

### 边界

- 远端发布、物理手柄与外部公测仍无证据；本轮浏览器验证覆盖跨区往返主路径，未逐一走完两图全部 100×100 边缘格。
- 地图视觉为确定性脚本产物：修改生成参数后需重跑 `npm run generate:round-55-ferry` 并同步检查锚点保护；手改 JSON 图层会被下次生成覆盖。

---

## Round 54 — 跨区域舆图路线与 waypoint 操作（2026-09-28，已完成）

### 计划与实现

- 开工前计划写入 `iterations/round-54/plan.md`：目标是从区域图显示可步行的跨区行程首段，含用户故事、6 项验收标准、4 项可验证子任务、风险、预计文件及至少 2 小时人类工时；计划开发前创建，未把等待时间计作工时。
- 新增 Phaser-free `src/engine/world-travel.ts`，对已装配地图区域与有向关口执行 BFS；同长路径按 transition id 稳定决胜，不自动补返程边，端点不存在或无路时返回 `null`。
- 新增 Phaser-free `src/engine/world-navigation.ts`，组合当前区地点/关口、直接相邻的区域 waypoint 与已发现的远区地标。远区目的地只投影到本区首个关口格；通过知识节点过滤后才读取/复制地标信息。区域候选仅列直接可见关口去向，避免可达性查询泄露玩家尚未知晓的多跳区域。
- 输入诊断发现当前窄视口 `Phaser.Scale.FIT` 下 pointer 的 x 已换成逻辑画布坐标，但 y 仍是 CSS 像素；例如侧栏首行点击回报 `x≈704,y≈155`，而面板首行位于逻辑 `y=462`，导致先前点击不命中。新增纯逻辑 `normalizeWorldMapPointer` 以 canvas backing height/clientHeight 归一纵轴，舆图列表、pin 路径、拖动与滚轮共用该转换，并以单元测试覆盖高 DPI/零高度。
- 舆图现在支持 W/S 循环焦点、Enter 确认；侧栏各行使用独立命中区，地图 pin 有扩大后的 pointer 命中区。远区“区域/远方”目标不绘制覆盖本地关口的重复 pin，路线详情同时显示本区首段、下一道关口和区域行程。面板 M/Esc 关闭时移除监听并清空选择。
- 同步更新 `docs/MAP-ATLAS.md`、玩家指南、架构/资料指南、README、路线图与变更记录；Round 55 路线转为扩展第二块可步行大型区域并核对关口落点。

### 浏览器手动验证

- 在本机 `http://127.0.0.1:5178/` 新建默认角色，按 M 打开起始 100×100 地图；面板仍显示实景舆图和 7 个可见目的地，未发现的芦岸登船点不出现在候选列表。
- 首次浏览器点击诊断捕获列表命中时 Phaser `pointer.y≈155`，由此确认 FIT 画布的 CSS/逻辑纵轴偏差；修复后再点侧栏首行、点击湖泊 pin、点选直接相邻区域行，面板均保持打开并更新高亮/路线。选择区域目的地显示当前本地图关口与区域行程；W/S 后 Enter 可循环切换并确认。
- 按 M 关闭再打开，选中路线与键盘焦点均已清除，舆图回到待选状态。浏览器人工检查覆盖当前浏览器视口；两跳未公开区域与发现后的远区地标继续由自动回归覆盖。

### 自动验证（阶段记录）

- `npx vitest run tests/world-travel.test.ts tests/world-navigation.test.ts tests/grid-path.test.ts tests/round52-map-landmarks.test.ts`：通过，4 个文件/32 个测试。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- 最终自动验证结果见下方“最终质量门槛”小节。

### 最终质量门槛

- `npx vitest run tests/world-travel.test.ts tests/world-navigation.test.ts tests/grid-path.test.ts tests/round52-map-landmarks.test.ts`：通过，4 个文件/33 个测试。
- `npm run typecheck`：通过（`tsc --noEmit`）。
- `npm run package:release`：通过；`npm run check` 内含 26 项基础资料/schema 校验、MOD 0 问题、类型检查、24 个测试文件/190 项、Round 34 与 Round 48 文档审计；随后 Vite 8.3.1 构建 136 modules，完成 tarball 清单/哈希验证和 R47 `/preview/wuxia-rpg/` 子路径 smoke。版本包 `release/wuxia-rpg-web-0.0.1.tgz` 为 739,006 bytes，SHA-256 `0320c6fadebd162071a089265d9c8f00716a0e69c6f46bd8109b2e710984350b`，70 项归档含 69 个内容文件。Vite 的单 JS chunk 提示为 1,919.61 kB（gzip 507.07 kB），仅为非阻塞体积建议。
- 首次质量门槛在补写本轮 DEVLOG 标题前由 Round 48 审计按预期拒绝（其余 188 项测试通过）；补上本节后重跑完整发行命令，全部门槛通过。

### 边界

- 当前世界仍只有 100×100 起始大地图和 16×9 渡口图；已知远区的路线计算按有向区域图规划，具体格路径只覆盖当前地图至首关口。
- 自动路径只看静态碰撞网格，不考虑 NPC 瞬时占位，也不会自动让角色行走或代替 E 键切区。远区见闻的获取条件和实际跨区连续试玩没有在本轮浏览器操作中走完。

---

## Round 53 — 地标寻路与区域探索反馈（2026-09-28，已完成）

### 计划与实现

- 开发前计划已写入 `iterations/round-53/plan.md`，拆为四向寻路、地标见闻引用门控、舆图 waypoint 交互和整合回归四个可验证子任务，列明风险、涉及文件并估算至少 2 小时人类工程师工时。
- 新增 Phaser-free `src/engine/grid-path.ts` 确定性 BFS：只走四向可通行格，等长路线依 N/E/S/W 稳定择路；障碍上的地点会以曼哈顿半径内可行停靠格为目标；目标越界/被隔断返回 `null`，路线还能折叠为方向段。
- `world-map.landmarks[].discoveryNodeId` 扩展到 schema、parser 和跨资源装配；坏/未登记见闻引用只隔离该地标并告警。默认芦岸登船点关联 `place.reedbank`，`selectVisibleWorldLandmarks` 在已知见闻投影前直接过滤整条记录，避免名称、类别、位置和 id 从地图展示模型泄露。
- M 舆图把当前地图内已知地标和出入口投影为可选 waypoint，绘制寻路线并展示步行格数、方向分段和跨区去向；舆图不自动移动角色或传送。修正 `docs/REFERENCES.md` 曾把“无原作素材”写成“仓库没有任何图像”，与已纳入的 Kenney CC0 图集清单矛盾的问题。
- 浏览器从本地站点进入新游戏并打开舆图，确认百格地图窗口、当前区域和六个可见地点/关口列表均有绘制。尝试点侧栏地点时，当前 CUA 操作把面板收起；重新打开后可见该面板，但无法从这组浏览器操作可靠确认选点后的路线面板状态。故不把这次尝试写成“路线 UI 浏览器验收通过”；路径长度、阻挡和方向由纯逻辑测试覆盖，真实 UI 点选仍需后续复核。

### 自动验证

- `npm run typecheck`：通过（`tsc --noEmit`）。
- 定向路径/地图测试 `npx vitest run tests/grid-path.test.ts tests/round52-map-landmarks.test.ts tests/world-map.test.ts`：通过，3 个文件/27 个测试。
- 首次 `npm run package:release` 暴露 Round 48 文档审计器只读到 Round 52：R53 路线图完成标签使用了审计器不接受的括号/冒号标点。按其可识别格式调整后，`npm run audit:round-48-docs` 通过，Round 48 审计回归 9/9 通过；路线图下一项也改成了带完整编号的 R54。
- `npm run package:release`：最终通过；`npm run check` 子步骤包含基础 manifest/schema 校验（26 项）、MOD 检查（0 问题）、TypeScript 类型检查、22 文件/176 用例、R34 与 R48 文档审计；随后 Vite 8.3.1 构建 134 modules，归档 70 项（69 个内容文件）/737,497 bytes，SHA-256 `acb834326599255fcbf4a32375a1b210791435f901242b07000f1127acd503ff`，Round 47 子路径 smoke 解包及素材/许可文件校验通过。
- 独立定向命令 `npm run typecheck` 通过；`npx vitest run tests/grid-path.test.ts tests/round52-map-landmarks.test.ts tests/world-map.test.ts` 通过（3 文件/27 项）。

### 边界

- 自动路线基于静态地图碰撞格，不把 NPC 临时占位作为障碍；这是舆图步行提示，不是自动寻路行走。浏览器实测确认新游戏与舆图地点/关口列表可显示，但 CUA 鼠标点侧栏的操作会使面板收起，故仍需 R54 在可观测条件下复核真实选点后的距离/路线展示与发现前后闭环。远端发布和外部试玩也不在本轮证据内。

---

## Round 52 — 起始大地图视觉校准与舆图地标（2026-09-28，已完成）

### 计划与实现

- 开发前计划已写入 `iterations/round-52/plan.md`：目标、用户故事、验收标准、相关文件、风险、四项可验证子任务及至少 2 小时人类工程师估时；首项先比对浏览器画面与 TMX/资料坐标，不依据空白截图盲目迁移出生点。
- 只读坐标审计比对 Kenney TMX 地形层、独立碰撞图、NPC 基础坐标和世界关口：出生点 `(43,37)` 实为村道交汇区，周边屏幕可见的房屋、湖岸、道路和多名 NPC 与原坐标相符；因此保留出生点、人物日程、巷战/关口等占位，不引入大范围坐标迁移。
- `src/engine/grid-map-renderer.ts` 现在为地图容器、贴图图像及退化 Graphics 层显式设回 `scrollFactor=1`。原因是 `GridScene` 为 HUD 使用的 `ADDED_TO_SCENE` 固定屏幕处理也会碰到新建地图对象；此前运行画面留在地图贴图左上角草地，NPC/玩家却按跟随镜头移动。真实浏览器复测后，开局视野出现房屋、土路、湖岸、树木与角色，移动一格时背景同步平移。
- `world-map.json` 新增可选 `landmarks` 协议及五类通用类别；schema、解析器和装配器检查静态字段/类别、地图区域引用、重复 id 与格坐标边界。旧地图省略该字段时保持兼容，MOD 坏标记逐项隔离，不会阻塞有效世界。
- M 舆图按当前地图渲染数据地标点、玩家点与坐标图例。首次复核发现原 WebGL 几何遮罩产生 `setMask` 不受支持警告且缩放后无法裁切；现以仅绘制地图内容的 Phaser 子视口相机限制窗口。关闭地图时移除相机、销毁临时内容容器并退订滚轮/指针事件。
- R40 recording-scene 基准原来假定真实地图是 16×9，R51 改为 100×100 并新增 art 后 mock 已过期。本轮把当前地图资料读入后的临时副本去掉 `art`，专测纯碰撞网格 fallback 命令/对象量；历史 R40 的 16×9 对照数据留作历史基线，不以新样本冒充原比较。

### 手动浏览器验证

- 在本机 `http://127.0.0.1:5178/` 从主菜单新开游戏；开局在 `(43,37)` 实际看到聚落房舍、湖岸、道路、植被和邻接 NPC。方向键向东走一格至 `(44,37)` 时地貌相对玩家随镜头移动。
- 按 M 打开舆图：当前百格地图同时显示玩家金点与五个本区资料地标，侧栏给出名称/格坐标，另一区域/出入口资料仍可读。
- 鼠标滚轮将舆图放大至倍率上限；地图可拖向四个边缘，实景均裁切在矩形窗口内，未盖住标题或右侧图例。重开舆图并滚轮缩至倍率下限后，全图居中且留白仍在地图窗口内；按 M 关闭后正常返回探索。基准/回归日志未复现新的 Phaser WebGL mask 警告。
- 将舆图拖动至东侧湖塘可见底图、标记点和地图分区的相对位置；原 TMX 与碰撞层的路径/占格经资料审计，不因标记展示改变可通行性。

### 自动验证

- 定向回归：`npx vitest run tests/grid-map-renderer.test.ts tests/round52-map-camera.test.ts tests/round52-map-landmarks.test.ts tests/world-map.test.ts` 通过（4 文件/23 用例）。
- `npm run validate:data` 通过（manifest/schema 与 26 个基础资源）；`npm run typecheck` 通过；`npm run audit:round-34` 与 `npm run audit:round-48-docs` 均通过。`npm test` 与完整 `npm run check` 均通过，21 个文件/160 个用例通过；MOD 检查为 26 项资源、0 条问题。
- `npm run benchmark:round-40` 单独重跑通过（1 个 benchmark 文件/3 项；当前 100×100 碰撞格 fallback 2.020 ms/render、2 个场景对象，单机描述性读数，不作阈值；26 资源 50 轮加载均为 0 诊断，强制 GC 后堆增约 2.23 MiB）。并发启动 benchmark 与测试造成过一次 worker 启动超时；串行复测均通过。
- `npm run package:release` 通过完整 check、133 modules Vite 生产构建、70 entries/69 内容文件归档和 R47 非根路径静态 smoke；包为 735,045 bytes，SHA-256 `2c1c29afe2b9f17d0857fd02692e5052575321fe7444984971982c75759a3a14`。Vite 保留既有单 JS chunk 超过 500 kB 的提示，但构建和 smoke 成功。
- `audit:round-48-docs` 首次在 R52 状态条目尚未成形时报告路线图缺少 R53 后续条目及 DEVLOG Round52；现已补齐并复跑通过。
- `npm run audit:final` 是独立的完整 Git 历史审计，已在本轮提交后复跑；它核对的范围仍是历史 Round 00–50，不代表项目整体目标关闭或 Round 52+ 内容完成。

### 边界

- 本轮只验证本机浏览器、默认 Kenney CC0 世界资料与当前 viewport；未发布到远端、未增加外部资产、未声称外部玩家试玩或所有路径均可一口气走通。项目总目标仍进行中，R52 只是单轮体验修复。

## Round 51 — 超大可移动世界与网页像素素材（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-51/plan.md`，细分官方素材核验、100×100 地图与跟随相机、角色精灵/舆图、整合验证四个可验子任务；计划工时约 2 小时以上。
- 采用 [Kenney Roguelike/RPG Pack](https://kenney.nl/assets/roguelike-rpg-pack) 的户外图集与 100×100 五层示例地图、[Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) 人物图集，素材页及 [Kenney 许可说明](https://kenney.nl/support) 标注 CC0；仅保留运行所用的两张 PNG 及各自原始 `License.txt`。官方样例 TMX 归档在 `scripts/sources/`，不进入发布静态根。来源、用途与许可说明见 `docs/REFERENCES.md`。
- 新增 `scripts/import-round51-kenney-world.mjs` 和 `npm run import:round-51-world`：从公开 Tiled TMX 解压五个视觉层，扩展林带、池塘、道路与第二聚落，导出 100×100 地图和独立碰撞网格；当前有 7997 个可走格，起点 `(43,37)`。渡口也改用同源图集，保留其 16×9 碰撞语义。
- 扩展地图/NPC Schema 和数据协议，在资料中声明图集、Tiled 图层与 spriteFrame；引擎以最近邻采样将图层缓存为地表纹理。玩家、NPC 与伙伴使用 Tiny Dungeon 像素帧；大地图相机跟随玩家、受世界边界限制，HUD 与面板固定在屏幕上。
- M 舆图使用实际五层地图图像，含玩家位置点、地图拖动、滚轮缩放、方向键微调。浏览器验证滚轮时发现原来的 GameObject `wheel` 绑定没有接到 Phaser 的场景级输入；现改为 `scene.input` 监听，并在舆图关闭时清理。新增 4 个纯视口数学用例及 3 个地图/素材数据用例。
- 修正 `docs/QUESTS.md`、`docs/WORLD-SETTING.md`、人物志、门派志、日程志等过期的小地图名/坐标；更新 GDD 当前设计状态、架构/数据说明及 README/路线图，让 100×100 开局地图在全项目文档中一致。
- 发行打包清单校验将两套素材 PNG 与原始许可列为必需文件；扩展 Round 47 非根路径 smoke，实际请求图集 PNG 并核验两份 CC0 License 可读，避免只验证本地开发路径。

### 手动浏览器验证

- 本地 `http://127.0.0.1:5178/`：新游戏完成角色模板选择并进入江南道，素材资源正常显示，无浏览器 console error/warning。
- 按方向键移动两格后，NPC/地貌相对屏幕移动，玩家维持在相机中心区域，HUD 坐标同步变化；此地图为 100×100 格，而非当前屏幕尺寸。
- 按 M 打开实景舆图；在缩放前尝试拖动时全图完全处于视窗内，因此位置按设计保持居中；用滚轮放大后可拖动地图平移，当前位置点随底图移动；M/Esc 关闭返回探索。地图控件通过浏览器实际鼠标滚轮与拖拽输入验证。

### 自动验证

- `npm run import:round-51-world`：成功，100×100，5 个视觉层，7997 个可行格，起点 `(43,37)`。
- `npm run validate:data`：通过，manifest/schema 与 26 个基础资源。
- `npm run typecheck`：通过。
- 首次 `npm test -- --run` 有 154/155 通过；唯一失败为文档审计发现 README/路线图仍列 Round 50。随后同步当前轮次和区域名，浏览器正式试玩后完整 `npm run check` 通过，Vitest 为 19 个文件、155/155 通过，Round 34 和 Round 48 两项文档审计通过。
- 完整 check 首次在 Round 34 审计处发现 16 条任务/世界设定表仍写旧区域名；按新 `world-map.json` 更新名称和位置后，两个文档审计及最终 check 通过。新加的静态资源 smoke 首次发现测试服务器未配置 PNG MIME，补充 `image/png` 后 smoke 通过。
- `npm run package:release`：包含完整 check 和 133 modules 生产构建；版本归档 734038 bytes、69 个内容文件，SHA-256 `6e3c8cf08da1e3d81d0d7024e097ecc120da73fbe195fc17332a5dbea3be9abe`。Round 47 smoke 成功解包并校验全包哈希，在 `/preview/wuxia-rpg/` 非根路径加载 26 项基础资料/Schema、两张 Kenney PNG 图集及两个 CC0 License。
- `dist/assets/kenney/` 和 `.tgz` 归档均实际含两套 PNG 图集与 License.txt；地图源 TMX 只留在开发脚本目录，不进入版本包。
- `npm run audit:final`（Round 51 提交后）通过：历史 Round 00–50 的 51/51 份计划、51/51 个轮次提交和所有最终交付审计项均通过；R51 是后续缺口收敛迭代，并未把 R50 最终验收报告改写为全项目完成。

### 边界

- 本机手测覆盖镜头跟随、地图缩放/拖动和资源读取；未声称外部玩家试玩、远端托管发布或物理手柄实测。大地图区域辨识度及周边指引继续列入 R52 试玩反馈范围。

## Round 50 — 最终交付审计、纵向试玩与复盘（2026-09-28，已提交并通过最终审计）

### 计划与实现

- 开发前计划写入 `iterations/round-50/plan.md`，包括验收标准、4 个独立子任务、风险、涉及文件和约 90–150 分钟人类工程师工时估算。
- 新增 `scripts/lib/final-acceptance.mjs` 与 `scripts/audit-final-acceptance.mjs`，通过 `npm run audit:final` 从当前仓库读取 Round 00–50 计划标题、子任务小节内的两项以上任务、至少 10 分钟的计划工时估算、Git round commit、manifest 资源（同 Schema 资源合并计数）和 Schema 家族、内容数量、必需文档、C1+原创扩展及同名 MOD 示例；引擎资料精确字面量扫描只作人工审查提示。计划工时为事前估算，审计不能测量人类实际耗时。历史依赖命令保持独立，不加入适用于浅克隆 CI 的 `npm run check`。
- 试玩发现收集任务完成后 `trackedQuestId` 未同步清除，原有存档恢复会产生“跟踪中的任务不是进行中任务”提示。`src/engine/quest-system.ts` 现统一在任务完成时清除相同跟踪项；扩展任务状态测试覆盖常规目标、收集目标和接取时库存已足额的即时完成。
- 新增 `docs/FINAL-ACCEPTANCE.md`，逐项列出硬性要求、证据、静态/运行证据边界、浏览器操作与未做远端验证项。

### 浏览器手动纵向流程

- 本地开发站点 `http://127.0.0.1:5178/`，首次测试空槽开始。主菜单 Enter 创建默认“抄书学徒”，进入 `(7,7)`；方向键沿第七行到 `(2,7)` 按 E 开战，普通攻击五回合击败巷中刀客，画面显示敌方 HP 0、玩家存活并成长。
- 绕行至陆贞娘邻格按 F：选择打听生面孔并追问背刀客，获得“雨后的脚印”；按 Q 接取“帮口送药”，因为开局已有两份回春膏显示 `2/3`。
- 叶庭舟处先请教剑意，再加入听雨剑阁。师门剑法当时因属性门槛不满足而隐藏；回探索按 C 组合组件、输入“归潮听息”并确认，面板显示已创 `1/5` 且该武学名称已登记。
- 等到 10:30 日中穿过开放通道到姜百味商店，E 购买一份回春膏；B 验证数量 `×3`；Q 验证“帮口送药”从 `2/3` 自动完成到 `3/3`，奖励经验 15、银两 13。
- 保存前空槽一、二均显示“空（新建存档）”。保存至槽一；取物后再保存至槽二。刷新浏览器，从 Continue 读入槽二，地图恢复 `(8,1)`，B 显示回春膏 `×3`、C 显示已创武学 `1/5（归潮听息）`。
- 修复前读入旧逻辑写下的槽时出现跟踪状态警告，原因是收集目标完成未清理旧跟踪。修复后从槽二读入旧状态，写到空槽三，再刷新并从 Continue 读槽三；地图恢复到 `(8,1)`，没有新增跟踪状态警告。该浏览器会话仍保留此前两次旧槽加载累计的四条历史警告；错误级日志为最终复核项，不将历史警告误写成零告警。

### 最终验证

- `npm test -- --run tests/docs-audit-round-48.test.ts tests/round46-vertical-slice.test.ts tests/round50-final-acceptance.test.ts tests/quest-system.test.ts`：4 个文件、36 个测试通过。全量首次复跑发现文档状态仍停在 R49、纵向用例仍期待旧的读档清理警告；更新 R50 状态与回归断言后重跑通过。
- `npm run check`：exit 0；manifest + 26 份基础资源 Schema、启用 MOD 问题 0、`tsc --noEmit`、17 个测试文件/148 项、R34 与 R48 文档审计全部通过。
- `npm run smoke:round-35`：exit 0；双 MOD 优先顺序、坏覆盖回退、基础资料不可由 MOD 救援、manifest 损坏错误、来源诊断与报告顺序均通过。
- `npm run package:release`：exit 0；含完整 `check`、Vite 132 modules 生产构建及 R47 解包/子路径 smoke。归档 66 entries（65 个内容文件），621,304 bytes，SHA-256 `17af4e64c5bcb9c7251362a64315d7f14e2440f19f319afab68f6b69c1deb608`；子路径 `/preview/wuxia-rpg/` 正常加载页面、脚本、样式、示例 MOD 及全部 26 项资料/Schema。主 JS 1,895.16 kB / gzip 499.55 kB，仍有 Vite 默认 500 kB chunk 建议。
- 修复后浏览器复读流程：将读入并清理后的旧槽状态保存到原空槽三，刷新并 Continue，回到 `(8,1)`；最后日志检查无 JS error，无新增跟踪 ID 警告。会话仍留有修复前旧槽读档生成的四条历史 warn，不将结果描述成全局零警告。
- 提交后 `npm run audit:final`：exit 0；51/51 份轮次计划字段/任务完整且估时均≥10分钟，51/51 个 `round-XX:` 提交，Git 共 61 commits；26 项 manifest 资料、24 个 Schema 家族；内容为 12 NPC、5 门派、32 任务、51 物品、30 武学、7 结局、163 图谱节点；24 份必需文档；1 项同名 MOD 覆盖；C1+ 原创扩展 6 项；扫描 30 个引擎源文件、约 1,100 个资料字面量候选、精确命中 0。
- Git remote 未配置；未运行托管 CI/Pages，也未验证真实物理手柄或外部公测。这些不影响本地最小玩法/存读档验收，不宣称相关外部流程已成功。

---

## Round 49 — 公测前试玩、资料完整性与菜单返回修复（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-49/plan.md`；分为真实资料告警定位与修复、资料装配回归、浏览器纵向走查、文档维护与提交四项，预计人类工程师 60–90 分钟。没有可用外部试玩反馈，本轮如实记为本地公测前走查。
- 从主菜单启动本地 Phaser 游戏时，HUD 提示默认可选资料无效。新增 `tests/round49-default-world-integrity.test.ts`，以仓库真实 manifest/Schema/数据树驱动 `loadWorldData()`，首次运行定位到 `forge.recipe.r32-marsh-amber-seal`：结果“沼琥珀印”把基础“蚌光佩”的 `resolve +2 / qi +15` 降为无定力且 `qi +14`，违反装备锻造同槽且属性不可退步规则。修正为保留 `resolve +2`、增加 `insight +2 / health +12 / qi +16`；完整性检查同时锁定资源全加载、NPC/门派/任务/物品/武学达标与可选资料零装配告警。
- 浏览器走查发现暂停子页按 Esc 会直接回探索：PauseMenu 与 GridScene 对同一个按键分别处理，设置页尚未回退暂停主页，场景监听便关闭了整个暂停层。GridScene 现让已打开暂停菜单独占该键；设置/保存页 Esc 逐层返回暂停主页，主页 Esc 才恢复探索。
- 将 R48 手册审计的当前轮次识别改为从 ROADMAP 最新已完成条目动态推导，并同步 README、架构/数据/测试/玩家文档；新增 `docs/PLAYTEST-FEEDBACK.md` 留存两条复现、修复状态、未覆盖边界和后续试玩模板。

### 浏览器走查

- 本地 `http://127.0.0.1:5178/`：新角色进入地图成功，锻造资料告警行消失；在 `(7,7)` 上方墙格不能移动，绕行至 `(4,5)` 后可 F 键打开陆贞娘对白，走入 NPC 占格被阻挡；E 键打开其任务列表并接取「茶棚凉汤」，状态变为进行中 `0/4`。
- 在起点附近按 E 打开“南市武擂”资料面板；暂停设置页 Esc 回到暂停主页，暂停主页 Esc 恢复探索；保存页展示三个空槽，Esc 回暂停主页。没有点击保存，不覆盖任何存档。
- 此次浏览器验收没有完成战斗胜利/奖励结算、实际学习武学或存档往返；这些仍只有 Round 46 Phaser-free 集成测试证据，试玩记录未将其说成完整浏览器通关。无外部 beta 反馈来源。

### 验证

- `npm test -- --run tests/round49-default-world-integrity.test.ts`：首次运行因配方的定力/内力属性回退失败，诊断精确指出被禁用的 `forge.recipe.r32-marsh-amber-seal`；修复数据后 1 项回归通过。
- `npm test -- --run tests/docs-audit-round-48.test.ts tests/round49-default-world-integrity.test.ts`：2 个文件、10 项通过；路线图动态轮次识别反向 fixture 首次发现缺少标准 Rxx 行格式后修正。
- `node scripts/audit-round-48-docs.mjs`：通过；当前完成轮次由 ROADMAP 推导，并核对 README、架构/数据/玩家指南和 changelog/devlog 同步到 R49。
- `npm run package:release`：完整 `validate:data` 26/26、启用 MOD 问题 0、严格类型检查、16 个测试文件/143 项、R34 与手册/当前进度文档审计、132 modules Vite 生产构建及 R47 解包/子路径 smoke 全部通过。生成 `release/wuxia-rpg-web-0.0.1.tgz`，621,026 bytes，SHA-256 `52f1ea213941da92b760ec35c8555c6db81fa87c7ea5411d0c444f457ef61f99`；归档 66 entries、65 内容清单文件。
- `git diff --check`：通过；仅 Git 提示部分修改文件将在仓库 autocrlf 规则下转换行尾。Vite 的 1,895.11 kB 主 JS chunk >500 kB 提示为非阻断项。
- 当前目标仍需继续 Round 50 及最终交付验收，R49 不代表整个项目目标完成。

### 未覆盖因素

- 没有真实外部试玩用户或收集到的玩家反馈；本轮只有可复现的本地验收结果。
- 未在浏览器中完成战斗奖励、学武和读档/读档往返；无 Git remote，未进行远端发布验证。

---

## Round 48 — 玩家手册、MOD 指南与文档一致性审计（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-48/plan.md`，拆分现状基线、玩家与作者指南、架构/资料/许可复核、可测试文档门槛、全量验证与提交五项；预计人类工程师 60–90 分钟。
- 新增 `docs/PLAYER-GUIDE.md`，键位、菜单、互动、战斗、存档/设置与常见问题以游戏内操作面板及当前实现为依据；新增 `docs/MOD-GUIDE.md`，说明同路径覆盖、manifest 启用顺序、只读校验、F2 诊断、内容包和静态构建边界。
- 版本包 staging 白名单显式带上两份手册，Round 47 解包 smoke 检查解包后正文，不依赖仅有 `docs/` 目录的空壳。
- 新增 `scripts/lib/docs-audit-round-48.mjs`、CLI 与类型声明；新增 `npm run audit:round-48-docs` 接入 `npm run check`。9 项测试覆盖仓库/夹具通过、缺指南/索引、README 与指南无效命令、过时根路径、manifest/schema/内容计数漂移、漏打包与不诚实的许可边界。
- 更新 README、架构/资料/发布/参考/测试文档，明确当前 26 个 manifest 资源、24 种已登记资源 Schema 家族、26 份 Schema 文件，静态版不提供动态 MOD 安装；无项目 LICENSE，引用来源授权未知。

### 验证

- `npx vitest run tests/docs-audit-round-48.test.ts`：1 个文件、9 项通过，含仓库正向、fixture 正向及缺失文档/README 索引/未知命令/绝对根路径/manifest 资源数/Schema 数/内容清单计数/遗漏包指南/许可边界反向用例。
- `node scripts/audit-round-48-docs.mjs`：通过；动态核对当前 README 与两份指南所用 npm scripts、manifest 的 26 项资源、26 份 Schema 文件、24 种登记资源 Schema 及基础数据数量；引用/发布授权表述和包内文档断言一致。
- `npm run package:release`：完整 `check` / Vite 构建 / tarball 解包 smoke 通过。基础资源 Schema 26 项、启用 MOD 0 问题；全量测试 15 文件/142 项，R34 与 R48 两个文档审计通过，Vite 132 modules。生成 66 个归档 entries（65 个内容清单记录文件），620,869 bytes，SHA-256 `7ffd16bf0b26e7c840dc1e24152ee0a57fe6f7be8b069a078ba4edceeec43b1e`；两份新手册均从解包目录读取，子路径下资源 smoke 通过。
- `npm run smoke:round-35`、`npm run smoke:round-36`、`npm run smoke:round-37`：均通过，分别复验多层覆盖/坏层回退、Vite 安全热重载/生产剔除、内容包导入导出与安全拒绝边界。
- `npm run typecheck`：严格类型检查通过；`git diff --check`：提交前复核。

### 未覆盖因素

- 本轮手册按操作面板、源码和协议核对，但没有启动浏览器手动游玩/验证 Phaser UI 文案在不同分辨率下的可见性。
- 静态包由本地解包/HTTP smoke 验证；工作区无 Git remote，没有 GitHub Actions 运行结果或 Pages URL，也未执行真实公开部署。

---

## Round 47 — 静态版本打包与手动 Pages 部署（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-47/plan.md`，拆为路径/主机兼容、版本化静态包、手动发布工作流、复核与提交四项；预计人类工程师 60–90 分钟。
- Round 47 先对默认 npm 文件收集作只读检查：`npm pack --dry-run --json` 会把 `src/`、`tests/`、`.github/`、`data/` 及预存 untracked `.serena/project.yml` 一起纳入宽泛包。此结果未用于发布；实际打包改为临时 staging 加显式 npm `files` 白名单，发布脚本只覆盖 `release/` 下相同版本的归档与 checksum。
- Vite 使用 `base: './'`。新增 R47 smoke 在临时 HTTP server 的 `/preview/wuxia-rpg/` 子路径实际托管从 tarball 解出的网页，并经 Vite SSR 导入真实 `loadGameData`；验证入口 JS/CSS、示例 MOD、manifest 指向的 26 项 JSON/Schema 全部可达，diagnostics 为零。
- 新增 `npm run package:release`：先走完整 `build`（即 `check` + Vite），再从 `dist/` 和必要说明构造隔离包；移除无运行意义的 `.gitkeep`，拒绝隐藏文件与符号链接，包内 manifest 对 staging 每个文件记字节数/SHA-256，npm pack 实际文件表必须与 allowlist 完全相同，并旁置 tarball 的 SHA-256 文件。
- 打包器解析 `npm ls --omit=dev --all` 生产依赖闭包，按已安装精确版本收集 license 字段与发行目录中的 license 文本，覆盖 Ajv/Phaser 及 5 个传递依赖，共 7 包；`THIRD-PARTY-NOTICES.md` 同时进入静态站点与版本包。此清单不授予项目本身代码/资料许可；根仓库仍无 LICENSE，见 `docs/RELEASE.md`。
- 新增 `tests/release-package.test.ts` 4 项，覆盖清单排序/哈希、版本与提交校验、必需文件、重复/危险/递归路径及精确包 allowlist。R47 smoke 解包 0.0.1 归档，对 63 个登记文件重新计算字节数与哈希，并实际 HTTP 读取子路径页面/资源/基础资料。
- 新增 ADR-0007 与 `.github/workflows/deploy-pages.yml`：只响应人工触发，默认不确认公开发布；需在默认分支并明确勾选后才运行完整打包/Pages artifact 上传，再由权限独立的 job 部署。版本包作为 30 天 GitHub Actions artifact 保留。添加 `docs/RELEASE.md` 与 GitHub Pages 官方参考；普通 CI 未添加发布步骤。
- 当前工作区 `git remote -v` 为空。只完成了可审查的发布配置、本机静态归档和路径验收，没有 GitHub Actions 托管结果、Pages URL 或实际公开部署。

### 验证（本机实际命令与结果）

- `npm run package:release`：通过完整质量门槛和生产构建；26 个基础资源 Schema、MOD 0 问题、严格类型、14 个测试文件/133 项、Round 34 文档审计通过；Vite 132 modules 成功。仅有主 JS >500 kB 非阻断提示。
- 生成 `release/wuxia-rpg-web-0.0.1.tgz`：616,513 bytes；SHA-256 `0e564cf8b1782ec91a28790d295895427e859fe2948a249406288ab829b078ce`；归档 64 entries，清单验证 63 个文件。`release/` 被 Git 忽略。
- `npm run smoke:round-47`：通过，64 项归档可解包，63 个文件与清单大小/hash 全部一致；项目子路径下可读 HTML/JS/CSS、示例 MOD、第三方许可证文本及全部 26 项基础 JSON/Schema。
- `npm run smoke:round-35`、`npm run smoke:round-36`、`npm run smoke:round-37`：通过。
- Python PyYAML `BaseLoader` 解析 `.github/workflows/deploy-pages.yml`，并静态断言唯一事件是 `workflow_dispatch`、确认项默认为 false 且必填、默认分支门控及 deploy permissions：通过。没有可用 `actionlint`，workflow 未在 GitHub Actions 上执行。
- `git diff --check`：最终日志更新前通过，提交前将对完整 staged diff 再复核。

### 未覆盖因素

- 该本机 smoke 在真实解包网页上验证资源与 JSON 世界资料 HTTP 路径，但未启动浏览器或 Phaser、未手动游玩，也未验证 GitHub Pages 服务器返回头与真实浏览器安全策略。
- 没有 remote，无法运行托管 workflow 或证明公开站点可用。实际发布仍需维护者配置 Pages source、审查公开资料和来源授权，并在默认分支手动确认。
- npm 生产依赖当前均提供明确 license 元数据和 license 文件；项目自有代码/数据授权政策仍未由 Round 47 决定，因此此原型包不是 1.0 或商业分发许可。

---

## Round 46 — 真实资料纵向切片验收（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-46/plan.md`，拆分真实资料纵向 harness、成长与续玩闭环、双结局路线回归、质量门槛与记录四个子任务；预计人类工程师 3–5 小时。
- 新增 `tests/round46-vertical-slice.test.ts`。测试读取仓库内真实角色、地图、任务、NPC/对白、战斗、门派、武学、物品、商店、历法、图谱、存档和结局资源，经各自解析器、引用装配器和运行时模块建立同一纵向场景，不复制故事 fixture。
- 首项断言以真实开局角色检查起始地图合法格、实地可进入格、墙体和越界阻挡；主流程由实际对白图接受巷战任务，通过 `CombatSession` 打完数据遭遇并核对经验/奖励，再经师门对白入派和学会资料定义的武学。
- 测试 JSON 往返保存快照、执行存档解析/恢复预检并恢复两份独立运行状态；预检会报告一个已完成任务仍列为追踪目标的旧状态，断言清理后继续。两份恢复状态分别经实际 R42 对白效果、任务状态信号完成「公开登记」与「保护证人」路线，核实互斥兄弟任务失败、各只有匹配结局可选，错误结局选择被拒。
- 新增 `smoke:round-46` 专项入口并同步测试指南、README、变更日志和本路线图。本轮未发现需修复的游戏引擎缺陷；未修改游戏规则/内容，也未做 Phaser 浏览器 UI 手动游玩。

### 验证（本机实际命令与结果）

- `npm run smoke:round-46`：1 个测试文件、2 项通过。
- `npm run build`：资料 Schema 26/26、启用 MOD 问题 0、严格类型检查、13 个测试文件/129 项、Round 34 文档审计通过；Vite 132 个模块生产构建通过。主 JS 1,895.16 kB / gzip 499.54 kB，chunk 超过 500 kB 提示为非阻断警告。
- `npm run smoke:round-42`：1 文件/3 项通过；`smoke:round-43`：2 文件/11 项通过；`smoke:round-44`：3 文件/30 项通过。
- `npm run smoke:round-20`、`smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33`：均通过。
- `git diff --check`：最终文档差异复核通过；行尾转换提示不影响检查结果。

### 未覆盖因素

- 这是 Node/Vitest 下对真实资料和 Phaser-free 公共 API 的可重复集成验收，不覆盖浏览器画面、键盘/UI 路由、实际用户输入时序或手动通关体验。
- 不证明所有资料组合及所有存档历史均可达；只覆盖测试描述的开局状态与两条 R42 互斥路线。

---

## Round 45 — 战斗成长与擂台经济平衡（2026-09-28，已完成）

### 计划与实现

- 开发前计划写入 `iterations/round-45/plan.md`，拆为战斗成长基线、赛事奖励/存档边界、数值文档与全量回归三项；预计人类工程师工时 60–90 分钟。
- 用真实资料核算角色 2/5/10/15/30 级门槛为 40/280/1,080/2,380/9,280 XP；32 项任务原始奖励合计 1,052 XP/770 文，三组互斥分支各自优化后上界为 923 XP 与 682 文；四场固定遭遇再提供 152 XP。该静态合计没有假设所有路线都能在单周目完成。
- 真实开场巷战基线：无装备、无伙伴、只用起始散手，5 招击败 60 生命刀客；首次胜利发 40 XP，角色从 83/83 生命升到 2 级并因升级回补变为 29/101。
- 将擂台银两与物品彩头改为每个擂台首次完整夺魁领取一次；真实胜场仍逐场获得数据经验，半途战败时已胜回合的 XP 保留。重赛继续记录次数/最佳/最近胜场，首夺已领后不因满包或满钱袋被拒绝；面板和结算提示区分重赛无经济彩头。现有 `championships` 作为已领取标志，旧 v1 快照不迁移。
- 首夺后即刻刷新成就，确保擂台成就只触发一次且能按首次战绩领取。R20 smoke 扩展首夺/重赛奖品与逐轮经验检查；新增 `tests/round45-balance.test.ts` 4 项。
- 新增 `docs/COMBAT-BALANCE.md` 记录经验/经济基线和统计限制，并更新擂台设计与测试说明。

### 验证（本机实际命令与结果）

- `npm test -- tests/round45-balance.test.ts`：1 个文件、4 项通过。
- `npm run smoke:round-20`：通过，覆盖首夺货币/物品彩头、各轮战斗经验、擂台装配与旧/新 v1 存档。
- `npm run build`：完整 `npm run check` 通过——26 个基础资源 Schema、MOD 0 问题、严格类型检查、12 个测试文件/127 项通过、Round 34 文档审计；随后 Vite 生产构建 132 个模块成功。主 JS 1,895.16 kB / gzip 499.54 kB，Vite 的 >500 kB chunk 提示仍为非阻断。
- `git diff --check`：通过（最终日志更新后复跑）。未做浏览器手动游玩；UI 改动限于报名/结算文案和预检分支，未引入 Phaser-free 规则外依赖。

### 未覆盖因素

- 仅审查现有单一开场角色、数据配方和静态报酬；没有玩家遥测、概率仿真或高等级完整周目测试。任务失败/门派路线会影响实际可达经验；装备材料的回收估值假设都按商店价购入。

---

## Round 44 — 日程邻接事件与一次性声望后果（2026-09-28，已完成）

### 计划与实现

- 开发前计划已写入 `iterations/round-44/plan.md`：事件与日程联动、任务后果奖励、渡口分支与图谱叙事、审计/文档/收尾四个子任务；预计人类工程师 4–6 小时。
- `world-map` 固定与漫游事件共用 `nearbyNpcIds` AND 条件；Schema 与防御解析器接受人物 id，世界装配对照最终 NPC 资源校验并隔离坏引用。GridScene 在成功走格后的当前放置列表上构建曼哈顿距离为 1 的人物集合；现实时段日程由既有时钟结算先更新，再提供给事件判断。
- `quest-set` 奖励扩展可选 `factionRenown` 和 `discoverKnowledgeNodeIds`，检查非零范围、重复门派与门派/节点引用；任务首次完成的奖励 grant 携带扩展字段。新增 Phaser-free `quest-consequences` 应用社会状态钳制和首次见闻解锁，任务名录预览声望/百科报酬，完成通知显示实际变动。
- 雾雨渡口新增黄昏雨天「雨夜旧桩之争」，需要已知风雨传函且按日程落位的石北、白鹭洲同时与玩家相邻。白鹭洲提供「先固旧桩/先核渡簿」两项同前置互斥差事；分别与石北/柳听澜交谈完成，并结算铁嶂派/寒山书院声望和对应百科结果。图谱新增 5 节点/9 关系；基础任务总量 32，图谱为 163 节点/258 关系。
- 更新 Round 34 数据文档审计，让地图图册核验邻近人物及其资料引用，任务志核验声望/见闻报酬；扩充 world-map/quest/任务/日程集成测试和 Round 44 smoke。由于内容总量推进到 R44，将维护中的 R31 任务烟测预期由 30 更新为 32，并显式核对 R44 新增两项。

### 验证（本机实际命令与结果）

- `npm run smoke:round-44`：3 个测试文件、30 项通过。
- `npm run check`：通过，manifest 与 26 个资源 Schema、MOD 检查 0 问题、`tsc --noEmit`、11 个测试文件/123 项、Round 34 文档审计通过。
- `npm run build`：通过，Vite 转换 132 个模块；主 JS 1,894.59 kB / gzip 499.30 kB，超过 500 kB 的 chunk 提示非阻断。
- `npm run smoke:round-30`、`smoke:round-31`、`smoke:round-33`、`smoke:round-43`：均通过；R33 核实 163 节点/258 关系。R31 smoke 修订后核实 32 项任务、无任务装配警告。
- `git diff --check`：通过。浏览器手动游玩未测；事件触发与对白效果由解析、运行时纯模块集成测试及完整世界装配回归覆盖。

---

## Round 43 — 风雨传函与五派核验支线（2026-09-28，已完成）

### 计划与实现

- 开发前写入 `iterations/round-43/plan.md`，拆成漫游奇遇协议、五派任务资格/叙事闭环、跨资源审计与回归三个子任务，估算人类工程师 3–5 小时。
- `world-map` 增加向后兼容的可选 `randomEvents`。装配器校验地图、条件与图谱发现引用并隔离坏条目；纯选择器注入随机源，稳定筛出候选并在一次调用中至多返回一项。GridScene 只在成功移动完成后触发，完成 id 与固定事件共用 `completedRegionalEvents`，不改快照版本或字段。
- 任务协议加入 `requiredFactionId` / `requiredKnowledgeNodeId`，装配时按有效门派/图谱节点检查。任务列表只隐藏不符合资格的 offered 项；接受状态机与对话效果事务再校验，资格仅限制接取，不妨碍离门后的活动任务结算。
- 新增「风雨传函」漫游事件和五条原创门派差事。五种结果分别为索环回弹、石桩空槽、受潮陈艾、旧抄缺页、运盐船缆痕；对白发现结果节点，图谱补齐前置、导师、目标人物和结果关系。新增 5 任务，基础总量为 30；图谱为 158 节点/249 边。
- 更新 world-map / quest Schema、地图图册、任务志、图谱说明、测试说明、README、路线图与烟测计数。对对白 JSON 做定点追加，保留已有资料排版。

### 验证（本机实际命令与结果）

- `npm run smoke:round-43`：2 个测试文件、9 项全部通过（含旧地图兼容、概率/一次性、坏引用、资格拒绝、完成与见闻发现）。
- `npm run smoke:round-27`、`npm run smoke:round-30`、`npm run smoke:round-31`、`npm run smoke:round-33`：全部 exit 0；R31 断言 30 项任务，精确保留 R31 +18、R42 +5、R43 +5；R33 核验 158 节点/249 关系及全部任务目标边。
- `npm run check`：exit 0；26 项资源 Schema、0 个启用 MOD 问题、typecheck、10 文件/117 用例、Round 34 文档审计通过。
- `npm run build`：exit 0；131 modules，主 JS 1,891.37 kB / gzip 498.43 kB。Vite 的 500 kB chunk 提示为非阻断警告。
- 浏览器手动游玩未测；R43 行走触发时机与叙事路径由纯模块单测、实际任务/对白运行时集成测试和完整资料构建覆盖。

---

## Round 42 — 雾渡旧簿主线与互斥结局（2026-09-28，已完成）

### 计划与实现

- 先编写 `iterations/round-42/plan.md`，拆分章节因果设计、数据接线、集成验证与文档三个子任务；预计人类工程师 2–4 小时。
- 在 R31「渡籍补录」之后增加「旧簿验痕 → 两家对页 → 封存水痕」三项任务；证物「渡籍封印拓痕」作为第三阶段目标，由对话效果原子授予，且不可交易。
- 新增「明册立约 / 护证留印」同组互斥任务；两条路线各自通向「公簿昭潮 / 灯下留痕」数据结局。章节由白鹭洲、顾夜尘、柳听澜、祝九弦四名现有 NPC 的既有对话图承载；完成任务后终端对白发现结局见闻，任务名录与对白接取两种入口共用同一结算路线。
- 知识图谱增加 13 个节点（含任务、证物、事件、结局）及 26 条关系；基础资料总量为 147 节点、228 条边、25 项任务、51 件物品、7 项结局。
- 新增 `tests/round42-story.test.ts` 三项集成用例，覆盖章节/分支结构、从 R31 状态机驱动到两条结局的实际闭环、目标对白图的节点和引用完整性。新增 `npm run smoke:round-42`。为兼容扩充后的结局数量，将 Round 27 MOD 坏引用隔离断言改为“坏一项只减少一项”，并清除 Round 33 烟测输出中的过时固定数量。
- 文档同步 `docs/QUESTS.md`、`docs/ENDINGS.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/ITEMS.md`、`docs/TESTING.md`、`docs/GDD.md`、README 与路线图。

### 验证（本机实际命令与结果）

- `npm run smoke:round-42`：1 文件、3 用例通过。
- `npm run smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33`：全部 exit 0。
- `npm run check`：exit 0；manifest 与 26 项基础资源 Schema 通过、启用 MOD 问题 0、TypeScript 检查通过、8 文件 108 用例通过、Round 34 文档审计通过。
- `npm run build`：exit 0；完整 `check` 先行，Vite 转换 131 modules 并产出生产构建（主 JS 1,887.10 kB / gzip 497.63 kB）。保留非阻断 chunk 大于 500 kB 的提示。
- `git diff --check`：exit 0（仅有仓库现存的 LF→CRLF 行尾提示，无空白错误）。
- 未进行物理手柄或浏览器游玩手测；本轮未修改引擎代码和对白/任务解释器协议。

---

## Round 41 — 输入方案与无障碍显示选项（2026-09-28，已完成）

### 计划与实现

- 先写 `iterations/round-41/plan.md`（子任务：设置模型与输入解析模块 → 场景/菜单接入与设置应用 → 测试、文档与验证），随后按仓库现状实现。
- **设置模型（`src/game/settings.ts`）**：`GameSettings` 扩展为六字段（volume / textScaleIndex / movementLayout / gamepadEnabled / highContrast / reducedMotion），`TEXT_SCALE_STEPS` 追加 1.6 档（五档；两个设置页 6 行布局按最大字号校验过行距）。解析规则与 Round 09 同语义并向前兼容：旧载荷 `{volume,textScaleIndex}` 直接加载、新字段补默认；已知字段"存在但无效"（如 `movementLayout:'qwerty'`、布尔字段传字符串）整载荷拒绝回默认且不写存储。新增共享 `settingsRows`/`adjustGameSetting`（主菜单与暂停菜单同一来源渲染与调整，音量钳制、其余循环/取反、无操作返回原引用以便跳过持久化）。`applyGameSettings` 在声音总线之外写画布高对比度 CSS 滤镜（`HIGH_CONTRAST_FILTER = contrast(1.4) saturate(1.25)`）；实现中顺带修复 `game.sound` 为 `undefined`（极端/mock 环境）时 `manager !== null` 判空漏网导致空引用的边界，改为 `!= null`。新增运行时访问器 `currentMovementLayout/currentGamepadEnabled/currentReducedMotion` 供场景每帧/每键读取。
- **Phaser-free 输入模块（`src/game/input-settings.ts`，新增）**：三档移动布局解析、键集与逐键启用判定、帮助文本；`resolveStickDirection`（死区 0.5、主导轴、对角水平优先、非有限值防御）；`resolveGamepadDirection`（D-pad 布尔基数优先——up>down、left>right 的对向消解与键盘路径同序——摇杆仅在 D-pad 静默时兜底）；`sampleStandardPad`（结构化入参，A→confirm、B→back）；`GamepadEdgeTracker`（按住只发一次、换向即新边沿、释放重触发、`reset()` 供面板关闭防泄漏）。实现前以仓库锁定的 Phaser 4.2.1 类型（`node_modules/phaser/types/phaser.d.ts` 的 `Gamepad`/`GamepadPlugin`）核对 API 形态：`input.gamepad` 为场景级插件且可空、`pad1`–`pad4` 类型标注非空但文档明示运行时可 `undefined`（代码按 truthiness 防御）、`leftStick` 已应用轴阈值。官方来源登记 `docs/REFERENCES.md` #17/#18。
- **场景接入**：`src/main.ts` 配置 `input: { gamepad: true }` 启用插件。`GridScene.update()`/`MenuScene.update()` 每帧轮询首只手柄：全部动作先过 `currentGamepadEnabled()` 门，无设备时重置边沿并早退（键盘零影响）；探索中 D-pad/摇杆边沿→`tryMove` 单步移动、A→交互、B→暂停；暂停菜单打开时边沿改交 `PauseMenuPanel.handleGamepadEdges`（上下选行/左右调设置/A 确认/B 返回），与键盘契约逐条对齐。`bindMovementKeys` 八键保持绑定、处理函数按下时按 `currentMovementLayout()` 门控（免重绑、暂停菜单改完下一键即生效）；HUD 首行与操作手册（`controls-ui.ts`）的移动说明随布局更新，操作手册另显示手柄开关状态。
- **减少动态贯穿**：`tryMove` 在 `currentReducedMotion()` 时瞬移并同步执行完成回调（`moving` 解锁、伙伴跟随、区域事件、热重载安全边界全部保留，抽取 `finishMove` 供补间/直设两路复用）；`updateDaylight`/`updateClimatePresentation` 的 600 ms 渐变、`syncNpcVisuals` 的 420 ms 补间均加"animate 且未开减少动态"分支；降水粒子不生成。新增暂停设置页 `onSettingsChanged` 同步：开启时当帧停止已有昼夜/天气补间、写入目标透明度并销毁既有粒子；关闭时按当前天气即时恢复降水表现，不必等下一日切换。伙伴跟随本就直接定位（无补间），行为一致。
- **测试（42 用例）**：`tests/settings.test.ts` 21 例（v1 迁移含"旧存储字节不动"、六字段往返、新字段无效整载荷拒绝、Round 09 字段越界/JSON 损坏/非对象回退、未知字段忽略、写拒绝会话内仍生效、读抛错降级、mock game 断言音量 0.8/滤镜开/关/无效载荷不动外观、`{sound:null}`/`{}`/仅 canvas 替身不崩、五档单调与 `uiFontSize` 最小 8px、共享行 6 行与调整钳制/循环/取反/越界原引用）；`tests/input-settings.test.ts` 21 例（布局解析与三档键集、逐键启用、帮助文本、死区内/主导轴/对角水平优先/自定义死区/NaN+Infinity、D-pad 优先与对向消解、静默时摇杆兜底、采样映射、边沿六组语义含 reset 与方向按钮独立性）。首跑 2 例失败并修正：其一为源码真实边界（`sound` undefined 判空漏网，修源码）；其二为断言误解（首次 `applyGameSettings` 即同步清空滤镜为 `''`，修正断言并顺带把"无效载荷不动外观"的断言写得更强——带上 `highContrast:true` 的无效载荷不得落地滤镜）。
- 文档：新增 `docs/ACCESSIBILITY.md`（六项设置作用范围、手柄映射与浏览器设备发现限制、画布级滤镜≠WCAG 逐元素审计、减少动态逐项对照）；`docs/REFERENCES.md` 登记 Phaser Gamepad/GamepadPlugin 官方 API（#17/#18，编号说明 #6–#15 → #6–#18）；README 进度至 R41/用例数 105/文档索引；`docs/TESTING.md` 覆盖表两行与变更记录。

### 验证（本机实际命令与结果）

- 环境：Windows 11 Home（10.0.26200）、Node v22.18.0（win32 x64）、Vitest 5.0.2、Vite 8.3.1。
- `npm run typecheck`：首轮通过（全部场景接入后零错误）。
- `npm test`：**7 文件 105 用例全部通过**（63 旧 + 42 新；新文件首轮 40/42，修 2 例后全绿）。
- `npm run check`：**exit 0**（26 资源校验、0 MOD 问题、typecheck、Vitest 7 文件 105 用例、audit:round-34 文档一致性审计通过）。
- `npm run build`：**exit 0**（Round 41 收尾复跑后的完整 check 先行；主 JS 1,887.10 kB / gzip 497.63 kB，较 R40 的 1,882.01 kB 增 5.09 kB；500 kB 分包建议仍为非阻断提示）。
- 烟测：`smoke:round-20`/`30`/`33`/`35`/`36`/`37` 全部 **exit 0**。
- **浏览器烟测（生产构建 + `npx vite preview`（4273 端口；4173 被本机残留进程占用）+ Playwright 键盘路径）**，要点与证据：
  - 主菜单设置页 6 行：ArrowDown×4 聚焦高对比度行 → ArrowRight，`canvas.style.filter` 当帧变为 `contrast(1.4) saturate(1.25)`，localStorage 写入完整六字段载荷 `{"volume":8,"textScaleIndex":1,"movementLayout":"both","gamepadEnabled":true,"highContrast":true,"reducedMotion":false}`；
  - 刷新页面后启动路径自动恢复滤镜（`loadGameSettings → applyGameSettings` 跨启动保留实证）；
  - 暂停菜单设置页 6 行（Esc → ↓×2 → Enter → ↓×5 → →）：`reducedMotion:true` 成功写入，证明两处设置页同源；
  - 移动布局端到端：主菜单将 `movementLayout` 切至 `wasd`、`textScaleIndex` 切至 2 后进游戏——按 ArrowUp 画面零变化（MD5 相同）、按 W 画面变化（MD5 变化且 `w:87` 按键由页面监听日志核验到达），布局门控免重绑即时生效实证；
  - 减少动态行为：开启后玩家移动仍发生（截图哈希变化）；等待 6 秒后连拍两帧 MD5 完全一致（无粒子/补间残留的静止画面）；
  - 排查记录：初判"wasd 下 W 不动"为烟测交互时序踩空（Esc 逐级返回 + 主菜单 3 项循环导致实际停在设置/存档页，菜单选行同样改变画面），以 reload 干净状态 + 按键到达日志 + 双向对照（方向键禁用/W 生效）重新取证后闭环；期间确认 canvas 为 WebGL 上下文，`toDataURL` 指纹法不适用（无 preserveDrawingBuffer），改用 Playwright 合成器级截图对比。
  - 控制台全程无新增错误（仅既有 favicon 404 与 R32 锻造配方可选警告）。
- `git diff --check`：通过（仅 LF→CRLF 换行提示）。

### 未实现/限制

- **物理手柄硬件未测试**：本机无控制器。方向解析、死区、边沿与菜单路由逻辑由单元测试覆盖；浏览器内手柄端到端未验证。浏览器"须先按手柄按钮才开放设备/可能要求 HTTPS"的行为以 `docs/ACCESSIBILITY.md` 说明，不声称做过硬件验证。
- **高对比度边界**：画布级 CSS 滤镜作用于整张渲染画面，不等同 WCAG 逐元素色彩审计（未做对比度比值计算与认证）；已在 `docs/ACCESSIBILITY.md` 与计划风险中如实标注，正式无障碍合规结论留给后续验收轮次。
- **设置页布局按 1.6 档校验**：更大字号需求（如 2.0+）未提供——当前 960×540 画布与面板行距下更大档会与反馈/提示行冲突；`TEXT_SCALE_STEPS` 为常量数组，后续轮次可按需评估。
- 烟测中重申的既有非本轮问题：R32 锻造配方 `forge.recipe.r32-marsh-amber-seal` 运行时语义校验禁用的 HUD 聚合通知（R40 已记录，未处理）。

---

## Round 40 — 地图渲染 O(1) 对象与可重复性能/内存基准（2026-09-28，已完成）

### 计划与实现

- 先写 `iterations/round-40/plan.md`，子任务为：先基线（tile-per-rectangle 渲染器、真实数据加载、50 轮长跑）→ 单 Graphics 重写与结构回归测试 → 复测、门槛、烟测、生产构建与文档。计划书所写"32×24 实图尺寸"与实际不符（仓库真实地图为 16×9 两张），基准按计划意图改为"16×9 真实实图 + 32×24/64×48/128×96 确定性合成图"，已在文档注明。
- **基准基建**：`tests/performance-round-40.bench.ts` + `vitest.config.ts` 新增 `benchmark.include`（只匹配 `tests/` 下 `*.bench.ts`）+ `package.json` 新增 `benchmark:round-40`。落地过程中实证了两个 Vitest 5 事实并按官方指南处置：① `bench` 不再是 `'vitest'` 顶层导出（导入即 `bench is not a function`），官方迁移指南确认 v5 改为 `test()` 回调的 bench fixture，CLI `vitest bench` 仍在；② worker 线程不继承主进程 `--expose-gc`（`globalThis.gc` undefined），改由入口脚本以 `NODE_OPTIONS=--expose-gc` 环境变量传递（实证 worker 内 gc 变为 function）。另实测 async 任务的 tinybench `period` 严重失真（~150 ms 的加载报为 150,532 ms/op），加载与长跑改为显式 wall-clock 自计时；控制台告警提示模块 export-getter 开销，配置 `suppressExportGetterWarnings` 仅静默重复告警、开销如实记录（Vitest 口径 128×96 约 4.8–6.0 s/op，同一代码 Vite 打包后裸 Node 约 3.7–4.2 ms/render——放大约三个数量级），据此新增裸 Node 通道 `scripts/benchmark-round-40-bare.mjs`（Vite `build.ssr` API 打包真实渲染器；初稿用 esbuild 但其不在依赖树内，npx 为临时下载，弃用改以直接依赖 Vite）。基准对旧渲染器的采集经 `vi.mock('phaser')` 实现（重写后渲染器零运行时导入，mock 移除）。
- **渲染器重写**：`renderGridMap` 由每格 3 个 Rectangle（底色+顶部亮边+右缘暗边）改为纯函数 `buildGridMapDrawCommands`（每格 4 条命令，颜色解析与 ±18/−20 明暗派生按颜色字符串缓存）+ 单 Graphics 烘焙（连续相同样式去重），连同 Graphics 装入返回 Container（签名与 `mapLayer?.destroy()` 销毁语义不变）；`cellCenterOffset` 返回普通 `{ x, y }`（13 处调用均只读 x/y，`tsc` 证实等价）；模块 `import type Phaser` 后零运行时依赖——旧渲染器在 Node 进程因 Phaser 顶层引用 `window` 直接崩，新实现因此获得纯 Node 可测/可基准能力。初稿两处小修：块注释内 `**/` 提前终止注释（vitest.config.ts 与 bench 文件各一处 PARSE_ERROR）；TS 对 `lastFill?.color !== c || lastFill.alpha` 的收窄失败，改为显式 `lastFill === null ||` 判空。
- **结构回归测试**：`tests/grid-map-renderer.test.ts` 10 用例——每格恰 4 命令、单格几何/颜色/alpha/顺序精确断言（含 shadeColor 手算期望值 0x464e5f/0x202839）、行列偏移、绘制范围=地图像素尺寸、同 tileType 颜色一致、O(1) 对象（16×9 与 64×36 均恒 2）、Graphics 挂在返回容器内（销毁级联）、绘制调用数=命令数与 lineStyle 全图一次、cellCenterOffset。
- 文档：新增 `docs/PERFORMANCE.md`（命令构成、测量内容、方法边界五条、R40 前后读数与环境）；README 进度至 R40/命令区/目录/用例数 63；`docs/TESTING.md` 新增基准隔离章节与三表更新；`docs/REFERENCES.md` 登记 Vitest 官方基准与迁移指南（#16）。

### 验证（本机实际命令与结果）

- 环境：Windows 11 Home（10.0.26200）、Node v22.18.0（win32 x64）、Intel Core Ultra 5 225H（14 核）、Vitest 5.0.2、Vite 8.3.1。
- **基线（重写前，同一命令）**：`npm run benchmark:round-40` exit 0——对象数 16×9=433 / 32×24=2,305 / 64×48=9,217 / 128×96=36,865（1 容器 + 3×格数矩形）；Vitest 口径 19.1 / 121.5 / 951.5 / 5,664.7 ms/op；loadGameData 20 轮平均 162.49 ms（min 118.29 / max 372.58）；50 轮长跑每轮 26 资源 0 诊断、平均 146.17 ms/轮、GC 后堆 18.79 → 20.07 MiB（+1,306.5 KiB）。
- **重写后复测（两次运行）**：对象数全部恒 2（含 12,288 格图）；Vitest 口径 18.1–18.9 / 93.8–99.6 / 885.6–1,032.3 / 4,800.0–5,966.2 ms/op（运行间噪声内，较基线持平至略降）；裸 Node 口径 0.103 / 0.122 / 0.801 / 4.174 ms/render（0.16–0.72 µs/格）；loadGameData 20 轮平均 156.45–181.12 ms（与基线同量级，渲染重写不触及加载管线）；50 轮长跑每轮 26 资源 0 诊断、平均 127.01–144.28 ms/轮、GC 后堆差值 +1,289.6/+2,153.7/+3,382.2 KiB（波动无累积趋势）。
- `npm run check`：**exit 0**（26 资源校验、0 MOD 问题、typecheck、Vitest 5 文件 63 用例、audit:round-34）。
- `npm run build`：**exit 0**（完整 check 先行；130 modules、约 0.8 s，主 JS 1,882.01 kB / gzip 495.80 kB，与 R39 的 1,881.37 kB 基本一致；500 kB 分包建议仍为非阻断提示）。
- 烟测：`smoke:round-20`（擂台/占格）、`smoke:round-30`（人物与门派）、`smoke:round-33`（图谱全量真实映射含 2 地图）、`smoke:round-35/36/37`（CI 三条）全部 **exit 0**。
- **浏览器烟测（生产构建 + `npx vite preview` + Playwright）**：主菜单 → 创建角色（Enter 默认模板）→ 进入「方格试炼场」——网格瓦片、格线、顶部亮边/右缘暗边、玩家小人、NPC/敌人/HUD 均正常；ArrowRight×7 走到 (14,7) 关口「石阶渡口」切换「雾渡口」（`mapLayer.destroy()` + 单 Graphics 重建路径），画面完整、无上一图残影、水面瓦片正常；经「回望石阶」返回「方格试炼场」后玩家可继续移动（ArrowLeft 至 (12,7)）。控制台全程无新增错误（仅既有 favicon 404 与 R32 锻造配方 `forge.recipe.r32-marsh-amber-seal` 的可选资源警告；HUD 顶部「部分可选资料无效」聚合通知为 `buildHud` 对 optionalWarnings 的既有显示逻辑，与渲染改动无关）。
- `git diff --check`：通过（仅换行提示）。

### 未实现/限制

- **基准边界**：渲染基准用 recording scene 替身，不含真实 Phaser 构造与 GPU 光栅化；Vitest 口径绝对值被模块 runner export-getter 开销放大约三个数量级（只用于同口径运行间对比，真实数量级以裸 Node 通道为准）；async 任务 tinybench period 失真已绕开（wall-clock 自计时）；堆差值非泄漏证明。全部已在 `docs/PERFORMANCE.md` §方法边界成文。
- **旧渲染器无裸 Node 读数**：其顶层运行时导入 Phaser 使 Node 进程直接崩（`window is not defined`），"优化前"时间只能在 Vitest 口径 + mock 场景下取得；对象数对比不受影响（结构性）。
- 基准未进 CI/`check` 门槛（快照式读数不适合作阈值），CI 仍为 R39 的 build + R35–37 烟测。
- 烟测中观察到的既有非本轮问题：R32 锻造配方 `forge.recipe.r32-marsh-amber-seal`（琥珀嵌扣）在运行时语义校验中被禁用（结果装备须同槽且不降低基础装备任何加成），触发 HUD 聚合通知与一条 console 警告——属数据/语义既有状态，本轮未处理。

---

## Round 39 — 统一质量门槛与 GitHub Actions 持续集成（2026-09-28，已完成）

### 计划与实现

- 先写 `iterations/round-39/plan.md`，子任务为：编排 `check`/`build` 脚本并核对失败中止、GitHub Actions 工作流、文档/日志更新与本机验证。
- `package.json` 新增 `"check": "npm run validate:data && npm run inspect:mods && npm run typecheck && npm test && npm run audit:round-34"`；`build` 由 `tsc --noEmit && vite build` 改为 `npm run check && vite build`（类型检查已在 check 内，不重复跑）。`&&` 链在 npm 于 Windows（cmd.exe）与 POSIX（sh）下的执行语义一致：任一子命令非零退出即中止后续。
- 新增 `.github/workflows/quality-gates.yml`：触发 `push`/`pull_request`/`workflow_dispatch`；`permissions: contents: read`；单 job `ubuntu-latest`、`timeout-minutes: 15`；步骤为 `actions/checkout@v7` → `actions/setup-node@v7`（`node-version: 22`、`cache: npm`）→ `npm ci` → `npm run build`（含完整 check 门槛与 Vite 生产构建）→ `smoke:round-35`/`36`/`37`。无部署/发布/上传 artifact 步骤。注释为英文（与 scripts/ 现有 JSDoc 风格一致）；初稿误用 JS 块注释 `/** */` 写 YAML 头注，当即改为 `#`。
- 文档更新：README 修正过期进度（原标 Round 36 已完成/R37 进行中、Vitest `^4.1.11`「后续」）为 R39 完成态、下一轮 R40、Vitest `^5.0.2`，命令区补 `check`/`test` 并改写 `build` 描述，新增「持续集成（Round 39 起）」小节，目录结构补 `tests/`；`docs/TESTING.md` 新增「质量门槛、构建与持续集成（Round 39 起）」章节（五步顺序、build 行为、CI 同源关系）并扩「与既有验证手段的关系」表；`docs/REFERENCES.md` 官方技术来源扩至 #14（GitHub Actions 文档：触发事件/权限/超时/缓存语法）与 #15（actions/checkout、actions/setup-node 官方仓库，`@v7`）。引擎运行时代码、`data/`、`mods/` 零改动。

### 验证（本机实际命令与结果）

- `npm run check`：**exit 0**。五步全绿——validate:data（manifest + 26 个基础资源 Schema）、inspect:mods（26 项资源、0 问题、未启用 MOD）、typecheck（无输出）、Vitest（4 文件 53 用例，960 ms）、audit:round-34（文档一致性审计通过）。
- **构建失败中止路径实证**：在 `tests/` 放入类型正确的临时必败测试 `tmp-round39-gate-failure.test.ts`（`expect(1).toBe(2)`）后运行 `npm run build`——资料校验、MOD 检查、typecheck 均先通过；Vitest 报 53 通过/1 失败，整体 **exit 1**，输出未出现 Vite 的生产构建启动行；临时探针即删，`tests/` 恢复 4 个原文件。这验证构建门槛失败会中止打包。
- `npm run build`：**exit 0**。输出顺序证明门槛先行——check 五步（audit 最后）→ `vite v8.3.1 building client environment for production...` → 130 modules、约 1.01 s；主 JS 1,881.37 kB / gzip 495.56 kB（与 R36–R38 基线一致）；500 kB 分包建议仍存在（非阻断，本轮不改变运行时打包策略）。
- `npm run smoke:round-35`：**exit 0**（双 MOD 覆盖/坏覆盖回退/来源归因/真实 manifest enabledMods 为空）。`npm run smoke:round-36`：**exit 0**（真实 Vite dev server WebSocket 级验证、生产剔除热重载桥接、被触碰文件恢复原状）。`npm run smoke:round-37`：**exit 0**（内容包往返/攻击性输入/真实 CLI 全链路，真实 `mods/` 与 manifest 字节不变）。
- `git diff --check`：**exit 0**；仅 Git 对 README.md、data/base/manifest.json（烟测触碰后内容未变）、docs/REFERENCES.md、docs/TESTING.md、package.json 的 LF→CRLF 换行提示，无空白错误。工作区改动仅限本轮文件（package.json、README、docs/TESTING.md、docs/REFERENCES.md、新增 .github/），`.serena/` 未触碰。
- 工作流结构验证：使用系统预装 PyYAML 对 `.github/workflows/quality-gates.yml` 执行 `yaml.safe_load` 并断言 push/PR/手动触发、只读权限、checkout/setup-node@v7、`npm ci` 与 `npm run build` 步骤；解析与结构断言通过。工作流有 7 个步骤，其中 5 个执行命令（安装、build、三轮烟测）。

### 未实现/限制

- **GitHub 托管 Actions 无法在本机调度**：以上均为本机验证的同一组命令；workflow 首次真实运行需推送后到 GitHub Actions 页面确认（含 `actions/checkout@v7`、`actions/setup-node@v7` 在托管环境的确切可用性）。本轮不声称发生过托管 CI 运行。
- `inspect:mods` 覆盖边界保持不变：仅校验 manifest 中启用的 MOD 层，不审计未启用目录（已在 TESTING.md 与 CHANGELOG 中如实说明）。

---

## Round 38 — Vitest 测试基线：引擎单元与共享数据校验（2026-09-28，已完成）

### 计划与实现

- 先写 `iterations/round-38/plan.md`，子任务为：Vitest 依赖/配置/脚本与类型检查范围、纯引擎模块与数据校验器正反向单元测试、验证与文档。
- `npm install -D vitest` 解析为 **Vitest 5.0.2**；重新核对官方指南要求 Vite >=6.4、Node >=22.12，registry peer/engine 范围覆盖仓库 Vite 8.3.1、Node 22.18、`@types/node` 26.6.3。ADR-0005 从 Round 00 计划的 4.x 修订为 5.0.2，框架仍是 Vitest；`docs/REFERENCES.md` 登记官方指南和精确 registry 版本/许可。`package.json` 新增 `"test": "vitest run"`。
- 新增独立 `vitest.config.ts`（Node 环境、`include: tests/**/*.test.ts`）。关键取舍：仓库 `vite.config.ts` 是异步工厂，会动态加载 `scripts/data-hmr-plugin.mjs` 并注册 `mods/` dev 中间件；Vitest 在 `vitest.config.ts` 与 `vite.config.ts` 并存时只读前者、完全不加载应用配置，测试进程零 dev-server 副作用。
- `tsconfig.json` include 由 `["src", "vite.config.ts"]` 扩为 `["src", "tests", "vite.config.ts", "vitest.config.ts"]`，测试与测试配置接受同等严格检查（`noUncheckedIndexedAccess` 等全部生效）。
- 校验器抽取：`scripts/validate-data.mjs` 原先在模块顶层 `await` + `assert` 直接执行，不可安全导入。新增 `scripts/lib/data-validation.mjs` 导出 `validateBaseData(root)`（Ajv allErrors、按 schema id 复用编译结果；成功 `{ ok: true, validated }`，失败 `{ ok: false, problems }`；文件读写、JSON 解析、Schema 编译错误均折叠为 problem，全程不打印不抛错；有效 JSON `null` 仍照常送入 Schema 校验）。`validate-data.mjs` 变薄 CLI：成功行与历史逐字节一致（`通过：manifest Schema 与 26 个基础资源 Schema。`），失败逐条 problem 到 stderr 并 `process.exitCode = 1`（保留非零退出语义）。新增 `scripts/lib/data-validation.d.mts` 类型声明，TS 测试直接导入同一实现。
- 新增四组测试（只调公共 API、断言行为，无 Phaser/DOM/网络/真实时钟）：
  - `tests/event-bus.test.ts`：订阅/退订/`off` 身份与幂等、`once` 一次投递与 `off` 取消、once 重入（handler 内重发自身事件：自身不再触发、新订阅者收到重入投递）、emit 快照迭代（投递中新增订阅不收当次）、`clear` 通道/全部与 `listenerCount`。
  - `tests/dialogue.test.ts`：`parseDialogueSet` 合法/坏信封整份拒绝/单段坏对话隔离/未知条件 kind 拒绝；`validateConversation` 重复节点、缺起始节点、悬空目标；`isConditionMet`（questStatus 精确匹配、itemCount 无背包防御与数量边界、道德区间端点含入、timeOfDay、npcKnows 默认说话人且可被教授、knowledgeKnown）；`getVisibleOptions`（无条件恒可见、多条件全满足、index 指原始数组、全滤空=结束节点）；`DialogueSession` 走到终点/reset/越界与悬空 choose 忽略。运行时上下文 fixture 以真实 `createQuestJournal`/`createSocialState`/`createFactionMembershipState` 构造。
  - `tests/quest-system.test.ts`：`parseQuestSet` 合法/缺字段（分项+汇总两条错误）/坏信封；`assembleQuests` 全通过、坏发布人剔除并点名、前置循环双禁用、互斥组同前置保留/单成员整组禁用、null 装配空结果；生命周期（无前置 offered/有前置 locked、接受激活并追踪、unknown/not-offered 拒绝与重复接取拒绝、npc-talk 完成结算奖励并解锁后续、后续信号不再影响已完成任务、item-count 绝对数量同步并按 requiredCount 钳制（1→进行中、5→一步完成）、接取时背包快照 7 株即时完成、encounter-defeat 命中 failOn 失败并清追踪、abandon 终态与 not-active/unknown 拒绝、互斥分支接取连带失败兄弟）。
  - `tests/data-validation.test.ts`：真实仓库全量正向（`validated` === manifest resources 计数）；五例反向 fixture（资源违反 Schema、manifest `resources: []` 违反 minItems、资源文件缺失、Ajv 无法编译的 Schema、JSON `null` 数据必须被 Schema 拒绝）；另将 CLI 与共享模块复制到临时 root，启动真实 Node 子进程确认失败输出可读且退出码为 1。fixture 用 `mkdtemp`，`afterEach` 递归清理，tracked `data/` 零改动。
- 新增 `docs/TESTING.md`（命令、独立配置原因、覆盖矩阵、CLI/测试同源说明、编写约定、与其他验证手段的关系）。
- 新增 `.vitest/` 到 `.gitignore`，避免测试工具后续生成的本地缓存进入版本控制。

### 验证

- `npm test`：**4 文件 / 53 用例全部通过**（event-bus 10、dialogue 18、quest-system 18、data-validation 7）。
- 首跑暴露并修复三处测试自身问题（非引擎缺陷）：
  1. quest 测试对 `assembleQuests` 解构结果误写 `quests.quests`（`quests` 已是 Map）导致 11 个用例 TypeError——统一改引用；
  2. 缺失文件 fixture 未携带 quest-set Schema，校验器先报 Schema ENOENT 而非目标资源缺失——fixture 补 Schema 以到达目标失败路径（顺带确认了"先 schema 后资源"的读取顺序是实际行为）；
  3. `parseQuestSet` 缺字段实际产出"分项+汇总"两条错误，断言由 `toHaveLength(1)` 改为拼接检查关键字。
- `npm run typecheck`：首跑报 1 处测试类型错误（`validDocument` 字面量缺少上下文类型致条件判别联合不匹配），补显式 `DialogueSetData` 注解后通过（无输出）。
- `npm run validate:data`：通过，成功行与重构前逐字节一致。
- `npm run smoke:round-37`：通过（exit 0，内容包导出/预检/安装回归，真实 `mods/` 与 manifest 字节不变）。
- `npm run build`：通过，TypeScript 检查及 Vite 生产构建成功（130 modules）；JS bundle 1,881.37 kB / gzip 495.56 kB，Vite 保留既有超过默认 500 kB 的非阻断分包建议。
- `git diff --check`：通过（exit 0；仅 Git 对 package.json/package-lock.json/scripts/validate-data.mjs/tsconfig.json 的 LF→CRLF 换行提示，无空白错误）。
- 独立复核时发现并补齐两个缺口：Ajv 对结构无效但 JSON 合法的 Schema 会抛异常，现转为可读 problem；合法 JSON `null` 曾与文件读取失败哨兵混淆，现使用独立 `Symbol` 哨兵并测试。另新增真实 CLI 临时副本子进程测试，明确锁定错误输出与 exit code 1。

### 未实现/限制

- 测试基线聚焦纯引擎规则与数据校验；Phaser 场景/UI 层仍由各轮专项烟测脚本覆盖，未引入 jsdom/浏览器环境。
- 尚未接入 CI（Round 39 规划构建期校验与质量门槛时一并考虑）。

---

## Round 37 — 单文件 v1 内容包：导出、只读预检与显式安装（2026-09-28，已完成）

### 计划与实现

- 先写 `iterations/round-37/plan.md`，子任务为：包格式 Schema 与确定性摘要、预检/显式安装 CLI、往返与攻击性输入专项烟测与文档。
- 新增 `data/schema/content-package.schema.json`（draft-07）：约束 `formatVersion`（integer ≥1，语义上仅支持 1，未来值由导入端给出可读拒绝）、包元数据（id 安全单一目录名 pattern、严格三段版本 pattern）、`minimumEngineVersion`（严格三段数字 pattern）与资源条目（id + 64 位小写 hex `sha256` + 任意 `data`；`additionalProperties: false` 使包内无处夹带 `path` 等字段）。
- 新增 `scripts/content-package.mjs`（可导入函数 + CLI）：
  - 规范 JSON：对象键递归排序（UTF-16 码元序）、`JSON.stringify` 紧凑语义、UTF-8 编码；`sha256OfJson` 与源文件排版无关。
  - 导出 `buildModPackage`：只读取 MOD 目录中与 manifest 登记路径一致的 JSON，逐项资源 schema 校验并验证包自身 Schema 后按 manifest 顺序产出资源；孤儿文件、坏 JSON、Schema 不符、不安全 MOD/包 id、非三段版本逐条点名；`serializePackage` 对同一输入字节级确定；超限包和已有输出路径拒绝。默认包 id/名 = modId、版本 1.0.0、`minimumEngineVersion` = `--repo` 指向仓库 `package.json` 中的 version。
  - 预检 `inspectPackage`：包大小上限为 10 MiB，并在常规读入前先查文件长度；包 JSON 与包 Schema 校验后拒绝未知/未来格式、宽松或超安全整数版本，以及不兼容目标引擎版本；资源 id 必须唯一且在目标仓库 manifest 登记，安装位置只能取自登记的安全 JSON 路径；逐项重算 SHA-256 并按目标仓库当前 Schema 校验。报告注明诊断、修复提示与跨资源语义校验边界。
  - 安装 `applyPackage`：先整包预检（任一失败零写入）；随后写入 `mods/.staging-<pid>-<rand>` 同盘暂存目录（每资源落盘前断言目标在暂存目录内），**写完后**检查 `mods/<包id>/` 不存在——已存在则删除暂存并拒绝（顺带验证清理路径），再 `rename` 原子改名；rename/写盘异常同样清理暂存。不改 manifest、不启用、不覆盖。
  - CLI：`export --mod … [--id/--name/--version/--description/--author/--out/--repo]`、`import <file> [--repo] [--apply]`，中文报告 + 非零退出；`--repo` 支持指向任意仓库副本。
- `package.json` 新增 `content:export`、`content:import`、`smoke:round-37`；无新增依赖（复用 Ajv 与 Node 内置 crypto/fs）。

### 验证

- `npm run smoke:round-37`：一次通过（exit 0）。隔离临时仓库（mkdtemp，自带最小 manifest + 复制真实 manifest/grid-map/content-package schema + 传统 MOD 目录）覆盖：规范 JSON 单元（递归键序、数组序保持、排版无关、中文键、`__proto__` 键保真）与严格三段版本单元（拒绝超安全整数；兼容性按 `--repo` 目标引擎判断）；导出（manifest 序资源、`sha256OfJson` 比对、无 path 字段、重复导出字节一致）；预检往返（id→本地路径映射、内存对象等价、默认零写入）；应用（安装数据语义相等、manifest/基础资源字节未变、enabledMods 仍空、无暂存残留）；重复应用被拒且无暂存残留；篡改数据校验和失败、坏 schema（重算校验和后仍拒）、重复/未登记资源、重复 manifest 路径、`../evil`/`a/b`/`.hidden` 包 id、资源夹带 `path` 字段、`formatVersion 99`、引擎 `99.0.0`、宽松 `1.2`、包版本超安全整数、大小上限注入逐项可读拒绝；导出侧目录缺失/孤儿文件/坏 JSON/坏 Schema/不安全 mod id/超过包体限额/输出文件冲突诊断；真实 CLI（execFile + process.execPath）导出-预检-应用-冲突退出码-用法错误全链路；结尾断言真实 `mods/` 树与 `data/base/manifest.json` 字节不变，临时仓库删除。
- 真实工作区未写入：烟测末尾逐字节比较真实 `mods/` 树与 manifest；本轮没有对正式 MOD 做应用操作。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过（manifest + 26 个基础资源 Schema）。`npm run inspect:mods`：通过（26 项资源、0 问题、未启用 MOD）。`npm run typecheck`：通过（无输出）。
- `npm run build`：通过（Vite 8.3.1，主 JS 1,881.37 kB / gzip 495.56 kB，与 R36 基线一致；500 kB 分包建议仍存在）。`git diff --check`：通过；Git 对部分文本的 LF→CRLF 提示没有空白错误。
- 边界记录：预检是静态 JSON/schema/兼容性检查，跨资源语义装配仍由运行时加载器执行；导入不管理下载/更新/卸载，安装出的目录按普通 MOD 工作流处理。本轮未改任何运行时引擎代码。

---

## Round 36 — 开发模式资料热重载（2026-09-27，已完成）

### 计划与实现

- 先写 `iterations/round-36/plan.md`，计划分四项可验证子任务：Vite 文件事件、安全过滤；客户端批量桥接与菜单刷新；游戏快照预检与运行态重建；专项验证、文档和提交。
- 新增 `scripts/data-hmr-plugin.mjs`，按 Vite 8 Environment API `hotUpdate` 接收 JSON 文件 add/update/delete；只转发根目录内 `data/`、`mods/` JSON，发送 `wuxia:data-change` 并返回 `[]` 阻止默认模块传播/整页刷新。新增类型化事件 `src/vite-env.d.ts`，插件安装在 `vite.config.ts` 且 `apply: 'serve'`。
- 新增 `src/game/data-hot-reload.ts`：开发态订阅、80 ms 同文件去重/末次状态合并；退订时清除定时器和 HMR listener。生产构建中事件名、HMR 上下文及桥接导出均不进入 JS bundle。
- `MenuScene` 收到通知后重读共享 `loadWorldData`，刷新当前页所依赖的角色模板；重载过程中键盘输入关闭，文件更新排队后再跑，初始加载期间发生的更新在首次装配后补跑；SHUTDOWN 取消待处理结果并退订。
- `GridScene` 收到通知后先排队，待无移动/战斗/面板时关闭全部场景输入；用共享快照捕获器取得内存 `SaveSnapshotV1`（不写任何用户槽），完整重读和组装 manifest，再由 `planSnapshotRestore` 预检，通过后走共用 `restoreRunState` 恢复。跨资源内容变化时重新装配全世界以保持引用闭合；进行中的二次编辑和初始加载期间的编辑都会触发后续重载。失败时只显示提示并记录诊断，旧世界与运行状态不替换。
- 补全 `README.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/REFERENCES.md`、CHANGELOG 和路线图。Vite 的 `hotUpdate`/客户端自定义事件 API 来源记入 `REFERENCES.md` #13；不添加运行时依赖，不改 `data/`、`mods/` 内容。

### 验证

- `npm run smoke:round-36`：通过（exit 0）。安全路径分类覆盖 data/schema/MOD JSON、源码、非 JSON、点目录、越界与 slash-normalized 路径；fake Environment 验证更新/新增/删除自定义事件及空模块列表；客户端 HMR bridge 验证 80 ms 批次、同文件末次状态、退订和待发批次取消、生产 no-op。随后以真实 Vite dev server 和 WebSocket 改写相同字节的 manifest、临时创建/删除 MOD JSON、创建/删除非 JSON，确认 data 修改与 MOD 增删事件正确、全程无 `full-reload`；临时生产构建确认无 HMR event/`import.meta.hot` 字符串且 `data/base/manifest.json` 正常发布。临时 fixture/探针均清理。
- 初次烟测前序运行通过，但生产剔除检查之后一条源码断言假设 `subscribeDataChanges` 必须与 DEV 判断处在同一行，和实际多行格式不符而失败；将断言改为跨行结构匹配后完整复跑，最终 exit 0。
- `npm run typecheck`：通过（`tsc --noEmit` 无输出）。`npm run validate:data`：通过（manifest + 26 个基础资源 Schema）。`npm run inspect:mods`：通过（26 项资源、0 问题、真实 manifest 未启用 MOD）。
- `npm run build`：通过（Vite 8.3.1，130 modules，771 ms）；主 JS 1,881.37 kB / gzip 495.56 kB。Vite 默认 500 kB 分包建议仍存在。
- 回归 `npm run smoke:round-30`、`smoke:round-31`、`smoke:round-33`、`smoke:round-35` 与 `npm run audit:round-34`：全部 exit 0；R30 单独运行通过。
- `git diff --check`：通过。Round 36 实际浏览器内 UI/移动后热重载和存档兼容恢复未手动演练；已通过真实 Vite HMR WebSocket 级验证与引擎现有保存/恢复通路的类型、回归检查。

### 未实现/限制

- 每次资料变化当前重新读取并装配整个 manifest 世界，未做单个 schema 家族的增量缓存；该选择保证跨资源引用一致，26 项基础资源下成本可接受。
- 开发热重载只适用于 `npm run dev`；production/preview 不包含热重载桥接。

---

## Round 35 — MOD 优先级、来源追踪与作者工作流（2026-09-27，已完成）

### 计划与实现

- 先读取 `iterations/round-35/plan.md`：本轮把同路径 JSON 覆盖补成可检查、可解释、易排错的 MOD 工作流；不改基础游戏内容、不动存档协议；全程未触碰未跟踪的 `.serena/`，未改 `data/`、`mods/` 任何文件（`git diff --stat data/ mods/` 为空）。
- `src/engine/data-loader.ts`：`Diagnostic` 与 `data:resource-error` 事件新增可选 `path`（问题文件 URL）与 `hint`（修复建议）；`LoadedResource` 新增 manifest 相对 `path`；`DataLoadResult` 新增 `enabledMods`（manifest 失败时为 `[]`）。所有失败分支补齐定位与提示：覆盖 schema 不符/语义失败（指向 `mods/<modId>/<path>` 与对应 schema、给出移除该 MOD 的备选）、JSON 语法错误（提示用 JSON 校验器定位）、SPA fallback、manifest 缺失/不符/不安全路径。覆盖语义未动：仍按 `enabledMods` 顺序逐层校验，有效后层替换、坏层 `continue` 保留上一有效值。
- `src/game/world-loader.ts`：新增 `LoadedResourceSource`（id/path/schema/source）；`LoadedWorld` 新增 `enabledMods`、`resourceSources`（`[...result.resources.values()]` 按 manifest 顺序投影）与 `modDiagnostics`。新增 Phaser-free `src/engine/mod-diagnostics.ts`：保留加载器的坏覆盖诊断，并将后续装配阶段资源级警告按该资源最终有效来源归因到 MOD，补上覆盖文件相对路径与修复提示；基础来源警告不误标为 MOD。HUD 提示从完整 MOD 诊断集派生。
- 新增 `src/game/mod-status-ui.ts`（`ModStatusPanel`，参照 `EncyclopediaPanel` 的绑定/清理模式）：三页（生效顺序/资源来源/MOD 诊断），←/→ 或 A/D 翻页、↑/↓ 或 W/S 选行、F2/Esc 关闭；850×468 面板居中于 960×540 画布，左列表 10 行窗口滚动 + 右详情；空状态文案覆盖"未启用 MOD / 无资源 / 无诊断"三种情况。`GridScene` 接线：`F2` 键、`toggleModStatus`（`anyOverlayOpen` 互斥、`onClose → noteOverlayClosed`）、`bindMovementKeys` 的解绑与 SHUTDOWN 销毁清单；H 帮助面板键位表、HUD 首行与 MOD 回退提示行加入 F2 入口。自审查时移除面板内部对 F2 的重复监听，避免与场景全局切换键在同一事件内双重开关；面板 Esc 仍可关闭，F2 由全局切换器开/关并在关闭时释放 capture。
- 新增 `scripts/inspect-mods.mjs` 与 `npm run inspect:mods`：导出 `inspectMods(root)` + CLI 双形态。按真实 manifest 顺序校验 manifest（含本地复刻的安全路径段检查）、每资源基础层与各已启用覆盖层的 JSON 可读性/schema（Ajv `allErrors: true`，draft-07），输出逐层状态与最终来源；坏层问题带精确文件路径、错误明细与修复提示，exit 1；结尾注明跨资源语义校验由运行时加载器执行。全程只读。
- 新增 `scripts/smoke-round-35.mjs` 与 `npm run smoke:round-35`：用项目 `typescript` 包 `transpileModule` 把真实 `data-loader.ts`/`event-bus.ts`/`mod-diagnostics.ts` 即时转译到 `node_modules/.tmp-r35-smoke-*` 的唯一临时目录（裸导入 `ajv` 可解析；跑完即删），以 `globalThis.fetch` 内存 fixture 驱动 `loadGameData({ baseUrl: '/fixture' })`：双 MOD（modA→modB）四资源断言——后有效层获胜（alpha←modB）、坏 JSON 回退（beta←modA）、schema 无效回退（gamma←base）、无覆盖正常（delta←base）、`enabledMods` 暴露、资源按 manifest 顺序、两条 mod 诊断的 severity/message/path/details（`/payload` 字段定位）/hint（schema 文件名与移除方式）；同一 fixture 树再调 `inspectMods(tmpRoot)` 交叉核验层状态/最终来源/问题路径与提示，另断言 MOD 来源的装配警告被归因并补出文件路径、基础来源警告不误标、无效基础资源不能被 MOD 救援、非对象 manifest 能返回可读失败、真实 manifest `enabledMods` 仍为 `[]`。开发中修正一处自查：`compileSchema` 成功分支缓存未携带 `file`，导致 schema-error 提示出现 `schema：undefined`，已补字段并复跑通过。
- 更新 `docs/DATA-GUIDE.md`（状态行、§5 扩写为覆盖语义/启用排序/inspect:mods/F2 排错/重进游戏生效与 R36 热重载说明、覆盖资源运行时语义警告归因、变更记录）、`README.md`（进度行、范围行、命令表 inspect:mods 与 smoke:round-35、MOD 工作流提示）、`CHANGELOG.md`、`ROADMAP.md`（R35 标已完成）与本日志。

### 验证

- `npm run inspect:mods`：通过（exit 0）。真实 manifest（`enabledMods: []`）：26 项资源基础层全部 ✓、0 问题、最终来源全为 base；输出含两条范围说明（整文件替换语义、运行时语义校验边界）。
- `npm run smoke:round-35`：通过（exit 0）。断言全部命中：modB 有效层获胜、坏 JSON/schema 无效覆盖分别回退到 modA/base、来源按 manifest 顺序、坏基础资源/坏 manifest 拒绝路径、加载与跨资源诊断精确归因/修复提示、inspectMods 与运行时加载器层结果一致、真实 manifest 未被启用测试 MOD；唯一转译目录与临时 fixture 目录均已清理。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过（exit 0），manifest Schema 与 26 个基础资源 Schema。
- `npm run typecheck`：通过（exit 0），`tsc --noEmit` 无输出（期间修复过一次 `noUncheckedIndexedAccess` 报出的 `labels[index]` 可能未定义）。
- `npm run build`：通过（exit 0），711ms；主 JS chunk 1,877.50 kB（gzip 494.50 kB），较 R34 的 1,867.95 kB 增加约 9.6 kB（新增 F2 面板与诊断字段），Vite 默认 500 kB 分包建议警告仍在。
- `npm run smoke:round-30` / `npm run smoke:round-31` / `npm run smoke:round-33`：通过（exit 0），人物/门派、任务链、知识图谱回归正常。
- `npm run audit:round-34`：通过（exit 0），文档一致性审计不受本轮文档改动影响（本轮未改四份被审计文档）。
- 未做：F2 面板的按键/翻页实机走查。临时 Vite 页面可见为 Phaser 画布；后续 Windows 浏览器控制因无法可靠确认现有 Chrome 标签 URL 而触发安全停止，未发送任何按键。面板视觉和实际按键仍待人工确认。未实现热重载（R36）。

---

## Round 34 — 世界设定汇编与文档一致性审计（2026-09-27，已完成）

### 计划与实现

- 先读取 `iterations/round-34/plan.md`：本轮只整理文档与新增只读审计脚本，不改引擎、Schema、存档协议与任何游戏数据；全程未触碰未跟踪的 `.serena/`。
- 只读盘点确认事实基线：manifest 登记两个 `grid-map`（`map.round-01-grid` 16×9 起点 (7,7)、`map.round-10-mist-ferry` 16×9 起点 (7,7)，同名瓦片 `~` 在两图中 solid 声明相反）；`world.atlas` 两区域/两关口/三区域事件；`dialogue-set` Schema 封闭枚举为条件 11 种 + 效果 15 种；`quest-set` 20 项任务、目标 kind 三种；五派/12 NPC/遭遇 4 个/会盟为铁嶂 vs 云隐（入口渡口 (7,4)，三阶段，贡献门槛 5）。
- 新增 `docs/WORLD-SETTING.md`：以 JSON/对白/人物志/门派志/任务志/GDD 为证据源整理背景（大雍末年仅见于 GDD、基础 JSON 无王朝叙事）、区域地理（明确「芦苇河滩」是 `place.reedbank` 图谱地点而非第三张地图）、五派格局（白鹭洲「五家走动」对白为官方总结）、渡籍轮值章程 → 雾渡药道会盟 → 药队启程互斥抉择的三层叙事、人物分组与已实现冲突走向、五条结局；每节标注权威数据文件，归纳性表述标（推断），未落地内容单列为路线设想。
- 校准 `docs/MAP-ATLAS.md`：新增地图资源总表（id/区域名/舆图坐标/尺寸/起点/瓦片通行性）、关口端点表（含 `assembleWorldMap` 的 from 可走且不压出生点、to 可走、往返须双向显式声明的装配规则）与区域事件触发格表（坐标/一次性/条件/发现节点），并消除与原协议段的重复叙述。
- 校准 `docs/DIALOGUE-GUIDE.md`：效果主表补 `recruitCompanion`/`dismissCompanion` 两行（原仅见于伙伴小节），§5 改写为「校验分层与故障隔离」——Ajv Schema 静态校验（整资源拒绝）→ `dialogue-graph.ts` 防御图解析（单段隔离，含 draft-07 表达不了的 `minValue <= maxValue`）→ `dialogue-runtime.ts` 跨资源装配（逐选项剔除）三层边界表；原「同行伙伴」小节改编号 4.3 并保留细节。
- 校准 `docs/QUESTS.md`：`talkToNpc` 语义精确到信号来源（场景 `openDialogueWith` 唯一入口：F 键交谈与对无名录/无商店 NPC 的 E 键回落都算谈话，E 键任务告示板不算，接取同一次交互不自动完成）；补充审计核验说明。总表经逐项人工核对与 JSON 一致（20 项的发布人/前置/目标/失败遭遇/奖励未发现漂移）。
- 新增 `scripts/audit-round-34-docs.mjs` 与 `audit:round-34`：按 manifest schema 家族合并加载地图/NPC/遭遇/任务/门派/历法/气候/图谱，从 `dialogue-set`/`quest-set` Schema 的 oneOf const 提取全部条件/效果/目标 kind；数据侧核验地图 id↔manifest 一致、regions↔grid-map 双向、关口/事件坐标边界与按 `tileTypes` 复现的通行性（from 另查不压出生点）、事件引用的时段/天气/知识节点；文档侧核验 MAP-ATLAS（地图 id、尺寸 `C×R`、起点/舆图坐标、关口行两端坐标、事件行坐标）、DIALOGUE-GUIDE（每个 kind 反引号条目）、QUESTS（每项任务「名称+发布人+前置+失败遭遇+报酬」行级匹配）、WORLD-SETTING（门派名与正式区域名）。全程只读、无网络、计数由集合长度推导、不引用 UI 文案。
- 失败路径验证（系统临时目录完整副本，未触碰真实仓库）：删除地图表行、任务表行、门派名和对白条件 kind，并把关口 from 改到越界坐标 (-1,-1)；审计 exit 1，且断言命中全部 6 条预期诊断（关口坐标导致两条），随后清理临时目录。
- 更新 `README.md`（文档索引加 WORLD-SETTING 行）、`docs/GDD.md`（§1 链接世界设定与三份手册、状态行补 R34）、`docs/DATA-GUIDE.md`（状态行、Round 34 段、变更记录）、`ROADMAP.md`（R34 标完成、下一轮 R35）、`CHANGELOG.md` 与本日志。

### 验证

- `npm run audit:round-34`：通过（exit 0）。核验范围（计数由数据推导）：2 张地图/2 个区域/2 个关口/3 个区域事件、条件 11 种 + 效果 15 种、20 项任务（collectItem/defeatEncounter/talkToNpc）、5 个门派名。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过（exit 0），manifest Schema 与 26 个基础资源 Schema。
- `npm run typecheck`：通过（exit 0），`tsc --noEmit` 无输出。
- `npm run build`：通过（exit 0），127 个模块，920ms；主 JS chunk 1,867.95 kB（gzip 491.51 kB），与 R32/R33 相同的 Vite 默认 500 kB 分包建议警告仍在（本轮未改引擎代码，属既有提示）。
- `npm run smoke:round-33`：通过（exit 0），134 节点/202 关系图谱全量映射、五结局影响边闭环回归正常。
- `npm run smoke:round-31`：通过（exit 0），20 项任务链、互斥分支、谈话信号与 v1 存档回归正常。
- 失败路径（临时副本故意制造五类漂移）：exit 1，断言的 6 条错误均报告对应文档路径与缺失项；真实仓库文件全程未动。

---

## Round 33 — 知识图谱目录全量映射与结局关系闭环（2026-09-27，已完成）

### 计划与实现

- 先写 `iterations/round-33/plan.md`：以当前基础目录真实资源 id 为准补齐图谱，不用虚构角色、空摘要或无意义关系凑数。
- 只读盘点确认起点：nodes.json 54 节点（物品 50 件只映射 15、武学 30 种只映射 3、任务 20 项只映射 2），edges.json 58 条；`discoverObservedKnowledge` 已支持按 id+kind 观察式解锁物品/武学，`assembleEndingSet` 的 NPC/门派引用直接取自图谱人物/门派节点。
- nodes.json 新增 80 节点至 134：35 件物品 + 27 种武学 + 18 项任务，title/summary 逐条复制 canonical JSON 的 `name`/`description`（脚本核对 0 处不一致；既有 54 节点原样保留）。新增物品/武学 `knownByDefault: false`（首次持有/学会时解锁），新增任务沿用基础任务节点公开惯例 `true`，结局节点保持 `false`。
- edges.json 新增 144 条至 202，五类闭环：27 条门派武学 `belongsTo`（含既有点击雨剑法/云隐身法两处补课）、31 条姜百味货架 `holds`（说明常备/限量）、24 条锻造结果 → 投入材料 `requires`（9 条配方全覆盖）、20 条发布人 `participatesIn` + 15 条前置 `requires` + 9 条收集目标 `requires` + 12 条谈话目标 `participatesIn`、6 条结局条件影响边补齐（陆贞娘/叶庭舟/石北/闻素心关系条件与铁嶂/云隐两条差事条件）。遭遇 id 不伪造节点；纯数值条件不造边。每条新边唯一稳定 id + 原创说明。
- 新增 `scripts/smoke-round-33.mjs`（纯数据断言，不启动引擎、不依赖中文措辞）与 `smoke:round-33` 命令：目录 kind 双向集合相等、≥100 节点、节点/边 id 唯一、端点闭合、货架/锻造/武学归属/任务链路全量核验、遭遇不入侵图谱、五结局条件来源影响边与结局默认未知。开发中修正过一处自查：第 11 条断言最初写成硬编码白名单，改为按 `item.r32.` / `skill.r32-` id 约定校验新增条目默认未知。
- 更新 `docs/KNOWLEDGE-GRAPH.md`（清除过期 48 节点/45 关系计数，新增 R33 专节）、`docs/ENDINGS.md`、`docs/DATA-GUIDE.md`、`CHANGELOG.md`、`ROADMAP.md` 与本日志。文档初稿把原始关系数误写为 60/前置数误写为 16，经 `git show HEAD` 与脚本复核改为 58/15。
- 未改动任何引擎、Schema 与存档代码；工作区原有未跟踪 `.serena/` 保持不动；未执行 git commit（留待审查）。

### 验证

- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest Schema 与 26 个基础资源 Schema。
- `npm run smoke:round-33`：通过（134 节点/202 关系；目录映射、唯一 id、端点闭合、货架持有、锻造投入、武学归属、20 任务链路、遭遇不伪造节点、五结局影响边与默认未知）。
- `npm run smoke:round-27`：通过（五结局条件评估/边界、锁定提示、MOD 引用隔离、终章格装配/邻接及完整世界加载——图谱扩充未破坏结局装配）。
- `npm run typecheck`：通过（tsc --noEmit 无输出）。
- `npm run build`：通过（独立复核 858ms）；主 JS chunk 1,867.95 kB（gzip 491.51 kB），与 R32 相同的 Vite 默认 500 kB 分包建议警告仍在（本轮未改代码，属既有提示）。

---

## Round 32 — 原创物品与武学目录扩充（2026-09-27，已完成）

### 计划与实现

- 先写 `iterations/round-32/plan.md`：以当前实际基数 25 件物品/6 种武学为准，分别新增 25 项与 24 项，要求所有新内容都有获取/授艺路径及资料说明。
- 物品资料在现有 `items-set` 资源中新增 8 件消耗品、8 件装备、9 件杂项材料，总数达到 50（20/14/16）；扩展姜百味货担 19 个新增货架项，新增 6 条连续升级锻造配方，六件高阶装备均以现有物品/新材料为输入。
- 武学资料新增 24 条，总数达到 30；分属听雨剑阁、铁嶂派、云隐山庄、寒山书院、盘舷刀场，分布为 5/5/5/5/4。所有新招式均由现有 Schema 描述并以 `combat` 配置攻疗、威力、内力消耗和阶梯属性门槛。
- 五位导师的对话新增单独授艺目录：角色仅可进入当前所属门派目录；`martialArtEligible` 按门槛和已学状态过滤，选中后由原子 `learnMartialArt` 效果授艺，并可回到目录继续学习。原有核心招式的授艺入口保留在新目录中。
- 新增 `docs/ITEMS.md` 与 `docs/MARTIAL-ARTS.md`，列出新增条目、效果/属性门槛、获取方式和锻造材料；更新 `docs/DATA-GUIDE.md`、本路线图与变更日志。新增 `smoke:round-32`，用完整世界装配和实际授艺效果核验内容数据。
- 首次专项烟测发现高阶「定理贯脉诀」30/14 的治疗威力/内力消耗超过本轮设定上限 27/13；将其收至 27/13 后重跑通过，保持高阶定位并遵守已记录的平衡区间。

### 验证

- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 26 个基础资源 Schema 合规。
- `npm run typecheck`：通过。
- `npm run smoke:round-32`：通过；验证 50 件物品/新增 25、30 种武学/新增 24、材料/货架/六条锻造链引用闭合、五派目录门控、24 种招式逐一实际授艺、学后隐藏/重复授艺拒绝，以及完整世界装配无新资料告警。
- `npm run smoke:round-31`：通过，20 项任务链、谈话/分支/败北失败与旧档兼容回归正常。
- `npm run smoke:round-30`：通过，12 名人物/5 个门派、导师/对话合并/关系资料回归正常。
- `npm run build`：通过（798ms）；主 JS chunk 1,867.95 kB（gzip 491.51 kB），仍有 Vite 默认 500 kB 分包建议警告。

---

## Round 31 — 原创任务链与可选分支（2026-09-27，已完成）

### 计划与实现

- 按 `iterations/round-31/plan.md` 先做只读扫描：确认任务引擎已支持五态与按目标 id 的 v1 计数快照（无需升版本）；确认 E 键任务告示板在 `handleInteraction` 中提前返回、F 键 `tryTalk` 与其共用 `openDialogueWith`——把 `npc-talk` 信号放在 `openDialogueWith` 内即可天然满足"告示板不算谈话、接取同一次交互不自动完成谈话目标"。
- 引擎通用化（`src/engine/quest-system.ts`，不含任何剧情/人名）：`QuestObjectiveKind` 新增 `talkToNpc`（requiredCount 上限 99，按 `npc-talk` 信号累加）；`QuestData` 新增可选 `exclusiveGroupId`；`QuestAssemblyInput` 新增 `npcIds`（全部已放置 NPC，谈话目标按此校验而非仅发布人）；装配期互斥组**整组校验**——按前置签名单独比较，有效成员不足 2 项或签名不一致即整组禁用（校验放在前置环检测之后、依赖清理之前，被禁组员的下游后续由既有清理循环一并摘除）；`acceptQuest` 接取组员时按声明顺序把同组仍处 `offered` 的兄弟置为 `failed` 并在 `update.failedQuestIds` 报告。`quest-set.schema.json` 同步新增 `talk-objective` 与可选 `exclusiveGroupId`。
- 场景接线：`grid-scene.ts` 的 `openDialogueWith` 在面板打开时发一次 `npc-talk`（全文件唯一发射点，F 路径与非公告板 NPC 的 E 回落共用）；`quest-ui.ts` 接取互斥任务时提示「另一条岔路就此封止」，日志副标题改为"随物品、交谈与战斗自动更新"。
- 资料落地：`round-07-quests.json` 扩至 20 项（新增 18 项 `quest.r31-*`）：巷陌小务四条（茶棚凉汤/书铺驱蠹/货郎口信/路旁荐帖，开局即可接取）→ 问药/药庐/巡岸/启程主线 → 互斥组 `branch.ferry-priority`（先保药队 vs 先修栈桥，共享前置「药队启程」）→ 各自后续（药队答谢 45/20 vs 栈桥通渡 42/55）；旁线渡籍→书院夜课、河灯之约、江湖耳目、刀场淬料、师门勘验。两项互斥选择由白鹭洲的告示板同时发布，A 项转述石北的主张。谈话目标 9 项、收集 7 项（含双物品收集）、击败 4 项（其中 3 项新差事声明 `failOnEncounterIds`）。12 名 NPC 全部标记 `questGiver: true`（姜百味保留商店优先，其差事经 Q 日志接取）。
- 新增 3 个任务专用遭遇（`round-05-encounters.json`）：雾夜探子 (5,6)、芦苇水路伏兵 (6,6)、栈桥索银人 (10,6)，均在雾雨渡口南岸第 6 行空行——经全量核对不与任何人物基础/日程位、区域事件、关口端点、擂台、门派战入口、工位、药炉、终章入口、其他遭遇格或出生点重叠，且从出生点 BFS 可达。
- 新增 `docs/QUESTS.md` 任务志（协议速览、20 项总表、分支路线图、四章叙事、遭遇表与接取入口备忘），更新 `docs/DATA-GUIDE.md`（任务协议与变更记录）、`docs/ARCHITECTURE.md`（状态行、任务引擎段落、隔离表新增互斥组行、变更记录）、`CHANGELOG.md`、`ROADMAP.md` 与本日志。
- 新增 `scripts/smoke-round-31.mjs` 与 `smoke:round-31` 命令：断言覆盖数量与新增恰数、任务/目标 id 全局唯一、三型目标与互斥组结构、手工坏档逐条隔离（坏发布人/物品/遭遇/谈话人物）与互斥组整组校验（坏成员/前置不一/单成员均不留假单选）、完整世界装配零任务警告、三新遭遇槽位避让与可达性、谈话信号语义（接取前与接取时都不计数、错人不推进、正确 NPC 完成且奖励恰发一次）、物品接取快照与钳制、败北失败原子锁链（前置失败永久锁死后续、胜绩不复活失败差事）、互斥分支双向确定性失败报告/幂等拒绝/各自后续互不串线、`npc-talk` 唯一入口的源码文本断言（发射点位于 `openDialogueWith` 内、E 键告示板走独立调用点）、v1 快照往返（含互斥 failed 与谈话计数）与 R31 前旧档（仅 round-07 状态）免迁移恢复。

### 验证

- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 26 个基础资源 Schema 有效（任务集含 20 项与 3 新遭遇后仍全部合规）。
- `npm run typecheck`：通过。
- `npm run smoke:round-31`：初次运行发现完整世界只装配 12/20 项任务；定位为容素青 NPC 缺少 `questGiver: true`，导致其名下任务及依赖后续被正确级联禁用。补上标记、把互斥选项统一到白鹭洲告示板并增加同发布人断言后重跑，通过（20 项全部装配，引用/交互/存档断言全通过）。
- `npm run smoke:round-30`：通过，人物/门派/对话/图谱与完整世界装配回归正常（12 名 NPC 标记 `questGiver` 不影响放置与日程警告断言）。
- `npm run build`：通过（844ms）；主 JS chunk 1,867.95 kB（gzip 491.51 kB），仍超过 Vite 500 kB 默认建议线。

---

## Round 30 — 原创人物、门派与关系资料扩充（2026-09-27，已完成）

### 计划与实现

- 按 `iterations/round-30/plan.md` 先做只读扫描：确认引擎内无任何按门派 id 的硬编码检查（结局、门派战、成就全部数据驱动且为 AND 条件）；确认 `world-loader.ts` 此前只按固定资源 id 读取单一对话文件，新对话文件登记 manifest 后不会被装配——这是本轮唯一的引擎障碍。
- 引擎通用化（不含任何剧情/人名/门派名）：`data-loader.ts` 的 `loadGameData` 返回解析后的 manifest；`world-loader.ts` 的对话装配改为合并 manifest 中所有 `dialogue-set` 资源（与 grid-map 多资源装配同一模式，重复对话 id 保留清单先声明者并警告，结构失败只禁用该资源），可选内容坏档降级改按 manifest 声明的 schema 家族判断（`OPTIONAL_CONTENT_SCHEMAS`），删除按固定资源 id 枚举的 `OPTIONAL_RESOURCE_IDS`。
- 资料落地：`round-03-npcs.json` 新增 3 名 NPC——柳听澜（寒山书院教习，方格试炼场 (5,3)，日中 (6,3)）、祝九弦（盘舷刀场教头，雾雨渡口 (11,3)，晨光 (12,3)）、白鹭洲（渡董，雾雨渡口 (4,4)，黄昏 (3,4)）；坐标经全量固定互动格核对（遭遇/擂台/工位/药炉/门派战入口/终章入口/关口端点/区域事件），尤其避开了芦苇河滩事件格 (5,4)，不挡死河灯结局的见闻链；Round 30 烟测另按七个时段检查人物与区域事件从出生点的实际连通性。
- 独立可达性复核发现：柳听澜最初的 (6,1) 虽是非固体格，却因墙体与玩家所在区域隔离，不能从出生点接近；已移至连通路径上的 (5,3)，日中移至 (6,3)。烟测新增逐时段 BFS 检查新增人物邻接互动格和全部区域事件；修正后七个时段、两地图检查均通过。
- `round-04-factions.json` 新增寒山书院（悟性 8/善名 5/师徒关系 5，退门声望 −15）与盘舷刀场（等级 2/体魄 9/身法 8/声望 5，退门声望 −30）；两家门槛均按初始抄书学徒+成长路线核验可达，复用现有 admission/departure 协议。祝九弦传艺复用既有通用武学 `skill.lanmen-daofa`；寒山书院暂不授专属武学，对话不引用武学条件。
- 新建 `dialogues/round-30-conversations.json` 并登记 `dialogue.round-30-set`：柳听澜、祝九弦导师对话提供拜师/退门/门中事务/会盟三报分支；白鹭洲对话承担渡口地方知识（发现见闻「渡籍·轮值章程」）、五派格局讲解、会盟结果报备入渡籍（`shareKnowledgeNode`）、门派弟子登记四项叙事职责。
- 知识图谱新增 6 节点（三名人物、两门派、`event.ferry-passage-registry`）与 13 条关系边（belongsTo/locatedAt/knows/influences，其中 4 条人物态度传播边带 attitudeSpread，均符合 character→character 端点约束）。
- 新增 `docs/CHARACTERS.md`（12 人物志）与 `docs/FACTIONS.md`（5 门派志），更新 `docs/DATA-GUIDE.md`、`CHANGELOG.md`、`ROADMAP.md` 与本日志。
- 新增 `scripts/smoke-round-30.mjs` 与 `smoke:round-30` 命令：断言覆盖数量下限与新增恰数、全局 id 唯一（含跨对话文件冲突）、两图 NPC 放置与日程编译零警告、固定互动格全避让、逐时段地图连通性（新 NPC 可从出生点走到相邻交互格，3 个区域事件仍可抵达）、导师引用闭合、用通用对话运行时真跑拜师/授艺/退门事务与拒绝路径零变更、对话合并解析、图谱端点/态度边校验、完整世界装配及兼容负向保护（结局门派条件与门派战双方仍只指向三家基础门派）。

### 验证

- `npm run typecheck`：通过。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 26 个基础资源 Schema 有效（新增 `dialogue.round-30-set`）。
- `npm run smoke:round-30`：通过（首跑捕获两处烟测自身缺陷——旧 NPC 无 `schedule` 字段的空值处理、结局无 factionId 条件的过滤——修正后全绿）。
- `npm run smoke:round-29`：通过，图鉴八类投影与完整世界装配回归正常。
- `npm run smoke:round-28`：通过，成就协议与 v1 存档路径回归正常。
- `npm run smoke:round-27`：通过，五结局条件评估、终章格装配与完整世界加载回归正常。
- `npm run build`：通过，127 个模块构建成功（744ms）；主 JS chunk 1,866.60 kB（gzip 491.05 kB），仍超过 Vite 500 kB 默认建议线。
- `git diff --check`：通过，无空白错误；Git 提示部分 LF 工作区文件将在下次触碰时规范为 CRLF（与既往轮次一致）。
- 未进行浏览器手动游玩，导师对话与渡董交互的键盘流程经引擎事务与完整装配烟测验证，不宣称浏览器实测。

### 后续

- 下一轮按路线图进入 Round 31 原创任务链扩充；本轮现有未跟踪 `.serena/` 用户目录保持未触碰且不纳入提交。

### 计划与实现

- 按计划先复核用户目标文件、当前路线与仓库状态：Round 08 已于历史提交完成；当前 HEAD 是 Round 28 commit，接续实现 Round 29。工作区原有未跟踪 `.serena/` 不属于本轮内容。
- 完成只读代码/资料扫描后，先写 `iterations/round-29/plan.md`，确认知识图谱已有 48 节点、21 个公开节点，人物/NPC、地图、物品、武学 id 可在运行事实间稳定对应；发现状态由 v1 `knownKnowledgeNodeIds` 维护。
- 新增 Phaser-free `projectKnowledgeCollection` 和 `discoverObservedKnowledge`：八类统计覆盖 0 项类别，观察解锁只接受同 id 且 kind 匹配的当前图谱节点，并返回新发现项；不变更节点资料。
- 新增 L 键 `CollectionPanel`，展示总进度与分类进度、已知条目、未知数量占位和已知关系；与 K 百科/其他面板互斥，销毁时解除事件绑定；帮助面板和探索提示加入 L。
- 为战斗遭遇增加可选 `knowledgeNodeId` 人物引用；遭遇首次开始时记下对手词条，世界装配只接受有效人物节点，坏引用降级为警告并保留可玩遭遇。
- GridScene 在人物交互、地图抵达、背包打开/改动、对白效果、擂台派奖、初始化/恢复与保存前同步有效运行事实；沿用原 v1 字段，不新增冗余图鉴存档状态。
- 新增 `scripts/smoke-round-29.mjs` 和 npm 命令，已验证分类投影、空类别、隐藏事件/结局、纯度、同类 ID 匹配、异类拒绝、幂等、基础 ID 对照、可选遭遇人物引用的完整装配及坏引用隔离。
- 更新知识图谱、数据指南、架构与 GDD 说明，以及 `CHANGELOG.md`、`ROADMAP.md` 和本日志。

### 验证

- `npm run typecheck`：通过。
- `npm run smoke:round-29`：通过，覆盖 8 类统计、未知节点保密、输入/图谱只读投影、四类观察发现、类型错误拒绝、重复发现幂等、基础资源 id 交叉核对、遭遇人物引用装配及坏的可选引用降级。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 25 个基础资源 Schema 有效。
- `npm run smoke:round-28`：通过，既有成就协议、进度/奖励及 v1 存档路径回归正常。
- `npm run build`：通过，127 个模块构建成功；主 JS chunk 为 1,866.48 kB（gzip 490.99 kB），仍超过 Vite 500 kB 默认建议线。
- `git diff --check`：通过；Git 报告部分 LF 工作区文件将在下次触碰时规范为 CRLF。
- 浏览器手动验证：本地新开局进入方格试炼场，L 打开图鉴、按 → 键切换人物分类显示 5/10 与 50%，再关闭图鉴并用 K 独立打开百科；未保存该临时试玩。

### 后续

- Round 29 已完成；下一轮建议进入原创人物与门派内容扩充（Round 30）。

## Round 28 — 成就系统（2026-09-27，已完成）

### 计划与实现

- 新增可选 `achievement-set` Schema/MOD 资源和 14 类 AND 条件，成就数据涵盖成长、任务数、见闻、社会状态、门派、人物关系、战斗、擂台、经脉、自创武学、锻造与炼丹。
- 新增 Phaser-free `achievement-system.ts`：结构防御解析、逐条语义隔离、跨资料引用校验、只读进度投影、饱和活动计数与一次性解锁状态转换。Ajv 校验封闭字段和基本 JSON 类型，范围/必填语义由解析器逐成就检查，悬空人物/门派/知识引用只禁用对应条目。
- 新增 G 键成就面板、键位帮助与状态行提示；成就列表与多条件详情列可分别聚焦/滚动，状态变更及对白确认后的有限收口点会重评，成就经验奖励使用既有成长/修为规则，银两按上限截断。
- v1 存档新增可选 `achievementState`；旧档缺字段归一为空解锁列表/零计数，未知历史 id 不按当前 MOD 资料过滤。
- 修正规划中与系统不符的“悬空任务 id 引用”验收项：任务条件为完成任务总数，本轮不声明单任务 id 条件。
- 新增 `scripts/smoke-round-28.mjs` 并登记 `smoke:round-28`；新增 `docs/ACHIEVEMENTS.md`，更新存档、数据指南、架构、GDD、变更日志、路线图和本开发日志。

### 验证

- `npm run smoke:round-28`：通过，覆盖 schema/解析器逐条隔离、14 类条件进度、区间/布尔分支、纯度、计数器上限、解锁幂等、MOD 历史 id、完整世界装配及新旧 v1 存档兼容。
- `npm run smoke:round-27`、`npm run smoke:round-26`、`npm run smoke:round-25`：串行通过。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 25 个基础资源 Schema 有效。
- `npm run typecheck`：通过。
- `npm run build`：通过，Vite 构建成功；主 JS chunk 为 1858.25 kB（gzip 489.49 kB），Vite 提示超过 500 kB 默认建议线。
- `git diff --check`：本轮提交前通过。
- 未进行浏览器手动游玩，故不声称 G 键面板和实际奖励提示经过交互实测。

### 后续

- 下一轮按路线图进入 Round 29 图鉴与百科扩展；项目总目标仍在进行中。

## Round 27 — 多结局判定与终章入口（2026-09-27）

### 计划与实现

- 开发前新增 iterations/round-27/plan.md：预计人类工程师 20–28 小时，拆为结局协议/纯规则、地图入口/界面、原创路线/图谱、专项/回归验证四个子任务。
- 新增可选 ending-set schema 与 manifest 资源；防御解析器采用封闭七类条件，全部满足才可达，并按优先级与稳定 id 排序。跨资料检查任务、人物、门派、知识/结局节点；悬空引用只禁用对应结局。
- 新增纯函数结局评估与单一终章入口装配；地图格必须可走且避开出生点、人物/遭遇/活动/工位/关口/事件，入口格并从所有 NPC 时段日程中保留。
- 新增渡口照心石程序标记和 E 键终章面板；锁定结局显示资料作者提示，可达结局显示正文，选择后终章期间锁探索输入，完成后回主菜单。结局条件从当前任务、善恶/声望、人物关系、门派身份/声望和玩家见闻只读计算。
- 新增五条原创归宿：河灯归处、听雨守约、铁嶂砺心、云隐护生、行舟万里；复用既有结局图谱节点/新增四节点及关系边。依据现存拜师门槛、师长交互、送药声望奖励和关系对白复核阈值，使五条路线均与当前资料能达成的数值一致。
- 新增 smoke:round-27；新增 docs/ENDINGS.md，更新 GDD、架构、数据指南、图谱指南、操作手册、CHANGELOG 和 51 轮路线图。

### 验证

- npm run smoke:round-27：通过五类可达路径、任务/善恶/关系/门派/声望/见闻判断、边界与锁定提示、纯评估不变性、坏 MOD 引用局部隔离、地图/邻接和完整 world-loader 装配；所有时段 NPC 均避开终章格。
- npm run validate:data：通过；manifest 与 24 个基础资源 Schema 通过。
- npm run typecheck：通过。
- npm run build：通过；124 个模块，主 bundle 1,842.67 kB（gzip 485.70 kB）；仍高于 Vite 默认 500 kB 分包建议线。
- npm run smoke:round-26、npm run smoke:round-25、npm run smoke:round-24：顺序执行均通过。
- git diff --check：通过，无空白错误；Git 提示部分 LF 文件会在后续检出/提交时规范成 CRLF。
- 未进行浏览器手动游玩，UI 键盘交互通过构建和面板接口检查，未宣称浏览器实测。

### 范围说明

- 结局选择是本次运行的终章，不覆盖任何存档槽，也不保存跨新档的结局历史；可从终章前的手动存档尝试其他路线。
- 未增加外部素材，五条结局与程序标记均为原创。
- Round 27 完成后整体目标仍保持活跃，按路线图进入 Round 28 成就系统。

## Round 26 — 社交记忆深化（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-26/plan.md`：预计人类工程师 18–24 小时，拆为图谱/记忆模型、对白协议/事务、存档/示例内容、专项与回归验证四个子任务。
- `SocialState` 新增 NPC 私有见闻 Map；新开局与旧档恢复时从人物起点的有效 `knows` 图边生成静态记忆，玩家百科发现仍与 NPC 认知分离。
- 对话 Schema/解析器支持 `npcKnows` 条件（NPC 默认当前说话者，可显式指向人物）和 `shareKnowledgeNode` 效果。分享要求玩家已知目标词条、仅写当前 NPC、重复操作幂等，并沿用 staged-copy 事务深拷贝与回滚。
- 知识图边新增可选 `attitudeSpread`（-1…1 非零）。图装配只允许人物到人物边携带有效系数；关系变化按实际钳制后的增量沿有向边传播一跳，使用原关系边界且不递归。基础资料由陆贞娘向顾夜尘的 `knows` 边演示 0.5 系数；茶棚对白分享“雨后的脚印”后出现依赖 NPC 私有记忆的后续选项。
- v1 快照新增可选 `social.npcKnowledge` 条目数组；旧档缺字段归一为空动态记忆，恢复后由当前图谱补回静态记忆。预检按 NPC/节点分别过滤 MOD 删除的内容并告警，不改变 v1 协议号。
- 新增 `scripts/smoke-round-26.mjs` 和 `smoke:round-26`，更新对白、数据、图谱、存档、GDD、架构、变更/开发日志与路线图说明。

### 验证

- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过；manifest 与 23 个基础资源 Schema 通过。
- `npm run smoke:round-26`：通过图谱初始 NPC 记忆、玩家/NPC 知识隔离、未掌握见闻分享拒绝、坏引用逐选项隔离、分享后专属回应、后续效果失败全事务回滚、重复存档见闻 id 拒绝、0/越界/有效传播系数、非人物端点剥离传播字段、有向正负传播、半数对称舍入、来源与目标关系边界钳制、v1 捕获/恢复、旧字段缺省及 MOD 删除 NPC/知识节点过滤。
- `npm run smoke:round-25`：通过配方、交易、任务信号、成药和 v1 回归。
- `npm run smoke:round-24`、`npm run smoke:round-23`：顺序执行均通过，未出现测试服务器端口冲突。
- `npm run build`：通过；TypeScript 检查通过，Vite 生产构建 122 个模块。主 bundle 1,830.53 kB（gzip 482.87 kB），仍高于 Vite 默认 500 kB 分包建议线。
- `git diff --check`：通过；Git 对若干工作区文件报告下次提交时会将 LF 规范为 CRLF。
- 本轮未进行浏览器手动游玩，因此不宣称茶棚对白已完成浏览器界面实测。

### 范围说明

- 未新增外部素材或原作内容；示例文案和数据均为本作原创。没有加入定时随机谣言传播，当前传播完全由玩家分享和图谱明示规则决定，便于验证和复现。
- Round 26 完成后目标仍继续，按路线图进入 Round 27 多结局判定。

## Round 25 — 炼丹、药方发现与品质（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-25/plan.md`，预计人类工程师工时 20–28 小时，拆为资料与发现链、Phaser-free 炼制事务、地图面板接线、闭环验证与文档四项子任务。
- 新增可选 `alchemy-set` JSON Schema/manifest 资源，默认数据声明渡口药炉与三条方子。解析器保留逐条语义警告；装配按地图可走格、出生点、NPC、世界关口/区域事件、遭遇、擂台、门派战和装备锻造工位隔离无效位置，并将有效工位加入 NPC 日程阻挡格。缺省药炼资料返回空入口。
- 新增寒珠草、苍崖根、落蝶花三味可购买杂项药材；药师容素青以对话 `discoverKnowledgeNode` 效果传授生肌散、宁神丸、双和丹三张配方。每张配方使用两种以上不同药材、正工钱，悟性阈值为 0/12/24，对应三种恢复量单调提升的普通消耗品；三味药可在既有货担无限库存购买。
- 新增 Phaser-free `alchemy-system.ts`：按已知节点门控配方，选择最高满足悟性阈值；检查资金、材料及扣料后容量，在克隆库存中完整模拟后统一提交。拒绝交易不改货币/库存/角色；成功回调刷新任务收集数量并记录首次制得药品的知识节点。
- 新增药炉格标记和相邻 E 键炼丹面板。未识方只显示泛化行与线索；已识方显示投入/持有数、工钱、当前悟性、确定产物和恢复量。制作结果直接复用背包消耗品使用、collectItem 数量、百科、既有 v1 item id/knowledge id 存档；未新增存档字段或版本。
- 新增 `docs/ALCHEMY.md`、R25 Phaser-free 冒烟及 package 命令；更新控制帮助、GDD、架构、知识图谱、数据/存档说明、README、CHANGELOG 和 51 轮路线图。Claude Code CLI 只负责药材、药师、对白、图谱及炼丹 JSON 七个数据文件；主 agent 审阅后完成规则、装配、场景和 UI。

### 验证

- `npm run build`：通过；122 个模块，主 JS 1,826.18 kB（gzip 481.76 kB）；Vite 提示默认 500 kB 分包建议。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过；manifest 与 23 个基础资源 Schema 全部通过。
- `npm run smoke:round-25`：通过，覆盖药方和图谱解析、工位占位/邻接、发现门控、悟性档位、资金/材料/容量拒绝不变、满包腾格转换、collectItem 信号、成药消耗、坏配方隔离、v1 药品/知识进度恢复及无资源降级。
- `npm run smoke:round-24` 与 `npm run smoke:round-23`：回归通过。
- `git diff --check`：通过；仅有 LF→CRLF 工作区规范化提醒。未运行浏览器手动炼药流程，因此不宣称 UI 经浏览器实测。

### 范围说明

- 产物只使用原创文字资料与代码绘制的工位标记；没有新外部引用、图片或音频素材。配方品质不使用随机数；药方学习与成药百科状态都复用现有知识图谱/存档字段。
- 这轮完成 R25 并继续保留后续 Round 26–50；项目目标仍在进行中。

## Round 24 — 装备锻造与强化（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-24/plan.md`，预计人类工程师工时 18–26 小时，拆成资料/Schema/装配、锻造事务/经济、地图交互/UI、验证/文档四个可验证子任务。
- 新增 `equipment-forge-set` 可选资源和 draft-07 Schema；manifest 同路径覆盖规则不变。加载器把 Schema 及语义诊断归入可选内容，Phaser-free 装配检查地图格、出生点、NPC、遭遇、擂台、门派战和工位重叠；无效引用只禁用关联配方，固定工位格加入 NPC 日程占位。无有效配方的工位不暴露交互。
- 新增三种原创杂项材料、三件固定强化装备与三条同槽配方，姜百味货架可购买材料。配置约束为一件未穿戴的基础装备 + 杂项材料 + 正银两成本；产物各项装备加成不得降低且至少一项提升。
- 新增无 Phaser `equipment-forge.ts`：银两/材料/装备先检查，之后在库存副本里扣料、验证结果格并发放，最终一次提交；不足、装备中投入和错误配方都保留原库存/货币。满容量背包可使用转换释放的格子。
- 渡口铁砧以“锻”标记；玩家在四方向相邻格按 E 打开配方页，查看投入持有量、银两、产物属性/生命/内力加成和不可制作原因。成功后即时刷新任务收集快照。结果 item 直接走既有背包、装备调和、CombatSession 与 save-system，未扩存档协议。
- 新增 `docs/EQUIPMENT-FORGING.md` 与 Round24 专项 smoke；更新 GDD、架构、数据/存档文档、操作帮助、README、CHANGELOG 和 51 轮路线图，下一轮设为 R25 炼丹。

### 验证

- `npm run build`：通过；120 个模块，主 JS 1,809.95 kB（gzip 478.95 kB）；保留 Vite 默认 500 kB 分包建议提示。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 22 个登记基础 JSON 资源均过 Schema/Ajv。
- `npm run smoke:round-24`：通过，覆盖 valid set 与坐标/跨引用/坏配方隔离、相邻/斜角选择、工位占位冲突、银两/材料/装备中输入拒绝不变性、满包转换、产物装备后战斗伤害大于未穿戴基线、v1 捕获/预检/恢复后装备 bonus 重算。
- `npm run smoke:round-23`、`npm run smoke:round-22`：顺序回归通过。
- `git diff --check`：通过；仅提示 LF→CRLF 自动规范化。未操作浏览器进行手工锻造流程；面板经过 TypeScript/生产构建和纯引擎烟测，并不宣称 UI 浏览器实测。

### 范围说明

- 装备结果固定由数据定义，因此采用普通 item id 保持 save protocol v1；工位/配方失效时不会影响地图、交易、战斗或既有存档读取。
- 本轮没有引入外部素材或新来源；材料、装备、面板标记均为原创文字/代码绘制。

## Round 23 — 经脉与内修（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-23/plan.md`，预估人类工程师 20–28 小时，拆分经脉资料/规则、角色与战斗接线、存档兼容、UI/验证/文档四项子任务。
- 新增可选 `meridian-set` JSON Schema、六个原创节点和 Phaser-free `meridian-system.ts`；节点前置构成无环图，修为奖励、等级、材料和效果均来自 JSON。世界装配交叉校验物品引用，缺失材料只禁用该节点及其后继；Schema/解析失败则关闭整套内修入口，不影响现有世界。
- 新角色获得资料配置的初始修为；战斗胜利和任务经验结算按实际升级数发点。节点解锁先核验修为、等级、前置、材料库存与装备状态，再提交扣点、扣物、节点记录。N 面板展示节点、效果、成本和不可用原因，Enter 解锁，Esc/N 关闭。
- 角色有效属性按基础成长 + 装备 + 经脉独立重算，气血/内力上限汇总角色公式和两种加成；升级、换装、读档与打通节点都会保留经脉效果。普通遭遇、擂台、门派战共用 CombatSession 并获得同一修为奖励。
- v1 快照加入 `cultivationPoints` 与 `unlockedMeridianNodeIds`，旧档缺省为 0/空数组；非法余额、重复或超 64 项节点数组拒绝，当前 MOD 缺失节点软过滤并警告。派生加成不写档，场景按当前经脉资料恢复。
- 新增 `docs/MERIDIANS.md` 与专项无 Phaser 冒烟脚本，更新帮助、HUD、README、GDD、架构、数据指南、存档说明、CHANGELOG 与路线图。Claude Code CLI 仅修改了 save-system 子任务文件；我逐项审阅后完成场景/UI集成与测试。

### 验证

- `npm run build`：通过；118 个模块；主 JS 1,795.26 kB（gzip 475.41 kB），Vite 的 500 kB 分包建议仍出现。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest + 21 个登记基础资源 Schema 全部通过。
- `npm run smoke:round-23`：通过，覆盖唯一/循环前置校验、悬空材料及依赖隔离、等级/修为/材料限制、拒绝路径状态不变、属性与装备不重复叠加、战斗升级发点、存档新旧字段、非法值和 MOD 移除节点恢复过滤。
- `npm run smoke:round-22` 与 `npm run smoke:round-21`：顺序回归均通过。
- `git diff --check`：提交前执行。本轮没有运行浏览器手工流程；N 面板只通过构建和静态集成核验，不声称浏览器游玩已验证。

## Round 22 — 玩家自创武学（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-22/plan.md`，预计人类工程师工时 18–24 小时，拆分组件/合成规则、界面/战斗接线、存档兼容、验证/文档四个子任务。
- 新增可选武学组件 JSON 与严格 Schema，manifest 登记 MOD 可覆盖资源；world-loader 语义解析后提供三槽数据。组件资源缺失或无效时给出资源 warning 并关闭创制入口，原有世界和武学继续可用。
- 新增 Phaser-free `martial-art-forge.ts`：每门作品需要招式、架势、吐纳各一项；以功力 + 2×内力作为预算上限 34，功力上限 18、内力上限 12、最多 5 门、名称 2–16 Unicode 字符。全部条件和银两先核验再扣款、注册作品与学习 id。
- 新增 C 键组件创制面板：键盘换选、名称输入、招式说明/效果/消耗/价格/预算预览。玩家作品以合并武学表传入普通遭遇、擂台和门派战 `CombatSession`，敌方资料不自动获得玩家作品。
- v1 快照加入 `customMartialArts` 完整定义数组；旧 v1 缺字段默认为空。存档解析再次检查自创命名空间、容量、重名、作品固定资格/熟练度和战斗预算；恢复预检接受快照自带作品作为玩家已学武学的有效定义。
- 更新 README、控制提示、GDD、ORIGINAL-FIDELITY、架构/数据指南/存档文档，新增 `docs/MARTIAL_ART_FORGE.md` 并更新路线图至 R23。

### 验证

- `npm run build`：通过，TypeScript 检查通过；Vite 生产构建完成 116 模块，主 JS 1,781.43 kB（gzip 471.51 kB），超过默认 500 kB 分包提示线。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过，manifest 与 20 个基础资源通过 JSON Schema/Ajv。
- `npm run smoke:round-22`：通过，覆盖组件 Schema/语义边界、重名/预算/银两原子拒绝、创制交易、CombatSession 可用性、自创作品新旧 v1 往返和恶意功力边界拒绝。
- `npm run smoke:round-21`：串行重跑通过，覆盖门派战资料、战斗/贡献与新旧 v1 存档；首次并行运行时出现的 WebSocket 端口提示未复现。
- `git diff --check`：通过；仅有 Git 的 LF→CRLF 规范化提示。
- 本轮完成 TypeScript/数据/无 Phaser 引擎冒烟核验；未执行浏览器手动操作，不宣称创制 UI 经过浏览器实测。

### 代码审查

- Claude Code CLI 对指定核心文件与数据/存档关联链路完成只读审查，报告 2 项中优先级边界问题：生成作品长度按 Unicode 码点、存档复验按 UTF-16 长度，扩展平面文本可能写得出却读不回；键盘 keydown 录名无法接收 IME 提交文本。
- 修复长度单位为生成/读档统一按 Unicode 码点，并在冒烟中加入扩展平面 category/style/description 的存档往返回归；另拒绝经篡改存档写入控制字符名称。首轮回归 fixture 误复用了作品 id，修正 fixture 后往返通过。
- 名称录入改用临时隐藏原生文本 input，让浏览器处理 IME 组合、粘贴与退格；键盘编辑焦点不再经过 Phaser 世界按键，离开名号行时失焦，销毁面板时解绑并移除输入元素。未扩展修复主菜单已有的同类原始 keydown 命名限制。
- 修复后重跑的完整构建、资料校验、R22 冒烟，以及扩展平面文本存档回归，均通过。只读审查未运行测试；实际测试由本轮单独执行。

## Round 21 — 门派战、贡献和世界后果（2026-09-27）

### 计划与实现

- 开发前新增 `iterations/round-21/plan.md`，预计人类工程师工时约 26 小时，拆分资料装配、报名/战斗、后果/存档、验证/文档四个子任务。
- 新增可选 `faction-war-set` Schema 与 Phaser-free `faction-war.ts`。战事条目声明地图/入口、双方门派、贡献门槛、阶段、三类后果；每阶段分别配置两派弟子，确保玩家只会迎战对方门派。装配检查入口格、出生点/NPC/遭遇/擂台冲突、门派/武学/结局知识节点引用，并逐战隔离坏资料；日程把战事格登记为固定占位。
- 新增雾雨渡口“雾渡药道会盟”：三阶段、铁嶂/云隐各三名专属对手。邻接 E 面板展示双方名单、贡献门槛与战绩；在籍两派玩家均可报名，复用通用 CombatSession 与伙伴援护。阶段败阵按资料比例恢复后续战；阶段胜利积贡献，达到门槛即胜，未达门槛按贡献判平/负，撤退提前结算；战事战斗不污染普通遭遇和任务状态。
- 胜/平/负分别从数据读取个人声望、己方/对方门派声望变化及知识事件节点。百科记录新见闻，铁嶂与云隐两位师长都提供知识条件战报对白。运行战绩记录报名、胜平负次数、最高/最近贡献和最近结果。
- v1 存档加入可选 `factionWarRecords`；旧档缺字段安全默认为空，世界预检会过滤被 MOD 移除的战事战绩并给 warning。补充 `docs/FACTION_WAR_DESIGN.md`，更新 SAVES、KNOWLEDGE-GRAPH、DATA-GUIDE、ARCHITECTURE、GDD、ORIGINAL-FIDELITY、CHANGELOG 和路线图。知识图谱现有 28 节点/19 边；本轮新增 3 个战事结局节点及 6 条影响边。

### 验证

- `npm run build`：通过，TypeScript 检查通过；Vite 生产构建完成 114 模块。主 JS 1,766.77 kB（gzip 467.12 kB），保留超过 500 kB 默认建议的提示。
- `npm run smoke:round-35`：通过（MOD 覆盖/回退回归）。`npm run validate:data`：通过；manifest 与 19 个基础资源通过 JSON Schema/Ajv 校验。
- `npm run smoke:round-21`：通过；验证资料解析、邻接选择、坏占格和参战门派引用隔离、双方各三阶段的 CombatSession/经验适配、贡献胜平负分档、旧 v1 缺字段、新战绩捕获/解析/恢复及 MOD 移除战事时的存档软过滤。
- `git diff --check`：通过；仅报告部分 LF 文件后续可能规范为 CRLF。
- 本轮使用无 Phaser 运行时冒烟验证，没有声称进行浏览器手动游玩验证。

### 兼容性审查补充

- Claude Code 对照计划做只读审查，确认主要流程无阻断问题；发现 schema 允许 12 阶段而单页 UI 会挤压战绩区。补充 Phaser-free 阶段分页协议，面板按可用高度分页，PgUp/PgDn 切页；仅查看会盟不再将空战绩写入运行状态。
- 更新 `smoke-round-21.mjs`：用 12 阶段数据验证分页边界；MOD 移除与保留两种情况均把 `planSnapshotRestore` 的结果传入 `restoreRunState`，验证真实快照恢复顺序。
- 复验：`npm run build` 通过（114 模块；JS 1,768.18 kB，gzip 467.62 kB；仅有 Vite 默认分包建议）；`npm run smoke:round-21` 通过，包含 12 阶段分页和预检后恢复；`npm run validate:data` 通过（manifest + 19 项）；`npm run smoke:round-20` 通过；`git diff --check` 通过（只有 LF→CRLF 提示）。

## Round 20 — 擂台挑战与战绩（2026-09-27）

### 计划与实现

- 开工前新增 iterations/round-20/plan.md，估计人类工程师工时约 28 小时，拆分协议装配、报名/连战界面、奖励与存档、回归和文档四项子任务。
- 新增可选 arena-set 资源与 draft-07 Schema；引擎防御解析擂台、对手和战绩，世界装配检查地图入口、玩家出生格、NPC/遭遇冲突、模板/武学/彩头引用，入口冲突会隔离擂台并提供 warning。
- 新增南市武擂原创两轮赛程，玩家出生点旁增加金色入口标记与 E 邻接报名页。报名面板列出规则、对手、完整彩头和历史战绩；报名前预检物品容量/银两上限。
- 报名后按序封装现有 CombatSession，胜利经验和伙伴援护照常结算；下一轮自动开启。擂台战斗不发野外遭遇任务信号；败北/撤退记录已胜场，通关才完整发奖。
- 本地存档 v1 新增擂台战绩册字段；Round 19 及更早档案缺字段默认为空。更新擂台设计、数据指南、GDD、架构、存档说明和路线图。
- 新增通用 Ajv 基础资料验证脚本和 Round 20 引擎冒烟脚本，作为后续轮次可复用的校验入口。

### 验证

- npm run build：通过，TypeScript 检查无错误；Vite 完成 112 模块生产构建，主 JS 1,750.05 kB（gzip 463.68 kB），超过 500 kB 建议线但不阻断构建。
- npm run validate:data：manifest 与全部 18 个登记基础资源通过 Ajv Schema 校验。
- npm run smoke:round-20：通过；覆盖擂台解析、入口/敌方武学/奖励引用装配、NPC 占格坏引用隔离、邻接选择、两场连续敌方的通用战斗胜利/经验结算、战绩值域及旧/新 v1 存档捕获、解析与恢复。
- 本地浏览器打开 Vite 游戏页，确认启动到游戏画布且可访问；未执行键盘逐场手动连战，核心系统以脚本冒烟验证覆盖。
- git diff --check：通过；仅有 Git 对 LF/CRLF 的自动转换提醒。

### 边界与后续

- 当前只有一座原创擂台和两轮对手；战绩可累积但暂不提供按胜率排序的全服榜单。
- 中途退出不会发放部分彩头；报名页事先锁定全套奖励容量，玩家无法用比赛期间的背包操作改变空间。

---

## Round 19 — 同行伙伴与战斗援护（2026-09-27）

### 计划与实现

- 开工前新增 `iterations/round-19/plan.md`，估计人类工程师工时 24–32 小时，拆分伙伴协议/装配、对白与场景 UI、战斗资料、存档/文档/验证四项子任务。
- 新增独立可选伙伴资源、draft-07 Schema、Phaser-free 防御解析与 NPC 跨资源引用装配；加入单伙伴同行状态和安全跟随格纯函数。
- 对话增加 `recruitCompanion` / `dismissCompanion` 原子效果；顾夜尘的原创对白须先递话、建立关系后才出现同行邀请。
- GridScene 将同行 NPC 从静态日程与碰撞索引中移除，程序绘制的跟随标记按移动前格或相邻可走格刷新，穿越地图时重置并允许伙伴随队跨区。
- 回合战斗按数据声明的行动间隔自动执行平伤援护或治疗，日志独立标色；P 键伙伴册查看关系、说明和支援并暂离。
- v1 快照增加 `activeCompanionId`，读取缺字段旧档为 `null`；对已删除伙伴恢复为空队伍并输出 warning。

### 验证

- `npm run build`：通过，`tsc --noEmit` 和 Vite 生产构建均完成；主 JS 包超过 500 kB 建议线但构建成功。
- Ajv 临时 harness：manifest 与全部 17 个登记基础资源共 18/18 通过（16 种资源 schema）。
- Phaser-free Node 22 临时 harness：20/20 通过，覆盖伙伴 Schema 语义边界、坏 NPC 引用逐伙伴隔离、实际对白关系门槛与效果解析、条件选项可见性、跨效果事务回滚、招募/暂离、对话悬空伙伴选项隔离、跟随格首选/避障回退、按间隔触发战斗伤害，以及旧 v1 缺字段/已删除伙伴清理。
- `git diff --check`：通过；Git 仅提示工作区 LF 将在后续写回时转换为 CRLF。临时 harness/loader 均已删除。

---

## Round 18 — 社会声望与门派态度（2026-09-27）

### 计划与实现

- 开工前新增 `iterations/round-18/plan.md`，预计人类工程师工时 20–28 小时，拆为社会状态/门派规则、对白协议与原子事务、存档/UI、资料与验证四项子任务。
- 新增 `SocialChange` 中心化善恶、江湖个人声望、逐派声望和逐 NPC 关系变化；每个作用域独立钳制，派别声望未初始化时视为 0。
- 扩展门派资料解析和 Schema：拜师可声明本门声望下限，退门可声明本门声望增减；缺省退门值归一为 0。J 师门页展示全局值、逐派值和相关要求。
- 对话 Schema/解析/引用校验/运行时支持门派声望条件与调整效果；效果沿用 staged copy 全量验证后提交。示例拜师奖励 +10 本门声望，听雨剑阁新增门槛分支。
- v1 存档新增 `social.factionRenown`；读取缺字段旧档归一为空列表，恢复时过滤已删除门派并给出 warning。

### 验证

- `npm run build`：通过，`tsc --noEmit` 无错误，Vite 转换 108 个模块并完成生产构建；主 JS 包 1,724.10 kB，超过 500 kB 建议线但构建成功。
- Ajv 临时 harness：manifest + 16 个登记基础资源共 17 项全部通过；新增门派字段组合也通过 `faction-set` Schema。
- Phaser-free Node 22 临时 harness（`node --no-warnings --experimental-strip-types --experimental-loader ./.tmp-ts-loader.mjs .tmp-round18-smoke.mjs`）：41/41 通过，覆盖四类社会边界、派别旧资料默认值、新字段解析/Schema、拜师后本门声望与分支解锁、最低本门声望门槛、退门代价、失败后续效果回滚、坏门派引用逐选项隔离、逐派声望捕获/读档/越界与重复 id 拒绝/移除门派过滤及旧 v1 缺字段兼容。临时 harness 与 loader 在提交前移除。
- `git diff --check`：通过；Git 仅提示工作区 LF 将在下次写回时转换成 CRLF。

---

## Round 17 — 条件奇遇与传闻记录（2026-09-27）

### 计划与实现

- 实现前新增 `iterations/round-17/plan.md`，预计人类工程师工时 18–26 小时，拆为事件协议/跨资源语义校验、纯规则判定与场景接线、渡口见闻资料/文档、验证修正四项子任务。
- 扩展 `world-map` Schema 和 Phaser-free 协议，区域事件可组合已知图谱节点、历法时段和天气条件（组间 AND、组内 OR），并可在触发时发现百科节点。
- `world-loader.ts` 将当前图谱节点、历法时段与气候天气 id 交给地图装配器；无效图谱/时段/天气引用只隔离一条区域事件并生成诊断。
- GridScene 在成功移动完成、跨区抵达和 V 等候后重查当前格；门槛未满足不会记完成，一次性完成 id 和新百科节点继续使用既有 v1 字段。等候通知与触发见闻会合并。
- 渡口入口记录脚印线索；茶棚对白现只记下脚印，芦苇边的第二条奇遇要求已知脚印、黄昏/入夜、细雨/降雨/骤雨，成功后发现“芦苇河滩”。
- 更新区域事件、百科、资料协议、架构和存档说明。未新增存档字段或依赖。

### 验证

- `npm run build`：通过；`tsc --noEmit` 无错误，Vite 完成生产构建。主 JS 包超过 500 kB 建议线，但构建成功。
- Ajv 校验 manifest 与全部 16 个登记基础资源（含 world-map 和 dialogue-set）：17/17 通过。
- 临时 Node 22 Phaser-free harness：通过。校验实际世界地图 Schema/解析/装配、旧无条件事件兼容、缺线索与错误时段阻挡、时段/天气候选门槛、一次性完成筛选、百科发现只返回首次节点及悬空图谱/历法/气候引用逐条禁用。
- `git diff --check`：提交前复核。

### 边界与后续

- 奇遇当前只在玩家所在的精确格、成功移动完成/跨区抵达/等候后检查；没有后台广播或 NPC 传闻传播，后者可在社交记忆轮次继续扩展。
- 示例事件要求傍晚降水，因此玩家可在格上用 V 等候到条件满足；当前每日天气确定性继承世界种子。

---

## Round 16 — NPC 时段日程与派生占位（2026-09-27）

### 计划与实现

- 开工前新增 `iterations/round-16/plan.md`，预计人类工程师工时 18–26 小时，分为 NPC 日程协议、历法/地图/遭遇交叉校验、场景与存档运行时接线、内容/验证/交付四项子任务。
- 扩展 NPC Schema、解析器与六名原创 NPC 日程资料；新增 Phaser-free `npc-schedule.ts`，按历法时段预编译位置，检查坐标、出生点、固定遭遇和 NPC 互占，坏日程项回退基础位置并产生诊断。
- GridScene 在启动/读档、时段切换及跨区抵达时更新标记、姓名牌、逻辑占位与交互目标；玩家格优先，NPC 坐标继续由地图和 `elapsedGameMinutes` 派生，不写入存档。
- 浏览器初测发现快照玩家可合法站在“按时段迁走的 NPC 原基础格”，但存档恢复预检仍用静态基础坐标拒绝该位置。将运行期与存档预检共用 `resolveNpcPlacementsForPlayer`，按快照地图、时段、玩家格和有效遭遇计算一致的人物占位后，刷新读档通过。
- 新增 `docs/NPC-SCHEDULES.md`，更新架构、地图、资料、存档、GDD、README、路线图及变更日志。

### 验证

- `npm run build`：通过；`tsc --noEmit` 无错误，Vite 完成生产构建。主 JS 包超过 500 kB 建议线，但构建成功。
- Ajv 检查 manifest 与全部 16 个登记资源：17/17 通过。
- Phaser-free 场景冒烟验证：验证玩家站在已迁走 NPC 的基础格不被 NPC 占用判断挡住；玩家占据日程目标时移动 NPC 回到安全基础格；有效占位不会覆盖玩家/固定遭遇。
- 浏览器手动回归（本地 Vite `http://127.0.0.1:5199/`）：创建角色后推进到日中，观察沈墨涵/马尚义等日程位置变化；移动到沈墨涵附近后成功打开其对话；在空槽二保存、刷新、重新读取，第一次复现的错误已消失，HUD 仍显示 `10:11 · 日中`、玩家恢复到 `(4,1)`，移动人物位于可用格且交互/占位正常。
- `git diff --check`：通过。

### 边界与后续

- 每个 NPC 的日程仍只影响自己的 `mapResourceId` 地图，不会跨区域自动传送；非日程时段沿用基础地点。发生玩家/遭遇即时占位冲突时移动 NPC 回退基础点，若仍不可用则该时段暂不显示。
- NPC 派生坐标不新增存档字段；正式 Vitest 基线与更广的日程跨资料单测仍排在 Round 38。

---

## Round 15 — 季节与数据驱动天气（2026-09-27）

### 计划与实现

- 实现前新增 `iterations/round-15/plan.md`，预计人类工程师工时 18–26 小时，拆为气候资料协议、确定性气候规则、运行时/存档接线、验证/文档/提交四个子任务。
- 新增必需 `climate.base`（`data/base/worldview/climate.json`）和 draft-07 `climate.schema.json`。四季分区既有日历十二个月，各自声明天气权重；天气资料配置色调、降水种类/密度和网格步附加分钟数。加载阶段的 Phaser-free 解析逐条查季节/天气 id 唯一、月份不重叠且完整覆盖历法、权重 id 有效和权重和为正；无效气候作为关键资源给可读错误并停止世界装配。
- 新增 `src/engine/climate-system.ts`：使用 u32 世界种子和历日确定每日加权天气，不依赖真实时钟；季节由当前历法月映射。重复种子/历日/气候资料会复现天气。
- 新开局生成世界种子；v1 存档增加 `worldSeed`，解析时检查 u32；Round 14 及更早存档缺字段时补固定种子 1。存档捕获及 GridScene 读档/新开局接线均保存该种子。
- `GridScene` HUD 新增季节、天气与步耗时行；天气色调绘制于世界层，雨雪使用程序生成纹理/粒子，不使用外部素材。只有成功网格步行叠加气候 `stepMinutes`；被阻挡动作不耗时，关口旅行和 V 等候保持日历耗时规则。
- 新增 `docs/CLIMATE.md`，更新架构、数据指南、存档协议、GDD、README、CHANGELOG 和路线图。

### 验证

- `npm run build`：通过；`tsc --noEmit` 无错误，Vite 转换 107 个模块并完成生产构建。主 JS 包 1,712.46 kB / gzip 453.82 kB，超过 500 kB 建议线但不阻断。
- 临时 Ajv harness 校验 `manifest.json` 与其登记的 16 个基础资源，合计 17/17 通过；覆盖新增 `climate.base` Schema。
- 临时 Node/TypeScript transpile 冒烟 harness：33/33 通过——基础日历/气候合法解析、十二个月映射到四季、同日与多实例天气稳定、逐日哈希、首末权重边界、种子 0/中位数/NaN 回退、月份缺失/天气悬空/重复天气 id/零权重总和拒绝、旧 v1 种子归一、u32 上界有效与负数/溢出拒绝、捕获和 JSON 往返保持种子/分钟数。harness 为 stdin 临时脚本，未留入仓库。
- 浏览器手动验收（Vite `http://127.0.0.1:5199/`）：推进游戏时间跨越多日；第 10 日显示春季细雨和雨线粒子，HUD 为“行走 +1 分/格”；向左成功移动后位置从 `(8,7)` 到 `(7,7)`、时钟从 00:01 到 00:03；向下撞墙后时间仍为 00:03；V 等候再推进固定 60 分钟。保存至本地测试槽、刷新并从继续游戏读档后，仍恢复第 10 日 01:03 的细雨和步耗时显示。
- `git diff --check`：通过，无空白错误；Git 提示工作副本 LF 文件可能转换为 CRLF，与仓库既有 Windows 行尾行为一致。

### 边界与后续

- 当前天气每个游戏日固定不变，天气只影响画面与步行耗时，不影响战斗命中、伤害或 NPC 日程；后续轮次可复用气候状态扩展战斗、任务或 NPC 行为。
- 旧存档使用固定种子保证天气稳定，不从角色名或旧进度推导个体化气候；正式 Vitest 基线仍安排在 Round 38。

---

## Round 14 — 游戏内时间、历法与昼夜循环（2026-09-27）

### 计划与实现

- 实现前写入 `iterations/round-14/plan.md`，预计人类工程师工时 20–28 小时，拆分历法资料契约、时间规则与对话、运行时/显示/存档、回归与交付四项子任务。
- 新增必需资源 `calendar.base`（`data/base/worldview/calendar.json`）与 `game-calendar` draft-07 Schema：原创"青阳—岁除"十二月历（各 30 天）、子夜/拂晓/晨光/日中/午后/黄昏/入夜七时段（含照度）、起始时刻与动作耗时（步 1 分钟、旅行 45、等候 60）。
- 新增 Phaser-free `game-calendar.ts`：防御解析 + 语义校验（月份/时段 id 唯一、时段起点互异、必含零点时段、起始引用与当月天数、耗时范围），`GameClock` 以已过分钟数为唯一权威状态按需折算年月日并做循环时段查询；跨午夜时段无需特判（零点时段必然存在）。历法接入 manifest 语义校验器，未登记/无效时给可读错误面板并拒绝加载。
- 对话协议全线加入 `timeOfDay` 条件：dialogue-set Schema、防御解析、装配期对照历法剔除悬空时段引用的选项、运行时以时钟当前时段 id 求值；书铺对话新增黄昏/入夜两个示例选项。
- v1 存档新增 `elapsedGameMinutes`（只存分钟计数，日期随时由当前历法折算，改月份长度不产生矛盾日期）；旧 v1 快照缺字段归一为 0，从历法起始时刻恢复。
- `grid-scene.ts`：只在成功移动、成功区域旅行、V 键等候后推进时间；时间 HUD 显示"第X年 月名X日 HH:MM · 时段"；昼夜调色层用固定深度带（世界 0 < 调色 50 < HUD 文本 60 < 面板 1000+）夹在世界图像与 UI 之间，按 `1 − 照度`（封顶 0.55）渐变，区域切换重建世界层后仍稳定覆盖；H 帮助与 HUD 快捷行列明 V 键，任何面板打开时等候被阻止。
- 新增 `docs/DIALOGUE-GUIDE.md`；更新 GDD、架构、数据规范、存档文档、README、ROADMAP、变更日志与本日志。

### 验证

- `npm run build`：通过，`tsc --noEmit` 无错误，Vite 转换 106 个模块并完成生产构建（主 JS chunk 1,703.68 kB / gzip 450.78 kB，超过 500 kB 建议线但不阻断）。
- 临时 Ajv harness（`node .tmp-ajv-check.mjs`，用仓库 Ajv 依赖读取 `data/schema/` 与 manifest 全资源后删除）：manifest + 15 个登记资源全部 PASS（含 calendar.base 与扩展后的 dialogue-set），16 项校验 0 失败。
- 临时 Phaser-free 冒烟 harness（`npx tsc .tmp-smoke.ts --outDir .tmp-smoke-out --module commonjs …` 编译后 `node` 运行，完毕删除输出与源文件）：39/39 通过——历法语义拒绝（缺零点时段/重复 id/重复起点/悬空起始月/起始日越界/零旅行耗时/空月份）、时钟边界（午夜翻转、跨月/跨年、短月 2 天跨年、整年 32×1440 分钟精确、时段起点 0 分钟处命中、零/负/NaN 不推进）、对话时段条件（解析、匹配/不匹配、悬空时段只剔除该选项并产生可读警告、显隐过滤）、存档（捕获/JSON 往返、旧 v1 缺字段归一 0、负数/小数拒绝、槽位写读、恢复预检透传分钟数、旧档时钟从历法起点重建）。
- 提交前独立审查发现 `GameClock.advance(0.5)` 虽不改变分钟计数却返回成功；已改为拒绝非整数/不安全分钟并阻止累计溢出，构造器拒绝非安全初值，日期折算将经过分钟拆成日与日内余数以保证最大安全计数下仍精确。直接 Node 冒烟断言 19/19 通过，覆盖分数、负数、NaN、无穷大、越界整数及累计溢出拒绝，午夜/月界和 `Number.MAX_SAFE_INTEGER` 分钟精度。
- 最终复验：`npm run build` 通过（106 个模块）；Ajv manifest + 15 个登记资源 16/16 通过；`git diff --check` 通过。Vite 主 bundle 1,703.73 kB（gzip 450.80 kB），仍超过 500 kB 建议线但不阻断。
- 浏览器手动验收（Vite dev + Playwright，`http://localhost:5176/`）：新游戏后 HUD 显示"第1年 青阳1日 08:00 · 晨光"；单次 V → 09:00 并提示"静候片刻（60 分钟）"；H 帮助列出 V 键且打开期间 V 被阻止（时间不变）；连按 V 至入夜后世界层被夜幕覆盖而 HUD/面板全部清晰；单步移动 19:00→19:01；被墙阻挡的 8 次方向键零时间消耗（11 次 V + 2 次有效步 = 662 分钟与存档一致）；入夜时段沈墨寒 about-scroll 显示"（夜色正浓）"选项且黄昏选项正确隐藏（morality 条件照常过滤）；暂停保存 slot-1（elapsedGameMinutes=662）→ 刷新 → 继续江湖 → 精确恢复 19:02 入夜与夜色；用 `localStorage` 删除 `elapsedGameMinutes` 字段模拟 Round 13 旧档 → 刷新载入 → 恢复为 08:00 晨光。验证写入发生在本地测试浏览器槽位，不进入仓库资料。
- 已知环境干扰：截图 CDN 对相同本地路径返回缓存帧，验证以 localStorage/控制台读数与多文件名重截图为准；一轮重测确认时段显隐正确。
- `git diff --check`：通过（无空白错误；Git 在 Windows 工作副本的 LF→CRLF 提示为既有现象）。

### 边界与后续

- 时段切换为 600ms 透明度过渡，不做实时连续天色渐变；天气/季节对移动战斗的影响按路线图进入 Round 15，NPC 按时段的行动日程进入 Round 16。
- 历法缺失/无效的浏览器端破坏性验证未执行（需临时破坏 manifest）；该路径由 world-loader 显式检查 + 冒烟语义拒绝覆盖，错误面板文案已审读。
- 旧档恢复从历法起始时刻继续是计划规定的兼容语义；跨协议版本迁移仍明确不做。

---

## Round 13 — 拜师、师门关系与退门规则（2026-09-27）

### 计划与实现

- 实现前写入 `iterations/round-13/plan.md`，预计人类工程师工时 18–24 小时，拆分门派规则契约、身份/存档与事务接线、师父/对白/UI、跨系统回归交付四项子任务。
- faction JSON 与 Schema 新增导师 NPC、等级/属性/善恶/声望/师徒关系/已完成差事门槛，以及退门许可、善恶与声望变化、是否遗忘门派武学；旧门派资料按宽松规则解析。
- 新增 Phaser-free `faction-system.ts`，负责唯一师门关系及统一入门资格检查。对话条件支持当前门派与武学资格，效果支持拜师、退门、授艺；逐效果事务副本包含师门和掌握武学状态，后续效果失败时不会泄漏前置改动。
- v1 存档新增可空 `factionMembership`；更早快照缺字段时归一为无门派，当前资料中失效门派/导师只清除该身份并给出警告。
- 三个现有门派分别新增原创导师与地图/图谱/对话资料；GridScene 将角色身份保存并恢复，J 键师门页显示导师、门槛和退门规则，H 键帮助同步列出该快捷键。
- 更新 GDD、数据指南、架构、存档、README、ROADMAP 与本日志。

### 验证

- `npm run build`：通过，`tsc --noEmit` 无错误，Vite 转换 105 个模块并完成生产构建；Phaser 主 bundle 超过 500 kB 建议线但不阻断。
- Ajv 脚本校验 `manifest.json` 及其 14 个登记资源：全部通过，覆盖 faction/dialogue 新 Schema。
- Phaser-free 情景 harness 通过入门门槛、导师身份、拜师/重复拜师、门派武学授艺、失败效果整笔回滚、退门善恶/声望惩罚与武学遗忘、旧 v1 快照缺字段和失效导师预检。
- 浏览器手动验收：新游戏后 J 页显示三派导师和入门/退门规；H 帮助含 J 键；到叶庭舟处选择拜师，资料不足时准确提示“悟性需达到 9（当前 8）；与师父的关系需达到 5（当前 0）”，选择请教后显示关系 +5；经区域关口到雾雨渡口，闻素心对话成功拜入云隐山庄，J 页显示弟子身份与师父。
- 存读档手动验收：在渡口暂停保存至存档一，重载页面后从“继续游戏”载入，J 页仍显示“云隐山庄弟子 · 师从闻素心”。验证写入发生在本地测试浏览器槽位，不进入仓库资料。
- `git diff --check`：通过；Git 另有 LF→CRLF 工作副本提示，无空白错误。

### 边界与后续

- 本轮只保存当前唯一师父与所属门派；熟练度增长、拜师后的门派声望和多师承仍留给后续系统轮次。
- Git 在 Windows 工作副本报告 LF→CRLF 转换提示；以 `git diff --check` 的最终结果为准。

---

## Round 12 — 像素 UI、字号反馈与操作可读性（2026-09-27）

### 计划与实现

- 开工前写入 `iterations/round-12/plan.md`，预计人类工程师工时 14–18 小时，拆成像素渲染/占位美术、统一界面主题、帮助与输入回归、小屏验收交付四个子任务。
- 新增 `src/game/ui-theme.ts`：统一原创 UI 字体回退、掌机色板、阶梯面板框、非颜色单一依赖的选中底条，以及代码生成的人物像素标记。菜单、对话、战斗、背包、商店、任务、暂停、舆图和百科接入共享面板 chrome；主要选择列表接入底条。
- Phaser 启用 `pixelArt` / `roundPixels`，CSS 对 canvas 使用最近邻像素缩放；`grid-map-renderer.ts` 基于地图资料颜色推导瓷砖亮边/暗边。玩家与 NPC 改用通用几何像素人物，不加入外部素材或世界内容。
- 新增 `controls-ui.ts` 与探索 H 键操作手册；帮助覆盖层和所有现有面板互斥，期间锁定探索移动，H/Esc 关闭后恢复。HUD 改为精简提示，探索 HUD 与人物/敌人名牌字号目标在设置变化后刷新。暂停关闭时将面板最新设置同步回 GridScene。
- 战斗招式列表以当前选择所在窗口分段显示并保留撤退项可达性；任务详情区依文字对象实测高度继续排布；角色创建页启用 CJK 高级换行。
- 更新 GDD、架构说明、README、路线图、变更日志与本开发日志。

### 验证

- `npm run build`：通过；`tsc --noEmit` 无错误，Vite 转换 103 个模块并完成生产构建。主 JS chunk 1,681.64 kB（gzip 444.44 kB），超过 Vite 500 kB 建议线但不阻断。
- Ajv 临时内联 harness：manifest 与 14 个登记资源通过；manifest 共用 grid-map Schema，实际使用 13 类资源 Schema，加 manifest Schema 合计 14 份契约。第一次 harness 未按 Schema id 缓存编译器，重复 id 被 Ajv 拒绝；调整验证器缓存后重跑通过，未产生临时文件。
- 浏览器手动流程（当前 819px 宽的较窄页面视口）：新游戏/角色创建文字换行、探索地图标记、HUD 与地图名分栏、H 帮助打开/方向键不移动/H 与 Esc 关闭、K 百科筛选/移动焦点、B 背包焦点、Q 任务日志、M 舆图、暂停设置调大字号后 HUD/名牌立即变大且重开设置仍显示“大”。将测试字号恢复为原先的“标准”。
- 本执行环境只提供约 819px 宽的浏览器视口，且 CUA 未提供视口尺寸控制；本轮未覆盖常规桌面宽度，后续应补做该窗口尺寸的浏览器验收。
- `git diff --check`：通过；Git 提示既有的工作副本 LF→CRLF 转换，不存在空白错误。

### 边界与后续

- 本轮浏览器默认画布宽度小于 960 逻辑像素，已验证 FIT 缩放下无 HUD 标题碰撞；尚未用 MOD 扩大武学集合实测战斗分页，也未用超长 MOD 任务目标压力测试任务详情，需要后续内容轮/回归轮继续覆盖。
- UI 使用系统等宽字体回退与程序图形；授权像素字库和正式原创 sprite 管线仍应单独审查素材来源与许可。
- Round 13 按路线图进入拜师、师门关系和退门规则。

---

## Round 11 — 知识图谱、江湖百科与见闻条件（2026-09-27）

### 计划与实现

- 开工前编写 `iterations/round-11/plan.md`，估算人类工程师工时 12–16 小时，拆分图谱协议/装配、知识与对话/存档接线、百科 UI/玩法验证、文档与回归四项子任务。
- 新增知识节点与关系两份独立 draft-07 Schema 和 manifest 资源，基础资料含 22 个节点、10 条边，覆盖全部 8 类节点；引擎协议支持全部 12 种关系。`knowledge-graph.ts` 不依赖 Phaser，负责防御解析、重复 id 首条保留、关系悬空端点隔离、公开知识初始化及双方已知关系查询。
- `dialogue-graph.ts` / `dialogue-runtime.ts` 新增 `knowledgeKnown` 条件和 `discoverKnowledgeNode` 效果，知识引用参与逐选项跨资源校验；一次效果事务先验证后提交，发现效果幂等。原创对话可解锁镇外地点和雨后脚印，并由后续对话使用已知信息。
- `encyclopedia-ui.ts` 实现 K 键百科，支持 8 个分类及全体视图、方向键/WASD 选择；未解锁资料汇总为泛化条目，关系仅在双方均已知时出现。GridScene 管理面板互斥和探索输入锁。
- v1 存档新增 `knownKnowledgeNodeIds`；旧 Round 10 存档缺字段时补空数组，恢复预检并入当前公开词条、滤掉图谱已删除 id。新增 `docs/KNOWLEDGE-GRAPH.md`，更新 GDD、架构、数据指南、存档说明、README、ROADMAP、CHANGELOG。

### 验证

- `npm run build`：通过，TypeScript 检查无错误；Vite 转换 101 个模块并完成生产构建。主 JS chunk 1,677.45 kB（gzip 443.05 kB），仍超过 500 kB 建议阈值。
- Ajv harness：manifest 和 14 个登记资源均通过，实际登记的 14 份 schema 契约均可用。
- Rolldown 临时引擎 harness：图谱解析/公开词条初始化/隐藏未知边、重复节点与关系/悬空边隔离、知识条件门控/发现效果/悬空知识选项剔除/事务失败不部分提交、旧 v1 存档字段缺省与公开词条恢复共四组断言通过；临时文件已移除。
- 浏览器手动流程：新局按 K 打开百科，查看已知关联；未解锁项只显示“未解锁见闻”，方向输入不会移动玩家。与陆贞娘交谈后选择追问，反馈新增“雨后的脚印”和“芦苇河滩”两项；百科已知数由 17 增至 19，重新交谈后知识条件选项出现。保存至测试浏览器的空一号槽，刷新后从继续菜单读档，百科仍恢复已知数 19，位置保持在 `(4, 5)`。
- `git diff --check`：通过；Git 仅提示仓库既有的 LF→CRLF 工作副本转换。

### 边界与后续

- 当前示例为 22 个节点、10 条边；最终目标 100+ 节点、3 个结局及丰富关系尚未达到，按 ROADMAP 后续内容轮扩充。
- 玩家见闻可驱动个人对话，但 NPC 间情报传播/态度图谱安排在 Round 26；百科绘制和键位可读性留给 Round 12 继续打磨。
- 正式 Vitest 基线仍排在 Round 38；本轮使用临时 harness 与实际浏览器流程验证。

---

## Round 10 — 世界地图、跨区旅行与区域事件（2026-09-27）

### 计划与实现

- 开工前编写 `iterations/round-10/plan.md`，估算人类工程师工时 10–14 小时；拆分多地图资料协议/装配、区域旅行与事件、存档兼容、验证/交付四项子任务。
- 新增 `world-map` draft-07 Schema、Phaser 无关解析/装配器 `src/engine/world-map.ts` 和原创区域资料/第二张地图。加载器现在按 schema 族发现登记地图，要求地图内 id 与 manifest 资源 id 相同，并以 world map 解析起始区域、关口与事件；逐图装配 NPC/遭遇并隔离无效引用及占位冲突。
- `GridScene` 增加当前区域生命周期、关口安全旅行、一次性区域事件、区域名/提示 HUD 与 M 键舆图；舆图开启时锁定探索输入，E 键按 NPC、遭遇、关口优先级处理交互。新增的图层按区域重建，旧地图对象不会残留。
- 存档快照增加当前地图和已完成区域事件 id；预检根据所存地图的几何/NPC/遭遇占位恢复。Round 09 v1 快照缺少 `completedRegionalEvents` 时解析为 `[]`，现有槽位结构无需升级版本。
- 更新 README、ROADMAP、CHANGELOG、架构、数据指南、存档说明，并新增 `docs/MAP-ATLAS.md`。

### 验证

- Ajv 临时检查：manifest + 12 份 manifest 登记资源共 13 份 JSON 文档全部通过；覆盖 11 个资源 schema。临时检查脚本验证后删除。
- Rolldown 世界图引擎 harness：真实地图和 world map 解析/装配、区域/关口/事件数量、相邻关口确定选择、坏目的地图关口逐条隔离、缺失起始地图致命诊断、错误事件容器防御拒绝，均通过；临时源码和 bundle 已清理。
- 浏览器手动流程：新游戏进入起始区域；M 显示两区域舆图并高亮当前区域，开图时方向键不能移动；步入事件格提示事件，E 经关口抵达渡口并可往返；在不同区域保存后继续读取，均恢复对应地图与坐标；一次性事件回程并读档后不重复提示。
- 旧存档兼容：浏览器临时页面读取自行创建的 `slot-1` 快照副本，删除 `completedRegionalEvents` 后交给 `parseSaveSnapshot`，结果成功且字段归一为空数组；未改写 localStorage，随后关闭页面并删除临时文件。
- `npm run build`：`tsc --noEmit` 与 Vite 生产构建通过，99 个模块；JS bundle 1,666.25 kB（gzip 440.17 kB），Vite 对超过 500 kB 的主 chunk 发出非阻断建议。
- `git diff --check` 通过；仅有 Git 对 LF→CRLF 工作副本转换的既有提示。

### 未做与风险

- 本轮只有两张区域地图；跨图内容和事件效果继续随路线图扩展，区域事件当前提供数据驱动的一次性/重复提示。
- 没有新增持久化自动化测试；本轮使用临时 Ajv/Rolldown harness 与浏览器流程，正式 Vitest 基线仍按 ROADMAP Round 38 计划。
- 生产 bundle 超过 500 kB 建议线仍未处理，后续 R40 性能轮次再评估代码分包与地图加载成本。

---

## Round 08 — 语义解析错误局部隔离追修（2026-09-27）

### 计划与实现

- 追加 Round 08 追修计划：Schema 接受的反向条件范围会被 `parseDialogueSet` 的语义校验拒绝；旧实现把一段解析错误返回为整份对话集失败。
- `parseDialogueSet` 现在把逐段解析问题作为局部 warning 返回，只收录完整有效的对话；坏段不再丢弃同集合内的合法对话。顶层 envelope 错误仍拒绝整份集合。
- `world-loader` 将解析器局部 warning 纳入世界装配告警，并继续索引/装配其他有效对话；静态 Schema 校验仍由通用数据加载器在资源级执行。
- 更新 dialogue-set Schema 描述、架构降级表、资料指南、路线图与变更日志，说明 draft-07 无法表达上下界大小关系及其运行时隔离边界。

### 验证

- `node_modules/.bin/rolldown tmp-r08-dialogue-isolation-smoke.ts --platform node --format esm --file tmp-r08-dialogue-isolation-smoke.mjs` 后运行 `node tmp-r08-dialogue-isolation-smoke.mjs`：通过。Ajv 接受三类值域内的反向范围；解析器逐段隔离善恶、声望、NPC 关系三个错误对话，保留合法旧式对话；直接解析时单条坏记录也只产生局部 warning，坏顶层 envelope 仍拒绝。
- `npm run build`：通过，`tsc --noEmit` 与 Vite 生产构建成功（97 个模块）；主 chunk 超过 500 kB 仍只有非阻断建议。
- `git diff --check`：通过；只出现仓库现有的 LF→CRLF 工作副本提示。

### 边界

- Ajv 能检测到的静态结构/协议错误仍由通用加载器按资源级拒绝；本追修隔离的是资源通过静态 Schema 后由解析器发现的逐段语义问题。未改变原始对话资料，也未新增持久自动化测试文件。

---

## Round 09 — 2026-09-27

### 计划与实现

- 开工前写入 `iterations/round-09/plan.md`，目标是主菜单/角色创建、版本化三槽存档、场景内保存、恢复前预检和两项持久设置；计划拆成存档协议、开局菜单、进度恢复与暂停、设置/验证四个可验证子任务，预计人类工程师工时 10–14 小时。
- 新增 Phaser 无关 `src/engine/save-system.ts`：v1 JSON 快照、槽位适配、字段/范围/重复项防御解析、当前地图/角色/站位预检、悬空次级 id 隔离、恢复数据钳制及运行状态往返。装备通过既有引擎恢复，派生属性与资源上限按当前数据重算；非法写入不会覆盖旧槽。
- 新增 `src/game/menu-scene.ts`、`pause-menu.ts` 与 `settings.ts`，启动后先进入主菜单；支持角色模板选择/显示名、继续/删除、Esc 暂停、槽位保存，以及即时应用并保存的主音量/文字大小。`src/game/world-loader.ts` 提取共享世界数据装配以支持菜单预览和游玩场景使用同一份校验结果。
- 将进度快照接入 GridScene，保存玩家位置、成长、背包装备、商店库存、任务/跟踪、社会状态和已完成一次性遭遇；文档补充协议、局限和下一轮路线。

### 验证

- `node <缓存 esbuild 路径> tmp-r09-save-smoke.ts --bundle --platform=node --format=esm --outfile=tmp-r09-save-smoke.mjs` 后运行 `node tmp-r09-save-smoke.mjs`：83 项通过、0 项失败；检查真实数据 round-trip、非法快照/版本拒绝、三槽读写删除、坏存储/空间不足、世界预检与变更后降级恢复。临时脚本及 bundle 随后删除。
- `npm run build`：`tsc --noEmit` 与 Vite 生产构建通过，97 个模块；JS bundle 1,651.79 kB（gzip 436.54 kB）。Vite 对超过 500 kB 的主 chunk 给出非阻断建议。
- 浏览器手动流程：主菜单显示新游戏/继续/设置；创建角色并设置显示名后进入网格；Esc 打开暂停面板；保存到槽位后列表显示角色摘要和保存时间，返回菜单可见继续入口。截图由临时浏览器工作流采集，未作为产品文件提交。

### 未做与风险

- v1 只支持当前单地图和三个 localStorage 槽，不迁移其他协议版本，不支持云同步；清理浏览器站点数据会清除存档。战斗场景中的即时会话不提供单独保存入口。
- localStorage 不可用时，设置退化为本次会话值，存档操作报告不可用；空间不足时旧槽保持不变。
- 本轮用临时引擎 harness 与浏览器流程验证，没有新增正式自动化测试文件；Vitest 基线仍按 Round 38 安排。生产 bundle 仍超过 Vite 500 kB 建议线。

---

## Round 08 — 2026-09-27

### 计划与实现

- 开工前编写 `iterations/round-08/plan.md`，估算人类工程师工时 10–14 小时；分成协议/Schema/解析、运行时状态与事务执行、UI/场景/原创内容接线、文档验证四个可验证子任务。
- 扩展 `dialogue-set` draft-07 Schema 与 `dialogue-graph.ts`：选项可选 `conditions`（questStatus/itemCount/morality/renown/npcRelationship）与 `effects`（acceptQuest/abandonQuest/giveItem/takeItem/adjustMorality/adjustRenown/adjustRelationship），oneOf + `additionalProperties: false` 封闭协议，未知字段/kind 与越界值两级拒绝；旧无条件对话与既有节点图校验完全兼容。
- 新增 `src/engine/social-state.ts`（善恶 ±100、声望 0–1000、逐 NPC 关系 ±100，钳制即时生效）与 `src/engine/dialogue-runtime.ts`（条件求值、可见选项过滤、装配期跨资源引用校验——坏引用只剔除相应选项、效果两阶段事务——先全量验证可行性再统一提交，任一被拒零变更且不转移节点）。`item-system.ts` 公开 `grantItems`/`removeItems` 提交原语；物品变动经 `item-count` 信号同步活动任务收集目标（进度可回退，文档明示）。
- `dialogue-ui.ts` 支持场景注入的过滤/执行控制器与效果反馈行，无控制器时按纯跳转播放（向后兼容）；全部选项被过滤的节点按结束节点收束。GridScene 持有社会状态、接线对话装配第二遍引用校验，新增 F 键直接交谈，任务发布人 E 名录/F 对话双入口并在提示行并列显示。
- 示例数据扩展（全原创）：马尚义对话按任务 offered/active/completed + 物品数量分支（接取、进度、放弃、交付回春膏并提升关系与声望）；沈墨涵残篇温和/强硬双交付（善恶分岔）；陆贞娘声望门槛与关系寒暄；顾夜尘带话提升关系（省略 npcId 的隐式目标）后解锁新选项；姜百味帮忙获赠清心丸。
- 更新 README、ROADMAP、CHANGELOG、GDD、ARCHITECTURE 与 DATA-GUIDE（对话条件/效果规范、坏选项隔离与降级行为）。

### 验证

- `npm run build`：`tsc --noEmit` 与 Vite 生产构建通过，92 个模块；最终 JavaScript bundle 1,610.57 kB（gzip 424.95 kB），Vite 仍发出主 chunk 超过 500 kB 的建议。
- 临时 Node/Rolldown/Ajv 冒烟检查 42 项全部通过：旧数据与新协议数据通过 Schema、未知字段/未知 kind/delta 0/越界值/空数组/缺失上下界被拒；正式对话图校验与条件/效果解析；开局 board 仅显示 2 个 offered 选项、对话接取快照收集进度 1/3、接取后选项集合切换；已激活任务再接取组合被拒且背包/任务零变更（回滚）；物品不足交付被拒；交付后活动任务收集目标 1→0 回退；满背包 giveItem 被拒；善恶 100+50 钳制 100；省略 npcId 的关系效果作用于对话对象；悬空引用选项剔除后节点变结束节点；对话放弃任务终态 failed。检查脚本与临时打包产物验证后删除，未新增正式自动化测试文件（基线计划为 Round 38）。
- 主代理独立复核：再次运行 `npm run typecheck` 与 `npm run build` 均通过；新增 13 项临时 Rolldown 引擎回归，使用 `node_modules/.bin/rolldown tmp-r08-review-smoke.ts --platform node --format esm --file tmp-r08-review-smoke.mjs` 打包，再用 `node tmp-r08-review-smoke.mjs` 执行，检查正式 JSON Ajv/解析兼容、解析器拒绝未知条件/选项字段、重复接取/交付/发放时整组拒绝且任务/背包/社交状态零变更、悬空选项隔离与条件隐藏；13/13 通过，临时源码和 bundle 已删除。
- 浏览器手动回归（本机 dev 5173 + Playwright）：地图加载无资料警告（仅历史存在的 favicon 404）；走到 (13,1) 提示"按 E 向「马尚义」查看差事 · F 交谈"；F 打开对话 greet 仅 2 选项（关系≥10 分支隐藏），board 仅 2 个 offered 接取（active/completed/交付分支隐藏），Enter 接取显示反馈"—— 已接取「巷口送药」"且 HUD 跟踪"备齐三份回春膏 2/3"；Esc 后 E 打开名录仍显示进行中 2/3（R07 行为保留）；顾夜尘带话显示"—— 与「顾夜尘」关系 +10"，再开对话 blade 节点出现关系≥10 的第三个选项（渐进解锁）。

- 主代理独立浏览器复测（Codex 内置浏览器）：从开局沿走廊到马尚义 (11,1)，F 打开对话并通过 offered 分支接取「巷口送药」，反馈和任务 HUD 同步显示 2/3；Esc 后 E 仍打开任务名录并显示该任务进行中 2/3；重开 F 后 board 只显示 active 进度与另一项 offered 任务。随后在顾夜尘对话中完成带话选择，界面反馈关系 +10；重开对话后 blade 节点出现关系≥10 专属第三选项。浏览器控制台 error/warning 查询为空。

### 未做与风险

- 善恶/声望/关系与对话产生的任务、物品变动均为运行时内存态，刷新后回到新局；存档接入留给 Round 09。
- 门派级声望统一规则、声望对商店价格/战斗的影响留给 Round 18；条件/效果协议目前不覆盖世界状态、时间与知识图谱（R11 起）。
- 示例地图中姜百味 (9,1) 所在行1 中段被 (4,1) 沈墨涵与 (12,1) 马尚义两个占格 NPC 封锁、当前不可步行到达（历史布局遗留，非本轮改动引入）；其 giveItem 对话效果已由引擎冒烟覆盖，地图布局调整留给后续内容轮次。

### 实现后协议一致性追修

- 对照 draft-07 Schema 与 `parseDialogueSet` 检查 Round 08 五种条件和七种效果。发现 `adjustRenown` Schema 允许负变化量至 -1000，但 parser 误将声望状态下界 0 当作 delta 下界，导致合法的负向效果无法进入运行时；其余显式范围/枚举保持一致，范围上下界的交叉比较仍由解析器补足。
- 先将修复计划追记到本轮 `plan.md`，再调整 parser 使用 `-RENOWN_BOUND.max…RENOWN_BOUND.max` 验证 delta；声望最终值仍由社会状态引擎钳制到 0…1000。沈墨涵强硬交付分支加入声望 -2 后果，数据指南和路线图补充区分，避免混淆状态值与变化量。
- 曾委托本机 Claude Code CLI 做只读协议审查；进程因服务端 429（五小时用量上限）退出且未返回审查结果，主代理继续完成代码核对与验证。
- 临时 Ajv + `parseDialogueSet` 协议矩阵覆盖五种条件与七种效果的合法解析、负声望边界（-1000、-1）及非法值（0、-1001、1001、非整数）、越界物品数量与未知效果字段，并验证负值结算钳制到 0、正向声望行为仍正常；27 项断言全部通过。随后以真实沈墨涵强硬交付分支及残篇背包状态执行 Schema、parser 和效果事务集成回归，验证交物、善恶/关系变化及声望从 1 扣减后钳制为 0；11 项断言通过。临时脚本和 bundle 均已删除。
- `npm run build`：`tsc --noEmit` 与 Vite 构建通过，97 个模块；JS bundle 1,651.79 kB（gzip 436.54 kB），仍有超过 500 kB 的既有 chunk 建议。

---

## Round 07 — 2026-09-27

### 计划与实现

- 开工前编写 `iterations/round-07/plan.md`，估算人类工程师工时 8–12 小时；分成任务 Schema/数据装配、Phaser 无关生命周期、UI/场景联动、验证与文档四个可验证子任务。
- 新增可选 `quest-set` draft-07 Schema 和两项原创任务资料：收集回春膏任务及击败巷口刀客任务；新增任务发布人 NPC 与原创告示对话。NPC `questGiver` 为可选字段，旧资料解析为 false。
- `src/engine/quest-system.ts` 实现防御性解析、首声明优先、NPC/物品/遭遇/前置引用校验、循环前置与依赖禁用、锁定/待接/进行/完成/失败状态、接取时收集数量初始化、物品数量同步、战斗胜负事件、主动放弃、单项跟踪和完成奖励结果。奖励经现有成长/背包路径应用。
- `src/game/quest-ui.ts` 和 GridScene 接入任务发布人名录与 Q 键日志；显示状态、目标进度与奖励，支持接取、跟踪/取消跟踪、放弃。商店/背包变化以及战斗结算推送任务事件；奖励后更新银两、经验、HUD 跟踪摘要及提示。
- 更新 README、ROADMAP、CHANGELOG、GDD、ARCHITECTURE 与 DATA-GUIDE，注明坏任务隔离、空任务集降级和运行时进度不持久化。

### 验证

- `npm run build`：`tsc --noEmit` 与 Vite 生产构建通过，90 个模块；JavaScript bundle 1,598.33 kB（gzip 421.58 kB），Vite 仍发出主 chunk 超过 500 kB 的建议。
- 临时 Node/Rolldown/Ajv 冒烟检查通过：正式 manifest/NPC/对话/物品/任务资料 Schema、状态生命周期、收集与战斗目标、奖励只结算一次、跟踪、放弃、失败、前置解锁、坏引用与前置循环隔离；检查脚本与临时打包产物验证后删除，未新增正式自动化测试文件（基线计划为 Round 38）。
- 浏览器手动回归（本机预览 4184）：地图加载时无可见资料警告；发布人名录显示两项任务，接取后日志显示回春膏 2/3；背包/商店补入 1 个后任务自动完成，HUD 显示经验 +15、银两 +18，商店银两随奖励更新；接取击败目标、通过既有遭遇战获胜后任务完成并发经验 +30/银两 +25；新局中接取后按 A，日志显示“已失败”；任务面板打开时方向键不移动玩家。引擎冒烟覆盖配置的遭遇败北失败条件。

### 未做与风险

- 任务接取、进度、跟踪和失败状态仅保存在内存中；刷新会回到新局，存档接入留给 Round 09。
- 本轮未实现对话条件/效果、任务时限、脚本化分支或物品奖励；对话接任务与更多内容规模留给后续轮次。

---

## Round 06 — 2026-09-27

### 计划与实现

- 开工前编写 `iterations/round-06/plan.md`；本轮按物品/商店数据装配、纯逻辑背包交易引擎、键盘 UI 与地图接线三条子任务实施。曾委托 Claude Code CLI 执行机械实现；运行约 18 分钟后因提供方返回 429（5 小时额度上限）退出，主代理接续检查、修正并完成验证。
- 新增 `items-set` / `shops-set` draft-07 schema、7 件原创物品和 1 家商店；manifest 登记两种可选资源。角色模板新增起始银两、背包容量及起始物品，地图新增商人 NPC 与数据驱动对话；商人接入后保留原有战斗遭遇位置与规则。
- 扩展 NPC / 角色 Schema；`src/engine/item-system.ts` 实现物品与商店解析/索引/装配、条目级坏数据隔离、起始背包校验、有上限堆叠与容量、消耗品恢复、装备槽与属性/生命/内力上限加成、购买/出售。交易通过完整性校验后原子提交；另补正并非正交易数量与非安全整数金额校验，避免负数量反向增加银两或库存。
- `CharacterState` 分离基础属性与装备后有效属性，等级成长继续作用于基础属性并重算装备加成。`src/game/inventory-ui.ts` 和 `shop-ui.ts` 新增键盘背包/商店；GridScene 以首个有效角色模板独立创建玩家状态，因此没有有效战斗遭遇时仍可启动背包；B 打开背包，相邻商人按 E 开店，覆盖层锁定探索移动。
- 更新 README、ROADMAP、CHANGELOG、GDD、ARCHITECTURE 和 DATA-GUIDE，记录 R06 功能、数据契约、边界及验证事实。

### 验证

- `npm run build`：`tsc --noEmit` 和 Vite 生产构建通过，88 个模块；JavaScript bundle 1,580.58 kB（gzip 416.95 kB），仍触发 Vite 500 kB chunk 建议。
- 临时 Node/Ajv 冒烟：70 项全部通过，覆盖 schema、起始物品、跨引用、堆叠/容量、使用、装备/卸装与升级、交易原子性、非正数量拒绝及装备属性进入战斗；临时脚本与打包产物验证后删除。未新增正式自动化测试文件（基线计划为 Round 38）。
- 浏览器手动回归（本机生产预览 4183）：地图加载并显示商人，未见资料警告；背包初始显示银两 120 与 3/12 堆。相邻按 E 开店，购买回春膏（−15）并出售一件（+3），显示银两 108；购买帆布短褐（−40），装备后体魄由 9 增至 11、生命上限由 83 增至 99；使用回春膏将生命从 83 恢复到 99；关闭背包后方向键将坐标由 (10,1) 移至 (11,1)，确认探索移动恢复。商店与背包开着时键位仅改变面板选择/交易，画面坐标保持不变。

### 未做与风险

- 物品、装备、银两和商店库存目前只存于内存，刷新即恢复到模板/商店起点；存档留给 Round 09。
- 未接入任务奖励/掉落、耐久、制作或共享持久库存；装备耐久与任务来源留待后续轮次。

---

## Round 05 — 2026-09-27

### 计划与实现

- 开工前保留 `iterations/round-05/plan.md`（本轮新增计划，未改动）；实现严格按计划的三条子任务推进：战斗数据与跨资源装配 → 纯逻辑战斗闭环 → 键盘 UI 与地图接线。
- 契约扩展：`martial-arts-set.schema.json` 每条武学新增必填 `combat`（kind 枚举 attack/heal、power 1–999、qiCost 0–99）；`character-profiles.schema.json` 新增必填 `startingMartialArtIds`（唯一字符串数组，可为空）。两份基础资料同步补数据；吐纳养气诀门槛由等级 2/定力 8 调整为等级 1/无属性（与「流传极广的入门吐纳法」设定一致，并让初始模板拥有攻击 + 恢复两类起始武学）。
- 新增 draft-07 `battle-encounters.schema.json` 与 `data/base/battles/round-05-encounters.json`（登记为 `encounter.round-05-set`）：原创遭遇「巷口拦路刀客」，触发格 (1, 7)（row 7 走廊 col 1，地图可走、不压出生点 (7,7)、不与三名 NPC 重叠），敌人「疤脸刀客」body 8/force 7/agility 5/insight 4/resolve 4、生命 60、内力 16、可用武学「拦门刀法 + 江湖散手」、胜利经验 40、失败恢复 0.6/0.6、repeatable false，approach/intro/victory/defeat/flee 五条提示文本全部原创并留在 JSON。
- `src/engine/character-progression.ts` 扩展：`CombatActionKind`/`CombatActionData` 协议类型；`MartialArtData.combat` 与 `CharacterProfileData.startingMartialArtIds` 防御性解析（combat 缺失/坏 kind/越界、id 数组含空串均整资源拒绝并给出可读错误）；`CharacterState.martialArtIds` 运行时字段（`createCharacterState` 逐字复制模板声明，注释明确由调用方以验证列表覆盖）；`resolveStartingMartialArts` 逐条校验（存在且未禁用、不重复、满足模板起始等级/属性且空 factionIds 对无门派角色合格），坏引用只剔除该武学并警告。
- 新增 `src/engine/turn-based-combat.ts`（Phaser 无关）：`parseBattleEncounterSet` 防御性解析；`assembleBattleEncounters` 跨资源装配（id 首声明优先、地图引用已登记且为当前地图/引用其它有效地图静默跳过、触发格图内可走、不压出生点/NPC 格/已放置遭遇格、`profileId` 与敌人每个武学引用可解析、敌人至少留一个有效武学，单条失败只禁用该遭遇）；`computeAttackDamage`（`max(1, power + attackerForce − floor(defenderBody/3))`）与 `computeHealAmount`（`power + floor(actorResolve/2)`）固定协议公式；`CombatSession` 会话状态机——构造即记录数据 intro 战报并快照玩家可用武学，`playerUse` 一次调用完成玩家半回合（扣内力、按 kind 结算伤害/治疗并 clamp）+ 胜负判定 + 敌方整回合（可用攻击中 power 最高、平手取 id 升序小者、无可用攻击记「蓄势未发」跳过）+ 回到玩家回合，未知武学/内力不足返回结构化拒绝理由且不消耗回合与资源，胜利经 `grantExperience` 恰好一次发放遭遇经验（会话内 `experienceAwarded` 标志），失败按 `defeatRecovery` 比例恢复（生命 `max(1, ceil(max×ratio))` 保底 1 点、内力 `max(当前, ceil(max×ratio))` 不倒扣），`flee` 仅玩家回合可用、零奖励、敌方不追击；`selectEncounterTarget` 四方向邻接选择（等距按遭遇 id 升序决胜，与 NPC 规则一致）。
- 新增 `src/game/combat-ui.ts`：`BattlePanel` 键盘战斗面板（构造即建、open/close 管理键位与容器，模式与 DialoguePanel 一致）；渲染双方名称（数据）+ 生命/内力条（轨道/比例填充/数值文本）+ 最新战报（最多 6 条、按 128px 高度预算从最旧裁剪、按日志类型着色）+ 玩家行动列表（武学名/类型/power/内力耗来自数据；内力不足置灰、确认时显示本地「内力不足」提示且不推进回合）+ 撤退行；↑/↓（W/S）移动选择、Enter 确认（战后关闭）、Esc 撤退（战后关闭）；引擎侧仅保留通用机制标签（生命/内力/攻击/恢复/撤退等）。
- 改造 `src/game/grid-scene.ts`：`encounter.round-05-set` 资源与 `schema:battle-encounters` 并入可选分类，`loadGameData` 注册 battle-encounters 语义校验器；`assembleOptionalContent` 在对话/NPC/成长装配后装配遭遇（NPC 占格集合、模板与武学索引传入）；`setupWorld` 以首个有效遭遇的模板创建玩家 `CharacterState`（起始武学经 `resolveStartingMartialArts` 验证后覆盖运行时列表，坏引用警告进控制台；多遭遇模板不一致时点名警告并沿用首个）；遭遇敌人以 45° 菱形标记渲染并占格阻挡（区别于 NPC 方块），`activeEncounters` 过滤已完成非重复遭遇；E 键优先 NPC 交谈、其次四向邻接遭遇开战；战斗/对话面板任一打开即锁定移动与 E；`settleBattleClose` 在面板关闭时记录一次性遭遇完成（移除标记与阻挡、控制台汇总 outcome/经验/升级数）；HUD 可选警告行文案扩展到六类资料。
- 边界明确接受：完成标记与玩家状态仅存内存，刷新即重置（存档 Round 09）；胜利后不自动恢复资源（失败恢复由遭遇数据声明，探索期恢复手段随 Round 06 物品到来）。

### 验证

- `npm run build`：首轮 2 处 TypeScript 编译错误（`manhattanDistance` 误从 `grid-map` 导入，实际在 `npc-placement`；装配函数 TS 收窄需要显式分支），修正后通过；最终 `tsc --noEmit` 与 Vite 8.3.1 生产构建成功（85 个模块，831 ms）。JS bundle 1,553.36 kB（gzip 410.72 kB），仍触发 Vite 默认 500 kB 体积建议（与前轮相同的非阻断提示）。`dist/` 含 manifest、8 份 schema、地图、NPC、对话、角色模板、门派、武学、战斗遭遇与示例 MOD 文件。
- 临时 Node 冒烟脚本（rolldown 1.2.11 打包 `turn-based-combat` / `character-progression` / `grid-map` 三个引擎模块 + 项目 Ajv + 真实 JSON，运行后已删除）：37 项检查全部通过，覆盖——Ajv 四份真实资料通过 schema、缺 combat/坏 kind/缺 startingMartialArtIds/ratio>1/空敌武学数组被拒绝；真实武学集含 combat 解析、坏 combat 整资源拒绝；模板起始武学声明与运行时复制（生命 83/内力 53）；`resolveStartingMartialArts` 真实数据零警告、悬空/不满足起始条件/重复引用各剔除并警告；遭遇集合敌意输入（null/数组/字符串/空对象）防御性拒绝、坏条目逐字段可读错误；真实遭遇零警告装配于 (1,7)；阻挡格/越界/压出生点/压 NPC 格/悬空模板/悬空敌人武学/未登记地图七种坏遭遇各自只禁用自身；重复 id 保留先声明、触发格冲突禁用后者；引用其它有效地图静默跳过（skippedOtherMap=1、零警告）；邻接选择含 id 决胜与对角/远距拒绝；战斗公式数学（含伤害下限 clamp 与治疗取整）；开局 intro 战报与双方满资源；攻击 12/敌方回应 18（拦门刀法威力最高）与内力同步扣减；治疗 +15 上限 clamp 且敌方照常回应；未知武学与内力不足拒绝且不偷回合/不耗内力；平手 AI 取 id 小者；敌方内力耗尽转用 0 耗散手（[18,18,18,18]）；敌方无可用攻击「蓄势未发」；五次攻击胜利且经验恰好一次（40 经验 → 2 级、healthMax 83→101）；失败恢复 50/32（保底语义：满内力不倒扣、低内力提升至比例）；零比例恢复仍保 1 点生命；撤退零奖励、敌不追击、结束后拒绝再次撤退；纯攻击模拟第 5 回合取胜（战斗内 11 血，胜利升级 +18 增量 heals 至 29/101）；治疗续航策略同样收敛取胜。
- 冒烟过程中 6 次失败均为脚本问题而非引擎缺陷：同一 Ajv 实例重复编译同 `$id` schema 报 already exists（与 R04 同坑，改缓存编译）；对角坐标断言写错（(2,6) 实为正上邻格）；治疗断言漏算敌方回应（一次 playerUse 是完整回合）；平手测试在会话构造后才改玩家武学列表（会话构造即快照）；升级后生命上限算术错误（正确值 101）；失败恢复断言误解 max 语义（满内力不应降低）。逐一修正断言后全绿。
- 浏览器手动回归（`npm run build` + `npm run preview` 4180 端口，Playwright 键盘驱动 + 视觉模型读图）：加载后控制台 7 个资源全部 base、`[progression] 已加载角色模板 1 个、门派 3 个、武学 6 种、战斗遭遇 1 处`、数据警告为零（仅 favicon.ico 404，与前轮一致）；画面确认菱形敌人标记位于左下、黄圆玩家 (7,7)、三名 NPC 就位。方向键左移 5 步至 (2,7)：底部出现数据 approach 提示（「疤脸刀客横在巷口，按 E 迎战」，视觉模型小字号 OCR 有个别字误差、结构吻合）、再按左被遭遇格阻挡仍 (2,7)。按 E：战斗面板打开，双方资源条 83/83、53/53、60/60、16/16，数据 intro 文本入战报，行动列表「▸ 江湖散手 攻击 8 · 内力 0」「吐纳养气诀 恢复 12 · 内力 6」「撤退」。面板内按左（被锁定，位置不动）后 Enter×5：第 5 击制胜，画面显示 29/101、敌 0/60 与数据胜利文本，控制台 `[battle] 遭遇 "encounter.alley-blade-bully" 结束：victory（经验 +40，升级 1 次）`，与冒烟脚本数值一致。Enter 关闭面板后按 E 不再触发、方向右移生效到 (3,7)（战斗内左移确实被锁定的反向证明）、菱形标记与提示消失。临时截图与验证脚本运行后已全部删除。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）。

### 未做与风险

- 队伍、多敌人、状态异常（中毒/封穴）、装备修正、行动目标选择（自伤/治疗敌人）与战斗日志归档均未实现；公式保持单一可复现，数值平衡统一留给 Round 45。
- 探索期无恢复手段：胜利后保留剩余生命/内力，战斗外回血依赖失败恢复比例或重新开战，药品随 Round 06 物品系统落地。
- 遭遇完成标记、玩家等级/经验/资源均不持久化，刷新即重置；存档/读档与角色创建 UI 安排在 Round 09。
- 敌人 AI 为确定性规则（威力最高），无随机性/策略变化；更丰富的 AI 与行为配置留待后续战斗扩展轮次。
- 多遭遇声明不同 `profileId` 时沿用首个模板并点名警告（当前单遭遇数据无此场景），真正的多角色/多模板参战待后续轮次设计。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 04 — 2026-09-27

### 计划与实现

- 开工前保留 `iterations/round-04/plan.md`（本轮新增计划，未改动）；实现前确认现有 manifest/Ajv/装配层约定，角色成长协议保持小而明确以支撑 Round 05 战斗。
- 新增三份 draft-07 Schema：`data/schema/character-profiles.schema.json`（五项属性键 body/force/agility/insight/resolve 与 1–999 值域作为通用协议；起点 1–999、增量 0–99、权重 0–99、门槛 1–999；派生公式参数 base/perLevel/attributeWeights）、`faction-set.schema.json`（id/name/stance/philosophy/martialStyle）与 `martial-arts-set.schema.json`（类别六枚举：拳脚/剑法/刀法/身法/内功/外功；factionIds 唯一项数组，空数组=不限门派；requirements.level + requirements.attributes 部分属性映射；initialProficiency/proficiencyCap）。跨字段语义（maxLevel>startingLevel、起点≤attributeCap、初始熟练度≤上限）明确交给运行时解析器。
- 新增三份原创资料并登记进 manifest（`character-profile.round-04-set` / `faction.round-04-set` / `martial-art.round-04-set`）：`round-04-profiles.json` 提供 1 份模板 char.scribe-apprentice（抄书学徒：起点 9/6/7/8/7、等级 1/经验 0 起、上限 30 级/属性 80、经验曲线 base 40 + 每级递增 20、每级成长 2/2/1/1/1、生命 base 50+10/级+体魄×3+力道×1、内力 base 30+8/级+悟性×2+定力×1，属性显示名称"体魄/力道/身法/悟性/定力"也在数据中）；`round-04-factions.json` 提供 3 个原创门派（听雨剑阁/铁嶂派/云隐山庄，立场、宗旨、武学风格全为原创文本）；`round-04-martial-arts.json` 提供 6 种原创武学（江湖散手/吐纳养气诀/拦门刀法为通用；听雨剑法/铁嶂桩功/云隐身部分属三派，门槛与所属门派的风格描述呼应）。
- 新增 `src/engine/character-progression.ts`（Phaser 无关）：`ATTRIBUTE_IDS`/`ATTRIBUTE_MIN`/`ATTRIBUTE_MAX` 协议常量与 `AttributeMap`/`PartialAttributeMap` 类型；`parseCharacterProfileSet`/`parseFactionSet`/`parseMartialArtSet` 防御性解析（逐条可读错误 + 单文件语义检查）；`indexProfiles`/`indexFactions`（首声明优先、上报重复 id）与 `indexMartialArts`（门派引用逐条校验：悬空引用只禁用该武学并点名，其余武学与整个集合不受影响；重复 id 按首声明处理，即使首项因引用无效被禁用）；`createCharacterState`（模板起点 + 属性副本 + 满 vital）；`cumulativeExperienceForLevel`（升第 k 级成本 = base + perLevel×(k−1)，累计阈值随等级递增，越界输入钳制）；`experienceToNextLevel`（满级返回 null）；`grantExperience`（一次授予跨级结算：while 阈值循环、每级属性 += growth 并受 attributeCap 封顶、满级经验钳制并丢弃溢出、vital 上限按公式重算且增量 heals 进当前值，非正数/非有限或取整后非安全整数 no-op）；`computeDerivedMax`/`computeVitalMaxima`（max = base + perLevel×(level−1) + Σ 权重×属性）；`checkMartialArtEligibility`（等级/属性/门派三查，空 factionIds 不限门派，不合格逐条给出含协议 id 与数字的机械原因）。
- 改造 `src/game/grid-scene.ts`：三类新资源及其 schema（`schema:character-profiles`/`schema:faction-set`/`schema:martial-arts-set`）并入可选内容分类（`OPTIONAL_RESOURCE_IDS`/`OPTIONAL_SCHEMA_ORIGINS` 集合化重写）；`loadGameData` 为三个 schema id 注册语义校验器（复用 parse 函数，与 grid-map 同一模式）；新增 `assembleProgressionContent`（结构坏→整资源禁用警告；重复 id→保留先声明并警告；悬空门派引用→点名禁用该武学；未登记资源合法缺席），装配结果存入场景 `progression` 字段供 Round 05+ 使用，本轮无进度 UI；HUD 可选内容警告行文案扩展为五类资料，控制台前缀统一 `[optional]`，并在装配完成后 `console.info` 汇总已加载模板/门派/武学数量。
- 游戏状态仅存于运行时对象（`CharacterState`），无任何持久化；拜师/修炼/战斗效果均未实现。

### 验证

- `npm run build`：通过；复核修正后最终运行 `tsc --noEmit` 与 Vite 8.3.1 生产构建成功（83 个模块，805 ms）。JS bundle 1,531.38 kB（gzip 404.99 kB），仍触发 Vite 默认 500 kB 体积建议（与前轮相同的非阻断提示）。`dist/` 含 manifest、7 份 schema、地图、NPC、对话、角色模板、门派、武学与示例 MOD 文件。
- 临时 Node 冒烟脚本（esbuild 打包 `src/engine/character-progression` + Ajv + 真实 JSON，运行后已删除）：83 项检查全部通过，覆盖——三份真实资料解析与索引（1 模板/3 门派/6 武学、零重复、零悬空）；重复门派 id 上报且保留先声明；悬空门派引用恰好禁用 1 种武学（其余 5 种保留）并点名武学与门派 id；null/数组/字符串/空对象等敌意输入被防御性解析拒绝；maxLevel≤startingLevel 与初始熟练度超上限被单文件语义拒绝；初始状态（等级/经验/属性副本不回写/生命 83/内力 53 满值）；累计阈值数学（0/40/100/180/280/9280 与越界钳制）；距下一级 40；39 经验不升级、补 1 点恰好升 1 级且累计经验保持 40（累计阈值制不消耗经验）；240 经验一次跨 3 级到 5 级；属性上限封顶（9+2→10）；百万经验一次到满级 30（29 级、经验钳制 9280、丢弃 990720、体魄 67/身法 36/生命 605/内力 372）；满级后经验不再累积且全部丢弃；负经验 no-op；资格判定（1 级无门派可学通用武学、通用武学对任意门派合格、等级不足/属性不足/需加入门派/门派不符各自点名原因、多条件不满足逐条列出）；Ajv 检查（登记新资源后的 manifest 及三份真实数据全部通过 schema；缺 name 门派、未知属性键、低于协议下界、缺失属性键 growth、非枚举类别、门槛未知属性键被拒绝；空 factionIds 被接受）。
- 首轮冒烟 3 处失败均为脚本问题而非引擎缺陷：两处断言误把累计阈值制当作"升级消耗经验"（引擎按计划采用 cumulative XP thresholds，修正断言为 40/280），一处 Ajv 重复编译同一 `$id` 报 already exists（脚本改为缓存编译结果）；修正后全绿。
- 独立复核后的临时 Node 回归检查：manifest 与三个新数据集的 Ajv 校验通过；Schema 与解析器均接受每级成长为 0；首个武学因悬空门派引用被禁用时，后续同 id 条目仍按首声明规则被拒绝；累计经验 39/40 阈值、跨级后等级/经验状态符合 40/100/180/280 的累计门槛。验证脚本仅通过 stdin 执行，未落盘。
- 浏览器手动回归（`npm run build` + `npm run preview`，生产构建）：默认状态地图、玩家标记、3 名 NPC 与交互提示正常；控制台显示 6 个资源全部加载自 base 与 `[progression] 已加载角色模板 1 个、门派 3 个、武学 6 种`，数据警告为零（仅 favicon.ico 404，仓库不含图标资源，与数据管线无关）。临时将 dist 中武学 factionIds 改为不存在的门派、并把门派集合替换为 `{"id":"broken"}` 后刷新：结构坏门派被 schema 拒绝并出现 `[optional]` 警告，门派集为空导致三个门派型武学因悬空引用被点名禁用（汇总变为 1 模板/0 门派/3 武学），HUD 显示可选资料警告行，地图、移动与 NPC 交谈保持可玩。两种临时改动验证后恢复，dist 两文件 SHA256 与源文件一致，恢复后回到零警告。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）；临时验证脚本与截图目录运行后已删除。

### 未做与风险

- 拜师/入门流程、修炼与熟练度增长、招式效果与战斗消耗均未实现（Round 05 战斗、Round 13 拜师）；引擎已提供资格判定与数据参数，后续轮次直接消费。
- 角色状态不持久化：页面刷新即丢，存档/读档与角色创建 UI 安排在 Round 09。
- 三种门派武学的等级/属性门槛对初始模板分别在约 5 级（铁嶂桩功：体魄 9+2×4=17≥16、定力 7+1×4=11≥10）、7 级（听雨剑法：悟性 8+1×6=14≥14、身法 7+1×6=13≥12）与 10 级（云隐身法：身法 7+1×9=16≥16）可由成长曲线满足，但门派资格要等拜师轮次（Round 13）才可入；通用武学 1–3 级即可修习。数值平衡统一留给 Round 45，本轮以协议正确性为先。
- 经验为累计阈值制：升级不消耗经验、满级丢弃溢出经验，该语义已写入引擎文档注释与 DATA-GUIDE，后续战斗/任务发放经验时按此理解。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 03 — 2026-09-27

### 计划与实现

- 开工前创建并保留 `iterations/round-03/plan.md`；实现评审时补充明确了“省略或空 `options` 数组均为结束节点”的一致约定。
- 新增 NPC 与对话数据契约：`data/base/characters/round-03-npcs.json`（3 名原创 NPC：书铺掌柜沈墨涵、茶摊娘子陆贞娘、背刀游侠顾夜尘，含稳定 id、姓名、地图资源 id、网格坐标与对话引用）和 `data/base/dialogues/round-03-conversations.json`（3 段对话图，每段含分支选项与无选项结束节点；三段在叙事上互相呼应）。两资源以 `npc.round-03-set` / `dialogue.round-03-set` 登记进 manifest，并新增 draft-07 `npc-set` / `dialogue-set` schema（静态结构；跨文件约束明确交给运行时）。
- 新增 `src/engine/npc-placement.ts`：NPC 集合防御性解析；`assembleNpcPlacements` 做逐条跨资源校验（地图引用已登记、坐标在图内且非阻挡格、不压玩家出生点、不与已放置 NPC 同格、id 唯一、对话引用有效），单条失败只禁用该 NPC 并生成可读警告；引用其它有效地图的 NPC 静默跳过。`NpcOccupancyIndex` 提供占用格查询，`selectInteractionTarget` 只接受曼哈顿距离 1 的目标，多目标等距时按 NPC id 升序决胜。
- 新增 `src/engine/dialogue-graph.ts`：对话集合防御性解析；`validateConversation` 逐段校验图语义（节点 id 唯一、起始节点存在、每个选项 nextNodeId 可达）；`indexConversations` 首声明优先索引并上报重复 id；`DialogueSession` 纯逻辑会话（当前节点、选项、结束节点判定、choose 越界/悬空目标 no-op、reset 复位）。
- 新增 `src/game/dialogue-ui.ts`：Phaser 对话面板，显示说话者名称、节点文本与选项列表；↑/↓（W/S）移动选择、Enter 确认（结束节点上结束对话）、Esc 随时关闭；面板高度按文本与选项数量自适应，按键仅在面板打开期间绑定。
- 改造 `src/game/grid-scene.ts` 装配策略：加载诊断分级为"必需"（manifest、manifest/grid-map schema、地图资源——维持致命错误面板）与"可选"（NPC/对话资源及其 schema——降级为警告）；场景内 `assembleOptionalContent` 先索引并逐段校验对话（坏对话只禁用自身），再装配 NPC；HUD 显示两类警告行（可选内容/MOD），底部新增交互状态行（相邻时显示"按 E 与『某人』交谈"，无有效 NPC 时显示"暂无可交互人物"）；场景关闭时释放对话面板与键位监听。
- 交互与占位：NPC 以数据坐标渲染为几何占位（色板循环，呈现细节不进数据）并显示数据姓名标签；`tryMove` 增加占用格阻挡；E 键触发邻接对话，面板打开期间移动输入被 `isOpen` 门禁隔离、关闭后恢复。

### 验证

- `npm run build`：通过；`tsc --noEmit` 与 Vite 8.3.1 生产构建成功（82 个模块，773 ms）。JS bundle 1,522.09 kB（gzip 402.94 kB），仍触发 Vite 默认 500 kB 体积建议（与 Round 02 相同的非阻断提示）。`dist/` 含 manifest、4 份 schema、地图、NPC、对话与示例 MOD 文件。
- 临时 Node 冒烟脚本（esbuild 打包 `src/engine` 纯逻辑 + 真实 JSON，运行后已删除）：48 项检查全部通过，覆盖——有效数据解析、3 段对话图校验、正常装配零警告；坏对话引用/阻挡格/越界/压出生点/同格冲突/重复 id 各自只禁用涉事 NPC 且其余保留；引用未登记地图报警、引用其它有效地图静默跳过；对话集合为空时全部 NPC 禁用；距离 2、对角与远距不可交互；双邻接等距按 id 决胜；会话跳转/结束/复位/越界 no-op；占用格索引；断裂对话图（坏起始节点 + 悬空 nextNodeId）被双条可读诊断捕获；重复对话 id 首声明胜出；恶意结构输入被防御性解析拒绝。
- 临时 Node schema 检查（项目依赖 Ajv，运行后已删除）：manifest、地图、NPC、对话四份真实数据全部通过对应 draft-07 schema；缺 name 的 NPC 条目被 schema 拒绝；省略与空 `options` 数组都作为合法结束节点被 schema 和运行时解析器接受；空 `npcs`/`conversations` 集合保持合法（对应“暂无可交互人物”状态）。
- 浏览器手动验证：默认地图加载 3 名 NPC；四方向相邻时提示并按 E 开启对话；使用键盘选择分支、Esc 关闭、对话期间移动锁定且关闭后恢复；NPC 占位格阻挡移动。临时将 NPC 放到阻挡格后，该 NPC 被隔离并显示警告而地图保持可玩；将 NPC 与对话集合清空后地图仍可玩并显示“暂无可交互人物”。两种临时改动均在验证后恢复，NPC/对话文件 SHA256 与原始备份一致。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）；引擎纯逻辑与 schema 使用的临时验证脚本运行后已删除。

### 未做与风险

- NPC 位置是静态资料：日程、巡逻与动态位置留给 Round 16 及以后。
- 对话仅实现节点/选项跳转：条件分支、效果、任务/声望联动留给 Round 08。
- 跨资源校验的"逐条禁用"发生在场景装配层而非加载器 semanticValidator（后者失败会拒绝整个资源，与本轮"只禁用受影响人物"的目标不符）；未来若需多资源通用化，可把装配层校验提炼为独立服务。
- 对话面板未做超长文本滚动：当前数据文本与选项量（≤2 项）远低于面板容量，异常超量数据由 schema maxLength（500/100）兜底。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 02 — 2026-09-27

### 计划与实现

- 先创建并保留 `iterations/round-02/plan.md`，包括目标、用户故事、验收标准、三个可验证子任务、涉及文件、风险及 3–5 小时估时。
- 以 `data/base/manifest.json` 枚举资源与启用 MOD；新增 `data/schema/manifest.schema.json` 与 `data/schema/grid-map.schema.json` 两份 draft-07 schema。`src/engine/data-loader.ts` 用 Ajv 8.20 对 manifest、基础资源与 MOD 覆盖逐个校验，加载结果带资源来源（base 或 modId）与结构化诊断；跨字段语义（行列长度、出生点可走等）由按 schema 注册的语义校验器补足。
- 新增 `src/engine/event-bus.ts`：框架无关的类型化同步 EventBus，支持 `on`、`once`、`off`、`emit`、`clear`；数据加载按资源发布成功与失败事件，数据层不依赖 Phaser 场景。
- `enabledMods` 按声明顺序处理同路径覆盖：后启用 MOD 覆盖先启用 MOD；MOD 缺失文件不产生覆盖，无效覆盖记为警告并保留上一有效版本；坏基础资源整体失败，不进入运行状态。
- `vite.config.ts` 以 `data/` 为 publicDir，并加入 MOD 分发插件：开发服务器只服务仓库 `mods/` 目录内的 JSON（安全路径段模式 + realpath 目录约束），穿越、非 JSON 与越界路径返回 404；生产构建复制相同文件。
- `src/game/grid-scene.ts` 迁移到加载器流程：地图改由 `loadGameData` 获取并注册网格地图语义校验；致命错误（manifest/schema/基础资源）与 MOD 警告均显示可读诊断画面，保留 Round 01 的降级行为。
- 验证用的示例 MOD 保留在 `mods/example/`；恢复默认后 `data/base/manifest.json` 的 `enabledMods` 为空数组，示例 MOD 默认不启用。

### 验证

- `npm run build`：通过；`tsc --noEmit` 与 Vite 8.3.1 生产构建成功（79 个模块，669 ms）。JS bundle 1,509.91 kB（gzip 399.20 kB），仍触发 Vite 默认 500 kB 体积建议。
- 浏览器手动验证：默认地图正常加载与移动；启用有效 MOD 后同路径地图覆盖生效；无效覆盖保留可玩基础地图并显示警告；两个 MOD 均提供覆盖时按 `enabledMods` 声明顺序叠加（两种顺序各验证一次）；移除启用项后恢复默认；ArrowLeft 逐格移动回归通过。
- 临时 Node 脚本冒烟检查 EventBus：`on` 与 `once` 均按语义触发、`once` 监听器内重发同一事件不二次触发、存在重复注册同一监听器时 `off` 只移除一条匹配注册。
- 开发服务器 HTTP 检查：示例 MOD JSON 返回 200；URL 编码的目录穿越路径与非 JSON 路径均返回 404。
- 生产产物核对：`dist/` 中 manifest、两份 schema 与示例 MOD 文件的 SHA256 与源文件一致。
- 本轮未新增或运行正式自动化测试；上述为构建、浏览器手动操作与临时脚本检查。

### 未做与风险

- manifest 目前仅注册 `map.round-01-grid` 一个资源；其余数据族的 schema 与内容未编写，留待后续轮次。
- MOD 启用/禁用仍靠手工编辑 manifest，没有管理界面；MOD 管理 UX 是未来工作。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，此项继续留待性能/打包轮次评估。

---

## Round 01 — 2026-09-27

### 计划与实现

- 先创建并保留 `iterations/round-01/plan.md`，包括目标、用户故事、验收标准、三个可验证子任务、涉及文件、风险及 2–4 小时估时。
- 以 `data/base/maps/round-01-grid.json` 描述 16×9 地图、瓦片颜色/阻挡属性和出生点；Vite 将 `data/` 作为静态目录，开发服务器由 `/base/maps/round-01-grid.json` 提供文件，生产构建复制相同资料。
- 新增通用网格地图协议与运行时结构检查、格子渲染器及 `GridScene`。键盘方向键/WASD 每次移动一格；墙体及越界坐标不可进入，动画期间忽略输入。
- 加入地图请求失败、JSON 解析失败与结构错误的场景内提示；启动画布设置可访问名称并获取键盘焦点。
- 正式 JSON Schema/Ajv 校验和同名 MOD 覆盖仍安排在 Round 02，未在本轮提前实现。

### 验证

- `npm run build`：通过；TypeScript 检查与 Vite 生产构建成功（636 ms）。Phaser bundle 为 1,382.83 kB（gzip 361.00 kB），触发 Vite 默认 500 kB 体积建议。
- 浏览器：地图和 HUD 显示；方向键与 WASD 能逐格移动；走向墙体时坐标不变；边界测试从 `(5, 7)` 连续向左到 `(1, 7)` 后再次向左仍为 `(1, 7)`。
- 缺失地图检查：临时移走地图文件并刷新；Vite SPA 回退返回 `text/html`，场景显示“地图数据响应格式错误”及路径/类型提示，画布未白屏。恢复原文件。
- 无效结构检查：临时以 `{"id":"broken"}` 替换地图 JSON 并刷新；场景显示“地图数据结构不合规”及各必需字段错误。恢复原文件并用 PowerShell JSON 解析确认恢复成功。
- 本轮采用浏览器手动验证，未新增或运行测试套件。

### 未做与风险

- Phaser 主包仍超过 Vite 默认 500 kB 建议阈值；构建可成功，此项留待后续性能/打包轮次评估。
- 地图协议目前只有本轮所需字段的运行时结构检查，不声称已完成正式 Schema 验证。

---

## Round 00 — 2026-09-26

### 前置

- 读取并保留 `iterations/round-00/plan.md`（未改动其用户故事/目标/估时）。
- 确认工作区现状：当前目录不是目标游戏仓库，父目录另有数个无关 Git 项目；因此在 `wuxia-rpg/` 建立独立仓库，未改动其余项目。
- 本机环境：Node v22.18.0、npm 10.9.3。

### 版本核验（2026-09-26，方法：npm registry 元数据查询 + 官方站点文章）

- `phaser@latest` = **4.2.1**；官方 v4 发布归档显示 v4.0.0（2026-04-10）→ v4.2.1（2026-07-09，"Giedi"）持续发布。
- Phaser 官方 v3.90 发布文（2025-05-23）关键原文："As we're days away from the release of Phaser v4 this is likely the last version in the v3 tree."——支持"选 Phaser 4 而非需求建议的 Phaser 3"（ADR-0001）。
- `vite@latest` = **8.3.1**，engines：`^20.19.0 || >=22.12.0`；本机 Node 22.18.0 满足。
- `typescript@latest` = 7.0.2（6.x 线 6.0.3；5.x 线 5.9.3）→ 决策冻结 `^5.9.3`（ADR-0002）。
- `ajv@latest` = **8.20.0**（符合冻结的 8.x 主版本；R02 接入，见 ADR-0004）。
- `vitest@latest` = 5.0.2；4.x 线最新 **4.1.11** → 按需求冻结 4.x，届时安装 `^4.1.11`（ADR-0005；其 engines 要求 `^22.12.0 || ^24.0.0 || >=26.0.0`，本机满足）。

### 研究（历史来源，均为摘要引用，未复制原文）

- go1980.org 系列历史综述：用于 A 组对照（系列级原则，证据"中"）。
- TapTap《英雄群侠传》介绍页中的第一人称叙述：用于记录该页面自述曾在文曲星上玩过《白金英雄坛说》并受其吸引；不作为原作机制证据。
- stahuj.cz 第三方衍生条目：仅交叉参考（证据"低"，对原作不具证明力）。
- 授权状态：以上页面许可证均未验证，故仅摘要 + 链接（`docs/REFERENCES.md` 使用规则）。

### Round 00 来源复核（2026-09-27）

- 复查 TapTap app 28348 原页后确认：页面是后作《英雄群侠传》的介绍，文中关于白金版的内容是第一人称叙述，不是独立玩家评测；该页列出的自由度、任务、门派等玩法属于后作说明，不能用于推断白金版机制。
- 据此修订 `docs/REFERENCES.md` 与 `docs/ORIGINAL-FIDELITY.md` 的来源归属、置信度和 A3 描述，并收窄 A1/A2 为来源明确描述的早期《英雄坛说》事实。没有改变本作目标或任何后续轮次范围。
- 为避免只把对照停留在系列级泛化信息，复核 go1980 文中对白金版开发者的直接归属转述，并查询措辞检索结果；界面新闻页面呈现相同稿件内容，不作为独立印证（已登记为来源 #4）。新增 A5：仅记录该开发者称“杀不同人物影响结局”是白金版新增要素，证据标为中（单篇报道转述第一手证言），本作只映射到原创行为驱动多结局，不继承角色、杀人名单或结局内容。来源授权仍未确认，继续只摘要引用。
- 新增 A6 的来源核验：ZOL 问答页中的玩法指南由答主明言转自百度“白金英雄坛说吧”，概述方向键移动、NPC 动作选单和回合制战斗。因其为社区转贴、无官方背书且不能核验原设备，登记为低置信度，只映射高层交互形式，不采纳攻略中的专名、路线或技巧。
- 验证：`npm run build` 的 TypeScript 检查与 Vite 生产构建通过（97 个模块）；`git diff --check` 通过。构建仍有主 bundle 超过 500 kB 的非阻断建议。
- 技术决策复核：Phaser 官方资料确认 v3.90 公告将其称为 v3 树很可能的最后版本，v4 归档列出 4.2.1（2026-07-09）；Vite 8 官方指南所述 Node 下限与 ADR 一致。本仓库当前 `npm run build` 通过。具体技术决策仍按 Round 00 的版本快照冻结。

### Round 00 参考清单编号与授权状态复核（2026-09-27）

- 审核发现 `docs/REFERENCES.md` 的历史来源编号为 #1–#5，但官方技术来源从 #4 起，造成 #4/#5 重号。将官方技术来源调整为 #6–#12；`docs/ORIGINAL-FIDELITY.md` 仍只使用 #1–#5，映射未变。
- 为官方发布公告和技术文档逐项注明“页面许可未逐页核实，仅查阅/转述技术事实，不复制文本、代码或素材”；在软件包表前说明 npm `dist.license` 是指定软件版本的许可证元数据，不等于网站文档授权，并提醒分发时核对许可证文件与 NOTICE。
- 在线复核：go1980 文章将“击杀不同人物影响结局”归于参与白金版开发者 LEE 的陈述，但仍是单篇媒体转述；ZOL 问答页在指南段落中自称转自百度白金吧，且包含方向键移动、NPC 动作菜单和回合制战斗概述，维持低置信度社区证据；Phaser 官方归档当前列出 v4.2.1。没有据此升级版本或扩展原作事实。
- 验证：`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过；来源编号扫描确认历史/技术来源连续唯一，A 组引文仍能对应 #1–#5。构建只有既有主 chunk 超过 500 kB 的非阻断提示。

### Round 00 GDD 现状标注复核（2026-09-27）

- 审核发现 GDD 页首仍将状态写为 Round 02，且数据 Schema 概述只列 manifest、地图、NPC 和对话，落后于已完成的 Round 04–07 内容；`manifest.json` 实际登记 10 个资源族，schema 目录包含对应契约及 manifest 契约共 11 份。
- 将页首改为持续维护且更新至 Round 09；列明 11 份 draft-07 契约，并区分当前 10 项 manifest 资源与知识图谱/结局/世界事件等待接入数据族。没有把未来系统写成已实现。
- 游戏画布尺寸说明与 `src/main.ts` 的 960×540 / `Phaser.Scale.FIT` 配置一致。
- 验证：PowerShell 检查确认 10 项 manifest 资源均指向存在的 draft-07 schema，11 份 schema（含 manifest）无未登记文件；GDD 状态和逐项 Schema 名称检查通过；`npm run build`（含 `tsc --noEmit`）及 `git diff --check` 通过。Vite 仍有既有主 chunk 大于 500 kB 的非阻断提示。

### Round 00 核心系统设计矩阵（2026-09-27）

- 在 GDD 核心循环后增加系统目标表，集中表达探索/区域、NPC/对话、任务/事件、成长/门派/武学、回合制战斗、物品/经济、社会后果/结局、江湖模拟、存档/设置/MOD 的玩家体验目标和完成/规划状态。
- 明确此表是本作原创产品目标而非原作规格；每行对应 ROADMAP 轮次，避免将已完成的 R01–R09 最小闭环与 R10+ 扩展混写。补充当前键位基线，并逐项对照 `GridScene` 的方向键/WASD、E、F、B、Q、Esc 绑定和 R41 可访问性计划。
- 验证：系统矩阵引用的轮次均能在路线图中解析；键盘绑定、960×540/Scale.FIT 画布及覆盖层输入锁均与代码一致；`npm run build`（97 模块）和 `git diff --check` 通过，只有既有主 chunk 大于 500 kB 的 Vite 建议。

### Round 00 研究日期断言复核（2026-09-27）

- 页面检索结果不含可核验的发布年份或日期，原始 R00 日志中的“2008 年问答页”无法由该页面文本支撑；网页被抓取的时间不等于内容发布日期。
- 删除未证实的年份，将参考清单与 R00 研究日志统一为“ZOL 问答页/社区转载”，维持低置信度及仅作高层操作线索的证据边界；不推断页面实际发布时间。
- 验证：针对 `docs/REFERENCES.md` 与 `docs/ORIGINAL-FIDELITY.md` 的 `rg '2008'` 搜索无匹配；`DEVLOG.md`/`CHANGELOG.md` 仅在本次审计中记录撤回旧断言。`git diff --check` 与 `npm run build`（97 模块）通过；Vite 仍提示主 chunk 超过 500 kB。

### 产出

- 配置与入口：`package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`。
- 占位实现：`src/main.ts`（Phaser 4 引导画面，不含玩法与设定文本）、`src/style.css`。
- 目录骨架：`src/engine/`、`src/game/`、`data/base/` 十族、`data/schema/`、`mods/`（共 14 个 `.gitkeep`）。
- 文档：GDD、ADR、REFERENCES、ORIGINAL-FIDELITY、ARCHITECTURE、DATA-GUIDE（`docs/`）。
- 治理：`README.md`、`ROADMAP.md`（R00–R50 共 51 条；R01–R12 与目标文件要求的垂直切片/核心系统顺序一致）、`CHANGELOG.md`、本文件。
- 用户目标路线校正：R01–R12 按要求依次覆盖垂直切片、数据/Schema/事件、NPC/对话、属性/门派/武学、战斗、物品、任务、对话条件效果、存档/菜单、世界地图、知识图谱和 UI；其余轮次继续覆盖全部扩展系统与最终数据数量。
- `docs/REFERENCES.md` 逐项标明历史页面授权未知、软件包许可元数据和本项目不复制文本/代码/素材的使用界限。

### 验证与未做

- `npm install` 成功，安装 18 个包；生成 `package-lock.json`。
- `npm run build` 成功：`tsc --noEmit` 通过，Vite 8.3.1 生产构建完成（657 ms）。Vite 报告 Phaser 主 bundle 1,375.84 kB（gzip 358.32 kB），超过默认 500 kB 建议阈值；Round 00 占位项目可接受，优化纳入后续性能轮次。
- 未执行测试：本轮没有测试文件，也没有声称测试通过。
- 未编写任何测试文件、未安装 Ajv/Vitest（Ajv 计划于 R02、Vitest 于 R38 接入）。
- 未填写任何 `data/` 内容数据；未开始 R01+ 的实现。
- 本轮不存在测试结果，任何"测试通过"的表述都不适用于 R00。
