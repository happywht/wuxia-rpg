# wuxia-rpg —《墨痕江湖》（工作标题）

一款**原创**中文武侠 RPG：数据优先架构，TypeScript + Phaser 4 + Vite。本项目受文曲星系列掌上武侠 RPG 的**广泛玩法原则**（自由探索、NPC 交互、道德选择、成长与武学）启发，是独立新作——**不包含任何原作游戏的角色、地名、对话、剧情、源代码或美术/音频素材**。对照与证据分级见 `docs/ORIGINAL-FIDELITY.md`。

- 设计文档：`docs/GDD.md`
- 逐轮路线图（R00–R84+）：`ROADMAP.md`
- 当前进度：**Round 84 已完成；下一轮 Round 85**。整个产品目标仍在推进中。

## 范围

- ✅ 已完成（R00–R84）：网格探索、任务/物品/战斗与存档闭环；五派师门、昼夜天气、NPC 日程、伙伴、擂台、门派战、自创武学、经脉内修、锻造炼丹、多结局、成就与图鉴。R81 将可移动舆图扩至 336×224；R82 新增东溟海岸百格地图；R83 为青帆埠加入时辰居民、补给商店、可重试战斗与潮汐任务；R84 将舆图扩至 384×256，并新增可从海岸往返进入的风回岛、守灯人和灯影探索任务。基础资料现含 21 名 NPC、5 个门派、51 项任务、52 件物品、30 种武学、250 个知识节点/356 条关系；manifest 有 52 项资源。Round 50 历史审计核对了 R00–R50 的计划与提交；各轮专项、全量测试和发行验证见 `DEVLOG.md`。
- 🧭 Round 72：在隔离浏览器中按实时舆图回到渡口、绕过动态 NPC 阻挡，实际选择「行舟万里」并显示尾声，再返回主菜单。应用入口与 Phaser 分块独立缓存，入口约 571 KB；两块在启动时都会加载，合计 gzip 没有下降。实测范围与截图见 [`docs/ROUND-72-BROWSER-PLAYTEST.md`](docs/ROUND-72-BROWSER-PLAYTEST.md)。
- 🧭 Round 73：修正 M 舆图按静态格寻路、HUD 却考虑动态占位造成的路线矛盾；以渡口第二日子夜白鹭洲 `(4,4)` 与黄昏 `(3,4)` 的实际日程资料回归绕行结果。导航只给提示，不替玩家走格或过关。
- 🧭 Round 74：穿过铁嶂北道南隘进入云岭古道，沿 CC0 山地瓦片搭建新的百格可玩地图；全域舆图扩展到五区，并新增沈雨霁、刻痕调查与悬桥清障任务链。浏览器操作记录见 [`docs/ROUND-74-BROWSER-PLAYTEST.md`](docs/ROUND-74-BROWSER-PLAYTEST.md)，完整验证见 `DEVLOG.md`。
- 🔎 Round 75：五区 17 个固定区域事件加入 `approachText` 临近线索，按事件条件、完成状态、发现状态和距离选择；HUD 在所有直接交互提示之后显示线索，抵达触发格仍由原事件揭示完整内容。
- 🎨 Round 76：为江南果木、渡口市集、铁嶂松石、盐道驿井与云岭悬桥布置 24 个 CC0 环境图素；只新增资料图层，旧碰撞与全部互动锚点保持不变。专项像素/锚点回归、发行验证和浏览器 M/G/移动核对见 `DEVLOG.md`。
- 🧍 Round 77：接入十种 Shade Puny Characters CC0 外观，更新五区玩家/NPC/伙伴精灵；玩家行走依方向切换，支持三帧步行动画。图集帧表、旧 MOD fallback、素材许可和浏览器核验见 `docs/MAP-ATLAS.md` 与 `DEVLOG.md`。
- 🧍 Round 78：NPC 在 E/F 交互时与玩家互相面向，伙伴会回望玩家；地图 JSON 可将树木、屋舍等图层标为逐行前景，并与角色脚底排序。旧 NPC 单帧资料继续可用。
- 🏝 Round 79：核验并接入 OpenGameArt Shade Puny World CC0 图集，新建落潮湾海岛地图；舆图从 208×128 扩展为 224×144，保留旧大陆七层并叠加岛链、航线和新区域位置；渡口往返、四个地标、一名航路记录人和「灯痕避礁」任务由资料驱动。计划与素材许可见 `iterations/round-79/plan.md`、`docs/REFERENCES.md` 和 `docs/MAP-ATLAS.md`。
- 🪧 Round 80：云岭悬桥和落潮湾白沙灯标支持邻近按 E 调查；通用交互声明由 `world-map` schema 校验，并核查范围、方向、条件和遮挡。未配置该声明的旧地图仍按踏入触发；验证记录见 `DEVLOG.md`。
- 🗺️ Round 81：全域舆图扩至 336×224，使用已登记的 Puny World CC0 素材增绘东岸和南方群岛；旧区域、关口及地标像素位置不变，拖动/缩放/方向键可平移，Home 回到总览。验证记录见 `DEVLOG.md`。
- 🗺️ Round 82：从云岭古道东缘步行进入东溟海岸·青帆埠；与温朝之接取「潮尺旧记」，在东汊石潮尺旁按 E 调查并发现雾隐湾。验证和素材记录见 `DEVLOG.md`。
- ⚓ Round 83：金云帆经营限量海岸补给，顾潮生按时辰巡潮；击退潮沟夺网客后，在暮潮时辨认回湾石标，接续完成两项海岸差事。数据按独立资源集合加载，旧内容继续可用。
- 🏝 Round 84：舆图扩至 384×256，保留旧 336×224 区域像素；新增风回岛 100×100 地图、东溟海岸双向步行关口、CC0 像素地貌、守灯人阮回澜和「风回灯影」任务。生成器可重复运行，专项验证覆盖地图连通、旧区域投影、任务奖励和图谱引用。
- ⏭ 下一轮建议继续扩大东溟航路可探索范围并丰富 NPC 行程与岛屿事件；远端发布、物理手柄和外部公测仍未验证，不作为已完成事实；规划见 `ROADMAP.md`。
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
npm run generate:round-70-atlas # 确定性重建 208×128 五区大陆舆图、地貌调色板和图素层
npm run generate:round-79-isles # 重建落潮湾海岛与 224×144 六区舆图
npm run generate:round-82-east-coast # 确定性重建东溟海岸百格地图与区域数据接线
npm run generate:round-84-windward-isle # 扩展超大舆图并重建风回岛数据
npm run generate:round-74-cloud-ridge # 确定性重建云岭古道 100×100 地图
npm run generate:round-76-region-landmarks # 确定性生成五区 24 个补充环境图素
npm run generate:round-77-characters # 重建 CC0 人物图集并更新五区人物帧表
npm run generate:round-78-actor-depth # 重建五区人物四向帧与地图前景排序元数据
npm run smoke:round-78 # NPC 朝向、前景行深度排序、旧资料回退专项
npm run smoke:round-74 # 云岭区域与真实整世界资源装配回归
npm run smoke:round-79 # 落潮湾海岛、CC0 图素、六区舆图与旧区域投影兼容
npm run smoke:round-80 # 区域事件 E 调查、旧触发兼容、方向/范围/条件与遮挡
npm run smoke:round-81 # 336×224 扩图、旧投影稳定、CC0 素材与视口复位
npm run smoke:round-82 # 东溟海岸地图、往返关口、任务调查与旧区域兼容
npm run smoke:round-84 # 384×256 舆图、风回岛、双向关口与灯影任务
npm run smoke:round-76 # 五区图集帧、地图碰撞与玩法锚点回归
npm run smoke:round-77 # CC0 人物帧、方向动画数据、碰撞哈希和旧格式兼容
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
npm run smoke:round-68 # 四区长旅程、日程、存档恢复与结局闭环
npm run smoke:round-69 # 30 门武学路径与一次性守御战斗规则
npm run smoke:round-70 # 多图集舆图、地貌与 CC0 素材专项回归
npm run audit:round-72 # Phaser 生产分块与 JS chunk 引用闭合审计
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
├── ROADMAP.md            # R00–R77+ 路线图
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
