# Round 26 计划：社交记忆、态度传播与图谱回应

## 本轮目标

让 NPC 对世界线索保有各自的认知，并使玩家选择分享的见闻能改变对话分支；当资料图谱显式标注人物间的态度传播系数时，关系变化沿一条直接人物关系边产生受限的连带影响。社交记忆继续由数据定义并随存档往返，旧 v1 存档仍能按当前图谱补出 NPC 的静态见闻。

## 用户故事

- 作为玩家，我希望不同 NPC 只回应自己已知或我曾告诉他的见闻，不再把玩家的百科知识当成人人皆知。
- 作为玩家，我希望对话中可以把已掌握的消息告诉当前 NPC，并在之后看到这条消息改变他的回答。
- 作为玩家，我希望同一场江湖事件对互有牵连的人物产生有限、方向由资料声明的态度波及。
- 作为资料作者，我希望从 `knows` 边声明 NPC 初始知情，从人物关系边声明态度传播系数，并用对话条件/效果编排回应。

## 验收标准

1. 引擎增加独立的 NPC→知识节点记忆；新游戏以图谱中有效 `knows` 边初始化，运行中新增记忆不修改静态资料。
2. 对话 Schema、解析器、引用装配与运行时支持 `npcKnows` 条件及原子 `shareKnowledgeNode` 效果。分享仅能传播玩家已知、图谱有效的节点至当前对话对象；重复分享幂等；坏引用只隔离本选项。
3. 知识图谱边支持可选 `attitudeSpread`（-1…1，非零）；只允许人物到人物边。关系效果先结算直接 NPC，再按边系数对相邻人物做一次、不递归的有符号传播，按最近整数舍入（半数远离 0），数值仍按社会关系边界钳制。
4. NPC 记忆写入 v1 社会存档的可选 `npcKnowledge` 字段；缺字段的旧档兼容，恢复按已知 NPC/节点过滤无效引用并告警。存档往返保留动态分享记忆。
5. 基础原创对白与图谱至少提供一条“分享见闻→NPC 后续专属回应”和一条态度传播示例；人物名、节点和边关系都来自资料，不写入引擎常量。
6. 新增 Round26 专项烟测，覆盖图谱初始知识、对话条件/引用隔离、分享权限与幂等、事务回滚、关系传播方向/边界、旧新 v1 存档过滤；更新数据规范、架构/存档/图谱文档、CHANGELOG、DEVLOG、ROADMAP，并通过生产构建和资料校验。

## 可验证子任务

1. **图谱与记忆模型**：扩展关系边 Schema/解析器，验证传播系数和端点类型；实现 NPC 静态知情初始化及独立社交记忆集合。
2. **对白协议与事务**：增加 `npcKnows` / `shareKnowledgeNode` 封闭协议、跨资源校验、条件求值、分享效果、传播后的资料驱动反馈；验证坏选项隔离与失败不变性。
3. **存档和示例内容**：兼容扩展 v1 社会记忆字段、预检 MOD 移除后的引用，增补原创图谱/对白示例并接入场景初始化。
4. **专项/回归验证和文档**：实现 Round26 smoke，运行 smoke:round-25 至 smoke:round-23 关键回归、data 校验、生产构建、差异检查，记录结果并提交。

## 涉及文件

- 引擎：`src/engine/social-state.ts`、`src/engine/knowledge-graph.ts`、`src/engine/dialogue-graph.ts`、`src/engine/dialogue-runtime.ts`、`src/engine/save-system.ts`。
- 场景/数据：`src/game/grid-scene.ts`、`data/schema/knowledge-edges.schema.json`、`data/schema/dialogue-set.schema.json`、`data/base/knowledge_graph/edges.json`、`data/base/dialogues/round-03-conversations.json`。
- 验证：`scripts/smoke-round-26.mjs`、`package.json`。
- 文档：`docs/KNOWLEDGE-GRAPH.md`、`docs/DATA-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/SAVES.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`。

## 风险

- 玩家百科与 NPC 私有记忆是不同状态；不能让 `knowledgeKnown` 与 `npcKnows` 意外互相替代。
- 关系传播必须限定一跳且只使用关系边声明的系数，避免循环图导致级联或关系放大；旧边缺字段保持原行为。
- 存档字段虽可选，结构坏数据仍需有界解析；当前资料删除 NPC/节点时应逐条过滤，而非阻断整个旧档恢复。
- 社交记忆数据越界不能绕过事务；失败的选项不得部分写入 NPC 记忆、玩家关系或个人见闻。

## 预计人类工程师工时

约 18–24 小时：图谱/Schema/社交状态约 4–5 小时；对话解析、条件及原子效果约 5–6 小时；v1 存档兼容和资料内容接线约 4–5 小时；烟测、回归、文档及提交约 5–8 小时。
