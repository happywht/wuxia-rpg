# 变更日志（CHANGELOG）

格式参考 Keep a Changelog；版本号遵循语义化版本。逐轮开发细节见 `DEVLOG.md`。

## [Unreleased]

### Added (Round 36)

- 开发服务器新增 Vite 8 Environment API `hotUpdate` 插件：仓库内 `data/**/*.json` 与 `mods/**/*.json` 的新增、修改、删除广播 `wuxia:data-change`，自定义处理后不触发 Vite 整页刷新；源码、非 JSON 与仓库外路径不转发。
- 菜单和游戏场景接入开发态资料热重载。菜单更新当前角色模板；游戏在输入锁定且离开移动/战斗/面板状态后重载并重新组装 manifest 全集，通过内存 `SaveSnapshotV1` 与现有存档预检恢复兼容的角色进度，不写用户存档槽。初始载入或热重载中再次发生的文件变更会排队再次加载；不兼容或关键资料失效时保留旧世界与运行字段并提示原因。
- 新增 `npm run smoke:round-36`：覆盖路径分类、真实 Vite HMR WebSocket 修改/创建/删除事件、通知合并/退订、数据 JSON 变更不整页刷新，以及生产构建不含客户端热重载桥接；临时探针均清理。
- 更新 Vite HMR 架构/资料指南、README、引用来源、路线图及开发日志，明确整世界重读的跨资源一致性策略、热重载安全边界和生产限制。

### Verification (Round 36)

- `npm run smoke:round-36`、`npm run typecheck`、`npm run validate:data`、`npm run inspect:mods`、`npm run build`、`npm run smoke:round-30`、`npm run smoke:round-31`、`npm run smoke:round-33`、`npm run smoke:round-35`、`npm run audit:round-34`、`git diff --check`：通过；构建体积及真实 Vite 演练详情见 `DEVLOG.md`。

### Added (Round 35)

- **MOD 优先级与来源追踪**：`DataLoadResult` 新增 `enabledMods`（manifest 声明顺序原样暴露）；`LoadedResource` 携带 manifest 相对 `path`；成功装配的 `LoadedWorld` 新增 `enabledMods`、`resourceSources`（按 manifest 顺序的每资源最终来源）与 `modDiagnostics`（按 `mod:` origin 过滤）。覆盖语义不变：后声明且校验通过的层获胜，坏覆盖原子回退到上一有效值。
- **可行动诊断**：`Diagnostic`/`data:resource-error` 事件新增可选 `path`（问题文件 URL）与 `hint`（修复建议）。JSON 语法错误、schema 不符、语义校验失败、文件缺失、manifest 损坏等路径均给出精确文件定位与下一步操作（改哪份文件、按哪个 schema、或如何从 `enabledMods` 移除该 MOD）。
- **游戏内 F2「MOD / 资料状态」面板**（`src/game/mod-status-ui.ts`）：三页分栏——生效顺序（覆盖规则与每层优先级）、资源来源（每个成功资源的最终来源与基础/覆盖文件路径）、MOD 诊断（失败原因、精确覆盖 URL、逐条错误与修复提示）；也把运行时装配时被部分禁用的 MOD 资源警告归因到最终来源层并补出文件位置。↑/↓ 浏览、←/→ 翻页、F2/Esc 关闭，打开期间探索输入锁定，关闭经 `noteOverlayClosed` 恢复；shutdown 时随场景销毁。帮助面板（H）与 HUD 加入 F2 入口，MOD 回退提示行由"详情见控制台"改为"按 F2 查看原因与修复建议"。
- **只读检查命令 `npm run inspect:mods`**（`scripts/inspect-mods.mjs`）：按真实 manifest 顺序校验 manifest 自身、每个基础资源与每个已启用覆盖的 JSON 可读性与 schema（Ajv draft-07），输出每资源的基础层/各 MOD 层/最终来源；坏层给出精确文件路径、错误明细与修复提示并以非零退出；明确注明跨资源语义校验仍由运行时加载器执行；检查逻辑可导出复用，全程不写任何文件。
- **专项烟测 `npm run smoke:round-35`**：用项目 TypeScript 即时转译真实 `data-loader.ts`，配合临时 fixture 目录 + 内存 fetch 驱动真实 `loadGameData`——验证双 MOD 先后覆盖（后有效层获胜）、坏 JSON/schema 覆盖原子回退、最终来源顺序、精确文件路径与修复提示；直接核验运行时跨资源装配警告归因到实际 MOD 来源且基础资料警告不会误标为 MOD。再以 `inspectMods` 交叉核验层状态与最终来源，并覆盖“坏基础资源不能由 MOD 救回”和损坏 manifest 的可读失败；确认真实 manifest 的 `enabledMods` 仍为空，临时产物全部清理。
- `docs/DATA-GUIDE.md` §5 扩写为「MOD 覆盖规则与作者工作流」：覆盖语义、启用/排序步骤（改 manifest 后重进游戏，热重载在 R36）、`inspect:mods` 提交前检查、F2 游戏内排错；`README.md` 命令表与 MOD 工作流提示同步更新。

### Verification (Round 35)

- `npm run inspect:mods`（真实 manifest：26 项资源全绿、0 问题、exit 0）、`npm run smoke:round-35`、`npm run validate:data`、`npm run typecheck`、`npm run build`、`npm run smoke:round-30`、`npm run smoke:round-31`、`npm run smoke:round-33`、`npm run audit:round-34`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 34)

- 新增世界设定总览 **`docs/WORLD-SETTING.md`**：以当前基础 JSON/对白/人物志/门派志/任务志/GDD 为证据源，整理世界背景（大雍末年设定、抄书学徒主角、架空历法气候）、区域地理（方格试炼场、雾雨渡口两张正式地图与「芦苇河滩」图鉴地点的区分）、五派格局、渡籍轮值章程与雾渡药道会盟（铁嶂 vs 云隐）、关键人物分组与已实现冲突走向；每节标注权威数据文件，推断与已实现事实分列，未落地内容只作为路线设想，不虚构额外历史年代/远方地图/后续结局。
- 校准三份资料手册：`docs/MAP-ATLAS.md` 补全地图资源总表（id、尺寸、玩家起点、瓦片通行性、舆图坐标）、全部关口端点坐标表（含引擎装配规则）与区域事件触发格表（坐标/一次性/条件/发现节点）；`docs/DIALOGUE-GUIDE.md` 效果主表补齐 `recruitCompanion`/`dismissCompanion`，新增「校验分层」章节明确 Ajv Schema 静态校验（资源级）、防御性图解析（单段隔离）与跨资源装配（逐选项剔除）三层边界；`docs/QUESTS.md` 精确化 `talkToNpc` 谈话信号语义（`openDialogueWith` 唯一入口：F 键交谈与无名录/商店 NPC 的 E 键回落都算，任务告示板不算）并注明审计核验范围。
- 新增 `scripts/audit-round-34-docs.mjs` 与 `npm run audit:round-34`：只读文档一致性审计。按 manifest schema 家族收集地图/NPC/遭遇/任务/门派/历法/气候/图谱事实，从 `dialogue-set`/`quest-set` Schema 封闭枚举提取全部条件/效果/目标 kind；核验地图资源与 world region 双向一致、每个关口/事件的坐标边界与按 `tileTypes` 复现的通行性、事件引用的时段/天气/知识节点、四份文档对上述事实的覆盖（含每项任务「名称+发布人+前置+失败遭遇+报酬」行级匹配）；计数全部由数据推导，不硬编码任务/地图总数，不依赖 app UI 易变中文措辞；漂移时逐条输出文档路径与缺失项并以非零退出。临时目录故意制造五类漂移并验证 exit 1，六条预期诊断全部命中（关口坐标缺陷报告两条）。

### Verification (Round 34)

- `npm run audit:round-34`、`npm run validate:data`、`npm run typecheck`、`npm run build`、`npm run smoke:round-33`、`npm run smoke:round-31`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 33)

