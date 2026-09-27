# 开发日志（DEVLOG）

按轮次记录实际做过什么、核验到什么、没做什么。**只记录事实，不预制结果。**

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
