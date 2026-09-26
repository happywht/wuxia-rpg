# 开发日志（DEVLOG）

按轮次记录实际做过什么、核验到什么、没做什么。**只记录事实，不预制结果。**

---

## Round 06 — 2026-09-27

### 计划与实现

- 开工前编写 `iterations/round-06/plan.md`；本轮按物品/商店数据装配、纯逻辑背包交易引擎、键盘 UI 与地图接线三条子任务实施。曾委托 Claude Code CLI 执行机械实现；运行约 18 分钟后因提供方返回 429（5 小时额度上限）退出，主代理接续检查、修正并完成验证。
- 新增 `items-set` / `shops-set` draft-07 schema、7 件原创物品和 1 家商店；manifest 登记两种可选资源。角色模板新增起始银两、背包容量及起始物品，地图新增商人 NPC 与数据驱动对话；商人接入后保留原有战斗遭遇位置与规则。
- 扩展 NPC / 角色 Schema；`src/engine/item-system.ts` 实现物品与商店解析/索引/装配、条目级坏数据隔离、起始背包校验、有上限堆叠与容量、消耗品恢复、装备槽与属性/生命/内力上限加成、购买/出售。交易通过完整性校验后原子提交；另补正并非正交易数量与非安全整数金额校验，避免负数量反向增加银两或库存。
- `CharacterState` 分离基础属性与装备后有效属性，等级成长继续作用于基础属性并重算装备加成。`src/game/inventory-ui.ts` 和 `shop-ui.ts` 新增键盘背包/商店；GridScene 以首个有效角色模板独立创建玩家状态，因此没有有效战斗遭遇时仍可启动背包；B 打开背包，相邻商人按 E 开店，覆盖层锁定探索移动。
- 更新 README、ROADMAP、CHANGELOG、GDD、ARCHITECTURE 和 DATA-GUIDE，记录 R06 功能、数据契约、边界及验证事实。

### 验证

- `npm run build`：`tsc --noEmit` 和 Vite 生产构建通过，88 个模块；JavaScript bundle 1,580.58 kB（gzip 416.95 kB），仍触发 Vite 500 kB chunk 建议。
- 临时 Node/Ajv 冒烟：70 项全部通过，覆盖 schema、起始物品、跨引用、堆叠/容量、使用、装备/卸装与升级、交易原子性、非正数量拒绝及装备属性进入战斗；临时脚本与打包产物验证后删除。未新增正式自动化测试文件（基线计划为 Round 38）。
- 浏览器手动回归（本机生产预览 4183）：地图加载并显示商人，未见资料警告；背包初始显示银两 120 与 3/12 堆。相邻按 E 开店，购买回春膏（−15）并出售一件（+3），显示银两 108；购买帆布短褐（−40），装备后体魄由 9 增至 11、生命上限由 83 增至 99；使用回春膏将生命从 83 恢复到 99；关闭背包后方向键将坐标由 (10,1) 移至 (11,1)，确认探索移动恢复。商店与背包开着时键位仅改变面板选择/交易，画面坐标保持不变。

### 未做与风险

- 物品、装备、银两和商店库存目前只存于内存，刷新即恢复到模板/商店起点；存档留给 Round 09。
- 未接入任务奖励/掉落、耐久、制作或共享持久库存；装备耐久与任务来源留待后续轮次。

---

## Round 05 — 2026-09-27

### 计划与实现