- 知识图谱由 54 节点扩至 **134 节点**，与当前基础目录全量对齐：50 件物品、30 种武学、20 项任务全部按稳定业务 id 映射到正确 `kind`（此前三类分别只映射 15/3/2 条）；12 名 NPC、5 个门派、2 张地图资源与 5 个结局节点覆盖不变。新增物品/武学词条首次取得或学会前保持未知（沿用 Round 29 观察式发现），新增任务词条沿用基础差事公开惯例，结局词条默认未知。
- 关系由 58 条扩至 **202 条**，补齐五类闭环：27 种门派武学 → 所属门派的 `belongsTo`；姜百味 31 个货架条目的 `holds`（含常备/限量说明）；9 条锻造配方结果 → 全部投入材料的 `requires`；20 项任务的发布人 `participatesIn`、15 条前置依赖、9 个收集目标与 12 个谈话目标的链路边；五条结局的每个图谱可判定条件来源（任务/见闻/门派在籍/NPC 关系）→ 结局节点的 `influences` 边。遭遇等无图谱节点的业务 ID 不伪造节点，纯数值条件不造无意义边。
- 新增 `scripts/smoke-round-33.mjs` 与 `smoke:round-33` 命令：以真实 JSON 对照断言目录 kind 全量映射（双向集合相等）、≥100 节点、节点/关系 id 唯一、全部边端点闭合、货架持有与锻造投入路径、武学门派归属、20 任务发布人与前置/目标链路、遭遇不入侵图谱、结局节点映射与条件影响边闭环；不依赖中文文案措辞。

### Verification (Round 33)

- `npm run validate:data`、`npm run smoke:round-33`、`npm run smoke:round-27`、`npm run typecheck`、`npm run build`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 32)

- 基础物品由 25 项扩至 **50 项**：新增 8 种药品、8 件装备、9 种锻造材料。八件新装备中两件可在姜百味货担购得，六件由铁砧连续锻造；19 项新增货架条目进入现有滚动商店，其余成品由六条配方取得。
- 基础武学由 6 种扩至 **30 种**：新增 24 种原创门派功夫，分配到听雨剑阁/铁嶂派/云隐山庄/寒山书院各 5 种、盘舷刀场 4 种，覆盖现有六类武学协议。
- 五位导师新增门派授艺目录；等级、属性和门派资格不符或已经习得时选项隐藏，学习效果仍由既有对话事务验证。资料只修改物品、武学、商店、锻造与对话 JSON，没有新增引擎名称或剧情分支。
- 新增 `docs/ITEMS.md`、`docs/MARTIAL-ARTS.md` 与 `scripts/smoke-round-32.mjs`；专项烟测覆盖总量/增量、唯一 ID、物品取得和配方材料闭合、五派授艺路径、实时学习/重复学习与完整世界装配。

### Verification (Round 32)

- `npm run validate:data`、`npm run typecheck`、`npm run smoke:round-32`、`npm run smoke:round-31`、`npm run smoke:round-30`、`npm run build`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 31)

- 基础任务链扩至 **20 项原创差事**：在既有「巷口送药」「巷口除患」之外新增 18 项，横跨方格试炼场的巷陌口信与雾雨渡口的药道抉择，覆盖收集、交谈、胜利推进与败北失败；12 名 NPC 全部标记为任务发布人，奖励、前置与文本全部数据驱动（任务志见 `docs/QUESTS.md`）。
- 任务协议新增**可选互斥分支 `exclusiveGroupId`**：同组且前置完全一致的任务构成一次玩家选择，装配时整组校验（有效成员不足 2 项或前置不一致即整组禁用，坏成员绝不留下假单选）；接取其一会按声明顺序把同组仍处待接取的兄弟确定性地记为失败并在结果中报告其 id，面板同步提示「另一条岔路就此封止」。本轮落地「先保药队 / 先修栈桥」分支，同列在白鹭洲的任务告示板供玩家比较，提供各自专属后续与差异化报酬（A 线偏历练 85 经验/50 银两，B 线偏实利 77 经验/93 银两）。
- 任务协议新增 **`talkToNpc` 谈话目标与 `npc-talk` 信号**：目标对已放置 NPC 校验（无须是发布人）；只有玩家实际打开 NPC 对话（F 键交谈，或 E 键对无名录/商店 NPC 的交谈回落）才推进目标——按 E 打开任务告示板不算谈话，接取差事的同一次交互也不自动完成谈话目标。`collectItem`/`defeatEncounter` 行为不变。
- 新增 3 个任务专用遭遇（雾夜探子、芦苇水路伏兵、栈桥索银人，均在雾雨渡口南岸空行），触发格避开全部人物、区域事件、关口、工位、药炉、门派战入口、终章入口与出生点；3 项新差事声明明确 `failOnEncounterIds` 战败失败（连同旧巷口除患共 4 项）。
- 存档不升版本：互斥失败态与谈话计数复用既有 `locked/offered/active/completed/failed` 五态与按目标 id 的 v1 计数快照；Round 31 之前的旧 v1 档读入后新任务按当前资料初始化，无需迁移。
- 新增 `scripts/smoke-round-31.mjs` 与 `smoke:round-31` 命令：数量与全局 id 唯一、三型目标与互斥组解析、坏引用逐条隔离与互斥组整组校验、完整世界装配零警告、新遭遇槽位避让与可达性、谈话信号语义（接取不自动完成/错人不推进/单次奖励）、物品接取快照、败北失败原子锁链、互斥分支双向原子性与幂等、`npc-talk` 唯一入口源码断言、v1 快照往返与 R31 前旧档免迁移恢复。

### Verification (Round 31)

- `npm run validate:data`、`npm run typecheck`、`npm run smoke:round-31`、`npm run smoke:round-30`、`npm run build`：通过；命令与输出细节见 `DEVLOG.md`。

### Added (Round 30)

- 基础世界扩至 **12 名可交互 NPC 与 5 个可拜师门派**：新增寒山书院教习柳听澜（方格试炼场）、盘舷刀场教头祝九弦与渡董白鹭洲（雾雨渡口）；两名导师经现有数据驱动对话正式收徒，白鹭洲承担渡口地方知识传递与跨门派议事（渡籍轮值章程见闻、会盟结果报备入籍、门派弟子登记）。
- 新门派寒山书院与盘舷刀场复用现有 admission/departure 协议与通用拜师运行时，未新增引擎分支；祝九弦传授既有通用武学「拦门刀法」，寒山书院暂不授专属武学（对话不引用武学条件，避免表面可见而不可用的选项）。
- 对话族改为多资源装配：manifest 中每个 `dialogue-set` 资源都参与合并（重复 id 保留清单先声明者），新增 `dialogues/round-30-conversations.json` 并登记；可选内容的坏档降级改按 manifest 声明的 schema 家族判断，不再按固定资源 id 枚举。引擎改动为通用机制，不含任何剧情、人名或门派名。
- 知识图谱新增 6 个节点（三名新人物、两个新门派、见闻「渡籍·轮值章程」）与 13 条关系边（师承、驻地图、渡籍掌录、轮值影响与人物态度传播）；新增人物志 `docs/CHARACTERS.md` 与门派志 `docs/FACTIONS.md`。
- 新增 `scripts/smoke-round-30.mjs` 与 `smoke:round-30` 命令：数量下限与新增恰数、全局 id 唯一、两图放置/日程零警告、固定互动格全避让、导师引用、拜师/授艺/退门事务与拒绝路径零变更、对话合并解析、图谱端点与态度边、完整世界装配及结局/门派战兼容负向保护（新门派不出现在任何结局条件或战争双方）。

### Verification (Round 30)

- `npm run smoke:round-30`、`npm run typecheck`、`npm run validate:data`、`npm run smoke:round-29`、`npm run smoke:round-28` 与 `npm run build`：通过；命令与输出细节见 `DEVLOG.md`。

### Added (Round 29)

- 新增独立 L 键江湖图鉴：按知识图谱八类展示已发现/总量和比例，未知条目只展示汇总数量，不暴露标题和摘要；K 键百科保留已知见闻与关联查询。
- 知识图谱引擎新增纯函数分类进度投影及同 ID/kind 观察式解锁；与人物交互、首次迎战、抵达对应地图、持有物品、习得武学会自动记入现有发现集合。
- 战斗遭遇可选声明 `knowledgeNodeId` 人物引用；首次迎战解锁对手词条，坏的可选图谱引用被忽略并警告，不影响遭遇战斗。
- 发现状态仍复用 v1 `knownKnowledgeNodeIds`，未增加重复图鉴数据集、存档字段或协议版本；更新键位帮助、知识图谱、数据指南、架构、GDD 和专项烟测。

### Verification (Round 29)

- `npm run smoke:round-29`、`npm run typecheck`、`npm run validate:data`、`npm run smoke:round-28` 与 `npm run build`：通过。
- 本地浏览器手动验证：新开局后 L 可打开图鉴，按 → 键切换到人物类并正确显示 5/10 与 50%；关闭图鉴后 K 可单独打开百科。
- `git diff --check`：通过；Vite 仍提示主 JS chunk 超过 500 kB 默认建议线。

### Added (Round 28)

