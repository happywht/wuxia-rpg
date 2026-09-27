# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R50）：`ROADMAP.md`
- 当前进度：**Round 10 完成；下一轮 Round 11（知识图谱与百科/对话条件接入）**

## 范围

- ✅ 已完成（R00–R10）：双区域网格世界支持 M 键舆图、E 键关口往返、JSON 区域事件与一次性去重；版本化 localStorage 存档恢复当前地图/坐标/已触发事件，并继续接受 Round 09 旧 v1 快照。此前角色、战斗、物品、任务、对话与设置闭环保留。
- ❌ 后续轮次：知识图谱、百科查询和对话条件接入，以及路线图中的后续玩法；正式 Vitest 基线仍排在 Round 38。
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

> Round 10 验证：`npm run build` 通过；Ajv 检查 manifest 下登记资料；浏览器手动验证 M 舆图/输入锁、关口往返、一次性事件去重、跨区保存/读档以及 Round 09 快照兼容。Phaser 主包 chunk 仍超过 500 kB 建议阈值；基础数据与 schema 位于 `data/`，启用 MOD 列表见 `data/base/manifest.json`，区域协议见 `docs/MAP-ATLAS.md`，存档协议见 `docs/SAVES.md`。

## 目录结构

```
├── index.html            # 入口页面
├── src/
│   ├── main.ts           # Phaser 启动与场景注册
│   ├── style.css         # 页面外壳样式
│   ├── engine/           # 网格地图、世界图、数据加载器、玩法规则与版本化存档引擎
│   └── game/             # 主菜单、网格探索、舆图、对话、战斗、暂停/设置及玩法面板
├── data/
│   ├── base/             # 原创世界数据及 manifest（含战斗、物品、商店、任务）
│   └── schema/           # 所有已登记数据族的 JSON Schema
├── mods/                 # mod 同名覆盖层（含未启用的 example）
├── docs/                 # 设计与规范文档
├── iterations/           # 逐轮计划（Round 00–Round 10）
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
| `docs/SAVES.md` | 本地存档与设置存储协议、恢复预检和兼容边界 |
| `docs/MAP-ATLAS.md` | 世界舆图、区域地图资源、关口、区域事件及占位校验 |

## 原创性与授权声明

- 本仓库所有世界内容为原创编写；研究来源仅以摘要 + 链接引用，历史站点内容许可证未验证（见 `docs/REFERENCES.md`）。
- 仓库内不含任何图片/音频素材，亦不含任何原作游戏文件。
