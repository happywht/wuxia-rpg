# 数据规范指南（DATA-GUIDE）

- 状态：Round 03–08 已落地地图/NPC/对话、成长/武学/战斗、物品/商店、任务与社会状态运行时；Round 09 将玩家运行状态放入独立的本地存档协议（不属于可覆盖的世界 JSON），详见 `docs/SAVES.md`。
- 关联：`docs/ARCHITECTURE.md`（引擎/数据分离与降级策略）、`docs/ADR.md` ADR-0004

---

## 1. 数据即世界

本项目的世界内容（设定、人物、地图、任务、对话、关系、物品、武学、门派、结局）**全部以 JSON 表达**，存放于 `data/base/`，由 manifest 驱动的通用加载器在启动期读取。代码中不含设定文本；资料作者可以只改 JSON 就改变世界。

## 2. 目录结构

```
data/
├── base/                    # 基础世界数据（十族）
│   ├── manifest.json        # 当前数据清单、schema 引用及启用 MOD 顺序
│   ├── worldview/           # 世界观：时代背景、历法、通则设定
│   ├── characters/          # 角色：NPC 与主角模板、属性、好恶
│   ├── maps/                # 地图：区域、房间/场景、连接与出生点
│   ├── quests/              # 任务：目标、步骤、条件、奖励
│   ├── dialogues/           # 对话：节点、选项、条件分支、效果
│   ├── knowledge_graph/     # 知识图谱：NPC 认知/态度/关系边（社交记忆）
│   ├── items/               # 物品：装备、消耗品、任务物
│   ├── skills/              # 武学：招式、元素、修炼需求、战斗作用
│   ├── factions/            # 门派：立场、声望规则、成员关系
│   ├── battles/             # 战斗：遭遇触发点、敌人、奖励与提示文本
│   └── endings/             # 结局：触发条件与结局文本
├── schema/                  # JSON Schema（当前含 manifest、grid-map、npc-set、dialogue-set、character-profiles、faction-set、martial-arts-set、battle-encounters、items-set、shops-set、quest-set）
mods/                        # mod 覆盖层：mods/<modId>/ 镜像 data/base/ 相对路径
```

Round 07 状态：manifest 另登记可选资源 `quest.round-07-set` → `quests/round-07-quests.json`（`quest-set`）。基础资料提供两项原创差事，NPC 可声明可选 `questGiver`（缺省为 false）；Q 打开任务日志，邻接任务发布人按 E 打开只列出其任务的名录。Round 09 起玩家任务、背包、战斗遭遇等运行状态由版本化存档持久化，不写回世界 JSON。此前角色模板、NPC 商店字段与物品数据仍按 Round 06 契约使用。Vite 把整个 `data/` 目录作为静态资源目录，开发期可从站点根路径读取，生产构建时复制到 `dist/`。`mods/example/` 提供未启用的同路径覆盖示例。启用 MOD 只需把其单段 id 按优先顺序加入 manifest 的 `enabledMods` 数组。

Round 08 状态：dialogue-set 选项新增可选 `conditions`（数组，全部满足才可见）与 `effects`（数组，确认时先全量验证再统一提交）字段，二者均为封闭枚举协议（见 §4 对话条件与效果），旧的无条件对话完全兼容。示例对话扩展覆盖任务接取/放弃/交付、物品赠予/交付、善恶、声望与 NPC 关系分支。Round 09 起运行时社会状态（善恶 −100…100、声望 0…1000、逐 NPC 关系 −100…100）和任务/物品进度通过存档持久化；门派级声望统一规则留待 Round 18。任务发布人 NPC 保留 E 名录入口，另可用 F 直接交谈。

## 3. 文件与命名约定