- 开工前保留 `iterations/round-05/plan.md`（本轮新增计划，未改动）；实现严格按计划的三条子任务推进：战斗数据与跨资源装配 → 纯逻辑战斗闭环 → 键盘 UI 与地图接线。
- 契约扩展：`martial-arts-set.schema.json` 每条武学新增必填 `combat`（kind 枚举 attack/heal、power 1–999、qiCost 0–99）；`character-profiles.schema.json` 新增必填 `startingMartialArtIds`（唯一字符串数组，可为空）。两份基础资料同步补数据；吐纳养气诀门槛由等级 2/定力 8 调整为等级 1/无属性（与「流传极广的入门吐纳法」设定一致，并让初始模板拥有攻击 + 恢复两类起始武学）。
- 新增 draft-07 `battle-encounters.schema.json` 与 `data/base/battles/round-05-encounters.json`（登记为 `encounter.round-05-set`）：原创遭遇「巷口拦路刀客」，触发格 (1, 7)（row 7 走廊 col 1，地图可走、不压出生点 (7,7)、不与三名 NPC 重叠），敌人「疤脸刀客」body 8/force 7/agility 5/insight 4/resolve 4、生命 60、内力 16、可用武学「拦门刀法 + 江湖散手」、胜利经验 40、失败恢复 0.6/0.6、repeatable false，approach/intro/victory/defeat/flee 五条提示文本全部原创并留在 JSON。
- `src/engine/character-progression.ts` 扩展：`CombatActionKind`/`CombatActionData` 协议类型；`MartialArtData.combat` 与 `CharacterProfileData.startingMartialArtIds` 防御性解析（combat 缺失/坏 kind/越界、id 数组含空串均整资源拒绝并给出可读错误）；`CharacterState.martialArtIds` 运行时字段（`createCharacterState` 逐字复制模板声明，注释明确由调用方以验证列表覆盖）；`resolveStartingMartialArts` 逐条校验（存在且未禁用、不重复、满足模板起始等级/属性且空 factionIds 对无门派角色合格），坏引用只剔除该武学并警告。
- 新增 `src/engine/turn-based-combat.ts`（Phaser 无关）：`parseBattleEncounterSet` 防御性解析；`assembleBattleEncounters` 跨资源装配（id 首声明优先、地图引用已登记且为当前地图/引用其它有效地图静默跳过、触发格图内可走、不压出生点/NPC 格/已放置遭遇格、`profileId` 与敌人每个武学引用可解析、敌人至少留一个有效武学，单条失败只禁用该遭遇）；`computeAttackDamage`（`max(1, power + attackerForce − floor(defenderBody/3))`）与 `computeHealAmount`（`power + floor(actorResolve/2)`）固定协议公式；`CombatSession` 会话状态机——构造即记录数据 intro 战报并快照玩家可用武学，`playerUse` 一次调用完成玩家半回合（扣内力、按 kind 结算伤害/治疗并 clamp）+ 胜负判定 + 敌方整回合（可用攻击中 power 最高、平手取 id 升序小者、无可用攻击记「蓄势未发」跳过）+ 回到玩家回合，未知武学/内力不足返回结构化拒绝理由且不消耗回合与资源，胜利经 `grantExperience` 恰好一次发放遭遇经验（会话内 `experienceAwarded` 标志），失败按 `defeatRecovery` 比例恢复（生命 `max(1, ceil(max×ratio))` 保底 1 点、内力 `max(当前, ceil(max×ratio))` 不倒扣），`flee` 仅玩家回合可用、零奖励、敌方不追击；`selectEncounterTarget` 四方向邻接选择（等距按遭遇 id 升序决胜，与 NPC 规则一致）。
- 新增 `src/game/combat-ui.ts`：`BattlePanel` 键盘战斗面板（构造即建、open/close 管理键位与容器，模式与 DialoguePanel 一致）；渲染双方名称（数据）+ 生命/内力条（轨道/比例填充/数值文本）+ 最新战报（最多 6 条、按 128px 高度预算从最旧裁剪、按日志类型着色）+ 玩家行动列表（武学名/类型/power/内力耗来自数据；内力不足置灰、确认时显示本地「内力不足」提示且不推进回合）+ 撤退行；↑/↓（W/S）移动选择、Enter 确认（战后关闭）、Esc 撤退（战后关闭）；引擎侧仅保留通用机制标签（生命/内力/攻击/恢复/撤退等）。
- 改造 `src/game/grid-scene.ts`：`encounter.round-05-set` 资源与 `schema:battle-encounters` 并入可选分类，`loadGameData` 注册 battle-encounters 语义校验器；`assembleOptionalContent` 在对话/NPC/成长装配后装配遭遇（NPC 占格集合、模板与武学索引传入）；`setupWorld` 以首个有效遭遇的模板创建玩家 `CharacterState`（起始武学经 `resolveStartingMartialArts` 验证后覆盖运行时列表，坏引用警告进控制台；多遭遇模板不一致时点名警告并沿用首个）；遭遇敌人以 45° 菱形标记渲染并占格阻挡（区别于 NPC 方块），`activeEncounters` 过滤已完成非重复遭遇；E 键优先 NPC 交谈、其次四向邻接遭遇开战；战斗/对话面板任一打开即锁定移动与 E；`settleBattleClose` 在面板关闭时记录一次性遭遇完成（移除标记与阻挡、控制台汇总 outcome/经验/升级数）；HUD 可选警告行文案扩展到六类资料。
- 边界明确接受：完成标记与玩家状态仅存内存，刷新即重置（存档 Round 09）；胜利后不自动恢复资源（失败恢复由遭遇数据声明，探索期恢复手段随 Round 06 物品到来）。

### 验证

