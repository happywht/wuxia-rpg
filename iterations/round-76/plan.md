# Round 76 计划：五区地标图素与环境层级

## 本轮目标

在五张 100×100 可玩区域里提升聚落、山口、河埠、盐井与栈桥的远近识别度，使用来源清楚、可进入发行包的 16×16 CC0 像素图素作为补充环境瓦片。保持原有角色图集、关卡布局、碰撞网格、任务坐标与跨区关口规则不变；环境图层继续由 JSON 数据声明并可由 MOD 同名资源覆盖。

素材候选：OpenGameArt 作者 ansimuz 的 [RPG Town Pixel Art Assets](https://opengameart.org/content/rpg-town-pixel-art-assets)，素材页标明 CC0，规格为俯视 16×16 像素，并列出树木、河道、池塘、道路、房屋、岩石和花草。下载页文件为 `town_rpg_pack.zip`。接入前核实压缩包内容、PNG 尺寸/透明度、图块序号和包内许可；若实际包内容与页面声明不符，则继续筛选适配的 CC0 16px 素材，不能把不明来源素材打进发行包。

## 用户故事

作为在五区间自由行走的玩家，我希望渡口、山道驿镇、盐道聚落和云岭栈桥各有更清楚的像素轮廓，能在走近之前先辨认行路中的地点与方向。

## 验收标准

- 五张现有区域地图保持 100×100，原 `grid` 碰撞数据逐字节不变；出生点、全部关口、地标、事件、NPC 日程和遇敌锚点仍可达。
- 为五区增加可见的补充环境图层，使用可追溯的 16×16 CC0 tileset；新图素帧经实际 PNG 网格解析和画面抽样核对，禁止引用角色帧或超出图集容量。
- 城镇、河埠/水岸、山口驿镇、盐道聚落与云岭栈道的视觉布置能区分，不以同一大块贴图覆盖所有地区；地标附近的装饰不遮断可走主路，也不改变交互坐标。
- 将素材来源、作者、许可、尺寸与具体地图用途登记到 `docs/REFERENCES.md`；更新地图图册、玩家指南、测试说明和项目日志。
- 自动测试验证 tileset/schema/frame/地图尺寸/碰撞及关键锚点；隔离浏览器实际查看五个区域中的代表场景和全域舆图 M/G 切换。
- 本轮计划先于实现提交；完成后执行质量门槛/发行验证并单独提交 `round-76: ...`。

## 子任务

1. **素材验证与授权接入**：核验 OGA 素材包许可和打包图集网格；导入最少需要的 PNG 与 CC0 许可；建立可重复生成/应用五区补充图层的脚本。
2. **五区环境与地标构图**：按地图地貌和现有玩法锚点为五区布置不同的树丛、桥/水岸、石路、驿站或盐井周边细节；确保纯视觉层不改通行碰撞。
3. **回归与交付**：新增专门图素/地图锚点测试，运行 `npm run package:release`；在隔离浏览器检查五区代表场景、HUD、M/G 舆图；更新文档并提交。

## 涉及文件

- `data/assets/opengameart/rpg-town-pixel-art-assets/`（仅导入实际使用的 packed PNG 与原始 CC0 许可）
- `data/base/maps/round-01-grid.json`、`round-10-mist-ferry.json`、`round-62-iron-ridge.json`、`round-67-salt-road.json`、`round-74-cloud-ridge.json`
- `scripts/generate-round76-region-landmarks.mjs`、`package.json`
- `tests/round76-region-landmark-art.test.ts`
- `docs/REFERENCES.md`、`docs/MAP-ATLAS.md`、`docs/PLAYER-GUIDE.md`、`docs/TESTING.md`、`docs/ARCHITECTURE.md`
- `README.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`iterations/round-76/plan.md`

## 风险

- 新图集虽同为 16×16，调色板和描边风格仍可能与现有 Kenney 图素冲突；需先检查实际 PNG，并把新图素用于有限环境细节，避免大面积混搭。
- 地图生成脚本会确定性重建 JSON；补充图层需由单独可重复脚本产生，避免后续重建覆盖，也避免直接手改生成文件形成不可恢复差异。
- 贴图与碰撞独立，但错误覆盖仍可能遮挡玩法视觉锚点；专项测试将守护格数据不变、主路锚点通达和新层只包含合法图集帧。
- 发行包只带实际使用的 PNG/许可，压缩包和原始源文件不打包；`docs/REFERENCES.md` 记录可核验来源。

## 预计人类工程师工时

约 3–4 小时：素材许可/图集检查 30–45 分钟；五区构图与可重复生成脚本 75–105 分钟；锚点与像素帧测试 40–55 分钟；五区浏览器目检、发行验证、文档及复核 35–45 分钟。包含三个相互独立、可验证的子任务。
## 实施与验证记录

- 素材：按素材页、下载包和原始 `License.txt` 确认 ansimuz RPG Town 16×16、352×288 RGBA/396 格，CC0 1.0；项目仅保留透明打包图集与许可文件。
- 生成：`npm run generate:round-76-region-landmarks` 写入五张地图的独立图素层，共 24 个摆放；复跑前后五图 SHA-256 相同。碰撞网格哈希、旧图层哈希、地图尺寸及关键锚点均由专项测试保护。
- 验证：`npm run smoke:round-76` 1 文件/9 项通过；`npm run validate:data` 与 `npm run typecheck` 通过；`npm run package:release` 全通，47 文件/320 项测试，34 个 Schema/MOD 检查，Round 34/48 文档审计、构建、chunk 审计、发行归档及 85 文件子路径 smoke 通过。发行包 904,154 bytes，SHA-256 `b9c40d5f4569419d41cea556d16f9c11b7c1754c8d6313a596bdd05cc3c698ed`。
- 浏览器：隔离页实际核对起始地图、M 全域总览、G 区域细图与方向键相机跟随；五区装饰图素使用真实 PNG 帧合成近景检查。本轮没有在浏览器逐个手走到五区新装饰格。
- 独立提交信息：`round-76: 五区地标像素细节`；commit hash 在最终回报中提供。
