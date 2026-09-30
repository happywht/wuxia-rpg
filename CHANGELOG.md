# 变更日志（CHANGELOG）

格式参考 Keep a Changelog；版本号遵循语义化版本。逐轮开发细节见 `DEVLOG.md`。

## [Unreleased]

### Changed（2026-09-30 专项目标梳理）

- 新增当前内容盘点、机器可重复的只读统计与新版项目目标；后续以既有世界的章节串联、地区玩法、成长经济、人物后果、终章回响和真实旅程验收为重点。
- 路线图重排为 R98–R110 滚动深化计划，保留 R00–R97 完成记录。本次不占用 R98；修正 GDD 过时状态和地图数量误述（全部 22 张为百格图）。现状数字与证据边界见 `docs/CURRENT-STATE-AUDIT.md`，新目标见 `docs/PROJECT-GOALS.md`。

### Added (Round 97)

- 在 768×576 可移动舆图东溟中部新增东溟·澜心洲与东溟·引航礁两张 100×100 可探索地图，以及四层水域/岛陆/沙礁/航线图素；新岛不覆盖旧陆地或本轮新岛陆，路线像素靠近对应岸线，Round 96 的 61 层哈希和 20 个既有区域锚点保持。
- 新增风回岛、潮生屿、澜心洲、引航礁与天门关之间四组双向海路；天门关至潮生屿最短世界路线从 5 段缩为 3 段。新增季无潮、虞星槎七时段日程及「澜心潮簿」→「重燃星槎灯」两段连续差事；基础资料增至 38 名 NPC、65 项任务、388 个知识节点/500 条关系、100 项资源。
- 增加 Round 97 确定性生成器、岸线/旧基线/地图 BFS/任务状态流专项测试与 `smoke:round-97`，并同步旧轮次的当前世界地图夹具和舆图标签布局，复用既有 CC0 Puny World/Puny Characters 素材。

### Verification (Round 97)

- `npm run smoke:round-97`：65 层、22 区域、50 关口、双向 3 段航路、岸线/叠层规则与两遍生成幂等通过；历史生成器依赖序列重放后 102 个 JSON 快照仅检测到登记输出写入。
- `npm run check`：100 项基础资源 Schema、MOD 检查 0 问题、TypeScript、71 个测试文件/457 项测试及 Round 34/48 文档审计全部通过。`npm run build`：Vite 139 个模块构建成功；Phaser runtime 1,374.54 kB（gzip 357.49 kB），超过默认 chunk 建议值但未阻断构建。`git diff --check` 通过；未执行浏览器手动验证。详见 `DEVLOG.md` Round 97。

### Added (Round 96)

- 在保持旧 57 层舆图像素与 18 处区域锚点不变的前提下，于中南海域新增中溟·千里石塘（投影中心约 190,430）与南溟·半月环礁（约 295,505）两张 100×100 可探索礁岛地图，总图增至 61 层（礁湖、沙礁、岛陆、海路四层，全图复用已登记的 Puny World/Puny Characters CC0 素材）。
- 开通雾航湾—千里石塘—半月环礁—归帆洲三组双向海路（6 个有向关口），世界路线由原 8 段缩短为 3 段；海路按公示叠层政策仅横跨 R87 环礁水纹与 R94 南方浅海两族装饰水层，不覆盖任何旧陆地/植被/道路像素。
- 加入岑汐、洛盐两名七时段 NPC，以及「石塘灯浮记」→「半月的回信」跨区两段连续差事（灯序辨认、跨图抄录、回报与奖励）；新增六处地标、六个区域事件、17 个知识节点/20 条关系。
- 添加可确定性重跑的 Round 96 生成器（两遍输出逐文件一致）、Round 95 基线守护（57 层哈希+18 锚点）、`smoke:round-96` 烟测、叠层政策/航线 BFS/任务状态流专项测试，并同步 20 区域/42 关口/61 层等静态计数断言与文档审计。

### Verification (Round 96)

- `npm run smoke:round-96`：基线/锚点、6 关口端点 BFS、双向 3 段海路、公示叠层政策与生成器两遍幂等全部通过；`npm run build`：70 个文件/452 项测试、两项文档审计与 Vite 生产构建通过；`git diff --check` 无空白错误。详见 `DEVLOG.md` Round 96。

### Added (Round 95)

- 在保持舆图 768×576 与原 53 层像素不变的前提下，新增四层东境林谷总图图素、三个 100×100 可探索地图（雾杉关、听杉谷、照叶港），并将可步行/乘渡路线接到天门关与归帆洲。
- 修复全屏游戏页面随舆图滚轮缩放而滚动的问题，保持标题、视口和区域信息侧栏固定可见。
- 校正林谷—海港路线名称与舆图方位，令“听杉溪石桥”标记落在溪流格，并统一渡船任务的方位用语。
- 加入两名七时段 NPC、两段前后置差事、地标、区域事件及 18 个知识节点/20 条关系；新增 OpenGameArt CC0 森林图素及来源/发行许可记录。
- 添加可确定性重跑的 Round 95 资料生成器、地图连通/任务链/图层与素材闭合专项测试，并更新旧轮次夹具以覆盖当前 18 区舆图。

### Verification (Round 95)

- `npm run smoke:round-95`：5 个文件/25 项测试通过；`npm run build`：69 个文件/447 项测试、两项文档审计及 Vite 生产构建通过，详见 `DEVLOG.md`。

### Added (Round 94)

- 将可移动舆图扩至 768×576 格/53 层，新增东隅·天门关与南溟·归帆洲两张可步行百格区域；原 640×448 旧像素及既有区域中心保持不变，overview 以 8 源像素/格烘焙。
- 增加雁回崖—天门关双向步行、潮生屿—归帆洲双向乘渡、两名七时段 NPC、调查事件/地标、两条差事和 16 个知识图谱节点/关系；素材沿用已登记 CC0 图集。
- 加固 Round 91–93 生成器，使其在 768×576 扩展图上重跑仍保留新区域、后续图层和稳定锚点；添加旧图层哈希前缀、路线 BFS 和资源装配专项。

### Verification (Round 94)

- `npm run smoke:round-94`：9 个文件/54 项通过；`npm run build` 中资料 Schema 84/84、全量测试 68 个文件/443 项、类型检查、Round 34 与 Round 48 文档审计及 139 模块生产构建全部通过。浏览器核对 M 舆图缩放、拖动、Home 复位；未手动实走关口，见 `DEVLOG.md`。

### Added (Round 93)

- 在 640×448 可移动舆图西北空带接入第十三个可玩区域「北境·霜松谷」，新增 5 层雪原/雪松/界墙/冰桥图素，保留 Round 92 原 38 层和十二个旧区域中心。
- 新增 100×100 雪谷地图、与照雪关互通的冰桥关口、巡路人柳寻径、「界标寻踪」调查差事及地点见闻；复用已登记的 OpenGameArt zaphgames CC0 冬季图集，不新增外部美术素材。
- 加固 Round 92 生成器，使其重建自身五层时保留后续轮次图层；添加跨 R93/R92/R91/R87 的确定性重跑回归。

### Verification (Round 93)

- `npm run generate:round-93-snow-pine-valley`：通过；新图层统计为 1,329 雪地、214 岩坎、262 雪松、51 墙体、258 冰桥格；雪谷有 6,426 个可走格、6,418 个入口可达格。
- `npm run smoke:round-93`：通过，8 个测试文件/51 项测试；R93 与 Round 52 landmark 定向回归另为 2 个文件/15 项通过。
- 浏览器手动验证：M 打开/收起舆图、拖拽平移、滚轮缩放、Home 复位、W/S 聚焦并用 Enter 选择路线均可操作；没有在浏览器实走两向跨区关口，连通性由自动化路线测试验证。
- `npm run check`、`npm run build` 与 `git diff --check` 的最终结果见 `DEVLOG.md`。

### Added (Round 92)

- 保持 640×448 舆图尺寸及 Round 91 原 33 层像素不变，在北境新区域追加 5 个 CC0 冬季图素层；世界从十一区扩为十二个可玩区域。
- 新增 100×100「北境·照雪关」雪地图，沿雁回崖双向步行关口接入；加入守烽人谷照雪、「雪燧传烽」落雪夜调查差事、一次性见闻与知识图谱关系。
- 登记 OpenGameArt zaphgames 冬季图集来源、CC0 文本和 NOTICE；发行白名单包含游戏运行所需的雪地图集与许可文件。
- 新增确定性生成器和 Round 92 专项；修复旧 Round 87 生成器以避免重跑时重置活动舆图投影。

### Verification (Round 92)

- `npm run smoke:round-92`：7 个测试文件、44 项通过；路线专项确认 7,740 个可走格全部从入口可达，旧舆图图层/投影基线保持。
- 浏览器未实走地图：当前浏览器自动化运行未能建立可安全控制的页面上下文；M 舆图交互和跨区往返没有记作手动通过。自动化专项覆盖双向关口、碰撞和区域路线。
- `npm run check`、`npm run build` 与 `git diff --check` 的实际结果见 `DEVLOG.md`。

### Added (Round 91)

- 可移动全域舆图扩至 640×448 格、33 个 RLE 图层，以哈希基线保留旧 512×384 图层像素和十个旧区绝对中心。
- 新增雁回崖山地图、双向步行关口、聂栖雁、时段门控调查与「崖台雁候」差事；地貌/桥梁使用 OpenGameArt Ansimuz Tiny RPG Mountain CC0 PNG。
- 增加确定性生成器、资产/路线/图谱/旧投影专项回归，并修复 Round 87 生成器重跑时可能按旧画布回退区域锚点的问题。

### Verification (Round 91)

- `npm run smoke:round-91`：6 个测试文件/37 项通过；`npm run check`：65 个测试文件/426 项及两项文档审计通过；`npm run build`：Vite 139 个模块构建通过。
- 浏览器确认 M 舆图的全图、缩放、拖动、Home 复位和选点界面；双向关口可达性由自动化验证，未在浏览器实走跨区。细节见 `DEVLOG.md`。

### Added (Round 90)

- 漫游奇遇协议新增 `trigger: "step" | "regionArrival"` 与可选 `transitionIds` 入境关口声明：旧资料省略 `trigger` 时按走格兼容解析，装配阶段校验关口引用存在且目的地图与事件地图一致，无效行单独隔离并给出可读警告。
- 场景只在跨区切换真正完成后按实际通行关口 id 抽取抵达事件；开局、原地等待、被阻挡关口与普通走格维持原语义，旧走格抽取概率与时机不变，一次性状态沿用 `completedRegionalEvents`，不新增存档字段。
- 以回汐缓流见闻为条件，沿「越岭东行」「回望云岭」两向关口加入青帆埠—云岭古道一次性往返见闻「潮序对汊」「云海收汊」，并补两个图谱节点与四条关系。

### Verification (Round 90)

- `npm run smoke:round-90`：5 个测试文件、25 项通过；`npm run check`、`npm run build` 结果见 `DEVLOG.md`。

### Added (Round 89)

- 新增程问舟及七时段巡湾日程；接取「东汊回声」时获得旧航图线索，并在东溟海岸 `(66,35)` 调查三道潮刻后回雾航湾复命。
- 新增发现门控的舆图地标、邻近调查事件和跨区任务图谱关系；增强 Round 87 地图生成器，使其幂等重建时保留后续轮次追加的数据。
- 新增跨区路线专项回归并更新玩家/世界资料文档；继续复用已登记 CC0 素材。

### Verification (Round 89)

- `npm run smoke:round-89`：6 个测试文件、44 项通过；`npm run check`、`npm run build` 与浏览器实走范围详见 `DEVLOG.md`。

### Added (Round 88)

- 为资料驱动气候加入确定性轻雾天气与程序生成的缓慢雾带，粒子密度来自气候资料，减少动态效果设置会停止漂移。
- 为敖晚晴加入七时段巡守日程；雾哨崖调查现在要求雾日拂晓/晨光、且守望人在邻格，对白与任务说明提示等待窗口。
- 增加轻雾、日程、事件条件和原跨区差事兼容的 Round 88 专项回归；更新相关气候、人物、任务和资料文档。

### Verification (Round 88)

- `npm run smoke:round-88`：5 个测试文件、33 项通过；全量 `check` 与生产构建结果见 `DEVLOG.md`。浏览器实测 HUD 天气/时段和舆图缩放/拖动，未实走雾哨崖调查。

### Added (Round 87)

- 将可移动世界舆图从 448×320 扩至 512×384 格、从 24 层扩至 28 层；原画布内旧图层逐格不变，原九区像素投影不漂移。
- 新增第十张 100×100 西南列岛·雾航湾地图，以已登记 CC0 像素图素绘制海岸与岛屿；从落潮湾建立双向步行关口。
- 新增「雾航引水」跨区三阶段差事：登岛、调查雾哨崖引水烽信号、返回落潮湾复命；更新 NPC、对白、任务、图谱与独立生成器。
- 新增西南列岛专项回归，并更新历史地图夹具、进度文档和素材用途记录。

### Verification (Round 87)

- `npm run smoke:round-87`：18 个文件/104 项通过；`npm run check`：64 项资源 Schema、MOD 零问题、类型检查、61 个测试文件/407 项与 Round 34/48 文档审计通过；`npm run build`：Vite 139 个模块构建成功。隔离浏览器核对十区总览、滚轮缩放、拖动平移和 Home 全图复位。Phaser runtime chunk 1,374.54 kB（gzip 357.49 kB）触发默认体积建议，非阻断；任务浏览器实走范围见 `DEVLOG.md`。

### Added (Round 86)

- 为 448×320、24 层全域舆图增加逐行 `cellsRle` 存储格式，同时保留旧 `cells` 密集矩阵读取与 MOD 覆盖；运行时逐格数据不变，地图 JSON 从约 51.9 MB 缩至约 256 KiB。
- 为总图区域名称加入随视口变化的避让布局；潮生屿新增陆余白、限量药囊商店，以及只在低潮出现、可重复且不奖励经验的礁道战斗。
- 新增确定性 RLE/潮生屿内容生成器及舆图、潮位、商店专项回归。

### Verification (Round 86)

- `npm run smoke:round-86`：6 个测试文件/34 项通过，覆盖 RLE、旧密集格式兼容、九区标注、潮位遭遇、限量库存与舆图视口；`npm run build`：数据 Schema、MOD 扫描、类型检查、60 个测试文件/398 项测试及 Round 34/48 文档审计通过，Vite 139 个模块生产构建成功。Phaser runtime chunk 1,374.54 kB（gzip 357.49 kB）触发默认 500 kB 体积建议；详细验证与手动预览范围见 `DEVLOG.md`。

### Added (Round 85)

- 将可移动全域舆图从 384×256 扩为 448×320；新增第九张 100×100 潮生屿地图与风回岛双向步行关口，旧图区像素和八处既有区域中心保持不变。
- 增加由游戏内时间驱动的资料化潮汐周期、HUD 潮位和 `tideIds` 区域事件条件；新增「低潮礁道」跨岛调查任务及两名原创人物，复用已登记 CC0 图集。
- 新增确定性生成器与 Round 85 地图/气候/任务集成回归。

### Verification (Round 85)

- `npm run generate:round-85-tide-isle`：舆图扩展已就绪，潮生屿确定性生成完成；重复运行无内容漂移。`npm run smoke:round-85`：13 个测试文件/59 项通过。数据校验、类型检查、Round 34 地图文档审计、全量检查及生产构建结果见 `DEVLOG.md`。

### Added (Round 84)

- 将可移动全域舆图从 336×224 扩为 384×256，新增东岸/南部 CC0 地貌；原 336×224 矩形内的 16 个旧图层逐格保持不变，既有区域像素中心不漂移。
- 新增第八张 100×100 风回岛地图与东溟海岸双向步行关口；阮回澜、灯标调查、「风回灯影」发现任务及岛屿地点/事件图谱均以独立数据资源声明。
- 新增确定性生成器、舆图兼容夹具与 Round 84 集成测试；更新路线、地图册、任务/人物/百科、数据作者与玩家文档。

### Verification (Round 84)

- `npm run generate:round-84-windward-isle` 重跑为 no-op；8 个生成输出 SHA-256 前后相同。`npm run smoke:round-84`：5 个测试文件/32 项通过。`npm run check`：55 个测试文件/367 项测试、资源 Schema/MOD 扫描、类型检查与 Round 34/48 文档审计通过；`npm run build`：139 个模块构建通过。Vite 仍提示 Phaser runtime chunk 超过默认 500 kB。
- 浏览器手动走查未执行：computer-use 运行时无法可靠确认 Windows 浏览器 URL，故未操作页面；没有把自动路线回归表述为浏览器实走。

### Added (Round 83)

- 青帆埠新增金云帆限量补给摊、海盐敷膏、顾潮生七时段行程、潮沟夺网战斗和「潮沟夺网」→「暮潮牵标」两段任务；夜间石标需先完成前置差事后调查。
- 世界装配器现按 manifest 顺序合并所有 `items-set`、`shops-set` 与 `battle-encounters` 资源；结构错误只隔离对应资源，重复 id 确定性保留首条，原 Round 06/05 单资源资料仍可加载。
- 新增 Round 83 内容生成器与资源装配/交易/日程/路线/任务/图谱专项测试；同步七区地图、人物、任务、物品、架构及数据作者说明。

### Verification (Round 83)

- `npm run generate:round-83-east-coast` 可重跑；专项 `npm run smoke:round-83`：4 个测试文件/26 项通过。完整验证记录在 `DEVLOG.md`。

### Added (Round 82)

- 新增第七张 100×100 东溟海岸·青帆埠可玩地图，复用已登记的 Puny World 与 RPG Town CC0 像素图素；云岭古道东缘和青帆埠西码头配置双向步行关口。
- 新增温朝之数据人物与「潮尺旧记」发现任务，可在东汊石潮尺旁按 E 交互；奖励经验、银两并发现雾隐湾百科条目。
- 新增确定性地图生成器、双向关口/地图地标/任务/知识图谱跨资源专项测试，并同步七区地图册和素材用途说明。

### Verification (Round 82)

- `npm run generate:round-82-east-coast` 重跑后，8 个生成资料文件 SHA-256 不变；`npm run smoke:round-82`：5 个测试文件/32 项通过。
- `npm run check`：42 项基础资源 Schema、42 项 MOD 检查零问题、TypeScript、53 个测试文件/358 项用例、Round 34/48 文档审计全部通过；旧轮次地图兼容专项 7 个文件/46 项也通过。
- `npm run build`：139 个模块构建成功；Phaser runtime chunk 仍触发默认 500 kB 体积建议。隔离页核对七区总览、本区细图及关口路线规划；逐区步行到岸、任务实操和回程未完成，详见 `DEVLOG.md` 的试玩边界记录。

### Added (Round 81)

- 将可移动全域舆图从 224×144 扩为 336×224 格，使用已登记的 Puny World CC0 图集拓展东岸与南方群岛；原十二层旧图区逐格不变。
- 增加可选 atlasArt.regionFootprint 固定旧区域投影跨度；Schema/解析器尺寸上限为 384 格，并保留未声明此字段的历史地图兼容。
- 舆图按 Home 可重置到当前总图/细图全景；增加确定性地图生成器及锚点投影、旧图层哈希、CC0 来源和视口测试。

### Verification (Round 81)

- `npm run smoke:round-81`：3 个测试文件/13 项通过；`npm run typecheck` 通过；`npm run check`：38 项基础资源 Schema、38 项 MOD 静态检查、类型检查、52 个测试文件/354 项用例及 Round 34/48 文档审计通过。`npm run build` 通过；Vite 保留既有 Phaser 大 chunk（1,374.54 kB）的体积提示。

### Added (Round 80)

- `world-map` 区域事件可选声明环境交互提示、调查范围和接近方向；相邻路径受地形及动态人物/遭遇阻挡检查，条件与一次性状态继续复用原事件规则。
- 云岭断索悬桥与落潮湾白沙灯标改为邻近按 E 调查，保留原事件文本与知识发现；旧地图/同名 MOD 未声明 `interaction` 时仍按踏入触发。
- 增加专项测试与 `npm run smoke:round-80`，覆盖 Schema、兼容、方向/范围、条件、遮挡和地图实例。

### Verification (Round 80)

- `npm run smoke:round-80`：4 个测试文件/31 项用例通过；`npm run check`：38 项基础资源 Schema、38 项 MOD 静态检查无问题、类型检查、51 个测试文件/349 项用例及 Round 34/48 文档审计通过。

### Added (Round 79)

- 新增 100×100 东海群岛·落潮湾地图、双向雾雨渡口关口、一位航路记录人、四处地标与「灯痕避礁」发现任务；地貌/碰撞/对白/任务/图谱全部由资料驱动。
- 核验并接入 Shade 的 OpenGameArt Puny World 16px CC0 tileset；发行清单包括直接引用的图集与项目来源通知。
- 将可拖动、缩放的世界舆图从 208×128 扩为 224×144，保留旧大陆七层美术和原区域像素中心；atlasPosition Schema 支持有限小数，旧地图/MOD 兼容。
- 增加确定性地图/舆图生成器、新区旅行/投影回归，以及素材发行完整性检查。

### Added (Round 78)

- NPC 资料可声明四向静止帧；E/F 与人物交互时玩家与 NPC 互相转向，伙伴跟随后转向玩家，旧单帧 NPC 资料继续可用。
- 地图 art 图层支持 `depthSort: "y"`，五区树木、屋舍、山石等前景逐行与角色脚底排序；合成画布禁用平滑采样。
- 增加确定性人物/前景元数据生成器、深度/朝向兼容专项回归和可复用的 R78 验证命令。

