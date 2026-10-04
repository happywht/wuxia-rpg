# Web 版本构建、打包与部署

本项目输出静态 Web 游戏，不要求应用服务器、数据库或原作文件。构建依赖固定在 `package-lock.json`；发布目录由生产构建生成，避免直接打包开发工作区。

## 本地生成版本包

需要 Node.js ≥22.12、npm 与可用的 Git checkout：

```bash
npm ci
npm run package:release
```

该命令依次通过 `npm run check`、Vite 生产构建、非根路径静态资源/资料加载 smoke，再生成：

- `release/wuxia-rpg-web-<package.json version>.tgz`：可移植静态 Web 文件与必要说明；解压后把 `package/` 目录内容托管在任意 HTTP 静态主机即可。
- 同名 `.tgz.sha256`：归档文件本身的 SHA-256 校验值。
- 包内 `release-manifest.json`：格式版本、游戏版本、CI 源码提交（本地包为 `null`）以及每个被打包文件的字节数和 SHA-256。
- 根目录 `THIRD-PARTY-NOTICES.md`：从锁定 production dependency 树收集包名、版本、license 标识与其发行包随附的 LICENSE/NOTICE 正文。Pages workflow 将此文件一并上传，因此静态站点也在 `/THIRD-PARTY-NOTICES.md` 提供许可文本。

Round 50 另提供仓库验收命令 `npm run audit:final`。它需要完整 Git 历史以检查 R00–R50 的逐轮计划与提交，不是静态版本包构建前置项，也不进入 `npm run check`；当前check中的历史迁移保护同样要求完整Git历史；最终表格与本机实际结果见 [`FINAL-ACCEPTANCE.md`](FINAL-ACCEPTANCE.md)。

版本包从临时 staging 目录构成，文件白名单只允许构建后的 `index.html`、JS/CSS、基础资料、Schema、示例 MOD、第三方 notices、README 和发布/参考/原作边界/玩家/MOD 指南。包内发布说明也列出 [`PLAYER-GUIDE.md`](PLAYER-GUIDE.md) 与 [`MOD-GUIDE.md`](MOD-GUIDE.md)。打包器拒绝符号链接、遗漏运行文件、危险路径或清单外包内文件。不会把源代码、测试、依赖、Git 历史、本机 `.env` 或 `.serena/` 放进版本包。每个版本只覆盖 `release/` 中同版本的归档和 checksum；该输出目录不进入 Git。

此处产出的是学习/原型用 Web 构建，不代表 1.0 商业发行许可。当前没有单独的项目 LICENSE；版本包会按锁定的 production dependency 图携带所有运行时 npm 依赖的 license 元数据与 LICENSE/NOTICE 原文（`THIRD-PARTY-NOTICES.md`），但这不自动覆盖项目自身代码/资料或参考来源。上线或再分发前仍须按 [`REFERENCES.md`](REFERENCES.md) 检查来源授权并审阅项目代码/资料的授权政策。

## 静态主机约束

- 必须通过 HTTP(S) 提供文件；不要用 `file://` 打开，因为游戏按需 `fetch()` JSON 世界资料。
- 构建使用相对资源基址，支持域名根路径和仓库子路径；主机须原样保留目录结构与 `.json` 文件。
- 存档、设置和其他玩家状态保存在当前浏览器的 `localStorage`，不会随换浏览器或清除站点数据迁移。
- 本构建随包提供基础资料与 `mods/example/` 样例。浏览器静态版不允许用户在服务器上安装新 MOD；需要重新构建并部署 MOD 资料。
- Round281生产输出主 JS 约726 kB、独立 Phaser chunk 约1.375 MB；Vite 500 kB 提示不会阻止运行，后续可单独做分块优化。

## GitHub Pages 部署

仓库含 `.github/workflows/deploy-pages.yml`，但它**只响应手动 `workflow_dispatch`**，并要求布尔项 `confirm_publication` 明确勾选、运行 ref 是默认分支；普通 push/PR 不会发布。构建 job 先运行相同的版本包与路径 smoke，再把 `dist/` 上传为 Pages artifact，同时保留 `.tgz`/`.sha256` Actions artifact 30 天。deploy job 单独拿 Pages 写入与 OIDC 权限。

