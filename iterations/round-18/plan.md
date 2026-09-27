# Round 18 计划：善恶、江湖声望与门派声望

## 本轮目标
把现有善恶、个人声望、逐 NPC 关系扩展为统一社会数值规则，并新增逐门派声望。不同数值拥有明确独立范围、通用增减与边界钳制；对白条件/效果、门派退门规则、师门 UI 和存档共享这套协议。

## 用户故事
作为行走江湖的玩家，我能看到自己整体行声与各门派对我的态度分别如何；数据对白可以因特定门派声望分支，也可在一次原子对话事务中改变数值；退门遵循该门派资料声明的善恶、个人声望和本门声望代价。旧存档读入后门派声望从中立值开始，不会拒档。

## 验收标准
1. `SocialState` 同时管理善恶（−100…100）、个人声望（0…1000）、门派声望（每派 0…1000）、逐 NPC 关系（−100…100）；各值的 signed delta 统一走中心化边界规则，缺省值为 0。
2. 对话增加 `factionRenown` 区间条件和 `adjustFactionRenown` 效果；Schema、引擎解析与引用装配一致，门派引用悬空时只剔除所在选项，效果仍受现有先验证再提交的原子事务约束。
3. 门派退门规则可给所属门派声望施加独立变化，旧门派资料省略该值时默认为 0；师门页面能查看各门派当前声望和退门代价。
4. v1 快照保存逐派声望；旧 v1 缺字段归一为空集合，恢复时移除当前资料中不存在的门派 id 并报告 warning，不影响其他进度。
5. 基础 faction 数据与导师对白示例展示加入/退门时本门声望变化和声望条件分支；对白指南/资料/架构/存档文档反映协议。运行构建、全量 Ajv 校验和纯规则冒烟验证覆盖边界钳制、条件、原子提交、门派退门与新旧存档路径。
6. 更新 `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`，提交一个 `round-18:` commit。

## 子任务
1. 扩展 Phaser-free 社会状态模型，统一 signed delta 与标量范围，接入门派 admission/departure 规则。
2. 扩展 dialogue-set 条件/效果 Schema、解析、跨资源引用校验、可见条件与原子执行。
3. 扩展 v1 存档捕获/解析/恢复的逐门派值兼容，并将当前声望接入 J 师门页。
4. 更新基础门派资料和协议文档，执行构建、Ajv 与 Node 冒烟检查，修复后提交。

## 涉及文件
- `iterations/round-18/plan.md`
- `src/engine/social-state.ts`、`src/engine/faction-system.ts`、`src/engine/character-progression.ts`
- `src/engine/dialogue-graph.ts`、`src/engine/dialogue-runtime.ts`、`src/engine/save-system.ts`
- `src/game/faction-ui.ts`、`src/game/grid-scene.ts`
- `data/schema/dialogue-set.schema.json`、`data/schema/faction-set.schema.json`
- `data/base/factions/round-04-factions.json`
- `data/base/dialogues/round-03-conversations.json`
- `docs/DIALOGUE-GUIDE.md`、`docs/DATA-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/SAVES.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`

## 风险
- 门派声望不得与江湖个人声望混用；退门只改变已加入的门派声望。
- 对话效果必须保留 staged copy 原子性，越界变化按统一范围钳制；无效门派引用需维持逐选项隔离。
- 新增字段保持 v1 向后兼容：旧快照缺字段时中立初始化，删除门派资料时仅剔除对应关系。
- UI 可能因多个门派长说明发生文字溢出；显示短数值和配置摘要并验证面板高度。

## 预计人类工程师工时
约 20–28 小时（社会规则/门派流程 5–7 小时；对白协议及事务 6–8 小时；存档/UI 接线 5–7 小时；内容文档与验证 4–6 小时）。