- `npm run build`：首轮 2 处 TypeScript 编译错误（`manhattanDistance` 误从 `grid-map` 导入，实际在 `npc-placement`；装配函数 TS 收窄需要显式分支），修正后通过；最终 `tsc --noEmit` 与 Vite 8.3.1 生产构建成功（85 个模块，831 ms）。JS bundle 1,553.36 kB（gzip 410.72 kB），仍触发 Vite 默认 500 kB 体积建议（与前轮相同的非阻断提示）。`dist/` 含 manifest、8 份 schema、地图、NPC、对话、角色模板、门派、武学、战斗遭遇与示例 MOD 文件。
- 临时 Node 冒烟脚本（rolldown 1.2.11 打包 `turn-based-combat` / `character-progression` / `grid-map` 三个引擎模块 + 项目 Ajv + 真实 JSON，运行后已删除）：37 项检查全部通过，覆盖——Ajv 四份真实资料通过 schema、缺 combat/坏 kind/缺 startingMartialArtIds/ratio>1/空敌武学数组被拒绝；真实武学集含 combat 解析、坏 combat 整资源拒绝；模板起始武学声明与运行时复制（生命 83/内力 53）；`resolveStartingMartialArts` 真实数据零警告、悬空/不满足起始条件/重复引用各剔除并警告；遭遇集合敌意输入（null/数组/字符串/空对象）防御性拒绝、坏条目逐字段可读错误；真实遭遇零警告装配于 (1,7)；阻挡格/越界/压出生点/压 NPC 格/悬空模板/悬空敌人武学/未登记地图七种坏遭遇各自只禁用自身；重复 id 保留先声明、触发格冲突禁用后者；引用其它有效地图静默跳过（skippedOtherMap=1、零警告）；邻接选择含 id 决胜与对角/远距拒绝；战斗公式数学（含伤害下限 clamp 与治疗取整）；开局 intro 战报与双方满资源；攻击 12/敌方回应 18（拦门刀法威力最高）与内力同步扣减；治疗 +15 上限 clamp 且敌方照常回应；未知武学与内力不足拒绝且不偷回合/不耗内力；平手 AI 取 id 小者；敌方内力耗尽转用 0 耗散手（[18,18,18,18]）；敌方无可用攻击「蓄势未发」；五次攻击胜利且经验恰好一次（40 经验 → 2 级、healthMax 83→101）；失败恢复 50/32（保底语义：满内力不倒扣、低内力提升至比例）；零比例恢复仍保 1 点生命；撤退零奖励、敌不追击、结束后拒绝再次撤退；纯攻击模拟第 5 回合取胜（战斗内 11 血，胜利升级 +18 增量 heals 至 29/101）；治疗续航策略同样收敛取胜。
- 冒烟过程中 6 次失败均为脚本问题而非引擎缺陷：同一 Ajv 实例重复编译同 `$id` schema 报 already exists（与 R04 同坑，改缓存编译）；对角坐标断言写错（(2,6) 实为正上邻格）；治疗断言漏算敌方回应（一次 playerUse 是完整回合）；平手测试在会话构造后才改玩家武学列表（会话构造即快照）；升级后生命上限算术错误（正确值 101）；失败恢复断言误解 max 语义（满内力不应降低）。逐一修正断言后全绿。
- 浏览器手动回归（`npm run build` + `npm run preview` 4180 端口，Playwright 键盘驱动 + 视觉模型读图）：加载后控制台 7 个资源全部 base、`[progression] 已加载角色模板 1 个、门派 3 个、武学 6 种、战斗遭遇 1 处`、数据警告为零（仅 favicon.ico 404，与前轮一致）；画面确认菱形敌人标记位于左下、黄圆玩家 (7,7)、三名 NPC 就位。方向键左移 5 步至 (2,7)：底部出现数据 approach 提示（「疤脸刀客横在巷口，按 E 迎战」，视觉模型小字号 OCR 有个别字误差、结构吻合）、再按左被遭遇格阻挡仍 (2,7)。按 E：战斗面板打开，双方资源条 83/83、53/53、60/60、16/16，数据 intro 文本入战报，行动列表「▸ 江湖散手 攻击 8 · 内力 0」「吐纳养气诀 恢复 12 · 内力 6」「撤退」。面板内按左（被锁定，位置不动）后 Enter×5：第 5 击制胜，画面显示 29/101、敌 0/60 与数据胜利文本，控制台 `[battle] 遭遇 "encounter.alley-blade-bully" 结束：victory（经验 +40，升级 1 次）`，与冒烟脚本数值一致。Enter 关闭面板后按 E 不再触发、方向右移生效到 (3,7)（战斗内左移确实被锁定的反向证明）、菱形标记与提示消失。临时截图与验证脚本运行后已全部删除。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）。

### 未做与风险

- 队伍、多敌人、状态异常（中毒/封穴）、装备修正、行动目标选择（自伤/治疗敌人）与战斗日志归档均未实现；公式保持单一可复现，数值平衡统一留给 Round 45。
- 探索期无恢复手段：胜利后保留剩余生命/内力，战斗外回血依赖失败恢复比例或重新开战，药品随 Round 06 物品系统落地。
- 遭遇完成标记、玩家等级/经验/资源均不持久化，刷新即重置；存档/读档与角色创建 UI 安排在 Round 09。
- 敌人 AI 为确定性规则（威力最高），无随机性/策略变化；更丰富的 AI 与行为配置留待后续战斗扩展轮次。
- 多遭遇声明不同 `profileId` 时沿用首个模板并点名警告（当前单遭遇数据无此场景），真正的多角色/多模板参战待后续轮次设计。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 04 — 2026-09-27

### 计划与实现

