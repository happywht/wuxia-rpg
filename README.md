# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R50）：`ROADMAP.md`
- 当前进度：**Round 04 完成；下一轮 Round 05（数据驱动的回合制战斗最小闭环）**

## 范围

- ✅ 已完成（R00–R04）：可构建工程、设计基线、数据驱动网格地图与移动、manifest 资料加载、Ajv JSON Schema 校验、typed EventBus、同路径 MOD 覆盖、数据驱动 NPC 放置与占用格阻挡、E 键四方向邻接交谈、可分支的键盘对话 UI，可选内容（NPC/对话）故障隔离——坏资料只禁用相应人物并告警，地图保持可玩；以及 Phaser 无关的角色成长引擎：五项核心属性（body/force/agility/insight/resolve）协议、1 份初始角色模板、3 个原创门派与 6 种原创武学 JSON 资料（名称、宗旨、门槛、经验曲线与生命/内力派生公式全部来自数据）、防御性解析与重复 id/门派引用校验（坏引用只禁用涉事武学）、累计经验阈值升级（支持跨级与属性上限封顶）和按等级/属性/门派的武学习得资格判定。
- ❌ 后续轮次：战斗、物品、任务及其余玩法按路线图逐轮实现；测试基线（Round 38 起）。
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

> Round 04 验证：`npm run build` 通过（83 模块）；引擎纯逻辑与 schema 共 83 项临时 Node 冒烟检查通过；生产构建浏览器回归确认有效资料零警告、坏门派/武学资料只警告不阻断地图。生产构建提示 Phaser 主包 chunk 超过 500 kB，后续性能/打包轮次再评估拆分。基础数据与 schema 位于 `data/`，启用 MOD 列表见 `data/base/manifest.json`。

## 目录结构

```
├── index.html            # 入口页面
├── src/
│   ├── main.ts           # Phaser 启动与场景注册
│   ├── style.css         # 页面外壳样式
│   ├── engine/           # 网格地图、数据加载器、事件总线、NPC/对话与角色成长引擎
│   └── game/             # 网格移动切片场景
├── data/
│   ├── base/             # 原创世界数据及 manifest（地图、NPC、对话、角色模板、门派、武学）
│   └── schema/           # manifest、网格地图、NPC、对话、角色模板、门派、武学 JSON Schema
├── mods/                 # mod 同名覆盖层（含未启用的 example）
├── docs/                 # 设计与规范文档
├── iterations/           # 逐轮计划（Round 00–Round 04）
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
