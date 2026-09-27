# 数据规范指南（DATA-GUIDE）

- 状态：Round 03–22 已落地地图、NPC/对话、成长/战斗、物品/任务、伙伴、擂台、门派战、自创武学、存档、区域旅行、知识图谱、昼夜气候、日程、条件奇遇与多层社会声望；详情分别见 `docs/SAVES.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/COMPANIONS.md`、`docs/FACTION_WAR_DESIGN.md` 与 `docs/MARTIAL_ART_FORGE.md`。
- 关联：`docs/ARCHITECTURE.md`（引擎/数据分离与降级策略）、`docs/ADR.md` ADR-0004

---

## 1. 数据即世界

本项目的世界内容（设定、人物、地图、任务、对话、关系、物品、武学、门派、结局）**全部以 JSON 表达**，存放于 `data/base/`，由 manifest 驱动的通用加载器在启动期读取。代码中不含设定文本；资料作者可以只改 JSON 就改变世界。

## 2. 目录结构

```
data/
├── base/                    # 基础世界资料
│   ├── manifest.json        # 当前数据清单、schema 引用及启用 MOD 顺序
│   ├── world/                # 世界图、区域关系与全局事件
│   ├── worldview/           # 世界观：时代背景、历法、通则设定
│   ├── characters/          # 角色：NPC 与主角模板、属性、好恶
│   ├── companions/          # 同行伙伴及其战斗支援专长
│   ├── faction_wars/        # 门派战入口、阶段对手、贡献和声望/见闻后果
│   ├── maps/                # 地图：区域、房间/场景、连接与出生点
│   ├── quests/              # 任务：目标、步骤、条件、奖励
│   ├── dialogues/           # 对话：节点、选项、条件分支、效果
│   ├── knowledge_graph/     # 知识图谱：NPC 认知/态度/关系边（社交记忆）
│   ├── items/               # 物品：装备、消耗品、任务物
│   ├── skills/              # 武学：招式、元素、修炼需求、战斗作用
│   ├── factions/            # 门派：立场、声望规则、成员关系
│   ├── battles/             # 战斗：遭遇触发点、敌人、奖励与提示文本
│   └── endings/             # 结局：触发条件与结局文本
├── schema/                  # JSON Schema（含 manifest、grid-map、world-map、game-calendar、knowledge-nodes、knowledge-edges、npc-set、companion-set、faction-war-set、martial-art-components、dialogue-set、character-profiles、faction-set、martial-arts-set、battle-encounters、arena-set、items-set、shops-set、quest-set）
mods/                        # mod 覆盖层：mods/<modId>/ 镜像 data/base/ 相对路径
```

Round 07 状态：manifest 另登记可选资源 `quest.round-07-set` → `quests/round-07-quests.json`（`quest-set`）。基础资料提供两项原创差事，NPC 可声明可选 `questGiver`（缺省为 false）；Q 打开任务日志，邻接任务发布人按 E 打开只列出其任务的名录。Round 09 起玩家任务、背包、战斗遭遇等运行状态由版本化存档持久化，不写回世界 JSON。此前角色模板、NPC 商店字段与物品数据仍按 Round 06 契约使用。Vite 把整个 `data/` 目录作为静态资源目录，开发期可从站点根路径读取，生产构建时复制到 `dist/`。`mods/example/` 提供未启用的同路径覆盖示例。启用 MOD 只需把其单段 id 按优先顺序加入 manifest 的 `enabledMods` 数组。

Round 08 状态：dialogue-set 选项新增可选 `conditions`（数组，全部满足才可见）与 `effects`（数组，确认时先全量验证再统一提交）字段，二者均为封闭枚举协议（见 §4 对话条件与效果），旧的无条件对话完全兼容。示例对话扩展覆盖任务接取/放弃/交付、物品赠予/交付、善恶、声望与 NPC 关系分支。Round 09 起相关运行状态通过存档持久化；任务发布人 NPC 保留 E 名录入口，另可用 F 直接交谈。

Round 10 状态：manifest 可登记多个 `grid-map` 资源；`world.atlas` 是必需的 `world-map` 资料，声明 `startingMapResourceId`、区域图册坐标、地图内关口端点和区域事件。每张地图文件中的 `id` 必须与 manifest 资源 id 一致；世界图解析器检查起始区域存在、区域不重复、端点/事件引用有效且坐标可走。跨资源装配再隔离与 NPC 或遭遇占格重叠的关口/事件。M 打开图册，E 键按 NPC、遭遇、关口的优先顺序处理交互；一次性事件 id 随存档保存。新增资料流程与示例见 `docs/MAP-ATLAS.md`。

