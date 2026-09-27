# 测试说明（TESTING）

Round 38 起本项目拥有可重复运行的 Vitest 自动化测试基线；Round 39 起这些检查与资料校验、MOD 检查、类型检查和文档审计共同组成统一质量门槛 `npm run check`，并进入生产构建（`npm run build`）与 GitHub Actions 持续集成。本文说明测试命令、配置取舍、覆盖范围、质量门槛与编写约定。

## 快速开始

```bash
npm run check       # 统一质量门槛（R39 起）：validate:data → inspect:mods → typecheck → test → audit:round-34
npm test            # vitest run，单次运行全部测试（CI 语义；不包含性能基准）
npm run benchmark:round-40 # 性能/内存基准（R40 起；与 npm test 双向隔离，见下文）
npm run typecheck   # tsc --noEmit，严格模式，包含 tests/ 与 vitest.config.ts
npm run validate:data  # 基础资料 CLI 校验（与测试共享同一实现，见下文）
```

## 质量门槛、构建与持续集成（Round 39 起）

`npm run check` 用 `&&` 串联五个步骤，**顺序固定、任一步非零退出即中止后续步骤**：

1. `npm run validate:data` — manifest 与全部基础资源 Schema 校验；
2. `npm run inspect:mods` — manifest 中已启用 MOD 覆盖层的只读校验与最终来源报告（覆盖边界：仅启用层，未启用目录不在检查范围）；
3. `npm run typecheck` — 严格 TypeScript 检查（含 `tests/` 与 `vitest.config.ts`）；
4. `npm test` — Vitest 单元测试；
5. `npm run audit:round-34` — 文档一致性审计（地图/对白/任务/世界设定）。

`npm run build` 先完整通过 `check` 再执行 Vite 生产构建：门槛失败时不会开始打包（此前 build 只跑 `tsc --noEmit`，类型检查不重复执行）。

`.github/workflows/quality-gates.yml` 在 push、pull request 与 workflow_dispatch 触发时于 Node 22 运行器上执行 `npm ci`（锁文件精确安装 + npm 缓存）→ `npm run build`（含完整门槛）→ `smoke:round-35`/`36`/`37` 回归烟测；仅 `contents: read` 权限、15 分钟超时、无部署发布步骤。CI 与本地命令完全同源；workflow 首次实际运行状态以 GitHub Actions 页面为准。

- 测试框架：Vitest 5.0.2。官方指南要求 Vite >=6.4.0、Node >=22.12.0；本仓库使用 Vite 8.3.1 与 Node 22.18.0，符合要求（详见 [`docs/REFERENCES.md`](REFERENCES.md) #12；基准 API 见同文件 #16）。
- 运行环境：Node（无 DOM、无浏览器、无网络、无真实时钟依赖）。
- 覆盖统计：11 个测试文件、123 个用例（R38 建立四组 53 个，R40 新增渲染器结构回归 10 个，R41 新增设置与输入 42 个，R42 新增主线集成 3 个，R43 新增漫游事件 6 个与门派支线集成 3 个，R44 新增日程漫游/奖励协议/双路线集成 6 个；详见 `CHANGELOG.md` 对应条目）。

## 配置：为什么有独立的 `vitest.config.ts`

仓库的 `vite.config.ts` 是一个**异步工厂**：它会动态加载开发态资料热重载插件（`scripts/data-hmr-plugin.mjs`）并注册 `mods/` 开发服务器中间件。这些是 dev-server 副作用，测试运行器绝不能启动。

因此测试使用独立的 `vitest.config.ts`：当两个配置文件同时存在时，Vitest 只读取 `vitest.config.ts`、完全不加载应用配置。测试配置只声明三件事：

- `environment: 'node'` — 引擎单元是纯 TypeScript，无 Phaser 场景依赖；
- `include: ['tests/**/*.test.ts']` — 测试统一放在 `tests/` 目录；
- `benchmark.include: ['tests/**/*.bench.ts']` — 性能基准走独立通道（R40 起，见下节）。

## 性能基准：与单元测试双向隔离（Round 40 起）

性能与内存测量入口是 `npm run benchmark:round-40`（详见 [`docs/PERFORMANCE.md`](PERFORMANCE.md)），不进 `npm run check`/CI 门槛。隔离机制：

