# Round 48 计划

## 本轮目标

对当前可运行游戏做发布前文档终审：给试玩者一份能完成开局、移动、交谈、任务、战斗、存读档和界面导航的玩家手册；给资料作者一份 MOD/内容包指南；将架构、数据、测试、发布和授权边界更新到 R47 实际状态。新增自动文档审计，作为代码实现防止关键手册、README 命令和发布包文档再次漂移。

## 用户故事

- 作为新玩家，我能不读源码就开始游戏、理解键位、主要面板、战斗、存档和遇到错误时的处理方式。
- 作为 MOD 作者，我能从空目录开始制作、校验、导入、启用、诊断并分享同名 JSON 覆盖或 v1 内容包。
- 作为维护者，我可以在 `npm run check` 中捕获缺文档、过期轮次/数量、无效命令、遗漏授权说明和版本包未收录手册等问题。

## 验收标准

1. 新增玩家手册和 MOD 指南，所有操作、键位、菜单、MOD 能力、内容包行为和故障提示由当前实现/Schema/命令支持，不假设代码中不存在的功能。
2. 修订架构/数据指南中 R31/R44 过时状态和绝对根路径表述，补入 R35 多层覆盖来源、R36 热重载安全边界、R37 包格式、R47 相对 URL/发布白名单/许可文本；用 manifest 与 schema 实际登记资源确认计数和字段。
3. `docs/REFERENCES.md` 对已分发的七项 production 运行依赖、五项工具链和 GitHub Actions 版本/许可证边界保持明确；声明无 LICENSE 和未核验原作/页面授权，不作商业授权推论。
4. 新增 `npm run audit:round-48-docs`：校验两份指南与 README 索引、最新项目轮次声明、指南中 `npm run` 命令、R47 静态包必带指南、R47 发布/引用授权声明；其正向/反向行为有测试，并接入 `npm run check`。
5. 版本打包实际携带玩家与 MOD 手册；`npm run package:release` 仍通过完整 check、生成 tarball、哈希并从解包目录完成子路径数据 smoke。
6. 更新 `CHANGELOG.md`、`DEVLOG.md`、`README.md`、`ROADMAP.md` 与文档索引；记录全量质量门槛、文档审计负向用例、R35–37/R47 smoke 和实际局限；提交 `round-48:` commit。

## 可验证子任务

1. **现状基线**：从输入源码/菜单/帮助、任务/数据加载、存档与打包协议提取可确认的玩家操作和 MOD 工作流事实。
2. **玩家与作者指南**：新建两份分层手册，含可复制命令、示例路径、实际控制与限制，并随 Web 版本包发布。
3. **架构/资料/授权复核**：更新架构和 DATA-GUIDE、README/References；逐项核对实现、Schema、`package.json`、runtime license notices 和相对 URL 的陈述。
4. **文档一致性门槛**：实现可测试的 Round 48 audit，接入 check，加入负向 fixture 并覆盖过期/无效条目边界。
5. **全量验证与提交**：运行 check/build/release package、相关 smokes、workflow/打包验证，记录结果并提交。

## 涉及文件

- 新增：`iterations/round-48/plan.md`、`docs/PLAYER-GUIDE.md`、`docs/MOD-GUIDE.md`、`scripts/audit-round-48-docs.mjs`、`scripts/lib/docs-audit-round-48.mjs`、类型声明、`tests/docs-audit-round-48.test.ts`。
- 修改：`scripts/package-release.mjs`、`scripts/smoke-round-47.mjs`、`package.json`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/RELEASE.md`、`docs/REFERENCES.md`、`docs/TESTING.md`、`README.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`。

## 风险

- 当前实现操作面很多；手册必须明确平台、画布大小/键位、焦点导航、鼠标限制、保存位置、静态 MOD 限制和未验证功能，不能把计划内容写成已有功能。
- 架构/DATA-GUIDE 篇幅大；本轮只根据实际 API 和数据修订，不以一次性重写引入未经验证承诺。
- 原作来源授权和项目自身 LICENSE 仍未确认；只能记录边界与随包的第三方 runtime notices，不能宣称获得商业再分发权。
- 目前没有 Git remote 或实际 Pages URL；文档继续标示为已准备、未发布，不能编造远端状态。

## 预计人类工程师工时

约 60–90 分钟：源码/资源核对 15–20 分钟；玩家与 MOD 手册 20–30 分钟；文档审计代码与负向测试 15–25 分钟；全量验证、包复测和提交 10–15 分钟。