### Added (Round 77)

- 接入 Shade 的 OpenGameArt Puny Characters CC0 素材，生成十种外观、四向 idle 与三帧 walk 的紧凑 16px 透明角色图集；发行保留来源通知。
- 五区玩家按朝向显示静止帧并播放三帧步行动画，16 名 NPC 通过角色资料使用十种服饰外观；旧地图缺省方向帧表时回退既有静态帧。
- 增加人物图集生成器、数据/发行专项测试，并调整前序地图美术回归，使其将历史地形不变性与当前人物素材升级分别校验。

### Added (Round 76)

- 接入 OpenGameArt ansimuz 的 RPG Town CC0 16×16 透明图集；发行白名单仅包含实际使用 PNG 和随包原始 License。
- 五张 100×100 可玩地图新增独立纯视觉环境层，共布置 24 个图素：江南果木花丛、雾雨渡口集市岸栏、铁嶂松石、盐道苦井/驿棚周边、云岭悬桥栏杆。
- 新增确定性地图图层生成器和专项回归，覆盖 PNG 网格/透明帧、原碰撞与旧图层哈希、关键玩法锚点保护及发行资源清单。

### Changed (Round 76)

- 更新地图册、玩家手册、测试/架构说明、素材授权表、README、路线图与本轮开发记录。可移动 208×128 全域舆图、M/G 切换及地图玩法坐标保持原样。

### Verification (Round 76)

- `npm run smoke:round-76`：1 个测试文件、9 项用例通过；资料 Schema、严格类型检查与五图生成幂等复核通过。
- `npm run package:release`：34 项基础 Schema、34 项 MOD 检查零问题、47 个测试文件/320 项测试、Round 34/48 文档审计、139 模块生产构建、Round 72 chunk 审计及 Round 47 发行子路径 smoke 全部通过。发行包 904,154 bytes、SHA-256 `b9c40d5f4569419d41cea556d16f9c11b7c1754c8d6313a596bdd05cc3c698ed`，86 个归档成员/85 个内容文件；子路径 smoke 核验五张 CC0 图集和随包许可可读取。
- 隔离浏览器核对起始地图、M/G 舆图切换和移动跟随。未声称在浏览器逐区手走到五区装饰点；区域布置以素材实际帧合成近景复核。

### Added (Round 75)

- 为五区 17 个固定区域事件补充资料驱动的临近线索；玩家靠近未发现地点时可先察觉线索，抵达触发格后仍由原事件揭示完整内容。
- 新增最近线索选择规则：按曼哈顿距离 1–2 格筛选，结合事件条件/完成/已发现状态，同距离按事件 id 稳定选择；HUD 线索提示让位于所有直接交互。
- 为线索协议新增专项回归测试，覆盖旧资料兼容、五区数据、条件和距离边界。

### Verification (Round 75)

- `npx.cmd vitest run tests/round75-region-event-approach.test.ts`：1 个测试文件、8 项用例通过。
- `npm.cmd run validate:data`：manifest 与 34 个基础资料 Schema 全部通过。
- `npm.cmd run typecheck`：通过；`npm.cmd run package:release` 全通，46 个测试文件/311 项测试、文档审计、生产构建、发行打包与子路径 smoke 均通过；发行包 873,201 bytes，SHA-256 `ac5906152c7dba5768dd22552d32a2dfeb18f0cf0e6dbc29a609c3b2e772ccae`。
- 隔离浏览器实测：在固定事件触发格外显示临近线索；相邻 NPC 操作提示保持优先，抵达触发格后才出现完整事件文本。

### Added (Round 74)

- 新增云岭古道 100×100 十层 CC0 山地地图、双向铁嶂关口、沈雨霁、三处可发现见闻和两段链式任务；全域舆图扩为 208×128。
- 新增云岭区域专项回归和 `npm run smoke:round-74`，覆盖真实 manifest 五区装配与任务链。

### Changed (Round 74)

- 世界加载器按 manifest 中声明的 Schema 汇总所有 `npc-set` 与 `quest-set` 资源，分拆后的区域人物和任务可正常进入运行数据。
- 为云岭地图补入知识图谱节点；文档审计按 schema family 汇总分拆资源的内容数量。
- 更新相关地图、人物、任务、图谱、数据架构、测试、素材授权及玩家指南。

### Verification (Round 74)

- `npm run package:release` 通过：34 项基础资料 Schema、34 项 MOD 检查零问题、类型检查、45 个测试文件/303 项测试、Round 34/48 文档审计、139 模块生产构建及发行归档子路径 smoke；发行包 872,450 bytes，SHA-256 `d06cba8cbfebad58ce95c60dd25f06e47724b95e944ee9e68aec2c4c7043d468`。
- `npm run smoke:round-74`：2 个测试文件/6 项测试通过。隔离浏览器验证 M/G 总图与细图切换、缩放和平移；没有在浏览器手走新区任务。

### Added (Round 73)

- M 舆图在选中地点或关口时会读取当前已放置 NPC 与有效遭遇占位，使用与 HUD 相同的 Phaser-free 路线规则规划。
- 动态占位存在可行绕路时，距离提示标出已避让当前占位。

### Changed (Round 73)

- 当动态占位封住所有路线时，提示临时人物/遭遇阻挡；只有静态地形不可达时才提示地形无路。关闭舆图、移动或等待时段变化后重开，会基于最新位置与占位重新规划。
- 补充地图/玩家指南、架构/数据指南、试玩记录和路线图。

### Verification (Round 73)

- `npx vitest run tests/round73-world-map-blockers.test.ts` 与 `npm run typecheck` 通过；`npm run package:release` 完整通过，含 30 项基础 Schema、30 项 MOD 检查零问题、44 个测试文件/297 项测试、Round 34/48 文档审计、Round 72 chunk 审计及 79 项发行内容清单/子路径 smoke。发行包 849,204 bytes，SHA-256 `de4960016a5ca526c3ee89267504bae35d2e448f1b30e2402157104bc2c19633`。
- 隔离 5189 开发页已确认舆图面板能打开；第二日子夜与黄昏动态占位由专项回归验证，未声称浏览器重新实走渡口该段路线。

### Added (Round 72)

- **渡口回程与结局浏览器实测**：从 Round 71 盐道续档按 M 舆图动态导航穿越铁嶂、雾雨渡口；绕开 NPC 占位后抵达「照心石」，实选「行舟万里」并确认尾声和返回主菜单，保留结局截图及操作记录。
- **生产 JS 分块审计**：Vite/Rolldown 将 Phaser runtime 提取为独立 chunk；新审计核对入口比例和 JS 引用，发行 smoke 在子路径检查 chunk/import 均可访问。

### Changed (Round 72)

- `vite.config.ts` 使用 `build.rolldownOptions.output.codeSplitting.groups` 生成可独立缓存的 Phaser chunk。此为静态分块，游戏启动仍会请求 Phaser；不声称减少首屏总下载量。
- 更新玩家/地图指南、架构说明、来源表、路线图和开发记录。

### Verification (Round 72)

- `npm run package:release`：30 项资源 Schema、30 项 MOD 零问题、类型检查、43 个测试文件/296 项测试、Round 34/48 文档审计、生产 chunk 审计与发行子路径 smoke 全部通过。应用入口 570,700 B、Phaser chunk 1,374,548 B；gzip 合计 511,674 B。发行包 848,840 bytes，SHA-256 `ada26664fc93b409cd57ff50b92066b76baa40034812a85f7bc4f6ea1fb95205`，80 个归档成员/79 个内容清单文件。
- 隔离浏览器实走结局门、结局列表、「行舟万里」尾声与返回主菜单；分块生产预览启动成功。试玩限制见 `docs/ROUND-72-BROWSER-PLAYTEST.md` 与 `DEVLOG.md` Round 72。

### Added (Round 71)

- **可复现的四区浏览器行旅轨迹**：由 Round 68 真实资料长旅程导出分区方向序列、五次关口交互及存档检查点，并增加轨迹结构回归；该轨迹用于导航参考，不把引擎模拟等同于浏览器实走。
- **盐道续档试玩记录**：新增 Round 71 浏览器操作日志与两张保存/恢复证据图，记录接取「苦井辨线」、刷新后续档及发现「回声苦井」。

### Changed (Round 71)

- 更新地图册、玩家指南、README 与路线图，记录舆图从实时位置重规划 107 格关口路线的实际观察；明确回程及终章/结局 UI 留待 Round 72 浏览器验收。

### Verification (Round 71)

- `npm run generate:round-71-browser-trace`：通过，导出 749 次方向输入、5 次关口交互；专项轨迹 1 项通过，`npm run typecheck` 通过。
- `npm run package:release`：43 个测试文件/296 项测试、30 项基础 Schema、MOD 检查、双文档审计、139 模块生产构建和 78 项内容清单的发行 smoke 全部通过。包 847,723 bytes，SHA-256 `2e45c5bf4b55cf37529891fc54e8f1e720fbbcec7894900b73ba78e735c71834`。浏览器边界与证据见 `docs/ROUND-71-BROWSER-PLAYTEST.md` 和 `DEVLOG.md` Round 71。

### Added (Round 70)

- **176×112 大陆舆图升级**：可重复生成带海岸、近海、河道、盐碱滩、北部岩地、东南湿地、林地底色与跨区路线的全域地图；区域锚点、关口和发现地标仍按资料投影，既有局部地图、碰撞与旅行规则不变。
- **网页 CC0 地图图素**：加入官方 Kenney Tiny Town 图集及原始 `License.txt`，用于全域图林木、驿车和告示牌；另生成纯色小调色板作为低分辨率地貌底色，减少缩小总图时的纹理摩尔纹。
- **Round 70 回归**：新增多图集逐层帧范围、锚点/关口投影、调色板 PNG 尺寸、发现门控不泄露及素材许可/发行检查。

### Changed (Round 70)

- 舆图窗口扩大至 616×340 逻辑像素，保留右侧路线说明；M 总览、G 本区视图、滚轮缩放与鼠标拖动继续沿用同一裁切相机。
- 更新地图/素材参考、路线图、README、发行白名单与 `/preview/` 子路径 smoke；原 Tiny Town 组件切片只按经目检确认的单格树木和物件帧使用，避免错拼房屋部件。

### Verification (Round 70)

- `npm run smoke:round-70`：2 个测试文件/8 项舆图专项用例通过；`npm run package:release`：30 项基础资源 Schema、30 项 MOD 检查零问题、42 个测试文件/295 项用例、双文档审计、139 模块生产构建及发行打包全部通过。发行包 847,531 bytes，SHA-256 `11c5140c3d00af5e370e0bf1051eac58929e574da2d3f119dc889137de82a1bb`；R47 子路径 smoke 确认 78 项清单文件哈希一致，详见 `DEVLOG.md` Round 70。

### Added (Round 69)

- **可追溯的武学授艺目录**：新增真实对话图路径回归，从起点追踪每门武学的资格条件与学习效果，并核对授艺导师/门派关系；基础目录补全 6 门开局与旧式传承说明。祝九弦新增门外授艺入口，使无门派的拦门刀法对满足等级/属性门槛的非盘舷弟子实际开放。
- **身法守御动作**：武学战斗协议新增 `guard`，按资料中的内力成本和守御值抵挡下一次受击；伤害至少为 1，受击后效果消失。敌方在没有可用攻击时才会使用守御，战斗面板展示明确的减伤描述。

### Changed (Round 69)

- 四门「身法」由无语义区分的直伤招式改为一次性守御，并按阶调整守御值/内力成本；云隐身法不再是高门槛却弱于同门低阶步云履的直伤技。自创武学仍限攻击/疗伤。
- 同步武学目录、战斗平衡/数据协议、玩家/架构/测试指南、README、路线图和日志；没有改动大地图、像素图集、地图碰撞或现有跨区存档协议。

### Verification (Round 69)

- `npm run smoke:round-69`：2 个测试文件/7 项专项用例通过；`npm run validate:data` 与 `npm run typecheck` 通过。全量测试、双文档审计、生产构建与发行 smoke 以 `DEVLOG.md` Round 69 最终验证段为准。
- `npm run package:release` 全程通过：30 个基础资源 Schema、30 项 MOD 零问题、41 个测试文件/292 项用例、双文档审计、139 模块生产构建、75 项归档内容和 R47 子路径 smoke。包 842,924 bytes，SHA-256 `89f9d6d89d52adcdd7e52f10625a14b604a8002b099ec60ac397d5ec88529393`；详见 `DEVLOG.md` Round 69。

### Added (Round 68)

- **四区长线行旅回归**：新增 `tests/round68-long-journey.test.ts` 与 `npm run smoke:round-68`，使用当前四张真实地图、六时段日历/气候、NPC 日程、遭遇、任务、事件、知识图谱、v1 存档和结局资料逐格行旅；覆盖发现旧脚印、远区存读档、完成苦井差事并回渡口选择结局，报告每段路线到达的真实关口相邻格。
- **舆图与路线试玩记录**：增加 `docs/ROUND-68-JOURNEY-PLAYTEST.md`，明确记录 176×112 全域图、缩放/平移/细图切换、从江南道手动走过首个关口，以及浏览器手动试玩和 Phaser-free 长旅程回归各自的验证边界。

### Changed (Round 68)

- 同步玩家手册、世界舆图图册、测试说明、四区旅程计划、路线图和开发日志；为长路线自动化回归设定 30 秒用例上限，避免默认 5 秒测试上限在未缓存机器上导致误报。

### Verification (Round 68)

- `npm run package:release` 全通：30 个基础资源 Schema 与 30 个 MOD 零问题，39 个测试文件/285 个用例，双文档审计，139 模块生产构建，75 项内容文件归档及 R47 子路径 smoke 均通过。包 842,384 bytes，SHA-256 `9f1471204e29f39fa2d5011a0c6206a265eef50d84c1a4ba3c1c9dacf1a727cc`。详见 `DEVLOG.md` Round 68。

### Added (Round 67)

- **第四块可玩区域「西陲盐道·青岩驿」**：新增确定性生成的 100×100、十层地图，含盐地纹理、岩脊、驿道、驿站与独立碰撞网格；四向入口连通 8,280 个可走格，生成器保护 58 个玩法锚点。素材复用已有 Kenney CC0 图集，不新增来源不明素材。
- **盐道内容闭环**：增加青岩驿主人罗金子与晨光/夜间行止、苦井辨线见闻任务、发现门控地标、两项区域事件、可重战盐道遭遇及六节点/六关系图谱串联。
- **扩充可移动全域舆图**：四区重新排布至 176×112 格舆图，增补铁嶂北道与西陲盐道双向关口；总览继续支持拖动、滚轮缩放、方向键平移及 G 本区细图切换。

### Changed (Round 67)

- 更新地图地标可见数量、真实世界地图/任务/NPC/知识图谱总数及对应指南；保持旧存档、旧 MOD 舆图字段与碰撞/旅行协议兼容。

### Verification (Round 67)

- `npm run generate:round-67-salt-road`、`npm run generate:round-66-atlas` 各连续运行两次，JSON SHA-256 前后相同；地图/manifest 校验、类型检查及 Round 34/48 文档审计通过。
- `npm run package:release`：30 项基础资源 Schema 与 30 项 MOD 零问题、38 个测试文件/284 项用例、139 模块生产构建、76 个归档文件（75 项内容清单）、R47 子路径 smoke 全通过；最终一轮命令在文档终改后复跑通过。
- 浏览器隔离试玩验证四区总图、缩放/拖动、G 细图切换，以及 W/S+Enter 到西陲盐道的跨区首段 65 格导航；本轮未在浏览器中手动走完整张新区域地图。

### Added (Round 66)

- **全域可移动舆图**：`world-map.json` 可选 `atlasArt`，基于已有 Kenney Roguelike CC0 图集生成 128×80 格五层宽幅地理底图；M 默认打开总览，G/按钮切换本区细图。区域、位置、关口端点与发现地标由世界资料投影，不改碰撞图或跨区步行规则。
- **全域投影引擎模块**：新增 Phaser-free `world-atlas-view.ts` 统一映射区域格点、当前位置、关口和已知地标；新增可重复的 `generate:round-66-atlas` 脚本与 `tests/round66-world-atlas.test.ts` 专项回归。

### Changed (Round 66)

- 地图 Schema 与运行时解析器校验全域图尺寸、图集、图层/GID；旧 `world-map` 与 MOD 可继续省略全域美术并回退本区细图。
- `world-map-ui.ts` 增加全域/本区切换，继续使用原 waypoint 选择、碰撞寻路、目的地和过关提示；全域连接线只提供方向信息。面板支持裁切后的拖动平移、滚轮缩放及方向键平移。
- 调整全域底图草地变化密度与林地/山脊群落尺度；操作说明改用宽幅单行，消除标题区与多行指引重叠。
- 同步 `docs/MAP-ATLAS.md`、`docs/PLAYER-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/TESTING.md` 与路线图/开发日志。

### Verification (Round 66)

- `npm run generate:round-66-atlas` 连续生成两次，SHA-256 均为 `4B268FFBDE9AFF63B5ED4F8405D7B1BEFA9FB65CB4A076BF2C414205FD98FFD6`。
- `npm run typecheck`、`npm run validate:data` 通过；专项命令 `npx vitest run tests/round66-world-atlas.test.ts tests/world-navigation.test.ts tests/world-map.test.ts tests/round52-map-landmarks.test.ts` 为 4 个文件/28 个用例通过。
- 浏览器隔离端口 `http://127.0.0.1:5183/`：新游戏后按 M 打开全域图，滚轮缩放、放大后拖动与方向键平移有效；G 切换本区细图并保留选点，W/S + Enter 选择远方铁嶂目标显示首段 65 格至石阶渡口旁的路线，Esc 返回原地图。用户的 5178 页面未触碰。
- `npm run package:release`：全通——28 项基础 Schema/28 项 MOD 零问题、`tsc --noEmit`、37 个测试文件/280 项用例、Round 34/48 文档审计、139 模块生产构建、74 个归档文件/73 个内容文件与 R47 子路径 smoke。发行包 819,563 bytes，SHA-256 `d5cbeddb268c2b9541524a2e1de3781155f7948154937e30ceb112ab653aa785`；完整详情见 `DEVLOG.md` Round 66。

### Added (Round 65)

- **官方城镇图集接入**：新增 `data/assets/kenney/rpg-urban-pack/`（官方 Kenney RPG Urban Pack 打包图集 432×288 + 原始 CC0 `License.txt`），逐像素核验为 27×18 格、16px、0 间距（包内 `tilemap.txt` 声称 Spacing: 1px 与 PNG 实际尺寸矛盾，以实测为准并记录于 `docs/REFERENCES.md` 第六节）。发布白名单与 R47 归档 smoke 同步纳入第三张图集及许可。
- **起始地图街面素材样板**：新增确定性生成器 `npm run import:round-65-urban-town`（`scripts/import-round65-urban-town.mjs`），在起始 100×100 地图增加 `urban-street-ground`（一段车道、铺装巷口与小广场）和 `urban-street-details`（2 个井盖）两个数据图层，素材来自目检核验的 432–445 路面族。视觉复核发现原出生点邻近的阻挡区实际为墓园；故街面只铺到原装饰为空的可走格，共 42 格铺装 + 2 格井盖，不覆盖墓碑、旧土路或建筑，也不强放门面/道具。碰撞网格、出生点、NPC、任务、商铺与跨区关口原样保留。
- **角色精灵升级（复核修正版）**：三张百格地图 `art.actors` 与 14 名 NPC 的 `spriteFrame` 只取图集角色列（列 23–26，即帧号 %27 ≥ 23）经联络表逐格目检核验的人物格——共 5 组基础外观（深色便装 23–26、浅色长袍 131–134、红褐上衣 239–242、橄榄工装 347–350、蓝色制服 455–458），每组 4 格为同一人物的静态朝向/姿态变体。玩家用 24（深色便装组），14 名 NPC 分配 14 个互异格（跨 5 组分布，同组 NPC 为不同朝向格而非独立服装设计，不夸大为 14 套独特外观）。初版误把门窗/墙体帧 327–335、354–358 当人物、把人物帧 239–241 刷进街面图层，本次复核全部纠正；引擎与 UI 零人物硬编码，全部选择由数据声明。
- **专项审计测试**：新增 `tests/round65-urban-art.test.ts` 11 用例，内置纯 Node PNG 调色板解码器，审计 CC0 许可文本、图集尺寸/486 格非空、三图角色帧落在角色列、NPC 帧非空/互异/不与玩家共用、新图层帧引用、**角色列帧禁入街景 + 路面环境帧白名单双守卫**、新铺装只落于可走空白格/井盖具有路面底层、出生点/NPC/关口 BFS 可达。

### Changed (Round 65)

- `tests/round51-map-art.test.ts` 两处断言随资料协议演进更新：起始地图图层数 5→7、图集清单加入 `kenney.rpg-urban-pack`、玩家帧 85→24（角色列人物格）；CC0 素材存在性检查加入新图集与许可。`scripts/package-release.mjs` 生产构建必需文件与 `scripts/smoke-round-47.mjs` 归档加载检查同样加入第三张图集。
- `docs/REFERENCES.md`（核验日期与第六节 Kenney 素材表）、`docs/MAP-ATLAS.md`（Round 65 段落与图层计数）、`docs/PLAYER-GUIDE.md`（世界外观一节）、`docs/TESTING.md`、`ROADMAP.md`（R65 主题定为用户优先级的世界地图美术与角色精灵升级，原武学检查建议顺延至 R67）同步更新。

