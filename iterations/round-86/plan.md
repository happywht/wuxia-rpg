# Round 86 计划：舆图瘦身、潮汐遭遇与岛上补给

## 本轮目标

让新增的超大可移动舆图继续适合长期扩展：当前 `data/base/world/world-map.json` 为 51,898,361 字节，绝大部分来自大量空白瓦片的逐格 JSON 展开。为舆图图层增加可校验的逐行游程编码（RLE），运行时仍还原为同一张网格，旧版 `cells` 数据与同名 MOD 继续可用。结合南溟航路继续做实玩法：潮生屿低潮时出现可重复挑战、零经验奖励的礁道战斗，并在岛上加入一处有库存限制的补给摊。

本轮不更换 TypeScript/Phaser/Vite，不引入来源不明素材。岛上补给点复用已登记 CC0 Puny World 瓦片与现有物品；所有图层、店铺、NPC、对话、遭遇及潮位条件留在数据目录。

## 用户故事

- 作为玩家，我能在全域舆图上拖动、缩放或按键平移，清楚分辨九个区域与潮生屿位置；舆图资料不再因数百万个空格的格式化展开而膨胀。
- 作为资料作者，我能用逐行 RLE 描述稀疏舆图图层；加载器会验证每行长度、瓦片范围及图层尺寸，同时继续加载旧密集网格 MOD。
- 作为航路旅人，我能在低潮时遭遇可重复挑战的礁道沙盗，并在岛上向守潮人购买有限数量的航路补给。

## 验收标准

1. 本计划先于代码、数据及文档变更写入；本轮至少包含三个可独立验证的子任务，预计人类工程师工时不少于 10 分钟。
2. `world-map.schema.json` 与 `parseWorldMap` 接受且只接受密集 `cells` 或 RLE `cellsRle` 其中一种；RLE 每行必须严格解码到 `columns` 格、行数等于 `rows`，无效计数、越界瓦片、重复/缺失编码均产生可读错误。
3. Round 85 舆图以 RLE 资料确定性保存，尺寸、各层逐格数据、渲染结果、区域/关口/地标投影均与转换前一致；JSON 原始体积不超过 1 MiB。生成器可对 RLE 输入重跑且九份相关生成资源 SHA-256 不变；不声明 RLE 的旧 MOD 继续正常加载。
4. 总图全景回归覆盖 448×320 画布上的九处区域标记、当前位置投影、Home 适配和边界内拖动/缩放；全景缩放下区域标签之间不重叠，继续复用已登记 CC0 地貌。
5. 新增低潮限定、可重复的岛屿战斗遭遇；低潮可触发、高潮不会触发，胜利/撤退/刷新后的可见与阻挡状态符合规则，重复胜利不刷经验。
6. 新增潮生屿补给 NPC 与独立商店数据，库存限制可保存/恢复，商品与地点由数据声明；在已登记 CC0 环境瓦片旁可正常交互。
7. 更新 Schema、MOD/数据指南、舆图、测试、玩家及开发文档、路线图和变更日志；专项测试、数据验证、全量检查和生产构建通过；执行一次可观察的本地全景/任务手动检查，写明实际覆盖和边界；以 `round-86: ...` 独立提交。

## 子任务

1. 定义地图 atlas 层 RLE wire protocol，更新 JSON Schema、解析器与确定性编解码；为坏行长度、错误计数、瓦片上限、dense 兼容和 RLE 运行时矩阵补齐测试。
2. 让 Round 85 生成器能读取密集或 RLE 资料，并把 448×320 atlas 稳定输出为 RLE；逐层比较编码前后格点和锚点，核验最终文件大小及重复生成 SHA-256。
3. 扩展遭遇条件契约以支持 climate tide id；在场景活动遭遇筛选、碰撞/寻路、敌人标记及战斗开启处统一按当前潮位门控。配置零经验可重复礁道守敌并覆盖高潮/低潮与往返状态。
4. 新增潮生屿补给 NPC/对白/商店资源、有限货架及区域说明；使用许可已登记的 Puny World 瓦片，不新增来源不明贴图。
5. 更新舆图全景交互回归与数据/素材/测试/开发文档，做浏览器手动边界检查，执行完整门槛并提交。

## 涉及文件

- `iterations/round-86/plan.md`
- `data/schema/world-map.schema.json`、`data/base/world/world-map.json`、`data/base/manifest.json`
- `src/engine/world-map.ts`、`src/engine/world-atlas-view.ts`、`src/engine/turn-based-combat.ts`、`src/game/world-loader.ts`、`src/game/grid-scene.ts`、`src/game/world-map-ui.ts`
- `scripts/generate-round85-tide-isle.mjs`、新的 Round 86 内容生成器
- `data/base/characters/`、`data/base/dialogues/`、`data/base/shops/`、`data/base/battles/` 及知识图谱资料
- `tests/` 中世界地图编码、舆图交互、遭遇潮位、商店/背包/存档和历史 dense MOD 回归
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/MAP-ATLAS.md`、`docs/PLAYER-GUIDE.md`、`docs/REFERENCES.md`、`docs/TESTING.md`

## 风险

- 压缩 wire format 不能改变运行时任何格点；旧生成器、读取原始 JSON 的历史夹具和 MOD 必须显式兼容或更新。
- RLE 若只校验 Schema 而没有运行时逐层尺寸、瓦片范围及解码等价验证，坏资料会在渲染时出现空洞或错位。
- 潮位过滤必须同时作用于 encounter prompt、占格、寻路和战斗入口，避免高潮状态仍阻路或低潮战斗标记遗漏。
- 可重复战斗会诱发刷经验；该遭遇经验设为零，补给价格与有限库存沿用既有商店规则。
- 全景纹理的 GPU 限制与小地图标签可读性和 JSON 磁盘体积是不同问题；RLE 只优化资料传输/解析输入，仍需核验 Phaser 纹理和 UI 实际表现。
- 本地浏览器不能完整驱动时，必须准确报告手动验证未覆盖范围，不以数据回归冒充游玩记录。

## 预计人类工程师工时

约 12–16 小时，含 wire 协议设计、向后兼容迁移、地图/遭遇/库存联调、历史夹具改造、性能/可视检查及文档验收。
