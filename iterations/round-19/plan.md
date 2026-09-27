# Round 19 计划：伙伴招募、同行与战斗支援

## 本轮目标
建立可扩展、由资料驱动的伙伴闭环：NPC 可在对白条件满足后加入同行，伙伴显示为跟随玩家的地图标记，玩家与伙伴的 NPC 关系继续影响招募对白，战斗中伙伴按资料声明的行动类型、强度与间隔提供自动支援；队伍状态进入 v1 存档并兼容旧档。

## 用户故事
作为一名行走江湖的玩家，我能在建立信任后邀一位 NPC 同行，在舆图移动和跨区旅行时看见伙伴跟上，在战斗中获得其专长帮助；我也能从伙伴页查看其关系、特长并让伙伴暂离。刷新或读档后，同行关系仍然存在。

## 验收标准
1. 新增可选 companions 数据资源、draft-07 Schema 和 Phaser-free 解析/装配；每个伙伴必须引用一个已装配 NPC，支持 `attack`/`heal` 两种支援、正整数发动间隔及有界效果值；坏引用只禁用相关伙伴。
2. 对话可用 `recruitCompanion` 效果加入已装配伙伴；单人同行槽避免同一时间伙伴重叠。伙伴页可查看伙伴名称、支援、与玩家关系，并可让当前伙伴暂离；招募对白以既有 NPC 关系条件分支。
3. 地图中当前伙伴以程序绘制跟随标记同行；成功网格移动后移到玩家刚离开的可走格，时段日程和碰撞索引不再把其原 NPC 位置当作占位；跨区旅行后安全重置跟随位置。
4. 回合战斗接受可选伙伴支援；成功玩家行动按配置间隔触发伙伴攻击或治疗，战报清楚标明伙伴行动，不改变无伙伴时既有战斗结果。
5. v1 存档记录当前同行伙伴 id；旧档缺字段归一为无伙伴；恢复时过滤已删除伙伴并给出 warning。
6. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md` 及伙伴/对话/战斗/存档/架构文档；构建、manifest 全资源 Ajv、伙伴/对白/跟随位置/战斗/存档 Phaser-free 冒烟检查通过后提交 `round-19:` commit。

## 子任务
1. 设计并实现伙伴资源 Schema、解析和 NPC 跨资源装配，以及纯函数运行状态/跟随格计算。
2. 扩展对白效果及事务状态、伙伴详情/暂离 UI、地图场景同行显示与移动/旅行同步。
3. 把伙伴战斗专长接入纯回合制战斗与战报；加入一位原创 NPC 的条件招募对白和数据定义。
4. 扩展 v1 存档兼容、文档与轮次日志；运行构建、全资源 Schema 和 Phaser-free 规则验证并修整问题。

## 涉及文件
- `iterations/round-19/plan.md`
- `data/base/manifest.json`、`data/base/companions/round-19-companions.json`、`data/base/dialogues/round-03-conversations.json`
- `data/schema/companion-set.schema.json`、`data/schema/dialogue-set.schema.json`
- `src/engine/companion-system.ts`、`dialogue-graph.ts`、`dialogue-runtime.ts`、`turn-based-combat.ts`、`save-system.ts`
- `src/game/world-loader.ts`、`grid-scene.ts`、`combat-ui.ts`、`companion-ui.ts`、`controls-ui.ts`
- `docs/COMPANIONS.md`、`docs/DIALOGUE-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/SAVES.md`、`docs/GDD.md`、`docs/DATA-GUIDE.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`

## 风险
- 跟随者不能挡玩家/NPC/遭遇格，也不能从其他场景遗留；跟随格需基于上一玩家格和当前地图碰撞计算。
- 伙伴效果必须经对话现有 staged copy 事务，后续效果失败时不能留下招募状态。
- 支援必须只在玩家成功行动后触发，间隔计数以一次成功玩家行动为准；支援击倒敌人时不能再执行敌方回合。
- 存档的伙伴 id 不是 NPC id；恢复要分别校验伙伴资料和所属 NPC，旧 v1 档缺字段按空伙伴处理。
- 小屏伙伴页和战报长文本需可读，伙伴不在当前地图时仍保留数据状态但不渲染静态 NPC 与跟随标记双份。

## 预计人类工程师工时
约 24–32 小时：资源协议/装配/运行状态 6–8 小时；对白/界面/地图同行 7–9 小时；战斗支援/内容资料 5–7 小时；存档/文档/验证与修整 6–8 小时。