### Verification (Round 65)

- 专项：`npx vitest run tests/round65-urban-art.test.ts tests/round51-map-art.test.ts`——2 文件 14 用例通过（11 + 3）；并做过守卫红/绿双向验证（向 `urban-street-ground` 注入角色列帧 241 后守卫用例精确报错，恢复数据后回绿）。
- 浏览器实测（http://127.0.0.1:5182，隔离端口新档）：新游戏进入地图；实际走到 `(53,43)`，HUD 时间由 08:00 推进到 08:22 且镜头随玩家移动。街面/井盖位于原装饰留白格；本次视觉复核确认不再有红色长条覆盖墓园，保留的路面格局较小（42+2 格），不是完整村镇建成区。该隔离新档中的 M 舆图打开后可用滚轮缩放、鼠标拖动平移，并再次按 M 关闭返回原地图位置；后续仍以三张 100×100 可移动地图为基础继续扩建。
- 全量：`npm run package:release` 通过——28 项基础资源 Schema、28 项 MOD 零问题、类型检查、36 个测试文件/275 项用例、Round 34/48 文档审计、138 模块构建与 R47 子路径 smoke；发行包 808,362 bytes、SHA-256 `d801f53051d9d786639242cc22cab680888407f000c000afb57e7102707d855d`、74 个归档文件/73 个内容文件，静态包核验三张 Kenney 图集与原始 CC0 License。Vite 对 1,933.34 kB 主 JS 的体积提示为非阻断。

### Added (Round 64)

- **采集目标商铺导航**：进行中差事的 `collectItem` 目标可导航到真实装配的 NPC 商铺——解析器按装配货架与逐店运行时库存判定可用量（`-1` 无限、正数有限、`0`/未上架不可用），优先当前地图卖家、否则按装配顺序确定选取；目标投射到店主当前时段位置（随时段日程重算），抵达提示新增内容无关的 `shop` 动作（按 E 直接交易、F 交谈，购买后差事计数自动核对）。无任何商店上架、全部上架店铺库存不足或店主无法定位时分别返回精确 no-target 原因，不编造坐标；已完成的采集目标照旧让位给后续谈话/交手/见闻目标。
- **师门页导师地域名**：J 师门页为每位登记师父显示由装配 NPC/地图/世界区域资料派生的区域名（新增 `deriveNpcRegionNames` 纯函数），未解析导师回退通用「行踪未详」占位；引擎与 UI 均不硬编码门派/人物/地点。
- **三图七时段交互目标路线审计**：新增可复现审计 `tests/round64-route-audit.test.ts`，覆盖三张地图、七个历日时段、全部 5 位门派师父、43 项差事给予者与谈话目标（去重 14 人）及全部出图关口，从各区域入口按静态几何与动态 NPC/遭遇占位两层核验相邻交互格可达性，共 462 项检查零静态断连、零动态阻挡；记录见 `docs/ROUND-64-ROUTE-AUDIT.md`。

### Changed (Round 64)

- `resolveQuestNavigationTarget` 输入新增可选 `shops`/`shopStocks`/`currentMapResourceId`，场景把装配商店、运行时库存与当前地图 id 线程化传入；`NavigationArrivalAction` 扩展 `shop` 枚举。`tests/quest-navigation.test.ts` 两项被新语义取代的断言改为采集完成态与精确缺货原因；`tests/round61-route-audit.test.ts` 补装配真实商店后，摊棚差事首目标从跳过采集改为跨区导购路线（3–5 格 → 62–64 格）。

### Verification (Round 64)

- 专项：`npx vitest run tests/quest-navigation.test.ts tests/round64-collect-shop-navigation.test.ts tests/round64-route-audit.test.ts`——3 个文件 26 项通过；路线审计输出 maps=3 periods=7 targets=14 entries=5 checks=462 static-disconnected=0 dynamic-blocked=0。
- `npm run typecheck`、`npm run validate:data`、`npm run audit:round-34`、`npm run audit:round-48-docs`、`npm test`（35 个测试文件 264 项）与最终 `npm run package:release`（138 模块构建、发行包 788,135 bytes、SHA-256 `f93769c4058a8a72ab60a86198c2e5af49553c513fd90cb70f2dbf1c19b4ddc2`、72 个归档文件/71 个内容文件）全部通过；发行验证明细见 `DEVLOG.md` Round 64。

### Added (Round 63)

- **跨时段真实步行审计**：新增三图长途模拟，以真实日历、春季雨天最高步耗时、NPC 日程/实时玩家安全放置、活动遭遇和差事导航逐格行走，覆盖 284 格、852 分钟；验证晨间/午后/黄昏/入夜换段及秦素砚夜班目标迁移后仍可抵达。
- **抵达 HUD 复核**：回归检查见闻条件/V 等候与人物 F 交谈提示，新增可复现记录 `docs/ROUND-63-TIMED-ROUTE-AUDIT.md`。

### Changed (Round 63)

- 玩家指南补充成功走格按基础步耗时加天气增时推进、路线每格重算且玩家仍需手动移动；本轮没有复现需要改动运行时寻路代码的问题。

### Verification (Round 63)

- 专项路线及 Round 61 导航回归：3 个文件 / 12 项通过；`npm run package:release` 通过 28 项 Schema、28 项 MOD 检查、严格类型检查、33 个测试文件/250 项用例、Round 34/48 文档审计、138 模块构建及 71 文件子路径 smoke。发行包 787,419 bytes，SHA-256 `65aa13d03d475c85a302b78b1ab92780d165fdf87badac1f665b56593cdb402c`；Vite 主 bundle 1,931.59 kB（gzip 510.45 kB）的既有体积提示仍为非阻断。

### Added (Round 62)

- **铁嶂北道第三块百格区域**：新增确定性生成的 100×100 八层地图，复用已登记 Kenney Roguelike/RPG CC0 图集并通过独立碰撞网格控制通行；雾雨渡口与铁嶂北道间新增双向步行关口。
- **驿镇区域内容**：加入四处地标/发现、邵长庚与秦素砚、两场可重战遭遇和三段驿镇差事，更新知识图谱及玩家/作者文档。
- **三地图路线回归**：覆盖全部新增玩法锚点连通性，以及七个时段下任务发布人、谈话对象与遭遇目标的动态占位路线。

### Changed (Round 62)

- 发行 smoke 改为从实际 manifest 读取资源数量并逐项校验，避免后续增加资源时继续维护固定计数；当前资料计数同步至 14 名 NPC、43 项任务、195 个知识节点/305 条关系、28 项基础资源。

### Verification (Round 62)

- `npm run package:release` 通过：28 项资源 Schema、28 项 MOD 检查零问题、严格类型检查、32 个测试文件/247 个用例、Round 34/48 文档审计、138 模块构建、72 个归档文件/71 个内容文件与非根路径 smoke。
- 发行包 SHA-256：`80e02bc11d43ece3ad2786081156873b7e52533f3126e51537c6b5b0dd21c158`；地图生成前后 SHA-256 同为 `DCC60968F991294ABDE6945387D1729E11DC09F9EC42EBB7557BB782122E8868`。主 JS 1,931.59 kB（gzip 510.45 kB）的 Vite 体积提示仍为非阻断。

### Added (Round 61)

- **差事目标抵达操作提示**：差事导航抵达人物、遭遇或见闻目标后，HUD 按通用目标类别提示 F 交谈、E 交手与见闻条件/等候方式；地标仍使用原提示，不在引擎中写具体内容。
- **活动占位避让与暂堵恢复**：路径计算排开当期 NPC/活动遭遇占格；如只有动态占位封路则保留当前目的地，在角色移动、日程变化或遭遇结束后重算。
- **R58 七时段路线审计**：新增基于两区实图、任务/人物/遭遇数据与历法的 42 路线可复现审计，并记录格数口径与结果于 `docs/ROUND-61-ROUTE-AUDIT.md`。

### Fixed (Round 61)

- 把顾夜尘移至可从江南道入口抵达的位置，并微调陆贞娘黄昏/入夜停驻格，修复人物不可接近、黄昏跑图绕行和夜间 NPC 群堵住起点出口的问题。

### Verification (Round 61)

- `npm run package:release` 通过：26 项基础 Schema、26 项 MOD 零问题、类型检查、31 个测试文件 / 243 项用例、Round 34/48 文档审计、138 模块生产构建、70 文件发布归档与 69 文件 `/preview/wuxia-rpg/` smoke。
- 发布包 SHA-256：`880932add1451c20ff7c0bd1fe3f95f2778adea486c32e9035139abbb7ccc9d2`。Vite 对 1,931.59 kB 主 JS（gzip 510.45 kB）仍有既有 500 kB 建议警告；构建与 smoke 均通过。

### Added (Round 60)

- **差事目标导航**：Q 差事日志中选中进行中的差事按 N，自动跟踪该差事、关闭日志并打开 M 舆图，选中其下一个未完成且有地图位置的目标（金色「差事」标点）。人物目标指向其当前时段所在格（优先当前地图实际布置，其次时段编译位置，最后基础位置，随时段日程自动重算）；战斗目标指向遭遇布置位置；见闻目标指向触发该知识节点的地图事件（事件优先于同节点地标）。跨区域目标沿用既有跨区路线，先指到下一道关口。
- **运行期目的地命名空间**：M 舆图目的地统一为 `landmark:<id>`（稳定地标）与 `quest:<questId>`（运行期任务投影，跨阶段保持稳定）两类选择器；任务目标 id 仅存于当前运行，不写入存档，也不与既有地标 id 冲突。采集类目标没有地图标点，按 N 返回明确提示而非伪造坐标；目标完成、差事结束、时段切换与时钟推进都会触发路线重算，无目标或路线不可达时清除行路提示。
- **地标发现门槛补齐**：芦桥集与南麓聚落两处地标补挂与其首访事件相同的知识节点门槛，未获知前不再在舆图常显；已接取相关差事时由差事目标临时投影引导，完成后恢复常规发现规则。锁定/未接取差事不投影任何隐藏地点。

### Verification (Round 60)

- `npm run typecheck`、`npm run validate:data`（26 项基础资源 Schema）、`npm run inspect:mods`（26 项 MOD 资源零问题）通过；`npm test` 30 个测试文件 / 237 项用例全通过（R59 基线 29 文件/226 用例，新增 `tests/quest-navigation.test.ts` 11 项用例，并按新门槛更新 4 个既有文件的 6 处断言）。差事目标导航的解析、投影与导引全部由真实基础资料的 Phaser-free 回归覆盖；未改动存档格式。详细过程见 `DEVLOG.md` Round 60。

### Added (Round 59)

- **区域差事对话回声**：石北、白鹭洲、祝九弦、马尚义、陆贞娘、姜百味、顾夜尘七位人物的既有对话各加入 R58 六项任务的活动中/完成后回应（共 16 个新节点），仅以 `questStatus` 条件显隐、不带 effects——不重发接取、奖励、物品、关系或声望，现有选项全部保留。
- **执行次序保障**：谈话目标 NPC（石北、姜百味）的对话按场景真实次序先结算 `npc-talk` 信号再求首节点可见选项，带齐材料的玩家当次交谈直接看到完成态回应。
- **文档同步**：修正《世界设定》「芦桥集暂无任务内容」与「南麓聚落非交互入口」的滞后表述（当前至 Round 59，图谱 181 节点）；更新人物志职责表、任务志第八章、对白指南（新增 3.2 任务状态回声写法）与 README/ARCHITECTURE/DATA-GUIDE/PLAYER-GUIDE/ROADMAP 当前轮次。

### Verification (Round 59)

- `npm run package:release`：完整通过——26 项基础资源 Schema、26 项 MOD 零问题、`tsc --noEmit`、29 个测试文件/226 项用例、Round 34 与 Round 48 文档审计、Vite 137 modules 生产构建、静态发行归档与 Round 47 子路径 smoke。归档 765,530 bytes，SHA-256 `b08e3daa7aa4d44c02b9c51974a29d4e1a5511d74ce46208e6d68db77ac354fb`。
- 专项 14 项用例覆盖真实数据解析/装配、七位 NPC 的任务五态显隐、效果为空、旧选项保留、两组 `npc-talk` 先行次序和一个非谈话目标对照；未对既有玩家存档做浏览器操作。Vite 主 JS chunk 1,924.52 kB（gzip 508.47 kB）高于 500 kB 建议线，构建与 smoke 成功。详细过程见 `DEVLOG.md` Round 59。

### Added (Round 58)

- **芦桥集与南麓聚落任务链**：新增「芦桥寻集 → 集期赶办 → 集口拦贩」与「南麓寻村 → 南麓捎药 → 塘匪断道」两条三段支线，覆盖跨区见闻、收集、谈话、遭遇战及战败失败条件。
- **区域发现与可重战遭遇**：两处首访事件接入现有芦桥集/南麓常显地标；新增 (60,67) 芦桥索钱人与江南道 (80,20) 冒牌护队遭遇，可重战且各给 44 经验。收集任务只依赖货郎无限库存物品，避免提前清货软锁。
- **图谱与数据文档**：新增 10 个知识节点、21 条关系；基础任务总数增至 40。未增加引擎协议或存档字段，并保持旧档既有目的地可见。

### Verification (Round 58)

- `npm run package:release`：资料/26 项 Schema、MOD 检查、类型检查、28 个测试文件/212 项用例、Round 34 与 Round 48 文档审计、生产构建、归档及 Round 47 子路径 smoke 全通过。发行包 762,596 bytes，SHA-256 `f7be4826d733c90663732046b51021feed11e941ba5cfb925718be399c3995fa`。
- 浏览器只读检查现有玩家任务日志，确认可见新任务「芦桥寻集」；未在该存档上移动或保存进度。区域事件、任务链以及遭遇胜负由自动化资料/引擎回归覆盖。
- Vite 对 1,924.52 kB 主 JS chunk（gzip 508.47 kB）的 500 kB 建议为非阻断提示。

### Added (Round 57)

- **跨区地标行程接续**：M 舆图所选地标以稳定资料 id 贯穿远区首段投影、本区投影和面板重开；HUD 显示当前碰撞格路线的方向/格数及下一关口，手动通过有向关口后立即重算下一段。
- **关口交互停靠提示**：新增 Phaser-free 寻路到关口四向可行交互格，路线停在可按 E 的位置；仍由玩家自行走格和切区。抵达附近或数据目标/路线失效时清理目标并显示明确结果，不更改存档字段。
- **导航生命周期回归**：覆盖稳定目的地 id、两图接续、关口交互格、抵达、见闻门控和有向回程不可达；玩家地图指南和架构/测试说明同步更新。

### Verification (Round 57)

- `npm run package:release`：27 个测试文件/208 个用例、26 项基础资源 Schema、MOD 检查、类型检查、两项文档审计、Vite 137 模块构建和发行包 smoke 全通过。版本包 758,471 bytes，SHA-256 `92db34165b52ee60d120501ff697c99b4a77597255b62e7e28d4e9f2549743b7`；Vite 主 chunk 体积建议为非阻断提示。
- 浏览器核验 M 舆图远区选点、关图 HUD 导航和重开恢复所选地标；过关后的真实数据计算由 Phaser-free 两图回归覆盖。

### Added (Round 56)

- **发现见闻任务目标 `discoverKnowledge`**：quest-set 目标 kind 新增 `discoverKnowledge`（`requiredCount` 固定为 1），Schema/防御解析器/跨资源装配三层校验知识图谱节点引用；图谱首次新增节点发出一次性任务信号，只推进匹配目标一次；接取任务时按玩家已有见闻回填进度，读档时把存档已知节点重算到活跃发现目标——复用既有 v1 目标 id/计数快照，不新增存档字段；任务奖励解锁的见闻沿同一信号链级联推进其他活动任务。
- **两段雾雨渡口见闻巡标差事**：石北在玩家发现旧渠石闸碑记（`place.mist-sluice`）后发布「北岬水尺巡查」，至雾岬林地 (86,15) 触发发现事件解锁 `place.mist-north-cap` 完成；完成前段后接取「南湾水路测绘」，至南湾苇池 (81,87) 发现 `place.mist-south-pool` 完成。两项差事不互斥、顺次可完成。
- **图谱与舆图同步**：世界图为雾岬林地、南湾苇池两处地点设置发现门控地标与一次性发现事件；知识图谱新增 6 节点/8 条关系，总量扩至 171 节点/267 条关系；基础差事总量扩至 34 项（奖励合计 1,108 经验/812 文，含互斥取舍的单周目上界为 979 经验/724 文）。

### Verification (Round 56)

- `npm test`：26 个测试文件/202 个用例全部通过；`npx vitest run tests/quest-system.test.ts tests/round56-discovery-quests.test.ts`：2 个文件/29 个用例通过。
- `npm run package:release`：资料/MOD/类型/全量测试/两项文档审计/生产构建及 Round 47 解包与子路径 smoke 全部通过。发行归档 756,726 bytes，70 个归档文件/69 个内容清单文件，SHA-256 `e5e474dd3d7d268beb0c6ff41f391a85a8d310efde7f2450273ce86347b60a61`；Vite 1,921.01 kB chunk 建议为非阻断信息。

### Added (Round 55)

- **第二张百格可步行区域**：`map.round-10-mist-ferry` 由 16×9 过场小图扩为 100×100 十层 Kenney CC0 像素河湾地貌——草地/岸线/繁花/林木四层河流走廊、五层芦桥集渡镇聚落与一层步径层；独立碰撞网格给出 7,340 个可行格（`,` 芦苇滩草地与 `.` 地面可走，`~` 江水与 `#` 岩岸阻挡），林木层 388 处 CC0 树木。地图由确定性生成脚本 `scripts/generate-round55-ferry-world.mjs`（`npm run generate:round-55-ferry`）以种子哈希与河道路径距离场重建，可重复再生；素材仅复用已授权的 Kenney Roguelike/RPG 与 Tiny Dungeon 图集（见 `docs/REFERENCES.md` 第六节），未新增外部资产。
- **原位保留的玩法锚点**：出生点 (7,7)、两向关口端点（石阶渡口 (90,50)→渡口 (1,4)；回望石阶 (2,4)→江南道 (89,50)）、区域事件（初到脚印 (1,4)、芦苇寻迹 (5,4)）、五名渡口 NPC 的基础位与日程位、三处任务遇怪格全部保留；专项回归以 BFS 从出生点锁定上述全部锚点可达。
- **四个新渡口舆图地标与碑记见闻**：世界图新增雾岬林地 (86,15)、芦桥集 (59,65)、旧渠石闸 (46,53)、南湾苇池 (81,87)；新增固定格事件「石闸潮尺铭文」（旧渠石闸 (46,53)），触发后解锁知识节点 `place.mist-sluice`（旧渠石闸）。知识图谱相应扩至 165 个节点/259 条关系（新增事件/地点两节点与一条 `locatedAt` 边）。
- **旧导入器收窄**：`scripts/import-round51-kenney-world.mjs`（`npm run import:round-51-world`）不再改写渡口地图；雾雨渡口图层唯一由 Round 55 生成脚本产出，避免重建起始大地图时覆盖第二区域。

### Verification (Round 55)

- 浏览器人工走查（本机开发服务器）：从江南道石阶渡口关卡 (90,50) 按 E 落入渡口码头 (1,4)，跟随镜头探索新区域至芦桥集 (59,65)，抵达旧渠石闸 (46,53) 触发碑记事件并解锁 `place.mist-sluice` 见闻，再经回望石阶关口返回江南道 (89,50)——跨区往返闭环实际走通。
- 自动验证：`npm run package:release` 全通，包含资料 Schema、MOD 覆盖检查、类型检查、25 个测试文件/193 个用例、两项文档审计、生产构建、版本包清单和非根路径 smoke。发行归档 754,075 字节，SHA-256 `0c0611524064e21a2490d1c1c3c72367db39f539a34be1aad3b078314533eae9`；详细命令和结果见 `DEVLOG.md` Round 55。

### Added (Round 54)

- **跨区域舆图行程**：有向区域图返回稳定最短关口序列；直接可见关口区域与已知远区地标可作为 waypoint，显示当前地图首段步行路线和途经区域。
- **鼠标与键盘 waypoint 选择**：侧栏行有独立命中区、地图 pin 有扩大命中半径；W/S 循环选点、Enter 规划，关闭舆图清除当前选择。
- **FIT 画布鼠标坐标归一**：修正浏览器高 DPI/缩放下 pointer 纵坐标仍处于 CSS 像素、与 Phaser 逻辑 y 错位的问题；列表、pin、拖拽和滚轮共享同一转换。
- **跨区地点情报门控**：远区候选先按已知见闻过滤，只有玩家已见到的直接关口区域会作为区域 waypoint；测试锁定两跳未公开区域不泄漏。

### Verification (Round 54)

- `npm run package:release`：完整质量门槛通过（26 项基础资料/schema、MOD 0 问题、类型检查、24 个测试文件/190 项、Round 34 与 Round 48 文档审计）；Vite 8.3.1 构建 136 modules，70 项归档（69 个内容文件）及 R47 `/preview/wuxia-rpg/` 子路径/全部资料/CC0 资源 smoke 通过。版本包 739,006 bytes，SHA-256 `0320c6fadebd162071a089265d9c8f00716a0e69c6f46bd8109b2e710984350b`。Vite 提示单 JS chunk 为 1,919.61 kB（gzip 507.07 kB），不影响构建或 smoke。

