# Round 03 计划

## 本轮目标

在现有 manifest/schema/加载器之上，以 JSON 数据加入首批原创 NPC、静态地图放置、四方向邻接交互和可分支的基础对话。场景负责装配通用 NPC/对话运行逻辑；人物名、台词、选项和地图坐标全部来自 `data/`，不硬编码进引擎。

## 用户故事

- 作为玩家，我希望在地图上看见人物，在相邻格按交互键交谈，并能读完或选择对话分支。
- 作为资料作者，我希望在字符资料中定义 NPC 身份、位置和对话引用，在对话资料中写节点与选项，无需修改引擎代码。
- 作为维护者，我希望 NPC 与对话资料都经过 Schema 校验，且跨资源引用、地图坐标和可行走位置错误能得到可读诊断。

## 验收标准

1. manifest 登记 NPC 与对话 JSON 资源，并为两种资源提供 draft-07 Schema；运行时先经 Ajv 校验静态结构，再做跨资源语义校验。
2. 至少 3 名原创 NPC 及其姓名、初始地图/网格位置、对话引用均来自数据；每名 NPC 至少有一段可结束的对话，数据示例含可选择分支。
3. NPC 被渲染在数据声明的可行走格；玩家不能进入被占用格。只在 NPC 四方向相邻时显示可交互提示，远离时不能打开对话。
4. 对话 UI 显示 NPC 名称与数据驱动文本；玩家可用键盘浏览/确认选项、前进或结束对话。对话打开期间地图移动输入不生效，结束后恢复。
5. 缺少角色/对话引用、重复 NPC id/位置、越界或落在阻挡格、无效起始节点/断裂 next 引用等错误会被拒绝并给出可读诊断；这类可选内容错误只禁用受影响的 NPC/对话并显示警告，地图仍可游玩。manifest 文件/schema 或必需地图/schema 的错误仍维持致命降级。
6. manifest 未登记 NPC/对话资源或有效集合为空时，仍显示当前地图及明确的“暂无可交互人物”提示。
7. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`README.md` 及相关架构/数据/GDD 文档；`npm run build` 通过，并完成浏览器手动验证。

## 可验证子任务

1. **NPC 与对话资料契约**：新增 NPC 资料、对话图 JSON 及对应 Schema，登记到 manifest；编写跨资源语义校验和可选内容错误隔离。验证有效数据加载；临时注入坏引用、坏坐标或断裂节点，确认仅相应人物功能被禁用且地图仍可游玩，之后恢复文件。
2. **地图放置与邻接交互**：新增通用 NPC 解析/呈现逻辑，按坐标放置并阻止玩家踩入占用格；为相邻 NPC 提供提示并由交互键触发。验证位置、阻挡、四方向邻接及远距离不可交互。
3. **基础对话与回归**：加入可分支、可结束的键盘对话 UI，打开时隔离移动输入；完成文档更新。验证三名 NPC 的数据对话、分支/结束/关闭流程、恢复移动及生产构建。

## 数据契约与交互约定

- NPC 集合资源：`npc.round-03-set` → `characters/round-03-npcs.json` → `npc-set` schema。每项包含稳定 `id`、`name`、`mapResourceId`、`position: { col, row }` 和 `dialogueId`。
- 对话集合资源：`dialogue.round-03-set` → `dialogues/round-03-conversations.json` → `dialogue-set` schema。每段对话包含 `id`、`startNodeId` 和 `nodes`；节点包含 `id`、`text` 与可选 `options`；选项包含 `text` 和 `nextNodeId`。省略或使用空 `options` 数组的节点是结束节点。
- 结构约束由 Ajv 校验；跨资源校验确认资源 id 唯一、地图和对话引用存在、NPC 坐标在地图内且可行走、NPC 不占同一格、起始节点存在且每个选项目标有效。NPC/对话资源或其 schema 失败时输出 warning 并隔离受影响人物；清单自身/schema 或必需地图/schema 的错误仍阻止场景启动。
- 交互只接受四方向曼哈顿距离为 1 的目标。按下 `E` 与多个 NPC 相邻时，选择距离最近者；等距时按 NPC id 排序取首项，保证结果确定。NPC 所在格不可进入。
- 对话面板用 `↑/↓` 选项、`Enter` 确认、`Esc` 关闭；节点无选项时 `Enter` 或 `Esc` 结束对话。面板打开时拦截移动输入，关闭后恢复。引擎只处理 id/坐标/节点，人物名与所有对话文本始终来自 JSON。

## 涉及文件

- `iterations/round-03/plan.md`
- `data/base/manifest.json`、`data/base/characters/round-03-npcs.json`、`data/base/dialogues/round-03-conversations.json`
- `data/schema/npc-set.schema.json`、`data/schema/dialogue-set.schema.json`
- `src/engine/npc-placement.ts`、`src/engine/dialogue-graph.ts`、`src/game/dialogue-ui.ts`、`src/game/grid-scene.ts`
- `index.html`（更新浏览器标题以反映当前切片）
- `docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/GDD.md`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`

## 风险

- NPC 格子必须同时通过地图边界、可行走性、唯一占位和角色/对话引用检查；Schema 单独无法完成跨文件约束。
- 数据加载器会累计多个资源的诊断，而当前场景把所有 error 都视为致命；本轮须调整场景装配策略，将可选 NPC/对话故障与必需地图故障区分开。
- 对话输入与现有方向键移动相冲突；打开对话期间必须可靠拦截场景移动事件，并在关闭时恢复。
- 本轮仅做基础节点/选项跳转，不提前实现任务条件、声望条件或对话效果；这些能力留给 Round 08。
- NPC 初始位置先作为静态资料；日程、移动和动态位置留给 Round 16 及后续轮次。

## 预计人类工程师工时

约 4–6 小时（资料模型与校验 60–90 分钟，NPC 渲染/占位/交互 60–90 分钟，对话状态与 UI 60–90 分钟，手动验证、文档和提交 60–90 分钟）。
