# 架构决策记录（ADR）

本文件记录已接受的技术决策及其依据。决策一经冻结，不得随意更换；推翻须新增 ADR 并注明取代关系。

版本核验日期：2026-09-28（核验方法与来源见各条目及 `docs/REFERENCES.md`）。

---

## ADR-0001：渲染引擎采用 Phaser 4（冻结主版本 4）

**状态**：已接受（Round 00）

**背景**：

- 项目需求（brief）建议的默认项是 Phaser 3。
- 核验事实（2026-09-26）：
  - Phaser 官方 v3.90 发布公告（2025-05-23）原文："As we're days away from the release of Phaser v4 this is likely the last version in the v3 tree."——即官方明确表示 v3.90 很可能是 v3 线的最后一个版本。
  - Phaser 官方 v4 发布归档显示 v4.0.0（2026-04-10）至 v4.2.1（2026-07-09，代号 "Giedi"）持续发布；npm registry `phaser@latest` 为 **4.2.1**。
  - 结论：Phaser 的持续开发与发布都在 v4 线上，v3 线已由官方宣告接近终点。

**决策**：采用 Phaser 4，依赖声明为 `^4.2.1`，冻结主版本 4，不在项目中混用 v3 API 教程代码。

**替代方案**：

- Phaser 3（brief 建议）：被否。新项目从零开始，选择官方已宣告"很可能不再更新"的版本线没有收益，反而长期维护风险更高。
- 自研 Canvas/WebGL 引擎：被否。Round 00 目标是快速建立可迭代基座，自研引擎与本轮目标不符。

**后果**：

- 正面：跟随官方活跃版本线，获得后续修复与特性；从第一行代码起就避免 v3→v4 迁移债。
- 风险：v4 发布时间尚短（首版 2026-04），生态资料仍以 v3 居多；缓解措施是仅使用 v3/v4 兼容面之内的基础 API（Scene、Game、文本、图形），并在后续轮次遇到差异时记录到 DEVLOG 与本文件。
- 若未来出现不兼容变更，通过新增 ADR 处理，不静默升级。

## ADR-0002：TypeScript 冻结 5.9 线

**状态**：已接受（Round 00）

**背景**：npm registry 上 `typescript@latest` 已是 7.0.2（6.x 线最新 6.0.3，5.x 线最新 5.9.3）。本机及 CI 将长期使用 `tsc --noEmit` 做类型检查，Vite/esbuild 负责转译。

**决策**：采用 `typescript@^5.9.3`（5.x 线终版）。升级到 6/7 线留待后续单独 ADR，在 5.x 上积累稳定基线后再评估。

**理由**：5.9 是被编辑器、构建工具与社区资料覆盖最充分的成熟版本线；本项目对编译器新特性无即时需求（YAGNI）。

**后果**：升级路径清晰（改 `package.json` + 新 ADR）；避免新大版本发布初期的兼容性噪音。

## ADR-0003：构建工具采用 Vite 8（冻结 ^8.3.1）

**状态**：已接受（Round 00）

**背景**：npm registry `vite@latest` 为 **8.3.1**，其 `engines.node` 要求 `^20.19.0 || >=22.12.0`。本仓库开发机 Node 为 v22.18.0，满足要求。

**决策**：采用 `vite@^8.3.1`，仓库级 `engines.node >= 22.12.0` 写入 `package.json`，避免在不满足要求的 Node 上安装。

**后果**：低配 Node（<22.12）环境无法构建，属可接受约束；README 已注明前提。

## ADR-0004：世界内容数据优先（JSON + JSON Schema，以 Ajv 8.x 校验）

**状态**：已接受（Round 00 决策；Round 02 已实现加载与校验）

**背景**：用户故事要求"引擎规则与可替换的世界资料分离，并能在今后校验数据、覆盖默认内容"。

**决策**：

- 所有世界内容以 JSON 存于 `data/base/`（十大数据族目录已建立），引擎代码不含具体设定文本。
- 每个数据族配套 JSON Schema 于 `data/schema/`。
- 校验器采用 **Ajv 8.x**（npm `ajv@latest` = 8.20.0，已核验；冻结主版本 8），Round 02 已接入并实现加载期校验。
- mod 采用同名文件覆盖：`mods/<mod>/` 下与 `data/base/` 相对路径相同的文件优先于基础数据（详见 `docs/DATA-GUIDE.md`）。

**替代方案**：把内容写进 TypeScript 常量——被否，无法满足"资料作者可不改代码地替换内容"的目标。

**后果**：运行时必须处理"数据缺失/非法"的降级路径（空世界或可读错误，见 `docs/ARCHITECTURE.md`）；数据结构演进需要 schema 版本意识。

## ADR-0005：自动化测试框架采用 Vitest

**状态**：已接受并实施（Round 38 修订版本决策）

