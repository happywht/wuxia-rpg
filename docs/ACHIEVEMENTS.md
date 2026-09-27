# 成就资料、进度与奖励（Round 28）

- 状态：Round 28 实现与自动化验证已完成；未进行浏览器手动游玩，因此 G 键面板和奖励提示未做交互实测。
- 成就是可选的世界资料，由 `achievement-set` Schema 校验；引擎只解释统一条件协议、投影当前旅程进度并在条件全部满足时一次性发放资料声明的奖励。世界没有有效 `achievement.round-28-set` 资源时，其余区域、任务、战斗与制作系统照常加载，G 键给出提示。
- 关联：`docs/DATA-GUIDE.md`（资料族与作者须知）、`docs/SAVES.md`（`achievementState` 存档字段）、`docs/ARCHITECTURE.md`（装配与降级）。

## 文件与覆盖

- `data/schema/achievement-set.schema.json`（draft-07）定义封闭字段与基本类型；单条记录的数值语义由防御解析器补充校验，以便隔离错误成就。
- `data/base/achievements/round-28-achievements.json` 声明成就集与 14 条基础成就。
- `data/base/manifest.json` 登记资源 id `achievement.round-28-set`（可选资源）。MOD 可用相同相对路径 `achievements/round-28-achievements.json` 覆盖，覆盖后的数据仍须通过同一 Schema 校验。
- 协议实现位于 `src/engine/achievement-system.ts`（Phaser 无关）；面板位于 `src/game/achievement-ui.ts`；装配接线位于 `src/game/world-loader.ts`，玩法收口与奖励发放位于 `src/game/grid-scene.ts`。

加载分两层防御：

1. **Ajv 静态校验**（资源级）：Schema 约束 root 结构、JSON 类型与封闭字段；类型错误、未知字段或根结构不符时，按可选资源跳过该资料并给出 warning，世界其余内容继续运行。
2. **防御解析器**（`parseAchievementSet`，逐条隔离）：重复/非法 id、名称/说明/优先级/条件/奖励语义越界、条件字段缺失或非法时，只禁用对应成就并逐条警告；成就集本身结构无效（id 不符、条目数不在 1–128）才整体拒绝。Schema 接受的单条记录故意是语义协议的结构超集，供解析器执行逐条值域和必填检查。

## 成就集与成就条目

成就集（AchievementSet）字段为 `id`（前缀 `achievement.set.`）与 `achievements`（1–128 条）。每条成就：

| 字段 | 边界 | 说明 |
|---|---|---|
| id | 前缀 `achievement.`，至多 96 字符 | 跨存档的历史标识，保持稳定 |
| title | 1–48 字符 | 面板列表与详情标题 |
| description | 1–240 字符 | 详情描述 |
| priority | −1000…1000 | 面板排序权重，降序显示 |
| conditions | 1–12 条，AND 组合 | 全部满足才解锁（见下表） |
| reward | experience 1–100000 和/或 currency 1–1000000，至少一项 | 首次解锁时一次性发放 |

## 条件协议（封闭 14 类）

| 条件 kind | 字段 | 判定内容 |
|---|---|---|
| playerLevel | minLevel（1–99） | 角色当前等级 |
| completedQuestCount | minCount | 已完成任务数量（任意任务） |
| knownKnowledgeCount | minCount | 已发现知识词条数量 |
| knowledgeKnown | nodeId | 玩家已发现指定知识节点 |
| morality | minValue 和/或 maxValue | 善恶闭区间（−100…100） |
| renown | minValue 和/或 maxValue | 江湖声望闭区间（0…1000） |
| npcRelationship | npcId、区间 | 指定人物关系闭区间（−100…100） |
| factionMembership | isMember、可选 factionId | 是否属于指定门派；省略 id 时检查是否在任何门派 |
| battleVictories | minCount | 累计战斗胜利场数（存档计数器） |
| arenaChampionships | minCount | 擂台夺魁总次数（按战绩册汇总） |
| meridianNodes | minCount | 已打通经脉节点数 |
| customMartialArts | minCount | 玩家自创武学数量 |
| equipmentCrafts | minCount | 累计装备锻造次数（存档计数器） |
| alchemyCrafts | minCount | 累计炼丹次数（存档计数器） |

