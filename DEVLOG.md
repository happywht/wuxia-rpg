# 开发日志（DEVLOG）

按轮次记录实际做过什么、核验到什么、没做什么。**只记录事实，不预制结果。**

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
- TapTap 玩家回忆页：用于 A3 对照（单一回忆，证据"低-中"，非官方规格）。
- stahuj.cz 第三方衍生条目：仅交叉参考（证据"低"，对原作不具证明力）。
- 授权状态：以上页面许可证均未验证，故仅摘要 + 链接（`docs/REFERENCES.md` 使用规则）。

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
