# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R62）：`ROADMAP.md`
- 当前进度：**Round 62 已完成；下一轮 Round 63**

## 范围

- ✅ 已完成（R00–R62）：网格探索、任务/物品/战斗与存档闭环；五派师门、昼夜天气、NPC 日程、伙伴、擂台、门派战、自创武学、经脉内修、锻造炼丹、多结局、成就与图鉴。R51–57 接入 Kenney 官方 CC0 像素素材、可移动百格地图与多区舆图路线；R58–61 扩充区域差事、对白回声和动态占位路线审计；R62 新增第三块 100×100 铁嶂北道地图、驿镇人物/发现/遭遇/三段任务链，并核验三图关口与七时段任务路线。基础资料现含 14 名 NPC、5 个门派、43 项任务、51 件物品、30 种武学、195 个知识节点/305 条关系；当前 manifest 有 28 项资源和 26 份 Schema。Round 50 历史审计核对了 R00–R50 的计划与提交；各轮专项、全量测试和发行验证见 `DEVLOG.md`。
- ⏭ 下一轮 R63 继续迭代可玩世界与系统；远端发布、物理手柄和外部公测仍未验证，不作为已完成事实；规划见 `ROADMAP.md`。**整个产品目标仍在推进中。**
- 永久边界：不做多人联网；不含原作内容；mod 仅限同名 JSON 覆盖（见 `docs/DATA-GUIDE.md`）。

## 技术栈（版本已核验并冻结，见 `docs/ADR.md`）

| 依赖 | 版本 | 说明 |
|---|---|---|
| TypeScript | `^5.9.3` | 5.x 成熟线；升 6/7 另立 ADR |
| Phaser | `^4.2.1` | 官方 v3.90 已宣告"很可能为 v3 末版"，活跃线在 v4 |
| Vite | `^8.3.1` | 要求 Node `^20.19.0 \|\| >=22.12.0` |
| Ajv | `^8.20.0` | R02 起校验 manifest、基础资源与 MOD |
| `@types/node` | `^26.6.3` | Vite MOD 静态分发插件的开发期类型 |
| Vitest | `^5.0.2` | R38 起自动化测试；R39 进入 `check` 门槛与 CI |

## 前提条件

- **Node.js ≥ 22.12**（Vite 8 的 engines 要求；本仓库已在 `package.json` 声明 `engines.node`）。
- npm ≥ 10（随 Node 22 附带即可）。