- 新增可选 `achievement-set` 资料族与 schema（draft-07）；成就条件、展示文本与经验/银两奖励由 JSON/MOD 声明，封闭 14 类条件按 AND 组合，逐条坏成就只禁用自身。
- 新增 `achievement-system` Phaser-free 规则：防御解析、跨资料引用装配、纯函数进度投影（计数/区间/布尔三类展示）与一次性解锁领奖；奖励经验沿用成长协议并联动经脉修为，银两按存档上限截断。
- 新增 v1 可选 `achievementState` 存档字段（历史解锁 id 与战斗/锻造/炼丹三个单调计数器）；旧 v1 缺字段按空基线兼容，解锁 id 不按当前资料过滤以防 MOD 重复发奖。
- 新增 G 键成就面板：锁定/进行中/已解锁状态、逐条件进度、奖励与汇总；帮助面板与状态行加入 G 键提示；战斗胜利、锻造、炼丹与对白/任务等收口点即时重评。
- 新增 14 条基础成就，覆盖等级、差事、见闻、善恶、声望、门派、关系、战斗、擂台、经脉、自创武学、锻造与炼丹。
- 新增 `docs/ACHIEVEMENTS.md`，并更新存档、数据指南、架构、GDD、开发日志与路线图。

### Verification (Round 28)

- `npm run smoke:round-28`、R27/R26/R25 串行回归、`npm run validate:data`、`npm run typecheck` 与 `npm run build` 均通过；构建有主 JS chunk 超过 500 kB 的体积建议。
- `git diff --check` 通过；未进行浏览器手动游玩，G 键面板、键位输入和实际奖励提示未做交互实测。

### Added (Round 27)

- 新增可选 ending-set 资料族与 schema；地图终章入口、结局叙事和任务/善恶/声望/关系/门派/见闻条件均由 JSON/MOD 声明。
- 新增五条可达结局与图谱节点关系，渡口终章面板展示锁定提示、可选归宿及终章文本。
- 新增 Round27 世界装配、几何/引用校验与专项烟测。

### Verification (Round 27)

- 资料校验、完整世界装配、Round27 smoke、R26–R24 回归、类型检查、生产构建均通过；生产主 bundle 仍高于 Vite 默认分包建议线。

### Added (Round 26)

- 新增 NPC 私有见闻状态：由图谱 `knows` 边初始化，玩家可在对白中分享已知节点，后续对白用 `npcKnows` 区分 NPC 实际知情与玩家百科状态。
- 知识图谱人物边支持 `attitudeSpread`；关系变化按有符号系数传播一跳，不递归，端点、范围与零系数规则均经 Schema/parser 检查。
- 新增可选 v1 `social.npcKnowledge` 存档字段与 MOD 删除引用软过滤；旧 v1 读档时根据当前图谱重建 NPC 静态记忆。
- 新增 Round26 专项烟测，覆盖图谱种子、对白引用隔离、事务回滚、态度传播、旧新存档和失效引用过滤。

### Verification (Round 26)

- `npm run validate:data`：通过，manifest 与 23 个基础资源 Schema 均通过。
- `npm run smoke:round-26`：通过 NPC 见闻隔离/分享/后续回应、事务回滚、态度传播系数与方向、v1 新旧兼容及 MOD 引用软过滤。
- 生产构建、Round 23–25 回归及 `git diff --check` 结果在 `DEVLOG.md` 中记录。

### Added (Round 25)

- 新增可选 `alchemy-set` Schema/manifest 资源和同路径 MOD 覆盖；地图药炉、药师、方子、材料/产物跨引用及日程占位可独立校验，无资料时世界可正常运行。
- 新增三味药材、三张需对话发现的药方及三档固定品质成药；悟性决定结果 item id，结果为沿用恢复规则的普通消耗品。
- 新增 Phaser-free 药炼规则和邻接 E 面板；可查看未知药方寻方线索、材料/工钱、悟性产出预览。资金/材料/背包失败不改状态，成功后刷新 collectItem 数量。
- 药方发现复用已知知识 id，成药复用普通物品背包、任务、百科与 v1 存档；新增炼丹资料作者指南，并更新 GDD、架构、图谱、数据、存档、帮助、README、开发日志及路线图。

### Verification (Round 25)

- `npm run build`：通过；122 个模块，主 JS 1,826.18 kB（gzip 481.76 kB）；Vite 仍提示超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 23 个登记基础资源 Schema 通过。
- `npm run smoke:round-25`：通过，覆盖图谱/配方解析、工位占位与四向邻接、发现门控、悟性品质、缺钱/缺料/背包容量拒绝不变性、满包转换、任务收集信号、成药使用、单配方隔离、v1 存档及无资料降级。
- `npm run smoke:round-24`、`npm run smoke:round-23`：顺序回归均通过。
- `git diff --check`：通过；Git 提示部分 LF 工作区文件将在下次触碰时规范为 CRLF。本轮未进行浏览器手动流程，不宣称面板已浏览器实测。

### Added (Round 24)

- 新增可选 `equipment-forge-set` Schema/资源与同路径 MOD 覆盖；工位校验地图可走格、出生点、NPC、遭遇、擂台、门派战、重复工位占位，坏配方按单条隔离。
- 新增渡口锻造工位与三条同槽装备转换配方、三种原创材料及行商货架；配方强制基础装备恰一件、其他投入为杂项、结果属性不降级且至少一项提升。
- 新增 Phaser-free 锻造事务和邻接 E 面板；预览材料库存/银两/进阶装备效果，拒绝已装备投入，克隆背包核验扣料后空间再整体提交；成功后刷新任务收集数量。
- 产物作为普通装备 item id 穿戴并参与属性与战斗伤害，沿用 v1 物品/装备保存和读档重算，无新增快照字段；更新 GDD、架构、数据、存档、锻造说明、README、开发日志与路线图。

### Verification (Round 24)

- `npm run build`：通过；120 个模块，主 JS 1,809.95 kB（gzip 478.95 kB）；Vite 报告主包超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 22 个基础资源 Schema 通过。
- `npm run smoke:round-24`：通过，覆盖资源解析/跨引用/占位隔离、四向邻接、降级配方隔离、缺钱/缺料/穿戴状态拒绝不变性、满包转换、穿戴后战斗伤害变化与 v1 存档恢复。
- `npm run smoke:round-23`、`npm run smoke:round-22`：顺序回归均通过。
- `git diff --check`：通过；Git 提示修改文件将由 LF 规范为 CRLF。本轮未进行浏览器手动流程，锻造 UI 由构建与代码/引擎冒烟覆盖。

### Added (Round 23)

- 新增可选 `meridian-set` 经脉 Schema/JSON 与同路径 MOD 覆盖；验证修为规则、唯一节点、前置 DAG、材料和效果边界，坏经脉资源只关闭内修入口。
- 新增 Phaser-free 内修规则：按资料发放升级修为，逐节点检查等级/前置/修为/材料后原子消耗并解锁；失效材料只禁用该节点及其依赖节点。
- 角色状态独立追踪经脉加成；基础属性、装备和经脉奖金重算，气血/内力上限随等级/换装/经脉同步；普通遭遇、擂台和门派战胜利升级均能获得修为。
- 新增 N 键经脉面板，显示修为余额、节点状态、效果、材料和前置；更新帮助/HUD 操作提示。
- v1 快照保存修为与已打通节点；旧档缺字段兼容，非法余额/重复或过量节点拒绝，MOD 移除节点时过滤并告警，恢复后按当前资料重算效果。
- 新增经脉作者说明及 Round 23 冒烟验证，更新 GDD、架构、存档、数据指南、README、开发日志与路线图。

### Verification (Round 23)

- `npm run build`：通过；118 个模块，主 JS 1,795.26 kB（gzip 475.41 kB）；Vite 报告主包超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 21 个登记基础资源 Schema 通过。
- `npm run smoke:round-23`：通过经脉 DAG/材料引用隔离、修为上限、原子拒绝、加成重算、战斗升级奖励、新旧 v1 存档和 MOD 节点过滤。
- `npm run smoke:round-22`、`npm run smoke:round-21`：顺序回归均通过。
- `git diff --check`：提交前复核；本轮未做浏览器手动游玩，不宣称 UI 经浏览器实测。

### Added (Round 22)

