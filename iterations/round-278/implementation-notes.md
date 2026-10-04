# 主代理复核说明（以本节及playtest为最终事实）

下面原委派笔记保留作开发来源。其中source6,4的E安全结论不成立：玩家5,4仍邻接NPC4,4；地标也不支持草路称西岸船埠。最终入口改既有芦岸登船点1,4北侧0,3，回程落点0,4，北岸87,15/87,16不变；靠近格逐一验证NPC全日程与真实关口优先。通用确认页新增默认取消/显式购票，分页回退/重开清选择，GridScene无故事装配变动。

作者源拒绝混合/重复指南token；CRLF新建输出保留。原54关口完整值与270ad8d固定基线相等，旧地图测试继续严格检查54旧门并另验新增两门，不以数字放大放松保护。首完整构建15失败（14旧计数/1链末遗漏）记录build-first；专项修正与最终构建另留日志。原notes里“原样复用确认页/1步去程”不能用作最终验收，最终真实QA待playtest。

## 原委派返回笔记（未复核初稿，历史记录）

# Round 278 实现笔记（bounded 实现，主代理复核用）

日期：2026-10-05 · 会话：默认模型/权限 · 基线 HEAD 270ad8d（Round 277 完成后）
状态：源码冻结，待主代理实机验证（真实乘行/取消/两关/存读）。

## 交付内容

付费**同图**驿舟（渡口西岸船埠 ⇄ 雾岬北岸），复用通用关口协议（R123 芦桥短渡同图先例），无引擎/场景改动：

- `gate.r278-ferry-north-boat`：from (6,4) → to (87,15)，fare 8 / travelMinutes 20，名「雾岬驿舟·去北岸」
- `gate.r278-ferry-north-boat-return`：from (87,16) → to (6,5)，同价同时长（R123 落点错位惯例）
- 世界图 transitions 总数 54→56；两条 r278 门插在 r126 班船门**之前**（R126 生成器 append 到尾，此序保证全链重放字节稳定，round126 测试已验证）
- 白鹭洲对白 +1 纯信息入口（无条件、无效果）+1 信息节点 `r278-shore-boat-info`：票价/耗时/只到北岸/铁嶂两关仍自过/步行免费仍可/水尺见闻乘舟略过。Bai greet 计数 31→32（round59 已同步）
- 行旅指南（regionGuides ferry advice）等长改写：240→201 字符（schema 上限 240；R275 版本恰好满额）。保留全部测试锚定片段（清点苍崖根×3 / 生肌散另耗寒珠草×2、根×1和18银 / 铁砂×3 / 韧皮×2（56银） / 渡口无料铺 / **渡口无药铺**（round271-departure-advice 锚）/ 西陲苦井 / 没有直达传送），新增驿舟句。round106-region-content.mjs canonical 源逐字同步
- R275 作者链式兼容：guidePatches[0] 增 `later` 数组（R278 定稿串）；`repairWorldRaw`/`repairRegionSourceRaw` 在 later 态跳过替换不回退不拒绝（R263→R104 携带式惯例）

## 坐标证据（实测，非假设）

- 地形：四点 (6,4)/(87,15)/(87,16)/(6,5) 全部 canEnter；西北码头区 rows1-12 与东北 row15-19 为开阔带
- 白鹭洲 (4,4)/日程 (3,4)：与 source (6,4) 曼哈顿距 2——source 四邻格 (5,4)(7,4)(6,3)(6,5) 无任何 NPC 基础/日程位 → E 键不被相邻人物吃掉（round-03 等 17 个 npc 资源逐一核对）
- 占用：四点不与任何既有事件/地标/关口/挑战格重叠（世界图+遭遇全量核对）；(5,4)=reedbank-traces、(4,3)=R275 免费路起点原样未动
- 落点语义：(87,15) 距水尺 (86,15) 恰 1 步、距北口邻格 (88,15) 恰 1 步——乘舟不触发水尺见闻（落点≠水尺格），到北口仍须步行 1 格后按 E 过 `gate.ferry-north-to-iron-ridge`（→铁嶂 4,7），绝不直达云岭、不跳铁嶂
- 机械路程（BFS 实测，isSolid 口径）：免费 (5,4)→(88,15) = **94 步**（(4,3) 起 96 步）；驿舟 = (5,4) 已是 source 邻格按 E + **8 银 + 20 分钟** + 落点后 1 步。上游"initial long49 cells"口径不同（或为某子段），此处如实记 94/96
- 回程落点 (6,5)：白鹭洲南侧 1 格，不与 R275 起点冲突

