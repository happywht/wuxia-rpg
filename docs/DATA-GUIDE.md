# 数据规范指南（DATA-GUIDE）

- 状态：截至 Round 93；基础世界含 30 名 NPC、5 个门派、57 项任务、52 件物品、30 种武学、图谱汇总为 319 个图谱节点/423 条边，manifest 登记 79 项资源。十三张区域地图均为 100×100 格；全域舆图为 640×448、43 层并以 RLE 保存，其中前 38 层沿用 Round 92 基线，Round 93 五层绘制照雪关以西的霜松谷与冰桥。气候资源可声明轻雾粒子表现；航路人物、目的地发现门控、青帆埠调查事件、雪夜烽燧调查和跨区差事阶段由独立 JSON 声明，漫游奇遇可按 `trigger: regionArrival` 与 `transitionIds` 声明入境关口抵达触发，读档后 NPC 日程仍由时间派生，不新增存档字段。素材授权、MOD 和导航协议见 `REFERENCES.md`、`MOD-GUIDE.md`、`MAP-ATLAS.md`。
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
│   ├── forges/              # 装备锻造工位与配方
│   ├── alchemy/             # 药炉与悟性品质药方
│   ├── maps/                # 地图：区域、房间/场景、连接与出生点
│   ├── quests/              # 任务：目标、步骤、条件、奖励
│   ├── dialogues/           # 对话：节点、选项、条件分支、效果
│   ├── knowledge_graph/     # 知识图谱：NPC 认知/态度/关系边（社交记忆）
│   ├── items/               # 物品：装备、消耗品、任务物
│   ├── skills/              # 武学：招式、元素、修炼需求、战斗作用
│   ├── factions/            # 门派：立场、声望规则、成员关系
│   ├── battles/             # 战斗：遭遇触发点、敌人、奖励与提示文本
│   ├── endings/             # 结局：触发条件与结局文本
│   └── achievements/        # 成就：条件组合、进度提示与一次性奖励
├── schema/                  # JSON Schema（含 manifest、grid-map、world-map、game-calendar、knowledge-nodes、knowledge-edges、ending-set、achievement-set、npc-set、companion-set、faction-war-set、martial-art-components、meridian-set、equipment-forge-set、alchemy-set、dialogue-set、character-profiles、faction-set、martial-arts-set、battle-encounters、arena-set、items-set、shops-set、quest-set、content-package）
mods/                        # mod 覆盖层：mods/<modId>/ 镜像 data/base/ 相对路径
```

Round 07 状态：manifest 另登记可选资源 `quest.round-07-set` → `quests/round-07-quests.json`（`quest-set`）。截至 Round 68，基础资料提供 44 项原创差事，包含互斥分支、`talkToNpc` 谈话目标与 `discoverKnowledge` 见闻目标，以及江南道、雾雨渡口、铁嶂北道和西陲盐道区域链；发现目标只允许 `requiredCount: 1`，必须引用图谱节点，匹配的新发现信号只推进一次，接取时从已知见闻回填。读档会将玩家已知节点重算到活跃发现目标，继续复用 v1 存档中的目标 id/计数，不增字段。NPC 可声明可选 `questGiver`（缺省为 false）；Q 打开任务日志，邻接任务发布人按 E 打开只列出其任务的名录。Round 59 起七位相关 NPC 的对话带有这些任务的活动中/完成后状态回声（纯 `questStatus` 条件、无 effects）。Round 09 起玩家任务、背包、战斗遭遇等运行状态由版本化存档持久化，不写回世界 JSON。Vite 以 `BASE_URL` 的相对 `./` 基址读取并打包 `data/` 与 `mods/`，因此开发和发布部署均可挂在子路径下。`mods/example/` 提供未启用的同路径覆盖示例。启用 MOD 需把其单段 id 按优先顺序加入 manifest 的 `enabledMods` 数组。

Round 32 状态：物品仍由 manifest 的 `item.round-06-set` 资源和 `items-set` schema 装配，基础集扩至 50 项；姜百味货架新增八种消耗品、两件基础装备和九种有限库存材料，六件升级装备由渡口铁砧的连续配方取得。武学仍由 `martial-art.round-04-set` 与 `martial-arts-set` schema 装配，基础集扩至 30 种；24 种新增门派武学通过五位导师的 `martialArtEligible` / `learnMartialArt` 对话分支授予，只有当前门派成员能进入本门目录。价格、材料、属性门槛和战斗作用均由现有 JSON 表达，不新增引擎中的剧情分支。完整目录见 `docs/ITEMS.md`、`docs/MARTIAL-ARTS.md`。

Round 69 状态：对 30 门基础武学的授艺对话图逐一做可达性检查，验证 `martialArtEligible` 与 `learnMartialArt` 使用相同武学 id、实际 NPC 属于对应师门；测试同时覆盖角色起始招式、五派门槛可达性和师门计数。新增 `combat.kind: "guard"`，表示支付 `qiCost` 后抵挡下一次受击中的最多 `power` 点伤害，最终至少受 1 点伤害；敌方在无可用攻击时才会选择守御。拦门刀法保持 `factionIds: []`，祝九弦现有门内课程之外另有面向门外玩家的授艺分支。四招身法及成本/守御值见 [`MARTIAL-ARTS.md`](MARTIAL-ARTS.md) 与 [`COMBAT-BALANCE.md`](COMBAT-BALANCE.md)。自创武学组件仍只生成 attack/heal，不会创建 guard。

Round 33 状态：知识图谱两份资源（`knowledge.round-11-nodes` / `knowledge.round-11-edges`）扩至 134 节点/202 关系，与当前基础目录全量对齐——50 件物品、30 种武学、20 项任务、5 个门派、12 名 NPC 和 2 张地图资源全部按稳定业务 id 映射到正确 `kind`，无占位或虚构条目。新增物品/武学节点 `knownByDefault: false`（由 Round 29 观察式发现解锁），新增任务节点沿用基础差事公开惯例，结局节点保持未知。关系闭环覆盖武学门派归属（27 条 `belongsTo`）、姜百味货架持有（31 条 `holds`）、锻造配方投入（24 条 `requires`）、任务发布人/前置/收集/谈话链路（20+15+9+12 条）与结局条件影响边（见 `docs/KNOWLEDGE-GRAPH.md`）。遭遇等无图谱节点的业务 id 不伪造节点；MOD 删除条目时沿用既有悬空端点逐条隔离规则。

Round 34 状态：新增只读文档审计 `npm run audit:round-34`（`scripts/audit-round-34-docs.mjs`）。脚本按 manifest schema 家族收集地图/NPC/遭遇/任务/门派/历法/气候/图谱事实，从 `dialogue-set` 与 `quest-set` Schema 的封闭枚举提取条件/效果/目标 kind，核验 `docs/MAP-ATLAS.md`（地图资源 id、尺寸、起点、舆图坐标、关口两端坐标、区域事件触发格及数据侧通行性/引用）、`docs/DIALOGUE-GUIDE.md`（每个条件/效果 kind）、`docs/QUESTS.md`（每项任务的名称/发布人/前置/失败遭遇/报酬行与目标 kind）和 `docs/WORLD-SETTING.md`（门派名与正式区域名）与数据一致；计数全部由数据推导，不依赖 UI 文案措辞；发现漂移时逐条给出文档路径与缺失项并以非零退出。世界设定总览（背景/地理/五派/会盟/叙事边界，标注权威数据文件）见 `docs/WORLD-SETTING.md`。

Round 08 状态：dialogue-set 选项新增可选 `conditions`（数组，全部满足才可见）与 `effects`（数组，确认时先全量验证再统一提交）字段，二者均为封闭枚举协议（见 §4 对话条件与效果），旧的无条件对话完全兼容。示例对话扩展覆盖任务接取/放弃/交付、物品赠予/交付、善恶、声望与 NPC 关系分支。Round 09 起相关运行状态通过存档持久化；任务发布人 NPC 保留 E 名录入口，另可用 F 直接交谈。

Round 10 状态：manifest 可登记多个 `grid-map` 资源；`world.atlas` 是必需的 `world-map` 资料，声明 `startingMapResourceId`、区域图册坐标、地图内关口端点和区域事件。每张地图文件中的 `id` 必须与 manifest 资源 id 一致；世界图解析器检查起始区域存在、区域不重复、端点/事件引用有效且坐标可走。跨资源装配再隔离与 NPC 或遭遇占格重叠的关口/事件。M 打开图册，E 键按 NPC、遭遇、关口的优先顺序处理交互；一次性事件 id 随存档保存。新增资料流程与示例见 `docs/MAP-ATLAS.md`。

Round 77 状态：五区五张地图的 `art.actors` 现在引用 `opengameart.puny-characters` 合成图集，并可选声明 `playerFrames.idle` / `playerFrames.walk` 的上下左右帧号；`grid-map` Schema 与运行时解析器验证方向、非空行走循环及图集帧范围。NPC 的可选 `spriteFrame` 仍是其人物资料的 0 基帧号。玩家帧不再由引擎写死，移动方向只选择地图提供的对应帧；旧地图/MOD 可继续省略 `playerFrames` 并回退至 `playerFrame`。`npm run generate:round-77-characters` 从已登记的 CC0 源图重建合成图集与人物帧资料，发行只含合成图和来源通知。

Round 17 状态：`world-map` 事件可省略或声明 `conditions`（知识节点、时段、天气三组可选；组间 AND，组内 OR）和 `discoverKnowledgeNodeId`。触发器只在位置匹配且全部条件满足后结算；一次性状态在成功时才记入现有 `completedRegionalEvents`，发现节点进入现有 `knownKnowledgeNodeIds`。等候、移动和跨区抵达都会检查当前格；等候摘要与事件提示合并。事件的图谱、历法、天气坏引用逐条隔离，并报告具体 id。基础奇遇样例在渡口以“雨后脚印”为线索，在降雨的黄昏/夜间发现芦苇河滩。Round 75 固定事件可选声明非空 `approachText`；引擎在同图曼哈顿距离 1–2 格且直接交互提示均不存在时，按最近事件（同距按 id）显示临近线索，触发格本身仍只结算原完整文本。事件条件、一次性完成和已知发现节点都会抑制线索；旧地图缺字段时不变。协议细节见 `docs/MAP-ATLAS.md` 与 `docs/KNOWLEDGE-GRAPH.md`。

Round 18 状态：善恶（−100…100）、江湖个人声望（0…1000）、逐派声望（各 0…1000）与逐 NPC 关系（−100…100）由 `social-state.ts` 统一提供有界变化规则。对白支持 `factionRenown` 区间条件和 `adjustFactionRenown` 原子效果；门派资料可声明拜师门槛 `minimumFactionRenown` 与退门代价 `factionRenownDelta`。每派数值在 J 师门页展示；本门声望复用 v1 `social.factionRenown` id/value 列表，旧存档缺失时中立归零，已移除门派的值恢复时逐项忽略。基础导师对白拜师后 +10 本门声望，听雨剑阁对白演示本门声望条件分支。

Round 19 状态：`companion.round-19-set` 登记可选伙伴集合。伙伴由 `companion-set` Schema 校验，`npcId` 在世界装配期对照有效 NPC；单条伙伴引用失效时只禁用该伙伴。对白用 `recruitCompanion` 效果和 `npcRelationship` 条件实现邀请；单队伍槽、跨区安全跟随与攻/疗支援参数见 `docs/COMPANIONS.md`。MOD 可通过同路径覆盖伙伴 JSON，跟随坐标不写入存档。

Round 11 状态：manifest 登记可选 `knowledge-nodes` 与 `knowledge-edges` 资源，分别使用 `knowledge-nodes.schema.json` 与 `knowledge-edges.schema.json`；节点类别为 character/place/faction/item/martialArt/event/quest/ending，关系类型为 mentorOf/parentOf/hostileTo/belongsTo/locatedAt/holds/triggers/requires/rewards/knows/participatesIn/influences。节点含稳定 id、类型、标题、摘要和 `knownByDefault`；边含稳定 id、两端节点 id、关系类型和说明。Round 26 允许人物到人物边增加可选非零 `attitudeSpread`（-1…1）；parser 与图装配验证值域和端点类型。解析器对坏单条给警告并隔离，装配时重复 id 保留首项，悬空端点关系逐条丢弃。

玩家新局从 `knownByDefault: true` 节点建立知识状态。对话选项可以声明 `{ "kind": "knowledgeKnown", "nodeId": "kg.node-id" }` 条件，全部条件满足才显示；效果 `{ "kind": "discoverKnowledgeNode", "nodeId": "kg.node-id" }` 会解锁词条，重复发现幂等。悬空引用只剔除对应对话选项。K 打开百科；L 打开图鉴，两个面板都用左右/A/D 切换分类、上下/W/S 浏览，Esc 关闭。图鉴按八种节点 kind 投影已发现/总量/百分比，不另存重复状态；未知名称/摘要不泄露，只显示未解锁数量。人物、地图、物品、武学的稳定 id 与知识节点同 id 且 kind 相符时，首次观察到 NPC 交互、抵达地图、持有物品或已学武学会自动解锁。战斗遭遇可选填写 `knowledgeNodeId` 指向人物词条，装配时校验当前有效 character 节点，首次迎战时记录；悬空或非人物引用只忽略这项见闻链接。百科关系仅在两端都已知时显示；知识 id 沿用 v1 存档字段。具体内容组织和编辑步骤见 `docs/KNOWLEDGE-GRAPH.md`。

Round 14 状态：manifest 登记**必需**资源 `calendar.base` → `worldview/calendar.json`（`game-calendar` schema）。历法声明月份序列（id/名称/天数 1–60，至多 24 个月）、日内时段（id/名称/起始分钟 0–1439/照度 0–1，至多 24 段；必须存在零点时段且起始分钟互异）、起始时刻（年/月 id/日/日内分钟）与动作耗时（`stepMinutes` 0–1440、`travelMinutes`/`waitMinutes` 1–1440）。语义校验拒绝重复月份/时段 id、重复时段起点、悬空起始月份、超出当月天数的起始日与越界耗时——历法无效即整资源拒绝（可读错误面板），不做部分降级。时段按循环边界划分，可跨午夜；运行时 HUD 显示历日/时刻/时段，世界层按时段照度渐变调色。一天固定 1440 分钟；游戏时间只由成功移动（每步 `stepMinutes`）、成功区域旅行（`travelMinutes`）与 V 键等候（`waitMinutes`）推进，被阻挡或被面板拦截的操作零消耗。存档保存相对起始时刻的分钟计数（`elapsedGameMinutes`），日期随时由当前资料折算。对白写作细节见 `docs/DIALOGUE-GUIDE.md`。

## 3. 文件与命名约定

Round 23 新增可选 `meridian-set`（`meridian-set.schema.json`），经脉 JSON 放在 `meridians/` 并可由 MOD 同路径覆盖。资源声明初始修为、逐级修为和上限；每个节点声明 level/point 门槛、依赖节点、物品消耗及属性/气血/内力上限效果。依赖图须无环，材料引用会在世界装配期对照物品集，失效材料只关闭相关节点链。节点进度在运行存档，派生加成不写入世界资料。具体边界见 [`MERIDIANS.md`](MERIDIANS.md)。

Round 24 新增可选 `equipment-forge-set`，配方和地图工位定义放在 `forges/`，通过 manifest 同名路径 MOD 覆盖。工位引用地图资源与坐标；配方引用当前 item id、一个未穿戴基础装备、杂项材料、银两和同槽强化结果。装配会检查可走格、静态与日程占位，以及物品类别、槽位和属性不降级约束。配方投入数量和交易值域见 `data/schema/equipment-forge-set.schema.json`，运行规则与示例见 [`EQUIPMENT-FORGING.md`](EQUIPMENT-FORGING.md)。

Round 25 新增可选 `alchemy-set`，药炉和药方定义放在 `alchemy/`，通过 manifest 同名路径 MOD 覆盖。药方引用一个需要先发现的知识节点、杂项药材、正银两成本和按悟性阈值递增的 2–5 档普通消耗品结果。Schema 检查字段边界；装配器校验地图占位、物品/知识跨引用、门槛排序及恢复效果单调性。投入和结果定义见 `data/schema/alchemy-set.schema.json`，内容流程见 [`ALCHEMY.md`](ALCHEMY.md)。

Round 26 以 `social.npcKnowledge` 保存动态 NPC 见闻；旧 v1 缺字段时仍按空动态记忆恢复，并从当前有效 `knows` 边重建静态认知。`attitudeSpread` 人物关系边使态度按声明系数单跳传播。`npcKnows` 与 `shareKnowledgeNode` 仅影响 NPC 私有记忆，不把玩家百科状态混入 NPC 认知。规则及 MOD/存档行为见 [`KNOWLEDGE-GRAPH.md`](KNOWLEDGE-GRAPH.md)、[`SAVES.md`](SAVES.md) 和 [`DIALOGUE-GUIDE.md`](DIALOGUE-GUIDE.md)。

Round 27 新增可选 `ending-set` 资源，使用 `ending-set.schema.json`，可由同路径 MOD 覆盖。资源为终章声明一个地图入口、多个结局文本和 AND 条件；条件可读取任务状态、善恶、江湖/门派声望、NPC 关系、门派身份及已知图谱节点。加载时逐结局校验引用与地图占格，坏入口使该资源不可用，坏结局只隔离该结局；NPC 日程不会进入终章格。结局评估为纯函数，界面显示未满足条件并在确认时重算。当前原型在读完结局后回主菜单，尚不记录结局选择到存档。资料字段、路线及限制见 [`ENDINGS.md`](ENDINGS.md)。

Round 28 新增可选 `achievement-set` 资源，使用 `achievement-set.schema.json`，成就 JSON 放在 `achievements/` 并可由 MOD 同路径覆盖。每条成就声明 1–12 个 AND 条件（封闭 14 类：等级、任务/见闻/战斗/擂台/经脉/自创武学/锻造/炼丹计数、指定见闻、善恶/声望/人物关系区间、门派身份）和一次性经验/银两奖励；条件必带作者 `hint` 用于面板提示。Schema 校验字段封闭与基本类型，防御解析器逐条隔离语义越界/缺项成就，装配期再校验悬空人物/门派/知识引用。缺资源时世界照常运行；解锁 id 与活动计数保存在 v1 可选 `achievementState`。条件词汇、进度投影、G 键面板与领奖幂等语义见 [`ACHIEVEMENTS.md`](ACHIEVEMENTS.md)。

Round 29 图鉴不增加额外词条 Schema 或数据文件：它投影 `knowledge-nodes` 的八类条目并复用既有发现 id。`projectKnowledgeCollection` 是 Phaser-free 只读统计；`discoverObservedKnowledge` 只接受 character/place/item/martialArt 四组事实中同 id 且 kind 匹配的节点。图鉴列表只呈现已知词条及汇总的未知数量，K 百科则保留叙事关联浏览。发现 id 仍存入 v1 `knownKnowledgeNodeIds`，旧档、MOD 节点删除过滤与原规则相同。详细 UI 行为、解锁观察点与隔离规则见 [`KNOWLEDGE-GRAPH.md`](KNOWLEDGE-GRAPH.md)。

Round 30 状态：对话族改为**多资源装配**——manifest 中每个 `dialogue-set` 资源（如 `dialogue.round-03-set` 与 `dialogue.round-30-set`）都参与合并，重复对话 id 保留清单先声明者并警告；任一对话资源的结构失败只禁用该资源的对话（或单段），NPC 的 `dialogueId` 可指向任一文件中的对话。可选内容的降级判断同样改为按 manifest 声明的 schema 家族（任何数量的可选族资源坏档都只产生警告，不再按固定资源 id 枚举）。基础世界扩至 12 名 NPC 与 5 个门派：新增寒山书院（导师柳听澜，方格试炼场）与盘舷刀场（导师祝九弦，雾雨渡口），均复用现有拜师/退门协议；祝九弦传授既有通用武学拦门刀法，寒山书院暂不授专属武学（对话不引用武学条件，避免不可用选项）。第三名新人物白鹭洲为渡口渡董，承担地方知识传递与跨门派议事（渡籍轮值章程见闻、会盟结果报备、门派弟子登记）。人物与门派设定见 [`CHARACTERS.md`](CHARACTERS.md) 与 [`FACTIONS.md`](FACTIONS.md)。新 NPC 的基础位与日程位须避开全部固定互动格（遭遇/擂台/工位/药炉/门派战入口/终章入口/关口/区域事件），防止挡死既有内容。Round 74 起加载器也按 manifest 汇总全部 `npc-set` 与 `quest-set` 资源，使地图人物、对话对白和跨资源任务引用随资源拆分继续装配。

Round 20 新增擂台资料族：manifest 中的可选 arena-set 资源按地图入口、角色模板、赛程武学、彩头物品逐项校验；坏入口只禁用对应擂台。赛事文件可由 MOD 使用同路径覆盖，资料字段和玩法边界见 docs/ARENA_DESIGN.md。

Round 21 新增可选 `faction-war-set` 战事资料族：每个阶段为两支参战派分别声明对手属性/武学，组装校验入口、门派、武学和结局图谱节点。E 邻接报名限在籍参战弟子，贡献、结局声望变化和见闻发现均可由 JSON 调整；同名 MOD 资源可覆盖默认会盟。字段与贡献结算见 `docs/FACTION_WAR_DESIGN.md`。

Round 22 新增可选 `martial-art-forge-components` 资源（`martial-art-components.schema.json`），组件文件放在 `skills/` 并可由 MOD 同路径覆盖。每项组件属于 `intent`（attack/heal 招式）、`form`（架势）或 `breath`（吐纳）之一；Schema 限制字段和值类型，Phaser-free 解析器补充唯一 id、槽位/种类一致和整数范围检查。资源缺失、Schema 不符或语义错误时只禁用创制入口，不影响已有武学、战斗和地图。作品生成后作为玩家运行时状态存档，不写回世界资料；详细预算和存档边界见 `docs/MARTIAL_ART_FORGE.md`。

- 文件名：小写 kebab-case，如 `data/base/maps/qingxi-town.json`（示例名，内容待后续轮次原创编写）。
- 每个数据对象有稳定 `id`，前缀按族区分（建议 `char.` / `map.` / `quest.` / `dlg.` / `kg.` / `item.` / `skill.` / `faction.` / `ending.` / `achievement.`）；跨族引用一律用 id，不用文件路径。
- 同行伙伴 id 使用 `companion.` 前缀；伙伴必须引用有效 `npcId`，同一 NPC 可由独立伙伴资料赋予招募和支援规则。
- 每族目录可多文件；加载器合并为该族的"对象集合"。
- 具体字段以 `data/schema/<族>.schema.json` 为准（schema 进入后，本文件仅维护约定，不复制字段定义，避免双份真相）。

## 4. 校验与缺失数据的启动行为

- **地图运行时检查**：Round 01 的场景会检查地图字段、网格尺寸、瓦片键和出生点；缺文件、HTTP 错误、无法解析或结构错误都会显示可读错误面板。它仅服务当前垂直切片，不代替正式 Schema。
- **正式校验**：Round 02 起加载期用 Ajv 8.x（ADR-0004）校验 manifest、每份基础 JSON 和启用的 MOD 覆盖。draft-07 schema 约束静态字段；网格地图 parser 补足单文件跨字段语义。错误进入结构化诊断并经事件总线发布。
- **跨资源校验（Round 03）**：NPC 的地图/对话引用存在性、坐标在图内且可走、不占同一格/出生点、id 唯一，以及对话图的起始节点/选项引用完整，由场景装配层逐条校验；失败只禁用受影响的 NPC/对话（HUD 警告 + 控制台诊断），地图与移动不受影响。
- **跨资源校验（Round 04）**：角色模板/门派/武学集合内的 id 唯一性（重复保留先声明者）与武学 `factionIds` 对有效门派集合的引用，由场景装配层用引擎 `indexProfiles`/`indexFactions`/`indexMartialArts` 逐条校验；悬空门派引用只禁用该武学。单文件语义（maxLevel 高于起始等级、属性起点不超 attributeCap、初始熟练度不超上限）由按 schema 注册的语义校验器在加载期拒绝整资源。经验为累计阈值制：升第 k 级成本 = `baseExperience + experiencePerLevel×(k−1)`，升级不消耗经验、满级丢弃溢出；生命/内力上限 = `base + perLevel×(level−1) + Σ(权重×属性)`。
- **跨资源校验（Round 05）**：战斗遭遇的地图/角色模板/敌人武学引用、触发格在图内且可走、不压玩家出生点/NPC/其他遭遇格与 id 唯一，由场景装配层用引擎 `assembleBattleEncounters` 逐条校验，坏遭遇只禁用自身；角色模板 `startingMartialArtIds` 的存在性/起始资格/重复声明由 `resolveStartingMartialArts` 逐条校验，坏引用只剔除该武学。战斗公式为固定协议：攻击伤害 = `max(1, power + 攻击者 force − floor(防守者 body / 3))`，治疗量 = `power + floor(施放者 resolve / 2)`（封顶生命上限），守御只对下一次受击减去最多 `power` 点且最终伤害至少为 1；内力不足的行动不可用且不消耗回合。敌方回合在可用攻击中选威力最高者（平手按武学 id 升序），无可用攻击时才选威力最高的可用守御，否则蓄势；失败按遭遇 `defeatRecovery` 比例恢复（生命保底 1 点，内力不低于现值）；胜利经验恰好发放一次，`repeatable: false` 的遭遇胜利后本次运行不再触发（刷新重置）。
- **物品与商店（Round 06 / 存档 Round 09）**：`items-set` 定义 consumable/equipment/misc、堆叠上限、买卖基价与恢复/装备效果；`shops-set` 定义 NPC、文案、卖出比率和有限库存（`-1` 表示无限）。角色模板的 `startingCurrency` / `inventoryCapacity` / `startingItems` 确定开局背包，坏起始引用逐条剔除；商店对 NPC 与物品 id 做跨资源校验，悬空物品/重复库存行只剔除该货架条，失效 NPC 禁用商店，坏 NPC `shopId` 回退原对话。背包容量按不同物品堆数计，买卖/使用/装备均先校验再提交；消耗品恢复量受当前上限钳制；装备属性加到有效属性与派生资源上限并实时作用于战斗；出售价 = `floor(sellPrice × sellRate)`，装备中的唯一实例与 `sellPrice: 0` 物品不可售。Round 09 快照持久化库存、装备、银两和商店剩余库存；数据版本变动时会丢弃失效物品/货架项并限制超出新上限的数量。
- **任务（Round 07 / 存档 Round 09 / 发现目标 Round 56）**：`quest-set` 声明 `quests`，每项含稳定 id、名称/说明、`giverNpcId`、可选 `prerequisiteQuestIds`、非空 `objectives`、可选 `failOnEncounterIds` 与 experience/currency 奖励；目标 kind 支持 `collectItem`、`defeatEncounter`、`talkToNpc` 和 `discoverKnowledge`。发现目标引用已登记图谱节点且只允许计数 1；图谱首次新增节点会发任务信号，发现过的节点在接取时回填，旧兼容存档中活动发现目标也会在恢复时按已知节点重算。解析后逐项检查发布人须为已放置且声明 `questGiver` 的 NPC、目标物品/遭遇/NPC/知识节点及前置 id 必须有效、前置依赖不可循环；坏任务与依赖它的任务禁用，其他内容继续运行。无前置任务初始为 offered，有前置任务为 locked，前置全部完成后解锁；接取时收集目标快照当前背包数量，此后按物品数量变化同步，击败目标响应战斗胜利事件；配置的失败遭遇只在玩家败北时使任务失败，玩家可主动放弃活动任务。每个活动任务完成时一次性发放其 JSON 经验/银两奖励并刷新可解锁前置任务，奖励发现的新见闻也推进其他匹配的活动任务。任务面板列出状态、进度和奖励，日志可跟踪一项活动任务。Round 09 快照保存任务阶段、目标进度与跟踪项；恢复时会钳制已删除目标或当前上限外的进度。
- **对话条件与效果（Round 08）**：dialogue-set 选项可声明 `conditions` 与 `effects`（均为对象数组，字段白名单封闭、未知 kind/字段/值域在 Ajv 校验与引擎防御解析两级被拒；空数组无意义被拒，省略表示无条件/纯跳转，旧数据完全兼容）。**条件**（全部满足该选项才可见）：`questStatus`（`questId` + `status`∈locked/offered/active/completed/failed）、`itemCount`（`itemId` + `minCount` 1–999）、`morality`/`renown`/`npcRelationship`（`minValue`/`maxValue` 至少其一，闭区间，取值范围分别为 ±100 / 0–1000 / ±100；`npcRelationship` 须带 `npcId`）。同时提供上下界时还须满足 `minValue <= maxValue`；draft-07 无法声明字段间大小关系，该语义由防御解析器校验，错误只禁用所在对话并保留同集合的其他有效对话。静态 Schema 不通过仍会拒绝整份资源。**效果**（确认选项时原子执行，任一不可行则全部不执行且不转移节点）：`acceptQuest`/`abandonQuest`（要求目标任务分别为 offered/active）、`giveItem`/`takeItem`（`quantity` 1–99；给予校验背包容量，扣除校验拥有数量且装备中的唯一实例锁一件）、`adjustMorality`（delta ±100 非零）/`adjustRenown`（delta ±1000 非零）/`adjustRelationship`（delta ±100 非零；省略 `npcId` 作用于当前对话对象）；善恶/声望/关系结果按范围边界钳制。条件或效果引用的 questId/itemId/npcId 悬空时只剔除该选项（节点可能因此成为结束节点），对话其余选项照常可用。对话扣除或给予物品后按背包新数量同步活动任务收集目标（进度可能回退，属预期行为）。
- **多地图与世界区域（Round 10）**：已登记地图资源按 `grid-map` schema 收集，并要求地图内 `id` 与 manifest 资源 id 一致。必需 `world-map` 定义起始地图、图册节点、跨图关口与区域事件；舆图位置为 0–100 相对坐标，关口端点/事件格须引用有效地图并落在可走格。往返旅行需分别声明去程和回程端点。与 NPC/遭遇占格冲突的端点或事件会被逐条隔离并给出警告。事件 `once: true` 时只在首次踩入时结算并将 id 记入存档；`false` 允许每次进入重复提示。M 打开舆图且锁定探索输入；E 按 NPC → 遭遇 → 关口的顺序仲裁。详细字段及资料流程见 `docs/MAP-ATLAS.md`。
- **资料驱动的区域奇遇（Round 17）**：`world-map.events[].conditions` 可用 `knowledgeNodeIds`（全部已知）、`periodIds`（任一当前时段）、`weatherIds`（任一天气）组合门槛；所有已声明条件组都必须满足。`discoverKnowledgeNodeId` 在事件成功触发时发现一个百科节点。静态 Schema 校验形状，装配阶段跨图谱/历法/气候逐事件检查引用，坏事件独立隔离。等候时重新检查当前格，未满足的事件不会被消耗。
- **值与变化量分开看**：声望条件读取的当前声望范围为 0…1000；`adjustRenown.delta` 是有符号变化量，范围为 -1000…1000（排除 0）。负变化合法，执行后的声望仍钳制在 0…1000。Ajv Schema 与引擎防御解析必须接受同一合法变化范围。
- **未登记的数据族**：地图是当前场景的关键资源，缺失时加载器会生成错误诊断并显示修复说明。NPC/对话、角色成长/武学/战斗、物品/商店、任务、伙伴、擂台、门派战、经脉、装备锻造、炼丹、结局、成就和知识图谱均为可选资源：未登记或有效集合为空时地图正常显示；玩家运行状态只要求有有效角色模板，不要求遭遇、任务、伙伴、门派战、经脉、锻造、炼丹、结局或成就数据。其余空目录尚未进入运行时资料集。
- **关键单点缺失**（如出生点地图缺失）：启动失败，输出单一明确错误（缺什么、去哪补）。

## 5. MOD 覆盖规则与作者工作流（同名文件优先）

1. `mods/<modId>/` 下与 `data/base/` **相对路径相同**的文件覆盖基础文件（整文件替换，不做字段级合并）。
   - 例：`mods/rebalance/skills/基础拳法.json`（示意）覆盖 `data/base/skills/基础拳法.json`。
2. 优先级：`mods/` > `data/base/`；多个 mod 按 mod 清单声明顺序应用，后声明的覆盖先声明的。
3. mod 文件同样必须通过 schema 校验——mod 不能绕过数据契约。
4. 每次覆盖可追溯：控制台日志、F2 面板与 `inspect:mods` 都能查到"资源 X 最终来自哪一层"。

### 5.1 覆盖语义（Round 02 起，Round 35 完整可查）

- 加载器按 `enabledMods` 的声明顺序读取 `mods/<modId>/<data/base/ 相对路径>`；后声明且校验通过的层获胜。
- 每个覆盖经过同一 schema 和可选语义校验；**缺失文件静默跳过**（MOD 只覆盖部分资源是正常情况），坏覆盖发 warning 并**保留上一有效版本**（原子回退，坏覆盖绝不会夺取来源）。
- 覆盖没有的基础资源时同样要求基础文件有效——覆盖是扩展，不能拯救缺失的基础资源。

### 5.2 启用与排序

1. 在 `data/base/manifest.json` 的 `enabledMods` 数组按优先顺序写入 MOD 的单段目录 id（如 `["low-priority", "high-priority"]`）；数组顺序即覆盖顺序，**后声明者优先**。
2. MOD id 只能是 `mods/` 下的一级目录名（字母/数字/`_`/`-`/`.`/中文，禁止路径分隔符与目录穿越），目录内镜像 `data/base/` 的相对路径。
3. 在 `npm run dev` 开发服务器运行时，修改 `data/**/*.json` 或 `mods/**/*.json` 会自动发送资料热重载通知：主菜单会更新角色资料，游戏内会在安全时段重新校验并装配世界；兼容时保留当前运行状态。坏 JSON、Schema、地图或不能恢复的当前站位不会半更新，游戏提示保留旧世界并在控制台给诊断。Vite 全程不整页刷新。
4. 生产预览/发布构建没有开发 HMR 通道；发布版修改资料后需按其部署方式重新构建或重启应用。

### 5.3 提交前检查（只读命令）

```bash
npm run inspect:mods
```

- 按真实 manifest 顺序检查：manifest 自身、每个基础资源与每个已启用覆盖的 JSON 可读性和 schema（Ajv draft-07）。
- 输出每项资源的「基础层 / 各 MOD 层 / 最终来源」与被拒绝层的**精确文件路径、错误明细和修复提示**；存在坏层时以非零退出。
- 该命令只做静态检查，**不做**跨资源语义校验（引用闭合、坐标/占格、历法分区等）——这些仍由游戏运行时加载器在装配时执行。

### 5.4 游戏内排错（F2 面板）

- 探索中按 **F2** 打开「MOD / 资料状态」面板（Esc/F2 关闭；↑/↓ 浏览，←/→ 翻页）：
  - **生效顺序**页：`enabledMods` 的覆盖顺序与每层优先级说明；
  - **资源来源**页：每个成功加载资源的最终来源（基础资料或具体 MOD）及其基础/覆盖文件路径；
  - **MOD 诊断**页：被拒绝覆盖与运行时装配警告的概要/详情——失败原因、精确覆盖 URL、逐条错误和**可执行修复提示**（改哪份文件、按哪个 schema、如何从 enabledMods 移除该 MOD，或修正通过 Schema 但跨资源引用不成立的字段）。
- 有 MOD 覆盖被回退时 HUD 会出现黄色提示行，引导按 F2 查看原因。
- F2 打开期间探索输入被锁定，关闭后恢复移动/交互。

### 5.5 内容包：导出、只读预检与显式安装（Round 37）

把 `mods/<modId>/` 的传统布局导出为**单文件 v1 内容包**（`.wuxia.json`，含格式版本、包元数据、引擎兼容声明、逐资源 SHA-256），在其他仓库副本预检后安装为全新 MOD 目录：

```bash
npm run content:export -- --mod example --name "示例魔改包" --out example.wuxia.json
npm run content:import -- example.wuxia.json            # 只读预检，不写任何文件
npm run content:import -- example.wuxia.json --apply    # 预检全过后安装到 mods/<包id>/ 新目录
```

- **迁移语义**：导出只读取 MOD 中与 manifest 登记路径一致的 JSON；孤儿文件、坏 JSON、Schema 不符都会在导出时报错并点名文件，不产出半成品包。资源按清单顺序排列，同一输入重复导出字节级一致；校验和基于**递归键排序的规范 JSON**，与源文件排版无关。
- **兼容边界**：包声明 `formatVersion`（当前仅支持 1，未来版本明确拒绝并提示升级）与 `minimumEngineVersion`（严格三段数字，逐段数值比较；宽松版本串一律拒绝）。
- **安装边界**：默认只读；`--apply` 也只安装到 `mods/<包id>/` **全新**目录（已存在即拒绝），不改 `data/base/manifest.json`、不写 `enabledMods`、不覆盖任何已有内容。包内**不携带文件路径**——安装路径唯一来源是目标仓库 manifest 的资源登记（按资源 id 解析）；包 id 必须是安全单一目录名（拒绝 `../evil`、`a/b`）；包大小设硬上限。安装先整包校验，再经 `mods/` 下同盘暂存目录原子改名，失败清理暂存。
- **语义校验边界**：预检只做静态 JSON/Schema/兼容性检查；跨资源语义（引用闭合、坐标/占格等）仍由运行时加载器在装配时执行，游戏内坏引用按 §5.1 的 MOD 回退规则处理。
- 完整格式规范、安全模型与常见问题见 [`CONTENT-PACKAGES.md`](CONTENT-PACKAGES.md)。

### 5.6 静态发布包边界（Round 47）

- 发布包会携带构建时已选定的 `data/`、`mods/`、Schema 与示例 MOD；玩家在浏览器中没有安装或启用新 MOD 的入口。
- 要发布新的覆盖，维护者需在仓库副本中更新 MOD 和 `enabledMods`，运行 `npm run inspect:mods`、`npm run check`，再重新 `npm run package:release` 并按部署流程上传。
- 开发服务器的资料热重载只适用于本地仓库工作流，不存在于静态生产 bundle。静态部署挂载到仓库子路径时，游戏通过相对 `./` 基址解析 `base/`、`schema/` 和 `mods/`。
- 新手作者操作步骤见 [`MOD-GUIDE.md`](MOD-GUIDE.md)；该指南随 Web 版本包一起分发。


## 6. 开发热重载的处理范围与边界

- 监听 `data/`（含 `base/`、`schema/`）和 `mods/` 下的 JSON 新建/修改/删除；其它文件不会触发资料 HMR。修改 manifest 会与其它资料一样自动重读。
- 为保证跨资源引用闭合，当前重新执行整个 manifest 加载与世界装配流程；暂未按单个 schema 家族做缓存和局部增量装配。
- 游戏内通知等到角色不在移动/战斗、且没有打开面板时处理；等待过程中锁定键盘/鼠标输入。连续写入的变更会合并，重载途中新增的变更会再跑一次。
- 游戏运行状态仅临时序列化到内存并通过存档兼容预检恢复，不覆盖正式存档槽。若新资料删除当前角色/地图或当前位置变为不可恢复，保留旧世界与进度，提示重载未应用。
- HMR 是 `npm run dev` 的 Vite 插件；生产构建剔除桥接代码，数据仍按普通静态文件发布。

## 7. 资料作者须知（速查）

- 改世界 → 只动 `data/base/`；想替换官方内容 → 写到 `mods/`，不要直接改基础数据。
- 要分享 MOD → 用 `npm run content:export` 导出单文件包，接收方 `npm run content:import` 先预检再 `--apply`（§5.5）；安装不会自动启用，启用按 §5.2 手动登记。
- 新增数据先在 `data/base/manifest.json` 登记资源 id、相对路径及 schema id，并在 `data/schema/` 提供 draft-07 schema；`npm run dev` 会在启动时校验并把错误逐条写到控制台/场景。
- 新增 NPC：在 npc-set JSON 里加条目（稳定 id 建议 `char.` 前缀、姓名、`mapResourceId` 用已登记地图资源 id、`position` 填可走格、`dialogueId` 指向已登记对话）；可选 `schedule` 按已登记日历的 `periodId` 声明地图内 `position`，具体校验和冲突回退见 [`NPC-SCHEDULES.md`](NPC-SCHEDULES.md)。基础 NPC 坐标/引用无效会禁用该 NPC；单独坏掉的日程项只回退该人物该时段的基础位置。
- 新增对话：在 dialogue-set JSON 里加一段（id 建议 `dlg.` 前缀、`startNodeId` 指向存在节点、选项 `nextNodeId` 必须可达；无 `options` 的节点即结束节点）。Round 30 起对话文件可按轮次拆分：在 manifest 登记多个 `dialogue-set` 资源即可，加载器合并全部资源，重复对话 id 保留清单先声明者；NPC 的 `dialogueId` 可指向任一对话文件中的对话。断裂引用只禁用该段对话及引用它的 NPC。选项可声明 `conditions`（全满足才可见：任务状态、物品数量、善恶/声望/NPC 关系闭区间、玩家已知词条或 NPC 私有记忆）与 `effects`（确认时原子执行：接取/放弃任务、给予/交付物品、修善良恶/声望/关系、向 NPC 分享玩家已知见闻；见 §4 对话条件与效果）；坏跨资源引用只剔除该选项，draft-07 Schema 可表达的结构/协议错误仍按资源级拒绝，解析器额外发现的单段语义错误（如反向上下界）只禁用该段并警告。示例：马尚义对话按任务 offered/active/completed 显示不同分支，顾夜尘带话后关系达标解锁新选项；陆贞娘在玩家分享脚印线索后可按她自己的记忆回应。
- 新增角色模板：在 character-profiles JSON 里加条目（id 建议 `char.` 前缀；五项属性 `body/force/agility/insight/resolve` 键与 1–999 值域是协议，显示名称写在 `attributeLabels`；`maxLevel` 必须大于 `startingLevel`，属性起点不得超过 `attributeCap`，否则整个资源在加载期被拒；`startingMartialArtIds` 列出起始武学——引用必须存在、未禁用并满足模板起始等级/属性（起始视为无门派），坏引用只剔除该武学并警告）。
- 新增门派：在 faction-set JSON 里加条目（id 建议 `faction.` 前缀，名称/立场/宗旨/武学风格全为原创文本）。id 重复只保留先声明者并警告。
- 新增武学：在 martial-arts-set JSON 里加条目（id 建议 `skill.` 前缀；类别取六枚举之一：拳脚/剑法/刀法/身法/内功/外功；`factionIds` 空数组表示不限门派，非空时每个 id 必须指向已加载的有效门派——悬空引用只禁用该武学；`requirements.level` 与 `requirements.attributes` 填最低门槛；`initialProficiency` 不得超过 `proficiencyCap`；`combat` 必填——kind 取 attack/heal/guard，分别表示攻击/恢复/下一次受击减伤，`power` 是对应的作用强度，`qiCost` 是每次使用的内力消耗，内力不足时该行动不可用）。新授艺选项应有从 `startNodeId` 可达的条件分支，且 `martialArtEligible` 与 `learnMartialArt` 的武学 id 必须相同；门派招式的导师须在对应门派资料登记。
- 新增战斗遭遇：在 battle-encounters JSON 里加条目（id 建议 `encounter.` 前缀；`mapResourceId` 用已登记地图资源 id，`position` 填可走格且不压出生点/NPC/其他遭遇格——玩家四方向相邻时按 E 开战，敌人占格阻挡通行；`profileId` 指向有效角色模板（玩家状态以首个有效遭遇的模板创建）；`enemy` 直接给五项属性与生命/内力数值（不走派生公式）及武学 id 列表（须为有效武学）；`victoryExperience` 胜利发放一次，`defeatRecovery` 两项 0–1 比例控制失败恢复，`repeatable` 声明胜利后可否再战；`texts` 五条提示文本全部原创）。坏引用/坏坐标只禁用该遭遇并点名警告。
- 新增物品：在 items-set JSON 中新增条目（id 建议 `item.` 前缀，`category` 选 consumable/equipment/misc；填写原创名称/说明、`stackLimit`、`buyPrice`/`sellPrice`；消耗品声明 `healthRestore`/`qiRestore` 至少一项为正，装备声明槽位、属性加成和生命/内力上限加成；`sellPrice: 0` 表示不可售）。
- Round 32 内容：物品目录见 `docs/ITEMS.md`，武学目录见 `docs/MARTIAL-ARTS.md`。扩写消耗品需给出商店/炼丹等取得路径；扩写材料需接入配方或任务；装备需由货架或有效锻造配方获得。门派武学用已有 `martialArtEligible` 条件和 `learnMartialArt` 效果加入对应导师的独立授艺节点；门槛按等级逐层提升，重复学习由现有条件隐藏并由效果校验拒绝。
- 新增商店：在 shops-set JSON 中声明稳定 shop id、`npcId`（指向可放置 NPC）、原创 `name`/`greeting`、`sellRate` 及 `stock`（`itemId` 必须存在，quantity 为 -1 无限或非负余量）；在 NPC 条目加 `shopId` 后，玩家四方向相邻按 E 开店，否则仍走其对话。货币与背包起点在角色模板的 `startingCurrency`、`inventoryCapacity` 和 `startingItems` 中配置。
- 新增任务：在 quest-set JSON 的 `quests` 数组新增任务（`id` 建议 `quest.` 前缀；`giverNpcId` 必须指向有效 NPC，并在 NPC 条目声明 `questGiver: true`；`prerequisiteQuestIds` 只能引用无环任务；目标 `kind` 选 `collectItem`/`defeatEncounter`/`talkToNpc`/`discoverKnowledge`，`targetId` 分别引用有效物品/遭遇/已放置 NPC/知识图谱节点；`requiredCount` 为正整数，见闻目标必须为 1；可选 `exclusiveGroupId` 把若干前置完全一致的任务编成一组玩家分支——装配时整组校验，有效成员不足 2 或前置不一致即整组禁用，接取其一会把同组其余已解锁成员记为失败；`failOnEncounterIds` 声明败北失败的遭遇；`rewards` 声明非负 experience/currency，也可选声明 `factionRenown`（有效 faction id 与 ±1–1000 的非零 delta）和 `discoverKnowledgeNodeIds`。声望与见闻奖励跟任务状态首次进入 completed 同步发放；声望经通用规则钳制至 0–1000。收集目标接取时以当前背包数量为起点，物品变化后同步目标数量；击败目标在战斗胜利后推进；谈话目标只由玩家实际打开 NPC 对话（F 键交谈，或 E 键对无名录/商店 NPC 的交谈回落）推进，按 E 打开任务告示板不算谈话，接取差事的同一次交互也不自动完成谈话目标；见闻目标在首次发现相应图谱节点时推进，已知节点于接取/兼容存档恢复时回填；任务奖励新发现的见闻也会推进其他活动任务。E 打开发布人名录（商店 NPC 的 E 优先开店，其差事经 Q 日志接取），Q 打开日志，A 放弃活动任务；Round 09 起任务阶段和进度随本地存档持久化（v1 协议不变，新增目标类型按目标 id 存计数）。40 项基础差事与分支路线见 `docs/QUESTS.md`。
- 修改历法：直接编辑 `data/base/worldview/calendar.json`（或用 MOD 同路径覆盖）。调整月份天数/时段表/耗时都会即时反映到新开局与读档折算（存档只存分钟数）；删除对话正在引用的时段 id 只会剔除相应选项并警告。时段 id 建议 `period.` 前缀、月份 id 建议 `month.` 前缀；照度 0–1 控制夜幕深度（场景按 `1 − 照度` 叠加至多约 0.55 透明度的冷色层，UI 始终保持清晰）。
- 修改季节/天气：编辑 `data/base/worldview/climate.json`（或用 MOD 同路径覆盖），必须保留至少一种天气并确保各季节恰好覆盖历法的每个月份。季节 `monthIds` 引用 `calendar.json` 的稳定月份 id；`weatherWeights` 引用同文件的天气 id，权重为相对非负整数且每季总和需大于 0；天气声明 `#RRGGBB` 色调、0–0.45 透明度、0–1440 步耗时，以及可选的 `rain`/`snow`/`fog` 天气粒子类型和 0–1 密度。`precipitation` 是兼容沿用的字段名，也可声明轻雾；相同世界种子/历日会稳定抽得相同天气。额外步耗时只叠加到成功单格行走；改动示例和扩展边界见 `docs/CLIMATE.md`。
- 新增成就：在 achievement-set JSON 的 `achievements` 数组追加条目（`id` 建议 `achievement.` 前缀且保持历史稳定——解锁状态按 id 记入存档，改名等同于新成就；`title`/`description` 原创；`priority` 控制面板排序；`conditions` 选封闭 14 类并各带 `hint`，全部满足才解锁；`reward` 声明 1–100000 经验和/或 1–1000000 银两，至少一项）。坏条目或悬空人物/门派/知识引用只禁用该成就并警告。Schema 校验结构与字段类型，数值范围由解析器逐条执行。完整条件表、进度展示与领奖规则见 `docs/ACHIEVEMENTS.md`。
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

