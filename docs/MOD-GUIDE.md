# MOD 与内容包作者指南

当前 MOD 是仓库/静态发布构建中的**同路径 JSON 整文件覆盖**。它不提供浏览器内下载或安装按钮，也不会把任意新文件自动加入世界；资源 id、目标路径和 Schema 由 `data/base/manifest.json` 登记。字段级合并、脚本插件和任意代码执行均不属于支持协议。

## 1. 建立覆盖层

在仓库副本中创建 `mods/<modId>/`，其中 `<modId>` 是安全的一级目录名。目录结构镜像 `data/base/`，文件路径从 `data/base/` 内部开始。例如：

```text
data/base/maps/round-01-grid.json
mods/my-map/maps/round-01-grid.json
```

后一个文件整体覆盖前一个文件，必须保持同一资源形状并通过 manifest 指定的 Schema。`mods/example/` 是未启用的示例层，可用来查看覆盖布局。不要在 MOD 目录放未登记资源、可执行脚本或符号链接。

## 2. 启用、排序与热重载

在 `data/base/manifest.json` 的 `enabledMods` 数组中按优先级列出一级目录名，例如：

```json
"enabledMods": ["low-priority", "my-map"]
```

后声明且通过校验的覆盖优先；缺失的覆盖文件会跳过。Schema 或语义无效的覆盖会回退到上一有效层，不会破坏当前世界。编辑资料后，运行中的开发服务器会触发安全资料重载；移动、战斗或面板处理期间会等到安全边界，不会整页刷新。已打包的静态版没有开发热重载，更新后须重新构建和部署。

## 3. 校验、诊断与分享

提交前执行：

```bash
npm run validate:data
npm run inspect:mods
npm run check
```

`validate:data` 检查基础 manifest 与基础资料；`inspect:mods` 按启用顺序检查覆盖 Schema、文件路径、最终来源和拒绝原因，但不替代运行时跨资源语义装配。启动 `npm run dev` 后，游戏内 F2 面板可查看实际生效顺序、每项资源来源及诊断。跨资源引用、坐标、占位冲突等仍须在游戏运行时检查。

要将已有 `mods/<modId>/` 导出为 v1 `.wuxia.json` 内容包：

```bash
npm run content:export -- --mod <modId> --out <包名>.wuxia.json
npm run content:import -- <包名>.wuxia.json
npm run content:import -- <包名>.wuxia.json --apply
```

导入默认只读预检；`--apply` 会先验证整包，再安装到 `mods/<包id>/` 的新目录，不覆盖已有目录、不改基础 manifest、不自动启用。安装后仍要手动启用并运行 `inspect:mods` 与游戏内检查。内容包只携带 manifest 已登记的资源，不含安装路径；更详细的格式、兼容策略、安全约束与故障说明见 [`CONTENT-PACKAGES.md`](CONTENT-PACKAGES.md)。

## 4. 发布与限制

静态 Web 版本只能使用构建时已包含的 MOD；要分发覆盖资料，先在受控仓库副本启用并校验，再运行：

```bash
npm run build
npm run package:release
```

不要把来源授权不明的图片、音乐、原作内容或可执行代码装入 MOD/发布包。本仓库没有单独的项目 `LICENSE`；npm 运行依赖的 notices 不替项目代码、原创资料或研究来源授权。来源与边界以 [`REFERENCES.md`](REFERENCES.md) 及 [`RELEASE.md`](RELEASE.md) 为准。

## 排错

- **检查器说资源未登记**：只可覆盖已有 manifest 路径；先核对相对路径，不要把 `data/base/` 前缀重复写入 MOD 目录。
- **Schema 通过但运行中仍被禁用**：查看 `npm run dev` 控制台或 F2，修复跨资源引用、地图坐标或占位问题。
- **MOD 没有生效**：确认其一级 id 已按预期顺序写入 `enabledMods`；导入内容包不会代替启用步骤。
- **内容包安装目标已存在**：导入器不会覆盖目录；人工备份并移动冲突目录后再预检/安装。
- **浏览器版无法加载新 MOD**：静态包没有浏览器安装能力；更新仓库资料、重新打包并部署。

## Round 106 更新

world-map可省略regionGuides；每条mapResourceId/role(hub/investigation/challenge/transit)/advice(≤240字)闭合Schema，结构失败拒绝该资料，重复/坏地图引用隔离单条指南。R目录从实际NPC、有效商店、库存、任务与关口导出，MOD不必手抄坐标；不推断隐藏地标。

## Round 107 可选敌方循环

覆盖既有battle资源时可添加enemy.behavior，规则见DATA-GUIDE.md；省略保持旧AI。必须把artId也放入该enemy.martialArtIds，武学须实际存在，cue不能代替真实效果。powerBonus仅attack有效；guardDisruptsBonus:true需正bonus，使现有守御先卸额外蓄势。数据结构失败拒绝资源，装配坏引用隔离遭遇；调用validate:data后仍需实际测试内力不足回退与战斗预告。不增加存档版本或持久化战斗中间状态。