Round 17 状态：`world-map` 事件可省略或声明 `conditions`（知识节点、时段、天气三组可选；组间 AND，组内 OR）和 `discoverKnowledgeNodeId`。触发器只在位置匹配且全部条件满足后结算；一次性状态在成功时才记入现有 `completedRegionalEvents`，发现节点进入现有 `knownKnowledgeNodeIds`。等候、移动和跨区抵达都会检查当前格；等候摘要与事件提示合并。事件的图谱、历法、天气坏引用逐条隔离，并报告具体 id。基础奇遇样例在渡口以“雨后脚印”为线索，在降雨的黄昏/夜间发现芦苇河滩。协议细节见 `docs/MAP-ATLAS.md` 与 `docs/KNOWLEDGE-GRAPH.md`。

Round 18 状态：善恶（−100…100）、江湖个人声望（0…1000）、逐派声望（各 0…1000）与逐 NPC 关系（−100…100）由 `social-state.ts` 统一提供有界变化规则。对白支持 `factionRenown` 区间条件和 `adjustFactionRenown` 原子效果；门派资料可声明拜师门槛 `minimumFactionRenown` 与退门代价 `factionRenownDelta`。每派数值在 J 师门页展示；本门声望复用 v1 `social.factionRenown` id/value 列表，旧存档缺失时中立归零，已移除门派的值恢复时逐项忽略。基础导师对白拜师后 +10 本门声望，听雨剑阁对白演示本门声望条件分支。

Round 19 状态：`companion.round-19-set` 登记可选伙伴集合。伙伴由 `companion-set` Schema 校验，`npcId` 在世界装配期对照有效 NPC；单条伙伴引用失效时只禁用该伙伴。对白用 `recruitCompanion` 效果和 `npcRelationship` 条件实现邀请；单队伍槽、跨区安全跟随与攻/疗支援参数见 `docs/COMPANIONS.md`。MOD 可通过同路径覆盖伙伴 JSON，跟随坐标不写入存档。

Round 11 状态：manifest 登记可选 `knowledge-nodes` 与 `knowledge-edges` 资源，分别使用 `knowledge-nodes.schema.json` 与 `knowledge-edges.schema.json`；节点类别为 character/place/faction/item/martialArt/event/quest/ending，关系类型为 mentorOf/parentOf/hostileTo/belongsTo/locatedAt/holds/triggers/requires/rewards/knows/participatesIn/influences。节点含稳定 id、类型、标题、摘要和 `knownByDefault`；边含稳定 id、两端节点 id、关系类型和说明。解析器对坏单条给警告并隔离，装配时重复 id 保留首项，悬空端点关系逐条丢弃。

玩家新局从 `knownByDefault: true` 节点建立知识状态。对话选项可以声明 `{ "kind": "knowledgeKnown", "nodeId": "kg.node-id" }` 条件，全部条件满足才显示；效果 `{ "kind": "discoverKnowledgeNode", "nodeId": "kg.node-id" }` 会解锁词条，重复发现幂等。悬空引用只剔除对应对话选项。K 打开百科，左右/A/D 切换分类、上下/W/S 浏览、Esc 或 K 关闭。未发现条目只汇总为“未解锁见闻”，不会泄漏标题、摘要或相关边；关系只在两端节点都已知时显示。已知 id 随存档保存。具体内容组织和编辑步骤见 `docs/KNOWLEDGE-GRAPH.md`。

Round 14 状态：manifest 登记**必需**资源 `calendar.base` → `worldview/calendar.json`（`game-calendar` schema）。历法声明月份序列（id/名称/天数 1–60，至多 24 个月）、日内时段（id/名称/起始分钟 0–1439/照度 0–1，至多 24 段；必须存在零点时段且起始分钟互异）、起始时刻（年/月 id/日/日内分钟）与动作耗时（`stepMinutes` 0–1440、`travelMinutes`/`waitMinutes` 1–1440）。语义校验拒绝重复月份/时段 id、重复时段起点、悬空起始月份、超出当月天数的起始日与越界耗时——历法无效即整资源拒绝（可读错误面板），不做部分降级。时段按循环边界划分，可跨午夜；运行时 HUD 显示历日/时刻/时段，世界层按时段照度渐变调色。一天固定 1440 分钟；游戏时间只由成功移动（每步 `stepMinutes`）、成功区域旅行（`travelMinutes`）与 V 键等候（`waitMinutes`）推进，被阻挡或被面板拦截的操作零消耗。存档保存相对起始时刻的分钟计数（`elapsedGameMinutes`），日期随时由当前资料折算。对白写作细节见 `docs/DIALOGUE-GUIDE.md`。

## 3. 文件与命名约定

Round 20 新增擂台资料族：manifest 中的可选 arena-set 资源按地图入口、角色模板、赛程武学、彩头物品逐项校验；坏入口只禁用对应擂台。赛事文件可由 MOD 使用同路径覆盖，资料字段和玩法边界见 docs/ARENA_DESIGN.md。

