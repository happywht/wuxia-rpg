# 自创武学系统（Round 22）

本系统让玩家将三种资料组件组合成一门可命名、可学习、可用于战斗的原创武学。规则实现位于 `src/engine/martial-art-forge.ts`，界面位于 `src/game/martial-art-forge-ui.ts`；引擎不包含具体武学名称、招式文本或江湖人物。

## 组件资料

`data/base/manifest.json` 的可选 `martial-art-forge-components` 资源指向 `data/base/skills/round-22-components.json`，由 `data/schema/martial-art-components.schema.json` 校验。资源可缺省；缺失、格式错误或语义无效时，世界仍可进入，HUD 报告创制功能不可用。MOD 可镜像该文件路径覆盖组件集合。

每个组件有稳定 `id`、`slot`、名称/类别/路数/说明、整数 `power`、整数 `qiCost`、银两价格和 `kind`：

- `intent`：招式组件，`kind` 只能是 `attack` 或 `heal`，功力 1–18、内力 0–12。
- `form`、`breath`：架势与吐纳调整组件，`kind` 必须为 `null`；功力调整范围为 −10 至 18，内力调整范围为 −10 至 12。
- 三种 slot 均至少各有一项；id 在集合内不可重复，价格必须为 1–10000 正整数。

Schema 负责字段形状；Phaser-free 解析器再校验槽位与 kind 配对、重复 id 和范围，以防运行时资源绕过静态约束。组件说明由资料作者撰写，玩家作品不会把选中组件 id 作为后续运行时依赖。

## 配方与平衡

玩家在地图按 `C` 打开创武面板，使用方向键/WASD 选择行，左右/A/D 切换组件。选择名号行时，面板将焦点交给隐藏的原生文本输入框，以支持中文输入法组合、粘贴与退格；名号按 NFC 和 16 个 Unicode 码点上限规范化。Enter 确认创制，Esc 关闭。面板展示三组件说明及预计功力、内力消耗、预算、价格、现有银两与作品名册。操作帮助的键位提示同样包含 C。

每个配方必须恰选一个 `intent`、`form`、`breath`：

- `power = intent.power + form.power + breath.power`
- `qiCost = intent.qiCost + form.qiCost + breath.qiCost`
- `budget = power + 2 × qiCost`
- `silverCost` 是三个组件价格之和

作品要求 `1 ≤ power ≤ 18`、`0 ≤ qiCost ≤ 12` 且 `budget ≤ 34`。创制最多 5 门；名称先做 NFC Unicode 规范化与首尾去空格，长度为 2–16 个 Unicode 码点，不可含控制字符，按不区分大小写比较不得与现有自创作品重名。category/style/description 上限也按 Unicode 码点核验，写档和读档使用同一度量，避免扩展平面字形令自己创制的作品变为不可读存档。价格检查、id 占用检查和全部规则校验先于状态写入；任何拒绝不扣钱、不增加已学 id，也不注册半成品。

成功作品使用 `custom-art.N` id、无门派和属性门槛、初始熟练度 0/上限 100。它加入玩家已学武学与自创定义表，可用于普通遭遇、擂台和门派战中的普通 CombatSession 行动。自创作品不会自动授予敌人。

## 存档和恢复

v1 快照字段 `customMartialArts` 保存完整 `MartialArtData`，旧 v1 缺字段默认为空数组。恢复时对每个作品重新校验 id 前缀与唯一性、唯一名称、数量、名称长度、分类/路数/说明上限、无门派和属性要求、熟练度固定值及功力/内力预算。坏作品令快照解析失败；作品来自快照本身，所以即使玩家后来移除或替换组件 MOD，也保留既有作品。

恢复预检把快照中的自创作品作为该玩家 `martialArtIds` 的有效来源；若对应定义缺失，仍按失效武学引用过滤并给出 warning。作品是运行数据，不会写回 `data/base/`。

## 验证范围

`npm run smoke:round-22` 是 Phaser-free 冒烟测试，覆盖组件协议、名称/预算/货币/数量边界、创制交易原子性、CombatSession 招式可用性、新旧 v1 存档往返及篡改拒绝。生产构建与 Ajv 全资料校验分别通过 `npm run build` 和 `npm run validate:data` 验证。该轮若没有另行执行浏览器手动操作，不应将冒烟测试描述为 UI 手测。