## Round 78：人物方向帧与地图前景深度

NPC 条目可选声明 `spriteFrames`，键固定为 `down`、`left`、`right`、`up`，值为地图 `art.actors.tilesetId` 图集中从 0 开始的帧号。Ajv Schema 检查方向键与整数结构，NPC 装配再检查四帧是否超出人物图集；省略该对象的旧资料仍绘制 `spriteFrame` 静态帧，缺省时继续使用地图 `defaultNpcFrame`。场景只在交互时按通用四向规则挑帧，不保存 NPC 临时朝向。

地图 `art.layers[]` 可选 `depthSort: "y"`，表示此视觉图层需要经过人物纵深排序。渲染器把标记图层烘焙为透明纹理，按地图行裁成稀疏前景图片，并把图片锚点放在该行底边；玩家、NPC 和伙伴按脚底 y 坐标排序。无标记的图层维持地面底图行为，`grid` 的碰撞与占格定义不变。作者可运行 `npm run generate:round-78-actor-depth` 重建默认五区标记与 NPC 四向帧。

## Round 81：全域舆图扩展

`atlasArt.columns` 和 `rows` 描述全域图底图尺寸；Schema 和运行时解析器都限制为 1–640 格。Round 92 的默认总图为 640×448 格、38 个图层压缩后仍逐格还原；前 33 层与 Round 91 基线相同，新增五层只在北部雪关投影内绘制。图层与碰撞无关，真实地图、地标、关口仍按已有资源和世界地图协议声明。