- 开工前保留 `iterations/round-04/plan.md`（本轮新增计划，未改动）；实现前确认现有 manifest/Ajv/装配层约定，角色成长协议保持小而明确以支撑 Round 05 战斗。
- 新增三份 draft-07 Schema：`data/schema/character-profiles.schema.json`（五项属性键 body/force/agility/insight/resolve 与 1–999 值域作为通用协议；起点 1–999、增量 0–99、权重 0–99、门槛 1–999；派生公式参数 base/perLevel/attributeWeights）、`faction-set.schema.json`（id/name/stance/philosophy/martialStyle）与 `martial-arts-set.schema.json`（类别六枚举：拳脚/剑法/刀法/身法/内功/外功；factionIds 唯一项数组，空数组=不限门派；requirements.level + requirements.attributes 部分属性映射；initialProficiency/proficiencyCap）。跨字段语义（maxLevel>startingLevel、起点≤attributeCap、初始熟练度≤上限）明确交给运行时解析器。
- 新增三份原创资料并登记进 manifest（`character-profile.round-04-set` / `faction.round-04-set` / `martial-art.round-04-set`）：`round-04-profiles.json` 提供 1 份模板 char.scribe-apprentice（抄书学徒：起点 9/6/7/8/7、等级 1/经验 0 起、上限 30 级/属性 80、经验曲线 base 40 + 每级递增 20、每级成长 2/2/1/1/1、生命 base 50+10/级+体魄×3+力道×1、内力 base 30+8/级+悟性×2+定力×1，属性显示名称"体魄/力道/身法/悟性/定力"也在数据中）；`round-04-factions.json` 提供 3 个原创门派（听雨剑阁/铁嶂派/云隐山庄，立场、宗旨、武学风格全为原创文本）；`round-04-martial-arts.json` 提供 6 种原创武学（江湖散手/吐纳养气诀/拦门刀法为通用；听雨剑法/铁嶂桩功/云隐身部分属三派，门槛与所属门派的风格描述呼应）。
- 新增 `src/engine/character-progression.ts`（Phaser 无关）：`ATTRIBUTE_IDS`/`ATTRIBUTE_MIN`/`ATTRIBUTE_MAX` 协议常量与 `AttributeMap`/`PartialAttributeMap` 类型；`parseCharacterProfileSet`/`parseFactionSet`/`parseMartialArtSet` 防御性解析（逐条可读错误 + 单文件语义检查）；`indexProfiles`/`indexFactions`（首声明优先、上报重复 id）与 `indexMartialArts`（门派引用逐条校验：悬空引用只禁用该武学并点名，其余武学与整个集合不受影响；重复 id 按首声明处理，即使首项因引用无效被禁用）；`createCharacterState`（模板起点 + 属性副本 + 满 vital）；`cumulativeExperienceForLevel`（升第 k 级成本 = base + perLevel×(k−1)，累计阈值随等级递增，越界输入钳制）；`experienceToNextLevel`（满级返回 null）；`grantExperience`（一次授予跨级结算：while 阈值循环、每级属性 += growth 并受 attributeCap 封顶、满级经验钳制并丢弃溢出、vital 上限按公式重算且增量 heals 进当前值，非正数/非有限或取整后非安全整数 no-op）；`computeDerivedMax`/`computeVitalMaxima`（max = base + perLevel×(level−1) + Σ 权重×属性）；`checkMartialArtEligibility`（等级/属性/门派三查，空 factionIds 不限门派，不合格逐条给出含协议 id 与数字的机械原因）。
- 改造 `src/game/grid-scene.ts`：三类新资源及其 schema（`schema:character-profiles`/`schema:faction-set`/`schema:martial-arts-set`）并入可选内容分类（`OPTIONAL_RESOURCE_IDS`/`OPTIONAL_SCHEMA_ORIGINS` 集合化重写）；`loadGameData` 为三个 schema id 注册语义校验器（复用 parse 函数，与 grid-map 同一模式）；新增 `assembleProgressionContent`（结构坏→整资源禁用警告；重复 id→保留先声明并警告；悬空门派引用→点名禁用该武学；未登记资源合法缺席），装配结果存入场景 `progression` 字段供 Round 05+ 使用，本轮无进度 UI；HUD 可选内容警告行文案扩展为五类资料，控制台前缀统一 `[optional]`，并在装配完成后 `console.info` 汇总已加载模板/门派/武学数量。
- 游戏状态仅存于运行时对象（`CharacterState`），无任何持久化；拜师/修炼/战斗效果均未实现。

### 验证

