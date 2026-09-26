# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R50）：`ROADMAP.md`
- 当前进度：**Round 08 完成；下一轮 Round 09（新游戏/存档）**

## 范围

- ✅ 已完成（R00–R08）：在任务系统之上新增数据驱动对话条件与效果：选项按任务状态、物品数量、善恶/声望/NPC 关系条件过滤显示，确认时原子执行接取/放弃任务、给予/交付物品、修善良恶/声望/关系；Phaser 无关社会状态引擎提供范围钳制，任务发布人保留任务名录并新增 F 键交谈入口。此前系统行为保留。
- ❌ 后续轮次：存档及其余玩法按路线图逐轮实现；测试基线（Round 38 起）。
- 永久边界：不做多人联网；不含原作内容；mod 仅限同名 JSON 覆盖（见 `docs/DATA-GUIDE.md`）。

## 技术栈（版本已核验并冻结，见 `docs/ADR.md`）

| 依赖 | 版本 | 说明 |
|---|---|---|
| TypeScript | `^5.9.3` | 5.x 成熟线；升 6/7 另立 ADR |
| Phaser | `^4.2.1` | 官方 v3.90 已宣告"很可能为 v3 末版"，活跃线在 v4 |
| Vite | `^8.3.1` | 要求 Node `^20.19.0 \|\| >=22.12.0` |
| Ajv | `^8.20.0` | R02 起校验 manifest、基础资源与 MOD |
| `@types/node` | `^26.6.3` | Vite MOD 静态分发插件的开发期类型 |
| Vitest（后续） | `^4.1.11` | R38 接入测试 |

## 前提条件

- **Node.js ≥ 22.12**（Vite 8 的 engines 要求；本仓库已在 `package.json` 声明 `engines.node`）。
- npm ≥ 10（随 Node 22 附带即可）。

## 安装与命令

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 类型检查（tsc --noEmit）+ 生产构建
npm run preview    # 预览生产构建
npm run typecheck  # 仅类型检查
```

> Round 08 验证：`npm run build`、对话/Schema 临时冒烟检查（42 项）及主代理补充的组合事务回归（13 项）与浏览器手动验收通过：条件分支按任务/关系状态渐进显示、对话接取/交付/带话等效果即时反馈、重复或失败组合零变更、任务名录与交谈双入口共存。社会状态、任务与对话进度目前仅在内存中，刷新后重置，存档安排在 Round 09。Phaser 主包 chunk 仍超过 500 kB 建议阈值；基础数据与 schema 位于 `data/`，启用 MOD 列表见 `data/base/manifest.json`。

## 目录结构

```
├── index.html            # 入口页面
├── src/
│   ├── main.ts           # Phaser 启动与场景注册
│   ├── style.css         # 页面外壳样式
│   ├── engine/           # 网格地图、数据加载器、事件总线、NPC/对话、成长、战斗、物品、任务与社会状态引擎
│   └── game/             # 网格探索、对话、战斗、背包、商店与任务面板
├── data/
│   ├── base/             # 原创世界数据及 manifest（含战斗、物品、商店、任务）
│   └── schema/           # 所有已登记数据族的 JSON Schema
├── mods/                 # mod 同名覆盖层（含未启用的 example）
├── docs/                 # 设计与规范文档
├── iterations/           # 逐轮计划（Round 00–Round 08）
├── ROADMAP.md            # R00–R50 路线图
├── CHANGELOG.md          # 变更日志
└── DEVLOG.md             # 开发日志（含核验记录）
```

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/GDD.md` | 工作标题与设定、平台与视觉、核心循环、范围边界、新系统、里程碑 |
| `docs/ADR.md` | 技术决策记录与版本冻结总表 |
| `docs/REFERENCES.md` | 研究来源清单、授权/使用边界声明 |
| `docs/ORIGINAL-FIDELITY.md` | 原作系列原则（有证据）/ 用户目标 / 新扩展 三组对照 |
| `docs/ARCHITECTURE.md` | 分层架构、缺数据降级、校验、mod 覆盖、热重载规划 |
| `docs/DATA-GUIDE.md` | 数据目录规范、命名约定、mod 覆盖规则 |

## 原创性与授权声明

- 本仓库所有世界内容为原创编写；研究来源仅以摘要 + 链接引用，历史站点内容许可证未验证（见 `docs/REFERENCES.md`）。
- 仓库内不含任何图片/音频素材，亦不含任何原作游戏文件。
