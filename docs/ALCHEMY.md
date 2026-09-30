# 炼丹与药方发现

Round 25 加入数据驱动药炉、可发现配方和确定性成药品质。系统复用普通物品/商店、知识图谱、对话效果、任务收集目标与 v1 存档，不另建角色进度字段。

## 资料位置

- 可选集合：`data/base/alchemy/round-25-alchemy.json`，Schema 为 `data/schema/alchemy-set.schema.json`。
- 药材与成药：`data/base/items/round-06-items.json`；药材可作为 `misc` 物品交易，成药使用 `consumable` 的气血/内力恢复协议。
- 工位地图和药师：`data/base/maps/` 与 `data/base/characters/round-03-npcs.json`。
- 药方授予和知识关系：`data/base/dialogues/round-03-conversations.json`、`data/base/knowledge_graph/nodes.json`、`edges.json`。

药炼集合含 `stations` 与 `recipes`。工位声明稳定 id、显示名、地图资源 id 与格坐标。配方声明名称、描述、发现线索、所需知识节点、工位、至少两种不重复的杂项投入、正银两费用和 2–5 档结果。结果按 `minimumInsight` 严格递增，首档必须是 0；运行时选择不高于当前悟性的最高档。成药引用普通消耗品 item id，各恢复维度不得倒退，并且每档至少一项更强。

## 发现、制作与事务

配方 `discoveryNodeId` 对应 `knownByDefault: false` 的知识节点。资料作者可在对白选项上使用 `discoverKnowledgeNode` 效果授方；图谱节点即玩家已学配方的唯一状态来源。药炉面板可列出未识配方的通用序号和线索，不泄漏药方名、材料或结果；已知配方显示投入、持有数、工钱、当前悟性与预计品质/恢复量。

炼制前先验证知识、银两、每项材料和扣料后的结果物品容量。引擎在库存副本中扣除投入并模拟添加一件成药，全部成功后一次提交货币、堆栈和装备引用；任何拒绝均不得修改调用者状态。成功后刷新 `collectItem` 任务目标，并可将新成药 item 节点加入百科已知集。结果是普通消耗品，可在背包使用、保存、恢复；存档只记录正常库存 item id/数量和已有 `knownKnowledgeNodeIds`。

## 占位与 MOD

药炉必须位于可通行地图格，不能与出生点、NPC、关口、区域事件、遭遇、擂台、门派战或锻造工位重叠。固定工位格还会屏蔽 NPC 时段日程；玩家需站在四方向相邻格按 E 使用。集合资源可缺省；资料结构错误只关闭炼丹入口。语义错误的单个工位/配方会分别被隔离并给出加载诊断，其他有效配方继续可用。

MOD 可以同路径提供 `alchemy/round-25-alchemy.json` 覆盖默认工位和药方。编辑后运行 `npm run validate:data`；引擎事务和品质规则用 `npm run smoke:round-25` 验证。炼丹运行逻辑位于 Phaser-free `src/engine/alchemy-system.ts`，面板与世界接线位于 `src/game/alchemy-ui.ts`、`grid-scene.ts`。

## Round104 制作与实际用途

药庐清点由备苍崖根×3扩为问生肌散方、药炉制作、背包实际恢复和容素青复核；刀场淬料由熟铁砂×2扩为铁砧重理笔剑、装备淬锋短剑、持剑击退芦桥旧例索钱人和祝九弦复命。两项原经验银两不变，新版全程才给实践见闻。Q/N导航制作工位，I背包操作；药炉(13,4)、铁砧(10,4)需站邻格E。材料由江南姜百味出售，未实现北坡采挖；生肌散18/28/40生命、0/6/12内力，没有恢复收益不消耗。

通用目标`craftRecipe`只记录制作成功、`useItem`只记录实际使用、`equipItem`只记录穿戴成功；`alternativeTargetIds`兼容三品质，`defeatEncounter.requiredEquippedItemId`核对胜利时装备。购买/持有/失败/卸下/旧胜利不替代行动。v1旧完成保留，不能伪造新增实践；旧active保留原阶段。成本/配方/旧库存政策与真实旅程未验收边界见[CRAFTING-LOOPS.md](CRAFTING-LOOPS.md)。