首次启用须在仓库 `Settings → Pages → Build and deployment → Source` 选择 **GitHub Actions**。随后到 `Actions → Build and Deploy GitHub Pages → Run workflow`，选择默认分支并勾选确认框才会公开站点。不要在未审阅资料授权、数据内容与目标仓库可见性的情况下确认发布。手动触发后，工作流环境输出会给出 Pages URL；失败时优先检查 Actions 两个 job 的日志与 Pages source 设置。

本地工作区当前没有配置 Git remote，因此本轮只验证本机路径、包与 workflow 文本；没有远端 workflow run、GitHub Pages URL 或已发布站点证据。

## 取消或回滚

重新运行部署 workflow 可把默认分支上的新构建发布到 Pages。要停止继续发布，在仓库 Pages 设置中改回其他发布源或关闭 Pages，并禁用 `deploy-pages.yml` workflow；删除当前站点需在仓库 Pages 设置中执行。该操作会影响公开站点，本地开发脚本不会替维护者执行。

## Round279 历史核验状态

GitHub https://github.com/happywht/wuxia-rpg 已上传至 Round278（51f3355）；round278-baseline 为预发布源码基线，未部署 Pages。初次隔离发行验证失败，后续证实原始LF七组130/132通过，两个遗漏历史基线核验补入后12/12通过。尚需完整干净 package:release，不能声称稳定包通过。

## Round281：锁定源码与干净复现

完整回归包含历史迁移保护，构建需完整Git历史；裸源码归档及默认浅克隆不能代替干净Git checkout。CI两工作流设置fetch-depth: 0。先git clone、checkout完整候选SHA、npm ci；设置GITHUB_SHA为同一SHA后执行npm run package:release。打包成功后将tgz解包到独立目录，执行 `node scripts/verify-release-candidate.mjs <package目录> <完整候选SHA>`，独立核对来源SHA、全部文件字节数与哈希、额外文件及关键运行文件。不能信任仅显示版本号的包；本地默认sourceCommit=null的便捷包不满足锁定候选验收。

当前冻结发行候选为bf0e8d70f608816c7ed0127e540c39a0d4cc0268；Round281已独立解包实启及开局存读，Round282已从正常新游戏实走至F1共同父。完整同候选双侧后程与真人时长未验，不得宣布稳定发行。

## Round281 当前增量证据

干净Git候选bf0e8d70f608816c7ed0127e540c39a0d4cc0268（2280b58加7项工程文件，src/data零差异）完整package:release退出0：199文件1794测试、102资源Schema/MOD/类型/两文档审计/生产chunk审计/166文件归档与子路径HTTP smoke通过。修复R103/R104强制CRLF改写及R279沙盒固定CRLF，两CI改全历史checkout；首次失败日志保留。新增独立源码SHA/逐文件大小哈希/额外文件校验CLI与5项测试。

独立解包端口5311正常新游戏抄书学徒，E接茶棚凉汤，左移1格到42,37，向下受地形阻挡未移动（世界08:01）；正常空槽一保存18:18:50，刷新标题Continue读回，B核对Lv1/83命53气/120银/膏2丸1/旧残篇1，Q凉汤active0/4未结算。无QA导入、赠品或隐藏状态写入，发行JS无工作台。此为开局启动检查点，不是完整J0或P1旅程。

发行归档1545656字节，SHA256514105af8bcd8eeaebd7826f7f6b09037566ad1307d90ff818642ffc0985444b；来源另以round281-verification标签绑定，主round提交包括补充证据/文档/CI配置，不能把不同提交冒充同一包。完整同候选新游戏到C1与关键选择两侧、真人60—90分钟仍待；P1未放行，P2不启动。

验证预发布：https://github.com/happywht/wuxia-rpg/releases/tag/round281-verification 。非完整旅程稳定发行；Pages未部署。
