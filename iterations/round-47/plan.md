# Round 47 计划

## 本轮目标

把当前 Vite 游戏整理成可复现、可核验的静态 Web 版本包，并准备最小权限、手动确认才可执行的 GitHub Pages 部署流程。构建产物应只包含运行所需的网页资源、原创基础资料、示例 MOD 与随包说明，不得意外带入源码、测试、工作区私有文件或本机状态。

## 用户故事

- 作为试玩者，我可以解压带版本号的静态包并把其网页目录托管到任意静态文件服务器，且在仓库子路径下能加载基础资料和 MOD。
- 作为维护者，我能由锁文件构建生产包、检查包内文件/哈希并通过 Pages 工作流部署；部署必须由人工显式确认，普通 push/PR 不公开发布。
- 作为资料作者，我能从发布说明得知浏览器要求、静态主机约束、存档位置、MOD 限制和授权边界。

## 验收标准

1. 生产 Vite 包的资源 URL 可在根路径及仓库子路径下工作，`data/` 和 `mods/` 请求不依赖站点域名根目录。
2. `npm run package:release` 先通过完整质量门槛和生产构建，再生成带项目版本的归档、文件清单和 SHA-256 校验值；归档范围使用显式文件白名单，且不包含 `.serena/`、源代码、测试、node_modules、环境文件或仓库历史。
3. 包生成流程在缺失/破损 `dist` 时以可读错误失败；对归档执行重新解包检查，确认入口、数据 manifest、被 manifest 引用的资源、示例 MOD、说明文件与哈希清单完整且无未授权路径。
4. 新增 Pages workflow：由 `workflow_dispatch` 启动，布尔确认默认 false；仅确认 true 且来自默认分支才可部署；普通 push/PR 不触发发布；构建与部署分 job，权限按 Pages 所需最小化。
5. 更新发布/托管说明、参考来源、README、TESTING、CHANGELOG、DEVLOG、ROADMAP；运行包生成、包完整性/路径 smoke、check/build、必要回归并提交 `round-47:`。

## 可验证子任务

1. **路径与主机兼容**：审查 `BASE_URL` 资源构造，配置相对/子路径安全的构建并用带非根路径的预览服务器请求入口、manifest、数据与 MOD。
2. **版本化静态包**：实现白名单 staging、校验的 npm tarball、清单和 SHA-256 文件；加入包内容协议单测及端到端 smoke。
3. **手动发布工作流**：实现 GitHub Pages 双 job 工作流，校验部署门控、权限和普通 CI 隔离；加入部署与回滚步骤文档。
4. **复核和提交**：运行数据、MOD、类型、Vitest、文档审计、生产构建、打包 smoke、发布路径请求及主要回归；同步项目日志并提交。

## 涉及文件

- 新增：`iterations/round-47/plan.md`、`scripts/package-release.mjs`、`scripts/smoke-round-47.mjs`、`tests/release-package.test.ts`、`.github/workflows/deploy-pages.yml`、`docs/RELEASE.md`。
- 修改：`vite.config.ts`、`src/engine/data-loader.ts` 或 `src/game/world-loader.ts`（仅在路径审计确认必要时）、`package.json`、`.gitignore`、`README.md`、`docs/TESTING.md`、`docs/REFERENCES.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`。

## 风险

- 生产资料加载已使用 `import.meta.env.BASE_URL`，但自定义 MOD 发行路径可能仍假设域名根；必须用非根预览请求证明完整路径。
- npm 默认打包范围会包含大量开发文件，本仓库还存在 untracked `.serena/`；打包必须经独立 staging 和显式白名单，绝不能直接对工作区根目录 `npm pack`。
- 当前 `git remote -v` 未返回配置，因此无法真的创建托管站点、运行远端 GitHub Actions 或确认 Pages URL；本轮会完成可审阅部署配置和本机等价验证，不记录“已发布”。
- GitHub Pages 是公开发布面；工作流只允许手动触发、默认拒绝且显式确认，实际执行远端部署需另行由维护者触发并确认站点设置。

## 预计人类工程师工时

约 60–90 分钟：路径/官方托管协议审计 15–20 分钟；安全版本包实现和校验 20–30 分钟；工作流与文档 15–20 分钟；路径 smoke、全量门槛和提交 10–20 分钟。