可选 `atlasArt.regionFootprint` 以舆图格表示区域投影所覆盖的旧宽高。投影器在画布尺寸变化后仍使用该跨度定位区域内玩家、地标和关口。省略字段的历史资源沿用 `atlasArt.columns/rows × 0.16` 的原推导，保持旧 MOD 的投影兼容。Home 只重置视口缩放与偏移，不改变玩家位置或旅行数据。

## Round 82：东溟海岸数据资源

第七张 `grid-map` 使用独立碰撞 `grid` 与 CC0 图素 `art.layers`，资源 id 为 `map.round-82-east-coast`。新增 `npc-set`、`dialogue-set`、`quest-set` 资源分别声明温朝之、状态条件对白和「潮尺旧记」；`world-map` 集中声明区域坐标、两向关口、四处地标和三个固定事件。知识发现 id 必须同时登记在 `knowledge_graph/nodes.json`，关系端点登记在 `edges.json`。运行 `npm run generate:round-82-east-coast` 可确定性重建这些资源，`npm run smoke:round-82` 覆盖引用、碰撞路线、互动提示和奖励；运行 `npm run validate:data` 检查静态 Schema，`npm run check` 另做跨资源装配校验。

## Round 83：港镇可组合内容集合

物品、商店与战斗遭遇可以像 NPC、对白和任务一样按轮次拆分成多个 manifest 资源。`world-loader.ts` 按 manifest 次序遍历所有 `items-set`、`shops-set`、`battle-encounters`；结构无效的可选集合单独告警并跳过，同类其他集合仍装配。全局重复物品 id 保留较早声明，商店与遭遇沿用逐记录首项优先；商店货架引用在全部物品索引完成后统一校验。Round 83 示例文件位于 `items/`、`shops/`、`battles/`、`characters/`、`dialogues/` 和 `quests/`，运行 `npm run generate:round-83-east-coast` 重建；`npm run smoke:round-83` 检查多资源合并、坏集合隔离、交易、七时段坐标和任务链。

