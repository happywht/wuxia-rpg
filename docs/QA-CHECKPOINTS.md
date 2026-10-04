# 独立 QA 存档与真实旅程检查点

当前门槛见 [验收矩阵](CURRENT-ACCEPTANCE.md)。检查点是正常操作积累的证据，不能代替玩法验收，也不声称60—90分钟预算已经实测通过。

## 启动与隔离

运行 `npm run dev:qa`，打开 `http://127.0.0.1:5310/?qa=journey-20261004`。运行名必须以小写字母开头，长度3—48，只含小写字母、数字、连字符；重复/无效参数明确拒绝存储，不回落玩家键。不同角色使用不同运行名。同源的存档、设置、存储探针全部加 `wuxia-rpg.qa.<运行名>.` 前缀。

此功能仅开发环境可用。生产地址带QA参数会提示拒绝，不提供工作台；没有QA参数保持普通存档流程。浏览器拒绝localStorage时明确显示不可存储，不假装保存。

## 每段正常推进

1. 从新游戏或已记录检查点用标题「继续游戏」进入；正常移动、对话、战斗、采购、制作。禁止控制台修改玩家/任务/背包来制造通过证据。
2. 记录起点、候选版本、任务/属性/资源和主动操作时长。按该段目标推进，记录困惑、绕行、资源损耗和后果。
3. Esc暂停菜单正常保存。返回标题、继续游戏读回同槽，核对位置、任务、装备、资源与后果。
4. F8工作台填写candidate（提交或明确worktree基线）、stage（计划中的检查点ID），选择**已保存**槽位导出JSON。文件带来源QA、候选、阶段、导出时间、源槽和完整解析后的存档，不导出未保存的运行状态。
5. 把原下载文件和截图存入本轮目录，记录命令/操作/结果。只复测修改影响的段落；每次更新候选标识，不能把旧证据直接认作新版本通过。

F8工作台使用DOM表单，打开时暂停活动场景并阻止游戏输入；F8/Esc关闭（输入框中也可用），恢复原先活动场景。B是背包，I是图鉴；实际游戏键位以画面提示为准。工作台不会自动保存或自动读档。

## 分支测试

先正常保存并导出共同点，再分别打开 `?qa=journey-escort` 与 `?qa=journey-repair` 等独立运行。通过F8选择原检查点文件和目标QA槽。跨运行导入即使空槽也要求审阅，默认焦点是取消；覆盖已有槽也必须确认。取消不写入。目标写入后关闭工作台，通过标题「继续游戏」正常加载，再实际选择各自分支。

确认页面展示来源运行/candidate/stage/角色与目标运行。JSON/元数据/存档协议不合法或存储不可读时拒绝写入；单文件上限2MiB。只导入自己记录的测试文件，保留原文件以便恢复QA进度。两角色成功导入共同点不等于两条剧情已经验证。

## 可复用真实检查点

当前逐段状态只在CURRENT-ACCEPTANCE维护。以下文件均由正常QA输入、保存、标题Continue读回后导出；导入后先核对元数据和资源，资料改动须续验受影响段。

- Round271 J0：`iterations/round-271/j0-delivery.json`，两次实际交付后的新开场。
- Round272 F0：`iterations/round-272/f0-crafting.json`，实际出镇/炼药/巡岸/用药/师承后的续行点。
- Round273 F1基线：`iterations/round-273/f1-common-before-choice-baseline.json`，明确交丹约时、两条分支尚未选；candidate是c600752基线，新修桥规则须另行载入验证。

### 旧Round270兼容起点

Round270：`iterations/round-270/j0-opening.json` 来自QA `journey-20261004` 正常槽一，候选 `round270-worktree-on-87271e1`，阶段 `j0-opening`。已在独立 `journey-20261004-copycheck` 导入并正常读回。其任务包含误接的可选「南麓寻村」，保留事实，不删除或改造测试状态。详情与局限见本轮 playtest/verification；后续资料变化若影响开场交付条件，应补走新的真实QA起点。

- Round273修桥成本：iterations/round-273/f2-repair-cost-before-toll.json，独立journey-20261004-repair从F1复制，正常采购、交料、两日施工、保存空槽二并标题读回；尚未清桥头或认定F2完整。

## Round274 两侧完整F2

独立journey-20261004-escort槽二与journey-20261004-repair槽三，均候选round274-worktree-on-baa5ebe，从同一F1续验；原下载字节/hash见本轮playtest。文件iterations/round-274/f2-escort.json与f2-repair.json可恢复，上山应另设空槽或新运行，保留共同点与成本点。

当前发现计数来自已保存的实际首次发现，启动不得据已知目录数补高。实际曾发现护送载荷15而目录非公开16，旧启动会多发40XP/25银；修复后重新标题读回326银与646XP。旧档缺计数按现有v1协议0继续，已解锁成就仍保留，真实后续首次发现可正常计数。

## Round275 两侧C0到达

新独立journey-20261004-cloud-escort与journey-20261004-cloud-repair各槽一保留导入F2，正常走两关上山/对话/用药/接云阶后存空槽二、标题Continue读回并导出；槽三留C1。candidate round275-worktree-on-5ad5c8e，文件iterations/round-275/c0-escort-arrival.json与c0-repair-arrival.json，stage分别c0-escort-arrival/c0-repair-arrival。原Download字节与SHA见playtest/branch-comparison；只读导出，不修改载荷制造进度。

护送Lv7/XP686/351银/190命110气、膏1丸1/elapsed917；修桥Lv7/XP674/326银/188命110气、膏0丸2铁1/elapsed3893。均云岭40,43，云阶任务active且刻痕0/1；互斥及出发变量保留。护送本次发现水尺等新见闻后成就实际+40XP25银，与Round274启动错误补计数不同，读回相符。两侧清心丸未用、商店未买，不将未发生消费算作制作/策略通过。