Round 21 新增可选 `faction-war-set` 战事资料族：每个阶段为两支参战派分别声明对手属性/武学，组装校验入口、门派、武学和结局图谱节点。E 邻接报名限在籍参战弟子，贡献、结局声望变化和见闻发现均可由 JSON 调整；同名 MOD 资源可覆盖默认会盟。字段与贡献结算见 `docs/FACTION_WAR_DESIGN.md`。

Round 22 新增可选 `martial-art-forge-components` 资源（`martial-art-components.schema.json`），组件文件放在 `skills/` 并可由 MOD 同路径覆盖。每项组件属于 `intent`（attack/heal 招式）、`form`（架势）或 `breath`（吐纳）之一；Schema 限制字段和值类型，Phaser-free 解析器补充唯一 id、槽位/种类一致和整数范围检查。资源缺失、Schema 不符或语义错误时只禁用创制入口，不影响已有武学、战斗和地图。作品生成后作为玩家运行时状态存档，不写回世界资料；详细预算和存档边界见 `docs/MARTIAL_ART_FORGE.md`。

- 文件名：小写 kebab-case，如 `data/base/maps/qingxi-town.json`（示例名，内容待后续轮次原创编写）。
- 每个数据对象有稳定 `id`，前缀按族区分（建议 `char.` / `map.` / `quest.` / `dlg.` / `kg.` / `item.` / `skill.` / `faction.` / `ending.`）；跨族引用一律用 id，不用文件路径。
- 同行伙伴 id 使用 `companion.` 前缀；伙伴必须引用有效 `npcId`，同一 NPC 可由独立伙伴资料赋予招募和支援规则。
- 每族目录可多文件；加载器合并为该族的"对象集合"。
- 具体字段以 `data/schema/<族>.schema.json` 为准（schema 进入后，本文件仅维护约定，不复制字段定义，避免双份真相）。

## 4. 校验与缺失数据的启动行为