- 新增可选武学组件资源与 Schema；招式、架势、吐纳可由同路径 MOD 覆盖，缺失/损坏时只禁用创制。
- 新增 C 键自创武学面板，支持组件选择、名称输入、功力/内力/费用预览、5 门上限与平衡预算约束；拒绝交易不扣钱。
- 玩家作品立即加入已学武学，并可用于普通遭遇、擂台与门派战；v1 快照保存完整定义，旧档缺字段默认为空。
- 修复扩展平面 Unicode 组件文本的创制/读档长度单位不一致；名号编辑改为原生文本输入以支持中文 IME，并拒绝存档注入控制字符名称。
- 更新操作提示、README、GDD、原创还原度、架构、数据指南、存档规则和独立创武说明。

### Verification (Round 22)

- `npm run build`：通过；116 个模块，主 JS 1,781.43 kB（gzip 471.51 kB），仍触发 Vite 默认 500 kB 分包建议。
- `npm run validate:data`：通过；manifest 与 20 个登记基础资源 Schema 通过。
- `npm run smoke:round-22`：通过，覆盖组件语义、创制原子性、战斗招式可用及新旧 v1 存档往返/防篡改边界。
- `npm run smoke:round-21`：串行重跑通过，覆盖门派战资料、战斗/贡献和新旧 v1 存档回归；首次并行运行的端口提示未复现。
- `git diff --check`：通过；Git 提示工作树文件 LF 将在后续 Git 操作中规范为 CRLF。

### Added (Round 21)

- 新增可选 faction-war-set 资料和 Schema；会盟入口、参战两派、双方每阶段专属敌手、贡献、结局声望和图谱节点均由 JSON 定义，坏入口/引用逐战隔离。
- E 邻接报名页显示两派完整阶段赛程及战绩；两派门人分别迎战对方的资料敌手，阶段败阵恢复后可继续，贡献门槛决定胜/平/负，撤退会提前结算。
- 会盟后果接入个人/双方门派声望、百科见闻和铁嶂/云隐师长的知识条件对白；门派战敌手不发普通遭遇任务信号。
- v1 快照新增报名/胜平负/贡献战绩；旧 v1 缺字段默认为空，移除战事资料后只清理该条战绩并警告。
- 报名面板按高度分页显示最多 12 个阶段；纯查看不再保存空战绩，存档冒烟覆盖 MOD 过滤后的恢复快照。
- 新增门派战作者说明、双方战斗与存档冒烟脚本，更新数据/架构/GDD/知识图谱/原作还原边界文档及路线图。

### Verification (Round 21)

- `npm run build`：通过；Vite 完成 114 模块构建，主 JS 1,768.18 kB（gzip 467.62 kB），超过默认 500 kB 提示线但不阻断。
- `npm run validate:data`：manifest 与 19 个登记基础资源 Schema 通过。
- `npm run smoke:round-21`：通过，覆盖 12 阶段分页、两派专属阶段战斗、入口/门派引用隔离、贡献胜平负、旧 v1 缺省，以及经恢复预检快照的记录保留/MOD 移除过滤。
- `git diff --check`：通过；Git 仅提示部分 LF 文件后续可能规范为 CRLF。

### Added (Round 20)

- 新增独立擂台 JSON 资料与 arena-set Schema；校验入口格、角色模板、敌方武学、彩头物品及占格冲突，E 邻接打开赛程/奖励/战绩页。
- 报名后自动连续挑战数据对手，共用回合战斗/经验/伙伴援护；胜利逐轮接续，败退/撤退停止，只有全胜夺魁会完整发放文钱和物品彩头。
- v1 快照加入报名次数、最佳胜场、夺魁次数与最近胜场；旧 v1 缺字段为空记录册。
- 新增战绩保存规则、Ajv 全资源校验与 Round 20 Phaser-free 冒烟脚本。

### Verification (Round 20)

- npm run build：通过；112 模块生产构建完成，Vite 显示主 JS 包超过 500 kB 建议线。
- npm run validate:data：manifest + 18 个登记基础 JSON 通过 Ajv。
- npm run smoke:round-20：擂台引用装配/占格隔离、邻接入口、两场通用战斗经验、战绩值域及旧/新 v1 存档往返均通过。
- git diff --check：通过；只有仓库 LF→CRLF 自动转换提示。

### Added (Round 19)

- 新增独立伙伴资料与 draft-07 Schema；伙伴引用有效 NPC，支援专长及行动间隔来自数据。
- 对话加入招募/暂离效果，沿用 NPC 关系条件；场景以不阻挡玩家的同行标记跟随，并可跨区重置位置。
- 回合战斗加入伙伴攻/疗援护与专属战报；P 键伙伴册展示关系/专长并可让伙伴暂离。
- v1 存档记录当前同行伙伴，旧档缺字段归一为空伙伴，已移除伙伴在恢复时清理并警告。
- 新增伙伴数据作者与架构说明，更新对白、存档、GDD 和路线图。

### Verification (Round 19)

- `npm run build`：通过；TypeScript 检查与 Vite 生产构建完成，主 JS 包仍超过 500 kB 建议线。
- Ajv / Phaser-free 冒烟及 `git diff --check` 结果见本轮 DEVLOG。

### Added (Round 18)

- 社会数值统一经 `SocialChange` 按善恶、个人声望、逐派声望与逐 NPC 关系的独立范围变化和钳制。
- 对话新增本门声望区间条件与变化效果；门派资料新增拜师本门声望门槛及退门本门声望代价，基础导师对白演示两种接入。
- J 师门页展示各门派声望与拜师/退门要求；v1 存档记录逐派声望，缺字段旧档和移除门派数据均可兼容恢复。
- 更新数据作者、对话、架构、GDD 与存档说明。

### Verification (Round 18)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过，转换 108 个模块；主 JS 包 1,724.10 kB，超过 500 kB 建议线但不阻断构建。
- Ajv 校验 manifest 与全部 16 个登记基础资源：17/17 通过；Phaser-free Node 冒烟检查：41/41 通过，覆盖声望边界、门派门槛/退门、对白条件显隐/引用隔离/事务回滚及新旧 v1 存档恢复。
- `git diff --check`：通过；仅提示 Git 将在后续写回时把 LF 转为 CRLF。

### Added (Round 17)

- 区域事件新增知识节点、游戏时段、天气组合门槛与百科发现效果；条件组之间全部满足、组内任一 id 满足。
- 世界加载逐事件校验图谱/历法/天气引用，悬空引用只禁用对应奇遇；一次性状态只在门槛成功后结算。
- 渡口脚印线索接入“芦苇河滩”黄昏/夜间降雨奇遇；原地等候时会重新检查区域事件，并合并等待与见闻提示。
- 区域奇遇复用既有 v1 `completedRegionalEvents` 和 `knownKnowledgeNodeIds`，无需变更存档协议。
- 更新舆图、知识图谱、资料指南、架构和存档说明。

### Verification (Round 17)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过；Vite 提示主 JS 包超过 500 kB 建议线，不阻断构建。
- Ajv 校验 manifest 与全部登记基础资源：17/17 通过（含新的 `world-map` 事件 Schema 与对白资料）。
- Phaser-free Node 冒烟验证：Schema/解析、条件前置/时段门槛、组内天气候选、完成状态筛选、百科首次发现幂等和悬空引用逐事件隔离通过。
- `git diff --check`：提交前复核。

### Added (Round 16)

- NPC 资料新增可选时段日程，按历法时段切换地图位置；日程跨历法、地图、玩家出生格、固定遭遇及其他 NPC 冲突校验，并以逐项基础位置回退隔离坏日程。
- 探索场景会同步 NPC 标记、姓名牌、占位与交互，跨区抵达按抵达时段派生人物位置；NPC 坐标不新增存档字段。
- 新增 `docs/NPC-SCHEDULES.md`，记录 NPC 日程协议、作者约定和存档派生方式。

### Fixed (Round 16)

- 存档恢复预检此前使用 NPC 静态基础坐标；当 NPC 已按日程迁走、玩家合法站在其原格时会错误拒绝读档。现在预检按快照时段、地图、玩家格和有效遭遇解析与运行时相同的实际 NPC 占位。

### Verification (Round 16)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过；主 JS 包超过 500 kB 建议线但不阻断。
- Ajv 校验 manifest 与全部 16 个登记资源：17/17 通过。
- Phaser-free NPC 日程/运行时玩家格冒烟校验：通过；覆盖移动人物的原基础格、日程目标格冲突回退。
- 浏览器手动回归：时段推进后 NPC 可见移动并可交谈；空槽保存后刷新读档成功，玩家仍在原时段与位置且 NPC 正确避让玩家格。首轮复现到的基础格误拒已修复并复验。
- `git diff --check`：通过。

### Added (Round 15)

