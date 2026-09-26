# Round 02 计划

## 本轮目标

建立可复用的 JSON 资料入口：由 manifest 枚举基础资源、关联 JSON Schema、应用按顺序启用的同路径 MOD 覆盖，并通过通用事件总线报告加载结果。将 Round 01 地图切换到该加载流程，保证缺失/损坏资料仍显示可读错误。

## 用户故事

- 作为资料作者，我希望用 manifest 登记 JSON 文件和 schema，游戏就能在启动时加载并拒绝不合规资料。
- 作为 MOD 作者，我希望在 `mods/<modId>/` 放置与基础资料相同相对路径的 JSON 文件，启用后覆盖基础文件且仍受同一 schema 校验。
- 作为引擎系统开发者，我希望用通用事件总线订阅、取消订阅并发布数据加载事件，不让数据层依赖 Phaser 场景。
- 作为玩家，我希望加载失败时仍得到清晰错误画面，不面对空白画布。

## 验收标准

1. 新增受 schema 校验的 manifest 与网格地图 schema；数据加载器按 manifest 读取基础 JSON，并返回可访问资源、来源信息和结构化诊断。
2. Ajv 对 manifest、基础资源和 MOD 覆盖逐个校验；坏基础数据不进入运行状态，坏 MOD 不生效并保留可读诊断。
3. `enabledMods` 按声明顺序处理；MOD 与基础文件使用相同相对路径，后启用 MOD 覆盖先启用 MOD；未提供覆盖文件时保留前一有效版本。
4. 根目录 `mods/` 中的 JSON 在 Vite 开发期可读取，并被包含进生产构建；路径处理拒绝目录穿越。
5. 通用 typed `EventBus` 支持 `on`、`once`、`off`、`emit`、`clear`，数据加载流程至少发布成功和失败事件；地图场景改由加载器获取地图。
6. `npm run build` 通过；手动验证默认地图加载、schema 错误提示、有效 MOD 覆盖、无效 MOD 回退和事件总线基本订阅语义；更新路线图、变更日志、开发日志及数据/架构指南。

## 可验证子任务

1. **资料契约与加载**：加入 manifest、JSON Schema 和 Ajv 加载路径。验证基础地图能通过 schema 并由场景显示；损坏的基础地图被拒绝且给出诊断。
2. **事件与 MOD 解析**：加入框架无关的 typed event bus、按顺序叠加并校验 MOD 的逻辑、Vite 开发/生产静态分发。验证事件订阅语义、有效同名文件覆盖和无效覆盖回退。
3. **接入、文档与回归**：场景使用加载器；更新相关文档。验证生产构建、产物中 schema/data/MOD 文件存在，并通过浏览器手动操作确认默认与覆盖场景。

## 涉及文件

- `iterations/round-02/plan.md`
- `package.json`、`package-lock.json`、`vite.config.ts`
- `src/engine/data-loader.ts`、`src/engine/event-bus.ts`、`src/game/grid-scene.ts`
- `data/base/manifest.json`、`data/schema/manifest.schema.json`、`data/schema/grid-map.schema.json`
- `mods/` 示例覆盖、`docs/ADR.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`

## 风险

- 根目录 `mods/` 不属于 Vite 当前 `publicDir`；需同时正确实现开发服务器读取和生产构建复制，且必须限制为仓库 MOD 目录内的 JSON 文件。
- Ajv 校验器必须与本轮 schema 草案版本一致；地图的跨字段约束（行列长度、字符引用、出生点可走）仍需运行时语义检查补足。
- 多 MOD 中单个文件缺失应继续使用上一个有效版本；无效覆盖应报告错误且不得污染游戏状态。
- manifest 和数据文件均可能缺失、返回 HTML 或 JSON 损坏；加载层需把这些故障转为诊断，场景需维持 Round 01 的可读错误降级。

## 预计人类工程师工时

约 3–5 小时（资料协议与 Ajv 集成 60–90 分钟，加载/覆盖与事件总线 75–120 分钟，Vite 分发及场景接入 45–75 分钟，手动验证与文档/提交 30–60 分钟）。