- **地图运行时检查**：Round 01 的场景会检查地图字段、网格尺寸、瓦片键和出生点；缺文件、HTTP 错误、无法解析或结构错误都会显示可读错误面板。它仅服务当前垂直切片，不代替正式 Schema。
- **正式校验**：Round 02 起加载期用 Ajv 8.x（ADR-0004）校验 manifest、每份基础 JSON 和启用的 MOD 覆盖。draft-07 schema 约束静态字段；网格地图 parser 补足单文件跨字段语义。错误进入结构化诊断并经事件总线发布。
- **跨资源校验（Round 03）**：NPC 的地图/对话引用存在性、坐标在图内且可走、不占同一格/出生点、id 唯一，以及对话图的起始节点/选项引用完整，由场景装配层逐条校验；失败只禁用受影响的 NPC/对话（HUD 警告 + 控制台诊断），地图与移动不受影响。
- **跨资源校验（Round 04）**：角色模板/门派/武学集合内的 id 唯一性（重复保留先声明者）与武学 `factionIds` 对有效门派集合的引用，由场景装配层用引擎 `indexProfiles`/`indexFactions`/`indexMartialArts` 逐条校验；悬空门派引用只禁用该武学。单文件语义（maxLevel 高于起始等级、属性起点不超 attributeCap、初始熟练度不超上限）由按 schema 注册的语义校验器在加载期拒绝整资源。经验为累计阈值制：升第 k 级成本 = `baseExperience + experiencePerLevel×(k−1)`，升级不消耗经验、满级丢弃溢出；生命/内力上限 = `base + perLevel×(level−1) + Σ(权重×属性)`。
- **跨资源校验（Round 05）**：战斗遭遇的地图/角色模板/敌人武学引用、触发格在图内且可走、不压玩家出生点/NPC/其他遭遇格与 id 唯一，由场景装配层用引擎 `assembleBattleEncounters` 逐条校验，坏遭遇只禁用自身；角色模板 `startingMartialArtIds` 的存在性/起始资格/重复声明由 `resolveStartingMartialArts` 逐条校验，坏引用只剔除该武学。战斗公式为固定协议：攻击伤害 = `max(1, power + 攻击者 force − floor(防守者 body / 3))`，治疗量 = `power + floor(施放者 resolve / 2)`（封顶生命上限）；内力不足的行动不可用且不消耗回合；敌方回合在可用攻击中选威力最高者（平手按武学 id 升序）；失败按遭遇 `defeatRecovery` 比例恢复（生命保底 1 点，内力不低于现值）；胜利经验恰好发放一次，`repeatable: false` 的遭遇胜利后本次运行不再触发（刷新重置）。
- **物品与商店（Round 06 / 存档 Round 09）**：`items-set` 定义 consumable/equipment/misc、堆叠上限、买卖基价与恢复/装备效果；`shops-set` 定义 NPC、文案、卖出比率和有限库存（`-1` 表示无限）。角色模板的 `startingCurrency` / `inventoryCapacity` / `startingItems` 确定开局背包，坏起始引用逐条剔除；商店对 NPC 与物品 id 做跨资源校验，悬空物品/重复库存行只剔除该货架条，失效 NPC 禁用商店，坏 NPC `shopId` 回退原对话。背包容量按不同物品堆数计，买卖/使用/装备均先校验再提交；消耗品恢复量受当前上限钳制；装备属性加到有效属性与派生资源上限并实时作用于战斗；出售价 = `floor(sellPrice × sellRate)`，装备中的唯一实例与 `sellPrice: 0` 物品不可售。Round 09 快照持久化库存、装备、银两和商店剩余库存；数据版本变动时会丢弃失效物品/货架项并限制超出新上限的数量。
- **任务（Round 07 / 存档 Round 09）**：`quest-set` 声明 `quests`，每项含稳定 id、名称/说明、`giverNpcId`、可选 `prerequisiteQuestIds`、非空 `objectives`、可选 `failOnEncounterIds` 与 experience/currency 奖励；目标 kind 为 `collectItem` 或 `defeatEncounter`。解析后逐项检查发布人须为已放置且声明 `questGiver` 的 NPC、目标物品/遭遇及前置 id 必须有效、前置依赖不可循环；坏任务与依赖它的任务禁用，其他内容继续运行。无前置任务初始为 offered，有前置任务为 locked，前置全部完成后解锁；接取时收集目标快照当前背包数量，此后按物品数量变化同步，击败目标响应战斗胜利事件；配置的失败遭遇只在玩家败北时使任务失败，玩家可主动放弃活动任务。每个活动任务完成时一次性发放其 JSON 经验/银两奖励并刷新可解锁前置任务。任务面板列出状态、进度和奖励，日志可跟踪一项活动任务。Round 09 快照保存任务阶段、目标进度与跟踪项；恢复时会钳制已删除目标或当前上限外的进度。
- **对话条件与效果（Round 08）**：dialogue-set 选项可声明 `conditions` 与 `effects`（均为对象数组，字段白名单封闭、未知 kind/字段/值域在 Ajv 校验与引擎防御解析两级被拒；空数组无意义被拒，省略表示无条件/纯跳转，旧数据完全兼容）。**条件**（全部满足该选项才可见）：`questStatus`（`questId` + `status`∈locked/offered/active/completed/failed）、`itemCount`（`itemId` + `minCount` 1–999）、`morality`/`renown`/`npcRelationship`（`minValue`/`maxValue` 至少其一，闭区间，取值范围分别为 ±100 / 0–1000 / ±100；`npcRelationship` 须带 `npcId`）。同时提供上下界时还须满足 `minValue <= maxValue`；draft-07 无法声明字段间大小关系，该语义由防御解析器校验，错误只禁用所在对话并保留同集合的其他有效对话。静态 Schema 不通过仍会拒绝整份资源。**效果**（确认选项时原子执行，任一不可行则全部不执行且不转移节点）：`acceptQuest`/`abandonQuest`（要求目标任务分别为 offered/active）、`giveItem`/`takeItem`（`quantity` 1–99；给予校验背包容量，扣除校验拥有数量且装备中的唯一实例锁一件）、`adjustMorality`（delta ±100 非零）/`adjustRenown`（delta ±1000 非零）/`adjustRelationship`（delta ±100 非零；省略 `npcId` 作用于当前对话对象）；善恶/声望/关系结果按范围边界钳制。条件或效果引用的 questId/itemId/npcId 悬空时只剔除该选项（节点可能因此成为结束节点），对话其余选项照常可用。对话扣除或给予物品后按背包新数量同步活动任务收集目标（进度可能回退，属预期行为）。
- **多地图与世界区域（Round 10）**：已登记地图资源按 `grid-map` schema 收集，并要求地图内 `id` 与 manifest 资源 id 一致。必需 `world-map` 定义起始地图、图册节点、跨图关口与区域事件；舆图位置为 0–100 相对坐标，关口端点/事件格须引用有效地图并落在可走格。往返旅行需分别声明去程和回程端点。与 NPC/遭遇占格冲突的端点或事件会被逐条隔离并给出警告。事件 `once: true` 时只在首次踩入时结算并将 id 记入存档；`false` 允许每次进入重复提示。M 打开舆图且锁定探索输入；E 按 NPC → 遭遇 → 关口的顺序仲裁。详细字段及资料流程见 `docs/MAP-ATLAS.md`。
- **资料驱动的区域奇遇（Round 17）**：`world-map.events[].conditions` 可用 `knowledgeNodeIds`（全部已知）、`periodIds`（任一当前时段）、`weatherIds`（任一天气）组合门槛；所有已声明条件组都必须满足。`discoverKnowledgeNodeId` 在事件成功触发时发现一个百科节点。静态 Schema 校验形状，装配阶段跨图谱/历法/气候逐事件检查引用，坏事件独立隔离。等候时重新检查当前格，未满足的事件不会被消耗。
- **值与变化量分开看**：声望条件读取的当前声望范围为 0…1000；`adjustRenown.delta` 是有符号变化量，范围为 -1000…1000（排除 0）。负变化合法，执行后的声望仍钳制在 0…1000。Ajv Schema 与引擎防御解析必须接受同一合法变化范围。
- **未登记的数据族**：地图是当前场景的关键资源，缺失时加载器会生成错误诊断并显示修复说明。NPC/对话、角色成长/武学/战斗、物品/商店、任务、伙伴、擂台、门派战和知识图谱均为可选资源：未登记或有效集合为空时地图正常显示；玩家运行状态只要求有有效角色模板，不要求遭遇、任务、伙伴或门派战数据。其余空目录尚未进入运行时资料集。
- **关键单点缺失**（如出生点地图缺失）：启动失败，输出单一明确错误（缺什么、去哪补）。

