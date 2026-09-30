# Round 98 验证记录

日期：2026-09-30。范围：设定统一、四人开局对白深化、江南—渡口串联、回归测试与文档；同日复核修订后全量复跑。命令输出为摘要，完整日志未抄录。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| `npm run validate:data` | 通过：manifest Schema 与 100 个基础资源 Schema。 |
| `npm run inspect:mods`（check 内含） | 通过：资源 100 项 · 问题 0 条。 |
| `npm run typecheck`（check 内含） | 通过：`tsc --noEmit` 无错误（曾报 1 处未使用类型导入，已清理后复跑）。 |
| `npm test`（check 内含） | 通过：**72 个测试文件 / 468 项测试**全部通过（含新增 `tests/round98-opening.test.ts` 11 项）。 |
| `npm run audit:round-34`（check 内含） | 通过：文档一致性审计（22 图/22 区域/50 关口/70 定点事件、65 任务、11 种对白条件与 15 种效果枚举对表）。 |
| `npm run audit:round-48-docs`（check 内含） | 通过：README/ARCHITECTURE/DATA-GUIDE/PLAYER-GUIDE 轮次标记更新至 Round 98 后复跑通过。 |
| `npm run build` | 通过（复核修订后复跑）：完整 check 链（validate:data → inspect:mods → typecheck → 72 文件/468 项测试 → 两项文档审计）后 Vite 生产构建成功（built in 831ms；`phaser-runtime` 1,374.54 kB / gzip 357.49 kB——与 R97 相同的既有 chunk 体积提示，不阻断构建）。 |
| `git diff --check` | 通过：无空白错误（仅 Windows LF→CRLF 行尾转换提示，非 diff --check 错误）。 |

## 专项测试（tests/round98-opening.test.ts，11 项全通过）

- 设定一致：生成器源文件与照雪关 region/界碑事件/守烽人指路/两个图谱词条的 JSON 输出逐条 `toContain` 对表；当代表述含「大雍」、碑面保留「大梁北界，至此为限」并注明「前朝大梁」；WORLD-SETTING 记录决策。
- 沈墨涵开局（真实 dialogue runtime 装配真实数据驱动）：全对白无「子时」选项、`agree` 节点已删；`scroll-assessment`/`scroll-leads` 可达且含纸墨线索与白鹭洲/柳听澜/石阶渡口真实指路；诚实交书结算（残篇−1、关系 +15、善恶 +5）且交出后选项隐藏不可重复；威胁交书仅负面结算（关系 −10、善恶 −10、声望 −2 由垫高 10 后核实真实生效）且货币分文不变；好感问候重复三次关系恒为 0。
- 无残篇旧档：移除残篇后沈墨涵 `scroll-assessment` 与柳听澜 `canpian-assessment`（无条件入口）仍可达，且不发放任何见闻/关系奖励；纸龄判断按转述对照（含「转述」、不含「同一批」）并保留「不替纸猜」（不揭幕后）。
- 姜百味：货郎口信 offered（亲口接取，文本含石阶渡口方向）→ active 提示 → completed（引出柳教习/渡籍补录）三态齐备；帮扶货担结算一次后（清心丸 +1、关系 +5）按 `npcRelationship ≤ 4` 上界隐藏，关系调回 4 时重新可见（关系门控边界，非永久一次性）。
- 白鹭洲：会盟报备两次选择关系恒为 0（见闻分享幂等生效，`npcKnows` 为真）；口信送达回声按 completed 门控呈现——测试先发 `npc-talk` 信号（实机时序：`openDialogueWith` 先信号后面板求值）再选复述选项，选项无 effects（幂等）。
- 渡籍补录全链路：locked → （货郎口信完成）offered → 对话接取 active（offer 节点含 `acceptQuest` 确认）→ 柳听澜 `npc-talk` 信号 completed（先于面板求值）→ active 誊正选项完成后不可见、由 `r31-filed`「刚誊好」回应承接（无 effects、无字据物品）→ 白鹭洲复核回声 → 书院夜课解锁为 offered（串联证据）。

## 过程中的失败与修复（已复跑通过）

1. `indexMartialArts` 函数名笔误 → 修正后通过。
2. 清心丸计数断言忽略开局自带 1 丸 → 改为增量断言（+1）。
3. 声望断言 −2 失败：引擎 `RENOWN_RANGE` 下限 0 钳制 → 先垫 +10 再验 −2 真实生效。
4. `tests/round59-regional-dialogue.test.ts` greet 选项数量基准（白鹭洲 16→20、姜百味 4→7）→ 按本轮有意新增的旅程入口更新基准并注明。
5. typecheck 1 处未使用类型导入 → 清理后通过。
6. Round 48 文档审计 4 项轮次标记（README/ARCHITECTURE/DATA-GUIDE/PLAYER-GUIDE）→ 更新至 Round 98 后通过。

## 未验证与边界

- **未重跑** `scripts/generate-round92-north-pass.mjs`：本轮未做 replay 验证——重跑对后续轮次手改资料的实际影响未经验证，不能把「必然覆盖」当作事实；出于风险控制选择不重跑，源/输出一致性改由测试对表守护（见专项测试第一条）。本轮为**部分 replay 边界**：生成器与 JSON 手改同步，未做全量生成器重放验证。
- 未做浏览器/真实键盘实走（Round 99 计划项；本轮按计划不使用浏览器）。
- 范围外奖励问题（陆贞娘、顾夜尘的重复关系增益）仅记录于 `docs/JOURNEY-FACTS.md` §5，未修。

## 同日复核修订（独立复核后复跑验证）

复核发现 5 项实质问题并修复（详见 `DEVLOG.md` Round 98「同日复核修订」）：谈话时序门控（白口信回声改 completed、柳完成回声改「刚誊好」）、去除不存在的字据操作与「几步路」承诺、残篇证据改转述参照口径（不断言同批）、JOURNEY-FACTS 分支计数（3 组）与帮扶门控边界（关系 ≤4 可重领）、世界设定开头历史盘点化与 replay 表述改「本轮未验证」。委托修订后再次执行 `npm run build`（含完整 check）与 `git diff --check`，均通过：100 资源、72 文件/468 测试，生产构建成功。

## 主代理独立复核

- 阅读 `GridScene.openDialogueWith` 确认交谈信号先于面板求值；要求修正不可见的进行态回声及虚构归档状态，修订测试按实际时序执行。
- 将 world-map 与 HEAD 做递归结构比较：仅 `/events/43/text` 与 `/regions/11/description` 两个文本字段变化；没有关口、地图图层或坐标变化。
- 独立执行 `npm run build`：退出码 0；100 个资源 Schema、MOD 0 问题、类型检查、72 文件/468 测试、双文档审计全部通过；139 模块，生产构建 870ms。仍有既有 chunk >500kB 提示。
- 最终校正目标进度、路线图未来状态和纸墨措辞；未做浏览器实走、旧存档文件导入或全量生成器重放，不能由无残篇运行时模拟替代这些验证。