- 新增必需 `climate.base` 资源与 draft-07 `climate` Schema：季节按历法月份分区，每季定义加权天气，天气资料控制叠色色彩、程序雨雪粒子及移动附加分钟数。
- 新增 Phaser-free `climate-system.ts`：对照已解析历法验证月份无遗漏/重叠、天气引用与正权重；按世界种子和游戏历日确定性推导季节与逐日天气。
- 探索 HUD 显示季节、天气和步行附加耗时；场景用程序粒子绘制雨雪、以数据色调叠加环境。只有成功单格移动叠加天气步耗时，旅行与等候继续采用历法动作成本。
- v1 存档新增 u32 `worldSeed`；Round 14 及更早旧 v1 档缺字段时稳定归一为种子 `1`。
- 新增 `docs/CLIMATE.md`，并更新数据指南、存档说明、架构、GDD、README 与路线图。

### Verification (Round 15)

- `npm run build` 通过：TypeScript 检查无错，Vite 转换 107 个模块；主 JS 包仍超过 500 kB 建议线。
- Ajv 校验 manifest + 16 个登记资源：17/17 通过。
- 临时 Phaser-free 气候/存档冒烟 harness：33/33 通过，覆盖四季月份映射、逐日天气确定性、加权表边界、季节/天气坏引用隔离、种子上下界与旧 v1 默认值、存档捕获和 JSON 往返。
- 浏览器手动验收（本地 Vite）：HUD 日切显示季节天气；细雨粒子可见并提示每格 +1 分钟；成功步行 00:01→00:03，雨天撞墙仍为 00:03，V 等候推进 60 分钟；保存、刷新并继续后于同一天恢复同一细雨天气和 01:03 时刻。
- `git diff --check` 通过。

### Added (Round 14)

- 新增必需 `game-calendar` 历法资源与 draft-07 Schema：月份、日内时段（起始分钟/照度）、起始时刻与动作耗时；加载期语义校验拒绝重复 id/时段起点、缺零点时段、悬空起始引用与越界耗时。
- 新增 Phaser-free 游戏时钟：以已过分钟数为唯一权威状态，折算年/月/日/时刻并做循环时段查询（跨午夜自然成立）；只有成功的移动、区域旅行与 V 键等候推进时间，被阻挡或被面板拦截的操作零消耗。
- 探索 HUD 显示历日/时刻/时段；世界层按时段照度渐变夜幕调色，UI 与面板保持清晰；H 帮助列明 V 等候键。
- 对话新增 `timeOfDay` 时段条件（Schema/解析/引用装配/运行时求值一致）；悬空时段引用只剔除相关选项。
- v1 存档新增 `elapsedGameMinutes` 分钟计数；Round 13 及更早旧档缺字段时从历法起始时刻恢复，日期随时由当前资料折算。

### Fixed (Round 14)

- 时钟只接受正的安全整数分钟推进；分数分钟与溢出请求明确拒绝，最大安全计数下的日期/分钟折算保持精确。

### Verification (Round 14)

- `npm run build` 通过（106 个模块）；Phaser 主 bundle 大于 500 kB 建议线，构建成功。
- 临时 Ajv harness 通过 manifest 与全部 15 个登记资源（含新的 game-calendar 与扩展后的 dialogue-set Schema），16 项校验零失败。
- 临时 Phaser-free 冒烟 harness 39/39 通过：历法语义拒绝、时钟跨日/跨月/跨年与午夜时段边界、零/负/NaN 不推进、时段条件显隐、悬空时段逐选项隔离、存档分钟计数往返/旧 v1 缺省归一/非法值拒绝与恢复预检透传。
- 浏览器手动验收：时间 HUD、V 等候推进与反馈、H 帮助打开时 V 阻止、夜幕调色与 UI 清晰、移动推进与被阻挡零消耗、入夜时段对话选项显隐、保存刷新读档精确恢复入夜时刻与夜色、删除新字段模拟旧档后从起始晨光恢复。
- 提交前独立复核：修正分数分钟边界后重跑 `npm run build`；manifest + 15 个资源通过 Ajv；19 项直接时钟边界断言通过（分数/非有限/超安全整数与累计溢出拒绝、午夜/月界、最大安全计数精确折算）；`git diff --check` 通过。
- `git diff --check` 通过（结果记录于 `DEVLOG.md`）。

### Added (Round 13)

- 门派资料支持导师、入门门槛、退门代价与门派武学去留；三位原创师父在地图上提供拜师、授艺和退门对话。
- 新增师门关系状态与 J 键门派档案页；拜师/退门/授艺使用对话原子事务，并接入存档恢复预检。
- 对话 Schema 增加门派身份与武学资格条件，以及拜师、退门、授艺效果；旧版门派资料和 v1 存档保持缺省兼容。

### Added (Round 12)

- 新增共享像素 UI 色板、阶梯边框与选中底条；主菜单、对话、战斗、背包、商店、任务、暂停、舆图、百科共用视觉原语。
- 新增代码生成的人物像素标记和网格瓦片亮/暗边缘，开启 Phaser 整像素绘制及 CSS 像素缩放；不引入外部素材。
- 新增 H 键操作手册，列出探索与面板常用输入；帮助层互斥并锁定世界移动。

### Fixed (Round 12)

- 探索 HUD、地图名、NPC/敌人名牌在暂停设置调整文字大小后即时刷新；关闭设置时同步运行设置状态，重开标签不回退。
- 缩短 HUD 常驻快捷键行，避免挤占居中地图名；战斗招式以焦点跟随窗口呈现，任务说明/目标按实际换行高度布局。
- 角色模板长描述启用 CJK 高级换行，窄视口下不会沿横向被裁切。

### Verification (Round 12)

- `npm run build` 通过（103 个模块）；Vite 保留既有主 bundle 超过 500 kB 的非阻断提示。
- Ajv 检查通过：manifest + 14 个已登记资源；共 14 份 schema 契约（含 manifest）。
- 浏览器手动验证窄视口下新游戏/角色创建、探索 HUD、H 帮助开关与移动锁、百科/背包焦点底条、任务日志、舆图和暂停设置字号更新/重开保留。
- `git diff --check` 通过；Git 仅提示当前工作副本的 LF→CRLF 转换。

### Verification (Round 13)

- `npm run build` 通过（105 个模块）；Phaser 主 bundle 大于 500 kB 建议线，构建成功。
- Ajv 检查 manifest 与 14 个已登记资源全部通过，包括扩展后的 faction/dialogue Schema。
- 临时 Phaser-free 情景 harness 通过：入门门槛/导师限制、重复拜师拒绝、门派武学授艺、事务回滚、退门惩罚与遗忘武学、旧 v1 存档缺省和悬空导师软隔离。
- 浏览器手动验收了 J/H 面板、条件不足的可读反馈、跨区拜师、身份展示、保存后重载读档；`git diff --check` 最终结果记录于 `DEVLOG.md`。

### Added (Round 11)

- 新增独立知识节点/关系数据族、draft-07 Schema、manifest 注册与 Phaser 无关图谱解析装配；样例包含 22 个节点、10 条关系边，支持 8 类节点及 12 种关系协议。
- 新增 K 键江湖百科：按类别筛选、展示已知词条和双方已知的关联；未解锁条目以泛化行显示，不暴露内容。
- 对话选项新增 `knowledgeKnown` 条件与 `discoverKnowledgeNode` 效果；发现进度进入 v1 存档，兼容 Round 10 及更早的 v1 快照。
- 新增 `docs/KNOWLEDGE-GRAPH.md`，并更新 GDD、架构、数据、存档、路线与 README 文档。

### Verification (Round 11)

- Ajv 检查 manifest 与 14 个登记资源通过，使用当前 14 份 schema 契约。
- 临时 Phaser 无关 harness 通过图谱解析/逐条隔离、知识门控与发现、坏引用剔除、效果事务原子性、Round 09/10 旧 v1 字段兼容和恢复公开词条基线；脚本随后清理。
- 浏览器手动验证百科分类/锁定见闻隐私与探索输入锁、对话发现两条线索、后续知识条件选项出现，以及保存/重载/继续后已知词条恢复。
- `npm run build` 通过（101 个模块）；`git diff --check` 通过。Vite 仍提示约 1,677 kB 的主 JS chunk 超过 500 kB 建议值。

### Added (Round 10)

- 增加 `world-map` 资料 Schema 与语义装配，manifest 可登记多张网格地图；地区图册通过 M 键查看，并高亮当前所在区域。
- 新增雾雨渡口原创地图、区域节点、可往返关口与数据驱动区域事件；E 键交互保留 NPC/遭遇优先级，关口旅行会检查目标落点。
- 扩展 v1 存档以持久化当前地图和一次性区域事件状态，并兼容缺少事件字段的 Round 09 v1 快照。
- 新增 `docs/MAP-ATLAS.md` 区域资料说明，并更新架构、数据指南、存档说明、README 与路线图。