## Round 84：风回岛数据资源与舆图扩展

Round 84 在旧 336×224 区域逐格不变的条件下，把 `world-map.json` 的舆图扩至 384×256，并增加四个独立 CC0 地貌图层。`map.round-84-windward-isle` 为新的 `grid-map`，其碰撞 `grid` 与 Puny World/RPG Town 视觉图层分开；manifest 另登记 NPC、对白与任务资源。两个 `transition` 端点引用地图 id 和格坐标，起点/落点都需要通过 BFS 可达检查。任务的 `discoverKnowledge` 目标指向灯标词条，奖励发现淡泉词条；对应事件、地点、人物、任务和两向关系由图谱节点/边共同校验。运行 `npm run generate:round-84-windward-isle` 重建，`npm run smoke:round-84` 覆盖尺寸、GID、连接、交互和奖励闭环。

## Round 85：扩展舆图、潮生屿与潮汐条件

Round 85 将全域舆图扩为 448×320 格和 24 个渲染层，在保持原 384×256 区域中二十层旧像素不变的前提下添加南部海域与岛屿。新增 `map.round-85-tide-isle`、人物/对白/任务集合均独立登记；风回岛和潮生屿之间有显式双向 `transition`，入口与主要互动锚点通过路径可达校验。气候资料可选配置 `tideCycle.cycleMinutes`、`phaseOffsetMinutes` 与有序 `phases`；相位时长必须合计为周期，id 不重复，周期须整除游戏日。`tideIds` 作为区域事件条件引用这些相位，加载器校验悬空 id；HUD 与事件读取同一 `ClimateRuntime`，旧 climate 覆盖省略潮汐字段时返回无潮位状态。运行 `npm run generate:round-85-tide-isle` 幂等重建，`npm run smoke:round-85` 覆盖数据闭环与旧区域兼容。

