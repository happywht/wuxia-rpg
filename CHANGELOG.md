# 变更日志（CHANGELOG）

格式参考 Keep a Changelog；版本号遵循语义化版本。逐轮开发细节见 `DEVLOG.md`。

## [Unreleased]

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

### Added (Round 00 research follow-up)

- 为原作对照补入一条有明确范围的《白金英雄坛说》开发者证言：go1980 报道称参与开发者将“击杀不同人物影响结局”作为白金版新增要素。因该信息仅见于单篇媒体采访转述，标为中等置信度并明确未获独立印证；只将其映射为本作原创行为驱动多结局设计，不引用原作人物、名单或结局内容。

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