每条条件必带资料作者书写的 `hint`（1–140 字符），面板用它解释还差什么。计数类条件的 `minCount` 在 Schema 中按种类设有上限（如 meridianNodes 64、customMartialArts 128、arenaChampionships 99999）；区间类条件至少声明一端，且 minValue 不得大于 maxValue（该语义由防御解析器补足校验，坏条件只禁用所在成就）。

跨资料装配（`assembleAchievementSet`）在世界加载期对照当前有效的人物、门派、知识节点集合：悬空 npcId/factionId/nodeId 引用只禁用对应成就并给出点名 warning，其余成就继续参与评估。当前条件词汇不含按任务 id 引用的条件（`completedQuestCount` 只统计数量），因此不存在逐任务的悬空校验。

## 进度投影与排序

`evaluateAchievements` 是纯函数：输入成就集与当前旅程上下文（角色、任务状态、已知词条、社会状态、门派身份、关系、擂台战绩册、成就运行态），只读返回每条成就的逐条件进度，不修改任何状态。进度展示规则：

- **计数类**（playerLevel、各 minCount 类）：显示 `当前值 / 目标值`。
- **区间类**（morality、renown、npcRelationship）：显示当前值与目标（`≥ x`、`≤ y` 或闭区间 `x–y`）。
- **布尔类**（knowledgeKnown、factionMembership）：显示当前状态与目标（`已发现/未发现`、`是/否`）。

面板列表按 priority 降序、同优先级按 id 升序稳定排序；每行还汇总 `metConditionCount`（已满足条件数），全部满足视为达成（met）。

## 解锁与一次性奖励

`unlockReadyAchievements` 把"已达成且未在解锁名单中"的成就 id 锁存进运行态，并返回新解锁清单——之后条件回落或重复调用都不会再次发奖。场景在有限收口点重评（见下），每次最多循环"成就数 + 1"轮，使奖励经验引发的升级能继续满足等级类成就（例如领奖升到 2 级立即达成"初窥门径"）。

奖励发放规则：

- **银两**：`min(999999999, 当前 + 奖励)`，按存档货币上限安全截断，不要求背包容量。
- **经验**：经 `grantExperience` 按角色成长协议累计，升级消耗经验、满级丢弃溢出；由此获得的等级数还会按经脉规则发放修为（与其他经验来源一致）。
- **提示**：解锁即时通过区域提示显示"成就达成：…"（同一次评估合并为一条），并写 `console.info` 诊断日志；面板中该成就转为"已解锁"。

### 评估收口点

- 底部状态行刷新（`updateInteractHint`）：移动、任务/物品变更、各类面板关闭（含战斗结算关闭）等既有收口都会触发，是主要的重评入口。
- 对白选项确认后：对话效果可能改变善恶、关系、门派、见闻或习得武学，场景在会话仍活跃时立即重评。
- G 键打开成就面板前：保证面板展示最新进度。
- 战斗胜利在结算关闭时记入 `battleVictories` 计数器；锻造/炼丹成功分别在交易提交后记入 `equipmentCrafts`/`alchemyCrafts` 计数器。三个计数器单调递增、在 999,999,999 饱和，不随任何失败路径回退。

注意：旧存档恢复后的第一次评估会为"在新成就发布前就已满足门槛"的进度补发一次奖励（每个 id 仅此一次）；此后由持久化解锁名单保证读档/重开不再重复领赏。

## G 键成就面板

- **打开**：探索状态下按 G（任何覆盖层打开时无效）；世界无有效成就资料时提示"当前世界没有可用的成就资料。"，面板打开期间探索输入锁定，Esc 关闭。
- **布局**：左列为成就列表（每页可视 9 行），● 表示已解锁、○ 表示进行中，行内显示"已解锁/进行中"与首条条件进度；右侧为选中成就详情，含标题、描述、达成奖励（`经验 +x · 银两 +y`）、奖励状态说明与至多 7 项条件的逐条 `✓/·` 进度。超过 7 项时提示剩余条件数量。页眉汇总"已解锁 X / Y"。
- **操作**：←/→ 将焦点切换至成就列表或条件详情，↑/↓ 或 W/S 在焦点列移动，PageUp/PageDown 翻页，Esc 关闭；列表和条件均可独立滚动，并显示各自滚动范围。
- 帮助面板（H）的键位速查已加入 `G 成就`；探索态底部提示行含 `G 成就`。

## 存档兼容（v1 可选字段）

`achievementState` 是 v1 快照的可选字段，结构为：

