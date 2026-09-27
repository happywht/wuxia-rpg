# Round 39 计划：构建期校验与 CI 质量门槛

## 本轮目标

把现有数据、MOD、类型、单元测试和文档审计组成统一质量门槛；生产构建先通过该门槛再打包；新增 GitHub Actions 持续集成，在 Node 22 上安装锁文件依赖并执行质量门槛与近期关键回归烟测。同步修正 README 的过期进度与命令说明。

## 用户故事

- 作为开发者，我希望用一个命令运行资料校验、类型检查、自动化测试和文档审计，以便提交前快速发现回归。
- 作为内容作者，我希望生产构建前检查基础资料和已启用 MOD，避免不合格资料进入构建产物。
- 作为协作者，我希望每次推送和 Pull Request 自动运行同一套门槛，避免把破坏性改动合入主线。

## 验收标准

1. 新增 `npm run check`，顺序执行基础资料 Schema 校验、启用 MOD 校验、严格类型检查、Vitest 与文档一致性审计；任一失败都应使命令非零退出。
2. `npm run build` 先运行 `check`，质量门槛失败时不得开始 Vite 生产构建。
3. 新增 GitHub Actions workflow：使用 `npm ci` 和 Node 22，在 push、pull request（及手动触发）时运行完整构建质量门槛与 Round 35–37 回归烟测；配置只读仓库权限并设超时。
4. README 和 `docs/TESTING.md` 反映当前 R39 完成态、下一轮 R40、Vitest 5 及统一验证命令；在 `docs/REFERENCES.md` 记录所用 Actions 官方来源与用途。
5. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`，记录真实命令、结果、CI 无法在本地触发的限制和下轮建议。
6. 本轮独立提交，提交信息以 `round-39:` 开头。

## 子任务

1. 编排 `check` 与 `build` 脚本，确认基础资料、已启用 MOD、TypeScript、测试和文档审计均进入质量门槛，失败能中止后续阶段。
2. 新增 GitHub Actions 工作流，设置 Node 22、npm 缓存、`npm ci`、只读权限、超时和近三轮回归烟测。
3. 更新 README、测试规范、来源登记、开发日志和路线图；在本机运行完整门槛、生产构建及 CI 中的烟测命令，检查 workflow 结构后提交。

## 涉及文件

- `package.json`
- `.github/workflows/quality-gates.yml`
- `README.md`、`docs/TESTING.md`、`docs/REFERENCES.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`
- `iterations/round-39/plan.md`

## 风险

- `inspect:mods` 当前只读校验 manifest 中启用的 MOD 覆盖，不等于审计所有未启用目录；本轮应准确说明其覆盖边界，并继续用 Round 37 包烟测验证内容包路径。
- GitHub 托管 Actions 无法在本机真实调度；本机可以验证工作流包含的命令，CI 实际运行情况需后续查看 GitHub workflow 状态。
- 主构建已有大 JS chunk 的非阻断提示；本轮不改变运行时打包策略，只将提示如实记录。

## 预计人类工程师工时

约 2–3 小时；包含质量门槛编排、CI 工作流、文档校正、门槛故障路径核对和回归验证。

## 实施记录（2026-09-28）

实际涉及文件：`package.json`、`.github/workflows/quality-gates.yml`（新增）、`README.md`、`docs/TESTING.md`、`docs/REFERENCES.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、本文件。README 与路线图已更新为 **R39 已完成 / 下一轮 R40**。

验证与限制：check/build 门槛及构建失败中止均已本机实证；工作流由预装 PyYAML 解析并通过结构断言；本机 check/build/R35–37 烟测通过。尚未发生 GitHub 托管 workflow 运行，首次远端结果需推送后确认。