## 安装与命令

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run check      # 统一质量门槛：资料/MOD/类型/测试/round-34 与 round-48 文档审计，任一失败即中止
npm run build      # 先完整通过 npm run check，再执行 Vite 生产构建
npm run preview    # 预览生产构建
npm run package:release # 质量门槛、生产构建、非根路径烟测、白名单版本包与 SHA-256
npm test           # Vitest 自动测试（不含基准；当前全量结果见 DEVLOG.md）
npm run benchmark:round-40 # 性能/内存基准（渲染对象数与耗时、按 manifest 装载、50 轮长跑堆观察；与 npm test 隔离）
npm run generate:round-55-ferry # 确定性重建 100×100 雾雨渡口十层 CC0 地图图层与碰撞网格（保留关口/事件/日程/遇怪锚点）
npm run generate:round-62-iron-ridge # 确定性重建 100×100 铁嶂北道八层 CC0 地图与碰撞网格（保护玩法锚点）
npm run typecheck  # 仅类型检查（tsc --noEmit，严格模式）
npm run validate:data # 校验 manifest 登记的基础资料/schema
npm run inspect:mods  # 只读检查已启用 MOD 的覆盖层/最终来源与修复提示
npm run content:export -- --mod <modId> # 把传统 MOD 导出为单文件 v1 内容包（.wuxia.json）
npm run content:import -- <file.wuxia.json> [--apply] # 内容包只读预检；--apply 安装到 mods/ 新目录（不启用）
npm run smoke:round-22 # 自创武学规则、战斗与存档冒烟
npm run smoke:round-23 # 经脉内修规则、战斗、资料与存档冒烟
npm run smoke:round-24 # 装备锻造、占位/配方隔离、战斗与存档冒烟
npm run smoke:round-25 # 药方发现、悟性品质炼制、原子交易与存档冒烟
npm run smoke:round-33 # 知识图谱目录覆盖与结局关系闭环
npm run smoke:round-35 # MOD 优先级、来源报告与坏覆盖回退冒烟
npm run smoke:round-36 # Vite JSON 热重载通知、场景桥接与生产剔除冒烟
npm run smoke:round-37 # 内容包导出/预检/安装往返与攻击性输入冒烟
npm run smoke:round-42 # 主线章节/互斥分支/两条结局的专项集成测试
npm run smoke:round-43 # 漫游事件协议与五派资格支线集成测试
npm run smoke:round-44 # NPC 日程邻近事件、声望奖励与双分支集成测试
npm run smoke:round-46 # 真实资料纵向切片与多结局路线集成测试
npm run smoke:round-47 # 校验版本归档/逐文件哈希及子路径资料加载
npm run audit:round-34 # 地图、对白、任务及世界设定文档一致性审计
npm run audit:round-48-docs # 玩家/MOD 指南、命令、现状、许可及发布包文档一致性审计
npm run audit:final # 完整 Git 历史上的 R00–R50 计划/提交、内容数量、Schema/MOD/文档最终审计
```

### 持续集成（Round 39 起）

`.github/workflows/quality-gates.yml` 在每次 push、pull request 及手动触发（workflow_dispatch）时运行：Node 22 + `npm ci`（锁文件精确安装，npm 缓存）→ `npm run build`（内含完整 check 门槛与生产构建）→ Round 35–37 回归烟测。权限仅 `contents: read`，15 分钟超时，无任何部署/发布步骤。CI 与本地门槛完全同源；本轮仅完成本机验证，托管运行状态以 GitHub Actions 页面为准。

> Round 10 验证：`npm run build` 通过；Ajv 检查 manifest 下登记资料；浏览器手动验证 M 舆图/输入锁、关口往返、一次性事件去重、跨区保存/读档以及 Round 09 快照兼容。Phaser 主包 chunk 仍超过 500 kB 建议阈值（非阻断）；基础数据与 schema 位于 `data/`，启用 MOD 列表见 `data/base/manifest.json`（覆盖顺序后声明者优先，改后重进游戏生效；游戏内 F2 查看顺序/来源/诊断，提交前跑 `npm run inspect:mods`，工作流见 `docs/DATA-GUIDE.md` §5），区域协议见 `docs/MAP-ATLAS.md`，存档协议见 `docs/SAVES.md`。

## 目录结构

```
├── index.html            # 入口页面
├── src/
│   ├── main.ts           # Phaser 启动与场景注册
│   ├── style.css         # 页面外壳样式
│   ├── engine/           # 网格地图、世界图、数据加载器、玩法规则与版本化存档引擎
│   └── game/             # 主菜单、网格探索、舆图、对话、战斗、暂停/设置及玩法面板
├── data/
│   ├── base/             # 原创世界数据及 manifest（含知识图谱）
│   └── schema/           # 所有已登记数据族的 JSON Schema
├── mods/                 # mod 同名覆盖层（含未启用的 example）
├── docs/                 # 设计与规范文档
├── tests/                # Vitest 自动测试（R38 起，含 R42 主线集成）与性能基准（*.bench.ts，R40 起）
├── iterations/           # 逐轮计划（Round 00 起逐轮推进）
├── ROADMAP.md            # R00–R62 路线图
├── CHANGELOG.md          # 变更日志
└── DEVLOG.md             # 开发日志（含核验记录）
```

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/GDD.md` | 工作标题与设定、平台与视觉、核心循环、范围边界、新系统、里程碑 |
| `docs/ADR.md` | 技术决策记录与版本冻结总表 |
| `docs/RELEASE.md` | 静态版本包、部署、安全门控与回滚指南 |
| `docs/PLAYER-GUIDE.md` | 开局、探索、面板、战斗、存档与常见问题玩家手册 |
| `docs/MOD-GUIDE.md` | 同路径 MOD、Schema 校验、热重载、内容包导入/导出与发布边界 |
| `docs/PLAYTEST-FEEDBACK.md` | Round 49 公测前手测发现、修复状态与后续反馈模板 |
| `docs/FINAL-ACCEPTANCE.md` | Round 50 硬性验收矩阵、浏览器纵向流程与证据边界 |
| `docs/REFERENCES.md` | 研究来源清单、授权/使用边界声明 |
| `docs/ORIGINAL-FIDELITY.md` | 原作系列原则（有证据）/ 用户目标 / 新扩展 三组对照 |
| `docs/ARCHITECTURE.md` | 分层架构、缺数据降级、校验、MOD 覆盖、热重载与版本发布边界 |
| `docs/DATA-GUIDE.md` | 数据目录规范、命名约定、MOD 覆盖规则与当前资料状态 |
| `docs/KNOWLEDGE-GRAPH.md` | 图谱节点/关系、见闻解锁、百科与对话接入 |
| `docs/DIALOGUE-GUIDE.md` | 对白资料协议：节点图、条件（含时段）、原子效果与引用隔离 |
| `docs/CLIMATE.md` | 季节/天气资源协议、确定性日天气、画面表现与行动耗时 |
| `docs/NPC-SCHEDULES.md` | NPC 时段日程资料契约、冲突优先级、回退与跨区域/存档规则 |
| `docs/SAVES.md` | 本地存档与设置存储协议、恢复预检和兼容边界 |
| `docs/MERIDIANS.md` | 经脉节点资料、修为奖励、材料消耗与效果规则 |
| `docs/EQUIPMENT-FORGING.md` | 锻造工位/配方资料、原子交易、强化约束与存档兼容 |
| `docs/ALCHEMY.md` | 药方发现、悟性品质炼制、数据协议与存档兼容 |
| `docs/MAP-ATLAS.md` | 世界舆图、区域地图资源、关口、区域事件及占位校验 |
| `docs/WORLD-SETTING.md` | 原创世界设定汇编：背景、区域地理、五派格局、药道会盟与叙事边界（数据为证） |
| `docs/ACCESSIBILITY.md` | 无障碍/输入选项：六项设置的作用范围、手柄标准映射、高对比度画布滤镜与减少动态呈现的边界（R41 起） |

## 原创性与授权声明

- 本仓库所有世界内容为原创编写；研究来源仅以摘要 + 链接引用，历史站点内容许可证未验证（见 `docs/REFERENCES.md`）。
- 仓库内不含任何图片/音频素材，亦不含任何原作游戏文件。
