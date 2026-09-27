# Round 21 计划：门派战

## 本轮目标

加入一套资料驱动的门派战活动：门派弟子在战区入口报名，依次迎战对立门派的代表；每场胜利累积贡献，连战结果结算胜负、个人/门派声望及可供百科和对白读取的战事见闻。活动记录写入现有 v1 存档协议，新旧存档均可安全解析。

## 用户故事

作为已拜入门派的弟子，我想在战区查看双方、战事阶段、贡献和过往战绩，报名后通过实战帮助本门争胜，并让战果影响江湖声名与后续人物回应。

## 验收标准

1. 门派战作为 manifest 资料集加载，具备严格 JSON Schema、逐项语义校验和跨资源引用隔离；规则、阵营、敌手、阈值、声望变化、见闻节点及文本均来自数据。
2. 玩家须属于参战门派之一且在邻接入口按 E 交互；报名面板显示战事双方、阶段、贡献门槛和战绩。连续战斗复用通用 CombatSession，不将战事敌人登记成地图遭遇。
3. 各阶段胜利累积资料定义的贡献；通关达到门槛判胜，未达门槛判为僵持，败退判负。结算按结果更新双方门派声望、个人声望，并发现资料指定的知识图谱节点，使现有对白/百科门控可见。
4. 持久记录报名、胜/负/僵持、最高贡献及上次结果；缺少新字段的 Round 20 及更早 v1 存档安全默认为空，往返存读保留记录。
5. 移除门派战资源不会阻止核心游戏启动；MOD 可通过 manifest 同名资源覆盖。构建、全量 Schema 校验及无 Phaser 运行时冒烟验证通过。
6. 更新门派战设计说明、CHANGELOG.md、DEVLOG.md、ROADMAP.md，并记录验证命令；本轮独立提交 round-21 commit。

## 子任务（均可独立验证）

1. **资料协议与装配**：定义门派战 Schema、解析/组装/坏引用诊断，并配置原创战区、阵营、连战阶段、结果后果与见闻节点；验证有效资料装配和坏引用隔离。
2. **交互和战斗闭环**：制作报名/战绩面板，接入邻接入口、门派资格检查、贡献累积和胜负结算；验证连续战斗不污染地图遭遇状态。
3. **后果与存档兼容**：将战果接到社会状态、知识发现、百科/对白；添加战绩快照解析、捕获与恢复并验证旧 v1 数据默认值。
4. **回归和文档**：执行 build、data validation、专用冒烟脚本及 diff 检查；完善设计文档和迭代日志并提交。

## 涉及文件

- `iterations/round-21/plan.md`
- `src/engine/faction-war.ts`、`src/engine/save-system.ts`
- `src/game/world-loader.ts`、`src/game/grid-scene.ts`、`src/game/faction-war-ui.ts`
- `data/schema/faction-war-set.schema.json`、`data/base/manifest.json`、`data/base/faction_wars/round-21-wars.json`
- `data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`、`data/base/dialogues/round-03-conversations.json`
- `scripts/smoke-round-21.mjs`、`docs/FACTION_WAR_DESIGN.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`

## 风险

- 连战多个会话容易误触发常规遭遇奖励或任务目标；战事会话需有独立标识并在结算时统一清理。
- 失败/撤退/刷新可能造成重复或丢失后果；本轮只允许在战斗外保存，结算函数必须单次消费运行态并确保记录、声望、见闻一致更新。
- 存档引用到被 MOD 移除的战事数据时不能使整档失效；恢复时应过滤未知战事记录并保留已加载资料中的记录。
- 现有 factionRenown 上限为 1000，结算须复用钳制规则，且不能把玩家不所属门派的战役结果套用到错误阵营。

## 预计人类工程师工时

约 26 小时（资料协议及装配 6 小时、交互和连战 8 小时、结算后果与存档 6 小时、验证和文档 6 小时）；本轮实际工作超过 10 分钟，拆为四个可验证子任务。

## Round 21 兼容性复核补充计划

### 目标与验收标准

修复只读审查发现的 Schema/UI 阶段数不一致：Schema 允许最多 12 阶段，战事面板须能分页展示全部阶段且不覆盖战绩区域。另让无 Phaser 冒烟按产品实际顺序使用 `planSnapshotRestore` 产出的快照调用 `restoreRunState`，覆盖 MOD 移除与保留战事两条恢复路径；单纯查看报名面板不应写入空战绩。

### 可验证子任务

1. 为 Phaser-free 门派战模块添加安全分页协议，并在报名面板按可用高度分页浏览，覆盖 12 阶段上限。
2. 将战绩记录写入时机移至实际报名动作；扩展冒烟断言分页边界及预检后快照的过滤/保留恢复。
3. 更新设计说明和开发日志，重跑构建、资料校验、Round 20/21 冒烟及差异检查。

### 涉及文件、风险与预计工时

- 涉及：`src/engine/faction-war.ts`、`src/game/faction-war-ui.ts`、`src/game/grid-scene.ts`、`scripts/smoke-round-21.mjs`、`docs/FACTION_WAR_DESIGN.md`、`DEVLOG.md`、本计划。
- 风险：短视口/大字号会压缩阶段列表可用高度；分页容量根据面板实际高度计算，至少显示一个阶段，并保留战绩和操作区。
- 预计人类工程师工时：约 45–75 分钟。