### Verification (Round 10)

- Ajv 检查 manifest 和 12 份登记资源全部通过；世界图解析/装配冒烟检查通过。
- 浏览器验证舆图输入锁、关口往返、一次性事件去重、跨区存档恢复及旧 v1 缺省字段兼容。
- `npm run build` 与 `git diff --check` 通过；Vite 主 bundle 仍有超过 500 kB 的非阻断建议。

### Fixed (Round 08 parser isolation)

- 当条件通过 draft-07 Schema、但同时声明的 `minValue`/`maxValue` 顺序相反时，防御解析器现在只隔离该对话并发出 warning，集合中其他对话和引用它们的 NPC 继续可用；顶层 envelope 错误仍拒绝整份集合，静态 Schema 错误仍按通用加载规则拒绝资源。

### Fixed (Round 00 reference audit)

- 给 `docs/REFERENCES.md` 的历史/回忆来源与官方技术资料统一分配不重复编号（#1–#12），并明确官网文档页面许可未逐页核实、仅作事实查阅；npm 包许可证仅按精确版本 registry 元数据记录，不代表文档页面许可。
- 保留 `docs/ORIGINAL-FIDELITY.md` 中 #1–#5 的历史来源引用语义，不改变原作证据等级或已冻结技术栈。
- 修正 GDD 过时的 Round 02 状态标注，并将当前已登记、由加载器校验的 11 份 schema 契约列明；未进入 manifest 的数据族仍标为待补契约。
- 补充 GDD 核心系统目标矩阵，集中说明探索、对话、任务、战斗、经济、社会后果、世界模拟、存档与 MOD 的玩家体验，并区分当前实现和后续计划。
- 删除无法由 ZOL 问答页正文证实的“2008 年”发布日期，保留该来源作为无日期、低置信度的社区转载记录。

### Added (Round 09)

- 新增版本 1 纯数据本地存档协议 `src/engine/save-system.ts`：三个命名槽位支持列举、保存、读取与删除；快照包含角色成长/位置、背包装备、商店库存、任务进度、善恶声望关系和一次性遭遇状态，恢复时重算派生属性。
- 新增主菜单与角色创建流程、继续/删除存档页、游戏中 Esc 暂停菜单和槽位保存页；新游戏可选现有角色模板并编辑显示名。
- 新增持久设置：主音量和文字大小，分别作用于声音总线与 UI 字号；设置和存档用独立 localStorage 键。
- 新增 `docs/SAVES.md`，说明槽位协议、恢复预检和兼容边界。

### Changed (Round 09)

- 读档需先通过快照字段/版本检查和当前世界引用预检；角色模板、地图资源或站位失效时整体拒载。悬空次级引用以警告逐项清理，当前资料上限变化会安全收敛保存值。
- 启动流程先加载资料和设置并进入主菜单；可用角色资料缺失时呈现可读错误，不构造半空新局。无 localStorage 时保留可玩会话并报告设置/存档不可用。
- 更新 README、GDD、架构说明、数据指南、路线图与开发日志，完成 Round 09 并将 Round 10（世界地图/区域切换）设为下一轮。

### Verification (Round 09)

- `npm run build` 通过：`tsc --noEmit` 与 Vite 生产构建成功，97 个模块，JS bundle 1,651.79 kB（gzip 436.54 kB）；Vite 仍提示主 chunk 超过 500 kB 建议阈值。
- 临时存档/设置 smoke harness 83 项通过、0 项失败，覆盖 round-trip/二代快照一致、解析防御、无效写入保留旧槽、localStorage 错误与配额、世界引用预检、数据变化钳制及恢复派生值；验证后移除 harness。
- 浏览器手动验收确认主菜单、新游戏模板与显示名、地图进入、Esc 暂停、保存槽位和存档摘要流程；未引入持久自动化测试，Vitest 基线按路线图留至 Round 38。

### Fixed (Round 08 protocol audit)

- 修正 `dialogue-graph.ts` 将声望状态下界 `0` 错用为 `adjustRenown.delta` 下界的问题。负向 delta（-1000…-1）现在可通过防御解析，与 Schema 接受的 -1000…1000 非零范围一致；声望状态结算仍钳制于 0…1000。沈墨涵强硬交付分支现在扣除 2 点声望并保留原有善恶/关系后果。
- 审核条件/效果解析协议与 draft-07 Schema 的枚举、字段及数值值域，并在数据指南区分声望当前值和声望变化量。
- 临时 Ajv/引擎协议矩阵 27 项与实际沈墨涵对话集集成回归 11 项断言全部通过；`npm run build` 的 TypeScript 检查及 Vite 生产构建通过（97 模块）。临时脚本与打包文件已清理；仍有既有主 chunk 超过 500 kB 的非阻断提示。

### Added (Round 00 research follow-up)

- 为原作对照补入一条有明确范围的《白金英雄坛说》开发者证言：go1980 报道称参与开发者将“击杀不同人物影响结局”作为白金版新增要素。因该信息仅见于单篇媒体采访转述，标为中等置信度并明确未获独立印证；只将其映射为本作原创行为驱动多结局设计，不引用原作人物、名单或结局内容。
- 登记 ZOL 问答页中的白金版玩家指南转载，新增低置信度 A6 摘要，限于方向键行走、NPC 动作菜单与回合制战斗等高层交互信息；来源称指南转自百度贴吧，未作官方规格或独立验证，不复述专名与路线细节。

### Verification (Round 00 research follow-up)

- `npm run build` 通过：TypeScript 检查与 Vite 生产构建成功（97 模块）；`git diff --check` 通过。Vite 有主 bundle 超过 500 kB 的非阻断建议。

### Corrected (Round 00 research audit)

- 更正 TapTap app 28348 的来源归属：这是后作《英雄群侠传》的介绍页及其第一人称回忆，不是独立玩家评测；撤销其对《白金英雄坛说》自由探索/养成机制的证据映射，并进一步限定 go1980 来源所描述的早期《英雄坛说》范围。

### Added (Round 08)

- 扩展 draft-07 `dialogue-set` 契约：选项新增可选 `conditions`（questStatus/itemCount/morality/renown/npcRelationship 五种封闭枚举，全满足才可见）与 `effects`（acceptQuest/abandonQuest/giveItem/takeItem/adjustMorality/adjustRenown/adjustRelationship 七种，先全量验证再统一提交）；未知字段/kind 与越界值在 Ajv 与防御解析两级被拒，旧无条件对话完全兼容，坏跨资源引用只剔除相应选项。
- 新增 Phaser 无关 `src/engine/social-state.ts`：运行时善恶（±100）、声望（0–1000）与逐 NPC 关系（±100）标量及边界钳制；新增 `src/engine/dialogue-runtime.ts`：条件求值、可见选项过滤、装配期引用隔离与跨任务/背包/社会状态的原子效果事务（任一效果被拒则零变更、不转移节点），物品变动同步活动任务收集目标（进度可回退）。
- 示例对话扩展覆盖任务接取/进度/放弃/交付、物品赠予与残篇交付（善/恶两种）、声望门槛与 NPC 关系渐进解锁分支；任务发布人保留 E 名录并新增 F 键直接交谈，交互提示双入口并列显示。

### Changed (Round 08)

- `DialoguePanel` 支持场景注入的条件过滤与效果执行钩子，节点文本下新增效果反馈行（成功绿/拒绝黄）；全部选项被过滤的节点按结束节点处理（Enter/Esc 正常收束，不锁输入）。`item-system` 公开 grantItems/removeItems 提交原语供对话效果在验证后调用；GridScene 持有社会状态并按对话效果结算任务奖励/HUD 提示。社会状态、关系与对话产生的任务变动均为运行时内存态，持久化留给 Round 09。

### Verification (Round 08)

- `npm run build` 通过（92 模块，bundle 1,608.58 kB / gzip 424.53 kB）；临时 Node/Rolldown/Ajv 冒烟检查 42 项全部通过（旧数据兼容、未知字段/kind/值域拒绝、条件过滤、接取/放弃/交付、背包容量与物品不足拒绝、组合失败零变更回滚、收集目标回退、善恶上界钳制、隐式关系目标、坏引用选项剔除），脚本已删除。Vite 仍报告 Phaser 主包超过 500 kB 建议阈值。
- 浏览器手动验证：地图加载无资料警告；邻接任务发布人提示"按 E 查看差事 · F 交谈"；F 对话仅显示 offered 任务选项（active/completed/关系分支正确隐藏），接取后反馈"已接取「巷口送药」"且 HUD 跟踪 2/3；E 名录仍可用；顾夜尘带话后反馈关系 +10，再对话解锁关系≥10 新选项；面板打开时移动锁定。