### Added (Round 53)

- **地标与关口寻路**：M 舆图可选择已知地点/区域关口，按碰撞网格显示四向最短路线、步数和方向分段；关口说明目标区域，落在实心格的地标会导航至附近可行停靠点。
- **见闻门控地图标记**：世界地标支持可选 `discoveryNodeId`；默认芦苇登船点在对应河滩见闻发现后显露。未发现时标记、标题、类别及计数均不进入舆图展示模型。
- **确定性纯逻辑寻路**：新增 Phaser-free BFS 和路线方向折叠，覆盖可复现最短路、阻挡、无路和无效坐标测试。
- **素材许可总述纠偏**：说明本仓库包含 Kenney CC0 像素图集并保留原始许可文件，消除与资料区清单相矛盾的旧声明。

### Fixed (Round 52)

- **起始地图视觉层跟随**：地图贴图与旧式 Graphics 地层明确采用世界坐标滚动，不再继承场景统一施加的 HUD 固定滚动系数；开局实景现与玩家坐标一致。
- **舆图放大裁切**：移除无法在当前 WebGL 渲染路径可靠裁切的几何遮罩，改用地图专属相机视口；高倍率拖图限制在地图框内，标题和侧栏保持可见，关闭地图时销毁临时相机。

### Added (Round 52)

- **资料驱动地图地标**：世界地图资料新增可选 `landmarks` 数组、Schema 类别校验与坐标/地图引用逐项隔离；M 舆图为当前地图显示地标色点、格坐标图例和玩家位置。
- **地图审计回归**：新增地图子层相机默认值和地标兼容性/坏引用测试，并更新 R40 记录场景基准以测量现有 100×100 碰撞格（不把贴图烘焙混入其测量范围）。

### Verification (Round 52)

- `npm run validate:data`、`npm run typecheck`、`npm run audit:round-34`、`npm run audit:round-48-docs` 均通过；`npm test` 与 `npm run check` 均为 21 个文件/160 个用例通过。
- `npm run benchmark:round-40` 独立通过；纯 100×100 网格 recording renderer 为 2 场景对象，裸 Node 约 2.02 ms/render（单机描述数据）。
- `npm run package:release` 通过 133 modules 构建与 R47 解包/子路径/资产许可 smoke；归档 70 entries、69 个内容文件，735,045 bytes，SHA-256 `2c1c29afe2b9f17d0857fd02692e5052575321fe7444984971982c75759a3a14`。更完整的浏览器步骤和历史审计见 `DEVLOG.md`。

### Fixed (Round 51)

- **舆图滚轮缩放**：将缩放输入接到 Phaser 场景级 `wheel` 事件，并按地图视窗范围过滤；之前挂在 GameObject 上的 `wheel` 监听不会收到场景滚轮输入。面板关闭时同步解除监听。

### Added (Round 51)

- **100×100 可探索世界**：以 Kenney Roguelike/RPG CC0 五层 Tiled 示例地图为底稿，程序导入成地图视觉层和独立的 100×100 碰撞格；扩展道路、林带、池塘和第二聚落，起始地图镜头跟随玩家，边界保持在世界内。
- **网页像素素材**：接入 Kenney 官方 CC0 Roguelike/RPG 地图图集与 Tiny Dungeon 人物图集；玩家/NPC/伙伴用像素人物，地图支持缩放和最近邻绘制，素材包原始 License.txt 随发行资源保留。
- **实景舆图**：M 键展示完整世界地图及当前位置，支持滚轮/触屏缩放、拖动平移和方向键移动舆图；增加地图视口数学与地图素材回归测试。

### Verification (Round 51)

- `npm run import:round-51-world`：导入 100×100、5 个视觉层，7997 个可行格；起点 `(43,37)`；渡口同步使用同一 CC0 地图图集。
- `npm run validate:data`、`npm run typecheck`、`npm test -- --run`、`npm run check` 和生产发布包结果见 `DEVLOG.md` Round 51。
- 浏览器验证：新游戏可进入，角色移动时相机跟随；M 舆图载入地图像素，滚轮放大后可拖动平移，HUD 和位置标记保留。控制台无资源错误。

### Fixed (Round 50)

- **任务完成后的跟踪状态**：任务由对话、战斗信号或收集物数量自动完成时立即清除相同的跟踪 ID，避免旧存档在读档时提示“跟踪中的任务不是进行中任务”。

### Added (Round 50)

- **1.0 最终交付审计**：新增独立 `npm run audit:final`，核对 Round 00–50 计划标题、子任务小节（至少两项）及最低 10 分钟工时估算、逐轮提交、关键内容数量（同 Schema 多资源聚合）、Schema 家族、同名 MOD 覆盖样例、引擎资料字面量边界与 24 份交付文档；正反向夹具覆盖通过与诊断路径。此命令依赖完整 Git 历史，不进入 `npm run check` 或浅克隆 CI。
- **最终验收矩阵与浏览器闭环**：新增 `docs/FINAL-ACCEPTANCE.md`；本地浏览器走查完成新游戏、巷战、NPC 对话、接取并完成收集差事、购入物品、自创武学、两个空槽存档及页面刷新读档。

### Verification (Round 50)

- 最终 `npm run check`、`npm run smoke:round-35`、`npm run package:release` 和提交后的 `npm run audit:final` 结果见 `DEVLOG.md` Round 50；浏览器步骤和验证边界见 `docs/FINAL-ACCEPTANCE.md`。

### Fixed (Round 49)

- **锻造配方资料告警**：修正“琥珀嵌扣”升级结果丢失基础装备的定力与内力加成、导致配方被装配器禁用的问题；现保留原加成并实际提升至少一项，开局不再出现默认可选资料告警。
- **暂停菜单 Esc 越级返回**：暂停面板打开时场景不再同时关闭它；设置/保存子页的 Esc 先回暂停主页，主页 Esc 再回探索。
- **文档进度审计**：玩家/MOD 手册审计从路线图动态识别最近已完成轮次，避免每轮完成后仍把 README、架构和数据指南锁在 R48 截点。

### Added (Round 49)

- **真实世界装配回归**：新增 `tests/round49-default-world-integrity.test.ts`，从仓库资料装载 manifest 全部资源，检查 NPC/门派/任务/物品/武学数量和默认可选资料零装配告警。
- **试玩反馈留档**：新增 `docs/PLAYTEST-FEEDBACK.md`，如实区分无外部反馈的本地走查、复现步骤、修复状态与后续反馈模板。

### Verification (Round 49)

- `npm test -- --run tests/round49-default-world-integrity.test.ts`：1 项真实默认世界完整性回归通过；首次失败准确指向 `forge.recipe.r32-marsh-amber-seal`，修复后重新通过。
- 浏览器手测：新游戏加载且 HUD 无默认资料告警；验证地图步进、墙/NPC 阻挡、F 对话、E 任务列表并接取「茶棚凉汤」；查看擂台入口；暂停设置页与保存页 Esc 正确逐层返回，三个存档槽显示空且未保存/覆盖。
- `npm run package:release`：数据校验 26/26、MOD 问题 0、严格类型检查、16 个测试文件/143 项、R34 与当前文档审计、132 modules 生产构建及 R47 解包/子路径 smoke 全部通过；归档 66 entries / 65 内容清单文件，621,026 bytes，SHA-256 `52f1ea213941da92b760ec35c8555c6db81fa87c7ea5411d0c444f457ef61f99`。
- Vite 对 1,895.11 kB 主 JS chunk 的 >500 kB 提示仍为非阻断信息；`git diff --check` 最终复核见提交结果。

### Added (Round 48)

- **玩家与资料作者手册**：新增 `docs/PLAYER-GUIDE.md` 和 `docs/MOD-GUIDE.md`，按当前操作、Schema/MOD/内容包协议说明开局、探索、战斗、存读档、资料作者校验与静态版 MOD 边界。
- **文档一致性门槛**：新增只读 `npm run audit:round-48-docs`，核对玩家/MOD 指南、README/发布包索引、示例命令、轮次摘要、manifest/Schema/内容计数、许可边界及静态包收录；接入 `npm run check`，新增九项正向/反向审计测试。
- **发布资料随包**：静态版本包白名单加入两份指南；Round 47 解包 smoke 对两份指南做内容断言。
- **架构/数据状态校准**：更新 R47 相对 `./` 基址、26 项 manifest 资源与 Schema 家族、静态版 MOD 边界、当前许可事实和 Round 47 发布证据。

### Verification (Round 48)

- `npx vitest run tests/docs-audit-round-48.test.ts`：9 项通过；`npm run typecheck`：通过；`node scripts/audit-round-48-docs.mjs`：通过。
- `npm run package:release`：包含全量 `check`、Vite 132 modules 生产构建与解包/路径 smoke；15 个测试文件、142 项通过，26 个 manifest 资源 Schema、启用 MOD 问题 0，R34/R48 审计通过。包 620,869 bytes，SHA-256 `7ffd16bf0b26e7c840dc1e24152ee0a57fe6f7be8b069a078ba4edceeec43b1e`；解包 65 个内容文件的长度和哈希匹配，新增玩家/MOD 指南可读。
- `smoke:round-35`、`smoke:round-36`、`smoke:round-37`：全部通过。
- 本机未进行浏览器手动游玩；无 Git remote，故没有远端 Pages 发布/URL 验证。Vite 主 JS chunk >500 kB 仍为非阻断提示。

### Added (Round 47)

- **部署基址**：Vite 生产输出改用 `./` 相对路径，支持根路径和 GitHub Pages 仓库子路径；新增真实 HTTP 子路径 smoke，使用实际 data-loader 请求全部基础 JSON/Schema、静态资源与示例 MOD。
- **白名单版本包**：新增 `npm run package:release`，质量门槛与生产构建通过后，经系统临时 staging 生成 `wuxia-rpg-web-<version>.tgz`、外置 SHA-256 sidecar、包内逐文件清单；逐文件收集 production npm 依赖及 LICENSE/NOTICE 文本到 `THIRD-PARTY-NOTICES.md`，站点和归档均附带。归档审核拒绝缺文件、隐藏/危险路径、符号链接及 staging 白名单外内容，不携带源码、测试、Git 历史或 `.serena/`。
- **人工门控的 Pages 工作流**：新增 `.github/workflows/deploy-pages.yml` 与 `docs/RELEASE.md` / ADR-0007。仅 `workflow_dispatch`、确认默认 false、必须显式勾选并在默认分支；普通 push/PR 不发布；建包和 Pages deploy 分 job，部署 job 拥有独立最小权限。新增 4 项打包协议测试与 1 条归档解压/路径加载 smoke。

### Verification (Round 47)

- `npm run package:release`：完整 `check` / Vite 构建通过（14 个测试文件、133 项；26 个基础资料 Schema；132 modules）；产物 `release/wuxia-rpg-web-0.0.1.tgz`，616,513 bytes，SHA-256 `0e564cf8b1782ec91a28790d295895427e859fe2948a249406288ab829b078ce`。
- `npm run smoke:round-47`：可解包；63 个文件逐项字节数/SHA-256 与包内清单一致；静态文件挂载在 `/preview/wuxia-rpg/` 后，可获取 HTML/JS/CSS、示例 MOD 和全部 26 项 JSON/Schema；烟测另核验许可证文件和外部归档 checksum。
- `smoke:round-35`、`smoke:round-36`、`smoke:round-37`：通过；PyYAML workflow 解析与人工门控/default-branch/Pages 权限静态断言通过；`git diff --check`：通过。
- 此工作区没有 Git remote，因此 GitHub Actions 托管运行与公开 Pages URL 未验证；没有执行远端部署。Vite >500 kB chunk 仍为非阻断提示。

### Added (Round 46)

- **真实资料纵向切片**：新增 `tests/round46-vertical-slice.test.ts`，由基础角色、地图、对白、任务、遭遇、物品、武学、图谱和结局资料驱动；覆盖开局走格/阻挡、NPC 对话接任务、巷战成长与奖励、拜师学艺、存档往返恢复及 R42 两条互斥路线各自的结局判定。
- **专项回归入口**：新增 `npm run smoke:round-46`。该测试直接驱动 Phaser-free 引擎 API，不等同于浏览器内完整游玩。

### Verification (Round 46)

- `npm run smoke:round-46`：1 个文件、2 项通过。
- `npm run check` / `npm run build`：资料 Schema 26/26、启用 MOD 问题 0、严格类型检查、13 个测试文件/129 项、Round 34 文档审计和 Vite 生产构建均通过（132 模块）；主 JS 1,895.16 kB / gzip 499.54 kB，chunk 体积提示为非阻断警告。
- `smoke:round-42`（3 项）、`smoke:round-43`（11 项）、`smoke:round-44`（30 项）、`smoke:round-20`、`smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33` 均通过。未做浏览器手动游玩。

### Changed (Round 45)

- **擂台经济与战绩**：银两/物品彩头仅在首次完整夺魁时发放；逐场胜利仍给数据配置的战斗经验，重赛仍计胜场、夺魁次数，并允许满包/满钱袋玩家仅为战绩再战。首次彩头结算后立即刷新擂台成就，旧 v1 存档通过已有 `championships` 字段兼容，无存档迁移。
- **战斗成长基线**：新增 `docs/COMBAT-BALANCE.md`，记录 1/5/10/15/30 级经验门槛、互斥任务报酬参照、开场战斗升级补血、装备锻造现金投入与出售回收率，以及静态审计的限制；`docs/ARENA_DESIGN.md` 与测试说明同步。
- **R45 回归**：新增四项 Phaser-free 真实资料测试，覆盖擂台首夺/失败/重赛、旧战绩兼容、逐场经验以及开场巷战；`smoke:round-20` 增补首夺彩头与重复经验检查。

### Verification (Round 45)

- `npm test -- tests/round45-balance.test.ts`：4 项通过；`npm run smoke:round-20`：通过。
- `npm run build`：完整质量门槛通过（26 个资源 Schema、MOD 0 问题、严格类型、12 个测试文件/127 项、Round 34 文档审计），Vite 生产构建 132 个模块通过；主 JS 1,895.16 kB / gzip 499.54 kB，超过 500 kB 的 chunk 提示非阻断。
- `git diff --check`：本轮文档收尾后最终复核。

### Added (Round 44)

- **日程邻接漫游事件**：世界图事件条件可声明 `nearbyNpcIds`，引用由 NPC 资源校验；运行时用时段编译后的实际放置坐标要求列出 NPC 全部四向邻近。雾雨渡口新增仅在已知风雨传函、黄昏雨天且石北/白鹭洲都在身边时抽取的一次性「雨夜旧桩之争」。
- **互斥调停任务**：白鹭洲提供「先固旧桩」和「先核渡簿」两种选择，接受一项后另一项失败；完成所选任务发对应门派声望和图谱见闻，状态转移保证不重复奖励。任务面板展示门派/见闻奖励，完成提示反馈实际声望变化与首次发现。
- **资料、规范与回归**：quest-set 扩展一次性声望/图谱奖励，验证引用并沿用存档五态；知识图谱增至 163 节点/258 关系，任务总量增至 32；新增 `npm run smoke:round-44`。

### Verification (Round 44)

- `npm run check`：通过，26 项资源 Schema、MOD 检查、类型检查、11 个测试文件/123 项及文档审计全部通过。
- `npm run build`：通过，132 modules；主 JS 1,894.59 kB / gzip 499.30 kB，Vite 对超过 500 kB 的 chunk 提示为非阻断警告。
- `smoke:round-30`、`smoke:round-31`、`smoke:round-33`、`smoke:round-43`、`smoke:round-44` 与 `git diff --check` 均通过；未做浏览器手动游玩。

### Added (Round 43)

- **漫游奇遇**：世界图可选声明 `randomEvents`（地图、0–1 概率、时辰/天气/见闻条件、一次性与百科发现）；旧资料缺省为空。事件只在玩家成功走格后尝试，不会因载入、等待或跨区误消耗机会，完成 id 复用现有存档集合。
- **五派资格支线**：新增「风雨传函」及听雨剑阁、铁嶂派、云隐山庄、寒山书院、盘舷刀场各一条核验差事；门派与传函见闻在任务列表、接取 API、对白效果事务三处一致校验，已接差事离门后仍可完成。结果对白记录各自后续见闻。
- **资料与图谱**：基础任务增至 30 项，知识图谱增至 158 节点/249 条关系；任务志、地图册、图谱和测试说明同步，任务总量 smoke 扩展到 R43 仍维持 R31/R42 断言。
- **R43 回归**：新增漫游奇遇协议 6 项、五派支线集成 3 项；新增 `npm run smoke:round-43`。

### Verification (Round 43)

- `npm run check` 通过：26 项资源 Schema、MOD 检查 0 问题、类型检查、10 个测试文件/117 项、Round 34 文档审计。
- `npm run build` 通过（131 modules；主 JS 1,891.37 kB / gzip 498.43 kB）；Vite 保留超过 500 kB 的非阻断 chunk 提示。
- `smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33`、`smoke:round-43` 通过。浏览器手动游玩未测。

### Added (Round 42)

- **雾渡旧簿原创主线章节**：接续「渡籍补录」新增「旧簿验痕 → 两家对页 → 封存水痕」三段任务，并由顾夜尘、柳听澜、祝九弦、白鹭洲四名既有 NPC 的资料对白推进。对白条件按任务阶段开放取证；渡籍封印拓痕只通过对话原子授予并作为末段收集目标，不进入商店且不可买卖。
- **互斥抉择与双结局**：玩家选择「明册立约」或「护证留印」其一后，另一分支失败并锁定；终端对白分别记录「公簿昭潮」或「灯下留痕」见闻，与对应任务状态一起满足结局条件。两种接取入口（NPC 对话或任务名录）共用结局见闻解锁逻辑。
- **知识图谱与数量更新**：添加 13 个主线/证物/事件/结局节点和 26 条关系。基础资料现有 25 项任务、51 件物品、147 个图谱节点、228 条关系、7 个结局。
- **R42 集成回归**：新增 `tests/round42-story.test.ts`（3 项，验证完整任务链状态机、互斥失败、两条结局可达及四张对白图无悬空引用）与 `npm run smoke:round-42`；Round 27 烟测的 MOD 孤立结局断言改为随结局集动态计数，Round 33 旧数量输出去固定化。同步任务、结局、物品、知识图谱、测试与 GDD 文档。

### Verification (Round 42)

- `npm run smoke:round-42`、`smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33` 全部通过；`npm run check` 通过（26 资源 Schema、0 MOD 问题、严格类型检查、8 文件 108 用例、文档一致性审计）；`git diff --check` 通过。
- `npm run build` 通过（131 modules；主 JS 1,887.10 kB / gzip 497.63 kB）。Vite 给出既有的超过 500 kB chunk 优化提示，不影响构建。
- 浏览器手动游玩与物理手柄未测；本轮引擎代码未改动，验证聚焦资料装配与剧情闭环。

### Added (Round 41)

- **六项持久化界面设置（输入方案与无障碍显示）**：`src/game/settings.ts` 的 `GameSettings` 在音量/文字大小之外新增 `movementLayout`（方向键+WASD / 仅方向键 / 仅 WASD）、`gamepadEnabled`、`highContrast`、`reducedMotion`，文字大小新增 1.6"最大"档（五档 0.85–1.6，设置页布局按该档校验）。载荷解析向后兼容 Round 09 的 `{ volume, textScaleIndex }` 旧载荷（缺失新字段补默认；任一已知字段"存在但无效"整载荷拒绝回默认且不动存储——与旧两字段规则同语义）；主菜单与暂停菜单设置页由共享 `settingsRows`/`adjustGameSetting` 渲染与调整（6 行，两处永不漂移），调整即时 `applyGameSettings`（声音总线音量 + 画布高对比度 CSS 滤镜 `contrast(1.4) saturate(1.25)` + 全面板 `uiFontSize`）并持久化。
- **Phaser-free 输入设置模块 `src/game/input-settings.ts`**：键盘移动布局解析/键集/逐键启用判定/帮助文本；标准手柄方向解析（D-pad 布尔基数优先、左摇杆 0.5 死区、主导轴、对角水平优先、非有限值防御）；标准映射采样（A→确认、B→返回）；`GamepadEdgeTracker` 把按住的摇杆/按键转为按下沿（持续按住只触发一次、换向即新边沿、释放重触发、`reset()`）——这是"手柄按住不逐帧移动"的机制核心。零 Phaser 依赖，纯 Node 可单测。
- **手柄输入接入**：`src/main.ts` 以 `input: { gamepad: true }` 启用 Phaser Gamepad 插件；`GridScene.update()` 与 `MenuScene.update()` 每帧采样首只标准手柄并经边沿检测分派——探索中 D-pad/左摇杆单步移动、A 交互（等同 E）、B 暂停（等同 Esc）；主菜单/暂停菜单中上下选行、左右调设置、A 确认、B 返回（`PauseMenuPanel.handleGamepadEdges`）；暂停菜单持有屏幕时游戏内动作改走路由。全部手柄动作以 `gamepadEnabled` 持久设置为门，无设备或关闭时轮询早退，键盘行为零变化。
- **移动键位布局接入**：探索移动八键保持绑定但处理函数按下时读 `currentMovementLayout()` 门控（切换无需重绑、下一个按键即生效）；HUD 首行与 H 键操作手册的移动说明随布局更新（暂停菜单关闭时刷新），操作手册同时显示手柄开关状态说明。
- **减少动态效果贯穿呈现层**：开启后玩家移动瞬移并同帧完成（伙伴跟随/区域事件/热重载安全边界回调全保留，游戏状态推进路径不变）、昼夜与天气色调直接设值不播 600 ms 渐变、NPC 日程重定位直接定位不播 420 ms 补间、雨/雪粒子不生成且开启设置时立即销毁既有粒子；`applyGameSettings` 顺带修复了声音管理器为 `undefined` 时（mock/极端环境）的空引用边界（`!= null`）。
- **回归测试 42 用例**：`tests/settings.test.ts`（21：v1 旧载荷迁移与旧存储字节不动、完整六字段往返、新字段无效拒绝、越界/损坏回退、写入拒绝会话内生效、mock game 断言声音总线音量与画布滤镜、五档字号单调、共享行/调整钳制与循环）与 `tests/input-settings.test.ts`（21：布局解析与键集、逐键启用、帮助文本、死区/主导轴/对角/非有限值、D-pad 优先与对向消解、标准映射采样、边沿检测全部语义）。`npm test` 更新为 7 文件 105 用例。
- 新增 `docs/ACCESSIBILITY.md`（六项设置作用范围、手柄标准映射与浏览器设备发现限制、高对比度=画布级滤镜而非 WCAG 逐元素审计、减少动态逐项对照表）；`docs/REFERENCES.md` 登记 Phaser Gamepad/GamepadPlugin 官方 API 文档（#17、#18）；README 进度/命令/文档索引与 `docs/TESTING.md` 覆盖表/变更记录同步。

