# 对白规范指南（DIALOGUE-GUIDE）

对白（dialogue）是 NPC 交互的核心载体：一段对话是一个节点图，每个节点携带台词与可选的玩家选项，选项可声明**条件**（全部满足才可见）与**效果**（确认时原子执行）。协议实现位于 `src/engine/dialogue-graph.ts`（线格式与防御解析）与 `src/engine/dialogue-runtime.ts`（引用装配、条件求值、效果事务）；静态结构契约位于 `data/schema/dialogue-set.schema.json`。本文面向资料作者，说明如何写对话 JSON。

## 1. 文件与登记

- 对白集合存放在 `data/base/dialogues/*.json`，一个文件含多段对话。
- 在 `data/base/manifest.json` 登记资源（schema 固定为 `dialogue-set`）：
  ```json
  { "id": "dialogue.my-set", "path": "dialogues/my-set.json", "schema": "dialogue-set" }
  ```
- 对白资源是**可选内容**：缺失或整体无效时世界照常运行，只是没有对话；单个坏对话只禁用它自己。
- NPC 通过 `dialogueId` 引用对话（见 `data/base/characters/` 的 NPC 集合）。

## 2. 一段对话的骨架

```json
{
  "conversations": [
    {
      "id": "dlg.my-elder",
      "startNodeId": "greet",
      "nodes": [
        {
          "id": "greet",
          "text": "长者抬起头，把茶碗推给你。",
          "options": [
            { "text": "晚辈冒昧来访。", "nextNodeId": "ask" },
            { "text": "告辞。", "nextNodeId": "bye" }
          ]
        },
        { "id": "ask", "text": "「坐。」", "options": [] },
        { "id": "bye", "text": "长者重新闭目养神。" }
      ]
    }
  ]
}
```

- `id`：稳定对话 id，建议前缀 `dlg.`；集合内重复时保留先声明者并警告。
- `startNodeId`：进入对话时显示的首节点，必须存在于本对话。
- 节点：`id`（对话内唯一）、`text`（台词）、可选 `options`。省略 `options` 或给空数组即**结束节点**。
- 选项：`text`（1–100 字）、`nextNodeId`（目标节点必须存在）、可选 `conditions` / `effects`（至少各 1 条，空数组被拒绝）。

图语义在加载后逐段校验：节点 id 重复、起始节点缺失、选项目标断裂会禁用**该段对话**（及其引用它的 NPC），其余对话照常。

## 3. 条件（conditions）

选项携带多个条件时**全部满足才可见**；被过滤光的节点自然按结束节点处理，不会锁死对话。可用条件种类：

| kind | 字段 | 语义 |
|---|---|---|
| `questStatus` | `questId`、`status` | 指定差事处于 locked/offered/active/completed/failed |
| `itemCount` | `itemId`、`minCount` | 背包内物品数量下限（1–999） |
| `morality` | `minValue`/`maxValue`（至少其一） | 善恶位于闭区间（−100–100） |
| `renown` | `minValue`/`maxValue`（至少其一） | 声望位于闭区间（0–1000） |
| `factionRenown` | `factionId` + `minValue`/`maxValue`（至少其一） | 与指定门派的独立声望位于闭区间（0–1000） |
| `npcRelationship` | `npcId` + 区间 | 与指定 NPC 的关系（−100–100） |
| `knowledgeKnown` | `nodeId` | 已获知指定知识图谱词条 |
| `factionMembership` | `factionId`（可省）、`isMember` | 属于/不属于指定门派；省略 id 时检查是否加入任意门派 |
| `martialArtEligible` | `martialArtId` | 尚未掌握且满足该武学的等级/属性/门派资格 |
| `timeOfDay` | `periodId` | **游戏内当前时段**等于历法声明的时段 id |

### 3.1 时段条件（timeOfDay，Round 14）

