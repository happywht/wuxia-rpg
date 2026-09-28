# Round 56 计划 — 河湾巡标与“见闻发现”任务目标

## 本轮目标

让新扩建的雾雨渡口真正承载跨区探索玩法：新增通用的 `discoverKnowledge` 任务目标，由一次实际新见闻发现推进；在江湖差事簿中提供石北发布的两段连续巡标任务，引导玩家从旧渠石闸前往雾岬林地，再继续勘察南湾苇池。已提前探索过的玩家接取差事时应以现有见闻回填目标，避免重复跑图。

## 用户故事

- 作为渡口护路人，我先发现旧渠石闸，再能在差事簿接取石北发布的雾岬水尺巡查；走到北岸水尺时，见闻自动记入，任务进度同步完成。
- 作为完成北岬巡查的旅人，我能接到后续的南湾水路测绘，沿第二张大地图继续探索；若我之前已经走到对应地点，接取时任务应承认这条已知见闻。
- 作为内容作者，我可以使用新的 `discoverKnowledge` 目标引用知识图谱节点，Schema、解析器、跨资源装配和存档进度都保持数据驱动并给出清楚的坏引用诊断。

## 验收标准

1. `quest-set` Schema 与 Quest parser/assembler 支持 `discoverKnowledge`，目标仅允许一次发现且必须引用已登记知识节点；旧三类目标与旧存档结构保持兼容。
2. 新见闻发现信号只推进匹配的目标一次；接取差事时若目标节点已为玩家所知，进度自动回填并可完成。
3. 基础内容新增两段有序差事：石北发布的北岬巡标要求先知晓 `place.mist-sluice`，发现 `place.mist-north-cap` 后完成；后续南湾测绘要求北岬差事完成并发现 `place.mist-south-pool`。
4. 两个发现点以数据声明为雾雨渡口区域事件；对应地标受地点知识门控；新增事件/地点节点均有合法图谱关联，事件坐标和关口一样可达。
5. 自动测试覆盖新目标的 schema/parser/引用诊断/一次性进度/已知见闻回填/旧存档活动任务恢复/奖励见闻级联，以及真实基础资料中的双阶段差事链与事件坐标；全量质量门槛通过。
6. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`docs/QUESTS.md`、`docs/MAP-ATLAS.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/DATA-GUIDE.md` 和测试说明；独立提交 `round-56: 增加河湾巡标见闻任务链`。

## 子任务（均需可验证）

1. **任务协议扩展**（约 35–45 分钟）：实现 `discoverKnowledge` schema、parser、装配引用校验与 `QuestSignal` 进度逻辑；接取时利用访问上下文回填已知节点，读档后重算兼容旧存档的发现目标，并让任务奖励解锁的见闻能推进其他活跃任务；确认目标次数上限为 1，不改变旧存档字段。
2. **渡口双阶段巡标内容**（约 30–40 分钟）：新增北岬、南湾两个地图事件与地点见闻门控，建立知识图谱节点/关系；给石北发布的差事簿追加连续任务并配置奖励、前置见闻和发现目标。
3. **跨系统回归与试玩**（约 30–40 分钟）：覆盖坏图谱引用、重复信号、已知节点回填、任务完成与后续解锁；验证两个事件位置可达、地图地标门控引用闭合，尝试实际走通新任务链。
4. **资料文档和发行验证**（约 25–35 分钟）：同步任务、地图、图谱、路线与日志说明，执行 schema/MOD/类型/全量测试/文档审计/生产版本包检查，并核对最终差异后提交。

## 涉及文件（预计）

- `iterations/round-56/plan.md`
- `data/schema/quest-set.schema.json`、`data/base/quests/round-07-quests.json`
- `data/base/world/world-map.json`、`data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`
- `src/engine/quest-system.ts`、`src/game/grid-scene.ts`、`src/game/quest-ui.ts`
- `tests/quest-system.test.ts`、新增 `tests/round56-discovery-quests.test.ts`
- `docs/QUESTS.md`、`docs/MAP-ATLAS.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/DATA-GUIDE.md`、`docs/TESTING.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`

## 风险

- 见闻发现有区域事件、NPC/地点观察及任务奖励等来源，若进度信号缺失会造成“百科已发现但任务不动”；本轮统一以显式知识发现信号推进，并用回填处理先前已知节点。
- 存档会按目标 ID 保存进度；新增目标不能改变已发布目标 ID 或旧任务字段，且已知目标在恢复后仍需满足一致的完成状态。
- 新地图事件和原有地标可能因错误坐标/发现 ID 被装配层隔离；使用现有两张地图 schema 与跨资源图谱装配器逐条核验。

## 预计人类工程师工时

≥ 2 小时（通用 Quest 目标扩展、区域事件与图谱/地标闭环、存档兼容回归、浏览器验证和发行门槛）。