## 5. mod 覆盖规则（同名文件优先）

1. `mods/<modId>/` 下与 `data/base/` **相对路径相同**的文件覆盖基础文件（整文件替换，不做字段级合并）。
   - 例：`mods/rebalance/skills/基础拳法.json`（示意）覆盖 `data/base/skills/基础拳法.json`。
2. 优先级：`mods/` > `data/base/`；多个 mod 按 mod 清单声明顺序应用，后声明的覆盖先声明的。
3. mod 文件同样必须通过 schema 校验——mod 不能绕过数据契约。
4. 每次覆盖可追溯（日志/调试信息记录"文件 X 被 mod Y 覆盖"）。
5. Round 02 状态：加载器按 `enabledMods` 的声明顺序读取 `mods/<modId>/<data/base/ 相对路径>`；后声明项覆盖先声明项。每个覆盖经过同一 schema 和可选语义校验；缺失文件静默跳过，坏覆盖发 warning 并保留上一有效版本。Round 35 再完善 MOD 管理与作者工作流。

## 6. 热重载（后续功能）

- 开发模式目标：改动 `data/` JSON → 受影响数据族重载 → 画面反映新数据，无需重启。
- 生产构建不含热重载。
- 实现规划于 ROADMAP Round 36；Round 02 不实现、不引入依赖。

## 7. 资料作者须知（速查）

