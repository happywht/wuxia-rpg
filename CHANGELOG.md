# 变更日志（CHANGELOG）

格式参考 Keep a Changelog；版本号遵循语义化版本。逐轮开发细节见 `DEVLOG.md`。

## [Unreleased]

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