- 文件名：小写 kebab-case，如 `data/base/maps/qingxi-town.json`（示例名，内容待后续轮次原创编写）。
- 每个数据对象有稳定 `id`，前缀按族区分（建议 `char.` / `map.` / `quest.` / `dlg.` / `kg.` / `item.` / `skill.` / `faction.` / `ending.`）；跨族引用一律用 id，不用文件路径。
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
- **值与变化量分开看**：声望条件读取的当前声望范围为 0…1000；`adjustRenown.delta` 是有符号变化量，范围为 -1000…1000（排除 0）。负变化合法，执行后的声望仍钳制在 0…1000。Ajv Schema 与引擎防御解析必须接受同一合法变化范围。
- **未登记的数据族**：地图是当前场景的关键资源，缺失时加载器会生成错误诊断并显示修复说明。NPC/对话、角色成长/武学/战斗、物品/商店和任务均为可选资源：未登记或有效集合为空时地图正常显示（NPC 空集提示“暂无可交互人物”，背包/任务日志可显示空状态）；玩家运行状态只要求有有效角色模板，不要求遭遇或任务数据。其余空目录尚未进入运行时资料集。
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
- 新增 NPC：在 npc-set JSON 里加条目（稳定 id 建议 `char.` 前缀、姓名、`mapResourceId` 用已登记地图资源 id、`position` 填可走格、`dialogueId` 指向已登记对话）；坐标坏、引用断或占位冲突只会禁用该 NPC 并在 HUD/控制台给出点名警告，不影响其他人物。
- 新增对话：在 dialogue-set JSON 里加一段（id 建议 `dlg.` 前缀、`startNodeId` 指向存在节点、选项 `nextNodeId` 必须可达；无 `options` 的节点即结束节点）。断裂引用只禁用该段对话及引用它的 NPC。选项可声明 `conditions`（全满足才可见：任务状态、物品数量、善恶/声望/NPC 关系闭区间）与 `effects`（确认时原子执行：接取/放弃任务、给予/交付物品、修善良恶/声望/关系；见 §4 对话条件与效果）；坏跨资源引用只剔除该选项，draft-07 Schema 可表达的结构/协议错误仍按资源级拒绝，解析器额外发现的单段语义错误（如反向上下界）只禁用该段并警告。示例：马尚义对话按任务 offered/active/completed 显示不同分支，顾夜尘带话后关系达标解锁新选项。
- 新增角色模板：在 character-profiles JSON 里加条目（id 建议 `char.` 前缀；五项属性 `body/force/agility/insight/resolve` 键与 1–999 值域是协议，显示名称写在 `attributeLabels`；`maxLevel` 必须大于 `startingLevel`，属性起点不得超过 `attributeCap`，否则整个资源在加载期被拒；`startingMartialArtIds` 列出起始武学——引用必须存在、未禁用并满足模板起始等级/属性（起始视为无门派），坏引用只剔除该武学并警告）。
- 新增门派：在 faction-set JSON 里加条目（id 建议 `faction.` 前缀，名称/立场/宗旨/武学风格全为原创文本）。id 重复只保留先声明者并警告。
- 新增武学：在 martial-arts-set JSON 里加条目（id 建议 `skill.` 前缀；类别取六枚举之一：拳脚/剑法/刀法/身法/内功/外功；`factionIds` 空数组表示不限门派，非空时每个 id 必须指向已加载的有效门派——悬空引用只禁用该武学；`requirements.level` 与 `requirements.attributes` 填最低门槛；`initialProficiency` 不得超过 `proficiencyCap`；`combat` 必填——kind 取 attack/heal，power 为作用基数，qiCost 为每次使用的内力消耗，内力不足时该行动不可用）。
- 新增战斗遭遇：在 battle-encounters JSON 里加条目（id 建议 `encounter.` 前缀；`mapResourceId` 用已登记地图资源 id，`position` 填可走格且不压出生点/NPC/其他遭遇格——玩家四方向相邻时按 E 开战，敌人占格阻挡通行；`profileId` 指向有效角色模板（玩家状态以首个有效遭遇的模板创建）；`enemy` 直接给五项属性与生命/内力数值（不走派生公式）及武学 id 列表（须为有效武学）；`victoryExperience` 胜利发放一次，`defeatRecovery` 两项 0–1 比例控制失败恢复，`repeatable` 声明胜利后可否再战；`texts` 五条提示文本全部原创）。坏引用/坏坐标只禁用该遭遇并点名警告。
- 新增物品：在 items-set JSON 中新增条目（id 建议 `item.` 前缀，`category` 选 consumable/equipment/misc；填写原创名称/说明、`stackLimit`、`buyPrice`/`sellPrice`；消耗品声明 `healthRestore`/`qiRestore` 至少一项为正，装备声明槽位、属性加成和生命/内力上限加成；`sellPrice: 0` 表示不可售）。
- 新增商店：在 shops-set JSON 中声明稳定 shop id、`npcId`（指向可放置 NPC）、原创 `name`/`greeting`、`sellRate` 及 `stock`（`itemId` 必须存在，quantity 为 -1 无限或非负余量）；在 NPC 条目加 `shopId` 后，玩家四方向相邻按 E 开店，否则仍走其对话。货币与背包起点在角色模板的 `startingCurrency`、`inventoryCapacity` 和 `startingItems` 中配置。
- 新增任务：在 quest-set JSON 的 `quests` 数组新增任务（`id` 建议 `quest.` 前缀；`giverNpcId` 必须指向有效 NPC，并在 NPC 条目声明 `questGiver: true`；`prerequisiteQuestIds` 只能引用无环任务；目标 `kind` 选 `collectItem`/`defeatEncounter`，`targetId` 分别引用有效物品/遭遇，`requiredCount` 为正整数；`failOnEncounterIds` 声明败北失败的遭遇；`rewards` 声明非负 experience/currency）。收集目标接取时以当前背包数量为起点，物品变化后同步目标数量；击败目标在战斗胜利后推进；任务奖励恰发一次。E 打开发布人名录，Q 打开日志，A 放弃活动任务；Round 09 起任务阶段和进度随本地存档持久化。
- 所有内容必须原创（红线见 `docs/ORIGINAL-FIDELITY.md`）；命名避开任何原作专有名称。

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