- 改世界 → 只动 `data/base/`；想替换官方内容 → 写到 `mods/`，不要直接改基础数据。
- 新增数据先在 `data/base/manifest.json` 登记资源 id、相对路径及 schema id，并在 `data/schema/` 提供 draft-07 schema；`npm run dev` 会在启动时校验并把错误逐条写到控制台/场景。
- 新增 NPC：在 npc-set JSON 里加条目（稳定 id 建议 `char.` 前缀、姓名、`mapResourceId` 用已登记地图资源 id、`position` 填可走格、`dialogueId` 指向已登记对话）；可选 `schedule` 按已登记日历的 `periodId` 声明地图内 `position`，具体校验和冲突回退见 [`NPC-SCHEDULES.md`](NPC-SCHEDULES.md)。基础 NPC 坐标/引用无效会禁用该 NPC；单独坏掉的日程项只回退该人物该时段的基础位置。
- 新增对话：在 dialogue-set JSON 里加一段（id 建议 `dlg.` 前缀、`startNodeId` 指向存在节点、选项 `nextNodeId` 必须可达；无 `options` 的节点即结束节点）。断裂引用只禁用该段对话及引用它的 NPC。选项可声明 `conditions`（全满足才可见：任务状态、物品数量、善恶/声望/NPC 关系闭区间）与 `effects`（确认时原子执行：接取/放弃任务、给予/交付物品、修善良恶/声望/关系；见 §4 对话条件与效果）；坏跨资源引用只剔除该选项，draft-07 Schema 可表达的结构/协议错误仍按资源级拒绝，解析器额外发现的单段语义错误（如反向上下界）只禁用该段并警告。示例：马尚义对话按任务 offered/active/completed 显示不同分支，顾夜尘带话后关系达标解锁新选项。
- 新增角色模板：在 character-profiles JSON 里加条目（id 建议 `char.` 前缀；五项属性 `body/force/agility/insight/resolve` 键与 1–999 值域是协议，显示名称写在 `attributeLabels`；`maxLevel` 必须大于 `startingLevel`，属性起点不得超过 `attributeCap`，否则整个资源在加载期被拒；`startingMartialArtIds` 列出起始武学——引用必须存在、未禁用并满足模板起始等级/属性（起始视为无门派），坏引用只剔除该武学并警告）。
- 新增门派：在 faction-set JSON 里加条目（id 建议 `faction.` 前缀，名称/立场/宗旨/武学风格全为原创文本）。id 重复只保留先声明者并警告。
- 新增武学：在 martial-arts-set JSON 里加条目（id 建议 `skill.` 前缀；类别取六枚举之一：拳脚/剑法/刀法/身法/内功/外功；`factionIds` 空数组表示不限门派，非空时每个 id 必须指向已加载的有效门派——悬空引用只禁用该武学；`requirements.level` 与 `requirements.attributes` 填最低门槛；`initialProficiency` 不得超过 `proficiencyCap`；`combat` 必填——kind 取 attack/heal，power 为作用基数，qiCost 为每次使用的内力消耗，内力不足时该行动不可用）。
- 新增战斗遭遇：在 battle-encounters JSON 里加条目（id 建议 `encounter.` 前缀；`mapResourceId` 用已登记地图资源 id，`position` 填可走格且不压出生点/NPC/其他遭遇格——玩家四方向相邻时按 E 开战，敌人占格阻挡通行；`profileId` 指向有效角色模板（玩家状态以首个有效遭遇的模板创建）；`enemy` 直接给五项属性与生命/内力数值（不走派生公式）及武学 id 列表（须为有效武学）；`victoryExperience` 胜利发放一次，`defeatRecovery` 两项 0–1 比例控制失败恢复，`repeatable` 声明胜利后可否再战；`texts` 五条提示文本全部原创）。坏引用/坏坐标只禁用该遭遇并点名警告。
- 新增物品：在 items-set JSON 中新增条目（id 建议 `item.` 前缀，`category` 选 consumable/equipment/misc；填写原创名称/说明、`stackLimit`、`buyPrice`/`sellPrice`；消耗品声明 `healthRestore`/`qiRestore` 至少一项为正，装备声明槽位、属性加成和生命/内力上限加成；`sellPrice: 0` 表示不可售）。
- 新增商店：在 shops-set JSON 中声明稳定 shop id、`npcId`（指向可放置 NPC）、原创 `name`/`greeting`、`sellRate` 及 `stock`（`itemId` 必须存在，quantity 为 -1 无限或非负余量）；在 NPC 条目加 `shopId` 后，玩家四方向相邻按 E 开店，否则仍走其对话。货币与背包起点在角色模板的 `startingCurrency`、`inventoryCapacity` 和 `startingItems` 中配置。
- 新增任务：在 quest-set JSON 的 `quests` 数组新增任务（`id` 建议 `quest.` 前缀；`giverNpcId` 必须指向有效 NPC，并在 NPC 条目声明 `questGiver: true`；`prerequisiteQuestIds` 只能引用无环任务；目标 `kind` 选 `collectItem`/`defeatEncounter`，`targetId` 分别引用有效物品/遭遇，`requiredCount` 为正整数；`failOnEncounterIds` 声明败北失败的遭遇；`rewards` 声明非负 experience/currency）。收集目标接取时以当前背包数量为起点，物品变化后同步目标数量；击败目标在战斗胜利后推进；任务奖励恰发一次。E 打开发布人名录，Q 打开日志，A 放弃活动任务；Round 09 起任务阶段和进度随本地存档持久化。
- 修改历法：直接编辑 `data/base/worldview/calendar.json`（或用 MOD 同路径覆盖）。调整月份天数/时段表/耗时都会即时反映到新开局与读档折算（存档只存分钟数）；删除对话正在引用的时段 id 只会剔除相应选项并警告。时段 id 建议 `period.` 前缀、月份 id 建议 `month.` 前缀；照度 0–1 控制夜幕深度（场景按 `1 − 照度` 叠加至多约 0.55 透明度的冷色层，UI 始终保持清晰）。
- 修改季节/天气：编辑 `data/base/worldview/climate.json`（或用 MOD 同路径覆盖），必须保留至少一种天气并确保各季节恰好覆盖历法的每个月份。季节 `monthIds` 引用 `calendar.json` 的稳定月份 id；`weatherWeights` 引用同文件的天气 id，权重为相对非负整数且每季总和需大于 0；天气声明 `#RRGGBB` 色调、0–0.45 透明度、0–1440 步耗时，以及可选的雨/雪粒子类型和 0–1 密度。相同世界种子/历日会稳定抽得相同天气。雨雪步耗时只叠加到成功单格行走；改动示例和扩展边界见 `docs/CLIMATE.md`。
- 所有内容必须原创（红线见 `docs/ORIGINAL-FIDELITY.md`）；命名避开任何原作专有名称。

## Round 13：门派与师承资料

