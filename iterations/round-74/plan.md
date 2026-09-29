# Round 74 计划：扩展第五块可玩百格地图与可移动大陆舆图

## 本轮目标

把可步行世界从四张扩到五张 100×100 区域图，并将 M 舆图从 176×112 扩展到更宽高的 208×128 全域底图。新图以仓库已登记的 Kenney CC0 Roguelike/RPG 与 Tiny Town 图素搭建，接入双向关口、区域见闻、人物和任务，继续满足用户对大地图、可移动世界和像素素材的核心要求。

## 用户故事

作为沿舆图探索的玩家，我希望走过铁嶂北道后还能翻入一块全新的百格山岭区域；我希望 M 总图能容纳不断扩展的疆域、保持可拖动和缩放，并能从地图标记找到新增的区域见闻、人物和差事。

## 验收标准

1. 新增确定性生成的 100×100 区域图，使用现有 Kenney CC0 图集；地貌层有可辨识的山脊/松林/云泉/栈道构图，不以手绘占位替代素材。
2. 新区与铁嶂北道间存在明确双向关口；从既有出生点可达新区，返回路线也可达；地图边缘、关口、NPC 日程、地标、事件和遭遇等锚点均通过 BFS/实际解析校验。
3. 世界资料包含至少一个新区域人物、一段有前置/后续关系的区域差事，以及对应见闻/事件/图谱连接；所有 manifest 引用通过现有 Schema 与运行时装配校验。
4. 全域舆图扩展到 208×128，五个区域、关口连线、玩家和已发现标记继续由世界资料投影；旧图内地图格坐标/碰撞/旅行/存档 map id 不变，舆图百分比锚点可按新画布调整以维持原大陆构图，拖动/缩放裁切逻辑保持可用。
5. 新增 Round 74 专项回归：地图生成确定性、资产 GID 范围、可行格/玩法锚点可达、双向旅行闭环、区域/事件/人物/任务引用、全域投影尺寸。隔离浏览器至少实测扩展后的 M 总图与细图切换、平移/缩放。
6. 更新素材用途、地图/任务/人物指南、`CHANGELOG.md`、`DEVLOG.md` 与 `ROADMAP.md`；跑完整测试、Schema/MOD/类型/文档审计及发行子路径 smoke，并提交本轮。

## 子任务

1. **新区地形与授权图素：**实现确定性区域图生成器，布置山脊、松林、云泉与栈道等图层；在生成后核对碰撞和固定锚点可达，不改动已发行的其它区域布局。
2. **旅行与大舆图：**在铁嶂北道增加往返新区关口；扩展总图画布与确定性生成器，安排不重叠的第五区域位置并验证区域投影和相机边界。
3. **区域内容：**增加独立的 NPC/对白/任务资源、时段、见闻事件和图谱关系；核对加载器可合并 manifest 中拆分的 `npc-set` 与 `quest-set`，使用已有 CC0 角色帧与地图图集。
4. **验证与交付：**新增专项与整世界装配测试，更新相关文档，完成发行检查、隔离浏览器交互和 Round 74 commit。

## 涉及文件

- `iterations/round-74/plan.md`
- `scripts/generate-round74-cloud-ridge.mjs`、`scripts/generate-round62-iron-ridge.mjs`、`scripts/generate-round70-atlas.mjs`、`package.json`
- `data/base/maps/round-74-cloud-ridge.json`、`data/base/manifest.json`、`data/base/world/world-map.json`
- `src/game/world-loader.ts`（按 manifest Schema 装配多个 NPC 与任务资源）
- `data/base/characters/round-74-cloud-ridge-npcs.json`、`data/base/dialogues/round-74-cloud-ridge-conversations.json`、`data/base/quests/round-74-cloud-ridge-quests.json`、`data/base/manifest.json`
- `data/base/battles/round-05-encounters.json`、`data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`
- `tests/round74-cloud-ridge.test.ts`、`tests/round49-default-world-integrity.test.ts` 与受舆图尺寸/区域数变化影响的既有回归
- `docs/REFERENCES.md`（若只使用已登记素材则补充新用途）、`docs/MAP-ATLAS.md`、`docs/QUESTS.md`、`docs/CHARACTERS.md`、`docs/PLAYER-GUIDE.md`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`

## 风险

- 舆图扩大可能把新增区域推到视口边缘，或让区域/关口投影挤在一起；生成后需要实际浏览器检查总图、缩放和裁切。
- 新地图涉及地图资源、人物、对话、任务、事件和图谱的跨资源引用，必须由现有 manifest/schema/装配审计共同校验；新增关口要纳入既有铁嶂地图生成锚点，避免入口碰撞。
- 不能为迁就新区而挪动旧区、重编号旧资源或改变已有存档所用地图 id；静态地形变化只允许保护新增关口所需的最小范围。
- 素材只复用仓库已登记、随包附有原 License 的 Kenney CC0 图集；如需任何新来源，必须先核验许可并登记到 `docs/REFERENCES.md`。

## 预计人类工程师工时

90–120 分钟。
