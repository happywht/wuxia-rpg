# Round 43 计划：风雨传函、门派支线与漫游奇遇

## 本轮目标

把当前只会在固定网格坐标触发的区域事件扩展为资料驱动的「漫游奇遇」：玩家在雾雨渡口行走时，满足已知脚印、黄昏/夜间和湿天气条件后，有概率遇见一封传给五派的求助信。奇遇通过现有区域事件发现流程记录知识节点并复用已存档的一次性事件 id。凭传函和所属门派，玩家可从相应门派导师处接下一项独有差事；五派各有一条任务目标与后续见闻，不靠只隐藏对白来伪造门派门槛。

## 用户故事

- 作为探索者，我希望在天气、时辰与已发现线索共同影响下，于行走中偶遇一桩有始有终的江湖见闻，而不是每项事件都固定等在一个格子上。
- 作为五派门人，我希望收到与本门作风相符的支线委托，并且任务名录、对白和任务引擎都遵守相同的门派与见闻资格。
- 作为资料作者，我希望旧世界图继续兼容，能用 Schema 声明漫游概率、地图、条件与百科发现，并通过 MOD 校验与文档审计。

## 验收标准

1. 在世界图资料中新增可选 `randomEvents` 协议：有地图范围、0–1 触发概率、条件、一次性与可选图谱发现效果；缺少此字段的旧世界图解析为无漫游事件，原固定坐标事件语义不变。
2. 纯引擎选择器只在玩家成功走格后尝试当前地图的候选事件，按条件筛选、可注入随机数、单次移动至多选中一个事件；概率、天气/时辰/见闻条件及一次性完成状态均可重复测试。
3. 世界装配校验漫游事件的地图、条件与发现节点，坏引用逐项禁用并诊断；存档沿用 `completedRegionalEvents` 保存漫游事件 id，不增加快照版本/字段。
4. 新增五项原创门派支线，各归属于听雨剑阁、铁嶂派、云隐山庄、寒山书院、盘舷刀场；每项同时要求所属门派与发现传函见闻，任务名录会隐藏不符合资格的任务，任务状态机和对白效果也拒绝越权接取；完成目标后在对应交付对白中记录该路线见闻。
5. 新增集成验证覆盖漫游条件/概率/单次选择、旧世界图兼容、坏引用隔离、五派资格隔离、五条任务真实完成和各自见闻发现；图谱节点/关系、任务表与舆图奇遇清单准确更新。
6. 更新 `docs/QUESTS.md`、`docs/MAP-ATLAS.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/TESTING.md`、README 及项目日志/路线图；`npm run check`、`npm run build`、Round 30/31/33 相关 smoke、Round 43 专项 smoke 和 `git diff --check` 全部通过。
7. 提交唯一 `round-43:` commit；历史及 Round 42 内容不重写或折叠。

## 子任务

1. **漫游奇遇通用协议**：扩展 world-map Schema/解析/装配/区域事件选择器；接入有效移动后的区域通知与一次性存档集合；以确定性单测验证概率和引用隔离。
2. **五派任务与叙事闭环**：实现通用任务的门派/见闻资格字段和运行时检查、任务面板筛选；添加一项受环境限制的传函奇遇、五项门派差事、对应对白入口/交付、知识图谱节点和关系。
3. **跨资源审计与回归**：新增 R43 集成用例/脚本，更新任务/地图/图谱/测试文档及全部项目日志，运行完整质量门槛与受影响旧轮 smoke。

## 涉及文件

- `iterations/round-43/plan.md`
- `src/engine/world-map.ts`、`src/engine/quest-system.ts`、`src/engine/dialogue-runtime.ts`
- `src/game/grid-scene.ts`、`src/game/quest-ui.ts`、`src/game/world-loader.ts`
- `data/schema/world-map.schema.json`、`data/schema/quest-set.schema.json`
- `data/base/world/world-map.json`、`data/base/quests/round-07-quests.json`
- `data/base/dialogues/round-03-conversations.json`、`data/base/dialogues/round-30-conversations.json`
- `data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`
- `tests/world-map.test.ts`、`tests/round43-faction-routes.test.ts`、`package.json`
- `scripts/audit-round-34-docs.mjs`、必要时更新被影响的回归 smoke
- `docs/QUESTS.md`、`docs/MAP-ATLAS.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/TESTING.md`
- `README.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`

## 风险

- 漫游触发不可在读档、等待或跨区时意外消耗概率；只允许稳定落格的玩家步触发。随机源必须注入纯函数，测试不能依赖真实运气。
- 一次性漫游事件沿用原 `completedRegionalEvents` 数组，载入时必须承认固定格事件和漫游事件 id；旧存档不迁移。
- 任务列表本来展示全局已提供差事，资格任务必须在 UI 隐藏、任务接受 API 和对白效果事务三层都检查门派/见闻，防止绕过。
- 玩家接下本门差事后即使离门，进行中的支线仍保留；门派资格只在接取时校验，避免退门造成已接任务永久无法结算。
- 新随机事件受天气与时辰限制，测试以注入随机数验证功能，文档要明确实际遇见需要在相应环境继续行走；概率不得成为完成门派支线的唯一永久死锁，固定奇遇的环境条件应可通过等待重试。

## 预计人类工程师工时

约 3–5 小时（通用 world-map 协议、任务资格运行时/界面、五派原创支线与叙事资料、跨资源测试及文档审计）。

## 实际完成与验证记录

- 已完成上述三个子任务；`smoke:round-33` 首次暴露五个目标 NPC 缺少 `participatesIn` 图谱边，已补成数据关系后重跑通过。
- `npm run smoke:round-43`：2 个文件、9 项通过。
- `npm run smoke:round-27`、`smoke:round-30`、`smoke:round-31`、`smoke:round-33`：exit 0。
- `npm run check`：exit 0，10 个测试文件/117 项全部通过，文档审计通过。
- `npm run build`：exit 0，131 modules；Vite 提示主 chunk 超过 500 kB，但不阻断构建。
- 浏览器手动游玩未测；commit 在最终 `git diff --check` 后按 `round-43:` 提交。