在 faction-set 的 faction 条目声明 `mentorNpcIds`、`admission` 与 `departure`；导师必须引用可放置 NPC。`admission` 可设 `minimumLevel`、五项 `minimumAttributes`、善恶上下限、江湖声望/师徒关系下限、Round 18 新增的本门声望下限 `minimumFactionRenown` 及 `requiredQuestIds`；缺失任务引用会令该门派不可入门并产生警告。`departure.allowed` 控制能否离门，`moralityDelta`/`renownDelta`/`factionRenownDelta` 分别设置善恶、江湖个人声望、本门声望代价，最后一项只改变该 faction id 的数值，省略时默认为 0；`forgetFactionMartialArts` 决定退门时是否遗忘 `factionIds` 包含该派的武学。NPC 对话通过 `factionMembership` / `factionRenown` / `martialArtEligible` 条件及 `joinFaction` / `leaveFaction` / `learnMartialArt` / `adjustFactionRenown` 效果提供流程；J 打开师门档案。旧 faction 资料未写声望门槛时不设该门槛，未写本门退门声望代价时默认为 0；此前已有的入门、退门和武学去留缺省规则保持不变。

## Round 18：社会声望与门派态度

社会状态是四个互相独立的作用域：善恶 `−100…100`、江湖个人声望 `0…1000`、每个门派的本门声望 `0…1000`、逐 NPC 关系 `−100…100`。引擎统一按“当前值 + signed delta”计算并钳制在对应范围；没有记录的门派声望按 0 读取。对白选项可用 `{ "kind": "factionRenown", "factionId": "…", "minValue": 0, "maxValue": 1000 }` 门控，或用 `{ "kind": "adjustFactionRenown", "factionId": "…", "delta": 10 }` 调整。新增字段受 `dialogue-set` 和 `faction-set` Schema 约束，并在跨资料装配时校验门派 id。拜师门槛 `minimumFactionRenown` 可省略；退门变化 `factionRenownDelta` 可为负、零或正数，旧资料缺省为 0。逐派声望存于 v1 `social.factionRenown` id/value 列表，旧 v1 档缺字段时从中立值开始，读档遇到已移除的门派仅丢弃那一条并给出 warning。对白效果延续先验证、再一次提交的事务约定。详见 `docs/DIALOGUE-GUIDE.md` 与 `docs/SAVES.md`。

## Round 14：历法资料

`data/base/worldview/calendar.json` 是**必需**资源（manifest 登记 `calendar.base`，schema `game-calendar`），包含五块：

```json
{
  "id": "calendar.base",
  "start": { "year": 1, "monthId": "month.qingyang", "day": 1, "minuteOfDay": 480 },
  "months": [{ "id": "month.qingyang", "name": "青阳", "days": 30 }],
  "periods": [
    { "id": "period.midnight", "name": "子夜", "startMinute": 0, "lightLevel": 0.18 },
    { "id": "period.night", "name": "入夜", "startMinute": 1140, "lightLevel": 0.22 }
  ],
  "actionCosts": { "stepMinutes": 1, "travelMinutes": 45, "waitMinutes": 60 }
}
```

- `months`：一年的月份序列，按声明顺序循环；天数 1–60，至多 24 个月。
- `periods`：日内时段划分，一天固定 1440 分钟；必须有一个 `startMinute: 0` 的零点时段，且各时段起始分钟互异（否则语义校验拒绝整个资源）。时段可跨午夜——从其起点持续到下一时段起点（或经午夜回到零点时段）。
- `start`：新开局的历日时刻；`day` 不得超过所引月份天数。
- `actionCosts`：成功移动一格 / 通过关口旅行一次 / V 键等候一次分别消耗的分钟数（step 允许 0 表示移动不耗时；travel/wait 至少 1）。
- 基础资料为原创"青阳—岁除"十二月历（各 30 天）与子夜/拂晓/晨光/日中/午后/黄昏/入夜七时段；照度决定场景夜幕深度。
- 存档只保存 `elapsedGameMinutes` 分钟计数；读档用**当前**历法折算年月日与时段，因此改月份长度不会产生矛盾日期。

## Round 15：季节与天气资料

`data/base/worldview/climate.json` 是**必需**资源（manifest 登记 `climate.base`，schema `climate`），配置 `seasons` 和 `weathers`。季节按 `monthIds` 绑定现有历法月份，并声明非空的 `weatherWeights`；加载期对照已解析的 `calendar.base` 检查月份恰好分属一个季节、没有未知月份，且权重天气引用都存在、每季权重合计大于零。上述语义错误会拒绝整份 climate 资源并给出可读错误，不会让引擎使用内置气候回退。

