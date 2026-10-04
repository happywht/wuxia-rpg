# 江湖见闻 · 数据驱动武侠 RPG

当前状态唯一入口：[验收矩阵](docs/CURRENT-ACCEPTANCE.md)。开发严格按「代表旅程 → 12项差事 → 成长路线与制作 → 信息与美术 → 持续QA与同版交付」推进，见 [执行方案](docs/PRODUCT-POLISH-PLAN.md) 与 [项目目标](docs/PROJECT-GOALS.md)。历史证据见 [DEVLOG](DEVLOG.md)，不能用数量或旧测试通过代替当前产品验收。

## 启动

```powershell
npm ci
npm run dev
```

访问终端显示的本地地址。TypeScript + Phaser 4 + Vite；具体人物、地图、任务、对白和图谱来自 `data/base/`，经过 JSON Schema 与运行时语义校验。技术决策见 [ADR](docs/ADR.md)。

## 常用操作

| 操作 | 键位 |
| --- | --- |
| 网格移动 | 方向键（其他布局在设置中选择） |
| 交易、差事名录、关口、工位 | E，邻接对象按画面提示 |
| 直接交谈与明确交付 | F |
| 任务、背包 | Q、B |
| 舆图、地区人物/补给/出区 | M、R |
| 门派、武学 | J、U |
| 暂停、保存、设置 | Esc |

详细流程与其他系统见 [玩家指南](docs/PLAYER-GUIDE.md)。主菜单可新建角色、继续存档及调整设置。

## 独立 QA

```powershell
npm run dev:qa
```

打开 `http://127.0.0.1:5310/?qa=journey-20261004`。此开发运行隔离存档与设置，F8工作台只导出正常保存的槽位；跨角色导入须审阅，之后从标题正常读回。规则、阶段检查点与证据见 [QA指南](docs/QA-CHECKPOINTS.md)。完整旅程与互斥双侧仍按矩阵逐段验收。

## 验证与构建

```powershell
npm run check
npm run build
npm run preview
```

`check`执行基础资源、MOD、类型、测试与文档审计；`build`通过检查后构建正式包。每轮受影响的验证命令、实走记录和提交保存在 `iterations/round-XX/`。发行打包与子路径验证见 [发布说明](docs/RELEASE.md)。

## 资料与文档

- [当前验收矩阵](docs/CURRENT-ACCEPTANCE.md)、[五阶段执行方案](docs/PRODUCT-POLISH-PLAN.md)、[规模与产品判断](docs/CURRENT-STATE-AUDIT.md)
- [架构](docs/ARCHITECTURE.md)、[资料规范](docs/DATA-GUIDE.md)、[MOD指南](docs/MOD-GUIDE.md)
- [游戏设计](docs/GDD.md)、[世界设定](docs/WORLD-SETTING.md)、[地图](docs/MAP-ATLAS.md)、[任务](docs/QUESTS.md)、[对白规范](docs/DIALOGUE-GUIDE.md)
- [素材与调研来源](docs/REFERENCES.md)、[历史Round50验收](docs/FINAL-ACCEPTANCE.md)
- [路线图](ROADMAP.md)、[变更日志](CHANGELOG.md)、[开发日志](DEVLOG.md)

引擎通用规则位于 `src/engine/`，游戏装配位于 `src/game/`，可替换资料在 `data/base/`；同名整文件MOD覆盖与失败回退见MOD指南。地图使用已登记合法像素图集，许可范围与历史来源边界以REFERENCES为准。当前旅程、资料趣味性和场景维护性继续迭代，不宣称所有系统已经成熟。