- 基准文件 `tests/performance-round-40.bench.ts` 只被 `vitest.config.ts` 的 `benchmark.include`（`tests/` 下全部 `*.bench.ts`）匹配；`npm test` 的 `test.include` 只匹配 `*.test.ts`——普通测试运行永远看不到基准文件，反之 `vitest bench` 只跑基准。Vitest 5 的基准 API（`test()` 回调中的 `bench` fixture）也只在 `*.bench.ts` 文件内可用。
- 入口 `scripts/benchmark-round-40.mjs` 串联两段：`vitest bench --run --silent=false`（`NODE_OPTIONS=--expose-gc` 使长跑可在读堆前强制 GC）与裸 Node 通道 `scripts/benchmark-round-40-bare.mjs`（Vite `build.ssr` 打包真实渲染器后计时，抵消 Vitest 模块 runner 的 export-getter 开销）。
- 基准内只做**结构性断言**（每轮 26 资源 / 0 诊断），毫秒与堆读数全部是描述性输出——速度不构成任何通过/失败条件。

## 测试覆盖范围

| 文件 | 覆盖对象 | 要点 |
| --- | --- | --- |
| `tests/event-bus.test.ts` | `src/engine/event-bus.ts` | `on`/`off`/unsubscribe 身份语义与幂等；`once` 恰好投递一次；**once 重入**（监听器内部重发同一事件时自身不再触发，重入投递仍达新订阅者）；`emit` 快照迭代（投递期间新订阅的监听器不收当次事件）；`clear`/`listenerCount` |
| `tests/dialogue.test.ts` | `src/engine/dialogue-graph.ts`、`dialogue-runtime.ts` | `parseDialogueSet` 正反向（信封破损整份拒绝、单段坏对话仅隔离自身）；`validateConversation` 图语义（重复节点 id、缺失起始节点、悬空选项目标）；运行时条件可见性 `isConditionMet`/`getVisibleOptions`（questStatus/itemCount/道德边界含端点/timeOfDay/npcKnows/knowledgeKnown；多条件全满足才可见、空结果即结束节点、索引指向原始数组）；`DialogueSession` 播放与敌意输入忽略 |
| `tests/quest-system.test.ts` | `src/engine/quest-system.ts`、`quest-consequences.ts` | `parseQuestSet` 防御解析；`assembleQuests` 跨资源装配（坏发布人/奖励引用剔除、前置循环禁用、互斥组整组校验）；接受/推进/完成/失败生命周期及互斥分支连带失败；声望/见闻奖励随首次完成发放、声望边界钳制与重复信号不重发 |
| `tests/data-validation.test.ts` | `scripts/lib/data-validation.mjs`、`scripts/validate-data.mjs` | **真实仓库**正向校验（manifest + 全部基础资源计数一致）；临时 fixture 反向校验（资源违反 Schema、manifest 违反 Schema、资源文件缺失、无效 Schema、JSON `null`）；另以临时 CLI 副本启动真实 Node 子进程，锁定可读错误输出与非零退出码 |
| `tests/grid-map-renderer.test.ts` | `src/engine/grid-map-renderer.ts` | R40 渲染器结构回归：场景对象数随面积增长恒为 2（O(1) 契约）；逐格命令顺序（底色→边线→亮边→暗边）与几何/颜色/alpha 精确锁定；绘制范围与地图像素尺寸一致；Graphics 挂在返回容器内（地图切换 `destroy()` 级联语义）；样式去重；`cellCenterOffset` 普通坐标返回 |
| `tests/settings.test.ts` | `src/game/settings.ts` | R41 设置回归：Round 09 旧载荷 `{volume,textScaleIndex}` 迁移（新字段补默认、旧存储字节不动）；完整六字段往返；新字段"存在但无效"整载荷拒绝且不动存储；音量/字号越界与 JSON 损坏回退默认；写入拒绝（会话内仍生效）；`applyGameSettings` 声音总线音量与画布高对比度滤镜（mock game 结构替身，无浏览器依赖）；五档字号单调与 `uiFontSize`；`settingsRows`/`adjustGameSetting` 共享行数、循环与钳制语义 |
| `tests/input-settings.test.ts` | `src/game/input-settings.ts` | R41 输入回归：三档移动键位解析与键集（arrows 恰 4 键 / wasd 恰 4 键 / both 8 键）、逐键启用判定与帮助文本；摇杆死区（默认 0.5 与自定义）、主导轴、对角水平优先、非有限值；D-pad 基数优先于摇杆与对向键消解；标准映射采样（D-pad/左摇杆/A→confirm、B→back）；`GamepadEdgeTracker` 按住只发一次、换向即新边沿、释放重触发、confirm/back 边沿与 `reset()` |
| `tests/round42-story.test.ts` | `src/engine/quest-system.ts`、`dialogue-graph.ts`、`ending-system.ts` 与基础故事资料 | R42 主线集成：完整载入并装配任务和四张目标对白图；校验 R31 渡籍补录到三段主线、共享前置互斥分支、对话任务/物品/图谱引用；实际驱动任务状态机完成两条路线，验证兄弟失败和各自唯一新结局可达 |
| `tests/world-map.test.ts` | `src/engine/world-map.ts` 与 world-map schema | R43 漫游奇遇：旧地图缺省兼容、概率值拒绝、坏发现节点隔离、稳定候选顺序、无资格候选不消耗随机源、概率/一次性/可重复语义；R44 nearbyNpcIds 全员邻接判定与坏人物引用隔离 |
| `tests/round43-faction-routes.test.ts` | `src/engine/quest-system.ts`、`dialogue-runtime.ts` 与五派基础资料 | R43 门派支线：五项门派/见闻门槛与对白一致性、真实接取拒绝/成功、谈话完成及结果见闻发现、坏门派引用隔离 |
| `tests/round44-dynamic-events.test.ts` | `npc-schedule.ts`、`world-map.ts`、任务/对白/声望协议与基础资料 | R44 集成：解析真实日程并证明黄昏玩家邻接/日中离场；双 NPC 条件、时辰条件；两项互斥任务的对白入口、目标、一次性声望/知识奖励和声望钳制 |

