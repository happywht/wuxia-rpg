# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R50）：`ROADMAP.md`
- 当前进度：**Round 01 完成；下一轮 Round 02（数据加载器、正式 Schema 校验与事件总线）**

## 范围

- ✅ 已完成（R00–R01）：可构建工程、设计基线、数据驱动网格地图、方向键/WASD 单格移动、墙体与边界碰撞；缺失或无效地图会显示可读错误。
- ❌ 后续轮次：通用数据加载器、正式 JSON Schema 校验与事件总线（Round 02 起）；测试基线（Round 38 起）。Round 01 仅对地图契约做必要的运行时结构检查。
- 永久边界：不做多人联网；不含原作内容；mod 仅限同名 JSON 覆盖（见 `docs/DATA-GUIDE.md`）。

## 技术栈（版本已核验并冻结，见 `docs/ADR.md`）

| 依赖 | 版本 | 说明 |
|---|---|---|
| TypeScript | `^5.9.3` | 5.x 成熟线；升 6/7 另立 ADR |
| Phaser | `^4.2.1` | 官方 v3.90 已宣告"很可能为 v3 末版"，活跃线在 v4 |
| Vite | `^8.3.1` | 要求 Node `^20.19.0 \|\| >=22.12.0` |
| Ajv（后续） | `^8.20.0` | R02 接入数据校验 |
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

> Round 01 验证：`npm run build` 与浏览器手动操作已成功；生产构建提示 Phaser 主包 chunk 超过 500 kB，后续性能/打包轮次再评估拆分。地图 JSON 位于 `data/base/maps/round-01-grid.json`，由 Vite 作为静态文件发布。

## 目录结构

```
├── index.html            # 入口页面
├── src/
│   ├── main.ts           # Phaser 启动与场景注册
│   ├── style.css         # 页面外壳样式
│   ├── engine/           # 通用网格地图协议、校验查询与渲染
│   └── game/              # 网格移动切片场景
├── data/
│   ├── base/             # 原创世界数据；当前含 Round 01 网格地图 JSON
│   └── schema/           # JSON Schema 契约（R02 起）
├── mods/                 # mod 同名覆盖层（R02 起）
├── docs/                 # 设计与规范文档
├── iterations/           # 逐轮计划（Round 00、Round 01）
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