**背景**：项目 brief 建议 Vitest。Round 00 曾冻结 Vitest 4.x：当时（2026-09-26）registry 中 `vitest@latest` 为 5.0.2、4.x 最新为 4.1.11，因此计划使用 4.1.11；实际接入延后到 Round 38。实施时重新核验官方指南和 npm registry：Vitest 5 要求 Vite >=6.4.0、Node >=22.12.0，精确版本 5.0.2 的 peer 范围包含 Vite 8 与 Node 类型 >=24，本仓库 Vite 8.3.1、Node 22.18.0、`@types/node` 26.6.3 均满足。

**决策**：测试框架维持 Vitest，不更换技术栈。Round 38 接入时采用 registry 当前版本 `vitest@5.0.2`（`^5.0.2`），因为官方兼容范围覆盖本仓库的 Vite/Node 组合；原 Round 00 冻结的 4.x 是实施前的版本计划，由本次兼容性核验结果修订。准确来源及许可记录在 `docs/REFERENCES.md`。

**后果**：Round 38 已加入 `vitest` 与自动化测试基线；独立 `vitest.config.ts` 隔离异步 Vite 应用配置。`npm test` 单次运行测试，`npm run typecheck` 同时检查测试代码。

## ADR-0006：引擎事件采用本地 typed EventBus

**状态**：已接受（Round 02）

**背景**：manifest 数据加载及后续系统需要在不依赖 Phaser 场景的情况下发布资源成功/失败事件，并允许场景或其他系统订阅。

**决策**：在 `src/engine/event-bus.ts` 提供泛型、同步、框架无关的事件总线，支持 `on`、`once`、`off`、`emit`、`clear`、`listenerCount`；注册返回精确退订函数。每个使用方显式持有并传入 event bus，不创建全局隐式单例。

**替代方案**：直接依赖 Phaser EventEmitter 或增加第三方事件包。前者会让通用引擎/数据层绑定渲染框架；后者对当前几个事件增加不必要的运行时依赖，因此均不采用。

**后果**：事件契约在 TypeScript 编译期检查，不增加运行时依赖；事件同步派发，监听器异常会沿调用栈传播，调用方须避免在 listener 中抛出未处理异常。

## ADR-0007：首个托管目标采用手动确认的 GitHub Pages 静态站点

**状态**：已接受（Round 47；部署配置已实现，远端发布尚未执行）

**背景**：游戏已经是 Phaser/Vite 浏览器应用，世界资料以静态 JSON 加载，不要求服务器端代码。Round 39 的 CI 明确没有发布步骤。当前工作区也没有配置 Git remote，因此不能由本机完成托管帐号/仓库设置或宣称已发布。

**决策**：提供 GitHub Pages workflow，手动 `workflow_dispatch` 并要求显式勾选公开发布确认，且只接受默认分支；push/PR 不发布。workflow 的构建 job 运行完整 `npm run package:release`，将 Vite 静态目录交给官方 Pages artifact action，并暂存版本归档 30 天；独立 deploy job 才获得 Pages/OIDC 写权限。Vite 产物用 `./` 相对基址，支持域名根和项目仓库子路径。版本包由临时 staging 白名单构造，不直接归档仓库根目录。

**替代方案**：每次 push 自动公开部署——被否，容易在未经内容/授权复核时发布；提交 `dist/` 到 `gh-pages` 分支——被否，污染源码历史且不复用 Pages Actions artifact；桌面客户端——不属于当前 Web 发布目标，若再实施须新建平台 ADR。

**后果**：可以本地重复构建/检查版本包并在维护者同意后发布；首次远端使用须将 Pages source 设为 GitHub Actions。公开站点状态及真实 URL 尚未验证；见 `docs/RELEASE.md` 与 `docs/REFERENCES.md` #19–20。

---

## 版本冻结总表

| 依赖 | 锁定 | 核验版本（npm registry / 官方站） | 进入 `package.json` 的时机 |
|---|---|---|---|
| phaser | `^4.2.1`（主版本 4） | 4.2.1（官方 v4 归档 2026-07-09 发布） | Round 00（已写入） |
| typescript | `^5.9.3`（5.x 线） | 5.9.3（latest 为 7.0.2，见 ADR-0002） | Round 00（已写入） |
| vite | `^8.3.1`（主版本 8） | 8.3.1 | Round 00（已写入） |
| ajv | `^8.20.0`（主版本 8） | 8.20.0 | Round 02（已接入数据加载/校验） |
| @types/node | `^26.6.3`（仅开发期类型） | 26.6.3 | Round 02（Vite MOD 分发插件） |
| vitest | `^5.0.2`（主版本 5） | 5.0.2 | Round 38（Vitest 自动化测试基线） |

## ADR 索引与变更

| 日期 | 变更 |
|---|---|
| 2026-09-26 | Round 00 建立 ADR-0001 ~ 0005 与版本冻结总表 |
| 2026-09-27 | Round 02 接入 Ajv，并记录 typed EventBus 与本地 MOD 静态分发决策 |
| 2026-09-28 | Round 38 实施 Vitest 测试基线；依 ADR-0005 核验结果将 Vitest 版本从计划的 4.x 修订为 5.0.2 |
| 2026-09-28 | Round 47 冻结可复现静态版本包与显式手动确认的 GitHub Pages 发布路线（ADR-0007）；未执行远端发布 |