```json
{
  "unlockedIds": ["achievement.first-breath"],
  "battleVictories": 3,
  "equipmentCrafts": 1,
  "alchemyCrafts": 0
}
```

- **旧档兼容**：Round 27 及更早 v1 快照缺字段时解析为空名单/0（`createAchievementRunState`），不要求升级协议版本；捕获/恢复时深拷贝，不与运行态共享引用。
- **解析边界**：`unlockedIds` 至多 512 个唯一非空字符串；三个计数器各为 0–999999999 整数；任何越界使整份存档拒载（与既有存档严格口径一致）。
- **id 历史性**：解析与恢复**不**按当前资料过滤 `unlockedIds`——临时移除 MOD 成就后再启用不会重复发奖；名单只增不减，玩家无法通过删改资料重领奖励。
- 面板进度、条件判定与奖励结算均为派生值，不写入快照。

## 基础成就内容（14 条）

基础资料覆盖成长、任务、知识、社会、门派、关系、战斗、擂台、经脉、自创武学、锻造与炼丹：

| 成就 | 条件 | 奖励 |
|---|---|---|
| 初窥门径 | 角色达到 2 级 | 经验 +30 · 银两 +20 |
| 初承差事 | 完成 1 项差事 | 经验 +45 · 银两 +35 |
| 雨夜识踪 | 查明雨后脚印的线索（指定见闻） | 经验 +40 · 银两 +25 |
| 江湖百闻 | 发现至少 16 条江湖见闻 | 经验 +40 · 银两 +25 |
| 善念初明 | 善恶值达到 5 | 经验 +35 · 银两 +30 |
| 小有名声 | 江湖声望达到 10 | 经验 +45 · 银两 +40 |
| 择门而入 | 拜入一个门派 | 经验 +50 · 银两 +30 |
| 茶棚知交 | 与茶棚主人关系达到 15 | 经验 +40 · 银两 +40 |
| 三战有成 | 赢得 3 场战斗 | 经验 +55 · 银两 +35 |
| 擂台留名 | 夺得 1 次擂台魁首 | 经验 +80 · 银两 +60 |
| 气行一脉 | 打通 1 个经脉节点 | 经验 +65 · 银两 +40 |
| 自成一招 | 创制 1 种自创武学 | 经验 +75 · 银两 +55 |
| 百炼成器 | 完成 1 次装备锻造 | 经验 +60 · 银两 +45 |
| 炉火初温 | 完成 1 次炼丹 | 经验 +60 · 银两 +45 |

数值门槛按当前基础资料的可达成路径设置（既有任务、对白、门派与制作流程都能满足），不以不可达阈值伪装"隐藏成就"。全部文案为原创。

## MOD 与可选行为

- **未登记/缺文件**：`achievement.round-28-set` 在 manifest 中是可选资源；缺失或有效集合为空时世界照常加载，G 键给出无资料提示，存档 `achievementState` 仍正常读写（保留历史 id）。
- **同路径覆盖**：MOD 以 `mods/<modId>/achievements/round-28-achievements.json` 整文件替换，按 `enabledMods` 声明顺序叠加，后声明者优先；覆盖同样要过 Ajv 与防御解析两级校验。
- **坏条目隔离**：单条成就的任何字段/条件问题只禁用该条并警告；悬空人物/门派/知识引用在装配期只禁用对应成就。MOD 移除已解锁的成就不清理存档 id——重新启用后不会二次发奖。
- MOD 想追加成就时，可整文件替换基础集并在数组末尾追加条目（同路径覆盖是整文件替换，无字段级合并）。

## 验证结果（Round 28）

- `npm run smoke:round-28`：通过；覆盖协议解析/坏条目隔离、14 类条件进度与区间/布尔分支、评估纯度、计数器边界、一次性解锁与历史 id、悬空 MOD 引用、完整世界装配及旧/新 v1 存档往返。
- `npm run smoke:round-27`、`npm run smoke:round-26`、`npm run smoke:round-25`：串行通过。
- `npm run validate:data`：通过，manifest 与 25 个基础资源 Schema 有效。
- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 输出主 JS chunk 超过 500 KB 的体积提示。
- `git diff --check`：通过；仅显示仓库的 LF→CRLF 工作副本规范化提醒。
- 未进行浏览器手动游玩，G 键面板和实际奖励提示未做交互实测。
