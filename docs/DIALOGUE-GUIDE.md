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
| `npcKnows` | `nodeId`、可选 `npcId` | 当前对话对象（或指定人物）已知该图谱词条 |
| `factionMembership` | `factionId`（可省）、`isMember` | 属于/不属于指定门派；省略 id 时检查是否加入任意门派 |
| `martialArtEligible` | `martialArtId` | 尚未掌握且满足该武学的等级/属性/门派资格 |
| `timeOfDay` | `periodId` | **游戏内当前时段**等于历法声明的时段 id |
| `weather` | `weatherId` | 当前地区气候的天气 id 精确匹配；缺上下文时不成立，坏引用只剔除该选项 |

### 3.1 时段条件（timeOfDay，Round 14）

- `periodId` 引用**日历资料**（`data/base/worldview/calendar.json`）里 `periods[].id`，例如 `period.night`、`period.dawn`。
- 时段由游戏内时间决定：成功移动、通过区域关口旅行和 V 键等候会推进时间（每步/每次/每次的分钟数由日历 `actionCosts` 配置），被阻挡的移动、被拒绝的传送和任何打开中的面板**不消耗时间**。
- 引用不存在的时段 id 时，装配期只**剔除该选项**并给出警告（`引用无效时段 "..."`），同节点其余选项与整段对话保持可玩——与其他跨资源引用的隔离规则一致。
- 时段按循环边界计算，跨午夜的时段（如子夜 00:00–04:30）在午夜前后都正确成立；历法语义校验保证 00:00 必有时段起点，因此夜间条件不会在零点失效。

### 3.2 任务状态回声（questStatus-only，Round 59）

- 纯叙事回应可用一组互斥的 `questStatus` 选项（同一任务 active/completed 各一）挂在既有 greet 节点尾部，不带 effects——不接任务、不发奖励、不改关系，接取仍走名录/日志；Round 59 为芦桥集/南麓六项任务在七位人物对话中落地了 16 个此类节点。
- **谈话目标次序**：当 NPC 恰是某活动任务的 `talkToNpc` 目标时，场景在打开对话时**先发 `npc-talk` 信号、再按最新任务状态求首节点可见选项**——带齐材料的玩家同一次交谈就会从活动态回应切到完成态回应（如石北与姜百味）。写文案时活动态回应应描述"还缺什么"，完成态回应描述"刚办妥什么"。
- 同一任务的状态天然互斥，无需额外条件；不同任务的状态可以并存（例如石北处「芦桥寻集」完成态与「集期赶办」活动态同时可见），各回应各指各的节点即可。新增节点 id 建议带轮次前缀（如 `r58-…`）保持跨文件唯一。

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
| `shareKnowledgeNode` | `nodeId` | 玩家将自己已知的词条告知当前对话对象，后续可由 `npcKnows` 检查 |
| `joinFaction` | `factionId` | 由当前对话对象（须为该门派登记导师）拜师 |
| `leaveFaction` | — | 按当前门派资料声明的规则退门（善恶/江湖声望/本门声望代价、是否遗忘门派武学） |
| `learnMartialArt` | `martialArtId` | 授予一门当前已满足资格的武学 |
| `recruitCompanion` | `companionId` | 邀请有效伙伴同行（队伍仅一名伙伴；见 §4.3） |
| `dismissCompanion` | — | 让当前同行伙伴暂离（见 §4.3） |

上表即当前 `dialogue-set` Schema `definitions.condition` / `definitions.effect` 封闭枚举的**全部** kind（条件 11 种、效果 15 种）；`npm run audit:round-34` 会从 Schema 反查本文是否逐一覆盖。

### 4.1 社会数值范围与调整（Round 18）

- 善恶是 `-100…100`，江湖个人声望是 `0…1000`，各门派声望独立为 `0…1000`，逐 NPC 关系为 `-100…100`；改动一个作用域不会自动改变其他作用域。
- `adjustFactionRenown` 和 `factionRenown` 条件都必须带 `factionId`，且在装配期检查门派是否有效。未记录的门派声望按 `0` 读取。
- 所有 signed delta 都按同一“当前值 + 变化量 → 各自范围钳制”规则处理。门派退门配置中的 `factionRenownDelta` 只作用于刚离开的门派；旧资料缺少该字段时为 `0`。
- 通过对白反复改变数值时，资料作者应结合任务状态、物品交付或其他进度条件限制奖励重复领取；引擎不会猜测某段叙事是否只能发生一次。

### 4.2 NPC 私有记忆与关系传播（Round 26）