- `npm run build`：通过；复核修正后最终运行 `tsc --noEmit` 与 Vite 8.3.1 生产构建成功（83 个模块，805 ms）。JS bundle 1,531.38 kB（gzip 404.99 kB），仍触发 Vite 默认 500 kB 体积建议（与前轮相同的非阻断提示）。`dist/` 含 manifest、7 份 schema、地图、NPC、对话、角色模板、门派、武学与示例 MOD 文件。
- 临时 Node 冒烟脚本（esbuild 打包 `src/engine/character-progression` + Ajv + 真实 JSON，运行后已删除）：83 项检查全部通过，覆盖——三份真实资料解析与索引（1 模板/3 门派/6 武学、零重复、零悬空）；重复门派 id 上报且保留先声明；悬空门派引用恰好禁用 1 种武学（其余 5 种保留）并点名武学与门派 id；null/数组/字符串/空对象等敌意输入被防御性解析拒绝；maxLevel≤startingLevel 与初始熟练度超上限被单文件语义拒绝；初始状态（等级/经验/属性副本不回写/生命 83/内力 53 满值）；累计阈值数学（0/40/100/180/280/9280 与越界钳制）；距下一级 40；39 经验不升级、补 1 点恰好升 1 级且累计经验保持 40（累计阈值制不消耗经验）；240 经验一次跨 3 级到 5 级；属性上限封顶（9+2→10）；百万经验一次到满级 30（29 级、经验钳制 9280、丢弃 990720、体魄 67/身法 36/生命 605/内力 372）；满级后经验不再累积且全部丢弃；负经验 no-op；资格判定（1 级无门派可学通用武学、通用武学对任意门派合格、等级不足/属性不足/需加入门派/门派不符各自点名原因、多条件不满足逐条列出）；Ajv 检查（登记新资源后的 manifest 及三份真实数据全部通过 schema；缺 name 门派、未知属性键、低于协议下界、缺失属性键 growth、非枚举类别、门槛未知属性键被拒绝；空 factionIds 被接受）。
- 首轮冒烟 3 处失败均为脚本问题而非引擎缺陷：两处断言误把累计阈值制当作"升级消耗经验"（引擎按计划采用 cumulative XP thresholds，修正断言为 40/280），一处 Ajv 重复编译同一 `$id` 报 already exists（脚本改为缓存编译结果）；修正后全绿。
- 独立复核后的临时 Node 回归检查：manifest 与三个新数据集的 Ajv 校验通过；Schema 与解析器均接受每级成长为 0；首个武学因悬空门派引用被禁用时，后续同 id 条目仍按首声明规则被拒绝；累计经验 39/40 阈值、跨级后等级/经验状态符合 40/100/180/280 的累计门槛。验证脚本仅通过 stdin 执行，未落盘。
- 浏览器手动回归（`npm run build` + `npm run preview`，生产构建）：默认状态地图、玩家标记、3 名 NPC 与交互提示正常；控制台显示 6 个资源全部加载自 base 与 `[progression] 已加载角色模板 1 个、门派 3 个、武学 6 种`，数据警告为零（仅 favicon.ico 404，仓库不含图标资源，与数据管线无关）。临时将 dist 中武学 factionIds 改为不存在的门派、并把门派集合替换为 `{"id":"broken"}` 后刷新：结构坏门派被 schema 拒绝并出现 `[optional]` 警告，门派集为空导致三个门派型武学因悬空引用被点名禁用（汇总变为 1 模板/0 门派/3 武学），HUD 显示可选资料警告行，地图、移动与 NPC 交谈保持可玩。两种临时改动验证后恢复，dist 两文件 SHA256 与源文件一致，恢复后回到零警告。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）；临时验证脚本与截图目录运行后已删除。

### 未做与风险

- 拜师/入门流程、修炼与熟练度增长、招式效果与战斗消耗均未实现（Round 05 战斗、Round 13 拜师）；引擎已提供资格判定与数据参数，后续轮次直接消费。
- 角色状态不持久化：页面刷新即丢，存档/读档与角色创建 UI 安排在 Round 09。
- 三种门派武学的等级/属性门槛对初始模板分别在约 5 级（铁嶂桩功：体魄 9+2×4=17≥16、定力 7+1×4=11≥10）、7 级（听雨剑法：悟性 8+1×6=14≥14、身法 7+1×6=13≥12）与 10 级（云隐身法：身法 7+1×9=16≥16）可由成长曲线满足，但门派资格要等拜师轮次（Round 13）才可入；通用武学 1–3 级即可修习。数值平衡统一留给 Round 45，本轮以协议正确性为先。
- 经验为累计阈值制：升级不消耗经验、满级丢弃溢出经验，该语义已写入引擎文档注释与 DATA-GUIDE，后续战斗/任务发放经验时按此理解。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 03 — 2026-09-27

### 计划与实现

