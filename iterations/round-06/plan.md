# Round 06 计划

## 本轮目标

在现有数据加载、角色状态和地图交互上实现第一版可玩物品系统：角色有数据定义的起始货币与物品，能查看背包、使用消耗品、装备/卸下装备；能与地图商人交互，购买商品与出售背包物品。装备属性进入角色有效属性和战斗结算。物品与商店规则保持 Phaser 无关，具体名称、说明、数值、价格、库存和商店文案全部来自 JSON。本轮暂不接入任务奖励/掉落、装备耐久、制作、存档或多商店共享库存持久化。

## 用户故事

- 作为玩家，我希望能查看身上的物品、当前装备与银两，并能使用恢复品继续探索。
- 作为玩家，我希望装备能改变角色战斗属性，并能卸下或替换装备。
- 作为玩家，我希望能与地图商人交互、购买商品、出售可交易物品，并得到货币/库存不足等清楚反馈。
- 作为资料作者，我希望仅通过 items/shops JSON 调整物品定义、装备效果、商店库存和文案，而不改引擎内容数据。

## 验收标准

1. 新增 draft-07 items-set、shops-set Schema 和基础 JSON；manifest 登记为可选资源。坏资源/坏条目产生可读警告，不能阻断地图、NPC、对话和战斗。
2. 角色模板用数据声明初始货币、背包容量、起始物品；运行时 inventory state 隔离玩家物品堆叠、装备槽、银两和商店余量。无效起始物品只逐条剔除。
3. Phaser 无关物品引擎支持叠加上限/背包容量、使用消耗品、装备/卸装备和生效的属性/生命/内力加成；不允许出售装备中的物品。失败的操作不丢物品、不扣钱、不消耗库存。
4. 商店购买需验证 item、库存、货币与背包空间；出售需验证拥有数量、可售属性并按数据价格/店铺比率结算。成功交易双方状态一致且有明确结果。
5. 地图提供背包键盘面板；对有有效 shopId 的相邻 NPC 按 E 打开商店，其它 NPC 仍走既有对话；背包或商店打开时探索移动锁定，关闭后恢复。战斗引擎读取装备后的有效属性/生命与内力上限。
6. 保留 R00–R05 行为，更新 README、ROADMAP、CHANGELOG、DEVLOG、GDD、ARCHITECTURE、DATA-GUIDE；`npm run build` 和临时纯逻辑/schema/浏览器手动验证通过，临时验证文件清理，提交 `round-06:` commit。

## 可验证子任务

1. **物品与商店数据/装配**：定义严格 Schema 和原创基础资料；扩展角色起始背包/货币；manifest 可选资源诊断；校验物品 id、NPC/shop/item 交叉引用与商品库存，按最小条目隔离坏资料。
2. **纯逻辑背包与交易规则**：实现背包状态、容量/堆叠、消耗品效果、装备槽和属性修正、购买/出售及失败原子性；使用临时脚本覆盖合法与非法边界。
3. **键盘 UI 与地图接线**：新增背包/商店面板与商人数据，集成到 GridScene；浏览器验证查看/使用/装备、交易、移动锁定与恢复、无效可选资料降级。

## 数据与规则约定

- `items` 集合定义稳定 id、原创名称/说明、类别、最大堆叠数、买入/卖出基价，以及可选的消耗效果或装备槽/属性/生命/内力加成。
- `shops` 集合定义稳定 id、NPC 引用、商店名称/欢迎文案、卖出比例、按 item id 声明的有限或无限库存。
- 角色模板新增 `startingCurrency`、`inventoryCapacity`、`startingItems`；起始物品数量必须为正，引用与数量上限由跨资源装配检查，坏引用只跳过该条。
- 背包容量按不同物品堆数计；相同物品最多持有 item `stackLimit` 个。商店买入价为 item `buyPrice`；卖出价为 `floor(sellPrice × shop.sellRate)`。
- 装备使用 data 声明的 `attributeBonuses`、`healthBonus`、`qiBonus`；切换装备时以装备修正前后差值更新有效属性与资源上限，并 clamp 当前资源，已获得的等级成长不回滚。
- 买/卖/用/装备在验证通过后一次性提交状态变化；失败时不应改变任何相关状态。
- 数据文本放 JSON；代码只含通用机制标签和结构化诊断，不写商店或物品的故事文本。

## 涉及文件

- `iterations/round-06/plan.md`
- `data/base/manifest.json`、`data/base/items/round-06-items.json`、`data/base/shops/round-06-shops.json`、`data/base/characters/round-04-profiles.json`、`data/base/characters/round-03-npcs.json`、相关对话 JSON
- `data/schema/items-set.schema.json`、`data/schema/shops-set.schema.json`、相关 NPC/角色 Schema
- `src/engine/item-system.ts`、`src/engine/character-progression.ts`、`src/engine/npc-placement.ts`、`src/game/inventory-ui.ts`、`src/game/grid-scene.ts`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`、`docs/GDD.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`

## 风险

- 当前玩家运行状态由遭遇资料挑选模板；物品系统不应依赖遭遇存在，应将玩家模板选择独立到角色/资料装配，并在遭遇缺失时仍可使用背包。
- 购买、出售、装备会同时改动货币/堆叠/库存/角色有效属性；必须先完成全部约束检查，再原子提交。
- 地图 UI 已同时有对话和战斗输入；新增面板要复用同一输入锁思路，避免叠加监听或破坏现有键位。
- 本轮仅内存运行状态；刷新后物品、装备、货币与库存回到模板/数据起点，存档留待 Round 09。

## 预计人类工程师工时

约 8–10 小时：资料契约与交叉装配 90–120 分钟，物品/交易引擎 150–210 分钟，背包/商店 UI 与场景接线 150–210 分钟，验证和文档 60–90 分钟。