## 机械成本与免费对照

| 路线 | 步数 | 银两 | 世界分钟 | 见闻 |
|---|---|---|---|---|
| 免费步行 R275 | 94 | 0 | 按步计 | 沿路含水尺 |
| 驿舟去程 | 1（落点后） | 8 | 20 | 略过水尺（可自行补走 1 步） |

通用机制复用：`quoteTransitionCost`（8/20、不足给缺口）、`switchRegion` 全预检（落点可走/占 NPC/占挑战/银不足原子拒绝、扣费在事务内、时钟由 arriveAtMap→advanceTime 统一推进）、TravelConfirmationPanel 报价确认/Esc 取消（R123 通用测试覆盖）。

## 文件

新增：`scripts/lib/round278-shore-boat.mjs`（纯修复：世界图 upsert+等长指南改写 / round106 源替换 / 对白手术插入；幂等/漂移拒绝/from 格冲突拒绝）、`scripts/lib/round278-shore-boat.d.mts`、`scripts/apply-round278.mjs`（三资源整批预检后写、路径无关 cwd）、`tests/round278-shore-boat.test.ts`（12 用例）。
修改：`data/base/world/world-map.json`（+2 门/指南）、`data/base/dialogues/round-30-conversations.json`（+1 选项 +1 节点，纯插入）、`scripts/lib/round106-region-content.mjs`（指南同步）、`scripts/lib/round275-cloud-arrival.mjs`（later 链）。
历史测试精确推进：round109（56×2 + 渲染基线 6→8 派生四处 + badgePosts/lintels/E-glyph 12/6/6→16/8/8）、round112（56）、round126（56 / 55 / slice 54）、round123（old 过滤排除 r278）、round59（Bai 32）、round273（链末挂 applyShoreBoat，沙盒内存链）、round274（current 剥 r278 对比）、round275（链式挂 applyShoreBoatWorld/Guide、keeps-maps 剥 r278 门、CLI 沙盒两跳 275→278、负例锚 later 串）。round131 的 54 是 mock 分页巧合，**不改**。

## 命令与结果

- `node scripts/apply-round278.mjs` → 成功；二次运行 cmp 字节一致（幂等）
- `node scripts/validate-data.mjs` → 通过：manifest Schema 与 100 个基础资源 Schema
- `npm run typecheck` → 0 错误
- `npx vitest run <23 个受影响文件>` → **23 files / 222 tests 全过**（R109/112/123×3/126/131/278/273/274/275/271×2/272/276/277/106/world-map/64/61/73/59/data-validation）
- 未跑：完整 build / 浏览器 QA / 全套件（按分工归主代理）

## 限制与风险

- 实机乘行（确认面板 Esc 取消、真实 HUD/天气/日程刷新、两关衔接、存读）未验——引擎/场景层已有 R123 同构线上路径 + 本轮真实 switchRegion 事务断言，但非真人 QA
- 免费路 BFS 为可走格最短口径（94 步），绕开挑战/时序实际步数≥此值；QA 账本请以实走为准
- r278 门位于 r126 门之前——若未来作者再向 transitions 尾部 append 且早于 r126 重放，需同样注意顺序稳定性
- advice 201/240 字符，余量 39 字；后续加文需再权衡
- docs/PLAYER-GUIDE.md 与 round144 日志的工作区改动非本会话所改，未触碰