测试只调用**公共导出函数**并断言行为，不做源码文本匹配；引擎模块均为 Phaser-free 设计，无需启动任何场景。

## 数据校验：CLI 与测试共享同一条代码路径

Round 38 之前 `scripts/validate-data.mjs` 在模块顶层直接执行校验（顶层 `await` + `assert`），无法被安全导入。现在：

- **`scripts/lib/data-validation.mjs`** — 唯一的校验实现：`validateBaseData(root)` 返回结构化结果 `{ ok: true, validated }` 或 `{ ok: false, problems }`，不打印、不抛错、不触碰进程状态；文件缺失、JSON 损坏、Schema 编译失败都被折叠为 `problems` 条目；合法 JSON `null` 会被送入 Schema 校验而不是误认作读取失败。
- **`scripts/validate-data.mjs`** — 薄 CLI 入口：成功时输出与历史逐字节一致的成功行；失败时把每条 problem 打到 stderr 并置非零退出码（与旧的 assert 抛错同样以非零退出）。
- **`scripts/lib/data-validation.d.mts`** — 类型声明，让严格 TypeScript 测试直接导入该模块而不重复实现规则。

因此 `npm run validate:data` 的结果与 `tests/data-validation.test.ts` 的正向用例**永远同源**：任何 Schema 或校验行为的变更都会同时体现在 CLI 与测试中。

## 编写约定

1. **断言行为而非实现**：只经公共 API 触发与验证；不断言源码文本、模块私有结构。
2. **失败案例用临时 fixture**：反向数据校验在 `mkdtemp` 临时目录构造（Schema 从仓库复制、数据手写破坏），`afterEach` 清理，绝不修改 `data/` 下受版本控制的资料。
3. **确定性优先**：不依赖真实时间、随机数、网络或跨用例共享可变状态；每个用例自建 fixture（如任务、对话、运行时上下文）。
4. **类型即测试**：`tests/` 与 `vitest.config.ts` 均在 `tsconfig.json` 的 `include` 内，`npm run typecheck` 对测试代码执行同等严格检查（`noUncheckedIndexedAccess` 等全部生效）。
5. **保持隔离**：不引入 DOM/浏览器环境需求；需要 Phaser 场景的 UI 层验证仍走各轮专项烟测脚本（`npm run smoke:round-*`）。

## 与既有验证手段的关系