### Verification (Round 41)

- 本机（Windows 11、Node v22.18.0）：`npm run check` 通过（26 资源校验、0 MOD 问题、类型检查、7 文件 105 用例、文档审计）；`npm run build` 通过（主 JS 1,886.46 kB / gzip 497.52 kB，较 R40 +4.45 kB）；`npm run smoke:round-20/30/33/35/36/37` 全部通过；`git diff --check` 通过（仅换行提示）。
- 浏览器烟测（生产构建 + `vite preview` + Playwright，键盘路径）：主菜单设置页 6 行导航——高对比度开启当帧画布 `style.filter` 变为 `contrast(1.4) saturate(1.25)` 且 localStorage 写入完整六字段载荷，刷新页面后启动路径自动恢复滤镜（跨启动保留）；移动键位切至"仅 WASD"并调字号后进游戏——按方向键画面零变化、按 W 画面变化（布局门控端到端生效，`w:87` 按键经页面监听核验）；暂停菜单设置页 6 行调整减少动态效果成功持久化；开启减少动态后移动仍发生（截图哈希变化）且等待 6 秒后画面完全静止（无粒子/补间残留）；控制台无新增错误（仅既有 favicon 404 与既有锻造配方警告）。
- **物理手柄硬件未测试**：无控制器环境。手柄方向解析、死区、边沿与菜单路由逻辑由 42 个单元测试覆盖；浏览器内手柄路径未做硬件验证，浏览器"先按按钮才开放设备"的行为以文档说明（`docs/ACCESSIBILITY.md`）。

### Added (Round 40)

- **可重复性能/内存基准 `npm run benchmark:round-40`**（与常规 `npm test` 双向隔离）：入口 `scripts/benchmark-round-40.mjs` 串联两段——① Vitest bench 通道（`tests/performance-round-40.bench.ts`，由 `vitest.config.ts` 新增的 `benchmark.include` 只匹配 `tests/` 下 `*.bench.ts`；普通 `npm test` 的 `*.test.ts` glob 与 Vitest 普通 `run` 模式都看不到基准文件），以 `NODE_OPTIONS=--expose-gc` 把 GC 暴露给 worker；② 裸 Node 通道（`scripts/benchmark-round-40-bare.mjs`）用 Vite `build.ssr` API 打包真实渲染器后纯 Node 计时。Vitest 5 的基准 API 已改为 `test()` 回调中的 `bench` fixture（不再是顶层导入），官方来源登记于 `docs/REFERENCES.md` #16。输出 Node/平台/CPU/GC 环境、每图场景对象数与绘制调用数（结构）、四尺寸渲染耗时、真实 26 资源 `loadGameData` 耗时（内存 fetch stub，零网络）与 50 轮长跑的 GC 后堆观察；毫秒/堆读数全部为描述性观察，仅保留结构性断言（每轮 26 资源/0 诊断）。
- **地图渲染重写为单 Graphics 层：每张图场景对象 O(3N+1) → O(1)（恒 2）**：`src/engine/grid-map-renderer.ts` 新增纯函数 `buildGridMapDrawCommands`（每格 4 条命令：底色 fill → 边线 stroke → 顶部亮边 fill → 右缘暗边 fill；顺序、几何、明暗派生与 alpha 与旧 tile-per-rectangle 渲染逐项一致，瓦片颜色解析/明暗派生按颜色字符串缓存），`renderGridMap` 把命令烘焙进单个 Graphics（连续相同 fillStyle/lineStyle 去重）并挂入返回的 Container——公共签名与地图切换 `mapLayer?.destroy()` 容器销毁语义不变；`cellCenterOffset` 改返回普通 `{ x, y }`；模块改为 `import type Phaser`（运行时零依赖，命令生成可在纯 Node 测试与基准，旧渲染器因运行时导入 Phaser 无法进 Node 进程）。基线（16×9/32×24/64×48/128×96 = 433/2,305/9,217/36,865 个对象）→ 重写后全部恒 2 个；裸 Node 口径 12,288 格命令生成约 4 ms；Vitest 口径（模块 runner 开销主导，绝对值偏大约三个数量级）合成时间运行间噪声内持平。详见新增 `docs/PERFORMANCE.md`（命令、环境、读数与方法局限）。
- **渲染器结构回归测试 `tests/grid-map-renderer.test.ts`（10 用例）**：场景对象数随面积 16 倍增长恒为 2；逐格命令顺序与几何/颜色/alpha 精确断言；绘制范围与地图像素宽高一致；Graphics 挂在返回容器内（`destroy()` 级联语义）；样式去重（lineStyle 全图一次）；`cellCenterOffset` 坐标计算。`npm test` 更新为 5 文件 63 用例。
- README（进度至 R40、命令区补 `benchmark:round-40`、用例数 63）；`docs/TESTING.md` 新增「性能基准：与单元测试双向隔离」章节、覆盖表/关系表/变更记录更新；`docs/REFERENCES.md` 登记 Vitest 官方基准/迁移指南（#16）。

### Verification (Round 40)

- 本机（Windows 11、Node v22.18.0、Intel Core Ultra 5 225H）：优化前基线与重写后用同一命令 `npm run benchmark:round-40` 各采集两轮以上，结构读数（对象数）前后对比 433/2,305/9,217/36,865 → 恒 2，50 轮长跑每轮 26 资源 0 诊断、GC 后堆差值 +1.3~3.4 MiB 区间无累积趋势；`npm run check` 通过（26 资源校验、0 MOD 问题、类型检查、5 文件 63 用例、文档审计）；`npm run build` 通过（130 modules、主 JS 1,882.01 kB / gzip 495.80 kB，与 R39 基线一致）；`npm run smoke:round-20/30/33/35/36/37` 全部通过（地图占格、人物、图谱全量映射及 CI 三条回归）；生产构建 + `vite preview` 浏览器烟测：主菜单→创建角色→进入「方格试炼场」渲染正常（网格/边线/明暗边/NPC/敌人/HUD），经关口「石阶渡口」切换「雾渡口」再经「回望石阶」返回，双向 destroy/重建路径渲染完整无残影，无新增 console 错误（仅既有 favicon 404 与 R32 锻造配方可选警告触发的既有聚合通知）。

### Added (Round 39)

- **统一质量门槛 `npm run check`**：以 `&&` 串联固定顺序——`validate:data`（manifest + 26 个基础资源 Schema）→ `inspect:mods`（manifest 中已启用 MOD 覆盖层的只读校验与最终来源；未启用目录不在其覆盖边界内）→ `typecheck`（严格 tsc，含 `tests/` 与 `vitest.config.ts`）→ `test`（Vitest 53 用例）→ `audit:round-34`（文档一致性审计）。任一步非零退出即中止后续步骤并使 `check` 整体非零退出。
- **`npm run build` 改为先过门槛再打包**：由 `tsc --noEmit && vite build` 改为 `npm run check && vite build`——资料、MOD、类型、测试与文档审计任一失败时不会开始 Vite 生产构建；类型检查不重复执行（已含在 check 中）。
- **GitHub Actions 持续集成 `.github/workflows/quality-gates.yml`**：push、pull_request 与 workflow_dispatch 触发；`actions/checkout@v7` + `actions/setup-node@v7`（Node 22、npm 缓存）→ `npm ci`（锁文件精确安装）→ `npm run build`（内含完整 check 门槛与生产构建）→ `smoke:round-35`/`36`/`37` 回归烟测。仅 `contents: read` 权限、`timeout-minutes: 15`、无任何部署/发布步骤。
- README 修正过期进度（原标 Round 36/R37 与 Vitest 4.1.11）至 R39 完成态、Vitest 5.0.2，补 `check`/`test` 命令与 CI 小节；`docs/TESTING.md` 新增「质量门槛、构建与持续集成」章节并更新手段关系表；`docs/REFERENCES.md` 登记 GitHub Actions 官方文档与 checkout/setup-node 官方仓库来源（#14、#15）。引擎运行时代码零改动。

### Verification (Round 39)

- 本机：`npm run check` 通过（26 资源校验、0 MOD 问题、类型检查、4 文件 53 用例、文档审计，exit 0）；`npm run build` 先完整运行 check 再通过 Vite 8.3.1 生产构建（130 modules、约 1.01 s，主 JS 1,881.37 kB / gzip 495.56 kB；500 kB 分包建议仍为非阻断提示）；临时必败测试实证 `npm run build` 于 test 步骤 exit 1 且未启动 Vite 打包；`npm run smoke:round-35`、`smoke:round-36`、`smoke:round-37` 全部通过（真实 `mods/` 与 manifest 字节不变）；`git diff --check` 通过。用预装 PyYAML 解析并结构校验 workflow 通过。
- 构建门槛失败实证：临时加入类型正确的必败 Vitest 用例后运行 `npm run build`，命令 exit 1 且未进入 Vite 生产构建；移除探针后全套门槛与构建恢复通过。用系统预装 PyYAML 解析并结构断言 `.github/workflows/quality-gates.yml`，通过。GitHub 托管运行仍需待 workflow 远端首次实际执行确认。

### Added (Round 38)

- **Vitest 测试基线**：新增 dev 依赖 Vitest 5.0.2（官方 Vite >=6.4、Node >=22.12 要求与本仓库 Vite 8.3.1、Node 22.18 相符；npm peer/engine 元数据已核验）与 `npm test`（`vitest run`）。测试使用**独立 `vitest.config.ts`**（Node 环境、`tests/**/*.test.ts`）：Vitest 在两配置并存时只读测试配置、完全不加载异步的 `vite.config.ts`，避免其动态加载开发态 HMR 插件和注册 `mods/` dev 中间件；`tsconfig.json` include 纳入 `tests/` 与 `vitest.config.ts`，测试代码接受同等严格类型检查（含 `noUncheckedIndexedAccess`）。ADR-0005 与来源/精确版本许可表已按实施核验更新。
- **数据校验器抽取为可导入共享模块** `scripts/lib/data-validation.mjs`：`validateBaseData(root)` 校验 manifest Schema 与全部基础资源 Schema，返回结构化结果 `{ ok, validated }` / `{ ok: false, problems }`，不打印、不抛错；文件缺失/JSON 损坏、无效 Schema 编译与 JSON `null` 均折叠为可读 problem 而非异常。`scripts/validate-data.mjs` 变为薄 CLI：成功输出与历史逐字节一致，失败逐条打印 problem 到 stderr 并保留非零退出语义；附 `data-validation.d.mts` 类型声明供严格 TS 测试直接导入同一实现（CLI 与测试永不双轨）。
- **四组 53 个单元测试**（只调公共 API、断言行为；无 Phaser/DOM/网络/时钟依赖）：
  - `tests/event-bus.test.ts`（10）：`on`/`off`/unsubscribe 身份语义与幂等、`once` 恰好一次、**once 重入**（监听器内重发自身事件不再触发自身、重入投递达新订阅者）、`emit` 快照迭代（投递中新增订阅不收当次）、`clear`/`listenerCount`。
  - `tests/dialogue.test.ts`（18）：`parseDialogueSet` 正反向（信封破损整份拒绝、单段坏对话仅隔离自身并警告）、`validateConversation` 图语义（重复节点/缺失起始节点/悬空目标）、`isConditionMet` 六类条件（含道德区间端点、itemCount 无背包防御、npcKnows 默认说话人）、`getVisibleOptions` 多条件全满足/索引指向原始数组/空结果即结束节点、`DialogueSession` 播放与敌意输入忽略。
  - `tests/quest-system.test.ts`（18）：`parseQuestSet` 防御解析、`assembleQuests` 装配（坏发布人剔除、前置循环禁用、互斥组整组校验）、`createQuestJournal` 初始 offered/locked、接受/推进/完成/失败全生命周期（npc-talk 推进与奖励结算、item-count 绝对数量同步并按需求钳制、接取时背包快照即时完成、encounter-defeat 失败并清追踪、abandon 终态、互斥分支连带失败、前置完成后解锁）。
  - `tests/data-validation.test.ts`（7）：**真实仓库**全量正向校验 + 临时 fixture 反向五例（资源违反 Schema、manifest 违反 Schema、资源文件缺失、无效资源 Schema、JSON `null` 数据）及真实 CLI 子进程失败输出/非零退出断言；fixture 于 `mkdtemp` 临时目录构造并在 `afterEach` 清理，受版本控制的 `data/` 零改动。
- 新增 `docs/TESTING.md`（命令、配置取舍、覆盖矩阵、CLI/测试同源关系与编写约定）。

### Verification (Round 38)

- `npm test`：4 个测试文件、53 个用例全部通过；`npm run typecheck`：通过；`npm run validate:data`：通过（manifest + 26 个基础资源 Schema）；`npm run smoke:round-37`：通过（内容包回归）；`npm run build`：通过（130 modules；Vite 保留既有非阻断 chunk 建议）；`git diff --check`：通过。初稿复核补齐了无效 Schema 编译错误、JSON `null` 数据和真实 CLI 失败退出三条边界路径，详见 `DEVLOG.md`。

### Added (Round 37)

- **单文件 v1 内容包格式**：新增 `data/schema/content-package.schema.json` 约束包层结构（`formatVersion`、包 id/名/版本、`minimumEngineVersion`、资源 id + SHA-256 + 数据本体）；资源条目禁止携带任何文件路径——安装路径唯一来源是目标仓库 manifest 的资源登记。校验和基于递归键排序的规范 JSON（UTF-8、无空白），与源文件排版无关。
- **导出命令 `npm run content:export`**（`scripts/content-package.mjs`，可导入函数 + CLI）：把 `mods/<modId>/` 传统无元数据布局迁移为确定性 v1 包；资源按 manifest 顺序排列、同一输入重复导出字节级一致；资源 Schema 与包自身 Schema 均校验；超过 10 MiB 的导出包与已存在输出路径均拒绝；孤儿文件（未登记路径）、坏 JSON、Schema 不符、不安全 id/版本在导出时点名拒绝，不产出半成品包。全程只读源 MOD。
- **导入命令 `npm run content:import`**：默认只读预检——包大小硬上限（默认 10 MiB，读入前生效；导出端也拒绝产出超限包）、包 Schema 全量校验、未知/未来 `formatVersion` 可读拒绝（提示升级）、`minimumEngineVersion` 严格三段数字逐段比较（宽松串拒绝）、包内资源 id 去重与登记检查、逐资源校验和与当前 Schema 校验，全部通过才放行。`--apply` 先整包校验，再写入 `mods/` 下同盘暂存目录并原子改名为 `mods/<包id>/` 全新目录；目标已存在（暂存之后检查）即清理并拒绝，不覆盖任何内容，不改 `data/base/manifest.json`、不自动启用。
- **专项烟测 `npm run smoke:round-37`**：在隔离临时仓库覆盖规范 JSON/严格版本单元（含 `__proto__` 键保真及超安全整数拒绝）、传统 MOD 导出→预检往返、确定性序列化、导出元数据/自身 Schema 与大小校验、默认零写入、成功安装（manifest/基础资料字节未动、未启用、无暂存残留）、目标冲突与暂存清理、已存在包文件拒绝覆盖、超限导出拒绝、篡改校验和、Schema 不符、重复/未知资源、重复 manifest 路径拒绝、穿越 id（`../evil`、`a/b`、`.hidden`）、资源级夹带 `path` 字段、未来 `formatVersion`、按 `--repo` 目标版本检查引擎兼容、引擎过新、宽松/超范围版本串、包大小上限、导出侧孤儿/坏 JSON/坏 Schema 诊断，以及真实 CLI 导出-预检-应用-冲突-用法错误全链路；结尾断言真实 `mods/` 与 manifest 字节不变。
- 新增 `docs/CONTENT-PACKAGES.md`（格式规范、命令、预检/安装流程、版本兼容策略、迁移语义、安全模型与 FAQ）；`docs/DATA-GUIDE.md` §5.5、§7 与变更记录同步。

### Verification (Round 37)

- `npm run smoke:round-37`、`npm run validate:data`、`npm run inspect:mods`、`npm run typecheck`、`npm run build`、`git diff --check`：通过；真实仓库手动演练（导出 `mods/example` → 只读预检 → 对已存在目标 `--apply` 被拒）与构建体积见 `DEVLOG.md`。

### Added (Round 36)

- 开发服务器新增 Vite 8 Environment API `hotUpdate` 插件：仓库内 `data/**/*.json` 与 `mods/**/*.json` 的新增、修改、删除广播 `wuxia:data-change`，自定义处理后不触发 Vite 整页刷新；源码、非 JSON 与仓库外路径不转发。
- 菜单和游戏场景接入开发态资料热重载。菜单更新当前角色模板；游戏在输入锁定且离开移动/战斗/面板状态后重载并重新组装 manifest 全集，通过内存 `SaveSnapshotV1` 与现有存档预检恢复兼容的角色进度，不写用户存档槽。初始载入或热重载中再次发生的文件变更会排队再次加载；不兼容或关键资料失效时保留旧世界与运行字段并提示原因。
- 新增 `npm run smoke:round-36`：覆盖路径分类、真实 Vite HMR WebSocket 修改/创建/删除事件、通知合并/退订、数据 JSON 变更不整页刷新，以及生产构建不含客户端热重载桥接；临时探针均清理。
- 更新 Vite HMR 架构/资料指南、README、引用来源、路线图及开发日志，明确整世界重读的跨资源一致性策略、热重载安全边界和生产限制。

### Verification (Round 36)

- `npm run smoke:round-36`、`npm run typecheck`、`npm run validate:data`、`npm run inspect:mods`、`npm run build`、`npm run smoke:round-30`、`npm run smoke:round-31`、`npm run smoke:round-33`、`npm run smoke:round-35`、`npm run audit:round-34`、`git diff --check`：通过；构建体积及真实 Vite 演练详情见 `DEVLOG.md`。

### Added (Round 35)

- **MOD 优先级与来源追踪**：`DataLoadResult` 新增 `enabledMods`（manifest 声明顺序原样暴露）；`LoadedResource` 携带 manifest 相对 `path`；成功装配的 `LoadedWorld` 新增 `enabledMods`、`resourceSources`（按 manifest 顺序的每资源最终来源）与 `modDiagnostics`（按 `mod:` origin 过滤）。覆盖语义不变：后声明且校验通过的层获胜，坏覆盖原子回退到上一有效值。
- **可行动诊断**：`Diagnostic`/`data:resource-error` 事件新增可选 `path`（问题文件 URL）与 `hint`（修复建议）。JSON 语法错误、schema 不符、语义校验失败、文件缺失、manifest 损坏等路径均给出精确文件定位与下一步操作（改哪份文件、按哪个 schema、或如何从 `enabledMods` 移除该 MOD）。
- **游戏内 F2「MOD / 资料状态」面板**（`src/game/mod-status-ui.ts`）：三页分栏——生效顺序（覆盖规则与每层优先级）、资源来源（每个成功资源的最终来源与基础/覆盖文件路径）、MOD 诊断（失败原因、精确覆盖 URL、逐条错误与修复提示）；也把运行时装配时被部分禁用的 MOD 资源警告归因到最终来源层并补出文件位置。↑/↓ 浏览、←/→ 翻页、F2/Esc 关闭，打开期间探索输入锁定，关闭经 `noteOverlayClosed` 恢复；shutdown 时随场景销毁。帮助面板（H）与 HUD 加入 F2 入口，MOD 回退提示行由"详情见控制台"改为"按 F2 查看原因与修复建议"。
- **只读检查命令 `npm run inspect:mods`**（`scripts/inspect-mods.mjs`）：按真实 manifest 顺序校验 manifest 自身、每个基础资源与每个已启用覆盖的 JSON 可读性与 schema（Ajv draft-07），输出每资源的基础层/各 MOD 层/最终来源；坏层给出精确文件路径、错误明细与修复提示并以非零退出；明确注明跨资源语义校验仍由运行时加载器执行；检查逻辑可导出复用，全程不写任何文件。
- **专项烟测 `npm run smoke:round-35`**：用项目 TypeScript 即时转译真实 `data-loader.ts`，配合临时 fixture 目录 + 内存 fetch 驱动真实 `loadGameData`——验证双 MOD 先后覆盖（后有效层获胜）、坏 JSON/schema 覆盖原子回退、最终来源顺序、精确文件路径与修复提示；直接核验运行时跨资源装配警告归因到实际 MOD 来源且基础资料警告不会误标为 MOD。再以 `inspectMods` 交叉核验层状态与最终来源，并覆盖“坏基础资源不能由 MOD 救回”和损坏 manifest 的可读失败；确认真实 manifest 的 `enabledMods` 仍为空，临时产物全部清理。
- `docs/DATA-GUIDE.md` §5 扩写为「MOD 覆盖规则与作者工作流」：覆盖语义、启用/排序步骤（改 manifest 后重进游戏，热重载在 R36）、`inspect:mods` 提交前检查、F2 游戏内排错；`README.md` 命令表与 MOD 工作流提示同步更新。

