# 数据规范指南（DATA-GUIDE）

- 状态：Round 02 manifest、网格地图 Schema、通用加载器与 MOD 覆盖已落地；其余数据族 schema 随后续内容轮次补充。
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
│   ├── skills/              # 武学：招式、元素、修炼需求
│   ├── factions/            # 门派：立场、声望规则、成员关系
│   └── endings/             # 结局：触发条件与结局文本
├── schema/                  # JSON Schema（当前含 manifest 与 grid-map）
mods/                        # mod 覆盖层：mods/<modId>/ 镜像 data/base/ 相对路径
```

Round 02 状态：manifest 当前登记 `map.round-01-grid` → `maps/round-01-grid.json` → `grid-map` schema；其余数据族仍为空目录。Vite 把整个 `data/` 目录作为静态资源目录，开发期可从站点根路径读取，生产构建时复制到 `dist/`。`mods/example/` 提供未启用的完整同路径覆盖示例。启用 MOD 只需把其单段 id 按优先顺序加入 manifest 的 `enabledMods` 数组。

## 3. 文件与命名约定

- 文件名：小写 kebab-case，如 `data/base/maps/qingxi-town.json`（示例名，内容待后续轮次原创编写）。
- 每个数据对象有稳定 `id`，前缀按族区分（建议 `char.` / `map.` / `quest.` / `dlg.` / `kg.` / `item.` / `skill.` / `faction.` / `ending.`）；跨族引用一律用 id，不用文件路径。
- 每族目录可多文件；加载器合并为该族的"对象集合"。
- 具体字段以 `data/schema/<族>.schema.json` 为准（schema 进入后，本文件仅维护约定，不复制字段定义，避免双份真相）。

## 4. 校验与缺失数据的启动行为

- **地图运行时检查**：Round 01 的场景会检查地图字段、网格尺寸、瓦片键和出生点；缺文件、HTTP 错误、无法解析或结构错误都会显示可读错误面板。它仅服务当前垂直切片，不代替正式 Schema。
- **正式校验**：Round 02 起加载期用 Ajv 8.x（ADR-0004）校验 manifest、每份基础 JSON 和启用的 MOD 覆盖。draft-07 schema 约束静态字段；网格地图 parser 补足跨字段语义。错误进入结构化诊断并经事件总线发布。
- **未登记的数据族**：当前 manifest 只登记地图，其他空目录尚未进入运行时资料集；后续数据族实现时再定义空集行为。地图是当前场景的关键资源，缺失时加载器会生成错误诊断并显示修复说明。
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
- 所有内容必须原创（红线见 `docs/ORIGINAL-FIDELITY.md`）；命名避开任何原作专有名称。

## 变更记录

| 日期 | 轮次 | 变更 |
|---|---|---|
| 2026-09-26 | Round 00 | 建立目录规范、命名约定、降级与覆盖规则基线 |
| 2026-09-27 | Round 02 | 记录 manifest、Ajv 校验、加载诊断和同路径 MOD 覆盖使用方式 |
