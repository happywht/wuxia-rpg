# Round243 计划：打通听雨授艺资格与装备成长旅程

## 本轮目标

核对听雨剑阁各授艺门槛，沿游戏已有商品和成长路线补足角色属性；串联门派、采购、装备、授艺资格和安全读档。

## 用户故事

作为刚拜入听雨剑阁的抄书学徒，我能从资料得知招式条件，找到正常补足路径，穿戴装备后取得授艺资格，并安全继续旅程。

## 验收标准

1. 从隔离来源5206本人Round242槽一读回，不碰5204/5205及其它槽。
2. 核对基础听雨剑法、落雨七分剑数据门槛并追踪选项筛选原因。
3. 实走购买/装备柳叶判官笔，验证门槛变化；如能抵达师父则授艺并实战，受阻则如实记录。
4. 仅在确认标题/正文/旧摘要为本人槽一后保存，主菜单Continue读回并核验状态。
5. 新增资格回归；专项测试/typecheck通过；更新迭代/目标/日志并独立提交。

## 子任务

- 追踪武学数据、属性成长、商品库存和授艺条件筛选。
- 继续存档实走拜师后采购装备，验证授艺资格变化。
- 安全存档及Continue读回，尝试抵达师父授艺。
- 增加回归，更新证据与项目日志。

## 涉及文件

`data/base/skills/round-04-martial-arts.json`、`data/base/items/round-06-items.json`、`data/base/shops/round-06-shops.json`、`src/engine/character-progression.ts`、`src/engine/dialogue-runtime.ts`、`tests/round107-growth-routes.test.ts`、`iterations/round-243/`、`docs/PROJECT-GOALS.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`。

## 风险

NPC依时段移动，地形和角色占位影响路径；武学条件过滤未满足选项。仅覆盖隔离来源本人槽一，确认身份和摘要一致。

## 预计人类工程师工时

≥60分钟：数据/引擎追踪15分钟，实走成长20分钟，存读10分钟，回归验证10分钟，文档/提交5分钟。