- 开工前创建并保留 `iterations/round-03/plan.md`；实现评审时补充明确了“省略或空 `options` 数组均为结束节点”的一致约定。
- 新增 NPC 与对话数据契约：`data/base/characters/round-03-npcs.json`（3 名原创 NPC：书铺掌柜沈墨涵、茶摊娘子陆贞娘、背刀游侠顾夜尘，含稳定 id、姓名、地图资源 id、网格坐标与对话引用）和 `data/base/dialogues/round-03-conversations.json`（3 段对话图，每段含分支选项与无选项结束节点；三段在叙事上互相呼应）。两资源以 `npc.round-03-set` / `dialogue.round-03-set` 登记进 manifest，并新增 draft-07 `npc-set` / `dialogue-set` schema（静态结构；跨文件约束明确交给运行时）。
- 新增 `src/engine/npc-placement.ts`：NPC 集合防御性解析；`assembleNpcPlacements` 做逐条跨资源校验（地图引用已登记、坐标在图内且非阻挡格、不压玩家出生点、不与已放置 NPC 同格、id 唯一、对话引用有效），单条失败只禁用该 NPC 并生成可读警告；引用其它有效地图的 NPC 静默跳过。`NpcOccupancyIndex` 提供占用格查询，`selectInteractionTarget` 只接受曼哈顿距离 1 的目标，多目标等距时按 NPC id 升序决胜。
- 新增 `src/engine/dialogue-graph.ts`：对话集合防御性解析；`validateConversation` 逐段校验图语义（节点 id 唯一、起始节点存在、每个选项 nextNodeId 可达）；`indexConversations` 首声明优先索引并上报重复 id；`DialogueSession` 纯逻辑会话（当前节点、选项、结束节点判定、choose 越界/悬空目标 no-op、reset 复位）。
- 新增 `src/game/dialogue-ui.ts`：Phaser 对话面板，显示说话者名称、节点文本与选项列表；↑/↓（W/S）移动选择、Enter 确认（结束节点上结束对话）、Esc 随时关闭；面板高度按文本与选项数量自适应，按键仅在面板打开期间绑定。
- 改造 `src/game/grid-scene.ts` 装配策略：加载诊断分级为"必需"（manifest、manifest/grid-map schema、地图资源——维持致命错误面板）与"可选"（NPC/对话资源及其 schema——降级为警告）；场景内 `assembleOptionalContent` 先索引并逐段校验对话（坏对话只禁用自身），再装配 NPC；HUD 显示两类警告行（可选内容/MOD），底部新增交互状态行（相邻时显示"按 E 与『某人』交谈"，无有效 NPC 时显示"暂无可交互人物"）；场景关闭时释放对话面板与键位监听。
- 交互与占位：NPC 以数据坐标渲染为几何占位（色板循环，呈现细节不进数据）并显示数据姓名标签；`tryMove` 增加占用格阻挡；E 键触发邻接对话，面板打开期间移动输入被 `isOpen` 门禁隔离、关闭后恢复。

### 验证

- `npm run build`：通过；`tsc --noEmit` 与 Vite 8.3.1 生产构建成功（82 个模块，773 ms）。JS bundle 1,522.09 kB（gzip 402.94 kB），仍触发 Vite 默认 500 kB 体积建议（与 Round 02 相同的非阻断提示）。`dist/` 含 manifest、4 份 schema、地图、NPC、对话与示例 MOD 文件。
- 临时 Node 冒烟脚本（esbuild 打包 `src/engine` 纯逻辑 + 真实 JSON，运行后已删除）：48 项检查全部通过，覆盖——有效数据解析、3 段对话图校验、正常装配零警告；坏对话引用/阻挡格/越界/压出生点/同格冲突/重复 id 各自只禁用涉事 NPC 且其余保留；引用未登记地图报警、引用其它有效地图静默跳过；对话集合为空时全部 NPC 禁用；距离 2、对角与远距不可交互；双邻接等距按 id 决胜；会话跳转/结束/复位/越界 no-op；占用格索引；断裂对话图（坏起始节点 + 悬空 nextNodeId）被双条可读诊断捕获；重复对话 id 首声明胜出；恶意结构输入被防御性解析拒绝。
- 临时 Node schema 检查（项目依赖 Ajv，运行后已删除）：manifest、地图、NPC、对话四份真实数据全部通过对应 draft-07 schema；缺 name 的 NPC 条目被 schema 拒绝；省略与空 `options` 数组都作为合法结束节点被 schema 和运行时解析器接受；空 `npcs`/`conversations` 集合保持合法（对应“暂无可交互人物”状态）。
- 浏览器手动验证：默认地图加载 3 名 NPC；四方向相邻时提示并按 E 开启对话；使用键盘选择分支、Esc 关闭、对话期间移动锁定且关闭后恢复；NPC 占位格阻挡移动。临时将 NPC 放到阻挡格后，该 NPC 被隔离并显示警告而地图保持可玩；将 NPC 与对话集合清空后地图仍可玩并显示“暂无可交互人物”。两种临时改动均在验证后恢复，NPC/对话文件 SHA256 与原始备份一致。
- 本轮未新增正式自动化测试文件（Vitest 基线在 Round 38）；引擎纯逻辑与 schema 使用的临时验证脚本运行后已删除。

### 未做与风险

- NPC 位置是静态资料：日程、巡逻与动态位置留给 Round 16 及以后。
- 对话仅实现节点/选项跳转：条件分支、效果、任务/声望联动留给 Round 08。
- 跨资源校验的"逐条禁用"发生在场景装配层而非加载器 semanticValidator（后者失败会拒绝整个资源，与本轮"只禁用受影响人物"的目标不符）；未来若需多资源通用化，可把装配层校验提炼为独立服务。
- 对话面板未做超长文本滚动：当前数据文本与选项量（≤2 项）远低于面板容量，异常超量数据由 schema maxLength（500/100）兜底。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，继续留待性能/打包轮次评估。