- `knowledgeKnown` 检查玩家；`npcKnows` 检查 NPC 私有记忆，二者不能互相替代。省略 `npcId` 时，`npcKnows` 检查当前对话对象。
- `shareKnowledgeNode` 要求玩家先发现该节点；成功后只记录给当前对话对象，不解锁玩家新词条。重复分享仍可执行，但回报“对方已知道”，不会重复增加存档数据。
- 图谱 `knows` 边若起点是人物，会在开局为该人物初始化其静态知识；运行中从对白分享得到的记忆在存档里单独保存。
- 知识图谱人物到人物边可选声明 `attitudeSpread`，范围为 `-1…1` 且不可为 0。该人物关系变化会对边终点产生一跳、一次的按系数变化，不继续传播；按最近整数舍入（半数远离 0），结果为 0 时不写入。只有两端均为人物的边才生效。
- 人物与知识节点等跨资源引用仍在装配期校验；图谱关系列出关系摘要以供百科，`attitudeSpread` 是额外运行规则，不能替代 `summary`。

## 5. 校验分层与故障隔离

对白协议的检查分三层，各自负责不同性质的错误，失败粒度也从粗到细：

| 层 | 实现 | 检查内容 | 失败粒度 |
|---|---|---|---|
| ① Ajv 静态 Schema | `data/schema/dialogue-set.schema.json`（draft-07，资源加载器执行） | 字段白名单、类型、长度、封闭枚举（条件/效果 kind 与字段）、数量/区间边界、`conditions`/`effects` 非空、`additionalProperties: false` | **整份资源拒绝** |
| ② 防御性图解析 | `src/engine/dialogue-graph.ts`（Phaser-free） | 对话 id/节点 id 唯一性、`startNodeId` 存在、选项 `nextNodeId` 指向本对话中已存在节点；draft-07 表达不了的字段间语义（如 `minValue <= maxValue`）也在此拒绝 | **单段对话禁用**（同集合其余对话保留） |
| ③ 跨资源装配 | `src/engine/dialogue-runtime.ts` 的引用装配（Phaser-free） | 条件/效果引用的任务、物品、NPC、见闻、门派、武学、时段、伙伴 id 是否存在于当前有效资料 | **只剔除所在选项**（节点可能因此成为结束节点） |

三层之后的运行期（条件求值、效果事务）也是 Phaser-free 的纯逻辑：条件在打开面板时按当前游戏状态过滤可见选项；效果在确认时先在独立副本中全量校验、再一次提交（原子性）。Schema 只声明「数据长什么样」，不声明「引用是否存在」「执行是否可行」——后者是 ②③ 与运行时的职责；因此**文档表格中的语义列描述的是运行时行为，字段与边界列以 Schema 为准**。

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

### 4.3 同行伙伴（Round 19）

- `recruitCompanion` 携带 `companionId`，世界装配会核对该 id 是否存在于有效伙伴集合；无效时只剔除引用该伙伴的选项。
- `dismissCompanion` 不带参数，让当前同行伙伴暂离。对白效果仍先在独立副本中校验、全量提交；一个后续效果拒绝时，前面的招募/暂离也不会泄漏。
- 招募门槛建议使用 `npcRelationship` 指向伙伴的 `npcId`，也可与任务、物品、声望、时段等既有条件组合。伙伴和 NPC 是不同的数据身份，关系条件始终引用 NPC id。
- 伙伴资料字段、支援数值、跨资源隔离和存档规则见 `docs/COMPANIONS.md`。

Round 19 以后，引用装配覆盖任务、物品、NPC、见闻、门派、武学、时段与伙伴 id；Round 26 的人物私有见闻条件和分享效果也参与同一对话选项隔离。

## Round 105 更新

先从来源discoverKnowledgeNode记录判断，再在接收人现场shareKnowledgeNode；分享与关系/送达由同事务处理。仅玩家已知不表示npcKnows成立，重复送达须以knowledgeKnown.isKnown:false封门。

## Round 141 已完成：对白天气条件与巡路提示

新增对白条件 {kind:weather,weatherId}：封闭Schema/防御解析，装配校验已声明天气，未知引用只移除本选项；GridScene使用当前地区currentClimate，缺上下文失败关闭。柳寻径八种天气纯巡路分支，无效果/奖励；当前晴天实际重复与第三栏保存。未改变存档字段、资源数量或原任务/转述。实际只验证晴天，其它天气为测试可见性/结构验证；不会把测试当天气实走。作者源scripts/apply-round141-weather-dialogue.mjs幂等并拒绝覆盖已改节点。旧消费者可省weatherId/weatherIds：旧无天气条件对白仍可用，新增条件不会假定默认晴天。MOD可引用已声明天气，错引用装配警告；不新增迁移。

确认边界补充：界面传最后显示的原始选项index，运行时重筛条件并核对同一index；天气变化使可见位置挪动时，不执行挪入该位置的另一选项，而提示重新选择。旧控制器第三参数可省，保留接口兼容。身份变化纯测试通过；未真实注入天气变更。作者链通过round105的深化入口接入，历史生成器fixture同步复制新helper；缺d.mts曾使类型检查失败，已补类型声明，日志保留。

天气示例：`{"kind":"weather","weatherId":"weather.snow"}`。weatherId须来自已校验climate.weathers；所有conditions仍按AND组合，时间/天气/任务条件各自成立才可选。确认重新筛选并核对最后显示的原始选项索引，条件变化不能把另一选项当旧选择执行。