### Verification (Round 35)

- `npm run inspect:mods`（真实 manifest：26 项资源全绿、0 问题、exit 0）、`npm run smoke:round-35`、`npm run validate:data`、`npm run typecheck`、`npm run build`、`npm run smoke:round-30`、`npm run smoke:round-31`、`npm run smoke:round-33`、`npm run audit:round-34`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 34)

- 新增世界设定总览 **`docs/WORLD-SETTING.md`**：以当前基础 JSON/对白/人物志/门派志/任务志/GDD 为证据源，整理世界背景（大雍末年设定、抄书学徒主角、架空历法气候）、区域地理（方格试炼场、雾雨渡口两张正式地图与「芦苇河滩」图鉴地点的区分）、五派格局、渡籍轮值章程与雾渡药道会盟（铁嶂 vs 云隐）、关键人物分组与已实现冲突走向；每节标注权威数据文件，推断与已实现事实分列，未落地内容只作为路线设想，不虚构额外历史年代/远方地图/后续结局。
- 校准三份资料手册：`docs/MAP-ATLAS.md` 补全地图资源总表（id、尺寸、玩家起点、瓦片通行性、舆图坐标）、全部关口端点坐标表（含引擎装配规则）与区域事件触发格表（坐标/一次性/条件/发现节点）；`docs/DIALOGUE-GUIDE.md` 效果主表补齐 `recruitCompanion`/`dismissCompanion`，新增「校验分层」章节明确 Ajv Schema 静态校验（资源级）、防御性图解析（单段隔离）与跨资源装配（逐选项剔除）三层边界；`docs/QUESTS.md` 精确化 `talkToNpc` 谈话信号语义（`openDialogueWith` 唯一入口：F 键交谈与无名录/商店 NPC 的 E 键回落都算，任务告示板不算）并注明审计核验范围。
- 新增 `scripts/audit-round-34-docs.mjs` 与 `npm run audit:round-34`：只读文档一致性审计。按 manifest schema 家族收集地图/NPC/遭遇/任务/门派/历法/气候/图谱事实，从 `dialogue-set`/`quest-set` Schema 封闭枚举提取全部条件/效果/目标 kind；核验地图资源与 world region 双向一致、每个关口/事件的坐标边界与按 `tileTypes` 复现的通行性、事件引用的时段/天气/知识节点、四份文档对上述事实的覆盖（含每项任务「名称+发布人+前置+失败遭遇+报酬」行级匹配）；计数全部由数据推导，不硬编码任务/地图总数，不依赖 app UI 易变中文措辞；漂移时逐条输出文档路径与缺失项并以非零退出。临时目录故意制造五类漂移并验证 exit 1，六条预期诊断全部命中（关口坐标缺陷报告两条）。

### Verification (Round 34)

- `npm run audit:round-34`、`npm run validate:data`、`npm run typecheck`、`npm run build`、`npm run smoke:round-33`、`npm run smoke:round-31`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 33)

- 知识图谱由 54 节点扩至 **134 节点**，与当前基础目录全量对齐：50 件物品、30 种武学、20 项任务全部按稳定业务 id 映射到正确 `kind`（此前三类分别只映射 15/3/2 条）；12 名 NPC、5 个门派、2 张地图资源与 5 个结局节点覆盖不变。新增物品/武学词条首次取得或学会前保持未知（沿用 Round 29 观察式发现），新增任务词条沿用基础差事公开惯例，结局词条默认未知。
- 关系由 58 条扩至 **202 条**，补齐五类闭环：27 种门派武学 → 所属门派的 `belongsTo`；姜百味 31 个货架条目的 `holds`（含常备/限量说明）；9 条锻造配方结果 → 全部投入材料的 `requires`；20 项任务的发布人 `participatesIn`、15 条前置依赖、9 个收集目标与 12 个谈话目标的链路边；五条结局的每个图谱可判定条件来源（任务/见闻/门派在籍/NPC 关系）→ 结局节点的 `influences` 边。遭遇等无图谱节点的业务 ID 不伪造节点，纯数值条件不造无意义边。
- 新增 `scripts/smoke-round-33.mjs` 与 `smoke:round-33` 命令：以真实 JSON 对照断言目录 kind 全量映射（双向集合相等）、≥100 节点、节点/关系 id 唯一、全部边端点闭合、货架持有与锻造投入路径、武学门派归属、20 任务发布人与前置/目标链路、遭遇不入侵图谱、结局节点映射与条件影响边闭环；不依赖中文文案措辞。

### Verification (Round 33)

- `npm run validate:data`、`npm run smoke:round-33`、`npm run smoke:round-27`、`npm run typecheck`、`npm run build`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 32)

- 基础物品由 25 项扩至 **50 项**：新增 8 种药品、8 件装备、9 种锻造材料。八件新装备中两件可在姜百味货担购得，六件由铁砧连续锻造；19 项新增货架条目进入现有滚动商店，其余成品由六条配方取得。
- 基础武学由 6 种扩至 **30 种**：新增 24 种原创门派功夫，分配到听雨剑阁/铁嶂派/云隐山庄/寒山书院各 5 种、盘舷刀场 4 种，覆盖现有六类武学协议。
- 五位导师新增门派授艺目录；等级、属性和门派资格不符或已经习得时选项隐藏，学习效果仍由既有对话事务验证。资料只修改物品、武学、商店、锻造与对话 JSON，没有新增引擎名称或剧情分支。
- 新增 `docs/ITEMS.md`、`docs/MARTIAL-ARTS.md` 与 `scripts/smoke-round-32.mjs`；专项烟测覆盖总量/增量、唯一 ID、物品取得和配方材料闭合、五派授艺路径、实时学习/重复学习与完整世界装配。

### Verification (Round 32)

- `npm run validate:data`、`npm run typecheck`、`npm run smoke:round-32`、`npm run smoke:round-31`、`npm run smoke:round-30`、`npm run build`：通过；完整输出和构建体积提示见 `DEVLOG.md`。

### Added (Round 31)

- 基础任务链扩至 **20 项原创差事**：在既有「巷口送药」「巷口除患」之外新增 18 项，横跨方格试炼场的巷陌口信与雾雨渡口的药道抉择，覆盖收集、交谈、胜利推进与败北失败；12 名 NPC 全部标记为任务发布人，奖励、前置与文本全部数据驱动（任务志见 `docs/QUESTS.md`）。
- 任务协议新增**可选互斥分支 `exclusiveGroupId`**：同组且前置完全一致的任务构成一次玩家选择，装配时整组校验（有效成员不足 2 项或前置不一致即整组禁用，坏成员绝不留下假单选）；接取其一会按声明顺序把同组仍处待接取的兄弟确定性地记为失败并在结果中报告其 id，面板同步提示「另一条岔路就此封止」。本轮落地「先保药队 / 先修栈桥」分支，同列在白鹭洲的任务告示板供玩家比较，提供各自专属后续与差异化报酬（A 线偏历练 85 经验/50 银两，B 线偏实利 77 经验/93 银两）。
- 任务协议新增 **`talkToNpc` 谈话目标与 `npc-talk` 信号**：目标对已放置 NPC 校验（无须是发布人）；只有玩家实际打开 NPC 对话（F 键交谈，或 E 键对无名录/商店 NPC 的交谈回落）才推进目标——按 E 打开任务告示板不算谈话，接取差事的同一次交互也不自动完成谈话目标。`collectItem`/`defeatEncounter` 行为不变。
- 新增 3 个任务专用遭遇（雾夜探子、芦苇水路伏兵、栈桥索银人，均在雾雨渡口南岸空行），触发格避开全部人物、区域事件、关口、工位、药炉、门派战入口、终章入口与出生点；3 项新差事声明明确 `failOnEncounterIds` 战败失败（连同旧巷口除患共 4 项）。
- 存档不升版本：互斥失败态与谈话计数复用既有 `locked/offered/active/completed/failed` 五态与按目标 id 的 v1 计数快照；Round 31 之前的旧 v1 档读入后新任务按当前资料初始化，无需迁移。
- 新增 `scripts/smoke-round-31.mjs` 与 `smoke:round-31` 命令：数量与全局 id 唯一、三型目标与互斥组解析、坏引用逐条隔离与互斥组整组校验、完整世界装配零警告、新遭遇槽位避让与可达性、谈话信号语义（接取不自动完成/错人不推进/单次奖励）、物品接取快照、败北失败原子锁链、互斥分支双向原子性与幂等、`npc-talk` 唯一入口源码断言、v1 快照往返与 R31 前旧档免迁移恢复。

### Verification (Round 31)

- `npm run validate:data`、`npm run typecheck`、`npm run smoke:round-31`、`npm run smoke:round-30`、`npm run build`：通过；命令与输出细节见 `DEVLOG.md`。

### Added (Round 30)

- 基础世界扩至 **12 名可交互 NPC 与 5 个可拜师门派**：新增寒山书院教习柳听澜（方格试炼场）、盘舷刀场教头祝九弦与渡董白鹭洲（雾雨渡口）；两名导师经现有数据驱动对话正式收徒，白鹭洲承担渡口地方知识传递与跨门派议事（渡籍轮值章程见闻、会盟结果报备入籍、门派弟子登记）。
- 新门派寒山书院与盘舷刀场复用现有 admission/departure 协议与通用拜师运行时，未新增引擎分支；祝九弦传授既有通用武学「拦门刀法」，寒山书院暂不授专属武学（对话不引用武学条件，避免表面可见而不可用的选项）。
- 对话族改为多资源装配：manifest 中每个 `dialogue-set` 资源都参与合并（重复 id 保留清单先声明者），新增 `dialogues/round-30-conversations.json` 并登记；可选内容的坏档降级改按 manifest 声明的 schema 家族判断，不再按固定资源 id 枚举。引擎改动为通用机制，不含任何剧情、人名或门派名。
- 知识图谱新增 6 个节点（三名新人物、两个新门派、见闻「渡籍·轮值章程」）与 13 条关系边（师承、驻地图、渡籍掌录、轮值影响与人物态度传播）；新增人物志 `docs/CHARACTERS.md` 与门派志 `docs/FACTIONS.md`。
- 新增 `scripts/smoke-round-30.mjs` 与 `smoke:round-30` 命令：数量下限与新增恰数、全局 id 唯一、两图放置/日程零警告、固定互动格全避让、导师引用、拜师/授艺/退门事务与拒绝路径零变更、对话合并解析、图谱端点与态度边、完整世界装配及结局/门派战兼容负向保护（新门派不出现在任何结局条件或战争双方）。

### Verification (Round 30)

- `npm run smoke:round-30`、`npm run typecheck`、`npm run validate:data`、`npm run smoke:round-29`、`npm run smoke:round-28` 与 `npm run build`：通过；命令与输出细节见 `DEVLOG.md`。

### Added (Round 29)

- 新增独立 L 键江湖图鉴：按知识图谱八类展示已发现/总量和比例，未知条目只展示汇总数量，不暴露标题和摘要；K 键百科保留已知见闻与关联查询。
- 知识图谱引擎新增纯函数分类进度投影及同 ID/kind 观察式解锁；与人物交互、首次迎战、抵达对应地图、持有物品、习得武学会自动记入现有发现集合。
- 战斗遭遇可选声明 `knowledgeNodeId` 人物引用；首次迎战解锁对手词条，坏的可选图谱引用被忽略并警告，不影响遭遇战斗。
- 发现状态仍复用 v1 `knownKnowledgeNodeIds`，未增加重复图鉴数据集、存档字段或协议版本；更新键位帮助、知识图谱、数据指南、架构、GDD 和专项烟测。

### Verification (Round 29)

- `npm run smoke:round-29`、`npm run typecheck`、`npm run validate:data`、`npm run smoke:round-28` 与 `npm run build`：通过。
- 本地浏览器手动验证：新开局后 L 可打开图鉴，按 → 键切换到人物类并正确显示 5/10 与 50%；关闭图鉴后 K 可单独打开百科。
- `git diff --check`：通过；Vite 仍提示主 JS chunk 超过 500 kB 默认建议线。

### Added (Round 28)

- 新增可选 `achievement-set` 资料族与 schema（draft-07）；成就条件、展示文本与经验/银两奖励由 JSON/MOD 声明，封闭 14 类条件按 AND 组合，逐条坏成就只禁用自身。
- 新增 `achievement-system` Phaser-free 规则：防御解析、跨资料引用装配、纯函数进度投影（计数/区间/布尔三类展示）与一次性解锁领奖；奖励经验沿用成长协议并联动经脉修为，银两按存档上限截断。
- 新增 v1 可选 `achievementState` 存档字段（历史解锁 id 与战斗/锻造/炼丹三个单调计数器）；旧 v1 缺字段按空基线兼容，解锁 id 不按当前资料过滤以防 MOD 重复发奖。
- 新增 G 键成就面板：锁定/进行中/已解锁状态、逐条件进度、奖励与汇总；帮助面板与状态行加入 G 键提示；战斗胜利、锻造、炼丹与对白/任务等收口点即时重评。
- 新增 14 条基础成就，覆盖等级、差事、见闻、善恶、声望、门派、关系、战斗、擂台、经脉、自创武学、锻造与炼丹。
- 新增 `docs/ACHIEVEMENTS.md`，并更新存档、数据指南、架构、GDD、开发日志与路线图。

### Verification (Round 28)

- `npm run smoke:round-28`、R27/R26/R25 串行回归、`npm run validate:data`、`npm run typecheck` 与 `npm run build` 均通过；构建有主 JS chunk 超过 500 kB 的体积建议。
- `git diff --check` 通过；未进行浏览器手动游玩，G 键面板、键位输入和实际奖励提示未做交互实测。

### Added (Round 27)

- 新增可选 ending-set 资料族与 schema；地图终章入口、结局叙事和任务/善恶/声望/关系/门派/见闻条件均由 JSON/MOD 声明。
- 新增五条可达结局与图谱节点关系，渡口终章面板展示锁定提示、可选归宿及终章文本。
- 新增 Round27 世界装配、几何/引用校验与专项烟测。

### Verification (Round 27)

- 资料校验、完整世界装配、Round27 smoke、R26–R24 回归、类型检查、生产构建均通过；生产主 bundle 仍高于 Vite 默认分包建议线。

### Added (Round 26)

- 新增 NPC 私有见闻状态：由图谱 `knows` 边初始化，玩家可在对白中分享已知节点，后续对白用 `npcKnows` 区分 NPC 实际知情与玩家百科状态。
- 知识图谱人物边支持 `attitudeSpread`；关系变化按有符号系数传播一跳，不递归，端点、范围与零系数规则均经 Schema/parser 检查。
- 新增可选 v1 `social.npcKnowledge` 存档字段与 MOD 删除引用软过滤；旧 v1 读档时根据当前图谱重建 NPC 静态记忆。
- 新增 Round26 专项烟测，覆盖图谱种子、对白引用隔离、事务回滚、态度传播、旧新存档和失效引用过滤。

### Verification (Round 26)

- `npm run validate:data`：通过，manifest 与 23 个基础资源 Schema 均通过。
- `npm run smoke:round-26`：通过 NPC 见闻隔离/分享/后续回应、事务回滚、态度传播系数与方向、v1 新旧兼容及 MOD 引用软过滤。
- 生产构建、Round 23–25 回归及 `git diff --check` 结果在 `DEVLOG.md` 中记录。

### Added (Round 25)

- 新增可选 `alchemy-set` Schema/manifest 资源和同路径 MOD 覆盖；地图药炉、药师、方子、材料/产物跨引用及日程占位可独立校验，无资料时世界可正常运行。
- 新增三味药材、三张需对话发现的药方及三档固定品质成药；悟性决定结果 item id，结果为沿用恢复规则的普通消耗品。
- 新增 Phaser-free 药炼规则和邻接 E 面板；可查看未知药方寻方线索、材料/工钱、悟性产出预览。资金/材料/背包失败不改状态，成功后刷新 collectItem 数量。
- 药方发现复用已知知识 id，成药复用普通物品背包、任务、百科与 v1 存档；新增炼丹资料作者指南，并更新 GDD、架构、图谱、数据、存档、帮助、README、开发日志及路线图。

### Verification (Round 25)

- `npm run build`：通过；122 个模块，主 JS 1,826.18 kB（gzip 481.76 kB）；Vite 仍提示超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 23 个登记基础资源 Schema 通过。
- `npm run smoke:round-25`：通过，覆盖图谱/配方解析、工位占位与四向邻接、发现门控、悟性品质、缺钱/缺料/背包容量拒绝不变性、满包转换、任务收集信号、成药使用、单配方隔离、v1 存档及无资料降级。
- `npm run smoke:round-24`、`npm run smoke:round-23`：顺序回归均通过。
- `git diff --check`：通过；Git 提示部分 LF 工作区文件将在下次触碰时规范为 CRLF。本轮未进行浏览器手动流程，不宣称面板已浏览器实测。

### Added (Round 24)

- 新增可选 `equipment-forge-set` Schema/资源与同路径 MOD 覆盖；工位校验地图可走格、出生点、NPC、遭遇、擂台、门派战、重复工位占位，坏配方按单条隔离。
- 新增渡口锻造工位与三条同槽装备转换配方、三种原创材料及行商货架；配方强制基础装备恰一件、其他投入为杂项、结果属性不降级且至少一项提升。
- 新增 Phaser-free 锻造事务和邻接 E 面板；预览材料库存/银两/进阶装备效果，拒绝已装备投入，克隆背包核验扣料后空间再整体提交；成功后刷新任务收集数量。
- 产物作为普通装备 item id 穿戴并参与属性与战斗伤害，沿用 v1 物品/装备保存和读档重算，无新增快照字段；更新 GDD、架构、数据、存档、锻造说明、README、开发日志与路线图。

### Verification (Round 24)

- `npm run build`：通过；120 个模块，主 JS 1,809.95 kB（gzip 478.95 kB）；Vite 报告主包超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 22 个基础资源 Schema 通过。
- `npm run smoke:round-24`：通过，覆盖资源解析/跨引用/占位隔离、四向邻接、降级配方隔离、缺钱/缺料/穿戴状态拒绝不变性、满包转换、穿戴后战斗伤害变化与 v1 存档恢复。
- `npm run smoke:round-23`、`npm run smoke:round-22`：顺序回归均通过。
- `git diff --check`：通过；Git 提示修改文件将由 LF 规范为 CRLF。本轮未进行浏览器手动流程，锻造 UI 由构建与代码/引擎冒烟覆盖。

### Added (Round 23)

- 新增可选 `meridian-set` 经脉 Schema/JSON 与同路径 MOD 覆盖；验证修为规则、唯一节点、前置 DAG、材料和效果边界，坏经脉资源只关闭内修入口。
- 新增 Phaser-free 内修规则：按资料发放升级修为，逐节点检查等级/前置/修为/材料后原子消耗并解锁；失效材料只禁用该节点及其依赖节点。
- 角色状态独立追踪经脉加成；基础属性、装备和经脉奖金重算，气血/内力上限随等级/换装/经脉同步；普通遭遇、擂台和门派战胜利升级均能获得修为。
- 新增 N 键经脉面板，显示修为余额、节点状态、效果、材料和前置；更新帮助/HUD 操作提示。
- v1 快照保存修为与已打通节点；旧档缺字段兼容，非法余额/重复或过量节点拒绝，MOD 移除节点时过滤并告警，恢复后按当前资料重算效果。
- 新增经脉作者说明及 Round 23 冒烟验证，更新 GDD、架构、存档、数据指南、README、开发日志与路线图。

### Verification (Round 23)

- `npm run build`：通过；118 个模块，主 JS 1,795.26 kB（gzip 475.41 kB）；Vite 报告主包超过默认 500 kB 分包建议线。
- `npm run validate:data`：通过；manifest 与 21 个登记基础资源 Schema 通过。
- `npm run smoke:round-23`：通过经脉 DAG/材料引用隔离、修为上限、原子拒绝、加成重算、战斗升级奖励、新旧 v1 存档和 MOD 节点过滤。
- `npm run smoke:round-22`、`npm run smoke:round-21`：顺序回归均通过。
- `git diff --check`：提交前复核；本轮未做浏览器手动游玩，不宣称 UI 经浏览器实测。