---

## Round 02 — 2026-09-27

### 计划与实现

- 先创建并保留 `iterations/round-02/plan.md`，包括目标、用户故事、验收标准、三个可验证子任务、涉及文件、风险及 3–5 小时估时。
- 以 `data/base/manifest.json` 枚举资源与启用 MOD；新增 `data/schema/manifest.schema.json` 与 `data/schema/grid-map.schema.json` 两份 draft-07 schema。`src/engine/data-loader.ts` 用 Ajv 8.20 对 manifest、基础资源与 MOD 覆盖逐个校验，加载结果带资源来源（base 或 modId）与结构化诊断；跨字段语义（行列长度、出生点可走等）由按 schema 注册的语义校验器补足。
- 新增 `src/engine/event-bus.ts`：框架无关的类型化同步 EventBus，支持 `on`、`once`、`off`、`emit`、`clear`；数据加载按资源发布成功与失败事件，数据层不依赖 Phaser 场景。
- `enabledMods` 按声明顺序处理同路径覆盖：后启用 MOD 覆盖先启用 MOD；MOD 缺失文件不产生覆盖，无效覆盖记为警告并保留上一有效版本；坏基础资源整体失败，不进入运行状态。
- `vite.config.ts` 以 `data/` 为 publicDir，并加入 MOD 分发插件：开发服务器只服务仓库 `mods/` 目录内的 JSON（安全路径段模式 + realpath 目录约束），穿越、非 JSON 与越界路径返回 404；生产构建复制相同文件。
- `src/game/grid-scene.ts` 迁移到加载器流程：地图改由 `loadGameData` 获取并注册网格地图语义校验；致命错误（manifest/schema/基础资源）与 MOD 警告均显示可读诊断画面，保留 Round 01 的降级行为。
- 验证用的示例 MOD 保留在 `mods/example/`；恢复默认后 `data/base/manifest.json` 的 `enabledMods` 为空数组，示例 MOD 默认不启用。

### 验证

- `npm run build`：通过；`tsc --noEmit` 与 Vite 8.3.1 生产构建成功（79 个模块，669 ms）。JS bundle 1,509.91 kB（gzip 399.20 kB），仍触发 Vite 默认 500 kB 体积建议。
- 浏览器手动验证：默认地图正常加载与移动；启用有效 MOD 后同路径地图覆盖生效；无效覆盖保留可玩基础地图并显示警告；两个 MOD 均提供覆盖时按 `enabledMods` 声明顺序叠加（两种顺序各验证一次）；移除启用项后恢复默认；ArrowLeft 逐格移动回归通过。
- 临时 Node 脚本冒烟检查 EventBus：`on` 与 `once` 均按语义触发、`once` 监听器内重发同一事件不二次触发、存在重复注册同一监听器时 `off` 只移除一条匹配注册。
- 开发服务器 HTTP 检查：示例 MOD JSON 返回 200；URL 编码的目录穿越路径与非 JSON 路径均返回 404。
- 生产产物核对：`dist/` 中 manifest、两份 schema 与示例 MOD 文件的 SHA256 与源文件一致。
- 本轮未新增或运行正式自动化测试；上述为构建、浏览器手动操作与临时脚本检查。

### 未做与风险

- manifest 目前仅注册 `map.round-01-grid` 一个资源；其余数据族的 schema 与内容未编写，留待后续轮次。
- MOD 启用/禁用仍靠手工编辑 manifest，没有管理界面；MOD 管理 UX 是未来工作。
- JS 主包超过 Vite 默认 500 kB 建议阈值，构建可成功，此项继续留待性能/打包轮次评估。

---

## Round 01 — 2026-09-27

### 计划与实现

- 先创建并保留 `iterations/round-01/plan.md`，包括目标、用户故事、验收标准、三个可验证子任务、涉及文件、风险及 2–4 小时估时。
- 以 `data/base/maps/round-01-grid.json` 描述 16×9 地图、瓦片颜色/阻挡属性和出生点；Vite 将 `data/` 作为静态目录，开发服务器由 `/base/maps/round-01-grid.json` 提供文件，生产构建复制相同资料。
- 新增通用网格地图协议与运行时结构检查、格子渲染器及 `GridScene`。键盘方向键/WASD 每次移动一格；墙体及越界坐标不可进入，动画期间忽略输入。
- 加入地图请求失败、JSON 解析失败与结构错误的场景内提示；启动画布设置可访问名称并获取键盘焦点。
- 正式 JSON Schema/Ajv 校验和同名 MOD 覆盖仍安排在 Round 02，未在本轮提前实现。

### 验证