每种天气配置名称、`tintColor`、`tintAlpha`、`stepMinutes` 和可选 `precipitation`（`kind: rain|snow`, `density: 0–1`）。天气每个游戏日抽取一次，其输入是存档中的 u32 `worldSeed`、日期索引和当前季节权重表；同种子/同一日稳定，跨日按新日期推导。场景会在世界层绘制天气色调和程序降水粒子。成功网格步耗时 = 历法 `actionCosts.stepMinutes` + 当前天气 `stepMinutes`；阻挡移动不推进时间，区域旅行和 V 等候仍只使用历法各自成本。

Round 14 之前的 v1 存档缺 `worldSeed` 时固定归一为 `1`，后续再保存会带上该值。完整字段范围、MOD 编辑说明和边界见 `docs/CLIMATE.md`。

## Round 16：NPC 时段日程

NPC 集合的每个条目可省略 `schedule`，也可提供日程项数组：

```json
{
  "id": "char.example",
  "mapResourceId": "map.round-01-grid",
  "position": { "col": 4, "row": 1 },
  "schedule": [
    { "periodId": "period.midday", "position": { "col": 3, "row": 1 } }
  ]
}
```

`periodId` 必须引用 `calendar.json` 中的时段；单个人物不得重复声明同一时段。日程位置按 `mapResourceId` 所属网格图校验通行、出生点、固定遭遇和同一时段 NPC 占位。无效引用、坐标、重复项或冲突只隔离相应日程项并警告，人物在该时段留于基础 `position`。没有显式配置的时段也使用基础位置。场景时段切换时更新标记、姓名牌、占格和交互；玩家当前格优先，遇到运行时抢格时移动 NPC 尝试基础位置，仍不安全则暂不显示。跨区抵达按旅行耗时后的时段选择目的地图日程。

NPC 当前坐标是由地图、时钟和人物日程派生的临时运行状态，不写入 v1 存档。读档恢复后使用 `elapsedGameMinutes` 重建历法时段，再按快照地图/玩家格/有效遭遇解析占位；因此 R15 及更早 v1 存档无需新增字段或迁移。

## 变更记录

| 日期 | 轮次 | 变更 |
|---|---|---|
| 2026-09-26 | Round 00 | 建立目录规范、命名约定、降级与覆盖规则基线 |
| 2026-09-27 | Round 02 | 记录 manifest、Ajv 校验、加载诊断和同路径 MOD 覆盖使用方式 |
| 2026-09-27 | Round 03 | 登记 NPC/对话资源与 schema，记录跨资源校验、逐条禁用规则与可选内容空集行为 |
| 2026-09-27 | Round 04 | 登记角色模板/门派/武学资源与 schema，记录成长协议语义（累计经验、派生公式、属性上限）与逐条隔离规则 |
| 2026-09-27 | Round 05 | 登记 battles 数据族与遭遇资源/schema，记录武学 combat、起始武学契约、战斗公式、失败恢复与遭遇逐条隔离规则 |
| 2026-09-27 | Round 06 | 登记 items/shops 数据族、schema 与角色/NPC 新字段，记录堆叠容量、装备加成、起始背包及商店交易规则 |
| 2026-09-27 | Round 07 | 登记 quest 数据族与 NPC 发布人字段，记录目标进度、失败/奖励生命周期及任务空集行为 |
| 2026-09-27 | Round 08 | 扩展 dialogue-set 选项条件/效果封闭协议与逐选项坏引用隔离，登记社会状态标量范围与运行时边界 |
| 2026-09-27 | Round 08 追修 | 对照 Ajv 与引擎解析器的声望状态/变化量范围，修正负向声望变化被误拒 |
| 2026-09-27 | Round 08 语义追修 | 反向区间由防御解析器逐段拒绝并隔离，不再使同集合其他对话失效 |
| 2026-09-27 | Round 09 | 记录存档与设置不属于世界资料、引用兼容检查及各系统状态恢复语义 |
| 2026-09-27 | Round 10–11 | 记录多区域地图资源、知识图谱节点/关系、百科、知识对话条件与存档恢复 |
| 2026-09-27 | Round 13 | 增加导师、拜师/授艺/退门资料字段、规则说明及旧资料缺省语义 |
| 2026-09-27 | Round 14 | 登记必需历法资源与 game-calendar schema，记录月份/时段/照度/耗时契约、语义校验拒绝规则与分钟计数存档 |
| 2026-09-27 | Round 15 | 登记必需气候资源与 climate schema，记录季节月份分区、天气分布/表现/步耗时和稳定种子存档 |
| 2026-09-27 | Round 16 | NPC 可选时段日程、跨资源位置校验、基础位置回退、存读档派生与时段占位同步 |
| 2026-09-27 | Round 19 | 新增可选伙伴资料族、NPC 引用装配、攻疗支援字段与 MOD 覆盖语义；详见 `docs/COMPANIONS.md` |