### Added (Round 22)

- 新增可选武学组件资源与 Schema；招式、架势、吐纳可由同路径 MOD 覆盖，缺失/损坏时只禁用创制。
- 新增 C 键自创武学面板，支持组件选择、名称输入、功力/内力/费用预览、5 门上限与平衡预算约束；拒绝交易不扣钱。
- 玩家作品立即加入已学武学，并可用于普通遭遇、擂台与门派战；v1 快照保存完整定义，旧档缺字段默认为空。
- 修复扩展平面 Unicode 组件文本的创制/读档长度单位不一致；名号编辑改为原生文本输入以支持中文 IME，并拒绝存档注入控制字符名称。
- 更新操作提示、README、GDD、原创还原度、架构、数据指南、存档规则和独立创武说明。

### Verification (Round 22)

- `npm run build`：通过；116 个模块，主 JS 1,781.43 kB（gzip 471.51 kB），仍触发 Vite 默认 500 kB 分包建议。
- `npm run validate:data`：通过；manifest 与 20 个登记基础资源 Schema 通过。
- `npm run smoke:round-22`：通过，覆盖组件语义、创制原子性、战斗招式可用及新旧 v1 存档往返/防篡改边界。
- `npm run smoke:round-21`：串行重跑通过，覆盖门派战资料、战斗/贡献和新旧 v1 存档回归；首次并行运行的端口提示未复现。
- `git diff --check`：通过；Git 提示工作树文件 LF 将在后续 Git 操作中规范为 CRLF。

### Added (Round 21)

- 新增可选 faction-war-set 资料和 Schema；会盟入口、参战两派、双方每阶段专属敌手、贡献、结局声望和图谱节点均由 JSON 定义，坏入口/引用逐战隔离。
- E 邻接报名页显示两派完整阶段赛程及战绩；两派门人分别迎战对方的资料敌手，阶段败阵恢复后可继续，贡献门槛决定胜/平/负，撤退会提前结算。
- 会盟后果接入个人/双方门派声望、百科见闻和铁嶂/云隐师长的知识条件对白；门派战敌手不发普通遭遇任务信号。
- v1 快照新增报名/胜平负/贡献战绩；旧 v1 缺字段默认为空，移除战事资料后只清理该条战绩并警告。
- 报名面板按高度分页显示最多 12 个阶段；纯查看不再保存空战绩，存档冒烟覆盖 MOD 过滤后的恢复快照。
- 新增门派战作者说明、双方战斗与存档冒烟脚本，更新数据/架构/GDD/知识图谱/原作还原边界文档及路线图。

### Verification (Round 21)

- `npm run build`：通过；Vite 完成 114 模块构建，主 JS 1,768.18 kB（gzip 467.62 kB），超过默认 500 kB 提示线但不阻断。
- `npm run validate:data`：manifest 与 19 个登记基础资源 Schema 通过。
- `npm run smoke:round-21`：通过，覆盖 12 阶段分页、两派专属阶段战斗、入口/门派引用隔离、贡献胜平负、旧 v1 缺省，以及经恢复预检快照的记录保留/MOD 移除过滤。
- `git diff --check`：通过；Git 仅提示部分 LF 文件后续可能规范为 CRLF。

### Added (Round 20)

- 新增独立擂台 JSON 资料与 arena-set Schema；校验入口格、角色模板、敌方武学、彩头物品及占格冲突，E 邻接打开赛程/奖励/战绩页。
- 报名后自动连续挑战数据对手，共用回合战斗/经验/伙伴援护；胜利逐轮接续，败退/撤退停止，只有全胜夺魁会完整发放文钱和物品彩头。
- v1 快照加入报名次数、最佳胜场、夺魁次数与最近胜场；旧 v1 缺字段为空记录册。
- 新增战绩保存规则、Ajv 全资源校验与 Round 20 Phaser-free 冒烟脚本。

### Verification (Round 20)

- npm run build：通过；112 模块生产构建完成，Vite 显示主 JS 包超过 500 kB 建议线。
- npm run validate:data：manifest + 18 个登记基础 JSON 通过 Ajv。
- npm run smoke:round-20：擂台引用装配/占格隔离、邻接入口、两场通用战斗经验、战绩值域及旧/新 v1 存档往返均通过。
- git diff --check：通过；只有仓库 LF→CRLF 自动转换提示。

### Added (Round 19)

- 新增独立伙伴资料与 draft-07 Schema；伙伴引用有效 NPC，支援专长及行动间隔来自数据。
- 对话加入招募/暂离效果，沿用 NPC 关系条件；场景以不阻挡玩家的同行标记跟随，并可跨区重置位置。
- 回合战斗加入伙伴攻/疗援护与专属战报；P 键伙伴册展示关系/专长并可让伙伴暂离。
- v1 存档记录当前同行伙伴，旧档缺字段归一为空伙伴，已移除伙伴在恢复时清理并警告。
- 新增伙伴数据作者与架构说明，更新对白、存档、GDD 和路线图。

### Verification (Round 19)

- `npm run build`：通过；TypeScript 检查与 Vite 生产构建完成，主 JS 包仍超过 500 kB 建议线。
- Ajv / Phaser-free 冒烟及 `git diff --check` 结果见本轮 DEVLOG。

### Added (Round 18)

- 社会数值统一经 `SocialChange` 按善恶、个人声望、逐派声望与逐 NPC 关系的独立范围变化和钳制。
- 对话新增本门声望区间条件与变化效果；门派资料新增拜师本门声望门槛及退门本门声望代价，基础导师对白演示两种接入。
- J 师门页展示各门派声望与拜师/退门要求；v1 存档记录逐派声望，缺字段旧档和移除门派数据均可兼容恢复。
- 更新数据作者、对话、架构、GDD 与存档说明。

### Verification (Round 18)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过，转换 108 个模块；主 JS 包 1,724.10 kB，超过 500 kB 建议线但不阻断构建。
- Ajv 校验 manifest 与全部 16 个登记基础资源：17/17 通过；Phaser-free Node 冒烟检查：41/41 通过，覆盖声望边界、门派门槛/退门、对白条件显隐/引用隔离/事务回滚及新旧 v1 存档恢复。
- `git diff --check`：通过；仅提示 Git 将在后续写回时把 LF 转为 CRLF。

### Added (Round 17)

- 区域事件新增知识节点、游戏时段、天气组合门槛与百科发现效果；条件组之间全部满足、组内任一 id 满足。
- 世界加载逐事件校验图谱/历法/天气引用，悬空引用只禁用对应奇遇；一次性状态只在门槛成功后结算。
- 渡口脚印线索接入“芦苇河滩”黄昏/夜间降雨奇遇；原地等候时会重新检查区域事件，并合并等待与见闻提示。
- 区域奇遇复用既有 v1 `completedRegionalEvents` 和 `knownKnowledgeNodeIds`，无需变更存档协议。
- 更新舆图、知识图谱、资料指南、架构和存档说明。

### Verification (Round 17)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过；Vite 提示主 JS 包超过 500 kB 建议线，不阻断构建。
- Ajv 校验 manifest 与全部登记基础资源：17/17 通过（含新的 `world-map` 事件 Schema 与对白资料）。
- Phaser-free Node 冒烟验证：Schema/解析、条件前置/时段门槛、组内天气候选、完成状态筛选、百科首次发现幂等和悬空引用逐事件隔离通过。
- `git diff --check`：提交前复核。

### Added (Round 16)

- NPC 资料新增可选时段日程，按历法时段切换地图位置；日程跨历法、地图、玩家出生格、固定遭遇及其他 NPC 冲突校验，并以逐项基础位置回退隔离坏日程。
- 探索场景会同步 NPC 标记、姓名牌、占位与交互，跨区抵达按抵达时段派生人物位置；NPC 坐标不新增存档字段。
- 新增 `docs/NPC-SCHEDULES.md`，记录 NPC 日程协议、作者约定和存档派生方式。

### Fixed (Round 16)

- 存档恢复预检此前使用 NPC 静态基础坐标；当 NPC 已按日程迁走、玩家合法站在其原格时会错误拒绝读档。现在预检按快照时段、地图、玩家格和有效遭遇解析与运行时相同的实际 NPC 占位。

### Verification (Round 16)

- `npm run build`：TypeScript 检查与 Vite 生产构建通过；主 JS 包超过 500 kB 建议线但不阻断。
- Ajv 校验 manifest 与全部 16 个登记资源：17/17 通过。
- Phaser-free NPC 日程/运行时玩家格冒烟校验：通过；覆盖移动人物的原基础格、日程目标格冲突回退。
- 浏览器手动回归：时段推进后 NPC 可见移动并可交谈；空槽保存后刷新读档成功，玩家仍在原时段与位置且 NPC 正确避让玩家格。首轮复现到的基础格误拒已修复并复验。
- `git diff --check`：通过。

### Added (Round 15)

- 新增必需 `climate.base` 资源与 draft-07 `climate` Schema：季节按历法月份分区，每季定义加权天气，天气资料控制叠色色彩、程序雨雪粒子及移动附加分钟数。
- 新增 Phaser-free `climate-system.ts`：对照已解析历法验证月份无遗漏/重叠、天气引用与正权重；按世界种子和游戏历日确定性推导季节与逐日天气。
- 探索 HUD 显示季节、天气和步行附加耗时；场景用程序粒子绘制雨雪、以数据色调叠加环境。只有成功单格移动叠加天气步耗时，旅行与等候继续采用历法动作成本。
- v1 存档新增 u32 `worldSeed`；Round 14 及更早旧 v1 档缺字段时稳定归一为种子 `1`。
- 新增 `docs/CLIMATE.md`，并更新数据指南、存档说明、架构、GDD、README 与路线图。

### Verification (Round 15)

- `npm run build` 通过：TypeScript 检查无错，Vite 转换 107 个模块；主 JS 包仍超过 500 kB 建议线。
- Ajv 校验 manifest + 16 个登记资源：17/17 通过。
- 临时 Phaser-free 气候/存档冒烟 harness：33/33 通过，覆盖四季月份映射、逐日天气确定性、加权表边界、季节/天气坏引用隔离、种子上下界与旧 v1 默认值、存档捕获和 JSON 往返。
- 浏览器手动验收（本地 Vite）：HUD 日切显示季节天气；细雨粒子可见并提示每格 +1 分钟；成功步行 00:01→00:03，雨天撞墙仍为 00:03，V 等候推进 60 分钟；保存、刷新并继续后于同一天恢复同一细雨天气和 01:03 时刻。
- `git diff --check` 通过。

### Added (Round 14)

- 新增必需 `game-calendar` 历法资源与 draft-07 Schema：月份、日内时段（起始分钟/照度）、起始时刻与动作耗时；加载期语义校验拒绝重复 id/时段起点、缺零点时段、悬空起始引用与越界耗时。
- 新增 Phaser-free 游戏时钟：以已过分钟数为唯一权威状态，折算年/月/日/时刻并做循环时段查询（跨午夜自然成立）；只有成功的移动、区域旅行与 V 键等候推进时间，被阻挡或被面板拦截的操作零消耗。
- 探索 HUD 显示历日/时刻/时段；世界层按时段照度渐变夜幕调色，UI 与面板保持清晰；H 帮助列明 V 等候键。
- 对话新增 `timeOfDay` 时段条件（Schema/解析/引用装配/运行时求值一致）；悬空时段引用只剔除相关选项。
- v1 存档新增 `elapsedGameMinutes` 分钟计数；Round 13 及更早旧档缺字段时从历法起始时刻恢复，日期随时由当前资料折算。

### Fixed (Round 14)

- 时钟只接受正的安全整数分钟推进；分数分钟与溢出请求明确拒绝，最大安全计数下的日期/分钟折算保持精确。

### Verification (Round 14)

- `npm run build` 通过（106 个模块）；Phaser 主 bundle 大于 500 kB 建议线，构建成功。
- 临时 Ajv harness 通过 manifest 与全部 15 个登记资源（含新的 game-calendar 与扩展后的 dialogue-set Schema），16 项校验零失败。
- 临时 Phaser-free 冒烟 harness 39/39 通过：历法语义拒绝、时钟跨日/跨月/跨年与午夜时段边界、零/负/NaN 不推进、时段条件显隐、悬空时段逐选项隔离、存档分钟计数往返/旧 v1 缺省归一/非法值拒绝与恢复预检透传。
- 浏览器手动验收：时间 HUD、V 等候推进与反馈、H 帮助打开时 V 阻止、夜幕调色与 UI 清晰、移动推进与被阻挡零消耗、入夜时段对话选项显隐、保存刷新读档精确恢复入夜时刻与夜色、删除新字段模拟旧档后从起始晨光恢复。
- 提交前独立复核：修正分数分钟边界后重跑 `npm run build`；manifest + 15 个资源通过 Ajv；19 项直接时钟边界断言通过（分数/非有限/超安全整数与累计溢出拒绝、午夜/月界、最大安全计数精确折算）；`git diff --check` 通过。
- `git diff --check` 通过（结果记录于 `DEVLOG.md`）。

### Added (Round 13)

- 门派资料支持导师、入门门槛、退门代价与门派武学去留；三位原创师父在地图上提供拜师、授艺和退门对话。
- 新增师门关系状态与 J 键门派档案页；拜师/退门/授艺使用对话原子事务，并接入存档恢复预检。
- 对话 Schema 增加门派身份与武学资格条件，以及拜师、退门、授艺效果；旧版门派资料和 v1 存档保持缺省兼容。

### Added (Round 12)

- 新增共享像素 UI 色板、阶梯边框与选中底条；主菜单、对话、战斗、背包、商店、任务、暂停、舆图、百科共用视觉原语。
- 新增代码生成的人物像素标记和网格瓦片亮/暗边缘，开启 Phaser 整像素绘制及 CSS 像素缩放；不引入外部素材。
- 新增 H 键操作手册，列出探索与面板常用输入；帮助层互斥并锁定世界移动。

### Fixed (Round 12)

- 探索 HUD、地图名、NPC/敌人名牌在暂停设置调整文字大小后即时刷新；关闭设置时同步运行设置状态，重开标签不回退。
- 缩短 HUD 常驻快捷键行，避免挤占居中地图名；战斗招式以焦点跟随窗口呈现，任务说明/目标按实际换行高度布局。
- 角色模板长描述启用 CJK 高级换行，窄视口下不会沿横向被裁切。

### Verification (Round 12)

- `npm run build` 通过（103 个模块）；Vite 保留既有主 bundle 超过 500 kB 的非阻断提示。
- Ajv 检查通过：manifest + 14 个已登记资源；共 14 份 schema 契约（含 manifest）。
- 浏览器手动验证窄视口下新游戏/角色创建、探索 HUD、H 帮助开关与移动锁、百科/背包焦点底条、任务日志、舆图和暂停设置字号更新/重开保留。
- `git diff --check` 通过；Git 仅提示当前工作副本的 LF→CRLF 转换。

### Verification (Round 13)

- `npm run build` 通过（105 个模块）；Phaser 主 bundle 大于 500 kB 建议线，构建成功。
- Ajv 检查 manifest 与 14 个已登记资源全部通过，包括扩展后的 faction/dialogue Schema。
- 临时 Phaser-free 情景 harness 通过：入门门槛/导师限制、重复拜师拒绝、门派武学授艺、事务回滚、退门惩罚与遗忘武学、旧 v1 存档缺省和悬空导师软隔离。
- 浏览器手动验收了 J/H 面板、条件不足的可读反馈、跨区拜师、身份展示、保存后重载读档；`git diff --check` 最终结果记录于 `DEVLOG.md`。

### Added (Round 11)

- 新增独立知识节点/关系数据族、draft-07 Schema、manifest 注册与 Phaser 无关图谱解析装配；样例包含 22 个节点、10 条关系边，支持 8 类节点及 12 种关系协议。
- 新增 K 键江湖百科：按类别筛选、展示已知词条和双方已知的关联；未解锁条目以泛化行显示，不暴露内容。
- 对话选项新增 `knowledgeKnown` 条件与 `discoverKnowledgeNode` 效果；发现进度进入 v1 存档，兼容 Round 10 及更早的 v1 快照。
- 新增 `docs/KNOWLEDGE-GRAPH.md`，并更新 GDD、架构、数据、存档、路线与 README 文档。

### Verification (Round 11)

- Ajv 检查 manifest 与 14 个登记资源通过，使用当前 14 份 schema 契约。
- 临时 Phaser 无关 harness 通过图谱解析/逐条隔离、知识门控与发现、坏引用剔除、效果事务原子性、Round 09/10 旧 v1 字段兼容和恢复公开词条基线；脚本随后清理。
- 浏览器手动验证百科分类/锁定见闻隐私与探索输入锁、对话发现两条线索、后续知识条件选项出现，以及保存/重载/继续后已知词条恢复。
- `npm run build` 通过（101 个模块）；`git diff --check` 通过。Vite 仍提示约 1,677 kB 的主 JS chunk 超过 500 kB 建议值。

### Added (Round 10)

- 增加 `world-map` 资料 Schema 与语义装配，manifest 可登记多张网格地图；地区图册通过 M 键查看，并高亮当前所在区域。
- 新增雾雨渡口原创地图、区域节点、可往返关口与数据驱动区域事件；E 键交互保留 NPC/遭遇优先级，关口旅行会检查目标落点。
- 扩展 v1 存档以持久化当前地图和一次性区域事件状态，并兼容缺少事件字段的 Round 09 v1 快照。
- 新增 `docs/MAP-ATLAS.md` 区域资料说明，并更新架构、数据指南、存档说明、README 与路线图。

### Verification (Round 10)

- Ajv 检查 manifest 和 12 份登记资源全部通过；世界图解析/装配冒烟检查通过。
- 浏览器验证舆图输入锁、关口往返、一次性事件去重、跨区存档恢复及旧 v1 缺省字段兼容。
- `npm run build` 与 `git diff --check` 通过；Vite 主 bundle 仍有超过 500 kB 的非阻断建议。

### Fixed (Round 08 parser isolation)

- 当条件通过 draft-07 Schema、但同时声明的 `minValue`/`maxValue` 顺序相反时，防御解析器现在只隔离该对话并发出 warning，集合中其他对话和引用它们的 NPC 继续可用；顶层 envelope 错误仍拒绝整份集合，静态 Schema 错误仍按通用加载规则拒绝资源。

### Fixed (Round 00 reference audit)

- 给 `docs/REFERENCES.md` 的历史/回忆来源与官方技术资料统一分配不重复编号（#1–#12），并明确官网文档页面许可未逐页核实、仅作事实查阅；npm 包许可证仅按精确版本 registry 元数据记录，不代表文档页面许可。
- 保留 `docs/ORIGINAL-FIDELITY.md` 中 #1–#5 的历史来源引用语义，不改变原作证据等级或已冻结技术栈。
- 修正 GDD 过时的 Round 02 状态标注，并将当前已登记、由加载器校验的 11 份 schema 契约列明；未进入 manifest 的数据族仍标为待补契约。
- 补充 GDD 核心系统目标矩阵，集中说明探索、对话、任务、战斗、经济、社会后果、世界模拟、存档与 MOD 的玩家体验，并区分当前实现和后续计划。
- 删除无法由 ZOL 问答页正文证实的“2008 年”发布日期，保留该来源作为无日期、低置信度的社区转载记录。

### Added (Round 09)

- 新增版本 1 纯数据本地存档协议 `src/engine/save-system.ts`：三个命名槽位支持列举、保存、读取与删除；快照包含角色成长/位置、背包装备、商店库存、任务进度、善恶声望关系和一次性遭遇状态，恢复时重算派生属性。
- 新增主菜单与角色创建流程、继续/删除存档页、游戏中 Esc 暂停菜单和槽位保存页；新游戏可选现有角色模板并编辑显示名。
- 新增持久设置：主音量和文字大小，分别作用于声音总线与 UI 字号；设置和存档用独立 localStorage 键。
- 新增 `docs/SAVES.md`，说明槽位协议、恢复预检和兼容边界。

### Changed (Round 09)

- 读档需先通过快照字段/版本检查和当前世界引用预检；角色模板、地图资源或站位失效时整体拒载。悬空次级引用以警告逐项清理，当前资料上限变化会安全收敛保存值。
- 启动流程先加载资料和设置并进入主菜单；可用角色资料缺失时呈现可读错误，不构造半空新局。无 localStorage 时保留可玩会话并报告设置/存档不可用。
- 更新 README、GDD、架构说明、数据指南、路线图与开发日志，完成 Round 09 并将 Round 10（世界地图/区域切换）设为下一轮。

### Verification (Round 09)

- `npm run build` 通过：`tsc --noEmit` 与 Vite 生产构建成功，97 个模块，JS bundle 1,651.79 kB（gzip 436.54 kB）；Vite 仍提示主 chunk 超过 500 kB 建议阈值。
- 临时存档/设置 smoke harness 83 项通过、0 项失败，覆盖 round-trip/二代快照一致、解析防御、无效写入保留旧槽、localStorage 错误与配额、世界引用预检、数据变化钳制及恢复派生值；验证后移除 harness。
- 浏览器手动验收确认主菜单、新游戏模板与显示名、地图进入、Esc 暂停、保存槽位和存档摘要流程；未引入持久自动化测试，Vitest 基线按路线图留至 Round 38。

### Fixed (Round 08 protocol audit)

