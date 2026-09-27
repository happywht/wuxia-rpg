# Round 25 计划：炼丹、药方发现与品质

## 本轮目标

实现数据驱动的炼制药炉与药方循环。玩家先向药师或通过见闻学得配方，再收集草药、支付药炉工钱，依悟性门槛炼出普通消耗品；同一配方在不同悟性阶段产出不同固定品质的 item id。品质和效果都由资料定义，制成品沿用背包、消耗、战斗与 v1 存档协议。

本轮新增原创药师、三张可发现药方、三味可购买草药与三条品质阶梯。品质采用确定性悟性门槛而非随机掷骰，方便玩家规划材料成本、复现制作结果并让 MOD 替换规则。

## 用户故事

- 作为玩家，我想在与药师交谈后逐步掌握药方，并在药炉查看已学和未学状态及发现提示。
- 作为玩家，我想知道当前悟性会产出哪档药、能恢复多少气血/内力，以及需要哪些材料与工钱。
- 作为玩家，我希望缺银两、材料或背包位置时制作失败且库存不变；成功后任务收集目标会按新数量刷新。
- 作为资料作者，我希望能用 JSON 声明工位、知识节点门槛、配料、费用、悟性门槛和每档结果，并以同路径 MOD 覆盖。

## 验收标准

1. 新增可选 `alchemy-set` JSON Schema 与 Phaser-free 解析/装配；验证工位可走格和占位冲突（出生点、NPC、关口、区域事件、遭遇、擂台、门派战、锻造台）、知识节点及 ingredient/output item 引用；坏配方逐条隔离，资源缺失/失效不阻碍地图和既有消耗品流程。
2. 药方通过现有对话 `discoverKnowledgeNode` 效果按条发现；药炉只允许制作已发现的有效药方，并在 UI 提示未知药方的发现线索。
3. 配方投入至少两种杂项药材和正银两成本；结果阶梯按 character insight 选取唯一最高可用阈值。首档悟性阈值为 0；后档阈值递增；恢复效果各维度单调不降且至少有提升。
4. 制作前完整检查资金、材料和结果容量；在背包副本扣料、模拟产出后才整体提交。无效投入或钱/料/空间不足时对背包、货币和角色状态保持原样。
5. 新产物为普通 `consumable` item，既有背包可用操作即刻显示并使用；制作/使用变化会刷新对应的 collectItem 任务目标。存档不新增字段，v1 往返只存结果 item id/数量。
6. 增加一名资料定义的药师 NPC；三味药材能通过现有商店获得；知识图谱记录药师、方子、药材和药品关系；配方内容支持同路径 MOD 覆盖。
7. 更新 CHANGELOG、DEVLOG、ROADMAP 及 GDD/架构/数据/知识图谱/存档/炼丹作者文档；生产构建、全部资料 Schema 校验、R25 专项烟测和 R24/R23 回归通过；提交 `round-25:` commit。

## 可验证子任务

1. **药方资料契约与发现链**：设计 schema、原创药材/药品、药师对话、knowledge nodes/edges 和跨引用装配。
2. **Phaser-free 品质与交易规则**：实现 insight 档位选择、制作资格与原子扣料/发放；证明品质单调、拒绝无副作用和满包转换。
3. **地图药炉与操作面板**：接入固定工位占位、邻接 E 交互、已发现方子/锁定提示、材料/费用/悟性/产物预览与输入锁。
4. **闭环验证与文档**：验证发现门控、任务数量回退/刷新、消耗品使用、普通 v1 存档恢复、MOD/无资源降级；补全相关文档与回归记录。

## 涉及文件

- 新增：`iterations/round-25/plan.md`、`src/engine/alchemy-system.ts`、`src/game/alchemy-ui.ts`、`data/schema/alchemy-set.schema.json`、`data/base/alchemy/round-25-alchemy.json`、`docs/ALCHEMY.md`、`scripts/smoke-round-25.mjs`。
- 修改：`data/base/manifest.json`、`data/base/items/round-06-items.json`、`data/base/shops/round-06-shops.json`、`data/base/characters/round-03-npcs.json`、`data/base/dialogues/round-03-conversations.json`、`data/base/knowledge_graph/nodes.json`、`data/base/knowledge_graph/edges.json`、`src/game/world-loader.ts`、`src/game/grid-scene.ts`、`src/game/controls-ui.ts`、`package.json`、`README.md`、`docs/GDD.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/KNOWLEDGE-GRAPH.md`、`docs/SAVES.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`。

## 风险

- 当前属性可能叠加装备/经脉；品质按运行时有效 `insight` 选择，规则需注明档位取“最高满足阈值”，避免排序歧义。
- 同一品质结果若恢复量下降会违背玩家预期；装配时对气血与内力恢复分别做单调性检验并要求提升。
- 药材消耗会让收集任务目标回退；制作成功必须调用既有物品数量刷新回调，拒绝交易不得触发。
- 背包已满时扣料可能释放堆栈容量，但只有克隆库存检查后再提交，防止扣料后产物溢出或状态不一致。
- 知识图谱和药炼资料均为可选资源；引用失效须禁用相关配方并明确警告，不能让整个世界启动失败。

## 预计人类工程师工时

约 20–28 小时：药方资料/知识链/Schema 约 5–7 小时，质量引擎与事务约 5–7 小时，地图工位/UI/经济接线约 5–7 小时，专项/回归验证和文档约 5–7 小时。分成以上四个可验证子任务完成。