## Round 86：舆图行 RLE、低潮遭遇与限量补给

全域图层可选且只允许使用 `cells`（旧密集二维 GID 数组）或 `cellsRle`（逐行字符串数组）其中一种；解析器把 RLE 解码为同一个运行时 `cells` 矩阵，因此地图渲染、哈希、坐标投影和 MOD 运行协议不变。每行由逗号分隔的 `游程:GID` 十进制段构成，例如宽 448 格的一行可写为 `2:0,1:12,445:0`。游程为正整数、GID 为无符号整数；生成器输出规范串，合并相邻同 GID 游程。Schema 和解析器拒绝缺失/双重编码、坏 token、行数或列数不符、超界 GID/图集帧。当前 448×320、24 层舆图由 51,898,361 B 缩至 262,094 B，逐层 SHA-256 与转换前密集矩阵一致。

## Round 87：西南列岛与跨区雾航差事

舆图扩至 512×384 格、28 层；旧 448×320 矩形中的 24 层逐行 RLE 解码后逐格不变，原九区投影保持原像素位置。新增 `map.round-87-southwest-isles` 100×100 地图、区域角色/对白/任务集合，分别以 manifest 资源登记。东海群岛·落潮湾 `(5,31)` 与雾航湾 `(1,50)` 建立双向步行关口，地图装饰层不推导碰撞。使用已登记 Puny World、RPG Town 和 Puny Characters CC0 图集；生成器以哈希基线和玩法锚点检查保护旧内容。`npm run generate:round-87-southwest-isles` 幂等重建，`npm run smoke:round-87` 覆盖素材、岛图可达性、关口、任务阶段/导航和旧资料兼容。