- `npm run build`：通过；TypeScript 检查与 Vite 生产构建成功（636 ms）。Phaser bundle 为 1,382.83 kB（gzip 361.00 kB），触发 Vite 默认 500 kB 体积建议。
- 浏览器：地图和 HUD 显示；方向键与 WASD 能逐格移动；走向墙体时坐标不变；边界测试从 `(5, 7)` 连续向左到 `(1, 7)` 后再次向左仍为 `(1, 7)`。
- 缺失地图检查：临时移走地图文件并刷新；Vite SPA 回退返回 `text/html`，场景显示“地图数据响应格式错误”及路径/类型提示，画布未白屏。恢复原文件。
- 无效结构检查：临时以 `{"id":"broken"}` 替换地图 JSON 并刷新；场景显示“地图数据结构不合规”及各必需字段错误。恢复原文件并用 PowerShell JSON 解析确认恢复成功。
- 本轮采用浏览器手动验证，未新增或运行测试套件。

### 未做与风险

- Phaser 主包仍超过 Vite 默认 500 kB 建议阈值；构建可成功，此项留待后续性能/打包轮次评估。
- 地图协议目前只有本轮所需字段的运行时结构检查，不声称已完成正式 Schema 验证。

---

## Round 00 — 2026-09-26

### 前置

- 读取并保留 `iterations/round-00/plan.md`（未改动其用户故事/目标/估时）。
- 确认工作区现状：当前目录不是目标游戏仓库，父目录另有数个无关 Git 项目；因此在 `wuxia-rpg/` 建立独立仓库，未改动其余项目。
- 本机环境：Node v22.18.0、npm 10.9.3。

### 版本核验（2026-09-26，方法：npm registry 元数据查询 + 官方站点文章）

- `phaser@latest` = **4.2.1**；官方 v4 发布归档显示 v4.0.0（2026-04-10）→ v4.2.1（2026-07-09，"Giedi"）持续发布。
- Phaser 官方 v3.90 发布文（2025-05-23）关键原文："As we're days away from the release of Phaser v4 this is likely the last version in the v3 tree."——支持"选 Phaser 4 而非需求建议的 Phaser 3"（ADR-0001）。
- `vite@latest` = **8.3.1**，engines：`^20.19.0 || >=22.12.0`；本机 Node 22.18.0 满足。
- `typescript@latest` = 7.0.2（6.x 线 6.0.3；5.x 线 5.9.3）→ 决策冻结 `^5.9.3`（ADR-0002）。
- `ajv@latest` = **8.20.0**（符合冻结的 8.x 主版本；R02 接入，见 ADR-0004）。
- `vitest@latest` = 5.0.2；4.x 线最新 **4.1.11** → 按需求冻结 4.x，届时安装 `^4.1.11`（ADR-0005；其 engines 要求 `^22.12.0 || ^24.0.0 || >=26.0.0`，本机满足）。

### 研究（历史来源，均为摘要引用，未复制原文）

- go1980.org 系列历史综述：用于 A 组对照（系列级原则，证据"中"）。
- TapTap 玩家回忆页：用于 A3 对照（单一回忆，证据"低-中"，非官方规格）。
- stahuj.cz 第三方衍生条目：仅交叉参考（证据"低"，对原作不具证明力）。
- 授权状态：以上页面许可证均未验证，故仅摘要 + 链接（`docs/REFERENCES.md` 使用规则）。

### 产出

- 配置与入口：`package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`。
- 占位实现：`src/main.ts`（Phaser 4 引导画面，不含玩法与设定文本）、`src/style.css`。
- 目录骨架：`src/engine/`、`src/game/`、`data/base/` 十族、`data/schema/`、`mods/`（共 14 个 `.gitkeep`）。
- 文档：GDD、ADR、REFERENCES、ORIGINAL-FIDELITY、ARCHITECTURE、DATA-GUIDE（`docs/`）。
- 治理：`README.md`、`ROADMAP.md`（R00–R50 共 51 条；R01–R12 与目标文件要求的垂直切片/核心系统顺序一致）、`CHANGELOG.md`、本文件。
- 用户目标路线校正：R01–R12 按要求依次覆盖垂直切片、数据/Schema/事件、NPC/对话、属性/门派/武学、战斗、物品、任务、对话条件效果、存档/菜单、世界地图、知识图谱和 UI；其余轮次继续覆盖全部扩展系统与最终数据数量。
- `docs/REFERENCES.md` 逐项标明历史页面授权未知、软件包许可元数据和本项目不复制文本/代码/素材的使用界限。

### 验证与未做

- `npm install` 成功，安装 18 个包；生成 `package-lock.json`。
- `npm run build` 成功：`tsc --noEmit` 通过，Vite 8.3.1 生产构建完成（657 ms）。Vite 报告 Phaser 主 bundle 1,375.84 kB（gzip 358.32 kB），超过默认 500 kB 建议阈值；Round 00 占位项目可接受，优化纳入后续性能轮次。
- 未执行测试：本轮没有测试文件，也没有声称测试通过。
- 未编写任何测试文件、未安装 Ajv/Vitest（Ajv 计划于 R02、Vitest 于 R38 接入）。
- 未填写任何 `data/` 内容数据；未开始 R01+ 的实现。
- 本轮不存在测试结果，任何"测试通过"的表述都不适用于 R00。
