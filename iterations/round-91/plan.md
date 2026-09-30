# Round 91 计划：雁回崖新区域与 CC0 山地图素接入

## 本轮目标

继续扩展可移动大世界舆图和可步行世界：在 512×384 格总图东偏北空域接入第 11 个 100×100 山地探索区「云岭北台·雁回崖」，将总图扩展到 640×448 格，保证已有十区在扩展前的像素矩阵、区域锚点、路线端点与本地地图碰撞不变。为新地图引入来自 OpenGameArt 的 Ansimuz「Tiny RPG Mountain Tileset」CC0 像素瓦片与木桥图素；使用已有 OpenGameArt Puny Characters CC0 动态角色帧表现新人物，不手绘代替外部地图/角色素材。新区域包含可达的步行关口、NPC、任务、见闻和知识图谱关系，所有资料仍通过 Schema 校验。

素材来源：[OpenGameArt — Tiny RPG Mountain Tileset](https://opengameart.org/content/tiny-rpg-mountain-tileset)。页面标注 CC0；包内保留作者 public-license.txt，实际发行只放项目使用的透明 PNG 和许可说明。

## 用户故事

- 作为打开 M 舆图并平移/缩放寻找新去处的玩家，我能在更大的全域图上找到雁回崖，沿云岭古道的真实步行关口进入，而不是看到一个不可到达的静态图标。
- 作为进入雁回崖的玩家，我能看到来源明确的 16px 山崖、石阶与木桥环境图素、可辨认的像素人物，在崖路 NPC 的指引下完成一项发现差事。
- 作为资料作者，我能在地图数据中使用外部 CC0 图集构成多层视觉并将碰撞/可走格单独维护，重跑生成器不会漂移旧地图、旧舆图或旧资源。

## 验收标准

1. 计划先于本轮实现变更落盘；计划含不少于 3 个可验证子任务、工时不少于 10 分钟。
2. 世界舆图扩展到 640×448 格并继续使用 RLE；扩展前 512×384 区域内所有已有图层逐格不变，10 个旧区域绝对像素投影不变，新第 11 区坐标可见且 M 面板仍支持拖动、缩放、复位与选点导航。
3. 新区域为 100×100 可玩网格，至少一条从云岭古道可通行的双向关口；从入口四向寻路可达新 NPC 交互格、任务目标、发现点与返程关口。新地图地貌/桥阶图层引用实际 CC0 来源 PNG；碰撞仍只由独立 grid 决定。
4. 新 NPC 使用已有 OpenGameArt Puny Characters CC0 角色图集中的方向帧；新增原创对话、至少一个有前置/目标/奖励的差事、一次性见闻发现与知识图谱端点/关系，不在引擎写入专名/剧情。
5. 新资产原许可和来源 URL、许可、用途写入 docs/REFERENCES.md，只保留运行时用到的图集文件；docs/MAP-ATLAS.md、docs/WORLD-SETTING.md、docs/QUESTS.md、docs/KNOWLEDGE-GRAPH.md、docs/DATA-GUIDE.md、README、ROADMAP、CHANGELOG、DEVLOG 同步。
6. 新增可重复生成脚本和 Round 91 专项，验证新增素材网格/许可、地图碰撞与关键点可达、世界图扩展稳定性、旧区域像素/投影守护、跨区往返、任务发现与导航；实际打开浏览器操作 M 舆图，检查新区域在 640×448 视口下的缩放/拖拽/选点，以及进入和返回新关口。
7. npm run validate:data、npm run typecheck、Round 91 专项、npm run check、npm run build 和 git diff --check 均通过，变更以一个 round-91: ... commit 提交。

## 执行记录与验收边界

- 浏览器实测已通过 `http://127.0.0.1:5178/` 打开 M 全域舆图，核对 640×448 格总图与雁回崖标记，并操作缩放、拖动、Home 复位和 W/S + Enter 选点面板；截图保存在 `iterations/round-91/world-atlas-browser.jpg`。
- 本轮未在浏览器中从旧区实际走完两道关口进入并返回雁回崖。新图入口至聂栖雁、调查点、雁栖石和返程关口的可达性、关口两向坐标/碰撞、生成器稳定性由 Round 91 专项及全量自动化覆盖；浏览器跨区实走留作后续真实流程验收，不将其记作已完成。

## 子任务

1. 检查并记录 OGA 页面/包内许可、山地 PNG 尺寸与 16px 网格；将运行所需的山地/桥 PNG 与原始许可纳入基础素材区，并添加透明、瓦片帧与发行内容专项校验。
2. 设计「云岭北台·雁回崖」地貌和保护格位；新增确定性地图生成器，建立独立碰撞网格、环境图层、可达区域、人物/事件锚点以及云岭双向步行关口。
3. 将 512×384 舆图 RLE 无损扩到 640×448，增加雁回崖区域地貌层/锚点，保持旧图层旧投影逐格稳定；接入 Puny Characters 像素人物、原创 NPC/对话/差事/见闻/图谱资料。
4. 补齐数据生成、跨资源 Schema/装配和真实地图路线专项；运行浏览器 M 舆图与新关口实走，保留可复核的截图/步骤证据。
5. 更新素材授权、地图/任务/图谱/玩家说明、路线图与日志；运行完整门槛、检查差异并提交单一 Round 91 commit。

## 涉及文件

- iterations/round-91/plan.md
- data/base/assets/opengameart/tiny-rpg-mountain/（tileset、桥图素、原许可）；docs/REFERENCES.md
- data/base/maps/round-91-cloud-north-terrace.json、data/base/world/world-map.json、data/base/manifest.json、data/schema/world-map.schema.json
- 新区 NPC/对白/任务与图谱节点/边资源；scripts/generate-round91-cloud-north-terrace.mjs
- src/engine/world-map.ts（仅需时）、tests/round91-cloud-north-terrace.test.ts、package.json
- docs/MAP-ATLAS.md、docs/WORLD-SETTING.md、docs/QUESTS.md、docs/KNOWLEDGE-GRAPH.md、docs/DATA-GUIDE.md、README、ROADMAP、CHANGELOG、DEVLOG
- iterations/round-91/ 浏览器验证证据

## 风险

- 640×448 比当前舆图增加约 46% 的可视面积；大图缩放和平移的帧耗与内存必须在浏览器实测，不能只由 RLE 单元测试推定。
- 旧舆图百分比坐标需换算为新画布下的稳定绝对格中心，扩图不能压缩旧地区或移动旧路标。
- OGA 页面将素材标为 CC0，下载包许可文件也明确允许修改与再分发；仍须原样保留包内许可说明及来源记录，并仅发行被新地图引用的 PNG。
- 新山地瓦片尺寸与现有 16px 瓦片一致，但图层叠放可能遮住人物、路口或任务目标；关键锚点和 NPC 深度排序需要逐格/浏览器检查。
- 新区域扩大资料面；所有人物、关口、任务、发现与图谱引用必须在 Schema/装配及真实路径测试中闭合。

## 预计人类工程师工时

约 18–26 小时，含授权核验与资产接入、100×100 新地图与关卡路线、640×448 RLE 扩图与旧地图投影守护、资料链条、专项/全量/浏览器验证、文档和提交。