| 手段 | 定位 |
| --- | --- |
| `npm run check` | 统一质量门槛（R39 起）：资料、MOD、类型、测试、文档审计一次跑全，任一失败非零退出 |
| `npm test`（Vitest） | 引擎规则与数据校验的快速单元回归，毫秒级、可重复（check 的第 4 步） |
| `npm run validate:data` | 内容作者的提交前资料检查（与测试共享实现；check 的第 1 步） |
| `npm run smoke:round-*` | 各轮专项端到端烟测（含真实 Vite 服务器、CLI 全链路）；R35–37 三条进入 CI |
| `npm run smoke:round-42` | Round 42 主线专项集成验证（章节状态机、对白图引用、互斥分支与结局可达性） |
| `npm run smoke:round-43` | Round 43 漫游事件协议及五派支线资格/对白/见闻集成回归 |
| `npm run smoke:round-44` | Round 44 NPC 日程附近条件、任务声望/见闻奖励与渡口互斥分支回归 |
| `npm run typecheck` | 严格类型检查（check 的第 3 步） |
| `npm run benchmark:round-40` | 性能/内存基准（R40 起）：渲染对象数与耗时双口径、26 资源加载、50 轮长跑堆观察；与 `npm test` 双向隔离、不进门槛（读数与局限见 `docs/PERFORMANCE.md`） |
| `npm run build` | `check` 全部通过后的 Vite 生产构建门槛（R39 起含完整 check） |
| GitHub Actions（`.github/workflows/quality-gates.yml`） | push/PR/手动触发的托管同源门槛 + R35–37 烟测（R39 起） |

## 变更记录

- 2026-09-28（Round 43）：新增 `tests/world-map.test.ts` 6 用例与 `tests/round43-faction-routes.test.ts` 3 用例，覆盖可选随机事件协议及五派任务资格、真实状态机/对白发现；覆盖统计更新为 10 文件 117 用例，新增 `npm run smoke:round-43`。
- 2026-09-28（Round 44）：新增 nearby NPC 条件和任务声望/图谱奖励的解析、装配、幂等结算测试；新增真实渡口日程/邻接和两条互斥路线集成用例；新增 `npm run smoke:round-44`。完整覆盖统计更新为 11 文件 123 用例。
- 2026-09-28（Round 42）：新增 `tests/round42-story.test.ts` 3 用例，验证 R31→R42 任务解锁、两份对白图引用、分支互斥/兄弟失败及两条数据结局可达性；新增 `npm run smoke:round-42` 专项入口；覆盖统计更新为 8 文件 108 用例。
- 2026-09-28（Round 41）：新增 `tests/settings.test.ts`（21 用例：v1 旧载荷迁移、验证/持久化、声音总线与画布外观应用、五档字号、共享设置行/调整语义）与 `tests/input-settings.test.ts`（21 用例：键位布局、摇杆死区/主导轴、D-pad 基数优先、标准映射采样、边沿检测）；覆盖统计更新为 7 文件 105 用例。手柄路由的浏览器内行为另经生产构建 + Playwright 烟测（设置导航/画布滤镜/布局门控），物理控制器硬件未测试——见 `DEVLOG.md` Round 41。
- 2026-09-28（Round 40）：新增性能/内存基准通道 `npm run benchmark:round-40`（`benchmark.include` 独立匹配 `*.bench.ts`，与 `npm test` 双向隔离）；新增 `tests/grid-map-renderer.test.ts` 10 用例锁定 R40 单 Graphics 渲染器结构契约；覆盖统计更新为 5 文件 63 用例。
- 2026-09-28（Round 39）：新增统一质量门槛 `npm run check`（资料校验 → MOD 检查 → 类型 → 测试 → 文档审计，`&&` 串联失败即中止）；`npm run build` 改为先过 `check` 再 Vite 生产构建；新增 GitHub Actions `quality-gates.yml`（Node 22、`npm ci`、只读权限、15 分钟超时、build + R35–37 烟测）。
- 2026-09-28（Round 38）：建立 Vitest 5 测试基线；抽取共享数据校验器 `scripts/lib/data-validation.mjs`（CLI 变薄）；新增四组 53 个单元测试；`tsconfig.json` 纳入 `tests/` 与 `vitest.config.ts` 严格检查。