### Added (Round 07)

- 新增 draft-07 `quest-set` 契约、manifest 可选任务资源和两项原创差事；任务资料声明发布 NPC、前置任务、收集/击败目标、败北失败条件与经验/银两奖励。NPC 新增可选 `questGiver` 标记和原创发布人马尚义。
- 新增 Phaser 无关 `src/engine/quest-system.ts`：任务解析、重复 id 与 NPC/物品/遭遇/前置引用校验、循环依赖隔离、locked/offered/active/completed/failed 生命周期、目标事件推进、主动放弃与恰好一次完成奖励。
- 新增任务名录/日志面板：邻接发布人按 E 查看和接取，Q 随时打开日志；Enter 接取或跟踪/取消跟踪，A 放弃，覆盖层锁定探索移动。

### Changed (Round 07)

- NPC Schema 与运行时记录增加可选 `questGiver` 布尔字段，旧 NPC 缺省为 false；manifest 将任务集作为可选资源登记，坏任务与坏前置只隔离相应任务链，不阻断其余世界。
- 背包数量变化驱动收集目标，战斗胜败驱动任务目标与失败条件；任务完成后统一发放经验和银两并刷新可解锁前置任务。任务进度为运行时状态，持久化留给 Round 09。

### Verification (Round 07)

- `npm run build` 通过（90 模块，bundle 1,598.33 kB / gzip 421.58 kB）；临时 Node/Rolldown/Ajv 任务与 Schema 冒烟检查通过，脚本已删除。Vite 仍报告 Phaser 主包超过 500 kB 建议阈值。
- 浏览器手动验证：从发布人名录接取、日志显示开局收集进度 2/3、商店补足物品后完成并显示经验/银两奖励、接取击败目标并胜利完成、A 放弃后状态为失败；面板打开时玩家不能移动。

### Added (Round 06)

- 物品/商店资料契约：新增 draft-07 `items-set` / `shops-set` Schema 与 manifest 资源，原创 7 件物品（3 消耗品、3 装备、1 不可交易杂物）及 1 家数据驱动商店/地图货郎；角色模板声明 120 银两、12 堆背包容量与 4 件起始物品。
- Phaser 无关物品引擎 `src/engine/item-system.ts`：物品与商店解析/索引/跨引用装配、坏库存条目和重复 id 隔离、起始物品逐条校验、容量与堆叠上限、消耗品恢复生命/内力、装备槽与属性/生命/内力加成、有效属性与等级成长分离、购买/出售原子校验及商店库存变动；拒绝非正交易数量，防止异常数量污染货币/库存。
- 键盘 UI 与地图接线：B 打开背包（查看银两/容量/属性/装备/物品，Enter 使用或装备/卸下）；与数据声明的相邻商人按 E 开店，可在购买/出售页签间切换并逐件交易；所有覆盖层打开时移动锁定、关闭后恢复。玩家状态改由角色模板独立创建，不再依赖有效战斗遭遇；无遭遇数据时背包仍可运行。坏商店引用回退到 NPC 原对话并给出警告。

### Changed (Round 06)

- 扩展角色模板 Schema/运行时状态：新增 `startingCurrency`、`inventoryCapacity`、`startingItems`；`CharacterState` 分离基础属性与装备后的有效属性，升级只增长基础属性并重新应用装备加成。
- 扩展 NPC `shopId` 可选字段及 Schema；原 NPC 对话字段不变，商店引用有效时 E 打开商店，无效时仍可交谈。
- 可选内容警告涵盖物品和商店；两类资源/schema 缺失或错误不会阻断地图、NPC、对话、成长或战斗。

### Verification (Round 06)

- `npm run build` 通过（88 模块）；临时 Node/Ajv 冒烟 70 项通过（正式数据 schema、坏输入、起始物品、堆叠/容量、消耗、装备与升级、交易原子性、购买/出售非正数量、装备后的战斗属性），脚本已删除。
- 浏览器手动回归：背包显示初始银两/物品/属性；使用恢复品、装备并查看属性变化；相邻商人购买/出售；面板打开锁定移动且关闭后恢复。Phaser 主 bundle 仍高于 Vite 的 500 kB 建议阈值，详见 DEVLOG。

### Added (Round 05)

- 战斗数据契约与资料：martial-arts Schema 新增必填 `combat`（kind: attack/heal、power 1–999、qiCost 0–99），六种既有武学全部补上战斗作用（江湖散手攻击 8/耗 0、吐纳养气诀恢复 12/耗 6、拦门刀法攻击 14/耗 4、听雨剑法攻击 22/耗 10、铁嶂桩功攻击 18/耗 8、云隐身法攻击 10/耗 3）；character-profiles Schema 新增必填 `startingMartialArtIds`（唯一 id 数组，可为空），初始模板声明「江湖散手 + 吐纳养气诀」两式起始武学；新增 draft-07 `battle-encounters` Schema 与首份原创遭遇资料 `data/base/battles/round-05-encounters.json`（`encounter.round-05-set` 登记进 manifest）：「巷口拦路刀客」驻守 (1, 7) 可走格，敌人「疤脸刀客」五项属性/生命 60/内力 16/两式武学、胜利经验 40、失败恢复比例 0.6/0.6、repeatable false 与接近/开战/胜利/失败/撤退五条原创提示文本全部来自 JSON。
- Phaser 无关战斗引擎 `src/engine/turn-based-combat.ts`：遭遇集合防御性解析与逐条跨资源装配（地图引用、触发格图内可走、不压出生点/NPC/其他遭遇格、角色模板与敌人武学引用有效、id 首声明优先，单条失败只禁用该遭遇）；战斗会话交替玩家/敌方回合（一次 `playerUse` 完成一整轮）、固定协议公式（攻击伤害 `max(1, power + force − floor(body/3))`、治疗 `power + floor(resolve/2)` 封顶生命上限）、确定性敌方 AI（可用攻击中威力最高、平手按武学 id 升序，无可用攻击则蓄势跳过）、行动可用性校验（未知/内力不足的行动不消耗回合与资源）、胜利经验经 Round 04 `grantExperience` 恰好结算一次、失败按数据比例恢复生命/内力（保底 1 点生命）、撤退零奖励立即结束，全部事件追加为可读战报条目；四方向邻接的遭遇目标选择（等距按遭遇 id 决胜）。
- 角色成长引擎扩展：`CharacterProfileData.startingMartialArtIds` 防御性解析、`CharacterState.martialArtIds` 运行时副本（`createCharacterState` 复制模板声明列表）、`resolveStartingMartialArts` 逐条校验起始武学引用（存在、未禁用、满足模板起始等级/属性且无门派要求，坏引用/重复声明只剔除该武学并给出可读警告）。
- 键盘战斗面板 `src/game/combat-ui.ts`：双方名称与生命/内力资源条及数值、玩家行动列表（武学名、作用类型、power、内力消耗来自数据；内力不足项置灰且确认时给出本地提示）、高度预算内的最新战报滚动、撤退行；↑/↓（W/S）选择、Enter 确认或战后关闭、Esc 撤退或关闭。
- 地图接线：遭遇敌人以菱形标记渲染于数据声明格并阻挡通行，四方向相邻时底部显示数据 approach 文本，按 E 优先 NPC 交谈、其次开战；战斗面板打开期间探索移动与 E 键锁定、关闭后恢复；胜利后一次性遭遇的标记与阻挡本次运行内移除（刷新重置，存档留待 Round 09），战斗结束在控制台汇总结果与经验/升级数；遭遇资源及其 schema 纳入可选内容分类，缺失/结构坏/引用断只降级为警告，地图与 Round 03/04 玩法不受影响。

### Changed (Round 05)

- `martial-arts-set` 与 `character-profiles` Schema 的既有字段语义不变，新增字段为必填（两份基础资料同步更新；MOD 覆盖同样必须满足新契约）。
- 吐纳养气诀修习门槛由等级 2/定力 8 调整为等级 1/无属性要求，与「流传极广的入门吐纳法」的设定一致，并使初始模板可携带攻击 + 恢复两类起始武学。
- HUD 可选内容警告行文案扩展为覆盖 NPC/对话/角色模板/门派/武学/战斗遭遇六类资料。

### Verification (Round 05)