## Round 88：轻雾天气与守烽条件

气候 `precipitation.kind` 允许 `fog`，旧雨雪格式不变；密度与色调来自气候 JSON，探索场景使用程序雾纹理。`weather.mist` 被季节权重表引用，由种子与历日确定，轻雾不作为特定地区的引擎常量。雾哨崖事件在既有区域事件条件中声明 `periodIds`、`weatherIds` 和 `nearbyNpcIds`，NPC 的七时段位置留在人物资源；无存档字段新增。运行 `npm run smoke:round-88` 可验证旧气候兼容、气候解析、时段落位、调查门控和原任务阶段/奖励。

战斗遭遇也可选声明 `tideIds`，数组中每个 id 必须引用 `climate.json` 的潮位相位。潮生屿 `encounter.r86-reef-raiders` 只在 `tide.low` 活跃：涨潮会移除遭遇标记并释放占格，低潮则恢复阻挡与战斗入口。该遭遇可重复且胜利经验为 0。陆余白的限量药囊商店与人物对白位于独立资源；有限货架复用既有商店库存及存档恢复规则。

## Round 89：跨区航路人物、舆图地标与发现事件

程问舟的七时段位置、对白效果、任务目标和图谱关系分别来自角色、对话、任务与知识图谱 JSON。接取差事时依次执行 `acceptQuest` 与 `discoverKnowledgeNode`，用线索节点解锁东溟海岸事件；事件发现地点节点后，舆图地标随之可见。任务以 `discoverKnowledge` 和 `talkToNpc` 目标串联调查与返程，不需要引擎专用逻辑、传送或存档字段。`npm run smoke:round-89` 覆盖资源装配、目标导航、双向关口步行路径及旧地图兼容。