- `periodId` 引用**日历资料**（`data/base/worldview/calendar.json`）里 `periods[].id`，例如 `period.night`、`period.dawn`。
- 时段由游戏内时间决定：成功移动、通过区域关口旅行和 V 键等候会推进时间（每步/每次/每次的分钟数由日历 `actionCosts` 配置），被阻挡的移动、被拒绝的传送和任何打开中的面板**不消耗时间**。
- 引用不存在的时段 id 时，装配期只**剔除该选项**并给出警告（`引用无效时段 "..."`），同节点其余选项与整段对话保持可玩——与其他跨资源引用的隔离规则一致。
- 时段按循环边界计算，跨午夜的时段（如子夜 00:00–04:30）在午夜前后都正确成立；历法语义校验保证 00:00 必有时段起点，因此夜间条件不会在零点失效。

## 4. 效果（effects）

确认选项时**先全量校验、后统一提交**：任一效果不可执行则整笔拒绝（节点不转移、状态零变更）并给出可读理由。可用效果：

| kind | 字段 | 语义 |
|---|---|---|
| `acceptQuest` / `abandonQuest` | `questId` | 接取（需 offered）/ 放弃（需 active，终态 failed） |
| `giveItem` / `takeItem` | `itemId`、`quantity` | 给予 / 收走物品（校验容量与持有量；装备中的唯一实例不可被收走） |
| `adjustMorality` | `delta`（非零） | 善恶调整（结果按边界钳制） |
| `adjustRenown` | `delta`（非零） | 声望调整 |
| `adjustFactionRenown` | `factionId`、`delta`（非零） | 调整指定门派的独立声望 |
| `adjustRelationship` | `npcId`（可省）、`delta` | 关系调整；省略 npcId 时作用于当前对话对象 |
| `discoverKnowledgeNode` | `nodeId` | 解锁知识词条（反馈显示其标题） |
| `joinFaction` | `factionId` | 由当前对话对象（须为该门派登记导师）拜师 |
| `leaveFaction` | — | 按当前门派资料声明的规则退门（善恶/江湖声望/本门声望代价、是否遗忘门派武学） |
| `learnMartialArt` | `martialArtId` | 授予一门当前已满足资格的武学 |

### 4.1 社会数值范围与调整（Round 18）

- 善恶是 `-100…100`，江湖个人声望是 `0…1000`，各门派声望独立为 `0…1000`，逐 NPC 关系为 `-100…100`；改动一个作用域不会自动改变其他作用域。
- `adjustFactionRenown` 和 `factionRenown` 条件都必须带 `factionId`，且在装配期检查门派是否有效。未记录的门派声望按 `0` 读取。
- 所有 signed delta 都按同一“当前值 + 变化量 → 各自范围钳制”规则处理。门派退门配置中的 `factionRenownDelta` 只作用于刚离开的门派；旧资料缺少该字段时为 `0`。
- 通过对白反复改变数值时，资料作者应结合任务状态、物品交付或其他进度条件限制奖励重复领取；引擎不会猜测某段叙事是否只能发生一次。

## 5. 引用装配与故障隔离

对白引用的外部 id（任务、物品、NPC、见闻、门派、武学、时段）在**世界装配期**统一校验：

- 悬空引用只剔除**所在选项**，节点可能因此成为结束节点，对话与其余选项照常；门派声望条件/效果的 `factionId` 也按此规则校验；
- 每次剔除都产生点名对话、节点与选项文本的警告（HUD 提示"已禁用相应内容"，详情见控制台）；
- 结构性错误（未声明字段、类型不符）在 Ajv Schema 层按资源拒绝；图语义错误按段隔离。

## 6. 写作与数值约定

- 一切台词、选项文本来自 JSON；引擎与场景代码不包含世界文本。
- 选项文本建议以玩家口吻书写；括号引导的动作/环境描写（如"（夜色正浓）……"）常与时段条件搭配。
- 条件区间使用闭区间，`minValue` 不得大于 `maxValue`（违者禁用该段对话）。
- 效果数值范围由 Schema 固定（数量 1–99、善恶/江湖声望/门派声望分别 ±100/±1000/±1000、关系 ±100）；超出即资源级拒绝。
- 对话应当能在**任何时段**至少有一条出路：不要把某节点的全部选项都加上互斥的时段条件，除非接受该时段对话直接结束。