- 修正 `dialogue-graph.ts` 将声望状态下界 `0` 错用为 `adjustRenown.delta` 下界的问题。负向 delta（-1000…-1）现在可通过防御解析，与 Schema 接受的 -1000…1000 非零范围一致；声望状态结算仍钳制于 0…1000。沈墨涵强硬交付分支现在扣除 2 点声望并保留原有善恶/关系后果。
- 审核条件/效果解析协议与 draft-07 Schema 的枚举、字段及数值值域，并在数据指南区分声望当前值和声望变化量。
- 临时 Ajv/引擎协议矩阵 27 项与实际沈墨涵对话集集成回归 11 项断言全部通过；`npm run build` 的 TypeScript 检查及 Vite 生产构建通过（97 模块）。临时脚本与打包文件已清理；仍有既有主 chunk 超过 500 kB 的非阻断提示。

### Added (Round 00 research follow-up)

- 为原作对照补入一条有明确范围的《白金英雄坛说》开发者证言：go1980 报道称参与开发者将“击杀不同人物影响结局”作为白金版新增要素。因该信息仅见于单篇媒体采访转述，标为中等置信度并明确未获独立印证；只将其映射为本作原创行为驱动多结局设计，不引用原作人物、名单或结局内容。
- 登记 ZOL 问答页中的白金版玩家指南转载，新增低置信度 A6 摘要，限于方向键行走、NPC 动作菜单与回合制战斗等高层交互信息；来源称指南转自百度贴吧，未作官方规格或独立验证，不复述专名与路线细节。

### Verification (Round 00 research follow-up)

- `npm run build` 通过：TypeScript 检查与 Vite 生产构建成功（97 模块）；`git diff --check` 通过。Vite 有主 bundle 超过 500 kB 的非阻断建议。

### Corrected (Round 00 research audit)

- 更正 TapTap app 28348 的来源归属：这是后作《英雄群侠传》的介绍页及其第一人称回忆，不是独立玩家评测；撤销其对《白金英雄坛说》自由探索/养成机制的证据映射，并进一步限定 go1980 来源所描述的早期《英雄坛说》范围。

### Added (Round 08)

- 扩展 draft-07 `dialogue-set` 契约：选项新增可选 `conditions`（questStatus/itemCount/morality/renown/npcRelationship 五种封闭枚举，全满足才可见）与 `effects`（acceptQuest/abandonQuest/giveItem/takeItem/adjustMorality/adjustRenown/adjustRelationship 七种，先全量验证再统一提交）；未知字段/kind 与越界值在 Ajv 与防御解析两级被拒，旧无条件对话完全兼容，坏跨资源引用只剔除相应选项。
- 新增 Phaser 无关 `src/engine/social-state.ts`：运行时善恶（±100）、声望（0–1000）与逐 NPC 关系（±100）标量及边界钳制；新增 `src/engine/dialogue-runtime.ts`：条件求值、可见选项过滤、装配期引用隔离与跨任务/背包/社会状态的原子效果事务（任一效果被拒则零变更、不转移节点），物品变动同步活动任务收集目标（进度可回退）。
- 示例对话扩展覆盖任务接取/进度/放弃/交付、物品赠予与残篇交付（善/恶两种）、声望门槛与 NPC 关系渐进解锁分支；任务发布人保留 E 名录并新增 F 键直接交谈，交互提示双入口并列显示。

### Changed (Round 08)

- `DialoguePanel` 支持场景注入的条件过滤与效果执行钩子，节点文本下新增效果反馈行（成功绿/拒绝黄）；全部选项被过滤的节点按结束节点处理（Enter/Esc 正常收束，不锁输入）。`item-system` 公开 grantItems/removeItems 提交原语供对话效果在验证后调用；GridScene 持有社会状态并按对话效果结算任务奖励/HUD 提示。社会状态、关系与对话产生的任务变动均为运行时内存态，持久化留给 Round 09。

### Verification (Round 08)

- `npm run build` 通过（92 模块，bundle 1,608.58 kB / gzip 424.53 kB）；临时 Node/Rolldown/Ajv 冒烟检查 42 项全部通过（旧数据兼容、未知字段/kind/值域拒绝、条件过滤、接取/放弃/交付、背包容量与物品不足拒绝、组合失败零变更回滚、收集目标回退、善恶上界钳制、隐式关系目标、坏引用选项剔除），脚本已删除。Vite 仍报告 Phaser 主包超过 500 kB 建议阈值。
- 浏览器手动验证：地图加载无资料警告；邻接任务发布人提示"按 E 查看差事 · F 交谈"；F 对话仅显示 offered 任务选项（active/completed/关系分支正确隐藏），接取后反馈"已接取「巷口送药」"且 HUD 跟踪 2/3；E 名录仍可用；顾夜尘带话后反馈关系 +10，再对话解锁关系≥10 新选项；面板打开时移动锁定。

### Added (Round 07)

- 新增 draft-07 `quest-set` 契约、manifest 可选任务资源和两项原创差事；任务资料声明发布 NPC、前置任务、收集/击败目标、败北失败条件与经验/银两奖励。NPC 新增可选 `questGiver` 标记和原创发布人马尚义。
- 新增 Phaser 无关 `src/engine/quest-system.ts`：任务解析、重复 id 与 NPC/物品/遭遇/前置引用校验、循环依赖隔离、locked/offered/active/completed/failed 生命周期、目标事件推进、主动放弃与恰好一次完成奖励。
- 新增任务名录/日志面板：邻接发布人按 E 查看和接取，Q 随时打开日志；Enter 接取或跟踪/取消跟踪，A 放弃，覆盖层锁定探索移动。

### Changed (Round 07)

- NPC Schema 与运行时记录增加可选 `questGiver` 布尔字段，旧 NPC 缺省为 false；manifest 将任务集作为可选资源登记，坏任务与坏前置只隔离相应任务链，不阻断其余世界。
- 背包数量变化驱动收集目标，战斗胜败驱动任务目标与失败条件；任务完成后统一发放经验和银两并刷新可解锁前置任务。任务进度为运行时状态，持久化留给 Round 09。

### Verification (Round 07)

- `npm run build` 通过（90 模块，bundle 1,598.33 kB / gzip 421.58 kB）；临时 Node/Rolldown/Ajv 任务与 Schema 冒烟检查通过，脚本已删除。Vite 仍报告 Phaser 主包超过 500 kB 建议阈值。
- 浏览器手动验证：从发布人名录接取、日志显示开局收集进度 2/3、商店补足物品后完成并显示经验/银两奖励、接取击败目标并胜利完成、A 放弃后状态为失败；面板打开时玩家不能移动。

### Added (Round 06)

- 物品/商店资料契约：新增 draft-07 `items-set` / `shops-set` Schema 与 manifest 资源，原创 7 件物品（3 消耗品、3 装备、1 不可交易杂物）及 1 家数据驱动商店/地图货郎；角色模板声明 120 银两、12 堆背包容量与 4 件起始物品。
- Phaser 无关物品引擎 `src/engine/item-system.ts`：物品与商店解析/索引/跨引用装配、坏库存条目和重复 id 隔离、起始物品逐条校验、容量与堆叠上限、消耗品恢复生命/内力、装备槽与属性/生命/内力加成、有效属性与等级成长分离、购买/出售原子校验及商店库存变动；拒绝非正交易数量，防止异常数量污染货币/库存。
- 键盘 UI 与地图接线：B 打开背包（查看银两/容量/属性/装备/物品，Enter 使用或装备/卸下）；与数据声明的相邻商人按 E 开店，可在购买/出售页签间切换并逐件交易；所有覆盖层打开时移动锁定、关闭后恢复。玩家状态改由角色模板独立创建，不再依赖有效战斗遭遇；无遭遇数据时背包仍可运行。坏商店引用回退到 NPC 原对话并给出警告。

### Changed (Round 06)

- 扩展角色模板 Schema/运行时状态：新增 `startingCurrency`、`inventoryCapacity`、`startingItems`；`CharacterState` 分离基础属性与装备后的有效属性，升级只增长基础属性并重新应用装备加成。
- 扩展 NPC `shopId` 可选字段及 Schema；原 NPC 对话字段不变，商店引用有效时 E 打开商店，无效时仍可交谈。
- 可选内容警告涵盖物品和商店；两类资源/schema 缺失或错误不会阻断地图、NPC、对话、成长或战斗。

### Verification (Round 06)

- `npm run build` 通过（88 模块）；临时 Node/Ajv 冒烟 70 项通过（正式数据 schema、坏输入、起始物品、堆叠/容量、消耗、装备与升级、交易原子性、购买/出售非正数量、装备后的战斗属性），脚本已删除。
- 浏览器手动回归：背包显示初始银两/物品/属性；使用恢复品、装备并查看属性变化；相邻商人购买/出售；面板打开锁定移动且关闭后恢复。Phaser 主 bundle 仍高于 Vite 的 500 kB 建议阈值，详见 DEVLOG。

### Added (Round 05)

- 战斗数据契约与资料：martial-arts Schema 新增必填 `combat`（kind: attack/heal、power 1–999、qiCost 0–99），六种既有武学全部补上战斗作用（江湖散手攻击 8/耗 0、吐纳养气诀恢复 12/耗 6、拦门刀法攻击 14/耗 4、听雨剑法攻击 22/耗 10、铁嶂桩功攻击 18/耗 8、云隐身法攻击 10/耗 3）；character-profiles Schema 新增必填 `startingMartialArtIds`（唯一 id 数组，可为空），初始模板声明「江湖散手 + 吐纳养气诀」两式起始武学；新增 draft-07 `battle-encounters` Schema 与首份原创遭遇资料 `data/base/battles/round-05-encounters.json`（`encounter.round-05-set` 登记进 manifest）：「巷口拦路刀客」驻守 (1, 7) 可走格，敌人「疤脸刀客」五项属性/生命 60/内力 16/两式武学、胜利经验 40、失败恢复比例 0.6/0.6、repeatable false 与接近/开战/胜利/失败/撤退五条原创提示文本全部来自 JSON。
- Phaser 无关战斗引擎 `src/engine/turn-based-combat.ts`：遭遇集合防御性解析与逐条跨资源装配（地图引用、触发格图内可走、不压出生点/NPC/其他遭遇格、角色模板与敌人武学引用有效、id 首声明优先，单条失败只禁用该遭遇）；战斗会话交替玩家/敌方回合（一次 `playerUse` 完成一整轮）、固定协议公式（攻击伤害 `max(1, power + force − floor(body/3))`、治疗 `power + floor(resolve/2)` 封顶生命上限）、确定性敌方 AI（可用攻击中威力最高、平手按武学 id 升序，无可用攻击则蓄势跳过）、行动可用性校验（未知/内力不足的行动不消耗回合与资源）、胜利经验经 Round 04 `grantExperience` 恰好结算一次、失败按数据比例恢复生命/内力（保底 1 点生命）、撤退零奖励立即结束，全部事件追加为可读战报条目；四方向邻接的遭遇目标选择（等距按遭遇 id 决胜）。
- 角色成长引擎扩展：`CharacterProfileData.startingMartialArtIds` 防御性解析、`CharacterState.martialArtIds` 运行时副本（`createCharacterState` 复制模板声明列表）、`resolveStartingMartialArts` 逐条校验起始武学引用（存在、未禁用、满足模板起始等级/属性且无门派要求，坏引用/重复声明只剔除该武学并给出可读警告）。
- 键盘战斗面板 `src/game/combat-ui.ts`：双方名称与生命/内力资源条及数值、玩家行动列表（武学名、作用类型、power、内力消耗来自数据；内力不足项置灰且确认时给出本地提示）、高度预算内的最新战报滚动、撤退行；↑/↓（W/S）选择、Enter 确认或战后关闭、Esc 撤退或关闭。
- 地图接线：遭遇敌人以菱形标记渲染于数据声明格并阻挡通行，四方向相邻时底部显示数据 approach 文本，按 E 优先 NPC 交谈、其次开战；战斗面板打开期间探索移动与 E 键锁定、关闭后恢复；胜利后一次性遭遇的标记与阻挡本次运行内移除（刷新重置，存档留待 Round 09），战斗结束在控制台汇总结果与经验/升级数；遭遇资源及其 schema 纳入可选内容分类，缺失/结构坏/引用断只降级为警告，地图与 Round 03/04 玩法不受影响。

### Changed (Round 05)

- `martial-arts-set` 与 `character-profiles` Schema 的既有字段语义不变，新增字段为必填（两份基础资料同步更新；MOD 覆盖同样必须满足新契约）。
- 吐纳养气诀修习门槛由等级 2/定力 8 调整为等级 1/无属性要求，与「流传极广的入门吐纳法」的设定一致，并使初始模板可携带攻击 + 恢复两类起始武学。
- HUD 可选内容警告行文案扩展为覆盖 NPC/对话/角色模板/门派/武学/战斗遭遇六类资料。

### Verification (Round 05)

- `npm run build` 通过（85 模块）；引擎纯逻辑与 schema 共 37 项临时 Node 冒烟检查通过（覆盖 schema 通过/拒绝、战斗公式数学、回合交替与敌方 AI 决胜、内力耗尽跳过、无效/买不起行动不偷回合、击败/失败恢复/撤退结算、经验恰好一次与跨级、坏遭遇逐条隔离、起始武学剔除），临时脚本已删除。生产构建浏览器回归：7 资源零警告加载、接近提示与遭遇格阻挡、E 开战、五回合攻击取胜（战斗内 11 血、胜利升级 +18 至 29/101、经验 +40 升 1 级）、面板关闭后移动恢复、一次性遭遇完成后标记消失且不再触发。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 04)

- 角色成长数据契约与资料：draft-07 `character-profiles` / `faction-set` / `martial-arts-set` 三份 Schema，配套 1 份初始角色模板（属性起点/显示名称、等级与经验起点、最高等级与属性上限、基础+逐级经验曲线、每级属性增量、生命与内力的 base/perLevel/属性权重公式全部来自 JSON）、3 个原创门派（听雨剑阁、铁嶂派、云隐山庄：立场、宗旨与武学风格说明）与 6 种原创武学（江湖散手、吐纳养气诀、拦门刀法、听雨剑法、铁嶂桩功、云隐身法：类别、简介、适用门派、等级/属性门槛与熟练度参数），以 `character-profile.round-04-set` / `faction.round-04-set` / `martial-art.round-04-set` 登记进 manifest。
- Phaser 无关的角色成长引擎 `src/engine/character-progression.ts`：五项核心属性协议（body/force/agility/insight/resolve 与 1–999 值域）、三类集合防御性解析（附 schema 无法表达的单文件语义：maxLevel 高于 startingLevel、属性起点不超上限、初始熟练度不超上限）、首声明优先的 id 索引与武学门派引用逐条校验（悬空引用只禁用该武学）、运行时角色状态创建、数据驱动累计经验阈值（升第 k 级成本 = base + perLevel×(k−1)）、一次性跨级结算、逐级属性成长与 attributeCap 封顶、满级经验钳制与溢出丢弃、按资料公式计算生命/内力上限（升级增量 heals 进当前值），以及按等级/属性/门派（空数组表示不限门派）的武学习得资格判定并逐条给出机械性原因。
- 网格场景把三类新资源纳入可选内容分类：schema/解析/跨引用失败降级为警告行与控制台诊断，地图与 Round 03 玩法不受影响；有效资料加载零启动警告，并在控制台汇总已加载的模板/门派/武学数量。

### Changed (Round 04)

- HUD 可选内容警告行文案扩展为覆盖 NPC/对话/角色模板/门派/武学五类资料；控制台可选内容警告前缀统一为 `[optional]`。
- manifest 在原三种资源之外新增三条资源登记；`enabledMods` 保持为空。

### Verification (Round 04)

- `npm run build` 通过（83 模块）；引擎纯逻辑与 schema 共 83 项临时 Node 冒烟检查通过（覆盖解析/索引/重复 id/悬空引用隔离/敌意输入/经验阈值数学/跨级/属性上限/满级钳制/资格判定合格与不合格/Ajv 真实数据与无效样本），临时脚本已删除。生产构建浏览器回归：有效资料零警告；临时注入结构坏门派集与悬空门派引用后，仅出现可读警告与点名禁用，地图保持可玩，恢复后 SHA256 与源一致。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 03)

- 首批原创 NPC 与对话 JSON 资料：3 名人物（沈墨涵、陆贞娘、顾夜尘，姓名、所在地图、网格坐标与对话引用全部来自数据）与 3 段含分支选项的对话图，登记为 `npc.round-03-set` / `dialogue.round-03-set` 并配套 draft-07 `npc-set`、`dialogue-set` Schema。
- 引擎通用 NPC 放置模块：防御性解析、跨资源校验（地图/对话引用存在、坐标在图内且可走、不占同一格、不压出生点、id 唯一）、占用格索引与四方向邻接目标选择（多目标时取最近，等距按 NPC id 决胜）。
- 引擎对话图模块：解析、逐段图校验（起始节点存在、选项 nextNodeId 有效、节点 id 唯一）、首声明优先的对话索引与纯逻辑会话状态机。
- 键盘对话面板：↑/↓（或 W/S）浏览选项、Enter 确认或于结束节点收尾、Esc 关闭；打开期间场景移动输入被隔离，关闭后恢复。
- E 键邻接交谈：仅与四方向相邻 NPC 可交互并显示提示（含 NPC 名称），远离时提示消失且无法打开对话；NPC 所在格不可进入。
- 可选内容故障隔离：坏引用、坏坐标、重复 id/占位、断裂对话节点等错误只禁用受影响的人物/对话并给出可读警告（HUD 汇总 + 控制台详情），地图保持可玩；manifest/必需地图及其 schema 错误仍致命降级。
- NPC/对话资源未登记或有效集合为空时，地图正常显示并给出明确"暂无可交互人物"提示。

### Changed (Round 03)

- 网格场景装配策略调整：加载诊断按"必需（地图/清单/schema）"与"可选（NPC/对话）"分级，前者维持 Round 02 的致命错误面板，后者降级为警告行。
- HUD 提示行更新为移动 + 邻接交谈操作说明，底部新增交互状态行；HUD 预留高度调整为两行警告。

### Verification (Round 03)

- `npm run build` 通过（82 模块）；引擎纯逻辑 48 项临时 Node 冒烟检查与 7 项 Ajv schema 检查通过，临时脚本已删除。Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

### Added (Round 02)

- manifest 驱动的通用资料加载器，加载时用 Ajv 校验 manifest、schema、基础资源和 MOD 覆盖，并返回来源溯源与结构化诊断。
- Draft-07 `manifest` 与 `grid-map` JSON Schema、按声明顺序应用的同路径 MOD 覆盖，以及同步泛型 EventBus。
- Vite MOD 分发插件：开发期安全读取仓库 `mods/` 中的 JSON，生产构建复制同样的文件；附带未启用示例 `mods/example/`。
- 由 `data/base/maps/round-01-grid.json` 驱动的 16×9 网格地图；地图数据通过 Vite 静态目录在开发与生产中发布。
- 通用地图结构解析、边界/固体瓦片查询和 Phaser 网格渲染器。
- 方向键与 WASD 单格移动、动画期间输入锁定、墙体与边界碰撞，以及玩家坐标 HUD。
- 地图请求、JSON 解析和结构错误的可读游戏内反馈；画布可聚焦并标注无障碍名称。

### Changed (Round 02)

- 网格场景改由 manifest 资源 id 获取地图。无效 MOD 覆盖会跳过并保留上一有效资源，HUD 与控制台提供 warning。
- Round 00 建立的 ADR-0004 更新为已实施状态，并新增 ADR-0006 记录 typed EventBus 选择。

### Verification (Round 02)

- `npm run build` 与 Round 01–02 浏览器/事件总线手动验证通过；Phaser 主 chunk 超过 500 kB 的 Vite 建议仍存在，详见 `DEVLOG.md`。

## [0.0.1] — 2026-09-26（Round 00）

### Added

- 工程脚手架：`package.json`（dev/build/preview/typecheck 脚本；`engines.node >= 22.12.0`）、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`。
- 引擎引导占位：`src/main.ts`（Phaser 4 静态占位画面，无玩法、无设定文本）、`src/style.css`。
- 目录骨架：`src/engine/`、`src/game/`、`data/base/` 十大数据族（worldview / characters / maps / quests / dialogues / knowledge_graph / items / skills / factions / endings）、`data/schema/`、`mods/`（均以 `.gitkeep` 占位）。
- 设计与规范文档：`docs/GDD.md`、`docs/ADR.md`（ADR-0001~0005 与版本冻结总表）、`docs/REFERENCES.md`、`docs/ORIGINAL-FIDELITY.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`。
- 治理文件：`README.md`、`ROADMAP.md`（R00–R50 共 51 轮）、`CHANGELOG.md`、`DEVLOG.md`。
- 保留 `iterations/round-00/plan.md` 原样（本轮计划，未改动）。
- 安装锁文件：`package-lock.json`，锁定当前可复现的 npm 依赖树。
- Round 01–12 路线按目标文件要求重排，保留后续创新系统、内容数量目标与质量轮次。
- `docs/REFERENCES.md` 补充各类来源的授权状态、软件包许可和本项目使用方式。

### 验证

- `npm install`：成功，安装 18 个包。
- `npm run build`：TypeScript 检查与 Vite 生产构建成功；Phaser 主包 chunk 约 1.38 MB，出现超过 500 kB 的非阻断提示。
- 本轮没有测试文件，因此未运行测试套件。