- `npm run build` 通过（85 模块）；引擎纯逻辑与 schema 共 37 项临时 Node 冒烟检查通过（覆盖 schema 通过/拒绝、战斗公式数学、回合交替与敌方 AI 决胜、内力耗尽跳过、无效/买不起行动不偷回合、击败/失败恢复/撤退结算、经验恰好一次与跨级、坏遭遇逐条隔离、起始武学剔除），临时脚本已删除。生产构建浏览器回归：7 资源零警告加载、接近提示与遭遇格阻挡、E 开战、五回合攻击取胜（战斗内 11 血、胜利升级 +18 至 29/101、经验 +40 升 1 级）、面板关闭后移动恢复、一次性遭遇完成后标记消失且不再触发。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 04)

- 角色成长数据契约与资料：draft-07 `character-profiles` / `faction-set` / `martial-arts-set` 三份 Schema，配套 1 份初始角色模板（属性起点/显示名称、等级与经验起点、最高等级与属性上限、基础+逐级经验曲线、每级属性增量、生命与内力的 base/perLevel/属性权重公式全部来自 JSON）、3 个原创门派（听雨剑阁、铁嶂派、云隐山庄：立场、宗旨与武学风格说明）与 6 种原创武学（江湖散手、吐纳养气诀、拦门刀法、听雨剑法、铁嶂桩功、云隐身法：类别、简介、适用门派、等级/属性门槛与熟练度参数），以 `character-profile.round-04-set` / `faction.round-04-set` / `martial-art.round-04-set` 登记进 manifest。
- Phaser 无关的角色成长引擎 `src/engine/character-progression.ts`：五项核心属性协议（body/force/agility/insight/resolve 与 1–999 值域）、三类集合防御性解析（附 schema 无法表达的单文件语义：maxLevel 高于 startingLevel、属性起点不超上限、初始熟练度不超上限）、首声明优先的 id 索引与武学门派引用逐条校验（悬空引用只禁用该武学）、运行时角色状态创建、数据驱动累计经验阈值（升第 k 级成本 = base + perLevel×(k−1)）、一次性跨级结算、逐级属性成长与 attributeCap 封顶、满级经验钳制与溢出丢弃、按资料公式计算生命/内力上限（升级增量 heals 进当前值），以及按等级/属性/门派（空数组表示不限门派）的武学习得资格判定并逐条给出机械性原因。
- 网格场景把三类新资源纳入可选内容分类：schema/解析/跨引用失败降级为警告行与控制台诊断，地图与 Round 03 玩法不受影响；有效资料加载零启动警告，并在控制台汇总已加载的模板/门派/武学数量。

### Changed (Round 04)

- HUD 可选内容警告行文案扩展为覆盖 NPC/对话/角色模板/门派/武学五类资料；控制台可选内容警告前缀统一为 `[optional]`。
- manifest 在原三种资源之外新增三条资源登记；`enabledMods` 保持为空。

### Verification (Round 04)

- `npm run build` 通过（83 模块）；引擎纯逻辑与 schema 共 83 项临时 Node 冒烟检查通过（覆盖解析/索引/重复 id/悬空引用隔离/敌意输入/经验阈值数学/跨级/属性上限/满级钳制/资格判定合格与不合格/Ajv 真实数据与无效样本），临时脚本已删除。生产构建浏览器回归：有效资料零警告；临时注入结构坏门派集与悬空门派引用后，仅出现可读警告与点名禁用，地图保持可玩，恢复后 SHA256 与源一致。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 03)

- 首批原创 NPC 与对话 JSON 资料：3 名人物（沈墨涵、陆贞娘、顾夜尘，姓名、所在地图、网格坐标与对话引用全部来自数据）与 3 段含分支选项的对话图，登记为 `npc.round-03-set` / `dialogue.round-03-set` 并配套 draft-07 `npc-set`、`dialogue-set` Schema。
- 引擎通用 NPC 放置模块：防御性解析、跨资源校验（地图/对话引用存在、坐标在图内且可走、不占同一格、不压出生点、id 唯一）、占用格索引与四方向邻接目标选择（多目标时取最近，等距按 NPC id 决胜）。
- 引擎对话图模块：解析、逐段图校验（起始节点存在、选项 nextNodeId 有效、节点 id 唯一）、首声明优先的对话索引与纯逻辑会话状态机。
- 键盘对话面板：↑/↓（或 W/S）浏览选项、Enter 确认或于结束节点收尾、Esc 关闭；打开期间场景移动输入被隔离，关闭后恢复。
- E 键邻接交谈：仅与四方向相邻 NPC 可交互并显示提示（含 NPC 名称），远离时提示消失且无法打开对话；NPC 所在格不可进入。
- 可选内容故障隔离：坏引用、坏坐标、重复 id/占位、断裂对话节点等错误只禁用受影响的人物/对话并给出可读警告（HUD 汇总 + 控制台详情），地图保持可玩；manifest/必需地图及其 schema 错误仍致命降级。
- NPC/对话资源未登记或有效集合为空时，地图正常显示并给出明确"暂无可交互人物"提示。

### Changed (Round 03)

- 网格场景装配策略调整：加载诊断按"必需（地图/清单/schema）"与"可选（NPC/对话）"分级，前者维持 Round 02 的致命错误面板，后者降级为警告行。
- HUD 提示行更新为移动 + 邻接交谈操作说明，底部新增交互状态行；HUD 预留高度调整为两行警告。

### Verification (Round 03)

- `npm run build` 通过（82 模块）；引擎纯逻辑 48 项临时 Node 冒烟检查与 7 项 Ajv schema 检查通过，临时脚本已删除。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 02)

- manifest 驱动的通用资料加载器，加载时用 Ajv 校验 manifest、schema、基础资源和 MOD 覆盖，并返回来源溯源与结构化诊断。
- Draft-07 `manifest` 与 `grid-map` JSON Schema、按声明顺序应用的同路径 MOD 覆盖，以及同步泛型 EventBus。
- Vite MOD 分发插件：开发期安全读取仓库 `mods/` 中的 JSON，生产构建复制同样的文件；附带未启用示例 `mods/example/`。
- 由 `data/base/maps/round-01-grid.json` 驱动的 16×9 网格地图；地图数据通过 Vite 静态目录在开发与生产中发布。
- 通用地图结构解析、边界/固体瓦片查询和 Phaser 网格渲染器。
- 方向键与 WASD 单格移动、动画期间输入锁定、墙体与边界碰撞，以及玩家坐标 HUD。
- 地图请求、JSON 解析和结构错误的可读游戏内反馈；画布可聚焦并标注无障碍名称。

### Changed (Round 02)

- 网格场景改由 manifest 资源 id 获取地图。无效 MOD 覆盖会跳过并保留上一有效资源，HUD 与控制台提供 warning。
- Round 00 建立的 ADR-0004 更新为已实施状态，并新增 ADR-0006 记录 typed EventBus 选择。

### Verification (Round 02)

- `npm run build` 与 Round 01–02 浏览器/事件总线手动验证通过；Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

## [0.0.1] — 2026-09-26（Round 00）

### Added

- 工程脚手架：`package.json`（dev/build/preview/typecheck 脚本；`engines.node >= 22.12.0`）、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`。
- 引擎引导占位：`src/main.ts`（Phaser 4 静态占位画面，无玩法、无设定文本）、`src/style.css`。
- 目录骨架：`src/engine/`、`src/game/`、`data/base/` 十大数据族（worldview / characters / maps / quests / dialogues / knowledge_graph / items / skills / factions / endings）、`data/schema/`、`mods/`（均以 `.gitkeep` 占位）。
- 设计与规范文档：`docs/GDD.md`、`docs/ADR.md`（ADR-0001~0005 与版本冻结总表）、`docs/REFERENCES.md`、`docs/ORIGINAL-FIDELITY.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`。
- 治理文件：`README.md`、`ROADMAP.md`（R00–R50 共 51 轮）、`CHANGELOG.md`、`DEVLOG.md`。
- 保留 `iterations/round-00/plan.md` 原样（本轮计划，未改动）。
- 安装锁文件：`package-lock.json`，锁定当前可复现的 npm 依赖树。
- Round 01–12 路线按目标文件要求重排，保留后续创新系统、内容数量目标与质量轮次。
- `docs/REFERENCES.md` 补充各类来源的授权状态、软件包许可和本项目使用方式。

### 验证

- `npm install`：成功，安装 18 个包。
- `npm run build`：TypeScript 检查与 Vite 生产构建成功；Phaser 主包 chunk 约 1.38 MB，出现超过 500 kB 的非阻断提示。
- 本轮没有测试文件，因此未运行测试套件。