## Round 90：跨区抵达奇遇

`world-map` 的 `randomEvents` 行可选声明 `trigger`（`step` 或 `regionArrival`，省略按 `step` 兼容）和 `transitionIds`（仅抵达触发可用的非空关口 id 列表，省略表示响应抵达该地图的任意关口）。装配阶段要求 `transitionIds` 引用的关口已启用且其目的地图与事件 `mapResourceId` 一致，无效行按资源隔离并给出可读警告；`step` 事件声明 `transitionIds` 属于解析错误。场景只在跨区切换真正完成（占位复核通过、新地图与玩家落位生效）后，把实际通行的 `RegionTransitionData.id` 交给抽取器；开局、原地等待、被阻挡的关口和普通走格维持各自原有语义，走格抽取的概率与时机不变。一次性完成状态沿用 `completedRegionalEvents`，不新增存档字段。基础资料以 `place.r89-safe-return-current` 为条件，在青帆埠与云岭古道之间加入两条一次性往返潮路见闻（`event.r90-arrival-blue-sail`、`event.r90-return-cloud-ridge`），分别绑定「越岭东行」与「回望云岭」两向关口；`npm run smoke:round-90` 覆盖真实地图关口方向、无效引用隔离、成功抵达、来源过滤、条件门控、一次性状态、知识发现与 v1 存档恢复。

