# Round 11 计划：知识图谱、百科与对话见闻条件

## 本轮目标

增加可替换、可校验的知识图谱资料（独立 nodes/edges JSON），将图谱查询接入游戏内百科和对话选项，并让玩家通过对话获得见闻、通过后续对话条件使用见闻。已知节点作为玩家运行状态持久化；Round 10 及更早的 v1 存档继续可读。引擎只执行通用节点/关系协议，不包含具体人物、地点、门派和剧情资料。

## 用户故事

- 作为资料作者，我可以单独编辑人物、地点、门派、物品、武学、事件、任务、结局节点及关系边，并得到字段、重复 id 和悬空引用诊断。
- 作为玩家，我可以打开百科浏览已知词条、按类别筛选、查看摘要和已知关联；未发现词条会显示为未解锁，不提前泄漏其内容。
- 作为玩家，我可以在对话中获知一条见闻；后来只有持有该见闻时才会看到依赖它的选项。已发现状态在存档/读档后保留。
- 作为内容作者，我可以在对话选项中声明知识条件或发现效果，且悬空知识节点只禁用该选项，其他对话继续可玩。

## 验收标准

1. 新增独立 `knowledge_graph/nodes.json` 与 `edges.json` 及 draft-07 Schema；节点类别覆盖人物、地点、门派、物品、武学、事件、任务、结局，关系覆盖需求中的师徒、父子、敌对、隶属、位于、持有、触发、需要、奖励、知晓、参与、影响。
2. Phaser 无关解析器验证单文件结构，装配器验证节点/边 id 唯一、关系端点存在；局部坏边或重复声明有可读 warning，并隔离最小坏条目。资料通过 manifest/Schema 加载并参与同名 MOD 覆盖。
3. 新增玩家知识状态：新游戏载入 `knownByDefault` 词条，对话发现效果可解锁其他条目；存档保存知识 id、读档过滤悬空 id，并兼容 Round 10 旧 v1 快照缺少新字段。
4. 新增知识对话条件（全部满足才显示）与 `discoverKnowledgeNode` 效果；Schema 与防御解析字段/值域一致，跨资源引用坏时只剔除该选项，事务拒绝时不得部分修改其他状态。
5. 新增 K 键百科覆盖层：按类别筛选、键盘浏览已发现词条、显示名称/摘要及两端均已知的关系说明；未发现内容不泄漏。打开时锁定探索输入，并与现有对话/存档/其他面板互斥。
6. 新增原创样例图谱和对话见闻分支，更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、GDD/架构/数据规范及百科说明；通过 schema/引擎/旧存档回归、生产构建和手动对话/百科/存档验证，提交 `round-11:` commit。

## 可验证子任务

1. **图谱协议与加载装配**：定义 nodes/edges schemas、Phaser 无关解析/索引/关系查询、manifest 资源、样例图谱和跨引用诊断。
2. **知识进度与对话接线**：扩展 dialogue conditions/effects、引用组装、原子执行和存档 v1 可选字段归一；新增见闻解锁资料。
3. **百科 UI 与玩法验证**：实现类别筛选/条目详情/已知关系，接入 K 键与输入锁，浏览器验证发现、条件解锁和读档恢复。
4. **文档、校验和交付**：Schema 与引擎 harness、生产构建、相关文档/日志、清理临时脚本并提交。

## 涉及文件

- 新增：`src/engine/knowledge-graph.ts`、`src/game/encyclopedia-ui.ts`、`data/schema/knowledge-nodes.schema.json`、`data/schema/knowledge-edges.schema.json`、`data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`、`docs/KNOWLEDGE-GRAPH.md`、本计划。
- 修改：`data/base/manifest.json`、`data/schema/dialogue-set.schema.json`、`data/base/dialogues/round-03-conversations.json`、`src/engine/dialogue-graph.ts`、`src/engine/dialogue-runtime.ts`、`src/engine/save-system.ts`、`src/game/world-loader.ts`、`src/game/grid-scene.ts`、`README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`、`docs/GDD.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/SAVES.md`。

## 风险

- 知识解锁是运行状态，必须同时贯通新游戏初始化、对话事务、存档捕获、恢复预检和百科显示；不能让界面显示已发现但条件读不到。
- 对话协议已有封闭 Schema/parser；扩展 kind 时需要两边同步，避免资源被 Schema 接收但引擎拒绝，或相反。
- 现有存档 protocolVersion 1 已保持小步向前兼容；新字段必须缺省归一且旧槽不会因新增字段报损坏。
- 图谱词条涉及世界观信息，未发现条目不能由百科列表、关系边或条件反馈意外泄漏。
- 知识资料资源按可选内容降级，缺失/无效时游戏仍可探索，但百科显示明确空状态，引用它的对话选项局部禁用。

## 预计人类工程师工时

约 12–16 小时：图谱协议和装配 3–4 小时；对话和存档状态接线 3–4 小时；百科界面及地图接入 3–4 小时；回归、内容与文档 3–4 小时。