## Round 80：地图环境对象调查

`world-map` 固定区域事件可选声明 `interaction`，其中 `prompt` 是 E 键提示，`range` 是同一行/列上的最大调查格距（缺省为 1，允许 1–4 格），`approachDirections` 限制玩家相对于目标的接近方向。交互目标本身可以位于不可通行格，但至少要有一个声明方向内可走的接近格；运行时还会检查玩家到目标之间的每个格子，墙、NPC 或遭遇占位都会挡住调查。事件条件不满足或一次性事件已经完成时，不显示交互提示。带 `interaction` 的事件只通过 E 调查，继续使用现有事件文本、条件、一次性状态和知识发现结算；不带字段的旧地图/MOD 仍在踏入触发格时触发。云岭断索悬桥与落潮湾白沙灯标是默认地图中的调查示例，具体坐标和提示见 [`MAP-ATLAS.md`](MAP-ATLAS.md)。

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
| 2026-09-29 | Round 78 | 增加 NPC 四向静止帧和地图 y 深度图层元数据、图集帧交叉校验、静态单帧回退与逐行前景渲染规则 |
| 2026-09-30 | Round 80 | 区域事件增加可选环境交互声明：提示、调查范围、接近方向与通路检查；保留旧地图踏入触发兼容 |
| 2026-09-30 | Round 81 | 全域舆图扩为 336×224 格，固定区域投影跨度并增加 Home 视口复位；扩展图层使用已登记 CC0 图集 |
| 2026-09-27 | Round 19 | 新增可选伙伴资料族、NPC 引用装配、攻疗支援字段与 MOD 覆盖语义；详见 `docs/COMPANIONS.md` |
| 2026-09-27 | Round 26 | 加入 NPC 私有知识、对白分享与图谱关系态度传播规则，并扩展 v1 兼容字段 |
| 2026-09-27 | Round 28 | 登记可选 achievement-set 资源族、条件/奖励契约、逐条隔离规则与 `achievementState` 存档字段；专项烟测与回归通过 |
| 2026-09-27 | Round 29 | 从知识图谱派生八类图鉴进度，以稳定 ID 观察人物/地图/物品/武学发现；复用 v1 已知见闻字段 |
| 2026-09-27 | Round 30 | 基础世界扩至 12 名 NPC、5 个门派；对话族多资源合并装配，可选内容降级改按 manifest schema 家族；新增寒山书院、盘舷刀场、柳听澜、祝九弦、白鹭洲与渡籍轮值章程见闻；详见 `docs/CHARACTERS.md`、`docs/FACTIONS.md` |
| 2026-09-27 | Round 31 | 任务协议新增 `talkToNpc` 目标与可选 `exclusiveGroupId` 互斥分支（整组校验、接取即锁定同组其余选项）；基础差事扩至 20 项并新增 3 个任务专用遭遇；详见 `docs/QUESTS.md` |
| 2026-09-27 | Round 32 | 基础物品扩至 50 项、武学扩至 30 种；新增材料/装备锻造链与五派数据驱动授艺菜单；详见 `docs/ITEMS.md`、`docs/MARTIAL-ARTS.md` |
| 2026-09-27 | Round 33 | 知识图谱扩至 134 节点/202 关系，物品/武学/任务/门派/NPC/地图目录全量映射，补齐武学归属、货架持有、锻造投入、任务链路与结局影响边；详见 `docs/KNOWLEDGE-GRAPH.md` |
| 2026-09-27 | Round 35 | §5 扩写为 MOD 覆盖规则与作者工作流：覆盖语义（后声明有效者胜、坏覆盖原子回退）、启用/排序步骤、`inspect:mods` 只读检查、F2 游戏内来源/诊断面板与重载说明 |
| 2026-09-27 | Round 36 | §5 补充开发期自动应用；§6 记录 Vite JSON 事件范围、整世界装配、安全边界、运行态兼容恢复与生产限制 |
| 2026-09-28 | Round 37 | §5.5 内容包：单文件 v1 包导出/只读预检/显式安装、规范 JSON 校验和、格式与引擎版本兼容边界及安装安全模型；登记 content-package schema；详见 `docs/CONTENT-PACKAGES.md` |
| 2026-09-28 | Round 47–48 | 补记相对 `./` 子路径发布基址、静态版 MOD 能力边界与玩家/MOD 指南；静态版新增 MOD 需由维护者重新构建分发 |
| 2026-09-27 | Round 34 | 新增 `audit:round-34` 只读文档审计（数据/Schema 驱动核验地图、对白协议、任务与门派覆盖）；新增世界设定总览 `docs/WORLD-SETTING.md` 并校准地图图册/对白指南/任务志 |
| 2026-09-28 | Round 44 | 世界事件支持按日程/邻接检查 nearby NPC；任务奖励支持一次性门派声望与图谱发现；详见 `docs/MAP-ATLAS.md`、`docs/QUESTS.md` |
| 2026-09-28 | Round 54 | 用有向区域 BFS 组合多段关口行程；远区地标必须先通过见闻过滤，当前地图只规划到首段关口，未直接公开的深层区域不进入舆图候选 |
| 2026-09-28 | Round 55 | 雾雨渡口地图资源扩为 100×100 十层数据，由确定性脚本 `generate:round-55-ferry` 生成并保护全部玩法锚点；世界图新增四个渡口地标与碑记事件 `event.r55-sluice-inscription`（发现 `place.mist-sluice`）；旧 R51 导入器不再覆盖渡口地图 |
| 2026-09-29 | Round 56 | 扩展 `discoverKnowledge` 任务目标与一次性见闻信号；旧存档恢复/新任务接取回填已知节点，石北新增雾岬/南湾巡标任务链，新增区域事件、知识图谱关系和发现门控地标 |


## Round 91：雁回崖与大图扩展

世界舆图 `atlasArt` 的尺寸上限提升为 640×448 格，图层扩至 33 层；生成器以旧舆图基线逐格保护 512×384 旧区域，并重新计算归一化投影以保持旧地图绝对格中心。新增 `map.round-91-cloud-north-terrace` 为独立 100×100 `grid-map`，8 个山地/桥梁图素层引用 OpenGameArt Ansimuz Tiny RPG Mountain CC0 图集，碰撞只读 `grid`。雁回崖与云岭古道有两向显式 `transition`；人物日程、时段调查门控、任务目标/奖励和图谱关系均由独立资源声明。运行 `npm run generate:round-91-cloud-north-terrace` 重建，`npm run smoke:round-91` 检查引用、路径、旧投影与幂等。

## Round 92：照雪关与北境雪带

`map.round-92-north-pass` 是独立的 100×100 `grid-map`：碰撞字符在 `grid` 声明，雪原/冰河/山脊/雪松/关墙/山径分层绘制，并引用 OGA zaphgames 冬季 CC0 图集和既有 Puny Characters 人物集。玩家由雁回崖 `(50,2)` 进入照雪关 `(50,97)`，由 `(49,97)` 可步行返回雁回崖 `(49,2)`；专项检查该地图 7,740 个可走格均从入口可达。

全域舆图保持 640×448 格和旧区投影，新增 `world-r92-pass-snow`、`world-r92-pass-trees`、`world-r92-pass-walls`、`world-r92-pass-detail`、`world-r92-pass-route` 五个 16px 图素层；原 33 层逐格保护。守烽人日程、对话、雪夜烽燧调查任务、发现事件、地标和图谱节点/边分别登记为人物、对白、任务及世界资料。`npm run generate:round-92-north-pass` 可确定性重建；`npm run smoke:round-92` 覆盖素材白名单、资源/图谱引用、两向路线、画布层稳定和跨轮生成器重跑。
